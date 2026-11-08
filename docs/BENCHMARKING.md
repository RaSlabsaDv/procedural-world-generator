# Benchmarking Protocol

The primary workload is Rich terrain + hydraulic erosion. The sequential equivalence check, repeated-trial runner, editor panel, post-run summaries and export are implemented. Controlled campaign results remain planned. [Architecture Race v1](specs/ARCHITECTURE_RACE_V1.md) freezes the implementable protocol and record schema; Steps 1–4 supply contracts, immutable configuration, sequential collection, editor UI, summaries and export. This protocol defines the future controlled experiment. See [architecture](ARCHITECTURE.md) and [roadmap](IMPLEMENTATION_PLAN.md).

## 1. What we compare

We compare execution of the same mathematical workload in browser-hosted .NET WebAssembly and ASP.NET Core. Both modes use the same version of `WorldGenerator.Core` and an immutable set of parameters for each trial.

The primary outcomes are computation time and the time until the client receives a usable result. Offline availability and initial loading are tested in separate scenarios. Architecture Race runs each pair sequentially by default; a single demonstration does not replace a controlled measurement campaign.

## 2. Baseline configuration

- Primary profile: `landscape-worker-json-v10`, algorithm `diverse-landscape-v9`, result `landscape-ecology-v10`, simulation `hydraulic-grid-v1`, workload `landscape-ecology-hydraulic-v10`. Preserve the complete nested terrain request. Do not pool old workload or main-thread samples with this profile.
- Production Angular and Release .NET builds, without explicitly enabled WASM AOT. Record the actual execution mode, publish settings, and runtime versions.
- One sequential generator in Core per mode. Local uses one dedicated worker/runtime, with no parallel C# generation or computed-map caching. Worker messaging belongs to adapter overhead.
- Identical parameters, operation order, and validation rules on both paths. Freeze parameters before starting a pair.
- JSON results for both modes; adapters normalize numeric layers into the typed arrays defined by each result contract. This conversion is excluded from Core time.
- Result elevations are final float32 values in illustrative world units and already include `heightMultiplier`; renderers must not normalize each map by its own extrema.
- Arrays use row-major order: `index = y * width + x`. The renderer does not alter heights to make results match.
- The API and client do not return stored generation results. Use the regular workload endpoint (`POST /api/v1/terrains`), without a separate benchmark endpoint; set `Cache-Control: no-store`, exclude it from the service worker's data cache, and verify that requests actually execute.

Freeze the code version (`coreBuildId`, preferably a commit, plus a separate application revision), configurations, and transfer format for the campaign. Changing the algorithm, workload, JSON to binary, AOT, or compression creates a separate configuration; do not mix its results with the previous one.

## 3. Measurement boundaries

| Field            | Start → finish                                                                                              | Meaning                                                                                                            |
| ---------------- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `computeMs`      | After host parsing and Core preparation, immediately before `GenerateValidated` → completed Core result     | Result allocation and mathematical generation, including runtime pauses within this boundary                       |
| `requestMs`      | Inside the adapter, before serialization/dispatch (after Local runtime readiness) → normalized and validated result | Complete Local or Remote operation after the WASM runtime is ready                                                 |
| `initMs`         | Worker creation → WASM exports ready                                                                        | Worker/runtime startup under recorded cache state; excludes loader-module import and warm `requestMs`              |
| `actionToDataMs` | User action → usable map data                                                                               | UI waiting, preparation, any required initialization, and the request; excludes equivalence checking and rendering |
| `renderCpuMs`    | Before visualization preparation → completion of synchronous CPU work                                       | Geometry, colors, scene updates, and command submission, if included in the defined boundary                       |

The Angular PWA displays host `computeMs`, browser `requestMs`, and the existing loader's one-time `initMs`. The current loader measures worker creation through WASM readiness; worker-side `runtimeMs` reports runtime startup. Importing the loader module precedes both. This is not a complete cold page-load measurement. Offline preparation verifies the cached version and eagerly initializes Local under the shared operation lock before interactive generation. Record this startup/preparation cost and cache state separately; the displayed first interactive Local request is not a cold-runtime measurement. The sequential UI equivalence check performs no repeated trials and excludes comparison and rendering from `requestMs`. Matching dirty or unversioned identities do not establish build compatibility even when numerical values match.

