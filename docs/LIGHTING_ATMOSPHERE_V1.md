# Lighting and atmosphere v1

Historical Stage 3 evidence is retained below. Its light/fog/shadow settings remain current; Stage 4 expands vegetation batching to at most twelve meshes and thirteen calls per color/caster pass. See [VEGETATION_STRUCTURE_V1.md](VEGETATION_STRUCTURE_V1.md).

Status: implemented and verified; configuration frozen after paired visual evaluation. Rendering revision daylight-shadow-v1. All Core algorithms, v4 contracts, surface weights, transforms and workload identities remain unchanged.

## Configuration

Use the installed Three.js 0.187.0 Lambert path. One HemisphereLight (sky #dde8f1, ground #81775e, intensity 1.05) and one DirectionalLight (sun #fff4df, intensity 2.35) replace white ambient 1.6/sun 1.8. Sun direction is normalize(-1,2,1). Preserve existing output color space and tone mapping. These are illustrative settings, not calibrated lux.

Background and linear fog use #bcc9ce. Fog near=2.2*span, far=7*span, span=max(width-1,height-1,heightMultiplier,1). No animation or external sky assets. Foreground remains clear at the default overview; far zoom intentionally fades toward the background.

## Shadow fitting and updates

Initial evaluation used 1024x1024; fixed 2048x2048 PCFShadowMap per viewport is selected. The first close-range evaluation showed coarse tree shadows and contour-like self-shadow artifacts; doubling resolution improves texel density within the stated budget. PCFSoftShadowMap is removed in the installed source and would only produce a warning/fallback. PCF uses hardware depth comparison plus the installed shader's filtered sample kernel. Both renderer and light shadow autoUpdate=false, needsUpdate=true once on scene setup; installed WebGLShadowMap clears both dirty flags after first rendering.

Union the request's centered X/Z extent and Y=[0,heightMultiplier] with the existing instanced-tree world bounding boxes, computed once. Target the union center; position the sun along its fixed normalized direction by boundsDiagonal+2*span. Transform the eight bounds corners into the shadow camera's light space. Fit X/Y with padding=max(.025*span,.1); near=max(.01,-maxZ-padding), far=max(near+.1,-minZ+padding). Keep the camera independent of orbit/zoom/pan and explicitly update the target and matrices. No per-frame terrain/tree scans.

Terrain casts and receives shadows; its shadow-only side is DoubleSide because the heightfield is an open surface. Instanced trunks/crowns cast but do not receive, avoiding unnecessary tree self-shadow artifacts. Main materials/geometry and instance matrices stay unchanged. Initial evaluation used bias=-.00015, normalBias=.04; final configuration uses bias=-.0005, normalBias=.08 world units, radius=1. Paired normal/cold/warm close views removed the prominent contour artifacts while retaining grounded tree shadows. No light/fog intensity or surface-rule adjustment was needed.

## Resources, lifecycle and timing

One color pass has <=7 terrain/tree calls; an initial directional shadow pass adds <=7 caster calls. Subsequent camera-only renders reuse the map. Four active surface textures remain independent of shadow attachments. The installed non-VSM directional target has one RGBA8 color texture and an UnsignedInt depth texture using DEPTH_COMPONENT24, no MSAA/mips. Budget conservatively four bytes per depth texel: 2048²*(4+4)=33554432 bytes (32 MiB) per view, 64 MiB for two, below the 64/128 MiB limits. Production Chromium confirms these allocation formats/dimensions; this is attachment storage, not total GPU memory/RSS.

Each preview owns its sun/shadow target and hemisphere light. Idempotent cleanup disposes the shadow once before renderer disposal, removes lights/target and releases scene fog/background references. The installed render-target disposal owns/releases its attached depth texture; avoid a second explicit depth disposal. Preserve existing stale asset completion, retry, pause and context-loss guards.

Shadow bounds, setup and initial map/submission are display CPU work; no GPU-completion claim. Texture wait and paused time remain excluded. Both scene setup and all render/shadow passes wait while the shared operation is paused. Core computeMs/requestMs are unchanged.

## Verification evidence and limits

147 Angular tests cover light-space containment, request/actual-tree bounds, minimum/rectangular/maximum dimensions, zero height, repeatable configuration, transforms and resource cleanup, alongside existing surface/camera/async tests. All 127 Core and 37 API tests, four Python packaging/asset tests and Node worker RPC test pass; Release build has zero warnings/errors. Core, host contracts and mathematical source files are unchanged in this stage.

Production Chromium 153.0.8010.52 (SwiftShader) passes lighting.cjs, materials.cjs, landscape.cjs, editor.cjs and pwa.cjs. Test-only GL instrumentation confirms one 2048x2048 RGBA8 color attachment and one DEPTH_COMPONENT24 depth attachment, one level, four active surface textures, and one initial directional pass. Both passes contain <=7 terrain/tree calls; orbit/zoom/reset add color passes only. During a real 129x97x256 worker computation, synthetic wheel events add no render passes. A fresh minimum 2x2 zero-height ocean scene creates valid targets and one terrain caster call.

Two comparison views own independent targets; closing one removes both of its attachments and surface uploads. Repeated result replacement retains only the active target. The maximum 512x512 scene renders 16384 trees with bounded calls. Separate landscape checks through 512x512x128 retain exact categorical agreement and zero observed numeric error across WASM/API. Offline reload/new tab/new seed, Remote recovery, API cache exclusion and safe version updates continue to pass.

Raw ignored evidence: artifacts/lighting-verification.json (orbit/pause/minimum), lighting-materials-verification.json (fixed requests, one/two-view allocations, replacement, maximum instances, offline) and landscape-verification.json (complete mathematical parity). lighting-before/after-* images use matching rectangular requests/framing, lighting-1024-* retains the initial quality comparison, and lighting-maximum-overview/close.png records the 512x512 view. Diagnostic coverage API requests are parsed inside the page and return only small summaries to avoid CDP response-body eviction. They are outside product timing and are not benchmark samples.

The conservative 32 MiB estimate covers shadow attachments only, not browser RSS, surface textures, geometry, default MSAA buffers or driver allocation. Two-view memory is larger and no mobile guarantee is made. A fixed whole-map shadow has finite texel density; close-up ridge silhouettes can show residual aliasing and maximum-size tiny trunks cannot have uniformly sharp contact shadows. The larger map and final biases remove prominent contour acne at the evaluated normal/cold/warm views, without promising artifact-free shadows at every extreme setting. Far zoom intentionally increases fog. CPU submission time is not GPU completion, and no controlled performance conclusions are drawn.
