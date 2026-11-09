// Node geometry diagnostics against complete, currently published Core output.
const assert = require("node:assert/strict"),
  path = require("node:path"),
  fs = require("node:fs/promises");
const { execFileSync } = require("node:child_process");
const { build } = require("../../src/client/node_modules/esbuild");
const { base } = require("./support/browser.cjs");
(async () => {
  const root = path.resolve(__dirname, "../..");
  const built = await build({
    stdin: {
      contents: `export {inlandWaterGeometry} from './src/client/src/app/terrain/rendering/inland-water-geometry';
export {lakeSurfaceAt,lakeTriangleOwner} from './src/client/src/app/terrain/rendering/lake-footprint';
export {decodeTerrain} from './src/client/src/app/terrain/data/terrain-decoder';
export {DEFAULT_MAP_PARAMETERS,DEFAULT_SIMULATION_PARAMETERS} from './src/client/src/app/terrain/data/terrain-defaults';
export {shoreWaterIndex} from './src/client/src/app/terrain/rendering/shore-water-index';
export {TERRAIN_ALGORITHM} from './src/client/src/app/terrain/data/terrain.models';`,
      resolveDir: root,
      loader: "ts",
    },
    plugins: process.argv.includes("--baseline-source")
      ? [
          {
            name: "historical-renderer",
            setup(build) {
              build.onLoad(
                { filter: /inland-water-geometry\.ts$/ },
                (args) => ({
                  contents: execFileSync(
                    "git",
                    [
                      "show",
                      "9857d1c:src/client/src/app/terrain/rendering/inland-water-geometry.ts",
                    ],
                    { cwd: root, encoding: "utf8" },
                  ),
                  loader: "ts",
                  resolveDir: path.dirname(args.path),
                }),
              );
            },
          },
        ]
      : [],
    bundle: true,
    platform: "node",
    format: "esm",
    write: false,
    nodePaths: [path.join(root, "src/client/node_modules")],
  });
  const m = await import(
    "data:text/javascript;base64," +
      Buffer.from(built.outputFiles[0].text).toString("base64")
  );
  const rows = [];
  for (const item of [
    { name: "mixed", fields: { seed: 42 } },
    { name: "no-ocean", fields: { seed: -7, seaLevel: 0 } },
    {
      name: "coast",
      fields: { seed: 2026, width: 65, height: 49, seaLevel: 0.23 },
    },
    {
      name: "maximum",
      fields: {
        seed: -7,
        width: 512,
        height: 512,
        heightMultiplier: 80,
        iterations: 0,
        seaLevel: 0,
      },
    },
  ]) {
    const map = {
      ...m.DEFAULT_MAP_PARAMETERS,
      width: 129,
      height: 97,
      algorithmVersion: "value-noise-fbm-v1",
    };
    const request = {
      ...m.DEFAULT_SIMULATION_PARAMETERS,
      iterations: 8,
      heightMap: map,
      algorithmVersion: m.TERRAIN_ALGORITHM,
    };
    for (const [k, v] of Object.entries(item.fields))
      if (k in map) map[k] = v;
      else request[k] = v;
    const response = await fetch(base + "/api/v1/terrains", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    });
    assert.ok(response.ok);
    const wire = await response.json();
    if (!process.argv.includes("--before")) {
      const before = await fs
        .readFile(
          path.join(root, `artifacts/continuity-before-${item.name}.wire.json`),
          "utf8",
        )
        .then(JSON.parse)
        .catch(() => null);
      if (before) {
        assert.deepEqual(wire.result, before.result);
        assert.deepEqual(wire.simulation, before.simulation);
      }
    }
    const r = m.decodeTerrain(wire, map, request).result,
      sea = request.seaLevel * Math.fround(map.heightMultiplier),
      setupStart = performance.now(),
      water = m.inlandWaterGeometry(r, sea),
      setupCpuMs = performance.now() - setupStart;
    const lookup = new Int32Array(r.values.length).fill(-1);
    r.rivers.cellIndices.forEach((v, k) => (lookup[v] = k));
    const actualWater = m.shoreWaterIndex(r.width, r.height, [water.river]);
    const count = {
      states: [0, 0, 0, 0],
      supportedEdges: 0,
      completeEdges: 0,
      bedBlockedSamples: 0,
      ambiguousSamples: 0,
      rendererMissingSamples: 0,
      eligibleSamples: 0,
      queryFalsePositiveSamples: 0,
      queryMissingSamples: 0,
    };
    const directions = {
      axial: { eligible: 0, missing: 0 },
      risingDiagonal: { eligible: 0, missing: 0 },
      fallingDiagonal: { eligible: 0, missing: 0 },
    };
    const examples = [];
    const ground = (x, z) => {
      const cx = Math.min(r.width - 2, Math.floor(x)),
        cz = Math.min(r.height - 2, Math.floor(z)),
        i = cz * r.width + cx,
        fx = x - cx,
        fz = z - cz;
      return fx + fz <= 1
        ? {
            a: i,
            b: i + r.width,
            c: i + 1,
            y:
              (1 - fx - fz) * r.values[i] +
              fz * r.values[i + r.width] +
              fx * r.values[i + 1],
          }
        : {
            a: i + 1,
            b: i + r.width,
            c: i + r.width + 1,
            y:
              (1 - fz) * r.values[i + 1] +
              (1 - fx) * r.values[i + r.width] +
              (fx + fz - 1) * r.values[i + r.width + 1],
          };
    };
    for (let k = 0; k < r.rivers.cellIndices.length; k++) {
      const state = r.channels.segmentState[k];
      count.states[state]++;
      if (state !== 1) continue;
      const a = r.rivers.cellIndices[k],
        b = r.hydrology.receiverIndex[a];
      if (b < 0) continue;
      count.supportedEdges++;
      const ax = a % r.width,
        az = Math.floor(a / r.width),
        bx = b % r.width,
        bz = Math.floor(b / r.width);
      const dir =
        ax === bx || az === bz
          ? "axial"
          : (bx - ax) * (bz - az) > 0
            ? "risingDiagonal"
            : "fallingDiagonal";
      const source = r.channels.waterSurfaceHeight[k],
        target =
          lookup[b] >= 0 ? r.channels.waterSurfaceHeight[lookup[b]] : sea;
      let complete = true,
        missing = 0,
        blocked = 0;
      for (let s = 1; s < 32; s++) {
        const t = s / 32,
          x = ax + (bx - ax) * t,
          z = az + (bz - az) * t,
          g = ground(x, z),
          expected = source + (target - source) * t;
        if (m.lakeSurfaceAt(r, x, z) >= 0 || (r.biomes[b] === 0 && g.y < sea))
          continue;
        if (m.lakeTriangleOwner(r, g.a, g.b, g.c) === -2) {
          count.ambiguousSamples++;
          complete = false;
          continue;
        }
        if (g.y > expected + 1e-5) {
          count.bedBlockedSamples++;
          blocked++;
          complete = false;
          continue;
        }
        count.eligibleSamples++;
        directions[dir].eligible++;
        const present = actualWater.sample(x, z).distance < 1e-7;
        const reported = water.riverSurfaceAt(x, z) >= 0;
        if (reported && !present) count.queryFalsePositiveSamples++;
        if (!reported && present) count.queryMissingSamples++;
        if (!present) {
          count.rendererMissingSamples++;
          directions[dir].missing++;
          missing++;
          complete = false;
        }
      }
      if (complete) count.completeEdges++;
      if ((missing || blocked) && examples.length < 16)
        examples.push({
          a,
          b,
          dir,
          width: r.rivers.widths[k],
          source,
          target,
          missing,
          blocked,
        });
    }
    // Quantized touching components are descriptive, not a flooding objective.
    let components = 0;
    if (water.river) {
      const p = water.river.getAttribute("position"),
        idx = water.river.index,
        parent = [],
        keys = new Map();
      const ids = new Int32Array(p.count);
      function find(x) {
        while (parent[x] !== x) {
          parent[x] = parent[parent[x]];
          x = parent[x];
        }
        return x;
      }
      for (let i = 0; i < p.count; i++) {
        const key = [p.getX(i), p.getY(i), p.getZ(i)]
          .map((v) => v.toFixed(5))
          .join(",");
        let id = keys.get(key);
        if (id === undefined) {
          id = parent.length;
          parent.push(id);
          keys.set(key, id);
        }
        ids[i] = id;
      }
      for (let k = 0; k < idx.count; k += 3) {
        const a = find(ids[idx.getX(k)]);
        for (let j = 1; j < 3; j++) parent[find(ids[idx.getX(k + j)])] = a;
      }
      components = new Set(parent.map((_, i) => find(i))).size;
    }
    const row = {
      name: item.name,
      request,
      count,
      directions,
      examples,
      touchingMeshComponents: components,
      stats: water.stats,
      setupCpuMs,
    };
    rows.push(row);
    const label = process.argv.includes("--before") ? "before" : "after";
    await fs.writeFile(
      path.join(root, `artifacts/continuity-${label}-${item.name}.wire.json`),
      JSON.stringify(wire),
    );
    console.log(JSON.stringify(row));
    water.dispose();
  }
  await fs.writeFile(
    path.join(
      root,
      `artifacts/continuity-${process.argv.includes("--before") ? "before" : "after"}-diagnostics.json`,
    ),
    JSON.stringify(rows, null, 2),
  );
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