In C#, use a monotonic timer around the same `GenerateValidated` call. Transport parsing, JSON serialization, validation and preparation, interop, map comparison, and rendering are excluded from `computeMs`. Core time includes composition, simulation allocation/steps, summaries, final conversion, ocean/environment fields, biomes, vegetation density, capped candidate selection, grove/clearing masks, edge distance, variant selection and surface coverage allocation/derivation, rock eligibility/clustering/support, tree indexing, spacing, priority sorting and rock output allocation. Tree geometry and instance-matrix construction are renderer CPU work, outside Core/request timings. The timer belongs in thin host code; Core has no HTTP or browser telemetry. Hosts parse through `TerrainTransport` and prepare through `TerrainValidator.Prepare`, then time `TerrainGenerator.GenerateValidated`. Worker messaging and JSON remain adapter overhead in `requestMs`.

`coreBuildId` is generated at build time from repository HEAD, checking `global.json`, `src/core`, and `src/hosts` for modifications. It has a `-dirty` suffix for modifications and `unversioned` as an invalid fallback when Git is unavailable, the revision is invalid, or either Git command fails. Failed Git diagnostics must not become build identity. It must not be replaced by an assembly `ModuleVersionId`, which can change without a source change. Both hosts return this value in `TerrainGenerationResponse`; a pair with different build IDs or algorithm versions is incompatible.

In the browser, use the monotonic Performance API. `requestMs` includes request serialization, host-side validation, computation, result serialization/transfer, JSON decoding, normalization to `Float32Array`, and response contract validation. Comparing the two maps takes place outside this boundary. For Remote, completion means that the entire response body has been read, not merely that headers have arrived.

`requestMs - computeMs` is **combined overhead**. For Remote, it also includes queuing, server processing, networking, and parsing; for Local, it includes interop and conversions. It does not measure pure network latency. Do not subtract browser and server timestamps: their clocks are not synchronized.

Flag a negative residual as a precision or instrumentation issue and preserve the raw values; do not hide it by clamping to zero. Do not force separate metrics to add up exactly when additional work occurs between their boundaries.

`renderCpuMs` does not indicate completion of GPU work or the appearance of a frame on screen. `requestAnimationFrame` is not proof of GPU completion either. If a separate frame estimate is added, document its boundary and limitations; do not label it as exact GPU time.

## 4. Correctness before performance

Before the campaign, run fixtures and verify the contract in both environments. For each measured pair, compare results after both timed operations have finished:

1. Identical parameters, `algorithmVersion`, `coreBuildId`, `workload`, `width`, and `height`.
2. Each array has exactly `width * height` elements; all values are finite.
3. For **every** pair of values `a`, `b`, the proposed condition holds:
   `abs(a - b) <= 1e-6 + 1e-5 * max(abs(a), abs(b))`.
4. Record maximum absolute error, mean absolute error, and the number of elements outside tolerance.
5. For the current workload, verify the ID array length, valid codes, and exact equality of every ID; floating-point tolerance does not apply to categories or tree kinds/variants/cell indices. Compare every moisture, temperature, slope, density and surfaceWeights element and every tree transform with the same documented tolerance; compare tree and rock counts, kinds, variants and indices exactly; compare every rock transform and groundY using the same tolerance. Preserve the execution profile and never pool v1/v2/v3/v4/v5/v6/v7/v8/v9/v10 timings.

Validate this tolerance against fixtures before freezing the baseline. Do not increase it after the fact to conceal a discrepancy. A hash is useful for exact equality but does not replace element-by-element comparison with a tolerance.

A pair with a correctness failure retains its comparison metrics and an explicit correctness-mismatch exclusion; do not use it as evidence of a performance advantage. Preserve a small reproducible example and diagnostics.

## 5. Test matrix and execution order

Initial proposal for the pilot:

