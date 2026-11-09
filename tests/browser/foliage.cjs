// Real WebGL crown colors: allocation, identity, lighting edits and replacement.
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const {
  base,
  launchBrowser,
  waitForOfflineReady,
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
    });
    await instrumentLighting(context);
    await context.addInitScript(() => {
      window.__foliage = [];
      const get = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (...args) {
        const gl = get.apply(this, args);
        if (!gl || args[0] !== "webgl2" || gl.__foliage) return gl;
        gl.__foliage = true;
        const row = { gl, colors: new Set(), frame: [], uploads: 0, calls: 0 };
        window.__foliage.push(row);
        const clear = gl.clear;
        gl.clear = function (...args) {
          if (!gl.getParameter(gl.FRAMEBUFFER_BINDING)) {
            row.frame = [];
            row.calls = 0;
          }
          return clear.apply(this, args);
        };
        const data = gl.bufferData;
        gl.bufferData = function (...args) {
          row.uploads++;
          return data.apply(this, args);
        };
        for (const method of [
          "drawElements",
          "drawArrays",
          "drawElementsInstanced",
          "drawArraysInstanced",
        ]) {
          const draw = gl[method];
          gl[method] = function (...args) {
            if (!gl.getParameter(gl.FRAMEBUFFER_BINDING)) {
              row.calls++;
              const p = gl.getParameter(gl.CURRENT_PROGRAM),
                l = gl.getAttribLocation(p, "instanceColor");
              if (
                l >= 0 &&
                gl.getUniformLocation(p, "grassFadeNear") === null
              ) {
                const buffer = gl.getVertexAttrib(
                  l,
                  gl.VERTEX_ATTRIB_ARRAY_BUFFER_BINDING,
                );
                row.colors.add(buffer);
                const prev = gl.getParameter(gl.ARRAY_BUFFER_BINDING);
                gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
                const bytes = gl.getBufferParameter(
                  gl.ARRAY_BUFFER,
                  gl.BUFFER_SIZE,
                );
                gl.bindBuffer(gl.ARRAY_BUFFER, prev);
                const occupied = Array.from(
                  { length: gl.getProgramParameter(p, gl.ACTIVE_ATTRIBUTES) },
                  (_, i) => gl.getActiveAttrib(p, i),
                ).reduce((n, a) => n + (a.type === gl.FLOAT_MAT4 ? 4 : 1), 0);
                row.frame.push({
                  buffer,
                  bytes,
                  count: args.at(-1),
                  occupied,
                  max: gl.getParameter(gl.MAX_VERTEX_ATTRIBS),
                  diffuse: Array.from(
                    gl.getUniform(p, gl.getUniformLocation(p, "diffuse")),
                  ),
                });
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
    const state = () =>
      page.evaluate(async () => {
        const out = [];
        for (const r of window.__foliage.filter(
          (r) => !r.gl.isContextLost() && r.frame.length,
        )) {
          const gl = r.gl,
            groups = [];
          for (const f of r.frame) {
            const prev = gl.getParameter(gl.ARRAY_BUFFER_BINDING);
            gl.bindBuffer(gl.ARRAY_BUFFER, f.buffer);
            const data = new Float32Array(f.bytes / 4);
            gl.getBufferSubData(gl.ARRAY_BUFFER, 0, data);
            gl.bindBuffer(gl.ARRAY_BUFFER, prev);
            const hash = [
              ...new Uint8Array(await crypto.subtle.digest("SHA-256", data)),
            ]
              .map((x) => x.toString(16).padStart(2, "0"))
              .join("");
            groups.push({
              ...f,
              buffer: undefined,
              hash,
              finite: data.every((v) => Number.isFinite(v) && v > 0 && v < 1),
              varied: new Set(data).size > 3,
            });
          }
          out.push({
            uploads: r.uploads,
            calls: r.calls,
            live: [...r.colors].filter((b) => gl.isBuffer(b)).length,
            groups,
          });
        }
        return out;
      });
    await page.goto(base);
    await waitForOfflineReady(page);
    await fillParameters(page, {
      width: 129,
      height: 97,
      iterations: 16,
      seed: 42,
      globalWarmth: 0.7,
    });
    await page.locator("#verify-equivalence").click();
    await waitForTerrain(page);
    assert.match(
      await page.locator("#numeric-match").innerText(),
      /All heights match/,
    );
    const first = await state();
    assert.equal(first.length, 1);
    assert.ok(first[0].groups.length > 0);
    function check(rows) {
      for (const r of rows) {
        assert.ok(r.calls <= 22);
        assert.equal(r.live, r.groups.length);
        for (const g of r.groups) {
          assert.equal(g.bytes, g.count * 12);
          assert.deepEqual(g.diffuse, [1, 1, 1]);
          assert.ok(g.finite && g.varied);
          assert.equal(g.occupied, 7);
          assert.ok(g.occupied <= g.max);
        }
      }
    }
    check(first);
    const hashes = (rows) => rows.map((r) => r.groups.map((g) => g.hash));
    await page.locator("#sun-settings summary").click();
    for (const hour of ["7", "0", "12"]) {
      await page.locator("#sun-time").fill(hour);
      await page
        .locator("app-terrain-preview canvas")
        .first()
        .screenshot({ path: artifactPath(`foliage-hour-${hour}.png`) });
      assert.deepEqual(hashes(await state()), hashes(first));
      assert.equal((await state())[0].uploads, first[0].uploads);
    }
    await page.locator("#atmosphere-settings summary").click();
    await page.locator("#atmosphere-enabled").uncheck();
    await page
      .locator("app-terrain-preview canvas")
      .first()
      .screenshot({ path: artifactPath("foliage-atmosphere-off.png") });
    assert.deepEqual(hashes(await state()), hashes(first));
    await page.locator("#compare-views").click();
    await page.locator("app-terrain-preview .display-time").nth(1).waitFor();
    const pair = await state();
    check(pair);
    assert.equal(pair.length, 2);
    assert.deepEqual(hashes(pair)[0], hashes(pair)[1]);
    const lighting = (await lightingResources(page)).filter(
      (r) => !r.lost && r.detailTextures > 0,
    );
    for (const r of lighting)
      for (const p of r.passes.filter((p) => p.target === "shadow"))
        assert.ok(p.calls <= 19);
    await page.locator("#select-local").click();
    await fillParameters(page, {
      width: 512,
      height: 512,
      iterations: 0,
      plainsCoverage: 1,
      mountainCoverage: 0,
      seaLevel: 0,
      globalMoisture: 1,
      vegetationDensity: 1,
    });
    await page.locator("#generate-local").click();
    await waitForTerrain(page);
    const maximum = await state();
    check(maximum);
    assert.equal(
      maximum[0].groups.reduce((n, g) => n + g.count, 0),
      16384,
    );
    assert.equal(
      maximum[0].groups.reduce((n, g) => n + g.bytes, 0),
      196608,
    );
    await context.setOffline(true);
    await page.reload();
    await waitForOfflineReady(page);
    await fillParameters(page, {
      width: 65,
      height: 49,
      iterations: 0,
      seed: 76543,
      globalMoisture: 1,
    });
    await page.locator("#generate-local").click();
    await waitForTerrain(page);
    check(await state());
    await page.setViewportSize({ width: 390, height: 844 });
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    assert.deepEqual(errors, []);
    const report = { pass: true, first, pair, maximum, offline: true, errors };
    await fs.writeFile(
      artifactPath("foliage-verification.json"),
      JSON.stringify(report, null, 2),
    );
    console.log(
      JSON.stringify({
        pass: true,
        groups: first[0].groups.length,
        maximumBytes: 196608,
        offline: true,
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
