const assert = require("node:assert/strict"),
  fs = require("node:fs/promises");
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
(async () => {
  const browser = await launchBrowser();
  try {
    const context = await browser.newContext({
      viewport: { width: 1600, height: 1050 },
      reducedMotion: "reduce",
    });
    await context.addInitScript(() => {
      window.__bloomViews = [];
      window.__bloomFixture = null;
      const get = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (...args) {
        const gl = get.apply(this, args);
        if (!gl || args[0] !== "webgl2" || gl.__bloom) return gl;
        gl.__bloom = true;
        const r = {
          gl,
          textures: new Map(),
          attachments: new Map(),
          frame: [],
          uploads: 0,
          shadowClears: 0,
          bright: null,
          blur: null,
          pixels: null,
          feedback: false,
        };
        window.__bloomViews.push(r);
        const storage = gl.texStorage2D;
        gl.texStorage2D = function (target, levels, format, width, height) {
          r.textures.set(gl.getParameter(gl.TEXTURE_BINDING_2D), {
            format,
            width,
            height,
          });
          return storage.apply(this, arguments);
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
        const attach = gl.framebufferTexture2D;
        gl.framebufferTexture2D = function (
          target,
          slot,
          type,
          texture,
          level,
        ) {
          const f = gl.getParameter(gl.FRAMEBUFFER_BINDING);
          if (!r.attachments.has(f)) r.attachments.set(f, new Map());
          r.attachments.get(f).set(slot, texture);
          return attach.apply(this, arguments);
        };
        for (const method of ["bufferData", "bufferSubData"]) {
          const fn = gl[method];
          gl[method] = function (...args) {
            r.uploads++;
            return fn.apply(this, args);
          };
        }
        const status = gl.checkFramebufferStatus;
        gl.checkFramebufferStatus = function (...args) {
          const f = gl.getParameter(gl.FRAMEBUFFER_BINDING),
            t = r.attachments.get(f)?.get(gl.COLOR_ATTACHMENT0),
            info = r.textures.get(t);
          if (
            window.__bloomFail &&
            info?.format === gl.RGBA16F &&
            info.width * info.height <= 65536
          )
            return gl.FRAMEBUFFER_UNSUPPORTED;
          return status.apply(this, args);
        };
        const clear = gl.clear;
        gl.clear = function (...args) {
          const f = gl.getParameter(gl.FRAMEBUFFER_BINDING);
          if (f && r.attachments.get(f)?.has(gl.DEPTH_ATTACHMENT))
            r.shadowClears++;
          return clear.apply(this, args);
        };
        const fixture = (width, height) => {
          const key = JSON.stringify([window.__bloomFixture, width, height]);
          if (r.fixtureKey === key) return r.fixtureTexture;
          r.fixtureKey = key;
          r.fixtureTexture ??= gl.createTexture();
          gl.bindTexture(gl.TEXTURE_2D, r.fixtureTexture);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
          const data = new Float32Array(width * height * 4),
            value = window.__bloomFixture;
          for (let y = 0; y < height; y++)
            for (let x = 0; x < width; x++) {
              const bright =
                value.pattern === "flat" ||
                (Math.abs(y - (height >> 1)) < 2 &&
                  (value.pattern === "edge"
                    ? x < 4
                    : Math.abs(x - (width >> 1)) < 2));
              const v = bright ? value.value : 0,
                i = (y * width + x) * 4;
              data[i] = data[i + 1] = data[i + 2] = v;
              data[i + 3] = 1;
            }
          gl.texImage2D(
            gl.TEXTURE_2D,
            0,
            gl.RGBA32F,
            width,
            height,
            0,
            gl.RGBA,
            gl.FLOAT,
            data,
          );
          return r.fixtureTexture;
        };
        for (const method of [
          "drawElements",
          "drawArrays",
          "drawElementsInstanced",
          "drawArraysInstanced",
        ]) {
          const draw = gl[method];
          gl[method] = function (...args) {
            const p = gl.getParameter(gl.CURRENT_PROGRAM),
              uniform = (n) => {
                const l = gl.getUniformLocation(p, n);
                return l === null ? null : gl.getUniform(p, l);
              };
            const bright = uniform("bloomSourceTexel"),
              step = uniform("bloomStep"),
              final = uniform("finishColor") !== null;
            if (!bright && !step && !final) return draw.apply(this, args);
            if (bright) r.frame = [];
            r.frame.push(
              bright
                ? "extract"
                : step
                  ? step[0]
                    ? "horizontal"
                    : "vertical"
                  : "final",
            );
            let previousActive, previousTexture, unit;
            if (window.__bloomFixture && (bright || final)) {
              previousActive = gl.getParameter(gl.ACTIVE_TEXTURE);
              unit = uniform(bright ? "bloomInput" : "finishColor");
              gl.activeTexture(gl.TEXTURE0 + unit);
              previousTexture = gl.getParameter(gl.TEXTURE_BINDING_2D);
              const info = r.textures.get(previousTexture);
              const width = bright ? Math.round(1 / bright[0]) : info.width,
                height = bright ? Math.round(1 / bright[1]) : info.height;
              gl.bindTexture(gl.TEXTURE_2D, fixture(width, height));
            }
            if (bright || step) {
              const old = gl.getParameter(gl.ACTIVE_TEXTURE),
                unit = uniform("bloomInput");
              gl.activeTexture(gl.TEXTURE0 + unit);
              if (
                r.attachments
                  .get(gl.getParameter(gl.FRAMEBUFFER_BINDING))
                  ?.get(gl.COLOR_ATTACHMENT0) ===
                gl.getParameter(gl.TEXTURE_BINDING_2D)
              )
                r.feedback = true;
              gl.activeTexture(old);
            }
            const result = draw.apply(this, args);
            if (window.__bloomFixture && (bright || (step && step[1]))) {
              const f = gl.getParameter(gl.FRAMEBUFFER_BINDING),
                t = r.attachments.get(f)?.get(gl.COLOR_ATTACHMENT0),
                info = r.textures.get(t);
              const values = new Float32Array(info.width * info.height * 4);
              gl.readPixels(
                0,
                0,
                info.width,
                info.height,
                gl.RGBA,
                gl.FLOAT,
                values,
              );
              let sum = 0,
                peak = 0,
                nonzero = 0,
                right = 0;
              for (let y = 0; y < info.height; y++)
                for (let x = 0; x < info.width; x++) {
                  const v = values[(y * info.width + x) * 4];
                  sum += v;
                  peak = Math.max(peak, v);
                  if (v > 0) nonzero++;
                  if (x === info.width - 1) right += v;
                }
              r[bright ? "bright" : "blur"] = {
                sum,
                peak,
                nonzero,
                right,
                error: gl.getError(),
              };
            }
            if (final) {
              const data = new Uint8Array(4);
              gl.readPixels(
                gl.drawingBufferWidth >> 1,
                gl.drawingBufferHeight >> 1,
                1,
                1,
                gl.RGBA,
                gl.UNSIGNED_BYTE,
                data,
              );
              r.pixels = [...data];
            }
            if (previousTexture !== undefined) {
              gl.activeTexture(gl.TEXTURE0 + unit);
              gl.bindTexture(gl.TEXTURE_2D, previousTexture);
              gl.activeTexture(previousActive);
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
        window.__bloomViews
          .filter((r) => !r.gl.isContextLost())
          .map((r) => ({
            frame: r.frame,
            uploads: r.uploads,
            shadowClears: r.shadowClears,
            bright: r.bright,
            blur: r.blur,
            pixels: r.pixels,
            feedback: r.feedback,
            hdr: [...r.textures]
              .filter(
                ([t, v]) => r.gl.isTexture(t) && v.format === r.gl.RGBA16F,
              )
              .map(([, v]) => v),
          })),
      );
    };
    await page.goto(base);
    await waitForOfflineReady(page);
    await fillParameters(page, {
      width: 129,
      height: 97,
      iterations: 16,
      seed: -7,
      seaLevel: 0.23,
    });
    await page.locator("#verify-equivalence").click();
    await waitForTerrain(page);
    assert.match(
      await page.locator("#numeric-match").innerText(),
      /All heights match/,
    );
    await page.locator("#appearance-settings summary").click();
    const toggle = page.locator("#appearance-bloom");
    assert.equal(await toggle.isChecked(), false);
    const canvas = page.locator("app-terrain-preview canvas").first();
    const before = await canvas.screenshot();
    const baseline = (await state())[0],
      display = await page.locator(".display-time").first().innerText(),
      calls = requests;
    assert.equal(baseline.hdr.length, 1);
    await toggle.check();
    const on = (await state())[0];
    assert.deepEqual(on.frame, ["extract", "horizontal", "vertical", "final"]);
    assert.equal(on.hdr.length, 3);
    assert.equal(on.uploads, baseline.uploads);
    assert.equal(on.shadowClears, baseline.shadowClears);
    assert.equal(on.feedback, false);
    assert.equal(requests, calls);
    assert.equal(
      await page.locator(".display-time").first().innerText(),
      display,
    );
    for (const t of on.hdr.filter((t) => t.width < baseline.hdr[0].width)) {
      assert.ok(t.width * t.height <= 65536);
    }
    await canvas.screenshot({ path: artifactPath("bloom-coast-on.png") });
    await page.evaluate(() => (window.__bloomFail = true));
    await page.locator("#appearance-exposure").fill("1.05");
    assert.match(
      await page.locator(".finishing-warning").innerText(),
      /without bloom/,
    );
    assert.equal((await state())[0].hdr.length, 1);
    await page.evaluate(() => (window.__bloomFail = false));
    await toggle.uncheck();
    await page.locator("#appearance-exposure").fill("1");
    await toggle.check();
    assert.equal((await state())[0].hdr.length, 3);

    await toggle.uncheck();
    assert.deepEqual(await canvas.screenshot(), before);
    assert.equal((await state())[0].hdr.length, 1);
    await page.locator("#appearance-tone").selectOption("reference");
    await page.locator("#appearance-exposure").fill("0.25");
    await page.evaluate(
      () => (window.__bloomFixture = { pattern: "flat", value: 2 }),
    );
    await toggle.check();
    let flat = (await state())[0];
    assert.equal(flat.bright.error, 0);
    assert.equal(flat.blur.error, 0);
    assert.ok(Math.abs(flat.bright.peak - 0.75) < 0.002);
    assert.ok(Math.abs(flat.blur.peak - 0.75) < 0.002);
    [191, 191, 191].forEach((v, i) =>
      assert.ok(
        Math.abs(flat.pixels[i] - v) <= 1,
        `single exposure and encoding: ${flat.pixels}`,
      ),
    );
    await toggle.uncheck();
    assert.ok(Math.abs((await state())[0].pixels[0] - 188) <= 1);
    await page.evaluate(
      () => (window.__bloomFixture = { pattern: "flat", value: 0.5 }),
    );
    await toggle.check();
    const dim = (await state())[0];
    assert.equal(dim.bright.sum, 0);
    assert.equal(dim.blur.sum, 0);
    await toggle.uncheck();
    assert.deepEqual((await state())[0].pixels, dim.pixels);
    await page.evaluate(
      () => (window.__bloomFixture = { pattern: "flat", value: 1.25 }),
    );
    await toggle.check();
    const knee = (await state())[0];
    assert.ok(Math.abs(knee.bright.peak - 0.0625) < 0.0001);
    assert.ok(Math.abs(knee.blur.peak - 0.0625) < 0.0001);
    await toggle.uncheck();
    await state();
    await page.evaluate(
      () => (window.__bloomFixture = { pattern: "flat", value: 0 }),
    );
    await toggle.check();
    assert.deepEqual((await state())[0].pixels, [0, 0, 0, 255]);
    await page.evaluate(
      () => (window.__bloomFixture = { pattern: "pulse", value: 4 }),
    );
    await page.locator("#appearance-exposure").fill("0.3");
    const pulse = (await state())[0];
    assert.ok(pulse.bright.sum > 0);
    assert.ok(pulse.blur.nonzero > pulse.bright.nonzero);
    assert.ok(pulse.blur.peak < pulse.bright.peak);
    assert.ok(Math.abs(pulse.blur.sum / pulse.bright.sum - 1) < 0.02);
    await page.evaluate(
      () => (window.__bloomFixture = { pattern: "edge", value: 4 }),
    );
    await page.locator("#appearance-exposure").fill("0.35");
    const edge = (await state())[0];
    assert.ok(edge.blur.sum > 0);
    assert.equal(edge.blur.right, 0);
    await page.evaluate(() => (window.__bloomFixture = null));
    await page.locator("#reset-appearance").click();
    await state();
    await toggle.check();
    assert.equal((await state())[0].hdr.length, 3);
    await page.locator("#compare-views").click();
    await page.locator("app-terrain-preview .display-time").nth(1).waitFor();
    const pair = await state();
    assert.equal(pair.length, 2);
    for (const r of pair) {
      assert.equal(r.hdr.length, 3);
      assert.deepEqual(r.frame, ["extract", "horizontal", "vertical", "final"]);
    }
    await page.locator("#sun-settings summary").click();
    for (const hour of ["6.25", "0", "12"]) {
      await page.locator("#sun-time").fill(hour);
      await canvas.screenshot({ path: artifactPath(`bloom-hour-${hour}.png`) });
    }
    await page.locator("#select-local").click();
    for (const [name, settings] of [
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
      ["forest", { seed: 42, globalMoisture: 1 }],
    ]) {
      await page.locator("#reset-parameters").click();
      await fillParameters(page, {
        width: 129,
        height: 97,
        iterations: 16,
        ...settings,
      });
      await page.locator("#verify-equivalence").click();
      await waitForTerrain(page);
      assert.match(
        await page.locator("#numeric-match").innerText(),
        /All heights match/,
      );
      await canvas.screenshot({ path: artifactPath(`bloom-${name}.png`) });
    }
    await fillParameters(page, { iterations: 128 });
    await page.locator("#generate-local").click();
    const paused = await state();
    await page.waitForTimeout(100);
    assert.deepEqual(
      (await state()).map((r) => r.uploads),
      paused.map((r) => r.uploads),
    );
    await waitForTerrain(page);
    await fillParameters(page, { width: 512, height: 512, iterations: 0 });
    await page.locator("#generate-local").click();
    await waitForTerrain(page);
    const maximum = await state();
    assert.equal(maximum[0].hdr.length, 3);
    await page.setViewportSize({ width: 390, height: 844 });
    await canvas.screenshot();
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    assert.equal((await state())[0].hdr.length, 3);
    await context.setOffline(true);
    await page.reload();
    await waitForOfflineReady(page);
    await page.locator("#appearance-settings summary").click();
    await page.locator("#appearance-bloom").check();
    await fillParameters(page, {
      width: 65,
      height: 49,
      iterations: 0,
      seed: 76543,
    });
    await page.locator("#generate-local").click();
    await waitForTerrain(page);
    assert.equal((await state())[0].hdr.length, 3);
    assert.deepEqual(errors, []);
    const unsupported = await browser.newContext({
      viewport: { width: 1000, height: 800 },
      reducedMotion: "reduce",
    });
    await unsupported.addInitScript(() => {
      const get = WebGL2RenderingContext.prototype.getExtension;
      WebGL2RenderingContext.prototype.getExtension = function (n) {
        return n === "EXT_color_buffer_float" ? null : get.call(this, n);
      };
    });
    const fallback = await unsupported.newPage();
    fallback.on("pageerror", (e) => errors.push(e.message));
    await fallback.goto(base);
    await waitForOfflineReady(fallback);
    await fallback.locator("#appearance-settings summary").click();
    await fallback.locator("#appearance-bloom").check();
    await fillParameters(fallback, { width: 33, height: 25, iterations: 0 });
    await fallback.locator("#generate-local").click();
    await waitForTerrain(fallback);
    assert.match(
      await fallback.locator(".finishing-warning").innerText(),
      /Showing Reference/,
    );
    await unsupported.close();
    assert.deepEqual(errors, []);
    const report = {
      pass: true,
      baseline,
      on,
      flat,
      knee,
      dim,
      pulse,
      edge,
      pair,
      maximum,
      offline: true,
      errors,
    };
    await fs.writeFile(
      artifactPath("bloom-verification.json"),
      JSON.stringify(report, null, 2),
    );
    console.log(
      JSON.stringify({
        pass: true,
        flat: flat.pixels,
        pulseEnergyRatio: pulse.blur.sum / pulse.bright.sum,
        offExact: true,
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
