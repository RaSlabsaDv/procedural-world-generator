import {
  HeightMapRequest,
  HydrologyResult,
  RiverNetworkResult,
  LakeMapResult,
  LakeBasin,
  LAKE_BASINS_VERSION,
  LANDSCAPE_BIOME,
} from './terrain.models';
import { object } from './contract-utils';

const MIN_AREA = 16,
  MAX_LAKES = 64,
  AREA_PERCENT = 8,
  DEPTH_FRACTION = 0.01;
const close = (a: number, b: number) =>
  Math.abs(a - b) <= 1e-6 + 1e-5 * Math.max(Math.abs(a), Math.abs(b));
const hasKeys = (value: unknown, names: string[]): value is Record<string, unknown> =>
  object(value) &&
  Object.keys(value).length === names.length &&
  names.every((n) => Object.hasOwn(value, n));

/** Validate supplied membership/connections, without deriving or ranking candidate lakes. */
export function decodeLakes(
  raw: unknown,
  heights: Float32Array,
  biomes: Uint8Array,
  hydrology: HydrologyResult,
  rivers: RiverNetworkResult,
  request: HeightMapRequest,
  fail: () => never,
): LakeMapResult {
  if (
    !hasKeys(raw, [
      'algorithmVersion',
      'lakeIdByCell',
      'basins',
      'spillFromCells',
      'riverCrossingFromCells',
    ]) ||
    raw['algorithmVersion'] !== LAKE_BASINS_VERSION
  )
    return fail();
  const ids = raw['lakeIdByCell'],
    descriptors = raw['basins'],
    spill = raw['spillFromCells'],
    crossing = raw['riverCrossingFromCells'];
  const count = heights.length;
  if (
    !Array.isArray(ids) ||
    ids.length !== count ||
    !Array.isArray(descriptors) ||
    descriptors.length > MAX_LAKES ||
    !Array.isArray(spill) ||
    !Array.isArray(crossing) ||
    spill.length > count ||
    crossing.length > count
  )
    return fail();
  const basinCount = descriptors.length,
    lakeIdByCell = new Int32Array(count),
    basins: LakeBasin[] = [];
  const counts = new Int32Array(basinCount),
    minima = new Int32Array(basinCount).fill(count),
    maxDepth = new Float32Array(basinCount),
    fed = new Uint8Array(basinCount);
  const primary = new Int32Array(basinCount).fill(-1);
  let land = 0,
    area = 0;
  for (let id = 0; id < basinCount; id++) {
    const basin: unknown = descriptors[id];
    if (
      !hasKeys(basin, ['id', 'waterLevel', 'cellCount', 'primarySpillFrom', 'primarySpillTo']) ||
      basin['id'] !== id ||
      typeof basin['waterLevel'] !== 'number' ||
      !Number.isFinite(basin['waterLevel']) ||
      basin['waterLevel'] <= 0 ||
      basin['waterLevel'] > Math.fround(request.heightMultiplier) ||
      !Number.isInteger(basin['cellCount']) ||
      (basin['cellCount'] as number) < MIN_AREA ||
      (basin['cellCount'] as number) > count ||
      !Number.isInteger(basin['primarySpillFrom']) ||
      (basin['primarySpillFrom'] as number) < 0 ||
      (basin['primarySpillFrom'] as number) >= count ||
      !Number.isInteger(basin['primarySpillTo']) ||
      (basin['primarySpillTo'] as number) < 0 ||
      (basin['primarySpillTo'] as number) >= count
    )
      return fail();
    basins.push(
      Object.freeze({
        ...(basin as unknown as LakeBasin),
        waterLevel: Math.fround(basin['waterLevel']),
      }),
    );
  }
  for (let i = 0; i < count; i++) {
    const id = ids[i];
    if (!Number.isInteger(id) || id < -1 || id >= basinCount) return fail();
    lakeIdByCell[i] = id;
    if (biomes[i] !== LANDSCAPE_BIOME.Ocean) land++;
    if (id < 0) continue;
    const level = basins[id].waterLevel,
      depth = hydrology.depressionDepth[i];
    if (
      biomes[i] === LANDSCAPE_BIOME.Ocean ||
      depth <= 0 ||
      level <= heights[i] ||
      !close(Math.fround(level - heights[i]), depth)
    )
      return fail();
    counts[id]++;
    area++;
    minima[id] = Math.min(minima[id], i);
    maxDepth[id] = Math.max(maxDepth[id], depth);
  }
  if (area > Math.floor((land * AREA_PERCENT) / 100)) return fail();
  for (const cell of rivers.cellIndices) if (lakeIdByCell[cell] >= 0) fed[lakeIdByCell[cell]] = 1;
  for (let id = 0; id < basinCount; id++) {
    if (
      counts[id] !== basins[id].cellCount ||
      !fed[id] ||
      maxDepth[id] < DEPTH_FRACTION * request.heightMultiplier ||
      (id > 0 && minima[id] <= minima[id - 1])
    )
      return fail();
  }
  // Connectedness is a membership invariant; do not discover unselected candidate regions.
  if (basinCount > 0) {
    const seen = new Uint8Array(count),
      queue = new Int32Array(count);
    for (let id = 0; id < basinCount; id++) {
      let head = 0,
        tail = 1;
      queue[0] = minima[id];
      seen[minima[id]] = 1;
      while (head < tail) {
        const i = queue[head++],
          x = i % request.width,
          y = Math.floor(i / request.width);
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++) {
            const nx = x + dx,
              ny = y + dy;
            if ((!dx && !dy) || nx < 0 || nx >= request.width || ny < 0 || ny >= request.height)
              continue;
            const next = ny * request.width + nx;
            if (!seen[next] && lakeIdByCell[next] === id) {
              seen[next] = 1;
              queue[tail++] = next;
            }
          }
      }
      if (tail !== counts[id]) return fail();
    }
  }
  const spillFromCells = new Int32Array(spill.length),
    riverCrossingFromCells = new Int32Array(crossing.length);
  let cursor = 0;
  for (let cell = 0; cell < count; cell++) {
    const id = lakeIdByCell[cell],
      next = hydrology.receiverIndex[cell];
    if (id < 0 || (next >= 0 && lakeIdByCell[next] === id)) continue;
    if (next < 0 || spill[cursor] !== cell) return fail();
    spillFromCells[cursor++] = cell;
    const previous = primary[id];
    if (previous < 0 || hydrology.flowAccumulation[cell] > hydrology.flowAccumulation[previous])
      primary[id] = cell;
  }
  if (cursor !== spill.length) return fail();
  for (let id = 0; id < basinCount; id++)
    if (
      primary[id] < 0 ||
      basins[id].primarySpillFrom !== primary[id] ||
      basins[id].primarySpillTo !== hydrology.receiverIndex[primary[id]]
    )
      return fail();
  cursor = 0;
  for (const cell of rivers.cellIndices) {
    const next = hydrology.receiverIndex[cell];
    if (
      next < 0 ||
      lakeIdByCell[cell] === lakeIdByCell[next] ||
      (lakeIdByCell[cell] < 0 && lakeIdByCell[next] < 0)
    )
      continue;
    if (crossing[cursor] !== cell) return fail();
    riverCrossingFromCells[cursor++] = cell;
  }
  if (cursor !== crossing.length) return fail();
  return Object.freeze({
    algorithmVersion: LAKE_BASINS_VERSION,
    lakeIdByCell,
    basins: Object.freeze(basins),
    spillFromCells,
    riverCrossingFromCells,
  });
}
