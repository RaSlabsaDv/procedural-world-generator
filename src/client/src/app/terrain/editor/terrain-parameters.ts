import {
  MAP_PARAMETERS,
  SIMULATION_PARAMETERS,
  ParameterDefinition,
} from './parameter-definitions';
import { FormControl, FormGroup } from '@angular/forms';
import {
  ALGORITHM_VERSION,
  TERRAIN_ALGORITHM,
  HeightMapRequest,
  TerrainError,
  TerrainRequest,
} from '../data/terrain.models';

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
