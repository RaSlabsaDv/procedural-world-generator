import { LANDSCAPE_BIOME as B, TerrainResponse } from '../data/terrain.models';

export const GRASS = Object.freeze({
  revision: 'grass-presentation-v1',
  maxCandidates: 131072,
  maxTufts: 32768,
  samplesPerUnit: 2,
  indexCellSize: 2,
  maxObstacleChecks: 64,
  edgeMargin: 0.32,
  embed: 0.01,
  minCornerGrass: 0.35,
  minGrass: 0.5,
  maxOther: 0.3,
  maxSlope: 0.55,
  maxTriangleSlope: 0.6,
  treeClearance: 0.24,
  rockClearance: 0.32,
  fadeNear: 20,
  fadeFar: 55,
  maxTilt: Math.PI / 12,
});
type Result = Pick<
  TerrainResponse['result'],
  'width' | 'height' | 'values' | 'biomes' | 'surfaceWeights' | 'slope' | 'trees' | 'rocks'
>;
export interface GrassSample {
  y: number;
  nx: number;
  ny: number;
  nz: number;
  grass: number;
  biome: number;
}
export const newGrassSample = (): GrassSample => ({
  y: 0,
  nx: 0,
  ny: 1,
  nz: 0,
  grass: 0,
  biome: B.Grassland,
});

/** Stable presentation randomness, independent of Core and the camera. */
export function grassHash(seed: number, id: number, stream: number): number {
  let h = (seed ^ Math.imul(id + 1, 0x9e3779b1) ^ stream) >>> 0;
  h ^= h >>> 16;
  h = Math.imul(h, 0x7feb352d);
  h ^= h >>> 15;
  h = Math.imul(h, 0x846ca68b);
  h ^= h >>> 16;
  return h >>> 0;
}
export const grassRandom = (seed: number, id: number, stream: number) =>
  (grassHash(seed, id, stream) + 0.5) / 4294967296;
export function grassGrid(width: number, height: number) {
  const dx = Math.ceil((width - 1) * GRASS.samplesPerUnit),
    dz = Math.ceil((height - 1) * GRASS.samplesPerUnit);
  const scale = Math.min(1, Math.sqrt(GRASS.maxCandidates / (dx * dz)));
  const nx = Math.max(1, Math.floor(dx * scale)),
    nz = Math.max(1, Math.min(Math.floor(dz * scale), Math.floor(GRASS.maxCandidates / nx)));
  return { nx, nz, count: nx * nz, stepX: (width - 1) / nx, stepZ: (height - 1) / nz };
}
export function grassPoint(
  seed: number,
  id: number,
  grid: ReturnType<typeof grassGrid>,
  out: { x: number; z: number },
): void {
  out.x = ((id % grid.nx) + 0.1 + 0.8 * grassRandom(seed, id, 0x3a21)) * grid.stepX;
  out.z = (Math.floor(id / grid.nx) + 0.1 + 0.8 * grassRandom(seed, id, 0x9b17)) * grid.stepZ;
}
/** Exact terrain triangles. Mutate one scratch record; no per-candidate objects. */
export function sampleGrass(result: Result, x: number, z: number, out: GrassSample): boolean {
  const { width: w, height: h, values: v, surfaceWeights: s, biomes: b, slope } = result;
  const cx = Math.min(w - 2, Math.max(0, Math.floor(x))),
    cz = Math.min(h - 2, Math.max(0, Math.floor(z)));
  const i = cz * w + cx,
    fx = x - cx,
    fz = z - cz;
  const first = fx + fz <= 1,
    a = first ? i : i + 1,
    c = first ? i + 1 : i + w + 1,
    d = i + w;
  const wa = first ? 1 - fx - fz : 1 - fz,
    wd = first ? fz : 1 - fx,
    wc = first ? fx : fx + fz - 1;
  out.y = wa * v[a] + wd * v[d] + wc * v[c];
  const dx = first ? v[i + 1] - v[i] : v[i + w + 1] - v[i + w],
    dz = first ? v[i + w] - v[i] : v[i + w + 1] - v[i + 1];
  const length = Math.hypot(dx, 1, dz);
  out.nx = -dx / length;
  out.ny = 1 / length;
  out.nz = -dz / length;
  out.grass = wa * s[a * 5] + wd * s[d * 5] + wc * s[c * 5];
  out.biome = b[wa >= wd && wa >= wc ? a : wd >= wc ? d : c];
  if (dx * dx + dz * dz > GRASS.maxTriangleSlope ** 2) return false;
  for (let k = 0; k < 4; k++) {
    const j = i + (k % 2) + Math.floor(k / 2) * w,
      offset = j * 5;
    if (
      b[j] === B.Ocean ||
      b[j] === B.Rock ||
      b[j] === B.SnowHighlands ||
      s[offset] < GRASS.minCornerGrass ||
      s[offset + 2] > GRASS.maxOther ||
      s[offset + 3] > GRASS.maxOther ||
      s[offset + 4] > GRASS.maxOther ||
      slope[j] > GRASS.maxSlope
    )
      return false;
  }
  return out.grass >= GRASS.minGrass;
}

