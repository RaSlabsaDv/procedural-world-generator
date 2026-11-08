# Development

## Current application

One Angular editor generates **Rich terrain + hydraulic erosion** locally in a C# WASM worker or remotely through ASP.NET Core. Both use the same Core. Seven detail stages are implemented, including structured vegetation, local relief and coastal surfaces. Architecture Race has protocol/contracts, a sequential collection service and a compact editor panel; summaries and export remain planned. Evolution capture/playback remains future work. README is intentionally empty.

Start with the [documentation index](INDEX.md), [project brief](PROJECT_BRIEF.md), [architecture](ARCHITECTURE.md) and [benchmark methodology](BENCHMARKING.md). Frozen mathematical/presentation policies live in [specs/](specs/); original milestone observations are in [history/DETAILING_VERIFICATION.md](history/DETAILING_VERIFICATION.md).

## Prerequisites and verification

Use the SDK pinned by global.json (.NET 10.0.4xx), its wasm-tools workload, and Node/npm. NuGet/npm lockfiles pin project dependencies; installed workloads are separate prerequisites.

```sh
dotnet workload install wasm-tools
npm --prefix src/client ci
dotnet restore ProceduralWorldGenerator.slnx --locked-mode
dotnet build ProceduralWorldGenerator.slnx --configuration Release --no-restore
dotnet test ProceduralWorldGenerator.slnx --configuration Release --no-build --no-restore
npm --prefix src/client test -- --watch=false
python3 -m unittest discover -s tests/build -v
node --test tests/build/worker-rpc.test.mjs
```

If local MSBuild worker nodes fail, add --disable-build-servers -m:1 to native builds and -m:1 to tests. Do not overlap native builds with publishing. Do not regenerate lockfiles unless intentionally changing dependencies.

Independent Python fixtures under tests/reference/ require only the standard library. Each can run directly, for example `python3 tests/reference/coasts_reference.py`. Historical references and expectations must not be rewritten to accommodate current output.

## Development startup

Run in separate terminals from the repository root:

```sh
dotnet run --project src/api
```

```sh
npm --prefix src/client run build:wasm
npm --prefix src/client start
```

Open http://localhost:4200/. Angular proxies /api to development port 5180. Development serving does not provide production offline support.

## Production publication

```sh
bash scripts/publish-app.sh
dotnet artifacts/app/WorldGenerator.Api.dll --urls http://localhost:8080
```

Open http://localhost:8080/. HTTPS or localhost is required for service workers. Restart an existing API process after publishing so the API and browser WASM use matching Core builds.

publish-wasm.sh uses locked restore, --no-restore publication into a clean staging directory, validation and transactional promotion/rollback. Failed publication preserves previous outputs; stale hashed runtime assets do not accumulate. publish-app.sh also builds/finalizes Angular and publishes the API/static deployment. finalize-pwa.mjs generates the versioned offline catalog and service-worker manifest. Generated files are ignored.

The installed SDK may emit “Publishing without optimizations…” even with wasm-tools installed. Record actual flags when measuring. AOT is not enabled, and workload installation alone does not prove optimized output.

## Editor and parameters

Generate Local, Generate Remote and Verify equivalence capture immutable input snapshots. Verification runs the modes sequentially and compares every height, environment/coverage field, category, tree, rock and summary. Build compatibility is independent of numerical agreement; matching dirty/unversioned identities remain unverifiable. Remote failure never silently invokes Local.

The compact sidebar shows range guidance under labels and optional Parameter tips. Landform balance groups plains/mountains under a shared 100% budget; the remainder favors hills. Slider limits account for the other value without rewriting it. Guidance and canonical validation remain separate: finite manually typed drafts are forwarded unchanged, and Core decides validity.

Work guidance reflects valid dimensions and the 33554432 cell-iteration budget: 512x512 permits 128 iterations. Dimensions stay 2..512 and iterations also have a 2048 cap. Empty/invalid dimensions do not fabricate a size-dependent limit. Region scale changes broad regions; local detail stays in world-grid coordinates. Units and climate are illustrative, not calibrated geography/weather.

Random seed, Reset and form edits affect drafts only. Successful prior results survive errors or new generation. Captured labels distinguish displayed results from edited drafts. Local/Remote selection and Compare views are explicit. Editing clears stale comparison/error state.

Drag to orbit, scroll/pinch to zoom and right-drag to pan. Same-scale replacement preserves camera pose; Reset camera restores request-based framing. Rendering, camera interaction and draft actions pause under OperationLock. WebGL failures retain numerical results; no 2D fallback exists.

