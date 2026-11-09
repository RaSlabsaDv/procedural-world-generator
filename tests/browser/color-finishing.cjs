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
(async () => {
  const browser = await launchBrowser();
  try {
    const context = await browser.newContext({
      viewport: { width: 1600, height: 1050 },
      reducedMotion: "reduce",
      deviceScaleFactor: 1,
    });
    await context.addInitScript(() => {
      window.__finishViews = [];
      window.__finishFixture = null;
      const get = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (...args) {
        const gl = get.apply(this, args);
        if (!gl || args[0] !== "webgl2" || gl.__finishing) return gl;
        gl.__finishing = true;
        const r = {
          gl,
          textures: new Map(),
          renderbuffers: new Map(),
          attachments: new Map(),
          hdrCalls: 0,
          finalCalls: 0,
          shadowClears: 0,
          uploads: 0,
          final: null,
          water: null,
          pixels: null,
        };
        window.__finishViews.push(r);
        const tex = gl.texStorage2D;
        gl.texStorage2D = function (target, levels, format, width, height) {
          r.textures.set(gl.getParameter(gl.TEXTURE_BINDING_2D), {
            format,
            width,
            height,
          });
          return tex.apply(this, arguments);
        };
        const image = gl.texImage2D;
        gl.texImage2D = function (...args) {
          if (typeof args[3] === "number")
            r.textures.set(gl.getParameter(gl.TEXTURE_BINDING_2D), {
              format: args[2],
              width: args[3],
              height: args[4],
            });
          return image.apply(this, args);
        };
        for (const name of [
          "renderbufferStorage",
          "renderbufferStorageMultisample",
        ]) {
          const original = gl[name];
          gl[name] = function (...args) {
            const result = original.apply(this, args);
            const multi = name.endsWith("Multisample");
            r.renderbuffers.set(gl.getParameter(gl.RENDERBUFFER_BINDING), {
              format: args[multi ? 2 : 1],
              width: args[multi ? 3 : 2],
              height: args[multi ? 4 : 3],
              samples: multi
                ? gl.getRenderbufferParameter(
                    gl.RENDERBUFFER,
                    gl.RENDERBUFFER_SAMPLES,
                  )
                : 0,
            });
            return result;
          };
        }
        for (const name of [
          "framebufferTexture2D",
          "framebufferRenderbuffer",
        ]) {
          const original = gl[name];
          gl[name] = function (...args) {
            const f = gl.getParameter(gl.FRAMEBUFFER_BINDING);
            if (!r.attachments.has(f)) r.attachments.set(f, new Map());
            r.attachments.get(f).set(args[1], args[3]);
            return original.apply(this, args);
          };
        }
        const kind = () => {
          const f = gl.getParameter(gl.FRAMEBUFFER_BINDING);
          if (!f) return "screen";
          const a = r.attachments.get(f)?.get(gl.COLOR_ATTACHMENT0);
          return (r.textures.get(a) || r.renderbuffers.get(a))?.format ===
            gl.RGBA16F
            ? "hdr"
            : "shadow";
        };
        const clear = gl.clear;
        gl.clear = function (...args) {
          const k = kind();
          if (k === "hdr") r.hdrCalls = 0;
          if (k === "screen") r.finalCalls = 0;
          if (k === "shadow") r.shadowClears++;
          return clear.apply(this, args);
        };
        for (const name of ["bufferData", "bufferSubData"]) {
          const original = gl[name];
          gl[name] = function (...args) {
            r.uploads++;
            return original.apply(this, args);
          };
        }
        for (const name of [
          "drawElements",
          "drawArrays",
          "drawElementsInstanced",
          "drawArraysInstanced",
        ]) {
          const draw = gl[name];
          gl[name] = function (...args) {
            const program = gl.getParameter(gl.CURRENT_PROGRAM),
              k = kind();
            if (k === "hdr") r.hdrCalls++;
            const uniform = (n) => {
              const l = gl.getUniformLocation(program, n);
              return l === null ? null : gl.getUniform(program, l);
            };
            if (uniform("waterTime") !== null && k === "hdr") {
              const fragment = gl
                .getAttachedShaders(program)
                .map((s) => gl.getShaderSource(s))
                .find(
                  (s) => s.includes("waterTime") && s.includes("gl_FragColor"),
                );
              r.water = {
                linear: !!fragment?.match(
                  /linearToOutputTexel[^}]*LinearTransferOETF/,
                ),
                mapped: !!fragment?.includes("#define TONE_MAPPING"),
                blend: gl.isEnabled(gl.BLEND),
                src: gl.getParameter(gl.BLEND_SRC_RGB),
                dst: gl.getParameter(gl.BLEND_DST_RGB),
              };
            }
            if (uniform("finishColor") === null) return draw.apply(this, args);
            r.finalCalls++;
            r.final = {
              exposure: uniform("finishExposure"),
              aces: uniform("finishACES"),
              grading: uniform("finishGrading"),
              vignette: uniform("finishVignette"),
            };
            let oldActive, oldTexture, unit;
            if (window.__finishFixture) {
              oldActive = gl.getParameter(gl.ACTIVE_TEXTURE);
              unit = uniform("finishColor");
              gl.activeTexture(gl.TEXTURE0 + unit);
              oldTexture = gl.getParameter(gl.TEXTURE_BINDING_2D);
              if (!r.fixtureTexture) {
                r.fixtureTexture = gl.createTexture();
                gl.bindTexture(gl.TEXTURE_2D, r.fixtureTexture);
                gl.texParameteri(
                  gl.TEXTURE_2D,
                  gl.TEXTURE_MIN_FILTER,
                  gl.NEAREST,
                );
                gl.texParameteri(
                  gl.TEXTURE_2D,
                  gl.TEXTURE_MAG_FILTER,
                  gl.NEAREST,
                );
              } else gl.bindTexture(gl.TEXTURE_2D, r.fixtureTexture);
              gl.texImage2D(
                gl.TEXTURE_2D,
                0,
                gl.RGBA32F,
                1,
                1,
                0,
                gl.RGBA,
                gl.FLOAT,
                new Float32Array([...window.__finishFixture, 1]),
              );
            }
            const result = draw.apply(this, args);
            const read = (x, y) => {
              const a = new Uint8Array(4);
              gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, a);
              return [...a];
            };
            r.pixels = {
              center: read(
                gl.drawingBufferWidth >> 1,
                gl.drawingBufferHeight >> 1,
              ),
              corner: read(2, 2),
            };
            if (window.__finishFixture) {
              gl.bindTexture(gl.TEXTURE_2D, oldTexture);
              gl.activeTexture(oldActive);
            }
            return result;
          };
        }
        return gl;
      };
    });
    const page = await context.newPage(),
      errors = [];
    let requests = 0;
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text());
    });
    page.on("request", (r) => {
      if (r.url().includes("/api/v1/terrains")) requests++;
    });
    const state = async () => {
      await page.evaluate(
        () =>
          new Promise((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(resolve)),
          ),
      );
      return page.evaluate(() =>
        window.__finishViews
          .filter((r) => !r.gl.isContextLost())
          .map((r) => {
            const gl = r.gl;
            return {
              hdrCalls: r.hdrCalls,
              finalCalls: r.finalCalls,
              shadowClears: r.shadowClears,
              uploads: r.uploads,
              final: r.final,
              pixels: r.pixels,
              water: r.water,
              hdrTextures: [...r.textures]
                .filter(([t, v]) => gl.isTexture(t) && v.format === gl.RGBA16F)
                .map(([, v]) => v),
              buffers: [...r.renderbuffers]
                .filter(([b]) => gl.isRenderbuffer(b))
                .map(([, v]) => v),
            };
          }),
      );
    };
    await page.goto(base);
    await waitForOfflineReady(page);
    assert.equal(
      await page.locator("#appearance-settings").evaluate((el) => el.open),
      false,
    );
    await fillParameters(page, {
      width: 129,
      height: 97,
      iterations: 16,
      seed: 42,
    });
    await page.locator("#verify-equivalence").click();
    await waitForTerrain(page);
    assert.match(
      await page.locator("#numeric-match").innerText(),
      /All heights match/,
    );
    let initial = (await state())[0];
    assert.ok(initial.hdrTextures.length === 1);
    assert.equal(initial.finalCalls, 1);
    assert.ok(initial.hdrCalls <= 34);
    assert.ok(
      initial.hdrTextures[0].width * initial.hdrTextures[0].height <= 1048576,
    );
    assert.ok(initial.buffers.every((b) => b.samples <= 4));
    assert.ok(
      initial.water &&
        initial.water.linear &&
        !initial.water.mapped &&
        initial.water.blend,
    );
    assert.equal(initial.water.src, 770);
    assert.equal(initial.water.dst, 771);
    const canvas = page.locator("app-terrain-preview canvas").first();
    await canvas.screenshot({
      path: artifactPath("color-finishing-aces-noon.png"),
    });
    await page.locator("#appearance-settings summary").click();
    const firstRequests = requests,
      firstUploads = initial.uploads,
      firstShadows = initial.shadowClears;
    const display = await page.locator(".display-time").first().innerText();
    for (const [selector, value] of [
      ["#appearance-exposure", "1.25"],
      ["#appearance-exposure", "1"],
    ])
      await page.locator(selector).fill(value);
    await page.locator("#appearance-grading").check();
    await page.locator("#appearance-vignette").check();
    const edited = (await state())[0];
    assert.equal(edited.uploads, firstUploads);
    assert.equal(edited.shadowClears, firstShadows);
    assert.equal(requests, firstRequests);
    assert.equal(
      await page.locator(".display-time").first().innerText(),
      display,
    );
    assert.deepEqual(edited.final, {
      exposure: 1,
      aces: 1,
      grading: 1,
      vignette: 1,
    });
    await canvas.screenshot({
      path: artifactPath("color-finishing-effects.png"),
    });
    await page.locator("#appearance-grading").uncheck();
    await page.locator("#appearance-vignette").uncheck();
    await page.evaluate(() => (window.__finishFixture = [0.18, 0.5, 4]));
    await page.locator("#appearance-exposure").fill("0.5");
    const aces = (await state())[0].pixels.center;
    // Independent Python float64 ACES+sRGB fixture, tolerating output quantization.
    [134, 156, 244].forEach((v, i) =>
      assert.ok(
        Math.abs(aces[i] - v) <= 2,
        `ACES exposure/encoding channel${i}: ${aces}`,
      ),
    );
    await page.evaluate(
      () => (window.__finishFixture = [0.0005, 0.001, 0.0015]),
    );
    await page.locator("#appearance-exposure").fill("1");
    const nightToe = (await state())[0].pixels.center;
    [2, 3, 5].forEach((v, i) => assert.ok(Math.abs(nightToe[i] - v) <= 1));
    await page.evaluate(() => (window.__finishFixture = [0, 0, 0]));
    await page.locator("#appearance-exposure").fill("1.05");
    assert.deepEqual((await state())[0].pixels.center, [0, 0, 0, 255]);
    await page.evaluate(() => (window.__finishFixture = [0.18, 0.5, 4]));
    await page.locator("#appearance-exposure").fill("0.5");
    await page.locator("#appearance-tone").selectOption("reference");
    const ref = (await state())[0].pixels.center;
    [85, 137, 255].forEach((v, i) =>
      assert.ok(
        Math.abs(ref[i] - v) <= 2,
        `Reference exposure/encoding channel${i}: ${ref}`,
      ),
    );
    await page.locator("#appearance-vignette").check();
    const vignette = (await state())[0].pixels;
    assert.ok(vignette.corner[0] < vignette.center[0]);
    await page.evaluate(() => (window.__finishFixture = null));
    await page.locator("#appearance-exposure").fill("1");
    await page.locator("#appearance-vignette").uncheck();
    const referenceA = await canvas.screenshot();
    await page.locator("#appearance-tone").selectOption("aces");
    await canvas.screenshot();
    await page.locator("#appearance-tone").selectOption("reference");
    assert.deepEqual(
      await canvas.screenshot(),
      referenceA,
      "Reference pixels survive HDR activation/deactivation",
    );
    await page.locator("#reset-appearance").click();
    await page.locator("#compare-views").click();
    await page.locator("app-terrain-preview .display-time").nth(1).waitFor();
    const pair = await state();
    assert.equal(pair.length, 2);
    assert.deepEqual(pair[0].final, pair[1].final);
    for (const row of pair) assert.equal(row.hdrTextures.length, 1);
    await page.locator("#sun-settings summary").click();
    for (const hour of ["6.25", "0", "12"]) {
      await page.locator("#sun-time").fill(hour);
      await canvas.screenshot({
        path: artifactPath(`color-finishing-hour-${hour}.png`),
      });
    }
    await useReferenceAppearance(page);
    const released = await state();
    for (const row of released) assert.equal(row.hdrTextures.length, 0);
    if (!(await page.locator("#appearance-settings").evaluate((el) => el.open)))
      await page.locator("#appearance-settings summary").click();
    await page.locator("#reset-appearance").click();
    await page.locator("#select-local").click();
    for (const [label, fields] of [
      [
        "snow",
        {
          seed: 2026,
          globalWarmth: 0.12,
          globalMoisture: 0.8,
          heightMultiplier: 60,
          seaLevel: 0.3,
        },
      ],
      [
        "coast",
        { seed: -7, globalWarmth: 0.9, globalMoisture: 0.45, seaLevel: 0.23 },
      ],
    ]) {
      await page.locator("#reset-parameters").click();
      await fillParameters(page, {
        width: 129,
        height: 97,
        iterations: 16,
        ...fields,
      });
      await page.locator("#verify-equivalence").click();
      await waitForTerrain(page);
      assert.match(
        await page.locator("#numeric-match").innerText(),
        /All heights match/,
      );
      await canvas.screenshot({
        path: artifactPath(`color-finishing-aces-${label}.png`),
      });
    }
    await fillParameters(page, { width: 512, height: 512, iterations: 0 });
    await page.locator("#generate-local").click();
    await waitForTerrain(page);
    const maximum = await state();
    assert.equal(maximum[0].hdrTextures.length, 1);
    await page.setViewportSize({ width: 390, height: 844 });
    await canvas.screenshot();
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    await context.setOffline(true);
    await page.reload();
    await waitForOfflineReady(page);
    await fillParameters(page, {
      width: 65,
      height: 49,
      iterations: 0,
      seed: 76543,
    });
    await page.locator("#generate-local").click();
    await waitForTerrain(page);
    assert.equal((await state())[0].finalCalls, 1);
    assert.deepEqual(errors, []);
    const unsupported = await browser.newContext({
      viewport: { width: 1000, height: 800 },
      reducedMotion: "reduce",
    });
    await unsupported.addInitScript(() => {
      const get = WebGL2RenderingContext.prototype.getExtension;
      WebGL2RenderingContext.prototype.getExtension = function (name) {
        return name === "EXT_color_buffer_float" ? null : get.call(this, name);
      };
    });
    const fallback = await unsupported.newPage();
    fallback.on("pageerror", (e) => errors.push(e.message));
    await fallback.goto(base);
    await waitForOfflineReady(fallback);
    await fillParameters(fallback, { width: 33, height: 25, iterations: 0 });
    await fallback.locator("#generate-local").click();
    await waitForTerrain(fallback);
    assert.match(
      await fallback.locator(".finishing-warning").innerText(),
      /Showing Reference/,
    );
    await useReferenceAppearance(fallback);
    await fallback.locator(".finishing-warning").waitFor({ state: "detached" });
    await unsupported.close();
    assert.deepEqual(errors, []);
    const report = {
      pass: true,
      initial,
      edited,
      pair,
      maximum,
      aces,
      nightToe,
      ref,
      offline: true,
      errors,
    };
    await fs.writeFile(
      artifactPath("color-finishing-verification.json"),
      JSON.stringify(report, null, 2),
    );
    console.log(
      JSON.stringify({ pass: true, aces, ref, offline: true, errors }),
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
