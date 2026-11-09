# Architecture

The application has one generator: **Diverse terrain + hydraulic erosion**, displayed with Three.js. Local WebAssembly and Remote API are execution locations for the same workload. Baseline generation, probe diagnostics, the experimental regional world, and all 2D previews have been removed. Evolution playback is a planned extension, not a current feature.

## Components

```mermaid
flowchart TD
    UI[Angular controls and immutable snapshot] --> S[TerrainService]
    S --> L[Local adapter and module worker]
    S --> R[Remote HTTP adapter]
    L --> W[.NET WASM host]
    R --> A[ASP.NET Core API]
    W --> C[WorldGenerator.Core]
    A --> C
    S --> V[Three.js preview]
```

Core owns validation, deterministic noise/composition, hydraulic simulation, and biome classification. It has no JSON, HTTP, timer, DOM, or rendering dependencies. Hosts link shared transport source from `src/hosts`; no separate contracts package is needed. TypeScript handles forms, transport normalization, comparison, and visualization; it does not reproduce generation mathematics.

`TerrainGenerator.Generate` validates before allocation. Hosts use `TerrainValidator.Prepare` and its immutable `ValidatedTerrainRequest`, then time `GenerateValidated` without revalidation. Null direct requests throw `ArgumentNullException`; invalid direct requests throw `ArgumentException`.

## Terrain editor

`App` coordinates draft forms, immutable generation snapshots, revision checks and the shared operation lock. A large deferred Three.js viewport is flanked by the parameters sidebar and results/measurements sidebar. `TerrainParametersPanel` owns grouped controls and draft actions; `TerrainResultsPanel` owns result selection, the viewport, comparison and metrics; `PwaStatusPanel` uses the same root-injected lock for readiness and reload. Panels stack on smaller screens and can be collapsed using native details controls.

`terrain/editor/parameter-definitions.ts` centralizes labels, descriptions and input steps; pure `terrain/data/terrain-defaults.ts` supplies initial values to forms and readiness checks. Mountain/warp sliders have presentation bounds, with synchronized exact numeric inputs. These bounds are UI guidance, not canonical validators; Core remains authoritative for ranges and work budgets. Random seed uses browser crypto only to select an Int32 seed. Reset and all controls modify a draft without executing the generator. Capture rejects missing/non-finite values and freezes both request levels. Nested Core error paths map to input errors.

Generation preserves prior successful maps during work or errors. Display labels distinguish captured settings from the current draft; input edits clear comparison state. Local/Remote verification remains sequential with one snapshot, and commits the pair after both complete. Revision and destruction checks discard obsolete responses; the operation lock is held until the real asynchronous call settles, including after component destruction.

One primary result is visible by default; Local/Remote selection and Compare views are explicit. Comparison views can retain results from different requests, which are labelled and flagged; numerical verification is shown only for a verified identical request. Build identity remains separate from numeric agreement. Captured parameters, versions, simulation totals and startup/display details are expandable. Individual runs are not a benchmark campaign.

Camera pose survives same-scale result replacement within a preview. Changing dimensions/height scale or recreating a preview resets framing; Reset camera restores the default request-based framing. Both comparison views use the same scale rule. Rendering and interaction pause during operations; cleanup releases observers, controls, meshes and renderer resources. Readiness is compact in the header, with visible recovery/update state and a discoverable update check. Safe reload and complete-version cache verification remain unchanged. No new frontend dependencies are introduced; the v11 result semantics are specified below.

Playback and brush editing are not implemented. Lighting, shadows and atmosphere are implemented as a presentation layer; bounded evolution capture remains later work.

## Contracts and public surface

The sole generation endpoint is `POST /api/v1/terrains`; `GET /api/health` reports availability. Unknown `/api` routes return 404 rather than the Angular shell. The sole WASM export is `GenerateTerrainJson`, exposed as the asynchronous `generateTerrainJson` worker proxy. See [development](DEVELOPMENT.md) for a complete request.

`TerrainRequest` contains required `heightMap`, `mountainStrength`, `warpStrength`, `iterations`, `rainfall`, `evaporation`, `plainsCoverage`, `mountainCoverage`, `globalMoisture`, `seaLevel`, `globalWarmth`, `vegetationDensity`, `landformRegionScale` and `algorithmVersion`. Coverage tendencies must sum to at most 1; coverage, moisture, sea level, warmth and vegetation density range 0..1; region scale ranges .25..4. `heightMap` remains the nested composition settings contract, not a second generation mode. Its `value-noise-fbm-v1` tag identifies the noise primitive; the top-level algorithm is `diverse-landscape-v10`. Dimensions, scales, seeds, and all simulation settings must be identical for a Local/Remote comparison. Historical height/climate equations are in [LANDSCAPE_V3.md](specs/LANDSCAPE_V3.md), current climate and snow in [REGIONAL_CLIMATE_V1.md](specs/REGIONAL_CLIMATE_V1.md), vegetation in [VEGETATION_STRUCTURE_V1.md](specs/VEGETATION_STRUCTURE_V1.md), and coverage in [SURFACE_TRANSITIONS_V1.md](specs/SURFACE_TRANSITIONS_V1.md); [TERRAIN_WORKLOAD.md](specs/TERRAIN_WORKLOAD.md) preserves historical v1.

