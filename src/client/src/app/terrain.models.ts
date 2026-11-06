export const RESULT_VERSION = 'heightmap-biomes-v1';

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
    readonly resultVersion: string;
    readonly algorithmVersion: string;
  };
  readonly computeMs: number;
  readonly coreBuildId: string;
  readonly workload: typeof TERRAIN_WORKLOAD;
  readonly simulation: SimulationSummary;
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

export const TERRAIN_ALGORITHM = 'warped-ridged-hydraulic-v1';
export const TERRAIN_WORKLOAD = 'terrain-hydraulic-v1';
export const SIMULATION_VERSION = 'hydraulic-grid-v1';

export interface TerrainRequest {
  readonly heightMap: HeightMapRequest;
  readonly mountainStrength: number;
  readonly warpStrength: number;
  readonly iterations: number;
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