| Parameter          | Values                                                                                                                                                                                                                                             |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Square map size    | `128×128`, `256×256`, `512×512`                                                                                                                                                                                                                    |
| Seed               | `42`, `2026`, `-7`                                                                                                                                                                                                                                 |
| Iterations         | `0`, `32`, `128` (respect the cell-iteration cap)                                                                                                                                                                                                  |
| Other parameters   | `octaves = 4`, `noiseScale = 0.03`, `heightMultiplier = 30`, `mountainStrength = 0.55`, `warpStrength = 2`, `rainfall = 0.05`, `evaporation = 0.1`, `plainsCoverage = 0.45`, `mountainCoverage = 0.30`, `globalMoisture = 0.65`, `seaLevel = 0.16`, `globalWarmth = 0.6`, `vegetationDensity = 1`, `landformRegionScale = 1` |
| Network conditions | Two fixed profiles                                                                                                                                                                                                                                 |
| Warm-up            | 1 run per mode for each immutable configuration (Architecture Race v1)                                                                                                                                                                                    |
| Main sample        | 10 measured pairs by default; configure up to 30 pairs per experiment                                                                                                                                                                                                         |

Use the pilot to verify safe sizes and sufficient warm-up. Freeze campaign inputs before collection. Architecture Race v1 fixes one warmup per mode; changing that policy requires a documented protocol revision, not an unrecorded runner adjustment. The default sample count is not a guarantee of statistical adequacy.

For each combination, configure the measured-pair count explicitly (default 10, up to 30). Alternate `Local → Remote` and `Remote → Local`, starting Local; 30 pairs gives 15 in each order. Start the next call only after the previous one has completed. Preserve `phase = warmup` records separately and exclude them from main aggregates.

During runs, stop the renderer/animation loop, avoid rebuilding meshes, and do not compute statistics for previous maps. Compare each pair after it completes and before starting the next pair. Keep only the current pair and at most one final suitable visualization pair; release obsolete references.

Keep the tab active and visible; record power-saving settings, charging state, and background load. Mark background transitions or interruptions in the data. Do not run DevTools profiling during the main campaign; if DevTools is needed for throttling, record that fact and keep conditions consistent.

## 6. Network and environment

Use at least two profiles: the actual connection without artificial limits, and an explicitly configured restriction. For the latter, record the tool, version, affected traffic directions, delay, download/upload bandwidth, and packet loss if applied. Do not call a tool's configured parameter a measured RTT without verification.

A profile can use browser throttling or a system tool; the run protocol must provide exact settings or commands and a verification method. A label such as “slow internet” is insufficient. Repeat Local under the same profile as a control; after warm-up, it should not require the network.

For each environment, record:

- Client CPU, RAM, OS, and power state; browser and version.
- Server CPU, RAM, OS, and location; whether it shares the physical machine with the client, runs in a container, or runs in a VM.
- .NET SDK/runtime, WASM workload, execution modes, and exact build/publish flags.
- Angular, application, and Core versions, `baselineVersion`, and build identifier.
- API address/topology without secrets; HTTP version, compression, and network profile.
- Browser cache, service worker, WASM runtime, and server process states.

For payloads, distinguish the number of values, logical float32 size per field (`width * height * 4` bytes; five grid float fields plus five interleaved coverage channels in v4, plus categories and tree records), JSON size in UTF-8, and actual transferred bytes. Compression and transport overhead affect the last quantity. If the tool cannot reliably report transferred bytes, record `null` instead of substituting the logical size.

## 7. Cold-start scenarios

Test these separately from the warm campaign:

1. First load with no HTTP/SW cache and no WASM runtime: downloaded assets, readiness, and first local generation.
2. Reopening with cached assets but a new runtime: initialization and first generation.
3. First Remote request after restarting the API: first execution/JIT after the server is ready to accept requests, with the browser state explicitly recorded. If process-start-to-readiness time is needed, measure it separately; the regular HTTP timer does not cover it.

For each scenario, document the reset procedure, number of repetitions, and how the initial state is verified. Calling the generator again in the same tab is not a cold start. Do not combine server startup, WASM download, and warm requests in one sample.

## 8. Offline verification

Run this on a production deployment in an environment where the service worker operates:

