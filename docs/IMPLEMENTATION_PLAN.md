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

At that milestone, material palette, foliage, decorative rocks and water remained
separately scoped future presentation work. Controlled research campaigns remain planned. README stays empty.


## Biome readability — Step 1 complete

Implemented grass/soil colors from existing Core biome IDs and centralized species/
variant crown colors. Sand, snow, rock, ocean, trunks and all numerical output stay
unchanged. One aliased Uint8 attribute adds 0.25 MiB GPU storage at 512x512 per view;
vertex palette lookup precedes interpolation. No extra textures, draw calls, controls
or dependencies. See [Biome presentation v1](specs/BIOME_PRESENTATION_V1.md).

Verification: 300 Angular tests, seven build/asset/documentation checks, production
publication, 21 paired views with exact camera/math hashes, and Chromium materials,
coasts, lighting and PWA checks pass. Actual maximum-size biome buffers and replacement/
independent-view cleanup are verified. README remains empty.

Regional climate and snow readability are completed in Step 2 below. Beach width
and coastal transitions follow separately; neither belongs to this palette step.


## Larger, varied rocks — completed in Step 4

After regional climate/snow and coastal readability, extend decorative rocks beyond
the current small stones. Keep this as a separate generation/rendering step.

- Add a restrained size mix: occasional large landmark boulders, medium rocks and
  sparse small companions. Vary silhouettes, proportions, partial burial and rotation
  so scale changes do not merely repeat the same shape.
- Replace visibly regular coverage with seeded irregular scattering: isolated rocks,
  loose clusters and substantial empty areas. Do not place one rock per grid cell,
  fill the map to its cap, or expose rows/equal spacing. Candidate indexing may use
  a grid internally, but visible positions and grouping must not reveal it.
- Let slope, exposed rock and landform context influence placement. Keep plains and
  forest clearings mostly open; avoid uniform density across every biome. Preserve
  supported terrain contact, water exclusion and clearance from trees and other
  rocks, accounting for larger footprints.
- Compute all selection, sizes and transforms deterministically in shared C# Core.
  Angular renders supplied instances with a bounded set of shared geometries and
  materials; no renderer-side random placement or duplicate mathematical logic.
- Freeze size ranges, spacing, cluster rules, instance/draw/memory limits and version
  changes in a new specification before implementation. Existing caps are ceilings,
  not target counts. Preserve fair Local/Remote inputs and timing boundaries.
- Verify repeatability, full WASM/API equivalence, footprint support/clearance, sparse
  distribution and large-object bounds/shadows. Inspect overview and close-up scenes
  across several seeds to check for visible grids, repetition and overcrowding.

This planned scope is implemented in Step 4 below. The original rock specification
remains historical evidence.


## Biome readability — Step 2: regional climate and snow complete

Implemented [regional-climate-v1](specs/REGIONAL_CLIMATE_V1.md): two broad world-grid
climate fields, stronger elevation cooling and smooth static highland snow. At this milestone the
algorithm was diverse-landscape-v8; result/workload/profile were v9 with unchanged JSON
shape, IDs, request fields and simulation version. No renderer climate decisions,
controls, dependencies or extra map-sized climate buffers were introduced.

Snow now appears on suitable default highlands; hot lowlands remain snow-free.
Warmer identical requests cannot increase snow. Terrain, slopes, boundary-connected
ocean and hydraulic outputs remain exact; ecology and downstream instance records
may change. Existing palette, texture, placement and coastal equations are retained.
Historical v8 and earlier fixtures keep their original values through frozen test
policies. Detailed verification and limitations live in the specification.

Verification: 202 Core, 40 API and 300 Angular tests, seven packaging checks, worker
RPC and production publication pass. All seven full browser parity cases report
zero numeric error; 21 paired camera/invariant views and material/coast/light/PWA
regressions pass. Existing resource caps and offline behavior remain intact.

Coastal readability is completed in Step 3 below. Larger, varied rocks with sparse
natural scattering follow it. Neither feature belongs to the regional climate/snow
policy. Controlled performance campaigns remain separate work; this step supplies
no performance findings. README remains empty.


## Biome readability — Step 3: context-sensitive beaches complete

Implemented [coastal surfaces v2](specs/COASTAL_SURFACES_V2.md). Gentle low shores
have wider sandy zones with gradual inland fading; slope and wetness narrow the
zone, retaining rocky/cold shoreline character. Existing fields provide variation
without extra noise. Algorithm is diverse-landscape-v9; result/workload/profile v10
distinguish changed coverage and traversal work. Schemas, controls, textures, shader,
lighting, camera and scratch-array sizes remain unchanged.

