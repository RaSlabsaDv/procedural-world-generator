import {
  ALGORITHM_VERSION,
  TERRAIN_ALGORITHM,
  TERRAIN_WORKLOAD,
  SIMULATION_VERSION,
  RESULT_VERSION,
  HeightMapRequest,
  TerrainRequest,
} from '../data/terrain.models';
export const testMap: HeightMapRequest = Object.freeze({
  seed: 42,
  width: 3,
  height: 2,
  noiseScale: 0.37,
  octaves: 3,
  heightMultiplier: 30,
  algorithmVersion: ALGORITHM_VERSION,
});
export function testTerrain(heightMap = testMap): TerrainRequest {
  return Object.freeze({
    heightMap,
    plainsCoverage: 0.45,
    mountainCoverage: 0.3,
    globalWarmth: 0.6,
    vegetationDensity: 1,
    landformRegionScale: 1,
    globalMoisture: 0.65,
    seaLevel: 0.16,
    mountainStrength: 0.55,
    warpStrength: 2,
    iterations: 2,
    rainfall: 0.05,
    evaporation: 0.1,
    algorithmVersion: TERRAIN_ALGORITHM,
  });
}
export function testWire(terrain = testTerrain()) {
  const map = terrain.heightMap;
  return {
    result: {
      width: map.width,
      height: map.height,
      values: Array(map.width * map.height).fill(0),
      surfaceWeights: Array<number>(map.width * map.height * 5).fill(0),
      biomes: Array(map.width * map.height).fill(0),
      moisture: Array(map.width * map.height).fill(0.6),
      temperature: Array(map.width * map.height).fill(0.7),
      slope: Array(map.width * map.height).fill(0),
      vegetationDensity: Array(map.width * map.height).fill(0),
      trees: [],
      resultVersion: RESULT_VERSION,
      algorithmVersion: TERRAIN_ALGORITHM,
    },
    parameters: terrain,
    workload: TERRAIN_WORKLOAD as typeof TERRAIN_WORKLOAD,
    simulationVersion: SIMULATION_VERSION as typeof SIMULATION_VERSION,
    executionProfile: 'landscape-worker-json-v5' as const,
    computeMs: 1,
    coreBuildId: 'git:123456789abc',
    simulation: {
      iterations: terrain.iterations,
      cellIterations: map.width * map.height * terrain.iterations,
      initialTerrainMass: 0,
      finalTerrainMass: 0,
      suspendedSediment: 0,
      waterAdded: 0,
      waterRemaining: 0,
      waterEvaporated: 0,
    },
  };
}

/** Synthetic valid vectors for contract tests, not a copy of Core coverage rules. */
export function testSurfaceWeights(biomes: ArrayLike<number>): number[] {
  return Array.from(biomes).flatMap((id) => (id === 0 ? [0, 0, 0, 0, 0] : [0.5, 0.5, 0, 0, 0]));
}
