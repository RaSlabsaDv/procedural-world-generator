import type { ExperimentResult } from './experiment.models';

export const EXPORT_VERSION = 'architecture-race-export-v1';
export const CSV_COLUMNS = [
  'schemaVersion',
  'experimentId',
  'pairId',
  'trialId',
  'phase',
  'pairIndex',
  'position',
  'mode',
  'status',
  'computeMs',
  'requestMs',
  'coreBuildId',
  'workload',
  'algorithmVersion',
  'resultVersion',
  'simulationVersion',
  'executionProfile',
  'width',
  'height',
  'treeCount',
  'rockCount',
  'errorKind',
  'errorMessage',
  'pairVerificationStatus',
  'exclusionReasons',
] as const;

type JsonValue = null | boolean | string | number | JsonValue[] | { [key: string]: JsonValue };
interface SpecialNumber {
  readonly path: string;
  readonly value: 'NaN' | '+Infinity' | '-Infinity' | '-0';
}
export const numberToken = (value: number): string =>
  Number.isNaN(value)
    ? 'NaN'
    : value === Infinity
      ? '+Infinity'
      : value === -Infinity
        ? '-Infinity'
        : Object.is(value, -0)
          ? '-0'
          : String(value);

/** Explicit traversal avoids silent omission/toJSON coercion and keeps invalid numbers distinct. */
function prepareExport(record: ExperimentResult) {
  const specialNumbers: SpecialNumber[] = [];
  const ancestors = new Set<object>();
  const visit = (value: unknown, path: string): JsonValue => {
    if (typeof value === 'number') {
      if (Number.isFinite(value) && !Object.is(value, -0)) return value;
      specialNumbers.push({ path, value: numberToken(value) as SpecialNumber['value'] });
      return null;
    }
    if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
    if (typeof value !== 'object')
      throw new TypeError(`Unsupported export value at ${path || '/'}.`);
    if (ArrayBuffer.isView(value) || value instanceof ArrayBuffer)
      throw new TypeError(`Terrain/binary arrays cannot be exported (${path}).`);
    if (ancestors.has(value)) throw new TypeError(`Circular export value at ${path}.`);
    ancestors.add(value);
    try {
      if (Array.isArray(value)) {
        if (
          !['/trials', '/verifications', '/metadata/interruptions', '/assessment/reasons'].includes(
            path,
          ) &&
          !/^\/verifications\/\d+\/assessment\/reasons$/u.test(path)
        )
          throw new TypeError(`Unsupported record array at ${path}.`);
        if (value.some((item) => item === null || typeof item !== 'object' || Array.isArray(item)))
          throw new TypeError(`Only compact record arrays can be exported (${path}).`);
        return value.map((item, index) => visit(item, `${path}/${index}`));
      }
      if (![Object.prototype, null].includes(Object.getPrototypeOf(value)))
        throw new TypeError(`Only plain export records are supported (${path}).`);
      return Object.fromEntries(
        Object.entries(value).map(([key, item]) => [
          key,
          visit(item, `${path}/${key.replaceAll('~', '~0').replaceAll('/', '~1')}`),
        ]),
      );
    } finally {
      ancestors.delete(value);
    }
  };
  return { formatVersion: EXPORT_VERSION, experiment: visit(record, ''), specialNumbers };
}

export function serializeExperimentJson(record: ExperimentResult): string {
  return JSON.stringify(prepareExport(record), null, 2) + '\n';
}

function csvCell(value: string | number | null): string {
  if (value === null) return '';
  if (typeof value === 'number') return numberToken(value);
  let text = value;
  if (/^[\s\u0000-\u0020\uFEFF]*[=+\-@]/u.test(text) || /^[\t\r\n]/u.test(text)) text = "'" + text;
  return /[",\r\n]/u.test(text) ? '"' + text.replaceAll('"', '""') + '"' : text;
}

export function serializeExperimentCsv(record: ExperimentResult): string {
  prepareExport(record); // Same rejection policy; never silently omit unexpected terrain data.
  const rows = record.trials.map((trial) => {
    const pair = record.verifications.find((p) => p.pairId === trial.pairId);
    const reasons = [
      ...new Map(
        [...record.assessment.reasons, ...(pair?.assessment.reasons ?? [])].map((reason) => [
          JSON.stringify([reason.code, reason.detail]),
          reason,
        ]),
      ).values(),
    ];
    const id = trial.identity,
      diagnostics = trial.diagnostics;
    const error = trial.status === 'error' ? trial.failure : null;
    return [
      record.configuration.schemaVersion,
      record.metadata.experimentId,
      trial.pairId,
      trial.trialId,
      trial.phase,
      trial.pairIndex,
      trial.position,
      trial.mode,
      trial.status,
      trial.computeMs,
      trial.requestMs,
      id?.coreBuildId ?? null,
      id?.workload ?? null,
      id?.algorithmVersion ?? null,
      id?.resultVersion ?? null,
      id?.simulationVersion ?? null,
      id?.executionProfile ?? null,
      diagnostics?.width ?? null,
      diagnostics?.height ?? null,
      diagnostics?.treeCount ?? null,
      diagnostics?.rockCount ?? null,
      error?.kind ?? null,
      error?.message ?? null,
      pair?.status ?? null,
      JSON.stringify(reasons),
    ]
      .map(csvCell)
      .join(',');
  });
  return [CSV_COLUMNS.join(','), ...rows].join('\r\n') + '\r\n';
}
