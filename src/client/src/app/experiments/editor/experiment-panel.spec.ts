import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { ExperimentPanel } from './experiment-panel';
import { ExperimentRunner } from '../experiment-runner.service';
import { createExperimentConfiguration } from '../data/experiment-configuration';
import { TerrainError, TerrainRequest } from '../../terrain/data/terrain.models';
import { TerrainService } from '../../terrain/data/terrain.service';
import { WasmHostService } from '../../platform/wasm-host.service';
import { testTerrain, testWire } from '../../terrain/testing/terrain-test-fixture';
import { decodeTerrain } from '../../terrain/data/terrain.contract';

const makeRun = async (terrain: TerrainRequest) => ({
  terrain,
  request: terrain.heightMap,
  response: { ...decodeTerrain(testWire(terrain), terrain.heightMap, terrain), computeMs: 0 },
  requestMs: 0,
  initMs: null,
});
let local: ReturnType<typeof vi.fn<typeof makeRun>>;
let fixture: ReturnType<typeof TestBed.createComponent<ExperimentPanel>>;
let el: HTMLElement;

beforeEach(async () => {
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
  local = vi.fn(makeRun);
  TestBed.configureTestingModule({
    imports: [ExperimentPanel],
    providers: [
      { provide: TerrainService, useValue: { local, remote: vi.fn(makeRun) } },
      {
        provide: WasmHostService,
        useValue: {
          getRuntime: async () => ({}),
          getInfo: () => ({
            initCount: 1,
            initMs: 10,
            runtimeMs: 8,
            execution: 'worker',
            protocol: 'worker-rpc-v1',
          }),
        },
      },
    ],
  });
  fixture = TestBed.createComponent(ExperimentPanel);
  fixture.componentRef.setInput('progress', { stage: 'idle', completedTrials: 0 });
  el = fixture.nativeElement;
  await fixture.whenStable();
});
afterEach(() => vi.restoreAllMocks());
const button = (id: string) => el.querySelector<HTMLButtonElement>('#' + id)!;

it('starts with the documented default and emits only the requested pair count', () => {
  const start = vi.fn();
  fixture.componentInstance.start.subscribe(start);
  button('race-start').click();
  expect(start).toHaveBeenCalledExactlyOnceWith(10);
  expect(button('race-stop').disabled).toBe(true);
});

it.each(['', '0', '31', '1.5'])('rejects invalid count %s without starting', async (value) => {
  const start = vi.fn();
  fixture.componentInstance.start.subscribe(start);
  const input = el.querySelector<HTMLInputElement>('#race-pairs')!;
  input.value = value;
  input.dispatchEvent(new Event('input'));
  button('race-start').click();
  await fixture.whenStable();
  expect(start).not.toHaveBeenCalled();
  expect(input.getAttribute('aria-invalid')).toBe('true');
  expect(el.querySelector('#race-count-error')!.textContent).toContain('whole number');
});

it('distinguishes another operation from its own active collection', async () => {
  fixture.componentRef.setInput('busy', true);
  await fixture.whenStable();
  expect(button('race-start').disabled).toBe(true);
  expect(button('race-stop').disabled).toBe(true);
  expect(el.textContent).toContain('Another operation');
  fixture.componentRef.setInput('active', true);
  await fixture.whenStable();
  expect(button('race-stop').disabled).toBe(false);
});

it('shows preparation, warmup and measured progress, with separate settled counts', async () => {
  fixture.componentRef.setInput('active', true);
  fixture.componentRef.setInput('progress', { stage: 'preparing', completedTrials: 0 });
  await fixture.whenStable();
  expect(el.querySelector('#race-status')!.textContent).toContain('Preparing');
  fixture.componentRef.setInput('progress', {
    stage: 'running',
    phase: 'warmup',
    pairIndex: null,
    mode: 'remote',
    position: 1,
    completedTrials: 1,
  });
  await fixture.whenStable();
  expect(el.querySelector('#race-status')!.textContent).toContain('Warmup · Remote · position 2');
  fixture.componentRef.setInput('plannedPairs', 2);
  fixture.componentRef.setInput('progress', {
    stage: 'running',
    phase: 'measured',
    pairIndex: 1,
    mode: 'remote',
    position: 0,
    completedTrials: 4,
  });
  await fixture.whenStable();
  expect(el.querySelector('#race-status')!.textContent).toContain('Measured pair 2 of 2');
  expect(el.querySelector('#race-counts')!.textContent).toMatch(
    /2 \/ 2 warmups;\s*2 \/ 4 measured/,
  );
});

it('shows the stop request and disables repeated Stop while the operation settles', async () => {
  const stop = vi.fn();
  fixture.componentInstance.stop.subscribe(stop);
  fixture.componentRef.setInput('active', true);
  await fixture.whenStable();
  button('race-stop').click();
  expect(stop).toHaveBeenCalledTimes(1);
  fixture.componentRef.setInput('stopping', true);
  await fixture.whenStable();
  button('race-stop').click();
  expect(stop).toHaveBeenCalledTimes(1);
  expect(el.querySelector('#race-status')!.textContent).toContain('Finishing the active operation');
});

