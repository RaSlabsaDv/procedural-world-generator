# Implementation prompt — Stage 3: lighting, shadows and atmosphere

Status: Stage 3 implemented and verified. Original instructions are retained for traceability; completion evidence and Stage 4 are recorded in IMPLEMENTATION_PLAN.md.

## Objective

Improve depth, terrain readability and tree grounding in the existing Three.js editor using reproducible daylight, bounded directional shadows and subtle distance fog. Build on the committed surface-coverage implementation (395fa7c). Keep surface colors recognizable and the same scene configuration for Local/Remote views.

Read AGENTS.md, PROJECT_BRIEF.md, ARCHITECTURE.md, DEVELOPMENT.md, BENCHMARKING.md, SURFACE_TRANSITIONS_V1.md and Stage 3 in IMPLEMENTATION_PLAN.md. Inspect terrain-preview.ts, terrain-forest.ts, terrain-surfaces.ts, camera/disposal tests and the production browser scripts before editing code. Inspect the installed Three.js implementation/types for shadow rendering, render-target allocation, fog and Lambert shader hooks rather than assuming behavior from another release.

## Invariants and scope

- This stage changes presentation only. Preserve Core, request/result schemas, all generation/environment/coverage fields, biomes, trees and numeric equivalence checks.
- Keep algorithm diverse-landscape-v3, result landscape-ecology-v4, workload landscape-ecology-hydraulic-v4, execution profile landscape-worker-json-v4 and simulation hydraulic-grid-v1 unchanged. Record a separate rendering revision/configuration in browser evidence.
- Retain Lambert surface materials, the existing textures, four-unit triplanar sampling, coverage-based color blending and all instance transforms. No displacement, ecological shader rules or tree-position adjustments.
- Keep the single editor, current numeric controls, camera retention/reset, comparison views, offline behavior and recoverable display errors. Use one fixed default presentation configuration; do not add unfinished quality controls or day/night settings.
- Do not implement forest variation, rocks, local relief, coast classification, water overlays, clouds/weather, sun animation, playback, postprocessing or a benchmark runner. Do not add PBR texture packs, bloom, SSAO, cascaded shadows or dependencies in this stage.
- Documentation stays English, README stays empty. Leave implementation changes uncommitted for review.

## 1. Establish the baseline and freeze the rendering configuration

Capture current normal/cold/warm rectangular landscapes at the exact requests and overview/close camera framing used by materials.cjs. Include a dense forest and a steep, snow-covered slope. Retain screenshots and parameters under ignored artifacts/ before changing lighting.

Create docs/specs/LIGHTING_ATMOSPHERE_V1.md before implementation. Specify the fixed light direction/colors/intensities, ambient/fill approach, background/fog, shadow type, resolution, camera fitting, bias/normal bias, texture/target budgets and measurement boundaries. Keep related constants in a small rendering configuration/helper module. Avoid expanding the preview constructor into a second general-purpose scene framework.

Evaluate current AmbientLight(white,1.6) and DirectionalLight(white,1.8): reduce flat ambient wash while retaining readable shadowed slopes and ground under trees. A fixed hemisphere fill plus one directional sun is acceptable, as is a restrained ambient fill with the sun. Choose one approach, document it and freeze its actual constants after visual evaluation. Preserve the normalized sun direction across seeds, sizes and execution modes; positioning may scale with the request bounds. There is no required physically calibrated lux claim.

Keep output color space/tone mapping consistent across views. Inspect the existing renderer settings and change them only with a documented visual reason. Avoid solving shadow darkness by washing out snow, soil and grass colors or changing coverage equations.

## 2. Add bounded directional shadows

Use one shadow-casting directional light and the installed Three.js soft-PCF path if supported by the existing renderer. No cascades, point-light cube maps or per-tree lights. Start with a fixed 1024x1024 map per viewport. A move to at most 2048x2048 is allowed only after documenting observed quality and resource impact within the budget below; use one fixed selected resolution across modes and map sizes for this rendering revision.

Make terrain cast and receive shadows. Existing instanced tree trunks/crowns cast shadows; enable receiving on trees only after checking self-shadow artifacts and cost. Do not add per-tree meshes/materials, duplicate instances or alter geometry to produce contact shadows. Retain the existing one terrain mesh and at-most-six vegetation meshes.

Fit the orthographic shadow camera in light space to the request-based terrain extent, height bound and actual instanced-tree bounds/headroom. Compute the bounds once per scene setup, not per camera movement or frame. The fit must enclose terrain and tree tips with modest documented padding, positive near/far ranges and no degenerate axes for 2x2 or zero-height requests. Keep height framing based on the request; do not normalize maps using their own sampled extrema. Include tree bounds once using the existing instance data or a justified conservative bound derived from the actual geometry and allowed scale.

The light target must be positioned/updated explicitly. Keep the shadow frustum fixed while orbiting/panning to avoid camera-dependent shimmering and repeated shadow work. Tune small bias/normal bias against steep slopes, flat ground and tree bases. Do not hide acne with visibly detached shadows or omit valid casters.

