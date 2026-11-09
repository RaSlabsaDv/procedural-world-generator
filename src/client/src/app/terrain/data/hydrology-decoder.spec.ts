import { decodeHydrology } from './hydrology-decoder';
import { compareTerrains } from './terrain-comparison';
import { decodeTerrain } from './terrain-decoder';
import { testMap, testTerrain, testWire } from '../testing/terrain-test-fixture';
import { HYDROLOGY_VERSION } from './terrain.models';

function fixture() {
  return {
    algorithmVersion: HYDROLOGY_VERSION,
    receiverIndex: [-1, -1, -1, -1, 0, -1, -1, -1, -1],
    flowAccumulation: [2, 1, 1, 1, 1, 1, 1, 1, 1],
    depressionDepth: [0, 0, 0, 0, 5, 0, 0, 0, 0],
  };
}
const heights = new Float32Array([5, 5, 5, 5, 0, 5, 5, 5, 5]);
const biomes = new Uint8Array(9).fill(1);
const decode = (raw: unknown) =>
  decodeHydrology(raw, heights, biomes, 3, 3, 30, () => {
    throw Error('invalid');
  });

describe('hydrology graph contract', () => {
  it('copies required vectors into independent typed storage', () => {
    const raw = fixture(),
      result = decode(raw);
    expect(result.receiverIndex).toBeInstanceOf(Int32Array);
    expect(result.flowAccumulation).toBeInstanceOf(Uint32Array);
    expect(result.depressionDepth).toBeInstanceOf(Float32Array);
    raw.receiverIndex[4] = 8;
    expect(result.receiverIndex[4]).toBe(0);
    expect(result.depressionDepth[4]).toBe(5);
  });
  it('rejects incomplete, stale and unexpected contracts', () => {
    for (const raw of [
      undefined,
      null,
      {},
      { ...fixture(), algorithmVersion: 'v0' },
      { ...fixture(), extra: 1 },
      { ...fixture(), receiverIndex: [] },
    ])
      expect(() => decode(raw)).toThrow();
  });
  it('rejects malformed outlets, edges, counts, depths and spill levels', () => {
    for (const [field, index, value] of [
      ['receiverIndex', 4, -1],
      ['receiverIndex', 0, 4],
      ['receiverIndex', 4, 4],
      ['receiverIndex', 4, 9],
      ['receiverIndex', 4, 0.5],
      ['flowAccumulation', 0, 1],
      ['flowAccumulation', 4, 0],
      ['flowAccumulation', 4, NaN],
      ['depressionDepth', 4, -1],
      ['depressionDepth', 4, 31],
      ['depressionDepth', 4, Infinity],
      ['depressionDepth', 4, 4],
      ['depressionDepth', 0, 1],
    ] as const) {
      const raw = fixture();
      raw[field][index] = value;
      expect(() => decode(raw)).toThrow();
    }
  });
  it('rejects interior cycles even when their receivers are adjacent', () => {
    const r = Array(16).fill(-1);
    r[5] = 6;
    r[6] = 5;
    r[9] = 0;
    r[10] = 15;
    expect(() =>
      decodeHydrology(
        {
          algorithmVersion: HYDROLOGY_VERSION,
          receiverIndex: r,
          flowAccumulation: [2, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2],
          depressionDepth: Array(16).fill(0),
        },
        new Float32Array(16),
        new Uint8Array(16).fill(1),
        4,
        4,
        30,
        () => {
          throw Error('invalid');
        },
      ),
    ).toThrow();
  });
  it('includes every hydrology vector in equivalence checks', () => {
    const terrain = testTerrain(),
      response = decodeTerrain(testWire(), testMap, terrain);
    const run = { request: testMap, terrain, response, requestMs: 1, initMs: null };
    expect(compareTerrains(run, run).hydrologyMismatchCount).toBe(0);
    for (const field of ['receiverIndex', 'flowAccumulation', 'depressionDepth'] as const) {
      const changed = decodeTerrain(testWire(), testMap, terrain);
      changed.result.hydrology[field][0] += 1;
      const comparison = compareTerrains(run, { ...run, response: changed });
      expect(comparison.hydrologyMismatchCount).toBe(1);
      expect(comparison.numericMatch).toBe(false);
    }
  });
});
