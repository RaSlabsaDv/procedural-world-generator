import { SHORE_CLEARANCE, shoreObstacles } from './shore-obstacles';
import type { BufferAttribute, BufferGeometry } from 'three';
import { LANDSCAPE_BIOME as B, TerrainResponse } from '../data/terrain.models';
import { presentationHash as hash, presentationRandom as random } from './presentation-random';
import { shoreWaterIndex } from './shore-water-index';

export const SHORE_STONES = Object.freeze({
  revision: 'inland-shore-stones-v1',
  maxCount: 4096,
  maxLarge: 64,
  // Packed setup record: x,y,z, radius,height,depth, nx,ny,nz, yaw,shade,sizeClass,id.
  stride: 13,
  reach: 1.4,
  minDistance: 0.04,
  maxRise: 0.45,
  minWet: 0.08,
  maxSlope: 0.55,
  maxSnow: 0.08,
  indexCellSize: SHORE_CLEARANCE.cellSize,
  maxChecks: SHORE_CLEARANCE.maxChecks,
  embed: 0.18,
  footprintScale: 1.2,
});
type Result = TerrainResponse['result'];
const smooth = (t: number) => {
  const v = Math.max(0, Math.min(1, t));
  return v * v * (3 - 2 * v);
};
const gcd = (a: number, b: number): number => {
  while (b) {
    const r = a % b;
    a = b;
    b = r;
  }
  return a;
};

/** One reused, exact supporting-triangle sample. */
export function shoreGround(
  result: Result,
  wet: BufferAttribute,
  x: number,
  z: number,
  out: { y: number; nx: number; ny: number; nz: number; wet: number },
): boolean {
  const { width: w, height: h, values: v, biomes, surfaceWeights: s } = result;
  if (x < 0 || z < 0 || x > w - 1 || z > h - 1) return false;
  const cx = Math.min(w - 2, Math.floor(x)),
    cz = Math.min(h - 2, Math.floor(z));
  const i = cz * w + cx,
    fx = x - cx,
    fz = z - cz,
    first = fx + fz <= 1;
  const a = first ? i : i + 1,
    b = i + w,
    c = first ? i + 1 : i + w + 1;
  const wa = first ? 1 - fx - fz : 1 - fz,
    wb = first ? fz : 1 - fx,
    wc = first ? fx : fx + fz - 1;
  out.y = wa * v[a] + wb * v[b] + wc * v[c];
  out.wet = wa * wet.getX(a) + wb * wet.getX(b) + wc * wet.getX(c);
  const dx = first ? v[i + 1] - v[i] : v[i + w + 1] - v[i + w];
  const dz = first ? v[i + w] - v[i] : v[i + w + 1] - v[i + 1],
    length = Math.hypot(dx, 1, dz);
  out.nx = -dx / length;
  out.ny = 1 / length;
  out.nz = -dz / length;
  if (dx * dx + dz * dz > SHORE_STONES.maxSlope ** 2) return false;
  for (let k = 0; k < 3; k++) {
    const j = k === 0 ? a : k === 1 ? b : c;
    if (
      biomes[j] === B.Ocean ||
      biomes[j] === B.SnowHighlands ||
      s[j * 5 + 4] > SHORE_STONES.maxSnow
    )
      return false;
  }
  return true;
}

