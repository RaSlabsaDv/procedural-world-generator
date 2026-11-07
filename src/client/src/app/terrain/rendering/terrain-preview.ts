import {
  afterRenderEffect,
  Component,
  DestroyRef,
  ElementRef,
  inject,
  InjectionToken,
  input,
  NgZone,
  output,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { Mesh, MeshLambertMaterial, PerspectiveCamera, Scene, WebGLRenderer } from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TerrainRun } from '../data/terrain.models';
import { terrainForest } from './terrain-forest';
import { terrainGeometry } from './terrain-geometry';
import { terrainLighting } from './terrain-lighting';
import { loadTerrainSurfaces, terrainSurfaceMaterial, TerrainSurfaces } from './terrain-surfaces';

export const TERRAIN_SURFACES_FACTORY = new InjectionToken<() => TerrainSurfaces>(
  'Terrain surface textures',
  { providedIn: 'root', factory: () => loadTerrainSurfaces },
);

export const TERRAIN_RENDERER_FACTORY = new InjectionToken<
  (canvas: HTMLCanvasElement) => WebGLRenderer
>('Terrain WebGL renderer', {
  providedIn: 'root',
  factory: () => (canvas) => new WebGLRenderer({ canvas, antialias: true }),
});

@Component({
  selector: 'app-terrain-preview',
  template: `
    <div class="preview-actions">
      <button type="button" (click)="resetCamera()" [disabled]="paused() || !!problem()">
        Reset camera
      </button>
    </div>
    <div #container class="viewport">
      <canvas
        #canvas
        role="img"
        tabindex="0"
        [attr.aria-label]="'3D terrain for seed ' + run().request.seed"
      ></canvas>
    </div>
    @if (problem()) {
      <p role="alert">{{ problem() }} Numerical results remain available.</p>
    }
    @if (displayMs() !== null) {
      <p class="display-time">
        Textured 3D setup and first render submission (CPU): {{ displayMs()!.toFixed(2) }} ms
      </p>
    }
    @if (displayMs() === null && !problem()) {
      <p class="surface-loading">Preparing textured surface…</p>
    }
    @if (textureWaitMs() !== null) {
      <p class="texture-time">
        Surface asset wait: {{ textureWaitMs()!.toFixed(2) }} ms (excluded from CPU setup).
      </p>
    }
    <p>Drag to orbit · Scroll or pinch to zoom · Right-drag to pan.</p>
  `,
  styles: `
    .viewport {
      width: 100%;
      height: clamp(400px, 66vh, 780px);
      border-radius: 0.5rem;
      overflow: hidden;
      background: #18232d;
    }
    canvas {
      display: block;
      width: 100%;
      height: 100%;
      touch-action: none;
    }
    p {
      font-size: 0.7rem;
      color: #70867c;
    }
    .preview-actions {
      display: flex;
      justify-content: flex-end;
      margin-bottom: 0.5rem;
    }
    button {
      border: 1px solid #d5e0df;
      background: #fff;
      color: #526f60;
      padding: 0.3rem 0.6rem;
      border-radius: 0.35rem;
      cursor: pointer;
      font: inherit;
      font-size: 0.7rem;
    }
    button:focus-visible {
      outline: 3px solid #59a99b;
      outline-offset: 2px;
    }
    button:disabled {
      opacity: 0.5;
      cursor: wait;
    }
    @media (max-width: 650px) {
      .viewport {
        height: 400px;
      }
    }
  `,
})
export class TerrainPreview {
  readonly run = input.required<TerrainRun>();
  readonly paused = input(false);
  readonly displayMeasured = output<number>();
  private savedCamera:
    | { key: string; position: [number, number, number]; target: [number, number, number] }
    | undefined;
  protected readonly problem = signal<string | null>(null);
  protected readonly displayMs = signal<number | null>(null);
  protected readonly textureWaitMs = signal<number | null>(null);
  private readonly createSurfaces = inject(TERRAIN_SURFACES_FACTORY);
  private surfaces: TerrainSurfaces | undefined;
  private readonly canvas = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');
  private readonly container = viewChild.required<ElementRef<HTMLDivElement>>('container');
  private readonly zone = inject(NgZone);
  private readonly createRenderer = inject(TERRAIN_RENDERER_FACTORY);
  private releaseContext: (() => void) | undefined;
  private controls: OrbitControls | undefined;
  private draw: (() => void) | undefined;
  private resumeSetup: (() => void) | undefined;

