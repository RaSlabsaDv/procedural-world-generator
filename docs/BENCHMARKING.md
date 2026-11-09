# Benchmarking Protocol

The primary workload is Rich terrain + hydraulic erosion. The sequential equivalence check, repeated-trial runner, editor panel, post-run summaries and export are implemented. Controlled campaign results remain planned. [Architecture Race v1](specs/ARCHITECTURE_RACE_V1.md) freezes the implementable protocol and record schema; Steps 1–4 supply contracts, immutable configuration, sequential collection, editor UI, summaries and export. This protocol defines the future controlled experiment. See [architecture](ARCHITECTURE.md) and [roadmap](IMPLEMENTATION_PLAN.md).

## 1. What we compare

We compare execution of the same mathematical workload in browser-hosted .NET WebAssembly and ASP.NET Core. Both modes use the same version of `WorldGenerator.Core` and an immutable set of parameters for each trial.

The primary outcomes are computation time and the time until the client receives a usable result. Offline availability and initial loading are tested in separate scenarios. Architecture Race runs each pair sequentially by default; a single demonstration does not replace a controlled measurement campaign.

## 2. Baseline configuration

- Primary profile: `landscape-worker-json-v14`, algorithm `diverse-landscape-v13`, result `landscape-ecology-v14`, simulation `hydraulic-grid-v1`, workload `landscape-ecology-hydraulic-v14`. Preserve the complete nested terrain request. Do not pool old workload or main-thread samples with this profile.
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
2. Dense cell fields contain `width * height` elements; surfaceWeights contains five values per cell. Sparse tree/rock/river arrays obey their documented budgets and matching vector lengths. All numeric values are finite.
3. For **every** pair of values `a`, `b`, the proposed condition holds:
   `abs(a - b) <= 1e-6 + 1e-5 * max(abs(a), abs(b))`.
4. Record maximum absolute error, mean absolute error, and the number of elements outside tolerance.
5. For the current workload, verify the ID array length, valid codes, and exact equality of every ID; floating-point tolerance does not apply to categories or tree kinds/variants/cell indices. Compare every moisture, temperature, slope, density and surfaceWeights element and every tree transform with the same documented tolerance; compare tree and rock counts, kinds, variants and indices exactly; compare every rock transform and groundY using the same tolerance. Compare every hydrology receiver and accumulation exactly, depression depths with the same tolerance, river indices exactly and river widths with the same tolerance; sparse network lengths must match. Compare every lake membership ID, descriptor integer, spill/crossing source and array length exactly; compare every lake water level with the established tolerance. Preserve the execution profile and never pool timings from different workload/profile versions, including v13 and v14.

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

The coastal-v2 step introduced workload/profile v10 and algorithm v9 for final
coastal coverage changes only.
The distance ceiling rises from 8 to 16, with slope/moisture-dependent local distance
and relative-height windows. The same byte/int scratch arrays have unchanged maximum
size; traversal can visit more cells. Core time includes this work and blending after
unchanged placement. Response bytes can change through coverage values, even though
all instances and non-coverage arrays remain identical. Schema, renderer resources
and timing boundaries are unchanged. Freeze matching v10 builds/requests for pairs
and do not infer performance gains from old/new smoke timings. See
[Coastal surfaces v2](specs/COASTAL_SURFACES_V2.md).


## Sparse rock workload v11

The rock step introduced algorithm v10 and result/workload/profile v11, changing rocks only. Core time
includes world-grid patches, multiple size ranges, full triangle-footprint support,
crown exclusion, bounded neighbor indexing and priority selection. The 8192 cap is
a ceiling, not a target. All non-rock data remain exact. Fewer records can reduce
JSON bytes while larger support/clearance checks alter computation; do not assume
a speedup or pool old/new observations. Both modes retain identical inputs/policies.

Placement allocation budget stays 32 MiB at 512x512; instance matrices stay capped
at 512 KiB/view. Six shared polyhedra, supplied-geometry validation and actual
bounds/shadow/display setup remain outside computeMs. No schema field, dependency
or control is added. Freeze matching v11 identities for experiments; software WebGL
smoke checks are correctness evidence, not controlled performance findings.


