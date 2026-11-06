import {
  RESULT_VERSION,
  TERRAIN_WORKLOAD,
  SIMULATION_VERSION,
  TerrainRequest,
  SimulationSummary,
  TerrainError,
  HeightMapRequest,
  TerrainResponse,
  TerrainRun,
} from './terrain.models';

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function decodeError(value: unknown): TerrainError | null {
  if (!object(value) || (value['error'] !== 'validation' && value['error'] !== 'invalid_json')) {
    return null;
  }
  const fields = value['fields'];
  if (
    fields !== null &&
    (!object(fields) || !Object.values(fields).every((v) => typeof v === 'string'))
  ) {
    return null;
  }
  return new TerrainError(
    value['error'],
    value['error'] === 'validation'
      ? 'Check the highlighted parameters.'
      : 'The host rejected the request JSON.',
    fields === null ? {} : (fields as Record<string, string>),
  );
}

export function decodeTerrain(
  value: unknown,
  request: HeightMapRequest,
  terrain: TerrainRequest,
): TerrainResponse {
  const error = decodeError(value);
  if (error) throw error;
  const fail = (): never => {
    throw new TerrainError('protocol', 'The host returned an invalid heightmap response.');
  };
  if (!object(value) || !object(value['result'])) return fail();
  const result = value['result'];
  const values = result['values'];
  const workload = TERRAIN_WORKLOAD;
  const biomes = result['biomes'];
  if (
    !Number.isSafeInteger(result['width']) ||
    !Number.isSafeInteger(result['height']) ||
    result['width'] !== request.width ||
    result['height'] !== request.height ||
    result['algorithmVersion'] !== terrain.algorithmVersion ||
    value['workload'] !== workload ||
    result['resultVersion'] !== RESULT_VERSION ||
    !Array.isArray(biomes) ||
    biomes.length !== request.width * request.height ||
    typeof value['coreBuildId'] !== 'string' ||
    value['coreBuildId'].trim().length === 0 ||
    typeof value['computeMs'] !== 'number' ||
    !Number.isFinite(value['computeMs']) ||
    value['computeMs'] < 0 ||
    !Array.isArray(values) ||
    values.length !== request.width * request.height ||
    request.width <= 0 ||
    request.height <= 0
  )
    return fail();

  const normalized = new Float32Array(values.length);
  const biomeIds = new Uint8Array(values.length);
  const upper = Math.fround(request.heightMultiplier);
  if (!Number.isFinite(upper) || upper < 0) return fail();
  for (let index = 0; index < values.length; index++) {
    const item: unknown = values[index];
    if (typeof item !== 'number' || !Number.isFinite(item)) return fail();
    const biome: unknown = biomes[index];
    if (typeof biome !== 'number' || !Number.isInteger(biome) || biome < 0 || biome > 3)
      return fail();
    biomeIds[index] = biome;
    normalized[index] = item;
    if (!Number.isFinite(normalized[index]) || normalized[index] < 0 || normalized[index] > upper)
      return fail();
  }
  let simulation: SimulationSummary;
  {
    if (
      !sameObject(terrain.heightMap, request) ||
      value['simulationVersion'] !== SIMULATION_VERSION ||
      !sameObject(value['parameters'], terrain) ||
      !object(value['simulation'])
    )
      return fail();
    const stats = value['simulation'];
    const names = [
      'iterations',
      'cellIterations',
      'initialTerrainMass',
      'finalTerrainMass',
      'suspendedSediment',
      'waterAdded',
      'waterRemaining',
      'waterEvaporated',
    ] as const;
    if (
      names.some(
        (name) =>
          typeof stats[name] !== 'number' || !Number.isFinite(stats[name]) || stats[name] < 0,
      ) ||
      stats['iterations'] !== terrain.iterations ||
      stats['cellIterations'] !== terrain.iterations * request.width * request.height
    )
      return fail();
    simulation = stats as unknown as SimulationSummary;
  }
  return {
    result: {
      width: request.width,
      height: request.height,
      values: normalized,
      biomes: biomeIds,
      resultVersion: RESULT_VERSION,
      algorithmVersion: terrain.algorithmVersion,
    },
    computeMs: value['computeMs'],
    coreBuildId: value['coreBuildId'],
    workload,
    simulation,
    simulationVersion: SIMULATION_VERSION,
  };
}

export interface TerrainComparison {
  readonly maxAbsoluteError: number;
  readonly meanAbsoluteError: number;
  readonly mismatchCount: number;
  readonly numericMatch: boolean;
  readonly biomeMismatchCount: number;
  readonly biomesMatch: boolean;
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
    numericMatch: mismatchCount === 0,
    biomeMismatchCount,
    biomesMatch: biomeMismatchCount === 0,
    identity,
  };
}

function sameObject(actual: unknown, expected: unknown): boolean {
  if (actual === expected) return true;
  if (!object(actual) || !object(expected)) return false;
  const keys = Object.keys(expected);
  return (
    Object.keys(actual).length === keys.length &&
    keys.every((key) => sameObject(actual[key], expected[key]))
  );
}
