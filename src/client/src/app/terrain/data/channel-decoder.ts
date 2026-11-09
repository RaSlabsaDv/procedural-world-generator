import {
  CHANNEL_STATE as STATE,
  RIVER_CHANNELS_VERSION,
  RiverChannelResult,
  HydrologyResult,
  RiverNetworkResult,
  LakeMapResult,
  HeightMapRequest,
  SimulationSummary,
} from './terrain.models';
import { object } from './contract-utils';
const keys = (value: unknown, names: string[]): value is Record<string, unknown> =>
  object(value) &&
  Object.keys(value).length === names.length &&
  names.every((n) => Object.hasOwn(value, n));
const close = (a: number, b: number) =>
  Math.abs(a - b) <= 1e-6 + 1e-5 * Math.max(Math.abs(a), Math.abs(b));
/** Contract verification only; neither channel carving nor profile solving occurs here. */
export function decodeChannels(
  raw: unknown,
  bed: Float32Array,
  biomes: Uint8Array,
  h: HydrologyResult,
  r: RiverNetworkResult,
  l: LakeMapResult,
  request: HeightMapRequest,
  seaLevel: number,
  simulation: SimulationSummary,
  fail: () => never,
): RiverChannelResult {
  if (
    !keys(raw, [
      'algorithmVersion',
      'carveDepth',
      'waterSurfaceHeight',
      'segmentState',
      'summary',
    ]) ||
    raw['algorithmVersion'] !== RIVER_CHANNELS_VERSION
  )
    return fail();
  const depth = raw['carveDepth'],
    water = raw['waterSurfaceHeight'],
    state = raw['segmentState'],
    summary = raw['summary'],
    n = bed.length,
    k = r.cellIndices.length;
  if (
    !Array.isArray(depth) ||
    depth.length !== n ||
    !Array.isArray(water) ||
    water.length !== k ||
    !Array.isArray(state) ||
    state.length !== k ||
    !keys(summary, ['beforeTerrainMass', 'afterTerrainMass', 'removedTerrainMass'])
  )
    return fail();
  const cap = Math.min(1.5, 0.03 * request.heightMultiplier),
    bound = Math.fround(request.heightMultiplier),
    slope = Math.min(0.6, 0.05 * request.heightMultiplier);
  const carveDepth = new Float32Array(n),
    waterSurfaceHeight = new Float32Array(k),
    segmentState = new Uint8Array(k),
    lookup = new Int32Array(n).fill(-1);
  let mass = 0,
    removed = 0;
  for (let i = 0; i < n; i++) {
    if (
      typeof depth[i] !== 'number' ||
      !Number.isFinite(depth[i]) ||
      depth[i] < 0 ||
      depth[i] > cap + 1e-6 ||
      bed[i] + depth[i] > bound + 1e-5
    )
      return fail();
    if (
      (i % request.width === 0 ||
        i % request.width === request.width - 1 ||
        i < request.width ||
        i >= n - request.width) &&
      depth[i] !== 0
    )
      return fail();
    if (depth[i] > 0) {
      const x = i % request.width,
        y = Math.floor(i / request.width);
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx,
            ny = y + dy;
          if (
            nx >= 0 &&
            nx < request.width &&
            ny >= 0 &&
            ny < request.height &&
            biomes[ny * request.width + nx] === 0
          )
            return fail();
        }
    }
    carveDepth[i] = depth[i];
    mass += bed[i];
    removed += carveDepth[i];
  }
  for (const name of ['beforeTerrainMass', 'afterTerrainMass', 'removedTerrainMass'])
    if (
      typeof summary[name] !== 'number' ||
      !Number.isFinite(summary[name]) ||
      (summary[name] as number) < 0
    )
      return fail();
  const before = summary['beforeTerrainMass'] as number,
    after = summary['afterTerrainMass'] as number,
    cut = summary['removedTerrainMass'] as number;
  if (
    Math.abs(after - mass) > 1e-9 * Math.max(1, mass) ||
    Math.abs(before - after - cut) > 1e-9 * Math.max(1, before) ||
    Math.abs(cut - removed) > 1e-6 + 1e-7 * Math.max(cut, removed) ||
    Math.abs(before - simulation.finalTerrainMass) >
      1e-6 + 1e-7 * Math.max(before, simulation.finalTerrainMass)
  )
    return fail();
  for (let i = 0; i < k; i++) {
    const cell = r.cellIndices[i];
    lookup[cell] = i;
    if (
      typeof water[i] !== 'number' ||
      !Number.isFinite(water[i]) ||
      water[i] < 0 ||
      water[i] > bound ||
      !Number.isInteger(state[i]) ||
      state[i] < 0 ||
      state[i] > 3
    )
      return fail();
    waterSurfaceHeight[i] = water[i];
    segmentState[i] = state[i];
    const lake = l.lakeIdByCell[cell];
    if (waterSurfaceHeight[i] < bed[cell] - 1e-6) return fail();
    if (lake >= 0) {
      if (!close(waterSurfaceHeight[i], l.basins[lake].waterLevel)) return fail();
    } else if (waterSurfaceHeight[i] > bed[cell] + carveDepth[cell] + 1e-6) return fail();
  }
  for (let i = 0; i < k; i++) {
    const cell = r.cellIndices[i],
      next = h.receiverIndex[cell],
      lake = l.lakeIdByCell[cell];
    if (next < 0 !== (segmentState[i] === STATE.Boundary)) return fail();
    if (next < 0) continue;
    const nextLake = l.lakeIdByCell[next],
      submerged = lake >= 0 && lake === nextLake;
    if (submerged !== (segmentState[i] === STATE.Submerged)) return fail();
    if (segmentState[i] !== STATE.Exposed) continue;
    if (lake >= 0 && nextLake >= 0) return fail();
    const target =
      lookup[next] >= 0 ? waterSurfaceHeight[lookup[next]] : Math.fround(seaLevel * bound);
    const drop = waterSurfaceHeight[i] - target,
      len = Math.hypot(
        (next % request.width) - (cell % request.width),
        Math.floor(next / request.width) - Math.floor(cell / request.width),
      );
    if (drop < 0 && !close(waterSurfaceHeight[i], target)) return fail();
    if (drop > slope * len && !close(drop, slope * len)) return fail();
  }
  return Object.freeze({
    algorithmVersion: RIVER_CHANNELS_VERSION,
    carveDepth,
    waterSurfaceHeight,
    segmentState,
    summary: Object.freeze({
      beforeTerrainMass: before,
      afterTerrainMass: after,
      removedTerrainMass: cut,
    }),
  });
}
