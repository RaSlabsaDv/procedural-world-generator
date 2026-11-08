# Architecture Race v1

Status: Steps 1–2 implement this protocol, readonly record contracts, immutable
configuration capture and the sequential runner. Collection UI, statistics and
downloads remain future steps. This is an experiment schema, not a new mathematical workload.

## Configuration and sequence

Schema: `architecture-race-v1`. Capture one independent, frozen `TerrainRequest`
(including its frozen heightMap) for the entire experiment. Preserve every setting
and version without normalization or defaults for omitted terrain fields. Core
remains the canonical terrain validator. The pure configuration utility validates
only the measured-pair count: finite integer 1..30, default 10.

Warm up once per mode, Local then Remote, in a separately recorded warmup pair.
Measured pair 0 runs Local then Remote; pair 1 runs Remote then Local; continue
alternating. Execute all calls sequentially and record actual positions (0 or 1),
mode, pair ID and trial ID. Warmup pairIndex is null; measured pairIndex is zero-based.
Compare both successful results after every pair, including warmup, outside adapter
timings. Use the existing complete compareTerrains operation and fixed tolerance:
`abs(a-b) <= 1e-6 + 1e-5 * max(abs(a), abs(b))`. Check all numeric layers, simulation
summaries and tree/rock transforms, and exact categories, kinds, variants and indices.
Its numericMatch includes environment/instance/coverage agreement; biomesMatch adds
exact biome agreement. Neither boolean alone establishes build compatibility.

The runner holds one OperationLock through preparation, warmup, calls and
verification. Block interactive generation and PWA reload; defer scene construction
and rendering until the series ends. Do not publish intermediate maps to the preview.
Stop is cooperative between calls: finish an active call, retain its record, skip
remaining calls and mark the result stopped/incomplete. It does not cancel Core.
A stopped half-pair has an unavailable verification with null for the unattempted
trial ID; do not fabricate a failed trial for an operation never attempted.

## Measurement boundaries

Reuse TerrainService unchanged. Local awaits getRuntime **before** starting requestMs;
the timer starts before JSON serialization/worker invocation. Remote starts before
HttpClient invocation. Both end after decoding, typed-array normalization and contract
validation. Failed adapters currently throw without returning timings: record null
for unavailable durations, including requestMs; do not substitute zero or a different
outer timer. computeMs is the host timer around GenerateValidated, after parsing and
Core preparation, including result allocation. Core has no timers.

Capture loader initMs (worker creation to exports ready), runtimeMs, initCount,
execution and RPC protocol separately where available. Loader-module import is outside
those durations. PWA readiness can initialize Local before the experiment; startup
origin is before-experiment, experiment-preparation or unknown, based on observation,
not an invented cold-start assumption. Preserve null for unavailable browser/runtime,
server, cache, application revision, network and preparation metadata. ISO timestamps
are UTC wall-clock labels, never cross-machine duration clocks. Capture actual observed
build IDs per trial and first successful ID per mode in metadata, not a configured ID.

requestMs minus computeMs is combined overhead, including conversions, interop or
HTTP/server/network work. It is not pure network latency. Preserve raw negative or
inconsistent readings with explicit exclusion reasons; never clamp or make metrics
add up artificially. A finite nonnegative computeMs/requestMs pair with requestMs >=
computeMs is timing-consistent. Other readings remain diagnostic only. Unavailable
measurements are null. No startup, verification or display time is added to requestMs.

## Failure, identity and eligibility

Record every attempted trial, including structured validation/availability/protocol
failures and available partial diagnostics. A measured call failure does not suppress
the other mode's attempt when execution remains possible. Attempt both warmup calls where possible; either warmup call failing
prevents measured trials. Numerical/category disagreement stops further pairs after
recording the comparison. Failed comparisons retain their reason and available trial
references; they have no invented comparison metrics.

Freeze current workload/profile, result, algorithm, noise and simulation identities
from the existing terrain constants (diverse-landscape-v7, landscape-ecology-v8,
landscape-ecology-hydraulic-v8, landscape-worker-json-v8, value-noise-fbm-v1 and
hydraulic-grid-v1). Any observed identity or within-mode build change
invalidates the experiment and stops further pairs after preserving available evidence.
Cross-mode differing build IDs invalidate verified comparison. Matching empty,
unversioned or `-dirty` IDs remain unverifiable, even with identical arrays; diagnostic
collection may continue but cannot support a verified performance claim. Build
compatibility, correctness and measurement eligibility remain separate fields.

Each pair and the final result have an assessment: eligible with an empty reason list,
or excluded with at least one coded reason and detail. This does not turn failed
records into successes. A comparison may run on two successful maps even when build
identity is unverifiable. A compared pair is eligible only with numeric and category
agreement, compatible stable identities and consistent timings, and no observed
interruption. Error and unattempted trials make their pair unavailable/excluded.

Completed means every configured measured call/pair was attempted and verified or
recorded unavailable; it does not imply correctness or eligibility. Stopped and failed
results are incomplete and excluded. Failed denotes an execution/preparation failure
that terminates collection; ordinary per-trial errors can coexist with a completed
series. Record observed visibility changes, navigation interruptions and runtime
reset events with UTC timestamps. Observation cannot guarantee recovery after process
termination or control external CPU load/browser scheduling. Failed and incomplete
records remain exportable. Reasons are visible; no silent outlier removal.

