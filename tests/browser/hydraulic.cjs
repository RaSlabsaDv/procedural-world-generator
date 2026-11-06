// Real production WASM/API parity, scalable workload, worker responsiveness and offline smoke.
const { chromium } = require(
  process.env.PWG_PLAYWRIGHT_MODULE || "playwright-core",
);
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
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
  const context = await browser.newContext({
    serviceWorkers: "allow",
    viewport: { width: 1440, height: 1100 },
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const ready = () =>
    page.locator("#offline-status.ready").waitFor({ timeout: 90000 });
  const complete = () =>
    page.waitForFunction(
      () => document.querySelector(".status").textContent === "Complete",
      null,
      { timeout: 120000 },
    );
  try {
    await page.goto(base);
    await ready();
    // Diagnostic for the pinned SDK: reserved WASM linear memory, not live managed heap or browser RSS.
    const wasmMemoryBefore = await page
      .workers()[0]
      .evaluate(
        () => globalThis.getDotnetRuntime(0).Module.HEAPU8.buffer.byteLength,
      );
    const measurements = await page.evaluate(async () => {
      const host = await import("/wasm/world-generator-host.js");
      const runtime = await host.getWorldGenerator();
      const cases = [
        [3, 2, 0, 42, 30],
        [3, 2, 2, 42, 30],
        [17, 9, 32, -2147483648, 0.7],
        [2, 2, 8, 2147483647, 0],
        [128, 128, 0, 7, 80],
        [128, 128, 32, 7, 80],
        [128, 128, 128, 7, 80],
        [256, 256, 128, 7, 80],
        [512, 512, 128, -7, 80],
      ];
      const records = [];
      for (const [width, height, iterations, seed, heightMultiplier] of cases) {
        const request = {
          heightMap: {
            width,
            height,
            seed,
            heightMultiplier,
            noiseScale: 0.08,
            octaves: 5,
            algorithmVersion: "value-noise-fbm-v1",
          },
          plainsCoverage: 0.45,
          mountainCoverage: 0.3,
          globalMoisture: 0.65,
          seaLevel: 0.16,
          mountainStrength: 0.55,
          warpStrength: 2,
          iterations,
          rainfall: 0.05,
          evaporation: 0.1,
          algorithmVersion: "diverse-landscape-v2",
        };
        let ticks = 0,
          lastTick = performance.now(),
          maxGap = 0;
        const timer = setInterval(() => {
          const now = performance.now();
          maxGap = Math.max(maxGap, now - lastTick);
          lastTick = now;
          ticks++;
        }, 20);
        const started = performance.now();
        let local;
        try {
          local = JSON.parse(
            await runtime.generateTerrainJson(JSON.stringify(request)),
          );
        } finally {
          clearInterval(timer);
        }
        const localRequestMs = performance.now() - started;
        const remote = await (
          await fetch("/api/v1/terrains", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(request),
          })
        ).json();
        if (
          local.workload !== "landscape-ecology-hydraulic-v2" ||
          remote.workload !== local.workload ||
          local.coreBuildId !== remote.coreBuildId ||
          local.simulationVersion !== "hydraulic-grid-v1" ||
          remote.simulationVersion !== local.simulationVersion ||
          local.result.algorithmVersion !== request.algorithmVersion ||
          remote.result.algorithmVersion !== request.algorithmVersion ||
          local.result.values.length !== width * height ||
          remote.result.values.length !== width * height ||
          local.result.biomes.length !== width * height ||
          remote.result.biomes.length !== width * height
        )
          throw new Error(
            "Terrain metadata mismatch: " + JSON.stringify(local),
          );
        let maxError = 0;
        for (let i = 0; i < width * height; i++) {
          const a = Math.fround(local.result.values[i]),
            b = Math.fround(remote.result.values[i]);
          const difference = Math.abs(a - b);
          maxError = Math.max(maxError, difference);
          if (
            !Number.isFinite(a) ||
            !Number.isFinite(b) ||
            a < 0 ||
            a > Math.fround(heightMultiplier) ||
            difference > 1e-6 + 1e-5 * Math.max(Math.abs(a), Math.abs(b)) ||
            local.result.biomes[i] !== remote.result.biomes[i]
          )
            throw new Error("Terrain cell mismatch " + i);
          if (
            heightMultiplier === 0 &&
            (a !== 0 || local.result.biomes[i] !== 0)
          )
            throw new Error("Zero-height mismatch");
        }
        for (const response of [local, remote]) {
          const s = response.simulation;
          if (
            s.cellIterations !== width * height * iterations ||
            s.iterations !== iterations ||
            Math.abs(
              s.initialTerrainMass - s.finalTerrainMass - s.suspendedSediment,
            ) >
              1e-9 * Math.max(1, s.initialTerrainMass) ||
            Math.abs(s.waterAdded - s.waterRemaining - s.waterEvaporated) >
              1e-9 * Math.max(1, s.waterAdded)
          )
            throw new Error("Conservation failure");
        }
        records.push({
          width,
          height,
          iterations,
          seed,
          heightMultiplier,
          cellIterations: local.simulation.cellIterations,
          localComputeMs: local.computeMs,
          remoteComputeMs: remote.computeMs,
          localRequestMs,
          maxError,
          biomesMatch: true,
          heartbeatTicks: ticks,
          maxHeartbeatGapMs: maxGap,
        });
      }
      if (
        host.getRuntimeInfo().initCount !== 1 ||
        host.getRuntimeInfo().execution !== "worker"
      )
        throw new Error("Runtime ownership failure");
      return records;
    });
    const wasmMemoryAfter = await page
      .workers()[0]
      .evaluate(
        () => globalThis.getDotnetRuntime(0).Module.HEAPU8.buffer.byteLength,
      );
    console.log(
      JSON.stringify({ measurements, wasmMemoryBefore, wasmMemoryAfter }),
    );
    const heavy = measurements.at(-1);
    assert.ok(
      heavy.heartbeatTicks > 5,
      "The UI event loop must run while C# is computing",
    );
    await page.locator("#width").fill("128");
    await page.locator("#height").fill("128");
    await page.locator("#verify-equivalence").click();
    await complete();
    assert.match(
      await page.locator("#biome-match").innerText(),
      /All biome IDs match exactly/,
    );
    await page.locator("#compare-views").click();
    await page.locator("app-terrain-preview .display-time").nth(1).waitFor();
    assert.equal(
      await page.locator('app-terrain-preview [role="alert"]').count(),
      0,
    );
    await page.screenshot({
      path: path.resolve(__dirname, "../../artifacts/hydraulic-preview.png"),
      fullPage: true,
    });
    // A fresh document must create the worker and run the new workload from cache.
    await context.setOffline(true);
    await page.reload({ waitUntil: "domcontentloaded" });
    await ready();
    await page.locator("#seed").fill("-987");
    await page.locator("#generate-local").click();
    await complete();
    assert.match(
      await page.locator(".simulation-snapshot").innerText(),
      /Iterations 64/,
    );
    await page.locator("app-terrain-preview .display-time").first().waitFor();
    await page.locator("#generate-remote").click();
    await page.locator('[role="alert"]').first().waitFor();
    assert.match(
      await page.locator('[role="alert"]').first().innerText(),
      /unavailable/i,
    );
    assert.deepEqual(errors, []);
    const result = {
      pass: true,
      browser: browser.version(),
      measurements,
      wasmMemoryBefore,
      wasmMemoryAfter,
      workerResponsive: true,
      offlineHydraulic: true,
      offline3d: true,
      remoteUnavailableOffline: true,
      pageErrors: errors,
    };
    await fs.writeFile(
      path.resolve(__dirname, "../../artifacts/hydraulic-verification.json"),
      JSON.stringify(result, null, 2),
    );
    console.log(JSON.stringify(result));
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
