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
module.exports = { base, launchBrowser, waitForOfflineReady };
