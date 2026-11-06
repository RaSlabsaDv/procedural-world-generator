# Implementation prompt — Stage 2: Core-owned surface transitions

Status: Stage 2 implemented and verified. Original instructions are retained below for traceability; completion evidence and Stage 3 are recorded in IMPLEMENTATION_PLAN.md.

## Objective

Replace the renderer's categorical surface-family selection with continuous coverage weights computed by the shared C# Core. Make grass/soil, exposed rock and snow transitions visibly smoother, including their base colors rather than only texture grain. Keep the current editor and identical Local/Remote computation paths.

Read AGENTS.md, PROJECT_BRIEF.md, ARCHITECTURE.md, LANDSCAPE_V3.md, DEVELOPMENT.md and Stage 2 in IMPLEMENTATION_PLAN.md. Inspect the committed Stage 1 implementation (610d26e), especially LandscapeEcology, TerrainMap, shared host serialization, strict client decoding/comparison, terrain-geometry.ts, terrain-surfaces.ts, preview lifecycle and browser resource checks.

## Invariants

Preserve composition, hydraulic-grid-v1 arithmetic, heights, simulation summaries, environment arrays, categorical biome IDs, vegetation density, tree kinds and all tree placements exactly for an identical request. No new request controls, ecological classifications, noise passes or tree rules are needed. Keep every existing canonical work/dimension/tree limit.

Surface coverage is a derived appearance field, not ecological suitability. A gradual rock/snow surface must not remove trees, reclassify a biome, change collision geometry or fill inland depressions. Three.js displays supplied weights; do not duplicate their environmental equations in TypeScript or GLSL.

Keep Stage 1 textures, four-unit triplanar scale, lighting, tree meshes, ownership, pause behavior and separate asset-wait/CPU metrics. Do not implement Stage 3 lighting, shadows/fog, coast detection, sand beaches, rivers/lakes, forest variants, rocks, local relief, presets, playback or benchmark running. No new dependency is expected. Documentation is English; README stays empty. Leave implementation changes uncommitted for review.

## 1. Freeze the surface specification first

Create docs/SURFACE_TRANSITIONS_V1.md before implementing the equations. Record field layout, operation order, constants, float conversion, ocean behavior, color blending, timing and resource budgets. Constants belong in a small Core surface-coverage component, separate from biome classification.

Keep algorithmVersion = diverse-landscape-v3 and simulationVersion = hydraulic-grid-v1 because the existing generation equations remain unchanged. Introduce resultVersion = landscape-ecology-v4, workload = landscape-ecology-hydraulic-v4 and executionProfile = landscape-worker-json-v4 for the extended result and additional Core work. Do not pool old/new timings. Both hosts and the client must switch together; do not add a version selector or compatibility fallback that fabricates missing weights.

Preserve LANDSCAPE_V3.md and its literal expectations as historical evidence. Establish a frozen representative v3 output fixture before changing the result shape, including nonzero erosion and vegetation. Retain the existing historical v1/v2 tests unchanged. This task must explicitly prove that only the new derived field and envelope identities change; a full duplicate production pipeline is unnecessary if independent literals/fingerprints adequately preserve all unchanged fields.

## 2. Use a bounded, explicit weight contract

Add one required numeric float32 array, surfaceWeights, to TerrainMap. Use row-major interleaved layout:

surfaceWeights[5 * (y * width + x) + channel]

Freeze channel IDs: Grass=0, Soil=1, Sand=2, Rock=3, Snow=4. Every sample has five entries. Sand is exactly zero in this phase. Ocean samples have all five weights exactly zero; every land sample has finite weights in [0,1] whose sum is 1 within the documented float32 tolerance (initially 1e-6). All-zero Ocean is intentional: the existing ocean appearance is represented separately, not as soil or sand.

