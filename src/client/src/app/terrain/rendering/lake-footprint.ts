import { TerrainResponse } from '../data/terrain.models';

type LakeTerrain = Pick<TerrainResponse['result'], 'width' | 'height' | 'values'> &
  Partial<Pick<TerrainResponse['result'], 'lakes'>>;

/** One-ring ownership only. Ambiguous mixed basins or below-level outsiders are not filled. */
export function lakeTriangleOwner(result: LakeTerrain, a: number, b: number, c: number): number {
  const lakes = result.lakes;
  if (!lakes?.basins.length) return -1;
  let owner = -1;
  for (let k = 0; k < 3; k++) {
    const id = lakes.lakeIdByCell[k === 0 ? a : k === 1 ? b : c];
    if (id < 0) continue;
    if (owner >= 0 && owner !== id) return -2;
    owner = id;
  }
  if (owner < 0) return -1;
  const level = lakes.basins[owner].waterLevel;
  for (let k = 0; k < 3; k++) {
    const i = k === 0 ? a : k === 1 ? b : c;
    if (lakes.lakeIdByCell[i] !== owner && result.values[i] < level) return -2;
  }
  return owner;
}

/** Same finite-triangle shoreline footprint as the lake mesh. Coordinates are uncentered. */
export function lakeSurfaceAt(result: LakeTerrain, x: number, z: number): number {
  if (
    !result.lakes?.basins.length ||
    x < 0 ||
    z < 0 ||
    x > result.width - 1 ||
    z > result.height - 1
  )
    return -1;
  const cx = Math.min(result.width - 2, Math.floor(x)),
    cz = Math.min(result.height - 2, Math.floor(z)),
    i = cz * result.width + cx,
    fx = x - cx,
    fz = z - cz,
    first = fx + fz <= 1;
  const a = first ? i : i + 1,
    b = i + result.width,
    c = first ? i + 1 : i + result.width + 1;
  const wa = first ? 1 - fx - fz : 1 - fz,
    wb = first ? fz : 1 - fx,
    wc = first ? fx : fx + fz - 1;
  const id = lakeTriangleOwner(result, a, b, c);
  if (id < 0) return -1;
  const level = result.lakes.basins[id].waterLevel,
    bed = wa * result.values[a] + wb * result.values[b] + wc * result.values[c];
  return level > bed ? level : -1;
}

/** Presentation filtering keeps canonical arrays and source records untouched. */
export function visibleDecorations(
  result: TerrainResponse['result'],
  riverSurfaceAt: (x: number, z: number) => number = () => -1,
): TerrainResponse['result'] {
  if (!result.lakes.basins.length && !result.rivers.cellIndices.length) return result;
  return {
    ...result,
    trees: result.trees.filter(
      (t) => Math.max(lakeSurfaceAt(result, t.x, t.z), riverSurfaceAt(t.x, t.z)) <= t.y,
    ),
    rocks: result.rocks.filter(
      (r) => Math.max(lakeSurfaceAt(result, r.x, r.z), riverSurfaceAt(r.x, r.z)) <= r.y + r.scaleY,
    ),
  };
}
