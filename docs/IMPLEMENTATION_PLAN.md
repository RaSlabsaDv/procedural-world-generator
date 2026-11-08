# Implementation plan

## Current foundation

The supported product is **Rich terrain + hydraulic erosion** with a Three.js preview. Local C# WebAssembly runs in a dedicated worker; Remote runs the same C# library through ASP.NET Core. Controls, strict validation, full-array equivalence checks, separate timings, transactional WASM publishing and production PWA/offline behavior are implemented.

Baseline/probe interfaces, the experimental regional generator, and all 2D views have been removed. Their browser scripts and feature-specific tests are removed with them. Noise, height contracts and validation remain as dependencies of the supported terrain generator. README stays empty; documentation stays in English.

## Terrain editor: implemented

The editor provides a large central Three.js viewport, grouped parameter sidebar, measurements sidebar and compact PWA header. Numeric/slider controls share values; Random seed and Reset affect drafts only. One result is shown by default, with explicit Local/Remote selection and comparison views. Captured labels distinguish previous results from draft edits. Generation/errors retain prior terrain; stale or destroyed-component responses are discarded without releasing the lock before real completion.

Same-scale preview updates preserve the camera and Reset camera restores default framing. Details expose captured parameters, versions, simulation totals and separate initialization/display timing. Full-result comparisons, worker ownership and safe PWA updates remain supported; generation now uses the v8 result contract below. Tests cover editor state transitions, camera lifecycle and responsive/offline browser behavior.

No new dependencies, presets, brushes, 2D views, simulation history or placeholder timeline controls were added. Bounded capture is a later extension; its player will occupy a bottom timeline after real frame data exists.

## Diverse terrain and vegetation

Current generation uses diverse-landscape-v7 with landscape-ecology-v8 results: regional plains/hills/mountain composition with bounded local relief, explicit boundary-connected ocean and coastal surface blending, environment-based biomes, density and capped deterministic trees. Both hosts share Core. Up to twelve vegetation meshes render every returned tree across three kinds and two variants; six further rock meshes render up to 8192 Core-placed boulders, outcrops and scree. Hydraulic-grid-v1 arithmetic and closed boundaries are unchanged. Historical v1/v2 fixtures remain test-only evidence, not another public mode. See [LANDSCAPE_V3.md](specs/LANDSCAPE_V3.md) for exact rules and limits.

## Organization and polishing: complete

Core is split into Contracts, Validation, Generation and Ecology, with separate composition, sea, biome and vegetation responsibilities. Angular separates platform, terrain data/editor/rendering and shared styles. Pure defaults no longer couple PWA readiness to Angular forms. Wire biome IDs and their palette are explicit and centralized. Decoder and comparison implementations are separate behind the contract entry point. A stale display-timing reset was corrected; updating one mode preserves the other mode's measurement.

Unused Angular routing and the duplicate hydraulic browser script were removed. The landscape, editor and PWA browser scenarios share setup/readiness helpers. That cleanup preserved v2 mathematics, contracts, limits, workload identities and fixtures. The separately versioned v3 feature now builds on it.

## Climate and vegetation diversity: implemented

V3 specifies required globalWarmth, vegetationDensity and landformRegionScale controls; broadleaf/conifer forests, sparse savanna, tundra and static highland snow; and Core-owned tree kinds. Strict host/client contracts reject missing fields and invalid categories. Density does not change biome coverage, and the existing hydraulic kernel, ocean connectivity and resource caps are preserved. See [LANDSCAPE_V3.md](specs/LANDSCAPE_V3.md) for precedence, arithmetic and timing. Historical v2 sources and fixtures remain test-only. Production browser evidence covers category/field parity, heavy limits and offline operation.

## Landscape detail — Stages 1–7 implemented

Implement the following stages incrementally in the existing editor. Stages 1–3 form the first delivery: surface materials, natural transitions and lighting. Stages 4–7 add vegetation, rocks, geometric relief and coasts. All seven stages are implemented and verified.

Before each stage, capture representative normal/cold/warm views with fixed requests and camera framing. Define its resource limits and acceptance checks before implementation. Preserve the historical v3 specification and fixtures when introducing a new semantic contract. Keep README empty and documentation in English.

