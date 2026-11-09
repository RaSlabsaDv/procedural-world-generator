import { finalizeTestWire } from '../testing/terrain-test-fixture';
import { decodeRivers } from './river-decoder';
import { decodeTerrain } from './terrain-decoder';
import { compareTerrains } from './terrain-comparison';
import { RIVER_NETWORK_VERSION } from './terrain.models';
import {
  testMap,
  testTerrain,
  testWire,
  testWireHydrology,
  testSurfaceWeights,
} from '../testing/terrain-test-fixture';

function fixture() {
  const terrain = testTerrain({ ...testMap, width: 34, height: 3 });
  const wire = testWire(terrain);
  wire.result.biomes.fill(1);
  wire.result.surfaceWeights = testSurfaceWeights(wire.result.biomes);
  wire.result.hydrology = testWireHydrology(wire.result);
  // Middle row westward chain: left boundary accumulates33, next cell32, then31.
  wire.result.rivers = {
    algorithmVersion: RIVER_NETWORK_VERSION,
    cellIndices: [34, 35],
    widths: [0.6038762, 0.6],
  };
  finalizeTestWire(wire);
  return { terrain, wire };
}
function run() {
  const { terrain, wire } = fixture();
  return {
    terrain,
    request: terrain.heightMap,
    response: decodeTerrain(wire, terrain.heightMap, terrain),
    requestMs: 1,
    initMs: null,
  };
}

describe('river network contract', () => {
  it('decodes a complete boundary-reaching chain into independent typed arrays', () => {
    const { terrain, wire } = fixture();
    const decoded = decodeTerrain(wire, terrain.heightMap, terrain);
    expect(decoded.result.rivers.cellIndices).toBeInstanceOf(Int32Array);
    expect(decoded.result.rivers.widths).toBeInstanceOf(Float32Array);
    expect([...decoded.result.rivers.cellIndices]).toEqual([34, 35]);
    wire.result.rivers.cellIndices[0] = 99;
    expect(decoded.result.rivers.cellIndices[0]).toBe(34);
  });
  it('rejects missing, stale, unexpected and mismatched contracts', () => {
    const sample = run();
    for (const raw of [
      null,
      undefined,
      {},
      { ...fixture().wire.result.rivers, extra: 1 },
      { ...fixture().wire.result.rivers, algorithmVersion: 'old' },
      { ...fixture().wire.result.rivers, widths: [] },
    ]) {
      expect(() =>
        decodeRivers(raw, sample.response.result.biomes, sample.response.result.hydrology, () => {
          throw Error('invalid');
        }),
      ).toThrow();
    }
  });
  it('rejects missing, extra, unsorted, duplicate and noninteger cells', () => {
    for (const indices of [
      [],
      [34],
      [34, 35, 36],
      [35, 34],
      [34, 34],
      [-1, 35],
      [34.5, 35],
      [34, 102],
    ]) {
      const { terrain, wire } = fixture();
      wire.result.rivers.cellIndices = indices;
      wire.result.rivers.widths = indices.map(() => 0.6);
      expect(() => decodeTerrain(wire, terrain.heightMap, terrain)).toThrow();
    }
  });
  it('rejects invalid widths and Ocean membership', () => {
    for (const width of [-1, 0.59, 3.1, Infinity, NaN, 0.8]) {
      const { terrain, wire } = fixture();
      wire.result.rivers.widths[1] = width;
      expect(() => decodeTerrain(wire, terrain.heightMap, terrain)).toThrow();
    }
    const sample = run();
    sample.response.result.biomes[34] = 0;
    expect(() =>
      decodeRivers(
        fixture().wire.result.rivers,
        sample.response.result.biomes,
        sample.response.result.hydrology,
        () => {
          throw Error('invalid');
        },
      ),
    ).toThrow();
  });
  it('rejects a channel continuing into unselected land', () => {
    const sample = run(),
      h = sample.response.result.hydrology;
    h.receiverIndex[35] = 36;
    expect(() =>
      decodeRivers(fixture().wire.result.rivers, sample.response.result.biomes, h, () => {
        throw Error('invalid');
      }),
    ).toThrow();
  });
  it('compares all indices, widths and length, including empty networks', () => {
    const a = run();
    expect(compareTerrains(a, run()).riverMismatchCount).toBe(0);
    for (const field of ['cellIndices', 'widths'] as const) {
      const b = run();
      b.response.result.rivers[field][0] += 1;
      const result = compareTerrains(a, b);
      expect(result.riverMismatchCount).toBe(1);
      expect(result.numericMatch).toBe(false);
    }
    const b = run();
    const changed = {
      ...b,
      response: {
        ...b.response,
        result: {
          ...b.response.result,
          rivers: {
            ...b.response.result.rivers,
            cellIndices: new Int32Array(),
            widths: new Float32Array(),
          },
        },
      },
    };
    expect(compareTerrains(a, changed).riverMismatchCount).toBe(2);
    expect(compareTerrains(a, changed).numericMatch).toBe(false);
  });
});
