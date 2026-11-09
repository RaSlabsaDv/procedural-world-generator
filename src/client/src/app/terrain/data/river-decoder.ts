import {
  HydrologyResult,
  LANDSCAPE_BIOME,
  RiverNetworkResult,
  RIVER_NETWORK_VERSION,
} from './terrain.models';
import { object } from './contract-utils';

// Frozen wire constraints. These verify supplied data; only Core extracts networks.
const MIN_CATCHMENT = 32,
  CATCHMENT_DIVISOR = 512;
const WIDTH_BASE = 0.35,
  WIDTH_SCALE = 0.25,
  MIN_WIDTH = 0.6,
  MAX_WIDTH = 3;

export function decodeRivers(
  raw: unknown,
  biomes: Uint8Array,
  hydrology: HydrologyResult,
  fail: () => never,
): RiverNetworkResult {
  const names = ['algorithmVersion', 'cellIndices', 'widths'];
  if (
    !object(raw) ||
    Object.keys(raw).length !== names.length ||
    !names.every((n) => Object.hasOwn(raw, n)) ||
    raw['algorithmVersion'] !== RIVER_NETWORK_VERSION
  )
    return fail();
  const indices = raw['cellIndices'],
    widths = raw['widths'],
    count = biomes.length;
  if (
    !Array.isArray(indices) ||
    !Array.isArray(widths) ||
    indices.length !== widths.length ||
    indices.length > count
  )
    return fail();
  let land = 0;
  for (const biome of biomes) if (biome !== LANDSCAPE_BIOME.Ocean) land++;
  const threshold = Math.max(MIN_CATCHMENT, Math.ceil(land / CATCHMENT_DIVISOR));
  const cellIndices = new Int32Array(indices.length),
    normalizedWidths = new Float32Array(indices.length);
  let cursor = 0;
  for (let i = 0; i < count; i++) {
    if (biomes[i] === LANDSCAPE_BIOME.Ocean || hydrology.flowAccumulation[i] < threshold) continue;
    // Scanning the domain verifies sorted uniqueness AND completeness without a second graph.
    const width = widths[cursor];
    if (
      indices[cursor] !== i ||
      typeof width !== 'number' ||
      !Number.isFinite(width) ||
      width < MIN_WIDTH ||
      width > MAX_WIDTH
    )
      return fail();
    const expected = Math.fround(
      Math.min(
        MAX_WIDTH,
        Math.max(
          MIN_WIDTH,
          WIDTH_BASE + WIDTH_SCALE * Math.sqrt(hydrology.flowAccumulation[i] / threshold),
        ),
      ),
    );
    if (Math.abs(width - expected) > 1e-6 + 1e-5 * Math.max(Math.abs(width), Math.abs(expected)))
      return fail();
    const next = hydrology.receiverIndex[i];
    if (
      next >= 0 &&
      biomes[next] !== LANDSCAPE_BIOME.Ocean &&
      hydrology.flowAccumulation[next] < threshold
    )
      return fail();
    cellIndices[cursor] = i;
    normalizedWidths[cursor++] = width;
  }
  if (cursor !== indices.length) return fail();
  return Object.freeze({
    algorithmVersion: RIVER_NETWORK_VERSION,
    cellIndices,
    widths: normalizedWidths,
  });
}
