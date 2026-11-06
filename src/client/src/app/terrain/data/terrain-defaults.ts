import { HeightMapRequest, TerrainRequest } from './terrain.models';

/** UI starting values, not canonical limits or defaults for omitted host fields. */
export const DEFAULT_MAP_PARAMETERS = Object.freeze({
  seed: 42,
  width: 128,
  height: 128,
  noiseScale: 0.03,
  octaves: 4,
  heightMultiplier: 30,
} satisfies Omit<HeightMapRequest, 'algorithmVersion'>);

export const DEFAULT_SIMULATION_PARAMETERS = Object.freeze({
  plainsCoverage: 0.45,
  mountainCoverage: 0.3,
  globalWarmth: 0.6,
  vegetationDensity: 1,
  landformRegionScale: 1,
  globalMoisture: 0.65,
  seaLevel: 0.16,
  mountainStrength: 0.55,
  warpStrength: 2,
  iterations: 64,
  rainfall: 0.05,
  evaporation: 0.1,
} satisfies Omit<TerrainRequest, 'heightMap' | 'algorithmVersion'>);