### 1. Surface materials — complete

Implementation instructions: [SURFACE_MATERIALS_PROMPT.md](archive/prompts/SURFACE_MATERIALS_PROMPT.md).

Add reusable grass, soil, sand, rock and snow textures, with consistent world-space tiling across seeds, map sizes and both execution modes. Use small, locally bundled assets with documented provenance/licenses. Choose an approach compatible with the current Three.js terrain material before adding dependencies. Keep heights and Core biome IDs unchanged in this stage; sand becomes a visible coastal surface once stage 7 supplies coastal data.

Acceptance: textures resolve at overview and close-up distances without per-map stretching, work after an offline reload, and share resources within a viewport. Record texture/download/GPU resource budgets; release owned resources on replacement and destruction. Visualization costs remain outside Core time.

Implemented with four active original 256x256 detail textures and reserved sand, fixed four-unit triplanar sampling, existing biome tint, one terrain draw call and no Core/contract changes. Preview ownership covers async failure/retry, stale completion, pause and destruction; all five assets participate in complete-version offline verification. Actual encoded assets total 271377 bytes; estimated active RGBA+mip storage is about 1.33 MiB per viewport. See DEVELOPMENT.md for ownership and measurement boundaries.

Verification: 119 Angular tests, 115 Core and 37 API tests, four Python packaging/asset tests, worker RPC test, Release/production builds, and materials/landscape/editor/PWA Chromium scenarios pass. The landscape matrix has zero observed Local/Remote numeric error through 512x512x128. Materials evidence covers before/after rectangular normal/cold/warm previews, real shader compilation, four detail GPU textures per viewport, one terrain draw call, independent comparison-view cleanup, 16384 trees and offline generation. Raw evidence/screenshots live under ignored artifacts/. This is the historical Stage 1 verification baseline; Stage 2 completion is recorded below.

### 2. Smooth surface transitions — complete

Implementation instructions: [SURFACE_TRANSITIONS_PROMPT.md](archive/prompts/SURFACE_TRANSITIONS_PROMPT.md).

Specify normalized surface coverage weights in Core for grass, exposed soil, sand, rock and snow. Derive them from the authoritative terrain/environment data with documented thresholds and operation order. Retain categorical biome IDs for ecological decisions; visual blending must not silently change biome classification or tree eligibility. Preserve heights and hydraulic results.

Version the result/workload and, if generation semantics change, the algorithm before extending both hosts, strict TypeScript decoding and full-result comparisons together. Three.js interpolates and blends supplied weights; it does not reproduce the ecological rules. Define bounded fields/encoding before allocating additional full-map arrays; unused sand coverage remains zero until coastal classification exists.

Acceptance: supplied weights are finite, bounded and normalized; categorical rules still hold. Verify complete Local/Remote weight parity and smooth transitions on forest edges, rock slopes and snow boundaries. Record added memory, JSON bytes and Core work.

Implemented coverage v1 with a required five-channel float32 result array, strict host/client contracts and complete coverage comparisons. Core derives appearance without changing the frozen v3 heights, environment, biomes, trees or hydraulic summaries. Lambert rendering blends base colors and texture detail from supplied weights. Result/workload/profile are v4; algorithm remains diverse-landscape-v3. The old categorical vertex-color/one-hot buffers are replaced by four float channels at the same combined byte count. See [SURFACE_TRANSITIONS_V1.md](specs/SURFACE_TRANSITIONS_V1.md).

Verification: 139 Angular tests, 127 Core tests, 37 API tests, four Python packaging/asset tests and worker RPC pass. Release/production builds and materials/landscape/editor/PWA browser checks pass. All six WASM/API cases, through 512x512x128, have zero observed numeric error. Maximum response in this smoke run is 17356255 bytes, including 2621441 wire bytes for coverage; the field itself is 5 MiB and its GPU attribute 4 MiB. Texture/draw-call limits and offline updates remain verified. See development/specification evidence for memory caveats. This is the historical Stage 2 baseline; Stage 3 completion is recorded below. No hydrology changes are included.

### 3. Lighting, shadows and atmosphere — complete

Implementation instructions: [LIGHTING_ATMOSPHERE_PROMPT.md](archive/prompts/LIGHTING_ATMOSPHERE_PROMPT.md).

