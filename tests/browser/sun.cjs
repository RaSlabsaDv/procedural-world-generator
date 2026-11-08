// Production UI sun cycle, shared bindings, static shadow ownership and offline use.
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
      window.__sunViews = [];
      window.__sunRPC = 0;
      const post = Worker.prototype.postMessage;
      Worker.prototype.postMessage = function (...args) {
        if (JSON.stringify(args[0]).includes("generate")) window.__sunRPC++;
        return post.apply(this, args);
      };
      const get = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (...args) {
        const gl = get.apply(this, args);
        if (!gl || args[0] !== "webgl2" || gl.__sun) return gl;
        gl.__sun = true;
        const r = { gl, uploads: 0, draws: 0 };
        window.__sunViews.push(r);
        const buffer = gl.bufferData;
        gl.bufferData = function (...args) {
          r.uploads++;
          return buffer.apply(this, args);
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
        rpc: window.__sunRPC,
        views: window.__sunViews
          .filter((r) => !r.gl.isContextLost())
          .map((r) => {
            const gl = r.gl,
              p = gl.getParameter(gl.CURRENT_PROGRAM),
              read = (n) => {
                const l = gl.getUniformLocation(p, n),
                  v = l === null ? null : gl.getUniform(p, l);
                return v?.length ? Array.from(v) : v;
              };
            return {
              uploads: r.uploads,
              draws: r.draws,
              hour: read("environmentTimeOfDayHours"),
              direction: read("environmentSunDirection"),
              intensity: read("environmentSunIntensity"),
              waveTime: read("waterTime"),
              projection: read("projectionMatrix"),
              view: read("modelViewMatrix"),
            };
          }),
      }));
    const liveLighting = async () =>
      (await lightingResources(page)).filter(
        (r) => !r.lost && r.detailTextures > 0,
      );
    await page.goto(base);
    await waitForOfflineReady(page);
    assert.equal(
      await page.locator("#sun-settings").getAttribute("open"),
      null,
    );
    assert.equal(
      await page.locator("#sun-time").count(),
      0,
      "Sun module stays deferred before opening",
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
    await page.locator("#sun-settings summary").click();
    await page.locator("#sun-time").waitFor();
    assert.equal(await page.locator("#sun-time-value").innerText(), "12:00");
    assert.match(
      await page.locator("#sun-direction-value").innerText(),
      /315° NW/,
    );
    const canvas = page.locator("app-terrain-preview canvas").first();
    const noon = await canvas.screenshot({
      path: artifactPath("sun-noon.png"),
    });
    const initial = await state(),
      calls = { rpc: initial.rpc, requests },
      lightBefore = await liveLighting();
    const times = [];
    for (const hour of ["6.25", "9", "17.75", "0", "24", "12"]) {
      await page.locator("#sun-time").fill(hour);
      await page.waitForTimeout(80);
      const current = await state();
      assert.equal(current.rpc, calls.rpc);
      assert.equal(requests, calls.requests);
      assert.equal(current.views[0].uploads, initial.views[0].uploads);
      assert.deepEqual(current.views[0].view, initial.views[0].view);
      assert.deepEqual(
        current.views[0].projection,
        initial.views[0].projection,
      );
      assert.equal(current.views[0].waveTime, initial.views[0].waveTime);
      const n = await liveLighting();
      assert.deepEqual(
        n[0].attachments,
        lightBefore[0].attachments,
        "One shadow target is retained through night/day",
      );
      if (Number(hour) === 0 || Number(hour) === 24)
        assert.equal(current.views[0].intensity, 0);
      else assert.ok(current.views[0].intensity > 0);
      await canvas.screenshot({ path: artifactPath(`sun-hour-${hour}.png`) });
      times.push(Number(hour));
    }
    for (const azimuth of ["0", "90", "180", "270", "359"]) {
      await page.locator("#sun-direction").fill(azimuth);
      await page.waitForTimeout(60);
      assert.equal((await state()).views[0].uploads, initial.views[0].uploads);
    }
    await page.locator("#reset-sun").click();
    await page.waitForTimeout(80);
    assert.deepEqual(
      await canvas.screenshot(),
      noon,
      "Reset restores exact frozen noon pixels",
    );
    await page.locator("#compare-views").click();
    await page.locator("app-terrain-preview .display-time").nth(1).waitFor();
    await page.locator("#sun-direction").fill("90");
    await page.locator("#sun-time").fill("9");
    await page.waitForTimeout(80);
    let pair = await state();
    assert.equal(pair.views.length, 2);
    assert.deepEqual(pair.views[0].direction, pair.views[1].direction);
    assert.equal(pair.views[0].intensity, pair.views[1].intensity);
    const beforeRapid = await state();
    const rapidShadows = await liveLighting();
    await page.locator("#sun-direction").evaluate((el) => {
      for (let d = 91; d < 111; d++) {
        el.value = String(d);
        el.dispatchEvent(new Event("input", { bubbles: true }));
      }
    });
    await page.waitForTimeout(80);
    pair = await state();
    assert.deepEqual(pair.views[0].direction, pair.views[1].direction);
    const expected = [
        Math.SQRT2 * Math.sin((110 * Math.PI) / 180),
        2 * Math.sin(Math.PI / 4),
        Math.SQRT2 * Math.cos((110 * Math.PI) / 180),
      ],
      length = Math.hypot(...expected);
    expected.forEach((v, i) =>
      assert.ok(Math.abs(v / length - pair.views[0].direction[i]) < 1e-6),
    );
    const afterRapidShadows = await liveLighting();
    rapidShadows.forEach((r, i) =>
      assert.equal(
        afterRapidShadows[i].activeShadowUpdates - r.activeShadowUpdates,
        1,
        "Synchronous slider edits coalesce into one shadow update per view",
      ),
    );
    assert.deepEqual(
      pair.views.map((r) => r.uploads),
      beforeRapid.views.map((r) => r.uploads),
    );
    await page.locator("#atmosphere-settings summary").click();
    await page.locator("#atmosphere-enabled").uncheck();
    const noFog = await liveLighting();
    await page.locator("#sun-time").fill("10");
    await page.waitForTimeout(80);
    assert.ok(
      (await liveLighting())[0].activeShadowUpdates >
        noFog[0].activeShadowUpdates,
    );
    await page.locator("#sun-direction").fill("45");
    await page.waitForTimeout(80);
    const unchanged = await liveLighting();
    await page.locator("#atmosphere-haze").fill("0.4");
    await page.waitForTimeout(80);
    assert.deepEqual(
      (await liveLighting()).map((r) => r.activeShadowUpdates),
      unchanged.map((r) => r.activeShadowUpdates),
    );
    await page.locator("#water-settings summary").click();
    await page.locator("#water-foam").fill("0.2");
    await page.waitForTimeout(80);
    assert.deepEqual(
      (await liveLighting()).map((r) => r.activeShadowUpdates),
      unchanged.map((r) => r.activeShadowUpdates),
    );
    assert.equal((await state()).rpc, calls.rpc);
    assert.equal(requests, calls.requests);
    await page.locator("#sun-settings summary").click();
    await page.locator("#sun-settings summary").click();
    assert.equal(await page.locator("#sun-direction").inputValue(), "45");
    await fillParameters(page, { iterations: 128 });
    await page.locator("#generate-local").click();
    const paused = await state(),
      shadowPaused = await liveLighting();
    await page.locator("#sun-time").evaluate((el) => {
      el.value = "14";
      el.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await page.waitForTimeout(150);
    assert.equal(await page.locator("#sun-time").isDisabled(), true);
    assert.deepEqual(
      (await state()).views.map((r) => r.draws),
      paused.views.map((r) => r.draws),
    );
    assert.deepEqual(
      (await liveLighting()).map((r) => r.activeShadowUpdates),
      shadowPaused.map((r) => r.activeShadowUpdates),
    );
    await waitForTerrain(page);
    assert.equal(await page.locator("#sun-time-value").innerText(), "10:00");
    assert.equal(await page.locator("#sun-time").inputValue(), "10");
    await context.setOffline(true);
    await page.reload();
    await waitForOfflineReady(page);
    await page.locator("#sun-settings summary").click();
    await page.locator("#sun-time").fill("9");
    await fillParameters(page, {
      width: 33,
      height: 25,
      iterations: 0,
      seed: 124578,
    });
    await page.locator("#generate-local").click();
    await waitForTerrain(page);
    await page.locator("#sun-direction").fill("135");
    await page.setViewportSize({ width: 390, height: 844 });
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    // Near-horizon pictures expose sky transitions and stretched low-sun shadows.
    await page.setViewportSize({ width: 1600, height: 1050 });
    const box = await canvas.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(
      box.x + box.width / 2,
      box.y + box.height / 2 - box.height * 0.07,
      { steps: 8 },
    );
    await page.mouse.up();
    for (const hour of ["6.25", "12", "17.75", "0"]) {
      await page.locator("#sun-time").fill(hour);
      await canvas.screenshot({
        path: artifactPath(`sun-horizon-${hour}.png`),
      });
    }

    await context.setOffline(false);
    const deferredPage = await context.newPage();
    deferredPage.on("pageerror", (e) => errors.push(e.message));
    await deferredPage.goto(base);
    await waitForOfflineReady(deferredPage);
    await fillParameters(deferredPage, {
      width: 33,
      height: 25,
      iterations: 0,
    });
    let releaseRemote, sawRemote;
    const blocked = new Promise((resolve) => {
      sawRemote = resolve;
    });
    await context.route("**/api/v1/terrains", async (route) => {
      sawRemote();
      await new Promise((resolve) => {
        releaseRemote = resolve;
      });
      await route.continue();
    });
    await deferredPage.locator("#generate-remote").click();
    await Promise.race([
      blocked,
      new Promise((_, reject) =>
        setTimeout(
          () => reject(new Error("Remote request was not intercepted")),
          10000,
        ),
      ),
    ]);
    await deferredPage.locator("#sun-settings summary").click();
    assert.equal(
      await deferredPage.locator("#sun-time").count(),
      0,
      "No deferred Sun import during computation",
    );
    releaseRemote();
    await waitForTerrain(deferredPage);
    await deferredPage.locator("#sun-time").waitFor();
    await deferredPage.close();
    assert.deepEqual(errors, []);
    const report = {
      pass: true,
      browser: browser.version(),
      times,
      pair,
      defaultPixelsRestored: true,
      noGenerationOnSunEdit: true,
      paused: true,
      offline: true,
      errors,
    };
    await fs.writeFile(
      artifactPath("sun-verification.json"),
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