1. Clear previous site data, open the application online, wait for service worker control, load WASM, and successfully generate a map.
2. Verify that the required app/runtime/assembly assets are cached and record the build and SW version; a “ready” message alone is insufficient.
3. Disable networking for the site/API, reload the page, and run Local with a **new seed** that has not been used before.
4. With networking still disabled, open the URL in a new regular tab and generate locally again. This verifies bootstrapping from the cache, rather than relying solely on an already running runtime.
5. Invoke Remote and verify a clear availability error, with no automatic fallback to Local.

Record the exact steps, browser, outcome of each step, and limitations. `navigator.onLine` does not replace an actual availability check. After an application update, repeat the compatibility test for the cached app and WASM assets; each new version requires its own offline readiness check.

## 9. Data and analysis

Export campaign metadata as JSON and raw trial records as CSV/JSON. Each record contains `runId`, `caseId`, `pairId`, trial number and order, mode, warmup/status, complete inputs, environment/profile IDs, `coreBuildId`, application revision, algorithm/baseline versions, `workload`, measured durations, and available payload sizes. Unmeasured quantities are `null`.

For each pair, include the correctness result, maximum and mean error, and discrepancy count. For errors, include the type and message; for interruptions, include the known cause. Preserve all failures and outliers; exclusion from aggregates requires a predefined rule and a visible reason.

Do not export every large heightmap: reproduction parameters, metadata, checks, and selected fixtures/failing examples are sufficient. Shared environment metadata can be stored separately and referenced by ID from trial records.

Report success/failure counts, median, and IQR separately by mode, size, seed, and network profile. Publish the quartile calculation rule. With 30 observations, p95 is unstable; do not make it the main finding. Include raw data, reproduction commands, and charts with units and metric boundaries.

## 10. Limits of the conclusions

Different hardware prevents attributing the entire difference solely to WASM or the server architecture. An API on loopback does not model a real remote network, and a server on the client machine shares resources with the browser. JSON overhead is a property of the chosen baseline.

Synchronous WASM can block the UI; a `Promise` alone does not prevent this. Time to usable data does not fully describe interactivity. Limit conclusions to the tested sizes, configurations, and conditions; do not declare a universal winner. Do not report numerical results before conducting the experiments.

## Display boundary

The interactive Three.js card reports CPU scene setup and first render submission only. It does not measure GPU completion or include the deferred module download. It must not be added to `computeMs` or request-to-data time. Biome allocation/classification is already inside Core in both execution modes. Rendering is on demand and pauses during a shared operation. The trial runner holds the shared lock to defer scene construction until its measurement series completes; the interactive equivalence check is not that runner. Preserve `resultVersion` along with the algorithm, workload, and build identity in future trial exports. Do not combine historical workload timings with this workload.

## Hydraulic workload scaling and worker execution

The hydraulic profile is specified in [LANDSCAPE_V3.md](specs/LANDSCAPE_V3.md). Use map size and iteration count as independent axes, including a zero-step composition reference. Environment fields and bounded vegetation selection are included even at zero steps. Iterations add genuine simulation work without enlarging final-only geometry or returning simulation history. No convergence shortcut or no-op repetition is used.

Offline preparation normally initializes the worker/runtime before interactive generation. Record startup, cache state, worker protocol and execution model separately. `requestMs` includes string serialization, RPC or HTTP, parsing, normalization and validation. C# `computeMs` excludes those costs. The browser smoke matrix through 512x512x128 established scalable work and active main-thread heartbeats, not controlled comparative performance. Raw evidence is generated at ignored `artifacts/landscape-verification.json`; the work cap is 33,554,432 cell-iterations and steps are also limited to 2048.

Historical v3 kept the v2 work/tree budgets and hydraulic kernel but changes ecological rules and adds a required tree kind. Include biome/category decisions in Core timing and all category geometry/matrices in display timing. Record actual v3 JSON bytes; the numeric field sizes alone omit categories, JSON syntax and tree records. Historical v2 timings must remain separate.

