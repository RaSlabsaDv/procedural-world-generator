import { testTerrain } from '../../terrain/testing/terrain-test-fixture';
import { createExperimentConfiguration } from '../data/experiment-configuration';
import { EXPECTED_IDENTITY } from '../data/experiment-records';
import type {
  ExperimentResult,
  ExperimentTrial,
  PairVerification,
} from '../data/experiment.models';

/** Small synthetic timing records, independent of generator performance and Angular. */
export function experimentFixture(): ExperimentResult {
  const trials: ExperimentTrial[] = [];
  const verifications: PairVerification[] = [];
  const local = [1, 2, 4, 9],
    remote = [10, 20, 40, 90];
  for (let index = -1; index < 4; index++) {
    const phase =
      index < 0
        ? { phase: 'warmup' as const, pairIndex: null }
        : { phase: 'measured' as const, pairIndex: index };
    const pairId = index < 0 ? 'warmup' : `pair-${index}`;
    for (const [position, mode] of (index < 0 || index % 2 === 0
      ? (['local', 'remote'] as const)
      : (['remote', 'local'] as const)
    ).entries()) {
      const computeMs = index < 0 ? 10000 : (mode === 'local' ? local : remote)[index];
      trials.push({
        ...phase,
        pairId,
        trialId: `${pairId}:${mode}`,
        position: position as 0 | 1,
        mode,
        status: 'success',
        computeMs,
        requestMs: computeMs + 100,
        identity: { ...EXPECTED_IDENTITY, coreBuildId: 'git:fixture' },
        diagnostics: { width: 3, height: 2, treeCount: 0, rockCount: 0 },
      });
    }
    verifications.push({
      ...phase,
      pairId,
      status: 'compared',
      localTrialId: `${pairId}:local`,
      remoteTrialId: `${pairId}:remote`,
      assessment: { status: 'eligible', reasons: [] },
      comparison: {
        maxAbsoluteError: 0,
        meanAbsoluteError: 0,
        mismatchCount: 0,
        numericMatch: true,
        biomeMismatchCount: 0,
        biomesMatch: true,
        environmentMismatchCount: 0,
        vegetationMismatchCount: 0,
        coverageMismatchCount: 0,
        rockMismatchCount: 0,
        identity: 'compatible',
      },
    });
  }
  return {
    status: 'completed',
    complete: true,
    configuration: createExperimentConfiguration(testTerrain(), 4),
    assessment: { status: 'eligible', reasons: [] },
    trials,
    verifications,
    metadata: {
      experimentId: 'fixture',
      startedAt: '2026-11-08T10:00:00.000Z',
      endedAt: '2026-11-08T10:01:00.000Z',
      expectedIdentity: EXPECTED_IDENTITY,
      coreBuildIds: { local: 'git:fixture', remote: 'git:fixture' },
      applicationRevision: null,
      browser: null,
      hardware: null,
      server: null,
      network: null,
      cacheState: null,
      preparation: null,
      notes: null,
      startup: {
        origin: 'unknown',
        initMs: null,
        runtimeMs: null,
        initCount: null,
        execution: null,
        protocol: null,
        runtimeVersion: null,
      },
      interruptions: [],
    },
  };
}
