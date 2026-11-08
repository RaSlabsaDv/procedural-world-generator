import { DOCUMENT } from '@angular/common';
import { DestroyRef, Injectable, inject, signal } from '@angular/core';
import { OperationLock } from '../platform/operation-lock.service';
import { RuntimeInfo, WasmHostService } from '../platform/wasm-host.service';
import { compareTerrains } from '../terrain/data/terrain-comparison';
import { sameObject } from '../terrain/data/contract-utils';
import { TerrainRun } from '../terrain/data/terrain.models';
import { TerrainService } from '../terrain/data/terrain.service';
import { createExperimentConfiguration } from './data/experiment-configuration';
import {
  Assessment,
  ExecutionMode,
  ExperimentConfiguration,
  ExperimentFailure,
  ExperimentMetadata,
  ExperimentResult,
  ExperimentTrial,
  ExclusionReason,
  PairVerification,
} from './data/experiment.models';
import {
  EXPECTED_IDENTITY,
  assessment,
  failure,
  identity,
  reason,
  trialTimingReasons,
} from './data/experiment-records';

export interface ExperimentConditions {
  readonly applicationRevision?: string | null;
  readonly hardware?: string | null;
  readonly server?: string | null;
  readonly network?: string | null;
  readonly cacheState?: string | null;
  readonly preparation?: string | null;
  readonly notes?: string | null;
}

export type ExperimentProgress =
  | { readonly stage: 'idle' | 'preparing' | 'finished'; readonly completedTrials: number }
  | {
      readonly stage: 'running';
      readonly completedTrials: number;
      readonly phase: 'warmup' | 'measured';
      readonly pairIndex: number | null;
      readonly mode: ExecutionMode;
      readonly position: 0 | 1;
    };

/** Full results are separate from exportable records and transferred at most once. */
export interface ExperimentPreviewPair {
  readonly local: TerrainRun;
  readonly remote: TerrainRun;
}

@Injectable({ providedIn: 'root' })
export class ExperimentRunner {
  private readonly terrain = inject(TerrainService);
  private readonly wasm = inject(WasmHostService);
  private readonly operations = inject(OperationLock);
  private readonly document = inject(DOCUMENT);
  private readonly progressState = signal<ExperimentProgress>({
    stage: 'idle',
    completedTrials: 0,
  });
  readonly progress = this.progressState.asReadonly();
  private readonly resultState = signal<ExperimentResult | null>(null);
  readonly result = this.resultState.asReadonly();
  private active = false;
  private stopped = false;
  private disposed = false;
  private preview: ExperimentPreviewPair | null = null;
  private removeListeners: (() => void) | null = null;

  constructor() {
    inject(DestroyRef).onDestroy(() => this.dispose());
  }

  stop(): void {
    if (this.active) this.stopped = true;
  }

  takePreviewPair(): ExperimentPreviewPair | null {
    if (this.active) return null;
    const pair = this.preview;
    this.preview = null;
    return pair;
  }

  dispose(): void {
    this.disposed = true;
    this.stop();
    this.preview = null;
    this.removeListeners?.();
    this.removeListeners = null;
  }

  async start(
    input: ExperimentConfiguration,
    conditions: ExperimentConditions = {},
  ): Promise<ExperimentResult> {
    if (this.disposed) throw new Error('Experiment runner is disposed.');
    if (this.active) throw new Error('An experiment is already running.');
    const configuration = createExperimentConfiguration(input.terrain, input.measuredPairs);
    if (
      input.schemaVersion !== configuration.schemaVersion ||
      input.order !== configuration.order ||
      input.warmupPairs !== configuration.warmupPairs
    )
      throw new Error('Unsupported experiment configuration policy.');
    const release = this.operations.tryAcquire();
    if (!release) throw new Error('Another operation is active. Retry when it finishes.');
    this.active = true;
    this.stopped = false;
    this.preview = null;
    this.resultState.set(null);
    this.setProgress({ stage: 'preparing', completedTrials: 0 });
    try {
      return await this.collect(configuration, { ...conditions });
    } finally {
      this.removeListeners?.();
      this.removeListeners = null;
      this.active = false;
      release();
    }
  }

