import { provideHttpClient } from '@angular/common/http';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { PwaStatusPanel } from './platform/pwa-status-panel';
import { WasmHostService } from './platform/wasm-host.service';
import { ExperimentRunner } from './experiments/experiment-runner.service';
import { OperationLock } from './platform/operation-lock.service';
import { TerrainResultsPanel } from './terrain/editor/terrain-results-panel';
import { vi } from 'vitest';
import { App } from './app';
import { TerrainService } from './terrain/data/terrain.service';
import { TerrainError, TerrainRun } from './terrain/data/terrain.models';
import {
  OfflinePreparationState,
  OfflineReadinessService,
} from './platform/offline-readiness.service';
import { testWire } from './terrain/testing/terrain-test-fixture';
import { TerrainRequest } from './terrain/data/terrain.models';
import { decodeTerrain } from './terrain/data/terrain.contract';
import { TerrainPreview } from './terrain/rendering/terrain-preview';
import { Component, input } from '@angular/core';

@Component({ selector: 'app-terrain-preview', template: '<canvas></canvas>' })
class PreviewStub {
  readonly run = input.required<TerrainRun>();
  readonly paused = input(false);
}

function result(terrain: TerrainRequest): TerrainRun {
  const request = terrain.heightMap;
  return {
    request,
    terrain,
    response: decodeTerrain(testWire(terrain), request, terrain),
    requestMs: 2,
    initMs: null,
  };
}

