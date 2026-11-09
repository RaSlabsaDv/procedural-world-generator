import { finalizeTestWire } from '../testing/terrain-test-fixture';
import { testWireHydrology } from '../testing/terrain-test-fixture';
import { compareTerrains, decodeTerrain } from './terrain.contract';
import { testTerrain, testWire, testSurfaceWeights } from '../testing/terrain-test-fixture';

function fixture() {
  const terrain = testTerrain(),
    wire = testWire(terrain);
  wire.result.biomes = [0, 1, 1, 1, 1, 1];
  wire.result.surfaceWeights = testSurfaceWeights(wire.result.biomes);
  wire.result.hydrology = testWireHydrology(wire.result);
  finalizeTestWire(wire);
  return { terrain, wire };
}

it.each([
  undefined,
  null,
  {},
  'AAAA',
  [],
  [0],
  Array(30).fill(NaN),
  Array(30).fill(Infinity),
  Array(30).fill('0'),
])('rejects missing or malformed required coverage %j', (value) => {
  const { terrain, wire } = fixture();
  expect(() =>
    decodeTerrain(
      { ...wire, result: { ...wire.result, surfaceWeights: value } },
      terrain.heightMap,
      terrain,
    ),
  ).toThrow();
});

it.each([
  [5, -1e-50],
  [5, 1.000000001],
  [7, 1],
  [0, 1e-50],
  [5, 0.2],
  [5, Infinity],
  [5, '0.5'],
])('rejects corrupt vectors at index %j: %j', (index, value) => {
  const { terrain, wire } = fixture();
  const weights: unknown[] = [...wire.result.surfaceWeights];
  weights[index as number] = value;
  expect(() =>
    decodeTerrain(
      { ...wire, result: { ...wire.result, surfaceWeights: weights } },
      terrain.heightMap,
      terrain,
    ),
  ).toThrow();
});

it('keeps independent float32 weights and compares the last vector', () => {
  const { terrain, wire } = fixture();
  const run = () => ({
    terrain,
    request: terrain.heightMap,
    response: decodeTerrain(wire, terrain.heightMap, terrain),
    requestMs: 1,
    initMs: null,
  });
  const a = run(),
    b = run();
  wire.result.surfaceWeights[5] = 0.25;
  expect(a.response.result.surfaceWeights).toBeInstanceOf(Float32Array);
  expect(a.response.result.surfaceWeights[5]).toBe(0.5);
  expect(compareTerrains(a, b).coverageMismatchCount).toBe(0);
  b.response.result.surfaceWeights.set([0.4, 0.6, 0, 0, 0], 25);
  expect(compareTerrains(a, b)).toMatchObject({
    numericMatch: false,
    coverageMismatchCount: 2,
    mismatchCount: 0,
    environmentMismatchCount: 0,
  });
});

it.each(['resultVersion', 'executionProfile', 'workload'])(
  'rejects the old %s identity',
  (field) => {
    const { terrain, wire } = fixture();
    const value =
      field === 'resultVersion'
        ? { ...wire, result: { ...wire.result, resultVersion: 'landscape-ecology-v3' } }
        : {
            ...wire,
            [field]:
              field === 'workload' ? 'landscape-ecology-hydraulic-v3' : 'landscape-worker-json-v3',
          };
    expect(() => decodeTerrain(value, terrain.heightMap, terrain)).toThrow();
  },
);

it('accepts nonzero land sand and compares its last sample independently', () => {
  const { terrain, wire } = fixture();
  wire.result.surfaceWeights.splice(25, 5, 0.1, 0.2, 0.4, 0.3, 0);
  const response = decodeTerrain(wire, terrain.heightMap, terrain);
  expect(response.result.surfaceWeights[27]).toBe(Math.fround(0.4));
  const a = { terrain, request: terrain.heightMap, response, requestMs: 1, initMs: null };
  const other = {
    ...response,
    result: { ...response.result, surfaceWeights: response.result.surfaceWeights.slice() },
  };
  other.result.surfaceWeights[27] = 0.3;
  expect(compareTerrains(a, { ...a, response: other })).toMatchObject({
    numericMatch: false,
    coverageMismatchCount: 1,
  });
});
