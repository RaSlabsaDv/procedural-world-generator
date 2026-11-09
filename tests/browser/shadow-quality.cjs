// Paired production views and GPU shadow uniforms; no app debug hooks.
const assert = require("node:assert/strict"),
  fs = require("node:fs/promises"),
  crypto = require("node:crypto");
const {
  base,
  launchBrowser,
  waitForOfflineReady,
  useReferenceAppearance,
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
const contact = process.argv.includes("--contact");
const probe = process.argv.includes("--probe");
const study = contact
  ? probe
    ? "shadow-contact-probe"
    : "shadow-contact"
  : "shadow-quality";
const before = process.argv.includes("--before"),
  phase = before ? "before" : "after";
if (probe && (!before || !contact))
  throw new Error(
    "Use --before --contact --probe for isolated diagnostic captures.",
  );
const cases = [
  [
    "mountains",
    { seed: 42, plainsCoverage: 0, mountainCoverage: 1, heightMultiplier: 80 },
  ],
  [
    "forest",
    {
      seed: 42,
      plainsCoverage: 1,
      mountainCoverage: 0,
      globalMoisture: 1,
      seaLevel: 0,
    },
  ],
  [
    "rocks",
    {
      seed: 2026,
      plainsCoverage: 0.1,
      mountainCoverage: 0.8,
      heightMultiplier: 60,
    },
  ],
  ["coast", { seed: -7, seaLevel: 0.23, globalWarmth: 0.9 }],
  ["flat", { heightMultiplier: 0, iterations: 0 }],
  ["minimum", { width: 2, height: 2, heightMultiplier: 0, iterations: 0 }],
  [
    "maximum",
    {
      width: 512,
      height: 512,
      heightMultiplier: 60,
      plainsCoverage: 1,
      mountainCoverage: 0,
      globalMoisture: 1,
      seaLevel: 0,
      iterations: 0,
    },
  ],
];
(async () => {
  const browser = await launchBrowser();
  try {
    const context = await browser.newContext({
      viewport: { width: 1600, height: 1050 },
      reducedMotion: "reduce",
      deviceScaleFactor: 1,
    });
    await instrumentLighting(context);
    await context.addInitScript(
      ({ probe }) => {
        window.__shadowQuality = [];
        const get = HTMLCanvasElement.prototype.getContext;
        HTMLCanvasElement.prototype.getContext = function (...args) {
          const gl = get.apply(this, args);
          if (!gl || args[0] !== "webgl2" || gl.__quality) return gl;
          gl.__quality = true;
          const record = { gl, value: null };
          window.__shadowQuality.push(record);
          const draw = gl.drawElements;
          gl.drawElements = function (...args) {
            const p = gl.getParameter(gl.CURRENT_PROGRAM);
            if (
              !gl.getParameter(gl.FRAMEBUFFER_BINDING) &&
              gl.getAttribLocation(p, "biomeId") >= 0
            ) {
              const read = (n) => {
                const l = gl.getUniformLocation(p, n),
                  v = l === null ? null : gl.getUniform(p, l);
                return v?.length ? Array.from(v) : v;
              };
              if (probe) {
                const m = read("directionalShadowMatrix[0]");
                const range = 1 / Math.hypot(m[2], m[6], m[10]);
                const texel =
                  Math.max(
                    1 / Math.hypot(m[0], m[4], m[8]),
                    1 / Math.hypot(m[1], m[5], m[9]),
                  ) / 2048;
                gl.uniform1f(
                  gl.getUniformLocation(
                    p,
                    "directionalLightShadows[0].shadowBias",
                  ),
                  -Math.min(0.08, Math.max(0.002, 0.35 * texel)) / range,
                );
              }
              record.value = {
                projection: read("projectionMatrix"),
                modelView: read("modelViewMatrix"),
                matrix: read("directionalShadowMatrix[0]"),
                bias: read("directionalLightShadows[0].shadowBias"),
                normalBias: read("directionalLightShadows[0].shadowNormalBias"),
                radius: read("directionalLightShadows[0].shadowRadius"),
              };
            }
            return draw.apply(this, args);
          };
          return gl;
        };
      },
      { probe },
    );
    const page = await context.newPage(),
      errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text());
    });
    await page.goto(base);
    await waitForOfflineReady(page);
    await useReferenceAppearance(page);
    await page.locator("#sun-settings summary").click();
    await page.locator("#sun-time").waitFor();
    const captures = [];
    for (const [label, values] of cases.filter(
      ([label]) => !contact || ["forest", "maximum"].includes(label),
    )) {
      await page.locator("#reset-parameters").click();
      await fillParameters(page, {
        width: 129,
        height: 97,
        iterations: 16,
        ...values,
      });
      const params = await page
        .locator("app-terrain-parameters input[type=number]")
        .evaluateAll((inputs) =>
          Object.fromEntries(inputs.map((i) => [i.id, Number(i.value)])),
        );
      const heightMap = { algorithmVersion: "value-noise-fbm-v1" };
      for (const field of [
        "seed",
        "width",
        "height",
        "noiseScale",
        "octaves",
        "heightMultiplier",
      ]) {
        heightMap[field] = params[field];
        delete params[field];
      }
      const request = {
        ...params,
        heightMap,
        algorithmVersion: "diverse-landscape-v14",
      };
      await page.locator("#generate-local").click();
      await waitForTerrain(page);
      const result = await page.evaluate(async (request) => {
        const r = await fetch("/api/v1/terrains", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(request),
        });
        if (!r.ok) throw Error("Reference failed");
        const b = await r.json();
        return { result: b.result, simulation: b.simulation };
      }, request);
      const hash = crypto
        .createHash("sha256")
        .update(JSON.stringify(result))
        .digest("hex");
      const views = [];
      for (const [pose, hour, azimuth] of [
        ["noon", 12, 315],
        ["low-forward", 7, 225],
        ["low-side", 7, 135],
      ]) {
        await page.locator("#sun-time").fill(String(hour));
        await page.locator("#sun-direction").fill(String(azimuth));
        await page
          .getByRole("button", { name: "Reset camera", exact: true })
          .click();
        const canvas = page.locator("app-terrain-preview canvas");
        await canvas.scrollIntoViewIfNeeded();
        for (const [zoom, wheel] of [
          ["overview", 0],
          [
            "close",
            contact
              ? label === "maximum"
                ? -6000
                : -4000
              : label === "maximum"
                ? -3000
                : -1900,
          ],
        ]) {
          if (wheel) {
            const box = await canvas.boundingBox();
            await page.mouse.move(
              box.x + box.width / 2,
              box.y + box.height / 2,
            );
            await page.mouse.wheel(0, wheel);
          }
          await page.waitForTimeout(100);
          const screenshot = await canvas.screenshot({
            path: artifactPath(
              `${study}-${phase}-${label}-${pose}-${zoom}.png`,
            ),
          });
          const gpu = await page.evaluate(
            () =>
              window.__shadowQuality.findLast(
                (r) => !r.gl.isContextLost() && r.value,
              )?.value,
          );
          assert.ok(gpu?.matrix && gpu?.projection);
          const depthRange =
            1 / Math.hypot(gpu.matrix[2], gpu.matrix[6], gpu.matrix[10]);
          const texel =
            Math.max(
              1 / Math.hypot(gpu.matrix[0], gpu.matrix[4], gpu.matrix[8]),
              1 / Math.hypot(gpu.matrix[1], gpu.matrix[5], gpu.matrix[9]),
            ) / 2048;
          views.push({
            pose,
            hour,
            azimuth,
            zoom,
            wheel,
            camera: { projection: gpu.projection, modelView: gpu.modelView },
            shadow: {
              ...gpu,
              projection: undefined,
              modelView: undefined,
              depthRange,
              texelWorld: texel,
              biasWorld: Math.abs(gpu.bias) * depthRange,
            },
            imageHash: crypto
              .createHash("sha256")
              .update(screenshot)
              .digest("hex"),
          });
        }
      }
      const lights = (await lightingResources(page)).filter(
        (r) => !r.lost && r.detailTextures > 0,
      );
      for (const row of lights) {
        assert.equal(row.attachments.length, 2);
        assert.ok(
          row.attachments.every((a) => a.width === 2048 && a.height === 2048),
        );
        for (const p of row.passes.filter((p) => p.target === "shadow"))
          assert.ok(p.calls <= 19);
      }
      captures.push({
        label,
        request,
        resultHash: hash,
        trees: result.result.trees.length,
        rocks: result.result.rocks.length,
        views,
      });
      console.log(JSON.stringify({ label, phase, views: views.length }));
    }
    assert.deepEqual(errors, []);
    if (!before) {
      const baseline = JSON.parse(
        await fs.readFile(artifactPath(`${study}-before.json`), "utf8"),
      );
      const invariant = (rows) =>
        rows.map(({ label, request, resultHash, trees, rocks, views }) => ({
          label,
          request,
          resultHash,
          trees,
          rocks,
          views: views.map(({ pose, hour, azimuth, zoom, wheel, camera }) => ({
            pose,
            hour,
            azimuth,
            zoom,
            wheel,
            camera,
          })),
        }));
      assert.deepEqual(
        invariant(captures),
        invariant(baseline.captures),
        "Core, inputs and actual camera remain exact",
      );
      if (process.argv.includes("--unchanged"))
        assert.deepEqual(
          JSON.parse(JSON.stringify(captures)),
          baseline.captures,
          "Unchanged policy must retain every GPU shadow value and exact PNG hash",
        );
    }
    const report = {
      pass: true,
      phase,
      browser: browser.version(),
      captures,
      errors,
    };
    await fs.writeFile(
      artifactPath(`${study}-${phase}.json`),
      JSON.stringify(report, null, 2),
    );
    console.log(
      JSON.stringify({
        pass: true,
        phase,
        cases: captures.length,
        views: captures.reduce((n, c) => n + c.views.length, 0),
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
