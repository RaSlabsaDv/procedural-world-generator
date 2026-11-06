import { DestroyRef, Injectable, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { SwUpdate } from '@angular/service-worker';
import { decodeTerrain } from '../terrain/data/terrain.contract';
import {
  ALGORITHM_VERSION,
  TERRAIN_ALGORITHM,
  TerrainRequest,
  HeightMapRequest,
} from '../terrain/data/terrain.models';
import { DEFAULT_SIMULATION_PARAMETERS } from '../terrain/data/terrain-defaults';
import { OperationLock } from './operation-lock.service';
import { WasmHostService } from './wasm-host.service';

export type OfflinePreparationState = 'preparing' | 'ready' | 'unsupported' | 'failed';

const READINESS_REQUEST: HeightMapRequest = Object.freeze({
  seed: 0,
  width: 2,
  height: 2,
  noiseScale: 0.5,
  octaves: 1,
  heightMultiplier: 1,
  algorithmVersion: ALGORITHM_VERSION,
});

const READINESS_TERRAIN: TerrainRequest = Object.freeze({
  ...DEFAULT_SIMULATION_PARAMETERS,
  heightMap: READINESS_REQUEST,
  iterations: 0,
  algorithmVersion: TERRAIN_ALGORITHM,
});

@Injectable({ providedIn: 'root' })
export class OfflineReadinessService {
  private readonly swUpdate = inject(SwUpdate);
  private readonly wasm = inject(WasmHostService);
  private readonly operations = inject(OperationLock);
  private readonly destroyRef = inject(DestroyRef);
  private readonly abort = new AbortController();
  private revision = 0;
  private started = false;
  private reloadPending = false;
  private preparation: Promise<void> | null = null;

  readonly state = signal<OfflinePreparationState>('preparing');
  readonly detail = signal('Preparing offline support…');
  readonly updateReady = signal(false);
  readonly updateVersion = signal<string | null>(null);
  readonly updateError = signal<string | null>(null);

  constructor() {
    this.destroyRef.onDestroy(() => {
      this.revision++;
      this.abort.abort();
    });
  }

  start(): Promise<void> {
    if (!this.started) {
      this.started = true;
      this.watchForUpdates();
      const worker = globalThis.navigator?.serviceWorker;
      const changed = () => {
        if (!this.reloadPending && !this.preparation) void this.prepare();
      };
      worker?.addEventListener('controllerchange', changed);
      this.destroyRef.onDestroy(() => worker?.removeEventListener('controllerchange', changed));
    }
    return this.prepare().then(() => {
      if (this.state() === 'ready') void this.checkForUpdate();
    });
  }

  prepare(): Promise<void> {
    if (this.preparation) return this.preparation;
    this.preparation = this.prepareOnce().finally(() => {
      this.preparation = null;
    });
    return this.preparation;
  }

  private async prepareOnce(): Promise<void> {
    const release = await this.operations.acquire();
    const revision = ++this.revision;
    try {
      if (this.abort.signal.aborted || this.reloadPending) return;
      this.state.set('preparing');
      this.detail.set('Preparing offline support…');
      if (!this.swUpdate.isEnabled || !globalThis.navigator?.serviceWorker) {
        this.setIfCurrent(
          revision,
          'unsupported',
          'Offline support requires a production build and a supported browser over HTTPS or localhost.',
        );
        return;
      }
      const worker = navigator.serviceWorker;
      await this.bounded(worker.ready, 60_000);
      if (!worker.controller) {
        let changed!: () => void;
        try {
          await this.bounded(
            new Promise<void>((resolve) => {
              changed = () => {
                if (worker.controller) resolve();
              };
              worker.addEventListener('controllerchange', changed);
              changed();
            }),
            30_000,
          );
        } finally {
          worker.removeEventListener('controllerchange', changed);
        }
      }
      if (!worker.controller) throw new Error('Reload the page to enable service-worker control.');
      const catalogUrl = document.querySelector<HTMLMetaElement>(
        'meta[name="worldgen-offline-catalog"]',
      )?.content;
      if (!catalogUrl)
        throw new Error('This build has no offline catalog. Build with npm run build.');
      const url = new URL(catalogUrl, document.baseURI);
      if (
        url.origin !== location.origin ||
        !/\/offline-assets\.[0-9a-f]{64}\.json$/.test(url.pathname)
      ) {
        throw new Error('The offline catalog URL is invalid.');
      }
      let complete = false;
      for (let attempt = 0; attempt < 120; attempt++) {
        if (await this.hasCompleteVersionCache(url.href)) {
          complete = true;
          break;
        }
        await this.bounded(new Promise<void>((resolve) => setTimeout(resolve, 250)), 1_000);
      }
      if (!complete)
        throw new Error(
          'Required assets are not fully cached for this version. Keep the page online and retry.',
        );
      if (revision !== this.revision || this.abort.signal.aborted) return;
      const controller = worker.controller;
      const index = await this.bounded(
        fetch(new URL('index.html', document.baseURI), { cache: 'no-store' }),
        30_000,
      );
      if (!index.ok)
        throw new Error('The controlled application index is unavailable. Reconnect and reload.');
      const served = new DOMParser().parseFromString(await index.text(), 'text/html');
      const servedCatalog = served.querySelector<HTMLMetaElement>(
        'meta[name="worldgen-offline-catalog"]',
      )?.content;
      if (
        !servedCatalog ||
        new URL(servedCatalog, document.baseURI).href !== url.href ||
        worker.controller !== controller
      ) {
        throw new Error(
          'The controlled application version changed. Reload before preparing offline support.',
        );
      }
      const runtime = await this.wasm.getRuntime();
      decodeTerrain(
        JSON.parse(await runtime.generateTerrainJson(JSON.stringify(READINESS_TERRAIN))),
        READINESS_REQUEST,
        READINESS_TERRAIN,
      );
      if (worker.controller !== controller)
        throw new Error('The service worker changed. Reload and prepare again.');
      this.setIfCurrent(
        revision,
        'ready',
        'Offline ready: this version’s complete asset cache and Local computation were verified. Clearing site data or browser storage eviction requires preparation again.',
      );
    } catch (error) {
      this.setIfCurrent(revision, 'failed', error instanceof Error ? error.message : String(error));
    } finally {
      release();
    }
  }

  async checkForUpdate(): Promise<void> {
    if (!this.swUpdate.isEnabled) return;
    try {
      await this.swUpdate.checkForUpdate();
    } catch {
      /* Network update checks must not invalidate an intact offline version. */
    }
  }

  prepareForReload(): void {
    this.reloadPending = true;
    this.revision++;
    this.state.set('preparing');
    this.detail.set('Reloading to prepare the new application version…');
    // Reload lets Angular assign the latest version without changing this live runtime.
    this.updateReady.set(false);
  }

  cancelReload(message: string): void {
    this.reloadPending = false;
    this.updateReady.set(true);
    this.state.set('failed');
    this.detail.set('Reload failed. Retry the update when no computation is running.');
    this.updateError.set(message);
  }

  private watchForUpdates(): void {
    if (!this.swUpdate.isEnabled) return;
    this.swUpdate.versionUpdates.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((event) => {
      if (event.type === 'VERSION_READY') {
        this.updateReady.set(true);
        this.updateVersion.set(event.latestVersion.hash);
        this.updateError.set(null);
      } else if (event.type === 'VERSION_INSTALLATION_FAILED') {
        this.updateError.set(event.error);
      } else if (event.type === 'VERSION_DETECTED') {
        this.updateError.set(null);
      }
    });
    this.swUpdate.unrecoverable.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((event) => {
      this.revision++;
      this.state.set('failed');
      this.detail.set(
        'Cached application assets are unavailable. Reconnect and reload to prepare again.',
      );
      this.updateError.set(event.reason);
    });
  }

  private async hasCompleteVersionCache(catalogUrl: string): Promise<boolean> {
    if (!globalThis.caches) return false;
    let found = false;
    for (const name of await caches.keys()) {
      const cache = await caches.open(name);
      const response = await cache.match(catalogUrl);
      if (!response) continue;
      found = true;
      const catalog: unknown = await response.json();
      if (typeof catalog !== 'object' || catalog === null)
        throw new Error('Invalid offline catalog.');
      const { version, assets } = catalog as { version?: unknown; assets?: unknown };
      if (
        typeof version !== 'string' ||
        !catalogUrl.endsWith('offline-assets.' + version + '.json') ||
        typeof assets !== 'object' ||
        assets === null ||
        Array.isArray(assets)
      )
        throw new Error('Invalid offline catalog.');
      const hashes = assets as Record<string, unknown>;
      const currentFiles = [
        ...document.querySelectorAll<HTMLScriptElement | HTMLLinkElement>(
          'script[src], link[rel="stylesheet"]',
        ),
      ].map(
        (element) =>
          new URL(
            element instanceof HTMLScriptElement ? element.src : element.href,
            document.baseURI,
          ).pathname,
      );
      if (
        !hashes['/index.html'] ||
        !hashes['/wasm/_framework/dotnet.js'] ||
        currentFiles.some((path) => !hashes[path])
      )
        return false;
      // Never merge incomplete caches from different versions. All required bytes
      // must exist in each cache containing this exact versioned catalog.
      const responses: [Response, string][] = [];
      for (const [path, expected] of Object.entries(hashes)) {
        if (
          !path.startsWith('/') ||
          path.startsWith('/api/') ||
          typeof expected !== 'string' ||
          !/^[0-9a-f]{40}$/.test(expected)
        )
          throw new Error('Invalid offline asset entry.');
        const cached = await cache.match(new URL(path, catalogUrl).href);
        if (!cached?.ok) return false;
        responses.push([cached, expected]);
      }
      for (const [cached, expected] of responses) {
        const digest = await crypto.subtle.digest('SHA-1', await cached.arrayBuffer());
        const actual = [...new Uint8Array(digest)]
          .map((byte) => byte.toString(16).padStart(2, '0'))
          .join('');
        if (actual !== expected) return false;
      }
    }
    return found;
  }

  private setIfCurrent(revision: number, state: OfflinePreparationState, detail: string): void {
    if (revision !== this.revision || this.abort.signal.aborted) return;
    this.state.set(state);
    this.detail.set(detail);
  }

  private bounded<T>(promise: Promise<T>, milliseconds: number): Promise<T> {
    if (this.abort.signal.aborted)
      return Promise.reject(new Error('Offline preparation was interrupted.'));
    return new Promise<T>((resolve, reject) => {
      const cleanup = () => {
        clearTimeout(timer);
        this.abort.signal.removeEventListener('abort', fail);
      };
      const fail = () => {
        cleanup();
        reject(new Error('Offline preparation was interrupted.'));
      };
      const timer = setTimeout(() => {
        cleanup();
        reject(new Error('Offline preparation timed out. Keep the page online and retry.'));
      }, milliseconds);
      this.abort.signal.addEventListener('abort', fail, { once: true });
      promise.then(
        (value) => {
          cleanup();
          resolve(value);
        },
        (error) => {
          cleanup();
          reject(error);
        },
      );
    });
  }
}
