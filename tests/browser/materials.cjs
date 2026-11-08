const {
  waitForTerrain,
  fillParameters,
  artifactPath,
} = require("./support/editor.cjs");
// Real shader/PNG decoding, bounded texture ownership and reproducible surface views.
const {
  base,
  launchBrowser,
  waitForOfflineReady,
} = require("./support/browser.cjs");
const assert = require("node:assert/strict");
const {
  instrumentLighting,
  lightingResources,
} = require("./support/lighting.cjs");
const fs = require("node:fs/promises");
const path = require("node:path");
const artifact = artifactPath;
(async () => {
  const browser = await launchBrowser();
  try {
    const context = await browser.newContext({
      viewport: { width: 1600, height: 1050 },
      reducedMotion: "reduce",
    });
    await instrumentLighting(context);
    await context.addInitScript(() => {
      // Test-only instrumentation; no telemetry/debug API is added to the product.
      window.__surfaceContexts = [];
      const getContext = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (...args) {
        const gl = getContext.apply(this, args);
        if (!gl || args[0] !== "webgl2" || gl.__surfaceMeasured) return gl;
        gl.__surfaceMeasured = true;
        const record = {
          gl,
          textures: new Set(),
          waterTextures: new Set(),
          waterCalls: 0,
          skyCalls: 0,
          sources: new Set(),
          calls: 0,
          instances: 0,
          terrainCalls: 0,
          biomeBuffers: new Map(),
          biomeAttribute: null,
        };
        window.__surfaceContexts.push(record);
        for (const name of ["texImage2D", "texSubImage2D"]) {
          const original = gl[name];
          gl[name] = function (...args) {
            const source = args.at(-1)?.src;
            if (
              typeof source === "string" &&
              source.includes("/textures/terrain/")
            ) {
              record.textures.add(gl.getParameter(gl.TEXTURE_BINDING_2D));
              record.sources.add(source.split("/").at(-1));
            }
            if (
              typeof source === "string" &&
              source.includes("/textures/water/")
            )
              record.waterTextures.add(gl.getParameter(gl.TEXTURE_BINDING_2D));
            return original.apply(this, args);
          };
        }
        const remove = gl.deleteTexture;
        gl.deleteTexture = function (texture) {
          record.textures.delete(texture);
          record.waterTextures.delete(texture);
          return remove.call(this, texture);
        };
        const clear = gl.clear;
        gl.clear = function (...args) {
          record.calls = 0;
          record.instances = 0;
          record.terrainCalls = 0;
          record.waterCalls = 0;
          record.skyCalls = 0;
          return clear.apply(this, args);
        };
        for (const name of [
          "drawElements",
          "drawArrays",
          "drawElementsInstanced",
          "drawArraysInstanced",
        ]) {
          const original = gl[name];
          gl[name] = function (...args) {
            record.calls++;
            const program = gl.getParameter(gl.CURRENT_PROGRAM);
            if (program && gl.getUniformLocation(program, "waterTime") !== null)
              record.waterCalls++;
            if (
              program &&
              gl.getUniformLocation(program, "skyProjectionInverse") !== null
            )
              record.skyCalls++;
            const location = program
              ? gl.getAttribLocation(program, "biomeId")
              : -1;
            if (location >= 0) {
              const buffer = gl.getVertexAttrib(
                location,
                gl.VERTEX_ATTRIB_ARRAY_BUFFER_BINDING,
              );
              const previous = gl.getParameter(gl.ARRAY_BUFFER_BINDING);
              gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
              const bytes = gl.getBufferParameter(
                gl.ARRAY_BUFFER,
                gl.BUFFER_SIZE,
              );
              gl.bindBuffer(gl.ARRAY_BUFFER, previous);
              record.biomeBuffers.set(buffer, bytes);
              record.biomeAttribute = {
                bytes,
                type: gl.getVertexAttrib(location, gl.VERTEX_ATTRIB_ARRAY_TYPE),
                size: gl.getVertexAttrib(location, gl.VERTEX_ATTRIB_ARRAY_SIZE),
                normalized: gl.getVertexAttrib(
                  location,
                  gl.VERTEX_ATTRIB_ARRAY_NORMALIZED,
                ),
                activeAttributes: gl.getProgramParameter(
                  program,
                  gl.ACTIVE_ATTRIBUTES,
                ),
                maxAttributes: gl.getParameter(gl.MAX_VERTEX_ATTRIBS),
                maxVaryingVectors: gl.getParameter(gl.MAX_VARYING_VECTORS),
              };
            }
            if (name.endsWith("Instanced")) record.instances += args.at(-1);
            if (!name.endsWith("Instanced")) record.terrainCalls++;
            return original.apply(this, args);
          };
        }
        return gl;
      };
    });
    const page = await context.newPage(),
      errors = [];
    const coverageChecks = [];
    // Read large response bodies inside the page, returning only tiny diagnostics through CDP.
    const checkCoverage = () =>
      page.evaluate(async () => {
        const parameters = Object.fromEntries(
          [
            ...document.querySelectorAll(
              "app-terrain-parameters input[type=number]",
            ),
          ].map((input) => [input.id, Number(input.value)]),
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
          heightMap[field] = parameters[field];
          delete parameters[field];
        }
        const response = await fetch("/api/v1/terrains", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...parameters,
            heightMap,
            algorithmVersion: "diverse-landscape-v10",
          }),
        });
        if (!response.ok)
          throw Error("Coverage diagnostic API failed: " + response.status);
        const { result } = await response.json(),
          weights = result.surfaceWeights;
        if (
          !Array.isArray(weights) ||
          weights.length !== result.width * result.height * 5
        )
          throw Error("Coverage shape");
        for (let i = 0; i < result.width * result.height; i++) {
          let sum = 0;
          for (let j = 0; j < 5; j++) {
            const value = weights[i * 5 + j];
            if (
              !Number.isFinite(value) ||
              value < 0 ||
              value > 1 ||
              (result.biomes[i] === 0 && value !== 0)
            )
              throw Error("Coverage field");
            sum += Math.fround(value);
          }
          if (Math.abs(sum - (result.biomes[i] === 0 ? 0 : 1)) > 1e-6)
            throw Error("Coverage sum");
        }
        const kindVariants = Array(6).fill(0);
        for (const tree of result.trees) {
          if (
            !Number.isInteger(tree.kind) ||
            tree.kind < 0 ||
            tree.kind > 2 ||
            !Number.isInteger(tree.variant) ||
            tree.variant < 0 ||
            tree.variant > 1
          )
            throw Error("Tree kind/variant");
          kindVariants[tree.kind * 2 + tree.variant]++;
        }
        return {
          rockCount: result.rocks.length,
          rockGroups: new Set(result.rocks.map((r) => r.kind + ":" + r.variant))
            .size,
          rockKindVariantCounts: Array.from(
            { length: 6 },
            (_, k) =>
              result.rocks.filter((r) => r.kind * 2 + r.variant === k).length,
          ),
          rockInstanceMatrixBytes: result.rocks.length * 16 * 4,
          treeCount: result.trees.length,
          kindVariantCounts: kindVariants,
          vegetationGroups: kindVariants.filter((count) => count > 0).length,
          instanceMatrixBytes: result.trees.length * 2 * 16 * 4,
          samples: result.width * result.height,
          rawBytes: weights.length * 4,
          gpuAttributeBytes: result.width * result.height * 20,
        };
      });
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    await page.goto(base);
    await waitForOfflineReady(page);
    const complete = () => waitForTerrain(page, 30000);
    const resources = async () =>
      page.evaluate(() =>
        window.__surfaceContexts.map(
          ({
            gl,
            textures,
            waterTextures,
            waterCalls,
            skyCalls,
            sources,
            calls,
            terrainCalls,
            instances,
            biomeBuffers,
            biomeAttribute,
          }) => ({
            lost: gl.isContextLost(),
            biomeAttribute,
            liveBiomeBuffers: [...biomeBuffers].filter(([buffer]) =>
              gl.isBuffer(buffer),
            ).length,
            textures: textures.size,
            waterTextures: waterTextures.size,
            waterCalls,
            skyCalls,
            sources: [...sources].sort(),
            calls,
            terrainCalls,
            instances,
          }),
        ),
      );
    const assertResources = async (views) => {
      const rows = await resources(),
        live = rows.filter((row) => !row.lost && row.textures > 0);
      assert.equal(live.length, views);
      for (const row of live) {
        assert.equal(row.textures, 5);
        assert.equal(
          row.liveBiomeBuffers,
          1,
          "Replaced geometry must release its biome buffer",
        );
        assert.equal(row.biomeAttribute.type, 5121, "UNSIGNED_BYTE");
        assert.equal(row.biomeAttribute.size, 1);
        assert.equal(row.biomeAttribute.normalized, false);
        assert.ok(
          row.biomeAttribute.activeAttributes <=
            row.biomeAttribute.maxAttributes,
        );
        assert.ok(row.biomeAttribute.maxVaryingVectors > 0);
        assert.deepEqual(row.sources, [
          "grass.png",
          "rock.png",
          "sand.png",
          "snow.png",
          "soil.png",
        ]);
        assert.equal(row.terrainCalls, 1 + row.waterCalls + row.skyCalls);
        assert.equal(row.skyCalls, 1);
        assert.ok(row.waterCalls <= 1);
        assert.ok(row.waterTextures <= 1);
        assert.ok(
          row.calls <= 19 + row.waterCalls + row.skyCalls,
          "Color pass: terrain, twelve tree, six rock meshes, plus one Ocean and one sky draw",
        );
      }
      for (const row of rows.filter((row) => row.lost)) {
        assert.equal(row.textures, 0);
        assert.equal(row.waterTextures, 0);
        assert.equal(row.liveBiomeBuffers, 0);
      }
      const lighting = await lightingResources(page);
      for (const row of lighting.filter(
        (row) => !row.lost && row.detailTextures > 0,
      )) {
        assert.equal(row.attachments.length, 2);
        for (const attachment of row.attachments)
          assert.ok(
            attachment.width <= 2048 &&
              attachment.height <= 2048 &&
              attachment.levels === 1,
          );
        assert.ok(
          row.attachments.reduce((sum, a) => sum + a.estimatedBytes, 0) <=
            64 * 1024 * 1024,
        );
        assert.equal(row.activeShadowUpdates, 1);
        for (const pass of row.passes.filter((pass) => pass.calls > 0))
          assert.ok(pass.calls <= 19);
      }
      for (const row of lighting.filter(
        (row) => row.lost || row.detailTextures === 0,
      ))
        assert.equal(
          row.attachments.length,
          0,
          "Destroyed view must release shadow attachments",
        );
      return rows;
    };
    const captures = [];
    for (const [
      label,
      seed,
      warmth,
      moisture,
      height = 97,
      iterations = 16,
    ] of [
      ["normal", 42, 0.6, 0.65],
      ["cold", 2026, 0.25, 0.8],
      ["warm", -7, 0.9, 0.45],
      ["conifer", 2026, 0.38, 0.8],
      // v9 climate fixture: exercises all three species and both variants.
      ["mixed", 42, 0.7, 0.65, 129, 32],
    ]) {
      const fields = {
        seed,
        width: 129,
        height,
        iterations,
        globalWarmth: warmth,
        globalMoisture: moisture,
      };
      await fillParameters(page, fields);
      await page.locator("#generate-local").click();
      await complete();
      const canvas = page.locator("app-terrain-preview canvas");
      await canvas.screenshot({
        path: artifact(`coasts-materials-after-${label}-overview.png`),
      });
      await canvas.hover();
      await page.mouse.wheel(0, -650);
      await page.waitForTimeout(350);
      await canvas.screenshot({
        path: artifact(`coasts-materials-after-${label}-close.png`),
      });
      await page.mouse.wheel(0, -700);
      await page.waitForTimeout(200);
      await canvas.screenshot({
        path: artifact(`coasts-materials-after-${label}-detail.png`),
      });
      const parameters = await page
        .locator("app-terrain-parameters input[type=number]")
        .evaluateAll((inputs) =>
          Object.fromEntries(
            inputs.map((input) => [input.id, Number(input.value)]),
          ),
        );
      const diagnostic = await checkCoverage();
      if (label === "mixed") assert.equal(diagnostic.vegetationGroups, 6);
      coverageChecks.push(diagnostic);
      const actual = await assertResources(1);
      assert.equal(
        actual.find((row) => !row.lost && row.textures > 0).calls,
        1 +
          diagnostic.vegetationGroups * 2 +
          diagnostic.rockGroups +
          actual.find((row) => !row.lost && row.textures > 0).waterCalls +
          actual.find((row) => !row.lost && row.textures > 0).skyCalls,
      );
      assert.equal(
        actual.find((row) => !row.lost && row.textures > 0).instances,
        diagnostic.treeCount * 2 + diagnostic.rockCount,
      );
      captures.push({
        label,
        parameters,
        algorithmVersion: "diverse-landscape-v10",
        wheelDelta: -650,
        resources: await assertResources(1),
        lighting: await lightingResources(page),
      });
      await page
        .getByRole("button", { name: "Reset camera", exact: true })
        .click();
    }
    await page.locator("#verify-equivalence").click();
    await complete();
    await page.locator("#compare-views").click();
    await page.locator("app-terrain-preview .display-time").nth(1).waitFor();
    const comparison = await assertResources(2);
    const comparisonLighting = await lightingResources(page);
    await page.locator("#select-remote").click();
    await page.waitForFunction(
      () => document.querySelectorAll("app-terrain-preview").length === 1,
    );
    await page.locator("app-terrain-preview .display-time").waitFor();
    await assertResources(1);
    await fillParameters(page, {
      seed: -7,
      width: 512,
      height: 512,
      iterations: 0,
      plainsCoverage: 1,
      mountainCoverage: 0,
      globalWarmth: 0.6,
      globalMoisture: 1,
      seaLevel: 0,
    });
    await page.locator("#generate-remote").click();
    await complete();
    assert.match(
      await page
        .locator(
          '.measurement[aria-label="Remote API measurements"] .tree-count',
        )
        .innerText(),
      /16384/,
    );
    const maximum = await assertResources(1);
    assert.equal(
      maximum.find((row) => !row.lost && row.textures > 0).biomeAttribute.bytes,
      262144,
    );
    const maximumLighting = await lightingResources(page);
    const maxCanvas = page.locator("app-terrain-preview canvas");
    await maxCanvas.screenshot({
      path: artifact("coasts-maximum-overview.png"),
    });
    await maxCanvas.hover();
    await page.mouse.wheel(0, -900);
    await page.waitForTimeout(200);
    await maxCanvas.screenshot({
      path: artifact("coasts-maximum-close.png"),
    });
    await page
      .getByRole("button", { name: "Reset camera", exact: true })
      .click();
    const maxDiagnostic = await checkCoverage();
    coverageChecks.push(maxDiagnostic);
    assert.ok(
      maxDiagnostic.rockCount < 8192,
      "Sparse rock placement must not fill the cap",
    );
    assert.equal(
      maximum.find((row) => !row.lost && row.textures > 0).instances,
      maxDiagnostic.treeCount * 2 + maxDiagnostic.rockCount,
    );
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
    );
    await page.locator("#reset-parameters").click();
    await context.setOffline(true);
    await page.reload({ waitUntil: "domcontentloaded" });
    await waitForOfflineReady(page);
    await page.locator("#seed").fill("-8812");
    await page.locator("#generate-local").click();
    await complete();
    const offline = await assertResources(1);
    assert.deepEqual(errors, []);
    const names = ["grass", "soil", "sand", "rock", "snow"];
    const encodedBytes = (
      await Promise.all(
        names.map((name) =>
          fs.stat(
            path.resolve(
              __dirname,
              "../../src/client/public/textures/terrain/" + name + ".png",
            ),
          ),
        ),
      )
    ).reduce((sum, stat) => sum + stat.size, 0);
    const evidence = {
      pass: true,
      browser: browser.version(),
      captures,
      coverageChecks,
      comparison,
      comparisonLighting,
      maximumLighting,
      lighting: await lightingResources(page),
      maximum,
      offline,
      encodedBytes,
      estimatedRgbaMipBytesPerViewport: 5 * ((256 * 256 * 4 * 4) / 3),
      pageErrors: errors,
    };
    await fs.writeFile(
      artifact("coasts-materials-verification.json"),
      JSON.stringify(evidence, null, 2),
    );
    console.log(JSON.stringify(evidence));
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
