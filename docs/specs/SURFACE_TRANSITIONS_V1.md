# Surface coverage v1

Historical base-coverage specification. Stage 7 applies coastal appearance after placement under diverse-landscape-v7 and v8 result/workload/profile identities; sand is now active in final coverage. The base equations and original evidence below remain frozen. See [COASTAL_SURFACES_V1.md](COASTAL_SURFACES_V1.md).

Historical Stage 2 identities are retained below. Coverage equations/layout remain current; Stage 4 changes vegetation and uses diverse-landscape-v4 with v5 result/workload/profile identities. See [VEGETATION_STRUCTURE_V1.md](VEGETATION_STRUCTURE_V1.md).

Status: implemented and verified; frozen specification for Stage 2. The height generator remains diverse-landscape-v3 and simulation hydraulic-grid-v1. Extended result: landscape-ecology-v4; workload: landscape-ecology-hydraulic-v4; execution profile: landscape-worker-json-v4. Requests and all canonical limits remain unchanged. Do not pool v3/v4 timings.

## Contract and arithmetic

Required surfaceWeights is a numeric float[] JSON array of length width*height*5, row-major interleaved Grass=0, Soil=1, Sand=2, Rock=3, Snow=4. Sand is exactly zero. Ocean vectors are exactly zero. Every land vector is finite, in [0,1], with sum within 1e-6 of one after float32 storage. No transport fallback or client normalization repairs malformed vectors.

One O(N) Core pass reads final float32 heights, biome/ocean IDs and stored float32 moisture, temperature and slope. Use double intermediates and one final cast per channel. Define h=height/(float)heightMultiplier, or zero for zero bound. Let smooth(a,b,x): u=clamp((x-a)/(b-a),0,1); return u*u*(3-2*u).

For Ocean return five zeros first. Otherwise compute in this order:

1. snow=smooth(.45,.65,h)*(1-smooth(.18,.30,t))*(1-smooth(1.0,1.4,s)).
2. exposedRock=smooth(.45,1.05,s).
3. grassSuitability=smooth(.28,.60,m)*smooth(.18,.38,t).
4. Snow=snow; Rock=(1-snow)*exposedRock.
5. remaining=(1-snow)*(1-exposedRock).
6. Grass=remaining*grassSuitability; Soil=remaining*(1-grassSuitability); Sand=0.
7. Store float32 in fixed channel order, without a second normalization pass.

All proposed thresholds are retained. They bracket the existing rock threshold .8, cold tundra/snow temperatures and highland snow elevation, allowing appearance to vary continuously without changing ecological categories. Snow is static appearance, not a physical accumulation model. No additional noise, blur, water or vegetation decisions are introduced.

## Display

The four active GPU channels are Grass/Soil/Rock/Snow float32 vertex attributes (16 bytes/sample), replacing the old categorical byte attribute. Retain the same mesh positions, triangles, normals and fixed four-unit triplanar sampling. Surface colors are fixed linear conversions of grass #a7b976, soil #b5a17a, rock #a6a397 and snow #e9eff1. Ocean retains #37768b. Blend each channel's base color and detail modulation using supplied weights; Ocean contributes its color multiplied by max(0,1-sum(land weights)); the nonnegative guard only handles float32 interpolation residue. Triangle interpolation remains ordinary interpolation, including coasts; no land renormalization or beach classification is added. The biome legend labels ecological categories, not exact displayed surface colors.

## Preserved evidence

Before changes, tests/core/Fixtures/landscape-v3-fingerprints.json was captured from the v3 host for three 129x97, 16-step requests including extreme signed seeds and nonempty vegetation. It freezes every pre-existing numeric/environment array, categorical biomes, tree records and simulation summary as SHA256 of documented little-endian binary values. Request fields and tree counts are retained. The independent tests/reference/surface_reference.py supplies new literal coverage expectations. Historical v1/v2 sources and LANDSCAPE_V3.md remain intact.

## Timing and budgets

Coverage allocation/derivation belongs inside both hosts' computeMs. JSON, transfer, normalization, comparison, geometry/material construction, texture wait and display remain outside. Preserve single-worker ownership and sequential equivalence.

Maximum additional Core field: 1310720 floats = 5242880 bytes (5 MiB); normalized client field also 5 MiB; GPU-ready four-channel attribute 4194304 bytes (4 MiB). Raw parsed JSON numbers coexist during normalization, and source float storage remains while geometry exists. Document these overlapping buffers and serialized strings; these budgets are not peak total runtime/RSS or actual GPU measurements. No per-cell objects or duplicate full-map coverage layers. Existing texture assets, four active textures/view, one terrain call and six vegetation mesh limit remain. Actual JSON bytes and reserved WASM memory must be recorded in production evidence.

## Verification evidence

Release build: zero warnings/errors; 127 Core and 37 API tests pass, including exact v3 field fingerprints and independent surface literals. Angular: 139 tests, including raw underflow/nonfinite/malformed coverage, ocean/sand invariants and last-vector comparison. Four Python packaging/asset tests and the worker RPC test pass. Production Chromium 153.0.8010.52 materials, landscape, editor and PWA scenarios pass, including offline reload/new tab, Remote recovery and safe updates.

The six-case full-field WASM/API matrix has zero observed numeric error. Maximum 512x512x128 response: 17356255 UTF-8 bytes, including a 2621441-byte numeric coverage JSON array, excluding the property name/delimiter. Coverage uses 5242880 raw bytes in Core/client and 4194304 bytes in the GPU-ready attribute. That attribute replaces 3145728 color bytes and 1048576 categorical-family bytes, so combined vertex buffer bytes remain unchanged. Four active detail textures and one terrain draw call per viewport remain; the observed terrain/tree maximum is seven calls.

Reserved WASM linear memory grew from 33554432 to 150470656 bytes during this sequence. It is not live managed memory or browser RSS. Test-only diagnostics measured about 62.6 ms for parsing the entire maximum response and 3.6 ms for copying its coverage into Float32Array on this run; these are not isolated production decoder measurements or controlled benchmark results. Do not infer an architectural winner from them.

Ignored artifacts/landscape-verification.json retains complete requests, coverage/resource sizes, parse/copy diagnostics, numeric parity and conservation checks. transitions-verification.json retains texture ownership, real shader compilation, coverage validation, maximum instances and offline evidence. transitions-before/after-{normal,cold,warm}-{overview,close}.png use identical 129x97 requests and camera framing. No threshold adjustment from the proposed rules was needed. Sand remains zero; biomes are categories and are not read back from rendered mixtures.
