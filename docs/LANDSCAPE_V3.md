# Climate and vegetation v3

Historical v3 result specification. Current generation preserves these terrain/ecology equations but extends the result with coverage v1 and v4 result/workload/profile identities; see [SURFACE_TRANSITIONS_V1.md](SURFACE_TRANSITIONS_V1.md). The original equations and evidence below remain unchanged.

Status: implemented and verified. V3 replaces the public generator in the existing editor; v2 remains historical evidence, not another runtime mode. No new dependencies are needed.

## Identity and required controls

Algorithm `diverse-landscape-v3`, result `landscape-ecology-v3`, workload `landscape-ecology-hydraulic-v3`, execution profile `landscape-worker-json-v3`. Keep `hydraulic-grid-v1`, its timestep, arithmetic and closed boundaries unchanged. Never pool v2/v3 timings.

All previous request fields remain required. Add globalWarmth (finite 0..1, default .6), vegetationDensity (finite 0..1, default 1), landformRegionScale (finite .25..4, default 1). These are illustrative normalized controls, not Celsius, physical forest inventory or map extents. Host omission/null is an error, never a default substitution. Existing dimensions, coverage-sum and work budgets remain unchanged.

## Terrain and environmental equations

Retain v2 lattice hash, fBm, warp, landform blending and all seeds. Only the regional mask's fBm coordinates change to wx*.65/landformRegionScale, wy*.65/landformRegionScale (division after multiplication). Larger scale means larger regions; base, rolling, ridge and detail coordinates do not change. At scale 1 pure composition matches v2.

Derive from final float32 heights after unchanged erosion. Retain v2 grid-spacing-1 centered/one-sided gradient and four-connected boundary ocean rule, including height==sea equality. Inland depressions remain dry unless connected; there is no lake filling or marine exchange.

At unwarped coordinates px=x*noiseScale, py=y*noiseScale, unsigned seed and normalized final height h (zero when bound is zero):

- moisture=clamp(globalMoisture+.7*(Fbm(px*.65+11,py*.65+23,seed XOR B5297A4D,4)-.5)-.15*h-.10*max(0,globalWarmth-.6),0,1).
- temperature=clamp(globalWarmth+.18-.5*h+.24*(Fbm(px*.3,py*.3,seed XOR 1B56C4E9,3)-.5),0,1).
- patch=Fbm(px*1.3,py*1.3,seed XOR 85EBCA6B,3).

Temperature is normalized warmth; spatial noise and elevation prevent a mandatory fixed latitude stripe. Hot climates modestly reduce moisture; colder climates do not fabricate extra water. Store moisture, temperature and slope as float32 before classification. Patch remains a double intermediate.

## Biome precedence (first matching rule)

1. Ocean=0 when boundary connected below/equal sea.
2. SnowHighlands=8 when h>=.55, temperature<=.20, slope<=1.2. Snow may cover slopes through 1.2; sharper cliffs stay rock.
3. Rock=4 when slope>.8 or h>.86 and temperature<.4.
4. Tundra=7 when temperature<=.28.
5. Savanna=6 when temperature>=.62, .25<=moisture<.53 and slope<.5.
6. DryGrassland=3 when moisture<.36.
7. Forest when moisture>=.53, slope<.5 and patch>.42: ConiferForest=5 when temperature<.48, otherwise BroadleafForest=2.
8. Grassland=1 otherwise.

Snow depends on both cold and elevation; it is not automatic at high altitude. Tundra may occur on plains/hills. Savanna has an explicit warm/moisture window; very dry land remains dry grassland. A single seed need not contain every biome. There are no seasons, lakes, rivers, wetlands, dynamic snow, brushes, presets, playback or repeated-trial runner in this phase.

## Vegetation, categories and monotonic density

TreeKind IDs: Broadleaf=0, Conifer=1, Savanna=2. A required kind member is added to every tree record. All previous instance members retain their units and order semantics. A quad is eligible only when all four corners belong to the same supported tree kind and every corner slope<.5. Grass, ocean, rock, tundra and snow have no trees.

