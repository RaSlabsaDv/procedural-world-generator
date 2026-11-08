import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { OperationLock } from '../platform/operation-lock.service';
import { RuntimeInfo, WasmHostService } from '../platform/wasm-host.service';
import { decodeTerrain } from '../terrain/data/terrain.contract';
import { TerrainError, TerrainRequest, TerrainRun } from '../terrain/data/terrain.models';
import { TerrainService } from '../terrain/data/terrain.service';
import { testTerrain, testWire } from '../terrain/testing/terrain-test-fixture';
import { createExperimentConfiguration } from './data/experiment-configuration';
import { ExperimentResult } from './data/experiment.models';
import { ExperimentRunner } from './experiment-runner.service';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
function run(terrain = testTerrain()): TerrainRun {
  return {
    terrain,
    request: terrain.heightMap,
    response: decodeTerrain(testWire(terrain), terrain.heightMap, terrain),
    requestMs: 4,
    initMs: 123,
  };
}
function codes(result: ExperimentResult) {
  return result.assessment.reasons.map((r) => r.code);
}

let runner: ExperimentRunner;
let lock: OperationLock;
let info: RuntimeInfo;
let local: ReturnType<typeof vi.fn<(request: TerrainRequest) => Promise<TerrainRun>>>;
let remote: typeof local;
let initialize: ReturnType<typeof vi.fn>;
const config = (count = 2) => createExperimentConfiguration(testTerrain(), count);

beforeEach(() => {
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
  info = {
    initCount: 1,
    initMs: 123,
    runtimeMs: 100,
    execution: 'worker',
    protocol: 'worker-rpc-v1',
  };
  initialize = vi.fn(async () => ({}));
  local = vi.fn(async (request: TerrainRequest) => run(request));
  remote = vi.fn(async (request: TerrainRequest) => run(request));
  TestBed.configureTestingModule({
    providers: [
      { provide: TerrainService, useValue: { local, remote } },
      {
        provide: WasmHostService,
        useValue: { getRuntime: initialize, getInfo: () => ({ ...info }) },
      },
    ],
  });
  runner = TestBed.inject(ExperimentRunner);
  lock = TestBed.inject(OperationLock);
});
afterEach(() => {
  runner.dispose();
  vi.restoreAllMocks();
});

it('records the warmup separately and alternates exact measured order with unique references', async () => {
  const order: string[] = [];
  local.mockImplementation(async (request) => {
    order.push('local');
    return run(request);
  });
  remote.mockImplementation(async (request) => {
    order.push('remote');
    return run(request);
  });
  const result = await runner.start(config(3));
  expect(order).toEqual([
    'local',
    'remote',
    'local',
    'remote',
    'remote',
    'local',
    'local',
    'remote',
  ]);
  expect(result.status).toBe('completed');
  expect(result.complete).toBe(true);
  expect(result.assessment.status).toBe('eligible');
  expect(result.trials.map((t) => [t.phase, t.pairIndex, t.position])).toEqual([
    ['warmup', null, 0],
    ['warmup', null, 1],
    ['measured', 0, 0],
    ['measured', 0, 1],
    ['measured', 1, 0],
    ['measured', 1, 1],
    ['measured', 2, 0],
    ['measured', 2, 1],
  ]);
  expect(new Set(result.trials.map((t) => t.trialId)).size).toBe(8);
  expect(result.verifications).toHaveLength(4);
  for (const pair of result.verifications) {
    expect(pair.status).toBe('compared');
    for (const mode of ['local', 'remote'] as const)
      expect(result.trials.find((t) => t.trialId === pair[`${mode}TrialId`])).toMatchObject({
        mode,
        pairId: pair.pairId,
      });
  }
  expect(runner.result()).toBe(result);
  expect(runner.progress()).toEqual({ stage: 'finished', completedTrials: 8 });
  expect(initialize).toHaveBeenCalledTimes(1);
});

it('waits for preparation and every call; holds one lock through comparison', async () => {
  const ready = deferred<object>();
  initialize.mockReturnValue(ready.promise);
  const pending = deferred<TerrainRun>();
  local.mockReturnValueOnce(pending.promise);
  const value = run();
  const values = value.response.result.values;
  const compareRead = vi.fn(() => {
    expect(lock.busy()).toBe(true);
    expect(lock.tryAcquire()).toBeNull();
    return values;
  });
  Object.defineProperty(value.response.result, 'values', { get: compareRead });
  const promise = runner.start(config(1));
  expect(lock.busy()).toBe(true);
  expect(local).not.toHaveBeenCalled();
  ready.resolve({});
  await vi.waitFor(() => expect(local).toHaveBeenCalledTimes(1));
  expect(remote).not.toHaveBeenCalled();
  expect(compareRead).not.toHaveBeenCalled();
  expect(runner.takePreviewPair()).toBeNull();
  pending.resolve(value);
  await promise;
  expect(compareRead).toHaveBeenCalled();
  expect(lock.busy()).toBe(false);
});

