import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { compareHeightMaps, HeightMapComparison } from './heightmap.contract';
import {
  ALGORITHM_VERSION,
  HeightMapError,
  HeightMapRequest,
  HeightMapRun,
} from './heightmap.models';
import { HeightMapPreview } from './heightmap-preview';
import { HeightMapService } from './heightmap.service';
import { ProbeDiagnostics } from './probe-diagnostics';

@Component({
  selector: 'app-root',
  imports: [ReactiveFormsModule, HeightMapPreview, ProbeDiagnostics],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  private readonly generator = inject(HeightMapService);
  private inputRevision = 0;
  protected readonly busy = signal(false);
  protected readonly status = signal('Ready');
  protected readonly error = signal<HeightMapError | null>(null);
  protected readonly local = signal<HeightMapRun | null>(null);
  protected readonly remote = signal<HeightMapRun | null>(null);
  protected readonly comparison = signal<HeightMapComparison | null>(null);
  protected readonly form = new FormGroup({
    seed: new FormControl<number | null>(42),
    width: new FormControl<number | null>(128),
    height: new FormControl<number | null>(128),
    noiseScale: new FormControl<number | null>(0.03),
    octaves: new FormControl<number | null>(4),
    heightMultiplier: new FormControl<number | null>(30),
  });

  constructor() {
    this.form.valueChanges.pipe(takeUntilDestroyed(inject(DestroyRef))).subscribe(() => {
      this.inputRevision++;
      this.comparison.set(null);
      this.error.set(null);
      this.status.set('Parameters changed. Existing maps retain their original inputs.');
    });
  }

  protected setDiagnosticsBusy(value: boolean): void {
    this.busy.set(value);
  }

  protected fieldError(field: string): string | undefined {
    return this.error()?.fields[field];
  }

  protected async generate(mode: 'local' | 'remote' | 'verify'): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set(null);
    this.comparison.set(null);
    this.local.set(null);
    this.remote.set(null);
    const revision = this.inputRevision;
    try {
      const request = this.readRequest();
      this.status.set(
        mode === 'remote'
          ? 'Generating remotely…'
          : 'Preparing WebAssembly and generating locally…',
      );
      // A frame followed by a task allows loading state to paint before synchronous WASM.
      await new Promise<void>((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)));
      if (mode === 'local') {
        const result = await this.generator.local(request);
        if (revision !== this.inputRevision) return;
        this.local.set(result);
      } else if (mode === 'remote') {
        const result = await this.generator.remote(request);
        if (revision !== this.inputRevision) return;
        this.remote.set(result);
      } else {
        const local = await this.generator.local(request);
        if (revision !== this.inputRevision) return;
        // Render both maps after the sequential pair completes.
        this.status.set('Generating the same request remotely…');
        const remote = await this.generator.remote(request);
        if (revision !== this.inputRevision) return;
        this.local.set(local);
        this.remote.set(remote);
        this.comparison.set(compareHeightMaps(local, remote));
      }
      this.status.set('Complete');
    } catch (error) {
      if (revision !== this.inputRevision) return;
      this.error.set(
        error instanceof HeightMapError
          ? error
          : new HeightMapError('protocol', error instanceof Error ? error.message : String(error)),
      );
      this.status.set('Generation failed');
    } finally {
      this.busy.set(false);
    }
  }

  private readRequest(): HeightMapRequest {
    const inputs = this.form.getRawValue();
    const fields: Record<string, string> = {};
    for (const [field, value] of Object.entries(inputs)) {
      if (typeof value !== 'number' || !Number.isFinite(value))
        fields[field] = 'Enter a finite number.';
    }
    if (Object.keys(fields).length)
      throw new HeightMapError('validation', 'Complete the parameter fields.', fields);
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
