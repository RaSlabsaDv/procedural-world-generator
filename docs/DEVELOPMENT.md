# Development

## Current application

One Angular editor generates **Rich terrain + hydraulic erosion** locally in a C# WASM worker or remotely through ASP.NET Core. Both use the same Core. Seven detail stages are implemented, including structured vegetation, local relief and coastal surfaces. Architecture Race has protocol/contracts, a sequential collection service and a compact editor panel, post-run summaries and versioned JSON/CSV export. Evolution capture/playback remains future work. README is intentionally empty.

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

- Algorithm: diverse-landscape-v10; nested noise: value-noise-fbm-v1.
- Result: landscape-ecology-v11.
- Workload: landscape-ecology-hydraulic-v11.
- Execution profile: landscape-worker-json-v11; RPC: worker-rpc-v1.
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

Use the same environment for all nine entry points:

| Script | Coverage |
| --- | --- |
| landscape.cjs | Complete WASM/API parity, maximum workload, instances, memory and heartbeat diagnostics |
| atlas-materials.cjs | Paired before/after texture views with exact camera matrices and complete mathematical result hashes |
| materials.cjs | Five textures, instance/draw budgets, ownership, narrow/offline presentation |
| lighting.cjs | Actual shadow attachments, static reuse, pause and empty/minimum terrain |
| editor.cjs | Compact guidance/tips, keyboard sliders, drafts, retained results, equivalence and layout |
| race.cjs | Real sequential pairs, raw records/build identity, paused scenes, Stop, summaries, downloaded completed/stopped JSON/CSV and narrow layout |
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

Do not delete historical generators or nested HeightMapTransport preparation because standalone endpoints were removed: these retain active verification/transport roles. Scene ownership does not change renderer policies or timing boundaries. Architecture Race Step 1 protocol/contracts and immutable configuration are implemented; see [the specification](specs/ARCHITECTURE_RACE_V1.md). Sequential collection and its editor panel, summaries and export are implemented.


## Architecture Race configuration

`createExperimentConfiguration(terrain, measuredPairs?)` in experiments/data captures
an independent request, freezing its nested heightMap, terrain and configuration.
The default is 10 measured pairs; invalid pair counts throw RangeError. Mathematical
terrain validation remains in Core. No Angular form or browser APIs are required.
Colocated utility tests cover every captured parameter, caller edits, runtime freezing,
count boundaries and forwarding invalid terrain drafts unchanged. Run `npm --prefix
src/client test -- --watch=false` for frontend checks. Steps 2–4 add collection, editor controls, summaries and export described below. No performance campaign has been run.


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

Architecture Race is in the right Results & measurements sidebar, collapsed by default.
All nested experiment sections also start collapsed. Open the Architecture Race
heading to access its controls. During collection the outer section stays open so
progress and Stop remain reachable. Choose 1..30 measured
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
excluded diagnostics. Post-run summaries and downloads follow below; winner claims
and charts are not provided.

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


## Statistics and export

After an experiment settles, expand Diagnostic summaries or Verified summaries.
Warmups are excluded. Each mode has separate Core/request distributions, partitioned
again by complete observed build/workload identity. Included counts may cover several
groups but medians/quartiles are never pooled across groups. Diagnostic usable values
can come from excluded experiments; verified statistics require a completed eligible
experiment and eligible compared pair references. Otherwise Verified is unavailable.

For each mode/metric, total = included + failed + excludedSuccessful. Unavailable means
null and overlaps failed/excluded counts. Issue flags can overlap included diagnostic
samples; expand issues to see affected IDs and reasons. Individually finite nonnegative
values from a negative-residual pair remain diagnostic, never verified. Median, Q1/Q3
and extrema use sorted-index linear interpolation, retaining outliers. The pure data
modules are tested against independent literal fixtures and never mutate raw records.

Download JSON saves architecture-race-export-v1: experiment is the complete original
architecture-race-v1 record; specialNumbers restores NaN, +Infinity, -Infinity and -0
at escaped slash paths rooted inside experiment. Null placeholders with sidecar entries
are invalid/special readings, while nulls without entries are genuinely unavailable.
Use the record and sidecar together. Summaries are derived, not embedded. Unsupported
values, cycles, typed arrays and unexpected array paths produce an error instead of
silently omitting data. Source records stay untouched.

Download CSV is a flat UTF-8 companion with stable 25-column header and CRLF rows.
Every attempted call is retained, including warmups/errors. Inputs and environment
remain in JSON, linked by IDs; raw map arrays are never exported. CSV leaves nulls
empty, retains numeric precision/-0 and uses explicit nonfinite tokens. Text cells
with formula-like prefixes receive an apostrophe; original text remains in JSON.
Quotes, commas and multiline text use standard double-quote escaping. Use explicit
spreadsheet import settings; CSV text escaping is a mitigation, not a lossless JSON
replacement. The complete rules are in [Architecture Race v1](specs/ARCHITECTURE_RACE_V1.md).

Exports are available for failed/stopped runs, disabled during collection, and require
no additional computation or verification calls. Failed downloads keep the experiment
visible for retry. Filenames sanitize the experiment ID; temporary anchors and Blob
URLs are released. No controlled performance conclusions follow from these UI checks.


