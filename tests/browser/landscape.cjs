const {
  waitForGeneration,
  fillParameters,
  artifactPath,
} = require("./support/editor.cjs");
// Full v11 WASM/API fields, trees and rocks, maximum work, visible landscapes, instancing and offline 3D.
const {
  base,
  launchBrowser,
  waitForOfflineReady,
} = require("./support/browser.cjs");
const assert = require("node:assert/strict"),
  fs = require("node:fs/promises");
(async () => {
  const browser = await launchBrowser();
  try {
    const context = await browser.newContext({
        serviceWorkers: "allow",
        viewport: { width: 1600, height: 1050 },
      }),
      page = await context.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    const ready = () => waitForOfflineReady(page);
    const complete = () => waitForGeneration(page, 120000);
    await page.goto(base);
    await ready();
    const reservedBefore = await page
      .workers()[0]
      .evaluate(() => getDotnetRuntime(0).Module.HEAPU8.buffer.byteLength);
    const matrix = await page.evaluate(async () => {
      const host = await import("/wasm/world-generator-host.js"),
        runtime = await host.getWorldGenerator();
      const rows = [];
      for (const [
        w,
        h,
        steps,
        seed,
        height,
        p,
        m,
        moisture,
        sea,
        warmth,
        regionScale,
      ] of [
        [2, 2, 0, 2147483647, 0, 0.45, 0.3, 0.65, 0.16, 0.6, 1],
        [3, 2, 2, -2147483648, 30, 0.45, 0.3, 0.65, 0.16, 0.35, 2],
        [129, 129, 32, 42, 30, 0.45, 0.3, 0.65, 0.16, 0.6, 1],
        [128, 128, 16, 2026, 30, 0.35, 0.4, 0.8, 0.16, 0.25, 1],
        [128, 128, 16, 2026, 30, 0.45, 0.3, 0.8, 0.16, 0.38, 1],
        [128, 128, 0, -7, 30, 0.45, 0.3, 0.45, 0, 0.9, 0.5],
        [512, 512, 128, -7, 80, 1, 0, 1, 0, 0.6, 4],
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
          globalWarmth: warmth,
          vegetationDensity: 1,
          landformRegionScale: regionScale,
          algorithmVersion: "diverse-landscape-v13",
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
        let text, local, parseMs, coverageCopyMs;
        try {
          text = await runtime.generateTerrainJson(JSON.stringify(request));
          const parseStarted = performance.now();
          local = JSON.parse(text);
          parseMs = performance.now() - parseStarted;
          const copyStarted = performance.now();
          const copied = new Float32Array(local.result.surfaceWeights);
          coverageCopyMs = performance.now() - copyStarted;
          if (copied.length !== w * h * 5) throw Error("Coverage copy length");
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
            result.workload !== "landscape-ecology-hydraulic-v14" ||
            result.executionProfile !== "landscape-worker-json-v14" ||
            result.result.resultVersion !== "landscape-ecology-v14" ||
            result.simulationVersion !== "hydraulic-grid-v1" ||
            result.result.algorithmVersion !== request.algorithmVersion
          )
            throw Error("Version mismatch");
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
          const coverage = result.result.surfaceWeights;
          if (!Array.isArray(coverage) || coverage.length !== w * h * 5)
            throw Error("Coverage shape");
          for (let i = 0; i < w * h; i++) {
            let sum = 0;
            for (let j = 0; j < 5; j++) {
              const value = coverage[i * 5 + j];
              if (
                !Number.isFinite(value) ||
                value < 0 ||
                value > 1 ||
                (result.result.biomes[i] === 0 && value !== 0)
              )
                throw Error("Coverage range/category");
              sum += Math.fround(value);
            }
            if (Math.abs(sum - (result.result.biomes[i] === 0 ? 0 : 1)) > 1e-6)
              throw Error("Coverage sum");
          }
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
        for (let i = 0; i < local.result.surfaceWeights.length; i++)
          check(
            Math.fround(local.result.surfaceWeights[i]),
            Math.fround(remote.result.surfaceWeights[i]),
          );
        const counts = Array(9).fill(0),
          treeKinds = Array(3).fill(0),
          variants = Array(2).fill(0),
          kindVariants = Array(6).fill(0);
        for (let i = 0; i < w * h; i++) {
          const id = local.result.biomes[i];
          if (
            !Number.isInteger(id) ||
            id < 0 ||
            id > 8 ||
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
          if (
            a.kind !== b.kind ||
            a.variant !== b.variant ||
            !Number.isInteger(a.variant) ||
            a.variant < 0 ||
            a.variant > 1 ||
            !Number.isInteger(a.kind) ||
            a.kind < 0 ||
            a.kind > 2 ||
            a.cellIndex !== b.cellIndex ||
            a.cellIndex <= previous
          )
            throw Error("Tree index");
          previous = a.cellIndex;
          treeKinds[a.kind]++;
          variants[a.variant]++;
          kindVariants[a.kind * 2 + a.variant]++;
          for (const key of ["x", "y", "z", "scale", "rotation"])
            check(Math.fround(a[key]), Math.fround(b[key]));
        }
        if (
          !Array.isArray(local.result.rocks) ||
          local.result.rocks.length > 8192 ||
          local.result.rocks.length !== remote.result.rocks.length
        )
          throw Error("Rock budget/count");
        const rockKindVariants = Array(6).fill(0);
        previous = -1;
        for (let i = 0; i < local.result.rocks.length; i++) {
          const a = local.result.rocks[i],
            b = remote.result.rocks[i];
          if (
            Object.keys(a).length !== 11 ||
            a.cellIndex !== b.cellIndex ||
            a.cellIndex <= previous ||
            a.kind !== b.kind ||
            a.variant !== b.variant ||
            ![0, 1, 2].includes(a.kind) ||
            ![0, 1].includes(a.variant)
          )
            throw Error("Rock identity");
          previous = a.cellIndex;
          rockKindVariants[a.kind * 2 + a.variant]++;
          for (const key of [
            "x",
            "y",
            "z",
            "scaleX",
            "scaleY",
            "scaleZ",
            "rotation",
            "groundY",
          ])
            check(Math.fround(a[key]), Math.fround(b[key]));
          const x = a.cellIndex % w,
            z = Math.floor(a.cellIndex / w);
          const px = Math.fround(a.x),
            pz = Math.fround(a.z),
            radius = Math.fround(a.scaleX);
          if (
            x >= w - 1 ||
            z >= h - 1 ||
            Math.floor(px) !== x ||
            Math.floor(pz) !== z ||
            px - radius < 0 ||
            px + radius > w - 1 ||
            pz - radius < 0 ||
            pz + radius > h - 1 ||
            radius > 3
          )
            throw Error("Rock footprint/map bounds");
          for (
            let cz = Math.floor(pz - radius);
            cz < Math.ceil(pz + radius);
            cz++
          )
            for (
              let cx = Math.floor(px - radius);
              cx < Math.ceil(px + radius);
              cx++
            )
              if (
                [
                  cz * w + cx,
                  cz * w + cx + 1,
                  (cz + 1) * w + cx,
                  (cz + 1) * w + cx + 1,
                ].some((j) => local.result.biomes[j] === 0)
              )
                throw Error("Ocean inside multi-cell rock support");
        }
        for (const key of Object.keys(local.simulation))
          check(local.simulation[key], remote.simulation[key]);
        const coverageStart =
          text.indexOf('"surfaceWeights":') + '"surfaceWeights":'.length;
        const coverageEnd = text.indexOf("]", coverageStart) + 1;
        rows.push({
          request,
          biomeCounts: counts,
          treeKindCounts: treeKinds,
          variantCounts: variants,
          kindVariantCounts: kindVariants,
          trees: local.result.trees.length,
          rocks: local.result.rocks.length,
          rockKindVariantCounts: rockKindVariants,
          rockMatrixBytes: local.result.rocks.length * 16 * 4,
          rockReserializedJsonBytes: new TextEncoder().encode(
            JSON.stringify(local.result.rocks),
          ).length,
          responseBytes: new TextEncoder().encode(text).length,
          coverageWireJsonBytes: new TextEncoder().encode(
            text.slice(coverageStart, coverageEnd),
          ).length,
          coverageReserializedJsonBytes: new TextEncoder().encode(
            JSON.stringify(local.result.surfaceWeights),
          ).length,
          coverageRawBytes: w * h * 5 * 4,
          coverageClientFloatBytes: w * h * 5 * 4,
          coverageGpuAttributeBytes: w * h * 5 * 4,
          parseMs,
          coverageCopyMs,
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
    for (const kind of [0, 1, 2])
      assert.ok(
        matrix.some((row) => row.treeKindCounts[kind] > 0),
        "Missing tree kind " + kind,
      );
    for (let kind = 0; kind < 3; kind++)
      for (let variant = 0; variant < 2; variant++)
        assert.ok(
          matrix.some((row) => row.kindVariantCounts[kind * 2 + variant] > 0),
          "Missing kind/variant " + kind + "/" + variant,
        );
    for (const id of [5, 6, 7, 8])
      assert.ok(
        matrix.some((row) => row.biomeCounts[id] > 0),
        "Missing biome " + id,
      );
    assert.equal(matrix.at(-1).trees, 16384);
    assert.equal(matrix[0].rocks, 0);
    for (let k = 0; k < 6; k++)
      assert.ok(
        matrix.some((row) => row.rockKindVariantCounts[k] > 0),
        "Missing rock kind/variant " + k,
      );
    const artifact = artifactPath;
    for (const [seed, moisture, sea, warmth] of [
      [42, 0.65, 0.16, 0.6],
      [2026, 0.8, 0.16, 0.25],
      [-7, 0.45, 0, 0.9],
    ]) {
      await page.locator("#seed").fill(String(seed));
      await page.locator("#globalMoisture").fill(String(moisture));
      await page.locator("#seaLevel").fill(String(sea));
      await page.locator("#globalWarmth").fill(String(warmth));
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
    await fillParameters(page, {
      width: 512,
      height: 512,
      iterations: 0,
      plainsCoverage: 1,
      mountainCoverage: 0,
      globalMoisture: 1,
      globalWarmth: 0.6,
      vegetationDensity: 1,
      seaLevel: 0,
    });
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
