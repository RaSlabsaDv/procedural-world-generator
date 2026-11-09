const assert = require("node:assert/strict"),
  path = require("node:path"),
  fs = require("node:fs/promises");
const { build } = require("../../src/client/node_modules/esbuild");
const { base, launchBrowser } = require("./support/browser.cjs");
const { artifactPath } = require("./support/editor.cjs");
const banks = process.argv.includes("--banks");
const stones = process.argv.includes("--stones");
const prefix = stones ? "shore-stones" : banks ? "banks" : "channels";
(async () => {
  const built = await build({
    entryPoints: [path.resolve(__dirname, "inland/entry.ts")],
    bundle: true,
    format: "esm",
    platform: "browser",
    write: false,
    nodePaths: [path.resolve(__dirname, "../../src/client/node_modules")],
    tsconfig: path.resolve(__dirname, "../../src/client/tsconfig.json"),
    external: ["/wasm/*"],
  });
  const browser = await launchBrowser();
  try {
    const context = await browser.newContext({
      viewport: { width: 1100, height: 850 },
      reducedMotion: "reduce",
    });
    await context.route("**/__inland_test__.js", (r) =>
      r.fulfill({
        contentType: "application/javascript",
        body: built.outputFiles[0].text,
      }),
    );
    await context.route("**/__inland_test__.html", (r) =>
      r.fulfill({
        contentType: "text/html",
        body: "<!doctype html><style>body{margin:0;background:#222}canvas{display:block}</style>",
      }),
    );
    const page = await context.newPage(),
      errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text());
    });
    await page.goto(base + "/__inland_test__.html");
    await page.evaluate(async () => {
      window.inland = await import("/__inland_test__.js");
    });
    if (banks) {
      const materialChecks = await page.evaluate(() =>
        window.inland.verifyBankMaterials(),
      );
      for (const row of materialChecks) {
        assert.deepEqual(row.dry, row.reset);
        assert.deepEqual(row.dark, [0, 0, 0]);
        if (row.channel === 4)
          assert.deepEqual(row.dry, row.damp); // full snow
        else
          assert.ok(
            row.damp.reduce((a, b) => a + b, 0) <
              row.dry.reduce((a, b) => a + b, 0),
          );
      }
      const linear = (value) => {
        const s = value / 255;
        return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      };
      const soil = materialChecks.find((r) => r.channel === 1),
        partialSnow = materialChecks.find((r) => r.channel === 5);
      for (let c = 0; c < 3; c++) {
        const soilDelta = linear(soil.dry[c]) - linear(soil.damp[c]);
        const partialDelta =
          linear(partialSnow.dry[c]) - linear(partialSnow.damp[c]);
        assert.ok(
          Math.abs(partialDelta - 0.5 * soilDelta) < 0.006,
          "partial snow contribution changed",
        );
      }
      await fs.writeFile(
        artifactPath("banks-material-browser.json"),
        JSON.stringify(materialChecks, null, 2),
      );
    }
    if (banks && process.argv.includes("--materials-only")) {
      assert.deepEqual(errors, []);
      console.log("Inland bank material checks passed.");
      return;
    }
    const rows = [];
    const baseline = await fs
      .readFile(artifactPath(`${prefix}-before-browser.json`), "utf8")
      .then(JSON.parse)
      .catch(() => []);
    for (const item of [
      { name: "mixed", fields: { seed: 42 } },
      { name: "no-ocean", fields: { seed: -7, seaLevel: 0 } },
      {
        name: "coast",
        fields: { seed: 2026, width: 65, height: 49, seaLevel: 0.23 },
      },
      {
        name: "maximum",
        fields: {
          seed: -7,
          width: 512,
          height: 512,
          iterations: 0,
          heightMultiplier: 80,
          seaLevel: 0,
        },
      },
    ]) {
      console.log("Rendering " + item.name);
      const data = await page.evaluate(async (fields) => {
        window.data = await window.inland.fetchTerrain(fields);
        window.view = await window.inland.createView(window.data, "view");
        return {
          hash: window.data.wireHash,
          localHash: window.data.localHash,
          lakes: window.data.result.lakes.basins.length,
          before: await window.view.digest(),
          channelSummary: window.data.result.channels.summary,
          channelStates: Array.from(
            window.data.result.channels.segmentState,
          ).reduce((a, s) => ((a[s] = (a[s] ?? 0) + 1), a), {}),
        };
      }, item.fields);
      assert.equal(data.hash, data.localHash);
      if (banks || stones) {
        const before = baseline.find((r) => r.name === item.name);
        if (before)
          assert.equal(data.hash, before.hash, "canonical result changed");
      }
      const row = { name: item.name, ...data, views: [] };
      for (const focus of item.name === "maximum"
        ? ["map", "lake"]
        : [
            "map",
            "lake",
            "river",
            "confluence",
            ...(stones ? ["stones"] : []),
          ]) {
        let result = await page.evaluate((focus) => {
          window.view.focus(focus);
          return window.view.draw();
        }, focus);
        const prior = baseline
          .find((r) => r.name === item.name)
          ?.views.find((v) => v.focus === focus);
        if (prior) {
          result = await page.evaluate((prior) => {
            window.view.pose(prior.camera, prior.target);
            return window.view.draw();
          }, prior);
        }
        let stonePixels;
        if (stones) {
          stonePixels = await page.evaluate(() => window.view.measureStones());
          assert.ok(stonePixels.stoneCalls <= 2);
          assert.ok(stonePixels.onCalls - stonePixels.offCalls <= 2);
          assert.equal(result.stoneShadowCasters, 0);
          assert.ok(result.shoreStones.count <= 4096);
          assert.ok(result.shoreStones.large <= 64);
          assert.equal(
            result.shoreStones.instanceBytes,
            result.shoreStones.count * 76,
          );
          assert.ok(result.shoreStones.geometryBytes <= 16384);
          await page.evaluate(() => {
            window.view.setStones(false);
            window.view.draw();
          });
          await page.locator("#view").screenshot({
            path: artifactPath(`shore-stones-off-${item.name}-${focus}.png`),
          });
          await page.evaluate(() => {
            window.view.setStones(true);
            window.view.draw();
          });
        }
        let bankPixels;
        if (banks) {
          bankPixels = await page.evaluate(() => window.view.measureBanks());
          assert.equal(bankPixels.outsideChanged, 0);
          assert.ok(bankPixels.farPixels > 100);
          assert.equal(bankPixels.offCalls, bankPixels.onCalls);
          assert.equal(bankPixels.bytes, 4 * bankPixels.vertices);
          await page.evaluate(() => {
            window.view.setWetness(false);
            window.view.draw();
          });
          await page.locator("#view").screenshot({
            path: artifactPath(`banks-off-${item.name}-${focus}.png`),
          });
          await page.evaluate(() => {
            window.view.setWetness(true);
            window.view.draw();
          });
        }
        const visiblePixels =
          focus === "lake" || focus === "river"
            ? await page.evaluate((kind) => window.view.measure(kind), focus)
            : undefined;
        row.views.push({
          focus,
          ...result,
          visiblePixels,
          bankPixels,
          stonePixels,
          pairedCamera: !!prior,
        });
        assert.ok(result.waterCalls <= 2);
        assert.equal(result.waterShadowCasters, 0);
        await page.locator("#view").screenshot({
          path: artifactPath(`${prefix}-after-${item.name}-${focus}.png`),
        });
      }
      if (stones && item.name === "mixed") {
        await page.evaluate(() => window.view.focus("stones"));
        const night = await page.evaluate(() =>
          window.view.measureStones({ hour: 0, mode: "reference" }),
        );
        const day = await page.evaluate(() =>
          window.view.measureStones({ hour: 12, mode: "reference" }),
        );
        assert.ok(night.difference < day.difference * 0.6);
        row.nightStones = night;
        row.dayStones = day;
      }
      if (item.name === "mixed") {
        for (const options of [
          { hour: 0, bloom: true },
          { hour: 12, mode: "reference" },
          { hour: 12, bloom: true },
        ]) {
          await page.evaluate((o) => window.view.draw(o), options);
          await page.locator("#view").screenshot({
            path: artifactPath(
              `inland-${item.name}-${options.hour === 0 ? "night" : (options.mode ?? "bloom")}.png`,
            ),
          });
        }
        const off = await page.evaluate(() =>
          window.view.draw({ visible: false, mode: "reference" }),
        );
        await page
          .locator("#view")
          .screenshot({ path: artifactPath("inland-mixed-water-off.png") });
        row.disabledCalls = off.drawCalls;
        await page.evaluate(async () => {
          window.second = await window.inland.createView(
            window.data,
            "second",
            480,
            360,
          );
          window.second.draw();
          window.view.resize(360, 600);
          window.view.draw();
          window.second.dispose();
        });
        await page
          .locator("#view")
          .screenshot({ path: artifactPath("inland-narrow.png") });
      }
      assert.equal(
        await page.evaluate(() => window.view.digest()),
        data.before,
      );
      const remaining = await page.evaluate(() => window.view.dispose());
      assert.equal(remaining.geometries, 0);
      assert.equal(remaining.textures, 0);
      rows.push(row);
    }
    if (stones) {
      assert.ok(
        rows.some((r) =>
          r.views.some(
            (v) => v.focus === "stones" && v.stonePixels.changed > 100,
          ),
        ),
      );
      assert.equal(
        rows
          .find((r) => r.name === "maximum")
          .views.find((v) => v.focus === "map").stonePixels.changed,
        0,
      );
    }
    if (banks)
      assert.ok(
        rows.some((r) => r.views.some((v) => v.bankPixels.changed > 100)),
      );
    assert.ok(rows.some((r) => r.lakes > 0));
    assert.ok(
      rows.some((r) =>
        r.views.some((v) => v.focus === "lake" && v.visiblePixels > 100),
      ),
    );
    assert.ok(
      rows.some((r) =>
        r.views.some((v) => v.focus === "river" && v.visiblePixels > 100),
      ),
    );
    assert.ok(
      rows.some((r) =>
        r.views.some((v) => v.stats.supported > 0 && v.stats.riverVertices > 0),
      ),
    );
    assert.ok(
      rows
        .find((r) => r.name === "no-ocean")
        .views.every((v) => !v.hasOcean && v.hasWater),
    );
    assert.deepEqual(errors, []);
    await fs.writeFile(
      artifactPath(`${prefix}-water-browser.json`),
      JSON.stringify(rows, null, 2),
    );
    console.log(JSON.stringify(rows));
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