## Atlas Studio styling

The shell uses paper #F2EFE7 and panel #FFFCF5 with #273B35 text. Local uses forest
#356859; Remote uses #547BA0 accents and darker #426584 for readable text/filled
controls. Ochre #B68A48 marks small selections; keyboard focus uses #85622D.
Supporting muted text is #5C695E. Role colors, spacing, radii and shadows live in
src/client/src/styles.css; shared/panel.css provides common control states and
component CSS handles placement/density. Avoid introducing independent hardcoded
UI palettes or external font/texture dependencies. Terrain shader colors remain
owned by the existing rendering modules, separate from these UI variables.

The compass and quiet contour pattern are inline SVG/CSS with no animation or
additional cache catalog entries. UI chips retain mode names and selected-state
semantics. Error/disabled states and keyboard focus remain visible. Checked text
roles meet a 4.5:1 contrast target against their supporting surfaces; input boundaries
and focus rings are also checked. This is presentation verification, not benchmark
evidence. No new tests mirror CSS declarations; existing workflow regressions and
real desktop/mobile screenshots verify behavior and layout.

Representative ignored screenshots are artifacts/atlas-empty-desktop.png,
atlas-terrain-desktop.png, atlas-remote-desktop.png, atlas-compare-desktop.png,
atlas-validation-desktop.png, atlas-experiment-desktop.png and atlas-*-mobile.png.
They cover generation, validation, unavailable Remote, expanded/collapsed experiment
menus, keyboard focus and PWA details. Run existing Race/editor/lighting/PWA browser
checks against the published build after visual changes. README remains empty.

Atlas Studio verification: all 297 Angular tests and production publication pass,
with existing CSS budgets preserved. Chromium Race/editor/lighting/PWA regressions
pass, including paused scene work, full comparison/export, offline reload/new tab
and safe updates. Desktop/mobile screenshots were inspected for empty/generated
terrain, Local/Remote/Compare, validation/availability errors, experiment summaries
and PWA details; keyboard focus and absence of horizontal page overflow were checked.
No page errors were observed. Core/host sources were unchanged, so native test suites
were not rerun. The existing optional WASM optimization notice remains unchanged.


## Atlas terrain detail assets

The five bundled surface PNGs now use atlas-detail-v1: restrained fine grass/earth/
sand grain, softer stone with shallow mineral fractures, and quieter snow detail.
Reproduce them with `python3 scripts/generate-terrain-textures.py`; Python standard
library only. Format stays 256x256 linear grayscale 8-bit PNG. These are scalar
multipliers, so the existing RGB surface tints, color management and shader remain
unchanged. This step does not independently recolor vegetation, water or surfaces.

Current encoded total is 253693 bytes, compared with 271377 before refinement;
five active RGBA8+mip textures still estimate about 1.67 MiB/view. This byte count
is not a performance result or total GPU memory. [Asset notes](../src/client/public/textures/terrain/ASSETS.md)
record CC0 provenance and exact SHA256 values. No asset paths, catalog count, draw,
geometry, timing or workload identities changed. Core fixtures remain untouched.

The [material specification](specs/ATLAS_MATERIALS_V1.md) describes the presentation
boundary and verification. Run atlas-materials.cjs --before against the old assets,
then atlas-materials.cjs after regeneration/publication using the usual PWG_* setup.
Both phases use the same current algorithm and six exact requests. Eighteen canvas
views preserve actual projection/model-view matrices and dimensions; full numerical
result/summary hashes must match. Screenshots live under ignored artifacts/atlas-
materials-before/after-*.png; repeated raw swatch sheets and intensity statistics
are retained there too. Grayscale swatches are not RGB albedo previews.

The materials/coasts diagnostic scripts now collect only terrain parameter controls;
Architecture Race pair-count inputs must never be included in terrain requests.
Mathematical correctness, texture ownership/retry, all five uploads, offline loading
and safe PWA replacement continue to be checked separately from visual judgments.


## Biome readability: ground and crowns

`terrain/data/biome-presentation.ts` owns base surface, paired biome grass/soil,
legend and species/variant crown colors. Values are sRGB hex; Three.Color converts
shader uniforms into the existing linear working space. Do not add climate rules
or multiply the final mixed material by a biome tint. The compact Uint8 geometry
attribute aliases validated result IDs, with 262144 additional GPU bytes per
512x512 view. See [Biome presentation](specs/BIOME_PRESENTATION_V1.md).

With the documented PWG_* browser environment and a matching served publication,
run `node tests/browser/atlas-materials.cjs --biomes --before` before editing the
presentation, then `node tests/browser/atlas-materials.cjs --biomes` afterwards.
The seven requests at three zooms preserve exact camera matrices and complete
mathematical hashes. Ignored evidence uses `artifacts/biome-readability-*`; do not
overwrite the old baseline after changing colors. `materials.cjs` records actual
WebGL attribute encoding, buffer sizes, device limits and geometry replacement
cleanup, alongside existing texture/draw/instance/shadow/offline checks.

