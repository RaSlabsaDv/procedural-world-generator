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
    });
    await instrumentLighting(context);
    await context.addInitScript(() => {
      window.__water = [];
      window.__waterRPC = 0;
      const post = Worker.prototype.postMessage;
      Worker.prototype.postMessage = function (...args) {
        if (JSON.stringify(args[0]).includes("generate")) window.__waterRPC++;
        return post.apply(this, args);
      };
      const original = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (...args) {
        const gl = original.apply(this, args);
        if (!gl || args[0] !== "webgl2" || gl.__waterChecked) return gl;
        gl.__waterChecked = true;
        const record = { gl, frames: 0, time: 0, water: false, bytes: 0 };
        window.__water.push(record);
        const draw = gl.drawElements;
        gl.drawElements = function (...args) {
          const program = gl.getParameter(gl.CURRENT_PROGRAM),
            time = gl.getUniformLocation(program, "waterTime");
          if (time !== null) {
            record.frames++;
            record.time = gl.getUniform(program, time);
            record.water = true;
            let bytes = 0;
            const prev = gl.getParameter(gl.ARRAY_BUFFER_BINDING);
            for (const name of ["position", "waterDepth", "shoreDistance"]) {
              const loc = gl.getAttribLocation(program, name);
              gl.bindBuffer(
                gl.ARRAY_BUFFER,
                gl.getVertexAttrib(loc, gl.VERTEX_ATTRIB_ARRAY_BUFFER_BINDING),
              );
              bytes += gl.getBufferParameter(gl.ARRAY_BUFFER, gl.BUFFER_SIZE);
            }
            gl.bindBuffer(gl.ARRAY_BUFFER, prev);
            bytes += gl.getBufferParameter(
              gl.ELEMENT_ARRAY_BUFFER,
              gl.BUFFER_SIZE,
            );
            record.bytes = bytes;
          }
          return draw.apply(this, args);
        };
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
      if (r.method() === "POST" && r.url().includes("/api/v1/terrains"))
        requests++;
    });
    const state = () =>
      page.evaluate(() => ({
        rpc: window.__waterRPC,
        views: window.__water
          .filter((r) => !r.gl.isContextLost())
          .map(({ frames, time, water, bytes }) => ({
            frames,
            time,
            water,
            bytes,
          })),
      }));
    await page.goto(base);
    await waitForOfflineReady(page);
    await useReferenceAppearance(page);
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
    let a = await state();
    await page.waitForTimeout(250);
    let b = await state();
    assert.ok(b.views.at(-1).frames > a.views.at(-1).frames);
    assert.ok(b.views.at(-1).time > a.views.at(-1).time);
    const beforeCalls = { requests, rpc: b.rpc };
    await page.locator("#water-settings summary").click();
    await page.locator("#water-color").fill("#2288aa");
    await page.locator("#water-turbidity").fill("1.2");
    await page.locator("#water-foam").fill("0.8");
    await page.waitForTimeout(100);
    assert.equal(requests, beforeCalls.requests);
    assert.equal((await state()).rpc, beforeCalls.rpc);
    await page.locator("#reset-water").click();
    await page.locator("#compare-views").click();
    await page.locator("app-terrain-preview .display-time").nth(1).waitFor();
    const pair = await state();
    assert.equal(pair.views.filter((v) => v.water).length, 2);
    assert.ok(Math.abs(pair.views[0].time - pair.views[1].time) < 0.001);
    for (const row of pair.views) assert.ok(row.bytes <= 32 * 1024 * 1024);
    for (const row of (await lightingResources(page)).filter(
      (r) => !r.lost && r.detailTextures > 0,
    ))
      assert.equal(row.activeShadowUpdates, 1);
    await fillParameters(page, { iterations: 256 });
    await page.locator("#generate-local").click();
    a = await state();
    await page.waitForTimeout(150);
    b = await state();
    assert.deepEqual(
      b.views.map((v) => v.frames),
      a.views.map((v) => v.frames),
      "No wave frames during computation",
    );
    assert.equal(await page.locator("#water-turbidity").isDisabled(), true);
    await waitForTerrain(page);
    await page.locator("#select-local").click();
    await fillParameters(page, {
      seaLevel: 1,
      iterations: 0,
      width: 512,
      height: 512,
    });
    await page.locator("#generate-local").click();
    await waitForTerrain(page);
    await page
      .locator("app-terrain-preview canvas")
      .first()
      .screenshot({ path: artifactPath("ocean-all-water.png") });
    const maximum = await state();
    assert.ok(maximum.views.at(-1).bytes <= 32 * 1024 * 1024);
    await fillParameters(page, {
      seaLevel: 0,
      iterations: 0,
      heightMultiplier: 0,
      width: 2,
      height: 2,
    });
    await page.locator("#generate-local").click();
    await waitForTerrain(page);
    await page
      .locator("app-terrain-preview canvas")
      .first()
      .screenshot({ path: artifactPath("ocean-zero-height.png") });
    await fillParameters(page, {
      heightMultiplier: 30,
      width: 33,
      height: 25,
      seaLevel: 0,
    });
    await page.locator("#generate-local").click();
    await waitForTerrain(page);
    a = await state();
    await page.waitForTimeout(200);
    b = await state();
    assert.deepEqual(
      b.views.map((v) => v.frames),
      a.views.map((v) => v.frames),
      "No ocean means no wave draws",
    );
    await context.setOffline(true);
    await page.reload();
    await waitForOfflineReady(page);
    await useReferenceAppearance(page);
    await fillParameters(page, {
      seed: 12345,
      width: 33,
      height: 25,
      iterations: 0,
      seaLevel: 1,
    });
    await page.locator("#generate-local").click();
    await waitForTerrain(page);
    const offline = await state();
    assert.equal(
      offline.views.at(-1).water,
      true,
      "Cached normal supports a new offline Ocean",
    );
    await page.setViewportSize({ width: 390, height: 844 });
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    assert.deepEqual(errors, []);
    const evidence = {
      pass: true,
      browser: browser.version(),
      pair,
      maximum,
      offline,
      noOceanStopped: true,
      controlsWithoutGeneration: true,
      paused: true,
      errors,
    };
    await fs.writeFile(
      artifactPath("ocean-verification.json"),
      JSON.stringify(evidence, null, 2),
    );
    console.log(JSON.stringify(evidence));
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