## Records and bounded retention

TypeScript contracts live in experiments/data. Configuration, metadata, trials, pair
verifications and final result use readonly members. Success requires identity,
measurements and compact diagnostics (dimensions/tree/rock counts); errors carry a
structured failure with nullable available timing/identity/diagnostics. Pair verification
is either compared with existing complete TerrainComparison metrics, or unavailable
with reasons and nullable references. No record contains TerrainRun, full terrain
arrays, scene objects or retained generation history. Readonly contracts are reinforced by frozen configurations, compact records,
metadata snapshots and their nested collections. Full visualization results remain
separate from records and are transferred through takePreviewPair at most once.

Collection retains full results only for the current pair and at most one final
suitable pair for post-run visualization, releasing obsolete pairs. Small records and
verification metrics survive. Export must not duplicate arrays or collect map history.

## Future summaries and export (not implemented)

For each mode, separately summarize computeMs and requestMs: eligible count, median,
Q1, Q3, min/max, failed/excluded counts and reasons. Sort ascending and interpolate
at index `(n - 1) * p` for percentiles. Empty samples yield null statistics. Warmups
never enter measured summaries. Separate diagnostic summaries from verified eligible
summaries; an incomplete or excluded experiment cannot claim verified performance.
Preserve all raw samples, including outliers, failures and negative residuals.

JSON is the authoritative versioned record: full configuration, metadata, raw trials,
verification and explicit eligibility, without full maps. Future CSV uses one row per
attempted trial, including warmups/errors; stable columns are schemaVersion,
experimentId, pairId, trialId, phase, pairIndex, position, mode, status, computeMs,
requestMs, coreBuildId, workload, algorithmVersion, resultVersion, simulationVersion,
executionProfile, width, height, treeCount, rockCount, errorKind, errorMessage,
pairVerificationStatus, exclusionReasons. Unavailable cells are empty. Pair IDs link
to JSON verification records and experimentId links complete inputs/environment;
CSV is a flat companion, not a replacement for authoritative JSON.

Next: add experiment UI, then statistics and export against these contracts. Controlled research campaigns and separate documented cold-start scenarios
follow. No concurrent Race, Adaptive Mode, AOT, evolution or algorithm optimization is
part of this step. See [benchmarking](../BENCHMARKING.md).


## Step 2 runner lifecycle

ExperimentRunner is a root Angular service. start(configuration, conditions?) captures
an independent configuration immediately and rejects unsupported schema/order/warmup
policies. An active experiment or any other held OperationLock causes rejection;
starts do not queue behind readiness or reload. Rejection preserves the existing
active/finished result. After acquiring the lock, start clears prior retained maps and
records and prepares the shared runtime. It runs no extra generation calls beyond
the specified warmups and measured trials.

progress and result are readonly signals. Progress carries stage, attempted-trial
count, phase/index and actual mode/position. stop requests a boundary stop; dispose
also removes listeners, drops retained visualization maps and prevents new starts,
while the active call still settles before lock release. The service also disposes
on Angular destruction. takePreviewPair returns null during collection, transfers the
last numerically suitable same-request pair once after completion, and removes the
service's reference. A diagnostic pair with matching unverifiable build IDs may be
visualized; its eligibility remains excluded. Previous interactive editor results are
owned by the editor, are not duplicated in records, and remain static while locked.

Preparation failure, failed warmup or observed runtime reset takes terminal precedence
over Stop and produces failed/incomplete. Otherwise explicit Stop produces
stopped/incomplete. If every measured pair was attempted, the result is completed,
even when the final pair is excluded for a mismatch. A disqualifying earlier pair
stops further collection and produces failed/incomplete. Per-trial measured failures
permit later pairs; comparison exceptions between two successful results halt the
series. Cross-mode build mismatch also halts collection. Pair assessments and the
final assessment preserve all reasons; even previously eligible pairs do not make an
excluded experiment a verified performance claim.

Runtime reset detection compares observed initCount, execution and protocol before
and after calls. This is not a monitor for silent unreported worker failures.
visibilitychange records hidden transitions (including an initially hidden document);
pagehide records navigation/suspension and requests Stop. Listeners are removed after
collection and on disposal. Actual process termination can lose in-memory records.
The runtime's startup durations remain available separately; their origin is unknown
when the observed counters do not establish initialization timing. Failure records
retain any startup information observed before preparation failed.

Optional condition strings are operator-reported metadata, copied at start; no server
hardware, cache reset, network profile or runtime version is inferred. The browser user
agent is observed directly. Unavailable values remain null. No browser timers replace
adapter timings, and no API/WASM host or Core change is included.

The preview observes OperationLock directly as well as its paused input, so a delayed
Angular input update cannot permit a draw. New WebGL/asset setup and scene construction
wait until unlock; resize work and render submissions are suppressed while locked.
This does not wait for completion of previously submitted GPU work. The service is
not connected to an App action yet; current Verify remains a single equivalence check.
