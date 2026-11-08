# Rock placement v1

Status: implemented and verified; frozen specification. Decorative rocks extend Stage 4 without modifying any existing height, environment, biome, density, coverage, tree or hydraulic field. Algorithm `diverse-landscape-v5`; result `landscape-ecology-v6`; workload `landscape-ecology-hydraulic-v6`; profile `landscape-worker-json-v6`. Hydraulic and nested noise versions remain unchanged. No new controls or dependencies. Do not pool historical workload timings.

## Distribution and identity

After trees, visit each quad in row-major order. Reject any quad with an Ocean corner or a corner slope greater than 1.8. Compute mean stored slope s and mean stored Rock coverage r. At px=x*noiseScale, pz=z*noiseScale, cluster c=Fbm(px*.8+71,pz*.8+29,seed XOR 0x6C8E9CF5,3). All intermediates are double unless explicitly float32.

Kinds: Boulder=0, Outcrop=1, Scree=2. Select Outcrop when s>=.35 and r>=.2, otherwise Scree when s>=.12 and c>=.55, otherwise Boulder. Acceptance probability: Boulder .025+.10*c; Outcrop .10+.28*c; Scree .08+.55*smooth(.45,.75,c). smooth is clamped cubic u*u*(3-2*u). These are illustrative patches of separate small stones, not rockfall physics. Scree occurs on moderate slopes; unsupported steep ground is rejected by the support test below.

All hashes use existing uint wraparound LatticeValue(x,z,seed XOR salt). Independent salts: acceptance 0x91E10DA5, X 0xD192ED03, Z 0xA24BAED5, size 0x9FB21C65, aspect 0xC13FA9A9, rotation 0xF39CC061, variant 0xB7E15163, priority 0x8AED2A6B. Variant Angular=0 when its hash<.5, Rounded=1 otherwise; both have the same conservative footprint. No mutable PRNG.

## Transform and support

Required positional RockInstance has eleven numeric members: cellIndex, x, y, z, scaleX, scaleY, scaleZ, rotation, groundY, kind, variant. cellIndex is the quad top-left sample index; one candidate per quad. X=float32(cellX+.4+.2*hashX), Z likewise; size q is the size hash. scaleX=float32(.22+.10*q) for Boulder, .28+.08*q for Outcrop, .12+.06*q for Scree. scaleY=float32(.24+.18*q), .48+.32*q, or .10+.10*q respectively. scaleZ=float32(scaleX*(.7+.3*aspectHash)). Rotation=float32(2*pi*rotationHash), yaw only, no surface alignment. Min/max wire bounds: scaleX 0.12..0.36, scaleY 0.10..0.80, scaleZ 0.084..0.36 (all float32 bounds).

Geometry is a unit-radius closed icosahedron centered on its local origin, scaled by the supplied axes. Angular uses detail0, Rounded detail1; vertex radii never exceed1. Both therefore fit a horizontal circle radius scaleX. Grounding is conservative for both shapes, not dependent on their tessellation.

Let radius=scaleX, local center fx=X-cellX, fz=Z-cellZ. The axis-aligned square [fx-radius,fx+radius] x [fz-radius,fz+radius] must be contained within the quad. Evaluate exact existing rendered triangle heights at four square corners and every intersection of its boundary with the diagonal fx+fz=1. Their min/max are the extrema of the entire piecewise-linear support area. Reject if max-min>.7*scaleY. groundY=float32(triangleHeight(fx,fz)). Y=float32(minHeight-.10*scaleY). This intentionally embeds the lower half and places the origin below the minimum supporting terrain; it does not translate/deform the terrain. The top remains exposed on accepted support. Geometry outside this square does not exist. Values are in grid/world units, not meters. Map and ocean boundaries have no overhanging rocks. Negative Y is valid for dry zero-height land.

## Exclusion, ordering and memory

Exclude candidates whose center distance to a returned tree is less than radius + .075*tree.Scale + .15. This protects a conservative trunk footprint, not the entire canopy. Never remove/move trees. Actual returned trees are authoritative, so changing vegetationDensity can change rock availability while retained rock candidate transforms stay fixed.

Sort surviving candidates by ascending independent priority hash, then ascending cellIndex on ties. Accept only if center distance from every already accepted rock is at least radius+otherRadius+.12. Discarded candidates never exclude later candidates. Stop at the total cap 8192 shared by all kinds/variants. Sort accepted output by unique cellIndex. This selection does not depend on candidate traversal order.

