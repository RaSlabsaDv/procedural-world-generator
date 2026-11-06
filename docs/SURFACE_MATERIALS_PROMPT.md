# Implementation prompt — Stage 1: surface materials

Status: ready for implementation. This document is an instruction for future work; it does not mark Stage 1 complete.

## Objective

Implement Stage 1 of the landscape-detail roadmap: reusable textured surface materials for the existing Three.js terrain preview. Make close-up grass, soil, rock and snow more readable while preserving the current overview, ecological categories and generator results. Prepare a sand material asset for later coastal work without inventing beaches now.

Read AGENTS.md, PROJECT_BRIEF.md, ARCHITECTURE.md, LANDSCAPE_V3.md, DEVELOPMENT.md and the landscape-detail stages in IMPLEMENTATION_PLAN.md before editing code. Inspect the current geometry, preview lifecycle, tests, production asset pipeline and PWA readiness implementation.

## Scope and invariants

- Keep Angular, the shared C# Core, API/WASM contracts, parameters, v3 identities and hydraulic arithmetic unchanged. This is a presentation-only change.
- Preserve every height, triangle, winding, biome ID and tree placement. Do not add geometric displacement or generate ecological fields in TypeScript.
- Do not implement Core surface weights or new ecological blending rules; those belong to Stage 2. Existing vertex-color interpolation may remain.
- Leave lighting intensities, shadows, fog, tree variants, rocks, local relief, coasts and water behavior for their own stages. Do not add controls or mode selectors for unfinished stages.
- Keep identical texture scale and material configuration for Local/Remote views. Preserve camera retention/reset, on-demand rendering, pause during operations, numeric results after display failures and the existing tree budget.
- Documentation stays in English. README stays empty. Do not commit implementation changes until asked.

## 1. Inspect and select a bounded rendering approach

Start with terrain/rendering/terrain-geometry.ts, terrain-preview.ts, their tests, terrain/data/biome-presentation.ts and terrain.models.ts. Inspect src/client/ngsw-config.json, scripts/finalize-pwa.mjs, tests/build/test_publish_wasm.py and tests/browser/support/browser.cjs.

Use the installed Three.js version and current Lambert lighting. Prefer one terrain mesh and one material with a small isolated material/shader extension or atlas if needed; avoid per-cell meshes, per-triangle materials or large shader frameworks. Briefly document the chosen sampling strategy before implementation. No new package is expected; explain any genuinely necessary dependency before adding it.

Use fixed world/grid-space texture units, independent of seed, dimensions, sampled extrema, noiseScale and camera. Document the chosen repeat distance. Evaluate stretching on steep slopes: world-space triplanar projection is acceptable when needed, but normal-based projection weights are rendering math, not ecological surface weights. Inspect installed Three.js shader hooks before relying on them, keep the customization in one rendering module, and verify actual shader compilation in Chromium.

## 2. Add small local material assets

Provide tileable, restrained albedo/detail assets for grass, soil, sand, rock and snow under src/client/public/textures/terrain/ or an equivalent dedicated directory. Avoid recognizable large objects, strong baked directional shadows and visible seams. Snow should remain pale and rock should remain distinguishable from tundra.

Use original assets or assets with a clear redistribution license; keep provenance, license and any generation/reproduction instructions in a nearby English document. Do not hotlink assets or introduce a runtime CDN dependency. If texture synthesis is used, it is offline asset preparation, never runtime terrain generation.

Initial budgets: at most five source textures, each no larger than 512x512, at most 2 MiB total encoded asset bytes, and at most 8 MiB estimated uncompressed RGBA texture storage including mipmaps per viewport. If an atlas adds padding or dimensions, count the atlas in both limits rather than overlooking it. State the calculation and distinguish it from measured GPU memory. Prefer an atlas that replaces individual runtime textures rather than loading both copies. Any budget adjustment needs a documented reason before implementation.

## 3. Apply textures using existing categories

Keep a small explicit presentation mapping from the existing Core biome IDs to surface texture families. A suitable starting mapping is grass for Grassland, BroadleafForest and ConiferForest; soil for DryGrassland and Savanna; rock for Rock and Tundra; snow for SnowHighlands. Retain the biome palette as the low-frequency tint so forests, tundra and savanna remain distinguishable. Tune texture modulation instead of washing out the legend colors.

