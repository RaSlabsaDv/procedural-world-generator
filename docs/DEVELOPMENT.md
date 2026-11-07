# Development

## Supported application

The application exposes one generator, **Rich terrain + hydraulic erosion**, with Local/Remote execution and a Three.js preview. It has no generator selector, regional experiment, probe diagnostics or 2D view. Surface materials, Core-owned surface transitions, daylight, static shadows, fog, structured forests and tree variants are implemented. Core-placed boulders, outcrops and scree are implemented; local relief and coasts remain planned. Evolution capture/playback remains a later extension. README is intentionally empty.

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
python3 tests/reference/surface_reference.py
python3 tests/reference/vegetation_reference.py
python3 tests/reference/rocks_reference.py
python3 tests/reference/relief_reference.py
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
  "algorithmVersion": "diverse-landscape-v6"
}
```

Every member is required; missing numeric values are not defaulted. The nested heightmap settings are a composition contract, not an independent public generator. Strict JSON rejects unexpected fields, wrong case/types and non-finite overflow. Both hosts share preparation and `{ "error", "fields" }` failures. API validation/JSON failures return 400; terrain responses use `Cache-Control: no-store`. Health is `GET /api/health`. Removed generation/probe routes return 404.

Success contains `result` (dimensions, row-major heights, numeric biome IDs and versions), exact `parameters`, `simulation`, `computeMs`, `coreBuildId`, `workload = landscape-ecology-hydraulic-v7` and `simulationVersion = hydraulic-grid-v1`, plus `executionProfile = landscape-worker-json-v7`. Result `landscape-ecology-v7` includes moisture, temperature, slope, vegetationDensity and bounded eight-member tree records (including required numeric variant); required surfaceWeights is a row-major interleaved Grass/Soil/Sand/Rock/Snow numeric array; all arrays/transforms participate in equivalence checks. Summary reports work, terrain masses, suspended sediment and water balance. See the [architecture](ARCHITECTURE.md) for preparation and identity rules.

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

Next implementation: coastal surfaces (Stage 7). See the staged detailing work in [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md). Bounded evolution capture and playback remain later work.

## Diverse terrain controls and forests

Plains coverage and Mountain coverage are regional tendencies, not exact percentages per seed. Their sum cannot exceed 1; the remainder favors hills. Mountain strength controls relief in mountain regions independently of their coverage. Global moisture affects vegetation, independently of erosion rainfall. Sea level is a fraction of the height bound; only four-connected low samples reaching a boundary become ocean.

Core uses illustrative grid/world units and a normalized temperature proxy. There are no calibrated weather, lakes, rivers, seasons or marine erosion. Trees occupy eligible forest quads and follow the exact rendered triangles. Core caps output at 16384 instances using independent hash priorities, avoiding a row-major cut-off. All returned trees are rendered with two shared instanced meshes per nonempty kind/variant pair, at most twelve vegetation meshes per viewport. Density and forest coverage are retained independently of this output cap. Request/serialization/rendering costs should be measured separately from Core work. Native historical v1 fixtures remain unchanged in tests/core/Historical and the independent v1 Python reference; the public endpoint accepts diverse-landscape-v6 only.

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

The browser suite has six maintained entry points: `landscape.cjs` for complete v7 fields/trees/rocks and heavy limits, `materials.cjs` for coverage/vegetation views and resources, `lighting.cjs` for shadow/pause/minimum scenes, `editor.cjs` for UI transitions, `pwa.cjs` for offline/safe-update lifecycle, and `relief.cjs` for pure plains/mountains before/after views. They share launch configuration and readiness diagnostics in `tests/browser/support/browser.cjs`. The weaker duplicate hydraulic-only script has been removed; its current-workload coverage is included in the landscape/editor suite. Keep the existing PWG_* environment overrides. Packaging and worker RPC tests retain their separate build checks.

`@angular/router` was removed because this single-screen editor does not use Angular routing. No dependencies were added. Reset values and readiness settings now share the same pure defaults module. The earlier organization pass preserved v2 results using fixtures and pre/post-refactor numerical fingerprints. V3 now has a separate specification, independent climate literals and explicit comparisons showing region scale 1 preserves historical terrain/hydraulic results.

## Climate and vegetation controls (v3)

Global warmth (0..1, default .6) is normalized warmth, not Celsius; elevation and deterministic spatial noise influence the final field. It selects broadleaf/conifer forests, warm savanna, tundra and cold elevated snow according to the ordered Core rules. Increasing warmth modestly dries the illustrative moisture field.

Vegetation density (0..1, default 1) changes candidate density without changing terrain, simulation or biome coverage. Zero removes trees. Increasing it preserves candidates and their transforms before the 16384 cap; above the cap fixed priorities can replace candidates. Landform region scale (.25..4, default 1) changes only the regional mask, independently of noise/detail sampling; larger values produce larger regions. Pure plains do not change with this control.

The Climate & vegetation group contains warmth, moisture and density. Region scale is in Terrain. Captured parameters include all three fields; the expandable biome legend uses the same presentation colors as the terrain mesh. Core supplies Broadleaf, Conifer and Savanna tree kinds; the renderer uses rounded, conical and flat crowns without generating placements. Snow is a static terrain classification. A single seed need not show every biome. There is no added hydrology, dynamic snow, season model or repeated-trial runner.

Frozen v1/v2 references remain test-only, including tests/reference/landscape_reference.py. The independent climate_reference.py computes the literal v3 composition/climate fixture without importing production code. Never update historical expectations to make current changes pass.

## Surface detail materials and transitions (Stages 1–2)

The preview uses existing Lambert lighting with Core-owned coverage and an isolated
`terrain-surfaces.ts` extension (`terrain-surface-coverage-v1`). Grass, soil, rock
and snow textures modulate linear surface palette colors, then their contributions
are blended with supplied weights. Ocean retains its color through the complement
of land coverage. Sand stays zero and is packaged for the later coastal stage.
There is no categorical base-color switch, ecological shader rule or mesh displacement.
The legend labels biomes rather than exact visible surface colors.

Textures repeat every four grid/world units, anchored to uncentered grid coordinates.
Three orthogonal projections limit steep-slope stretching; these normal-based weights
are rendering math, distinct from the supplied ecological appearance fields. Stage 2
replaces the old one-hot byte and RGB vertex-color attributes with four float32
Grass/Soil/Rock/Snow values per vertex. It preserves positions, triangle winding,
normals, trees and camera behavior. At 512x512 this attribute is 4 MiB, replacing
3 MiB of colors plus 1 MiB of one-hot bytes, so those vertex buffer bytes are unchanged.
The original five-channel normalized client field remains 5 MiB. Parsed JSON arrays,
strings, Core output and client/geometry buffers can overlap; these figures are not
peak browser/runtime memory. No unused sand channel is uploaded to the GPU.

The current result/workload/profile use v7. Algorithm diverse-landscape-v6 adds
local pre-erosion relief while preserving ecological policies and
hydraulic-grid-v1. Exact rules, field invariants and timing are in
[SURFACE_TRANSITIONS_V1.md](SURFACE_TRANSITIONS_V1.md). The v3 numerical/climate rules
remain frozen in LANDSCAPE_V3.md. Historical fingerprints captured before Stage 2
verify every old array, biome, tree and simulation summary on eroded vegetated maps.

Each preview owns one set of four decoded Texture objects, reused across successive
results. Two comparison views own independent sets. There is one terrain material
and draw call per viewport, plus at most twelve vegetation meshes and six rock meshes.
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
submission wait until the shared operation is unpaused. Core computeMs now includes coverage derivation; requestMs still includes JSON and
normalization. Algorithm and simulation identities remain unchanged.

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
telemetry. Evidence is written to `artifacts/transitions-verification.json` and
`transitions-after-{normal,cold,warm}-{overview,close}.png`. Baseline captures use the
same 129x97 requests and camera framing, with a -650 wheel delta for close views,
and are retained as `transitions-before-*` artifacts (Stage 1 material output). Full Local/Remote field parity
remains covered by landscape.cjs; editor.cjs and pwa.cjs cover interactions, offline
reload/new tab and safe version updates including the complete texture catalog.

Stage 1 verification: 119 Angular tests, 115 Core tests, 37 API tests, four Python
packaging/asset tests and the Node worker RPC test pass. Production materials,
landscape, editor and PWA scenarios pass in Chromium 153.0.8010.52, with no page
errors. Observed texture uploads stay at four per view across replacements and
eight for two views; closing a view releases its detail uploads. Terrain uses one
draw call and the observed maximum including vegetation is seven. These checks
verify bounded resources and correctness, not comparative runtime performance.

Stage 2 verification: 139 Angular tests, 127 Core tests and 37 API tests pass. The
four packaging/asset tests, worker RPC test, Release/production builds and all four
browser entry points pass. Complete WASM/API coverage parity has zero observed error.
The maximum smoke response is 17356255 bytes, with 2621441 wire bytes for the coverage
array. Reserved WASM memory reached 150470656 bytes across the matrix (not live memory
or browser RSS). Exact requests, field sizes and diagnostic JSON parse/copy times
are retained in artifacts/landscape-verification.json; they are not controlled
benchmark conclusions. materials.cjs now validates diagnostic API response bodies inside the page and returns
only small summaries through CDP, avoiding Chromium response-body eviction. Its extra
API calls run after UI generation for correctness checks, outside product timings.

## Lighting, shadows and atmosphere (Stage 3)

The daylight-shadow-v1 presentation configuration is centralized in
terrain/rendering/terrain-lighting.ts and specified in LIGHTING_ATMOSPHERE_V1.md.
One hemisphere fill and one sun replace flat ambient lighting. Fog/background use
#bcc9ce with near=2.2*span and far=7*span; foreground remains clear at the normal
overview, and distant zoom fades intentionally. Output color space/tone mapping and
Core v4 result identities stay unchanged. Forests/ground gain directional shadows;
there are no new controls, sky assets, weather or generated fields.

Installed Three.js 0.187.0 removes PCFSoftShadowMap and redirects it to PCFShadowMap.
Use PCFShadowMap directly. One fixed 2048x2048 map is selected after comparing the
1024 map at identical requests/framing: the larger map with bias=-.0005 and
normalBias=.08 reduces visible contour-like acne and improves tree grounding.
The request extent and actual tree bounding boxes determine light-space fitting
once; the view camera never refits the map. Zero-height/minimum extents are padded.
Both renderer.shadowMap and sun.shadow disable autoUpdate and request one initial
update. Changing results/context creates a new map; orbit/zoom/pan only redraw color.

The map has RGBA8 color and DEPTH_COMPONENT24 depth attachments, one mip level and
no MSAA. Conservative aligned storage is 2048*2048*(4+4)=33554432 bytes per view
(32 MiB), 64 MiB for comparison views, excluding surface textures, geometry, default
framebuffers, driver overhead and browser memory. This fits the 64/128 MiB target
budget. The light's shadow target is disposed once before renderer disposal, which
also releases its owned depth attachment; no global or cross-view map is shared.

The current Stage 5 first render can include one <=19-call shadow pass and one <=19-call color pass;
subsequent camera-only frames use the color pass. Shadow fitting, target setup and
initial submission belong to the displayed CPU setup/first submission time, not
Core/request time or measured GPU completion. Paused operations defer scene setup
and all render passes. Existing asset wait, error/retry, stale completion and camera
retention behavior remain.

Run lighting.cjs with the documented PWG_* browser configuration for real shadow
allocation, static reuse, pause and minimum/zero-height checks. materials.cjs uses
the shared test-only support/lighting.cjs instrumentation to verify separate shadow
attachments/passes, both comparison views, repeated replacement, maximum instances
and cleanup, alongside coverage and surface-texture checks. Read large diagnostic
JSON bodies within the page rather than relying on CDP body retention. No product
debug API is added.

Before/after fixed-request normal/cold/warm rectangular previews are retained as
artifacts/lighting-before/after-{normal,cold,warm}-{overview,close}.png. The initial
1024 evaluation is retained as lighting-1024-* evidence. Software-WebGL timings and
attachment estimates are diagnostic, not controlled comparative research findings.
Full-map shadow texel density remains finite, especially at 512x512 and close zoom;
small residual aliasing on steep ridge silhouettes is not a geometric terrain defect.
The fixed fog also becomes stronger when zoomed far out. No equally sharp shadows
at all distances or mobile memory guarantee is claimed.

Stage 3 verification: 147 Angular tests, 127 Core tests, 37 API tests, four Python
packaging/asset tests and worker RPC pass. Production lighting/materials/landscape/
editor/PWA scenarios pass in Chromium 153.0.8010.52 with no page errors. Actual
shadow attachments match RGBA8/DEPTH_COMPONENT24 at 2048²; main and initial shadow
passes each stay at <=7 calls. Camera movement/reset reuses the map, real worker
computation emits no render passes, and replacement/view removal releases owned
attachments. Exact requests and raw checks are retained in lighting-verification.json
and lighting-materials-verification.json under ignored artifacts/. Core algorithms,
contracts and all mathematical output fields remain unchanged; the six-case full
WASM/API matrix still has zero observed numeric error.

## Forest structure and variants (Stage 4)

Stage 4 introduced diverse-landscape-v4 and landscape-worker-json-v5,
with landscape-ecology-v5 results; Stage 5 appends rocks under the current v6 contract. Required numeric tree variant is Small=0 or
Mature=1. There are no added controls. Existing warmth/moisture select ecological
categories; density scales the structured placement field independently of the
fixed grove/clearing masks and four-connected edge distance. Small/Mature describe
fixed visual geometry, not simulated age or growth. Savanna remains sparse.

Core derives baseline density at multiplier 1, applies deterministic grove/clearing
and same-kind edge attenuation, then the user multiplier. Nonvegetated/unsuitable
samples stay zero. Zero density preserves terrain/biomes and removes trees. Higher
density retains a candidate superset and stable transforms/variants before capping;
above the cap fixed priorities can replace entries. See VEGETATION_STRUCTURE_V1.md
for exact equations, hash salts and output order.

The distance pass uses one int[N] distance array and one int[N] FIFO, up to 2 MiB
combined at 512x512; the existing density array is updated in place. No mask/distance
wire layers or per-cell objects are added. Native allocation testing confirms the
two-buffer bound plus fixed overhead. The tree cap stays 16384; the new variant
adds an integer member to each serialized tree. Five v4 baseline requests freeze
old fields/vegetation; historical helpers reproduce old density/placement while
current terrain, climate, categories, surface weights and hydraulic summaries are
compared directly. Retained uncapped tree transforms also match the old policy.

Six possible kind/variant groups each own one trunk and crown mesh, instantiated
only when nonempty. All returned trees are rendered; no renderer-side randomness
or ecological derivation exists. The bound is twelve vegetation meshes plus terrain,
so <=13 color calls and <=13 initial caster calls per view. Matrix storage remains
two 16-float matrices per returned tree, at most 2097152 bytes. Geometry/material
counts grow only to the fixed group cap; the existing 2048 PCF target (32 MiB/view
attachment estimate), four surface textures, static reuse, real geometry bounds
and cleanup behavior remain. Numerical Core/host timing includes structure and
variant decisions, while instancing/bounds/shadows stay in display setup.

materials.cjs now records kind/variant counts, instance-matrix bytes, group counts,
separate main/shadow calls and complete response coverage. It captures normal/cold/
warm views plus a cool conifer scene and a mixed-kind scene containing all six
groups. The 512x512 cap case explicitly uses seed -7, pure plains, moisture 1,
warmth .6, sea 0 and density 1; all complete request fields are retained in evidence.
Raw screenshots/checks use artifacts/vegetation-after-* and
vegetation-materials-verification.json; landscape-verification.json covers seven
complete WASM/API cases, both variants for all kinds and heavy limits. An old cold
scene can now have no trees when its forest patches are narrower than the edge
transition; this does not change biome classification.

Stage 4 verification: 156 Angular tests, 137 Core tests and 38 API tests pass,
alongside four Python packaging/asset tests, worker RPC and Release/production builds.
All five production browser entry points pass. Seven complete WASM/API requests
show zero numeric error and exact kind/variant/index agreement. The mixed-kind
scene uses all six groups and thirteen calls per color/initial-shadow pass; the
16384-tree cap request uses 2 MiB of instance matrices. Maximum response in this
smoke matrix is 17526721 UTF-8 bytes; reserved WASM memory reaches 151977984 bytes
across the sequence, not peak managed memory or browser RSS. Counts vary with
placement policy/seed, and these observations are not controlled benchmark findings.

## Rocks, boulders and scree (Stage 5)

Stage 5 introduced diverse-landscape-v5 and result/workload/profile v6. Stage 6 changes heights under v7; the rock policy below is retained.
Required rocks records contain cellIndex, x/y/z, scaleX/Y/Z, rotation, groundY, kind
and variant. Core owns the distribution, support, embedding, clearance and capped
selection. See [ROCK_PLACEMENT_V1.md](ROCK_PLACEMENT_V1.md). GroundY is terrain height
at the center; Y is the embedded geometry origin and can be negative on dry flat
terrain. Rocks are decorative and do not change any prior result field or tree.
No controls, assets, dependencies or water rules were added.

The renderer uses at most six nonempty rock meshes alongside twelve vegetation
meshes and the terrain. All returned instances are visible geometry, with shared
Lambert materials and static shadows; 8192 rock matrices require 512 KiB/view.
Placement scratch storage is bounded at 32 MiB on the maximum map, separately from
existing Core outputs, parsed JSON, normalized records, Three.js resources and WASM
reserved linear memory. Native allocation tests include returned rock objects in
that bound. Rendering pauses under the existing shared lock and owners dispose rock
geometry/materials/matrices with the scene, including failed submissions.

`tests/reference/rocks_reference.py` supplies independent transform/cluster literals
and complete flat-map selection indices. `landscape-v5-fingerprints.json` captures
c4b7954 before rock implementation, including full tree variants and cap-sized
vegetation. It verifies every old numeric field bit-exactly while earlier historical
fixtures retain their original meaning.

The maintained browser entry points stay unchanged. landscape.cjs compares every
rock field across actual WASM/API, includes empty/maximal inputs and records counts,
response bytes and matrix bytes. materials.cjs records rock group/count diagnostics
and exact main-pass counts, captures rocks-after-{normal,cold,warm,conifer,mixed}
views at overview and close framing, and checks replacement/two-view/offline
ownership. rocks-before-* retains the same requests/cameras from c4b7954. Current
presentation evidence is artifacts/rocks-materials-verification.json. lighting,
editor and PWA scenarios cover static shadow reuse, pause, interaction, offline
reload/new tab, recovery and safe update behavior. These are correctness smoke
checks, not a benchmark campaign or a mobile memory guarantee.

Stage 5 verification: 155 Core, 38 API and 161 Angular tests pass, alongside Release/
production builds, four Python packaging/asset tests, worker RPC and all five browser
scenarios. Actual WASM/API parity has zero observed error across seven cases. The
maximum eroded case returns 8192 rocks and 16384 trees, 19024626 UTF-8 response bytes
and 183959552 reserved WASM bytes across the sequence; the maximum rock placement
native test allocates 17309912 bytes including output. The mixed scene reaches all
six rock groups and nineteen calls per color/initial shadow pass. GPU instrumentation
confirms 40960 submitted instances at both caps. Final empty-ocean, static shadow,
pause, replacement/error cleanup, offline/new-tab/recovery and safe-update checks
pass. No controlled comparative performance conclusions are drawn from these smoke
runs. The pre-existing unoptimized publishing notice remains recorded above.

## Local geometric relief (Stage 6)

The active algorithm is diverse-landscape-v6, with landscape-ecology-v7 results,
landscape-ecology-hydraulic-v7 workload and landscape-worker-json-v7 profile. Request
fields and output schema stay unchanged. LOCAL_RELIEF_V1.md freezes world-grid
mask/noise scales and formulas. New relief is added before erosion; all ecological
fields and tree/rock grounding follow final heights. Rendering, assets, controls,
instance caps, work limits and hydraulic arithmetic are unchanged.

Use tests/reference/relief_reference.py for independent scalar and full float32
composition literals. Historical/V5 contains the frozen pre-relief composer and
orchestration; landscape-v6-fingerprints.json captures all numeric fields of 18
c0d0f50 requests. Earlier height-preservation tests use this historical path;
current shape tests require 85% low-slope coverage and 60% connected coverage on
fixed pure plains, bounded variation, no new clamp plateaus and final grounding.
The warmed local sampler allocates zero bytes and adds no full-map buffers.

Run relief.cjs alongside the five existing browser scenarios. --baseline captures
the pre-relief deployment before publishing; the ordinary run checks UI equivalence
and pure/eroded plains/mountain views. Overview/close requests and framing are fixed
and retained under artifacts/relief-before/after-verification.json. materials.cjs
retains the normal/cold/warm/conifer/mixed scenes and resource checks, while
landscape.cjs checks every actual WASM/API field including maximum work. No
renderer displacement or parallel implementation in TypeScript exists.

Stage 6 verification: 174 Core, 38 API and 161 Angular tests, four Python build/asset
tests, worker RPC, Release/production builds and all six browser scenarios pass.
Pure-plain low-slope coverage stays 95.68–100% across four seeds at steps 0/32. Complete
actual WASM/API parity is zero-error across seven cases; the maximum 512x512x128 case
returns 16384 trees/8192 rocks and 19022998 UTF-8 response bytes, with 184680448 reserved
WASM bytes across the sequence. The mixed scene has 678 trees and 1017 rocks and stays
at 19 color/initial-shadow calls. New local relief adds at most eight noise calls per
sample and no map buffers; warmed native sampling allocates zero bytes. Full native
historical hashes, before/after views, production lifecycle/offline/update checks
pass without changing ecological/instance policies or their resource budgets.
Current material/view evidence is relief-materials-verification.json and relief-
before/after-* images under ignored artifacts/. These diagnostics are not controlled
performance research or a mobile guarantee.