it('captures caller-owned parameters before awaiting preparation and preserves adapter timings', async () => {
  const source = { ...testTerrain(), heightMap: { ...testTerrain().heightMap } };
  const input = { ...config(), terrain: source };
  const ready = deferred<object>();
  initialize.mockReturnValue(ready.promise);
  const promise = runner.start(input);
  source.iterations = 0;
  source.heightMap.seed = 99;
  input.measuredPairs = 30;
  ready.resolve({});
  const result = await promise;
  const requests = [...local.mock.calls, ...remote.mock.calls].map((call) => call[0]);
  expect(requests).toHaveLength(6);
  for (const request of requests) {
    expect(request).toBe(result.configuration.terrain);
    expect(request).toEqual(testTerrain());
    expect(Object.isFrozen(request.heightMap)).toBe(true);
  }
  expect(result.trials.every((t) => t.computeMs === 1 && t.requestMs === 4)).toBe(true);
});

it('rejects overlapping starts and unrelated held operations without disturbing the active series', async () => {
  const ready = deferred<object>();
  initialize.mockReturnValueOnce(ready.promise);
  const first = runner.start(config(1));
  await expect(runner.start(config())).rejects.toThrow('already running');
  expect(initialize).toHaveBeenCalledTimes(1);
  ready.resolve({});
  await first;
  const release = lock.tryAcquire()!;
  await expect(runner.start(config())).rejects.toThrow('Another operation');
  expect(lock.busy()).toBe(true);
  release();
});

it('rejects unsupported configuration policies without acquiring the lock', async () => {
  await expect(runner.start({ ...config(), order: 'concurrent' } as never)).rejects.toThrow(
    'policy',
  );
  expect(lock.busy()).toBe(false);
  expect(initialize).not.toHaveBeenCalled();
});

it('records existing startup and honest unknown environment metadata', async () => {
  const result = await runner.start(config(1), {
    server: 'loopback; hardware unknown',
    notes: 'pilot',
  });
  expect(result.metadata.startup).toEqual({
    origin: 'before-experiment',
    initMs: 123,
    runtimeMs: 100,
    initCount: 1,
    execution: 'worker',
    protocol: 'worker-rpc-v1',
    runtimeVersion: null,
  });
  expect(result.metadata.cacheState).toBeNull();
  expect(result.metadata.network).toBeNull();
  expect(result.metadata.applicationRevision).toBeNull();
  expect(result.metadata.server).toBe('loopback; hardware unknown');
  expect(result.metadata.coreBuildIds).toEqual({
    local: 'git:123456789abc',
    remote: 'git:123456789abc',
  });
  expect(Number.isNaN(Date.parse(result.metadata.startedAt))).toBe(false);
  expect(Number.isNaN(Date.parse(result.metadata.endedAt!))).toBe(false);
});

it('records initialization observed during preparation without making a cold-cache claim', async () => {
  info = { ...info, initCount: 0, initMs: null, runtimeMs: null };
  initialize.mockImplementation(async () => {
    info = { ...info, initCount: 1, initMs: 91, runtimeMs: 70 };
    return {};
  });
  const result = await runner.start(config(1));
  expect(result.metadata.startup.origin).toBe('experiment-preparation');
  expect(result.metadata.startup.initMs).toBe(91);
  expect(result.metadata.cacheState).toBeNull();
});

it('keeps unknown startup information unknown', async () => {
  info = { ...info, initCount: 0, initMs: null, runtimeMs: null };
  const result = await runner.start(config(1));
  expect(result.metadata.startup.origin).toBe('unknown');
  expect(result.metadata.startup.initMs).toBeNull();
});

it('returns a failed record after preparation failure, without fabricated trials', async () => {
  initialize.mockRejectedValueOnce(new Error('Worker unavailable'));
  const result = await runner.start(config());
  expect(result).toMatchObject({
    status: 'failed',
    complete: false,
    failure: { kind: 'preparation', message: 'Worker unavailable' },
  });
  expect(result.trials).toEqual([]);
  expect(result.verifications).toEqual([]);
  expect(result.metadata.coreBuildIds).toEqual({ local: null, remote: null });
  expect(lock.busy()).toBe(false);
  expect(local).not.toHaveBeenCalled();
});