  private async collect(
    configuration: ExperimentConfiguration,
    conditions: ExperimentConditions,
  ): Promise<ExperimentResult> {
    const trials: ExperimentTrial[] = [];
    const verifications: PairVerification[] = [];
    const exclusions: ExclusionReason[] = [];
    const interruptions: ExperimentMetadata['interruptions'][number][] = [];
    const builds: Record<ExecutionMode, string | null> = { local: null, remote: null };
    let fatal: ExperimentFailure | null = null;
    let executionFailed = false;
    let preparedInfo: RuntimeInfo | null = null;
    const metadata: ExperimentMetadata = {
      experimentId: crypto.randomUUID(),
      startedAt: new Date().toISOString(),
      endedAt: null,
      expectedIdentity: EXPECTED_IDENTITY,
      coreBuildIds: builds,
      applicationRevision: conditions.applicationRevision ?? null,
      browser: this.document.defaultView?.navigator.userAgent ?? null,
      hardware: conditions.hardware ?? null,
      server: conditions.server ?? null,
      network: conditions.network ?? null,
      cacheState: conditions.cacheState ?? null,
      preparation: conditions.preparation ?? null,
      notes: conditions.notes ?? null,
      startup: {
        origin: 'unknown',
        initMs: null,
        runtimeMs: null,
        initCount: null,
        execution: null,
        protocol: null,
        runtimeVersion: null,
      },
      interruptions,
    };
    let startup = metadata.startup;
    const interrupt = (
      kind: ExperimentMetadata['interruptions'][number]['kind'],
      detail: string,
    ) => {
      interruptions.push(Object.freeze({ at: new Date().toISOString(), kind, detail }));
      exclusions.push(reason('interrupted', detail));
    };
    const hidden = () => {
      if (this.document.visibilityState === 'hidden')
        interrupt('tab-hidden', 'Document was hidden during collection.');
    };
    const navigation = () => {
      interrupt('navigation', 'Page navigation or page suspension was observed.');
      this.stop();
    };
    this.document.addEventListener('visibilitychange', hidden);
    this.document.defaultView?.addEventListener('pagehide', navigation);
    this.removeListeners = () => {
      this.document.removeEventListener('visibilitychange', hidden);
      this.document.defaultView?.removeEventListener('pagehide', navigation);
    };
    hidden();

    const runtimeChanged = () => {
      if (!preparedInfo) return;
      const info = this.wasm.getInfo();
      if (
        info.initCount !== preparedInfo.initCount ||
        info.protocol !== preparedInfo.protocol ||
        info.execution !== preparedInfo.execution
      ) {
        executionFailed = true;
        interrupt('runtime-reset', 'Observed Local runtime identity changed during collection.');
        fatal ??= failure(new Error('Local runtime changed during collection.'), 'execution');
        preparedInfo = { ...info };
      }
    };

    try {
      const before = { ...this.wasm.getInfo() };
      // Preserve observed startup data even if this preparation attempt fails.
      startup = Object.freeze({
        origin: before.initCount > 0 && before.initMs !== null ? 'before-experiment' : 'unknown',
        initMs: before.initMs,
        runtimeMs: before.runtimeMs,
        initCount: before.initCount,
        execution: before.execution,
        protocol: before.protocol,
        runtimeVersion: null,
      });
      if (!this.stopped) {
        await this.wasm.getRuntime();
        preparedInfo = { ...this.wasm.getInfo() };
        startup = Object.freeze({
          origin:
            before.initCount > 0 &&
            before.initMs !== null &&
            before.initCount === preparedInfo.initCount
              ? 'before-experiment'
              : before.initCount === 0 && preparedInfo.initCount > 0
                ? 'experiment-preparation'
                : 'unknown',
          initMs: preparedInfo.initMs,
          runtimeMs: preparedInfo.runtimeMs,
          initCount: preparedInfo.initCount,
          execution: preparedInfo.execution,
          protocol: preparedInfo.protocol,
          runtimeVersion: null,
        });
      }
      // Warmup occupies index -1 internally; persisted measured indices remain zero-based.
      for (
        let index = -1;
        index < configuration.measuredPairs && !this.stopped && !fatal;
        index++
      ) {
        const phase =
          index === -1
            ? { phase: 'warmup' as const, pairIndex: null }
            : { phase: 'measured' as const, pairIndex: index };
        const pairId = `${metadata.experimentId}:${index === -1 ? 'warmup' : index}`;
        const order: readonly ExecutionMode[] =
          index < 0 || index % 2 === 0 ? ['local', 'remote'] : ['remote', 'local'];
        const pairTrials: Partial<Record<ExecutionMode, ExperimentTrial>> = {};
        const maps: Partial<Record<ExecutionMode, TerrainRun>> = {};
        const pairReasons: ExclusionReason[] = [];
        for (const position of [0, 1] as const) {
          if (this.stopped || fatal) break;
          runtimeChanged();
          if (fatal) break;
          const mode = order[position];
          const base = { ...phase, pairId, trialId: `${pairId}:${mode}`, mode, position };
          this.setProgress({
            stage: 'running',
            completedTrials: trials.length,
            ...phase,
            mode,
            position,
          });
          let trial: ExperimentTrial;
          try {
            const run = await this.terrain[mode](configuration.terrain);
            maps[mode] = run;
            const observed = identity(run);
            trial = Object.freeze({
              ...base,
              status: 'success',
              computeMs: run.response.computeMs,
              requestMs: run.requestMs,
              identity: observed,
              diagnostics: Object.freeze({
                width: run.response.result.width,
                height: run.response.result.height,
                treeCount: run.response.result.trees.length,
                rockCount: run.response.result.rocks.length,
              }),
            });
            const { coreBuildId, ...workload } = observed;
            if (
              !sameObject(workload, EXPECTED_IDENTITY) ||
              !sameObject(run.terrain, configuration.terrain) ||
              !sameObject(run.request, configuration.terrain.heightMap)
            )
              pairReasons.push(
                reason(
                  'identity-changed',
                  `${base.trialId}: request/workload identity differs from the frozen configuration.`,
                ),
              );
            if (builds[mode] !== null && builds[mode] !== coreBuildId)
              pairReasons.push(
                reason(
                  'identity-changed',
                  `${mode} build changed from ${builds[mode]} to ${coreBuildId}.`,
                ),
              );
            builds[mode] ??= coreBuildId;
          } catch (error) {
            trial = Object.freeze({
              ...base,
              status: 'error',
              computeMs: null,
              requestMs: null,
              identity: null,
              diagnostics: null,
              failure: failure(error, 'execution'),
            });
          }
          trials.push(trial);
          pairTrials[mode] = trial;
          pairReasons.push(...trialTimingReasons(trial));
          runtimeChanged();
          // Progress after settlement also makes cooperative stop observable between calls.
          this.setProgress({
            stage: 'running',
            completedTrials: trials.length,
            ...phase,
            mode,
            position,
          });
        }
        if (!pairTrials.local && !pairTrials.remote) break;
        if (interruptions.length)
          pairReasons.push(
            reason('interrupted', 'An interruption was observed in this experiment.'),
          );
        let verification: PairVerification;
        if (maps.local && maps.remote) {
          try {
            const comparison = Object.freeze(compareTerrains(maps.local, maps.remote));
            if (!comparison.numericMatch || !comparison.biomesMatch)
              pairReasons.push(
                reason('correctness-mismatch', `${pairId}: complete terrain comparison failed.`),
              );
            if (comparison.identity === 'different')
              pairReasons.push(
                reason('build-mismatch', `${pairId}: Local and Remote build IDs differ.`),
              );
            if (comparison.identity === 'unverifiable')
              pairReasons.push(
                reason('build-unverifiable', `${pairId}: matching builds cannot be verified.`),
              );
            verification = Object.freeze({
              ...phase,
              pairId,
              status: 'compared',
              localTrialId: pairTrials.local!.trialId,
              remoteTrialId: pairTrials.remote!.trialId,
              comparison,
              assessment: assessment(pairReasons),
            });
            if (
              comparison.numericMatch &&
              comparison.biomesMatch &&
              comparison.identity !== 'different' &&
              !pairReasons.some((r) => r.code === 'identity-changed') &&
              !this.disposed
            )
              this.preview = Object.freeze({ local: maps.local, remote: maps.remote });
          } catch (error) {
            pairReasons.push(reason('comparison-unavailable', failure(error, 'execution').message));
            verification = this.unavailable(phase, pairId, pairTrials, pairReasons);
          }
        } else {
          pairReasons.push(
            reason('comparison-unavailable', `${pairId}: two successful calls are required.`),
          );
          verification = this.unavailable(phase, pairId, pairTrials, pairReasons);
        }
        verifications.push(verification);
        exclusions.push(...pairReasons);
        if (
          index === -1 &&
          (pairTrials.local?.status === 'error' || pairTrials.remote?.status === 'error')
        ) {
          exclusions.push(
            reason('warmup-failed', 'Both warmup calls must succeed before measurement.'),
          );
          executionFailed = true;
          fatal ??= failure(new Error('Warmup failed.'), 'execution');
        }
        if (
          pairReasons.some((r) =>
            [
              'identity-changed',
              'build-mismatch',
              'correctness-mismatch',
              'comparison-unavailable',
            ].includes(r.code),
          ) &&
          pairTrials.local?.status === 'success' &&
          pairTrials.remote?.status === 'success'
        )
          fatal ??= failure(
            new Error('Pair verification invalidated further collection.'),
            'execution',
          );
        // maps and pairTrials go out of scope here; only the single preview pair survives.
      }
    } catch (error) {
      executionFailed = true;
      fatal = failure(error, preparedInfo ? 'execution' : 'preparation');
      exclusions.push(reason('incomplete', fatal.message));
    }
    const fullyAttempted =
      verifications.filter((v) => v.phase === 'measured').length === configuration.measuredPairs &&
      trials.filter((t) => t.phase === 'measured').length === configuration.measuredPairs * 2;
    const status = executionFailed
      ? 'failed'
      : this.stopped
        ? 'stopped'
        : fullyAttempted
          ? 'completed'
          : 'failed';
    if (status !== 'completed')
      exclusions.push(
        reason('incomplete', `Collection ${status}; configured series was not completed.`),
      );
    const finalMetadata = Object.freeze({
      ...metadata,
      endedAt: new Date().toISOString(),
      startup,
      coreBuildIds: Object.freeze({ ...builds }),
      interruptions: Object.freeze([...interruptions]),
    });
    const common = {
      configuration,
      metadata: finalMetadata,
      trials: Object.freeze(trials),
      verifications: Object.freeze(verifications),
    };
    const excluded = assessment(exclusions) as Extract<Assessment, { status: 'excluded' }>;
    const result: ExperimentResult = Object.freeze(
      status === 'completed'
        ? { ...common, status, complete: true, assessment: assessment(exclusions) }
        : status === 'stopped'
          ? { ...common, status, complete: false, assessment: excluded }
          : {
              ...common,
              status,
              complete: false,
              assessment: excluded,
              failure: fatal ?? failure(new Error('Collection could not complete.'), 'execution'),
            },
    );
    this.resultState.set(result);
    this.setProgress({ stage: 'finished', completedTrials: trials.length });
    return result;
  }

  private unavailable(
    phase:
      | { readonly phase: 'warmup'; readonly pairIndex: null }
      | { readonly phase: 'measured'; readonly pairIndex: number },
    pairId: string,
    trials: Partial<Record<ExecutionMode, ExperimentTrial>>,
    reasons: ExclusionReason[],
  ): PairVerification {
    return Object.freeze({
      ...phase,
      pairId,
      status: 'unavailable',
      localTrialId: trials.local?.trialId ?? null,
      remoteTrialId: trials.remote?.trialId ?? null,
      assessment: assessment(reasons) as Extract<Assessment, { status: 'excluded' }>,
    });
  }

  private setProgress(progress: ExperimentProgress): void {
    this.progressState.set(Object.freeze(progress));
  }
}