Improve terrain shading, add bounded directional shadows from terrain and trees, and use subtle atmospheric fog for depth. Keep a fixed reproducible lighting setup and the same settings for Local/Remote views. Start with the existing Three.js capabilities. Atmosphere changes presentation only; it does not alter climate or introduce a day/night simulation.

Acceptance: terrain shape and tree silhouettes remain readable at overview and close range, without excessive shadow artifacts or obscuring the biome palette. Define shadow resolution, distance and rendering budgets for one/two views. Preserve camera behavior, offline rendering, pause during computation and complete resource disposal. Report scene setup separately from ongoing rendering; CPU submission is not GPU completion.

Implemented daylight-shadow-v1 with a fixed sun, hemisphere fill and span-scaled linear fog. Each preview has a static 2048x2048 PCF shadow target, fitted once to the request extent and actual tree bounds. Terrain casts/receives; existing instanced trees cast. One initial shadow pass is reused during camera movement. Idempotent ownership releases color/depth attachments on replacement, failure and view destruction. Core/transport/surface contracts and mathematical results remain unchanged. See [LIGHTING_ATMOSPHERE_V1.md](specs/LIGHTING_ATMOSPHERE_V1.md).

Verification: 147 Angular tests, 127 Core tests and 37 API tests, four Python packaging/asset tests and worker RPC pass. Production/Release builds and lighting/materials/landscape/editor/PWA Chromium scenarios pass. Shadow attachments are RGBA8 plus DEPTH_COMPONENT24, estimated 32 MiB/view and 64 MiB for comparison views; actual allocation dimensions/formats and cleanup are checked. Color and initial shadow passes each have at most seven calls. Real orbit/reset reuse, paused worker computation, minimum zero-height ocean, 512x512/16384 instances and offline version updates are covered. Full WASM/API parity remains zero-error in the six-case matrix. This is the historical Stage 3 verification baseline; Stage 4 completion is recorded below.

### 4. Forest structure and tree variation — complete

Extend deterministic Core placement with groves, clearings and spatial density variation within suitable biomes. Add bounded tree appearance variants for young/tall trees, crown shapes and shades within the existing broadleaf/conifer/savanna categories. Define variants as illustrative size/appearance, not a simulated biological age. Keep category, suitability, positions and seeded variation authoritative in Core; the renderer maps returned variant data to shared geometry/materials.

Specify/version the changed placement contract before implementation. Preserve the 16384 total tree cap unless separately justified. Define a bounded variant count and mesh/draw-call budget before expanding beyond the current maximum of six vegetation meshes. Preserve density-zero behavior and document/test how clustering interacts with monotonic density and priority capping.

Acceptance: fixed seeds reproduce groves and clearings; unsuitable cells remain empty; all returned placements/variants match across hosts. Render every returned instance without per-tree components/materials, with stable retained transforms and bounded resources.

Implemented vegetation structure v1 in Core: independent grove/clearing masks, four-connected same-kind edge attenuation and two deterministic appearance variants per kind. The density multiplier is last; candidate sets are monotonic before the fixed 16384 cap and retained transforms/variants stay stable. Tree records require numeric variant. The renderer creates only nonempty kind/variant groups, at most twelve vegetation meshes, with current daylight/shadow ownership and actual geometry bounds. Algorithm is diverse-landscape-v4; result/workload/profile are v5. See [VEGETATION_STRUCTURE_V1.md](specs/VEGETATION_STRUCTURE_V1.md).

Verification: 156 Angular tests, 137 Core tests and 38 API tests pass, including historical v3/v4 field/vegetation fingerprints, independent structure/variant literals, exact retained placement transforms, monotonicity/capping, two-buffer allocation bounds and strict eight-member tree decoding. Release/production builds, four Python packaging/asset tests, worker RPC and all five browser entry points pass. Seven WASM/API cases have zero observed numeric error and include all six kind/variant pairs. The 512x512x128 case returns 16384 trees (6439 Small, 9945 Mature in that run), response 17526721 UTF-8 bytes, reserved WASM memory 151977984 bytes across the sequence (not live memory). The mixed scene observes thirteen color/caster calls; maximum instance matrices use 2 MiB. Four surface textures and the 32 MiB/view shadow attachment estimate stay unchanged. This is the historical Stage 4 baseline; Stage 5 completion is recorded below.

