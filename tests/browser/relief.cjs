const { waitForGeneration, fillParameters } = require("./support/editor.cjs");
// Fixed pure-plain/mountain views and actual UI equivalence, before/after local relief.
const {
  base,
  launchBrowser,
  waitForOfflineReady,
} = require("./support/browser.cjs");
const assert = require("node:assert/strict"),
  fs = require("node:fs/promises"),
  path = require("node:path");
(async () => {
  const baseline = process.argv.includes("--baseline"),
    prefix = baseline ? "before" : "after";
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
    const algorithmVersion = baseline
      ? "diverse-landscape-v5"
      : "diverse-landscape-v14";
    for (const [label, seed, plainsCoverage, mountainCoverage, iterations] of [
      ["plains", 42, 1, 0, 0],
      ["eroded-plains", -7, 1, 0, 32],
      ["mountains", 42, 0, 1, 0],
    ]) {
      await page.locator("#reset-parameters").click();
      const fields = {
        width: 129,
        height: 97,
        seed,
        plainsCoverage,
        mountainCoverage,
        iterations,
      };
      await fillParameters(page, fields);
      await page.locator("#verify-equivalence").click();
      await waitForGeneration(page, 120000);
      await page.locator("app-terrain-preview .display-time").first().waitFor();
      assert.match(
        await page.locator("#numeric-match").innerText(),
        /All heights match/,
      );
      assert.match(
        await page.locator("#biome-match").innerText(),
        /All biome IDs match/,
      );
      assert.equal(
        await page.locator("app-terrain-preview [role=alert]").count(),
        0,
      );
      assert.ok(
        (await page.locator(".measurement").first().textContent()).includes(
          algorithmVersion,
        ),
      );
      const canvas = page.locator("app-terrain-preview canvas").first();
      for (const [view, wheel] of [
        ["overview", 0],
        ["close", -1350],
      ]) {
        if (wheel) {
          await canvas.hover();
          await page.mouse.wheel(0, wheel);
          await page.waitForTimeout(250);
        }
        await canvas.screenshot({
          path: path.resolve(
            __dirname,
            `../../artifacts/relief-${prefix}-${label}-${view}.png`,
          ),
        });
      }
      const parameters = await page
        .locator("input[type=number]")
        .evaluateAll((inputs) =>
          Object.fromEntries(inputs.map((i) => [i.id, Number(i.value)])),
        );
      captures.push({
        label,
        parameters,
        algorithmVersion,
        closeWheelDelta: -1350,
      });
      await page
        .getByRole("button", { name: "Reset camera", exact: true })
        .click();
    }
    assert.deepEqual(errors, []);
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
        `../../artifacts/relief-${prefix}-verification.json`,
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