Ocean is existing boundary-connected low terrain, including equality at sea level; inland depressions are not filled. Final coastal coverage does not move trees/rocks or modify heights/hydraulics. Appearance policies and limits are linked from [INDEX.md](INDEX.md).

## Contracts and measurement boundaries

The API exposes POST /api/v1/terrains and GET /api/health. Removed probe/region/heightmap routes return 404. WASM exposes the asynchronous worker proxy generateTerrainJson. All request members are required, including nested heightmap settings. Strict camelCase JSON rejects unknown fields, wrong types/case and nonfinite overflow; no defaults substitute for omission. Both hosts share {error,fields}; invalid requests return 400 and API generation responses use Cache-Control:no-store.

Current identities:

- Algorithm: diverse-landscape-v7; nested noise: value-noise-fbm-v1.
- Result: landscape-ecology-v8.
- Workload: landscape-ecology-hydraulic-v8.
- Execution profile: landscape-worker-json-v8; RPC: worker-rpc-v1.
- Simulation: hydraulic-grid-v1.

Both hosts time the same GenerateValidated call after parsing/preparation. computeMs includes complete generation and allocations, including environment, instances and coastal distance/blending. JSON, RPC/HTTP, normalization, comparison and rendering stay outside. requestMs ends at validated data; subtracting computeMs yields combined overhead, not pure network latency.

One worker owns one runtime per document. Offline preparation may initialize it before an interactive request; record that startup/cache state separately. Display timing covers CPU setup and first submission, excludes texture/pause wait, and does not measure GPU completion. See [BENCHMARKING.md](BENCHMARKING.md).

## PWA readiness and updates

Production caches the complete matching shell, deferred Three.js, WASM/worker and five local textures. Readiness verifies one catalog/manifest/index version and a tiny real computation; it does not combine partial caches or trust navigator.onLine. API results are never cached.

Safe reload is deferred while operations hold the shared lock. A new document loads the updated bundle and verifies readiness again. Cleared/evicted storage invalidates readiness. Manual verification includes online generation, offline reload/new tab with new seeds, Remote failure/recovery and a safe version update followed by offline 3D.

## Browser verification

Use an external playwright-core installation and Chromium against the published deployment:

```sh
PWG_PLAYWRIGHT_MODULE=/absolute/path/to/playwright-core \
PWG_BROWSER_EXECUTABLE=/absolute/path/to/chromium \
PWG_BASE_URL=http://127.0.0.1:8080 \
node tests/browser/landscape.cjs
```

Use the same environment for all eight entry points:

| Script | Coverage |
| --- | --- |
| landscape.cjs | Complete WASM/API parity, maximum workload, instances, memory and heartbeat diagnostics |
| materials.cjs | Five textures, instance/draw budgets, ownership, narrow/offline presentation |
| lighting.cjs | Actual shadow attachments, static reuse, pause and empty/minimum terrain |
| editor.cjs | Compact guidance/tips, keyboard sliders, drafts, retained results, equivalence and layout |
| race.cjs | Real sequential pairs, raw records/build identity, paused scenes, cooperative Stop and narrow layout |
| coasts.cjs | Coastal blending/views, steep shores and protected dry depressions |
| relief.cjs | Pure/eroded plains and mountain views with actual UI equivalence |
| pwa.cjs | Offline reload/new tab, Remote recovery and deferred safe updates |

PWA tests temporarily mutate only generated deployment files and restore them in finally; run them sequentially with publication. Read large API diagnostics inside the page instead of retaining CDP response bodies. Evidence/screenshots live under ignored artifacts/. Reserved WASM memory, software-WebGL smoke timings and GPU-storage estimates are not live managed memory, browser RSS, controlled comparative results or mobile guarantees.

## Source layout

- src/core/Contracts, Validation, Generation, Ecology: shared C# contracts and computation.
- src/hosts: shared linked transport/JSON/build identity sources; still needed by both hosts.
- src/api and src/wasm: thin execution hosts and worker/loader assets.
- src/client/src/app/platform: runtime, PWA and operation locking.
- terrain/data: contracts, decoding, comparisons, defaults and adapters.
- experiments/data: Architecture Race readonly records, frozen configuration and compact record helpers.
- experiments/experiment-runner.service.ts: sequential collector and bounded preview-pair handoff.
- terrain/editor: parameter definitions, form/snapshot handling, pure presentation guidance and panels.
- terrain/rendering: terrain/instance/material/light modules, scene-content ownership and preview lifecycle.
- terrain/testing and colocated frontend *.spec.ts: reusable fixtures and corresponding tests.
- tests/core/Generation, Ecology, Validation: active Core checks; Historical/ and Fixtures/ retain versioned evidence.
- tests/api, browser, build, reference: host integration, real browser scenarios, packaging and independent numerical references.

