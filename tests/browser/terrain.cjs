// Optional production smoke check; Playwright Core and Chromium are supplied externally.
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
    viewport: { width: 1440, height: 1000 },
    serviceWorkers: "allow",
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const ready = () =>
    page.locator("#offline-status.ready").waitFor({ timeout: 90000 });
  const complete = () =>
    page.waitForFunction(
      () => document.querySelector(".status").textContent === "Complete",
    );
  const display = () =>
    page
      .locator("app-terrain-preview .display-time")
      .first()
      .waitFor({ timeout: 30000 });
  try {
    await page.goto(base);
    await ready();
    // Compare full real WASM/API outputs, including bounds and exact IDs, before visualization.
    const fixtures = await page.evaluate(async () => {
      const host = await import("/wasm/world-generator-host.js");
      const runtime = await host.getWorldGenerator();
      const inputs = [
        { seed: 42, width: 3, height: 2, heightMultiplier: 30 },
        { seed: -2147483648, width: 17, height: 9, heightMultiplier: 0.7 },
        { seed: 2147483647, width: 2, height: 2, heightMultiplier: 0 },
        { seed: -7, width: 512, height: 512, heightMultiplier: 1000 },
      ];
      const results = [];
      for (const input of inputs) {
        const request = {
          ...input,
          noiseScale: 0.37,
          octaves: 3,
          algorithmVersion: "value-noise-fbm-v1",
        };
        const local = JSON.parse(
          runtime.generateHeightMapJson(JSON.stringify(request)),
        );
        const remote = await (
          await fetch("/api/v1/heightmaps", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(request),
          })
        ).json();
        if (
          local.workload !== "heightmap+biomes" ||
          remote.workload !== local.workload ||
          local.result.resultVersion !== "heightmap-biomes-v1" ||
          remote.result.resultVersion !== local.result.resultVersion ||
          remote.coreBuildId !== local.coreBuildId ||
          local.result.biomes.length !== input.width * input.height
        )
          throw new Error("Metadata mismatch");
        let maxError = 0;
        for (let i = 0; i < input.width * input.height; i++) {
          const a = local.result.values[i],
            b = remote.result.values[i];
          const error = Math.abs(a - b);
          if (
            !Number.isFinite(a) ||
            !Number.isFinite(b) ||
            a < 0 ||
            a > input.heightMultiplier ||
            error > 1e-6 + 1e-5 * Math.max(Math.abs(a), Math.abs(b)) ||
            local.result.biomes[i] !== remote.result.biomes[i] ||
            !Number.isInteger(local.result.biomes[i]) ||
            local.result.biomes[i] < 0 ||
            local.result.biomes[i] > 3
          )
            throw new Error("Cell mismatch at " + i);
          if (
            input.heightMultiplier === 0 &&
            (a !== 0 || local.result.biomes[i] !== 0)
          )
            throw new Error("Zero-height mismatch");
          maxError = Math.max(maxError, error);
        }
        results.push({ ...input, maxError, biomesMatch: true });
      }
      return results;
    });
    await page.locator("#verify-equivalence").click();
    await complete();
    assert.match(
      await page.locator("#biome-match").innerText(),
      /All biome IDs match exactly/,
    );
    await page.locator("#view-3d").click();
    await display();
    assert.equal(await page.locator("app-terrain-preview canvas").count(), 2);
    assert.equal(
      await page.locator('app-terrain-preview [role="alert"]').count(),
      0,
    );
    const canvas = page.locator("app-terrain-preview canvas").first();
    await canvas.scrollIntoViewIfNeeded();
    const box = await canvas.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(
      box.x + box.width / 2 + 60,
      box.y + box.height / 2 + 30,
      { steps: 5 },
    );
    await page.mouse.up();
    await page.mouse.wheel(0, -120);
    await page.screenshot({
      path: path.resolve(__dirname, "../../artifacts/terrain-preview.png"),
      fullPage: true,
    });
    // Exercise replacement and maximum mesh, then release contexts by switching views.
    for (const [seed, width, height, multiplier] of [
      [5, 512, 512, 30],
      [6, 3, 2, 0],
      [7, 128, 128, 30],
    ]) {
      for (const [id, value] of Object.entries({
        seed,
        width,
        height,
        heightMultiplier: multiplier,
      }))
        await page.locator("#" + id).fill(String(value));
      await page.locator("#generate-local").click();
      await complete();
      await display();
      assert.equal(
        await page.locator('app-terrain-preview [role="alert"]').count(),
        0,
      );
      await page.locator("#view-2d").click();
      await page.locator("#view-3d").click();
      await display();
    }
    // The deferred Three.js chunk must already be in the PWA's verified offline version.
    await context.setOffline(true);
    await page.reload({ waitUntil: "domcontentloaded" });
    await ready();
    await page.locator("#seed").fill("9876");
    await page.locator("#generate-local").click();
    await complete();
    await page.locator("#view-3d").click();
    await display();
    assert.equal(
      await page.locator('app-terrain-preview [role="alert"]').count(),
      0,
    );
    assert.deepEqual(errors, []);
    const result = {
      pass: true,
      browser: browser.version(),
      fixtures,
      orbitAndZoom: true,
      repeatedReplacement: true,
      maxMesh: true,
      zeroHeight: true,
      offline3d: true,
      pageErrors: errors,
    };
    await fs.writeFile(
      path.resolve(__dirname, "../../artifacts/terrain-verification.json"),
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
