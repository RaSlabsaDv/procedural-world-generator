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
import {
  AmbientLight,
  Color,
  DirectionalLight,
  Mesh,
  MeshLambertMaterial,
  PerspectiveCamera,
  Scene,
  WebGLRenderer,
} from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TerrainRun } from './terrain.models';
import { terrainGeometry } from './terrain-geometry';

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
        3D setup and first render submission (CPU): {{ displayMs()!.toFixed(2) }} ms
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
  private readonly canvas = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');
  private readonly container = viewChild.required<ElementRef<HTMLDivElement>>('container');
  private readonly zone = inject(NgZone);
  private readonly createRenderer = inject(TERRAIN_RENDERER_FACTORY);
  private releaseContext: (() => void) | undefined;
  private controls: OrbitControls | undefined;
  private draw: (() => void) | undefined;

  protected resetCamera(): void {
    if (this.paused() || this.problem()) return;
    this.controls?.reset();
    this.draw?.();
  }

  constructor() {
    inject(DestroyRef).onDestroy(() => this.releaseContext?.());
    afterRenderEffect((cleanup) => {
      const run = this.run();
      const canvas = this.canvas().nativeElement;
      const container = this.container().nativeElement;
      this.problem.set(null);
      this.displayMs.set(null);
      const started = performance.now();
      const cameraKey = `${run.request.width}:${run.request.height}:${run.request.heightMultiplier}`;
      // Register cleanup before allocating: failures also release partially built scenes.
      let renderer: WebGLRenderer | undefined;
      let controls: OrbitControls | undefined;
      let camera: PerspectiveCamera | undefined;
      let observer: ResizeObserver | undefined;
      let mesh: Mesh<ReturnType<typeof terrainGeometry>, MeshLambertMaterial> | undefined;
      const contextLost = (event: Event) => {
        event.preventDefault();
        this.problem.set('The WebGL context was lost. Generate again to retry.');
      };
      let disposed = false;
      const dispose = () => {
        if (disposed) return;
        disposed = true;
        this.draw = undefined;
        observer?.disconnect();
        canvas.removeEventListener('webglcontextlost', contextLost);
        if (controls && camera)
          this.savedCamera = {
            key: cameraKey,
            position: camera.position.toArray() as [number, number, number],
            target: controls.target.toArray() as [number, number, number],
          };
        controls?.dispose();
        mesh?.geometry.dispose();
        mesh?.material.dispose();
        renderer?.dispose();
        this.controls = undefined;
      };
      cleanup(dispose);
      this.zone.runOutsideAngular(() => {
        try {
          renderer = this.createRenderer(canvas);
          this.releaseContext = () => renderer?.forceContextLoss();
          renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio || 1, 2));
          const scene = new Scene();
          scene.background = new Color(0x18232d);
          camera = new PerspectiveCamera(45, 1, 0.01, 10000);
          mesh = new Mesh(
            terrainGeometry(run.response.result),
            new MeshLambertMaterial({ vertexColors: true }),
          );
          scene.add(mesh);
          scene.add(new AmbientLight(0xffffff, 2));
          const sunlight = new DirectionalLight(0xffffff, 3);
          sunlight.position.set(-1, 2, 1);
          scene.add(sunlight);
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
          const render = () => {
            if (!untracked(this.paused) && !untracked(this.problem))
              renderer!.render(scene, camera!);
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
            span * 0.8 * Math.max(1, container.clientHeight / Math.max(container.clientWidth, 1));
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
          const displayMs = performance.now() - started;
          this.displayMs.set(displayMs);
          this.displayMeasured.emit(displayMs);
        } catch (error) {
          dispose();
          this.problem.set(
            '3D preview unavailable: ' + (error instanceof Error ? error.message : String(error)),
          );
        }
      });
    });
    afterRenderEffect(() => {
      const paused = this.paused();
      if (this.controls) this.controls.enabled = !paused;
      if (!paused) this.draw?.();
    });
  }
}
