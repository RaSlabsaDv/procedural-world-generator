import { TerrainRun, TerrainError, HeightMapRequest, SURFACE_CHANNELS } from './terrain.models';
import { sameObject } from './contract-utils';

export interface TerrainComparison {
  readonly maxAbsoluteError: number;
  readonly meanAbsoluteError: number;
  readonly mismatchCount: number;
  readonly numericMatch: boolean;
  readonly biomeMismatchCount: number;
  readonly biomesMatch: boolean;
  readonly environmentMismatchCount: number;
  readonly vegetationMismatchCount: number;
  readonly coverageMismatchCount: number;
  readonly identity: 'compatible' | 'different' | 'unverifiable';
}

export function compareTerrains(local: TerrainRun, remote: TerrainRun): TerrainComparison {
  const keys: (keyof HeightMapRequest)[] = [
    'seed',
    'width',
    'height',
    'noiseScale',
    'octaves',
    'heightMultiplier',
    'algorithmVersion',
  ];
  const a = local.response;
  const b = remote.response;
  if (
    !sameObject(local.terrain, remote.terrain) ||
    keys.some((key) => local.request[key] !== remote.request[key]) ||
    a.result.width !== b.result.width ||
    a.result.height !== b.result.height ||
    a.result.algorithmVersion !== b.result.algorithmVersion ||
    a.workload !== b.workload ||
    a.executionProfile !== b.executionProfile ||
    a.simulationVersion !== b.simulationVersion ||
    a.result.resultVersion !== b.result.resultVersion ||
    a.result.biomes.length !== a.result.values.length ||
    b.result.biomes.length !== b.result.values.length ||
    a.result.values.length !== b.result.values.length ||
    a.result.values.length === 0
  )
    throw new TerrainError(
      'protocol',
      'Only results from the same request and workload can be compared.',
    );

  let maxAbsoluteError = 0;
  let sum = 0;
  let mismatchCount = 0;
  let biomeMismatchCount = 0;
  for (let index = 0; index < a.result.values.length; index++) {
    const left = a.result.values[index];
    const right = b.result.values[index];
    if (!Number.isFinite(left) || !Number.isFinite(right)) {
      throw new TerrainError('protocol', 'Cannot compare non-finite heights.');
    }
    if (a.result.biomes[index] !== b.result.biomes[index]) biomeMismatchCount++;
    const difference = Math.abs(left - right);
    maxAbsoluteError = Math.max(maxAbsoluteError, difference);
    sum += difference;
    if (difference > 1e-6 + 1e-5 * Math.max(Math.abs(left), Math.abs(right))) mismatchCount++;
  }

  const close = (left: number, right: number) =>
    Number.isFinite(left) &&
    Number.isFinite(right) &&
    Math.abs(left - right) <= 1e-6 + 1e-5 * Math.max(Math.abs(left), Math.abs(right));
  let environmentMismatchCount = 0,
    vegetationMismatchCount = 0;
  for (const name of ['moisture', 'temperature', 'slope', 'vegetationDensity'] as const) {
    if (
      a.result[name].length !== a.result.values.length ||
      b.result[name].length !== b.result.values.length
    )
      throw new TerrainError('protocol', 'Invalid environment field length.');
    for (let i = 0; i < a.result[name].length; i++)
      if (!close(a.result[name][i], b.result[name][i])) environmentMismatchCount++;
  }
  for (const name of [
    'iterations',
    'cellIterations',
    'initialTerrainMass',
    'finalTerrainMass',
    'suspendedSediment',
    'waterAdded',
    'waterRemaining',
    'waterEvaporated',
  ] as const)
    if (!close(a.simulation[name], b.simulation[name])) environmentMismatchCount++;
  if (
    a.result.surfaceWeights.length !== a.result.values.length * SURFACE_CHANNELS ||
    b.result.surfaceWeights.length !== b.result.values.length * SURFACE_CHANNELS
  )
    throw new TerrainError('protocol', 'Invalid surface coverage length.');
  let coverageMismatchCount = 0;
  for (let i = 0; i < a.result.surfaceWeights.length; i++)
    if (!close(a.result.surfaceWeights[i], b.result.surfaceWeights[i])) coverageMismatchCount++;
  if (a.result.trees.length !== b.result.trees.length) vegetationMismatchCount++;
  for (let i = 0; i < Math.min(a.result.trees.length, b.result.trees.length); i++) {
    const left = a.result.trees[i],
      right = b.result.trees[i];
    if (
      left.cellIndex !== right.cellIndex ||
      left.kind !== right.kind ||
      (['x', 'y', 'z', 'scale', 'rotation'] as const).some((key) => !close(left[key], right[key]))
    )
      vegetationMismatchCount++;
  }
  const verifiable = (id: string) =>
    id.trim().length > 0 && id.trim() !== 'unversioned' && !id.trim().endsWith('-dirty');
  const identity =
    a.coreBuildId !== b.coreBuildId
      ? 'different'
      : verifiable(a.coreBuildId) && verifiable(b.coreBuildId)
        ? 'compatible'
        : 'unverifiable';
  return {
    maxAbsoluteError,
    meanAbsoluteError: sum / a.result.values.length,
    mismatchCount,
    numericMatch:
      mismatchCount === 0 &&
      environmentMismatchCount === 0 &&
      vegetationMismatchCount === 0 &&
      coverageMismatchCount === 0,
    environmentMismatchCount,
    vegetationMismatchCount,
    coverageMismatchCount,
    biomeMismatchCount,
    biomesMatch: biomeMismatchCount === 0,
    identity,
  };
}
