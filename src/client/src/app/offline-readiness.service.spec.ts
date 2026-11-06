import { TestBed } from '@angular/core/testing';
import { SwUpdate, VersionEvent } from '@angular/service-worker';
import { Subject } from 'rxjs';
import { vi } from 'vitest';
import { ALGORITHM_VERSION } from './terrain.models';
import { testTerrain, testWire } from './terrain-test-fixture';
import { OfflineReadinessService } from './offline-readiness.service';
import { OperationLock } from './operation-lock.service';
import { WasmHostService } from './wasm-host.service';

const version = 'a'.repeat(64);
const catalogPath = '/offline-assets.' + version + '.json';
const assets = {
  '/index.html': '0'.repeat(40),
  '/main-current.js': '0'.repeat(40),
  '/wasm/_framework/dotnet.js': '0'.repeat(40),
  '/wasm/_framework/WorldGenerator.Core.current.wasm': '0'.repeat(40),
  '/wasm/_framework/System.Private.CoreLib.current.wasm': '0'.repeat(40),
};
const readinessResponse = testWire({
  ...testTerrain({
    seed: 0,
    width: 2,
    height: 2,
    noiseScale: 0.5,
    octaves: 1,
    heightMultiplier: 1,
    algorithmVersion: ALGORITHM_VERSION,
  }),
  iterations: 0,
});

