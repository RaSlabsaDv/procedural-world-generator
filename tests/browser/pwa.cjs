// Optional end-to-end tool: run against the local published bundle, not ng serve.
const {
  base,
  launchBrowser,
  waitForOfflineReady,
} = require("./support/browser.cjs");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const repo = path.resolve(__dirname, "../..");
const webRoot = path.join(repo, "artifacts/app/wwwroot");
const catalogPattern = /^offline-assets\.[0-9a-f]{64}\.json$/;

(async () => {
  assert.ok(
    ["127.0.0.1", "localhost"].includes(new URL(base).hostname),
    "Use a local production deployment.",
  );
  const original = new Map();
  const names = [
    "index.html",
    "ngsw.json",
    "wasm/world-generator-host.js",
    ...(await fs.readdir(webRoot)).filter((name) => catalogPattern.test(name)),
  ];
  for (const name of names)
    original.set(name, await fs.readFile(path.join(webRoot, name)));
  const browser = await launchBrowser();
  const context = await browser.newContext({ serviceWorkers: "allow" });
  const errors = [];
  const observe = (page) =>
    page.on("pageerror", (error) => errors.push(error.message));
  const inlandSmoke = process.argv.includes("--inland");
  const shoreSmoke = process.argv.includes("--shore-stones");
  const reedSmoke = process.argv.includes("--reeds");
  if (inlandSmoke || shoreSmoke || reedSmoke)
    await context.addInitScript(() => {
      window.__inlandDraws = 0;
      window.__shoreStoneDraws = 0;
      window.__reedDraws = 0;
      const get = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (...args) {
        const gl = get.apply(this, args);
        if (!gl || args[0] !== "webgl2" || gl.__inlandProbe) return gl;
        gl.__inlandProbe = true;
        const draw = gl.drawElements;
        gl.drawElements = function (...values) {
          const program = gl.getParameter(gl.CURRENT_PROGRAM);
          if (program && gl.getAttribLocation(program, "waterFlow") >= 0)
            window.__inlandDraws++;
          return draw.apply(this, values);
        };
        for (const method of ["drawElementsInstanced", "drawArraysInstanced"]) {
          const submit = gl[method];
          gl[method] = function (...values) {
            const program = gl.getParameter(gl.CURRENT_PROGRAM);
            if (
              program &&
              gl.getUniformLocation(program, "shoreFadeNear") !== null
            )
              window.__shoreStoneDraws++;
            if (
              program &&
              gl.getUniformLocation(program, "reedFadeNear") !== null
            )
              window.__reedDraws++;
            return submit.apply(this, values);
          };
        }
        return gl;
      };
    });
  const page = await context.newPage();
  observe(page);
  const bloomSmoke = process.argv.includes("--bloom");
  const ready = async (target) => {
    await waitForOfflineReady(target);
    if (bloomSmoke) {
      const panel = target.locator("#appearance-settings");
      if (!(await panel.evaluate((el) => el.open)))
        await panel.locator("summary").click();
      await target.locator("#appearance-bloom").check();
    }
  };
  const generate = async (target, seed, mode = "local") => {
    await target.locator("#seed").fill(String(seed));
    await target.locator("#generate-" + mode).click();
    await target.waitForFunction(
      () =>
        document.querySelector('.status[role="status"]').textContent ===
        "Complete",
      null,
      { timeout: 30000 },
    );
    assert.match(
      await target.locator(".snapshot").innerText(),
      new RegExp("Seed " + seed),
    );
  };
  const runtimeInfo = (target) =>
    target.evaluate(async () =>
      (await import("/wasm/world-generator-host.js")).getRuntimeInfo(),
    );
  const cachedApiPaths = (target) =>
    target.evaluate(async () => {
      const paths = [];
      for (const name of await caches.keys()) {
        for (const request of await (await caches.open(name)).keys())
          if (new URL(request.url).pathname.startsWith("/api/"))
            paths.push(request.url);
      }
      return paths;
    });
  try {
    await page.goto(base);
    await ready(page);
    console.log("Ready: initial version");
    assert.equal(
      await page.evaluate(() => !!navigator.serviceWorker.controller),
      true,
    );
    const firstCatalog = await page
      .locator('meta[name="worldgen-offline-catalog"]')
      .getAttribute("content");
    await generate(page, 100, "local");
    await generate(page, 101, "remote");
    assert.deepEqual(await cachedApiPaths(page), []);

    console.log("Disabling networking");
    await context.setOffline(true);
    await page.reload({ waitUntil: "domcontentloaded" });
    await ready(page);
    await generate(page, 777);
    assert.equal((await runtimeInfo(page)).initCount, 1);
    const tab = await context.newPage();
    observe(tab);
    await tab.goto(base, { waitUntil: "domcontentloaded" });
    await ready(tab);
    await generate(tab, -778);
    assert.equal((await runtimeInfo(tab)).initCount, 1);
    await tab.locator("#generate-remote").click();
    await tab.locator('[role="alert"]').waitFor();
    assert.match(
      await tab.locator('[role="alert"]').innerText(),
      /unavailable/i,
    );
    assert.deepEqual(await cachedApiPaths(tab), []);
    console.log("Offline reload, new tab, Local and Remote failure verified");
    await context.setOffline(false);
    await generate(tab, 779, "remote");

    // Change only generated deployment assets to simulate a new Angular/WASM version.
    const loader = original.get("wasm/world-generator-host.js").toString();
    await fs.writeFile(
      path.join(webRoot, "wasm/world-generator-host.js"),
      loader + '\nexport const offlineSmokeVersion = "two";\n',
    );
    execFileSync(
      process.execPath,
      [path.join(repo, "scripts/finalize-pwa.mjs"), webRoot],
      { cwd: repo, stdio: "pipe" },
    );
    console.log("Checking changed deployment");
    await page.locator("#check-updates").click();
    await page.locator("#update-banner").waitFor({ timeout: 60000 });
    console.log("New version ready");
    assert.equal(
      await page
        .locator('meta[name="worldgen-offline-catalog"]')
        .getAttribute("content"),
      firstCatalog,
    );

    let releaseRequest;
    let sawRequest;
    const blocked = new Promise((resolve) => {
      sawRequest = resolve;
    });
    await context.route("**/api/v1/terrains", async (route) => {
      sawRequest();
      await new Promise((resolve) => {
        releaseRequest = resolve;
      });
      await route.continue();
    });
    await page.locator("#generate-remote").click();
    await Promise.race([
      blocked,
      new Promise((_, reject) =>
        setTimeout(
          () => reject(new Error("Remote request was not intercepted")),
          10_000,
        ),
      ),
    ]);
    assert.equal(await page.locator("#reload-update").isDisabled(), true);
    releaseRequest();
    await page.waitForFunction(
      () =>
        document.querySelector('.status[role="status"]').textContent ===
        "Complete",
    );
    await context.unroute("**/api/v1/terrains");
    await Promise.all([
      page.waitForNavigation({ waitUntil: "domcontentloaded" }),
      page.locator("#reload-update").click(),
    ]);
    await ready(page);
    const secondCatalog = await page
      .locator('meta[name="worldgen-offline-catalog"]')
      .getAttribute("content");
    assert.notEqual(secondCatalog, firstCatalog);
    assert.equal(
      await page.evaluate(
        async () =>
          (await import("/wasm/world-generator-host.js")).offlineSmokeVersion,
      ),
      "two",
    );
    await context.setOffline(true);
    await page.reload({ waitUntil: "domcontentloaded" });
    await ready(page);
    if (inlandSmoke) await page.locator("#seaLevel").fill("0");
    await generate(page, 1001);
    assert.equal(
      await page
        .locator('meta[name="worldgen-offline-catalog"]')
        .getAttribute("content"),
      secondCatalog,
    );
    assert.equal((await runtimeInfo(page)).initCount, 1);
    await page.locator("app-terrain-preview .display-time").first().waitFor();
    assert.equal((await runtimeInfo(page)).initCount, 1);
    if (bloomSmoke)
      assert.ok(
        await page
          .locator("app-terrain-preview canvas")
          .first()
          .evaluate((canvas) => {
            const gl = canvas.getContext("webgl2"),
              program = gl.getParameter(gl.CURRENT_PROGRAM);
            return gl.getUniformLocation(program, "finishBloom") !== null;
          }),
        "Updated offline renderer executes the bloom final shader",
      );
    if (inlandSmoke)
      assert.ok(
        await page.evaluate(() => window.__inlandDraws > 0),
        "Updated offline no-Ocean renderer draws inland river material",
      );
    if (shoreSmoke)
      assert.ok(
        await page.evaluate(() => window.__shoreStoneDraws > 0),
        "Updated offline renderer submits shoreline stone instances",
      );
    if (reedSmoke)
      assert.ok(
        await page.evaluate(() => window.__reedDraws > 0),
        "Updated offline renderer submits eligible shoreline reed instances",
      );
    assert.deepEqual(errors, []);
    const result = {
      pass: true,
      browser: browser.version(),
      onlineLocalRemote: true,
      offlineReload: true,
      offlineNewTab: true,
      newSeeds: [777, -778, 1001],
      remoteFailsOffline: true,
      remoteRecoversOnline: true,
      cachedApiResponses: 0,
      updateDeferredWhileBusy: true,
      updatedVersionOffline: true,
      updatedVersionTerrain3d: true,
      ...(bloomSmoke ? { updatedVersionBloom: true } : {}),
      ...(inlandSmoke ? { updatedVersionInlandWater: true } : {}),
      ...(shoreSmoke ? { updatedVersionShoreStones: true } : {}),
      ...(reedSmoke ? { updatedVersionReeds: true } : {}),
      firstCatalog,
      secondCatalog,
      pageErrors: errors,
    };
    await fs.writeFile(
      path.join(repo, "artifacts/pwa-verification.json"),
      JSON.stringify(result, null, 2),
    );
    console.log(JSON.stringify(result));
  } finally {
    await browser.close();
    // Restore the published source build; never modify repository source for this test.
    for (const name of await fs.readdir(webRoot))
      if (catalogPattern.test(name) && !original.has(name))
        await fs.unlink(path.join(webRoot, name));
    for (const [name, bytes] of original)
      await fs.writeFile(path.join(webRoot, name), bytes);
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