describe('App terrain workflow', () => {
  const local = vi.fn(async (terrain: TerrainRequest) => result(terrain));
  const remote = vi.fn(async (terrain: TerrainRequest) => result(terrain));
  const readiness = {
    state: signal<OfflinePreparationState>('ready'),
    detail: signal('Offline ready for tests.'),
    updateReady: signal(false),
    updateVersion: signal<string | null>(null),
    updateError: signal<string | null>(null),
    start: vi.fn(async () => {}),
    prepare: vi.fn(async () => {}),
    checkForUpdate: vi.fn(async () => {}),
    prepareForReload: vi.fn(() => {}),
    cancelReload: vi.fn(),
  };
  let fixture: ReturnType<typeof TestBed.createComponent<App>>;

  beforeEach(async () => {
    local.mockReset().mockImplementation(async (terrain) => result(terrain));
    remote.mockReset().mockImplementation(async (terrain) => result(terrain));
    readiness.state.set('ready');
    readiness.detail.set('Offline ready for tests.');
    readiness.updateReady.set(false);
    readiness.updateVersion.set(null);
    readiness.updateError.set(null);
    readiness.start.mockClear();
    readiness.prepare.mockClear();
    readiness.checkForUpdate.mockClear();
    readiness.prepareForReload.mockClear();
    readiness.cancelReload.mockClear();
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [
        provideHttpClient(),
        { provide: TerrainService, useValue: { local, remote } },
        {
          provide: WasmHostService,
          useValue: {
            getRuntime: vi.fn(async () => ({})),
            getInfo: () => ({
              initCount: 1,
              initMs: 10,
              runtimeMs: 8,
              execution: 'worker',
              protocol: 'worker-rpc-v1',
            }),
          },
        },
        { provide: OfflineReadinessService, useValue: readiness },
      ],
    })
      .overrideComponent(TerrainResultsPanel, {
        remove: { imports: [TerrainPreview] },
        add: { imports: [PreviewStub] },
      })
      .compileComponents();
    fixture = TestBed.createComponent(App);
    await fixture.whenStable();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  function pwa(): PwaStatusPanel {
    return fixture.debugElement.query(By.directive(PwaStatusPanel)).componentInstance;
  }

  function button(id: string): HTMLButtonElement {
    return fixture.nativeElement.querySelector('#' + id);
  }

  function input(id: string, value: string): void {
    const element = fixture.nativeElement.querySelector('#' + id) as HTMLInputElement;
    element.value = value;
    element.dispatchEvent(new Event('input'));
  }

  async function waitForIdle(): Promise<void> {
    await vi.waitFor(() => {
      expect(fixture.componentInstance['busy']()).toBe(false);
    });
    await fixture.whenStable();
  }

  it('renders only the rich terrain workflow and 3D preview', () => {
    expect(fixture.nativeElement.querySelector('h1').textContent).toContain('Terrain editor');
    expect(
      fixture.nativeElement.querySelectorAll('app-terrain-parameters input[type=number]').length,
    ).toBe(18);
    expect(fixture.nativeElement.querySelector('#workload')).toBeNull();
    expect(fixture.nativeElement.querySelector('#view-2d')).toBeNull();
    expect(fixture.nativeElement.querySelector('app-heightmap-preview')).toBeNull();
    expect(fixture.nativeElement.querySelector('app-probe-diagnostics')).toBeNull();
    expect(readiness.start).toHaveBeenCalledTimes(1);
    expect(fixture.nativeElement.querySelector('#offline-detail').textContent).toContain(
      'Offline ready for tests.',
    );
  });

  it('retries offline preparation after a failure', async () => {
    readiness.state.set('failed');
    readiness.detail.set('Offline preparation failed.');
    fixture.detectChanges();

    const retry = fixture.nativeElement.querySelector('#retry-offline') as HTMLButtonElement;
    expect(retry).toBeTruthy();
    retry.click();
    await fixture.whenStable();
    expect(readiness.prepare).toHaveBeenCalledTimes(1);
  });

  it('notifies about an update and activates it only when idle', async () => {
    const reload = vi
      .spyOn(pwa() as unknown as { reloadPage(): void }, 'reloadPage')
      .mockImplementation(() => {});
    readiness.updateReady.set(true);
    readiness.updateVersion.set('version-2');
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('#update-banner').textContent).toContain(
      'version-2',
    );
    const reloadButton = fixture.nativeElement.querySelector('#reload-update') as HTMLButtonElement;
    expect(reloadButton.disabled).toBe(false);
    reloadButton.click();
    await vi.waitFor(() => expect(readiness.prepareForReload).toHaveBeenCalledTimes(1));
    expect(reload).toHaveBeenCalledTimes(1);
    expect(fixture.componentInstance['busy']()).toBe(true);
  });

  it('reports a reload failure and releases the operation lock', async () => {
    vi.spyOn(pwa() as unknown as { reloadPage(): void }, 'reloadPage').mockImplementation(() => {
      throw new Error('Reload blocked');
    });
    readiness.updateReady.set(true);
    await (pwa() as unknown as { reloadForUpdate(): Promise<void> }).reloadForUpdate();
    expect(readiness.cancelReload).toHaveBeenCalledWith('Reload blocked');
    expect(fixture.componentInstance['busy']()).toBe(false);
  });

  it('does not activate an update or reload during an active operation', async () => {
    let finish!: (run: TerrainRun) => void;
    remote.mockImplementationOnce(
      () =>
        new Promise<TerrainRun>((resolve) => {
          finish = resolve;
        }),
    );
    button('generate-remote').click();
    await vi.waitFor(() => expect(remote).toHaveBeenCalledTimes(1));

    readiness.updateReady.set(true);
    fixture.detectChanges();
    const reload = vi
      .spyOn(pwa() as unknown as { reloadPage(): void }, 'reloadPage')
      .mockImplementation(() => {});
    const reloadButton = fixture.nativeElement.querySelector('#reload-update') as HTMLButtonElement;
    expect(reloadButton.disabled).toBe(true);

    await (pwa() as unknown as { reloadForUpdate(): Promise<void> }).reloadForUpdate();
    expect(readiness.prepareForReload).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();

    finish(result(remote.mock.calls[0][0]));
    await waitForIdle();
  });

  it('checks for updates through the readiness service', async () => {
    button('check-updates').click();
    await fixture.whenStable();
    expect(readiness.checkForUpdate).toHaveBeenCalledTimes(1);
  });

  it('generates one mode and preserves the captured request in its result', async () => {
    input('width', '3');
    input('height', '2');
    button('generate-local').click();
    await waitForIdle();
    expect(local).toHaveBeenCalledTimes(1);
    expect(remote).not.toHaveBeenCalled();
    expect(Object.isFrozen(local.mock.calls[0][0])).toBe(true);
    expect(fixture.nativeElement.querySelector('.snapshot').textContent).toContain('3 × 2');
    input('seed', '9');
    expect(fixture.nativeElement.querySelector('.snapshot').textContent).toContain('Seed 42');
  });

  it('runs a sequential pair with exactly the same snapshot', async () => {
    const order: string[] = [];
    local.mockImplementation(async (request) => {
      order.push('local');
      return result(request);
    });
    remote.mockImplementation(async (request) => {
      order.push('remote');
      return result(request);
    });
    button('verify-equivalence').click();
    await waitForIdle();
    expect(order).toEqual(['local', 'remote']);
    expect(local.mock.calls[0][0]).toBe(remote.mock.calls[0][0]);
    expect(fixture.nativeElement.querySelectorAll('canvas').length).toBe(1);
    button('compare-views').click();
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelectorAll('canvas').length).toBe(2);
    expect(fixture.nativeElement.querySelector('#numeric-match').textContent).toContain(
      'All heights match',
    );
    input('seed', '7');
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('#numeric-match')).toBeNull();
  });

  it('captures one terrain workload snapshot for both execution modes', async () => {
    input('iterations', '32');
    button('verify-equivalence').click();
    await waitForIdle();
    const captured = local.mock.calls[0][0];
    expect(captured.iterations).toBe(32);
    expect(Object.isFrozen(captured)).toBe(true);
    expect(Object.isFrozen(captured.heightMap)).toBe(true);
    expect(remote.mock.calls[0][0]).toBe(captured);
  });

  it('rejects blank controls without turning them into zeros', async () => {
    input('seed', '');
    button('generate-local').click();
    await fixture.whenStable();
    expect(local).not.toHaveBeenCalled();
    expect(fixture.nativeElement.querySelector('[role="alert"]').textContent).toContain('seed');
  });

  it('shows structured host validation errors', async () => {
    remote.mockRejectedValueOnce(
      new TerrainError('validation', 'Check parameters', {
        width: 'value.out_of_range: Invalid width',
      }),
    );
    button('generate-remote').click();
    await waitForIdle();
    expect(fixture.nativeElement.querySelector('[role="alert"]').textContent).toContain(
      'Invalid width',
    );
    expect(local).not.toHaveBeenCalled();
  });

  it('shows nested Core errors beside the matching composition control', async () => {
    remote.mockRejectedValueOnce(
      new TerrainError('validation', 'Check parameters', {
        'heightMap.noiseScale': 'value.out_of_range: Invalid noise scale',
      }),
    );
    button('generate-remote').click();
    await waitForIdle();
    expect(fixture.nativeElement.querySelector('#noiseScale-error').textContent).toContain(
      'Invalid noise scale',
    );
    expect(fixture.nativeElement.querySelector('#noiseScale').getAttribute('aria-invalid')).toBe(
      'true',
    );
    input('noiseScale', '0.04');
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('#noiseScale-error').textContent).toBe('');
    expect(fixture.nativeElement.querySelector('#noiseScale').hasAttribute('aria-invalid')).toBe(
      false,
    );
  });

  it('shows remote availability errors without invoking Local', async () => {
    remote.mockRejectedValueOnce(
      new TerrainError(
        'availability',
        'Remote API is unavailable. Check the connection and retry.',
      ),
    );
    button('generate-remote').click();
    await waitForIdle();
    expect(fixture.nativeElement.querySelector('[role="alert"]').textContent).toContain(
      'unavailable',
    );
    expect(local).not.toHaveBeenCalled();
    expect(fixture.nativeElement.querySelector('canvas')).toBeNull();
  });

  it('blocks overlapping operations and discards an obsolete response', async () => {
    let finish!: (run: TerrainRun) => void;
    remote.mockImplementationOnce(
      () =>
        new Promise<TerrainRun>((resolve) => {
          finish = resolve;
        }),
    );
    button('generate-remote').click();
    await vi.waitFor(() => expect(remote).toHaveBeenCalledTimes(1));
    await fixture.whenStable();
    expect(button('generate-local').matches(':disabled')).toBe(true);
    button('generate-local').click();
    expect(local).not.toHaveBeenCalled();
    const captured = remote.mock.calls[0][0];
    // Programmatic edits can happen even while native controls are disabled.
    input('seed', '11');
    finish(result(captured));
    await waitForIdle();
    expect(fixture.nativeElement.querySelector('canvas')).toBeNull();
    expect(fixture.nativeElement.querySelector('[role="status"]').textContent).toContain(
      'Parameters changed',
    );
  });
  it('synchronizes sliders and numeric inputs without generating', async () => {
    input('mountainStrength-slider', '0.75');
    await fixture.whenStable();
    expect(
      (fixture.nativeElement.querySelector('#mountainStrength') as HTMLInputElement).value,
    ).toBe('0.75');
    input('mountainStrength', '0.25');
    input('warpStrength', '3.5');
    await fixture.whenStable();
    expect(
      (fixture.nativeElement.querySelector('#mountainStrength-slider') as HTMLInputElement).value,
    ).toBe('0.25');
    expect(
      (fixture.nativeElement.querySelector('#warpStrength-slider') as HTMLInputElement).value,
    ).toBe('3.5');
    expect(local).not.toHaveBeenCalled();
    expect(remote).not.toHaveBeenCalled();
  });

  it('randomizes only the draft seed and resets every parameter without generating', async () => {
    vi.spyOn(crypto, 'getRandomValues').mockImplementation(((values: Uint32Array) => {
      values[0] = 0xffffffff;
      return values;
    }) as Crypto['getRandomValues']);
    input('iterations', '8');
    button('random-seed').click();
    await fixture.whenStable();
    expect((fixture.nativeElement.querySelector('#seed') as HTMLInputElement).value).toBe('-1');
    expect((fixture.nativeElement.querySelector('#iterations') as HTMLInputElement).value).toBe(
      '8',
    );
    button('reset-parameters').click();
    await fixture.whenStable();
    expect((fixture.nativeElement.querySelector('#seed') as HTMLInputElement).value).toBe('42');
    expect((fixture.nativeElement.querySelector('#iterations') as HTMLInputElement).value).toBe(
      '64',
    );
    expect(local).not.toHaveBeenCalled();
    expect(remote).not.toHaveBeenCalled();
  });

  it('retains the previous map during work and failure with captured labels', async () => {
    button('generate-local').click();
    await waitForIdle();
    input('seed', '99');
    let reject!: (error: Error) => void;
    remote.mockImplementationOnce(
      () =>
        new Promise((_, fail) => {
          reject = fail;
        }),
    );
    button('generate-remote').click();
    await vi.waitFor(() => expect(remote).toHaveBeenCalledTimes(1));
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('.snapshot').textContent).toContain('Seed 42');
    expect(fixture.nativeElement.querySelector('.result-state').textContent).toContain(
      'Earlier settings',
    );
    expect(fixture.nativeElement.querySelector('app-terrain-preview')).toBeTruthy();
    reject(new TerrainError('availability', 'Unavailable'));
    await waitForIdle();
    expect(fixture.nativeElement.querySelector('.snapshot').textContent).toContain('Seed 42');
    expect(fixture.nativeElement.querySelector('[role=alert]').textContent).toContain(
      'Unavailable',
    );
  });

  it('selects either primary result and opens comparison explicitly', async () => {
    button('verify-equivalence').click();
    await waitForIdle();
    expect(fixture.nativeElement.querySelectorAll('.map-card').length).toBe(1);
    button('select-remote').click();
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('.map-card').getAttribute('aria-label')).toBe(
      'Remote API',
    );
    button('compare-views').click();
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelectorAll('.map-card').length).toBe(2);
    button('select-local').click();
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelectorAll('.map-card').length).toBe(1);
    expect(fixture.nativeElement.querySelector('.map-card').getAttribute('aria-label')).toBe(
      'Local WebAssembly',
    );
  });

  it('keeps the lock until real completion and discards results after destruction', async () => {
    let finish!: (run: TerrainRun) => void;
    remote.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    button('generate-remote').click();
    await vi.waitFor(() => expect(remote).toHaveBeenCalledTimes(1));
    const operations = TestBed.inject(OperationLock);
    const app = fixture.componentInstance;
    fixture.destroy();
    expect(operations.busy()).toBe(true);
    finish(result(remote.mock.calls[0][0]));
    await vi.waitFor(() => expect(operations.busy()).toBe(false));
    expect(app['remote']()).toBeNull();
  });

  function smallExperiment(): void {
    input('width', '3');
    input('height', '2');
    input('iterations', '2');
    input('race-pairs', '1');
  }

  it('runs the captured experiment and transfers its verified pair once without extra calls', async () => {
    smallExperiment();
    const runner = TestBed.inject(ExperimentRunner);
    const take = vi.spyOn(runner, 'takePreviewPair');
    button('race-start').click();
    await waitForIdle();
    expect(local).toHaveBeenCalledTimes(2);
    expect(remote).toHaveBeenCalledTimes(2);
    expect(take).toHaveBeenCalledTimes(1);
    expect(fixture.componentInstance['local']()).toBeTruthy();
    const verification = runner.result()!.verifications[1];
    expect(fixture.componentInstance['comparison']()).toBe(
      verification.status === 'compared' ? verification.comparison : null,
    );
    expect(fixture.nativeElement.querySelector('#race-outcome').textContent).toContain('completed');
    expect(runner.takePreviewPair()).toBeNull();
  });

  it('blocks conflicting actions and keeps Stop available until the active call settles', async () => {
    smallExperiment();
    let finish!: (value: TerrainRun) => void;
    local.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    button('race-start').click();
    await vi.waitFor(() => expect(local).toHaveBeenCalledTimes(1));
    await fixture.whenStable();
    expect(button('race-start').disabled).toBe(true);
    expect(button('generate-local').matches(':disabled')).toBe(true);
    expect(button('reset-parameters').matches(':disabled')).toBe(true);
    expect(button('random-seed').matches(':disabled')).toBe(true);
    expect(button('race-stop').disabled).toBe(false);
    button('race-start').click();
    button('race-stop').click();
    await fixture.whenStable();
    expect(button('race-stop').disabled).toBe(true);
    expect(fixture.nativeElement.querySelector('#race-status').textContent).toContain(
      'Stop requested',
    );
    expect(TestBed.inject(OperationLock).busy()).toBe(true);
    expect(fixture.componentInstance['local']()).toBeNull();
    finish(result(local.mock.calls[0][0]));
    await waitForIdle();
    expect(remote).not.toHaveBeenCalled();
    expect(fixture.nativeElement.querySelector('#race-outcome').textContent).toContain('stopped');
  });

  it('preserves prior maps without intermediate updates when a series fails', async () => {
    smallExperiment();
    button('generate-local').click();
    await waitForIdle();
    const previous = fixture.componentInstance['local']();
    let fail!: (error: Error) => void;
    remote.mockImplementationOnce(
      () =>
        new Promise((_, reject) => {
          fail = reject;
        }),
    );
    button('race-start').click();
    await vi.waitFor(() => expect(remote).toHaveBeenCalledTimes(1));
    expect(fixture.componentInstance['local']()).toBe(previous);
    fail(new TerrainError('availability', 'Remote unavailable'));
    await waitForIdle();
    expect(fixture.componentInstance['local']()).toBe(previous);
    expect(fixture.nativeElement.querySelector('#race-failures').textContent).toContain(
      'Remote unavailable',
    );
  });

  it('maps canonical validation fields back to the editor', async () => {
    smallExperiment();
    local.mockRejectedValueOnce(
      new TerrainError('validation', 'Invalid dimensions', { 'heightMap.width': 'Too small' }),
    );
    button('race-start').click();
    await waitForIdle();
    expect(fixture.componentInstance['error']()?.fields['heightMap.width']).toBe('Too small');
    expect(fixture.nativeElement.querySelector('#width-error').textContent).toContain('Too small');
    expect(remote).toHaveBeenCalledTimes(1);
  });

  it('does not start with incomplete terrain fields or invalid experiment count', async () => {
    smallExperiment();
    input('race-pairs', '1.5');
    button('race-start').click();
    await fixture.whenStable();
    expect(local).not.toHaveBeenCalled();
    expect(fixture.nativeElement.querySelector('#race-count-error').textContent).toContain(
      'whole number',
    );
    input('race-pairs', '1');
    input('seed', '');
    button('race-start').click();
    await fixture.whenStable();
    expect(local).not.toHaveBeenCalled();
    expect(fixture.componentInstance['error']()?.kind).toBe('validation');
  });

  it('retains maps and reports a rejected start', async () => {
    smallExperiment();
    button('generate-local').click();
    await waitForIdle();
    const previous = fixture.componentInstance['local']();
    vi.spyOn(TestBed.inject(ExperimentRunner), 'start').mockRejectedValueOnce(
      new Error('Start rejected'),
    );
    button('race-start').click();
    await waitForIdle();
    expect(fixture.componentInstance['local']()).toBe(previous);
    expect(fixture.componentInstance['error']()?.message).toBe('Start rejected');
  });

  it('keeps captured parameters immutable and drops stale visualization after a programmatic draft edit', async () => {
    smallExperiment();
    let finish!: (value: TerrainRun) => void;
    local.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    button('race-start').click();
    await vi.waitFor(() => expect(local).toHaveBeenCalledTimes(1));
    fixture.componentInstance['form'].controls.seed.setValue(999);
    finish(result(local.mock.calls[0][0]));
    await waitForIdle();
    expect(
      [...local.mock.calls, ...remote.mock.calls].every(
        ([request]) => request.heightMap.seed === 42,
      ),
    ).toBe(true);
    expect(fixture.componentInstance['local']()).toBeNull();
    expect(TestBed.inject(ExperimentRunner).result()!.configuration.terrain.heightMap.seed).toBe(
      42,
    );
    expect(TestBed.inject(ExperimentRunner).takePreviewPair()).toBeNull();
  });

  it('stops its own series on destruction, waits for settlement and leaves the root runner reusable', async () => {
    smallExperiment();
    let finish!: (value: TerrainRun) => void;
    local.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    button('race-start').click();
    await vi.waitFor(() => expect(local).toHaveBeenCalledTimes(1));
    const runner = TestBed.inject(ExperimentRunner),
      app = fixture.componentInstance;
    fixture.destroy();
    expect(runner.stopRequested()).toBe(true);
    expect(TestBed.inject(OperationLock).busy()).toBe(true);
    finish(result(local.mock.calls[0][0]));
    await vi.waitFor(() => expect(TestBed.inject(OperationLock).busy()).toBe(false));
    expect(app['local']()).toBeNull();
    expect(runner.takePreviewPair()).toBeNull();
    expect(runner.result()!.status).toBe('stopped');
    expect((await runner.start(runner.result()!.configuration)).status).toBe('completed');
  });

  it('displays matching dirty-build maps as diagnostics with explicit exclusion', async () => {
    smallExperiment();
    const diagnostic = async (terrain: TerrainRequest) => {
      const value = result(terrain);
      return { ...value, response: { ...value.response, coreBuildId: 'git:test-dirty' } };
    };
    local.mockImplementation(diagnostic);
    remote.mockImplementation(diagnostic);
    button('race-start').click();
    await waitForIdle();
    expect(fixture.componentInstance['local']()).toBeTruthy();
    expect(fixture.componentInstance['comparison']()?.identity).toBe('unverifiable');
    expect(fixture.nativeElement.querySelector('#build-identity').textContent).toContain(
      'unverifiable',
    );
    expect(fixture.nativeElement.querySelector('#race-outcome').textContent).toContain('Excluded');
  });
});
