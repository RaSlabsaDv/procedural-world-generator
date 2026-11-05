# Benchmarking Protocol

This is a protocol for the baseline experiment. The WASM and API heightmap hosts now implement the transport, validation boundary, build identity, and `computeMs` boundary described here, but no benchmark runner or campaign results are implemented or reported yet. Module boundaries are defined in the [architecture](ARCHITECTURE.md), and implementation order is defined in the [roadmap](IMPLEMENTATION_PLAN.md).

## 1. What we compare

We compare execution of the same mathematical workload in browser-hosted .NET WebAssembly and ASP.NET Core. Both modes use the same version of `WorldGenerator.Core` and an immutable set of parameters for each trial.

The primary outcomes are computation time and the time until the client receives a usable result. Offline availability and initial loading are tested in separate scenarios. Architecture Race runs each pair sequentially by default; a single demonstration does not replace a controlled measurement campaign.

## 2. Baseline configuration

- `baselineVersion`: `json-v1`; initial `algorithmVersion`: `value-noise-fbm-v1`, `workload`: `heightmap`. After adding biomes, freeze the extended contract/algorithm version and `workload = heightmap+biomes`; both modes perform the same fixed workload throughout a campaign.
- Production Angular and Release .NET builds, without explicitly enabled WASM AOT. Record the actual execution mode, publish settings, and runtime versions.
- One sequential generator in Core, without Web Workers, parallel generation, or caching of computed maps.
- Identical parameters, operation order, and validation rules on both paths. Freeze parameters before starting a pair.
- JSON results for both modes; after decoding, the adapter creates a `Float32Array`. This conversion is excluded from Core time.
- Result values are final float32 heights in world units; `heightMultiplier` has already been applied in Core.
- Arrays use row-major order: `index = y * width + x`. The renderer does not alter heights to make results match.
- The API and client do not return stored generation results. Use the regular `POST /api/v1/heightmaps`, without a separate benchmark endpoint; set `Cache-Control: no-store`, exclude it from the service worker's data cache, and verify that requests actually execute.

Freeze the code version (`coreBuildId`, preferably a commit, plus a separate application revision), configurations, and transfer format for the campaign. Changing the algorithm, workload, JSON to binary, AOT, or compression creates a separate configuration; do not mix its results with the previous one.

## 3. Measurement boundaries

| Field | Start → finish | Meaning |
| --- | --- | --- |
| `computeMs` | After host parsing and Core preparation, immediately before `GenerateValidated` → completed Core result | Result allocation and mathematical generation, including runtime pauses within this boundary |
| `requestMs` | Before calling the adapter with prepared parameters → decoded result in typed arrays and validated contract | Complete Local or Remote operation after the WASM runtime is ready |
| `initMs` | Before WASM initialization → exports ready | Download and initialization under the recorded cache state; excluded from warm `requestMs` |
| `actionToDataMs` | User action → usable map data | UI waiting, preparation, any required initialization, and the request; excludes equivalence checking and rendering |
| `renderCpuMs` | Before visualization preparation → completion of synchronous CPU work | Geometry, colors, scene updates, and command submission, if included in the defined boundary |

In C#, use a monotonic timer around the same `GenerateValidated` call. Transport parsing, JSON serialization, validation and preparation, interop, map comparison, and rendering are excluded from `computeMs`. For `heightmap+biomes`, the timer also covers classification and biome ID allocation in both hosts. The timer belongs in thin host code; Core does not depend on browser or HTTP telemetry.

The current hosts implement this boundary with `Stopwatch`: after `HeightMapTransport` has parsed the request and `HeightMapValidator.Prepare` has produced a `ValidatedHeightMapRequest`, each host starts its timer and calls `HeightMapGenerator.GenerateValidated`. This keeps invalid requests from being timed and avoids revalidating in the generator. The JSON transport and strict error envelope are part of the baseline `json-v1` overhead and are included in `requestMs`, not `computeMs`.

`coreBuildId` is generated at build time from repository HEAD, checking `global.json`, `src/core`, and `src/hosts` for modifications. It has a `-dirty` suffix for modifications and `unversioned` as an invalid fallback when Git is unavailable, the revision is invalid, or either Git command fails. Failed Git diagnostics must not become build identity. It must not be replaced by an assembly `ModuleVersionId`, which can change without a source change. Both hosts return this value in `GenerationResponse`; a pair with different build IDs or algorithm versions is incompatible.

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
5. If the workload includes biomes, verify the ID array length, valid codes, and exact equality of every ID; floating-point tolerance does not apply to categories.

Validate this tolerance against fixtures before freezing the baseline. Do not increase it after the fact to conceal a discrepancy. A hash is useful for exact equality but does not replace element-by-element comparison with a tolerance.

A pair with a correctness failure remains in the raw data with an error status; do not use it as evidence of a performance advantage. Preserve a small reproducible example and diagnostics.

## 5. Test matrix and execution order

Initial proposal for the pilot:

| Parameter | Values |
| --- | --- |
| Square map size | `128×128`, `256×256`, `512×512` |
| Seed | `42`, `2026`, `-7` |
| Other parameters | `octaves = 4`, `noiseScale = 0.03`, `heightMultiplier = 30` |
| Network conditions | Two fixed profiles |
| Warm-up | 3 runs per mode for each combination of size, seed, and profile |
| Main sample | 30 runs per mode for each such combination |

Use the pilot to verify safe sizes and sufficient warm-up. If parameters need to change, do so before the main campaign and record the reason. These numbers are a starting plan, not a guarantee of statistical adequacy.

For each combination, execute 30 sequential pairs. Alternate `Local → Remote` and `Remote → Local`, with 15 pairs in each order. Start the next run only after the previous one has completed. Preserve warm-up records with `warmup = true`, but exclude them from the main aggregates.

During runs, stop the renderer/animation loop, avoid rebuilding meshes, and do not compute statistics for previous maps. Compare each pair after it completes and before starting the next pair. Keep only the current pair of maps in memory, then release references.

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

For payloads, distinguish the number of values, logical float32 size (`width * height * 4` bytes), JSON size in UTF-8, and actual transferred bytes. Compression and transport overhead affect the last quantity. If the tool cannot reliably report transferred bytes, record `null` instead of substituting the logical size.

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