/** Bounded decorative scatter; does not create or modify canonical rock instances. */
export function placeShoreStones(
  seed: number,
  result: Result,
  terrain: BufferGeometry,
  water: readonly (BufferGeometry | undefined)[],
) {
  const empty = {
    records: new Float32Array(0),
    candidates: 0,
    large: 0,
    scratchBytes: 0,
    checks: 0,
    crowded: 0,
  };
  if (!water.some((g) => g?.index?.count)) return empty;
  const wet = terrain.getAttribute('bankWetness') as BufferAttribute;
  const index = shoreWaterIndex(result.width, result.height, water),
    blocked = shoreObstacles(result, SHORE_STONES.maxCount);
  const records = new Float32Array(SHORE_STONES.maxCount * SHORE_STONES.stride);
  const cellsX = result.width - 1,
    cells = cellsX * (result.height - 1),
    candidates = cells * 2;
  const start = hash(seed, candidates, 0x6a41) % candidates;
  let step = (hash(seed, candidates, 0x92d7) % candidates) | 1;
  while (gcd(step, candidates) !== 1) step += 2;
  const sample = { y: 0, nx: 0, ny: 1, nz: 0, wet: 0 },
    ring = { ...sample };
  const value = (a: number, b: number) =>
    random(seed, Math.imul(a, 73856093) ^ Math.imul(b, 19349663), 0x533d);
  let count = 0,
    large = 0,
    visited = 0;
  for (let j = 0; j < candidates && count < SHORE_STONES.maxCount; j++) {
    visited++;
    const id = (start + j * step) % candidates,
      cell = Math.floor(id / 2);
    const x = (cell % cellsX) + 0.04 + 0.92 * random(seed, id, 0x134d);
    const z = Math.floor(cell / cellsX) + 0.04 + 0.92 * random(seed, id, 0xc751);
    if (!shoreGround(result, wet, x, z, sample) || sample.wet < SHORE_STONES.minWet) continue;
    const px = Math.floor(x / 4),
      pz = Math.floor(z / 4),
      fx = smooth(x / 4 - px),
      fz = smooth(z / 4 - pz);
    const lo = value(px, pz) * (1 - fx) + value(px + 1, pz) * fx,
      hi = value(px, pz + 1) * (1 - fx) + value(px + 1, pz + 1) * fx;
    const cluster = smooth((lo * (1 - fz) + hi * fz - 0.35) / 0.4);
    if (random(seed, id, 0x733b) > 0.55 * cluster * (0.3 + 0.7 * sample.wet)) continue;
    const contact = index.sample(x, z),
      rise = sample.y - contact.level;
    if (
      contact.distance < SHORE_STONES.minDistance ||
      contact.distance > SHORE_STONES.reach ||
      rise < -0.01 ||
      rise > SHORE_STONES.maxRise
    )
      continue;
    const size = random(seed, id, 0x385d),
      kind = size < 0.835 ? 0 : size < 0.985 ? 1 : 2;
    if (kind === 2 && large === SHORE_STONES.maxLarge) continue;
    const radius =
      (kind === 0 ? 0.06 : kind === 1 ? 0.14 : 0.24) +
      (kind === 0 ? 0.08 : kind === 1 ? 0.1 : 0.14) * random(seed, id, 0x3727);
    const height = radius * (0.4 + 0.25 * random(seed, id, 0xc3d9)),
      depth = radius * (0.65 + 0.35 * random(seed, id, 0x251b));
    const envelope = radius * SHORE_STONES.footprintScale;
    if (blocked.blocked(x, z, envelope)) continue;
    let supported = true;
    for (let k = 0; k < 8; k++) {
      const angle = (k * Math.PI) / 4,
        dx = Math.cos(angle) * envelope,
        dz = Math.sin(angle) * envelope;
      if (
        !shoreGround(result, wet, x + dx, z + dz, ring) ||
        Math.abs(ring.y - (sample.y - (sample.nx * dx + sample.nz * dz) / sample.ny)) >
          0.35 * height + 0.005
      ) {
        supported = false;
        break;
      }
    }
    if (!supported) continue;
    const o = count * SHORE_STONES.stride;
    records[o] = x;
    records[o + 1] = sample.y;
    records[o + 2] = z;
    records[o + 3] = radius;
    records[o + 4] = height;
    records[o + 5] = depth;
    records[o + 6] = sample.nx;
    records[o + 7] = sample.ny;
    records[o + 8] = sample.nz;
    records[o + 9] = random(seed, id, 0x51bf) * Math.PI * 2;
    records[o + 10] = 0.82 + 0.22 * random(seed, id, 0x8947);
    records[o + 11] = kind;
    records[o + 12] = id;
    blocked.add(x, z, envelope);
    count++;
    if (kind === 2) large++;
  }
  return {
    records: records.slice(0, count * SHORE_STONES.stride),
    candidates: visited,
    large,
    scratchBytes:
      index.bytes + blocked.bytes + records.byteLength + count * SHORE_STONES.stride * 4,
    ...blocked.stats(),
  };
}