All non-coverage fields, full trees/rocks and exact Snow bits remain preserved,
verified against 23 pre-change requests. Historical v1 formulas/fixtures remain
test-only and unchanged. Heightfield ocean geometry retains its grid-scale angular
edges; trees/rocks may still occur on sand. The pass is appearance, not sediment
simulation. Cold/steep/rolling coasts are not required to gain sandy area.

Verification: 214 Core, 41 API and 300 Angular tests, seven packaging/documentation
checks, worker RPC and production publication pass. Eight coastal comparisons and
the seven-case full landscape matrix report zero error. Twenty-four paired views
preserve camera/non-coverage/Snow hashes; material, lighting and PWA checks pass.

Larger, varied rocks with sparse natural scattering are completed in Step 4 below.
Controlled measurement campaigns remain separate work. README stays empty.


## Biome readability — Step 4: sparse large rocks complete

Implemented [rock placement v2](specs/ROCK_PLACEMENT_V2.md): rare large boulders,
medium stones, small fragments, broad seeded patches and isolated background rocks.
Centers use wide sub-cell jitter; large footprints can span multiple quads. Exact
triangle support includes interior vertices/diagonals, bounded burial, water/map-edge
exclusion and conservative tree-crown/rock clearances. Bounded spatial grids retain
priority-stable deterministic selection. Caps are ceilings, never population targets.

Six shared closed polyhedral silhouettes under rock-shapes-v2 render every returned
record, with actual bounds in existing static shadows. Algorithm v10 and result/
workload/profile v11 change rock semantics only. All non-rock fields, full trees,
coverage and hydraulic results remain exact across 23 pre-change requests. Eleven
wire members, enum meanings, controls, textures, camera and lighting stay unchanged.

The default mixed reference drops from 767 to 31 rocks, including a radius 2.05 boulder;
the plain scene drops from 865 to 48. Some steep mountain seeds have few accepted
rocks and no large landmarks because conservative support rejects unsuitable ground.
Low-poly silhouettes and no physical settling/rockfall remain deliberate limits.

Verification: 231 Core, 42 API and 303 Angular tests, seven packaging checks, worker
RPC and production publication pass. All seven full WASM/API cases report zero
numeric error; 24 paired camera/non-rock views and materials/coasts/lighting/PWA
regressions pass. Maximum dry-flat allocation is 16856656 bytes for 1693 rocks,
within the unchanged 32 MiB budget.

The next approved scope is the visual-realism and execution-feedback roadmap below.
Water, atmosphere and the shared environment foundation below are complete. Controlled performance campaigns remain planned after
configuration and workload identities are frozen. README remains empty.


## Next roadmap: visual realism and execution feedback

Status: shared environment foundation, Visual Stages 1–4 complete; remaining stages are planned.
Sun controls, shadow-quality assessment and terrain microdetail are complete; vegetation variation/LOD is next.
Implement incremental, independently reviewable stages, freezing each stage's
policy, resource budget, acceptance scenes and verification before changing code.

### Existing capabilities to retain

- Local generation already runs C# in a dedicated Web Worker. This keeps generation
  off the main thread; it does not parallelize the C# algorithm across CPU cores.
- Total computeMs, request-to-validated-data time, runtime initialization and CPU
  scene setup/first submission are already separate. Detailed Core stage timings,
  individual-generation progress and cancellation are not implemented. Race Stop
  stops further collection; it does not abort the current Core call.
- Deterministic directional sun, static 2048 PCF shadows, Hemisphere light and linear
  distance fog already exist. The background is a flat color; there is no sun UI.
- Five terrain textures already blend from Core coverage with fixed-scale triplanar
  mapping, slope/climate-aware rock/grass/sand and gradual highland snow. These do
  not need another independent renderer-side biome classifier.
- Broadleaf, conifer and savanna trees, Small/Mature variants, seeded sizes/yaws,
  groves, clearings, forest edges and instancing already exist. Billboard LOD and
  individual foliage tint variation are not implemented.
- WASM AOT is not enabled; publishing emits the documented optimization notice.
  Actual SIMD use has not been audited. Do not equate worker use with SIMD, AOT
  or multithreaded Core execution.

### Foundation — shared sun, fog and visual time (complete)

Create one coherent presentation state for time of day, sun direction/color/intensity,
sky parameters, fog and frozen visual time. Define world axes, angle/color/time units,
normalization and pure state derivation before implementation. It is an illustrative
lighting model, not Core climate or geographic astronomical simulation.

Use one logical uniform block shared by sun, sky, water, terrain and vegetation.
Give each viewport its own mutable Three.js uniforms/lights/resources while both
comparison views receive the same immutable settings snapshot and visual time.
A native GPU uniform buffer is an implementation choice after auditing installed
Three.js material support, not a reason to replace existing materials or add a
rendering framework. Future shader consumers must use the same world-space sun
state rather than hard-coded independent directions/colors.