Treat the map as static for an unchanged scene: request one shadow update after geometry/light setup and reuse it during camera-only renders. Mark it dirty only for genuine scene/light changes or context recreation. Rebuilding a result must produce a new correct map. No shadow pass may run while a shared operation pauses setup/rendering. Ensure installed Three.js autoUpdate/needsUpdate semantics actually implement this behavior.

## 3. Add restrained atmosphere

Use built-in distance fog with a compatible background color, without sky textures or external assets. Prefer a simple linear fog definition with near/far distances expressed as fixed multiples of the request-based span, where span=max(width-1,height-1,heightMultiplier,1). Freeze the selected ratios and color in the rendering specification.

Keep the foreground and default overview legible. Fog should add depth at distance, not cover most of a small map or erase distant snow/forest silhouettes. It must remain coherent after orbit, zoom, pan, camera reset, zero-height generation and switching between single/comparison views. Both views receive the same configuration and scale rule, even at different viewport widths. Fog is presentation, not a temperature/moisture input.

Keep the existing Lambert shader extension compatible with Three.js fog and shadow chunks. Verify actual browser compilation and rendering with textures, coverage, fog, terrain shadows and instanced trees together. Do not replace the entire lighting shader or reimplement Core rules to bypass integration issues.

## 4. Enforce resource and timing boundaries

Keep four active detail textures per viewport. Count shadow resources separately, including every color/depth attachment and any additional renderer-owned targets for the selected shadow method. Inspect actual dimensions/formats and estimate storage; do not assume one map equals one four-byte texture. Initial additional shadow-target budget is at most 64 MiB per viewport and 128 MiB for two views, with no mip chain unless explicitly required. Prefer substantially lower actual use. Never identify this estimate as total GPU memory or browser RSS.

The main color pass remains at most seven terrain/tree draw calls. One initial directional shadow update may add at most seven eligible caster calls; camera-only renders should return to the color-pass count. Record main/shadow pass counts separately, rather than applying the old seven-call total limit to a frame that legitimately contains both passes. No O(sample-count/tree-count) work is permitted in the camera/render loop.

Shadow setup and the first map/submission belong to display CPU setup/first submission, outside computeMs and requestMs. Preserve separate texture asset waiting and paused time. CPU submission time does not measure GPU completion, and the future benchmark runner must defer rendering during measured trials. Do not reinterpret added GPU work as C# generator performance.

Own/dispose the light, shadow render target and any helper resources with the preview scene, including after setup/shader failure, result replacement, view removal, context loss and component destruction. Inspect renderer/light disposal behavior and explicitly release owned shadow resources where required without double-disposing shared resources. Closing one comparison view must not invalidate the other. Retain existing texture-owner retry/stale-completion protections.

## 5. Tests and production evidence

Add focused tests for light-space bounds and padding, minimum/rectangular/maximum dimensions, zero height, tree headroom, stable configuration across modes, and finite ordered shadow near/far ranges. Test static map invalidation versus camera-only renders, paused setup, initial submission timing and cleanup of shadow resources on replacement/failure/destruction. Preserve existing camera and texture lifecycle tests. Do not substitute mocked draw calls for real visual verification.

Add a dedicated tests/browser/lighting.cjs or extend the existing materials scenario where maintainable. Use test-only renderer/WebGL instrumentation, with no product debug API, to verify shadow allocation, main/shadow pass counts, reuse while orbiting and cleanup after repeated generations and comparison-view removal. If readback/CDP instrumentation requires extra buffers, record that test overhead separately from application resource figures.

Capture before/after fixed-request normal, cold and warm scenes at overview and close range. Include flat ground under trees, steep ridges, snowy slopes, all-ocean/zero-height terrain, a rectangular map and 512x512 terrain with 16384 returned trees. Confirm visible grounding and relief without flicker, clipping, severe acne, detached shadows or overly dark forests. Record actual settings, browser/software-GPU environment, errors and remaining limits. Full-map shadow texel density is finite; document close-up limitations rather than claiming equally sharp shadows at every zoom.

Test single and comparison views, narrow layout, repeated replacements, camera reset and interaction during/after computation. Run real Local/Remote equivalence, offline reload/new tab/new-seed generation, Remote failure/recovery and safe PWA updates. No new network asset is expected. Verify the complete existing cache still works and API responses remain uncached.

## 6. Verification, documentation and handoff

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

Restart the freshly published app, then run the lighting scenario and materials.cjs, landscape.cjs, editor.cjs and pwa.cjs with the documented PWG_* environment. Update existing instrumentation to distinguish initial shadow updates from color-only frames. Keep publishing, native builds and PWA deployment mutation sequential. Broaden/repeat checks only for subsequent changes, failures or unresolved concerns.

Update ARCHITECTURE.md and DEVELOPMENT.md with configuration, scale rules, resource ownership, actual targets/draw counts, timing and limitations. Keep BENCHMARKING.md clear that rendering is excluded from computation comparisons. Mark Stage 3 complete in IMPLEMENTATION_PLAN.md only after acceptance checks pass; Stage 4 forest structure remains next. Keep Core/surface specifications and historical fixtures intact.

Report visible changes, verification results, actual shadow resolution/storage estimates, measured draw counts and known quality limits. Smoke timings are not a controlled performance campaign. Leave implementation changes uncommitted until requested.
