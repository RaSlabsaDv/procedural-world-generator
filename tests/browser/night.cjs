// Pixel-level regression: foam responds to night light and the shared sky has a moon.
const assert = require("node:assert/strict"),
  fs = require("node:fs/promises");
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
(async () => {
  const browser = await launchBrowser();
  try {
    const context = await browser.newContext({
      viewport: { width: 1600, height: 1050 },
      deviceScaleFactor: 1,
      reducedMotion: "reduce",
    });
    await context.addInitScript(() => {
      window.__zeroFoamDraws = 0;
      const get = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (...args) {
        const gl = get.apply(this, args);
        if (!gl || args[0] !== "webgl2" || gl.__nightProbe) return gl;
        gl.__nightProbe = true;
        const draw = gl.drawElements;
        gl.drawElements = function (...args) {
          if (!window.__waterBlackout) return draw.apply(this, args);
          const p = gl.getParameter(gl.CURRENT_PROGRAM);
          if (gl.getUniformLocation(p, "waterTime") === null)
            return draw.apply(this, args);
          const values = [
            "environmentSunIntensity",
            "environmentFillIntensity",
          ].map((n) => {
            const loc = gl.getUniformLocation(p, n);
            return [loc, gl.getUniform(p, loc)];
          });
          for (const [loc] of values) gl.uniform1f(loc, 0);
          window.__zeroFoamDraws++;
          try {
            return draw.apply(this, args);
          } finally {
            for (const [loc, value] of values) gl.uniform1f(loc, value);
          }
        };
        return gl;
      };
    });
    const page = await context.newPage(),
      errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text());
    });
    await page.goto(base);
    await waitForOfflineReady(page);
    await fillParameters(page, {
      width: 129,
      height: 97,
      seed: -7,
      seaLevel: 0.23,
      iterations: 0,
    });
    await page.locator("#generate-local").click();
    await waitForTerrain(page);
    await page.locator("#sun-settings summary").click();
    await page.locator("#sun-time").waitFor();
    await page.locator("#water-settings summary").click();
    await page.locator("#atmosphere-settings summary").click();
    await page.locator("#atmosphere-enabled").uncheck();
    const canvas = page.locator("app-terrain-preview canvas");
    const captures = {};
    for (const [name, hour] of [
      ["day", "12"],
      ["night", "0"],
    ]) {
      await page.locator("#sun-time").fill(hour);
      for (const foam of ["0", "1"]) {
        await page.locator("#water-foam").fill(foam);
        captures[name + foam] = (
          await canvas.screenshot({
            path: artifactPath(`night-foam-${name}-${foam}.png`),
          })
        ).toString("base64");
      }
    }
    await page.evaluate(() => {
      window.__waterBlackout = true;
    });
    for (const foam of ["0", "1"]) {
      await page.locator("#water-foam").fill(foam);
      captures["zero" + foam] = (await canvas.screenshot()).toString("base64");
    }
    assert.ok(await page.evaluate(() => window.__zeroFoamDraws > 0));
    await page.evaluate(() => {
      window.__waterBlackout = false;
    });
    const differences = await page.evaluate(async (data) => {
      async function pixels(base64) {
        const image = await createImageBitmap(
          await (await fetch("data:image/png;base64," + base64)).blob(),
        );
        const c = document.createElement("canvas");
        c.width = image.width;
        c.height = image.height;
        const ctx = c.getContext("2d");
        ctx.drawImage(image, 0, 0);
        return ctx.getImageData(0, 0, c.width, c.height).data;
      }
      const result = {};
      for (const name of ["day", "night", "zero"]) {
        const a = await pixels(data[name + "0"]),
          b = await pixels(data[name + "1"]);
        let positive = 0;
        for (let i = 0; i < a.length; i++)
          if (i % 4 !== 3) positive += Math.max(0, b[i] - a[i]);
        result[name] = positive;
      }
      return result;
    }, captures);
    assert.ok(differences.day > 1000, "Noon foam is visibly present");
    assert.ok(
      differences.night < differences.day * 0.35,
      "Night foam loses its emissive white outline",
    );
    assert.ok(
      differences.zero < differences.day * 0.01,
      "Zero illumination adds no bright foam",
    );
    await page.locator("#atmosphere-enabled").check();
    await fillParameters(page, {
      width: 2,
      height: 2,
      heightMultiplier: 0,
      seaLevel: 0,
      iterations: 0,
    });
    await page.locator("#generate-local").click();
    await waitForTerrain(page);
    await page.locator("#sun-time").fill("0");
    await page.locator("#sun-direction").fill("45");
    await canvas.scrollIntoViewIfNeeded();
    const box = await canvas.boundingBox();
    // Orbit below the zero-height, back-face-culled test plane to point at the sky.
    // Initial 35.264-degree downward view +90-degree orbit gives the moon's54.736 elevation.
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(
      box.x + box.width / 2,
      box.y + box.height / 2 - box.height * 0.25,
      { steps: 16 },
    );
    await page.mouse.up();
    const moonNight = await canvas.screenshot({
      path: artifactPath("night-moon.png"),
    });
    await page.locator("#sun-time").fill("12");
    const moonDay = await canvas.screenshot({
      path: artifactPath("night-moon-day-reference.png"),
    });
    const moon = await page.evaluate(
      async (data) => {
        const out = {};
        for (const [name, base64] of Object.entries(data)) {
          const image = await createImageBitmap(
              await (await fetch("data:image/png;base64," + base64)).blob(),
            ),
            c = document.createElement("canvas");
          c.width = image.width;
          c.height = image.height;
          const ctx = c.getContext("2d");
          ctx.drawImage(image, 0, 0);
          const luma = (x, y) => {
            const p = ctx.getImageData(x, y, 1, 1).data;
            return (0.2126 * p[0] + 0.7152 * p[1] + 0.0722 * p[2]) / 255;
          };
          out[name] = {
            center: luma(Math.floor(c.width / 2), Math.floor(c.height / 2)),
            background: luma(
              Math.floor(c.width / 2) + 45,
              Math.floor(c.height / 2),
            ),
          };
        }
        return out;
      },
      { night: moonNight.toString("base64"), day: moonDay.toString("base64") },
    );
    assert.ok(
      moon.night.center > moon.night.background + 0.25,
      "Visible night moon disk",
    );
    assert.ok(
      Math.abs(moon.day.center - moon.day.background) < 0.08,
      "No opposite-sun moon disk at noon",
    );
    await context.setOffline(true);
    await page.reload();
    await waitForOfflineReady(page);
    await page.locator("#sun-settings summary").click();
    await page.locator("#sun-time").fill("0");
    await fillParameters(page, {
      width: 33,
      height: 25,
      iterations: 0,
      seed: 112233,
    });
    await page.locator("#generate-local").click();
    await waitForTerrain(page);
    assert.deepEqual(errors, []);
    const report = {
      pass: true,
      browser: browser.version(),
      differences,
      moon,
      offline: true,
      errors,
    };
    await fs.writeFile(
      artifactPath("night-verification.json"),
      JSON.stringify(report, null, 2),
    );
    console.log(JSON.stringify(report));
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
