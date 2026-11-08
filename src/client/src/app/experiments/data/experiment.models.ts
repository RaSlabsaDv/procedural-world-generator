import type { TerrainComparison } from '../../terrain/data/terrain-comparison';
import type { TerrainError, TerrainRequest } from '../../terrain/data/terrain.models';

export const EXPERIMENT_SCHEMA_VERSION = 'architecture-race-v1';
export const DEFAULT_MEASURED_PAIRS = 10;
export const MIN_MEASURED_PAIRS = 1;
export const MAX_MEASURED_PAIRS = 30;
export const WARMUP_PAIRS = 1;
export const EXPERIMENT_ORDER = 'sequential-alternating-local-first';

export interface ExperimentConfiguration {
  readonly schemaVersion: typeof EXPERIMENT_SCHEMA_VERSION;
  readonly terrain: TerrainRequest;
  readonly warmupPairs: typeof WARMUP_PAIRS;
  readonly measuredPairs: number;
  readonly order: typeof EXPERIMENT_ORDER;
}

export type ExecutionMode = 'local' | 'remote';

/** Actual host response identities; request noise version is in configuration. */
export interface TrialIdentity {
  readonly coreBuildId: string;
  readonly algorithmVersion: string;
  readonly resultVersion: string;
  readonly workload: string;
  readonly executionProfile: string;
  readonly simulationVersion: string;
}

export interface ExperimentMetadata {
  readonly experimentId: string;
  /** UTC ISO 8601 labels, never used to subtract browser and server clocks. */
  readonly startedAt: string;
  readonly endedAt: string | null;
  readonly expectedIdentity: Omit<TrialIdentity, 'coreBuildId'>;
  readonly coreBuildIds: Readonly<Record<ExecutionMode, string | null>>;
  readonly applicationRevision: string | null;
  readonly browser: string | null;
  readonly hardware: string | null;
  readonly server: string | null;
  readonly network: string | null;
  readonly cacheState: string | null;
  readonly preparation: string | null;
  readonly startup: {
    readonly origin: 'before-experiment' | 'experiment-preparation' | 'unknown';
    readonly initMs: number | null;
    readonly runtimeMs: number | null;
    readonly initCount: number | null;
    readonly execution: string | null;
    readonly protocol: string | null;
    readonly runtimeVersion: string | null;
  };
  readonly interruptions: readonly {
    readonly at: string;
    readonly kind: 'tab-hidden' | 'navigation' | 'runtime-reset';
    readonly detail: string;
  }[];
  readonly notes: string | null;
}

export interface TrialDiagnostics {
  readonly width: number;
  readonly height: number;
  readonly treeCount: number;
  readonly rockCount: number;
}

export interface ExperimentFailure {
  readonly kind: TerrainError['kind'] | 'preparation' | 'execution';
  readonly message: string;
  readonly fields: Readonly<Record<string, string>>;
}

export type ExclusionCode =
  | 'warmup-failed'
  | 'trial-failed'
  | 'comparison-unavailable'
  | 'correctness-mismatch'
  | 'identity-changed'
  | 'build-mismatch'
  | 'build-unverifiable'
  | 'timing-inconsistent'
  | 'interrupted'
  | 'incomplete';

export interface ExclusionReason {
  readonly code: ExclusionCode;
  readonly detail: string;
}

type Reasons = readonly [ExclusionReason, ...ExclusionReason[]];
export type Assessment =
  | { readonly status: 'eligible'; readonly reasons: readonly [] }
  | { readonly status: 'excluded'; readonly reasons: Reasons };

type TrialPhase =
  | { readonly phase: 'warmup'; readonly pairIndex: null }
  | { readonly phase: 'measured'; readonly pairIndex: number };

type TrialOutcome =
  | {
      readonly status: 'success';
      readonly computeMs: number;
      readonly requestMs: number;
      readonly identity: TrialIdentity;
      readonly diagnostics: TrialDiagnostics;
    }
  | {
      readonly status: 'error';
      readonly computeMs: number | null;
      readonly requestMs: number | null;
      readonly identity: TrialIdentity | null;
      readonly diagnostics: TrialDiagnostics | null;
      readonly failure: ExperimentFailure;
    };

export type ExperimentTrial = TrialPhase &
  TrialOutcome & {
    readonly trialId: string;
    readonly pairId: string;
    readonly mode: ExecutionMode;
    readonly position: 0 | 1;
  };

export type PairVerification = TrialPhase &
  (
    | {
        readonly status: 'compared';
        readonly localTrialId: string;
        readonly remoteTrialId: string;
        readonly comparison: TerrainComparison;
        readonly assessment: Assessment;
      }
    | {
        readonly status: 'unavailable';
        readonly localTrialId: string | null;
        readonly remoteTrialId: string | null;
        readonly assessment: Extract<Assessment, { status: 'excluded' }>;
      }
  ) & { readonly pairId: string };

export type ExperimentResult = {
  readonly configuration: ExperimentConfiguration;
  readonly metadata: ExperimentMetadata;
  readonly trials: readonly ExperimentTrial[];
  readonly verifications: readonly PairVerification[];
} & (
  | { readonly status: 'completed'; readonly complete: true; readonly assessment: Assessment }
  | {
      readonly status: 'stopped';
      readonly complete: false;
      readonly assessment: Extract<Assessment, { status: 'excluded' }>;
    }
  | {
      readonly status: 'failed';
      readonly complete: false;
      readonly failure: ExperimentFailure;
      readonly assessment: Extract<Assessment, { status: 'excluded' }>;
    }
);
