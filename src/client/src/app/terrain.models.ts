export const RESULT_VERSION = 'landscape-ecology-v2';

export const ALGORITHM_VERSION = 'value-noise-fbm-v1';

export interface HeightMapRequest {
  readonly seed: number;
  readonly width: number;
  readonly height: number;
  readonly noiseScale: number;
  readonly octaves: number;
  readonly heightMultiplier: number;
  readonly algorithmVersion: string;
}

export interface TerrainResponse {
  readonly result: {
    readonly width: number;
    readonly height: number;
    readonly values: Float32Array;
    readonly biomes: Uint8Array;
    readonly moisture: Float32Array;
    readonly temperature: Float32Array;
    readonly slope: Float32Array;
    readonly vegetationDensity: Float32Array;
    readonly trees: readonly TreeInstance[];
    readonly resultVersion: string;
    readonly algorithmVersion: string;
  };
  readonly computeMs: number;
  readonly coreBuildId: string;
  readonly workload: typeof TERRAIN_WORKLOAD;
  readonly simulation: SimulationSummary;
  readonly executionProfile: 'landscape-worker-json-v2';
  readonly simulationVersion: typeof SIMULATION_VERSION;
}

export interface TerrainRun {
  readonly request: HeightMapRequest;
  readonly response: TerrainResponse;
  readonly requestMs: number;
  readonly initMs: number | null;
  readonly terrain: TerrainRequest;
}

export class TerrainError extends Error {
  constructor(
    readonly kind: 'validation' | 'invalid_json' | 'availability' | 'protocol',
    message: string,
    readonly fields: Readonly<Record<string, string>> = {},
  ) {
    super(message);
  }
}

export const TERRAIN_ALGORITHM = 'diverse-landscape-v2';
export const TERRAIN_WORKLOAD = 'landscape-ecology-hydraulic-v2';
export const SIMULATION_VERSION = 'hydraulic-grid-v1';

export interface TerrainRequest {
  readonly heightMap: HeightMapRequest;
  readonly mountainStrength: number;
  readonly warpStrength: number;
  readonly iterations: number;
  readonly plainsCoverage: number;
  readonly mountainCoverage: number;
  readonly globalMoisture: number;
  readonly seaLevel: number;
  readonly rainfall: number;
  readonly evaporation: number;
  readonly algorithmVersion: string;
}

export interface SimulationSummary {
  readonly iterations: number;
  readonly cellIterations: number;
  readonly initialTerrainMass: number;
  readonly finalTerrainMass: number;
  readonly suspendedSediment: number;
  readonly waterAdded: number;
  readonly waterRemaining: number;
  readonly waterEvaporated: number;
}

export interface TreeInstance {
  readonly cellIndex: number;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly scale: number;
  readonly rotation: number;
}
export const MAX_TREES = 16384;
export const EXECUTION_PROFILE = 'landscape-worker-json-v2';
