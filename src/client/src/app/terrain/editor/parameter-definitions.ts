import { DEFAULT_MAP_PARAMETERS, DEFAULT_SIMULATION_PARAMETERS } from '../data/terrain-defaults';
import type { HeightMapRequest, TerrainRequest } from '../data/terrain.models';

export interface ParameterDefinition {
  readonly label: string;
  readonly defaultValue: number;
  readonly step: string;
  readonly description: string;
}

// Presentation metadata only. Canonical ranges and workload budgets belong to Core.
export const MAP_PARAMETERS = {
  seed: {
    label: 'Seed',
    defaultValue: DEFAULT_MAP_PARAMETERS.seed,
    step: '1',
    description: 'Reproduce a landscape with the same seed and settings.',
  },
  width: {
    label: 'Width',
    defaultValue: DEFAULT_MAP_PARAMETERS.width,
    step: '1',
    description: 'Number of terrain samples along the horizontal axis.',
  },
  height: {
    label: 'Height',
    defaultValue: DEFAULT_MAP_PARAMETERS.height,
    step: '1',
    description: 'Number of terrain samples along the other map axis, not mountain height.',
  },
  noiseScale: {
    label: 'Noise scale',
    defaultValue: DEFAULT_MAP_PARAMETERS.noiseScale,
    step: 'any',
    description: 'Lower values create broader forms; higher values create more frequent variation.',
  },
  octaves: {
    label: 'Octaves',
    defaultValue: DEFAULT_MAP_PARAMETERS.octaves,
    step: '1',
    description: 'Additional noise layers add finer detail and computation.',
  },
  heightMultiplier: {
    label: 'Height multiplier',
    defaultValue: DEFAULT_MAP_PARAMETERS.heightMultiplier,
    step: 'any',
    description: 'Vertical scale and upper height bound in illustrative world units.',
  },
} as const satisfies Record<keyof Omit<HeightMapRequest, 'algorithmVersion'>, ParameterDefinition>;

export const SIMULATION_PARAMETERS = {
  globalWarmth: {
    label: 'Global warmth',
    defaultValue: DEFAULT_SIMULATION_PARAMETERS.globalWarmth,
    step: '0.05',
    description:
      'Normalized climate warmth, not Celsius. Elevation and regional variation still apply.',
  },
  vegetationDensity: {
    label: 'Vegetation density',
    defaultValue: DEFAULT_SIMULATION_PARAMETERS.vegetationDensity,
    step: '0.05',
    description:
      'Desired abundance in suitable biomes. Zero removes trees; the 16,384 cap stays separate.',
  },
  landformRegionScale: {
    label: 'Landform region scale',
    defaultValue: DEFAULT_SIMULATION_PARAMETERS.landformRegionScale,
    step: '0.25',
    description:
      '0.25–4. Larger values create larger natural regions without rescaling fine noise.',
  },
  plainsCoverage: {
    label: 'Plains coverage',
    defaultValue: DEFAULT_SIMULATION_PARAMETERS.plainsCoverage,
    step: '0.01',
    description:
      'Tendency toward broad low-relief areas. Shares the landform budget with mountains.',
  },
  mountainCoverage: {
    label: 'Mountain coverage',
    defaultValue: DEFAULT_SIMULATION_PARAMETERS.mountainCoverage,
    step: '0.01',
    description:
      'Where ranges occur, independently of their strength. Remaining regions become hills.',
  },
  globalMoisture: {
    label: 'Global moisture',
    defaultValue: DEFAULT_SIMULATION_PARAMETERS.globalMoisture,
    step: '0.05',
    description:
      'Regional humidity baseline for grasslands and forests; distinct from erosion rainfall.',
  },
  seaLevel: {
    label: 'Sea level',
    defaultValue: DEFAULT_SIMULATION_PARAMETERS.seaLevel,
    step: '0.01',
    description: 'Fraction of the height bound. Only boundary-connected low terrain is ocean.',
  },
  mountainStrength: {
    label: 'Mountain strength',
    defaultValue: DEFAULT_SIMULATION_PARAMETERS.mountainStrength,
    step: '0.05',
    description: 'Balance broad landforms against ridged mountain shapes.',
  },
  warpStrength: {
    label: 'Warp strength',
    defaultValue: DEFAULT_SIMULATION_PARAMETERS.warpStrength,
    step: '0.1',
    description: 'Distort noise coordinates to create less regular landforms.',
  },
  iterations: {
    label: 'Simulation iterations',
    defaultValue: DEFAULT_SIMULATION_PARAMETERS.iterations,
    step: '1',
    description: 'Complete erosion steps. Zero returns the initial composed terrain.',
  },
  rainfall: {
    label: 'Rainfall per time unit',
    defaultValue: DEFAULT_SIMULATION_PARAMETERS.rainfall,
    step: '0.01',
    description: 'Water depth added per cell per model time unit, not real-world weather.',
  },
  evaporation: {
    label: 'Evaporation per time unit',
    defaultValue: DEFAULT_SIMULATION_PARAMETERS.evaporation,
    step: '0.01',
    description: 'Fractional water loss rate per model time unit.',
  },
} as const satisfies Record<
  keyof Omit<TerrainRequest, 'heightMap' | 'algorithmVersion'>,
  ParameterDefinition
>;
