# Implementation Roadmap

**Status:** Phases 0–1 are complete. The shared C# library, scalar/bulk-array probe, solution, native/API tests, standalone WASM host, ASP.NET Core API, and minimal Angular local/remote paths are implemented. Scalar and bulk-array results, runtime reuse, API error handling, and a single-origin production build are verified. Phase 2 Step 1 now provides the v1 heightmap request/result contracts and canonical validation; the generator, host heightmap endpoints, and 2D MVP remain next. See [development instructions](DEVELOPMENT.md) for the current commands. This plan follows the [Project Brief](PROJECT_BRIEF.md), [architecture](ARCHITECTURE.md), and [measurement protocol](BENCHMARKING.md).

Phases are completed based on verified outcomes. Calendar estimates should follow the PoC, once the cost of WASM integration is clearer. Timing boundaries are introduced early; the full Race and experiments follow visualization and PWA support, as required by AGENTS.md. Keep `README.md` empty for now and record setup instructions in `docs/`.

## Sequence and dependencies

| Phase | Depends on | Observable result |
| --- | --- | --- |
| 0. Toolchain and scaffolding | — | Reproducible build/test commands for the initial projects |
| 1. WASM + API PoC | 0 | Identical scalar and bulk-array results in both modes |
| 2. Generator + 2D | 1 | A deterministic map with a validated contract and timings |
| 3A. PWA/offline | 2 | Offline reload and new Local generation |
| 3B. 3D + biomes | 2 | Equivalent interactive terrain in both modes |
| 4. Architecture Race + runner | 3A, 3B | Comparisons, repeated trials, and raw data export |
| 5. Experiments and report | 4 | Reproducible results and supported conclusions |

Phases 3A and 3B are independent after Phase 2. For one developer, start with 3A to test offline risks earlier. The remaining phases are sequential. The MVP is complete after Phase 2; the coursework is complete after Phase 5.

## Phase 0 — Toolchain and scaffolding

**Work:** Check available SDKs and Angular/Node/TypeScript compatibility; choose a stable .NET SDK and matching WASM workload/template. Create an Angular project, a C# solution with Core, API, and WASM host projects, and a minimal test structure. Pin the SDK (`global.json`), Node/package manager, and dependencies through lockfiles. Extend `.gitignore` for Angular and generated WASM assets.

**Done when:** The initial projects build, the test runner starts, and project documentation contains verified Linux commands and versions. An empty test run is not evidence of correctness. Toolchain selection remains provisional until Phase 1 succeeds.

## Phase 1 — Verify both execution paths

**Work:** Implement a small deterministic method in the core and call it from Angular through JS/.NET and HTTP. First verify a known integer scalar, then an array transferred in one call. Add a core timer to both hosts, separate WASM initialization timing, and adapter duration measurement. Configure Release publishing and copy the bundle into Angular assets before the frontend build.

**Done when:**

- Angular → WASM → Core and Angular → API → Core return the expected scalar and every array element, including on repeated calls.
- Transfer is verified with a small array and an array matching the planned maximum map size; there are no per-element interop calls.
- The WASM runtime initializes once; runtime loading failures and API unavailability are shown in the UI.
- Both paths work from a static production build without the Angular development server.
- Unit/API/browser smoke checks and reproduction commands are documented.

**Gate:** If standalone WASM, bulk transfer, or publishing fails, resolve the PoC first. Do not implement the generator or 3D yet, replace C# with a TypeScript algorithm, or replace Angular with a Blazor UI.

## Phase 2 — Contract, generator, and 2D MVP

**Work:** Implement the v1 contract, identical validation, value-noise/fBm in the core, and shared size limits. Fix the hash implementation and formulas, reference outputs, and numerical tolerance. Replace the test array with a real heightmap; add parameter controls, mode selection, a 2D preview, and real timings. Cross-runtime comparison at this stage is a test, not the full Race UI.

