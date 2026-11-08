// Identical requests, reset camera and zoom recipe before/after asset-only changes.
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const crypto = require("node:crypto");
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
const before = process.argv.includes("--before");
const phase = before ? "before" : "after";
const cases = [
  ["mixed", { seed: 42 }],
  ["plains", { seed: 42, plainsCoverage: 1, mountainCoverage: 0 }],
  [
    "mountains",
    { seed: 42, plainsCoverage: 0, mountainCoverage: 1, seaLevel: 0.3 },
  ],
  [
    "warm-coast",
    { seed: -7, globalWarmth: 0.9, globalMoisture: 0.45, seaLevel: 0.23 },
  ],
  [
    "cold-snow",
    {
      seed: 2026,
      globalWarmth: 0.12,
      globalMoisture: 0.8,
      heightMultiplier: 60,
      seaLevel: 0.3,
    },
  ],
  [
    "gentle-coast",
    { seed: 42, plainsCoverage: 1, mountainCoverage: 0, seaLevel: 0.16 },
  ],
];
(async () => {
  const browser = await launchBrowser();
  try {
    const context = await browser.newContext({
      viewport: { width: 1600, height: 1050 },
      deviceScaleFactor: 1,
    });
    const page = await context.newPage(),
      errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(base);
    await waitForOfflineReady(page);
    const captures = [];
    for (const [label, values] of cases) {
      await page.locator("#reset-parameters").click();
      await fillParameters(page, {
        width: 129,
        height: 97,
        iterations: 16,
        ...values,
      });
      const params = await page
        .locator("app-terrain-parameters input[type=number]")
        .evaluateAll((inputs) =>
          Object.fromEntries(inputs.map((i) => [i.id, Number(i.value)])),
        );
      const heightMap = { algorithmVersion: "value-noise-fbm-v1" };
      for (const field of [
        "seed",
        "width",
        "height",
        "noiseScale",
        "octaves",
        "heightMultiplier",
      ]) {
        heightMap[field] = params[field];
        delete params[field];
      }
      const request = {
        ...params,
        heightMap,
        algorithmVersion: "diverse-landscape-v7",
      };
      await page.locator("#generate-local").click();
      await waitForTerrain(page);
      await page.locator("app-terrain-preview button").click();
      const canvas = page.locator("app-terrain-preview canvas");
      const views = [];
      for (const [view, wheel] of [
        ["overview", 0],
        ["close", -650],
        ["detail", -700],
      ]) {
        if (wheel) {
          const box = await canvas.boundingBox();
          await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
          await page.mouse.wheel(0, wheel);
        }
        await page.waitForTimeout(120);
        const camera = await canvas.evaluate((canvas) => {
          const gl = canvas.getContext("webgl2"),
            program = gl.getParameter(gl.CURRENT_PROGRAM);
          const read = (name) => {
            const location = gl.getUniformLocation(program, name);
            return location
              ? Array.from(gl.getUniform(program, location))
              : null;
          };
          return {
            width: canvas.width,
            height: canvas.height,
            projection: read("projectionMatrix"),
            modelView: read("modelViewMatrix"),
          };
        });
        assert.ok(
          camera.projection && camera.modelView,
          "Capture actual camera framing",
        );
        await canvas.screenshot({
          path: artifactPath(`atlas-materials-${phase}-${label}-${view}.png`),
        });
        views.push({ view, wheel, camera });
      }
      const data = await page.evaluate(async (request) => {
        const response = await fetch("/api/v1/terrains", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(request),
        });
        if (!response.ok) throw Error("Material reference request failed");
        const body = await response.json();
        return { result: body.result, simulation: body.simulation };
      }, request);
      captures.push({
        label,
        request,
        views,
        resultHash: crypto
          .createHash("sha256")
          .update(JSON.stringify(data))
          .digest("hex"),
      });
    }
    assert.deepEqual(errors, []);
    if (!before) {
      const baseline = JSON.parse(
        await fs.readFile(artifactPath("atlas-materials-before.json"), "utf8"),
      );
      assert.deepEqual(
        captures,
        baseline.captures,
        "Requests, camera matrices, dimensions and all mathematical results must remain identical",
      );
    }
    await fs.writeFile(
      artifactPath(`atlas-materials-${phase}.json`),
      JSON.stringify({ phase, captures, pageErrors: errors }, null, 2),
    );
    console.log(
      JSON.stringify({
        pass: true,
        phase,
        cases: captures.length,
        views: captures.length * 3,
        cameraAndMathPreserved: !before,
        pageErrors: errors,
      }),
    );
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
