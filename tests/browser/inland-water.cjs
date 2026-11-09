const assert = require("node:assert/strict"),
  path = require("node:path"),
  fs = require("node:fs/promises");
const { build } = require("../../src/client/node_modules/esbuild");
const { base, launchBrowser } = require("./support/browser.cjs");
const { artifactPath } = require("./support/editor.cjs");
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
    const rows = [];
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
        };
      }, item.fields);
      assert.equal(data.hash, data.localHash);
      const row = { name: item.name, ...data, views: [] };
      for (const focus of item.name === "maximum"
        ? ["map", "lake"]
        : ["map", "lake", "river", "confluence"]) {
        const result = await page.evaluate((focus) => {
          window.view.focus(focus);
          return window.view.draw();
        }, focus);
        const visiblePixels =
          focus === "lake" || focus === "river"
            ? await page.evaluate((kind) => window.view.measure(kind), focus)
            : undefined;
        row.views.push({ focus, ...result, visiblePixels });
        assert.ok(result.waterCalls <= 2);
        assert.equal(result.waterShadowCasters, 0);
        await page
          .locator("#view")
          .screenshot({
            path: artifactPath(`inland-${item.name}-${focus}.png`),
          });
      }
      if (item.name === "mixed") {
        for (const options of [
          { hour: 0, bloom: true },
          { hour: 12, mode: "reference" },
          { hour: 12, bloom: true },
        ]) {
          await page.evaluate((o) => window.view.draw(o), options);
          await page
            .locator("#view")
            .screenshot({
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
      await page.evaluate(() => window.view.dispose());
      rows.push(row);
    }
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
      artifactPath("inland-water-browser.json"),
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