Step 1 is complete: `HeightMapRequest`, `HeightMapLimits`, `HeightMapValidator`/`ValidationError`, and `HeightMapResult` are implemented in Core with boundary, non-finite, null, ordering, and extreme-dimension tests. The `GenerationResponse` envelope remains documented for host integration.

**Done when:**

- Repeated generation with the same seed is stable; Local/API pass full-array comparisons for several seeds and sizes.
- Tests cover negative seeds, rectangular maps, zero height, parameter limits, missing fields, and excessive sizes.
- Both modes reject invalid requests consistently; unsupported versions and invalid responses do not reach the renderer.
- Loading/error/result states work; the size limit is verified in the target browser or reduced for both modes.
- Compute time excludes serialization and 2D display; initialization is reported separately.

## Phase 3A — Production PWA and offline support

**Work:** Add the Angular service worker and manifest, including the entire required WASM bundle in caching. Verify consistent frontend/runtime versions, offline readiness, and unavailable API handling. Do not cache generation results.

**Done when:** After online preparation, the production build reloads offline, opens in a new tab, and generates a map with a new seed. Remote reports a clear error. A reproduction procedure includes cache reset steps; asset updates are verified without mixing versions. Merely using an already loaded page does not count as an offline check.

## Phase 3B — 3D and simple biomes

**Work:** Add Three.js, a mesh built from the generated heights, a camera, zoom, and lighting. Add deterministic height-based biome IDs in the core and a palette in the renderer. Fix thresholds, rules for zero height, and the version of the extended result. If necessary, reduce the shared resolution limit after checking memory use and UI behavior.

**Done when:** Both modes return equivalent heights and identical biome IDs, and the renderer displays both consistently. Repeated generation releases old Three.js resources. Mesh construction/CPU display time is separate from core execution. Before further measurements, update contract fixtures and set `workload = heightmap+biomes`: biome classification is included in compute time in both modes.

## Phase 4 — Architecture Race, repeated trials, and export

**Work:** Run both modes from an immutable parameter snapshot, execute them sequentially, and display the maps side by side. Add full-value comparisons, alternating Local/Remote order, warm-up, repeated trials, median/IQR, and JSON/CSV export. The runner uses the same adapters and endpoint as ordinary generation.

**Done when:**

- Data or version mismatches are clearly marked; failed results are excluded from valid summaries.
- Rendering and animation are paused during trials; each record includes parameters, order, timings, environment ID, and status.
- HTTP duration minus core time is labeled mixed overhead; CPU rendering time is not labeled GPU time.
- Export retains raw trials, warm-up records, and errors; summaries can be reproduced from the export.
- Runner tests cover order, trial counts, immutable parameters, and error retention.

## Phase 5 — Controlled experiments and coursework report

**Work:** Freeze the revision, algorithm, workload, format, and configuration. Follow the [protocol](BENCHMARKING.md) to run the size/seed matrix under two network conditions; investigate cold start and offline behavior separately. Retain raw results and prepare tables, charts, and written conclusions.

**Done when:** Every chart has source records, an aggregation method, and a test environment description; another person can reproduce the procedure. Conclusions distinguish compute time, time until data is ready, startup, and rendering, and account for hardware, transport, and runtime. Failed trials and limitations are disclosed. A final smoke check repeats the production/offline scenario.

## Optional, after core completion and a separate request

Adaptive Mode, AOT, Web Workers, binary transport, richer biomes/erosion, presets, and history. Each extension requires a separate hypothesis and comparison series; do not change the baseline during a study.

## Next implementation task

> Continue Phase 2: implement deterministic 2D value-noise/fBm generation in `WorldGenerator.Core` against the implemented v1 request/result contracts and `HeightMapValidator`. Add reference fixtures and tests, expose the heightmap through both hosts, and replace the probe page with parameter controls, a minimal 2D preview, local/remote correctness checks, and loading/error states. Do not add the Architecture Race, performance comparison view, Three.js, or service workers yet. Leave README.md empty for now.

Work on one acceptance criterion at a time, update documentation alongside decisions, and distinguish verified results from assumptions. Add new dependencies only when the relevant phase begins.
