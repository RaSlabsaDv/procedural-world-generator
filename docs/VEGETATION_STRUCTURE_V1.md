# Vegetation structure v1

Status: implemented and verified; frozen specification. Stage 4 changes density/placement and adds appearance variants, preserving terrain, climate, biomes, surface coverage and hydraulic arithmetic. Algorithm diverse-landscape-v4; result landscape-ecology-v5; workload landscape-ecology-hydraulic-v5; execution profile landscape-worker-json-v5; simulation hydraulic-grid-v1. No request controls or canonical limits change. Do not pool v4/v5 workload timings.

## Structure and final density

Retain the previous baseline forest/savanna density equations, evaluated with multiplier=1 and stored float32. The existing density array is updated in place after all biomes/slopes are known. No new full-map density/noise layers are returned.

At px=x*noiseScale, py=y*noiseScale and unsigned seed:

- grove=Fbm(px*.45+37,py*.45+19,seed XOR D6E8FEB9,3).
- clearing=Fbm(px*1.7+53,py*1.7+7,seed XOR A5A3564D,2).
- cluster=smooth(.32,.62,grove); opening=smooth(.30,.52,clearing).
- Broadleaf/conifer structure=(.12+.88*cluster)*(.20+.80*opening).
- Savanna structure=(.70+.30*cluster)*(.65+.35*opening); baseline remains capped at .12, so this never creates dense savanna forest.
- Forest edge attenuation=smooth(1,4,distance); Savanna edge attenuation=smooth(1,3,distance).
- final density=float32(((double)baselineDensity*structure)*edge*vegetationDensity).

smooth(a,b,x) uses u=clamp((x-a)/(b-a),0,1), then u*u*(3-2*u). All structure intermediates are double; no renderer noise or random source exists. The control multiplier is applied last and never influences masks, distances, hashes or variants. Density zero removes trees but preserves every biome and terrain field.

## Edge distance

A sample is eligible when it has a supported tree kind and stored float32 slope<.5. Unsuitable samples have distance 0. Eligible map-boundary samples and eligible samples with a four-connected unsuitable/different-kind neighbor have distance 1. Multi-source breadth-first propagation visits only eligible neighbors of the same kind; each next layer adds one. Outside the map acts as a boundary, not an infinite forest continuation. Distance is Manhattan grid steps, not meters. Narrow patches naturally become sparse. This pass never reclassifies a biome.

Use one int[N] distance array and one int[N] FIFO queue, at most 2 MiB combined at 512x512. Each eligible sample is queued once; no per-cell allocations, nearest-neighbor searches or three kind-specific distance maps. The two buffers are temporary, not wire fields. Existing quad eligibility remains: all four corners must have the same supported tree kind and slope<.5. Mean corner density drives acceptance; edge attenuation is not an additional geometry rule.

## Placement and variants

Retain all existing acceptance, x/z jitter, scale, rotation and independent priority hash salts, unchecked hash semantics, float32 x/z before exact triangle grounding, fixed row-major traversal, unique sorted cellIndex and 16384 cap. Candidate transforms remain stable as density rises. Before the cap candidates are monotonic; above it fixed lower priorities can replace entries, so no capped subset guarantee is made.

TreeVariant IDs Small=0 and Mature=1. Add required numeric variant to each tree record (eight required members). Select Small when LatticeValue(cellX,cellZ,seed XOR F1357AE5)<.4, otherwise Mature. This dedicated salt is independent of density, queue state, accepted counts and traversal. Kind is determined by existing biome eligibility. These are fixed illustrative appearances, not biological ages. Keep scale .6..1.4 and all other transform ranges unchanged.

## Rendering and budgets

At most two nonempty groups per kind, trunks/crowns per group: <=12 vegetation meshes plus one terrain mesh, <=13 color calls and <=13 initial caster calls. No per-tree components/materials, skipped returned instances or extra assets. Small and Mature use different fixed geometry proportions and restrained colors, with low-poly geometry comparable to the existing cylinder/icosahedron/cone meshes. All matrices come from Core. Existing shadow fitting includes actual geometry bounds, and the 2048 PCF configuration, surface textures and static reuse remain unchanged. Resource disposal is group-owned and bounded.

