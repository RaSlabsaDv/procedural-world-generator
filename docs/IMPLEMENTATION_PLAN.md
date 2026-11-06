# Implementation plan

## Current foundation

The supported product is **Rich terrain + hydraulic erosion** with a Three.js preview. Local C# WebAssembly runs in a dedicated worker; Remote runs the same C# library through ASP.NET Core. Controls, strict validation, full-array equivalence checks, separate timings, transactional WASM publishing and production PWA/offline behavior are implemented.

Baseline/probe interfaces, the experimental regional generator, and all 2D views have been removed. Their browser scripts and feature-specific tests are removed with them. Noise, height contracts and validation remain as dependencies of the supported terrain generator. README stays empty; documentation stays in English.

## Terrain editor: implemented

The editor provides a large central Three.js viewport, grouped parameter sidebar, measurements sidebar and compact PWA header. Numeric/slider controls share values; Random seed and Reset affect drafts only. One result is shown by default, with explicit Local/Remote selection and comparison views. Captured labels distinguish previous results from draft edits. Generation/errors retain prior terrain; stale or destroyed-component responses are discarded without releasing the lock before real completion.

Same-scale preview updates preserve the camera and Reset camera restores default framing. Details expose captured parameters, versions, simulation totals and separate initialization/display timing. Full-result comparisons, worker ownership and safe PWA updates remain supported; generation now uses the v4 result contract below. Tests cover editor state transitions, camera lifecycle and responsive/offline browser behavior.

No new dependencies, presets, brushes, 2D views, simulation history or placeholder timeline controls were added. Bounded capture is a later extension; its player will occupy a bottom timeline after real frame data exists.

## Diverse terrain and vegetation

Current generation uses diverse-landscape-v3 with landscape-ecology-v4 results: regional plains/hills/mountain composition, explicit boundary-connected ocean, environment-based biomes, density and capped deterministic trees. Both hosts share Core. Up to six instanced meshes per viewport render every returned tree across three categories. Hydraulic-grid-v1 arithmetic and closed boundaries are unchanged. Historical v1/v2 fixtures remain test-only evidence, not another public mode. See [LANDSCAPE_V3.md](LANDSCAPE_V3.md) for exact rules and limits.

## Organization and polishing: complete

Core is split into Contracts, Validation, Generation and Ecology, with separate composition, sea, biome and vegetation responsibilities. Angular separates platform, terrain data/editor/rendering and shared styles. Pure defaults no longer couple PWA readiness to Angular forms. Wire biome IDs and their palette are explicit and centralized. Decoder and comparison implementations are separate behind the contract entry point. A stale display-timing reset was corrected; updating one mode preserves the other mode's measurement.

Unused Angular routing and the duplicate hydraulic browser script were removed. The landscape, editor and PWA browser scenarios share setup/readiness helpers. That cleanup preserved v2 mathematics, contracts, limits, workload identities and fixtures. The separately versioned v3 feature now builds on it.

## Climate and vegetation diversity: implemented

V3 specifies required globalWarmth, vegetationDensity and landformRegionScale controls; broadleaf/conifer forests, sparse savanna, tundra and static highland snow; and Core-owned tree kinds. Strict host/client contracts reject missing fields and invalid categories. Density does not change biome coverage, and the existing hydraulic kernel, ocean connectivity and resource caps are preserved. See [LANDSCAPE_V3.md](LANDSCAPE_V3.md) for precedence, arithmetic and timing. Historical v2 sources and fixtures remain test-only. Production browser evidence covers category/field parity, heavy limits and offline operation.

## Landscape detail — Stages 1–2 implemented

Implement the following stages incrementally in the existing editor. Stages 1–3 form the first delivery: surface materials, natural transitions and lighting. Stages 4–7 add vegetation, rocks, geometric relief and coasts. Stages 1–2 are implemented and verified; stages 3–7 remain planned.

Before each stage, capture representative normal/cold/warm views with fixed requests and camera framing. Define its resource limits and acceptance checks before implementation. Preserve the historical v3 specification and fixtures when introducing a new semantic contract. Keep README empty and documentation in English.

### 1. Surface materials — complete

Implementation instructions: [SURFACE_MATERIALS_PROMPT.md](SURFACE_MATERIALS_PROMPT.md).