The host envelope contains `result`, `simulation`, exact `parameters`, `computeMs`, `coreBuildId`, `workload = landscape-ecology-hydraulic-v11`, and `simulationVersion = hydraulic-grid-v1`, plus `executionProfile = landscape-worker-json-v11`. The result additionally contains moisture, temperature, slope, vegetationDensity, trees and required surfaceWeights and rocks. The result has width, height, row-major float32 `values[y * width + x]`, numeric `biomes`, algorithm version, and `resultVersion = landscape-ecology-v11`. The new result/workload identities distinguish ecology from historical v1.

All wire members are required. Nullable wire records distinguish missing fields from zero. JSON is camelCase and case-sensitive; unknown members, numeric strings, comments, trailing commas, malformed JSON, and overflowing/non-finite numbers are rejected. Both hosts return the same `{ error, fields }` shape: `invalid_json` for transport failures or `validation` with field errors. Canonical numeric limits live only in Core. API failures return 400; all terrain responses use `Cache-Control: no-store`.

## Determinism and display

All composition and simulation passes are single-threaded in fixed order. Noise uses explicit unchecked uint hashing, quintic interpolation and double intermediates; final heights are float32. Each call owns its arrays. The independent Python fixture and Core tests freeze the selected terrain arithmetic.

Biome IDs are Ocean=0, Grassland=1, BroadleafForest=2, DryGrassland=3, Rock=4, ConiferForest=5, Savanna=6, Tundra=7 and SnowHighlands=8. Tree kinds are Broadleaf=0, Conifer=1 and Savanna=2. Boundary-connected sea classification uses an explicit relative sea level; low interior depressions remain dry. Moisture, normalized warmth and slope influence biomes; trees require four eligible corners with the same tree category. Core returns full environment/density arrays and bounded deterministic tree instances. TypeScript only normalizes, compares and renders the results. [LANDSCAPE_V3.md](specs/LANDSCAPE_V3.md) records original equations and units; [REGIONAL_CLIMATE_V1.md](specs/REGIONAL_CLIMATE_V1.md) supersedes its climate/snow rules.

`TerrainService` validates the entire host response, echoed settings, versions, work counters, finite heights and IDs before copying to typed arrays. Comparison examines every height with `abs(a-b) <= 1e-6 + 1e-5 * max(abs(a), abs(b))`, and compares every biome ID, tree kind, variant and tree cell index exactly. All float fields, instance transforms and simulation totals are compared using the same numeric tolerance; separate environment, vegetation, coverage and rock discrepancy counts are reported. Build identity is reported separately from numeric agreement.

Three.js builds a mesh directly from Core heights and blends its surface colors from Core coverage weights. Both views use the same request scale. Orbit, zoom and pan remain. Rendering pauses while an operation holds the shared lock. Tree positions are computed by Core on the exact terrain triangles. Two shared low-poly instanced meshes per nonempty kind/variant pair render all returned trees, at most twelve vegetation meshes per viewport, without renderer-side placement or ecological decisions. The cap is 16384 computed trees; density remains available over all samples. Geometry, instanced meshes, materials, controls, observers and renderer resources are disposed on replacement/destruction. WebGL failures show a presentation error while numerical results remain available. No 2D fallback is included.

## Vegetation structure

The vegetation policy adds deterministic Core-owned groves, clearings and same-kind edge attenuation. Stage 6 changes their height inputs while retaining the ecological equations. One four-connected distance pass uses two temporary int[N] arrays. Density is updated in place, with the user multiplier last; masks, candidate hashes and variants never depend on that multiplier. Candidate sets are monotonic before the 16384 cap; fixed priorities can replace entries after capping, and retained transforms remain stable.

Every tree record now has eight required members, including numeric variant (Small=0, Mature=1). Core selects it using an independent cell/seed hash, not biological age. The client rejects legacy/malformed variants and compares variants exactly. The renderer maps kind/variant to fixed low-poly proportions/colors and renders every returned record, with no PRNG or per-tree materials. See [VEGETATION_STRUCTURE_V1.md](specs/VEGETATION_STRUCTURE_V1.md) for frozen salts, distances, operation order and memory budgets. Historical density/placement references and v3/v4 field fingerprints remain test-only.

## Surface material boundary

Core first derives the base surface vector with current regional-climate snow from final heights/environment. Trees and rocks consume the existing ecological fields and base coverage. Only after placement, CoastalSurfaces reuses the authoritative ocean mask to derive bounded inland distance and blend final coverage in place. The coastal pass itself preserves every non-coverage value and instance exactly. Land below/equal sea in a disconnected depression receives no coastal influence. See [COASTAL_SURFACES_V2.md](specs/COASTAL_SURFACES_V2.md) for distance, elevation/climate/slope masks, snow precedence and arithmetic; [SURFACE_TRANSITIONS_V1.md](specs/SURFACE_TRANSITIONS_V1.md) preserves the base policy.

The required five-channel float32 surfaceWeights array stays Grass/Soil/Sand/Rock/Snow. Land vectors sum to one within 1e-6; Ocean vectors stay zero. Sand is now an active numeric land channel. Snow bits and coverage beyond influence are preserved. Strict decoding still rejects malformed/nonfinite/unbounded/unnormalized vectors, and full comparison checks every channel.