### 5. Rocks, boulders and scree — complete

Add Core-owned deterministic placement of isolated boulders, rocky outcrops and scree near suitable steep slopes. Specify slope/biome suitability, distribution, terrain-triangle grounding, instance transforms and bounded appearance variants. Avoid placing decorative stones in ocean or overlapping trees unconditionally; define any spacing/exclusion rule explicitly.

Use a separately capped rock instance collection, shared geometry/materials and instanced rendering. Freeze its output schema/version and both host/client contracts together. Decorative rocks do not alter the terrain or hydraulic solver.

Acceptance: positions are reproducible and grounded on the displayed terrain, Local/Remote instances agree, and empty/maximum cases respect instance, memory and draw-call budgets. Verify replacement, failure cleanup and offline presentation.

Implemented rock-placement-v1 after unchanged tree generation: independent clustering and hash streams, exact triangle support extrema/embedding, conservative trunk clearance, priority-ordered spacing using bounded cell grids and a separate 8192 total cap. Required eleven-member rock records have three kinds and two variants, numeric IDs and complete transforms. Both hosts and strict client decoding/comparison use algorithm diverse-landscape-v5 and result/workload/profile v6. The renderer uses up to six instanced rock meshes, includes their actual bounds in static shadow fitting, and owns cleanup with the scene. See [ROCK_PLACEMENT_V1.md](specs/ROCK_PLACEMENT_V1.md).

Verification: 155 Core, 38 API and 161 Angular tests pass; Release/production builds, four Python packaging/asset tests, worker RPC and all five browser entry points pass. Complete Stage 4 fields/trees remain bit-exact across six captured requests, including erosion, extreme seeds and tree-cap output. Independent Python transform/cluster literals and complete flat-placement indices agree. A maximum flat placement allocates 17309912 bytes including returned records, below the 32 MiB scratch budget. All seven actual WASM/API cases have zero observed numeric error, including every rock transform and all six kind/variant pairs. The maximum 512x512x128 case returns 16384 trees and 8192 rocks, 19024626 UTF-8 response bytes and 183959552 reserved WASM bytes across the matrix (not live managed memory). The mixed scene has exactly nineteen main/initial caster calls; real GPU instance counts include every returned tree part and rock, including 40960 instances at both caps. Rock matrix storage is 512 KiB/view. Four surface textures and 32 MiB/view shadow attachments remain unchanged. Before/after/detail views, replacement/failure cleanup, static reuse, paused computation, narrow layout, offline reload/new tab, Remote recovery and safe updates are verified. Raw ignored evidence is in landscape-verification.json, rocks-materials-verification.json and rocks-before/after-* images. This is the historical Stage 5 verification baseline; Stage 6 completion follows.

### 6. Local geometric relief — complete

Add biome/landform-sensitive small hills, subtle plain irregularities and slope grooves while preserving broad flat regions. First specify grid spacing, intended feature size and the resolution required to represent it; a 128x128 grid cannot represent arbitrarily fine geometry. Assess the current 512x512 and cell-iteration caps before proposing higher resolution. Keep visual normal/bump detail distinct from actual height changes.

Specify a new algorithm version for mathematical height changes, with deterministic seeds, amplitude bounds, operation order and an explicit position in the composition/erosion pipeline. Derive slopes, ecology and grounded instances from the final authoritative heights. Do not perturb the mesh independently in TypeScript. Retain the existing hydraulic kernel unless separately specified.

Acceptance: plains remain usable flat areas, fine relief does not introduce uniform mountain noise, heights stay finite/bounded, and complete Local/Remote output agrees. Test small/large grids, zero height and erosion extremes; measure real additional Core work and resource use.

Implemented local-relief-v1 before erosion: world-grid masked plain undulations, secondary hills and shallow bent grooves on mountain ridge flanks, blended with existing regional weights. New detail has lattice spacings of at least eight grid units, bounded normalized amplitude and attenuation near height bounds to avoid introducing clamp plateaus. No added controls, map buffers, dependencies or renderer changes. Ecology, surface, tree, rock and hydraulic policies remain unchanged but derive new outputs from final heights. Algorithm is diverse-landscape-v6; result/workload/profile are v7 with the same schema. See [LOCAL_RELIEF_V1.md](specs/LOCAL_RELIEF_V1.md).