describe('OfflineReadinessService', () => {
  let service: OfflineReadinessService;
  let versionEvents: Subject<VersionEvent>;
  let unrecoverable: Subject<{ reason: string }>;
  let swUpdate: {
    isEnabled: boolean;
    versionUpdates: unknown;
    unrecoverable: unknown;
    checkForUpdate: ReturnType<typeof vi.fn>;
  };
  let worker: {
    controller: object | null;
    ready: Promise<object>;
    addEventListener: ReturnType<typeof vi.fn>;
    removeEventListener: ReturnType<typeof vi.fn>;
  };
  let generate: ReturnType<typeof vi.fn>;
  let getRuntime: ReturnType<typeof vi.fn>;
  let cacheEntries: Map<string, Map<string, number>>;
  let meta: HTMLMetaElement;
  let script: HTMLScriptElement;

  beforeEach(() => {
    versionEvents = new Subject<VersionEvent>();
    unrecoverable = new Subject();
    swUpdate = {
      isEnabled: true,
      versionUpdates: versionEvents,
      unrecoverable,
      checkForUpdate: vi.fn(async () => false),
    };
    worker = {
      controller: {},
      ready: Promise.resolve({}),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };
    generate = vi.fn(() => JSON.stringify(readinessResponse));
    getRuntime = vi.fn(async () => ({ generateTerrainJson: generate }));
    cacheEntries = new Map([
      [
        'current',
        new Map([
          [catalogPath, 0],
          ...Object.keys(assets).map((path) => [path, 0] as [string, number]),
        ]),
      ],
    ]);
    meta = document.createElement('meta');
    meta.name = 'worldgen-offline-catalog';
    meta.content = catalogPath;
    document.head.append(meta);
    script = document.createElement('script');
    script.type = 'application/json';
    script.src = '/main-current.js';
    document.head.append(script);
    vi.stubGlobal('navigator', { serviceWorker: worker, onLine: false });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        text: async () => '<meta name="worldgen-offline-catalog" content="' + catalogPath + '">',
      })),
    );
    vi.stubGlobal('crypto', {
      subtle: {
        digest: vi.fn(
          async (_algorithm: string, data: ArrayBuffer) =>
            new Uint8Array(20).fill(new Uint8Array(data)[0]).buffer,
        ),
      },
    });
    vi.stubGlobal('caches', {
      keys: async () => [...cacheEntries.keys()],
      open: async (name: string) => ({
        match: async (url: string) => {
          const path = new URL(url, document.baseURI).pathname;
          const content = cacheEntries.get(name)?.get(path);
          return content === undefined
            ? undefined
            : {
                ok: true,
                json: async () => ({ version, assets }),
                arrayBuffer: async () => new Uint8Array([content]).buffer,
              };
        },
      }),
    });
    TestBed.configureTestingModule({
      providers: [
        OfflineReadinessService,
        { provide: SwUpdate, useValue: swUpdate },
        { provide: WasmHostService, useValue: { getRuntime } },
      ],
    });
    service = TestBed.inject(OfflineReadinessService);
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    vi.useRealTimers();
    versionEvents.complete();
    unrecoverable.complete();
    meta.remove();
    script.remove();
    vi.unstubAllGlobals();
  });

  async function finishCacheFailure(): Promise<void> {
    vi.useFakeTimers();
    const promise = service.start();
    await vi.advanceTimersByTimeAsync(31_000);
    await promise;
    expect(service.state()).toBe('failed');
    expect(getRuntime).not.toHaveBeenCalled();
  }

  it('verifies this complete cached version and Local execution even when offline', async () => {
    await service.start();
    expect(service.state()).toBe('ready');
    expect(generate).toHaveBeenCalledTimes(1);
    expect(swUpdate.checkForUpdate).toHaveBeenCalledTimes(1);
    expect(TestBed.inject(OperationLock).busy()).toBe(false);
  });

  it('deduplicates concurrent preparation', async () => {
    await Promise.all([service.start(), service.prepare(), service.prepare()]);
    expect(generate).toHaveBeenCalledTimes(1);
  });

  it('rejects a controller serving another application version', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      text: async () =>
        '<meta name="worldgen-offline-catalog" content="offline-assets.other.json">',
    } as Response);
    await service.start();
    expect(service.state()).toBe('failed');
    expect(service.detail()).toContain('version changed');
    expect(getRuntime).not.toHaveBeenCalled();
  });

  it('rejects a controller change during Local verification', async () => {
    generate.mockImplementationOnce(() => {
      worker.controller = {};
      return JSON.stringify(readinessResponse);
    });
    await service.start();
    expect(service.state()).toBe('failed');
    expect(service.detail()).toContain('service worker changed');
  });

  it('reports unsupported when the worker is disabled', async () => {
    swUpdate.isEnabled = false;
    await service.start();
    expect(service.state()).toBe('unsupported');
    expect(getRuntime).not.toHaveBeenCalled();
  });

  it('waits for initial control rather than requiring a manual reload', async () => {
    worker.controller = null;
    const promise = service.start();
    await vi.waitFor(() => expect(worker.addEventListener.mock.calls.length).toBeGreaterThan(1));
    worker.controller = {};
    for (const [name, listener] of worker.addEventListener.mock.calls) {
      if (name === 'controllerchange') listener();
    }
    await promise;
    expect(service.state()).toBe('ready');
    expect(generate).toHaveBeenCalledTimes(1);
  });

  it('times out if registration never becomes ready and releases the operation lock', async () => {
    vi.useFakeTimers();
    worker.ready = new Promise(() => {});
    const promise = service.start();
    await vi.advanceTimersByTimeAsync(60_001);
    await promise;
    expect(service.state()).toBe('failed');
    expect(service.detail()).toContain('timed out');
    expect(TestBed.inject(OperationLock).busy()).toBe(false);
  });

  it('rejects a missing catalog in a build produced without the finalizer', async () => {
    meta.remove();
    await service.start();
    expect(service.state()).toBe('failed');
    expect(service.detail()).toContain('no offline catalog');
  });

  it('does not merge partial caches into a false ready state', async () => {
    const entries = cacheEntries.get('current')!;
    entries.delete('/wasm/_framework/System.Private.CoreLib.current.wasm');
    cacheEntries.set('old', new Map([['/wasm/_framework/System.Private.CoreLib.current.wasm', 0]]));
    await finishCacheFailure();
  });

  it('rejects an older catalog even if the filenames match familiar patterns', async () => {
    const entries = cacheEntries.get('current')!;
    entries.delete(catalogPath);
    entries.set('/offline-assets.' + 'b'.repeat(64) + '.json', 0);
    await finishCacheFailure();
  });

  it('detects corrupted cached bytes', async () => {
    cacheEntries.get('current')!.set('/wasm/_framework/dotnet.js', 9);
    await finishCacheFailure();
  });

  it('rejects a catalog that does not describe the running JavaScript bundle', async () => {
    script.src = '/main-different.js';
    await finishCacheFailure();
  });

  it('keeps preparation outside any existing operation', async () => {
    const operations = TestBed.inject(OperationLock);
    const release = operations.tryAcquire()!;
    const promise = service.start();
    await Promise.resolve();
    expect(getRuntime).not.toHaveBeenCalled();
    release();
    await promise;
    expect(service.state()).toBe('ready');
    expect(operations.busy()).toBe(false);
  });

  it('reports Local verification failure and releases the lock', async () => {
    getRuntime.mockRejectedValueOnce(new Error('WASM unavailable'));
    await service.start();
    expect(service.state()).toBe('failed');
    expect(service.detail()).toContain('WASM unavailable');
    expect(TestBed.inject(OperationLock).busy()).toBe(false);
  });

  it('notifies about a new version without changing the live runtime or its readiness', async () => {
    await service.start();
    versionEvents.next({
      type: 'VERSION_READY',
      currentVersion: { hash: 'v1' },
      latestVersion: { hash: 'v2' },
    });
    expect(service.updateReady()).toBe(true);
    expect(service.updateVersion()).toBe('v2');
    expect(service.state()).toBe('ready');
    service.prepareForReload();
    expect(service.state()).toBe('preparing');
    expect(service.updateReady()).toBe(false);
  });

  it('handles cache eviction and unrecoverable worker state', async () => {
    await service.start();
    unrecoverable.next({ reason: 'Missing cached asset' });
    expect(service.state()).toBe('failed');
    expect(service.updateError()).toBe('Missing cached asset');
  });

  it('allows retry after a failed reload', async () => {
    await service.start();
    service.prepareForReload();
    service.cancelReload('Reload blocked');
    expect(service.updateReady()).toBe(true);
    expect(service.state()).toBe('failed');
    await service.prepare();
    expect(service.state()).toBe('ready');
  });

  it('preserves current readiness when installing an update fails', async () => {
    await service.start();
    versionEvents.next({
      type: 'VERSION_INSTALLATION_FAILED',
      version: { hash: 'v2' },
      error: 'Quota exceeded',
    });
    expect(service.updateError()).toBe('Quota exceeded');
    expect(service.state()).toBe('ready');
  });
});