Lambert coverage equations from terrain-surface-coverage-v2 blend supplied colors and five local grayscale detail maps with four-unit triplanar sampling, without ecological decisions or displacement. Existing vec4 Grass/Soil/Rock/Snow coverage plus a scalar sandCoverage attribute use 20 bytes per vertex, 5 MiB at 512x512, 1 MiB more than Stage 6. Ocean complement includes all five weights. Geometry, normals, triangle indices and draw-call budgets are unchanged; biome IDs remain ecological labels, not exact visible surface colors.

Current shader revision terrain-biome-ground-v1 uses those IDs to select paired grass/soil colors in the vertex stage before interpolation. A single unnormalized Uint8 biomeId attribute aliases existing result storage: no map-sized CPU copy, 0.25 MiB additional GPU storage per maximum-size viewport. Two nine-entry linear-color uniform palettes add 216 numeric bytes and two vec3 varyings. Sand, rock, snow and ocean contributions keep their prior equations/colors; final mixed color is never biome-tinted. Crown colors share the central presentation palette; trunks and all instance transforms remain unchanged. Geometry disposal releases each viewport’s GPU attribute without altering source IDs. See [Biome presentation](specs/BIOME_PRESENTATION_V1.md).

Current scalar detail assets use atlas-detail-v1, specified in [Atlas materials](specs/ATLAS_MATERIALS_V1.md). The offline Python generator refines grain/contrast without changing RGB tints, texture format, shader equations or mathematical identities.

Each preview owns five textures across replacements. Sand participates in the same complete async asset wait, failure/retry, partial/late completion and disposal rules. Scene setup/submission defers under the operation lock. All five assets were already bundled and prefetched, so no new catalog/download assets are added. Conservative active RGBA8+mip storage is about 1.67 MiB/view; shadow configuration remains unchanged. See DEVELOPMENT.md for budgets and verification.

## Lighting and atmosphere

Rendering revision daylight-shadow-v1 adds one fixed-direction sun, hemisphere fill and span-scaled linear fog. The Lambert surface extension uses the installed Three.js PCF shadow and fog chunks without changing Core coverage or generation contracts. The orthographic shadow camera encloses the request-based terrain bounds and actual instanced-tree and rock bounds with padding, computed once during setup; it does not track the viewing camera.

Terrain casts/receives shadows (double-sided shadow depth for the open heightfield); existing tree instances cast without self-receiving. One 2048x2048 PCF map per view updates once on scene replacement/recreation. Both renderer and light auto-update are disabled; camera-only renders reuse it. The initial shadow pass has at most nineteen caster calls and the color pass at most nineteen terrain/tree/rock calls. Fog uses the same request-span ratios in both execution modes.

Each preview owns its light/shadow target. Cleanup disposes that target before the renderer; its attached depth texture is owned/released by the installed render-target implementation. Color RGBA8 plus conservatively aligned DEPTH_COMPONENT24 estimate 32 MiB/view, 64 MiB for comparison views, separately from five surface textures and other resources. Setup and the first shadow/color submission are display CPU work, excluded from computeMs/requestMs; no GPU completion is measured. See [LIGHTING_ATMOSPHERE_V1.md](specs/LIGHTING_ATMOSPHERE_V1.md) for frozen settings, ownership and limitations.

## Timing, worker and build identity

One module worker owns one .NET runtime per document. All callers share initialization and the RPC proxy (`worker-rpc-v1`), with correlation IDs and rejection of pending requests on worker failure. A later attempt may initialize again. Worker startup and runtime initialization are separate from `computeMs`; promises alone would not move computation off the UI thread.

Core time includes surface coverage allocation/derivation, composition, simulation allocation and all steps, summaries, conversion, environment/ocean derivation, biome classification and bounded vegetation selection, structure and edge derivation, and bounded rock placement/support/spacing/priority selection. Erosion and its closed boundary rules are unchanged; static ocean colors do not change the transient erosion-water model. Parsing/preparation, JSON, worker messages or HTTP, client normalization, comparison and rendering are excluded. Browser `requestMs` ends after response validation/normalization. `requestMs - computeMs` is combined overhead, not pure network latency. Display CPU setup/first submission is separate and is not GPU completion.

`HostBuildIdentity.targets` generates `coreBuildId` from Git HEAD and modifications to `global.json`, `src/core`, and `src/hosts`. Dirty inputs add `-dirty`; failed Git detection yields `unversioned`. Matching dirty/unversioned IDs do not prove compatibility. An explicit build property may provide a release identity; assembly ModuleVersionId is not used.

## PWA and extension boundary

Angular service worker prefetches the complete versioned application, deferred Three.js and WASM/worker assets. The generated catalog is tied to the cached index and manifest hashes. Readiness verifies one complete matching version cache and a tiny zero-step terrain computation. API results are never cached. Safe updates require reload while idle; readiness is verified again in the new document.

Preserve the selected generator's appearance and equations when adding evolution capture. Capturing snapshots must not change final values, must have bounded memory, and must be measured as a distinct workload. Future climate and hydrology need explicit versions and must not reintroduce automatic filling of every depression. See the [roadmap](IMPLEMENTATION_PLAN.md).

## Source organization

Core keeps its public `WorldGenerator.Core` namespace and the same API/WASM project references. Files are grouped by responsibility:

- `src/core/Contracts`: immutable input/output records and validation error data.
- `src/core/Validation`: canonical limits, validators and opaque prepared requests.
- `src/core/Generation`: pipeline orchestration, terrain composition, lattice noise and unchanged hydraulic arithmetic.
- `src/core/Ecology`: environment derivation, four-connected ocean classification, ordered biome rules and bounded vegetation placement.

Angular keeps only its root shell/configuration at `src/client/src/app`. `platform` contains PWA, WASM runtime and operation locking; `terrain/data` contains models, defaults, wire decoding and equivalence; `terrain/editor` owns forms/panels; `terrain/rendering` owns Three.js; `terrain/testing` holds fixtures. Tests remain beside their corresponding frontend code. `shared/panel.css` contains common panel styles. The contract entry point re-exports separate decoder/comparison modules. PWA readiness reads pure defaults rather than importing editor forms. Wire biome IDs are centralized, with a typed presentation palette; ecological classification stays in Core.

Display CPU measurements are retained for an unchanged result when the other execution mode is updated. Replacing that result invalidates only its own display measurement. The earlier organization pass preserved v2. V3 now adds explicitly versioned climate, region-scale and vegetation rules; frozen v2 sources/fixtures remain in tests/core/Historical/V2, outside the public surface.

## Decorative rocks

Current [rock placement v2](specs/ROCK_PLACEMENT_V2.md) preserves all non-rock
arrays, full trees, surface coverage and hydraulics. Independent world-grid cluster
and hash streams produce sparse isolated stones and loose groups, wide sub-cell
jitter and three size ranges. Occasional boulders reach radius 3; scree stays small.
Radius-aware clearance protects conservative tree crowns and other rocks using
bounded grids and priority/CellIndex ordering. The 8192 cap is a ceiling, not a target.

RockSupport clips the full conservative footprint square against every overlapped
quad, checking rectangle corners, interior grid vertices and diagonal intersections.
Ocean/map-edge overhangs and unsupported ranges are rejected. Embedding is .12*ScaleY
below support minimum; support range must be<=.50*ScaleY. Closed unit-sphere geometry
has a tested central roof>=.70, so center ground intersects the solid with bounded
burial. This is decorative grounding, not rigid-body contact simulation.

The eleven-member wire record and enum meanings remain; scales broaden under result/
workload/profile v11. rock-decoder validates supplied geometry/raw ranges without
reproducing noise or selection. Comparison checks every field. terrain-rocks builds
six shared closed polyhedra under rock-shapes-v2, without per-instance randomness.
All records are rendered: at most six rock draws, nineteen total color/initial caster
calls. Actual large instance bounds feed existing static shadows. Camera, lighting,
textures, pause and independent-view cleanup remain. Historical v1 stays test-only.

## Local geometric relief (Stage 6)

TerrainComposer computes existing regional weights once, then adds bounded local
relief in unwarped world-grid coordinates before the unchanged hydraulic simulation.
Masked plain undulations preserve broad low-slope areas; hills receive secondary
rolling relief and mountain ridge flanks receive shallow bent anisotropic grooves.
Near-bound attenuation prevents additional clamping plateaus. Exact equations,
salts, supported scales, budgets and versions are in [LOCAL_RELIEF_V1.md](specs/LOCAL_RELIEF_V1.md).

No request/schema/rendering changes or full-map temporary buffers are introduced.
All environment, coverage and grounded instances are derived from final eroded
heights through unchanged policies. Their outputs can change. Historical V5
composition/orchestration plus baseline hashes retain the old numerical evidence;
current tests validate the new mathematics and full actual-host equivalence.

## Coastal placement boundary and work

Stage 7 modifies final surface appearance only. RockPlacement continues to consume
base Rock coverage, so beaches do not move rocks or remove trees. Returned instances
may stand near/on sand. Any vegetation exclusion from beaches would be a separate
ecological change. Ocean classification, terrain/local relief, erosion and every
non-coverage result field remain exact for the same inputs.

A bounded four-connected traversal uses one byte[N] distance buffer and one int[N]
queue, 1.25 MiB raw at the maximum map, without public distance data or a second
coverage map. This traversal and final blending belong to Core time in both hosts;
fifth-texture loading, JSON, normalization, comparison and GPU packing remain outside.
Historical V5 ecology is frozen test-only so earlier coverage fixtures keep their
original meaning; current integration hashes check every unchanged numeric field.

## Organizational boundaries after cleanup

Documentation entry points remain at docs/ root; frozen policies live in specs/,
completed prompts in archive/prompts/ and original milestone observations in history/.
The documentation index distinguishes current behavior from historical evidence.

Editor parameter-definitions.ts owns labels/default references, terrain-parameters.ts
owns Angular forms and immutable capture, and parameter-guidance.ts owns pure UI
bounds/balance/work guidance. Components retain interaction and subscription state.
These hints do not replace canonical Core validation or rewrite manual drafts.

terrain-scene.ts owns synchronous terrain/instance/light content and its idempotent
cleanup. TerrainPreview retains renderer/camera/controls, shared texture readiness,
stale-result guards, pause, context loss and display timing. The split does not move
work outside its original measurement boundary or change allocation policies.