Verification: 174 Core, 38 API and 161 Angular tests pass; locked restore, zero-warning/error Release build, production publication, four Python packaging/asset tests, worker RPC and all six browser scenarios pass. Eighteen pre-relief requests retain exact historical fingerprints through frozen V5 composition/orchestration. Independent scalar/full-map literals, allocation-free sampling, bounded/continuous detail, no new clamp plateaus, zero/minimum/rectangular/maximum maps, erosion conservation and final grounding pass. Across eight default-height pure-plain requests, low-slope coverage and its largest connected area remain 95.68–100%, exceeding the frozen 85%/60% criteria. Seven actual WASM/API cases have max observed error zero for all fields/instances. The maximum 512x512x128 case retains 16384 trees and 8192 rocks, with 19022998 UTF-8 response bytes and 184680448 reserved WASM bytes across the sequence (not live memory). The mixed scene retains nineteen main/initial shadow calls. Added work is at most eight noise evaluations/32 lattice hashes per sample, with zero added map scratch arrays. Before/after views cover normal/cold/warm/conifer/mixed scenes plus pure/eroded plains and mountains. Static reuse, pause, replacement/error cleanup, narrow/offline operation, offline new tabs, Remote recovery and safe updates pass. See ignored landscape-verification.json, relief-materials-verification.json, relief-before/after-verification.json and relief-before/after-* images. This is the historical Stage 6 verification baseline; Stage 7 completion follows.

### 7. Coastal detail — complete

Add sandy, grassy and rocky coastal surfaces using Core-derived shoreline proximity, relative elevation and slope. Base coastline detection on the existing boundary-connected ocean mask, including its equality rule. Define coastal distance in documented grid/world units and blend it into the stage 2 surface weights. Version changed outputs and any settings explicitly.

Preserve dry inland depressions and the current sea level semantics. Shore classification changes surface appearance; it does not fill valleys, raise terrain, simulate tides or add a flat water overlay.

Acceptance: contrasting coast types follow the documented rules, inland low areas do not become beaches solely because they lie below sea level, and edge/zero-height/no-ocean cases are deterministic. Verify complete host parity, offline rendering and bounded additional work.

Implemented coastal-surfaces-v1 with bounded four-connected inland distance from the authoritative ocean mask, smooth relative-elevation/distance influence and climate/slope target blending. Dry below/equal-sea interior land is excluded. Original snow bits and coverage outside influence remain exact. Coastal appearance is applied after placement, so rocks retain their original base-coverage suitability and no tree/rock moves or disappears. Required five-channel coverage and all request/schema fields stay unchanged. Sand is active in the shader via one scalar attribute alongside the existing vec4, with five local textures and unchanged world-space tiling. Algorithm is diverse-landscape-v7; result/workload/profile are v8. See [COASTAL_SURFACES_V1.md](specs/COASTAL_SURFACES_V1.md).

Verification: 181 Core, 39 API and 164 Angular tests pass, together with locked restore, zero-warning/error Release build, production publication, four Python packaging/asset tests, worker RPC and all seven browser scenarios. Current generation matches every pre-coastal non-coverage numeric hash across 23 requests, including full trees/rocks and hydraulic summaries. Independent distance/blend literals, bounded traversal, exact outside/snow preservation, equality/diagonal/no/all-ocean cases and dry-depression protection pass. Maximum native distance+queue allocation is 1310768 bytes. Seven actual WASM/API cases have zero observed error across all fields/records. Maximum 512x512x128 retains 16384 trees and 8192 rocks; response 19022993 UTF-8 bytes, coverage field 2621441 wire bytes, reserved WASM memory 182910976 across the sequence (not live memory). Coverage GPU attributes are 5 MiB/view, 1 MiB more; five active texture estimates total 1747627 bytes/view, encoded asset bytes/catalog entries remain 271377/38. The mixed scene stays at 19 main/initial caster calls; all returned instances render. Coastal views show 599 sandy samples on the gentle shore, 144/41 steep shoreline samples in warm/cold scenes and 94 protected dry interior samples with zero sand in warm/inland cases. The pure mountain case has no ocean and is explicitly labelled mountain-no-ocean. Static reuse, pause, ownership/retry including sand, narrow/offline operation, offline new tabs, Remote recovery and safe updates pass. Raw ignored evidence includes coasts-before/after-verification.json, coasts-materials-verification.json and coastal images. All seven landscape-detail stages are complete; bounded evolution capture/playback and Architecture Race remain separate future tasks.

