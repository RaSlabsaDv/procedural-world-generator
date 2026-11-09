import type { BufferAttribute, BufferGeometry } from 'three';
import type { TerrainResponse } from '../data/terrain.models';
import { presentationHash as hash, presentationRandom as random } from './presentation-random';
import { shoreGround } from './shore-stone-placement';
import { shoreObstacles } from './shore-obstacles';
import { shoreWaterIndex } from './shore-water-index';

export const REEDS = Object.freeze({
  revision: 'inland-reeds-v1',
  maxCount: 2048,
  stride: 9,
  reach: 0.75,
  maxDepth: 0.18,
  maxRise: 0.2,
  maxSlope: 0.35,
  minCue: 0.02,
  minWet: 0.08,
  rootRadius: 0.12,
  collisionRadius: 0.24,
  clearance: 0.05,
  stoneClearance: 0.06,
  maxBedRange: 0.12,
  embed: 0.015,
  fadeNear: 45,
  fadeFar: 140,
});
type Result = TerrainResponse['result'];
type Water = ReturnType<typeof shoreWaterIndex>;
const smooth = (t: number) => {
  const v = Math.max(0, Math.min(1, t));
  return v * v * (3 - 2 * v);
};
const newSample = () => ({ y: 0, nx: 0, ny: 1, nz: 0, wet: 0 });
export const newReedSite = () => ({ y: 0, depth: 0, wet: 0, level: 0 });
const gentle = (s: ReturnType<typeof newSample>) => s.ny >= 1 / Math.sqrt(1 + REEDS.maxSlope ** 2);

/** Reused sampling state, not one allocation per candidate. */
export function reedSiteSampler(result: Result, wet: BufferAttribute, water: Water) {
  const sample = newSample(),
    witness = newSample();
  return (x: number, z: number, out: ReturnType<typeof newReedSite>): boolean => {
    if (!shoreGround(result, wet, x, z, sample) || !gentle(sample) || sample.wet < REEDS.minCue)
      return false;
    const contact = water.sample(x, z),
      distance = contact.distance,
      level = contact.level,
      rise = sample.y - level;
    if (distance > REEDS.reach || rise > REEDS.maxRise || rise < -REEDS.maxDepth) return false;
    out.y = sample.y;
    out.wet = sample.wet;
    out.level = level;
    out.depth = Math.max(0, -rise);
    if (rise >= 0) return sample.wet >= REEDS.minWet;
    if (distance > 1e-6) return false; // only an emitted surface supports submerged roots
    for (let radius = 0.4; radius <= 1.201; radius += 0.4)
      for (let k = 0; k < 8; k++) {
        const angle = (k * Math.PI) / 4,
          wx = x + Math.cos(angle) * radius,
          wz = z + Math.sin(angle) * radius;
        if (
          !shoreGround(result, wet, wx, wz, witness) ||
          !gentle(witness) ||
          witness.wet < REEDS.minWet
        )
          continue;
        const bank = water.sample(wx, wz),
          bankRise = witness.y - bank.level;
        if (
          bank.distance >= 0.02 &&
          bank.distance <= REEDS.reach &&
          bankRise >= 0 &&
          bankRise <= REEDS.maxRise &&
          Math.abs(bank.level - level) <= 0.2
        )
          return true;
      }
    return false;
  };
}

