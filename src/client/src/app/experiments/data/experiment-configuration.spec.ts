import { createExperimentConfiguration } from './experiment-configuration';
import {
  DEFAULT_MEASURED_PAIRS,
  EXPERIMENT_ORDER,
  EXPERIMENT_SCHEMA_VERSION,
  MAX_MEASURED_PAIRS,
  MIN_MEASURED_PAIRS,
  WARMUP_PAIRS,
} from './experiment.models';
import { ALGORITHM_VERSION, TERRAIN_ALGORITHM } from '../../terrain/data/terrain.models';

function draft() {
  // Deliberately distinct values detect omitted or swapped captured fields.
  return {
    heightMap: {
      seed: -2147483648,
      width: 43,
      height: 27,
      noiseScale: 0.071,
      octaves: 5,
      heightMultiplier: 87,
      algorithmVersion: ALGORITHM_VERSION,
    },
    mountainStrength: 0.51,
    warpStrength: 1.7,
    iterations: 23,
    plainsCoverage: 0.32,
    mountainCoverage: 0.26,
    globalWarmth: 0.68,
    vegetationDensity: 0.79,
    landformRegionScale: 1.23,
    globalMoisture: 0.61,
    seaLevel: 0.18,
    rainfall: 0.045,
    evaporation: 0.12,
    algorithmVersion: TERRAIN_ALGORITHM,
  };
}

it('captures every parameter without retaining either caller-owned object', () => {
  const source = draft();
  const first = createExperimentConfiguration(source);
  expect(first.terrain).toEqual(source);
  expect(first.terrain).not.toBe(source);
  expect(first.terrain.heightMap).not.toBe(source.heightMap);

  // Simulate later edits to every numeric/string draft member at both levels.
  for (const key of Object.keys(source.heightMap))
    Reflect.set(source.heightMap, key, key === 'algorithmVersion' ? 'changed-noise' : 0);
  for (const key of Object.keys(source))
    if (key !== 'heightMap')
      Reflect.set(source, key, key === 'algorithmVersion' ? 'changed-terrain' : 0);
  expect(first.terrain).toEqual(draft());
  expect(createExperimentConfiguration(source).terrain).toEqual(source);
  expect(Object.isFrozen(source)).toBe(false);
  expect(Object.isFrozen(source.heightMap)).toBe(false);
});

it('freezes configuration and both request levels against runtime mutation', () => {
  const config = createExperimentConfiguration(draft());
  for (const value of [config, config.terrain, config.terrain.heightMap])
    expect(Object.isFrozen(value)).toBe(true);
  expect(Reflect.set(config, 'measuredPairs', 2)).toBe(false);
  expect(Reflect.set(config.terrain, 'iterations', 0)).toBe(false);
  expect(Reflect.set(config.terrain.heightMap, 'seed', 0)).toBe(false);
  expect(Reflect.set(config.terrain, 'heightMap', draft().heightMap)).toBe(false);
  expect(config.terrain).toEqual(draft());
});

it('uses the explicit v1 defaults and fixed warmup/order policies', () => {
  const config = createExperimentConfiguration(draft());
  expect(config.schemaVersion).toBe(EXPERIMENT_SCHEMA_VERSION);
  expect(config.measuredPairs).toBe(DEFAULT_MEASURED_PAIRS);
  expect(config.measuredPairs).toBe(10);
  expect(config.warmupPairs).toBe(WARMUP_PAIRS);
  expect(config.warmupPairs).toBe(1);
  expect(config.order).toBe(EXPERIMENT_ORDER);
  expect(config.order).toBe('sequential-alternating-local-first');
});

it.each([MIN_MEASURED_PAIRS, 17, MAX_MEASURED_PAIRS])(
  'accepts measured-pair count %s without changing the request',
  (count) => {
    const source = draft();
    const config = createExperimentConfiguration(source, count);
    expect(config.measuredPairs).toBe(count);
    expect(config.terrain).toEqual(source);
  },
);

it.each([0, -1, 31, 1.5, 29.99, NaN, Infinity, -Infinity])(
  'rejects invalid measured-pair count %s',
  (count) => {
    expect(() => createExperimentConfiguration(draft(), count)).toThrow(RangeError);
  },
);

it('preserves finite invalid terrain drafts for canonical Core validation', () => {
  const source = draft();
  source.heightMap.width = 1;
  source.plainsCoverage = 2;
  source.iterations = -1;
  source.algorithmVersion = 'unsupported';
  const config = createExperimentConfiguration(source);
  expect(config.terrain).toEqual(source);
});
