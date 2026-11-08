// Real production WebGL: shared bindings, reference restoration, budgets and offline use.
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
      window.__atmosphere = [];
      window.__atmosphereRPC = 0;
      const post = Worker.prototype.postMessage;
      Worker.prototype.postMessage = function (...args) {
        if (JSON.stringify(args[0]).includes("generate"))
          window.__atmosphereRPC++;
        return post.apply(this, args);
      };
      const get = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (...args) {
        const gl = get.apply(this, args);
        if (!gl || args[0] !== "webgl2" || gl.__atmosphere) return gl;
        gl.__atmosphere = true;
        const r = {
          gl,
          uploads: 0,
          draws: 0,
          sky: 0,
          color: 0,
          programs: new Set(),
          skyBytes: 0,
        };
        window.__atmosphere.push(r);
        const buffer = gl.bufferData;
        gl.bufferData = function (...args) {
          r.uploads++;
          return buffer.apply(this, args);
        };
        const clear = gl.clear;
        gl.clear = function (...args) {
          if (!gl.getParameter(gl.FRAMEBUFFER_BINDING)) {
            r.sky = 0;
            r.color = 0;
          }
          return clear.apply(this, args);
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
              r.color++;
              const p = gl.getParameter(gl.CURRENT_PROGRAM);
              r.programs.add(p);
              if (gl.getUniformLocation(p, "skyProjectionInverse") !== null) {
                r.sky++;
                const loc = gl.getAttribLocation(p, "position"),
                  prev = gl.getParameter(gl.ARRAY_BUFFER_BINDING);
                gl.bindBuffer(
                  gl.ARRAY_BUFFER,
                  gl.getVertexAttrib(
                    loc,
                    gl.VERTEX_ATTRIB_ARRAY_BUFFER_BINDING,
                  ),
                );
                r.skyBytes = gl.getBufferParameter(
                  gl.ARRAY_BUFFER,
                  gl.BUFFER_SIZE,
                );
                gl.bindBuffer(gl.ARRAY_BUFFER, prev);
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
    let requests = 0;
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text());
    });
    page.on("request", (r) => {
      if (r.method() === "POST") requests++;
    });
    const state = () =>
      page.evaluate(() => ({
        rpc: window.__atmosphereRPC,
        views: window.__atmosphere
          .filter((r) => !r.gl.isContextLost())
          .map((r) => {
            const gl = r.gl,
              p = gl.getParameter(gl.CURRENT_PROGRAM),
              read = (n) => {
                const l = gl.getUniformLocation(p, n);
                const v = l === null ? null : gl.getUniform(p, l);
                return v?.length ? Array.from(v) : v;
              };
            return {
              uploads: r.uploads,
              draws: r.draws,
              sky: r.sky,
              color: r.color,
              programs: r.programs.size,
              skyBytes: r.skyBytes,
              enabled: read("atmosphereEnabled"),
              haze: read("atmosphereHaze"),
              valley: read("atmosphereValleyFog"),
              projection: read("projectionMatrix"),
              view: read("modelViewMatrix"),
            };
          }),
      }));
    await page.goto(base);
    await waitForOfflineReady(page);
    assert.equal(
      await page.locator("#atmosphere-settings").getAttribute("open"),
      null,
    );
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
    await page.locator("#atmosphere-settings summary").click();
    const baseline = await state(),
      calls = { rpc: baseline.rpc, requests };
    for (const r of baseline.views) {
      assert.equal(r.sky, 1);
      assert.equal(r.skyBytes, 36);
      assert.ok(r.color <= 21);
    }
    await page.locator("#atmosphere-haze").fill("0.8");
    await page.locator("#atmosphere-valley-fog").fill("0.7");
    await page.waitForTimeout(100);
    let changed = await state();
    assert.equal(changed.rpc, calls.rpc);
    assert.equal(requests, calls.requests);
    assert.equal(changed.views[0].uploads, baseline.views[0].uploads);
    assert.equal(changed.views[0].programs, baseline.views[0].programs);
    assert.deepEqual(changed.views[0].view, baseline.views[0].view);
    assert.deepEqual(changed.views[0].projection, baseline.views[0].projection);
    assert.ok(Math.abs(changed.views[0].haze - 0.8) < 0.0001);
    const canvas = page.locator("app-terrain-preview canvas").first();
    await page.locator("#atmosphere-enabled").uncheck();
    await page.waitForTimeout(100);
    const reference = await canvas.screenshot({
      path: artifactPath("atmosphere-reference-toggle.png"),
    });
    assert.equal((await state()).views[0].sky, 0);
    await page.locator("#atmosphere-enabled").check();
    await page.locator("#atmosphere-enabled").uncheck();
    await page.waitForTimeout(100);
    assert.deepEqual(
      await canvas.screenshot(),
      reference,
      "Reference pixels restore exactly after toggling",
    );
    await page.locator("#reset-atmosphere").click();
    await page.locator("#compare-views").click();
    await page.locator("app-terrain-preview .display-time").nth(1).waitFor();
    const pair = await state();
    assert.equal(pair.views.length, 2);
    for (const r of pair.views) {
      assert.equal(r.sky, 1);
      assert.equal(r.enabled, 1);
      assert.ok(Math.abs(r.haze - 0.22) < 0.0001);
      assert.ok(r.color <= 21);
    }
    for (const r of (await lightingResources(page)).filter(
      (r) => !r.lost && r.detailTextures > 0,
    ))
      assert.equal(r.activeShadowUpdates, 1);
    await fillParameters(page, { iterations: 128 });
    await page.locator("#generate-local").click();
    const paused = await state();
    await page.waitForTimeout(150);
    assert.deepEqual(
      (await state()).views.map((r) => r.draws),
      paused.views.map((r) => r.draws),
    );
    assert.equal(await page.locator("#atmosphere-haze").isDisabled(), true);
    await waitForTerrain(page);
    await page.locator("#select-local").click();
    const edgeCases = [
      { width: 2, height: 2, heightMultiplier: 0, seaLevel: 0, iterations: 0 },
      {
        width: 512,
        height: 512,
        heightMultiplier: 30,
        seaLevel: 1,
        iterations: 0,
      },
      {
        width: 33,
        height: 25,
        heightMultiplier: 30,
        seaLevel: 0,
        iterations: 0,
      },
    ];
    for (const values of edgeCases) {
      await fillParameters(page, values);
      await page.locator("#generate-local").click();
      await waitForTerrain(page);
      assert.equal((await state()).views[0].sky, 1);
    }
    await context.setOffline(true);
    await page.reload();
    await waitForOfflineReady(page);
    await fillParameters(page, {
      seed: 98765,
      width: 33,
      height: 25,
      iterations: 0,
    });
    await page.locator("#generate-local").click();
    await waitForTerrain(page);
    assert.equal((await state()).views[0].sky, 1);
    await page.setViewportSize({ width: 390, height: 844 });
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    assert.deepEqual(errors, []);
    await context.close();

    // Test-only source substitution uses the real shared environment derivation.
    // SW is blocked here because intentionally modified JS must not enter its cache.
    const sunStates = [];
    for (const hour of [6.2, 17.8, 0]) {
      const c = await browser.newContext({
        viewport: { width: 1280, height: 900 },
        reducedMotion: "reduce",
        serviceWorkers: "block",
      });
      await c.addInitScript(() => {
        // Do not wait for serviceWorker.ready in this intentionally uncached fixture.
        delete Navigator.prototype.serviceWorker;
      });
      let substitutions = 0;
      await c.route("**/*.js", async (route) => {
        const response = await route.fetch(),
          source = await response.text();
        const original =
          "timeOfDayHours:12,sunAzimuthDegrees:315,visualTimeSeconds:0";
        const body = source.replace(
          original,
          `timeOfDayHours:${hour},sunAzimuthDegrees:315,visualTimeSeconds:0`,
        );
        if (body !== source) substitutions++;
        await route.fulfill({ response, body });
      });
      const p = await c.newPage();
      p.on("pageerror", (e) => errors.push(e.message));
      p.on("console", (m) => {
        if (m.type() === "error") errors.push(m.text());
      });
      await p.goto(base);
      await fillParameters(p, {
        width: 65,
        height: 49,
        iterations: 0,
        seed: -7,
        seaLevel: 0.23,
      });
      await p.locator("#generate-local").click();
      await waitForTerrain(p);
      assert.equal(substitutions, 1);
      const box = await p.locator("app-terrain-preview canvas").boundingBox();
      await p.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await p.mouse.down();
      await p.mouse.move(
        box.x + box.width / 2,
        box.y + box.height / 2 - box.height * 0.08,
        { steps: 8 },
      );
      await p.mouse.up();

      await p
        .locator("app-terrain-preview canvas")
        .screenshot({ path: artifactPath(`atmosphere-sun-${hour}.png`) });
      sunStates.push(hour);
      await c.close();
    }
    assert.deepEqual(errors, []);
    const report = {
      pass: true,
      browser: browser.version(),
      pair,
      sunStates,
      referenceRestored: true,
      noGenerationOnSettings: true,
      paused: true,
      offline: true,
      errors,
    };
    await fs.writeFile(
      artifactPath("atmosphere-verification.json"),
      JSON.stringify(report, null, 2),
    );
    console.log(JSON.stringify(report));
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
