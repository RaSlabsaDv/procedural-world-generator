import {
  HeightMapError,
  HeightMapRequest,
  HeightMapResponse,
  HeightMapRun,
} from './heightmap.models';

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function decodeError(value: unknown): HeightMapError | null {
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
  return new HeightMapError(
    value['error'],
    value['error'] === 'validation'
      ? 'Check the highlighted parameters.'
      : 'The host rejected the request JSON.',
    fields === null ? {} : (fields as Record<string, string>),
  );
}

export function decodeHeightMap(value: unknown, request: HeightMapRequest): HeightMapResponse {
  const error = decodeError(value);
  if (error) throw error;
  const fail = (): never => {
    throw new HeightMapError('protocol', 'The host returned an invalid heightmap response.');
  };
  if (!object(value) || !object(value['result'])) return fail();
  const result = value['result'];
  const values = result['values'];
  if (
    !Number.isSafeInteger(result['width']) ||
    !Number.isSafeInteger(result['height']) ||
    result['width'] !== request.width ||
    result['height'] !== request.height ||
    result['algorithmVersion'] !== request.algorithmVersion ||
    value['workload'] !== 'heightmap' ||
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
  const upper = Math.fround(request.heightMultiplier);
  if (!Number.isFinite(upper) || upper < 0) return fail();
  for (let index = 0; index < values.length; index++) {
    const item: unknown = values[index];
    if (typeof item !== 'number' || !Number.isFinite(item)) return fail();
    normalized[index] = item;
    if (!Number.isFinite(normalized[index]) || normalized[index] < 0 || normalized[index] > upper)
      return fail();
  }
  return {
    result: {
      width: request.width,
      height: request.height,
      values: normalized,
      algorithmVersion: request.algorithmVersion,
    },
    computeMs: value['computeMs'],
    coreBuildId: value['coreBuildId'],
    workload: 'heightmap',
  };
}

export interface HeightMapComparison {
  readonly maxAbsoluteError: number;
  readonly meanAbsoluteError: number;
  readonly mismatchCount: number;
  readonly numericMatch: boolean;
  readonly identity: 'compatible' | 'different' | 'unverifiable';
}

export function compareHeightMaps(local: HeightMapRun, remote: HeightMapRun): HeightMapComparison {
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
    keys.some((key) => local.request[key] !== remote.request[key]) ||
    a.result.width !== b.result.width ||
    a.result.height !== b.result.height ||
    a.result.algorithmVersion !== b.result.algorithmVersion ||
    a.workload !== b.workload ||
    a.result.values.length !== b.result.values.length ||
    a.result.values.length === 0
  )
    throw new HeightMapError(
      'protocol',
      'Only results from the same request and workload can be compared.',
    );

  let maxAbsoluteError = 0;
  let sum = 0;
  let mismatchCount = 0;
  for (let index = 0; index < a.result.values.length; index++) {
    const left = a.result.values[index];
    const right = b.result.values[index];
    if (!Number.isFinite(left) || !Number.isFinite(right)) {
      throw new HeightMapError('protocol', 'Cannot compare non-finite heights.');
    }
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
    identity,
  };
}
