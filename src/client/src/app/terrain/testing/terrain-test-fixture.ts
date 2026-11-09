import {
  ALGORITHM_VERSION,
  TERRAIN_ALGORITHM,
  TERRAIN_WORKLOAD,
  SIMULATION_VERSION,
  RESULT_VERSION,
  HYDROLOGY_VERSION,
  RIVER_NETWORK_VERSION,
  RiverNetworkResult,
  HydrologyResult,
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
      rocks: [],
      rivers: {
        algorithmVersion: RIVER_NETWORK_VERSION,
        cellIndices: [] as number[],
        widths: [] as number[],
      },
      hydrology: testWireHydrology({
        width: map.width,
        height: map.height,
        biomes: Array(map.width * map.height).fill(0),
        values: Array(map.width * map.height).fill(0),
      }),
      resultVersion: RESULT_VERSION,
      algorithmVersion: TERRAIN_ALGORITHM,
    },
    parameters: terrain,
    workload: TERRAIN_WORKLOAD as typeof TERRAIN_WORKLOAD,
    simulationVersion: SIMULATION_VERSION as typeof SIMULATION_VERSION,
    executionProfile: 'landscape-worker-json-v13' as const,
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

/** Synthetic west-routed graph for client contract tests; not a hydrology oracle. */
export function testHydrology(map: {
  width: number;
  height: number;
  biomes: ArrayLike<number>;
  values: ArrayLike<number>;
}): HydrologyResult {
  const count = map.width * map.height,
    receiverIndex = new Int32Array(count),
    flowAccumulation = new Uint32Array(count),
    depressionDepth = new Float32Array(count),
    levels = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const x = i % map.width,
      y = Math.floor(i / map.width),
      outlet =
        map.biomes[i] === 0 || x === 0 || x === map.width - 1 || y === 0 || y === map.height - 1;
    receiverIndex[i] = outlet ? -1 : i - 1;
    flowAccumulation[i] = map.biomes[i] === 0 ? 0 : 1;
    levels[i] = outlet ? map.values[i] : Math.max(map.values[i], levels[i - 1]);
    depressionDepth[i] = Math.max(0, levels[i] - Math.fround(map.values[i]));
  }
  for (let i = count - 1; i >= 0; i--)
    if (receiverIndex[i] >= 0) flowAccumulation[receiverIndex[i]] += flowAccumulation[i];
  return { algorithmVersion: HYDROLOGY_VERSION, receiverIndex, flowAccumulation, depressionDepth };
}
export function testWireHydrology(map: Parameters<typeof testHydrology>[0]) {
  const h = testHydrology(map);
  return {
    algorithmVersion: h.algorithmVersion,
    receiverIndex: Array.from(h.receiverIndex),
    flowAccumulation: Array.from(h.flowAccumulation),
    depressionDepth: Array.from(h.depressionDepth),
  };
}

/** Empty network for fixtures whose maximum catchment is below the v1 threshold. */
export function testEmptyRivers(): RiverNetworkResult {
  return {
    algorithmVersion: RIVER_NETWORK_VERSION,
    cellIndices: new Int32Array(),
    widths: new Float32Array(),
  };
}