## Shared environment presentation state

The scene-environment-v1 foundation retains the fixed default daylight appearance
and mathematical identities. Its visualTimeSeconds is an explicit frozen phase,
not a wall clock; no animation loop or extra draw/pass is added. Environment
application waits outside the shared operation lock, and later updates do not
replace the original first-submission display metric. Future interactive sun/water
controls must record their common settings/time alongside application revision and
render quality for reproducible campaigns, without altering mathematical requests.
No instrumented stage profiling or performance claim is introduced by this step.


## Animated Ocean presentation

The Ocean stage adds display work only: clipping, geometry buffers, normal loading,
GPU upload and water frames never enter computeMs or mathematical requests. Its
shared animation hub stops synchronously under OperationLock, including pending RAF
callbacks, and resumes without advancing through the paused interval. No wave frames
compete with collection. First display submission still does not mean GPU completion.

Freeze camera, shared environment time and water phase for visual comparisons;
record ocean-presentation-v1, water color/turbidity/foam and motion policy alongside
the presentation revision. Normal asset wait contributes to textureWaitMs. Tests of
software WebGL allocation/draw caps establish correctness, not speed or GPU latency.
No stage timing, SIMD/AOT improvement or network-overhead attribution is claimed.


## Atmosphere presentation

Atmosphere-v1 adds static display work only: shader compilation/bindings, a tiny sky
triangle and fragment shading. It changes no mathematical field, algorithm/workload
identity, request or computeMs/requestMs boundary. No new sky animation competes
with collection; environment/atmosphere updates defer under OperationLock, and the
existing Ocean hub still pauses synchronously. Display setup and first submission
remain CPU/submission observations, not GPU-completion measurements.

Freeze enabled/haze/valleyFog, sun settings, wave phase, camera and application
revision for images or controlled comparisons. Reference mode restores the prior
linear-fog view and permits visual regression checks. Software WebGL draw/resource
checks prove bounded behavior, not a performance improvement. No extra stage
profiling, optimization configuration or controlled campaign is introduced.


## Sun control presentation

Interactive sun edits are presentation work outside computeMs/requestMs: light
updates, shadow fitting/submission and shader uniform changes must never be billed
to Core. Both views share one environment snapshot; no HTTP/worker generation is
invoked. Controls and synchronous event guards respect OperationLock. Deferred
first opening waits for unlock; latest programmatic environment state applies only
after release. The existing Ocean animation pause remains in force.

Record time-of-day, azimuth, atmosphere/water settings, frozen wave phase, camera and
application revision for reproducibility. Time slider step .25 hours and azimuth
step 1 degree are UI restrictions, not a change to the underlying environment contract.
No automatic clock advances the sun. A new lazy Sun code chunk changes application
packaging/offline identity, not the mathematical workload. First display submission
still is not GPU completion; software WebGL smoke evidence supports correctness,
not a controlled performance claim.


## Shadow assessment evidence

Shadow-quality-v1 is a correctness/visual assessment with unchanged production
rendering parameters and workload identities. Test-only bias probing is isolated
from accepted captures and must never be treated as a performance configuration
or a proven optimization. Recorded GPU uniforms, attachment formats and image
hashes describe rendering state, not GPU elapsed time. Software WebGL smoke runs
are not controlled performance measurements. Fit/update work remains presentation
CPU work outside computeMs/requestMs; operation-lock and first-submission rules
are unchanged. Freeze camera, sun and wave phase for paired views.


## Terrain normal microdetail

Terrain-microdetail-v1 is presentation only. Atlas fetch/bitmap/canvas decode are
included in textureWaitMs; texture allocation/upload, shader compilation and scene
setup belong to display work. None enters computeMs/requestMs, and first submission
is not GPU completion. No timer, animation or mathematical input/workload changes
are introduced. Existing OperationLock deferral and Ocean pause still gate rendering.

