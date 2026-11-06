// Full v2 WASM/API fields and trees, maximum work, visible landscapes, instancing and offline 3D.
const { chromium } = require(
  process.env.PWG_PLAYWRIGHT_MODULE || "playwright-core",
);
const assert = require("node:assert/strict"),
  fs = require("node:fs/promises"),
  path = require("node:path");
const base = process.env.PWG_BASE_URL || "http://127.0.0.1:8080";
(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.PWG_BROWSER_EXECUTABLE,
    headless: true,
    args: [
      "--no-sandbox",
      "--enable-unsafe-swiftshader",
      "--use-angle=swiftshader",
    ],
  });
  try {
    const context = await browser.newContext({
        serviceWorkers: "allow",
        viewport: { width: 1600, height: 1050 },
      }),
      page = await context.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    const ready = () =>
      page.locator("#offline-status.ready").waitFor({ timeout: 90000 });
    const complete = () =>
      page.waitForFunction(
        () => document.querySelector(".status").textContent === "Complete",
        null,
        { timeout: 120000 },
      );
    await page.goto(base);
    await ready();
    const reservedBefore = await page
      .workers()[0]
      .evaluate(() => getDotnetRuntime(0).Module.HEAPU8.buffer.byteLength);
    const matrix = await page.evaluate(async () => {
      const host = await import("/wasm/world-generator-host.js"),
        runtime = await host.getWorldGenerator();
      const rows = [];
      for (const [w, h, steps, seed, height, p, m, moisture, sea] of [
        [2, 2, 0, 2147483647, 0, 0.45, 0.3, 0.65, 0.16],
        [3, 2, 2, -2147483648, 30, 0.45, 0.3, 0.65, 0.16],
        [129, 129, 32, 42, 30, 0.45, 0.3, 0.65, 0.16],
        [128, 128, 16, 2026, 30, 0.45, 0.3, 0.65, 0.22],
        [128, 128, 0, -7, 30, 0.45, 0.3, 0.35, 0],
        [512, 512, 128, -7, 80, 1, 0, 1, 0],
      ]) {
        const request = {
          heightMap: {
            seed,
            width: w,
            height: h,
            noiseScale: 0.03,
            octaves: 4,
            heightMultiplier: height,
            algorithmVersion: "value-noise-fbm-v1",
          },
          mountainStrength: 0.55,
          warpStrength: 2,
          iterations: steps,
          rainfall: 0.05,
          evaporation: 0.1,
          plainsCoverage: p,
          mountainCoverage: m,
          globalMoisture: moisture,
          seaLevel: sea,
          algorithmVersion: "diverse-landscape-v2",
        };
        let ticks = 0,
          last = performance.now(),
          maxGap = 0;
        const timer = setInterval(() => {
          const now = performance.now();
          maxGap = Math.max(maxGap, now - last);
          last = now;
          ticks++;
        }, 20);
        const start = performance.now();
        let text, local;
        try {
          text = await runtime.generateTerrainJson(JSON.stringify(request));
          local = JSON.parse(text);
          maxGap = Math.max(maxGap, performance.now() - last);
        } finally {
          clearInterval(timer);
        }
        const localRequestMs = performance.now() - start;
        const response = await fetch("/api/v1/terrains", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(request),
        });
        if (!response.ok) throw Error("API failed: " + response.status);
        const remote = await response.json();
        for (const result of [local, remote]) {
          if (
            result.workload !== "landscape-ecology-hydraulic-v2" ||
            result.executionProfile !== "landscape-worker-json-v2" ||
            result.result.resultVersion !== "landscape-ecology-v2" ||
            result.simulationVersion !== "hydraulic-grid-v1" ||
            result.result.algorithmVersion !== request.algorithmVersion ||
            JSON.stringify(result.parameters.heightMap) !==
              JSON.stringify(request.heightMap)
          ) {
            // Parameter object order differs between source-generated and browser JSON; compare by key below.
            if (
              result.workload !== "landscape-ecology-hydraulic-v2" ||
              result.executionProfile !== "landscape-worker-json-v2" ||
              result.result.resultVersion !== "landscape-ecology-v2" ||
              result.simulationVersion !== "hydraulic-grid-v1" ||
              result.result.algorithmVersion !== request.algorithmVersion
            )
              throw Error("Version mismatch");
          }
          for (const [key, value] of Object.entries(request))
            if (key !== "heightMap" && result.parameters[key] !== value)
              throw Error("Parameter echo: " + key);
          for (const [key, value] of Object.entries(request.heightMap))
            if (result.parameters.heightMap[key] !== value)
              throw Error("Map echo: " + key);
          const s = result.simulation;
          if (
            s.cellIterations !== w * h * steps ||
            Math.abs(
              s.initialTerrainMass - s.finalTerrainMass - s.suspendedSediment,
            ) >
              1e-9 * Math.max(1, s.initialTerrainMass) ||
            Math.abs(s.waterAdded - s.waterRemaining - s.waterEvaporated) >
              1e-9 * Math.max(1, s.waterAdded)
          )
            throw Error("Conservation/work mismatch");
          if (result.result.trees.length > 16384) throw Error("Tree budget");
        }
        if (local.coreBuildId !== remote.coreBuildId)
          throw Error("Core build mismatch");
        let maxError = 0;
        const check = (a, b) => {
          if (!Number.isFinite(a) || !Number.isFinite(b))
            throw Error("Nonfinite");
          const d = Math.abs(a - b);
          maxError = Math.max(maxError, d);
          if (d > 1e-6 + 1e-5 * Math.max(Math.abs(a), Math.abs(b)))
            throw Error("Numeric mismatch");
        };
        for (const name of [
          "values",
          "moisture",
          "temperature",
          "slope",
          "vegetationDensity",
        ]) {
          const a = local.result[name],
            b = remote.result[name];
          if (a.length !== w * h || b.length !== w * h)
            throw Error("Array length");
          for (let i = 0; i < a.length; i++) {
            check(Math.fround(a[i]), Math.fround(b[i]));
            if (
              a[i] < 0 ||
              (name === "values" && Math.fround(a[i]) > Math.fround(height)) ||
              (["moisture", "temperature", "vegetationDensity"].includes(
                name,
              ) &&
                a[i] > 1)
            )
              throw Error("Field range");
          }
        }
        const counts = [0, 0, 0, 0, 0];
        for (let i = 0; i < w * h; i++) {
          const id = local.result.biomes[i];
          if (
            !Number.isInteger(id) ||
            id < 0 ||
            id > 4 ||
            id !== remote.result.biomes[i]
          )
            throw Error("Biome mismatch");
          counts[id]++;
        }
        if (local.result.trees.length !== remote.result.trees.length)
          throw Error("Tree count mismatch");
        let previous = -1;
        for (let i = 0; i < local.result.trees.length; i++) {
          const a = local.result.trees[i],
            b = remote.result.trees[i];
          if (a.cellIndex !== b.cellIndex || a.cellIndex <= previous)
            throw Error("Tree index");
          previous = a.cellIndex;
          for (const key of ["x", "y", "z", "scale", "rotation"])
            check(Math.fround(a[key]), Math.fround(b[key]));
        }
        for (const key of Object.keys(local.simulation))
          check(local.simulation[key], remote.simulation[key]);
        rows.push({
          request,
          biomeCounts: counts,
          trees: local.result.trees.length,
          responseBytes: new TextEncoder().encode(text).length,
          localComputeMs: local.computeMs,
          remoteComputeMs: remote.computeMs,
          localRequestMs,
          maxError,
          heartbeatTicks: ticks,
          maxHeartbeatGapMs: maxGap,
        });
      }
      if (host.getRuntimeInfo().initCount !== 1)
        throw Error("Runtime ownership");
      return rows;
    });
    const reservedAfter = await page
      .workers()[0]
      .evaluate(() => getDotnetRuntime(0).Module.HEAPU8.buffer.byteLength);
    assert.ok(matrix.at(-1).heartbeatTicks > 10);
    assert.equal(matrix.at(-1).trees, 16384);
    const artifact = (name) =>
      path.resolve(__dirname, "../../artifacts/" + name);
    for (const [seed, moisture, sea] of [
      [42, 0.65, 0.16],
      [2026, 0.65, 0.22],
      [-7, 0.35, 0],
    ]) {
      await page.locator("#seed").fill(String(seed));
      await page.locator("#globalMoisture").fill(String(moisture));
      await page.locator("#seaLevel").fill(String(sea));
      await page.locator("#iterations").fill("16");
      await page.locator("#generate-local").click();
      await complete();
      await page.locator("app-terrain-preview .display-time").waitFor();
      assert.equal(
        await page.locator("app-terrain-preview [role=alert]").count(),
        0,
      );
      await page.screenshot({
        path: artifact("landscape-seed-" + seed + ".png"),
        fullPage: true,
      });
    }
    // Full Angular normalization and WebGL with the maximum computed instance count.
    for (const [id, value] of Object.entries({
      width: 512,
      height: 512,
      iterations: 0,
      plainsCoverage: 1,
      mountainCoverage: 0,
      globalMoisture: 1,
      seaLevel: 0,
    }))
      await page.locator("#" + id).fill(String(value));
    await page.locator("#generate-remote").click();
    await complete();
    await page.locator("app-terrain-preview .display-time").waitFor();
    assert.match(
      await page
        .locator(
          '.measurement[aria-label="Remote API measurements"] .tree-count',
        )
        .innerText(),
      /16384/,
    );
    assert.equal(
      await page.locator("app-terrain-preview [role=alert]").count(),
      0,
    );
    await page.locator("#reset-parameters").click();
    await context.setOffline(true);
    await page.reload({ waitUntil: "domcontentloaded" });
    await ready();
    await page.locator("#seed").fill("-9401");
    await page.locator("#generate-local").click();
    await complete();
    await page.locator("app-terrain-preview .display-time").waitFor();
    assert.equal(
      await page.locator("app-terrain-preview [role=alert]").count(),
      0,
    );
    assert.deepEqual(errors, []);
    const evidence = {
      pass: true,
      browser: browser.version(),
      matrix,
      reservedBefore,
      reservedAfter,
      maxUiInstances: 16384,
      offlineNewSeed: true,
      pageErrors: errors,
    };
    await fs.writeFile(
      artifact("landscape-verification.json"),
      JSON.stringify(evidence, null, 2),
    );
    console.log(JSON.stringify(evidence));
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