Core production folders and namespaces stay unchanged. Active tests are grouped by
Generation/Ecology/Validation, with versioned Historical/ and Fixtures/ retained.
The complete v8 fingerprint manifest includes final coastal weights and all tree/
rock records for 23 pre-refactor requests, independently of timing/build identity.
Browser support/editor.cjs shares small field/wait/artifact actions while scenarios
retain their own numeric, rendering and offline assertions. That organizational
cleanup introduced no experiment runner; subsequent Architecture Race work follows.


## Architecture Race contracts

[Architecture Race v1](specs/ARCHITECTURE_RACE_V1.md) freezes sequential alternating
pairs, one warmup per mode and 10 measured pairs by default (1..30). Step 1 adds
pure readonly contracts and independent, runtime-frozen configuration capture under
`experiments/data`; it does not change adapters, Core, timings or the editor.
Discriminated records distinguish trial success/error, compared/unavailable pairs,
and completed/stopped/failed collection. Existing complete TerrainComparison metrics
are reused, with eligibility and explicit exclusion reasons separate from agreement
and build compatibility. Records retain no full map arrays.

Step 2 implements ExperimentRunner in experiments/: one OperationLock for preparation
through verification, no scene construction during collection, bounded pair retention
and honest startup metadata. The preview observes the lock directly, deferring new
WebGL/asset setup and suppressing resize/draw work until release. Step 3 connects the editor panel; Step 4 adds post-run summaries and export below. The interactive Verify action
remains a single equivalence check, not a repeated measurement campaign.


The runner rejects overlapping or lock-busy starts, captures configuration again at
entry, and exposes readonly progress/result signals. Cooperative stop never cancels
Core or releases the lock before settlement. Observed visibility/navigation/runtime
interruptions, failures and disqualifications remain in frozen small records. The
latest suitable pair can be transferred once for later display; arrays never enter
ExperimentResult. Runtime collection uses existing TerrainService calls and complete
compareTerrains checks. Details and terminal-state precedence are in the v1 spec.


## Architecture Race UI

App projects the experiment panel into the right results sidebar through a focused
content slot, preserving its existing coordination and inputs. Its native details
container and all nested experiment menus start collapsed; the outer container stays
open during collection to keep progress/Stop accessible.

experiments/editor/experiment-panel owns pair-count input and presentation of runner
progress, completed records and diagnostics. It emits Start/Stop actions and never
runs adapters or derives experiment eligibility. App captures the current terrain
forms, creates configuration and invokes ExperimentRunner. Shared OperationLock
continues to disable editor actions, rendering and PWA reload during collection.
Stop is outside the disabled parameter fieldset and uses the runner's additive
readonly stopRequested signal, including navigation-triggered stop requests.

Final preview handoff carries its already-computed PairVerification alongside the
Local/Remote runs, outside exportable records. App transfers it once after settlement,
reuses its comparison metrics and preserves captured request labels. This avoids
re-comparing full arrays and correctly identifies an earlier suitable retained pair
when a later pair failed. Revision/destruction checks discard obsolete handoffs;
prior successful maps survive failed starts or unavailable pairs. Only App-owned
collection is stopped on App destruction; the root service is not disposed by a panel.

Raw durations, failures, exclusion reasons, input snapshots, startup and actual build
IDs appear in expandable details. Completed, eligible and compatible remain distinct
labels. That UI step introduced no statistics or downloads; Step 4 adds them below.
No campaign conclusions are inferred.


## Experiment summaries and downloads

experiments/data/experiment-statistics.ts derives architecture-race-summary-v1 from
one settled ExperimentResult. Diagnostic and verified views use the frozen inclusion
rules; distributions never pool observed build/workload identity tuples. Per-mode,
per-metric counts distinguish successful exclusions, failed trials and missing values;
issues retain affected IDs. Quartiles interpolate at sorted index (n-1)*p. Only small
records are processed, after collection, without new comparisons or Core calls.

experiment-export.ts is a pure serializer. architecture-race-export-v1 wraps the
unchanged architecture-race-v1 record plus specialNumbers path/value entries, preserving
nonfinite numbers and signed zero separately from unavailable nulls. No derived
summaries are embedded. Unsupported values/cycles and arrays outside known record
paths reject rather than silently losing data. CSV keeps the frozen 25-column order,
all attempted calls, exact numeric strings, CRLF and explicit spreadsheet text escaping.
Original text remains authoritative in JSON. See the [v1 specification](specs/ARCHITECTURE_RACE_V1.md).

The panel gates derivation/downloads on collection settlement and renders focused
ExperimentSummaryPanel components in collapsed Diagnostic/Verified sections. The
browser-only experiment-download.ts creates UTF-8 Blobs, removes its temporary anchor
and revokes object URLs after dispatch (immediately on failure). Serialization/download
errors retain the result. No dependency, transport, runner-policy or timing change is
included; statistics and exports do not contain full map history.


## Atlas Studio presentation

The editor uses a warm cartographic UI, independent of terrain materials and Core
workload identities. src/client/src/styles.css owns the small --atlas-* token set:
background/surface/text colors, mode accents, focus/error colors, spacing, radii,
shadows and an inline static contour SVG. No font/image service or new dependency
is used. The SVG compass in App and the contour motif decorate the header and empty
viewport only; generated Three.js terrain, lighting and scientific timings retain
their policies.

