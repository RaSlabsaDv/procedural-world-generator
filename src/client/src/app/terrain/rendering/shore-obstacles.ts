import type { TerrainResponse } from '../data/terrain.models';

export const SHORE_CLEARANCE = Object.freeze({ cellSize: 2, maxChecks: 64 });

/** Bounded decorative clearance queries; canonical inputs are only read. */
export function shoreObstacles(
  result: TerrainResponse['result'],
  capacity: number,
  extra = new Float32Array(0),
  extraClearance = 0,
) {
  const { width, height, rocks, trees } = result,
    existing = rocks.length + trees.length + extra.length / 3;
  const cellSize = SHORE_CLEARANCE.cellSize;
  const nx = Math.max(1, Math.ceil((width - 1) / cellSize)),
    nz = Math.max(1, Math.ceil((height - 1) / cellSize));
  const heads = new Int32Array(nx * nz).fill(-1),
    next = new Int32Array(existing + capacity);
  const coords = new Float32Array((existing + capacity) * 3);
  let count = 0,
    maxRadius = 0;
  function add(x: number, z: number, r: number) {
    const id = count++,
      cell =
        Math.min(nz - 1, Math.max(0, Math.floor(z / cellSize))) * nx +
        Math.min(nx - 1, Math.max(0, Math.floor(x / cellSize)));
    coords[id * 3] = x;
    coords[id * 3 + 1] = z;
    coords[id * 3 + 2] = r;
    next[id] = heads[cell];
    heads[cell] = id;
    maxRadius = Math.max(maxRadius, r);
  }
  for (const r of rocks) add(r.x, r.z, Math.max(r.scaleX, r.scaleZ) + 0.12);
  for (const t of trees) add(t.x, t.z, 0.075 * t.scale + 0.1);
  for (let i = 0; i < extra.length; i += 3)
    add(extra[i], extra[i + 1], extra[i + 2] + extraClearance);
  let checks = 0,
    crowded = 0;
  return {
    add,
    bytes: heads.byteLength + next.byteLength + coords.byteLength,
    stats: () => ({ checks, crowded }),
    blocked(x: number, z: number, r: number) {
      const cx = Math.floor(x / cellSize),
        cz = Math.floor(z / cellSize),
        reach = Math.ceil((maxRadius + r) / cellSize);
      let visited = 0;
      for (let iz = Math.max(0, cz - reach); iz <= Math.min(nz - 1, cz + reach); iz++)
        for (let ix = Math.max(0, cx - reach); ix <= Math.min(nx - 1, cx + reach); ix++)
          for (let id = heads[iz * nx + ix]; id >= 0; id = next[id]) {
            if (visited++ === SHORE_CLEARANCE.maxChecks) {
              crowded++;
              return true;
            }
            checks++;
            if (
              (x - coords[id * 3]) ** 2 + (z - coords[id * 3 + 1]) ** 2 <
              (r + coords[id * 3 + 2]) ** 2
            )
              return true;
          }
      return false;
    },
  };
}