function obstacleIndex<T extends { x: number; z: number }>(
  objects: readonly T[],
  radius: (o: T) => number,
  width: number,
  height: number,
) {
  const nx = Math.max(1, Math.ceil((width - 1) / GRASS.indexCellSize)),
    nz = Math.max(1, Math.ceil((height - 1) / GRASS.indexCellSize));
  const heads = new Int32Array(nx * nz).fill(-1),
    next = new Int32Array(objects.length);
  let maxRadius = 0;
  objects.forEach((o, i) => {
    const r = radius(o);
    maxRadius = Math.max(maxRadius, r);
    const cell =
      Math.min(nz - 1, Math.max(0, Math.floor(o.z / GRASS.indexCellSize))) * nx +
      Math.min(nx - 1, Math.max(0, Math.floor(o.x / GRASS.indexCellSize)));
    next[i] = heads[cell];
    heads[cell] = i;
  });
  return {
    objects,
    radiusAt: (i: number) => radius(objects[i]),
    nx,
    nz,
    heads,
    next,
    reach: Math.ceil(maxRadius / GRASS.indexCellSize),
  };
}
export function placeGrass(seed: number, result: Result) {
  const grid = grassGrid(result.width, result.height),
    ids = new Uint32Array(GRASS.maxTufts),
    priorities = new Uint32Array(GRASS.maxTufts);
  const trees = obstacleIndex(
    result.trees,
    (t) => 0.075 * t.scale + GRASS.treeClearance,
    result.width,
    result.height,
  );
  const rocks = obstacleIndex(
    result.rocks,
    (r) => Math.max(r.scaleX, r.scaleZ) + GRASS.rockClearance,
    result.width,
    result.height,
  );
  const indexes = [trees, rocks];
  const sample = newGrassSample(),
    point = { x: 0, z: 0 };
  let count = 0,
    obstacleChecks = 0,
    crowded = 0,
    eligible = 0;
  const blocked = (x: number, z: number) => {
    let checks = 0;
    for (const index of indexes) {
      const cx = Math.floor(x / GRASS.indexCellSize),
        cz = Math.floor(z / GRASS.indexCellSize);
      for (
        let iz = Math.max(0, cz - index.reach);
        iz <= Math.min(index.nz - 1, cz + index.reach);
        iz++
      )
        for (
          let ix = Math.max(0, cx - index.reach);
          ix <= Math.min(index.nx - 1, cx + index.reach);
          ix++
        )
          for (let i = index.heads[iz * index.nx + ix]; i >= 0; i = index.next[i]) {
            if (checks === GRASS.maxObstacleChecks) {
              crowded++;
              return true;
            }
            checks++;
            obstacleChecks++;
            const o = index.objects[i],
              radius = index.radiusAt(i);
            if ((x - o.x) ** 2 + (z - o.z) ** 2 < radius * radius) return true;
          }
    }
    return false;
  };
  const worse = (ap: number, ai: number, bp: number, bi: number) =>
    ap > bp || (ap === bp && ai > bi);
  for (let id = 0; id < grid.count; id++) {
    grassPoint(seed, id, grid, point);
    const { x, z } = point;
    if (
      x < GRASS.edgeMargin ||
      z < GRASS.edgeMargin ||
      x > result.width - 1 - GRASS.edgeMargin ||
      z > result.height - 1 - GRASS.edgeMargin ||
      !sampleGrass(result, x, z, sample) ||
      grassRandom(seed, id, 0x2e91) >= 0.65 * sample.grass ||
      blocked(x, z)
    )
      continue;
    eligible++;
    const priority = grassHash(seed, id, 0x7c39);
    if (count < GRASS.maxTufts) {
      let slot = count++;
      while (slot > 0) {
        const parent = (slot - 1) >>> 1;
        if (!worse(priority, id, priorities[parent], ids[parent])) break;
        priorities[slot] = priorities[parent];
        ids[slot] = ids[parent];
        slot = parent;
      }
      priorities[slot] = priority;
      ids[slot] = id;
    } else if (worse(priorities[0], ids[0], priority, id)) {
      let slot = 0;
      while (slot * 2 + 1 < count) {
        let child = slot * 2 + 1;
        if (
          child + 1 < count &&
          worse(priorities[child + 1], ids[child + 1], priorities[child], ids[child])
        )
          child++;
        if (!worse(priorities[child], ids[child], priority, id)) break;
        priorities[slot] = priorities[child];
        ids[slot] = ids[child];
        slot = child;
      }
      priorities[slot] = priority;
      ids[slot] = id;
    }
  }
  return {
    ids: ids.subarray(0, count).sort(),
    grid,
    candidates: grid.count,
    eligible,
    obstacleChecks,
    crowded,
    scratchBytes:
      ids.byteLength +
      priorities.byteLength +
      trees.heads.byteLength +
      trees.next.byteLength +
      rocks.heads.byteLength +
      rocks.next.byteLength,
  };
}