Freeze presentation revision, camera, lighting, atmosphere, water and wave phase
for images/campaigns. Detail has a documented world-distance fade, so camera matters.
Actual texture-array dimensions/mips, sampler limits and draw/resource checks are
correctness evidence; software WebGL smoke timings do not establish GPU performance
or optimization gains. The new asset changes application/offline packaging identity,
not the shared C# computation. No native suites rerun for unchanged native sources.


## Decorative grass presentation

Grass-presentation-v1 adds seeded visual placement, bounded obstacle indexing,
selection, instance/color construction and one color draw as display work only.
No grass records enter Core results, host transport or numerical comparison, and
no workload/profile identity changes. Its setup/submission respects OperationLock;
static tufts add no animation loop. Do not bill placement or upload to computeMs/
requestMs, and keep first submission distinct from GPU completion.

Freeze presentation revision, camera, sun, atmosphere, water and wave phase for
controlled images/campaigns. Identical Core results produce identical Local/Remote
visual buffers. Distance cutout does not remove vertex processing and is not a
measured LOD speedup. The 32768 cap and world-distance fade affect visible cover on
large maps; record them alongside application revision. Software WebGL instance/
buffer/pixel assertions establish correctness, not a controlled performance finding.

## Foliage color presentation

Foliage-variation-v1 computes seeded per-tree tints and fills/uploads RGB float32
instance attributes during display setup. This is excluded from computeMs/requestMs;
first render submission does not imply GPU completion. No Core input, algorithm,
workload/profile or comparison tolerance changes. Both views receive identical
colors for identical captured seed and Core tree identity. Freeze application
revision together with camera/lighting/atmosphere/wave phase for image comparisons.
The additional 12 bytes/tree and one crown attribute location are resource bounds,
not measured performance gains. Tree counts, draw calls and caster counts are
unchanged; no LOD or frame-rate improvement is claimed.

## Tree geometry LOD

Tree-lod-v1 changes presentation only. Initial classification, fixed buffer setup,
repacking/upload and subsequent camera-driven updates remain outside computeMs/
requestMs. OperationLock prevents this work during generation or controlled series.
Initial display timing includes the first classification/submission and remains
unchanged by later camera edits. Submission is still not GPU completion.

Record application revision, viewport, camera pose AND approach history for image/
render comparisons: hysteresis can retain either level within48..64 scaled distance.
No presentation history enters numerical Local/Remote equivalence. Color geometry
reduces32/40→18/20 triangles per far tree, while full-detail shadows remain static.
This does not establish faster generation, lower frame time or improved FPS. Extra
buffer capacity (3.375 MiB/view) and mixed-LOD color batches (whole-scene ceiling34)
may offset savings on some hardware. Software WebGL checks establish correctness,
not optimization benefits. No controlled hardware performance campaign was run.

## Color finishing

Color-finishing-v1 adds optional HDR scene rendering and a final color pass. All
allocation, MSAA resolve, resizing and submission are display work outside computeMs/
requestMs. They pause under OperationLock, including controlled collection; queued
settings apply after release. Initial display timing includes first allocation and
submission, while later edits do not overwrite it. Submission is not GPU completion.

Freeze tone mode, exposure, grading/vignette, drawing-buffer size/DPR, actual target
size/MSAA and camera/LOD history alongside lighting/wave phase. Existing experiment
exports do not automatically capture appearance state; record it with campaign
conditions. Exact historical reference is Reference/exposure1/effects-off. Other
Reference combinations use linear HDR compositing and are not pixel-identical.

One capped RGBA16F target plus final triangle adds GPU work and up to60 MiB/view,
120 MiB for two views. These are bloom-off Stage6A bounds; bloom is accounted for below and SSAO remains absent. These are resource bounds, not RSS
measurements or FPS claims; driver/default-canvas/shadow storage is additional.
Software WebGL pixel/pass assertions establish correctness only. No controlled
hardware performance campaign or native algorithm optimization was performed.

## Bloom presentation

Bloom-v1 is an optional display-only effect, default off. Freeze its enabled state
and policy/application revision alongside exposure, tone mode, camera/LOD history,
HDR/reduced-target sizes, sun, atmosphere and wave phase. Appearance state is still
recorded manually with campaign conditions; existing Core/request exports do not
capture these visual controls. Bloom eligibility uses unexposed luminance; final
exposure applies once to the composed scene plus halo.