Add reusable grass, soil, sand, rock and snow textures, with consistent world-space tiling across seeds, map sizes and both execution modes. Use small, locally bundled assets with documented provenance/licenses. Choose an approach compatible with the current Three.js terrain material before adding dependencies. Keep heights and Core biome IDs unchanged in this stage; sand becomes a visible coastal surface once stage 7 supplies coastal data.

Acceptance: textures resolve at overview and close-up distances without per-map stretching, work after an offline reload, and share resources within a viewport. Record texture/download/GPU resource budgets; release owned resources on replacement and destruction. Visualization costs remain outside Core time.

Implemented with four active original 256x256 detail textures and reserved sand, fixed four-unit triplanar sampling, existing biome tint, one terrain draw call and no Core/contract changes. Preview ownership covers async failure/retry, stale completion, pause and destruction; all five assets participate in complete-version offline verification. Actual encoded assets total 271377 bytes; estimated active RGBA+mip storage is about 1.33 MiB per viewport. See DEVELOPMENT.md for ownership and measurement boundaries.

Verification: 119 Angular tests, 115 Core and 37 API tests, four Python packaging/asset tests, worker RPC test, Release/production builds, and materials/landscape/editor/PWA Chromium scenarios pass. The landscape matrix has zero observed Local/Remote numeric error through 512x512x128. Materials evidence covers before/after rectangular normal/cold/warm previews, real shader compilation, four detail GPU textures per viewport, one terrain draw call, independent comparison-view cleanup, 16384 trees and offline generation. Raw evidence/screenshots live under ignored artifacts/. This is the historical Stage 1 verification baseline; Stage 2 completion is recorded below.

### 2. Smooth surface transitions — complete

Implementation instructions: [SURFACE_TRANSITIONS_PROMPT.md](SURFACE_TRANSITIONS_PROMPT.md).

Specify normalized surface coverage weights in Core for grass, exposed soil, sand, rock and snow. Derive them from the authoritative terrain/environment data with documented thresholds and operation order. Retain categorical biome IDs for ecological decisions; visual blending must not silently change biome classification or tree eligibility. Preserve heights and hydraulic results.

Version the result/workload and, if generation semantics change, the algorithm before extending both hosts, strict TypeScript decoding and full-result comparisons together. Three.js interpolates and blends supplied weights; it does not reproduce the ecological rules. Define bounded fields/encoding before allocating additional full-map arrays; unused sand coverage remains zero until coastal classification exists.

Acceptance: supplied weights are finite, bounded and normalized; categorical rules still hold. Verify complete Local/Remote weight parity and smooth transitions on forest edges, rock slopes and snow boundaries. Record added memory, JSON bytes and Core work.

Implemented coverage v1 with a required five-channel float32 result array, strict host/client contracts and complete coverage comparisons. Core derives appearance without changing the frozen v3 heights, environment, biomes, trees or hydraulic summaries. Lambert rendering blends base colors and texture detail from supplied weights. Result/workload/profile are v4; algorithm remains diverse-landscape-v3. The old categorical vertex-color/one-hot buffers are replaced by four float channels at the same combined byte count. See [SURFACE_TRANSITIONS_V1.md](SURFACE_TRANSITIONS_V1.md).

Verification: 139 Angular tests, 127 Core tests, 37 API tests, four Python packaging/asset tests and worker RPC pass. Release/production builds and materials/landscape/editor/PWA browser checks pass. All six WASM/API cases, through 512x512x128, have zero observed numeric error. Maximum response in this smoke run is 17356255 bytes, including 2621441 wire bytes for coverage; the field itself is 5 MiB and its GPU attribute 4 MiB. Texture/draw-call limits and offline updates remain verified. See development/specification evidence for memory caveats. Stage 3 is next; no lighting, shadow, fog or new hydrology changes are included.

### 3. Lighting, shadows and atmosphere

Improve terrain shading, add bounded directional shadows from terrain and trees, and use subtle atmospheric fog for depth. Keep a fixed reproducible lighting setup and the same settings for Local/Remote views. Start with the existing Three.js capabilities. Atmosphere changes presentation only; it does not alter climate or introduce a day/night simulation.