This step improves distinctions in supplied categories; it does not increase snow
coverage or beach width. Regional climate/snow readability and coastal policy need
separate Core specifications and cross-mode fixtures.

Verification for this revision: 300 Angular tests, seven build/documentation/asset
checks, production publication and Chromium paired views/materials/coasts/lighting/
PWA scenarios pass. The optional WASM optimization warning persists. No controlled
performance campaign was run; Core and host code are unchanged.


## Regional climate and highland snow

The current [climate policy](specs/REGIONAL_CLIMATE_V1.md) replaces original v3
temperature/moisture and v4 snow equations. Warmth remains normalized rather than
degrees Celsius. Default suitable highlands can show snow without forcing every
seed to contain every biome. Global warmth raises temperature and cannot increase
snow for identical terrain; hot lowlands remain snow-free. Trees/rocks can change
through ecological eligibility even though placement algorithms stay unchanged.

Run `python3 tests/reference/regional_climate_reference.py` for independent literal
references. Historical complete v8 fingerprints remain checked through test-only
frozen ecology. Current preservation tests compare all 23 prior requests' height,
slope and hydraulic hashes, plus authoritative ocean masks and output invariants.

For paired scenes run `node tests/browser/atlas-materials.cjs --climate --before`
against the previous v7 publication, then `--climate` against current v8. It compares
requests (except version), cameras, heights, slopes, ocean and simulation; ecology
is intentionally different. The after pass invokes the editor's full equivalence
check. Evidence lives under ignored `artifacts/regional-climate-*`. Original asset/
biome palette before/after hashes apply only to their unchanged-Core revisions.

Regional-climate verification: 202 Core / 40 API / 300 Angular tests, seven packaging
checks, worker RPC and production publication pass. Seven full Chromium WASM/API
cases have maximum observed error zero; 21 paired camera/invariant views plus
materials/coasts/lighting/PWA regressions pass. Existing render/instance budgets and
offline update behavior remain unchanged. The optional WASM optimization warning
persists; no controlled benchmark campaign was run.


## Coastal surfaces v2

The current [coastal policy](specs/COASTAL_SURFACES_V2.md) extends gentle low shores
and narrows steep/wet ones using existing slope/climate. It changes final coverage
only; Snow and all non-coverage fields remain exact. Trees/rocks may still stand
on sand, because placement is deliberately unchanged. Larger rocks are the next
separate extension. Scratch storage remains byte[N]+int[N], raw 1.25 MiB at 512x512.

Run `python3 tests/reference/coasts_v2_reference.py` for independent literals.
`tests/core/Fixtures/landscape-v9-fingerprints.json` freezes all numerical fields
from revision 92d160c before coastal v2. Preserve this fixture and historical v1
expectations. The current integration reconstructs old final coverage with the
frozen v1 pass, checks its original hash and compares every non-coverage hash.

Use `node tests/browser/coasts.cjs --v2 --before` against the preceding algorithm
v8 publication, then `node tests/browser/coasts.cjs --v2` against current v9. Eight
cases at three zooms retain exact camera matrices and hashes of non-coverage fields
and Snow; after cases invoke full worker/API comparisons. Ignored evidence uses
`artifacts/coastal-v2-*`. Sand>=0.2 bands are vertex coverage statistics measured in
Manhattan grid units, not pixel areas or a guarantee of continuous solid sand.

Coastal-v2 verification: 214 Core / 41 API / 300 Angular tests, seven packaging
checks, worker RPC and production publication pass. Eight coastal worker/API cases
and the seven-case full landscape matrix report zero numeric error; 24 paired views
preserve exact camera and non-coverage/Snow hashes. Material, lighting and PWA
regressions pass with unchanged resources and no page errors. The optional WASM
optimization warning persists. No controlled performance campaign was run.


## Sparse large rocks v2

[Rock placement v2](specs/ROCK_PLACEMENT_V2.md) replaces single-cell stones with
sparse groups, isolated boulders, multiple sizes and full-footprint support. Core
owns every placement decision. The unchanged eleven-member wire record and IDs
have broader scales under result/workload/profile v11. Client geometry validation
checks supplied transforms without repeating candidate acceptance or selection.
Six shared polyhedra use rock-shapes-v2; no dependencies, assets or controls added.

Run `python3 tests/reference/rocks_v2_reference.py` for independent transform/flat
selection literals. The 23 pre-change numerical fingerprints live in
tests/core/Fixtures/landscape-v10-fingerprints.json. Frozen v1 rocks and a minimal
V10 pipeline retain prior fixtures; current tests compare every non-rock hash.

With the documented PWG_* setup, run
`node tests/browser/atlas-materials.cjs --rocks --before` against previous algorithm
v9, then `--rocks` against current v10. Eight scenes at three zooms preserve actual
camera and all non-rock hashes. After scenes invoke worker/API equivalence. Ignored
evidence uses artifacts/rocks-v2-*. Earlier climate/coast paired baselines apply to
their original downstream policies, not to intentionally changed rock records.

The materials maximum fixture asserts sparse counts below 8192 and exact actual
submissions instead of requiring cap filling. Native allocation checks retain the
32 MiB placement budget, with inputs allocated before measurement. Low-poly faces,
conservative support and no rigid-body settling/rockfall physics remain limitations.

