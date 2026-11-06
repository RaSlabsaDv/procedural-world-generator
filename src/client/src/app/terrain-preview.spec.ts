import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { BufferGeometry, MeshLambertMaterial } from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TerrainPreview, TERRAIN_RENDERER_FACTORY } from './terrain-preview';
import { HeightMapRun } from './heightmap.models';

const state = {
  render: vi.fn(),
  dispose: vi.fn(),
  lose: vi.fn(),
  disconnect: vi.fn(),
  fail: false,
};

function run(): HeightMapRun {
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
    response: {
      result: {
        width: 2,
        height: 2,
        values: new Float32Array([0, 10, 20, 30]),
        biomes: new Uint8Array([0, 1, 2, 3]),
        resultVersion: 'heightmap-biomes-v1',
        algorithmVersion: 'value-noise-fbm-v1',
      },
      computeMs: 1,
      coreBuildId: 'test',
      workload: 'heightmap+biomes',
    },
    requestMs: 2,
    initMs: null,
  };
}

describe('terrain preview lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.fail = false;
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
          provide: TERRAIN_RENDERER_FACTORY,
          useValue: () => {
            if (state.fail) throw new Error('No WebGL');
            return {
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
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('disposes geometry, material, controls and renderer on replacement and destruction', async () => {
    const geometry = vi.spyOn(BufferGeometry.prototype, 'dispose');
    const material = vi.spyOn(MeshLambertMaterial.prototype, 'dispose');
    const controls = vi.spyOn(OrbitControls.prototype, 'dispose');
    const fixture = TestBed.createComponent(TerrainPreview);
    fixture.componentRef.setInput('run', run());
    await fixture.whenStable();
    expect(state.render).toHaveBeenCalled();
    expect(fixture.nativeElement.textContent).toContain('CPU');
    fixture.componentRef.setInput('run', run());
    await fixture.whenStable();
    expect(geometry).toHaveBeenCalledTimes(1);
    expect(material).toHaveBeenCalledTimes(1);
    expect(controls).toHaveBeenCalledTimes(1);
    expect(state.dispose).toHaveBeenCalledTimes(1);
    fixture.destroy();
    expect(geometry).toHaveBeenCalledTimes(2);
    expect(material).toHaveBeenCalledTimes(2);
    expect(state.disconnect).toHaveBeenCalledTimes(2);
    expect(state.dispose).toHaveBeenCalledTimes(2);
    expect(state.lose).toHaveBeenCalledTimes(1);
  });

  it('pauses rendering during computation without rebuilding the mesh', async () => {
    const geometry = vi.spyOn(BufferGeometry.prototype, 'dispose');
    const fixture = TestBed.createComponent(TerrainPreview);
    fixture.componentRef.setInput('run', run());
    fixture.componentRef.setInput('paused', true);
    await fixture.whenStable();
    expect(state.render).not.toHaveBeenCalled();
    fixture.componentRef.setInput('paused', false);
    await fixture.whenStable();
    expect(state.render).toHaveBeenCalled();
    expect(geometry).not.toHaveBeenCalled();
  });

  it('shows a recoverable presentation error when WebGL is unavailable', async () => {
    state.fail = true;
    const fixture = TestBed.createComponent(TerrainPreview);
    fixture.componentRef.setInput('run', run());
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('[role="alert"]').textContent).toContain('No WebGL');
    expect(fixture.nativeElement.textContent).toContain('2D view remains available');
  });
});
