import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { compareTerrains, TerrainComparison } from './terrain.contract';
import { TerrainError, TerrainRun } from './terrain.models';
import {
  captureTerrainRequest,
  createParameterForm,
  MAP_PARAMETERS,
  SIMULATION_PARAMETERS,
} from './terrain-parameters';
import { TerrainParametersPanel, GenerationMode } from './terrain-parameters-panel';
import { TerrainResultsPanel } from './terrain-results-panel';
import { PwaStatusPanel } from './pwa-status-panel';
import { TerrainService } from './terrain.service';
import { OperationLock } from './operation-lock.service';

@Component({
  selector: 'app-root',
  imports: [TerrainParametersPanel, TerrainResultsPanel, PwaStatusPanel],
  templateUrl: './app.html',
  styleUrls: ['./panel.css', './app.css'],
})
export class App {
  private readonly generator = inject(TerrainService);
  private readonly inputRevision = signal(0);
  private alive = true;
  protected readonly preferred = signal<'local' | 'remote'>('local');
  protected readonly draft = computed(() => {
    this.inputRevision();
    try {
      return captureTerrainRequest(this.form, this.terrainForm);
    } catch {
      return null;
    }
  });
  protected readonly terrainForm = createParameterForm(SIMULATION_PARAMETERS);
  private readonly operations = inject(OperationLock);
  protected readonly busy = this.operations.busy;
  protected readonly status = signal('Ready');
  protected readonly error = signal<TerrainError | null>(null);
  protected readonly local = signal<TerrainRun | null>(null);
  protected readonly remote = signal<TerrainRun | null>(null);
  protected readonly comparison = signal<TerrainComparison | null>(null);
  protected readonly form = createParameterForm(MAP_PARAMETERS);

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.alive = false;
    });
    this.terrainForm.valueChanges
      .pipe(takeUntilDestroyed(inject(DestroyRef)))
      .subscribe(() => this.invalidate());
    this.form.valueChanges.pipe(takeUntilDestroyed(inject(DestroyRef))).subscribe(() => {
      this.invalidate();
    });
  }

  protected errorFields(): string[] {
    return Object.keys(this.error()?.fields ?? {});
  }

  protected async generate(mode: GenerationMode): Promise<void> {
    const release = this.operations.tryAcquire();
    if (!release) return;
    this.error.set(null);
    this.comparison.set(null);
    const revision = this.inputRevision();
    try {
      const terrain = captureTerrainRequest(this.form, this.terrainForm);
      this.status.set(
        mode === 'remote'
          ? 'Generating remotely…'
          : 'Preparing WebAssembly and generating locally…',
      );
      // Paint the loading state before dispatching computation to the worker or API.
      await new Promise<void>((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)));
      if (!this.alive || revision !== this.inputRevision()) return;
      if (mode === 'local') {
        const result = await this.generator.local(terrain);
        if (!this.alive || revision !== this.inputRevision()) return;
        this.local.set(result);
        this.preferred.set('local');
      } else if (mode === 'remote') {
        const result = await this.generator.remote(terrain);
        if (!this.alive || revision !== this.inputRevision()) return;
        this.remote.set(result);
        this.preferred.set('remote');
      } else {
        const local = await this.generator.local(terrain);
        if (!this.alive || revision !== this.inputRevision()) return;
        // Render both maps after the sequential pair completes.
        this.status.set('Generating the same request remotely…');
        const remote = await this.generator.remote(terrain);
        if (!this.alive || revision !== this.inputRevision()) return;
        this.local.set(local);
        this.remote.set(remote);
        this.comparison.set(compareTerrains(local, remote));
      }
      this.status.set('Complete');
    } catch (error) {
      if (!this.alive || revision !== this.inputRevision()) return;
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
    this.inputRevision.update((value) => value + 1);
    this.comparison.set(null);
    this.error.set(null);
    this.status.set('Parameters changed. Existing maps retain their original inputs.');
  }
}