Rock-v2 verification: 231 Core / 42 API / 303 Angular tests, seven packaging checks,
worker RPC and production publication pass. Seven full host-parity cases report
zero error; 24 paired camera/non-rock views and material/coast/light/PWA regressions
pass. The focused allocation check records 16856656 placement bytes including
output for 1693 dry-flat rocks at 512x512. The optional WASM optimization warning
remains; no controlled performance findings are claimed.


## Scene environment foundation

The [environment specification](specs/SCENE_ENVIRONMENT_V1.md) freezes settings,
light-cycle equations and ownership. scene-environment.ts derives immutable linear
color/direction snapshots; SceneEnvironmentService shares them between views.
Default settings are timeOfDayHours=12, sunAzimuthDegrees=315, visualTimeSeconds=0.
Azimuth0 points +Z,90 points +X. This is an illustrative cycle, not astronomy.
There is no new UI or automatic ticking in this foundation stage.

Future controls call SceneEnvironmentService.set with all three validated members.
Invalid updates throw without changing the previous snapshot. Existing scene
bindings apply outside OperationLock and never rebuild terrain to change lighting.
terrainScene exposes updateEnvironment and environmentUniforms for later water/sky
integration. These are view-owned ordinary Three uniforms, not a GPU UBO.

Run `node tests/browser/atlas-materials.cjs --environment --before` against the prior
publication, then `--environment` afterwards with the documented PWG_* environment.
Six scenes at three zooms compare exact camera matrices, PNG bytes and full numerical
hashes. Evidence uses ignored artifacts/scene-environment-*. Unit/integration tests
exercise nondefault settings and deferred/replaced views; production UI currently
exposes only the default preset. Actual WebGL regression checks cover default
lighting/materials/comparison ownership and offline behavior. README stays empty.

Environment foundation verification: 313 Angular tests, seven packaging checks,
production publication and Chromium lighting/materials/editor/PWA checks pass.
All 18 paired PNG images, camera matrices and complete numerical hashes match
exactly. Nondefault controls are tested through the service/lighting/preview unit
interfaces; no new UI is exposed yet. Native sources are unchanged, so native tests
were not rerun. The optional WASM optimization notice persists. No performance
findings are claimed.


## Ocean surface and controls

The collapsed Water panel changes shallow color, turbidity and foam in both views
without generation. Reset restores the shared defaults. Controls are disabled during
operations. The surface is visible only where Core returns Ocean; sea level does
not fill isolated inland depressions. See [Ocean v1](specs/OCEAN_PRESENTATION_V1.md)
for units, geometry/shader equations, ownership and known shoreline/reflection limits.

Regenerate the original periodic normal tile with
`python3 scripts/generate-water-normal.py`. Its provenance/checksum live beside the
PNG under public/textures/water. The complete production PWA catalog now has 39 assets.

Using the existing PWG_* production-browser setup, run
`node tests/browser/water.cjs` for controls, animation, shared phase, operation pause,
maximum/zero-height Ocean and cached offline generation. Run
`node tests/browser/atlas-materials.cjs --water --before` against a previous publication,
then `--water` against the new one to compare six scenes at three zooms. Reduced
motion freezes phases for those images; OceanAnimationService.freeze/resume is
available for explicit test control. Normal animation draws at most 30 FPS outside
Angular and pauses while computation/collection owns OperationLock.

Verification: 324 Angular tests, eight packaging/asset checks and worker RPC pass;
production publication succeeds. Eighteen paired camera/full Core hashes remain
exact, with intentional water pixel changes. Real WebGL materials and water checks
pass; resources and wave drawing stay bounded. The original five terrain PNGs and
all mathematical identities remain unchanged. Native sources are unchanged, so
native suites were not rerun. The optional WASM optimization notice persists.
No benchmark performance claim is made. README.md remains empty.

Focused Chromium checks also pass for no-Ocean animation shutdown, 512x512 Ocean
(11509784 raw GPU geometry bytes), zero-height Ocean, cached new-seed offline water,
and narrow layout. Lighting, editor and PWA update regressions pass, including
offline new-tab generation, Remote recovery and update deferral while busy.

Water ripple correction: the original three-wave normal tile produced directional
bands, especially in foam. The same-size offline tile now combines 64 fixed-seed
components with independent phases and balanced perpendicular directions. A normal
covariance regression checks directional balance; geometry, shader sampling cost,
Core values and resource caps remain unchanged.

Ripple correction verification: nine packaging/asset tests and production publish
pass. Eighteen paired camera/full numerical hashes are unchanged. Chromium water
checks pass, including animated comparison views, computation pause and new-seed
offline rendering. Frozen close-up views show removal of the directional bands;
the existing low-poly shoreline remains.


## Sky and atmosphere controls

The collapsed Atmosphere panel provides Enabled, Haze, Valley fog and Reset.
Defaults are true/.22/.18, with numeric sliders in [0,1]. Both views update together
without generation, geometry replacement or camera reset. Disabled mode restores
the earlier flat background, linear fog and approximate water horizon reflection.
Controls are disabled during operations; pending updates apply after release.
There are no time-of-day controls yet. SceneEnvironmentService remains the sole
source of sun state, and atmosphere adds no animation clock.