Preserve the current daylight preset as the initial exact visual reference. Bind
existing DirectionalLight, HemisphereLight and fog through the new state, retaining
fitted single-map shadows and static reuse. Prepare stable interfaces for directional
sky color and shared fog evaluation; the full atmospheric shader belongs to Stage 2.
Future time-of-day/azimuth controls must update this state without regenerating Core
maps. Explicitly define which input is authoritative to avoid conflicting sun angles.

No automatic time advance or animation loop is required for the foundation. Pause
updates under the operation lock, support a fixed visual time for tests/benchmarks,
and release subscriptions/bindings on replacement/failure/destruction. Verify default
appearance, state derivation, two-view isolation, shadow invalidation and unchanged
Core hashes. Record the presentation revision and interfaces in an English spec.

Implementation: [scene-environment-v1](specs/SCENE_ENVIRONMENT_V1.md) provides pure
validated settings derivation, an app-scoped immutable snapshot service and stable
per-view bindings connected to existing lights/fog. Updates preserve scene/camera
and display measurements; paused views apply the latest state after unlock.
Default light/shadow/linear-fog settings remain exact. No Core changes, extra
render pass, animation loop, dependency or UI control was introduced.

Verification: 313 Angular tests, seven packaging/documentation checks and production
publication pass. Eighteen paired PNG/camera/full-result hashes are exact; lighting,
materials/compare, editor and PWA browser regressions pass with no page errors.
Native sources were unchanged; no native suite rerun or performance claim.

### Visual Stage 1 — ocean surface (complete)

Create a separate ocean surface at world height
seaLevel * float32(heightMultiplier). Use the authoritative Core Ocean mask and
existing heights, with clipped shoreline geometry or an equivalent bounded mask.
A full unmasked plane must not cover disconnected dry depressions or interior land.
Keep terrain, ocean classification, erosion, climate, vegetation, rocks and coverage
unchanged; no renderer-side hydrology or automatic lowland filling.

Required appearance:

- Depth-dependent transparency/absorption: pale turquoise shallows, darker depth,
  with the actual bottom visible through sufficiently shallow water.
- Soft restrained foam at the real shoreline, fading inland/deeper offshore; no
  wide white outline around every water boundary.
- Small visual waves from an animated tiled normal map and a sun specular highlight.
- Fresnel blending: greater sky reflection at grazing angles, more visible bottom
  from above. Sky reflection must use the same sky/light colors as the scene.

Specify geometry/mask resolution, depth derivation, edge/equality handling, normal
asset provenance, transparency/depth-writing order, texture/mesh/draw/memory budgets
and disposal before implementation. Prefer the simplest suitable existing Three.js
path; inspect installed capabilities before adding dependencies or reflection passes.
For flat sea-level water, prefer depth=max(0,seaWorldY-terrainHeight) from the existing
heightfield, with triangle-consistent interpolation and the Ocean mask. This avoids
an additional scene-depth pass but still has geometry/attribute/texture sampling and
memory costs; it is not literally free. Evaluate a separate scene depth buffer only
when it supplies necessary information unavailable from the heightfield. Do not
subtract nonlinear device-depth values as world-space depth.

Freeze the initial shading policy:

- Transmittance T=exp(-depth*k), k>=0 in inverse world units; base alpha=1-T.
  Blend shallow turquoise and deep dark-blue colors with the same 1-T weight.
- Soft foam where depth is below a specified threshold, modulated by bounded noise
  and an animated offset. Handle zero-depth edges so foam remains visible without
  turning every shore into an opaque white outline.
- Two normal-map layers scrolling in distinct directions and at different world
  scales; they may sample one reusable tile twice or use two justified assets.
  Decode/blend normals in a consistent space and attenuate aliasing at distance.
- Schlick Fresnel F=F0+(1-F0)*(1-clamp(dot(N,V),0,1))^5, F0 approximately 0.02 for
  water. Specify how reflection, transmission, alpha and foam combine; do not lose
  grazing reflection merely because the depth-only alpha approaches zero.
- Sun highlights use Blinn-Phong or GGX, driven by the shared sun direction, linear
  color and intensity. Sky reflection uses the same sky model as atmosphere.

Add compact presentation-only water controls for color, turbidity and foam intensity,
with explicit ranges/defaults, validation, operation-lock behavior and identical
settings across comparison views. They must not enter TerrainRequest or change
computeMs/workload identities. Begin with correct mask/depth geometry, then foam,
normal animation and highlights within this stage; a flat ocean tint is insufficient.

