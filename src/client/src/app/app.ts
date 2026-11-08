import { SunControls } from './terrain/editor/sun-controls';
import { AtmosphereControls } from './terrain/editor/atmosphere-controls';
import { OceanControls } from './terrain/editor/ocean-controls';
import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { compareTerrains, TerrainComparison } from './terrain/data/terrain.contract';
import { TerrainError, TerrainRun } from './terrain/data/terrain.models';
import { MAP_PARAMETERS, SIMULATION_PARAMETERS } from './terrain/editor/parameter-definitions';
import { captureTerrainRequest, createParameterForm } from './terrain/editor/terrain-parameters';
import { TerrainParametersPanel, GenerationMode } from './terrain/editor/terrain-parameters-panel';
import { TerrainResultsPanel } from './terrain/editor/terrain-results-panel';
import { PwaStatusPanel } from './platform/pwa-status-panel';
import { TerrainService } from './terrain/data/terrain.service';
import { ExperimentPanel } from './experiments/editor/experiment-panel';
import { ExperimentRunner } from './experiments/experiment-runner.service';
import { createExperimentConfiguration } from './experiments/data/experiment-configuration';
import { DEFAULT_MEASURED_PAIRS } from './experiments/data/experiment.models';
import { OperationLock } from './platform/operation-lock.service';

@Component({
  selector: 'app-root',
  imports: [
    TerrainParametersPanel,
    TerrainResultsPanel,
    PwaStatusPanel,
    ExperimentPanel,
    OceanControls,
    AtmosphereControls,
    SunControls,
  ],
  templateUrl: './app.html',
  styleUrls: ['./shared/panel.css', './app.css'],
})
export class App {
  protected readonly sunRequested = signal(false);
  protected readonly experiments = inject(ExperimentRunner);
  protected readonly experimentRunning = signal(false);
  protected readonly experimentPairs = signal(DEFAULT_MEASURED_PAIRS);
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
      if (this.experimentRunning()) this.experiments.stop();
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

  protected async startExperiment(measuredPairs: number): Promise<void> {
    if (this.busy() || this.experimentRunning()) return;
    const revision = this.inputRevision();
    try {
      const configuration = createExperimentConfiguration(
        captureTerrainRequest(this.form, this.terrainForm),
        measuredPairs,
      );
      this.error.set(null);
      this.experimentPairs.set(measuredPairs);
      this.experimentRunning.set(true);
      this.status.set('Architecture Race running…');
      const result = await this.experiments.start(configuration);
      // Transfer once after settlement, including when stale/destroyed, to drop retained maps.
      const pair = this.experiments.takePreviewPair();
      if (!this.alive) return;
      if (revision !== this.inputRevision()) {
        this.status.set('Experiment finished. Draft changed; existing maps were retained.');
        return;
      }
      if (pair) {
        this.local.set(pair.local);
        this.remote.set(pair.remote);
        this.comparison.set(pair.verification.comparison);
        this.preferred.set('local');
      }
      const validation = result.trials.find(
        (t) => t.status === 'error' && t.failure.kind === 'validation',
      );
      if (validation?.status === 'error')
        this.error.set(
          new TerrainError('validation', validation.failure.message, validation.failure.fields),
        );
      this.status.set(
        `Experiment ${result.status}${result.assessment.status === 'excluded' ? ' · excluded from verified performance claims' : ''}${pair ? '' : ' · previous maps retained'}`,
      );
    } catch (error) {
      if (!this.alive || revision !== this.inputRevision()) return;
      this.error.set(
        error instanceof TerrainError
          ? error
          : new TerrainError('protocol', error instanceof Error ? error.message : String(error)),
      );
      this.status.set('Experiment could not start');
    } finally {
      this.experimentRunning.set(false);
    }
  }

  private invalidate(): void {
    this.inputRevision.update((value) => value + 1);
    this.comparison.set(null);
    this.error.set(null);
    this.status.set('Parameters changed. Existing maps retain their original inputs.');
  }
}
