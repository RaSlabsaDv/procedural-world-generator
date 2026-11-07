export const RESULT_VERSION = 'landscape-ecology-v6';

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
    readonly surfaceWeights: Float32Array;
    readonly biomes: Uint8Array;
    readonly moisture: Float32Array;
    readonly temperature: Float32Array;
    readonly slope: Float32Array;
    readonly vegetationDensity: Float32Array;
    readonly trees: readonly TreeInstance[];
    readonly rocks: readonly RockInstance[];
    readonly resultVersion: string;
    readonly algorithmVersion: string;
  };
  readonly computeMs: number;
  readonly coreBuildId: string;
  readonly workload: typeof TERRAIN_WORKLOAD;
  readonly simulation: SimulationSummary;
  readonly executionProfile: 'landscape-worker-json-v6';
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

export const TERRAIN_ALGORITHM = 'diverse-landscape-v5';
export const TERRAIN_WORKLOAD = 'landscape-ecology-hydraulic-v6';
export const SIMULATION_VERSION = 'hydraulic-grid-v1';

export interface TerrainRequest {
  readonly heightMap: HeightMapRequest;
  readonly mountainStrength: number;
  readonly warpStrength: number;
  readonly iterations: number;
  readonly plainsCoverage: number;
  readonly mountainCoverage: number;
  readonly globalWarmth: number;
  readonly vegetationDensity: number;
  readonly landformRegionScale: number;
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
  readonly kind: TreeKindId;
  readonly variant: TreeVariantId;
  readonly cellIndex: number;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly scale: number;
  readonly rotation: number;
}
export const MAX_TREES = 16384;
export const EXECUTION_PROFILE = 'landscape-worker-json-v6';

/** Wire IDs for landscape-ecology-v6; classification itself belongs to Core. */
export const LANDSCAPE_BIOME = {
  Ocean: 0,
  Grassland: 1,
  BroadleafForest: 2,
  DryGrassland: 3,
  Rock: 4,
  ConiferForest: 5,
  Savanna: 6,
  Tundra: 7,
  SnowHighlands: 8,
} as const;
export type LandscapeBiomeId = (typeof LANDSCAPE_BIOME)[keyof typeof LANDSCAPE_BIOME];
export const LANDSCAPE_BIOME_IDS: ReadonlySet<number> = new Set(Object.values(LANDSCAPE_BIOME));

export const TREE_KIND = { Broadleaf: 0, Conifer: 1, Savanna: 2 } as const;
export type TreeKindId = (typeof TREE_KIND)[keyof typeof TREE_KIND];
export const TREE_KIND_IDS: ReadonlySet<number> = new Set(Object.values(TREE_KIND));
/** Wire consistency relationships, not ecological classification. */
export const TREE_KIND_BIOME: Record<TreeKindId, LandscapeBiomeId> = {
  [TREE_KIND.Broadleaf]: LANDSCAPE_BIOME.BroadleafForest,
  [TREE_KIND.Conifer]: LANDSCAPE_BIOME.ConiferForest,
  [TREE_KIND.Savanna]: LANDSCAPE_BIOME.Savanna,
};
export const VEGETATED_BIOME_IDS: ReadonlySet<number> = new Set(Object.values(TREE_KIND_BIOME));

/** Frozen surface-coverage-v1 wire order; ecological decisions belong in Core. */
export const SURFACE_CHANNELS = 5;
export const SURFACE_CHANNEL = { Grass: 0, Soil: 1, Sand: 2, Rock: 3, Snow: 4 } as const;
export const SURFACE_SUM_TOLERANCE = 1e-6;

export const TREE_VARIANT = { Small: 0, Mature: 1 } as const;
export type TreeVariantId = (typeof TREE_VARIANT)[keyof typeof TREE_VARIANT];
export const TREE_VARIANT_IDS: ReadonlySet<number> = new Set(Object.values(TREE_VARIANT));

export const MAX_ROCKS = 8192;
export const ROCK_KIND = { Boulder: 0, Outcrop: 1, Scree: 2 } as const;
export type RockKindId = (typeof ROCK_KIND)[keyof typeof ROCK_KIND];
export const ROCK_VARIANT = { Angular: 0, Rounded: 1 } as const;
export type RockVariantId = (typeof ROCK_VARIANT)[keyof typeof ROCK_VARIANT];
export interface RockInstance {
  readonly cellIndex: number;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly scaleX: number;
  readonly scaleY: number;
  readonly scaleZ: number;
  readonly rotation: number;
  readonly groundY: number;
  readonly kind: RockKindId;
  readonly variant: RockVariantId;
}
