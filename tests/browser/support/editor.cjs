// Small shared editor actions; scenarios keep their own assertions and resource checks.
const assert = require("node:assert/strict");
const path = require("node:path");

async function showSettings(page, tab) {
  const button = page.locator("#settings-tab-" + tab);
  if (await button.count()) {
    await button.click();
    await page.locator("#settings-panel-" + tab).waitFor({ state: "visible" });
  }
}
async function revealControl(page, selector) {
  if (selector.startsWith("#sun-")) await showSettings(page, "scene");
  const control = page.locator(selector);
  const panel = await control.evaluate(
    (el) => el.closest('[role="tabpanel"]')?.id ?? null,
  );
  if (panel) await showSettings(page, panel.replace("settings-panel-", ""));
  const closed = await control.evaluate((el) => {
    const ids = [];
    let parent = el.parentElement;
    while (parent) {
      if (parent.tagName === "DETAILS" && !parent.open)
        ids.unshift(parent.id || null);
      parent = parent.parentElement;
    }
    return ids;
  });
  // Controls in current tabs are open initially; support explicitly closed settings too.
  if (closed.length)
    await control.evaluate((el) => {
      let p = el.parentElement;
      while (p) {
        if (p.tagName === "DETAILS") p.open = true;
        p = p.parentElement;
      }
    });
}
async function openSettingsPanel(page, id) {
  await showSettings(page, id === "appearance-settings" ? "extra" : "scene");
  const panel = page.locator("#" + id);
  if (!(await panel.evaluate((el) => el.open)))
    await panel.locator("summary").first().click();
}
async function fillControl(page, selector, value) {
  await revealControl(page, selector);
  await page.locator(selector).fill(String(value));
}
async function fillParameters(page, values) {
  for (const [name, value] of Object.entries(values))
    await fillControl(page, "#" + name, value);
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
  openSettingsPanel,
  showSettings,
  revealControl,
  fillControl,
  fillParameters,
  waitForGeneration,
  waitForTerrain,
  artifactPath,
};