### Completion gate for each stage

Run checks appropriate to the affected layers: Core determinism/fixtures, host validation and serialization parity, strict frontend contracts, rendering lifecycle and production browser checks. Preserve identical immutable requests across execution modes and keep compute, initialization, transport/decoding, comparison and rendering timings separate. Include new Core-owned fields/instances in full-result comparisons. Browser evidence should retain exact requests and representative screenshots; smoke timings are not a controlled benchmark campaign.

Update the current specification, development instructions and stage status only after verification. Do not introduce placeholder controls for later stages or implement several mathematical extensions in one unreviewable change.

## Later: evolution of the selected terrain

1. Specify bounded snapshot capture for the existing hydraulic model: initial state, interval frames, final state, no duplicate final frame, and overflow-safe storage budgets.
2. Add opt-in capture without changing generation arithmetic or final output. Preserve the current generation workload; give capture a separate version/workload and include copying in its Core time.
3. Extend shared host contracts and both execution paths together. Verify exact final identity with capture disabled and Local/Remote equivalence of every frame.
4. Add Three.js playback: play/pause, scrub, reset, speed and iteration labels. Reuse geometry and preserve camera; pause during measured work and dispose resources.
5. Verify memory bounds, zero steps, error handling, replacement and offline playback. Keep model iterations distinct from real-world days or years.

This extension is planned and is not part of the cleanup implementation.

## Later: improve the world model incrementally

Preserve the preferred terrain appearance. Develop diagnostic layers for slope/erosion and refine the illustrative environmental fields as separately versioned work. Add visible rivers/lakes only with an explicit water model and tests for supply, drainage and evaporation. A depression's spill level is a routing limit, not evidence that the depression is full of water. No new regional mode or 2D view is planned.

## Architecture Race and research campaign

Protocol/contracts, sequential collection, editor UI, statistics and JSON/CSV export are implemented in Steps 1–4 below. A controlled research campaign remains next. Use the current `landscape-ecology-hydraulic-v8` and `landscape-worker-json-v8` as the primary generation workload; evaluate any future capture workload separately. Follow [BENCHMARKING.md](BENCHMARKING.md).

Run a controlled size/iteration/seed matrix under documented network profiles. Keep compute, initialization, request overhead and rendering separate. Report failures and environment limits; browser smoke checks are correctness evidence, not a performance campaign.

## Organizational cleanup before Architecture Race — complete

Preserve the compact parameter editor and all v8 workload behavior while separating
pure parameter definitions/guidance from form state and synchronous scene-content
ownership from preview lifecycle. Move specifications, historical development notes
and completed prompts into their respective documentation folders, with INDEX.md
as the navigation entry. Group active Core tests without changing namespaces,
preserve historical sources/fixtures and add complete current-result fingerprints.
Keep seven distinct browser scenarios with focused shared editor helpers. No
mathematical, transport, resource-limit or timing-boundary change is included.

Architecture Race protocol/result contracts were the next feature task after this
cleanup; Step 1 completion is recorded below. Evolution capture/playback remains later work.

Verification: 182 Core and 39 API tests, 170 Angular tests, five Python packaging/link/
asset checks and worker RPC pass. Release build has zero warnings/errors;
production publication and all seven real browser scenarios pass. Complete current
v8 maps/summaries match pre-refactor SHA256 fingerprints across 23 requests, including
final coastal coverage and full instances. Compact parameter HTML/CSS was preserved
byte-for-byte from the existing uncommitted UI baseline. Scene timing/resource
boundaries, five textures, static shadows, instance/draw budgets and PWA behavior
remain unchanged. See [refactor verification](history/REFACTOR_VERIFICATION.md).


## Architecture Race — Step 1 complete