it('renders raw zero durations, complete comparison metrics and separate build compatibility', async () => {
  const result = await TestBed.inject(ExperimentRunner).start(
    createExperimentConfiguration(testTerrain(), 1),
  );
  fixture.componentRef.setInput('result', result);
  await fixture.whenStable();
  expect(el.querySelector('#race-outcome')!.textContent).toContain('Eligible paired measurements');
  expect(el.querySelectorAll('#race-trials tbody tr')).toHaveLength(4);
  expect(el.querySelector('#race-trials tbody')!.textContent).toContain('0 ms');
  expect(el.querySelector('#race-verification')!.textContent).toContain(
    'Build compatibility: compatible',
  );
  expect(el.querySelector('#race-verification')!.textContent).toContain('Numeric agreement: yes');
  expect(el.querySelector('#race-snapshot')!.textContent).toContain('git:123456789abc');
});

it('keeps completed collection separate from exclusion and dirty build diagnostics', async () => {
  local.mockImplementation(async (terrain) => {
    const value = await makeRun(terrain);
    return {
      ...value,
      response: { ...value.response, coreBuildId: 'unversioned' },
    };
  });
  // A cross-build mismatch in the final measured pair yields completed/excluded.
  local.mockImplementationOnce(makeRun);
  const result = await TestBed.inject(ExperimentRunner).start(
    createExperimentConfiguration(testTerrain(), 1),
  );
  fixture.componentRef.setInput('result', result);
  await fixture.whenStable();
  expect(el.querySelector('#race-outcome')!.getAttribute('data-status')).toBe('completed');
  expect(el.querySelector('#race-outcome')!.textContent).toContain(
    'Excluded from verified performance',
  );
  expect(el.querySelector('#race-exclusions')!.textContent).toContain('build-mismatch');
  expect(el.querySelector('#race-build-mismatch')!.textContent).toContain('Restart the API');
});

it('shows structured failure fields and unavailable durations without replacing them with zero', async () => {
  local.mockRejectedValueOnce(
    new TerrainError('validation', 'Bad width', { 'heightMap.width': 'Too small' }),
  );
  const result = await TestBed.inject(ExperimentRunner).start(
    createExperimentConfiguration(testTerrain(), 1),
  );
  fixture.componentRef.setInput('result', result);
  await fixture.whenStable();
  expect(el.querySelector('#race-outcome')!.textContent).toContain('failed');
  expect(el.querySelector('#race-failures')!.textContent).toContain('Too small');
  expect(el.querySelector('#race-trials tbody tr')!.textContent).toContain('Unavailable');
});

it('shows stopped/incomplete records and retains their unavailable verification reasons', async () => {
  const runner = TestBed.inject(ExperimentRunner);
  local.mockImplementationOnce(async (request) => {
    runner.stop();
    return makeRun(request);
  });
  const result = await runner.start(createExperimentConfiguration(testTerrain(), 1));
  fixture.componentRef.setInput('result', result);
  await fixture.whenStable();
  expect(el.querySelector('#race-outcome')!.textContent).toContain('Incomplete series');
  expect(el.querySelector('#race-outcome')!.getAttribute('data-status')).toBe('stopped');
  expect(el.querySelectorAll('#race-trials tbody tr')).toHaveLength(1);
  expect(el.querySelector('#race-verification')!.textContent).toContain('Comparison unavailable');
});

it('shows separate post-run diagnostic and verified summaries, never while active', async () => {
  const record = await TestBed.inject(ExperimentRunner).start(
    createExperimentConfiguration(testTerrain(), 1),
  );
  fixture.componentRef.setInput('result', record);
  await fixture.whenStable();
  expect(el.querySelectorAll('#race-diagnostic-summary [data-summary-mode]')).toHaveLength(2);
  expect(el.querySelectorAll('#race-verified-summary [data-summary-mode]')).toHaveLength(2);
  expect(
    el
      .querySelector('#race-diagnostic-summary [data-summary-metric=computeMs]')!
      .getAttribute('data-included'),
  ).toBe('1');
  expect(el.querySelector('#race-verified-summary .summary-median')!.textContent).toBe('0 ms');
  fixture.componentRef.setInput('active', true);
  await fixture.whenStable();
  expect(el.querySelector('#race-diagnostic-summary')).toBeNull();
  expect(button('race-download-json').disabled).toBe(true);
  expect(button('race-download-csv').disabled).toBe(true);
});

it('shows unavailable verified statistics for failed collection and retains data after download failure', async () => {
  local.mockRejectedValueOnce(new TerrainError('availability', 'Offline'));
  const record = await TestBed.inject(ExperimentRunner).start(
    createExperimentConfiguration(testTerrain(), 1),
  );
  fixture.componentRef.setInput('result', record);
  await fixture.whenStable();
  expect(el.querySelector('#race-verified-summary .verified-unavailable')!.textContent).toContain(
    'Unavailable',
  );
  expect(el.querySelector('#race-diagnostic-summary .no-samples')!.textContent).toContain(
    'No usable samples',
  );
  const create = vi.fn(() => {
    throw new Error('Blob downloads unavailable');
  });
  vi.stubGlobal('URL', { createObjectURL: create });
  try {
    button('race-download-json').click();
    await fixture.whenStable();
    expect(el.querySelector('#race-export-error')!.textContent).toContain(
      'Blob downloads unavailable',
    );
    expect(el.querySelector('#race-export-error')!.textContent).toContain('experiment is retained');
    expect(fixture.componentInstance.result()).toBe(record);
  } finally {
    vi.unstubAllGlobals();
  }
});