Extraction and two blur passes add GPU work; two no-depth/no-MSAA RGBA16F targets
add at most1 MiB/view,2 MiB for comparison. Rendering may reach38 color calls/view;
shadow ceiling 19 and Core work remain unchanged. Disabled bloom executes no extra
passes and releases its targets/materials. This is resource accounting, not measured
GPU memory, completion time or FPS. Preparation/resize/submission remain outside
computeMs/requestMs and pause under OperationLock. No controlled campaign was run.

## Rejected SSAO candidate assessment

SSAO-assessment-v1 is isolated test tooling, not a supported runtime mode or benchmark
workload. It uses the same native Core through Local/Remote and actual renderer
factories; complete data/canonical matrices remain unchanged. It never runs inside
production experiment collection, and its rendering/diagnostic readback is outside
computeMs/requestMs. Recorded CPU submission costs are diagnostic, not GPU completion.

The dirty source revision, frozen policy and bundle hashes, actual cameras/LOD
history, appearance and GL resource data are recorded with raw assessment evidence.
Physical-GPU timing is explicitly unresolved: SwiftShader with an available timer
extension does not satisfy the 2 ms/4 ms hardware budget. No disjoint/hardware timing
samples or general optimization claims are inferred. Prototype target accounting
excludes diagnostic mask/readback scratch, existing finishing/shadow buffers and driver
overhead. Production remains Bloom v1, with no SSAO passes/resources/control added.

## Drainage workload v12

Hydrology Stage 1 adds Core priority-flood routing and accumulation to the existing
whole-call `computeMs`. Algorithm is `diverse-landscape-v11`, hydrology is
`d8-priority-flood-v1`, result/workload/profile are v12. Include all hydrology arrays
in equivalence: receiver indices and accumulation use exact equality; depression
depths use `1e-6 + 1e-5 * max(abs(a), abs(b))`. A per-cell hydrology mismatch makes
numeric equivalence fail. Existing experiment export containers retain their outer
schema; current comparison diagnostics additionally contain `hydrologyMismatchCount`.
This additive field does not make old and new workloads comparable.

Hydrology costs O(N log N) and has 12N output bytes plus 12N scratch bytes. At
512x512 this is 3 MiB retained numeric output and 3 MiB scratch, excluding headers,
existing terrain storage, JSON strings and transport/parser allocations. Client graph
validation temporarily uses three additional 4N arrays. No GPU allocation is added.

The real WASM/API smoke fixture (seed -7, 512x512, zero erosion iterations, no sea,
height 80) returned 21942523 UTF-8 JSON bytes; the nested hydrology object accounts
for 3575388 bytes including its field names. This is an observed payload, not a
worst-case JSON bound or a throughput measurement. Serialization/transfer/decoding
stay outside `computeMs`, with no new per-stage timing claim. Keep previous v11
measurements separate; rerun matching v12 builds for controlled experiments.

## River-network workload v13

Generation identity `diverse-landscape-v12` adds `river-network-v1` extraction to
whole-call Core computeMs; result/workload/profile advance to v13. Existing drainage
remains `d8-priority-flood-v1`. Keep v12 records separate from v13 and freeze matching
builds and requests before measurement. No old record is relabeled or migrated.

River indices/identity compare exactly, widths use the established float tolerance,
and differing lengths fail numeric equivalence. Current comparison diagnostics add
`riverMismatchCount` to the existing export container; outer schema and historical
records remain unchanged. Do not interpret this additive diagnostic as permission
to compare different workloads. Sparse vectors have K elements rather than width*
height; the latter length rule continues to apply only to dense cell fields.

Extraction costs O(N) time, 8K retained numeric bytes and no scratch arrays (K <= N).
The conservative output bound is 2 MiB at 512x512, excluding array/record headers,
existing terrain/drainage and JSON/parser storage. Client normalization retains 8K
bytes without creating another connectivity graph. Widths use grid-cell units, not
meters or flow rate. Serialization, transfer, decoding/comparison and rendering stay
outside computeMs; no per-stage timing or performance improvement is claimed.

