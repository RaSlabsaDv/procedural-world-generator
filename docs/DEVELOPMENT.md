# Development

## Supported application

The application exposes one generator, **Rich terrain + hydraulic erosion**, with Local/Remote execution and a Three.js preview. It has no generator selector, regional experiment, probe diagnostics or 2D view. Evolution capture/playback is the next planned extension. README is intentionally empty.

## Frontend structure

`App` owns generation state and orchestration. `TerrainParametersPanel` renders typed forms and emits Local/Remote/Verify actions; `TerrainResultsPanel` presents comparison, snapshots, timings and deferred 3D; `PwaStatusPanel` owns readiness/update actions using the shared lock. The mathematical core and transport contracts are unchanged.

Edit parameter labels, tooltips, input steps and initial values in `terrain-parameters.ts`. This is presentation metadata, not a second validator. Core remains authoritative for ranges and work budgets. Blank/non-finite values are rejected before dispatch without default substitution. Field errors support nested `heightMap.*` paths and are associated with inputs for accessibility.

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

Use **Generate Local**, **Generate Remote**, or **Verify equivalence**. Verification runs both locations sequentially with the same frozen request, compares all heights and biome IDs, and reports build compatibility separately. Dirty/unversioned builds remain unverifiable even when outputs agree. Missing or invalid inputs show structured errors; Remote unavailability does not silently invoke Local.

Drag to orbit, scroll/pinch to zoom, right-drag to pan. Heights and biome IDs come from Core. Water is currently a height-based color band, not a flat lake/ocean overlay. A WebGL error leaves numeric results available. No 2D fallback exists. Heavy requests run in the worker; the UI does not offer simulated progress or cancellation.

Core limits and exact arithmetic are specified in [TERRAIN_WORKLOAD.md](TERRAIN_WORKLOAD.md). The work budget is 33,554,432 cell-iterations; at 512×512, at most 128 iterations are allowed. Model units are illustrative and are not geological years.

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
  "algorithmVersion": "warped-ridged-hydraulic-v1"
}
```

Every member is required; missing numeric values are not defaulted. The nested heightmap settings are a composition contract, not an independent public generator. Strict JSON rejects unexpected fields, wrong case/types and non-finite overflow. Both hosts share preparation and `{ "error", "fields" }` failures. API validation/JSON failures return 400; terrain responses use `Cache-Control: no-store`. Health is `GET /api/health`. Removed generation/probe routes return 404.

Success contains `result` (dimensions, row-major heights, numeric biome IDs and versions), exact `parameters`, `simulation`, `computeMs`, `coreBuildId`, `workload = terrain-hydraulic-v1` and `simulationVersion = hydraulic-grid-v1`. Summary reports work, terrain masses, suspended sediment and water balance. See the [architecture](ARCHITECTURE.md) for preparation and identity rules.

The WASM proxy creates one module worker with one runtime per document. Always await `generateTerrainJson`. `getRuntimeInfo()` reports initialization count, worker+runtime initialization time, runtime-only time, execution and protocol. Initialization is excluded from Core timing. Startup/crash rejects pending work; a later attempt can retry. Application destruction terminates the worker.

`computeMs` includes composition, all simulation steps, summaries, float32 conversion and biome classification. Request-to-data timing includes transport/JSON/normalization and ends before comparison or display. Three.js CPU setup/first submission is separate, not GPU timing. No controlled benchmark results are claimed.

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
node tests/browser/hydraulic.cjs
```

Use the same environment with `node tests/browser/pwa.cjs` for offline and safe-update regression. The hydraulic script covers complete WASM/API arrays and conservation summaries, size/iteration extremes through 512×512×128, worker responsiveness, 3D, offline generation and Remote failure. The PWA script tests offline reload/new tab, recovery, deferred reload and the updated terrain bundle. It temporarily modifies only generated deployment assets and restores them in `finally`; do not run it concurrently with publishing.

Evidence is written under ignored `artifacts/`. Software WebGL smoke timings are not controlled comparative performance evidence. Reserved WASM linear memory is not live managed memory or total browser RAM. Maximum settings are a desktop smoke workload, not a mobile guarantee.

Next implementation: bounded evolution capture and Three.js playback for this generator, following [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md).
