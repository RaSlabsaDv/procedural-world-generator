const { showSettings, fillControl } = require("./support/editor.cjs");
const assert = require("node:assert/strict");
const {
  base,
  launchBrowser,
  waitForOfflineReady,
} = require("./support/browser.cjs");
const { artifactPath, waitForTerrain } = require("./support/editor.cjs");
(async () => {
  const browser = await launchBrowser();
  try {
    const context = await browser.newContext({
        viewport: { width: 1600, height: 950 },
      }),
      page = await context.newPage(),
      errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(base);
    await waitForOfflineReady(page);
    await page.screenshot({
      path: artifactPath(
        process.argv.includes("--before")
          ? "compact-ui-before.png"
          : "compact-ui-empty.png",
      ),
    });
    if (process.argv.includes("--before")) return;
    assert.equal(
      await page.locator("#race-panel").evaluate((e) => e.open),
      false,
    );
    const overflow = () =>
      page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth + 1,
      );
    assert.equal(await overflow(), false);
    const seed = await page.locator("#seed").inputValue();
    for (const tab of ["biomes", "erosion", "scene", "extra", "terrain"]) {
      await showSettings(page, tab);
      assert.equal(await page.locator('[role="tabpanel"]:visible').count(), 1);
    }
    assert.equal(await page.locator("#seed").inputValue(), seed);
    await page.locator("#toggle-controls").click();
    await page.locator("#parameter-sidebar").waitFor({ state: "hidden" });
    await page.locator("#toggle-controls").click();
    assert.equal(await page.locator("#seed").inputValue(), seed);
    await page.locator("#width").fill("65");
    await page.locator("#height").fill("49");
    await fillControl(page, "#iterations", "2");
    await page.locator("#verify-equivalence").click();
    await waitForTerrain(page);
    assert.match(
      await page.locator("#numeric-match").innerText(),
      /All heights match/,
    );
    const canvas = page.locator("app-terrain-preview canvas").first();
    const before = await canvas.boundingBox();
    await canvas.evaluate((el) => {
      window.__uiCanvas = el;
      window.__uiContext = el.getContext("webgl2");
    });
    await page.locator("#toggle-inspector").click();
    await page.locator("#measurement-sidebar").waitFor({ state: "hidden" });
    await page.locator("#toggle-controls").click();
    await page.waitForTimeout(200);
    assert.ok((await canvas.boundingBox()).width > before.width + 300);
    assert.equal(await page.locator("app-terrain-preview").count(), 1);
    await page.screenshot({ path: artifactPath("compact-ui-focus.png") });
    await page.locator("#toggle-controls").click();
    await page.locator("#toggle-inspector").click();
    assert.ok(
      await canvas.evaluate(
        (el) =>
          el === window.__uiCanvas &&
          el.getContext("webgl2") === window.__uiContext,
      ),
    );
    await page.locator("#compare-views").click();
    await page.locator(".display-time").nth(1).waitFor();
    assert.equal(await page.locator("app-terrain-preview").count(), 2);
    await page.locator("#compare-views").click();
    await page.locator(".display-time").first().waitFor();
    const scrollY = await page.evaluate(() => window.scrollY);
    await showSettings(page, "scene");
    assert.equal(await page.evaluate(() => window.scrollY), scrollY);

    assert.equal(
      await page.locator("#water-foam").evaluate((el) => el.form),
      null,
    );
    await page.locator("#water-foam").fill("0.3");

    await page.locator("#sun-time").fill("18");
    await page.screenshot({ path: artifactPath("compact-ui-scene.png") });
    await page.locator("#settings-tab-scene").focus();
    await page.keyboard.press("End");
    await page.locator("#settings-panel-extra").waitFor({ state: "visible" });
    assert.equal(
      await page.locator("#appearance-exposure").evaluate((el) => el.form),
      null,
    );
    assert.equal(
      await page.locator("#noiseScale").evaluate((el) => el.form?.id),
      "terrain-generation-form",
    );
    await page.screenshot({ path: artifactPath("settings-tabs-extra.png") });
    await showSettings(page, "scene");
    await page.locator("#reset-sun").click();
    await showSettings(page, "terrain");
    await page.screenshot({ path: artifactPath("compact-ui-desktop.png") });
    for (const width of [1024, 768, 390]) {
      await page.setViewportSize({ width, height: 850 });
      assert.equal(await overflow(), false);
      await page.screenshot({
        path: artifactPath(`compact-ui-${width}.png`),
        fullPage: true,
      });
    }
    await page.locator("#toggle-controls").click();
    await canvas.scrollIntoViewIfNeeded();
    assert.ok((await canvas.boundingBox()).width > 300);
    const touch = await browser.newContext({
      viewport: { width: 390, height: 850 },
      hasTouch: true,
      isMobile: true,
    });
    const mobile = await touch.newPage();
    await mobile.goto(base);
    await waitForOfflineReady(mobile);
    assert.ok(
      await mobile
        .locator("#seed")
        .evaluate((el) => parseFloat(getComputedStyle(el).minHeight) >= 40),
    );
    await touch.close();
    assert.deepEqual(errors, []);
    console.log(
      JSON.stringify({
        pass: true,
        viewports: [1600, 1024, 768, 390],
        preservedDraft: true,
        localRemote: true,
        panelToggles: true,
        sceneControls: true,
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
