import { compareHeightMaps, decodeHeightMap } from './heightmap.contract';
import {
  ALGORITHM_VERSION,
  HeightMapError,
  HeightMapRequest,
  HeightMapRun,
} from './heightmap.models';
import { heightMapPixels } from './heightmap-preview';

const request: HeightMapRequest = Object.freeze({
  seed: 42,
  width: 3,
  height: 2,
  noiseScale: 0.37,
  octaves: 3,
  heightMultiplier: 30,
  algorithmVersion: ALGORITHM_VERSION,
});

function wire() {
  return {
    result: {
      width: 3,
      height: 2,
      algorithmVersion: ALGORITHM_VERSION,
      values: [0, 5, 10, 15, 20, 30],
    },
    computeMs: 1.25,
    coreBuildId: 'git:123456789abc',
    workload: 'heightmap',
  };
}

function run(buildId = 'git:123456789abc'): HeightMapRun {
  const value = wire();
  value.coreBuildId = buildId;
  return { request, response: decodeHeightMap(value, request), requestMs: 2, initMs: null };
}

describe('heightmap contract', () => {
  it('normalizes valid values into independent float32 storage', () => {
    const value = wire();
    const decoded = decodeHeightMap(value, request);
    expect(decoded.result.values).toBeInstanceOf(Float32Array);
    value.result.values[0] = 29;
    expect(decoded.result.values[0]).toBe(0);
  });

  it.each([null, {}, [], { result: null }])('rejects invalid response shapes: %j', (value) => {
    expect(() => decodeHeightMap(value, request)).toThrow(HeightMapError);
  });

  it.each([
    { computeMs: -1 },
    { computeMs: Infinity },
    { computeMs: '1' },
    { coreBuildId: '' },
    { coreBuildId: null },
    { workload: 'other' },
  ])('rejects invalid metadata: %j', (change) => {
    expect(() => decodeHeightMap({ ...wire(), ...change }, request)).toThrow(HeightMapError);
  });

  it.each([
    { width: 2 },
    { height: 3 },
    { algorithmVersion: 'v2' },
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
      decodeHeightMap({ ...value, result: { ...value.result, ...change } }, request),
    ).toThrow(HeightMapError);
  });

  it('uses float32 semantics at a rounded height bound', () => {
    const value = wire();
    value.result.values = Array(6).fill(0.7);
    expect(decodeHeightMap(value, { ...request, heightMultiplier: 0.7 }).result.values[0]).toBe(
      Math.fround(0.7),
    );
  });

  it('preserves structured field validation and rejects malformed error envelopes', () => {
    try {
      decodeHeightMap({ error: 'validation', fields: { width: 'Too small' } }, request);
      throw new Error('Expected validation failure');
    } catch (error) {
      expect(error).toBeInstanceOf(HeightMapError);
      expect((error as HeightMapError).fields['width']).toBe('Too small');
    }
    expect(() => decodeHeightMap({ error: 'validation', fields: { width: 123 } }, request)).toThrow(
      HeightMapError,
    );
  });
});

describe('full-array equivalence', () => {
  it('matches equal outputs and detects a mismatch at the last cell', () => {
    const local = run();
    const remote = run();
    expect(compareHeightMaps(local, remote)).toMatchObject({
      numericMatch: true,
      identity: 'compatible',
      mismatchCount: 0,
    });
    remote.response.result.values[5] = 29;
    expect(compareHeightMaps(local, remote)).toMatchObject({
      numericMatch: false,
      mismatchCount: 1,
      maxAbsoluteError: 1,
    });
    expect(compareHeightMaps(local, remote).meanAbsoluteError).toBeCloseTo(1 / 6);
  });

  it('applies the documented absolute and relative tolerance', () => {
    const remote = run();
    remote.response.result.values[5] = 29.9999;
    expect(compareHeightMaps(run(), remote).numericMatch).toBe(true);
  });

  it.each(['unversioned', 'git:123456789abc-dirty'])(
    'does not verify matching %s identities',
    (id) => {
      expect(compareHeightMaps(run(id), run(id))).toMatchObject({
        numericMatch: true,
        identity: 'unverifiable',
      });
    },
  );

  it('reports build differences separately from numerical agreement', () => {
    expect(compareHeightMaps(run(), run('git:abcdef012345'))).toMatchObject({
      numericMatch: true,
      identity: 'different',
    });
  });

  it('rejects results from different snapshots', () => {
    const remote = { ...run(), request: { ...request, seed: 7 } };
    expect(() => compareHeightMaps(run(), remote)).toThrow(HeightMapError);
  });
});

describe('preview pixels', () => {
  it('preserves row-major positions and uses one absolute height scale', () => {
    const pixels = heightMapPixels(new Float32Array([0, 5, 10, 2, 4, 6]), 10);
    expect([...pixels.filter((_, index) => index % 4 === 0)]).toEqual([0, 128, 255, 51, 102, 153]);
    expect([...pixels.filter((_, index) => index % 4 === 3)]).toEqual(Array(6).fill(255));
    expect(heightMapPixels(new Float32Array([5]), 10)[0]).toBe(128);
  });

  it('renders zero height without division by zero or mutation', () => {
    const values = new Float32Array([0, 0]);
    expect([...heightMapPixels(values, 0)]).toEqual([0, 0, 0, 255, 0, 0, 0, 255]);
    expect([...values]).toEqual([0, 0]);
  });
});
