import { Component, DestroyRef, inject, signal } from '@angular/core';
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
  private inputRevision = 0;
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
    this.local.set(null);
    this.remote.set(null);
    const revision = this.inputRevision;
    try {
      const terrain = captureTerrainRequest(this.form, this.terrainForm);
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
}
