// Shared-Core drainage/river parity and graph invariants, using the real WASM runtime.
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const {
  base,
  launchBrowser,
  waitForOfflineReady,
} = require("./support/browser.cjs");
const { artifactPath } = require("./support/editor.cjs");
(async () => {
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(base);
    await waitForOfflineReady(page);
    const rows = await page.evaluate(async () => {
      const runtime = await (
        await import("/wasm/world-generator-host.js")
      ).getWorldGenerator();
      const rows = [];
      for (const [width, height, seed, seaLevel, heightMultiplier] of [
        [2, 2, -2147483648, 0, 0],
        [3, 2, 2147483647, 0.16, 30],
        [17, 9, -7, 0, 30],
        [65, 49, 42, 0.16, 30],
        [65, 49, 2026, 0.23, 30],
        [129, 97, 42, 0.16, 30],
        [512, 512, -7, 0, 80],
      ]) {
        const request = {
          heightMap: {
            seed,
            width,
            height,
            noiseScale: 0.03,
            octaves: 4,
            heightMultiplier,
            algorithmVersion: "value-noise-fbm-v1",
          },
          mountainStrength: 0.55,
          warpStrength: 2,
          iterations: width === 129 ? 8 : 0,
          rainfall: 0.05,
          evaporation: 0.1,
          plainsCoverage: 0.45,
          mountainCoverage: 0.3,
          globalMoisture: 0.65,
          seaLevel,
          globalWarmth: 0.6,
          vegetationDensity: 1,
          landformRegionScale: 1,
          algorithmVersion: "diverse-landscape-v13",
        };
        const text = await runtime.generateTerrainJson(JSON.stringify(request));
        const local = JSON.parse(text);
        const response = await fetch("/api/v1/terrains", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(request),
        });
        if (!response.ok) throw Error("API " + response.status);
        const remote = await response.json();
        if (
          local.coreBuildId !== remote.coreBuildId ||
          local.workload !== "landscape-ecology-hydraulic-v14"
        )
          throw Error("Identity");
        const n = width * height,
          h = local.result.hydrology,
          other = remote.result.hydrology;
        if (h.algorithmVersion !== "d8-priority-flood-v1")
          throw Error("Hydrology identity");
        for (const key of [
          "receiverIndex",
          "flowAccumulation",
          "depressionDepth",
        ]) {
          if (h[key].length !== n || other[key].length !== n)
            throw Error("Length");
          for (let i = 0; i < n; i++) {
            const a = h[key][i],
              b = other[key][i];
            if (
              !Number.isFinite(a) ||
              !Number.isFinite(b) ||
              (key === "depressionDepth"
                ? Math.abs(a - b) >
                  1e-6 + 1e-5 * Math.max(Math.abs(a), Math.abs(b))
                : a !== b)
            )
              throw Error("Parity " + key);
          }
        }
        const incoming = new Int32Array(n),
          expected = new Uint32Array(n),
          queue = new Int32Array(n);
        let land = 0,
          head = 0,
          tail = 0,
          mass = 0,
          maxDepth = 0;
        for (let i = 0; i < n; i++) {
          const x = i % width,
            y = Math.floor(i / width),
            r = h.receiverIndex[i],
            ocean = local.result.biomes[i] === 0;
          const outlet =
            ocean || x === 0 || y === 0 || x === width - 1 || y === height - 1;
          if (
            !Number.isInteger(r) ||
            r < -1 ||
            r >= n ||
            r === i ||
            (r === -1) !== outlet
          )
            throw Error("Outlet");
          const d = h.depressionDepth[i];
          if (d < 0 || d > heightMultiplier || (outlet && d !== 0))
            throw Error("Depth");
          maxDepth = Math.max(maxDepth, d);
          if (!ocean) {
            expected[i] = 1;
            land++;
          }
          if (r >= 0) {
            if (
              Math.abs((r % width) - x) > 1 ||
              Math.abs(Math.floor(r / width) - y) > 1
            )
              throw Error("D8");
            incoming[r]++;
          }
        }
        for (let i = 0; i < n; i++) if (!incoming[i]) queue[tail++] = i;
        while (head < tail) {
          const i = queue[head++],
            r = h.receiverIndex[i];
          if (expected[i] !== h.flowAccumulation[i]) throw Error("Area");
          if (r < 0) mass += expected[i];
          else {
            expected[r] += expected[i];
            if (--incoming[r] === 0) queue[tail++] = r;
          }
        }
        if (head !== n || mass !== land) throw Error("Cycle/mass");
        const rivers = local.result.rivers,
          remoteRivers = remote.result.rivers;
        if (
          rivers.algorithmVersion !== "river-network-v1" ||
          remoteRivers.algorithmVersion !== rivers.algorithmVersion ||
          rivers.cellIndices.length !== rivers.widths.length ||
          remoteRivers.cellIndices.length !== rivers.cellIndices.length ||
          remoteRivers.widths.length !== rivers.widths.length
        )
          throw Error("River shape/identity");
        const threshold = Math.max(32, Math.ceil(land / 512));
        let cursor = 0,
          mouths = 0,
          boundaryOutlets = 0,
          depressionCrossings = 0;
        for (let i = 0; i < n; i++) {
          if (local.result.biomes[i] === 0 || h.flowAccumulation[i] < threshold)
            continue;
          if (
            rivers.cellIndices[cursor] !== i ||
            remoteRivers.cellIndices[cursor] !== i
          )
            throw Error("River membership/parity");
          const width = rivers.widths[cursor],
            otherWidth = remoteRivers.widths[cursor];
          const expectedWidth = Math.fround(
            Math.min(
              3,
              Math.max(
                0.6,
                0.35 + 0.25 * Math.sqrt(h.flowAccumulation[i] / threshold),
              ),
            ),
          );
          if (
            !Number.isFinite(width) ||
            !Number.isFinite(otherWidth) ||
            width < 0.6 ||
            width > 3 ||
            Math.abs(width - expectedWidth) >
              1e-6 + 1e-5 * Math.max(width, expectedWidth) ||
            Math.abs(width - otherWidth) >
              1e-6 + 1e-5 * Math.max(width, otherWidth)
          )
            throw Error("River width/parity");
          const next = h.receiverIndex[i];
          if (next < 0) boundaryOutlets++;
          else if (local.result.biomes[next] === 0) mouths++;
          else if (h.flowAccumulation[next] < threshold)
            throw Error("Broken downstream channel");
          if (h.depressionDepth[i] > 0) depressionCrossings++;
          cursor++;
        }
        if (cursor !== rivers.cellIndices.length)
          throw Error("Extra river cells");
        const lakes = local.result.lakes,
          otherLakes = remote.result.lakes;
        if (
          lakes.algorithmVersion !== "lake-basins-v1" ||
          otherLakes.algorithmVersion !== lakes.algorithmVersion ||
          lakes.basins.length > 64 ||
          lakes.basins.length !== otherLakes.basins.length
        )
          throw Error("Lake identity/count");
        for (const field of [
          "lakeIdByCell",
          "spillFromCells",
          "riverCrossingFromCells",
        ]) {
          if (
            !Array.isArray(lakes[field]) ||
            !Array.isArray(otherLakes[field]) ||
            lakes[field].length !== otherLakes[field].length ||
            (field === "lakeIdByCell"
              ? lakes[field].length !== n
              : lakes[field].length > n)
          )
            throw Error("Lake vector shape");
          for (let i = 0; i < lakes[field].length; i++)
            if (
              !Number.isInteger(lakes[field][i]) ||
              lakes[field][i] !== otherLakes[field][i]
            )
              throw Error("Lake vector parity");
        }
        const lakeCounts = new Int32Array(lakes.basins.length),
          primary = new Int32Array(lakes.basins.length).fill(-1),
          fed = new Uint8Array(lakes.basins.length);
        let lakeArea = 0,
          spillCursor = 0,
          crossingCursor = 0;
        for (let i = 0; i < n; i++) {
          const id = lakes.lakeIdByCell[i];
          if (id < -1 || id >= lakes.basins.length) throw Error("Lake id");
          if (id < 0) continue;
          lakeArea++;
          lakeCounts[id]++;
          const level = Math.fround(lakes.basins[id].waterLevel),
            baseHeight = Math.fround(local.result.values[i]),
            d = h.depressionDepth[i];
          if (
            local.result.biomes[i] === 0 ||
            d <= 0 ||
            level <= baseHeight ||
            Math.abs(Math.fround(level - baseHeight) - d) >
              1e-6 + 1e-5 * Math.max(d, level - baseHeight)
          )
            throw Error("Lake member/level");
          const next = h.receiverIndex[i];
          if (next >= 0 && lakes.lakeIdByCell[next] === id) continue;
          if (lakes.spillFromCells[spillCursor++] !== i)
            throw Error("Lake exit completeness");
          const old = primary[id];
          if (old < 0 || h.flowAccumulation[i] > h.flowAccumulation[old])
            primary[id] = i;
        }
        for (const cell of rivers.cellIndices) {
          const id = lakes.lakeIdByCell[cell],
            next = h.receiverIndex[cell];
          if (id >= 0) fed[id] = 1;
          if (
            next >= 0 &&
            id !== lakes.lakeIdByCell[next] &&
            (id >= 0 || lakes.lakeIdByCell[next] >= 0)
          )
            if (lakes.riverCrossingFromCells[crossingCursor++] !== cell)
              throw Error("Lake crossing completeness");
        }
        if (
          lakeArea > Math.floor((land * 8) / 100) ||
          spillCursor !== lakes.spillFromCells.length ||
          crossingCursor !== lakes.riverCrossingFromCells.length
        )
          throw Error("Lake area/connections");
        for (let id = 0; id < lakes.basins.length; id++) {
          const b = lakes.basins[id],
            other = otherLakes.basins[id];
          if (
            b.id !== id ||
            b.cellCount !== lakeCounts[id] ||
            b.cellCount < 16 ||
            !fed[id] ||
            b.primarySpillFrom !== primary[id] ||
            b.primarySpillTo !== h.receiverIndex[primary[id]]
          )
            throw Error("Lake descriptor");
          for (const field of [
            "id",
            "cellCount",
            "primarySpillFrom",
            "primarySpillTo",
          ])
            if (b[field] !== other[field])
              throw Error("Lake descriptor parity");
          if (
            Math.abs(b.waterLevel - other.waterLevel) >
            1e-6 + 1e-5 * Math.max(b.waterLevel, other.waterLevel)
          )
            throw Error("Lake level parity");
        }
        rows.push({
          width,
          height,
          seed,
          land,
          terminalMass: mass,
          maxDepth,
          typedBytes: n * 12,
          lakeCount: lakes.basins.length,
          lakeArea,
          lakeNumericBytes:
            4 *
              (n +
                lakes.spillFromCells.length +
                lakes.riverCrossingFromCells.length) +
            20 * lakes.basins.length,
          lakeJsonBytes: new TextEncoder().encode(JSON.stringify(lakes)).length,
          riverCount: rivers.cellIndices.length,
          riverTypedBytes: rivers.cellIndices.length * 8,
          riverJsonBytes: new TextEncoder().encode(JSON.stringify(rivers))
            .length,
          threshold,
          mouths,
          boundaryOutlets,
          depressionCrossings,
          jsonBytes: new TextEncoder().encode(text).length,
          hydrologyJsonBytes: new TextEncoder().encode(JSON.stringify(h))
            .length,
        });
      }
      return rows;
    });
    assert.equal(rows.length, 7);
    assert.ok(rows.some((row) => row.lakeCount > 0));
    assert.deepEqual(errors, []);
    await fs.writeFile(
      artifactPath("hydrology-browser.json"),
      JSON.stringify(rows, null, 2),
    );
    console.log(JSON.stringify(rows, null, 2));
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
