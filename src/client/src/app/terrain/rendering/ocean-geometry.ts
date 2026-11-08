import { BufferAttribute, BufferGeometry } from 'three';
import { LANDSCAPE_BIOME, TerrainResponse } from '../data/terrain.models';

/** Geometry clipping only. Core's four-connected Ocean mask is authoritative. */
export function oceanGeometry(
  result: Pick<TerrainResponse['result'], 'width' | 'height' | 'values' | 'biomes'>,
  sea: number,
): BufferGeometry | undefined {
  const { width: w, height: h, values, biomes } = result,
    n = w * h;
  if (!biomes.includes(LANDSCAPE_BIOME.Ocean)) return undefined;
  const distances = new Uint8Array(n).fill(8),
    queue = new Int32Array(n);
  let tail = 0;
  for (let i = 0; i < n; i++)
    if (biomes[i] === 0) {
      const x = i % w,
        y = Math.floor(i / w);
      if (
        (x > 0 && biomes[i - 1] !== 0) ||
        (x < w - 1 && biomes[i + 1] !== 0) ||
        (y > 0 && biomes[i - w] !== 0) ||
        (y < h - 1 && biomes[i + w] !== 0)
      ) {
        distances[i] = 0;
        queue[tail++] = i;
      }
    }
  for (let head = 0; head < tail; head++) {
    const i = queue[head],
      x = i % w,
      y = Math.floor(i / w);
    for (let direction = 0; direction < 4; direction++) {
      const j =
        direction === 0
          ? x > 0
            ? i - 1
            : -1
          : direction === 1
            ? x < w - 1
              ? i + 1
              : -1
            : direction === 2
              ? y > 0
                ? i - w
                : -1
              : y < h - 1
                ? i + w
                : -1;
      if (j >= 0 && biomes[j] === 0 && distances[j] > distances[i] + 1) {
        distances[j] = distances[i] + 1;
        queue[tail++] = j;
      }
    }
  }
  const edges = new Int32Array(3 * n).fill(-1),
    polygon = new Int32Array(4);
  let vertices = n,
    indexCapacity = 0,
    pass = 0,
    written = 0,
    count = 0;
  const append = (id: number) => {
    if (count === 0 || polygon[count - 1] !== id) polygon[count++] = id;
  };
  let positions: Float32Array, depths: Float32Array, shore: Float32Array, indices: Uint32Array;
  const intersection = (a: number, b: number): number => {
    const lo = Math.min(a, b),
      hi = Math.max(a, b),
      da = sea - values[lo],
      db = sea - values[hi];
    if (da === 0) return lo;
    if (db === 0) return hi;
    const key =
      3 * lo + (Math.floor(lo / w) === Math.floor(hi / w) ? 0 : lo % w === hi % w ? 1 : 2);
    if (pass === 0) {
      if (edges[key] < 0) edges[key] = vertices++;
      return edges[key];
    }
    const id = edges[key],
      t = da / (da - db),
      x = (lo % w) + ((hi % w) - (lo % w)) * t,
      z = Math.floor(lo / w) + (Math.floor(hi / w) - Math.floor(lo / w)) * t;
    positions[id * 3] = x - (w - 1) / 2;
    positions[id * 3 + 1] = sea;
    positions[id * 3 + 2] = z - (h - 1) / 2;
    depths[id] = 0;
    shore[id] = 0;
    return id;
  };
  const triangle = (a: number, b: number, c: number) => {
    if (
      (biomes[a] !== 0 && values[a] <= sea) ||
      (biomes[b] !== 0 && values[b] <= sea) ||
      (biomes[c] !== 0 && values[c] <= sea)
    )
      return;
    if (biomes[a] !== 0 && biomes[b] !== 0 && biomes[c] !== 0) return;
    count = 0;
    let previous = c;
    for (let k = 0; k < 3; k++) {
      const current = k === 0 ? a : k === 1 ? b : c,
        inside = biomes[current] === 0,
        wasInside = biomes[previous] === 0;
      if (inside !== wasInside) append(intersection(previous, current));
      if (inside) append(current);
      previous = current;
    }
    if (count > 1 && polygon[0] === polygon[count - 1]) count--;
    if (count < 3) return;
    if (pass === 0) {
      indexCapacity += (count - 2) * 3;
      return;
    }
    for (let k = 1; k < count - 1; k++) {
      const a = polygon[0],
        b = polygon[k],
        c = polygon[k + 1];
      const area =
        (positions[b * 3 + 2] - positions[a * 3 + 2]) * (positions[c * 3] - positions[a * 3]) -
        (positions[b * 3] - positions[a * 3]) * (positions[c * 3 + 2] - positions[a * 3 + 2]);
      if (area <= 0) continue;
      indices[written++] = a;
      indices[written++] = b;
      indices[written++] = c;
    }
  };
  const traverse = () => {
    for (let y = 0; y < h - 1; y++)
      for (let x = 0; x < w - 1; x++) {
        const i = y * w + x;
        triangle(i, i + w, i + 1);
        triangle(i + 1, i + w, i + w + 1);
      }
  };
  traverse();
  if (indexCapacity === 0) return undefined;
  positions = new Float32Array(vertices * 3);
  depths = new Float32Array(vertices);
  shore = new Float32Array(vertices);
  indices = new Uint32Array(indexCapacity);
  for (let i = 0; i < n; i++) {
    positions[i * 3] = (i % w) - (w - 1) / 2;
    positions[i * 3 + 1] = sea;
    positions[i * 3 + 2] = Math.floor(i / w) - (h - 1) / 2;
    depths[i] = Math.max(0, sea - values[i]);
    shore[i] = distances[i];
  }
  pass = 1;
  traverse();
  if (written === 0) return undefined;
  const geometry = new BufferGeometry();
  geometry.name = 'ocean-presentation-v1';
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.setAttribute('waterDepth', new BufferAttribute(depths, 1));
  geometry.setAttribute('shoreDistance', new BufferAttribute(shore, 1));
  geometry.setIndex(new BufferAttribute(indices, 1));
  geometry.setDrawRange(0, written);
  geometry.computeBoundingSphere();
  return geometry;
}
