# Development

## Supported application

The application exposes one generator, **Rich terrain + hydraulic erosion**, with Local/Remote execution and a Three.js preview. It has no generator selector, regional experiment, probe diagnostics or 2D view. Stage 1 surface materials are implemented; surface transitions, lighting and further landscape detailing remain planned. Evolution capture/playback remains a later extension. README is intentionally empty.

## Frontend structure

`App` owns draft and generation state and orchestration. The editor has grouped controls on the left, one primary 3D viewport in the center, and measurements on the right; panels stack on narrow screens. `TerrainParametersPanel` renders typed forms and emits Local/Remote/Verify actions; `TerrainResultsPanel` presents comparison, snapshots, timings and deferred 3D; `PwaStatusPanel` owns readiness/update actions using the shared lock. The editor uses the versioned ecology contract described below.

Edit parameter labels, tooltips, input steps in `terrain/editor/terrain-parameters.ts` and initial values in `terrain/data/terrain-defaults.ts`. Slider extents are UI guidance in the editor metadata module; numeric controls preserve exact entry and Core validates ranges. This is presentation metadata, not a second validator. Core remains authoritative for ranges and work budgets. Blank/non-finite values are rejected before dispatch without default substitution. Field errors support nested `heightMap.*` paths and are associated with inputs for accessibility.

## Toolchain and native verification

Use the SDK feature band specified by `global.json` (.NET 10.0.4xx) and its `wasm-tools` workload, plus Node.js/npm. Checked-in NuGet and npm lockfiles pin dependencies; installed workloads are separate toolchain prerequisites.

```sh
dotnet workload install wasm-tools
npm --prefix src/client ci
dotnet restore ProceduralWorldGenerator.slnx --locked-mode
dotnet build ProceduralWorldGenerator.slnx --configuration Release --no-restore
dotnet test ProceduralWorldGenerator.slnx --configuration Release --no-build --no-restore
npm --prefix src/client test -- --watch=false
python3 -m unittest discover -s tests/build -v
node --test tests/build/worker-rpc.test.mjs
python3 tests/reference/terrain_reference.py
python3 tests/reference/landscape_reference.py
python3 tests/reference/climate_reference.py
```

If MSBuild worker nodes fail in the local environment, retry the native build with `--disable-build-servers -m:1`, and use `-m:1` for tests. When intentionally changing package references, regenerate NuGet lockfiles with `dotnet restore ProceduralWorldGenerator.slnx --force-evaluate` and review them.

## Run in development

Run these in separate terminals from the repository root:

```sh
dotnet run --project src/api
```

```sh
npm --prefix src/client run build:wasm
npm --prefix src/client start
```

Open `http://localhost:4200/`. Angular proxies `/api` to the API development port 5180. Development builds do not provide production offline support.

## Production build and launch

```sh
bash scripts/publish-app.sh
dotnet artifacts/app/WorldGenerator.Api.dll --urls http://localhost:8080
```

Open `http://localhost:8080/`. This serves Angular, WASM and API from one origin. HTTPS or localhost is required for service workers. `npm --prefix src/client run build` includes WASM publishing and PWA finalization but does not publish the API deployment.

`scripts/publish-wasm.sh` performs a locked Release restore, publishes with `--no-restore` into a clean temporary directory, validates runtime/loader/worker files, then promotes staged outputs with rollback. Failures preserve previous outputs; repeated publishes do not accumulate stale hashed assets. `scripts/finalize-pwa.mjs` generates the complete versioned offline catalog and Angular manifest. Generated assets live in ignored directories.

The SDK may emit “Publishing without optimizations…” with the installed workload. Record actual publish flags when measuring; a successful workload installation alone does not prove optimized/AOT output. AOT is not enabled as part of this cleanup.

## Generate and compare

Defaults: seed 42, 128×128, noise scale 0.03, four octaves, height 30, mountain strength 0.55, warp 2, 64 iterations, rainfall 0.05 and evaporation 0.1.

