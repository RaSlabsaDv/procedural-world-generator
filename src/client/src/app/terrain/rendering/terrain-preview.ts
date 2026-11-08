import { AtmosphereSettings, AtmosphereSettingsService } from './atmosphere-settings.service';
import { OceanSettings, OceanSettingsService } from './ocean-settings.service';
import { OceanAnimationService } from './ocean-animation.service';
import { loadOceanNormal } from './ocean-normal';
import { OperationLock } from '../../platform/operation-lock.service';
import { SceneEnvironmentService } from './scene-environment.service';
import { SceneEnvironmentSnapshot } from './scene-environment';
import { terrainScene } from './terrain-scene';
import {
  afterRenderEffect,
  Component,
  computed,
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
import { PerspectiveCamera, Scene, WebGLRenderer } from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TerrainRun } from '../data/terrain.models';
import { loadTerrainSurfaces, TerrainSurfaces } from './terrain-surfaces';

export const TERRAIN_SURFACES_FACTORY = new InjectionToken<() => TerrainSurfaces>(
  'Terrain surface textures',
  { providedIn: 'root', factory: () => loadTerrainSurfaces },
);

export const OCEAN_NORMAL_FACTORY = new InjectionToken<typeof loadOceanNormal>(
  'Ocean normal texture',
  { providedIn: 'root', factory: () => loadOceanNormal },
);

export const TERRAIN_RENDERER_FACTORY = new InjectionToken<
  (canvas: HTMLCanvasElement) => WebGLRenderer
>('Terrain WebGL renderer', {
  providedIn: 'root',
  factory: () => (canvas) => new WebGLRenderer({ canvas, antialias: true }),
});

