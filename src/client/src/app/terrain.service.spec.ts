import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { TerrainService } from './terrain.service';
import { ALGORITHM_VERSION, HeightMapRequest } from './terrain.models';
import { testTerrain, testWire } from './terrain-test-fixture';
import { WasmHostService } from './wasm-host.service';

const request: HeightMapRequest = Object.freeze({
  seed: 42,
  width: 2,
  height: 2,
  noiseScale: 0.03,
  octaves: 4,
  heightMultiplier: 30,
  algorithmVersion: ALGORITHM_VERSION,
});
const terrain = testTerrain(request);
const response = () => testWire(terrain);

describe('TerrainService', () => {
  let service: TerrainService;
  let http: HttpTestingController;
  let generate: ReturnType<typeof vi.fn>;
  let runtime: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    generate = vi.fn(() => JSON.stringify(response()));
    runtime = vi.fn(async () => ({ generateTerrainJson: generate }));
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: WasmHostService,
          useValue: { getRuntime: runtime, getInfo: () => ({ initCount: 1, initMs: 123 }) },
        },
      ],
    });
    service = TestBed.inject(TerrainService);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  it('calls the local runtime once per array and reports initialization separately', async () => {
    const result = await service.local(terrain);
    expect(generate).toHaveBeenCalledExactlyOnceWith(JSON.stringify(terrain));
    expect(result.response.result.values).toBeInstanceOf(Float32Array);
    expect(result.initMs).toBe(123);
    expect(result.requestMs).toBeGreaterThanOrEqual(0);
    expect(result.request).toBe(request);
  });

  it('posts the unchanged snapshot and normalizes the remote response', async () => {
    const promise = service.remote(terrain);
    const pending = http.expectOne('/api/v1/terrains');
    expect(pending.request.body).toBe(terrain);
    expect(pending.request.method).toBe('POST');
    pending.flush(response());
    expect((await promise).response.result.values).toBeInstanceOf(Float32Array);
  });

  it('maps the same structured error from Local and Remote', async () => {
    const failure = { error: 'validation', fields: { width: 'Invalid width' } };
    generate.mockReturnValueOnce(JSON.stringify(failure));
    await expect(service.local(terrain)).rejects.toMatchObject({
      kind: 'validation',
      fields: failure.fields,
    });
    const promise = service.remote(terrain);
    http.expectOne('/api/v1/terrains').flush(failure, { status: 400, statusText: 'Bad Request' });
    await expect(promise).rejects.toMatchObject({ kind: 'validation', fields: failure.fields });
  });

  it('reports an unavailable API without invoking Local', async () => {
    const promise = service.remote(terrain);
    http.expectOne('/api/v1/terrains').error(new ProgressEvent('error'));
    await expect(promise).rejects.toMatchObject({ kind: 'availability' });
    expect(runtime).not.toHaveBeenCalled();
  });

  it('treats the service worker offline response as unavailable', async () => {
    const promise = service.remote(terrain);
    http.expectOne('/api/v1/terrains').flush(null, { status: 504, statusText: 'Gateway Timeout' });
    await expect(promise).rejects.toMatchObject({ kind: 'availability' });
    expect(runtime).not.toHaveBeenCalled();
  });

  it('rejects malformed local JSON and corrupt remote responses', async () => {
    generate.mockReturnValueOnce('{');
    await expect(service.local(terrain)).rejects.toMatchObject({ kind: 'protocol' });
    const promise = service.remote(terrain);
    http.expectOne('/api/v1/terrains').flush({ ...response(), computeMs: -1 });
    await expect(promise).rejects.toMatchObject({ kind: 'protocol' });
  });
});