Do not delete historical generators or nested HeightMapTransport preparation because standalone endpoints were removed: these retain active verification/transport roles. Scene ownership does not change renderer policies or timing boundaries. Architecture Race Step 1 protocol/contracts and immutable configuration are implemented; see [the specification](specs/ARCHITECTURE_RACE_V1.md). Sequential collection and its editor panel are implemented; summaries and export remain planned.


## Architecture Race configuration

`createExperimentConfiguration(terrain, measuredPairs?)` in experiments/data captures
an independent request, freezing its nested heightMap, terrain and configuration.
The default is 10 measured pairs; invalid pair counts throw RangeError. Mathematical
terrain validation remains in Core. No Angular form or browser APIs are required.
Colocated utility tests cover every captured parameter, caller edits, runtime freezing,
count boundaries and forwarding invalid terrain drafts unchanged. Run `npm --prefix
src/client test -- --watch=false` for frontend checks. Steps 2–3 add the collector service and editor panel described below; statistics and
export remain planned. No performance campaign has been run.


## Architecture Race runner

Inject ExperimentRunner and call start(createExperimentConfiguration(terrain, count),
conditions?) to obtain ExperimentResult. The Architecture Race panel invokes this service from App using captured editor inputs. progress/result are readonly signals; stop is cooperative. A busy
operation or overlapping start rejects immediately. Preparation/call/verification
holds one shared lock, preventing generation and safe PWA reload; an active call
must settle before release, including on disposal.

Records contain raw host/adapter durations and full pair comparison diagnostics, not
maps. takePreviewPair transfers at most one final suitable pair after completion;
callers own that pair thereafter. New starts discard any unclaimed prior pair.
dispose drops retained maps/listeners and prevents new starts. Angular destruction
calls it automatically. The normal runtime and transport adapters are unchanged.

Optional conditions are operator-reported environment strings; unknown data remains
null. Startup counters/timings and browser user agent are observed separately. Tests
use controlled promises and real comparisons for ordering, locking, failures, stop,
identity changes, interruptions and bounded handoff. They do not measure performance.


## Architecture Race panel

Architecture Race is above the parameter groups in the sidebar. Choose 1..30 measured
pairs (default 10), then Start experiment. One warmup per mode precedes sequential
alternating measured pairs. Preparation, phase, pair, mode, order and settled warmup/
measured counts are shown separately. Stop after call remains available while the
experiment owns OperationLock; Stop requested waits for the active call to settle.
Other operations disable Start, and collection disables draft/reset/random/generation
controls. No request is cancelled and no automatic Remote-to-Local fallback exists.

After completion, expand raw trials, pair verification, exclusion reasons or captured
inputs/conditions. Collection completed does not imply eligible results. Failed/stopped
records remain inspectable, unavailable durations are labelled, and zero remains zero.
Correctness and build compatibility are separate. Matching dirty builds remain
excluded diagnostics. Summaries, winner claims, charts and downloads are not provided.

App takes the retained pair once after settlement and reuses its stored verification;
there is no repeated generation or comparison. No suitable pair leaves prior maps
intact. Programmatic draft revisions and component destruction discard obsolete map
handoffs. Destroying App requests Stop for its own series without disposing the shared
runner; closing diagnostic details has no effect on collection. The panel contains
presentation only, with the existing Core/host validation paths unchanged.

race.cjs uses a local test-only HTTP proxy to hold an actual API POST through normal
service-worker operation. This makes pause/Stop assertions deterministic without
changing production code. Proxy/gated timings are smoke evidence, not campaign data.


### Race build mismatch after publishing

A successful publish replaces files on disk; it does not reload an already running
API process. A browser can therefore load current WASM while the API still returns
an older coreBuildId. Architecture Race correctly stops that comparison. The primary
failure now includes the exclusion code and actual Local/Remote build IDs, with
visible recovery guidance for build mismatch even when collection completed.

Restart the API from the matching publication, then reload/update the application
and retry. Compare the actual IDs in Captured inputs & conditions; do not bypass
identity checks or treat matching dirty builds as verified. A generic numerical
mismatch instead requires inspecting the stored full comparison diagnostics.