shared/panel.css owns common button/disclosure/error/focus states; components retain
compact layout rules. Local and Remote keep explicit labels and aria-pressed states
with green/blue accents. Darker blue is used for white text and small labels; the
original muted blue remains an accent/border role. Contextual --button-* variables
supply variants while common disabled rules remain authoritative. Focus uses an
independent ochre-brown ring. Numeric fields and measurements use tabular numerals.
Experiment controls remain projected into the right sidebar with all sections
initially collapsed and the outer section held open during collection.

All decoration is static. There are no continuous animations, filters, backdrop blur
or new benchmark-time rendering tasks. Native responsive stacking, disclosures,
keyboard controls, operation locking, PWA updates and record/export behavior remain
unchanged. Styles stay within existing component budgets.


## Regional climate and snow

RegionalClimate samples two independent three-octave world-grid fBm fields with
fixed base wavelengths 144/128 cells. Climate has no latitude stripe, no map-extrema
normalization and no dependence on the fine noiseScale or landformRegionScale.
Elevation cools temperature by 0.95 times relative height. Global warmth remains
monotone. SnowCover centralizes categorical highland eligibility and continuous
height/temperature/slope coverage; categories need not equal visible mixtures.
See [the frozen policy](specs/REGIONAL_CLIMATE_V1.md) for exact salts, thresholds
and operation order.

Terrain/hydraulics/ocean/slopes remain bit-exact, while moisture, temperature,
biomes, coverage, density and eligible instances may change. Coastal appearance
consumes the new climate but retains its equations, distances and snow bits.
No schema fields or controls were added. The climate step introduced result v9
semantic identity; its workload/profile v9 must not be pooled with earlier work. Historical v8 ecology,
classifier and coverage live only in tests and retain their complete fingerprints.
Older historical pipelines explicitly use frozen policies rather than current snow.


## Context-sensitive coastal surfaces v2

[Coastal v2](specs/COASTAL_SURFACES_V2.md) supersedes the original coastal pass.
Bounded Manhattan propagation now reaches 16 cells. Existing slope and moisture
control local room: gentle dry full/end distances4/16 and relative elevations
.02/.10, narrowing to1/6 and .005/.03 on steep ground. Wetness further narrows the
zone. The existing climate-dependent target mixture remains unchanged; no extra
noise field or renderer policy is introduced. Ordinary triangle interpolation
remains, so this does not smooth ocean geometry or remove angular water edges.

The same in-place post-placement pass preserves all non-coverage output and Snow
bits. No new buffers beyond the existing byte/int scratch pair, wire fields, assets,
controls or dependencies. The coastal step introduced result/workload/profile v10 to distinguish changed
coverage semantics and traversal work. Old complete fixtures use frozen coastal v1
under Historical/V8; 23 pre-v2 v9 field fingerprints verify preservation, including
full trees and rocks.


## Shared scene environment

[scene-environment-v1](specs/SCENE_ENVIRONMENT_V1.md) centralizes presentation-only
sun, hemisphere fill, linear fog/horizon and explicitly frozen visual time. The
app-scoped SceneEnvironmentService publishes deeply frozen numeric snapshots; no
mutable Three.js object lives in global settings. Hours/azimuth derive a documented
illustrative light cycle; the default exactly retains daylight-shadow-v1. No sun UI,
clock loop, sky/water pass or Core/transport/workload change is introduced.

Each terrainLighting owner creates stable ordinary uniform wrappers, with view-owned
Color/Vector3 values shared with its Three lights/fog. Future custom materials can
bind this same world-space sun and horizon state. Comparison views receive one
immutable snapshot but own independent mutable bindings, scaled fog ranges and
shadow resources. The environment module remains in the deferred preview path.

TerrainPreview observes environment separately from the run: changes update lights
and render on demand, retaining geometry, camera and the original display metric.
OperationLock/paused views defer live changes and apply the latest snapshot on
resume; delayed setup/replacement also reads the latest state. Direction changes
refit cached bounds and dirty shadows; color/fog/time-only changes reuse depth.
Night disables the sun caster and daylight restores it. Existing idempotent scene
cleanup restores prior references, releases shadow targets and leaves other views
intact. Full atmospheric fog/scattering follows separately; Ocean shading is implemented below.


## Ocean presentation

[ocean-presentation-v1](specs/OCEAN_PRESENTATION_V1.md) adds a separate transparent
sea-level surface clipped to authoritative Core Ocean triangles. Renderer clipping
never classifies new water or fills disconnected depressions. Shared settings control
shallow color, turbidity and foam; these are presentation state, not request fields.
Depth comes from existing heights, without a depth/reflection render pass. One local
periodic normal texture supplies two scrolling layers, with Schlick Fresnel, shallow
foam and highlights from the shared sun. Sky reflection currently approximates the
horizon/hemisphere colors; existing distance fog remains.

One app-scoped RAF hub outside Angular draws visible Ocean views at most 30 FPS
with a common phase. OperationLock, document visibility, reduced motion and viewport
visibility gate animation; dry views need no recurring draw. Preview-owned geometry,
material, cached normal texture, observers and callbacks follow replacement/retry/
destruction ownership. Settings updates preserve camera, results and display metrics.