Animation must stop while the shared operation lock is held, during experiment
collection, when the page/view is hidden and after disposal. Avoid duplicate render
loops across interaction, resize and water animation. Resume cleanly, freeze visual
time for paired screenshots, and do not include wave frames in computeMs. Validate
independent comparison views, late/failed setup, context loss, replacement and PWA
asset caching. Existing rendering assumptions must be revised explicitly: an extra
water draw/normal asset is a presentation cost, not a Core workload change.

Acceptance includes warm/cold, shallow/deep, gentle/steep coast, no/all Ocean, zero
height, dry disconnected pockets and maximum dimensions; exact Core hashes remain
unchanged. Compare Local/Remote at identical requests and fixed visual time/camera.

### Visual Stage 2 — sky and atmosphere (complete)

- Use an analytic sun-dependent sky: assess Preetham, Hosek-Wilkie or a simplified
  Rayleigh/Mie model against the required quality and budget. Sky and sun are one
  system using the foundation state; a gradient is a baseline/fallback rather than
  a separate hard-coded palette.
- Use exponential distance fog with in-scattering color sampled from the sky in
  the view-ray direction, not one constant color. Align the horizon and water
  reflection; fog softens edges but does not create missing terrain.
- Height fog uses density(height)=density0*exp(-height*falloff), with documented
  world-height origin and analytical integration along the view ray. Handle nearly
  horizontal rays, small exponents and below-origin heights without singularities,
  overflow or sudden changes. Preserve readable terrain and morning valley haze.
- Share one fog GLSL implementation/binding policy across terrain, tree crowns and
  trunks, rocks and water. Define spaces and ordering with lighting, transparency
  and tone mapping; avoid double application or separate inconsistent formulas.

Define fog equations, sky ownership, transparency interaction, draw/pass costs and
paired acceptance scenes. Keep the fixed current lighting preset usable as a
reference. Atmosphere is presentation; do not modify Core climate to fake haze.

### Visual Stage 3 — sun controls and shadow assessment complete

- Add compact time-of-day and sun-direction controls with one unambiguous mapping
  between time, azimuth/elevation, sun intensity/color, sky and fog. Warm low sun
  transitions to a cooler/neutral noon appearance; do not expose conflicting
  independent controls without documenting their interaction.
- The logical sun uniform block contains normalized direction, linear color and
  intensity derived from time of day. Water, sky and scene lights consume it.
- Keep one shadow map fitted to terrain plus actual tree/rock bounds first. Update
  water highlights/reflections and shadows on light changes; retain Hemisphere fill
  and static reuse while unchanged. Tree casters use the same shadow map; any distant
  caster disabling must follow an explicit LOD policy and be checked visually.
- Improve soft directional shadows and inspect valleys at close/overview distances.
  Evaluate cascaded shadow maps only if the current fitted map demonstrably lacks
  resolution under real close-camera use. Evaluate baked terrain AO/horizon shading
  by bounded heightfield ray marching, especially in valleys. Specify directions,
  steps, scale, cache/ownership and memory; do not add both CSM and AO by default.
  If AO is computed in Core, execute it in both WASM/API and version its workload.
  A WASM-only precomputation must instead be declared a separate presentation cost,
  never included in a supposedly identical mathematical comparison.

Controls affect presentation only, do not regenerate maps, and respect operation
locking. Freeze lighting state for comparisons; test repeated slider changes and
shadow resource cleanup. AO derived in Core would be a new versioned computation,
not a free renderer tweak; specify its ownership before implementation.

### Visual Stage 4 — terrain material microdetail (complete)

Preserve existing Core coverage, five-channel normalization, shoreline/snow policy
and fixed-scale triplanar texture blending. Improve the existing material rather
than adding another slope/height/biome classification system in TypeScript.

- Add tiled detail normals at multiple restrained scales, preserving biome colors
  while reducing obvious repetition. Use correct normal/color-space conventions
  and triplanar normal orientation on steep rock faces.
- Fade fine detail with distance to avoid shimmer and excessive sampling.
- Retain exposed rock on steep slopes, grass on suitable gentle land, sand near
  actual Ocean and smooth climate/elevation/slope-dependent snow.

Specify assets/provenance, repetition scale, sampler/attribute/pass/memory budgets
and compatibility with sun/shadows. Check steep faces, transitions and grazing
views; preserve exact generation hashes and biome distinctions.

### Visual Stage 5 — vegetation variation and LOD

Build on existing Core species, size/yaw, variants and clustered placement.

- Use per-instance attributes for controlled scale, yaw and foliage-tint variation.
  Supplied Core scale/yaw and biome suitability stay authoritative; presentation
  tint can derive from stable instance identity without changing placement.
