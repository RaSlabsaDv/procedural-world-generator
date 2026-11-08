import {
  EXECUTION_PROFILE,
  RESULT_VERSION,
  SIMULATION_VERSION,
  TERRAIN_ALGORITHM,
  TERRAIN_WORKLOAD,
  TerrainError,
  TerrainRun,
} from '../../terrain/data/terrain.models';
import {
  Assessment,
  ExclusionReason,
  ExperimentFailure,
  ExperimentTrial,
  TrialIdentity,
} from './experiment.models';

export const EXPECTED_IDENTITY: Omit<TrialIdentity, 'coreBuildId'> = Object.freeze({
  algorithmVersion: TERRAIN_ALGORITHM,
  resultVersion: RESULT_VERSION,
  workload: TERRAIN_WORKLOAD,
  executionProfile: EXECUTION_PROFILE,
  simulationVersion: SIMULATION_VERSION,
});

export function failure(error: unknown, fallback: ExperimentFailure['kind']): ExperimentFailure {
  return Object.freeze({
    kind: error instanceof TerrainError ? error.kind : fallback,
    message: error instanceof Error ? error.message : String(error),
    fields: Object.freeze(error instanceof TerrainError ? { ...error.fields } : {}),
  });
}

export function assessment(reasons: readonly ExclusionReason[]): Assessment {
  if (reasons.length === 0)
    return Object.freeze({ status: 'eligible', reasons: Object.freeze([]) as readonly [] });
  const [first, ...rest] = reasons;
  return Object.freeze({
    status: 'excluded',
    reasons: Object.freeze([first, ...rest]) as readonly [ExclusionReason, ...ExclusionReason[]],
  });
}

export function reason(code: ExclusionReason['code'], detail: string): ExclusionReason {
  return Object.freeze({ code, detail });
}

export function identity(run: TerrainRun): TrialIdentity {
  const response = run.response;
  return Object.freeze({
    coreBuildId: response.coreBuildId,
    algorithmVersion: response.result.algorithmVersion,
    resultVersion: response.result.resultVersion,
    workload: response.workload,
    executionProfile: response.executionProfile,
    simulationVersion: response.simulationVersion,
  });
}

export function trialTimingReasons(trial: ExperimentTrial): readonly ExclusionReason[] {
  if (trial.status === 'error')
    return [reason('trial-failed', `${trial.trialId}: ${trial.failure.message}`)];
  const { computeMs, requestMs } = trial;
  return Number.isFinite(computeMs) &&
    Number.isFinite(requestMs) &&
    computeMs >= 0 &&
    requestMs >= computeMs
    ? []
    : [
        reason(
          'timing-inconsistent',
          `${trial.trialId}: raw computeMs=${computeMs}, requestMs=${requestMs}.`,
        ),
      ];
}