One value-type candidate array of at most (width-1)*(height-1), one int[N] tree cell grid and one int[N] accepted-rock grid; bounded 5x5 quad neighborhoods suffice because the largest exclusion distance is .84 and all centers lie in .4..6 of their quad. No per-cell reference objects, global nearest-neighbor scans or additional wire maps. O(N log N + 25*N) worst-case time, temporary storage <=32 MiB at512x512, excluding existing outputs and serialization. The output contains at most 8192 immutable records. Empty required rocks array is valid; missing rocks is invalid.

## Transport and rendering

Both hosts serialize the same required collection with numeric IDs. Strict client normalization rejects unknown/missing members, nonfinite/raw invalid ranges, invalid enums, nonunique/unsorted indices, invalid footprint, Ocean support, invalid triangle groundY and center/embedding bounds. It checks supplied transforms against geometry; it does not repeat acceptance, clustering, spacing or selection. Compare kind, variant and cellIndex exactly; all seven pose/scale floats and groundY use existing tolerance 1e-6+1e-5*max(abs(a),abs(b)). Report rock discrepancies separately; build identity stays independent.

Up to six nonempty InstancedMesh groups, one per kind/variant, one shared geometry and Lambert material per group. Neutral rock shades, no assets or PRNG; every returned instance rendered. Rocks cast and receive shadows. Existing fixed daylight, 2048 PCF static map and request framing remain; actual rock bounds join the shadow fit. Total <=19 color calls and <=19 initial caster calls per viewport including terrain/trees. Matrix data <=512 KiB/view for8192 rocks, excluding Three.js object/geometry overhead. Idempotent disposal covers replacement, failure and destruction; setup/drawing pauses during computation.

Core timing includes eligibility, cluster noise, support calculations, tree indexing, spacing, sorting and output allocation. Transport, normalization, comparison, instance/bounds/shadow setup remain outside computeMs. No animations, geological deformation, new controls or coastal rules are included.

## Evidence

Before changes, landscape-v5-fingerprints.json captures revision c4b7954: five rectangular eroded requests with signed seed extremes and a maximum wet-plains tree-cap request. SHA256 hashes cover each unchanged serialized numeric field including full eight-member trees and simulation. Historical fixtures/specifications retain their original meaning. Independent rock reference literals and production/browser verification are recorded with the implementation.

## Verification and practical limits

155 Core, 38 API and 161 Angular tests pass, together with locked restore, a zero-warning/error Release build, production publication, four Python packaging/asset tests and worker RPC. The independent reference freezes transforms/clusters for four signed seeds and complete dry-flat indices for four 17x13 requests. Support tests include diagonal extrema away from square corners; selection tests include reverse traversal, priority ties, discarded-candidate spacing, tree exclusion, all kinds/variants, max cap and exact Stage 4 fingerprints. A 512x512 flat placement allocates 17309912 bytes including the rock output, below 32 MiB. No reference expectations were changed to accommodate production output.

Production Chromium 153.0.8010.52 passes landscape, materials, lighting, editor and PWA entry points. Seven full WASM/API cases have max observed error zero, including every rock field. All six kind/variant pairs occur. The 512x512x128 request returns 8192 rocks and 16384 trees; response 19024626 UTF-8 bytes, rock matrices 524288 bytes, reserved WASM memory 183959552 bytes across the matrix. The mixed scene uses all six rock and six tree groups: 19 main and 19 initial caster calls. The maximum scene submits 40960 instances (two parts per tree plus every rock); no renderer recap/subsampling occurs. Static reuse, paused computation, empty-ocean scenes, replacement/two-view ownership, failed submission cleanup, narrow offline generation, offline new tabs, Remote recovery and safe updates pass. Surface assets/shadow target sizes remain unchanged.

Ignored evidence: landscape-verification.json, rocks-materials-verification.json, lighting/editor/PWA verification JSON, rocks-before/after-{normal,cold,warm,conifer,mixed}-{overview,close}.png and additional rocks-after-*-detail.png images. Baseline capture used c4b7954 at the same request/framing. Desktop software WebGL/resource diagnostics are correctness evidence, not controlled performance results, peak memory or a mobile guarantee. The SDK still reports publishing without optimizations; AOT is not enabled.

Rocks remain small decorative objects in grid units. Conservative support rejects unsupported steep ledges, so the steepest cliffs intentionally remain bare. Clustered scree is an illustrative distribution of separate stones, not rockfall simulation. Clearance protects trunks rather than entire crowns. Icosahedral silhouettes and whole-map shadow resolution limit close-up realism; this stage does not change terrain geometry, add normal maps or introduce geological deformation. Stage 6 will separately specify local geometric relief.