- Preserve species selection by elevation/climate/moisture/slope. Existing vegetation
  already applies a separate grove/clearing field over density; refine that field
  only under a versioned Core change, rather than duplicating clustering in JS.
  Keep broadleaf/conifer/savanna context, edges and dense patches. New dry-zone shrubs
  require a separate Core contract; do not silently repurpose a tree ID.
- Retain instancing through full geometry -> simplified geometry -> billboard LOD,
  using explicit distance thresholds and dithered transitions. Budget overlap draws,
  transparency/shadow interaction and conservative bounds. Current cap is 16384 trees,
  not an assumed 9000; assess the real maximum and two comparison views.

LOD is visualization only and must not change returned records or numerical
comparison. Budget extra meshes/materials/textures and switching CPU work; prevent
popping, missing trees, shadow inconsistencies and resource leaks in two views.
New ecological placement or species advance affected workload identities.

### Visual Stage 6 — restrained postprocessing

- Establish a coherent tone-mapping/exposure policy, evaluating ACES with existing
  linear material colors, sky, water and snow.
- Add subtle bloom where useful; preserve highlights and biome readability.
- Add SSAO only after measuring scene/render-target costs on supported devices.
- Finish with restrained vignette and color grading rather than hiding material
  problems behind filters.

Freeze the intended order: SSAO -> bloom -> ACES tone mapping -> color grading ->
vignette. Specify HDR/linear inputs and avoid double tone mapping or output encoding.
Each effect needs an independent compact UI toggle; disabled effects should skip
unnecessary passes/resources. SSAO/bloom remain disableable for weaker devices.

Implement incrementally; record passes, render-target memory, resolution behavior
and cleanup. Keep a baseline without optional expensive passes. Rendering
is outside Core timing, but competing GPU/CPU activity must still pause during
collection. CPU first submission is not GPU completion or an FPS measurement.

### Execution track 1 — detailed timing diagnostics

The shared foundation, water, atmosphere, sun controls, shadow assessment and microdetail are complete; vegetation variation/LOD is next. Timing diagnostics precede WASM
optimization decisions and the next controlled performance campaign.

Break down height composition, erosion, final conversion/ocean/environment/biome
and surface work, tree placement, rock placement and final coastal blending. Keep
whole-call computeMs and request-to-data time; separately show scene construction/
first submission and GPU time only where actually measured. Do not label combined
transport/serialization/validation overhead as pure network time.

Core may expose semantic stage boundaries through a minimal optional observer, but
clocks/timers stay in thin hosts. Use the same observation boundaries in WASM/API.
Account for allocations and unassigned overhead explicitly; do not force stage sums
to equal total by inventing numbers. Keep instrumented diagnostics distinct from
ordinary benchmark measurements because observation has a cost. A diagnostic envelope
may carry stage entries such as { stage, ms }; Core does not own clocks. Mesh/texture
setup is measured in the browser, not reported as C# generation time. Separate measured
JS/WASM transfer/copy, serialization/decoding and GPU upload/submission where boundaries
are observable. GPU submission is not completion; use a supported GPU measurement or
mark it unavailable. The reported 4.7-second difference is a hypothesis to investigate,
not evidence that transfer/GPU caused it. Version envelope/export/profile semantics
consistently, preserving structured errors.

### Execution track 2 — progress and generation cancellation

Show current stage and completed work, with erosion iteration counts. A percentage
of iterations is not a prediction of remaining seconds; unknown-length stages use
indeterminate progress. Bound notification frequency and keep Angular responsive.

- Local: ordinary worker messages cannot interrupt a synchronous C# call while that
  worker's event loop is occupied. Specify either controlled worker termination
  with runtime reinitialization or a verified cooperative yielding/shared-signal
  mechanism. For cooperative cancellation, batch erosion iterations and yield at
  explicit checkpoints so queued messages can run, or check a verified shared flag
  through SharedArrayBuffer/Atomics without relying on message delivery. A cosmetic
  split into synchronous loops does not yield. Keep checkpoints deterministic and
  budget progress traffic. Reject late replies and retain prior successful maps.
- Remote: aborting the client request is insufficient by itself. Propagate server
  cancellation into bounded Core checkpoints and verify computation actually stops.
  Actual remote progress needs an explicit transport design; do not fake it from
  elapsed time or expose partial results as complete.
- Race: distinguish Stop-after-current-call from generation cancellation. Retain
  attempted/cancelled records with correct status and exclude incomplete calls
  from verified summaries; update exports/contracts if required.

Core callbacks/checkpoints have no DOM, HTTP or clocks. Test cancellation during
expensive stages, runtime/server recovery, lock release, retry, stale responses,
comparison state and safe PWA updates. Do not publish partial generation as success.

### Execution track 3 — measured WASM optimization variants