Use **Generate Local**, **Generate Remote**, or **Verify equivalence**. Verification runs both locations sequentially with the same frozen request, compares all heights, environment fields, biome IDs, tree kinds/transforms and summaries, and reports build compatibility separately. Dirty/unversioned builds remain unverifiable even when outputs agree. Missing or invalid inputs show structured errors; Remote unavailability does not silently invoke Local.

Drag to orbit, scroll/pinch to zoom, right-drag to pan. Heights and biome IDs come from Core. Ocean is boundary-connected terrain below the explicit relative sea level; low interior valleys remain dry. Forests contain Core-placed instanced trees. No flat lake/ocean overlay is added. A WebGL error leaves numeric results available. No 2D fallback exists. Heavy requests run in the worker; the UI does not offer simulated progress or cancellation.

Current climate/vegetation rules build on the frozen v2 equations and are specified in [LANDSCAPE_V3.md](LANDSCAPE_V3.md). [TERRAIN_WORKLOAD.md](TERRAIN_WORKLOAD.md) and the test-only Historical sources preserve v1 fixtures. The work budget is 33,554,432 cell-iterations; at 512×512, at most 128 iterations are allowed. Model units are illustrative and are not geological years.

## Editor interactions

Terrain contains seed, dimensions, height multiplier, mountain strength, coverage, sea level and region scale. Climate & vegetation contains warmth, moisture and vegetation density. Erosion contains iterations, rainfall and evaporation. Expand Advanced noise for noise scale, octaves and warp strength. Sliders and numeric fields share values. Random seed and Reset parameters affect drafts only; use an explicit generation action to run computation.

The previous successful terrain remains visible during work and failures. Captured labels identify earlier settings when drafts differ. One result is visible by default; select Local/Remote or use Compare views to display both. Different captured requests are flagged; Verify equivalence is the sequential full-array check for an identical snapshot. Editing drafts clears its old comparison state. Technical details and captured settings are expandable in the results sidebar.

Reset camera restores request-based framing. Same-scale updates preserve the camera within an existing preview; dimension/scale changes and view recreation use default framing. Rendering and camera interaction pause during computation. Display CPU setup/first submission is separate from computation and request timing and is not GPU completion.

PWA readiness is compact in the header. Expand it for detail; failures and available updates open the panel. Check for updates remains directly available. The shared operation lock protects generation, offline preparation and safe reload. No playback timeline, brushes, presets or repeated-trial runner are included.

## Transport contract

`POST /api/v1/terrains` and `await runtime.generateTerrainJson(JSON.stringify(request))` accept:

```json
{
  "heightMap": {
    "seed": 42,
    "width": 128,
    "height": 128,
    "noiseScale": 0.03,
    "octaves": 4,
    "heightMultiplier": 30,
    "algorithmVersion": "value-noise-fbm-v1"
  },
  "mountainStrength": 0.55,
  "warpStrength": 2,
  "iterations": 64,
  "rainfall": 0.05,
  "evaporation": 0.1,
  "plainsCoverage": 0.45,
  "mountainCoverage": 0.3,
  "globalMoisture": 0.65,
  "seaLevel": 0.16,
  "globalWarmth": 0.6,
  "vegetationDensity": 1,
  "landformRegionScale": 1,
  "algorithmVersion": "diverse-landscape-v3"
}
```

Every member is required; missing numeric values are not defaulted. The nested heightmap settings are a composition contract, not an independent public generator. Strict JSON rejects unexpected fields, wrong case/types and non-finite overflow. Both hosts share preparation and `{ "error", "fields" }` failures. API validation/JSON failures return 400; terrain responses use `Cache-Control: no-store`. Health is `GET /api/health`. Removed generation/probe routes return 404.

Success contains `result` (dimensions, row-major heights, numeric biome IDs and versions), exact `parameters`, `simulation`, `computeMs`, `coreBuildId`, `workload = landscape-ecology-hydraulic-v3` and `simulationVersion = hydraulic-grid-v1`, plus `executionProfile = landscape-worker-json-v3`. Result `landscape-ecology-v3` includes moisture, temperature, slope, vegetationDensity and bounded tree records; all arrays/transforms participate in equivalence checks. Summary reports work, terrain masses, suspended sediment and water balance. See the [architecture](ARCHITECTURE.md) for preparation and identity rules.