@Component({
  selector: 'app-terrain-preview',
  templateUrl: './terrain-preview.html',
  styleUrl: './terrain-preview.css',
})
export class TerrainPreview {
  readonly run = input.required<TerrainRun>();
  readonly paused = input(false);
  private readonly operations = inject(OperationLock);
  private readonly environment = inject(SceneEnvironmentService);
  private readonly atmosphere = inject(AtmosphereSettingsService);
  private applyAtmosphere: ((settings: AtmosphereSettings) => void) | undefined;
  private readonly water = inject(OceanSettingsService);
  private readonly animation = inject(OceanAnimationService);
  private readonly createNormal = inject(OCEAN_NORMAL_FACTORY);
  private normalOwner: ReturnType<typeof loadOceanNormal> | undefined;
  private applyWater: ((settings: OceanSettings) => void) | undefined;
  private applyEnvironment: ((snapshot: SceneEnvironmentSnapshot) => boolean) | undefined;
  private readonly isPaused = computed(() => this.paused() || this.operations.busy());
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
    if (this.isPaused() || this.problem()) return;
    this.controls?.reset();
    this.draw?.();
  }

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.normalOwner?.dispose();
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
      const cameraKey = `${run.request.width}:${run.request.height}:${run.request.heightMultiplier}`;
      // Register cleanup before allocating: failures also release partially built scenes.
      let renderer: WebGLRenderer | undefined;
      let shaderFailed = false;
      let controls: OrbitControls | undefined;
      let camera: PerspectiveCamera | undefined;
      let observer: ResizeObserver | undefined;
      let content: ReturnType<typeof terrainScene> | undefined;
      const contextLost = (event: Event) => {
        event.preventDefault();
        fail(new Error('The WebGL context was lost. Generate again to retry.'));
      };
      let unregisterAnimation: (() => void) | undefined;
      let visibility: IntersectionObserver | undefined;
      let visible = true;
      let disposed = false;
      const dispose = () => {
        if (disposed) return;
        disposed = true;
        this.draw = undefined;
        this.applyEnvironment = undefined;
        this.applyWater = undefined;
        this.applyAtmosphere = undefined;
        unregisterAnimation?.();
        visibility?.disconnect();
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
        content?.dispose();
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
      const prepare = () =>
        this.zone.runOutsideAngular(async () => {
          if (disposed) return;
          const started = performance.now();
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
            const hasOcean = run.response.result.biomes.includes(0);
            let normal: Awaited<ReturnType<typeof loadOceanNormal>['ready']> | undefined;
            if (hasOcean) {
              const owner = (this.normalOwner ??= this.createNormal());
              normal = await owner.ready.catch((error: unknown) => {
                if (!disposed && this.normalOwner === owner) {
                  owner.dispose();
                  this.normalOwner = undefined;
                }
                throw error;
              });
            }
            if (disposed) return;
            this.textureWaitMs.set(performance.now() - waitStarted);
            const buildScene = () => {
              if (disposed) return;
              try {
                const resumed = performance.now();
                const scene = new Scene();
                camera = new PerspectiveCamera(45, 1, 0.01, 10000);
                content = terrainScene(
                  scene,
                  renderer!,
                  run.request,
                  run.response.result,
                  textures,
                  untracked(this.environment.snapshot),
                  normal
                    ? {
                        seaLevel: run.terrain.seaLevel,
                        normal,
                        settings: untracked(this.water.settings),
                      }
                    : undefined,
                  untracked(this.atmosphere.settings),
                );
                this.applyEnvironment = content.updateEnvironment;
                this.applyWater = content.updateWater;
                this.applyAtmosphere = content.updateAtmosphere;
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
                controls.enabled = untracked(this.isPaused) === false;
                controls.target.set(0, targetHeight, 0);
                controls.enableDamping = false;
                controls.minDistance = span * 0.05;
                controls.maxDistance = span * 10;
                let sceneReady = false,
                  setupCpuMs = 0,
                  submitted = false;
                const render = () => {
                  if (
                    !sceneReady ||
                    disposed ||
                    untracked(this.isPaused) ||
                    untracked(this.problem) ||
                    !visible ||
                    document.hidden
                  )
                    return;
                  const submissionStarted = performance.now();
                  try {
                    content!.waterTime(this.animation.time);
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
                const resize = () => {
                  if (disposed || untracked(this.isPaused)) return;
                  const width = Math.max(container.clientWidth, 1);
                  const height = Math.max(container.clientHeight, 1);
                  renderer!.setSize(width, height, false);
                  camera!.aspect = width / height;
                  camera!.updateProjectionMatrix();
                  render();
                };
                this.draw = resize;
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
                if (content.hasOcean) {
                  if (typeof IntersectionObserver !== 'undefined') {
                    visibility = new IntersectionObserver((entries) => {
                      visible = entries[0]?.isIntersecting ?? false;
                      this.animation.refresh();
                      if (visible) render();
                    });
                    visibility.observe(container);
                  }
                  unregisterAnimation = this.animation.register(
                    () =>
                      !disposed && visible && !untracked(this.isPaused) && !untracked(this.problem),
                    () => render(),
                  );
                }
              } catch (error) {
                fail(error);
              }
            };
            if (untracked(this.isPaused)) this.resumeSetup = buildScene;
            else buildScene();
          } catch (error) {
            fail(error);
          }
        });
      // The shared lock is read directly: input propagation may lag behind acquisition.
      // Defer WebGL and asset setup too, so none starts during experiment collection.
      if (untracked(this.operations.busy))
        this.resumeSetup = () => {
          void prepare();
        };
      else void prepare();
    });
    afterRenderEffect(() => {
      const paused = this.isPaused();
      const environment = this.environment.snapshot();
      const water = this.water.settings();
      const atmosphere = this.atmosphere.settings();
      if (this.controls) this.controls.enabled = !paused;
      if (!paused) {
        const setup = this.resumeSetup;
        this.resumeSetup = undefined;
        setup?.();
        this.applyEnvironment?.(environment);
        this.applyWater?.(water);
        this.applyAtmosphere?.(atmosphere);
        this.draw?.();
      }
      this.animation.refresh();
    });
  }
}