Audit actual SDK/publish configuration, optimization output, startup costs and SIMD
use first. A long wall-clock time alone does not identify the slow stage. Use the
new timings to choose whether AOT, SIMD or Core multithreading addresses the actual
bottleneck; do not propose adding a worker that already exists. Audit unnecessary
large-buffer copies across JS/WASM/worker boundaries before changing transport.
Assess SIMD128, AOT, toolchain optimization (-O3/wasm-opt where actually supported)
and threads against the pinned .NET SDK and real emitted artifacts. Do not blindly
paste Emscripten flags into a managed .NET build. Document cross-origin isolation,
COOP/COEP and shared-memory requirements for any threaded/shared-signal variant,
including every asset/origin and service-worker/offline update path.

Keep the current sequential implementation as the baseline. AOT, vectorized kernels
and multithreaded execution are distinct experimental configurations, with documented
CPU/runtime/browser support, deployment/shared-memory requirements, PWA/offline
compatibility, startup/download/memory costs and degree of parallelism. Preserve
algorithm order and numerical equivalence or version and justify any change. Apply
equivalent strategies across hosts where appropriate; do not attribute different
algorithms/parallelism solely to Local versus Remote architecture. Never pool
configuration variants in one verified performance summary.

### Separate future Core extension — rivers and lakes

Retain the earlier hydrology request after ocean presentation is established.
Erosion's temporary water arrays are not automatically a stable river/lake network.
Specify post-erosion drainage directions (evaluate D8 versus D-infinity), a separate
flowAccumulation layer and flow/direction data in shared Core. Freeze units, tie
rules, edge/outlet behavior, operation order and numerical tests. Rivers can then
use a documented accumulation threshold; lakes need depression/spill handling such
as priority-flood, with consistent levels, outlets and mass/flow interpretation.
Plan the water renderer's future optional river/lake mask input now, but do not emit
a placeholder river texture or allocate full-map hydrology buffers in the ocean
stage. Adding real layers changes contracts, memory and computation; integration
is not assumed free.
Do not fill every lowland or recreate the previously rejected automatic flooding.
Advance affected identities, budget fields/costs and verify complete WASM/API
equivalence. River/lake surfaces then reuse the water presentation where appropriate.
This extension is separate from Visual Stage 1 and is not implemented here.

### Shared acceptance and sequencing

Implementation sequence:

1. Shared sun/fog/visual-time foundation — complete.
2. Water and sun-dependent sky/fog integration — complete.
3. Sun controls and shadow assessment — complete; CSM/AO require a separate policy if justified.
4. Material normals — complete; vegetation variation/LOD next, then postprocessing.
5. Shared Core river/lake hydrology, after the water system is established.

Timing, worker progress/cancellation and optimization diagnostics form an independent
track that can progress alongside visual work once their contracts are specified.
They must not introduce measurement interference, mismatched workloads or shared
mutable state.

Every stage needs fixed-seed paired scenes, exact unchanged-field hashes where
applicable, narrow layout, replacement/failure/two-view lifecycle, operation-lock
pause behavior and production offline/update verification. Freeze animation, sun,
quality settings and camera for visual comparisons. Track graphics budgets as
explicit presentation revisions without changing mathematical identities when
Core remains unchanged. Do not claim fair performance comparisons while animated
rendering competes with the timed work.

After each accepted stage, update architecture/development/benchmark notes and
this roadmap. Controlled campaigns follow stable matching builds and frozen test
conditions; additional improvements remain separately scoped. Documentation stays
English and README.md stays empty.


### Visual Stage 1 completion evidence

Implemented [Ocean presentation v1](specs/OCEAN_PRESENTATION_V1.md): bounded indexed
sea-level clipping, height-derived absorption, shoreline foam, two animated normal
layers, Schlick Fresnel, shared-sun highlights and compact collapsed water controls.
A single shared phase/RAF hub pauses under operations and respects visibility and
reduced motion. Mathematical algorithms, all Core fields and identities stay exact.

324 Angular tests, eight Python packaging/asset checks, worker RPC and production
publication pass. Eighteen fixed-camera paired views retain exact full numeric
hashes. Chromium materials and focused water checks verify real shaders, comparison
ownership, shared animation, operation pause and maximum-size Ocean resource caps.
The PWA catalog has 39 assets. Native code is unchanged. This is correctness evidence;
no controlled performance findings are claimed.

At that milestone, Visual Stage 2 sky/atmosphere was next; its completion follows. No sun controls, Core AO, river/lake hydrology, stage telemetry or new
optimization configuration is implemented by this stage.

Focused Chromium checks also pass for no-Ocean animation shutdown, 512x512 Ocean
(11509784 raw GPU geometry bytes), zero-height Ocean, cached new-seed offline water,
and narrow layout. Lighting, editor and PWA update regressions pass, including
offline new-tab generation, Remote recovery and update deferral while busy.


