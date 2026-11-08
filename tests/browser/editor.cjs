const { waitForGeneration } = require("./support/editor.cjs");
// Production editor integration: real WASM/API, retained results, responsive layout and offline use.
const {
  base,
  launchBrowser,
  waitForOfflineReady,
} = require("./support/browser.cjs");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
(async () => {
  const browser = await launchBrowser();
  try {
    const context = await browser.newContext({
      serviceWorkers: "allow",
      viewport: { width: 1600, height: 1050 },
    });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const ready = () => waitForOfflineReady(page);
    const complete = () => waitForGeneration(page, 90000);
    await page.goto(base);
    await ready();
    assert.equal(await page.locator("#seed-help").isVisible(), false);
    await page.locator("#toggle-parameter-tips").click();
    await page.waitForFunction(
      () => !document.querySelector("#seed-help").hidden,
    );
    assert.equal(await page.locator("#seed").inputValue(), "42");
    await page.locator("#toggle-parameter-tips").click();
    await page.waitForFunction(
      () => document.querySelector("#seed-help").hidden,
    );
    assert.ok(
      (await page.locator(".coverage-group").boundingBox()).height < 300,
    );
    // Shared landform guidance updates drafts without silently changing the other value.
    assert.match(
      await page.locator("#coverage-budget").innerText(),
      /25% remains for hills/,
    );
    assert.equal(
      await page.locator("#plainsCoverage-slider").getAttribute("max"),
      "0.7",
    );
    await page.locator("#mountainCoverage").fill("0.5");
    assert.equal(await page.locator("#plainsCoverage").inputValue(), "0.45");
    await page.locator("#plainsCoverage-slider").focus();
    await page.keyboard.press("End");
    await page.waitForFunction(
      () => document.querySelector("#plainsCoverage").value === "0.5",
    );
    await page.waitForFunction(
      () =>
        document
          .querySelector("#coverage-budget .budget-message")
          .textContent.trim() === "0% remains for hills.",
    );
    await page.locator("#plainsCoverage").fill("0.8");
    await page.waitForFunction(() =>
      document
        .querySelector("#coverage-budget")
        .textContent.includes("exceed 100%"),
    );
    assert.equal(await page.locator("#mountainCoverage").inputValue(), "0.5");
    await page
      .locator(".coverage-group")
      .screenshot({
        path: path.resolve(
          __dirname,
          "../../artifacts/input-balance-over-budget.png",
        ),
      });
    await page.locator("#reset-parameters").click();
    await page.locator("#width").fill("512");
    await page.locator("#height").fill("512");
    await page.waitForFunction(
      () => document.querySelector("#iterations").max === "128",
    );
    await page.locator("#reset-parameters").click();
    await page
      .locator(".coverage-group")
      .screenshot({
        path: path.resolve(
          __dirname,
          "../../artifacts/input-balance-desktop.png",
        ),
      });
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
    );
    await page
      .locator(".coverage-group")
      .screenshot({
        path: path.resolve(
          __dirname,
          "../../artifacts/input-balance-narrow.png",
        ),
      });
    await page.setViewportSize({ width: 1600, height: 1050 });
    await page.locator("#width").fill("129");
    await page.locator("#height").fill("97");
    await page.locator("#iterations").fill("16");
    await page.locator("#verify-equivalence").click();
    await complete();
    await page.locator("app-terrain-preview .display-time").waitFor();
    assert.equal(await page.locator("app-terrain-preview").count(), 1);
    assert.match(
      await page.locator("#numeric-match").innerText(),
      /All heights match/,
    );
    assert.match(
      await page.locator("#biome-match").innerText(),
      /All biome IDs match exactly/,
    );
    assert.match(
      await page.locator("#build-identity").innerText(),
      /Matching build identity|unverifiable/,
    );
    await page.locator("#compare-views").click();
    await page.locator("app-terrain-preview .display-time").nth(1).waitFor();
    assert.equal(await page.locator("app-terrain-preview").count(), 2);
    assert.equal(
      await page.locator("app-terrain-preview [role=alert]").count(),
      0,
    );
    await page.locator("#select-remote").click();
    await page.waitForFunction(
      () => document.querySelectorAll(".map-card").length === 1,
    );
    assert.equal(await page.locator(".map-card").count(), 1);
    assert.equal(
      await page.locator(".map-card").getAttribute("aria-label"),
      "Remote API",
    );
    await page.locator("app-terrain-preview button").click();
    await page.screenshot({
      path: path.resolve(__dirname, "../../artifacts/editor-desktop.png"),
      fullPage: true,
    });
    await page.locator("#mountainStrength-slider").focus();
    await page.keyboard.press("End");
    await page.waitForFunction(
      () => document.querySelector("#mountainStrength").value === "1",
    );
    assert.equal(await page.locator("#mountainStrength").inputValue(), "1");
    await page.locator("#mountainStrength").fill("0.35");
    await page.waitForFunction(
      () => document.querySelector("#mountainStrength-slider").value === "0.35",
    );
    assert.equal(
      await page.locator("#mountainStrength-slider").inputValue(),
      "0.35",
    );
    await page.locator("#random-seed").click();
    const random = Number(await page.locator("#seed").inputValue());
    assert.ok(
      Number.isInteger(random) && random >= -2147483648 && random <= 2147483647,
    );
    assert.match(await page.locator(".snapshot").innerText(), /Seed 42/);
    await page.locator("#reset-parameters").click();
    await page.waitForFunction(
      () => document.querySelector("#width").value === "128",
    );
    assert.equal(await page.locator("#seed").inputValue(), "42");
    assert.equal(await page.locator("#width").inputValue(), "128");
    assert.equal(await page.locator("#iterations").inputValue(), "64");
    assert.match(await page.locator(".snapshot").innerText(), /129 × 97/);
    // Hold actual HTTP work, then fail it. Prior terrain and captured labels must survive.
    let release, observed;
    const blocked = new Promise((resolve) => {
      observed = resolve;
    });
    await context.route("**/api/v1/terrains", async (route) => {
      observed();
      await new Promise((resolve) => {
        release = resolve;
      });
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: "{}",
      });
    });
    await page.locator("#seed").fill("99");
    await page.locator("#generate-remote").click();
    await blocked;
    assert.equal(await page.locator("#generate-local").isDisabled(), true);
    assert.equal(
      await page.locator("app-terrain-preview button").isDisabled(),
      true,
    );
    assert.match(await page.locator(".snapshot").innerText(), /Seed 42/);
    assert.match(
      await page.locator(".map-card .result-state").innerText(),
      /Earlier settings/,
    );
    release();
    await page.locator("[role=alert]").waitFor();
    assert.match(
      await page.locator("[role=alert]").innerText(),
      /unavailable/i,
    );
    assert.match(await page.locator(".snapshot").innerText(), /Seed 42/);
    await context.unroute("**/api/v1/terrains");
    await page.getByText("Advanced noise", { exact: true }).click();
    await page.locator("#noiseScale").fill("0");
    await page.locator("#generate-remote").click();
    await page.locator("#noiseScale[aria-invalid=true]").waitFor();
    assert.match(await page.locator("#noiseScale-error").innerText(), /0.0001/);
    assert.equal(await page.locator("app-terrain-preview").count(), 1);
    await page.setViewportSize({ width: 390, height: 844 });
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    await page.screenshot({
      path: path.resolve(__dirname, "../../artifacts/editor-mobile.png"),
      fullPage: true,
    });
    await context.setOffline(true);
    await page.reload({ waitUntil: "domcontentloaded" });
    await ready();
    await page.locator("#seed").fill("-887");
    await page.locator("#generate-local").click();
    await complete();
    await page.locator("app-terrain-preview .display-time").waitFor();
    assert.match(await page.locator(".snapshot").innerText(), /Seed -887/);
    assert.equal(
      await page.locator("app-terrain-preview [role=alert]").count(),
      0,
    );
    await page.locator("#generate-remote").click();
    await page.locator("[role=alert]").waitFor();
    assert.match(await page.locator(".snapshot").innerText(), /Seed -887/);
    assert.deepEqual(errors, []);
    const result = {
      pass: true,
      browser: browser.version(),
      realEquivalence: true,
      explicitComparison: true,
      sliderSync: true,
      draftActions: true,
      retainedResults: true,
      nestedErrors: true,
      narrowLayout: true,
      offline3d: true,
      pageErrors: errors,
    };
    await fs.writeFile(
      path.resolve(__dirname, "../../artifacts/editor-verification.json"),
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
