import type {
  ExecutionMode,
  ExperimentResult,
  ExperimentTrial,
  TrialIdentity,
} from './experiment.models';

export const SUMMARY_VERSION = 'architecture-race-summary-v1';
export type TimingMetric = 'computeMs' | 'requestMs';
export interface Distribution {
  readonly count: number;
  readonly min: number | null;
  readonly q1: number | null;
  readonly median: number | null;
  readonly q3: number | null;
  readonly max: number | null;
}
export interface SummaryIssue {
  readonly code: string;
  readonly detail: string;
  readonly trialIds: readonly string[];
}
export interface MetricSummary {
  readonly total: number;
  readonly included: number;
  readonly failed: number;
  readonly unavailable: number;
  readonly excludedSuccessful: number;
  readonly issues: readonly SummaryIssue[];
  readonly groups: readonly {
    readonly identity: TrialIdentity;
    readonly trialIds: readonly string[];
    readonly distribution: Distribution;
  }[];
}
export interface ModeSummary {
  readonly mode: ExecutionMode;
  readonly computeMs: MetricSummary;
  readonly requestMs: MetricSummary;
}
export interface ExperimentSummary {
  readonly version: typeof SUMMARY_VERSION;
  readonly diagnostic: readonly ModeSummary[];
  readonly verified:
    | { readonly status: 'available'; readonly modes: readonly ModeSummary[] }
    | {
        readonly status: 'unavailable';
        readonly reasons: readonly { readonly code: string; readonly detail: string }[];
      };
}

/** Linear interpolation of sorted index (n-1)*p; caller supplies usable durations. */
export function describeSamples(values: readonly number[]): Distribution {
  if (values.some((value) => !Number.isFinite(value) || value < 0))
    throw new RangeError('Statistics require finite nonnegative durations.');
  const sorted = [...values].sort((a, b) => a - b);
  if (!sorted.length) return { count: 0, min: null, q1: null, median: null, q3: null, max: null };
  const percentile = (p: number) => {
    const index = (sorted.length - 1) * p;
    const lower = Math.floor(index),
      upper = Math.ceil(index);
    // Interpolate between adjacent order statistics.
    return lower === upper
      ? sorted[lower]
      : sorted[lower] * (upper - index) + sorted[upper] * (index - lower);
  };
  return {
    count: sorted.length,
    min: sorted[0],
    q1: percentile(0.25),
    median: percentile(0.5),
    q3: percentile(0.75),
    max: sorted.at(-1)!,
  };
}

function identityKey(id: TrialIdentity): string {
  return JSON.stringify([
    id.coreBuildId,
    id.algorithmVersion,
    id.resultVersion,
    id.workload,
    id.simulationVersion,
    id.executionProfile,
  ]);
}

function summarizeMetric(
  record: ExperimentResult,
  mode: ExecutionMode,
  metric: TimingMetric,
  verified: boolean,
): MetricSummary {
  const trials = record.trials.filter((t) => t.phase === 'measured' && t.mode === mode);
  const issues = new Map<string, { code: string; detail: string; trialIds: Set<string> }>();
  const groups = new Map<
    string,
    { identity: TrialIdentity; trialIds: string[]; values: number[] }
  >();
  let included = 0,
    failed = 0,
    unavailable = 0,
    excludedSuccessful = 0;
  const addIssue = (trial: ExperimentTrial, code: string, detail: string) => {
    const key = JSON.stringify([code, detail]);
    const issue = issues.get(key) ?? { code, detail, trialIds: new Set<string>() };
    issue.trialIds.add(trial.trialId);
    issues.set(key, issue);
  };
  for (const trial of trials) {
    const pair = record.verifications.find((p) => p.pairId === trial.pairId);
    for (const issue of [...record.assessment.reasons, ...(pair?.assessment.reasons ?? [])])
      addIssue(trial, issue.code, issue.detail);
    const value = trial[metric];
    if (value === null) {
      unavailable++;
      addIssue(trial, 'missing-measurement', `${metric} was not measured.`);
    } else if (!Number.isFinite(value) || value < 0)
      addIssue(
        trial,
        'invalid-duration',
        `${metric} is nonfinite or negative; its raw value is retained.`,
      );
    if (trial.status === 'error') {
      failed++;
      addIssue(trial, 'trial-failed', `${trial.failure.kind}: ${trial.failure.message}`);
      continue;
    }
    let eligible = value !== null && Number.isFinite(value) && value >= 0;
    if (!trial.identity) {
      eligible = false;
      addIssue(trial, 'missing-identity', 'No observed identity is available.');
    }
    if (
      verified &&
      !(
        pair?.status === 'compared' &&
        pair.assessment.status === 'eligible' &&
        pair.phase === 'measured' &&
        pair.pairIndex === trial.pairIndex &&
        pair[trial.mode === 'local' ? 'localTrialId' : 'remoteTrialId'] === trial.trialId
      )
    ) {
      eligible = false;
      addIssue(
        trial,
        'missing-verification',
        'No eligible compared measured pair references this trial.',
      );
    }
    if (!eligible) {
      excludedSuccessful++;
      continue;
    }
    const key = identityKey(trial.identity);
    const group = groups.get(key) ?? { identity: { ...trial.identity }, trialIds: [], values: [] };
    group.trialIds.push(trial.trialId);
    group.values.push(value!);
    groups.set(key, group);
    included++;
  }
  return {
    total: trials.length,
    included,
    failed,
    unavailable,
    excludedSuccessful,
    issues: [...issues.values()].map((issue) => ({ ...issue, trialIds: [...issue.trialIds] })),
    groups: [...groups.values()].map((group) => ({
      identity: group.identity,
      trialIds: group.trialIds,
      distribution: describeSamples(group.values),
    })),
  };
}

export function summarizeExperiment(record: ExperimentResult): ExperimentSummary {
  const modes = (verified: boolean): readonly ModeSummary[] =>
    (['local', 'remote'] as const).map((mode) => ({
      mode,
      computeMs: summarizeMetric(record, mode, 'computeMs', verified),
      requestMs: summarizeMetric(record, mode, 'requestMs', verified),
    }));
  const verified =
    record.status === 'completed' && record.complete && record.assessment.status === 'eligible';
  return {
    version: SUMMARY_VERSION,
    diagnostic: modes(false),
    verified: verified
      ? { status: 'available', modes: modes(true) }
      : {
          status: 'unavailable',
          reasons: record.assessment.reasons.length
            ? [...record.assessment.reasons]
            : [{ code: 'incomplete', detail: 'A completed eligible experiment is required.' }],
        },
  };
}