### Visual Stage 2 completion evidence

Implemented [Atmosphere v1](specs/ATMOSPHERE_V1.md): shared sun-dependent analytical
sky, exponential distance fog and stable integrated height fog across terrain,
instanced vegetation, rocks and water. One sky function drives visible background,
fog in-scattering and water reflection. A compact collapsed panel changes enabled,
haze and valley-fog settings without generation. Disabled mode restores the earlier
flat background/native linear fog and Ocean reflection. No independent sun clock,
new asset, rendering dependency, target or shadow pass is added.

333 Angular tests, nine packaging/asset checks, worker RPC and production publication
pass. Chromium atmosphere/materials/lighting/editor checks pass with no errors.
Eighteen paired views preserve complete Core hashes and camera matrices. All 18
frozen disabled-mode PNGs match the preceding Ocean publication byte-for-byte.
The focused harness covers shared controls/uniforms, no geometry uploads or new
programs on settings changes, operation pause, min/rectangular/512-square maps,
zero/all/no Ocean, new-seed offline generation, narrow layout and actual shared
sun derivation at 6.2/17.8/0 hours. Static shadows stay reused. The sky adds exactly
one 36-byte position buffer and one color draw; total ceiling 21, caster ceiling 19.
Native sources and mathematical identities remain unchanged. The 39-entry offline
catalog and existing texture/shadow budgets are retained. No performance claim.

Known limits include finite map edges, low-poly coasts, approximate output-space
water blending, no underwater scattering/clouds and an illustrative sky/light cycle.
Full gradients are visible near the horizon; the initial downward camera is retained.
At that milestone, sun controls and evidence-driven shadow refinements were next; Stage 3A completion follows.
CSM/Core AO still require separate justification/specification before implementation.

The materials matrix observed up to 19 color calls including exactly one sky draw;
the structural ceiling is 21 when every terrain/tree/rock/water group is present.
Existing 2048-square shadow attachments remain 32 MiB per view (format-based
estimate), with one static update per unchanged scene.

Production PWA regression also passes: cached reload/new tabs and new seeds, Remote
failure/recovery, deferred update while busy, and updated-version offline 3D terrain.
Deployment assets were restored after the update simulation.


### Visual Stage 3A — sun controls (complete)

Implemented [Sun controls v1](specs/SUN_CONTROLS_V1.md): one collapsed panel edits
00:00..24:00 in 15-minute steps and 0..359 degrees with compass labels. Reset restores
12:00/315 degrees while preserving visualTimeSeconds and Water/Atmosphere settings.
SceneEnvironmentService remains the shared immutable source for both views. The
existing light-cycle equations, mathematical identities, all Core outputs and
camera behavior stay unchanged.

Controls load through Angular defer only when opened outside OperationLock; opening
while busy waits until release. Existing afterRenderEffect coalesces synchronous
edits and applies latest-only snapshots after unlock. No new animation/scheduler,
store, texture, rendering pass or external dependency. One inactive night-direction
edit updates the light transform without shadow-camera refit; active direction and
activation changes retain the fitted single 2048 map and existing bounds policy.

Verification: 338 Angular tests, nine packaging/asset checks, worker RPC and production
publication pass. The frozen six-case/18-view atlas preserves exact complete Core
hashes, camera matrices and all default noon PNG bytes. Chromium Sun UI, materials,
lighting and editor checks exercise both views, actual dawn/noon/sunset/night and
cardinal directions, reset, no generation/upload on edits, retained shadow targets,
operation guards and cached offline interaction. Resource ceilings remain 21 color
and 19 caster calls with existing textures/shadow storage. The complete catalog has
40 required assets after the lazy code split. Native sources are unchanged; native
suites were not rerun. Software WebGL smoke runs are not performance findings.

At that milestone, Visual Stage 3B shadow assessment was next; its outcome follows.
Document observed clipping/acne/detachment/resolution and choose bounded fit/bias
refinements only where justified. CSM and Core AO are not automatically authorized
by this completion; either requires evidence and a separate policy/budget before
implementation. Existing near-horizon/night darkness and low-poly/coastal limits
remain explicit. README stays empty.

Production PWA regression passes: offline reload/new tabs and new seeds, Remote
failure/recovery, deferred update while busy and updated-version offline 3D terrain.
Generated deployment assets were restored after the update simulation.


### Sun-stage correction — night foam and visible moon

Corrected constant-emission Ocean foam to use actual linear sky/fill illumination
and bounded direct sun. Added an illustrative full moon opposite the existing sun
in the shared sky function, including its water reflection. No extra clock, lunar
calendar, light/shadow pass, geometry/texture or Core computation is introduced.
Default noon appearance remains exact. See [Night sky and foam v1](specs/NIGHT_SKY_V1.md).
This follow-up preserves the completed Sun UI and leaves shadow-quality assessment
as the next planned substep. README stays empty.