  protected resetCamera(): void {
    if (this.paused() || this.problem()) return;
    this.controls?.reset();
    this.draw?.();
  }

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.surfaces?.dispose();
      this.releaseContext?.();
    });
    afterRenderEffect((cleanup) => {
      const run = this.run();
      const canvas = this.canvas().nativeElement;
      const container = this.container().nativeElement;
      this.problem.set(null);
      this.displayMs.set(null);
      this.textureWaitMs.set(null);
      const started = performance.now();
      const cameraKey = `${run.request.width}:${run.request.height}:${run.request.heightMultiplier}`;
      // Register cleanup before allocating: failures also release partially built scenes.
      let renderer: WebGLRenderer | undefined;
      let shaderFailed = false;
      let controls: OrbitControls | undefined;
      let camera: PerspectiveCamera | undefined;
      let observer: ResizeObserver | undefined;
      let forest: ReturnType<typeof terrainForest> | undefined;
      let lighting: ReturnType<typeof terrainLighting> | undefined;
      let mesh: Mesh<ReturnType<typeof terrainGeometry>, MeshLambertMaterial> | undefined;
      const contextLost = (event: Event) => {
        event.preventDefault();
        fail(new Error('The WebGL context was lost. Generate again to retry.'));
      };
      let disposed = false;
      const dispose = () => {
        if (disposed) return;
        disposed = true;
        this.draw = undefined;
        this.resumeSetup = undefined;
        observer?.disconnect();
        canvas.removeEventListener('webglcontextlost', contextLost);
        if (controls && camera)
          this.savedCamera = {
            key: cameraKey,
            position: camera.position.toArray() as [number, number, number],
            target: controls.target.toArray() as [number, number, number],
          };
        controls?.dispose();
        lighting?.dispose();
        forest?.dispose();
        mesh?.geometry.dispose();
        mesh?.material.dispose();
        renderer?.dispose();
        this.controls = undefined;
      };
      cleanup(dispose);
      const fail = (error: unknown) => {
        if (disposed) return;
        dispose();
        this.problem.set(
          '3D preview unavailable: ' + (error instanceof Error ? error.message : String(error)),
        );
      };
      this.zone.runOutsideAngular(async () => {
        try {
          renderer = this.createRenderer(canvas);
          this.releaseContext = () => renderer?.forceContextLoss();
          renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio || 1, 2));
          if (renderer.debug)
            renderer.debug.onShaderError = () => {
              shaderFailed = true;
            };
          const surfaceOwner = (this.surfaces ??= this.createSurfaces());
          const beforeWaitCpu = performance.now() - started;
          const waitStarted = performance.now();
          const textures = await surfaceOwner.ready.catch((error: unknown) => {
            if (!disposed && this.surfaces === surfaceOwner) {
              surfaceOwner.dispose();
              this.surfaces = undefined;
            }
            throw error;
          });
          if (disposed) return;
          this.textureWaitMs.set(performance.now() - waitStarted);
          const buildScene = () => {
            if (disposed) return;
            try {
              const resumed = performance.now();
              const scene = new Scene();
              camera = new PerspectiveCamera(45, 1, 0.01, 10000);
              mesh = new Mesh(
                terrainGeometry(run.response.result),
                terrainSurfaceMaterial(
                  textures,
                  run.response.result.width,
                  run.response.result.height,
                ),
              );
              scene.add(mesh);
              forest = terrainForest(run.response.result);
              for (const group of forest.groups) scene.add(group.trunks, group.crowns);
              lighting = terrainLighting(
                scene,
                renderer!,
                run.request,
                mesh,
                forest.groups.flatMap((group) => [group.trunks, group.crowns]),
              );
              // Bound the view by the request, not by sampled min/max: both modes share the same scale.
              const span = Math.max(
                run.request.width - 1,
                run.request.height - 1,
                run.request.heightMultiplier,
                1,
              );
              const targetHeight = run.request.heightMultiplier / 2;
              camera.near = span / 1000;
              camera.far = span * 20;
              controls = new OrbitControls(camera, canvas);
              this.controls = controls;
              controls.enabled = untracked(this.paused) === false;
              controls.target.set(0, targetHeight, 0);
              controls.enableDamping = false;
              controls.minDistance = span * 0.05;
              controls.maxDistance = span * 10;
              let sceneReady = false,
                setupCpuMs = 0,
                submitted = false;
              const render = () => {
                if (!sceneReady || disposed || untracked(this.paused) || untracked(this.problem))
                  return;
                const submissionStarted = performance.now();
                try {
                  renderer!.render(scene, camera!);
                  if (shaderFailed) throw new Error('Surface shader compilation failed.');
                  if (!submitted) {
                    submitted = true;
                    const cpuMs = setupCpuMs + performance.now() - submissionStarted;
                    this.displayMs.set(cpuMs);
                    this.displayMeasured.emit(cpuMs);
                  }
                } catch (error) {
                  fail(error);
                }
              };
              this.draw = render;
              const resize = () => {
                const width = Math.max(container.clientWidth, 1);
                const height = Math.max(container.clientHeight, 1);
                renderer!.setSize(width, height, false);
                camera!.aspect = width / height;
                camera!.updateProjectionMatrix();
                render();
              };
              const distance =
                span *
                1.05 *
                Math.max(1, container.clientHeight / Math.max(container.clientWidth, 1));
              camera.position.set(distance, targetHeight + distance, distance);
              controls.update();
              controls.saveState();
              if (this.savedCamera?.key === cameraKey) {
                camera.position.fromArray(this.savedCamera.position);
                controls.target.fromArray(this.savedCamera.target);
                controls.update();
              }
              controls.addEventListener('change', render);
              canvas.addEventListener('webglcontextlost', contextLost);
              observer = new ResizeObserver(resize);
              observer.observe(container);
              resize();
              setupCpuMs = beforeWaitCpu + performance.now() - resumed;
              sceneReady = true;
              render();
            } catch (error) {
              fail(error);
            }
          };
          if (untracked(this.paused)) this.resumeSetup = buildScene;
          else buildScene();
        } catch (error) {
          fail(error);
        }
      });
    });
    afterRenderEffect(() => {
      const paused = this.paused();
      if (this.controls) this.controls.enabled = !paused;
      if (!paused) {
        const setup = this.resumeSetup;
        this.resumeSetup = undefined;
        setup?.();
        this.draw?.();
      }
    });
  }
}
