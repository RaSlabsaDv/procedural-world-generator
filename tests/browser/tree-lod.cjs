const { openSettingsPanel } = require("./support/editor.cjs");
const { fillControl } = require("./support/editor.cjs");
const assert = require("node:assert/strict"),
  fs = require("node:fs/promises");
const {
  base,
  launchBrowser,
  waitForOfflineReady,
  useReferenceAppearance,
} = require("./support/browser.cjs");
const {
  fillParameters,
  waitForTerrain,
  artifactPath,
} = require("./support/editor.cjs");
const {
  instrumentLighting,
  lightingResources,
} = require("./support/lighting.cjs");
const { instrumentTrees, treeState } = require("./support/trees.cjs");
(async () => {
  const browser = await launchBrowser();
  try {
    const context = await browser.newContext({
      viewport: { width: 1600, height: 1050 },
      reducedMotion: "reduce",
    });
    await instrumentLighting(context);
    await instrumentTrees(context);
    const page = await context.newPage(),
      errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text());
    });
    await page.goto(base);
    await waitForOfflineReady(page);
    await useReferenceAppearance(page);
    await fillParameters(page, {
      width: 129,
      height: 97,
      iterations: 16,
      seed: 42,
      globalWarmth: 0.7,
    });
    await page.locator("#verify-equivalence").click();
    await waitForTerrain(page);
    assert.match(
      await page.locator("#numeric-match").innerText(),
      /All heights match/,
    );
    const first = (await treeState(page))[0];
    assert.ok(first.groups.length > 0);
    assert.ok(first.groups.every((g) => g.level === "far"));
    const signature = (r) =>
      r.groups.map((g) => [g.level, g.count, g.matrix.hash, g.color.hash]);
    const check = (r) => {
      assert.ok(r.calls <= 34);
      assert.ok(r.liveColors <= 12);
      assert.ok(r.liveMatrices <= 12);
      assert.ok(r.groups.length > 0);
      for (const g of r.groups) {
        assert.deepEqual(g.diffuse, [1, 1, 1]);
        assert.ok(g.matrix.finite && g.color.finite);
        assert.ok(g.color.bytes >= g.count * 12);
      }
    };
    check(first);
    const count = (r) => r.groups.reduce((n, g) => n + g.count, 0);
    const crownTriangles = (r) =>
      r.groups.reduce((n, g) => n + g.count * g.triangles, 0);
    assert.ok(crownTriangles(first) <= count(first) * 8);
    const canvas = page.locator("app-terrain-preview canvas").first();
    const box = await canvas.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.wheel(0, -4400);
    await page.waitForTimeout(150);
    await canvas.screenshot({ path: artifactPath("tree-lod-close.png") });
    const close = (await treeState(page))[0];
    check(close);
    assert.ok(close.groups.some((g) => g.level === "near"));
    assert.ok(close.groups.some((g) => g.level === "far"));
    assert.deepEqual(
      close.shadows,
      first.shadows,
      "Camera changes preserve static source matrices",
    );
    assert.equal(
      close.sourceUploads,
      first.sourceUploads,
      "LOD never uploads static casters",
    );
    const stable = signature(close);
    await openSettingsPanel(page, "water-settings");
    await fillControl(page, "#water-foam", "0.45");
    assert.deepEqual(signature((await treeState(page))[0]), stable);
    assert.equal((await treeState(page))[0].uploads, close.uploads);
    const lightingBefore = (await lightingResources(page)).filter(
      (r) => !r.lost && r.detailTextures > 0,
    );
    for (const r of lightingBefore) assert.equal(r.activeShadowUpdates, 1);
    // Repeated crossings use existing buffers and never rebuild the shadow map.
    for (const delta of [600, -600, 600, -600]) {
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.wheel(0, delta);
      await page.waitForTimeout(80);
      const row = (await treeState(page))[0];
      check(row);
      assert.deepEqual(row.shadows, first.shadows);
      assert.equal(row.sourceUploads, first.sourceUploads);
    }
    for (const r of (await lightingResources(page)).filter(
      (r) => !r.lost && r.detailTextures > 0,
    ))
      assert.equal(r.activeShadowUpdates, 1);
    await page.locator("app-terrain-preview button").first().click();
    const reset = (await treeState(page))[0];
    assert.deepEqual(signature(reset), signature(first));
    // Matching overview cameras must produce identical compacted Local/Remote data.
    await page.locator("#compare-views").click();
    await page.locator("app-terrain-preview .display-time").nth(1).waitFor();
    const pair = await treeState(page);
    assert.equal(pair.length, 2);
    pair.forEach(check);
    assert.deepEqual(signature(pair[0]), signature(pair[1]));
    assert.deepEqual(pair[0].shadows, pair[1].shadows);
    await openSettingsPanel(page, "sun-settings");
    for (const hour of ["7", "0", "12"]) {
      await fillControl(page, "#sun-time", hour);
      await canvas.screenshot({
        path: artifactPath(`tree-lod-hour-${hour}.png`),
      });
      assert.deepEqual(
        signature((await treeState(page))[0]),
        signature(pair[0]),
      );
    }
    await openSettingsPanel(page, "atmosphere-settings");
    await page.locator("#atmosphere-enabled").uncheck();
    await canvas.screenshot({
      path: artifactPath("tree-lod-atmosphere-off.png"),
    });
    await page.locator("#select-local").click();
    await fillParameters(page, { iterations: 128 });
    await page.locator("#generate-local").click();
    const paused = await treeState(page);
    await page.waitForTimeout(150);
    assert.deepEqual(
      (await treeState(page)).map((r) => r.uploads),
      paused.map((r) => r.uploads),
    );
    await waitForTerrain(page);
    await page.evaluate(() => {
      window.__retiredTreeBuffers = window.__treeViews
        .filter((r) => !r.gl.isContextLost())
        .map((r) => ({
          gl: r.gl,
          buffers: [
            ...new Set([
              ...r.colors,
              ...r.matrices,
              ...r.shadows.map((s) => s.matrix.buffer),
            ]),
          ].filter((b) => r.gl.isBuffer(b)),
        }));
    });
    await fillParameters(page, {
      width: 512,
      height: 512,
      iterations: 0,
      plainsCoverage: 1,
      mountainCoverage: 0,
      seaLevel: 0,
      globalMoisture: 1,
      vegetationDensity: 1,
    });
    await page.locator("#generate-local").click();
    await waitForTerrain(page);
    const maximum = (await treeState(page))[0];
    check(maximum);
    assert.equal(count(maximum), 16384);
    assert.ok(maximum.groups.every((g) => g.level === "far"));
    assert.ok(crownTriangles(maximum) <= 16384 * 8);
    assert.ok(
      await page.evaluate(() =>
        window.__retiredTreeBuffers.every((r) =>
          r.buffers.every((b) => !r.gl.isBuffer(b)),
        ),
      ),
      "Replacement releases every previously observed tree/caster buffer",
    );
    const maxBox = await canvas.boundingBox();
    await page.mouse.move(
      maxBox.x + maxBox.width / 2,
      maxBox.y + maxBox.height / 2,
    );
    await page.mouse.wheel(0, -6000);
    await page.waitForTimeout(150);
    await canvas.screenshot({
      path: artifactPath("tree-lod-maximum-close.png"),
    });
    const maximumClose = (await treeState(page))[0];
    check(maximumClose);
    assert.ok(maximumClose.groups.some((g) => g.level === "near"));
    assert.ok(maximumClose.groups.some((g) => g.level === "far"));
    assert.deepEqual(maximumClose.shadows, maximum.shadows);
    assert.equal(maximumClose.sourceUploads, maximum.sourceUploads);
    await context.setOffline(true);
    await page.reload();
    await waitForOfflineReady(page);
    await useReferenceAppearance(page);
    await fillParameters(page, {
      width: 65,
      height: 49,
      iterations: 0,
      seed: 76543,
      globalMoisture: 1,
    });
    await page.locator("#generate-local").click();
    await waitForTerrain(page);
    check((await treeState(page))[0]);
    await page.setViewportSize({ width: 390, height: 844 });
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    assert.deepEqual(errors, []);
    const report = {
      pass: true,
      first,
      close,
      pair,
      maximum,
      maximumClose,
      offline: true,
      errors,
    };
    await fs.writeFile(
      artifactPath("tree-lod-verification.json"),
      JSON.stringify(report, null, 2),
    );
    console.log(
      JSON.stringify({
        pass: true,
        firstCount: count(first),
        nearClose: close.groups
          .filter((g) => g.level === "near")
          .reduce((n, g) => n + g.count, 0),
        maximumCount: count(maximum),
        maximumCrownTriangles: crownTriangles(maximum),
        staticShadows: true,
        offline: true,
        errors,
      }),
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
