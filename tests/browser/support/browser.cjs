// Shared production-browser setup. Keep all PWG_* overrides in one place.
const base = process.env.PWG_BASE_URL || "http://127.0.0.1:8080";

function launchBrowser() {
  const { chromium } = require(
    process.env.PWG_PLAYWRIGHT_MODULE || "playwright-core",
  );
  return chromium.launch({
    executablePath: process.env.PWG_BROWSER_EXECUTABLE,
    headless: true,
    args: [
      "--no-sandbox",
      "--enable-unsafe-swiftshader",
      "--use-angle=swiftshader",
    ],
  });
}

async function waitForOfflineReady(page) {
  try {
    await page.locator("#offline-status.ready").waitFor({ timeout: 90000 });
  } catch (cause) {
    const detail = await page.locator("#offline-detail").textContent();
    throw new Error("Offline preparation failed: " + detail, { cause });
  }
}
// Existing shader/resource regressions explicitly retain the preceding direct pipeline.
async function useReferenceAppearance(page) {
  if (!(await page.locator("#appearance-settings").count())) return;
  const panel = page.locator("#appearance-settings");
  const open = await panel.evaluate((el) => el.open);
  if (!open) await panel.locator("summary").click();
  await page.locator("#appearance-tone").selectOption("reference");
  await page.locator("#appearance-exposure").fill("1");
  await page.locator("#appearance-grading").uncheck();
  await page.locator("#appearance-vignette").uncheck();
  if (await page.locator("#appearance-bloom").count())
    await page.locator("#appearance-bloom").uncheck();
  if (!open) await panel.locator("summary").click();
}
module.exports = {
  base,
  launchBrowser,
  waitForOfflineReady,
  useReferenceAppearance,
};
