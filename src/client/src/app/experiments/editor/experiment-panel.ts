import { DOCUMENT, JsonPipe } from '@angular/common';
import { Component, computed, inject, input, output, signal } from '@angular/core';
import {
  DEFAULT_MEASURED_PAIRS,
  MAX_MEASURED_PAIRS,
  MIN_MEASURED_PAIRS,
  ExperimentResult,
  WARMUP_PAIRS,
} from '../data/experiment.models';
import { summarizeExperiment } from '../data/experiment-statistics';
import { downloadExperiment } from './experiment-download';
import { ExperimentSummaryPanel } from './experiment-summary';
import { ExperimentProgress } from '../experiment-runner.service';

@Component({
  selector: 'app-experiment-panel',
  imports: [JsonPipe, ExperimentSummaryPanel],
  templateUrl: './experiment-panel.html',
  styleUrls: ['../../shared/panel.css', './experiment-panel.css'],
})
export class ExperimentPanel {
  readonly busy = input(false);
  readonly active = input(false);
  readonly stopping = input(false);
  readonly progress = input.required<ExperimentProgress>();
  readonly result = input<ExperimentResult | null>(null);
  readonly plannedPairs = input(DEFAULT_MEASURED_PAIRS);
  readonly start = output<number>();
  readonly stop = output<void>();
  private readonly document = inject(DOCUMENT);
  protected readonly exportError = signal<string | null>(null);
  protected readonly summary = computed(() => {
    const record = this.result();
    return !this.active() && record ? summarizeExperiment(record) : null;
  });
  protected readonly count = signal(DEFAULT_MEASURED_PAIRS);
  protected readonly countError = signal<string | null>(null);
  protected readonly min = MIN_MEASURED_PAIRS;
  protected readonly max = MAX_MEASURED_PAIRS;
  protected readonly warmupCalls = WARMUP_PAIRS * 2;
  protected readonly settledWarmups = computed(() =>
    Math.min(this.progress().completedTrials, this.warmupCalls),
  );
  protected readonly settledMeasured = computed(() =>
    Math.max(0, this.progress().completedTrials - this.warmupCalls),
  );
  protected readonly buildMismatch = computed(
    () =>
      this.result()?.assessment.reasons.some((reason) => reason.code === 'build-mismatch') ?? false,
  );
  protected readonly failures = computed(
    () => this.result()?.trials.filter((t) => t.status === 'error') ?? [],
  );
  protected readonly progressLabel = computed(() => {
    if (!this.active())
      return this.result()
        ? `Collection ${this.result()!.status}.`
        : 'Ready to collect paired trials.';
    if (this.stopping()) return 'Stop requested. Finishing the active operation…';
    const p = this.progress();
    if (p.stage !== 'running') return 'Preparing the shared WebAssembly runtime…';
    const phase =
      p.phase === 'warmup'
        ? 'Warmup'
        : `Measured pair ${p.pairIndex! + 1} of ${this.plannedPairs()}`;
    return `${phase} · ${p.mode === 'local' ? 'Local' : 'Remote'} · position ${p.position + 1} of 2`;
  });

  protected changeCount(event: Event): void {
    this.count.set((event.target as HTMLInputElement).valueAsNumber);
    this.countError.set(null);
  }

  protected begin(): void {
    if (this.busy() || this.active()) return;
    const count = this.count();
    if (!Number.isInteger(count) || count < this.min || count > this.max) {
      this.countError.set(`Enter a whole number from ${this.min} to ${this.max}.`);
      return;
    }
    this.countError.set(null);
    this.exportError.set(null);
    this.start.emit(count);
  }

  protected requestStop(): void {
    if (this.active() && !this.stopping()) this.stop.emit();
  }

  protected download(format: 'json' | 'csv'): void {
    const record = this.result();
    if (this.active() || !record) return;
    this.exportError.set(null);
    try {
      downloadExperiment(record, format, this.document);
    } catch (error) {
      this.exportError.set(
        'Download failed: ' +
          (error instanceof Error ? error.message : String(error)) +
          ' The experiment is retained; retry the download.',
      );
    }
  }

  protected duration(value: number | null): string {
    return value === null ? 'Unavailable' : `${value} ms`;
  }
}
