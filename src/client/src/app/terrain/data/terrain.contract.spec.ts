import { testWireHydrology } from '../testing/terrain-test-fixture';
import { testSurfaceWeights } from '../testing/terrain-test-fixture';
import { compareTerrains, decodeTerrain } from './terrain.contract';
import { ALGORITHM_VERSION, TerrainError, HeightMapRequest, TerrainRun } from './terrain.models';
import { testTerrain, testWire } from '../testing/terrain-test-fixture';

const request: HeightMapRequest = Object.freeze({
  seed: 42,
  width: 3,
  height: 2,
  noiseScale: 0.37,
  octaves: 3,
  heightMultiplier: 30,
  algorithmVersion: ALGORITHM_VERSION,
});

const terrain = testTerrain(request);
function wire() {
  const value = testWire(terrain);
  value.result.values = [0, 5, 10, 15, 20, 30];
  value.result.biomes = [0, 0, 1, 2, 2, 3];
  value.result.surfaceWeights = testSurfaceWeights(value.result.biomes);
  value.result.hydrology = testWireHydrology(value.result);
  return value;
}

function run(buildId = 'git:123456789abc'): TerrainRun {
  const value = wire();
  value.coreBuildId = buildId;
  return {
    request,
    terrain,
    response: decodeTerrain(value, request, terrain),
    requestMs: 2,
    initMs: null,
  };
}

describe('heightmap contract', () => {
  it('normalizes valid values into independent float32 storage', () => {
    const value = wire();
    const decoded = decodeTerrain(value, request, terrain);
    expect(decoded.result.values).toBeInstanceOf(Float32Array);
    value.result.values[0] = 29;
    expect(decoded.result.values[0]).toBe(0);
  });

  it.each([null, {}, [], { result: null }])('rejects invalid response shapes: %j', (value) => {
    expect(() => decodeTerrain(value, request, terrain)).toThrow(TerrainError);
  });

  it.each([
    { computeMs: -1 },
    { computeMs: Infinity },
    { computeMs: '1' },
    { coreBuildId: '' },
    { coreBuildId: null },
    { workload: 'other' },
  ])('rejects invalid metadata: %j', (change) => {
    expect(() => decodeTerrain({ ...wire(), ...change }, request, terrain)).toThrow(TerrainError);
  });

  it.each([
    { width: 2 },
    { height: 3 },
    { algorithmVersion: 'v2' },
    { resultVersion: 'other' },
    { biomes: undefined },
    { biomes: [0] },
    { biomes: [0, 0, 1, 2, 2, 9] },
    { biomes: [0, 0, 1, 2, 2, -1] },
    { biomes: [0, 0, 1, 2, 2, 1.5] },
    { biomes: 'AAAAAA==' },
    { values: [0] },
    { values: [0, 5, 10, 15, 20, NaN] },
    { values: [0, 5, 10, 15, 20, Infinity] },
    { values: [0, 5, 10, 15, 20, '30'] },
    { values: [0, 5, 10, 15, 20, -1] },
    { values: [0, 5, 10, 15, 20, 31] },
    { values: [0, 5, 10, 15, 20, Number.MAX_VALUE] },
  ])('rejects invalid map data: %j', (change) => {
    const value = wire();
    expect(() =>
      decodeTerrain({ ...value, result: { ...value.result, ...change } }, request, terrain),
    ).toThrow(TerrainError);
  });

  it('uses float32 semantics at a rounded height bound', () => {
    const value = wire();
    value.result.values = Array(6).fill(0.7);
    expect(
      decodeTerrain(
        { ...value, parameters: testTerrain({ ...request, heightMultiplier: 0.7 }) },
        { ...request, heightMultiplier: 0.7 },
        testTerrain({ ...request, heightMultiplier: 0.7 }),
      ).result.values[0],
    ).toBe(Math.fround(0.7));
  });

  it('preserves structured field validation and rejects malformed error envelopes', () => {
    try {
      decodeTerrain({ error: 'validation', fields: { width: 'Too small' } }, request, terrain);
      throw new Error('Expected validation failure');
    } catch (error) {
      expect(error).toBeInstanceOf(TerrainError);
      expect((error as TerrainError).fields['width']).toBe('Too small');
    }
    expect(() =>
      decodeTerrain({ error: 'validation', fields: { width: 123 } }, request, terrain),
    ).toThrow(TerrainError);
  });
});

describe('full-array equivalence', () => {
  it('compares biome IDs exactly, including the last cell', () => {
    const local = run();
    const remote = run();
    expect(compareTerrains(local, remote).biomesMatch).toBe(true);
    remote.response.result.biomes[5] = 2;
    expect(compareTerrains(local, remote)).toMatchObject({
      numericMatch: true,
      biomesMatch: false,
      biomeMismatchCount: 1,
    });
  });

  it('matches equal outputs and detects a mismatch at the last cell', () => {
    const local = run();
    const remote = run();
    expect(compareTerrains(local, remote)).toMatchObject({
      numericMatch: true,
      identity: 'compatible',
      mismatchCount: 0,
    });
    remote.response.result.values[5] = 29;
    expect(compareTerrains(local, remote)).toMatchObject({
      numericMatch: false,
      mismatchCount: 1,
      maxAbsoluteError: 1,
    });
    expect(compareTerrains(local, remote).meanAbsoluteError).toBeCloseTo(1 / 6);
  });

  it('applies the documented absolute and relative tolerance', () => {
    const remote = run();
    remote.response.result.values[5] = 29.9999;
    expect(compareTerrains(run(), remote).numericMatch).toBe(true);
  });

  it.each(['unversioned', 'git:123456789abc-dirty'])(
    'does not verify matching %s identities',
    (id) => {
      expect(compareTerrains(run(id), run(id))).toMatchObject({
        numericMatch: true,
        identity: 'unverifiable',
      });
    },
  );

  it('reports build differences separately from numerical agreement', () => {
    expect(compareTerrains(run(), run('git:abcdef012345'))).toMatchObject({
      numericMatch: true,
      identity: 'different',
    });
  });

  it('rejects results from different snapshots', () => {
    const remote = { ...run(), request: { ...request, seed: 7 } };
    expect(() => compareTerrains(run(), remote)).toThrow(TerrainError);
  });
});