The WASM proxy creates one module worker with one runtime per document. Always await `generateTerrainJson`. `getRuntimeInfo()` reports initialization count, worker+runtime initialization time, runtime-only time, execution and protocol. Initialization is excluded from Core timing. Startup/crash rejects pending work; a later attempt can retry. Application destruction terminates the worker.

`computeMs` includes composition, all simulation steps, summaries, float32 conversion environment, biomes and bounded vegetation decisions. Three.js CPU setup includes instanced tree construction; no GPU-time claim is made. Request-to-data timing includes transport/JSON/normalization and ends before comparison or display. Three.js CPU setup/first submission is separate, not GPU timing. No controlled benchmark results are claimed.

## PWA readiness and safe updates

Production Angular service worker prefetches the shell, deferred Three.js and required WASM/worker assets in one versioned group. Readiness verifies the complete matching cache against the catalog and manifest hashes, confirms the served index matches the open document, then executes a tiny zero-step terrain request. It never combines incomplete caches from different versions or treats `navigator.onLine` as proof.

Preparation shares `OperationLock` with generation and updates. Successful preparation eagerly initializes WASM before interactive generation; record this startup/cache state separately in experiments. Cache/control waits are bounded and may require a retry on slow initial downloads. Browser storage eviction or clearing site data invalidates prior readiness.

**Check for updates** offers **Reload to update** when a complete version is ready. Reload is disabled during active work. The application does not activate a new version into the current runtime; navigation loads the new version and verifies readiness again. Unrecoverable service-worker failures clear readiness. API results are never cached.

Manual check:

1. Use a fresh browser profile, open the production URL online and wait for Offline ready.
2. Generate Local and Remote; confirm required assets, but no API results, in Cache Storage.
3. Disable networking, reload, and generate Local with a new seed.
4. Open another ordinary offline tab and generate another new seed with a fresh runtime.
5. Confirm Remote reports unavailable; restore networking and confirm recovery.
6. Deploy a changed bundle, check for updates, confirm reload is blocked during work, reload when idle, and repeat offline generation and 3D display.

## Browser regression scripts

Use an external `playwright-core` installation and Chromium against the published bundle:

```sh
PWG_PLAYWRIGHT_MODULE=/absolute/path/to/playwright-core \
PWG_BROWSER_EXECUTABLE=/absolute/path/to/chromium \
PWG_BASE_URL=http://127.0.0.1:8080 \
node tests/browser/landscape.cjs
```

Use the same environment with `node tests/browser/editor.cjs` for the editor (real equivalence, single/comparison views, slider synchronization, draft actions, retained maps after errors, desktop/narrow layout and offline 3D), and `node tests/browser/pwa.cjs` for offline and safe-update regression. The landscape script covers complete WASM/API environment arrays, categorical IDs, tree transforms and conservation summaries; its matrix includes extreme seeds, zero height, representative landscapes and 512×512×128. It records serialized bytes, reserved WASM memory, heartbeat and screenshots. Editor and PWA scripts cover interaction, offline generation and safe updates. The PWA script tests offline reload/new tab, recovery, deferred reload and the updated terrain bundle. It temporarily modifies only generated deployment assets and restores them in `finally`; do not run it concurrently with publishing.

Evidence is written under ignored `artifacts/`. Software WebGL smoke timings are not controlled comparative performance evidence. Reserved WASM linear memory is not live managed memory or total browser RAM. Maximum settings are a desktop smoke workload, not a mobile guarantee.

Next implementation: Core-owned smooth surface transitions (Stage 2), then lighting, forests, rocks, local relief and coasts. See the staged detailing work in [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md). Bounded evolution capture and playback remain later work.

## Diverse terrain controls and forests

Plains coverage and Mountain coverage are regional tendencies, not exact percentages per seed. Their sum cannot exceed 1; the remainder favors hills. Mountain strength controls relief in mountain regions independently of their coverage. Global moisture affects vegetation, independently of erosion rainfall. Sea level is a fraction of the height bound; only four-connected low samples reaching a boundary become ocean.

