// Real small-workload Race UI regression, not a controlled performance campaign.
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const {
  base,
  launchBrowser,
  waitForOfflineReady,
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

(async () => {
  const http = require("node:http");
  const transport = base.startsWith("https:") ? require("node:https") : http;
  const requests = [];
  let releaseResponse,
    responseHeld = false,
    gateNext = false;
  // A local test proxy gates the real POST even when a service worker owns its fetch.
  // page.route cannot reliably intercept SW-owned requests. Never use these timings as research data.
  const proxy = http.createServer(async (request, response) => {
    const body = [];
    for await (const chunk of request) body.push(chunk);
    const bytes = Buffer.concat(body);
    if (request.method === "POST" && request.url === "/api/v1/terrains") {
      requests.push(JSON.parse(bytes.toString("utf8")));
      if (gateNext) {
        gateNext = false;
        responseHeld = true;
        await new Promise((resolve) => {
          releaseResponse = resolve;
        });
      }
    }
    const upstream = transport.request(
      new URL(request.url, base),
      {
        method: request.method,
        headers: request.headers,
      },
      (reply) => {
        response.writeHead(reply.statusCode, reply.headers);
        reply.pipe(response);
      },
    );
    upstream.on("error", () => {
      response.writeHead(502);
      response.end("Test proxy upstream unavailable");
    });
    upstream.end(bytes);
  });
  await new Promise((resolve) => proxy.listen(0, "127.0.0.1", resolve));
  const proxyBase = `http://127.0.0.1:${proxy.address().port}`;
  const browser = await launchBrowser();
  const waitForHeld = async () => {
    const deadline = Date.now() + 15000;
    while (!responseHeld) {
      assert.ok(
        Date.now() < deadline,
        "Timed out waiting for the test proxy gate",
      );
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  };
  try {
    const context = await browser.newContext({
      viewport: { width: 1600, height: 1050 },
    });
    await instrumentLighting(context);
    const page = await context.newPage(),
      errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(proxyBase);
    await waitForOfflineReady(page);
    await fillParameters(page, {
      width: 33,
      height: 25,
      iterations: 2,
      seed: 42,
    });
    await page.locator("#generate-local").click();
    await waitForTerrain(page);
    await fillParameters(page, { seed: 2026 });
    await page.locator("#race-pairs").fill("2");
    gateNext = true;
    await page.locator("#race-start").click();
    await page.waitForFunction(() =>
      document
        .querySelector("#race-status")
        .textContent.includes("Warmup · Remote"),
    );
    await waitForHeld();
    assert.equal(await page.locator("#race-start").isDisabled(), true);
    assert.equal(await page.locator("#race-stop").isEnabled(), true);
    for (const id of [
      "generate-local",
      "generate-remote",
      "reset-parameters",
      "random-seed",
    ])
      assert.equal(await page.locator("#" + id).isDisabled(), true);
    assert.match(await page.locator(".snapshot").innerText(), /Seed 42/);
    const before = await lightingResources(page);
    await page.waitForTimeout(150);
    const during = await lightingResources(page);
    assert.equal(
      during.length,
      before.length,
      "No intermediate WebGL contexts",
    );
    assert.deepEqual(
      during.map((row) => row.passes.length),
      before.map((row) => row.passes.length),
      "No render submissions while held",
    );
    releaseResponse();
    await page
      .locator("#race-outcome[data-status=completed]")
      .waitFor({ timeout: 120000 });
    await page.locator("app-terrain-preview .display-time").first().waitFor();
    assert.match(await page.locator(".snapshot").innerText(), /Seed 2026/);
    await page.locator("#race-trials > summary").click();
    const rows = await page
      .locator("#race-trials tbody tr")
      .evaluateAll((nodes) =>
        nodes.map((row) => ({
          phase: row.dataset.phase,
          pair: row.dataset.index ?? null,
          mode: row.dataset.mode,
          position: row.dataset.position,
          status: row.cells[3].textContent.trim(),
        })),
      );
    assert.deepEqual(
      rows.map((r) => r.mode),
      ["local", "remote", "local", "remote", "remote", "local"],
    );
    assert.deepEqual(
      rows.map((r) => r.phase),
      ["warmup", "warmup", "measured", "measured", "measured", "measured"],
    );
    assert.deepEqual(
      rows.map((r) => r.position),
      ["0", "1", "0", "1", "0", "1"],
    );
    assert.ok(rows.every((r) => r.status === "success"));
    assert.equal(requests.length, 3);
    assert.ok(
      requests.every((r) => JSON.stringify(r) === JSON.stringify(requests[0])),
    );
    assert.equal(requests[0].heightMap.seed, 2026);
    const builds = await page
      .locator(".race-local-build, .race-remote-build")
      .allTextContents();
    assert.equal(builds.length, 2);
    assert.equal(builds[0], builds[1]);
    assert.ok(builds[0].trim().length > 0);
    await page.locator("#race-verification > summary").click();
    assert.equal(
      await page.locator("#race-verification .pair-check").count(),
      3,
    );
    const checks = await page.locator("#race-verification").innerText();
    assert.ok(!checks.includes("Numeric agreement: no"));
    assert.ok(!checks.includes("Biome IDs: differ"));
    assert.match(checks, /Build compatibility: (compatible|unverifiable)/);
    const eligibility = await page
      .locator("#race-outcome")
      .getAttribute("data-eligibility");
    if (builds[0].endsWith("-dirty") || builds[0] === "unversioned")
      assert.equal(eligibility, "excluded");
    else assert.equal(eligibility, "eligible");

    // Deterministically hold an active Remote warmup for Stop, rather than guessing timing.
    await page.setViewportSize({ width: 390, height: 844 });
    gateNext = true;
    responseHeld = false;
    await page.locator("#race-start").click();
    await page.waitForFunction(() =>
      document
        .querySelector("#race-status")
        .textContent.includes("Warmup · Remote"),
    );
    await waitForHeld();
    await page.locator("#race-stop").scrollIntoViewIfNeeded();
    assert.equal(await page.locator("#race-stop").isVisible(), true);
    await page.locator("#race-stop").click();
    await page.waitForFunction(() =>
      document
        .querySelector("#race-status")
        .textContent.includes("Stop requested"),
    );
    assert.equal(await page.locator("#race-stop").isDisabled(), true);
    assert.equal(await page.locator("#race-start").isDisabled(), true);
    assert.equal(await page.locator("#race-outcome").count(), 0);
    releaseResponse();
    await page.locator("#race-outcome[data-status=stopped]").waitFor();
    // Details may preserve their open state across result replacement.
    if (!(await page.locator("#race-trials").evaluate((el) => el.open)))
      await page.locator("#race-trials > summary").click();
    assert.equal(await page.locator("#race-trials tbody tr").count(), 2);
    assert.match(
      await page.locator("#race-outcome").innerText(),
      /Incomplete series/,
    );
    assert.equal(requests.length, 4);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator("#race-start").scrollIntoViewIfNeeded();
    assert.equal(await page.locator("#race-start").isVisible(), true);
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
      true,
    );
    await page.screenshot({ path: artifactPath("race-narrow.png") });
    assert.deepEqual(errors, []);
    const evidence = {
      pass: true,
      browser: browser.version(),
      actualRows: rows,
      builds,
      eligibility,
      pausedNoPasses: true,
      preservedPriorMap: true,
      stoppedWarmupTrials: 2,
      stopCondition:
        "Test-only HTTP proxy gate; excluded from performance conclusions",
      narrowLayout: true,
      pageErrors: errors,
    };
    await fs.writeFile(
      artifactPath("race-verification.json"),
      JSON.stringify(evidence, null, 2),
    );
    console.log(JSON.stringify(evidence));
  } finally {
    await browser.close();
    proxy.closeAllConnections();
    await new Promise((resolve) => proxy.close(resolve));
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
