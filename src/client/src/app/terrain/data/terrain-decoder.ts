import { decodeHydrology } from './hydrology-decoder';
import { sameObject, object } from './contract-utils';
import { decodeRocks } from './rock-decoder';
import {
  RESULT_VERSION,
  SURFACE_CHANNELS,
  SURFACE_SUM_TOLERANCE,
  TREE_KIND_IDS,
  TREE_VARIANT_IDS,
  TREE_KIND_BIOME,
  VEGETATED_BIOME_IDS,
  LANDSCAPE_BIOME,
  LANDSCAPE_BIOME_IDS,
  MAX_TREES,
  EXECUTION_PROFILE,
  TreeInstance,
  TERRAIN_WORKLOAD,
  SIMULATION_VERSION,
  TerrainRequest,
  SimulationSummary,
  TerrainError,
  HeightMapRequest,
  TerrainResponse,
} from './terrain.models';

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
    throw new TerrainError('protocol', 'The host returned an invalid terrain response.');
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
    value['executionProfile'] !== EXECUTION_PROFILE ||
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
    if (typeof biome !== 'number' || !Number.isInteger(biome) || !LANDSCAPE_BIOME_IDS.has(biome))
      return fail();
    biomeIds[index] = biome;
    normalized[index] = item;
    if (!Number.isFinite(normalized[index]) || normalized[index] < 0 || normalized[index] > upper)
      return fail();
  }
  const field = (name: string, max: number): Float32Array => {
    const source = result[name];
    if (!Array.isArray(source) || source.length !== normalized.length) return fail();
    const copy = new Float32Array(source.length);
    for (let i = 0; i < source.length; i++) {
      const item = source[i];
      if (typeof item !== 'number' || !Number.isFinite(item)) return fail();
      copy[i] = item;
      if (!Number.isFinite(copy[i]) || copy[i] < 0 || copy[i] > max) return fail();
    }
    return copy;
  };
  const moisture = field('moisture', 1),
    temperature = field('temperature', 1),
    slope = field('slope', Math.fround(Math.SQRT2 * upper)),
    vegetationDensity = field('vegetationDensity', 1);
  for (let i = 0; i < normalized.length; i++)
    if (!VEGETATED_BIOME_IDS.has(biomeIds[i]) && vegetationDensity[i] !== 0) return fail();
  const rawWeights = result['surfaceWeights'];
  if (!Array.isArray(rawWeights) || rawWeights.length !== normalized.length * SURFACE_CHANNELS)
    return fail();
  const surfaceWeights = new Float32Array(rawWeights.length);
  for (let i = 0; i < normalized.length; i++) {
    let sum = 0;
    for (let channel = 0; channel < SURFACE_CHANNELS; channel++) {
      const index = i * SURFACE_CHANNELS + channel,
        item: unknown = rawWeights[index];
      if (typeof item !== 'number' || !Number.isFinite(item) || item < 0 || item > 1) return fail();
      surfaceWeights[index] = item;
      if (biomeIds[i] === LANDSCAPE_BIOME.Ocean && item !== 0) return fail();
      sum += surfaceWeights[index];
    }
    if (biomeIds[i] !== LANDSCAPE_BIOME.Ocean && Math.abs(sum - 1) > SURFACE_SUM_TOLERANCE)
      return fail();
  }
  const rawTrees = result['trees'];
  if (!Array.isArray(rawTrees) || rawTrees.length > MAX_TREES) return fail();
  let previous = -1;
  const trees: TreeInstance[] = rawTrees.map((tree) => {
    if (
      !object(tree) ||
      Object.keys(tree).length !== 8 ||
      !['cellIndex', 'x', 'y', 'z', 'scale', 'rotation', 'kind', 'variant'].every(
        (key) => key in tree,
      )
    )
      return fail();
    // Eight required members; rejecting extras keeps the versioned instance contract explicit.
    if (
      !['x', 'y', 'z', 'scale', 'rotation'].every(
        (key) => typeof tree[key] === 'number' && Number.isFinite(tree[key]),
      )
    )
      return fail();
    return Object.freeze({
      kind: tree['kind'],
      variant: tree['variant'],
      cellIndex: tree['cellIndex'],
      x: Math.fround(tree['x'] as number),
      y: Math.fround(tree['y'] as number),
      z: Math.fround(tree['z'] as number),
      scale: Math.fround(tree['scale'] as number),
      rotation: Math.fround(tree['rotation'] as number),
    }) as unknown as TreeInstance;
  });
  for (const tree of trees) {
    const { cellIndex: i, x, y, z, scale, rotation, kind, variant } = tree;
    if (
      !Number.isInteger(variant) ||
      !TREE_VARIANT_IDS.has(variant) ||
      !Number.isInteger(kind) ||
      !TREE_KIND_IDS.has(kind) ||
      !Number.isSafeInteger(i) ||
      i <= previous ||
      i < 0 ||
      i >= normalized.length ||
      i % request.width >= request.width - 1 ||
      Math.floor(i / request.width) >= request.height - 1 ||
      ![x, y, z, scale, rotation].every((v) => typeof v === 'number' && Number.isFinite(v)) ||
      x <= i % request.width ||
      x >= (i % request.width) + 1 ||
      z <= Math.floor(i / request.width) ||
      z >= Math.floor(i / request.width) + 1 ||
      y < 0 ||
      y > upper ||
      scale < Math.fround(0.6) ||
      scale > Math.fround(1.4) ||
      rotation < 0 ||
      rotation > 2 * Math.PI + 1e-6
    )
      return fail();
    const corners = [i, i + 1, i + request.width, i + request.width + 1];
    if (corners.some((j) => biomeIds[j] !== TREE_KIND_BIOME[kind] || slope[j] >= 0.5))
      return fail();
    const fx = x - (i % request.width),
      fz = z - Math.floor(i / request.width);
    const surface =
      fx + fz <= 1
        ? normalized[i] +
          (normalized[i + 1] - normalized[i]) * fx +
          (normalized[i + request.width] - normalized[i]) * fz
        : normalized[i + request.width + 1] +
          (normalized[i + request.width] - normalized[i + request.width + 1]) * (1 - fx) +
          (normalized[i + 1] - normalized[i + request.width + 1]) * (1 - fz);
    if (Math.abs(y - surface) > 1e-6 + 1e-5 * Math.max(Math.abs(y), Math.abs(surface)))
      return fail();
    previous = i;
  }
  const rocks = decodeRocks(
    result['rocks'],
    request.width,
    request.height,
    normalized,
    biomeIds,
    fail,
  );
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
      moisture,
      temperature,
      slope,
      vegetationDensity,
      surfaceWeights,
      trees: Object.freeze(trees),
      rocks,
      hydrology: decodeHydrology(
        result['hydrology'],
        normalized,
        biomeIds,
        request.width,
        request.height,
        upper,
        fail,
      ),
      resultVersion: RESULT_VERSION,
      algorithmVersion: terrain.algorithmVersion,
    },
    computeMs: value['computeMs'],
    coreBuildId: value['coreBuildId'],
    workload,
    simulation,
    executionProfile: EXECUTION_PROFILE,
    simulationVersion: SIMULATION_VERSION,
  };
}