Core uses illustrative grid/world units and a normalized temperature proxy. There are no calibrated weather, lakes, rivers, seasons or marine erosion. Trees occupy eligible forest quads and follow the exact rendered triangles. Core caps output at 16384 instances using independent hash priorities, avoiding a row-major cut-off. All returned trees are rendered with two shared instanced meshes per nonempty category, at most six per viewport. Density and forest coverage are retained independently of this output cap. Request/serialization/rendering costs should be measured separately from Core work. Native historical v1 fixtures remain unchanged in tests/core/Historical and the independent v1 Python reference; the public endpoint accepts v3 only.

## Repository layout and maintenance

```text
src/core/
  Contracts/       immutable request/result records
  Validation/      canonical limits and prepared requests
  Generation/      composition, noise, hydraulic simulation and orchestration
  Ecology/         environmental fields, ocean, biome rules and vegetation
src/client/src/app/
  app.*            root shell and generation orchestration
  platform/        WASM runtime, PWA and shared operation lock
  shared/          common panel styles
  terrain/data/    contracts, defaults, decoder, comparison and adapters
  terrain/editor/  parameter metadata/forms and result panels
  terrain/rendering/ Three.js terrain, trees and viewport lifecycle
  terrain/testing/ reusable frontend test fixtures
```

Core namespaces and host references remain unchanged. Historical v2 sources and golden fixtures live in tests/core/Historical/V2. Keep numerical operation order frozen for v3; a semantic biome change requires a new result version. Before extending biomes, update Core rules and the explicit client wire-ID/palette declarations together. UI defaults never substitute for missing host fields. Frontend tests remain colocated; historical v1 tests/reference code stay separate.

The browser suite has three maintained entry points: `landscape.cjs` for complete v3 fields/trees and heavy limits, `editor.cjs` for UI transitions, and `pwa.cjs` for offline/safe-update lifecycle. They share launch configuration and readiness diagnostics in `tests/browser/support/browser.cjs`. The weaker duplicate hydraulic-only script has been removed; its current-workload coverage is included in the landscape/editor suite. Keep the existing PWG_* environment overrides. Packaging and worker RPC tests retain their separate build checks.

`@angular/router` was removed because this single-screen editor does not use Angular routing. No dependencies were added. Reset values and readiness settings now share the same pure defaults module. The earlier organization pass preserved v2 results using fixtures and pre/post-refactor numerical fingerprints. V3 now has a separate specification, independent climate literals and explicit comparisons showing region scale 1 preserves historical terrain/hydraulic results.

## Climate and vegetation controls (v3)

Global warmth (0..1, default .6) is normalized warmth, not Celsius; elevation and deterministic spatial noise influence the final field. It selects broadleaf/conifer forests, warm savanna, tundra and cold elevated snow according to the ordered Core rules. Increasing warmth modestly dries the illustrative moisture field.

Vegetation density (0..1, default 1) changes candidate density without changing terrain, simulation or biome coverage. Zero removes trees. Increasing it preserves candidates and their transforms before the 16384 cap; above the cap fixed priorities can replace candidates. Landform region scale (.25..4, default 1) changes only the regional mask, independently of noise/detail sampling; larger values produce larger regions. Pure plains do not change with this control.

The Climate & vegetation group contains warmth, moisture and density. Region scale is in Terrain. Captured parameters include all three fields; the expandable biome legend uses the same presentation colors as the terrain mesh. Core supplies Broadleaf, Conifer and Savanna tree kinds; the renderer uses rounded, conical and flat crowns without generating placements. Snow is a static terrain classification. A single seed need not show every biome. There is no added hydrology, dynamic snow, season model or repeated-trial runner.

Frozen v1/v2 references remain test-only, including tests/reference/landscape_reference.py. The independent climate_reference.py computes the literal v3 composition/climate fixture without importing production code. Never update historical expectations to make current changes pass.

## Surface detail materials (Stage 1)