Current mature proportions: broadleaf trunk .82/crown radius .58 at y1.18 with scale(1.05,.85,1); conifer trunk .70/cone radius .48 height1.55 at y1.18; savanna trunk1.22/crown radius .72 at y1.28 with scale(1.4,.32,1.15). Small: broadleaf trunk .48/crown radius .36 at y.72 scale(.9,1.05,.95); conifer trunk .42/cone radius .29 height.95 at y.72; savanna trunk .80/crown radius .46 at y.86 scale(1.15,.45,1). These are presentation definitions, not additional Core height outputs. Tree Y remains ground level. Trunk radii are .032/.055 for Small, .045/.075 for Mature, five segments; cones use six segments, icosahedra detail0. No geometry exceeds the prior per-tree triangle order of magnitude.

Core time includes structure/edge allocation, density modification, variant decisions and priority selection. JSON, transport, decoding, comparison, instancing, bounds and shadow setup remain outside. Record actual JSON bytes, variant counts, mesh/pass counts and reserved WASM memory in production; none is a controlled performance campaign or a mobile guarantee.

## Historical evidence

Before implementation, landscape-v4-fingerprints.json captured five 129x97, 16-step requests from revision b4e2573, including all three kinds, nonempty vegetation and extreme signed seeds. Every old field, including surface weights, is hashed with documented little-endian encoding. Historical v3/v4 density/placement assertions use minimal test-only frozen helpers under Historical/V3; unchanged current fields are compared directly. Existing v1/v2 references and literal expectations are retained. New structure/variant references are independently computed before production implementation.

## Verification evidence and limits

Release build: zero warnings/errors. 137 Core and 38 API tests pass; Angular has 156 passing tests. Four Python packaging/asset tests and worker RPC pass. Historical v3/v4 fingerprints reproduce the old density/placement with frozen test-only helpers and compare all unchanged current fields directly; retained uncapped current tree transforms match historical placements. Independent Python literals freeze masks and variant decisions, and the native allocation test verifies the two-integer-buffer edge-pass bound plus fixed overhead. No thresholds were adjusted after the initial specification.

Production Chromium 153.0.8010.52 passes materials.cjs, landscape.cjs, lighting.cjs, editor.cjs and pwa.cjs. The seven-case matrix includes signed seed extremes, zero height, rectangular/minimum maps, cold/cool/warm scenes and 512x512x128. Every numeric field/transform matches with maximum observed error zero; kind, variant and index agree exactly. All six kind/variant pairs appear. The maximum case returns 16384 trees (6439 Small, 9945 Mature in that run), with 17526721 UTF-8 response bytes and 151977984 reserved WASM bytes across the sequence. These are smoke diagnostics, not peak managed memory/RSS or controlled comparative timings. No v4/v5 performance advantage is claimed.

Five browser presentation scenes retain complete numeric inputs and overview/close images: normal, cold, warm, conifer and mixed. The mixed scene has all six groups and exactly thirteen color and initial caster calls per view. The maximum cap case has two Broadleaf variant groups and five calls per pass; matrix storage is 2097152 bytes. Four active surface textures and 2048 PCF color/depth attachments (32 MiB/view estimate) stay unchanged. Static map reuse, paused work, minimum ocean, repeated replacement, two-view removal, narrow layout, offline new seeds and safe updates pass.

Raw ignored artifacts: landscape-verification.json (complete cross-mode matrix), vegetation-materials-verification.json (counts, instance bytes, ownership/passes and requests), vegetation-before/after-* images, and vegetation-maximum-* screenshots. Cold terrain can have no trees if eligible forest patches are narrower than the attenuation width. Small/Mature are fixed visual variants, not simulated age. Whole-map shadow resolution and desktop smoke memory limits remain; no mobile guarantee is made.