Forest baseline density retains v2 clamp((moisture-.45)/.4,0,1)*(.45+.55*patch)*clamp(1-slope/.8,0,1). Savanna baseline density is .12*clamp((moisture-.20)/.33,0,1)*(.35+.65*patch)*clamp(1-slope/.8,0,1). Multiply the baseline by the vegetationDensity control, then cast to float32. Nonvegetated biomes have zero density regardless of the control. Biome classification does not depend on this control.

Retain mean-corner-density*.65 acceptance and all v2 hash salts for acceptance, x/z jitter, scale, rotation and independent priority. Retain float32 x/z before exact triangle height interpolation, sorted unique cellIndex and maximum 16384 output trees. At fixed other inputs, increasing density makes the accepted candidate set a superset before capping; existing candidates keep kind and transforms. Above the cap, lower fixed priorities may evict old entries. Shared retained entries never move; no full-cap subset guarantee is claimed. Density zero produces no trees but does not change biome coverage.

## Rendering and limits

Core decides biome, eligibility, tree kind and placement; TypeScript validates and displays them. Broadleaf uses a low-poly rounded crown, conifers a cone, savanna a broad flattened crown on a taller trunk. Use shared geometry/materials and two instanced meshes per nonempty kind: at most six meshes per viewport, independent of tree count. Render every returned record, no per-tree materials/components or renderer PRNG. Snow is a terrain biome color/material, not extra height or a separate simulation.

The cap stays 16384 trees, dimensions 2..512 and <=262144 samples, <=33554432 cell-iterations and <=2048 steps. Raw float field sizes remain the same as v2; each tree adds one categorical kind member. Measure actual JSON bytes and reserved WASM memory in production; neither is browser RSS or a device guarantee. Dispose all category meshes/materials/geometries on replacement, failure and destruction. Retain camera framing, pause during measured work, and keep numerical results if WebGL fails.

Core computeMs includes composition, erosion, environment, biome/snow classification, density, candidate/category decisions, bounded selection and allocation. Exclude validation, JSON, worker/HTTP, client normalization/comparison and display. Display CPU includes all category geometry/matrices and first submission; it is not GPU completion. Compare all numeric fields/transforms with 1e-6+1e-5 relative tolerance, and biome IDs, kinds and placement indices exactly.

## Verification evidence

Release build: zero warnings/errors. Native tests: 115 Core (including unchanged historical v1/v2 fixtures) and 37 API/export-contract tests. Angular: 109 tests. Packaging: three Python tests and the worker RPC Node test pass. The independently implemented tests/reference/climate_reference.py supplies literal float32 v3 expectations; no production generator is used to derive them.

Production Chromium 153.0.8010.52 smoke checks use tests/browser/landscape.cjs, editor.cjs and pwa.cjs with the PWG_* configuration in DEVELOPMENT.md. The six landscape cases include signed seed extremes, 2x2 zero-height, a rectangular request, normal/cold/warm climates and 512x512x128. Every field, category, tree transform and conservation summary agrees across WASM/API; the observed maximum numeric error is zero. All three tree kinds and all new biome IDs occur in the matrix. The maximum case returns 16384 trees and 14734796 UTF-8 response bytes in this build; reserved WASM memory grew from 33554432 to 120979456 bytes across the sequence. These figures describe this smoke run, not live managed memory, browser RSS, transferred bytes or a hardware guarantee. The main-thread heartbeat remained active. Timings in the raw evidence are diagnostic, not comparative research results.

Ignored artifacts/landscape-verification.json retains complete matrix requests, counts, bytes, timings and memory measurements; landscape-seed-42.png, landscape-seed-2026.png and landscape-seed--7.png show the normal, cold and warm editor previews. Editor regression covers real equivalence, retained results/errors, draft controls, responsive layout and offline 3D. PWA verification covers offline reload/new tab, Remote failure/recovery and safe version updates.
