import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { compareTerrains, TerrainComparison } from './terrain.contract';
import {
  ALGORITHM_VERSION,
  TERRAIN_ALGORITHM,
  TerrainRequest,
  TerrainError,
  HeightMapRequest,
  TerrainRun,
} from './terrain.models';
import { TerrainPreview } from './terrain-preview';
import { TerrainService } from './terrain.service';
import { OperationLock } from './operation-lock.service';
import { OfflineReadinessService } from './offline-readiness.service';

@Component({
  selector: 'app-root',
  imports: [ReactiveFormsModule, TerrainPreview],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  private readonly generator = inject(TerrainService);
  protected readonly offline = inject(OfflineReadinessService);
  private inputRevision = 0;
  protected readonly terrainForm = new FormGroup({
    mountainStrength: new FormControl<number | null>(0.55),
    warpStrength: new FormControl<number | null>(2),
    iterations: new FormControl<number | null>(64),
    rainfall: new FormControl<number | null>(0.05),
    evaporation: new FormControl<number | null>(0.1),
  });
  private readonly operations = inject(OperationLock);
  protected readonly busy = this.operations.busy;
  protected readonly status = signal('Ready');
  protected readonly error = signal<TerrainError | null>(null);
  protected readonly local = signal<TerrainRun | null>(null);
  protected readonly remote = signal<TerrainRun | null>(null);
  protected readonly comparison = signal<TerrainComparison | null>(null);
  protected readonly form = new FormGroup({
    seed: new FormControl<number | null>(42),
    width: new FormControl<number | null>(128),
    height: new FormControl<number | null>(128),
    noiseScale: new FormControl<number | null>(0.03),
    octaves: new FormControl<number | null>(4),
    heightMultiplier: new FormControl<number | null>(30),
  });

  constructor() {
    void this.offline.start();
    this.terrainForm.valueChanges
      .pipe(takeUntilDestroyed(inject(DestroyRef)))
      .subscribe(() => this.invalidate());
    this.form.valueChanges.pipe(takeUntilDestroyed(inject(DestroyRef))).subscribe(() => {
      this.invalidate();
    });
  }

  protected retryOfflinePreparation(): void {
    if (this.busy()) return;
    void this.offline.prepare();
  }

  protected checkForUpdates(): void {
    if (this.busy()) return;
    void this.offline.checkForUpdate();
  }

  protected async reloadForUpdate(): Promise<void> {
    if (this.busy() || !this.offline.updateReady()) return;
    const release = this.operations.tryAcquire();
    if (!release) return;
    try {
      this.offline.prepareForReload();
      this.reloadPage();
    } catch (error) {
      this.offline.cancelReload(error instanceof Error ? error.message : String(error));
      release();
    }
  }

  protected reloadPage(): void {
    globalThis.location.reload();
  }

  protected errorFields(): string[] {
    return Object.keys(this.error()?.fields ?? {});
  }

  protected fieldError(field: string): string | undefined {
    return this.error()?.fields[field];
  }

  protected async generate(mode: 'local' | 'remote' | 'verify'): Promise<void> {
    const release = this.operations.tryAcquire();
    if (!release) return;
    this.error.set(null);
    this.comparison.set(null);
    this.local.set(null);
    this.remote.set(null);
    const revision = this.inputRevision;
    try {
      const request = this.readRequest();
      const terrain = this.readTerrain(request);
      this.status.set(
        mode === 'remote'
          ? 'Generating remotely…'
          : 'Preparing WebAssembly and generating locally…',
      );
      // Paint the loading state before dispatching computation to the worker or API.
      await new Promise<void>((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)));
      if (mode === 'local') {
        const result = await this.generator.local(terrain);
        if (revision !== this.inputRevision) return;
        this.local.set(result);
      } else if (mode === 'remote') {
        const result = await this.generator.remote(terrain);
        if (revision !== this.inputRevision) return;
        this.remote.set(result);
      } else {
        const local = await this.generator.local(terrain);
        if (revision !== this.inputRevision) return;
        // Render both maps after the sequential pair completes.
        this.status.set('Generating the same request remotely…');
        const remote = await this.generator.remote(terrain);
        if (revision !== this.inputRevision) return;
        this.local.set(local);
        this.remote.set(remote);
        this.comparison.set(compareTerrains(local, remote));
      }
      this.status.set('Complete');
    } catch (error) {
      if (revision !== this.inputRevision) return;
      this.error.set(
        error instanceof TerrainError
          ? error
          : new TerrainError('protocol', error instanceof Error ? error.message : String(error)),
      );
      this.status.set('Generation failed');
    } finally {
      release();
    }
  }

  private invalidate(): void {
    this.inputRevision++;
    this.comparison.set(null);
    this.error.set(null);
    this.status.set('Parameters changed. Existing maps retain their original inputs.');
  }

  private readTerrain(heightMap: HeightMapRequest): TerrainRequest {
    const parameters = this.terrainForm.getRawValue();
    const fields: Record<string, string> = {};
    for (const [name, value] of Object.entries(parameters))
      if (typeof value !== 'number' || !Number.isFinite(value))
        fields[name] = 'Enter a finite number.';
    if (Object.keys(fields).length)
      throw new TerrainError('validation', 'Complete terrain parameters.', fields);
    return Object.freeze({
      heightMap,
      mountainStrength: parameters.mountainStrength!,
      warpStrength: parameters.warpStrength!,
      iterations: parameters.iterations!,
      rainfall: parameters.rainfall!,
      evaporation: parameters.evaporation!,
      algorithmVersion: TERRAIN_ALGORITHM,
    });
  }

  private readRequest(): HeightMapRequest {
    const inputs = this.form.getRawValue();
    const fields: Record<string, string> = {};
    for (const [field, value] of Object.entries(inputs)) {
      if (typeof value !== 'number' || !Number.isFinite(value))
        fields[field] = 'Enter a finite number.';
    }
    if (Object.keys(fields).length)
      throw new TerrainError('validation', 'Complete the parameter fields.', fields);
    return Object.freeze({
      seed: inputs.seed!,
      width: inputs.width!,
      height: inputs.height!,
      noiseScale: inputs.noiseScale!,
      octaves: inputs.octaves!,
      heightMultiplier: inputs.heightMultiplier!,
      algorithmVersion: ALGORITHM_VERSION,
    });
  }
}
