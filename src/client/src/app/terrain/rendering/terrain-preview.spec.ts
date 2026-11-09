import { testEmptyLakes } from '../testing/terrain-test-fixture';
import { testEmptyRivers } from '../testing/terrain-test-fixture';
import { testHydrology } from '../testing/terrain-test-fixture';
import { AppearanceSettingsService, REFERENCE_APPEARANCE } from './appearance-settings.service';
import { AtmosphereSettingsService } from './atmosphere-settings.service';
import { OceanSettingsService } from './ocean-settings.service';
import { SceneEnvironmentService } from './scene-environment.service';
import { DEFAULT_ENVIRONMENT_SETTINGS } from './scene-environment';
import { testSurfaceWeights } from '../testing/terrain-test-fixture';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import {
  DataArrayTexture,
  BufferGeometry,
  MeshLambertMaterial,
  ShaderMaterial,
  Texture,
  DirectionalLight,
  LightShadow,
  Scene,
  Mesh,
  InstancedMesh,
} from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import {
  TerrainPreview,
  OCEAN_NORMAL_FACTORY,
  TERRAIN_RENDERER_FACTORY,
  TERRAIN_MICRO_NORMALS_FACTORY,
  TERRAIN_SURFACES_FACTORY,
} from './terrain-preview';
import { testTerrain, testWire } from '../testing/terrain-test-fixture';
import { loadTerrainSurfaces } from './terrain-surfaces';
import { OperationLock } from '../../platform/operation-lock.service';
import { TerrainRun } from '../data/terrain.models';

const state = {
  create: vi.fn(),
  render: vi.fn(),
  dispose: vi.fn(),
  lose: vi.fn(),
  disconnect: vi.fn(),
  fail: false,
};

function run(): TerrainRun {
  return {
    request: {
      seed: 42,
      width: 2,
      height: 2,
      noiseScale: 0.03,
      octaves: 4,
      heightMultiplier: 30,
      algorithmVersion: 'value-noise-fbm-v1',
    },
    terrain: testTerrain(),
    response: {
      ...testWire(),
      result: {
        ...testWire().result,
        moisture: new Float32Array(4),
        temperature: new Float32Array(4),
        slope: new Float32Array(4),
        vegetationDensity: new Float32Array(4),
        trees: [],
        rocks: [],
        width: 2,
        height: 2,
        values: new Float32Array([0, 10, 20, 30]),
        lakes: testEmptyLakes(4),
        rivers: testEmptyRivers(),
        hydrology: testHydrology({
          width: 2,
          height: 2,
          values: [0, 10, 20, 30],
          biomes: [0, 1, 2, 3],
        }),
        biomes: new Uint8Array([0, 1, 2, 3]),
        surfaceWeights: Float32Array.from(testSurfaceWeights([0, 1, 2, 3])),
        resultVersion: 'landscape-ecology-v14',
        algorithmVersion: 'warped-ridged-hydraulic-v1',
      },
    },
    requestMs: 2,
    initMs: null,
  };
}

// Image promises are intentionally outside Angular's PendingTasks. Drain their microtasks
// before awaiting the signal-driven DOM update, without resolving controlled pending loads.
async function settlePreview(fixture: ComponentFixture<TerrainPreview>) {
  await fixture.whenStable();
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
  await fixture.whenStable();
}

