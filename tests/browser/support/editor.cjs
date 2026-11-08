// Small shared editor actions; scenarios keep their own assertions and resource checks.
const assert = require("node:assert/strict");
const path = require("node:path");

async function fillParameters(page, values) {
  for (const [name, value] of Object.entries(values))
    await page.locator("#" + name).fill(String(value));
}

function waitForGeneration(page, timeout = 120000) {
  return page.waitForFunction(
    () => document.querySelector(".status")?.textContent === "Complete",
    null,
    { timeout },
  );
}

async function waitForTerrain(page, timeout = 120000) {
  await waitForGeneration(page, timeout);
  await page.locator("app-terrain-preview .display-time").first().waitFor();
  assert.equal(
    await page.locator("app-terrain-preview [role=alert]").count(),
    0,
  );
}

function artifactPath(name) {
  return path.resolve(__dirname, "../../../artifacts", name);
}

module.exports = {
  fillParameters,
  waitForGeneration,
  waitForTerrain,
  artifactPath,
};