[Atmosphere v1](specs/ATMOSPHERE_V1.md) defines the analytical model, numerical bounds,
linear-color ordering, water composition approximation and graphics budgets. Full
sky gradients are most visible when orbiting toward the horizon; the existing
initial camera looks down at the finite map and is intentionally preserved.

Using the documented PWG_* production-browser environment, run:

- node tests/browser/atmosphere.cjs
- node tests/browser/atlas-materials.cjs --atmosphere --before (prior publication)
- node tests/browser/atlas-materials.cjs --atmosphere (new publication)
- node tests/browser/atlas-materials.cjs --atmosphere --reference

The reference atlas can reuse the preceding frozen Ocean captures by copying their
JSON to atmosphere-reference-before.json and PNGs to atmosphere-reference-before-*
in ignored artifacts. Compare PNG bytes separately. The atlas preserves complete
Core hashes/camera matrices; pixels intentionally change in enabled mode. Historical
Ocean captures from the ripple correction use reduced motion and identical scenes.
The atmosphere harness also exercises nondefault sun states with test-only source
substitution in an isolated SW-blocked context; modified bundles never enter PWA
caches. This is test tooling, not an exposed production debug interface.

Run normal unit/packaging/RPC checks and production publication; then material,
lighting/editor and PWA browser regressions. Keep PWA update tests last because they
mutate and restore generated deployment assets. No new texture/catalog entry or
external dependency is needed. Native sources stay unchanged; mathematical native
suites need not be rerun for presentation-only changes. README stays empty.

Atmosphere verification: 333 Angular tests, nine packaging/asset checks, worker RPC,
production publish and Chromium atmosphere/materials/lighting/editor scenarios pass.
All 18 enabled-mode full Core/camera comparisons and all 18 disabled-mode PNG byte
comparisons pass. Actual sky allocation is 36 raw position bytes; total color cap 21
and caster cap 19 remain bounded. Numeric parameters, Core/host sources and identities
are unchanged. The optional WASM optimization warning persists; no performance
finding is inferred from smoke runs. Raw evidence is in ignored artifacts/atmosphere-*.

The materials matrix observed up to 19 color calls including exactly one sky draw;
the structural ceiling is 21 when every terrain/tree/rock/water group is present.
Existing 2048-square shadow attachments remain 32 MiB per view (format-based
estimate), with one static update per unchanged scene.

Production PWA regression also passes: cached reload/new tabs and new seeds, Remote
failure/recovery, deferred update while busy, and updated-version offline 3D terrain.
Deployment assets were restored after the update simulation.


## Interactive sun

Open the collapsed Sun panel beneath Atmosphere. Time of day spans 00:00..24:00 with
15-minute steps; direction spans 0..359 degrees with an eight-point compass label.
0 degrees/N points world +Z; 90/E points+X. Reset sun restores 12:00/315 degrees NW,
keeping visual-time phase and Water/Atmosphere settings. Both previews update without
regeneration. The initial sky gradient is easiest to see near the horizon; existing
camera behavior is preserved.

Controls are disabled during operations and validate events synchronously. First
opening loads their deferred code only after OperationLock releases. There is no
sun playback/persistence. The existing illustrative light cycle is unchanged;
near sunrise/sunset and at night the terrain is deliberately dark. Low sun can
stretch low-poly shadows. These are recorded limits for the next shadow-quality
assessment, not a reason to silently change the light model in this interaction step.

Using the documented PWG_* production-browser setup, run:

- node tests/browser/sun.cjs
- node tests/browser/atlas-materials.cjs --sun

The Sun atlas uses six unchanged scenes/three zooms, frozen waves and the preceding
atmosphere captures: copy atmosphere-after.json to sun-controls-before.json and
atmosphere-after-*.png to sun-controls-before-*.png under ignored artifacts before
publishing. It verifies exact camera/full Core hashes and all 18 default PNG bytes.
The focused UI harness covers the real slider cycle, direction/reset, independent
views, rapid-edit coalescing, stable uploads/shadow attachments, busy guards,
deferred opening, cached offline controls/new seeds and narrow layout. No production
debug interface or test-only bundle substitution is required for these sun tests.

Production build keeps Three/rendering in lazy chunks; the new Sun entry and shared
code bring the complete offline catalog to 40 required assets. No texture or external
dependency is added. Core/hosts are unchanged; native suites were not rerun. Keep
PWA update checks last because they mutate/restore the generated deployment.

Sun verification: 338 Angular tests, nine packaging/asset checks, worker RPC and
production publication pass. All 18 default camera/full Core/PNG comparisons pass.
Real Sun UI/materials/lighting/editor scenarios verify actual shared sun updates,
exact reset, unchanged uploads, one shadow update per synchronous edit batch,
night/day target reuse, busy input restoration, deferred opening until unlock,
narrow layout and cached offline first interaction/new-seed generation. Native
sources remain unchanged; the optional WASM optimization notice persists. No
performance claim is made. Raw evidence uses ignored artifacts/sun-*.