Frozen [Architecture Race v1](specs/ARCHITECTURE_RACE_V1.md): one immutable request,
one warmup per mode, default 10 measured pairs (1..30), alternating sequential order,
actual order retention, separate startup and existing adapter timing boundaries.
Readonly discriminated contracts cover metadata, trials, pair verification and final
status/eligibility with explicit reasons, without full terrain arrays. Pure capture
copies/freezes both request levels and validates only the pair-count configuration.
Current workload identities, Core mathematics, host contracts and UI remain unchanged.

Step 2 scope: sequential runner, OperationLock lifecycle, preparation, warmup, paired
calls, full verification, cooperative stop, bounded retention and interruption records.
Step 2 completion follows below. Statistics/export policy remains specified only;
no controlled campaign has been conducted.

Verification: all 185 Angular tests pass, including 15 new configuration tests;
Angular production compilation and the documentation-link check pass. No Core,
host, adapter or rendering source changed, so this step does not establish new
browser parity or controlled performance results. README.md remains empty.


## Architecture Race — Step 2 complete

Implemented ExperimentRunner as a service using unchanged TerrainService adapters:
one warmup per mode, alternating sequential measured calls, full pair verification,
raw duration/identity records and explicit eligibility/exclusion reasons. It captures
an independent configuration at entry and holds one shared OperationLock across
preparation through final settlement/verification. Overlapping or busy starts reject.
Cooperative stop finishes an active call without fabricated counterparts or cancellation
claims. Failed warmup, measured errors, correctness/build changes, inconsistent timings
and observed visibility/navigation/runtime interruptions follow the frozen v1 policy.

Readonly progress/result signals and one-time final preview-pair handoff prepare for
future UI. Records contain no full map arrays. New starts/disposal release retained
maps; listeners are removed on completion/disposal. The preview observes the lock
directly, defers WebGL/assets/scene setup and suppresses resize/render work while held.
Existing editor controls and generation mathematics remain unchanged.

Verification: 228 Angular tests pass (42 runner scenarios plus one lock/preview test
added to the prior 185), production Angular compilation/finalization and API/WASM
publication pass, as does the documentation-link check. Real Chromium materials,
lighting and PWA scenarios pass with no page errors, including static shadow reuse,
paused rendering, maximum instance rendering, offline reload/new tab, Remote failure/
recovery and update deferral. The known optional WASM optimization warning remains.
Core/host source was unchanged; native test suites were not rerun. Controlled-promise
runner tests and browser regression checks are not a performance campaign.

Step 3 scope: experiment UI for configuration, start/progress/stop, final statuses,
validation/availability errors, exclusions and post-run pair visualization. Completion
is recorded below. Step 2 itself introduced no App action, statistics or downloads.


## Architecture Race — Step 3 complete

Added a compact Architecture Race panel above the parameter groups. It validates
integer measured-pair count (default 10, range 1..30), exposes Start and cooperative
Stop, and presents preparation/warmup/measured progress with actual mode/order and
separate settled counts. Shared operation locking disables conflicting actions while
Stop remains available for the owned series. Detailed raw trials, pair verification,
exclusion reasons, structured failures, captured inputs and startup/environment/build
metadata are expandable; raw tables scroll within the panel on narrow screens.

App captures forms once and delegates to ExperimentRunner. Completed collection,
eligibility, correctness and build compatibility stay distinct; dirty/unversioned
builds remain diagnostic. Missing durations are labelled and zero remains zero.
Canonical validation fields return to the editor. No intermediate map replaces the
prior view; one final suitable pair is taken after settlement with its exact stored
verification. No extra generation/comparison occurs. Obsolete completions and App
destruction discard the handoff; destroying App stops its owned series without
disposing the root runner. Runner additions are readonly stopRequested and the
verification reference in the internal preview handoff, with no protocol policy or
export schema change. Core, hosts, adapters and mathematical identities are unchanged.