Use a float[] numeric JSON array, not per-cell objects or byte[] default base64 serialization. Add no redundant wire layers or per-cell allocations. At 512x512 the field contains 1310720 floats, 5242880 raw bytes (5 MiB). Client Float32Array storage is another 5 MiB; document ownership and peak copies. Reuse the four active GPU channels rather than adding five independent float textures. A packed four-float vertex attribute costs at most 4 MiB and must replace the old one-hot attribute. Sand remains wire-reserved and GPU-unused until the coastal stage.

Measure actual added JSON bytes, decoding cost and memory in production. These raw bounds do not describe total runtime/browser/GPU memory. Do not raise work/size caps or switch transport format to conceal payload growth.

## 3. Derive coverage in Core

Run one deterministic O(width*height) pass over final float32 heights, the existing ocean/biome result and existing float32 moisture, temperature and slope. Use double intermediates, fixed channel order and one final cast per weight. No extra random source, spatial blur, erosion pass or client-side derivation is needed.

Use the following initial rules in the specification. Define smooth(a,b,x) as u*u*(3-2*u), where u=clamp((x-a)/(b-a),0,1). Let h be final height divided by the float32 height bound, or zero for a zero bound; m, t and s are the already stored moisture, temperature and slope values.

- Ocean: return five zeros before evaluating land rules.
- snow = smooth(.45,.65,h) * (1-smooth(.18,.30,t)) * (1-smooth(1.0,1.4,s)).
- exposedRock = smooth(.45,1.05,s).
- grassSuitability = smooth(.28,.60,m) * smooth(.18,.38,t).
- Snow = snow.
- Rock = (1-snow) * exposedRock.
- remaining = (1-snow) * (1-exposedRock).
- Grass = remaining * grassSuitability.
- Soil = remaining * (1-grassSuitability).
- Sand = 0.

Write output in the fixed wire channel order after computing these named intermediates. The priority is snow, then exposed rock, then the grass/soil mixture; no categorical biome switch creates hard land-cover boundaries. This is illustrative surface coverage, not physical vegetation or snow simulation. Smooth snow appearance can extend beyond the categorical SnowHighlands boundary without changing that category.

Inspect these ranges against the frozen biome rules and representative normal/cold/warm scenes while specifying them. If a change is necessary, document it and freeze the final equations and independent reference literals before production implementation. Do not quietly tune constants after golden tests or cross-mode comparisons fail. Do not modify existing biome rules to match the new appearance.

## 4. Extend both hosts and strict client contracts

Update Core result construction, API/WASM source-generated serialization where needed, TypeScript models, fixtures, versions and strict decoding together. No request field/default changes are required. Missing weights, wrong lengths, nonnumeric/base64/object data, non-finite values, negative/out-of-range weights, nonzero sand, invalid land sums and nonzero ocean vectors are protocol errors. Check raw and normalized float32 values consistently; reject malformed vectors rather than silently repairing them.

Normalize into independent Float32Array storage. Preserve the existing exact echoed-request and version checks, host validation errors and no-store behavior. Extend complete Local/Remote comparisons to every weight using abs(a-b)<=1e-6+1e-5*max(abs(a),abs(b)); categorical IDs/kinds/indices remain exact. Report coverage discrepancies distinctly or in a clearly labelled existing count. Build identity remains separate from numerical agreement.

Core computeMs includes coverage allocation and derivation on both paths. Parsing, preparation, JSON, worker/HTTP transfer, decoding, comparison and rendering remain outside that boundary. Preserve the single worker/runtime and sequential equivalence workflow.

## 5. Blend actual surface appearance in Three.js

Replace BIOME_SURFACE-derived one-hot attributes with the supplied Grass/Soil/Rock/Snow values. The renderer may unpack channels and interpolate them across the existing triangles, but must not recompute suitability, classify slopes/temperature or blur categories. Preserve heights, topology, triangle winding, normals, tree positions and camera framing.