Production PWA regression passes: offline reload/new tabs and new seeds, Remote
failure/recovery, deferred update while busy and updated-version offline 3D terrain.
Generated deployment assets were restored after the update simulation.


## Night foam and moon correction

Foam now responds to the actual linear ambient sky/fill and direct sun, including
when Atmosphere is disabled. Previously its constant pale albedo acted as emission.
The shared sky also shows a simple full moon opposite the sun at night; it appears
in water sky reflection automatically. Enable Atmosphere and orient toward the sky
to see it. There is no lunar-phase/calendar simulation or new lunar shadow light.

Run node tests/browser/night.cjs with the production PWG_* setup for pixel-level
noon/night/zero-light foam checks, visible night moon/day absence and offline use.
The zero-light case uses a test-only draw-time uniform override; original values
are restored after each draw and no app debug interface is introduced. The moon
probe uses the existing OrbitControls on a zero-height back-face-culled test plane
so its optical axis faces the moon; normal map-camera defaults stay unchanged.
See [Night sky and foam v1](specs/NIGHT_SKY_V1.md) for the frozen equations and limits.

Night correction verification: 338 Angular tests, nine packaging/asset checks, worker
RPC and production publish pass. Real Sun UI and night pixel/offline browser checks
pass. All 18 prior default noon PNGs/camera/full Core comparisons remain exact.
No texture/catalog entry, render pass or mathematical identity changes. The
zero-light image probe tolerates small coverage/fog-compositing differences while
checking that foam is no longer a bright emissive contribution. Raw evidence uses
ignored artifacts/night-*. Native suites were not rerun because native code is unchanged.

Night correction PWA regression also passes: cached reload/new tabs/new seeds,
Remote recovery, deferred update while busy and updated-version offline 3D terrain.
Generated deployment assets were restored afterwards.


## Shadow quality assessment

Run node tests/browser/shadow-quality.cjs --before against the prior production
publication, then run it with --unchanged after publication. Add --contact on both
runs for the two closer forest/maximum scenes. The combined 54 views require exact
request/full Core hashes, actual camera and GPU shadow uniforms, and PNG hashes.
Reduced motion freezes waves. JSON/screenshots live under ignored artifacts using
shadow-quality-* and shadow-contact-* names. Retain the baseline before publishing.

The --before --contact --probe diagnostic overrides only the terrain receiver's
comparison bias at draw time. It writes separate shadow-contact-probe-* evidence
and never changes production configuration. This probe was rejected: a world bias
clamped to .002.. .08 with .35 texel scaling produced visible surface acne at 512-square
noon/low sun. The accepted policy retains the original bias, normal offset, PCF
radius, map size and conservative request/instance fit. Do not publish the probe
as an improvement or mix its captures with the accepted baseline.

[Shadow quality v1](specs/SHADOW_QUALITY_V1.md) records observed limits and installed
Three source behavior. Extra tests include quantized GPU instance transforms,
rotation/scale and shifted edge meshes, height 0/1/1000 and near-horizontal sunlight.
The thin-contact resolution limit remains; CSM/AO is a separately scoped decision.
No production rendering or mathematical identity changes are made in this step.
Keep native suites unchanged, run relevant frontend/production/browser checks and
leave PWA update checks last. README remains empty.


Shadow assessment verification: 342 Angular tests, nine packaging/asset checks,
worker RPC and production publication pass. Both accepted atlases pass with exact
54 PNG hashes, GPU shadow values, request/full Core hashes and camera matrices
(42 standard views plus 12 contact views). Sun UI and night pixel/offline regressions
pass, preserving independent views, operation pause, shadow-target reuse, Moon
visibility and non-emissive foam. No runtime rendering parameter was changed.
The rejected probe is isolated in shadow-contact-probe-*; accepted evidence and
summary are under ignored artifacts/shadow-quality-*/shadow-contact-*.

Shadow assessment PWA regression passes: cached reload/new tabs and new seeds,
Remote recovery, deferred update while busy and updated-version offline 3D terrain.
Generated deployment assets were restored after the update simulation.


## Terrain material microdetail

Close terrain views now use coverage-blended detail normals. No new UI is required;
internal defaults are strength .24, period 2.4 world units and fade 24..72 units. Five
existing scalar/color textures retain their behavior. Ocean/water, geometry and
Core ecological fields stay unchanged. Fine detail disappears at overview distances.

Reproduce the original CC0 normal atlas with
python3 scripts/generate-terrain-normals.py. Provenance/profiles/encoding/checksum
live beside textures/microdetail/normals.png. The128x640 RGB8 PNG stores five vertical
layers; runtime decode yields RGBA and uploads 128x128x5 with independent layer mipmaps.
No imaging dependency is required. Atlas byte size 201699; GPU 436900 bytes/view plus
327680 retained decoded CPU bytes. Temporary bitmap/canvas decode adds bounded
fixed-size storage, not a terrain-sized copy. Budget up to2MiB decode preparation
per preview, excluding browser-internal allocation details. Images are closed after
decode; owner resources release on destruction. Failed normal loads show a numeric-
results-preserving preview error and retry on generation. Scene changes reuse data.