it.each(['local', 'remote'] as const)(
  'attempts both warmups after %s fails, then skips measured trials',
  async (mode) => {
    (mode === 'local' ? local : remote).mockRejectedValueOnce(
      new TerrainError('validation', 'Bad input', { iterations: 'Too high' }),
    );
    const result = await runner.start(config());
    expect(local).toHaveBeenCalledTimes(1);
    expect(remote).toHaveBeenCalledTimes(1);
    expect(result.status).toBe('failed');
    expect(codes(result)).toContain('warmup-failed');
    const trial = result.trials.find((t) => t.status === 'error')!;
    expect(trial).toMatchObject({
      computeMs: null,
      requestMs: null,
      identity: null,
      diagnostics: null,
      failure: { kind: 'validation', fields: { iterations: 'Too high' } },
    });
    expect(result.verifications[0].status).toBe('unavailable');
  },
);

it.each(['local', 'remote'] as const)(
  'continues the counterpart and later pairs after a measured %s failure',
  async (mode) => {
    const adapter = mode === 'local' ? local : remote;
    adapter
      .mockResolvedValueOnce(run())
      .mockRejectedValueOnce(new TerrainError('availability', 'Offline'));
    const result = await runner.start(config());
    expect(local).toHaveBeenCalledTimes(3);
    expect(remote).toHaveBeenCalledTimes(3);
    expect(result.status).toBe('completed');
    expect(codes(result)).toContain('trial-failed');
    expect(result.verifications[1].status).toBe('unavailable');
    expect(result.verifications[2].status).toBe('compared');
  },
);

it.each(['numeric', 'category'] as const)(
  'records complete comparison metrics and stops on %s disagreement',
  async (kind) => {
    const changed = run();
    if (kind === 'numeric') changed.response.result.values[0] += 1;
    else changed.response.result.biomes[0] = 1;
    remote.mockResolvedValueOnce(run()).mockResolvedValueOnce(changed);
    const result = await runner.start(config(3));
    expect(result.status).toBe('failed');
    expect(result.trials).toHaveLength(4);
    expect(codes(result)).toContain('correctness-mismatch');
    expect(result.verifications[1]).toMatchObject({
      status: 'compared',
      comparison:
        kind === 'numeric'
          ? { numericMatch: false, mismatchCount: 1 }
          : { biomesMatch: false, biomeMismatchCount: 1 },
    });
  },
);

it('marks a fully attempted final mismatching pair completed but excluded', async () => {
  const changed = run();
  changed.response.result.values[0] = 1;
  remote.mockResolvedValueOnce(run()).mockResolvedValueOnce(changed);
  const result = await runner.start(config(1));
  expect(result.status).toBe('completed');
  expect(codes(result)).toContain('correctness-mismatch');
});

it('records comparison exceptions without inventing metrics and stops subsequent pairs', async () => {
  const invalid = run();
  const value = {
    ...invalid,
    response: {
      ...invalid.response,
      result: {
        ...invalid.response.result,
        moisture: new Float32Array(0),
      },
    },
  };
  local.mockResolvedValue(value);
  const result = await runner.start(config());
  expect(result.status).toBe('failed');
  expect(codes(result)).toContain('comparison-unavailable');
  expect(result.verifications[0].status).toBe('unavailable');
  expect(result.verifications[0]).not.toHaveProperty('comparison');
  expect(lock.busy()).toBe(false);
});

it('invalidates cross-mode build mismatch while retaining the actual IDs and comparison', async () => {
  const changed = run();
  remote.mockResolvedValue({
    ...changed,
    response: { ...changed.response, coreBuildId: 'other-build' },
  });
  const result = await runner.start(config());
  expect(result.status).toBe('failed');
  expect(result.trials).toHaveLength(2);
  expect(result.metadata.coreBuildIds.remote).toBe('other-build');
  expect(result.verifications[0]).toMatchObject({
    comparison: { identity: 'different', numericMatch: true },
  });
  expect(codes(result)).toContain('build-mismatch');
});

it.each(['unversioned', 'git:123-dirty', '', '   '])(
  'allows diagnostics but excludes matching unverifiable build %s',
  async (coreBuildId) => {
    const changed = run();
    const value = { ...changed, response: { ...changed.response, coreBuildId } };
    local.mockResolvedValue(value);
    remote.mockResolvedValue(value);
    const result = await runner.start(config());
    expect(result.status).toBe('completed');
    expect(result.trials).toHaveLength(6);
    expect(codes(result)).toContain('build-unverifiable');
  },
);

