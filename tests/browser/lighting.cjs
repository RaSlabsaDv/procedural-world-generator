const { waitForTerrain, fillParameters } = require("./support/editor.cjs");
// Static shadow reuse, paused work, minimum terrain and cleanup in real WebGL.
const {
  base,
  launchBrowser,
  waitForOfflineReady,
} = require("./support/browser.cjs");
const {
  instrumentLighting,
  lightingResources,
} = require("./support/lighting.cjs");
const assert = require("node:assert/strict"),
  fs = require("node:fs/promises"),
  path = require("node:path");
(async () => {
  const browser = await launchBrowser();
  try {
    const context = await browser.newContext({
      viewport: { width: 1600, height: 1050 },
    });
    await instrumentLighting(context);
    const page = await context.newPage(),
      errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    await page.goto(base);
    await waitForOfflineReady(page);
    const complete = () => waitForTerrain(page, 120000);
    const current = async () => {
      const rows = await lightingResources(page),
        live = rows.filter((row) => !row.lost && row.attachments.length);
      assert.equal(live.length, 1);
      assert.equal(live[0].activeShadowUpdates, 1);
      assert.equal(live[0].detailTextures, 5);
      assert.equal(live[0].attachments.length, 2);
      for (const attachment of live[0].attachments) {
        assert.equal(attachment.width, 2048);
        assert.equal(attachment.height, 2048);
        assert.equal(attachment.levels, 1);
      }
      assert.deepEqual(live[0].attachments.map((a) => a.format).sort(), [
        "DEPTH_COMPONENT24",
        "RGBA8",
      ]);
      const shadowBytes = live[0].attachments.reduce(
        (sum, a) => sum + a.estimatedBytes,
        0,
      );
      assert.equal(shadowBytes, 33554432);
      return live[0];
    };
    await fillParameters(page, {
      width: 129,
      height: 97,
      iterations: 16,
    });
    await page.locator("#generate-local").click();
    await complete();
    const initial = await current();
    const canvas = page.locator("app-terrain-preview canvas"),
      box = await canvas.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(
      box.x + box.width / 2 + 110,
      box.y + box.height / 2 + 45,
      { steps: 5 },
    );
    await page.mouse.up();
    await canvas.hover();
    await page.mouse.wheel(0, -450);
    await page.waitForTimeout(150);
    const orbit = await current();
    assert.equal(
      orbit.passes.filter((p) => p.target === "shadow").length,
      initial.passes.filter((p) => p.target === "shadow").length,
    );
    assert.ok(
      orbit.passes.filter((p) => p.target === "color").length >
        initial.passes.filter((p) => p.target === "color").length,
    );
    await page
      .getByRole("button", { name: "Reset camera", exact: true })
      .click();
    const reset = await current();
    assert.equal(reset.activeShadowUpdates, 1);
    // A real worker computation holds the lock: even synthetic control events must not render.
    await page.locator("#iterations").fill("256");
    await page.locator("#generate-local").click();
    await page.waitForFunction(
      () =>
        document.querySelector("#generate-local").matches(":disabled") &&
        document.querySelector(".status").textContent !== "Complete",
    );
    const duringBefore = await lightingResources(page);
    await canvas.dispatchEvent("wheel", { deltaY: -400, bubbles: true });
    await page.waitForTimeout(120);
    const duringAfter = await lightingResources(page);
    assert.deepEqual(
      duringAfter.map((row) => row.passes.length),
      duringBefore.map((row) => row.passes.length),
    );
    await complete();
    const replacement = await current();
    assert.ok(
      replacement.attachments[0].framebuffer !==
        initial.attachments[0].framebuffer,
    );
    // Minimum, zero-height, all-ocean case must still allocate valid targets and render once.
    await fillParameters(page, {
      width: 2,
      height: 2,
      heightMultiplier: 0,
      iterations: 0,
    });
    await page.locator("#generate-remote").click();
    await complete();
    const minimum = await current();
    assert.equal(
      minimum.passes.filter(
        (p) =>
          p.framebuffer === minimum.attachments[0].framebuffer &&
          p.target === "shadow",
      )[0].calls,
      1,
    );
    assert.equal(await page.locator("app-terrain-preview canvas").count(), 1);
    // Explicit view-removal resource cleanup is verified in materials.cjs before context loss.
    assert.deepEqual(errors, []);
    const evidence = {
      pass: true,
      browser: browser.version(),
      renderingRevision: "daylight-shadow-v1",
      initial,
      orbit,
      reset,
      pausedNoPasses: true,
      replacement,
      minimum,
      shadowAttachmentBytesPerView: 33554432,
      pageErrors: errors,
    };
    await fs.writeFile(
      path.resolve(__dirname, "../../artifacts/lighting-verification.json"),
      JSON.stringify(evidence, null, 2),
    );
    console.log(
      JSON.stringify({
        pass: true,
        browser: browser.version(),
        renderingRevision: evidence.renderingRevision,
        staticMapReused: true,
        pausedNoPasses: true,
        minimumOcean: true,
        shadowAttachmentBytesPerView: 33554432,
        pageErrors: errors,
      }),
    );
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