Stage 2 adds a required five-channel float32 surfaceWeights array while preserving the v3 generation algorithm and hydraulic kernel. Include the coverage pass in Core time; strict decoding, comparison and four-channel GPU packing stay outside Core time. Never pool v3/v4 result/workload/profile samples. Reserved WASM memory and smoke JSON parse/copy diagnostics are not live managed memory or a controlled latency result.

Rendering revision daylight-shadow-v1 adds static directional shadows and fog only.
Record its configuration separately from the unchanged v4 Core workload identities.
The initial shadow map/color submission can add setup time and GPU work; both remain
excluded from computeMs and requestMs. Orbit-only frames reuse the shadow map. The
trial runner must continue to defer all scene construction/rendering during
measured pairs; the static interactive renderer is not that runner. Attachment byte
estimates, software-WebGL smoke timings and diagnostic API requests are not a
controlled performance campaign.

Stage 4 changes vegetation generation, so freeze the v5 workload/profile separately
from v4 campaigns. Core timing includes the two-buffer edge pass, spatial masks,
final density and variant decisions. JSON adds the required numeric variant; record
actual serialized bytes rather than inferring transfer cost from tree count. Extra
kind/variant batches and their static initial shadows belong to display work, not
Core time. Height/climate/biome/surface equations stay frozen, but tree density and
selection intentionally change. No cross-version performance advantage is claimed.

Stage 5 freezes v6 workload/profile separately from v5. It appends decorative rock
placement after unchanged trees: cluster/eligibility work, exact triangle support,
tree grid construction, collision checks, priority sorting, capped spacing and output
allocation are inside computeMs in both locations. Rock JSON, strict normalization,
full comparison and instance/bounds/shadow setup remain outside computeMs. Record
actual rock counts, variants, serialized UTF-8 bytes and runtime memory; 512 KiB of
maximum rock matrices alone does not describe total memory. Geometry uses at most
six extra instanced meshes, so the current color/initial shadow budget is nineteen
calls per view. Baseline tree, terrain, climate and hydraulic outputs remain exact;
additional Core work means v5/v6 timings cannot be pooled. Trunk clearance uses the
actual returned trees, so vegetation density can affect rock availability.

Stage 6 uses algorithm diverse-landscape-v6 and result/workload/profile v7, with
the same output schema and hydraulic-grid-v1 kernel. New local height contributions
run before erosion, with at most eight extra ValueNoise evaluations (32 lattice
hashes) per sample and no extra map buffers. Include this arithmetic in computeMs
in both hosts. Downstream ecology, tree and rock policies retain their rules but
receive different heights, so counts and JSON bytes may change. Never infer a
performance advantage from unpaired historical/new smoke timings. Freeze version,
request and build identity per campaign; transport, normalization/comparison and
rendering boundaries remain unchanged. See LOCAL_RELIEF_V1.md.

Stage 7 freezes workload/profile v8 separately. Core time now includes the byte
distance buffer, integer queue, shoreline seeding/bounded propagation and in-place
coastal blending after unchanged placement. No distance field or extra output array
is serialized. Exact non-coverage hashes preserve the prior mathematical workload
outputs, while added computation still requires a new workload identity. Record
actual coverage JSON bytes; populated sand and changing other channel decimals can
change payload size without changing its five-channel schema. Fifth-texture loading
and the extra scalar GPU attribute are display/asset costs outside Core/request
timing. Active coverage attributes total 5 MiB/view, 1 MiB extra at 512x512; texture
storage estimates become 1.67 MiB/view for five active assets already in the offline
catalog. Scratch raw storage is 1.25 MiB, not total runtime memory. See COASTAL_SURFACES_V1.md.


## Architecture Race v1 collection policy

The [v1 specification](specs/ARCHITECTURE_RACE_V1.md) fixes one Local/Remote warmup
pair, default 10 measured pairs (integer 1..30), and alternating sequential order
starting Local. Retain actual order, failed attempts, unavailable measurements as
null and explicit exclusion reasons. Runtime startup/preparation is separate; current
failed adapters expose no durations. A negative requestMs-minus-computeMs residual
remains raw and excludes that pair from verified timing summaries.