Ocean retains its existing presentation and receives no land texture. Sand is packaged and documented as reserved; no existing biome becomes a beach in this stage. Do not derive surface families from client-side moisture, temperature, slope or shoreline heuristics.

Target one terrain draw call per viewport and keep the existing at-most-six vegetation meshes. Avoid work proportional to cell count in the animation/render loop. Keep geometry topology and height buffers intact; additional presentation attributes must have a documented bounded size. All sampling must be stable when panning, regenerating, switching execution modes and rendering comparison views.

## 4. Integrate loading, timing and resource ownership

Load assets once per explicit ownership lifetime and share them across materials in that lifetime. Document whether ownership is per preview or shared/ref-counted; avoid unnecessary global cache abstractions. Replacing a result must not accumulate texture copies. Closing one comparison view must not dispose resources still used by the other.

Make async loading compatible with preview replacement and destruction. Ignore obsolete completions, dispose newly arrived resources that no longer have an owner, avoid drawing while the operation lock pauses the preview, and redraw when ready and unpaused. Clean up partially created materials/textures after failures and release all owned GPU resources on final destruction.

Define the display metric before changing it. Texture network/decode wait must not be labelled CPU setup time or added to computeMs/requestMs. Preserve the existing synchronous setup/first-submission metric with an accurate label, or report texture readiness separately if necessary. Do not count an untextured placeholder as a completed textured submission. Numeric generation results remain available on texture/shader/WebGL failure, with an explicit presentation error or clearly identified palette fallback. Do not report silent failure as successful textured rendering.

## 5. Production offline integration

Confirm all required texture assets are copied into the published application, included in the complete service-worker prefetch group and hashed offline catalog, and checked by readiness. Update asset patterns/finalization tests only where necessary; do not weaken complete-version validation or introduce an independent texture cache that can mix deployments.

Verify fresh online installation, offline reload, a new offline tab and new-seed Local rendering. Existing safe-update behavior must continue to load a complete matching version including textures. API results remain uncached.

## 6. Verification and acceptance

Add focused tests for the actual risks: fixed texture scale across rectangular/different-size maps, complete categorical material mapping, unchanged geometry/heights, bounded shared resources, async stale completions, load failures and cleanup on replacement/destruction. Existing generation and equivalence tests remain unchanged in meaning. Browser tests must exercise real texture decoding and shader compilation; a mocked renderer alone is insufficient.

Capture before/after normal, cold and warm landscapes with exact requests and fixed camera framing, at overview and close range. Include a steep slope and a rectangular map. Verify that grass/soil/rock/snow are visibly textured, repeat seams and stretching are acceptable, colors remain recognizable and Ocean stays unchanged. Test single and comparison views, repeated replacement, narrow layout, 512x512 terrain and the 16384-tree case. Record actual encoded bytes, estimated texture storage and draw calls; do not present smoke timings as a controlled performance campaign.

Run appropriate checks, normally:

```sh
npm --prefix src/client test -- --watch=false
python3 -m unittest discover -s tests/build -v
node --test tests/build/worker-rpc.test.mjs
dotnet restore ProceduralWorldGenerator.slnx --locked-mode
dotnet build ProceduralWorldGenerator.slnx --configuration Release --no-restore
dotnet test ProceduralWorldGenerator.slnx --configuration Release --no-build --no-restore
bash scripts/publish-app.sh
```

Launch the freshly published API/application using DEVELOPMENT.md, then run landscape.cjs, editor.cjs and pwa.cjs with the documented PWG_* environment. Run publishing and the PWA update scenario sequentially. Keep screenshots and browser evidence under ignored artifacts/.

Update DEVELOPMENT.md with material ownership, asset provenance, units, budgets, timing and offline verification. Mark Stage 1 complete in IMPLEMENTATION_PLAN.md only after the acceptance checks pass; leave Stage 2 and subsequent stages planned. Report changed behavior, verification, actual resource figures and any remaining limitations. Leave implementation changes uncommitted for review.
