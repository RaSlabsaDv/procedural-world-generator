// Real shader/PNG decoding, bounded texture ownership and reproducible surface views.
const {
  base,
  launchBrowser,
  waitForOfflineReady,
} = require("./support/browser.cjs");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const artifact = (name) => path.resolve(__dirname, "../../artifacts/" + name);
(async () => {
  const browser = await launchBrowser();
  try {
    const context = await browser.newContext({
      viewport: { width: 1600, height: 1050 },
    });
    await context.addInitScript(() => {
      // Test-only instrumentation; no telemetry/debug API is added to the product.
      window.__surfaceContexts = [];
      const getContext = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (...args) {
        const gl = getContext.apply(this, args);
        if (!gl || args[0] !== "webgl2" || gl.__surfaceMeasured) return gl;
        gl.__surfaceMeasured = true;
        const record = {
          gl,
          textures: new Set(),
          sources: new Set(),
          calls: 0,
          terrainCalls: 0,
        };
        window.__surfaceContexts.push(record);
        for (const name of ["texImage2D", "texSubImage2D"]) {
          const original = gl[name];
          gl[name] = function (...args) {
            const source = args.at(-1)?.src;
            if (
              typeof source === "string" &&
              source.includes("/textures/terrain/")
            ) {
              record.textures.add(gl.getParameter(gl.TEXTURE_BINDING_2D));
              record.sources.add(source.split("/").at(-1));
            }
            return original.apply(this, args);
          };
        }
        const remove = gl.deleteTexture;
        gl.deleteTexture = function (texture) {
          record.textures.delete(texture);
          return remove.call(this, texture);
        };
        const clear = gl.clear;
        gl.clear = function (...args) {
          record.calls = 0;
          record.terrainCalls = 0;
          return clear.apply(this, args);
        };
        for (const name of [
          "drawElements",
          "drawArrays",
          "drawElementsInstanced",
          "drawArraysInstanced",
        ]) {
          const original = gl[name];
          gl[name] = function (...args) {
            record.calls++;
            if (!name.endsWith("Instanced")) record.terrainCalls++;
            return original.apply(this, args);
          };
        }
        return gl;
      };
    });
    const page = await context.newPage(),
      errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    await page.goto(base);
    await waitForOfflineReady(page);
    const complete = async () => {
      await page.waitForFunction(
        () => document.querySelector(".status").textContent === "Complete",
      );
      await page.locator("app-terrain-preview .display-time").first().waitFor();
      assert.equal(
        await page.locator("app-terrain-preview [role=alert]").count(),
        0,
      );
    };
    const resources = async () =>
      page.evaluate(() =>
        window.__surfaceContexts.map(
          ({ gl, textures, sources, calls, terrainCalls }) => ({
            lost: gl.isContextLost(),
            textures: textures.size,
            sources: [...sources].sort(),
            calls,
            terrainCalls,
          }),
        ),
      );
    const assertResources = async (views) => {
      const rows = await resources(),
        live = rows.filter((row) => !row.lost && row.textures > 0);
      assert.equal(live.length, views);
      for (const row of live) {
        assert.equal(row.textures, 4);
        assert.deepEqual(row.sources, [
          "grass.png",
          "rock.png",
          "snow.png",
          "soil.png",
        ]);
        assert.equal(row.terrainCalls, 1);
        assert.ok(row.calls <= 7, "Terrain plus at most six tree meshes");
      }
      for (const row of rows.filter((row) => row.lost))
        assert.equal(row.textures, 0);
      return rows;
    };
    const captures = [];
    for (const [label, seed, warmth, moisture] of [
      ["normal", 42, 0.6, 0.65],
      ["cold", 2026, 0.25, 0.8],
      ["warm", -7, 0.9, 0.45],
    ]) {
      const fields = {
        seed,
        width: 129,
        height: 97,
        iterations: 16,
        globalWarmth: warmth,
        globalMoisture: moisture,
      };
      for (const [id, value] of Object.entries(fields))
        await page.locator("#" + id).fill(String(value));
      await page.locator("#generate-local").click();
      await complete();
      const canvas = page.locator("app-terrain-preview canvas");
      await canvas.screenshot({
        path: artifact(`materials-after-${label}-overview.png`),
      });
      await canvas.hover();
      await page.mouse.wheel(0, -650);
      await page.waitForTimeout(350);
      await canvas.screenshot({
        path: artifact(`materials-after-${label}-close.png`),
      });
      const parameters = await page
        .locator("input[type=number]")
        .evaluateAll((inputs) =>
          Object.fromEntries(
            inputs.map((input) => [input.id, Number(input.value)]),
          ),
        );
      captures.push({
        label,
        parameters,
        algorithmVersion: "diverse-landscape-v3",
        wheelDelta: -650,
        resources: await assertResources(1),
      });
      await page
        .getByRole("button", { name: "Reset camera", exact: true })
        .click();
    }
    await page.locator("#verify-equivalence").click();
    await complete();
    await page.locator("#compare-views").click();
    await page.locator("app-terrain-preview .display-time").nth(1).waitFor();
    const comparison = await assertResources(2);
    await page.locator("#select-remote").click();
    await page.waitForFunction(
      () => document.querySelectorAll("app-terrain-preview").length === 1,
    );
    await page.locator("app-terrain-preview .display-time").waitFor();
    await assertResources(1);
    for (const [id, value] of Object.entries({
      width: 512,
      height: 512,
      iterations: 0,
      plainsCoverage: 1,
      mountainCoverage: 0,
      globalWarmth: 0.6,
      globalMoisture: 1,
      seaLevel: 0,
    }))
      await page.locator("#" + id).fill(String(value));
    await page.locator("#generate-remote").click();
    await complete();
    assert.match(
      await page
        .locator(
          '.measurement[aria-label="Remote API measurements"] .tree-count',
        )
        .innerText(),
      /16384/,
    );
    const maximum = await assertResources(1);
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
    );
    await page.locator("#reset-parameters").click();
    await context.setOffline(true);
    await page.reload({ waitUntil: "domcontentloaded" });
    await waitForOfflineReady(page);
    await page.locator("#seed").fill("-8812");
    await page.locator("#generate-local").click();
    await complete();
    const offline = await assertResources(1);
    assert.deepEqual(errors, []);
    const names = ["grass", "soil", "sand", "rock", "snow"];
    const encodedBytes = (
      await Promise.all(
        names.map((name) =>
          fs.stat(
            path.resolve(
              __dirname,
              "../../src/client/public/textures/terrain/" + name + ".png",
            ),
          ),
        ),
      )
    ).reduce((sum, stat) => sum + stat.size, 0);
    const evidence = {
      pass: true,
      browser: browser.version(),
      captures,
      comparison,
      maximum,
      offline,
      encodedBytes,
      estimatedRgbaMipBytesPerViewport: 4 * ((256 * 256 * 4 * 4) / 3),
      pageErrors: errors,
    };
    await fs.writeFile(
      artifact("materials-verification.json"),
      JSON.stringify(evidence, null, 2),
    );
    console.log(JSON.stringify(evidence));
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
