import { describeSamples, summarizeExperiment } from './experiment-statistics';
import { experimentFixture } from '../testing/experiment-fixture';
import type { ExperimentResult } from './experiment.models';

it('uses independent odd/even percentile literals and preserves source order', () => {
  const values = Object.freeze([4, 1, 9, 2]);
  expect(describeSamples(values)).toEqual({
    count: 4,
    min: 1,
    q1: 1.75,
    median: 3,
    q3: 5.25,
    max: 9,
  });
  expect(values).toEqual([4, 1, 9, 2]);
  expect(describeSamples([100, 3, 1, 4, 2])).toEqual({
    count: 5,
    min: 1,
    q1: 2,
    median: 3,
    q3: 4,
    max: 100,
  });
});
it('handles empty, single and zero samples without fabricated values', () => {
  expect(describeSamples([])).toEqual({
    count: 0,
    min: null,
    q1: null,
    median: null,
    q3: null,
    max: null,
  });
  expect(describeSamples([0])).toEqual({ count: 1, min: 0, q1: 0, median: 0, q3: 0, max: 0 });
});
it.each([NaN, Infinity, -Infinity, -1])('rejects invalid direct statistics input %s', (value) => {
  expect(() => describeSamples([value])).toThrow(RangeError);
});
it('separates modes and metrics, excludes huge warmups, and does not mutate frozen records', () => {
  const source = experimentFixture();
  function freeze(value: unknown) {
    if (value && typeof value === 'object') {
      for (const child of Object.values(value)) freeze(child);
      Object.freeze(value);
    }
  }
  freeze(source);
  const result = summarizeExperiment(source);
  expect(result.diagnostic[0].computeMs.groups[0].distribution).toEqual({
    count: 4,
    min: 1,
    q1: 1.75,
    median: 3,
    q3: 5.25,
    max: 9,
  });
  expect(result.diagnostic[0].requestMs.groups[0].distribution.median).toBe(103);
  expect(result.diagnostic[1].computeMs.groups[0].distribution.median).toBe(30);
  expect(result.verified.status).toBe('available');
  if (result.verified.status === 'available')
    expect(result.verified.modes).toEqual(result.diagnostic);
  expect(result.diagnostic[0].computeMs).toMatchObject({
    total: 4,
    included: 4,
    failed: 0,
    unavailable: 0,
    excludedSuccessful: 0,
  });
  expect(source.trials[0].computeMs).toBe(10000);
});
it.each(['stopped', 'failed', 'completed'] as const)(
  'keeps %s excluded records diagnostic only',
  (status) => {
    const source = experimentFixture();
    const record = {
      ...source,
      status,
      complete: status === 'completed',
      assessment: {
        status: 'excluded',
        reasons: [{ code: 'build-unverifiable', detail: 'Dirty build' }],
      },
      ...(status === 'failed'
        ? { failure: { kind: 'execution', message: 'Stopped collection', fields: {} } }
        : {}),
    } as ExperimentResult;
    const result = summarizeExperiment(record);
    expect(result.verified).toMatchObject({
      status: 'unavailable',
      reasons: record.assessment.reasons,
    });
    expect(result.diagnostic[0].computeMs.included).toBe(4);
    expect(result.diagnostic[0].computeMs.issues[0].trialIds).toHaveLength(4);
  },
);
it('partitions changed builds/workloads rather than pooling their distributions', () => {
  const source = experimentFixture();
  const trials = source.trials.map((t) =>
    t.trialId === 'pair-0:local' && t.status === 'success'
      ? { ...t, identity: { ...t.identity, coreBuildId: 'other' } }
      : t.trialId === 'pair-1:local' && t.status === 'success'
        ? { ...t, identity: { ...t.identity, workload: 'other-workload' } }
        : t,
  );
  const groups = summarizeExperiment({ ...source, trials }).diagnostic[0].computeMs.groups;
  expect(groups).toHaveLength(3);
  expect(groups.map((g) => g.distribution.count)).toEqual([1, 1, 2]);
  expect(groups.map((g) => g.distribution.median)).toEqual([1, 2, 6.5]);
});
it('counts errors, null and invalid values explicitly with documented overlapping counts', () => {
  const source = experimentFixture();
  const trials = source.trials.map((t) => {
    if (t.trialId === 'pair-0:local')
      return {
        ...t,
        status: 'error' as const,
        computeMs: null,
        requestMs: 99,
        identity: null,
        diagnostics: null,
        failure: { kind: 'availability' as const, message: 'Offline', fields: {} },
      };
    if (t.trialId === 'pair-1:local') return { ...t, computeMs: NaN, requestMs: -1 };
    return t;
  });
  const result = summarizeExperiment({ ...source, trials });
  expect(result.diagnostic[0].computeMs).toMatchObject({
    total: 4,
    included: 2,
    failed: 1,
    unavailable: 1,
    excludedSuccessful: 1,
  });
  expect(result.diagnostic[0].requestMs).toMatchObject({
    total: 4,
    included: 2,
    failed: 1,
    unavailable: 0,
    excludedSuccessful: 1,
  });
  expect(result.diagnostic[0].computeMs.issues.map((i) => i.code)).toEqual(
    expect.arrayContaining(['trial-failed', 'invalid-duration', 'missing-measurement']),
  );
});
it('keeps finite negative-residual samples diagnostic with flags and no verified claim', () => {
  const source = experimentFixture();
  const reasons = [{ code: 'timing-inconsistent' as const, detail: 'requestMs < computeMs' }];
  const record: ExperimentResult = {
    ...source,
    status: 'completed',
    complete: true,
    assessment: { status: 'excluded', reasons: [reasons[0]] },
    trials: source.trials.map((t) =>
      t.trialId === 'pair-0:local' ? { ...t, computeMs: 10, requestMs: 1 } : t,
    ),
  };
  const result = summarizeExperiment(record);
  expect(result.diagnostic[0].computeMs.included).toBe(4);
  expect(result.diagnostic[0].computeMs.issues.some((i) => i.code === 'timing-inconsistent')).toBe(
    true,
  );
  expect(result.verified.status).toBe('unavailable');
});
it('requires eligible compared references for each verified sample', () => {
  const source = experimentFixture();
  const result = summarizeExperiment({
    ...source,
    verifications: source.verifications.filter((p) => p.pairIndex !== 0),
  });
  if (result.verified.status !== 'available') throw new Error('Expected eligible experiment.');
  expect(result.verified.modes[0].computeMs).toMatchObject({ included: 3, excludedSuccessful: 1 });
  expect(
    result.verified.modes[0].computeMs.issues.some((i) => i.code === 'missing-verification'),
  ).toBe(true);
});
it('does not invent measured trials when only warmups or no calls exist', () => {
  const source = experimentFixture();
  for (const trials of [[], source.trials.filter((t) => t.phase === 'warmup')]) {
    const summary = summarizeExperiment({ ...source, trials });
    expect(summary.diagnostic[0].computeMs).toMatchObject({ total: 0, included: 0, groups: [] });
  }
});