it('detects a within-mode build change even when both new builds match', async () => {
  const changed = run();
  const value = { ...changed, response: { ...changed.response, coreBuildId: 'new-build' } };
  local.mockResolvedValueOnce(run()).mockResolvedValue(value);
  remote.mockResolvedValueOnce(run()).mockResolvedValue(value);
  const result = await runner.start(config(3));
  expect(result.trials).toHaveLength(4);
  expect(codes(result)).toContain('identity-changed');
  expect(result.metadata.coreBuildIds.local).toBe('git:123456789abc');
  expect(result.trials[2]).toMatchObject({ identity: { coreBuildId: 'new-build' } });
});

it('detects changed workload or request identity independently of pair equality', async () => {
  const changed = run();
  const value = {
    ...changed,
    response: { ...changed.response, workload: 'different-workload' },
  } as unknown as TerrainRun;
  local.mockResolvedValueOnce(run()).mockResolvedValue(value);
  remote.mockResolvedValueOnce(run()).mockResolvedValue(value);
  const result = await runner.start(config(3));
  expect(result.status).toBe('failed');
  expect(codes(result)).toContain('identity-changed');
  expect(result.trials).toHaveLength(4);
});

it.each([
  [5, 4],
  [-1, 4],
  [1, -2],
  [Infinity, 4],
  [1, NaN],
])(
  'preserves raw inconsistent compute/request timings %s/%s and excludes them',
  async (computeMs, requestMs) => {
    const changed = run();
    local
      .mockResolvedValueOnce(run())
      .mockResolvedValue({ ...changed, requestMs, response: { ...changed.response, computeMs } });
    const result = await runner.start(config(1));
    expect(result.status).toBe('completed');
    expect(codes(result)).toContain('timing-inconsistent');
    expect(result.trials[2].computeMs).toBe(computeMs);
    expect(result.trials[2].requestMs).toBe(requestMs);
  },
);

it('stops during preparation only after it settles, retaining the lock', async () => {
  const ready = deferred<object>();
  initialize.mockReturnValueOnce(ready.promise);
  const promise = runner.start(config());
  runner.stop();
  expect(lock.busy()).toBe(true);
  ready.resolve({});
  const result = await promise;
  expect(result.status).toBe('stopped');
  expect(result.trials).toEqual([]);
  expect(lock.busy()).toBe(false);
});

it('finishes an active call on stop and records a half-pair without a fabricated counterpart', async () => {
  const pending = deferred<TerrainRun>();
  local.mockReturnValueOnce(pending.promise);
  const promise = runner.start(config());
  await vi.waitFor(() => expect(local).toHaveBeenCalledTimes(1));
  runner.stop();
  expect(lock.busy()).toBe(true);
  expect(runner.result()).toBeNull();
  pending.resolve(run());
  const result = await promise;
  expect(result.status).toBe('stopped');
  expect(result.complete).toBe(false);
  expect(result.trials).toHaveLength(1);
  expect(remote).not.toHaveBeenCalled();
  expect(result.verifications[0]).toMatchObject({
    status: 'unavailable',
    remoteTrialId: null,
    localTrialId: result.trials[0].trialId,
  });
  expect(lock.busy()).toBe(false);
});

it('verifies a completed active pair before honoring stop between pairs', async () => {
  remote.mockImplementationOnce(async (request) => {
    runner.stop();
    return run(request);
  });
  const result = await runner.start(config());
  expect(result.status).toBe('stopped');
  expect(result.trials).toHaveLength(2);
  expect(result.verifications[0].status).toBe('compared');
});

it('records an already hidden document and excludes observed interruptions', async () => {
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
  const result = await runner.start(config(1));
  expect(result.metadata.interruptions[0].kind).toBe('tab-hidden');
  expect(codes(result)).toContain('interrupted');
});

it('records visibility changes and removes listeners when finished', async () => {
  local.mockImplementationOnce(async (request) => {
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    document.dispatchEvent(new Event('visibilitychange'));
    return run(request);
  });
  const remove = vi.spyOn(document, 'removeEventListener');
  const windowRemove = vi.spyOn(window, 'removeEventListener');
  const result = await runner.start(config(1));
  expect(result.metadata.interruptions).toHaveLength(1);
  expect(remove).toHaveBeenCalledWith('visibilitychange', expect.any(Function));
  expect(windowRemove).toHaveBeenCalledWith('pagehide', expect.any(Function));
  document.dispatchEvent(new Event('visibilitychange'));
  window.dispatchEvent(new Event('pagehide'));
  expect(result.metadata.interruptions).toHaveLength(1);
});

