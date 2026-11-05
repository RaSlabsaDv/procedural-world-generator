import { Component, inject, signal } from '@angular/core';
import { WasmHostService } from './wasm-host.service';

interface SampleResponse {
  values: number[];
  computeMs: number;
}

interface CheckResult {
  name: string;
  passed: boolean;
  detail: string;
}

const SAMPLE_FIXTURE = [
  0.25234514474868774, 0.08812499046325684, 0.5772811770439148, 0.22255420684814453,
  0.3756601810455322,
];

const MAX_SAMPLE_COUNT = 262_144;
const FULL_ARRAY_SHA256 = 'cbd49d9128202d264bddde63406dd224d2a0d4f0d841bed3697a1f17ff424dd8';

@Component({
  imports: [],
  selector: 'app-root',
  styleUrl: './app.css',
  templateUrl: './app.html',
})
export class App {
  private readonly wasm = inject(WasmHostService);

  protected readonly state = signal<'idle' | 'running' | 'complete' | 'error'>('idle');
  protected readonly checks = signal<CheckResult[]>([]);
  protected readonly error = signal<string | null>(null);
  protected readonly init = signal(this.wasm.getInfo());
  protected readonly calls = signal(0);
  protected readonly requestMs = signal<number | null>(null);

  protected async runChecks(): Promise<void> {
    this.state.set('running');
    this.error.set(null);
    this.checks.set([]);
    this.requestMs.set(null);

    try {
      const started = performance.now();
      const runtime = await this.wasm.getRuntime();
      const results: CheckResult[] = [];

      const sum = runtime.add(20, 22);
      results.push({
        name: 'Scalar call',
        passed: sum === 42,
        detail: `Add(20, 22) returned ${sum}`,
      });
      this.calls.update((count) => count + 1);

      const samples = this.decode(runtime.generateSamplesJson(42, 5));
      const samplesMatch = this.matchesFixture(samples.values, SAMPLE_FIXTURE);
      results.push({
        name: 'Bulk array call',
        passed: samplesMatch,
        detail: `${samples.values.length} values, compute ${this.formatMs(samples.computeMs)}; ${samples.values.join(', ')}`,
      });
      this.calls.update((count) => count + 1);

      const empty = this.decode(runtime.generateSamplesJson(42, 0));
      results.push({
        name: 'Empty array',
        passed: empty.values.length === 0,
        detail: `${empty.values.length} values`,
      });
      this.calls.update((count) => count + 1);

      const full = this.decode(runtime.generateSamplesJson(42, MAX_SAMPLE_COUNT));
      const fullArray = new Float32Array(full.values);
      const digest = await this.sha256(fullArray);
      const validValues = full.values.every(
        (value) => Number.isFinite(value) && value >= 0 && value < 1,
      );
      results.push({
        name: 'Maximum array transfer',
        passed:
          full.values.length === MAX_SAMPLE_COUNT &&
          Math.fround(full.values[0]) === SAMPLE_FIXTURE[0] &&
          Math.fround(full.values.at(-1)!) === 0.98126220703125 &&
          validValues &&
          digest === FULL_ARRAY_SHA256,
        detail: `${full.values.length} values, SHA-256 ${digest}, compute ${this.formatMs(full.computeMs)}`,
      });
      this.calls.update((count) => count + 1);

      const repeated = this.decode(runtime.generateSamplesJson(42, 5));
      results.push({
        name: 'Deterministic repeat',
        passed: this.matchesFixture(repeated.values, samples.values),
        detail: 'Same seed and count produced identical values',
      });
      this.calls.update((count) => count + 1);

      this.init.set(this.wasm.getInfo());
      results.push({
        name: 'Runtime reuse',
        passed: this.init().initCount === 1,
        detail: `1 runtime initialization for ${this.calls()} calls`,
      });

      this.requestMs.set(performance.now() - started);
      this.checks.set(results);
      this.state.set(results.every((result) => result.passed) ? 'complete' : 'error');
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : String(error));
      this.state.set('error');
    }
  }

  private decode(json: string): SampleResponse {
    return JSON.parse(json) as SampleResponse;
  }

  private matchesFixture(values: number[], expected: number[]): boolean {
    return (
      values.length === expected.length &&
      values.every((value, index) => Math.fround(value) === Math.fround(expected[index]))
    );
  }

  private async sha256(values: Float32Array): Promise<string> {
    const bytes = new Uint8Array(values.buffer as ArrayBuffer);
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join(
      '',
    );
  }

  private formatMs(value: number): string {
    return `${value.toFixed(3)} ms`;
  }
}
