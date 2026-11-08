const { waitForGeneration, fillParameters } = require("./support/editor.cjs");
// Fixed coastline views, actual-host coverage parity and dry-depression protection.
const {
  base,
  launchBrowser,
  waitForOfflineReady,
} = require("./support/browser.cjs");
const assert = require("node:assert/strict"),
  fs = require("node:fs/promises"),
  path = require("node:path"),
  crypto = require("node:crypto");
(async () => {
  const v2 = process.argv.includes("--v2");
  const baseline =
      process.argv.includes("--baseline") ||
      (v2 && process.argv.includes("--before")),
    prefix = baseline ? "before" : "after";
  const study = v2 ? "coastal-v2" : "coasts";
  const algorithmVersion =
    v2 && baseline
      ? "diverse-landscape-v8"
      : baseline
        ? "diverse-landscape-v6"
        : "diverse-landscape-v9";
  const browser = await launchBrowser();
  try {
    const context = await browser.newContext({
        viewport: { width: 1600, height: 1050 },
      }),
      page = await context.newPage(),
      errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text());
    });
    await page.goto(base);
    await waitForOfflineReady(page);
    const captures = [];
    for (const [label, seed, p, m, sea, warmth, moisture] of [
      ["gentle", 42, 1, 0, 0.16, 0.6, 0.65],
      ["mountain-no-ocean", 42, 0, 1, 0.3, 0.6, 0.65],
      ["warm", -7, 0.45, 0.3, 0.23, 0.9, 0.45],
      ["cold", 2026, 0.45, 0.3, 0.3, 0.25, 0.8],
      ["no-ocean", 42, 0.45, 0.3, 0, 0.6, 0.65],
      ["inland", -7, 0.45, 0.3, 0.23, 0.6, 0.65],
      ...(v2
        ? [
            ["rolling", 2026, 0.45, 0.3, 0.16, 0.6, 0.65],
            ["wet", 42, 1, 0, 0.16, 0.6, 0.95],
          ]
        : []),
    ]) {
      await page.locator("#reset-parameters").click();
      await fillParameters(page, {
        width: 129,
        height: 97,
        iterations: 16,
        seed,
        plainsCoverage: p,
        mountainCoverage: m,
        seaLevel: sea,
        globalWarmth: warmth,
        globalMoisture: moisture,
      });
      await page.locator("#verify-equivalence").click();
      await waitForGeneration(page, 120000);
      await page.locator("app-terrain-preview .display-time").first().waitFor();
      assert.match(
        await page.locator("#numeric-match").innerText(),
        /All heights match/,
      );
      assert.ok(
        (await page.locator(".measurement").first().textContent()).includes(
          algorithmVersion,
        ),
      );
      assert.equal(
        await page.locator("app-terrain-preview [role=alert]").count(),
        0,
      );
      const params = await page
        .locator("app-terrain-parameters input[type=number]")
        .evaluateAll((inputs) =>
          Object.fromEntries(inputs.map((i) => [i.id, Number(i.value)])),
        );
      const diagnostic = await page.evaluate(
        async ({ params, algorithmVersion }) => {
          const heightMap = { algorithmVersion: "value-noise-fbm-v1" };
          params = { ...params };
          for (const k of [
            "seed",
            "width",
            "height",
            "noiseScale",
            "octaves",
            "heightMultiplier",
          ]) {
            heightMap[k] = params[k];
            delete params[k];
          }
          const request = { ...params, heightMap, algorithmVersion };
          const response = await fetch("/api/v1/terrains", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(request),
          });
          if (!response.ok) throw Error("Coastal diagnostic API failed");
          const text = await response.text(),
            remote = JSON.parse(text);
          const host = await import("/wasm/world-generator-host.js"),
            runtime = await host.getWorldGenerator();
          const local = JSON.parse(
            await runtime.generateTerrainJson(JSON.stringify(request)),
          );
          const r = remote.result;
          let maxError = 0,
            sandy = 0,
            dryInterior = 0,
            maxSand = 0;
          for (let i = 0; i < r.surfaceWeights.length; i++) {
            const a = Math.fround(r.surfaceWeights[i]),
              b = Math.fround(local.result.surfaceWeights[i]),
              d = Math.abs(a - b);
            maxError = Math.max(maxError, d);
            if (d > 1e-6 + 1e-5 * Math.max(Math.abs(a), Math.abs(b)))
              throw Error("Coastal coverage parity");
          }
          let shoreline = 0,
            steepShore = 0,
            rockyShore = 0;
          for (let i = 0; i < r.values.length; i++) {
            const x = i % r.width,
              z = Math.floor(i / r.width);
            const neighbors = [
              x > 0 ? i - 1 : -1,
              x < r.width - 1 ? i + 1 : -1,
              z > 0 ? i - r.width : -1,
              z < r.height - 1 ? i + r.width : -1,
            ];
            if (
              r.biomes[i] !== 0 &&
              neighbors.some((j) => j >= 0 && r.biomes[j] === 0)
            ) {
              shoreline++;
              if (r.slope[i] >= 0.9) steepShore++;
              if (r.surfaceWeights[i * 5 + 3] >= 0.8) rockyShore++;
            }
            const sand = r.surfaceWeights[i * 5 + 2];
            if (sand > 0) sandy++;
            maxSand = Math.max(maxSand, sand);
            if (
              r.biomes[i] !== 0 &&
              Math.fround(r.values[i]) <=
                request.seaLevel * Math.fround(heightMap.heightMultiplier)
            ) {
              dryInterior++;
              if (sand !== 0) throw Error("Beach in dry inland depression");
            }
          }
          // Independent full Manhattan distances for vertex statistics, not product logic.
          const distances = new Int32Array(r.values.length).fill(-1);
          const queue = [];
          r.biomes.forEach((b, i) => {
            if (b === 0) {
              distances[i] = 0;
              queue.push(i);
            }
          });
          for (let head = 0; head < queue.length; head++) {
            const i = queue[head],
              x = i % r.width,
              y = Math.floor(i / r.width);
            for (const j of [
              x > 0 ? i - 1 : -1,
              x < r.width - 1 ? i + 1 : -1,
              y > 0 ? i - r.width : -1,
              y < r.height - 1 ? i + r.width : -1,
            ])
              if (j >= 0 && distances[j] < 0) {
                distances[j] = distances[i] + 1;
                queue.push(j);
              }
          }
          const sandBands = {};
          let strongSand = 0,
            maxStrongSandDistance = 0;
          for (let i = 0; i < r.values.length; i++)
            if (r.surfaceWeights[i * 5 + 2] >= 0.2) {
              strongSand++;
              maxStrongSandDistance = Math.max(
                maxStrongSandDistance,
                distances[i],
              );
              sandBands[distances[i]] = (sandBands[distances[i]] || 0) + 1;
            }
          const invariant = Object.fromEntries(
            Object.entries(r).filter(
              ([k]) =>
                ![
                  "surfaceWeights",
                  "algorithmVersion",
                  "resultVersion",
                ].includes(k),
            ),
          );
          return {
            invariant: {
              result: invariant,
              snow: r.surfaceWeights.filter((_, i) => i % 5 === 4),
              simulation: remote.simulation,
            },
            strongSand,
            maxStrongSandDistance,
            sandBands,
            request,
            shoreline,
            steepShore,
            rockyShore,
            sandy,
            maxSand,
            dryInterior,
            maxError,
            responseBytes: new TextEncoder().encode(text).length,
            coverageWireJsonBytes: new TextEncoder().encode(
              text.slice(
                text.indexOf('"surfaceWeights":') + '"surfaceWeights":'.length,
                text.indexOf("]", text.indexOf('"surfaceWeights":')) + 1,
              ),
            ).length,
          };
        },
        { params, algorithmVersion },
      );
      if (!baseline && label === "gentle") {
        assert.ok(diagnostic.sandy > 0);
        assert.ok(diagnostic.maxSand > 0.4);
      }
      if (label === "no-ocean") assert.equal(diagnostic.sandy, 0);
      if (label === "inland") assert.ok(diagnostic.dryInterior > 0);
      if (label === "mountain-no-ocean") assert.equal(diagnostic.shoreline, 0);
      if (label === "warm" || label === "cold") {
        assert.ok(diagnostic.steepShore > 0);
        assert.ok(diagnostic.rockyShore > 0);
      }
      const canvas = page.locator("app-terrain-preview canvas").first();
      const views = [];
      await page
        .getByRole("button", { name: "Reset camera", exact: true })
        .click();
      for (const [view, wheel] of v2
        ? [
            ["overview", 0],
            ["close", -650],
            ["detail", -700],
          ]
        : [
            ["overview", 0],
            ["close", -1350],
          ]) {
        if (wheel) {
          await canvas.hover();
          await page.mouse.wheel(0, wheel);
          await page.waitForTimeout(250);
        }
        if (v2) {
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
          assert.ok(camera.projection && camera.modelView);
          views.push({ view, wheel, camera });
        }
        await canvas.screenshot({
          path: path.resolve(
            __dirname,
            `../../artifacts/${study}-${prefix}-${label}-${view}.png`,
          ),
        });
      }
      const { invariant, ...stats } = diagnostic;
      captures.push({
        label,
        ...stats,
        views,
        invariantHash: crypto
          .createHash("sha256")
          .update(JSON.stringify(invariant))
          .digest("hex"),
      });
      await page
        .getByRole("button", { name: "Reset camera", exact: true })
        .click();
    }
    assert.deepEqual(errors, []);
    if (v2 && !baseline) {
      const before = JSON.parse(
        await fs.readFile(
          path.resolve(
            __dirname,
            "../../artifacts/coastal-v2-before-verification.json",
          ),
          "utf8",
        ),
      );
      const project = (rows) =>
        rows.map(({ label, request, views, invariantHash }) => ({
          label,
          request: { ...request, algorithmVersion: "coastal-comparison" },
          views,
          invariantHash,
        }));
      assert.deepEqual(
        project(captures),
        project(before.captures),
        "Camera, requests, all non-coverage fields and snow must stay exact",
      );
      const oldGentle = before.captures.find((r) => r.label === "gentle"),
        gentle = captures.find((r) => r.label === "gentle");
      assert.ok(
        gentle.strongSand > oldGentle.strongSand,
        "More readable sand on gentle land",
      );
      assert.ok(
        gentle.maxStrongSandDistance > oldGentle.maxStrongSandDistance,
        "Gentle beach extends further inland",
      );
    }
    const evidence = {
      pass: true,
      baseline,
      browser: browser.version(),
      captures,
      pageErrors: errors,
    };
    await fs.writeFile(
      path.resolve(
        __dirname,
        `../../artifacts/${study}-${prefix}-verification.json`,
      ),
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