it('records navigation and cooperatively stops without releasing an active call early', async () => {
  const pending = deferred<TerrainRun>();
  local.mockReturnValueOnce(pending.promise);
  const promise = runner.start(config());
  await vi.waitFor(() => expect(local).toHaveBeenCalled());
  window.dispatchEvent(new Event('pagehide'));
  expect(lock.busy()).toBe(true);
  pending.resolve(run());
  const result = await promise;
  expect(result.status).toBe('stopped');
  expect(result.metadata.interruptions[0].kind).toBe('navigation');
});

it('records observable runtime reset and terminates collection safely', async () => {
  local.mockImplementationOnce(async (request) => {
    info.initCount++;
    return run(request);
  });
  const result = await runner.start(config());
  expect(result.status).toBe('failed');
  expect(result.metadata.interruptions[0].kind).toBe('runtime-reset');
  expect(remote).not.toHaveBeenCalled();
  expect(lock.busy()).toBe(false);
});

it('retains only a final suitable pair, transfers it once, and keeps final records array-free', async () => {
  let finalLocal: TerrainRun | null = null;
  let finalRemote: TerrainRun | null = null;
  local.mockImplementation(async (request) => {
    finalLocal = run(request);
    return finalLocal;
  });
  remote.mockImplementation(async (request) => {
    finalRemote = run(request);
    return finalRemote;
  });
  const result = await runner.start(config());
  const pair = runner.takePreviewPair();
  expect(pair?.local).toBe(finalLocal);
  expect(pair?.remote).toBe(finalRemote);
  expect(runner.takePreviewPair()).toBeNull();
  const visit = (value: unknown) => {
    expect(ArrayBuffer.isView(value)).toBe(false);
    if (value && typeof value === 'object') {
      expect(value).not.toHaveProperty('response');
      expect(Object.hasOwn(value, 'values')).toBe(false);
      for (const child of Object.values(value)) visit(child);
    }
  };
  visit(result);
});

it('clears retained maps on a new start even when preparation then fails', async () => {
  await runner.start(config(1));
  initialize.mockRejectedValueOnce(new Error('No runtime'));
  await runner.start(config(1));
  expect(runner.takePreviewPair()).toBeNull();
});

it('disposes listeners and maps while waiting for an active call to settle', async () => {
  const pending = deferred<TerrainRun>();
  local.mockReturnValueOnce(pending.promise);
  const promise = runner.start(config());
  await vi.waitFor(() => expect(local).toHaveBeenCalled());
  const remove = vi.spyOn(document, 'removeEventListener');
  runner.dispose();
  expect(remove).toHaveBeenCalledWith('visibilitychange', expect.any(Function));
  expect(lock.busy()).toBe(true);
  pending.resolve(run());
  expect((await promise).status).toBe('stopped');
  expect(lock.busy()).toBe(false);
  expect(runner.takePreviewPair()).toBeNull();
  await expect(runner.start(config())).rejects.toThrow('disposed');
});

it('keeps queued update work blocked until the actual active call finishes', async () => {
  const pending = deferred<TerrainRun>();
  local.mockReturnValueOnce(pending.promise);
  const promise = runner.start(config());
  await vi.waitFor(() => expect(local).toHaveBeenCalled());
  let reloading = false;
  const update = lock.acquire().then((release) => {
    reloading = true;
    return release;
  });
  runner.stop();
  await Promise.resolve();
  expect(reloading).toBe(false);
  pending.resolve(run());
  await promise;
  const releaseUpdate = await update;
  expect(reloading).toBe(true);
  expect(lock.busy()).toBe(true);
  releaseUpdate();
  expect(lock.busy()).toBe(false);
});

it('detects mismatched captured request identity even if both adapters return the same other request', async () => {
  const other = testTerrain({ ...testTerrain().heightMap, seed: 999 });
  local.mockResolvedValue(run(other));
  remote.mockResolvedValue(run(other));
  const result = await runner.start(config());
  expect(result.status).toBe('failed');
  expect(codes(result)).toContain('identity-changed');
  expect(result.trials).toHaveLength(2);
});

it('gives execution failure precedence over a simultaneous stop request', async () => {
  local.mockImplementationOnce(async (request) => {
    info.initCount++;
    runner.stop();
    return run(request);
  });
  const result = await runner.start(config());
  expect(result.status).toBe('failed');
  expect(codes(result)).toContain('interrupted');
});