Using documented PWG_* production-browser setup:

- node tests/browser/atlas-materials.cjs --micro --before (previous publication)
- node tests/browser/atlas-materials.cjs --micro (new publication)
- node tests/browser/microdetail.cjs
- node tests/browser/materials.cjs

The atlas covers eight scenes at overview/close/grazing scales, including 512-square
terrain. Complete Core hashes and actual camera matrices must match. The focused
harness verifies real array dimensions/mip count/sampler limits, close appearance,
exact far-fade reference, independent views, cached replacement resources, operation
pause, Sun/atmosphere composition, narrow/offline generation and actual signed-axis/
neutral projection functions on the GPU. Test-only strength overrides are restored
after each draw and introduce no app debug interface. PNGs/JSON are under ignored
artifacts/terrain-microdetail-* and microdetail-*; PWA update checks run last.

[Terrain microdetail v1](specs/TERRAIN_MICRODETAIL_V1.md) records frame orientation,
normal conventions and sampling bounds. Normal lighting does not fix low-poly
silhouettes, global shadow-map resolution or add true displacement. Keep rendering
outside Core timings; first submission is not GPU completion. README stays empty.

Microdetail verification: 347 Angular tests, 12 packaging/asset checks, worker RPC and
production publish pass. All 24 paired camera/full Core hashes match, with all 8
previous overview PNGs byte-exact. Real GPU normal fixtures, material array/sampler/
resource checks, Sun/night, operation pause, narrow and offline scenarios pass.
Native sources are unchanged. No controlled performance finding is claimed; the
optional WASM optimization notice persists.

Microdetail PWA regression passes: cached reload/new tabs and new seeds, Remote
recovery, deferred update while busy and updated-version offline 3D terrain with
the new normal atlas. Deployment assets were restored after the update simulation.


## Visible 3D grass

Close terrain views now show actual three-blade grass tufts, up to32768 per viewport.
Placement uses authoritative Grass surface coverage and existing biome/slope data,
exact terrain triangle height and conservative exclusions around rocks/tree trunks.
Decorative grass is independent of the Core tree-density parameter; the parameter
hint explains this. No grass density/editor/wind control is added in this step.

Grass is fully visible within 20 world units, fades by opaque screen Bayer cutout
through 55 and clips out beyond that. Zoom near the ground to inspect blades; at
map overview the preceding appearance remains exact. Grass follows shared sun/fill
and atmosphere, including night. It receives existing shadows and casts none.
Dither stipple in the transition, rigid geometry and capped sparse cover on very
large maps are explicit v1 limits, not a complete vegetation LOD system.

Using documented PWG_* production-browser setup, run:

- node tests/browser/atlas-materials.cjs --grass --before (prior publication)
- node tests/browser/atlas-materials.cjs --grass (new publication)
- node tests/browser/grass.cjs
- node tests/browser/materials.cjs

The atlas covers eight fixed scenes at overview/close/grazing. Its open-grass hero
uses moisture.85 and zero tree density to inspect tufts without a canopy; full
Core/camera hashes remain equal and all 8 overview PNGs remain byte-exact. The grass
harness records actual GPU counts, matrix/color hashes, draw/buffer limits, far
on/off reference, near/grazing/light states, independent views, no upload or draw
while busy, replacement cleanup and offline first use/new seeds. Test-only hide
hooks are injected into draw instrumentation, not exposed by the application.

[Grass presentation v1](specs/GRASS_PRESENTATION_V1.md) freezes caps, exact triangle
grounding, hash streams, conservative eligibility and finite resource budgets.
Maximum GPU instance storage is 2.375 MiB/view, 4.75 MiB for comparison, plus geometry.
Raw selection/index scratch is <1 MiB; transient Three/engine memory is not an RSS
measurement. Scene setup/placement/upload remain outside computeMs/requestMs and
inside display preparation. Geometry/materials release even on failed construction;
Sun/Water/Atmosphere edits do not rebuild grass. No texture/PWA asset is added;
the existing 41-entry catalog includes the updated lazy JS. README stays empty.

Grass PWA regression passes: cached reload/new tabs and new seeds, Remote recovery,
deferred update while busy and updated-version offline 3D terrain. Generated
deployment assets were restored after the update simulation.

## Individual tree foliage colors

Crown brightness/warmth/saturation now vary subtly by seed and stable Core cellIndex,
kind and variant. Broadleaf, conifer and savanna retain their existing paired base
palettes; trunks and transforms stay unchanged. The policy and hash reference are
in [Foliage variation v1](specs/FOLIAGE_VARIATION_V1.md). No control is needed: generate
terrain and zoom into a forest. Sun/time/atmosphere edits reuse the color buffers.

Use the shared PWG_BASE_URL/PWG_PLAYWRIGHT_MODULE/PWG_BROWSER_EXECUTABLE overrides:

- `node tests/browser/atlas-materials.cjs --foliage --before` against the prior publication.
- `node tests/browser/atlas-materials.cjs --foliage` against the new publication.
- `node tests/browser/foliage.cjs` for actual GPU colors/resources and Local/Remote parity.

