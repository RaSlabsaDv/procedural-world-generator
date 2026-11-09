import { HydrologyResult, HYDROLOGY_VERSION, LANDSCAPE_BIOME } from './terrain.models';
import { object } from './contract-utils';

/** Verify the received graph, without reproducing Core's priority-flood generator. */
export function decodeHydrology(
  raw: unknown,
  heights: Float32Array,
  biomes: Uint8Array,
  width: number,
  height: number,
  maxDepth: number,
  fail: () => never,
): HydrologyResult {
  const names = ['algorithmVersion', 'receiverIndex', 'flowAccumulation', 'depressionDepth'];
  if (
    !object(raw) ||
    Object.keys(raw).length !== names.length ||
    !names.every((n) => Object.hasOwn(raw, n)) ||
    raw['algorithmVersion'] !== HYDROLOGY_VERSION
  )
    return fail();
  const count = heights.length,
    r = raw['receiverIndex'],
    a = raw['flowAccumulation'],
    d = raw['depressionDepth'];
  if (
    !Array.isArray(r) ||
    !Array.isArray(a) ||
    !Array.isArray(d) ||
    r.length !== count ||
    a.length !== count ||
    d.length !== count
  )
    return fail();
  const receiverIndex = new Int32Array(count),
    flowAccumulation = new Uint32Array(count),
    depressionDepth = new Float32Array(count);
  const incoming = new Int32Array(count),
    expected = new Uint32Array(count),
    queue = new Int32Array(count);
  let land = 0;
  for (let i = 0; i < count; i++) {
    const next = r[i],
      value = a[i],
      depth = d[i],
      x = i % width,
      y = Math.floor(i / width);
    const terminal =
      biomes[i] === LANDSCAPE_BIOME.Ocean ||
      x === 0 ||
      x === width - 1 ||
      y === 0 ||
      y === height - 1;
    if (
      !Number.isInteger(next) ||
      next < -1 ||
      next >= count ||
      next === i ||
      (next === -1) !== terminal ||
      !Number.isInteger(value) ||
      value < 0 ||
      value > count ||
      typeof depth !== 'number' ||
      !Number.isFinite(depth) ||
      depth < 0 ||
      depth > maxDepth ||
      (terminal && depth !== 0)
    )
      return fail();
    if (
      next >= 0 &&
      (Math.abs((next % width) - x) > 1 || Math.abs(Math.floor(next / width) - y) > 1)
    )
      return fail();
    receiverIndex[i] = next;
    flowAccumulation[i] = value;
    depressionDepth[i] = depth;
    if (!Number.isFinite(depressionDepth[i])) return fail();
    if (biomes[i] !== LANDSCAPE_BIOME.Ocean) {
      expected[i] = 1;
      land++;
    }
    if (next >= 0) incoming[next]++;
  }
  let head = 0,
    tail = 0,
    total = 0;
  for (let i = 0; i < count; i++) if (incoming[i] === 0) queue[tail++] = i;
  while (head < tail) {
    const i = queue[head++],
      next = receiverIndex[i];
    if (flowAccumulation[i] !== expected[i]) return fail();
    if (next >= 0) {
      const level = heights[i] + depressionDepth[i],
        required = Math.max(heights[i], heights[next] + depressionDepth[next]);
      if (Math.abs(level - required) > 1e-6 + 1e-5 * Math.max(Math.abs(level), Math.abs(required)))
        return fail();
      expected[next] += expected[i];
      if (--incoming[next] === 0) queue[tail++] = next;
    } else total += expected[i];
  }
  if (head !== count || total !== land) return fail();
  return Object.freeze({
    algorithmVersion: HYDROLOGY_VERSION,
    receiverIndex,
    flowAccumulation,
    depressionDepth,
  });
}
