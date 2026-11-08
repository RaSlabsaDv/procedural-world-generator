// Identical requests and actual camera framing before/after presentation changes.
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
const climateStudy = process.argv.includes("--climate");
const biomeStudy = process.argv.includes("--biomes") || climateStudy;
const study = climateStudy
  ? "regional-climate"
  : biomeStudy
    ? "biome-readability"
    : "atlas-materials";
const cases = biomeStudy
  ? [
      ["mixed", { seed: 42 }],
      ["conifer", { seed: 2026, globalWarmth: 0.38, globalMoisture: 0.8 }],
      [
        "savanna-dry",
        { seed: -7, globalWarmth: 0.9, globalMoisture: 0.45, seaLevel: 0.23 },
      ],
      ["tundra", { seed: 2026, globalWarmth: 0.18, globalMoisture: 0.65 }],
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
        "gentle-coast",
        { seed: 42, plainsCoverage: 1, mountainCoverage: 0, seaLevel: 0.16 },
      ],
      [
        "steep-coast",
        { seed: -7, globalWarmth: 0.6, globalMoisture: 0.65, seaLevel: 0.23 },
      ],
    ]
  : [
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
        algorithmVersion:
          climateStudy && before
            ? "diverse-landscape-v7"
            : "diverse-landscape-v9",
      };
      await page
        .locator(
          climateStudy && !before ? "#verify-equivalence" : "#generate-local",
        )
        .click();
      await waitForTerrain(page);
      if (climateStudy && !before)
        assert.match(
          await page.locator("#numeric-match").innerText(),
          /All heights match/,
        );
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
          path: artifactPath(`${study}-${phase}-${label}-${view}.png`),
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
      const invariantData = climateStudy
        ? {
            values: data.result.values,
            slope: data.result.slope,
            ocean: data.result.biomes.map((id) => id === 0),
            simulation: data.simulation,
          }
        : data;
      captures.push({
        label,
        request: climateStudy
          ? { ...request, algorithmVersion: "versioned-climate-comparison" }
          : request,
        views,
        resultHash: crypto
          .createHash("sha256")
          .update(JSON.stringify(invariantData))
          .digest("hex"),
      });
    }
    assert.deepEqual(errors, []);
    if (!before) {
      const baseline = JSON.parse(
        await fs.readFile(artifactPath(`${study}-before.json`), "utf8"),
      );
      assert.deepEqual(
        captures,
        baseline.captures,
        "Requests, camera matrices and the selected mathematical invariants must remain identical",
      );
    }
    await fs.writeFile(
      artifactPath(`${study}-${phase}.json`),
      JSON.stringify({ phase, captures, pageErrors: errors }, null, 2),
    );
    console.log(
      JSON.stringify({
        pass: true,
        phase,
        study,
        cases: captures.length,
        views: captures.length * 3,
        cameraAndMathPreserved: !before,
        preservedFields: climateStudy
          ? ["values", "slope", "ocean", "simulation"]
          : "all",
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