In the real browser smoke fixture (seed -7, 512x512, zero erosion iterations, no
Ocean, height 80), the network contained 6977 cells with 55816 retained numeric bytes.
Its reserialized nested JSON object used 115228 UTF-8 bytes; the complete Local
response used 22057761 bytes. These observations are fixture-specific, not bounds
or performance measurements. 5241 selected cells crossed potential analysis fill;
they must not be rendered as exposed water before basin semantics are defined.

## Lake-basin workload v14

`diverse-landscape-v13` adds static `lake-basins-v1` analysis to existing whole-call
Core timing. Result/workload/profile advance to v14; drainage, river, noise and
hydraulic algorithm identities remain unchanged. Keep previous measurements and
frozen request/build IDs separate; no old benchmark record is relabeled.

Comparison includes every membership ID, descriptor integer, packed exit/crossing
source and length exactly. Water levels use the established float tolerance.
`lakeMismatchCount` participates in numeric equivalence and current JSON diagnostics;
outer export containers remain unchanged. An added diagnostic cannot make different
workload versions comparable. Static area and potential depression fill are not
retained-water volume or a lake conservation metric.

Conservative lake numeric output is 12N bytes (3 MiB at cap), plus at most 1280 bytes
of descriptor numeric fields and object/array headers. Actual exits are bounded by
selected area (<=8% of land). Core scratch is 4N+20*floor(N/16) bytes (1.3125 MiB at
cap), plus bounded metadata. The already-computed surface remains live (4N, 1 MiB);
it is neither reconstructed nor allocated a second time. Existing terrain/drainage/
river allocations, JSON strings and parsed JS arrays are additional. Client retains
the output vectors and uses a temporary N-byte seen array plus 4N queue to verify
connected membership. No lake arrays enter GPU buffers.

Selection/traversal is O(N) with at most 64 bounded selection scans; only the selected
roots (<=64) are sorted. JSON, RPC/HTTP, client decoding/comparison and rendering stay
outside computeMs. Browser smoke timings are not a controlled performance campaign.

Observed real-browser fixture: seed -7, 512x512, zero erosion iterations, no Ocean,
height 80. Six selected lakes cover 20971 cells (within the integer 8% budget), with
1048828 numeric output bytes including descriptor fields and 766377 reserialized
UTF-8 JSON bytes for the nested lake object. Complete Local response: 22824147 bytes.
The 129x97 seed 42 fixture with 8 erosion iterations selects 3 lakes over 141 cells.
These are payload/correctness observations, not memory-peak or performance claims.

## Inland-water display cost (unchanged v14 workload)

This presentation adds no Core computation, wire field or workload identity. Keep
generation v13 / result, workload and profile v14. Source result/simulation preservation
checks pass all 18 fixtures, including hydrology/rivers/lakes. Generation computeMs
excludes geometry, masking, material setup and submission; those remain in display
CPU setup. No FPS, GPU-duration or performance-improvement claim follows from smoke
checks on SwiftShader.

At most two added color draws/view, no water shadow draws: existing maximum color
ceiling 38 becomes 40; shadow ceiling 19 remains. Lake geometry has conservative 104*6B
numeric buffer bytes (B selected cells); river geometry has conservative 340*2N bytes.
Each is a bound per CPU/GPU copy, excluding object/driver overhead, not an observed
allocation or a combined peak. Field scratch/query storage is 17N (4.25 MiB at 512x512).
Empty inland data takes no field buffer. Full-size indexed geometry is counted then
allocated exactly; it is not silently truncated to meet a byte cap.

Observed seed -7, 512x512, height 80, zero erosion, no Ocean: 133895 lake vertices,
29862 river vertices, 4564768 numeric geometry bytes, 1564 supported and 5383 suppressed
nonterminal river edges. Both batches render in two color draws with zero shadow
casters. These are fixture-specific resource/correctness observations, not general
performance bounds. Canonical river/lake data remains complete despite visual
suppression. Floating-point tolerance and benchmark comparison semantics are unchanged.
