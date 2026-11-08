import { CSV_COLUMNS, serializeExperimentCsv, serializeExperimentJson } from './experiment-export';
import { experimentFixture } from '../testing/experiment-fixture';
import type { ExperimentResult, ExperimentTrial } from './experiment.models';

// Small independent reader used only to inspect CSV fixtures, including embedded CR/LF.
function readCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [],
    field = '',
    quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (quoted && text[i + 1] === '"') {
        field += '"';
        i++;
      } else quoted = !quoted;
    } else if (c === ',' && !quoted) {
      row.push(field);
      field = '';
    } else if (c === '\r' && text[i + 1] === '\n' && !quoted) {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      i++;
    } else field += c;
  }
  if (quoted || row.length || field) throw new Error('Malformed CSV fixture.');
  return rows;
}

it('round trips the complete finite JSON record without derived summaries or maps', () => {
  const source = experimentFixture();
  const text = serializeExperimentJson(source);
  const parsed = JSON.parse(text);
  expect(parsed).toEqual({
    formatVersion: 'architecture-race-export-v1',
    experiment: source,
    specialNumbers: [],
  });
  expect(Object.keys(parsed)).toEqual(['formatVersion', 'experiment', 'specialNumbers']);
  expect(text.endsWith('\n')).toBe(true);
  expect(source.trials[0].computeMs).toBe(10000);
});
it('preserves invalid numeric leaves and negative zero with explicit reversible paths', () => {
  const source = experimentFixture();
  const record = {
    ...source,
    metadata: { ...source.metadata, startup: { ...source.metadata.startup, initMs: NaN } },
    trials: source.trials.map((trial, i) =>
      i === 2
        ? { ...trial, computeMs: Infinity, requestMs: -Infinity }
        : i === 3
          ? { ...trial, computeMs: -0 }
          : trial,
    ),
  };
  const exported = JSON.parse(serializeExperimentJson(record));
  expect(exported.specialNumbers).toEqual([
    { path: '/trials/2/computeMs', value: '+Infinity' },
    { path: '/trials/2/requestMs', value: '-Infinity' },
    { path: '/trials/3/computeMs', value: '-0' },
    { path: '/metadata/startup/initMs', value: 'NaN' },
  ]);
  expect(exported.experiment.metadata.startup.runtimeMs).toBeNull(); // Actual unavailable null has no sidecar entry.
  for (const entry of exported.specialNumbers) {
    const keys = entry.path
      .slice(1)
      .split('/')
      .map((key: string) => key.replaceAll('~1', '/').replaceAll('~0', '~'));
    let parent = exported.experiment;
    for (const key of keys.slice(0, -1)) parent = parent[key];
    parent[keys.at(-1)] = entry.value === 'NaN' ? NaN : Number(entry.value);
  }
  expect(exported.experiment).toEqual(record);
  expect(Object.is(exported.experiment.trials[3].computeMs, -0)).toBe(true);
});
it('escapes special-number paths without reserving keys or rewriting original text', () => {
  const source = experimentFixture();
  const record = {
    ...source,
    metadata: {
      ...source.metadata,
      notes: 'NaN; +Infinity; =SUM(A1)',
      startup: { ...source.metadata.startup, 'a/b~c': NaN },
    },
  };
  const parsed = JSON.parse(serializeExperimentJson(record));
  expect(parsed.specialNumbers[0].path).toBe('/metadata/startup/a~1b~0c');
  expect(parsed.experiment.metadata.notes).toBe('NaN; +Infinity; =SUM(A1)');
});
it.each([
  new Float32Array([1]),
  [1, 2],
  ['terrain-data'],
  [],
  [{ cellIndex: 0, x: 1 }],
  new Date(),
  undefined,
])('rejects unsupported attached payloads rather than dropping them (%s)', (extra) => {
  const record = { ...experimentFixture(), extra };
  expect(() => serializeExperimentJson(record)).toThrow(TypeError);
  expect(() => serializeExperimentCsv(record)).toThrow(TypeError);
});
it('rejects cycles and does not call custom toJSON functions', () => {
  const source = { ...experimentFixture() } as ExperimentResult & { extra?: unknown };
  source.extra = source;
  expect(() => serializeExperimentJson(source)).toThrow(/Circular/);
  let called = false;
  source.extra = {
    toJSON() {
      called = true;
      return {};
    },
  };
  expect(() => serializeExperimentJson(source)).toThrow(/Unsupported/);
  expect(called).toBe(false);
});
it('uses the exact stable CSV header and an independently specified complete warmup row', () => {
  const text = serializeExperimentCsv(experimentFixture());
  const expectedHeader =
    'schemaVersion,experimentId,pairId,trialId,phase,pairIndex,position,mode,status,computeMs,requestMs,coreBuildId,workload,algorithmVersion,resultVersion,simulationVersion,executionProfile,width,height,treeCount,rockCount,errorKind,errorMessage,pairVerificationStatus,exclusionReasons';
  expect(text.split('\r\n')[0]).toBe(expectedHeader);
  expect(text.split('\r\n')[1]).toBe(
    'architecture-race-v1,fixture,warmup,warmup:local,warmup,,0,local,success,10000,10100,git:fixture,landscape-ecology-hydraulic-v9,diverse-landscape-v8,landscape-ecology-v9,hydraulic-grid-v1,landscape-worker-json-v9,3,2,0,0,,,compared,[]',
  );
  const rows = readCsv(text);
  expect(rows).toHaveLength(11);
  expect(rows.every((row) => row.length === 25)).toBe(true);
  expect(text.endsWith('\r\n')).toBe(true);
});
function failedRecord(message: string): Extract<ExperimentResult, { status: 'failed' }> {
  const source = experimentFixture(),
    t = source.trials[0];
  const trial: ExperimentTrial = {
    ...t,
    status: 'error',
    computeMs: null,
    requestMs: 0,
    identity: null,
    diagnostics: null,
    failure: { kind: 'availability', message, fields: { $number: 'NaN', width: 'Поза межами' } },
  };
  const assessment = {
    status: 'excluded' as const,
    reasons: [{ code: 'trial-failed' as const, detail: message }] as const,
  };
  return {
    ...source,
    status: 'failed',
    complete: false,
    failure: trial.failure,
    assessment,
    trials: [trial],
    verifications: [
      {
        phase: 'warmup',
        pairIndex: null,
        pairId: t.pairId,
        status: 'unavailable',
        localTrialId: t.trialId,
        remoteTrialId: null,
        assessment,
      },
    ],
  };
}
it('exports partial failure records with null versus zero, original fields and valid references', () => {
  const record = failedRecord('Offline, "retry"\r\nСпроба');
  const rows = readCsv(serializeExperimentCsv(record));
  expect(rows).toHaveLength(2);
  const row = Object.fromEntries(rows[0].map((key, i) => [key, rows[1][i]]));
  expect(row['computeMs']).toBe('');
  expect(row['requestMs']).toBe('0');
  expect(row['errorMessage']).toBe('Offline, "retry"\r\nСпроба');
  expect(row['pairVerificationStatus']).toBe('unavailable');
  expect(row['trialId']).toBe(record.trials[0].trialId);
  expect(row['pairId']).toBe(record.verifications[0].pairId);
  expect(JSON.parse(row['exclusionReasons'])).toEqual(record.assessment.reasons); // Deduplicated pair/experiment reason.
  expect(JSON.parse(serializeExperimentJson(record)).experiment).toEqual(record);
});
it.each([
  '=SUM(A1)',
  '+cmd',
  '-text',
  '@call',
  '  =1',
  '\tunsafe',
  '\runsafe',
  '\nunsafe',
  '\u0000 =1',
  '\uFEFF@cmd',
  '\u2003=1',
  '\u00A0+cmd',
])('mitigates formula-like text %s while JSON retains original text', (message) => {
  const record = failedRecord(message);
  const rows = readCsv(serializeExperimentCsv(record));
  expect(rows[1][CSV_COLUMNS.indexOf('errorMessage')]).toBe("'" + message);
  expect(JSON.parse(serializeExperimentJson(record)).experiment.trials[0].failure.message).toBe(
    message,
  );
});
it('preserves numeric precision, negative readings and explicit invalid tokens', () => {
  const source = experimentFixture();
  const record = {
    ...source,
    trials: source.trials.map((t, i) =>
      i === 0
        ? { ...t, computeMs: -1.23456789012345, requestMs: -0 }
        : i === 1
          ? { ...t, computeMs: NaN, requestMs: Infinity }
          : t,
    ),
  };
  const rows = readCsv(serializeExperimentCsv(record));
  expect(rows[1][9]).toBe('-1.23456789012345');
  expect(rows[1][10]).toBe('-0');
  expect(rows[2][9]).toBe('NaN');
  expect(rows[2][10]).toBe('+Infinity');
});
it('exports a stopped empty experiment without inventing rows', () => {
  const source = failedRecord('Stopped');
  const record: ExperimentResult = {
    ...source,
    status: 'stopped',
    complete: false,
    trials: [],
    verifications: [],
  };
  expect(readCsv(serializeExperimentCsv(record))).toHaveLength(1);
  expect(JSON.parse(serializeExperimentJson(record)).experiment.status).toBe('stopped');
});