Acceptance: terrain shape and tree silhouettes remain readable at overview and close range, without excessive shadow artifacts or obscuring the biome palette. Define shadow resolution, distance and rendering budgets for one/two views. Preserve camera behavior, offline rendering, pause during computation and complete resource disposal. Report scene setup separately from ongoing rendering; CPU submission is not GPU completion.

### 4. Forest structure and tree variation

Extend deterministic Core placement with groves, clearings and spatial density variation within suitable biomes. Add bounded tree appearance variants for young/tall trees, crown shapes and shades within the existing broadleaf/conifer/savanna categories. Define variants as illustrative size/appearance, not a simulated biological age. Keep category, suitability, positions and seeded variation authoritative in Core; the renderer maps returned variant data to shared geometry/materials.

Specify/version the changed placement contract before implementation. Preserve the 16384 total tree cap unless separately justified. Define a bounded variant count and mesh/draw-call budget before expanding beyond the current maximum of six vegetation meshes. Preserve density-zero behavior and document/test how clustering interacts with monotonic density and priority capping.

Acceptance: fixed seeds reproduce groves and clearings; unsuitable cells remain empty; all returned placements/variants match across hosts. Render every returned instance without per-tree components/materials, with stable retained transforms and bounded resources.

### 5. Rocks, boulders and scree

Add Core-owned deterministic placement of isolated boulders, rocky outcrops and scree near suitable steep slopes. Specify slope/biome suitability, distribution, terrain-triangle grounding, instance transforms and bounded appearance variants. Avoid placing decorative stones in ocean or overlapping trees unconditionally; define any spacing/exclusion rule explicitly.

Use a separately capped rock instance collection, shared geometry/materials and instanced rendering. Freeze its output schema/version and both host/client contracts together. Decorative rocks do not alter the terrain or hydraulic solver.

Acceptance: positions are reproducible and grounded on the displayed terrain, Local/Remote instances agree, and empty/maximum cases respect instance, memory and draw-call budgets. Verify replacement, failure cleanup and offline presentation.

### 6. Local geometric relief

Add biome/landform-sensitive small hills, subtle plain irregularities and slope grooves while preserving broad flat regions. First specify grid spacing, intended feature size and the resolution required to represent it; a 128x128 grid cannot represent arbitrarily fine geometry. Assess the current 512x512 and cell-iteration caps before proposing higher resolution. Keep visual normal/bump detail distinct from actual height changes.

Specify a new algorithm version for mathematical height changes, with deterministic seeds, amplitude bounds, operation order and an explicit position in the composition/erosion pipeline. Derive slopes, ecology and grounded instances from the final authoritative heights. Do not perturb the mesh independently in TypeScript. Retain the existing hydraulic kernel unless separately specified.

Acceptance: plains remain usable flat areas, fine relief does not introduce uniform mountain noise, heights stay finite/bounded, and complete Local/Remote output agrees. Test small/large grids, zero height and erosion extremes; measure real additional Core work and resource use.

### 7. Coastal detail

Add sandy, grassy and rocky coastal surfaces using Core-derived shoreline proximity, relative elevation and slope. Base coastline detection on the existing boundary-connected ocean mask, including its equality rule. Define coastal distance in documented grid/world units and blend it into the stage 2 surface weights. Version changed outputs and any settings explicitly.

Preserve dry inland depressions and the current sea level semantics. Shore classification changes surface appearance; it does not fill valleys, raise terrain, simulate tides or add a flat water overlay.

Acceptance: contrasting coast types follow the documented rules, inland low areas do not become beaches solely because they lie below sea level, and edge/zero-height/no-ocean cases are deterministic. Verify complete host parity, offline rendering and bounded additional work.

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

Build a sequential runner with immutable inputs, alternating execution order, warm-up, raw trial retention, statistics and JSON/CSV export. Use `landscape-ecology-hydraulic-v4` and `landscape-worker-json-v4` as the primary generation workload; evaluate any future capture workload separately. Follow [BENCHMARKING.md](BENCHMARKING.md).

Run a controlled size/iteration/seed matrix under documented network profiles. Keep compute, initialization, request overhead and rendering separate. Report failures and environment limits; browser smoke checks are correctness evidence, not a performance campaign.