Blend both linear-space base surface colors and texture detail with the supplied weights. Merely changing detail modulation while keeping strong categorical vertex-color boundaries does not satisfy this stage. Define a small rendering palette for the surface channels; keep colors readable and compatible with grassland, forest, tundra and snow. Do not introduce another ecological palette-selection rule in the shader. The biome legend describes Core categories; document that visible ground is a mixture and cannot be read back as an exact category color.

At a vertex, Ocean has coverage zero and retains its existing color. Between ocean and land vertices, retain ordinary triangle interpolation without adding coastal data; the ocean contribution can use the interpolated complement of the summed land weights. Do not renormalize a mixed coast fragment to pure land, classify it as sand or invent a water overlay. At land vertices use the normalized supplied weights; numerical safeguards must not conceal invalid wire data.

Keep one terrain mesh/material/draw call per viewport and at most six existing vegetation meshes. Use the same four active textures, five prefetched assets, texture budget and async ownership as Stage 1. Preserve error handling, stale completion guards, replacement/disposal, paused setup/rendering and separate asset-wait/CPU metrics. Verify real shader compilation in the installed Three.js/browser environment.

## 6. Verify correctness, appearance and budgets

Add an independent small reference fixture for the new equations, without importing production Core code. Cover ocean zeros, zero height, flat wet/dry land, cold elevated snow, steep bare rock, very steep snow reduction, all smoothstep endpoints and nearby continuity. Assert finite/bounded weights, normalized land vectors, exact sand zero, independent storage and deterministic repetition, including extreme signed seeds and rectangular/minimum/maximum maps.

Compare all pre-existing output fields against the frozen v3 baseline, including erosion summaries, biome arrays, tree counts, kinds and transforms. Test real API/export JSON parity, required numeric weight layout, version rejection and unchanged request-validation behavior. Add strict frontend corruption cases, last-cell weight mismatch detection, unchanged geometry and rendering lifecycle checks. Do not replace old expectations with current generator output.

Extend materials.cjs and landscape.cjs to validate complete coverage vectors and full Local/Remote parity. Keep test-only GPU instrumentation; add no product debug API. Record field bytes, JSON bytes, reserved WASM memory, client/GPU attribute bounds, four active detail textures, one terrain draw call and at most seven terrain/tree calls per view.

Capture before/after normal, cold and warm scenes at identical requests and camera framing, both overview and close range. Include forest edges, dry-to-green land, rocky slopes, snow boundaries, a rectangular map, all-ocean/zero-height cases and 512x512 with the existing tree cap. Check that broad plains remain readable and that improved transitions are visible in base color as well as texture. A seed need not contain every category; use multiple fixed scenes.

Run existing editor and production PWA scenarios: offline reload/new tab/new seed, Remote unavailable/recovery, complete-version updates and unchanged API cache exclusion. Record errors and actual resource figures under ignored artifacts/. Smoke timings are correctness/resource evidence, not benchmark conclusions.

## 7. Build, document and hand off

Run the relevant checks, normally:

```sh
dotnet restore ProceduralWorldGenerator.slnx --locked-mode
dotnet build ProceduralWorldGenerator.slnx --configuration Release --no-restore
dotnet test ProceduralWorldGenerator.slnx --configuration Release --no-build --no-restore
npm --prefix src/client test -- --watch=false
python3 -m unittest discover -s tests/build -v
node --test tests/build/worker-rpc.test.mjs
bash scripts/publish-app.sh
```

Restart the freshly published application and run materials.cjs, landscape.cjs, editor.cjs and pwa.cjs using the documented PWG_* configuration. Do not overlap publishing, native builds or the PWA deployment-mutation scenario.

Update ARCHITECTURE.md, DEVELOPMENT.md, PROJECT_BRIEF.md, BENCHMARKING.md and IMPLEMENTATION_PLAN.md to reflect the extended result, timing and measured resource impact. Retain the historical v3 specification and Stage 1 provenance/assets. Mark Stage 2 complete only after all acceptance checks pass; Stage 3 lighting remains next. Report behavior, verification, limitations and any justified specification adjustment. Leave changes uncommitted until the user requests a commit.
