// Production editor integration: real WASM/API, retained results, responsive layout and offline use.
const { chromium } = require(
  process.env.PWG_PLAYWRIGHT_MODULE || "playwright-core",
);
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const base = process.env.PWG_BASE_URL || "http://127.0.0.1:8080";
(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.PWG_BROWSER_EXECUTABLE,
    headless: true,
    args: [
      "--no-sandbox",
      "--enable-unsafe-swiftshader",
      "--use-angle=swiftshader",
    ],
  });
  try {
    const context = await browser.newContext({
      serviceWorkers: "allow",
      viewport: { width: 1600, height: 1050 },
    });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const ready = () =>
      page.locator("#offline-status.ready").waitFor({ timeout: 90000 });
    const complete = () =>
      page.waitForFunction(
        () => document.querySelector(".status").textContent === "Complete",
        null,
        { timeout: 90000 },
      );
    await page.goto(base);
    await ready();
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
