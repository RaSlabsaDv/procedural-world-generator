import { HttpErrorResponse } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { ApiErrorResponse, SampleResponse } from './probe.models';
import { RemoteProbeService } from './remote-probe.service';
import { WasmHostService } from './wasm-host.service';

interface CheckResult {
  name: string;
  passed: boolean;
  detail: string;
}

type RunState = 'idle' | 'running' | 'complete' | 'error';

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
  private readonly remote = inject(RemoteProbeService);

  protected readonly localState = signal<RunState>('idle');
  protected readonly localChecks = signal<CheckResult[]>([]);
  protected readonly localError = signal<string | null>(null);
  protected readonly init = signal(this.wasm.getInfo());
  protected readonly localCalls = signal(0);

  protected readonly remoteState = signal<RunState>('idle');
  protected readonly remoteChecks = signal<CheckResult[]>([]);
  protected readonly remoteError = signal<string | null>(null);
  protected readonly remoteCalls = signal(0);

  protected async runLocalChecks(): Promise<void> {
    this.localState.set('running');
    this.localError.set(null);
    this.localChecks.set([]);

    try {
      const runtime = await this.wasm.getRuntime();
      const results: CheckResult[] = [];

      const sum = runtime.add(20, 22);
      results.push({
        name: 'Scalar call',
        passed: sum === 42,
        detail: `Add(20, 22) returned ${sum}`,
      });
      this.localCalls.update((count) => count + 1);

      const samples = this.decode(runtime.generateSamplesJson(42, 5));
      results.push({
        name: 'Bulk array call',
        passed: this.matchesFixture(samples.values, SAMPLE_FIXTURE),
        detail: `${samples.values.length} values; ${samples.values.join(', ')}`,
      });
      this.localCalls.update((count) => count + 1);

      const empty = this.decode(runtime.generateSamplesJson(42, 0));
      results.push({
        name: 'Empty array',
        passed: empty.values.length === 0,
        detail: `${empty.values.length} values`,
      });
      this.localCalls.update((count) => count + 1);

      const full = this.decode(runtime.generateSamplesJson(42, MAX_SAMPLE_COUNT));
      results.push(await this.fullArrayCheck(full));
      this.localCalls.update((count) => count + 1);

      const repeated = this.decode(runtime.generateSamplesJson(42, 5));
      results.push({
        name: 'Deterministic repeat',
        passed: this.matchesFixture(repeated.values, samples.values),
        detail: 'Same seed and count produced identical values',
      });
      this.localCalls.update((count) => count + 1);

      this.init.set(this.wasm.getInfo());
      results.push({
        name: 'Runtime reuse',
        passed: this.init().initCount === 1,
        detail: `1 runtime initialization for ${this.localCalls()} calls`,
      });

      this.localChecks.set(results);
      this.localState.set(results.every((result) => result.passed) ? 'complete' : 'error');
    } catch (error) {
      this.localError.set(this.describeError(error));
      this.localState.set('error');
    }
  }

  protected async runRemoteChecks(): Promise<void> {
    this.remoteState.set('running');
    this.remoteError.set(null);
    this.remoteChecks.set([]);

    try {
      const results: CheckResult[] = [];

      const sum = await this.remote.add(20, 22);
      results.push({
        name: 'Scalar call',
        passed: sum === 42,
        detail: `Add(20, 22) returned ${sum}`,
      });
      this.remoteCalls.update((count) => count + 1);

      const samples = await this.remote.generateSamples(42, 5);
      results.push({
        name: 'Bulk array call',
        passed: this.matchesFixture(samples.values, SAMPLE_FIXTURE),
        detail: `${samples.values.length} values; ${samples.values.join(', ')}`,
      });
      this.remoteCalls.update((count) => count + 1);

      const empty = await this.remote.generateSamples(42, 0);
      results.push({
        name: 'Empty array',
        passed: empty.values.length === 0,
        detail: `${empty.values.length} values`,
      });
      this.remoteCalls.update((count) => count + 1);

      const full = await this.remote.generateSamples(42, MAX_SAMPLE_COUNT);
      results.push(await this.fullArrayCheck(full));
      this.remoteCalls.update((count) => count + 1);

      const repeated = await this.remote.generateSamples(42, 5);
      results.push({
        name: 'Deterministic repeat',
        passed: this.matchesFixture(repeated.values, samples.values),
        detail: 'Same seed and count produced identical values',
      });
      this.remoteCalls.update((count) => count + 1);

      results.push(await this.invalidInputCheck());

      this.remoteChecks.set(results);
      this.remoteState.set(results.every((result) => result.passed) ? 'complete' : 'error');
    } catch (error) {
      this.remoteError.set(this.describeError(error));
      this.remoteState.set('error');
    }
  }

  private async fullArrayCheck(response: SampleResponse): Promise<CheckResult> {
    const values = new Float32Array(response.values);
    const digest = await this.sha256(values);
    const validValues = response.values.every(
      (value) => Number.isFinite(value) && value >= 0 && value < 1,
    );

    return {
      name: 'Maximum array transfer',
      passed:
        response.values.length === MAX_SAMPLE_COUNT &&
        Math.fround(response.values[0]) === SAMPLE_FIXTURE[0] &&
        Math.fround(response.values.at(-1)!) === 0.98126220703125 &&
        validValues &&
        digest === FULL_ARRAY_SHA256,
      detail: `${response.values.length} values, SHA-256 ${digest}`,
    };
  }

  private async invalidInputCheck(): Promise<CheckResult> {
    try {
      await this.remote.generateSamples(42, -1);
      return {
        name: 'Invalid input rejected',
        passed: false,
        detail: 'The API accepted an invalid sample count',
      };
    } catch (error) {
      const response = error instanceof HttpErrorResponse ? error : null;
      const body = response?.error as ApiErrorResponse | undefined;
      const rejected =
        response?.status === 400 &&
        body?.error === 'validation' &&
        body.fields?.['count'] !== undefined;

      return {
        name: 'Invalid input rejected',
        passed: rejected,
        detail: this.describeError(error),
      };
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

  private describeError(error: unknown): string {
    if (error instanceof HttpErrorResponse) {
      if (error.status === 0) {
        return 'Remote API is unavailable; start it and retry.';
      }

      const body = error.error as ApiErrorResponse | null;
      if (body?.fields) {
        const fields = Object.entries(body.fields)
          .map(([field, message]) => `${field}: ${message}`)
          .join('; ');
        return `${body.error}: ${fields}`;
      }

      return body?.error
        ? `${body.error} (HTTP ${error.status})`
        : `API request failed with HTTP ${error.status}.`;
    }

    return error instanceof Error ? error.message : String(error);
  }
}