Existing terrain/tree/rock color and caster ceilings remain 19. Water adds one color
draw (20 total), no caster or repeated shadow update, one 128-square normal texture
(about 85.3 KiB with RGBA mipmaps), and at most 32 MiB raw geometry storage per view
on CPU and GPU separately. Five terrain textures and existing shadow targets remain.
The new offline asset brings the complete PWA catalog to 39 entries. Mathematical
identities and Core outputs are unchanged. See the specification for conservative
diagonal clipping and transparency/shadow/reflection limitations.


## Sky and atmosphere

[atmosphere-v1](specs/ATMOSPHERE_V1.md) composes one shared analytical sky-radiance
function with existing Lambert hooks and the Ocean material. The same sun wrappers
feed visible sky, directional fog in-scattering and water reflection. Settings are
immutable shared presentation state: enabled, haze and valleyFog. A collapsed panel
updates both views without Core/transport work or scene/camera replacement.

One view-owned fullscreen triangle (36 raw position bytes) adds at most one color
draw: total ceiling 21, existing caster ceiling 19. It has no depth writes, shadow,
texture, render target or recurring loop. Its camera inverse-projection/world
matrices update before draw. Atmosphere updates do not invalidate static shadows.
Resources are disposed with the scene, including partial setup failures.

Exponential distance and analytically integrated height optical depths add before
attenuation. World-height origin is sea level when water exists; scales derive from
request span. Stable horizontal limits and bounded exponents prevent discontinuity
and overflow. All opaque groups and water share the linear-space implementation,
before tone/output conversion; native linear fog runs only in reference mode.

For above-water cameras, underwater Ocean terrain ends its air ray at sea level.
Bottom and water therefore share the air segment before transparent composition.
Existing output-space blending remains an approximation; there is no refraction,
underwater scattering or linear offscreen compositing pass. Disabled atmosphere
restores the preceding background, native fog and water reflection. Low-poly coast
and conservative diagonal clipping limits remain. The sky is illustrative and has
no clouds, astronomical calibration or infinite ground beyond the finite map.


## Interactive sun controls

[Sun controls v1](specs/SUN_CONTROLS_V1.md) exposes the existing immutable
SceneEnvironmentService snapshot. One collapsed panel edits time 0..24 hours in
quarter-hour steps and azimuth 0..359 in one-degree steps. Reset restores 12/315
while preserving visualTimeSeconds, water and atmosphere. Directions use world
+Z/N and+X/E; this is the existing illustrative cycle, not astronomy.

Angular defer loads controls on first panel opening outside OperationLock. A panel
opened during computation waits until unlock, preserving the initial editor's
lazy Three boundary. There is no extra clock/store/scheduler. Existing preview
afterRenderEffect coalesces synchronous changes and applies latest-only after
unlock. Stable wrappers update lights, sky, fog and water in independent views
without replacing geometry, materials, textures, cameras or first-display metrics.

Active shadow direction changes refit the single fitted 2048 map and invalidate it
for the next permitted render. Inactive night-direction edits update the light
transform without shadow-camera work. Activation changes recover day/night/day;
color/intensity-only edits retain the map unless activation changes. Atmosphere,
water and visual-time edits keep static reuse. Existing targets and draw ceilings
remain. Sun edits never enter mathematical requests, Core or transport execution.


## Night foam and moon

[Night sky and foam v1](specs/NIGHT_SKY_V1.md) corrects the Ocean foam term from
constant emission to illumination-scaled albedo. Linear sky color and fill strength
both matter at night; bounded direct-sun color influence preserves warm daylight.
Reference values come from DAYLIGHT_REFERENCE. Default noon pixels are preserved;
night and atmosphere-off reference views no longer retain an emissive white coast.

The existing shared sky function adds a derivative-softened full-moon disk and a
small halo opposite the sun. One view-owned linear moon-color uniform feeds visible
sky, water reflection and fog in-scattering. The existing sun state controls its
visibility, with no extra clock, orbit, monthly phase, mesh, texture, directional
light or shadow pass. Existing night Hemisphere fill is retained. Sky-facing camera
orientation is needed; the downward map view does not show overhead sky bodies.
No Core result, workload identity or computation timing boundary changes.


## Shadow quality assessment

[Shadow quality v1](specs/SHADOW_QUALITY_V1.md) retains daylight-shadow-v1 unchanged.
A seven-scene/42-view baseline plus 12 closer contact views checks actual GPU shadow
matrices, comparison bias, radius, cameras and complete Core hashes. A test-only
world-bounded bias probe reduced contact separation slightly but introduced broad
self-shadow striping on512-square terrain, so it was rejected before production
changes. Fit padding, near/far policy, bias -.0005, world normalBias .08, PCF/radius 1
and 2048 map size remain. No new target, pass, light, texture or runtime control.

The installed Three 187 PCF path uses radius-scaled Vogel offsets with hardware
linear shadow sampling; PCFSoftShadowMap is removed/redirected in this version.
Expanded conservative-fit tests project the full request box and actual float32
rotated/scaled edge-instance vertices at near-horizontal sun into clip space,
covering minimum, elongated and maximum extents. Actual rendering transforms, not
higher-precision construction matrices, define the instance bounds being tested.

Maximum noon world-texel size is about .366 units in the inspected map: small trunks
can remain subtexel and close-up shadows lose detail. A single global map has this
spatial-resolution limit. CSM/AO need separate evidence and budgets, not an automatic
change in this assessment. Camera, light cycle, moon/foam and workload identities
stay unchanged; next planned visual work is material microdetail.