The preview uses the existing Lambert lighting and biome tint with a small isolated
`terrain-surfaces.ts` shader extension (`terrain-detail-triplanar-v1`). Grass, soil,
rock and snow are grayscale linear detail maps, not sRGB albedo. Sampling remaps
intensity to 0.7..1.3 and multiplies the tint. Ocean has zero detail contribution;
sand is packaged for the later coastal stage and is not assigned to a current biome.
The complete biome-to-family mapping is presentation metadata, with no new climate,
slope or shoreline classification. Existing per-vertex color interpolation remains;
Core surface coverage weights and improved ecological transitions are Stage 2.

Textures repeat every four grid/world units, anchored to uncentered grid coordinates.
The renderer reconstructs these from centered positions using the map dimensions;
noiseScale, seed and map extents do not change repeat distance. Three orthogonal
projections, weighted by the existing normal, limit steep-slope stretching. This
projection blend is rendering math. There is no displacement or alteration of Core
heights, indices, biome categories or tree records. The only new geometry attribute
is four one-hot bytes per vertex (zero for Ocean), at most 1048576 bytes at 512x512.
It records the display family; it is not a generated ecological field.

Each preview owns one set of four decoded Texture objects, reused across successive
results. Two comparison views own independent sets. There is one terrain material
and draw call per viewport, plus the existing maximum of six vegetation meshes.
Result replacement releases the old geometry/material/renderer and reuses the decoded
images; the installed renderer releases its GPU uploads. Final destruction disposes
the texture owner. Partial/late loads are released after failure/destruction, obsolete
setups are ignored, and a failed load is retried by the next result. Closing one view
does not dispose the other's textures. Shader failures are detected before display
success is emitted and retain numerical results with a presentation error.

There is no untextured success placeholder. Asset loading/decode wait is displayed
separately from CPU setup. The CPU metric sums synchronous setup before/after waiting
and the first textured render submission; it excludes asset wait and paused time and
is not GPU completion. If assets finish during computation, scene preparation and
submission wait until the shared operation is unpaused. Core computeMs, requestMs and
all v3 generation identities remain unchanged.

All five PNGs are original, reproducible with `python3 scripts/generate-terrain-textures.py`
using the Python standard library. See `src/client/public/textures/terrain/ASSETS.md`
for CC0 provenance, patterns and reproduction. Each image is 256x256. Total encoded
asset bytes are 271377 (about 265 KiB), below the 2 MiB budget. Conservative RGBA8
storage including a full mip chain is approximately 1398101 bytes for four active
textures per viewport, or 2796203 bytes for two views; even all five would use about
1747627 bytes, below the 8 MiB per-view budget. These are texel-storage estimates,
not measured total GPU memory. Browser software rendering is not a device guarantee.

The service-worker prefetch group includes all five PNGs, including reserved sand.
The generated offline catalog hashes them and readiness verifies them with the rest
of the matching deployment. No runtime CDN or separate cross-version texture cache
is used. Production publication currently includes 38 required catalog assets.

Run `node tests/browser/materials.cjs` with the same PWG_* configuration as the other
browser scripts. It checks real PNG upload/shader compilation, fixed-request normal,
cold and warm rectangular views, one/two-view ownership, repeated replacement, the
512x512/16384-tree case, narrow layout and offline new-seed rendering. Test-only WebGL
instrumentation records detail texture counts and draw calls without adding product
telemetry. Evidence is written to `artifacts/materials-verification.json` and
`materials-after-{normal,cold,warm}-{overview,close}.png`. Baseline captures use the
same 129x97 requests and camera framing, with a -650 wheel delta for close views,
and are retained as `materials-before-*` artifacts. Full Local/Remote field parity
remains covered by landscape.cjs; editor.cjs and pwa.cjs cover interactions, offline
reload/new tab and safe version updates including the complete texture catalog.

Stage 1 verification: 119 Angular tests, 115 Core tests, 37 API tests, four Python
packaging/asset tests and the Node worker RPC test pass. Production materials,
landscape, editor and PWA scenarios pass in Chromium 153.0.8010.52, with no page
errors. Observed texture uploads stay at four per view across replacements and
eight for two views; closing a view releases its detail uploads. Terrain uses one
draw call and the observed maximum including vegetation is seven. These checks
verify bounded resources and correctness, not comparative runtime performance.
