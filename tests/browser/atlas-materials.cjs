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
const lodStudy = process.argv.includes("--lod");
const foliageStudy = process.argv.includes("--foliage") || lodStudy;
const grassStudy = process.argv.includes("--grass");
const microStudy = process.argv.includes("--micro") || grassStudy;
const sunStudy = process.argv.includes("--sun");
const reference = process.argv.includes("--reference");
const atmosphereStudy = process.argv.includes("--atmosphere");
const waterStudy = process.argv.includes("--water");
const environmentStudy = process.argv.includes("--environment");
const rockStudy = process.argv.includes("--rocks");
const climateStudy = process.argv.includes("--climate");
const biomeStudy = process.argv.includes("--biomes") || climateStudy;
const defaultStudy = grassStudy
  ? "grass-presentation"
  : microStudy
    ? "terrain-microdetail"
    : sunStudy
      ? "sun-controls"
      : atmosphereStudy
        ? reference
          ? "atmosphere-reference"
          : "atmosphere"
        : waterStudy
          ? "ocean-presentation"
          : environmentStudy
            ? "scene-environment"
            : rockStudy
              ? "rocks-v2"
              : climateStudy
                ? "regional-climate"
                : biomeStudy
                  ? "biome-readability"
                  : "atlas-materials";
const study = lodStudy
  ? "tree-lod"
  : foliageStudy
    ? "foliage-variation"
    : defaultStudy;
const foliageCases = [
  ["broadleaf", { seed: 42, globalMoisture: 1 }],
  ["conifer", { seed: 2026, globalWarmth: 0.38, globalMoisture: 0.8 }],
  [
    "savanna",
    { seed: -7, globalWarmth: 0.9, globalMoisture: 0.45, seaLevel: 0.23 },
  ],
  ["mixed", { seed: 42, globalWarmth: 0.7 }],
  ["sparse", { seed: 42, vegetationDensity: 0.1 }],
  [
    "maximum",
    {
      width: 512,
      height: 512,
      iterations: 0,
      heightMultiplier: 60,
      plainsCoverage: 1,
      mountainCoverage: 0,
      globalMoisture: 1,
      seaLevel: 0,
    },
  ],
];
const cases = microStudy
  ? [
      [
        "grass",
        {
          seed: 42,
          plainsCoverage: 1,
          mountainCoverage: 0,
          seaLevel: 0,
          globalMoisture: grassStudy ? 0.85 : 0.4,
          ...(grassStudy ? { vegetationDensity: 0 } : {}),
        },
      ],
      ["forest", { seed: 42, globalMoisture: 1 }],
      [
        "soil",
        {
          seed: -7,
          globalMoisture: 0,
          globalWarmth: 0.9,
          plainsCoverage: 1,
          mountainCoverage: 0,
          seaLevel: 0,
        },
      ],
      ["coast", { seed: -7, globalWarmth: 0.9, seaLevel: 0.23 }],
      [
        "rock",
        {
          seed: 42,
          plainsCoverage: 0,
          mountainCoverage: 1,
          heightMultiplier: 80,
        },
      ],
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
      ["mixed", { seed: 42, globalWarmth: 0.35, heightMultiplier: 60 }],
      [
        "maximum",
        {
          width: 512,
          height: 512,
          iterations: 0,
          heightMultiplier: 60,
          plainsCoverage: 1,
          mountainCoverage: 0,
          globalMoisture: 1,
          seaLevel: 0,
        },
      ],
    ]
  : rockStudy
    ? [
        ["mixed", { seed: 42 }],
        ["plains", { seed: 42, plainsCoverage: 1, mountainCoverage: 0 }],
        ["hills", { seed: 2026, globalWarmth: 0.6 }],
        [
          "mountains",
          { seed: 42, plainsCoverage: 0, mountainCoverage: 1, seaLevel: 0.3 },
        ],
        ["forest", { seed: 42, globalMoisture: 1 }],
        ["cold", { seed: 2026, globalWarmth: 0.38, globalMoisture: 0.8 }],
        [
          "warm-coast",
          { seed: -7, globalWarmth: 0.9, globalMoisture: 0.45, seaLevel: 0.23 },
        ],
        ["all-species", { seed: 42, globalWarmth: 0.7 }],
      ]
    : biomeStudy
      ? [
          ["mixed", { seed: 42 }],
          ["conifer", { seed: 2026, globalWarmth: 0.38, globalMoisture: 0.8 }],
          [
            "savanna-dry",
            {
              seed: -7,
              globalWarmth: 0.9,
              globalMoisture: 0.45,
              seaLevel: 0.23,
            },
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
            {
              seed: 42,
              plainsCoverage: 1,
              mountainCoverage: 0,
              seaLevel: 0.16,
            },
          ],
          [
            "steep-coast",
            {
              seed: -7,
              globalWarmth: 0.6,
              globalMoisture: 0.65,
              seaLevel: 0.23,
            },
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
            {
              seed: -7,
              globalWarmth: 0.9,
              globalMoisture: 0.45,
              seaLevel: 0.23,
            },
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
            {
              seed: 42,
              plainsCoverage: 1,
              mountainCoverage: 0,
              seaLevel: 0.16,
            },
          ],
        ];