Night follow-up verification: 338 Angular tests, nine packaging/asset checks, worker
RPC, production publish and real Sun/night/offline browser checks pass. All 18 default
noon image/camera/full Core comparisons remain exact. The night/zero-light pixel
probe and visible moon/day-absence probe pass without errors; this is correctness
smoke evidence rather than a controlled performance result.

Night correction PWA regression also passes: cached reload/new tabs/new seeds,
Remote recovery, deferred update while busy and updated-version offline 3D terrain.
Generated deployment assets were restored afterwards.


### Visual Stage 3B — shadow quality assessment (complete)

Recorded seven scenes at three sun poses/two zooms (42 views), plus 12 closer forest/
maximum contacts. Captures include actual camera and GPU shadow uniforms, complete
Core hashes, tree/rock counts and attachment budgets. See
[Shadow quality v1](specs/SHADOW_QUALITY_V1.md) for the assessment and rejected probe.

The single global map loses small-contact detail on512-square close views. A test-only
world-bounded bias correction was tried before touching production: modest contact
changes came with conspicuous periodic self-shadow acne on maximum terrain at noon
and low sun. The candidate was rejected. No safe cross-scene scalar correction was
demonstrated, so production fit, bias, normal offset, PCF radius, 2048 size, light
cycle, Moon/foam and default appearance remain deliberately unchanged. No CSM/AO,
extra target/pass/texture or runtime quality control was added.

Added conservative clip-space regression coverage for complete request bounds and
actual float32 rotated/scaled edge instances, including shifted mesh transforms,
minimum/elongated/maximum dimensions, height 0/1/1000 and near-horizontal sun.
342 Angular tests, production publication and packaging/RPC checks pass. Accepted
paired views require exact Core/camera/GPU shadow/PNG identities because production
rendering was retained. This is correctness evidence, not a performance campaign.

At that milestone, Stage 4 terrain microdetail was next; its completion follows. CSM for close-view
resolution or contact AO would be separate follow-ups with their own policy and
resource budget; this assessment does not authorize either. Detailed timing,
progress/cancellation and measured WASM variants remain independent execution tasks.
README stays empty; native sources and mathematical identities are unchanged.


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


### Visual Stage 4 — terrain microdetail completion

Implemented [Terrain microdetail v1](specs/TERRAIN_MICRODETAIL_V1.md): one original
five-layer normal PNG, uploaded as a seam-safe WebGL2 array texture with independent
layer mipmaps. Signed right-handed triplanar gradients blend existing Core coverage,
perturb fragment lighting only and fade over 24..72 world units. Existing scalar
textures, biome colors, geometry/normals, shadow policy and water shader stay intact.
No extra UI, animation, draw/pass/target, full-map attribute or dependency is added.

A per-preview cached owner validates decode, closes bitmaps, releases late results,
retries failures and isolates comparison views. Scene setup defers under OperationLock;
textureWaitMs includes load/decode, and allocation/upload remain display work outside
computeMs/requestMs. Normal asset 201699 bytes, raw retained CPU 320 KiB and mipmapped
GPU 436900 bytes/view; 7 terrain samplers including shadows, unchanged 5 attributes.
Existing color/caster ceilings 21/19 and five scalar textures are retained. Complete
PWA catalog now 41 assets; Three remains lazy. No mathematical identity changes.

347 Angular tests, 12 packaging/asset checks, worker RPC and production publication
pass. Actual Chromium material/microdetail/Sun/night scenarios pass: array dimensions
128x128x5,8 mip levels, sampler limits, independent cleanup/replacement, paused work,
narrow/offline new seeds and shared sky/lighting are verified. 28 actual-GPU normal
fixtures cover signed axes, neutral/zero strength and a non-axis blended reference.
All 24 paired camera/full Core hashes remain exact; all 8 overview PNGs remain byte-
exact because detail fully fades. Close images intentionally gain restrained relief.
The focused close-view RGB mean difference is about .454/255, a correctness/artistic
regression metric rather than a performance result. Native sources are unchanged,
so native suites were not rerun. No controlled performance campaign was run.

Limits remain finite low-poly silhouettes and the global directional-shadow map;
normal detail does not add displacement or repair those issues. Next visual stage:
Stage 5 vegetation variation and LOD. Timing diagnostics/cancellation remain separate.
README stays empty.

Microdetail PWA regression passes: cached reload/new tabs and new seeds, Remote
recovery, deferred update while busy and updated-version offline 3D terrain with
the new normal atlas. Deployment assets were restored after the update simulation.