/** Decorative shore tufts only; all ecological output remains authoritative and unchanged. */
export function placeReeds(
  seed: number,
  result: Result,
  terrain: BufferGeometry,
  water: readonly (BufferGeometry | undefined)[],
  stones = new Float32Array(0),
) {
  const empty = {
    records: new Float32Array(0),
    candidates: 0,
    submerged: 0,
    scratchBytes: 0,
    checks: 0,
    crowded: 0,
  };
  if (!water.some((g) => g?.index?.count)) return empty;
  const wet = terrain.getAttribute('bankWetness') as BufferAttribute,
    index = shoreWaterIndex(result.width, result.height, water);
  const obstacles = shoreObstacles(result, REEDS.maxCount, stones, REEDS.stoneClearance);
  const sample = reedSiteSampler(result, wet, index),
    site = newReedSite(),
    foot = newSample();
  const records = new Float32Array(REEDS.maxCount * REEDS.stride);
  const cellsX = result.width - 1,
    candidates = 2 * cellsX * (result.height - 1),
    start = hash(seed, candidates, 0x584b) % candidates;
  let step = (hash(seed, candidates, 0x981d) % candidates) | 1;
  const gcd = (a: number, b: number) => {
    while (b) {
      const r = a % b;
      a = b;
      b = r;
    }
    return a;
  };
  while (gcd(step, candidates) !== 1) step += 2;
  const density = (a: number, b: number) =>
    random(seed, Math.imul(a, 73856093) ^ Math.imul(b, 19349663), 0xb7a3);
  let count = 0,
    submerged = 0,
    visited = 0;
  for (let j = 0; j < candidates && count < REEDS.maxCount; j++) {
    visited++;
    const id = (start + j * step) % candidates,
      cell = Math.floor(id / 2);
    const x = (cell % cellsX) + 0.04 + 0.92 * random(seed, id, 0x842d),
      z = Math.floor(cell / cellsX) + 0.04 + 0.92 * random(seed, id, 0x78ab);
    // Reject cheaply before querying emitted triangles and witnesses.
    if (!shoreGround(result, wet, x, z, foot) || !gentle(foot) || foot.wet < REEDS.minCue) continue;
    const cx = Math.floor(x / 4),
      cz = Math.floor(z / 4),
      fx = smooth(x / 4 - cx),
      fz = smooth(z / 4 - cz);
    const lo = density(cx, cz) * (1 - fx) + density(cx + 1, cz) * fx,
      hi = density(cx, cz + 1) * (1 - fx) + density(cx + 1, cz + 1) * fx;
    const cluster = smooth((lo * (1 - fz) + hi * fz - 0.45) / 0.35);
    if (random(seed, id, 0x9d37) > 0.45 * cluster) continue;
    if (!sample(x, z, site)) continue;
    const width = 0.8 + 0.4 * random(seed, id, 0x53a9),
      height = 1 + 0.65 * random(seed, id, 0x197d);
    const envelope = REEDS.collisionRadius * width + REEDS.clearance;
    if (obstacles.blocked(x, z, envelope)) continue;
    let minY = site.y,
      maxY = site.y,
      supported = true;
    for (let k = 0; k < 8; k++) {
      const angle = (k * Math.PI) / 4,
        dx = Math.cos(angle) * REEDS.rootRadius * width,
        dz = Math.sin(angle) * REEDS.rootRadius * width;
      if (
        !shoreGround(result, wet, x + dx, z + dz, foot) ||
        !gentle(foot) ||
        site.level - foot.y > REEDS.maxDepth ||
        foot.y - site.level > 0.25
      ) {
        supported = false;
        break;
      }
      minY = Math.min(minY, foot.y);
      maxY = Math.max(maxY, foot.y);
    }
    if (!supported || maxY - minY > REEDS.maxBedRange) continue;
    const o = count * REEDS.stride;
    records[o] = x;
    records[o + 1] = minY - REEDS.embed;
    records[o + 2] = z;
    records[o + 3] = width;
    records[o + 4] = height;
    records[o + 5] = random(seed, id, 0x58c1) * Math.PI * 2;
    records[o + 6] = random(seed, id, 0xc16b);
    records[o + 7] = id;
    records[o + 8] = site.depth;
    obstacles.add(x, z, envelope);
    count++;
    if (site.depth > 0) submerged++;
  }
  return {
    records: records.slice(0, count * REEDS.stride),
    candidates: visited,
    submerged,
    scratchBytes: index.bytes + obstacles.bytes + records.byteLength + count * REEDS.stride * 4,
    ...obstacles.stats(),
  };
}