(async () => {
  const browser = await launchBrowser();
  try {
    const context = await browser.newContext({
      viewport: { width: 1600, height: 1050 },
      deviceScaleFactor: 1,
      reducedMotion:
        waterStudy || atmosphereStudy || sunStudy || microStudy || foliageStudy
          ? "reduce"
          : "no-preference",
    });
    const page = await context.newPage(),
      errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(base);
    await waitForOfflineReady(page);
    if (reference) {
      await page.locator("#atmosphere-settings summary").click();
      await page.locator("#atmosphere-enabled").uncheck();
    }
    const captures = [],
      diagnostics = [];
    for (const [label, values] of foliageStudy ? foliageCases : cases) {
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
        algorithmVersion: rockStudy
          ? before
            ? "diverse-landscape-v9"
            : "diverse-landscape-v10"
          : climateStudy && before
            ? "diverse-landscape-v7"
            : "diverse-landscape-v10",
      };
      await page
        .locator(
          (foliageStudy ||
            climateStudy ||
            rockStudy ||
            waterStudy ||
            atmosphereStudy ||
            sunStudy) &&
            !before
            ? "#verify-equivalence"
            : "#generate-local",
        )
        .click();
      await waitForTerrain(page);
      if (
        (foliageStudy ||
          climateStudy ||
          rockStudy ||
          waterStudy ||
          atmosphereStudy ||
          sunStudy) &&
        !before
      )
        assert.match(
          await page.locator("#numeric-match").innerText(),
          /All heights match/,
        );
      await page.locator("app-terrain-preview button").click();
      const canvas = page.locator("app-terrain-preview canvas");
      const views = [];
      for (const [view, wheel] of [
        ["overview", 0],
        [
          "close",
          microStudy || foliageStudy
            ? label === "maximum"
              ? -6000
              : label === "rock"
                ? -3200
                : -4400
            : -650,
        ],
        ["detail", microStudy || foliageStudy ? 0 : -700],
      ]) {
        if (wheel) {
          const box = await canvas.boundingBox();
          await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
          await page.mouse.wheel(0, wheel);
        }
        if ((microStudy || foliageStudy) && view === "detail") {
          const box = await canvas.boundingBox();
          await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
          await page.mouse.down();
          await page.mouse.move(
            box.x + box.width / 2,
            box.y + box.height / 2 - box.height * 0.035,
            { steps: 8 },
          );
          await page.mouse.up();
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
        const screenshot = await canvas.screenshot({
          path: artifactPath(`${study}-${phase}-${label}-${view}.png`),
        });
        if ((reference || sunStudy) && !before) {
          assert.deepEqual(
            screenshot,
            await fs.readFile(
              artifactPath(`${study}-before-${label}-${view}.png`),
            ),
            "Frozen reference must retain the preceding presentation pixels",
          );
        }
        if (microStudy && !before && view === "overview") {
          assert.deepEqual(
            screenshot,
            await fs.readFile(
              artifactPath(`${study}-before-${label}-${view}.png`),
            ),
            "Fully faded microdetail must preserve overview pixels",
          );
        }
        views.push({
          view,
          wheel,
          camera,
          ...(environmentStudy
            ? {
                imageHash: crypto
                  .createHash("sha256")
                  .update(screenshot)
                  .digest("hex"),
              }
            : {}),
        });
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
      const invariantData = rockStudy
        ? {
            result: Object.fromEntries(
              Object.entries(data.result).filter(
                ([k]) =>
                  !["rocks", "algorithmVersion", "resultVersion"].includes(k),
              ),
            ),
            simulation: data.simulation,
          }
        : climateStudy
          ? {
              values: data.result.values,
              slope: data.result.slope,
              ocean: data.result.biomes.map((id) => id === 0),
              simulation: data.simulation,
            }
          : data;
      if (rockStudy) {
        const rocks = data.result.rocks;
        diagnostics.push({
          label,
          count: rocks.length,
          large: rocks.filter((r) => r.scaleX >= 1.8).length,
          maxRadius: Math.max(0, ...rocks.map((r) => r.scaleX)),
          groups: new Set(rocks.map((r) => r.kind + ":" + r.variant)).size,
          matrixBytes: rocks.length * 64,
        });
      }
      captures.push({
        label,
        request:
          climateStudy || rockStudy
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
      JSON.stringify(
        { phase, captures, diagnostics, pageErrors: errors },
        null,
        2,
      ),
    );
    console.log(
      JSON.stringify({
        pass: true,
        phase,
        study,
        cases: captures.length,
        views: captures.length * 3,
        cameraAndMathPreserved: !before,
        preservedFields: rockStudy
          ? "all except rocks and identities"
          : climateStudy
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