describe('terrain preview lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.fail = false;
    vi.stubGlobal('matchMedia', () => ({
      matches: true,
      addEventListener() {},
      removeEventListener() {},
    }));
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        disconnect = state.disconnect;
      },
    );
    TestBed.configureTestingModule({
      imports: [TerrainPreview],
      providers: [
        {
          provide: TERRAIN_MICRO_NORMALS_FACTORY,
          useValue: () => ({ ready: Promise.resolve(new DataArrayTexture()), dispose: vi.fn() }),
        },
        {
          provide: OCEAN_NORMAL_FACTORY,
          useValue: () => ({ ready: Promise.resolve(new Texture()), dispose: vi.fn() }),
        },
        {
          provide: TERRAIN_SURFACES_FACTORY,
          useValue: () => ({
            ready: Promise.resolve({
              grass: new Texture(),
              soil: new Texture(),
              sand: new Texture(),
              rock: new Texture(),
              snow: new Texture(),
            }),
            dispose: vi.fn(),
          }),
        },
        {
          provide: TERRAIN_RENDERER_FACTORY,
          useValue: () => {
            state.create();
            if (state.fail) throw new Error('No WebGL');
            return {
              extensions: { has: () => false },
              getContext: () => ({}),
              shadowMap: { enabled: false, autoUpdate: true, needsUpdate: false },
              setPixelRatio() {},
              setSize() {},
              render: state.render,
              dispose: state.dispose,
              forceContextLoss: state.lose,
            };
          },
        },
      ],
    });
    const appearance = new AppearanceSettingsService();
    appearance.set(REFERENCE_APPEARANCE);
    TestBed.overrideProvider(AppearanceSettingsService, { useValue: appearance });
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('disposes geometry, material, controls and renderer on replacement and destruction', async () => {
    const errors = vi.spyOn(console, 'error');
    const geometry = vi.spyOn(BufferGeometry.prototype, 'dispose');
    const material = vi.spyOn(MeshLambertMaterial.prototype, 'dispose');
    const oceanMaterial = vi.spyOn(ShaderMaterial.prototype, 'dispose');
    const controls = vi.spyOn(OrbitControls.prototype, 'dispose');
    const fixture = TestBed.createComponent(TerrainPreview);
    fixture.componentRef.setInput('run', run());
    await settlePreview(fixture);
    expect(state.render).toHaveBeenCalled();
    expect(fixture.nativeElement.textContent).toContain('CPU');
    fixture.componentRef.setInput('run', run());
    await settlePreview(fixture);
    expect(geometry).toHaveBeenCalledTimes(3);
    expect(material).toHaveBeenCalledTimes(1);
    expect(oceanMaterial).toHaveBeenCalledTimes(2);
    expect(controls).toHaveBeenCalledTimes(1);
    expect(state.dispose).toHaveBeenCalledTimes(1);
    fixture.destroy();
    expect(geometry).toHaveBeenCalledTimes(6);
    expect(material).toHaveBeenCalledTimes(2);
    expect(oceanMaterial).toHaveBeenCalledTimes(4);
    expect(state.disconnect).toHaveBeenCalledTimes(2);
    expect(state.dispose).toHaveBeenCalledTimes(2);
    expect(state.lose).toHaveBeenCalledTimes(1);
    expect(errors).not.toHaveBeenCalled();
  });

  it('pauses rendering during computation without rebuilding the mesh', async () => {
    const geometry = vi.spyOn(BufferGeometry.prototype, 'dispose');
    const fixture = TestBed.createComponent(TerrainPreview);
    fixture.componentRef.setInput('run', run());
    fixture.componentRef.setInput('paused', true);
    await settlePreview(fixture);
    expect(state.render).not.toHaveBeenCalled();
    fixture.componentRef.setInput('paused', false);
    await settlePreview(fixture);
    expect(state.render).toHaveBeenCalled();
    expect(geometry).not.toHaveBeenCalled();
  });

  it('owns rock resources during paused setup, replacement and failed submission', async () => {
    const current = run();
    const withRock = {
      ...current,
      response: {
        ...current.response,
        result: {
          ...current.response.result,
          rocks: [
            {
              cellIndex: 0,
              x: 0.5,
              y: 9,
              z: 0.5,
              scaleX: 0.3,
              scaleY: 0.4,
              scaleZ: 0.25,
              rotation: 0,
              groundY: 10,
              kind: 0 as const,
              variant: 0 as const,
            },
          ],
        },
      },
    };
    const instances = vi.spyOn(InstancedMesh.prototype, 'dispose');
    const geometry = vi.spyOn(BufferGeometry.prototype, 'dispose');
    const material = vi.spyOn(MeshLambertMaterial.prototype, 'dispose');
    const fixture = TestBed.createComponent(TerrainPreview);
    fixture.componentRef.setInput('run', withRock);
    fixture.componentRef.setInput('paused', true);
    await settlePreview(fixture);
    expect(state.render).not.toHaveBeenCalled();
    expect(instances).not.toHaveBeenCalled();
    fixture.componentRef.setInput('paused', false);
    await settlePreview(fixture);
    const scene = state.render.mock.calls.at(-1)![0] as Scene;
    expect(scene.children.filter((child) => child instanceof InstancedMesh)).toHaveLength(1);
    state.render.mockImplementationOnce(() => {
      throw new Error('Submission failed');
    });
    fixture.componentRef.setInput('run', { ...withRock });
    await settlePreview(fixture);
    expect(fixture.nativeElement.textContent).toContain('Submission failed');
    expect(instances).toHaveBeenCalledTimes(2);
    expect(geometry).toHaveBeenCalledTimes(8);
    expect(material).toHaveBeenCalledTimes(4);
    fixture.destroy();
    expect(instances).toHaveBeenCalledTimes(2);
  });

  it('shows a recoverable presentation error when WebGL is unavailable', async () => {
    state.fail = true;
    const fixture = TestBed.createComponent(TerrainPreview);
    fixture.componentRef.setInput('run', run());
    await settlePreview(fixture);
    expect(fixture.nativeElement.querySelector('[role="alert"]').textContent).toContain('No WebGL');
    expect(fixture.nativeElement.textContent).toContain('Numerical results remain available');
  });
  it('discards obsolete setups and shares one texture owner across result replacements', async () => {
    let resolve!: (value: Record<'grass' | 'soil' | 'sand' | 'rock' | 'snow', Texture>) => void;
    const owner = {
      ready: new Promise<Record<'grass' | 'soil' | 'sand' | 'rock' | 'snow', Texture>>((yes) => {
        resolve = yes;
      }),
      dispose: vi.fn(),
    };
    const create = vi.fn(() => owner);
    TestBed.overrideProvider(TERRAIN_SURFACES_FACTORY, { useValue: create });
    const fixture = TestBed.createComponent(TerrainPreview);
    fixture.componentRef.setInput('run', run());
    await settlePreview(fixture);
    expect(state.render).not.toHaveBeenCalled();
    fixture.componentRef.setInput('run', run());
    await settlePreview(fixture);
    resolve({
      grass: new Texture(),
      soil: new Texture(),
      sand: new Texture(),
      rock: new Texture(),
      snow: new Texture(),
    });
    await settlePreview(fixture);
    expect(create).toHaveBeenCalledTimes(1);
    expect(state.render).toHaveBeenCalledTimes(1);
    expect(state.dispose).toHaveBeenCalledTimes(1);
    fixture.destroy();
    expect(owner.dispose).toHaveBeenCalledTimes(1);
  });

  it('defers WebGL/assets under the shared lock and blocks draws before input propagation', async () => {
    const createSurfaces = vi.fn(() => ({
      ready: Promise.resolve({
        grass: new Texture(),
        soil: new Texture(),
        sand: new Texture(),
        rock: new Texture(),
        snow: new Texture(),
      }),
      dispose: vi.fn(),
    }));
    TestBed.overrideProvider(TERRAIN_SURFACES_FACTORY, { useValue: createSurfaces });
    const lock = TestBed.inject(OperationLock);
    const release = lock.tryAcquire()!;
    const fixture = TestBed.createComponent(TerrainPreview);
    fixture.componentRef.setInput('run', run());
    await settlePreview(fixture);
    expect(state.create).not.toHaveBeenCalled();
    expect(createSurfaces).not.toHaveBeenCalled();
    expect(state.render).not.toHaveBeenCalled();
    release();
    await settlePreview(fixture);
    expect(state.create).toHaveBeenCalledTimes(1);
    expect(createSurfaces).toHaveBeenCalledTimes(1);
    expect(state.render).toHaveBeenCalled();
    state.render.mockClear();
    const releaseAgain = lock.tryAcquire()!;
    // Trigger a direct draw before Angular can propagate any paused input.
    (fixture.componentInstance as unknown as { draw: () => void }).draw();
    expect(state.render).not.toHaveBeenCalled();
    releaseAgain();
    await settlePreview(fixture);
    expect(state.render).toHaveBeenCalled();
  });

  it('defers foliage color allocation under the operation lock and reuses it on light edits', async () => {
    const color = vi.spyOn(InstancedMesh.prototype, 'setColorAt');
    const fixture = TestBed.createComponent(TerrainPreview);
    const value = run();
    fixture.componentRef.setInput('run', {
      ...value,
      response: {
        ...value.response,
        result: {
          ...value.response.result,
          trees: [
            { kind: 0, variant: 0, cellIndex: 0, x: 0.25, y: 1, z: 0.25, scale: 1, rotation: 0 },
          ],
        },
      },
    });
    const release = TestBed.inject(OperationLock).tryAcquire()!;
    try {
      await settlePreview(fixture);
      expect(color).not.toHaveBeenCalled();
      release();
      await settlePreview(fixture);
      const calls = color.mock.calls.length;
      expect(calls).toBeGreaterThan(0);
      TestBed.inject(SceneEnvironmentService).set({
        ...DEFAULT_ENVIRONMENT_SETTINGS,
        timeOfDayHours: 7,
      });
      await settlePreview(fixture);
      expect(color).toHaveBeenCalledTimes(calls);
    } finally {
      release();
      color.mockRestore();
    }
  });

  it('defers LOD uploads under the lock and resumes from the latest camera without changing shadows', async () => {
    const fixture = TestBed.createComponent(TerrainPreview),
      value = run();
    fixture.componentRef.setInput('run', {
      ...value,
      response: {
        ...value.response,
        result: {
          ...value.response.result,
          trees: [
            { kind: 0, variant: 0, cellIndex: 0, x: 0.5, y: 0, z: 0.5, scale: 1, rotation: 0 },
          ],
        },
      },
    });
    await settlePreview(fixture);
    const [scene, camera] = state.render.mock.calls.at(-1)! as [
      Scene,
      { position: { set: (x: number, y: number, z: number) => void } },
    ];
    camera.position.set(0, 0, 0);
    (fixture.componentInstance as unknown as { draw: () => void }).draw();
    const near = scene.getObjectByName('tree-lod-near-crown') as InstancedMesh;
    const far = scene.getObjectByName('tree-lod-far-crown') as InstancedMesh;
    const source = scene.getObjectByName('tree-lod-source-crown') as InstancedMesh;
    const sun = scene.children.find((o) => o instanceof DirectionalLight) as DirectionalLight;
    expect(near.count).toBe(1);
    expect(far.count).toBe(0);
    expect(source.castShadow).toBe(true);
    expect(near.castShadow || far.castShadow).toBe(false);
    expect(sun.shadow.camera.layers.test(source.layers)).toBe(true);
    sun.shadow.needsUpdate = false;
    const nearVersion = near.instanceMatrix.version,
      farVersion = far.instanceMatrix.version;
    const display = fixture.nativeElement.querySelector('.display-time').textContent;
    const release = TestBed.inject(OperationLock).tryAcquire()!;
    try {
      camera.position.set(0, 0, 500);
      (fixture.componentInstance as unknown as { draw: () => void }).draw();
      expect(near.instanceMatrix.version).toBe(nearVersion);
      expect(far.instanceMatrix.version).toBe(farVersion);
      camera.position.set(0, 0, 300);
      release();
      await settlePreview(fixture);
      expect(near.count).toBe(0);
      expect(far.count).toBe(1);
      expect(far.instanceMatrix.version).toBeGreaterThan(farVersion);
      expect(sun.shadow.needsUpdate).toBe(false);
      expect(fixture.nativeElement.querySelector('.display-time').textContent).toBe(display);
    } finally {
      release();
    }
  });

  it('defers appearance changes under the lock and reports unsupported HDR without rebuilding', async () => {
    const fixture = TestBed.createComponent(TerrainPreview);
    fixture.componentRef.setInput('run', run());
    await settlePreview(fixture);
    const scene = state.render.mock.calls.at(-1)![0] as Scene;
    const sun = scene.children.find((o) => o instanceof DirectionalLight) as DirectionalLight;
    sun.shadow.needsUpdate = false;
    const measured = fixture.nativeElement.querySelector('.display-time').textContent;
    const count = state.create.mock.calls.length;
    const release = TestBed.inject(OperationLock).tryAcquire()!;
    const appearance = TestBed.inject(AppearanceSettingsService);
    appearance.set({ ...REFERENCE_APPEARANCE, tone: 'aces', exposure: 0.5 });
    appearance.set({ ...REFERENCE_APPEARANCE, tone: 'aces', exposure: 1.25, grading: true });
    state.render.mockClear();
    await settlePreview(fixture);
    expect(state.render).not.toHaveBeenCalled();
    expect(fixture.nativeElement.querySelector('.finishing-warning')).toBeNull();
    release();
    await settlePreview(fixture);
    expect(fixture.nativeElement.querySelector('.finishing-warning').textContent).toContain(
      'Showing Reference',
    );
    expect(state.render.mock.calls.at(-1)![0]).toBe(scene);
    expect(state.create).toHaveBeenCalledTimes(count);
    expect(sun.shadow.needsUpdate).toBe(false);
    expect(fixture.nativeElement.querySelector('.display-time').textContent).toBe(measured);
    appearance.set(REFERENCE_APPEARANCE);
    await settlePreview(fixture);
    expect(fixture.nativeElement.querySelector('.finishing-warning')).toBeNull();
  });

  it('uses the latest appearance before first submission after an asset/pause wait', async () => {
    let resolve!: (textures: Record<'grass' | 'soil' | 'sand' | 'rock' | 'snow', Texture>) => void;
    TestBed.overrideProvider(TERRAIN_SURFACES_FACTORY, {
      useValue: () => ({ ready: new Promise((yes) => (resolve = yes)), dispose: vi.fn() }),
    });
    const context = vi.fn(() => {
      throw Error('Stale HDR setup');
    });
    TestBed.overrideProvider(TERRAIN_RENDERER_FACTORY, {
      useValue: () => ({
        shadowMap: { enabled: false, autoUpdate: true, needsUpdate: false },
        setPixelRatio() {},
        setSize() {},
        render: state.render,
        dispose: state.dispose,
        forceContextLoss: state.lose,
        getContext: context,
      }),
    });
    const appearance = TestBed.inject(AppearanceSettingsService);
    appearance.set({ ...REFERENCE_APPEARANCE, tone: 'aces', bloom: true });
    const fixture = TestBed.createComponent(TerrainPreview);
    fixture.componentRef.setInput('run', run());
    await settlePreview(fixture);
    fixture.componentRef.setInput('paused', true);
    appearance.set(REFERENCE_APPEARANCE);
    resolve({
      grass: new Texture(),
      soil: new Texture(),
      sand: new Texture(),
      rock: new Texture(),
      snow: new Texture(),
    });
    await settlePreview(fixture);
    expect(state.render).not.toHaveBeenCalled();
    fixture.componentRef.setInput('paused', false);
    await settlePreview(fixture);
    expect(context).not.toHaveBeenCalled();
    expect(state.render).toHaveBeenCalled();
    expect(fixture.nativeElement.querySelector('[role=alert]')).toBeNull();
  });

  it('defers scene preparation while paused and excludes texture/pause wait from CPU timing', async () => {
    let clock = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => clock);
    let resolve!: (value: Record<'grass' | 'soil' | 'sand' | 'rock' | 'snow', Texture>) => void;
    TestBed.overrideProvider(TERRAIN_SURFACES_FACTORY, {
      useValue: () => ({
        ready: new Promise<Record<'grass' | 'soil' | 'sand' | 'rock' | 'snow', Texture>>((yes) => {
          resolve = yes;
        }),
        dispose: vi.fn(),
      }),
    });
    const fixture = TestBed.createComponent(TerrainPreview);
    fixture.componentRef.setInput('run', run());
    fixture.componentRef.setInput('paused', true);
    await settlePreview(fixture);
    clock = 1000;
    resolve({
      grass: new Texture(),
      soil: new Texture(),
      sand: new Texture(),
      rock: new Texture(),
      snow: new Texture(),
    });
    await settlePreview(fixture);
    expect(
      (fixture.componentInstance as unknown as { controls: unknown }).controls,
    ).toBeUndefined();
    expect(state.render).not.toHaveBeenCalled();
    expect(fixture.nativeElement.querySelector('.display-time')).toBeNull();
    clock = 2000;
    fixture.componentRef.setInput('paused', false);
    await settlePreview(fixture);
    expect(state.render).toHaveBeenCalled();
    expect(fixture.nativeElement.querySelector('.texture-time').textContent).toContain('1000.00');
    expect(fixture.nativeElement.querySelector('.display-time').textContent).toContain('0.00');
  });

  it('does not build a scene when assets finish after the preview is destroyed', async () => {
    let resolve!: (value: Record<'grass' | 'soil' | 'sand' | 'rock' | 'snow', Texture>) => void;
    const owner = {
      ready: new Promise<Record<'grass' | 'soil' | 'sand' | 'rock' | 'snow', Texture>>((yes) => {
        resolve = yes;
      }),
      dispose: vi.fn(),
    };
    TestBed.overrideProvider(TERRAIN_SURFACES_FACTORY, { useValue: () => owner });
    const fixture = TestBed.createComponent(TerrainPreview);
    fixture.componentRef.setInput('run', run());
    await settlePreview(fixture);
    fixture.destroy();
    resolve({
      grass: new Texture(),
      soil: new Texture(),
      sand: new Texture(),
      rock: new Texture(),
      snow: new Texture(),
    });
    await Promise.resolve();
    expect(state.render).not.toHaveBeenCalled();
    expect(owner.dispose).toHaveBeenCalledTimes(1);
    expect(state.dispose).toHaveBeenCalledTimes(1);
  });

  it('retains numeric results and emits no display success on texture load failure', async () => {
    let reject!: (error: Error) => void;
    TestBed.overrideProvider(TERRAIN_SURFACES_FACTORY, {
      useValue: () => ({
        ready: new Promise<never>((_, no) => {
          reject = no;
        }),
        dispose: vi.fn(),
      }),
    });
    const fixture = TestBed.createComponent(TerrainPreview);
    fixture.componentRef.setInput('run', run());
    await settlePreview(fixture);
    reject(new Error('Surface asset decode failed'));
    await Promise.resolve();
    await settlePreview(fixture);
    expect(fixture.nativeElement.querySelector('[role=alert]').textContent).toContain(
      'Surface asset decode failed',
    );
    expect(fixture.nativeElement.textContent).toContain('Numerical results remain available');
    expect(fixture.nativeElement.querySelector('.display-time')).toBeNull();
    expect(state.dispose).toHaveBeenCalledTimes(1);
  });

  it('retries a failed asset owner for the next result', async () => {
    let reject!: (error: Error) => void;
    const failed = {
      ready: new Promise<never>((_, no) => {
        reject = no;
      }),
      dispose: vi.fn(),
    };
    const recovered = {
      ready: Promise.resolve({
        grass: new Texture(),
        soil: new Texture(),
        sand: new Texture(),
        rock: new Texture(),
        snow: new Texture(),
      }),
      dispose: vi.fn(),
    };
    const create = vi.fn().mockReturnValueOnce(failed).mockReturnValueOnce(recovered);
    TestBed.overrideProvider(TERRAIN_SURFACES_FACTORY, { useValue: create });
    const fixture = TestBed.createComponent(TerrainPreview);
    fixture.componentRef.setInput('run', run());
    await settlePreview(fixture);
    reject(new Error('Temporary decode failure'));
    await settlePreview(fixture);
    expect(fixture.nativeElement.querySelector('[role=alert]')).not.toBeNull();
    fixture.componentRef.setInput('run', run());
    await settlePreview(fixture);
    expect(create).toHaveBeenCalledTimes(2);
    expect(failed.dispose).toHaveBeenCalledTimes(1);
    expect(fixture.nativeElement.querySelector('[role=alert]')).toBeNull();
    expect(fixture.nativeElement.querySelector('.display-time')).not.toBeNull();
  });

  it('retries a failed sand download with a complete five-texture owner', async () => {
    let attempts = 0;
    const loaded: Texture[] = [];
    const load = vi.fn(async (url: string) => {
      if (attempts === 1 && url.endsWith('/sand.png')) throw new Error('Sand download failed');
      const texture = new Texture();
      loaded.push(texture);
      vi.spyOn(texture, 'dispose');
      return texture;
    });
    TestBed.overrideProvider(TERRAIN_SURFACES_FACTORY, {
      useValue: () => {
        attempts++;
        return loadTerrainSurfaces(load);
      },
    });
    const fixture = TestBed.createComponent(TerrainPreview);
    fixture.componentRef.setInput('run', run());
    await settlePreview(fixture);
    expect(fixture.nativeElement.textContent).toContain('Unable to load sand surface texture');
    expect(state.render).not.toHaveBeenCalled();
    expect(loaded).toHaveLength(4);
    for (const texture of loaded) expect(texture.dispose).toHaveBeenCalledTimes(1);
    fixture.componentRef.setInput('run', run());
    await settlePreview(fixture);
    expect(fixture.nativeElement.querySelector('[role=alert]')).toBeNull();
    expect(state.render).toHaveBeenCalled();
    expect(load).toHaveBeenCalledTimes(10);
    expect(loaded).toHaveLength(9);
    fixture.destroy();
    for (const texture of loaded) expect(texture.dispose).toHaveBeenCalledTimes(1);
  });

  it('reports shader failure and releases the renderer without emitting display success', async () => {
    const disposeShadow = vi.spyOn(LightShadow.prototype, 'dispose');
    const debug = { onShaderError: () => {} };
    const dispose = vi.fn();
    TestBed.overrideProvider(TERRAIN_RENDERER_FACTORY, {
      useValue: () => ({
        debug,
        shadowMap: { enabled: false, autoUpdate: true, needsUpdate: false },
        setPixelRatio() {},
        setSize() {},
        render() {
          debug.onShaderError();
        },
        dispose,
        forceContextLoss() {},
      }),
    });
    const fixture = TestBed.createComponent(TerrainPreview);
    fixture.componentRef.setInput('run', run());
    await settlePreview(fixture);
    expect(fixture.nativeElement.querySelector('[role=alert]').textContent).toContain(
      'Surface shader compilation failed',
    );
    expect(fixture.nativeElement.querySelector('.display-time')).toBeNull();
    expect(dispose).toHaveBeenCalledTimes(1);
    expect(disposeShadow).toHaveBeenCalledTimes(1);
  });

  it('disposes scene shadows on replacement and destruction', async () => {
    const disposeShadow = vi.spyOn(LightShadow.prototype, 'dispose');
    const fixture = TestBed.createComponent(TerrainPreview);
    fixture.componentRef.setInput('run', run());
    await settlePreview(fixture);
    const scene = state.render.mock.calls[0][0] as Scene;
    const sun = scene.children.find(
      (object) => object instanceof DirectionalLight,
    ) as DirectionalLight;
    expect(sun.castShadow).toBe(true);
    fixture.componentRef.setInput('run', run());
    await settlePreview(fixture);
    expect(disposeShadow).toHaveBeenCalledTimes(1);
    fixture.destroy();
    expect(disposeShadow).toHaveBeenCalledTimes(2);
  });

  it('preserves the camera on same-scale replacement and resets it on request', async () => {
    const fixture = TestBed.createComponent(TerrainPreview);
    fixture.componentRef.setInput('run', run());
    await settlePreview(fixture);
    const component = fixture.componentInstance as unknown as { controls: OrbitControls };
    const controls = component.controls;
    const initial = controls.object.position.clone();
    controls.object.position.set(31, 47, 59);
    controls.target.set(2, 3, 4);
    controls.update();
    fixture.componentRef.setInput('run', run());
    await settlePreview(fixture);
    expect(component.controls.object.position.distanceTo(controls.object.position)).toBeLessThan(
      1e-10,
    );
    expect(component.controls.target.distanceTo(controls.target)).toBeLessThan(1e-10);
    (fixture.nativeElement.querySelector('button') as HTMLButtonElement).click();
    await settlePreview(fixture);
    expect(component.controls.object.position.distanceTo(initial)).toBeLessThan(1e-10);
    fixture.componentRef.setInput('paused', true);
    await settlePreview(fixture);
    expect(component.controls.enabled).toBe(false);
    expect((fixture.nativeElement.querySelector('button') as HTMLButtonElement).disabled).toBe(
      true,
    );
  });
  it('updates the environment without rebuilding, defers while busy, and retains it on replacement', async () => {
    const fixture = TestBed.createComponent(TerrainPreview);
    const measured = vi.fn();
    fixture.componentInstance.displayMeasured.subscribe(measured);
    fixture.componentRef.setInput('run', run());
    await fixture.whenStable();
    const environment = TestBed.inject(SceneEnvironmentService);
    const scene = state.render.mock.calls.at(-1)![0] as Scene;
    const sun = scene.children.find((o) => o instanceof DirectionalLight) as DirectionalLight;
    const createCount = state.create.mock.calls.length;
    const release = TestBed.inject(OperationLock).tryAcquire()!;
    await fixture.whenStable();
    state.render.mockClear();
    environment.set({ ...DEFAULT_ENVIRONMENT_SETTINGS, timeOfDayHours: 7 });
    environment.set({ ...DEFAULT_ENVIRONMENT_SETTINGS, timeOfDayHours: 0 });
    await fixture.whenStable();
    expect(sun.intensity).toBe(2.35);
    expect(state.render).not.toHaveBeenCalled();
    release();
    await fixture.whenStable();
    expect(sun.intensity).toBe(0);
    expect(state.create).toHaveBeenCalledTimes(createCount);
    expect(measured).toHaveBeenCalledTimes(1);
    fixture.componentRef.setInput('run', { ...run(), requestMs: 3 });
    await fixture.whenStable();
    const next = state.render.mock.calls.at(-1)![0] as Scene;
    expect(
      (next.children.find((o) => o instanceof DirectionalLight) as DirectionalLight).intensity,
    ).toBe(0);
    fixture.destroy();
    state.render.mockClear();
    environment.set(DEFAULT_ENVIRONMENT_SETTINGS);
    await TestBed.tick();
    expect(state.render).not.toHaveBeenCalled();
  });
  it('retries a failed normal owner and retains mesh/camera when only water controls change', async () => {
    const failed = {
      ready: Promise.resolve(new Texture()).then(() => {
        throw Error('Water tile missing');
      }),
      dispose: vi.fn(),
    };
    // Attach rejection handling before Angular setup to avoid an unhandled rejected promise.
    void failed.ready.catch(() => {});
    const ready = { ready: Promise.resolve(new Texture()), dispose: vi.fn() };
    const factory = vi.fn().mockReturnValueOnce(failed).mockReturnValue(ready);
    TestBed.overrideProvider(OCEAN_NORMAL_FACTORY, { useValue: factory });
    const fixture = TestBed.createComponent(TerrainPreview);
    fixture.componentRef.setInput('run', run());
    await settlePreview(fixture);
    expect(fixture.nativeElement.textContent).toContain('Water tile missing');
    expect(failed.dispose).toHaveBeenCalledTimes(1);
    fixture.componentRef.setInput('run', { ...run() });
    await settlePreview(fixture);
    expect(fixture.nativeElement.textContent).not.toContain('Water tile missing');
    const scene = state.render.mock.calls.at(-1)![0] as Scene;
    const ocean = scene.children.find((c) => c.name === 'ocean-presentation-v1') as Mesh;
    const geometry = ocean.geometry,
      createCount = state.create.mock.calls.length;
    TestBed.inject(OceanSettingsService).set({ color: '#11aa99', turbidity: 1, foam: 0.2 });
    await fixture.whenStable();
    expect(ocean.geometry).toBe(geometry);
    expect(state.create).toHaveBeenCalledTimes(createCount);
    expect((ocean.material as ShaderMaterial).uniforms['turbidity'].value).toBe(1);
    fixture.destroy();
    expect(ready.dispose).toHaveBeenCalledTimes(1);
  });
  it('defers atmosphere settings under the lock and preserves scene, camera and shadows', async () => {
    const fixture = TestBed.createComponent(TerrainPreview);
    fixture.componentRef.setInput('run', run());
    await settlePreview(fixture);
    const [scene, camera] = state.render.mock.calls.at(-1)! as [Scene, unknown];
    const sky = scene.getObjectByName('atmosphere-v1') as Mesh<BufferGeometry, ShaderMaterial>;
    const sun = scene.children.find((c) => c instanceof DirectionalLight) as DirectionalLight;
    const geometry = vi.spyOn(BufferGeometry.prototype, 'dispose');
    const createCount = state.create.mock.calls.length;
    sun.shadow.needsUpdate = false;
    const release = TestBed.inject(OperationLock).tryAcquire()!;
    state.render.mockClear();
    TestBed.inject(AtmosphereSettingsService).set({ enabled: false, haze: 0.5, valleyFog: 0.4 });
    await settlePreview(fixture);
    expect(state.render).not.toHaveBeenCalled();
    expect(sky.visible).toBe(true);
    release();
    await settlePreview(fixture);
    expect(sky.visible).toBe(false);
    expect(sky.material.uniforms['atmosphereHaze'].value).toBe(0.5);
    expect(state.render.mock.calls.at(-1)![0]).toBe(scene);
    expect(state.render.mock.calls.at(-1)![1]).toBe(camera);
    expect(state.create).toHaveBeenCalledTimes(createCount);
    expect(sun.shadow.needsUpdate).toBe(false);
    expect(geometry).not.toHaveBeenCalled();
    fixture.destroy();
  });
  it('retries microdetail loading and reuses it across sun edits and scene replacements', async () => {
    const failed = { ready: Promise.reject(Error('microdetail unavailable')), dispose: vi.fn() };
    void failed.ready.catch(() => {});
    const normal = new DataArrayTexture(),
      ready = { ready: Promise.resolve(normal), dispose: vi.fn() },
      create = vi.fn().mockReturnValueOnce(failed).mockReturnValue(ready);
    TestBed.overrideProvider(TERRAIN_MICRO_NORMALS_FACTORY, { useValue: create });
    const fixture = TestBed.createComponent(TerrainPreview);
    fixture.componentRef.setInput('run', run());
    await settlePreview(fixture);
    expect(fixture.nativeElement.textContent).toContain('microdetail unavailable');
    expect(failed.dispose).toHaveBeenCalledTimes(1);
    fixture.componentRef.setInput('run', run());
    await settlePreview(fixture);
    expect(fixture.nativeElement.querySelector('[role=alert]')).toBeNull();
    const scene = state.render.mock.calls.at(-1)![0] as Scene;
    TestBed.inject(SceneEnvironmentService).set({
      ...DEFAULT_ENVIRONMENT_SETTINGS,
      timeOfDayHours: 9,
    });
    await settlePreview(fixture);
    expect(state.render.mock.calls.at(-1)![0]).toBe(scene);
    expect(create).toHaveBeenCalledTimes(2);
    fixture.componentRef.setInput('run', run());
    await settlePreview(fixture);
    expect(create).toHaveBeenCalledTimes(2);
    expect(ready.dispose).not.toHaveBeenCalled();
    fixture.destroy();
    expect(ready.dispose).toHaveBeenCalledTimes(1);
  });
  function grassRun(): TerrainRun {
    const current = run();
    const surfaceWeights = new Float32Array(20);
    for (let i = 0; i < 4; i++) surfaceWeights[i * 5] = 1;
    return {
      ...current,
      request: { ...current.request, seed: 9 },
      response: {
        ...current.response,
        result: {
          ...current.response.result,
          values: new Float32Array(4).fill(5),
          biomes: new Uint8Array(4).fill(1),
          surfaceWeights,
        },
      },
    };
  }
  it('defers grass setup under the operation lock and preserves buffers on environment edits', async () => {
    const bounds = vi.spyOn(InstancedMesh.prototype, 'computeBoundingSphere'),
      release = TestBed.inject(OperationLock).tryAcquire()!;
    const fixture = TestBed.createComponent(TerrainPreview);
    fixture.componentRef.setInput('run', grassRun());
    const measured = vi.fn();
    fixture.componentInstance.displayMeasured.subscribe(measured);
    await settlePreview(fixture);
    expect(bounds).not.toHaveBeenCalled();
    release();
    await settlePreview(fixture);
    const scene = state.render.mock.calls.at(-1)![0] as Scene,
      grass = scene.getObjectByName('grass-presentation-v1') as InstancedMesh;
    expect(grass).toBeDefined();
    const data = grass.instanceMatrix.array,
      geometry = vi.spyOn(grass.geometry, 'dispose'),
      material = vi.spyOn(grass.material as MeshLambertMaterial, 'dispose');
    TestBed.inject(SceneEnvironmentService).set({
      ...DEFAULT_ENVIRONMENT_SETTINGS,
      timeOfDayHours: 9,
    });
    await settlePreview(fixture);
    expect(scene.getObjectByName('grass-presentation-v1')).toBe(grass);
    expect(grass.instanceMatrix.array).toBe(data);
    expect(geometry).not.toHaveBeenCalled();
    expect(measured).toHaveBeenCalledTimes(1);
    fixture.componentRef.setInput('run', grassRun());
    await settlePreview(fixture);
    expect(geometry).toHaveBeenCalledTimes(1);
    expect(material).toHaveBeenCalledTimes(1);
    fixture.destroy();
  });
  it('releases partially constructed grass after a transform failure', async () => {
    const matrix = vi.spyOn(InstancedMesh.prototype, 'setMatrixAt').mockImplementationOnce(() => {
      throw Error('Grass matrix failure');
    });
    const geometry = vi.spyOn(BufferGeometry.prototype, 'dispose'),
      material = vi.spyOn(MeshLambertMaterial.prototype, 'dispose');
    const fixture = TestBed.createComponent(TerrainPreview);
    fixture.componentRef.setInput('run', grassRun());
    await settlePreview(fixture);
    expect(fixture.nativeElement.textContent).toContain('Grass matrix failure');
    expect(geometry).toHaveBeenCalledTimes(3);
    expect(material).toHaveBeenCalledTimes(2);
    fixture.destroy();
    expect(geometry).toHaveBeenCalledTimes(3);
    matrix.mockRestore();
  });
});
