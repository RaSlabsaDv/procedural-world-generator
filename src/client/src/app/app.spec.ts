import { provideHttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { App } from './app';
import { HeightMapService } from './heightmap.service';
import { HeightMapError, HeightMapRequest, HeightMapRun } from './heightmap.models';
import { WasmHostService } from './wasm-host.service';

function result(request: HeightMapRequest): HeightMapRun {
  return {
    request,
    response: {
      result: {
        width: request.width,
        height: request.height,
        values: new Float32Array(request.width * request.height),
        algorithmVersion: request.algorithmVersion,
      },
      computeMs: 1,
      coreBuildId: 'git:123456789abc',
      workload: 'heightmap',
    },
    requestMs: 2,
    initMs: null,
  };
}

describe('App heightmap workflow', () => {
  const local = vi.fn(async (request: HeightMapRequest) => result(request));
  const remote = vi.fn(async (request: HeightMapRequest) => result(request));
  const probeRuntime = vi.fn();
  let fixture: ReturnType<typeof TestBed.createComponent<App>>;

  beforeEach(async () => {
    local.mockReset().mockImplementation(async (request) => result(request));
    remote.mockReset().mockImplementation(async (request) => result(request));
    probeRuntime.mockReset();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      createImageData: (width: number, height: number) => ({
        data: new Uint8ClampedArray(width * height * 4),
      }),
      putImageData: vi.fn(),
    } as unknown as CanvasRenderingContext2D);
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [
        provideHttpClient(),
        { provide: HeightMapService, useValue: { local, remote } },
        {
          provide: WasmHostService,
          useValue: { getInfo: () => ({ initCount: 0, initMs: null }), getRuntime: probeRuntime },
        },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(App);
    await fixture.whenStable();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

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

  it('renders parameters and retains collapsed probe diagnostics', () => {
    expect(fixture.nativeElement.querySelector('h1').textContent).toContain('Heightmap explorer');
    expect(fixture.nativeElement.querySelectorAll('input').length).toBe(6);
    expect(fixture.nativeElement.querySelector('details').open).toBe(false);
    expect(fixture.nativeElement.querySelector('app-probe-diagnostics')).toBeTruthy();
  });

  it('generates one mode and preserves the captured request in its result', async () => {
    input('width', '3');
    input('height', '2');
    button('generate-local').click();
    await waitForIdle();
    expect(local).toHaveBeenCalledTimes(1);
    expect(remote).not.toHaveBeenCalled();
    expect(Object.isFrozen(local.mock.calls[0][0])).toBe(true);
    expect(fixture.nativeElement.querySelector('canvas').width).toBe(3);
    expect(fixture.nativeElement.querySelector('canvas').height).toBe(2);
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
    expect(fixture.nativeElement.querySelectorAll('canvas').length).toBe(2);
    expect(fixture.nativeElement.querySelector('#numeric-match').textContent).toContain(
      'All heights match',
    );
    input('seed', '7');
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('#numeric-match')).toBeNull();
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
      new HeightMapError('validation', 'Check parameters', {
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

  it('blocks overlapping operations and discards an obsolete response', async () => {
    let finish!: (run: HeightMapRun) => void;
    remote.mockImplementationOnce(
      () =>
        new Promise<HeightMapRun>((resolve) => {
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

  it('shares the operation lock with probe diagnostics', async () => {
    let fail!: (reason: Error) => void;
    probeRuntime.mockReturnValueOnce(
      new Promise((_, reject) => {
        fail = reject;
      }),
    );
    const probe = fixture.nativeElement.querySelector(
      'app-probe-diagnostics button',
    ) as HTMLButtonElement;
    probe.click();
    await fixture.whenStable();
    expect(button('generate-local').matches(':disabled')).toBe(true);
    button('generate-local').click();
    expect(local).not.toHaveBeenCalled();
    fail(new Error('Test runtime unavailable'));
    await waitForIdle();
    expect(button('generate-local').matches(':disabled')).toBe(false);
  });
});