Six paired scenes cover broadleaf, conifer, savanna, mixed, sparse and maximum-cap
forests at overview/close/grazing. Requests, actual camera matrices and full Core
result/simulation hashes must remain exact; PNGs intentionally change. GPU checks
read real instanceColor buffers, white material diffuse, bounds, occupied attribute
locations, cleanup after replacement, stable buffers through noon/low/night and
atmosphere-off, both views, narrow layout and offline new seeds. Raw evidence uses
ignored `artifacts/foliage-*`. Browser software WebGL checks are correctness evidence.

Maximum added color storage is 192 KiB/view (384 KiB for comparison). Up to six
occupied crown groups still share twelve tree meshes; draw/caster ceilings stay
22/19 for the whole scene. No new dependency or asset: offline catalog remains
41 required assets. Native code is unchanged. These are Stage 5B resource bounds;
the subsequent tree LOD section records the current representation/storage policy.

Verification: 376 Angular tests, 12 packaging/asset checks and worker RPC pass;
production publication succeeds. All 18 paired camera/full Core hashes are exact.
Actual GPU crown programs occupy seven attribute locations within the observed
16-location limit, with six live color buffers for six occupied groups. Local/Remote
GPU hashes match, maximum color storage is exactly 196608 bytes/view and replaced
buffers are released. Sun, night/foam/moon and materials regressions pass. Native
suites were not rerun because native sources did not change; no performance campaign
was run. Known limits remain low-poly silhouettes and global shadow resolution.

Final PWA regression passes: offline reload/new tabs/new seeds, Remote failure and
online recovery, deferred update under a busy operation and updated-version offline
3D terrain. Deployment files were restored after the update simulation.

## Tree geometry LOD

Generate terrain and zoom: near trees retain full models, while distant trees use
coarser opaque 3D shapes. No new UI is needed. Thresholds use camera-to-root distance
scaled by tree size, with initial56 and hysteresis48..64. Small camera motion below
.25 world units defers evaluation; stationary views do no LOD repacking. Far trees
keep their individual colors and species silhouette, with visibly coarser facets.
There is a hard geometry switch, not a smooth morph. Full-detail static shadows
may differ slightly from far silhouettes. This is separate from grass distance fade.

The implementation and finite budgets are frozen in
[Tree LOD v1](specs/TREE_LOD_V1.md). `terrainForest` remains the canonical full-detail
builder; `terrainForestLod` owns its shadow sources and visible near/far instances.
`tree-appearance.ts` centralizes unchanged species/variant presentation dimensions.
The preview evaluates LOD only after checking OperationLock and before rendering.
Initial classification enters the existing display preparation/submission metric;
later camera updates do not overwrite that initial value.

Production-browser commands with the documented PWG_* environment:

- `node tests/browser/atlas-materials.cjs --lod --before` against the preceding publication.
- `node tests/browser/atlas-materials.cjs --lod` against the LOD publication.
- `node tests/browser/tree-lod.cjs` for real GPU near/far geometry, buffer and shadow checks.
- `node tests/browser/foliage.cjs` and `node tests/browser/materials.cjs` for color/resource regressions.
- Run `node tests/browser/pwa.cjs` last; it temporarily changes deployment assets and restores them.

The six paired forest scenes produce18 exact camera/full Core hashes. Screenshots
intentionally change, principally on distant silhouettes. Real GPU checks distinguish
indexed cones from nonindexed polyhedron draws, read active matrix/color prefixes,
verify identical Local/Remote packed buffers at matching overview state, and verify
static caster bytes/uploads through camera movement. Maximum overview submits all
16384 trees: 131054 crown triangles in the accepted fixture, versus327608 full-detail
crown triangles for the same species counts. Including trunks gives327662 versus
655288 color triangles. These are structural draw counts, not GPU timing findings.

Up to two active LOD batches per occupied kind/variant mean at most34 whole-scene
color calls, previously22; the19 caster ceiling and seven crown attribute locations
are unchanged. GPU instance storage ceiling is3.375 MiB/view,6.75 MiB for two views,
versus2.1875 MiB/view for preceding full-detail tree instances. Repacking/upload work
and extra buffer capacity are explicit tradeoffs. No assets/dependencies are added:
the lazy-JS publication changes, but offline catalog remains41 required assets.
Native sources and workload identities remain unchanged; README stays empty.

Verification: 385 Angular tests (including all six groups split simultaneously),
12 packaging/asset checks, worker RPC and production publication pass. All 18 paired
camera/full Core hashes remain exact. Real GPU checks confirm 570 overview trees,
228 near trees in the close fixture, 131054 maximum overview crown triangles and
mixed LOD at maximum close range. Every previously observed tree/caster buffer is
deleted on replacement; camera motion causes no caster upload or shadow-map refresh.
Materials/foliage/grass/Sun/night regressions and narrow/offline new seeds pass.
Native suites were not rerun because native sources are unchanged. Evidence lives
under ignored `artifacts/tree-lod-*`; no controlled performance campaign was run.

Final PWA regression passes: cached offline reload/new tabs/new seeds, Remote failure
and online recovery, deferred update during an active operation and updated-version
offline 3D terrain. Temporary deployment changes were restored after the simulation.