Use the existing full-result comparison after each successful pair, outside timers.
Build changes, workload changes and cross-mode build mismatch invalidate comparison;
matching dirty/unversioned builds permit diagnostics only. Numeric/category mismatch
stops further pairs. Warmup failure prevents measured trials. A measured failure
still permits attempting the other mode; stop finishes an active call without
claiming to cancel Core. Incomplete results remain exportable and excluded from
verified claims. Record observed interruptions; external CPU load is not controlled.

Summaries exclude warmups and separate diagnostic/verified samples. Quartiles
use sorted index (n-1)*p with linear interpolation; preserve outliers and give counts
and reasons for exclusions. JSON retains complete small records and configuration;
CSV includes each attempted trial, warmups/errors included. Neither retains full maps.
Steps 2–4 implement collection, summaries and export using these boundaries; no
controlled campaign is claimed.


## Interactive experiment collection

The Architecture Race panel now captures the editor draft once and runs the v1
sequence through ExperimentRunner. Its progress UI reads only compact state; it
publishes no intermediate maps and performs no statistics during collection.
Final visualization reuses the retained pair's existing comparison after settlement.
Raw trial tables include warmups and failed calls; unavailable durations are distinct
from zero. Collection status, correctness, build compatibility and exclusions remain
separate. No winner, speedup or aggregate is inferred by this UI.

The race browser regression uses an explicitly artificial HTTP proxy gate to check
Stop and paused scenes while retaining normal SW behavior. These readings, like other
browser smoke timings, must not be used as controlled campaign results. The current
UI does not automate cache resets, server preparation or network/hardware control.


## Implemented summary/export derivation

architecture-race-summary-v1 operates only on settled records. Diagnostic distributions
include individually usable successful measured values; verified distributions require
an eligible completed experiment and eligible compared measured pair references.
Recorded exclusions are not reclassified. Actual identity tuples partition distributions
within each mode/metric, so build/workload changes never produce a pooled median.
Total measured = included + failed + excludedSuccessful; unavailable nulls overlap
failed/excluded counts. Issue flags retain unique affected trial IDs and may also apply
to included diagnostic readings. Nonfinite/negative values never enter distributions.
Negative residuals remain raw; individually usable diagnostic durations are flagged,
while verified claims remain excluded. Warmups and unattempted calls never inflate
measured counts; outliers remain included when otherwise usable.

The authoritative JSON export wrapper retains the complete record, with explicit
specialNumbers entries for values JSON cannot faithfully preserve (including -0).
CSV preserves all attempted calls with fixed columns, exact numeric strings, quoted
multiline text and spreadsheet formula mitigation; JSON retains original text.
Summaries are not embedded or computed during collection. See the
[complete rules](specs/ARCHITECTURE_RACE_V1.md#step-4-summary-and-export-rules).
A controlled campaign must separately freeze builds, environment and network conditions;
these utilities neither automate those conditions nor establish a performance winner.


## Regional climate workload identity

The regional-climate step introduced workload/profile v9 and algorithm v8, replacing
climate/snow semantics while
keeping JSON shape and simulation version unchanged. Core time includes two
three-octave climate fields (six noise samples/cell, formerly seven), classification,
coverage and all downstream placement/coastal work. There is no added map-sized
climate allocation. Changed ecology can alter instance counts, response bytes and
display setup despite unchanged heights. Use matching v9 identities and complete
requests for each pair; never compare old/new smoke timings as an architectural
performance result. The [climate specification](specs/REGIONAL_CLIMATE_V1.md) fixes
constants and numerical references.


## Coastal v2 workload identity

Current workload/profile v10 and algorithm v9 change final coastal coverage only.
The distance ceiling rises from 8 to 16, with slope/moisture-dependent local distance
and relative-height windows. The same byte/int scratch arrays have unchanged maximum
size; traversal can visit more cells. Core time includes this work and blending after
unchanged placement. Response bytes can change through coverage values, even though
all instances and non-coverage arrays remain identical. Schema, renderer resources
and timing boundaries are unchanged. Freeze matching v10 builds/requests for pairs
and do not infer performance gains from old/new smoke timings. See
[Coastal surfaces v2](specs/COASTAL_SURFACES_V2.md).
