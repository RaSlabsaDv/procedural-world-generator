// Real decorative grass: GPU buffers, close/fade pixels, equivalence and lifecycle.
const assert = require("node:assert/strict"),
  fs = require("node:fs/promises");
const {
  base,
  launchBrowser,
  waitForOfflineReady,
  useReferenceAppearance,
} = require("./support/browser.cjs");
const {
  fillParameters,
  waitForTerrain,
  artifactPath,
} = require("./support/editor.cjs");
const {
  instrumentLighting,
  lightingResources,
} = require("./support/lighting.cjs");
(async () => {
  const browser = await launchBrowser();
  try {
    const context = await browser.newContext({
      viewport: { width: 1600, height: 1050 },
      reducedMotion: "reduce",
      deviceScaleFactor: 1,
    });
    await instrumentLighting(context);
    await context.addInitScript(() => {
      window.__grassViews = [];
      window.__hideGrass = false;
      const get = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (...args) {
        const gl = get.apply(this, args);
        if (!gl || args[0] !== "webgl2" || gl.__grass) return gl;
        gl.__grass = true;
        const r = {
          gl,
          draws: 0,
          uploads: 0,
          colorCalls: 0,
          grass: null,
          ids: new WeakMap(),
          nextId: 1,
          buffers: new Set(),
        };
        window.__grassViews.push(r);
        const clear = gl.clear;
        gl.clear = function (...args) {
          if (!gl.getParameter(gl.FRAMEBUFFER_BINDING)) {
            r.colorCalls = 0;
            r.grass = null;
          }
          return clear.apply(this, args);
        };
        const data = gl.bufferData;
        gl.bufferData = function (...args) {
          r.uploads++;
          return data.apply(this, args);
        };
        for (const name of [
          "drawElements",
          "drawArrays",
          "drawElementsInstanced",
          "drawArraysInstanced",
        ]) {
          const draw = gl[name];
          gl[name] = function (...args) {
            r.draws++;
            if (!gl.getParameter(gl.FRAMEBUFFER_BINDING)) {
              r.colorCalls++;
              const p = gl.getParameter(gl.CURRENT_PROGRAM),
                loc = gl.getUniformLocation(p, "grassFadeNear");
              if (loc !== null) {
                const attribute = (n) => {
                  const l = gl.getAttribLocation(p, n),
                    buffer = gl.getVertexAttrib(
                      l,
                      gl.VERTEX_ATTRIB_ARRAY_BUFFER_BINDING,
                    );
                  r.buffers.add(buffer);
                  if (!r.ids.has(buffer)) r.ids.set(buffer, r.nextId++);
                  const prev = gl.getParameter(gl.ARRAY_BUFFER_BINDING);
                  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
                  const bytes = gl.getBufferParameter(
                    gl.ARRAY_BUFFER,
                    gl.BUFFER_SIZE,
                  );
                  gl.bindBuffer(gl.ARRAY_BUFFER, prev);
                  return { buffer, id: r.ids.get(buffer), bytes };
                };
                r.buffers.add(gl.getParameter(gl.ELEMENT_ARRAY_BUFFER_BINDING));
                r.grass = {
                  count: args.at(-1),
                  matrix: attribute("instanceMatrix"),
                  colors: attribute("instanceColor"),
                  position: attribute("position"),
                  normal: attribute("normal"),
                  vertexColor: attribute("color"),
                  attributeSlots: Math.max(
                    gl.getAttribLocation(p, "instanceMatrix") + 4,
                    ...["position", "normal", "color", "instanceColor"].map(
                      (n) => gl.getAttribLocation(p, n) + 1,
                    ),
                  ),
                  attributes: gl.getProgramParameter(p, gl.ACTIVE_ATTRIBUTES),
                  maxAttributes: gl.getParameter(gl.MAX_VERTEX_ATTRIBS),
                  fadeNear: gl.getUniform(p, loc),
                  fadeFar: gl.getUniform(
                    p,
                    gl.getUniformLocation(p, "grassFadeFar"),
                  ),
                  triangles: args[1] / 3,
                };
                if (window.__hideGrass) return;
              }
            }
            return draw.apply(this, args);
          };
        }
        return gl;
      };
    });
    const page = await context.newPage(),
      errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text());
    });
    const state = () =>
      page.evaluate(() =>
        window.__grassViews
          .filter((r) => !r.gl.isContextLost())
          .map((r) => ({
            draws: r.draws,
            uploads: r.uploads,
            colorCalls: r.colorCalls,
            liveGrassBuffers: [...r.buffers].filter((b) => r.gl.isBuffer(b))
              .length,
            grass: r.grass
              ? {
                  ...r.grass,
                  matrix: {
                    id: r.grass.matrix.id,
                    bytes: r.grass.matrix.bytes,
                  },
                  colors: {
                    id: r.grass.colors.id,
                    bytes: r.grass.colors.bytes,
                  },
                  position: undefined,
                  normal: undefined,
                  vertexColor: undefined,
                }
              : null,
          })),
      );
    const hashes = () =>
      page.evaluate(async () => {
        const out = [];
        for (const r of window.__grassViews.filter(
          (r) => !r.gl.isContextLost() && r.grass,
        )) {
          const gl = r.gl,
            hash = async (info) => {
              const previous = gl.getParameter(gl.ARRAY_BUFFER_BINDING);
              gl.bindBuffer(gl.ARRAY_BUFFER, info.buffer);
              const data = new Uint8Array(info.bytes);
              gl.getBufferSubData(gl.ARRAY_BUFFER, 0, data);
              gl.bindBuffer(gl.ARRAY_BUFFER, previous);
              return [
                ...new Uint8Array(await crypto.subtle.digest("SHA-256", data)),
              ]
                .map((x) => x.toString(16).padStart(2, "0"))
                .join("");
            };
          out.push({
            matrix: await hash(r.grass.matrix),
            colors: await hash(r.grass.colors),
          });
        }
        return out;
      });
    await page.goto(base);
    await waitForOfflineReady(page);
    await useReferenceAppearance(page);
    await fillParameters(page, {
      width: 129,
      height: 97,
      iterations: 16,
      seed: 42,
      plainsCoverage: 1,
      mountainCoverage: 0,
      seaLevel: 0,
      globalMoisture: 0.85,
      vegetationDensity: 0,
    });
    await page.locator("#verify-equivalence").click();
    await waitForTerrain(page);
    assert.match(
      await page.locator("#numeric-match").innerText(),
      /All heights match/,
    );
    let first = await state();
    assert.ok(first[0].grass.count > 1000);
    assert.ok(first[0].grass.count <= 32768);
    assert.equal(first[0].grass.triangles, 9);
    assert.equal(first[0].grass.fadeNear, 20);
    assert.equal(first[0].grass.fadeFar, 55);
    assert.ok(first[0].grass.attributes <= first[0].grass.maxAttributes);
    assert.ok(first[0].grass.attributeSlots <= first[0].grass.maxAttributes);
    assert.equal(first[0].liveGrassBuffers, 6);
    assert.equal(first[0].grass.matrix.bytes, first[0].grass.count * 64);
    assert.equal(first[0].grass.colors.bytes, first[0].grass.count * 12);
    // Six tree groups can split into24 near/far draws; other scene draws add10.
    assert.ok(first[0].colorCalls <= 34);
    await page.locator("#water-settings summary").click();
    const canvas = page.locator("app-terrain-preview canvas").first();
    const snapshot = async (hide, value) => {
      await page.evaluate((v) => (window.__hideGrass = v), hide);
      await page.locator("#water-foam").fill(value);
      return canvas.screenshot();
    };
    const farOn = await snapshot(false, "0.44"),
      farOff = await snapshot(true, "0.45");
    assert.deepEqual(farOn, farOff, "Grass disappears completely at far range");
    await canvas.scrollIntoViewIfNeeded();
    const box = await canvas.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.wheel(0, -6000);
    await page.waitForTimeout(80);
    const nearOn = await snapshot(false, "0.44"),
      nearOff = await snapshot(true, "0.45");
    await fs.writeFile(artifactPath("grass-near.png"), nearOn);
    await fs.writeFile(artifactPath("grass-near-hidden.png"), nearOff);
    const changed = await page.evaluate(
      async (data) => {
        async function pixels(s) {
          const image = await createImageBitmap(
              await (await fetch("data:image/png;base64," + s)).blob(),
            ),
            c = document.createElement("canvas");
          c.width = image.width;
          c.height = image.height;
          const ctx = c.getContext("2d");
          ctx.drawImage(image, 0, 0);
          return ctx.getImageData(0, 0, c.width, c.height).data;
        }
        const a = await pixels(data.a),
          b = await pixels(data.b);
        let changed = 0;
        for (let i = 0; i < a.length; i += 4)
          if (a[i] !== b[i] || a[i + 1] !== b[i + 1] || a[i + 2] !== b[i + 2])
            changed++;
        return changed;
      },
      { a: nearOn.toString("base64"), b: nearOff.toString("base64") },
    );
    assert.ok(changed > 2000, "Readable grass blades in close view");
    for (const row of (await lightingResources(page)).filter(
      (r) => !r.lost && r.detailTextures > 0,
    ))
      assert.equal(
        row.activeShadowUpdates,
        1,
        "Grass fade/camera updates reuse the caster map",
      );
    await snapshot(false, "0.44");
    const stable = await hashes();
    assert.equal((await state())[0].uploads, first[0].uploads);
    await page.locator("#sun-settings summary").click();
    for (const hour of ["7", "0", "12"]) {
      await page.locator("#sun-time").fill(hour);
      await canvas.screenshot({ path: artifactPath(`grass-hour-${hour}.png`) });
      assert.deepEqual(await hashes(), stable);
    }
    await page.locator("#atmosphere-settings summary").click();
    await page.locator("#atmosphere-enabled").uncheck();
    await canvas.screenshot({
      path: artifactPath("grass-reference-atmosphere.png"),
    });
    await page.locator("#compare-views").click();
    await page.locator("app-terrain-preview .display-time").nth(1).waitFor();
    const pair = await hashes();
    assert.equal(pair.length, 2);
    assert.deepEqual(
      pair[0],
      pair[1],
      "Local/Remote decorative transforms and colors are identical",
    );
    const lighting = (await lightingResources(page)).filter(
      (r) => !r.lost && r.detailTextures > 0,
    );
    for (const row of lighting)
      for (const pass of row.passes.filter((p) => p.target === "shadow"))
        assert.ok(pass.calls <= 19);
    await fillParameters(page, { iterations: 128 });
    await page.locator("#generate-local").click();
    const paused = await state();
    await page.waitForTimeout(150);
    assert.deepEqual(
      (await state()).map((r) => [r.draws, r.uploads]),
      paused.map((r) => [r.draws, r.uploads]),
    );
    await waitForTerrain(page);
    await page.locator("#select-local").click();
    await fillParameters(page, { width: 512, height: 512, iterations: 0 });
    await page.locator("#generate-local").click();
    await waitForTerrain(page);
    const maximum = await state();
    assert.equal(
      maximum[0].liveGrassBuffers,
      6,
      "Replaced grass buffers are released",
    );
    assert.ok(maximum[0].grass.count <= 32768);
    assert.ok(maximum[0].colorCalls <= 34);
    await context.setOffline(true);
    await page.reload();
    await waitForOfflineReady(page);
    await useReferenceAppearance(page);
    await fillParameters(page, {
      width: 65,
      height: 49,
      iterations: 0,
      seed: 76543,
      plainsCoverage: 1,
      mountainCoverage: 0,
      seaLevel: 0,
      globalMoisture: 1,
      vegetationDensity: 0,
    });
    await page.locator("#generate-local").click();
    await waitForTerrain(page);
    assert.ok((await state())[0].grass.count > 0);
    await page.setViewportSize({ width: 390, height: 844 });
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    assert.deepEqual(errors, []);
    const report = {
      pass: true,
      browser: browser.version(),
      first,
      pair,
      maximum,
      changedPixels: changed,
      offline: true,
      errors,
    };
    await fs.writeFile(
      artifactPath("grass-verification.json"),
      JSON.stringify(report, null, 2),
    );
    console.log(
      JSON.stringify({
        pass: true,
        count: first[0].grass.count,
        maximum: maximum[0].grass.count,
        changedPixels: changed,
        errors,
      }),
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
