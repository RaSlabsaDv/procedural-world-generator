// Standalone assessment bundle; no Angular/public source mutation or prototype shipping.
const assert = require("node:assert/strict"),
  path = require("node:path"),
  fs = require("node:fs/promises");
const { build } = require("../../src/client/node_modules/esbuild");
const { base, launchBrowser } = require("./support/browser.cjs");
const { artifactPath } = require("./support/editor.cjs");
const policy = require("./ssao/policy.json");
const crypto = require("node:crypto"),
  { execFileSync } = require("node:child_process");
(async () => {
  const built = await build({
    entryPoints: [path.resolve(__dirname, "ssao/entry.ts")],
    bundle: true,
    format: "esm",
    platform: "browser",
    write: false,
    nodePaths: [path.resolve(__dirname, "../../src/client/node_modules")],
    tsconfig: path.resolve(__dirname, "../../src/client/tsconfig.json"),
    external: ["/wasm/*"],
  });
  const source = built.outputFiles[0].text,
    browser = await launchBrowser();
  try {
    const context = await browser.newContext({
      viewport: { width: 1800, height: 1100 },
      reducedMotion: "reduce",
    });
    await context.route("**/__ssao_assessment__.js", (route) =>
      route.fulfill({ contentType: "application/javascript", body: source }),
    );
    await context.route("**/__ssao_assessment__.html", (route) =>
      route.fulfill({
        contentType: "text/html",
        body: "<!doctype html><style>body{margin:0;background:#222;display:flex;flex-wrap:wrap}canvas{display:block}</style>",
      }),
    );
    const page = await context.newPage(),
      errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text());
    });
    await page.goto(base + "/__ssao_assessment__.html");
    await page.evaluate(async () => {
      window.study = await import("/__ssao_assessment__.js");
    });
    const cases = [];
    for (const item of policy.cases) {
      console.log("Assessing " + item.name);
      const data = await page.evaluate(async (fields) => {
        window.data = await window.study.fetchTerrain(fields);
        window.view = await window.study.createView(window.data, "study");
        return {
          remoteHash: window.data.remoteHash,
          localHash: window.data.localHash,
          numericMatch: window.data.comparison.numericMatch,
          request: window.data.request,
          remoteBuildId: window.data.remoteBuildId,
          localBuildId: window.data.localBuildId,
        };
      }, item.fields);
      const views = [];
      for (const camera of ["overview", "close"]) {
        if (camera === "close")
          await page.evaluate(() => window.view.setClose());
        await page.evaluate(() => window.view.render(false));
        const off = await page.evaluate(() => window.view.render(false));
        const before = await page.locator("#study").screenshot({
          path: artifactPath(`ssao-${item.name}-${camera}-off.png`),
        });
        const on = await page.evaluate(() => window.view.render(true));
        assert.deepEqual(on.camera, off.camera);
        await page.locator("#study").screenshot({
          path: artifactPath(`ssao-${item.name}-${camera}-on.png`),
        });
        const grassAtOverview =
          camera === "overview"
            ? await page.evaluate(() => window.view.grassDiagnostic())
            : null;
        if (grassAtOverview)
          await page.evaluate(() => window.view.render(true));
        const metric = await page.evaluate(() => {
          const m = window.view.metrics();
          return { ...m, raw: undefined, blur: undefined };
        });
        await page.evaluate(() => window.view.render(false));
        assert.deepEqual(
          await page.locator("#study").screenshot(),
          before,
          "Disabled rendering remains exact after assessment",
        );
        assert.ok(
          on.calls.filter((c) => c.type === "assessment").length <=
            policy.maxExtraSceneCalls,
        );
        views.push({ camera, off, on, metric, grassAtOverview });
      }
      const grass = await page.evaluate(() => {
        window.view.render(true);
        return window.view.grassDiagnostic();
      });
      const failure = await page.evaluate(() => window.view.failure());
      assert.ok(
        failure.targetRestored &&
          failure.overrideRestored &&
          failure.visibilityRestored &&
          failure.autoClearRestored,
      );
      const snapshot = await page.evaluate(() => window.view.snapshot());
      assert.equal(snapshot.dataHash, snapshot.initialData);
      assert.equal(snapshot.canonicalHash, snapshot.initialCanonical);
      assert.ok(snapshot.sourceLayerExcluded);
      assert.ok(snapshot.memory.bytes <= policy.maxExtraBytesPerView);
      const device = await page.evaluate(() => window.view.device);
      const cleanup = await page.evaluate(() => window.view.dispose());
      assert.equal(cleanup.leakedCandidateTextures, 0);
      cases.push({
        name: item.name,
        data,
        views,
        grass,
        failure,
        snapshot,
        device,
        cleanup,
      });
    }
    console.log("Assessing light, bloom, motion and two-view diagnostics");
    await page.evaluate(async () => {
      window.data = await window.study.fetchTerrain({
        seed: 42,
        globalMoisture: 1,
      });
      window.view = await window.study.createView(window.data, "study");
      window.view.setClose();
    });
    const extra = [];
    for (const [label, hour, bloom] of [
      ["low", 6.25, false],
      ["night", 0, false],
      ["bloom", 12, true],
    ]) {
      await page.evaluate(
        ({ hour, bloom }) => {
          window.view.setHour(hour);
          window.view.setBloom(bloom);
          window.view.render(false);
        },
        { hour, bloom },
      );
      const off = await page.evaluate(() => window.view.render(false));
      const image = await page
        .locator("#study")
        .screenshot({ path: artifactPath(`ssao-${label}-off.png`) });
      const on = await page.evaluate(() => window.view.render(true));
      await page
        .locator("#study")
        .screenshot({ path: artifactPath(`ssao-${label}-on.png`) });
      assert.deepEqual(off.camera, on.camera);
      await page.evaluate(() => window.view.render(false));
      assert.deepEqual(await page.locator("#study").screenshot(), image);
      extra.push({ label, off, on });
    }
    const motion = [];
    for (const dx of [0.25, 0.25, 36, -36]) {
      const frame = await page.evaluate((dx) => {
        window.view.move(dx);
        return {
          render: window.view.render(true),
          lod: window.view.lodCounts(),
        };
      }, dx);
      await page
        .locator("#study")
        .screenshot({ path: artifactPath(`ssao-motion-${motion.length}.png`) });
      motion.push(frame);
    }
    await page.evaluate(() => {
      window.view.resize(390, 560);
      window.view.render(true);
    });
    const resized = await page.evaluate(() => window.view.snapshot());
    assert.ok(resized.memory.bytes <= policy.maxExtraBytesPerView);
    assert.equal(
      (await page.evaluate(() => window.view.dispose()))
        .leakedCandidateTextures,
      0,
    );
    await page.evaluate(async () => {
      window.view = await window.study.createView(window.data, "one", 480, 400);
      window.other = await window.study.createView(
        window.data,
        "two",
        480,
        400,
      );
      window.view.render(true);
      window.other.render(true);
    });
    const pair = await page.evaluate(async () => ({
      a: await window.view.snapshot(),
      b: await window.other.snapshot(),
      independent: window.view
        .targets()
        .every((a) =>
          window.other
            .targets()
            .every((b) => a !== b && a.texture !== b.texture),
        ),
    }));
    assert.ok(pair.independent);
    assert.ok(
      pair.a.memory.bytes + pair.b.memory.bytes <=
        2 * policy.maxExtraBytesPerView,
    );
    await page
      .locator("#one")
      .screenshot({ path: artifactPath("ssao-two-view-one.png") });
    await page
      .locator("#two")
      .screenshot({ path: artifactPath("ssao-two-view-two.png") });
    const pairCleanup = await page.evaluate(() => [
      window.view.dispose(),
      window.other.dispose(),
    ]);
    for (const row of pairCleanup) assert.equal(row.leakedCandidateTextures, 0);
    console.log("Assessing a contact fixture with zero ambient light");
    await page.evaluate(async () => {
      const data = await window.study.fetchTerrain({
        width: 65,
        height: 49,
        heightMultiplier: 0,
        seaLevel: 0,
        vegetationDensity: 0,
        iterations: 0,
      });
      window.view = await window.study.createView(
        data,
        "contact",
        800,
        600,
        true,
      );
      window.view.ambientZero();
      window.view.render(false);
      window.view.render(false);
    });
    const contactOff = await page
      .locator("#contact")
      .screenshot({ path: artifactPath("ssao-direct-only-off.png") });
    await page.evaluate(() => window.view.render(true));
    const contactOn = await page
      .locator("#contact")
      .screenshot({ path: artifactPath("ssao-direct-only-on.png") });
    const directOnlyChanged = !contactOff.equals(contactOn);
    const contactMetric = await page.evaluate(() => {
      const m = window.view.metrics();
      return { ...m, raw: undefined, blur: undefined };
    });
    assert.equal(
      (await page.evaluate(() => window.view.dispose()))
        .leakedCandidateTextures,
      0,
    );
    const gates = {
      backgroundProtected: cases.every((c) =>
        c.views.every((v) => v.metric.backgroundAffected === 0),
      ),
      waterProtected: cases.every((c) =>
        c.views.every((v) => v.metric.waterAffected === 0),
      ),
      fadedGrassCorrect: cases.every((c) =>
        c.views.every(
          (v) =>
            !v.grassAtOverview?.fullyFaded ||
            !v.grassAtOverview.normalPixelsChanged,
        ),
      ),
      ambientOnly: !directOnlyChanged,
      hardwareVerified: false,
    };
    assert.ok(
      !gates.backgroundProtected ||
        !gates.waterProtected ||
        !gates.fadedGrassCorrect ||
        !gates.ambientOnly,
      "Assessment must retain measured rejection evidence",
    );
    assert.deepEqual(errors, []);
    const report = {
      revision: policy.revision,
      environment: {
        browser: browser.version(),
        gitHead: execFileSync("git", ["rev-parse", "HEAD"], {
          encoding: "utf8",
        }).trim(),
        dirty:
          execFileSync("git", ["status", "--porcelain"], {
            encoding: "utf8",
          }).trim().length > 0,
        bundleSha256: crypto.createHash("sha256").update(source).digest("hex"),
        policySha256: crypto
          .createHash("sha256")
          .update(JSON.stringify(policy))
          .digest("hex"),
        hardwareGpuTiming: {
          status: "unresolved",
          samples: null,
          gpuMs: null,
          reason:
            "Only SwiftShader software rendering was exercised; timer support is not hardware evidence.",
        },
      },
      cases,
      extra,
      motion,
      resized,
      pair,
      pairCleanup,
      contactMetric,
      directOnlyChanged,
      gates,
      decision:
        "Reject the stock candidate; defer production SSAO pending correct G-buffer/ambient integration and hardware evidence.",
      errors,
    };
    await fs.writeFile(
      artifactPath("ssao-assessment.json"),
      JSON.stringify(report, null, 2),
    );
    console.log(
      JSON.stringify({
        pass: true,
        cases: cases.length,
        gates,
        decision: report.decision,
        errors,
      }),
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