Verification: all 249 Angular tests pass, including 21 new panel/App tests and
additional runner assertions. Production publication/finalization and documentation
links pass. Real Chromium editor, lighting, Race and PWA scenarios pass with no page
errors: actual warmup plus two alternating measured pairs, matching build IDs and
complete comparisons, paused scene submissions, retained prior map, deterministic
Stop during a test-proxy-gated POST, narrow layout, offline reload/new tabs and safe
update behavior. The test-only proxy is needed for SW-owned fetches and its timings
are not campaign results. Existing optional WASM optimization warning remains.
Core/host sources did not change; native test suites were not rerun. README is empty.

Step 4 scope: documented per-mode summaries and versioned JSON/CSV export, excluding
warmups, separating diagnostic/verified eligibility and preserving failed/incomplete
records with reasons. Completion follows below. Step 3 itself introduced no statistics,
charts, downloads or controlled campaign results.


## Architecture Race — Step 4 complete

Implemented pure architecture-race-summary-v1 derivation with per-mode/per-metric
counts and distributions partitioned by actual complete build/workload identity.
Warmups never enter measured summaries. Diagnostic successful finite nonnegative
values remain usable even when an experiment is excluded, with issues and affected
trial IDs retained. Verified statistics require a completed eligible experiment and
eligible compared measured-pair references. Failed trials, unavailable nulls and
successful exclusions have explicit documented count semantics. Quartiles interpolate
at sorted index (n-1)*p; extrema/outliers remain, and source records are unchanged.

Added architecture-race-export-v1 JSON wrapping the unchanged architecture-race-v1
record plus explicit escaped-path specialNumbers for NaN, infinities and signed zero.
The complete record and sidecar are authoritative; derived summaries and maps are not
embedded. CSV keeps the frozen 25 columns, every attempted call including warmups/
errors, raw numeric strings, null/zero distinction, CRLF, quote/multiline escaping
and spreadsheet formula mitigation for text. JSON retains original text. Unexpected
values/cycles/array payloads fail explicitly. Failed/stopped records remain exportable.

The compact panel adds collapsible Diagnostic/Verified summaries and JSON/CSV download
actions after collection. No derivation/download occurs during collection. Browser
side effects are isolated in a small helper with temporary anchor removal and object
URL revocation; failures preserve records for retry. Core, hosts, adapters, runner
policy and timing boundaries remain unchanged. No dependencies were added.

Verification: 297 Angular tests pass (48 added), production publication/finalization
and documentation links pass. Real Chromium Race checks validate distributions and
sample counts, download/parse completed and stopped JSON/CSV, match raw references/
identities/order, preserve warmups and verify no extra generation calls. Editor,
lighting and PWA regressions also pass with no page errors, including narrow layout,
paused scenes, offline new tabs and safe updates. Test proxy timings remain smoke
evidence only. The serving API was restarted against the matching publication to
avoid stale in-memory build identity. The known optional WASM optimization warning
remains; native test suites were not rerun because their sources were unchanged.
README stays empty; changes are not benchmark campaign findings.

Next: plan a controlled measurement campaign with frozen matching builds, application
revision, documented browser/client/server hardware and runtime, verified cache/startup
state and reproducible network conditions. Retain raw exports and report limitations.
No campaign automation, charts, Adaptive Mode, AOT or generator change is included here.


## Atlas surface microdetail — complete

Refined the five existing grayscale PNG detail maps under atlas-detail-v1, with
quieter fine grass/soil/sand variation, shallow stone mineral boundaries and subdued
snow grain. Retained fixed RGB tints, linear sampling, 256x256 grayscale format,
four-unit repeat, shader/lighting, coverage and all mathematical identities. The
standard-library offline generator remains deterministic; [asset notes](../src/client/public/textures/terrain/ASSETS.md)
record current SHA256 values and CC0 provenance. See the
[material specification](specs/ATLAS_MATERIALS_V1.md) for scope and evidence.

Verification: 297 Angular tests, seven Python checks, production publication and
materials/coasts/lighting/PWA Chromium scenarios pass. Eighteen paired views retain
exact camera framing and complete mathematical hashes; real cross-mode comparisons,
five texture uploads, render/resource caps and offline updates pass. No new runtime
dependency or map buffers. Encoded total is 253693 bytes; GPU texture estimate stays
about 1.67 MiB/view. This is appearance verification, not a performance campaign.

Material palette, foliage, decorative rocks and water remain separately scoped future
presentation work. Controlled research campaigns remain planned. README stays empty.
