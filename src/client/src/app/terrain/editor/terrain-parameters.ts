import { DEFAULT_MAP_PARAMETERS, DEFAULT_SIMULATION_PARAMETERS } from '../data/terrain-defaults';
import { FormControl, FormGroup } from '@angular/forms';
import {
  ALGORITHM_VERSION,
  TERRAIN_ALGORITHM,
  HeightMapRequest,
  TerrainError,
  TerrainRequest,
} from '../data/terrain.models';

interface ParameterDefinition {
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
    step: '0.05',
    description: 'Tendency toward broad low-relief areas. Plains + mountains must be at most 1.',
  },
  mountainCoverage: {
    label: 'Mountain coverage',
    defaultValue: DEFAULT_SIMULATION_PARAMETERS.mountainCoverage,
    step: '0.05',
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

type ParameterControls<T> = { [K in keyof T]: FormControl<number | null> };

export function createParameterForm<T extends Record<string, ParameterDefinition>>(
  definitions: T,
): FormGroup<ParameterControls<T>> {
  // Object.fromEntries loses the known keys; the mapped type preserves them for consumers.
  const controls = Object.fromEntries(
    Object.entries(definitions).map(([name, definition]) => [
      name,
      new FormControl<number | null>(definition.defaultValue),
    ]),
  ) as ParameterControls<T>;
  return new FormGroup(controls);
}

export type MapParameterForm = ReturnType<typeof createParameterForm<typeof MAP_PARAMETERS>>;
export type SimulationParameterForm = ReturnType<
  typeof createParameterForm<typeof SIMULATION_PARAMETERS>
>;

export function captureTerrainRequest(
  mapForm: MapParameterForm,
  simulationForm: SimulationParameterForm,
): TerrainRequest {
  const map = mapForm.getRawValue();
  const simulation = simulationForm.getRawValue();
  const fields: Record<string, string> = {};
  for (const [prefix, values] of [
    ['heightMap.', map],
    ['', simulation],
  ] as const)
    for (const [name, value] of Object.entries(values))
      if (typeof value !== 'number' || !Number.isFinite(value))
        fields[prefix + name] = 'Enter a finite number.';
  if (Object.keys(fields).length)
    throw new TerrainError('validation', 'Complete the parameter fields.', fields);
  // The checks above narrow all values at runtime; Core performs canonical range validation.
  const heightMap = Object.freeze({
    ...map,
    algorithmVersion: ALGORITHM_VERSION,
  }) as HeightMapRequest;
  return Object.freeze({
    ...simulation,
    heightMap,
    algorithmVersion: TERRAIN_ALGORITHM,
  }) as TerrainRequest;
}

// Slider extents are UI guidance, not a duplicate of canonical Core validation.
export const SLIDER_GUIDANCE = {
  mountainStrength: { min: 0, max: 1 },
  warpStrength: { min: 0, max: 8 },
} as const;

export function sameTerrainParameters(a: TerrainRequest | null, b: TerrainRequest | null): boolean {
  if (!a || !b) return false;
  return (
    a.algorithmVersion === b.algorithmVersion &&
    a.heightMap.algorithmVersion === b.heightMap.algorithmVersion &&
    (Object.keys(MAP_PARAMETERS) as (keyof typeof MAP_PARAMETERS)[]).every(
      (key) => a.heightMap[key] === b.heightMap[key],
    ) &&
    (Object.keys(SIMULATION_PARAMETERS) as (keyof typeof SIMULATION_PARAMETERS)[]).every(
      (key) => a[key] === b[key],
    )
  );
}
