// Real WebGL array/normal orientation and production shader/fade/ownership checks.
const assert = require("node:assert/strict"),
  fs = require("node:fs/promises"),
  path = require("node:path");
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
      window.__micro = [];
      window.__microOff = false;
      const get = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (...args) {
        const gl = get.apply(this, args);
        if (!gl || args[0] !== "webgl2" || gl.__micro) return gl;
        gl.__micro = true;
        const r = {
          gl,
          arrays: new Map(),
          uploads: 0,
          draws: 0,
          terrain: null,
        };
        window.__micro.push(r);
        const store = gl.texStorage3D;
        gl.texStorage3D = function (
          target,
          levels,
          format,
          width,
          height,
          depth,
        ) {
          if (target === gl.TEXTURE_2D_ARRAY && depth === 5)
            r.arrays.set(gl.getParameter(gl.TEXTURE_BINDING_2D_ARRAY), {
              levels,
              format,
              width,
              height,
              depth,
            });
          return store.apply(this, arguments);
        };
        const remove = gl.deleteTexture;
        gl.deleteTexture = function (t) {
          r.arrays.delete(t);
          return remove.call(this, t);
        };
        const buffer = gl.bufferData;
        gl.bufferData = function (...args) {
          r.uploads++;
          return buffer.apply(this, args);
        };
        const draw = gl.drawElements;
        gl.drawElements = function (...args) {
          r.draws++;
          const p = gl.getParameter(gl.CURRENT_PROGRAM),
            loc = gl.getUniformLocation(p, "microStrength");
          if (loc !== null && !gl.getParameter(gl.FRAMEBUFFER_BINDING)) {
            const read = (n) => {
              const l = gl.getUniformLocation(p, n),
                v = l === null ? null : gl.getUniform(p, l);
              return v?.length ? Array.from(v) : v;
            };
            let samplers = 0;
            for (
              let i = 0;
              i < gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
              i++
            ) {
              const u = gl.getActiveUniform(p, i);
              if (
                [
                  gl.SAMPLER_2D,
                  gl.SAMPLER_2D_SHADOW,
                  gl.SAMPLER_2D_ARRAY,
                ].includes(u.type)
              )
                samplers += u.size;
            }
            const original = gl.getUniform(p, loc);
            r.terrain = {
              samplers,
              maxSamplers: gl.getParameter(gl.MAX_TEXTURE_IMAGE_UNITS),
              strength: original,
              repeat: read("microRepeat"),
              fadeNear: read("microFadeNear"),
              fadeFar: read("microFadeFar"),
              projection: read("projectionMatrix"),
              view: read("modelViewMatrix"),
              attributes: gl.getProgramParameter(p, gl.ACTIVE_ATTRIBUTES),
            };
            if (window.__microOff) {
              gl.uniform1f(loc, 0);
              try {
                return draw.apply(this, args);
              } finally {
                gl.uniform1f(loc, original);
              }
            }
          }
          return draw.apply(this, args);
        };
        return gl;
      };
    });
    const page = await context.newPage(),
      errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text());
    });
    await page.goto(base);
    await waitForOfflineReady(page);
    await useReferenceAppearance(page);
    await fillParameters(page, {
      width: 129,
      height: 97,
      iterations: 0,
      plainsCoverage: 1,
      mountainCoverage: 0,
      seaLevel: 0,
      globalMoisture: 0.4,
    });
    await page.locator("#generate-local").click();
    await waitForTerrain(page);
    const state = () =>
      page.evaluate(() =>
        window.__micro
          .filter((r) => !r.gl.isContextLost())
          .map((r) => ({
            uploads: r.uploads,
            draws: r.draws,
            terrain: r.terrain,
            arrays: [...r.arrays.values()],
          })),
      );
    let baseline = await state();
    assert.equal(baseline.length, 1);
    assert.equal(baseline[0].arrays.length, 1);
    assert.deepEqual(baseline[0].arrays[0], {
      levels: 8,
      format: 32856,
      width: 128,
      height: 128,
      depth: 5,
    });
    assert.equal(baseline[0].terrain.samplers, 7);
    assert.ok(baseline[0].terrain.samplers <= baseline[0].terrain.maxSamplers);
    assert.equal(baseline[0].terrain.attributes, 5);
    const canvas = page.locator("app-terrain-preview canvas").first();
    await page.locator("#water-settings summary").click();
    const snapshot = async (off, value) => {
      await page.evaluate((v) => (window.__microOff = v), off);
      await page.locator("#water-foam").fill(value);
      return canvas.screenshot();
    };
    const overviewOn = await snapshot(false, "0.44"),
      overviewOff = await snapshot(true, "0.45");
    assert.deepEqual(
      overviewOn,
      overviewOff,
      "Distant detail fades exactly to the reference",
    );
    await canvas.scrollIntoViewIfNeeded();
    let box = await canvas.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.wheel(0, -4400);
    await page.waitForTimeout(80);
    const closeCamera = (await state())[0].terrain;
    const closeOn = await snapshot(false, "0.44"),
      closeOff = await snapshot(true, "0.45");
    await fs.writeFile(artifactPath("microdetail-close-on.png"), closeOn);
    await fs.writeFile(artifactPath("microdetail-close-off.png"), closeOff);
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
        let changed = 0,
          total = 0;
        for (let i = 0; i < a.length; i += 4) {
          let d = 0;
          for (let j = 0; j < 3; j++) d += Math.abs(a[i + j] - b[i + j]);
          if (d) changed++;
          total += d;
        }
        return { pixels: changed, mean: total / ((a.length / 4) * 3) };
      },
      { a: closeOn.toString("base64"), b: closeOff.toString("base64") },
    );
    assert.ok(changed.pixels > 100);
    assert.ok(changed.mean < 20, "Restrained detail preserves colors");
    assert.equal((await state())[0].uploads, baseline[0].uploads);
    assert.deepEqual((await state())[0].terrain.view, closeCamera.view);
    const lights = (await lightingResources(page)).filter(
      (r) => !r.lost && r.detailTextures > 0,
    );
    assert.equal(lights[0].activeShadowUpdates, 1);
    await snapshot(false, "0.44");
    await page.locator("#sun-settings summary").click();
    for (const hour of ["7", "0", "12"]) {
      await page.locator("#sun-time").fill(hour);
      await canvas.screenshot({
        path: artifactPath(`microdetail-hour-${hour}.png`),
      });
    }
    await page.locator("#verify-equivalence").click();
    await waitForTerrain(page);
    assert.match(
      await page.locator("#numeric-match").innerText(),
      /All heights match/,
    );
    await page.locator("#compare-views").click();
    await page.locator("app-terrain-preview .display-time").nth(1).waitFor();
    assert.equal(
      (await state()).filter((r) => r.arrays.length === 1).length,
      2,
    );
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
    await context.setOffline(true);
    await page.reload();
    await waitForOfflineReady(page);
    await useReferenceAppearance(page);
    await fillParameters(page, {
      width: 33,
      height: 25,
      iterations: 0,
      seed: 998877,
    });
    await page.locator("#generate-local").click();
    await waitForTerrain(page);
    assert.equal((await state())[0].arrays.length, 1);
    await page.setViewportSize({ width: 390, height: 844 });
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );

    // Compile the actual shared projection functions in a tiny isolated GPU fixture.
    const source = await fs.readFile(
      path.resolve(
        __dirname,
        "../../src/client/src/app/terrain/rendering/terrain-microdetail.ts",
      ),
      "utf8",
    );
    const glsl = source
      .match(/export const MICRODETAIL_GLSL = `([\s\S]*?)`;/)[1]
      .replace("varying vec3 vMicroWorld;", "");
    const orientation = await page.evaluate((glsl) => {
      const c = document.createElement("canvas");
      c.width = c.height = 1;
      const gl = c.getContext("webgl2");
      if (!gl) throw Error("No WebGL2");
      const compile = (type, src) => {
        const s = gl.createShader(type);
        gl.shaderSource(s, src);
        gl.compileShader(s);
        if (!gl.getShaderParameter(s, gl.COMPILE_STATUS))
          throw Error(gl.getShaderInfoLog(s));
        return s;
      };
      const vs = compile(
        gl.VERTEX_SHADER,
        "#version 300 es\nvoid main(){vec2 p=vec2(float((gl_VertexID<<1)&2),float(gl_VertexID&2));gl_Position=vec4(p*2.0-1.0,0.0,1.0);}",
      );
      const frag = compile(
        gl.FRAGMENT_SHADER,
        "#version 300 es\nprecision highp float;\n" +
          glsl +
          "\nuniform vec3 probeBase;uniform float probeLayer;uniform float probeStrength;out vec4 color;void main(){vec3 b=normalize(probeBase);vec3 a=pow(abs(b),vec3(4.0));a/=dot(a,vec3(1.0));vec3 g=microGradient(vec3(.125,.25,.375),probeLayer,b,a,vec3(0.0),vec3(0.0));g-=b*dot(g,b);color=vec4(normalize(b+g*probeStrength)*.5+.5,1.0);}",
      );
      const program = gl.createProgram();
      gl.attachShader(program, vs);
      gl.attachShader(program, frag);
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS))
        throw Error(gl.getProgramInfoLog(program));
      gl.useProgram(program);
      const t = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D_ARRAY, t);
      gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_S, gl.REPEAT);
      gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_T, gl.REPEAT);
      const data = new Uint8Array([
        160,
        144,
        247,
        255,
        ...Array(4).fill([128, 128, 255, 255]).flat(),
      ]);
      gl.texImage3D(
        gl.TEXTURE_2D_ARRAY,
        0,
        gl.RGBA8,
        1,
        1,
        5,
        0,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        data,
      );
      gl.uniform1i(gl.getUniformLocation(program, "microNormals"), 0);
      const cases = [];
      for (const base of [
        [1, 0, 0],
        [-1, 0, 0],
        [0, 1, 0],
        [0, -1, 0],
        [0, 0, 1],
        [0, 0, -1],
        [1, 2, 3],
      ])
        for (const [layer, strength] of [
          [0, 1],
          [0, 0],
          [1, 1],
          [4, 1],
        ]) {
          gl.uniform3fv(gl.getUniformLocation(program, "probeBase"), base);
          gl.uniform1f(gl.getUniformLocation(program, "probeLayer"), layer);
          gl.uniform1f(
            gl.getUniformLocation(program, "probeStrength"),
            strength,
          );
          gl.drawArrays(gl.TRIANGLES, 0, 3);
          const p = new Uint8Array(4);
          gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, p);
          cases.push({
            base,
            layer,
            strength,
            normal: [...p.slice(0, 3)].map((v) => (v / 255) * 2 - 1),
          });
        }
      const error = gl.getError();
      gl.deleteTexture(t);
      gl.deleteProgram(program);
      gl.deleteShader(vs);
      gl.deleteShader(frag);
      gl.getExtension("WEBGL_lose_context")?.loseContext();
      return { cases, error };
    }, glsl);
    assert.equal(orientation.error, 0);
    const x = 32 / 119,
      y = 16 / 119,
      expected = [
        [1, y, -x],
        [-1, y, x],
        [x, 1, -y],
        [x, -1, y],
        [x, y, 1],
        [-x, y, -1],
      ];
    for (const r of orientation.cases) {
      let e = r.base;
      if (
        r.layer === 0 &&
        r.strength === 1 &&
        r.base.filter((v) => v !== 0).length === 1
      )
        e =
          expected[
            [
              [1, 0, 0],
              [-1, 0, 0],
              [0, 1, 0],
              [0, -1, 0],
              [0, 0, 1],
              [0, 0, -1],
            ].findIndex((b) => JSON.stringify(b) === JSON.stringify(r.base))
          ];
      else if (r.layer === 0 && r.strength === 1)
        e = [0.4864980017172429, 0.5674548247844671, 0.6643152234850255];
      const l = Math.hypot(...e);
      e.forEach((v, i) =>
        assert.ok(
          Math.abs(r.normal[i] - v / l) < 0.012,
          "Signed projection / neutral normal GPU regression",
        ),
      );
    }
    assert.deepEqual(errors, []);
    const report = {
      pass: true,
      browser: browser.version(),
      baseline,
      changed,
      orientation,
      offline: true,
      errors,
    };
    await fs.writeFile(
      artifactPath("microdetail-verification.json"),
      JSON.stringify(report, null, 2),
    );
    console.log(
      JSON.stringify({
        pass: true,
        changed,
        orientationCases: orientation.cases.length,
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