## Terrain microdetail

[Terrain microdetail v1](specs/TERRAIN_MICRODETAIL_V1.md) adds fragment lighting normals
to the existing coverage/biome Lambert material, before lighting and atmosphere.
Core fields/instances, vertex positions/normals, shadow queries and water are unchanged.
One additional world-position varying replaces no map buffer and adds no attribute.
Signed right-handed triplanar frames convert tangent slopes into world gradients;
coverage-weighted gradients are projected onto the base normal's tangent plane.
Neutral normals preserve the base, and perturbations fade to zero at distance.

An original periodic 128x640 RGB8 PNG is decoded once to 320 KiB RGBA and uploaded as
one five-layer 128-square DataArrayTexture. Array repeat/mip filtering is per layer,
so atlas materials cannot leak across mip boundaries. Normal data uses NoColorSpace,
linear/trilinear filtering and 8 mip levels. One sampler and 201699 encoded bytes add
436900 GPU bytes/view (873800 for two), plus fixed decode/CPU storage. The terrain
program now has 7 samplers including shadow, below WebGL2's minimum 16; attributes
stay 5. Worst-case additional lookups 15 (three axes x five active channels), skipped
when fully faded or on Ocean. Existing scalar detail/color equations stay unchanged.

Normal period 2.4 world units complements scalar period 4; multiscale structure is
baked offline rather than another runtime sample octave. Strength .24 fades over
24..72 world units. Explicit derivatives/textureGrad keep mip choice stable through
coverage branches. This improves surface lighting, not silhouettes or shadow-map
resolution. No new UI, animation, draw/pass/target/dependency or workload identity.

A per-preview cached owner supports validated decode, late release, failure/retry
and reuse across scenes/light edits. Setup defers under OperationLock, load/decode
wait enters textureWaitMs, and upload/setup remain display work outside computeMs/
requestMs. PWA catalog now includes 41 required assets. Existing five scalar maps,
water normal and 2048 shadow attachments remain; color/caster ceilings 21/19 remain.


## Decorative 3D grass

[Grass presentation v1](specs/GRASS_PRESENTATION_V1.md) derives bounded tuft instances
from existing Core Grass coverage, biome IDs, slope and terrain triangles. It does
not reuse Core tree density or recreate ecological fields. The generation contract
and numerical comparisons remain unchanged; the tree-density hint now makes its
scope explicit. Both views produce identical independent transforms/colors.

A capped stratified candidate grid (<=131072) uses seeded integer hashes, conservative
coverage/slope eligibility and exact triangle grounding. Two bounded 2-unit center
grids exclude tree trunks/rocks; per-candidate obstacle work is limited 64 checks,
with conservative rejection in crowded queries. Lowest-hash priority selection
retains at most 32768 tufts without a first-N spatial bias. No per-candidate objects
or full-map field copies. Candidate IDs are sorted and positions regenerated after
selection; geometry alignment is capped 15 degrees with.01 root embedding.

One instanced three-blade geometry/material supplies15 vertices/9 triangles per
tuft, deterministic size/yaw/biome-palette tint and vertex root/tip modulation.
Opaque4x4 Bayer distance cutout fades over 20..55 world units; fully faded vertices
clip out, but vertex processing/draw cost remains. No wind or recurring loop.
Grass receives the existing shadow and shared atmosphere, casts none, and does
not enter shadow fitting. Instanced buffers/matrices/material/geometry are owned
by scene content and disposed on failure/replacement/destruction; environment edits
reuse them. Setup/submission defers under OperationLock and remains display work.

One extra color call raises the structural ceiling to 22; caster ceiling stays 19.
No texture/sampler/target or dependency is added. Maximum matrices 2 MiB and colors
384KiB per view, plus 594-byte shared geometry; bounded placement scratch<1MiB.
Raw typed storage about3.22MiB; CPU preparation budget 8 MiB excludes engine internals.
GPU occupied attribute locations8 (nine-slot index span observed), below minimum16.
Existing41-asset PWA catalog remains complete with changed JS. Thin distant trunks,
low-poly terrain and dither/rigid-grass limitations remain separately scoped.

## Individual foliage colors

[Foliage variation v1](specs/FOLIAGE_VARIATION_V1.md) adds restrained per-tree
brightness, warmth and saturation to the existing species/variant crown palette.
`terrainForest(result, seed)` uses Core cellIndex/kind/variant and the captured
request seed, independent of array ordering, camera and time. It changes presentation
only; ecological classification, placement and all Core records remain authoritative.

Palette integers enter linear working space once per occupied group. Absolute linear
RGB goes into crown instanceColor with a white Lambert material, so the palette is
applied exactly once. Trunks retain their material and have no instanceColor. Each
view owns its buffers; ordinary InstancedMesh disposal and setup rollback release
them. Geometry, grouping, matrices, shadow participation and material/draw counts
remain unchanged. Each crown program adds one occupied attribute location; storage
is 12 bytes/tree, at most 196608 bytes/view or 393216 bytes for comparison views.
Preparation/upload are display work outside computeMs/requestMs and retain the
existing OperationLock setup boundary. No new texture, dependency, UI or animation.
Tree LOD remains a separate next stage.
