# Inland shore stones v1

Presentation only, following wet-bank materials. Keep generation v14 and result,
workload and execution profile v15. No Core, canonical rocks, water mesh or profiles
change. No reeds, UI controls, dependencies, textures or new shadow casters.

## Frozen placement policy

Use actual emitted inland lake/river indexed triangles, binned by their terrain
cell. Candidates require interpolated bankWetness >= 0.08 and exact nearest emitted
water distance 0.04..1.4 grid units. Interpolate water height at the closest XZ point;
terrain rise must be -0.01..0.45. No Ocean or snow biome at any supporting corner,
and no supporting snow weight above 0.08. Maximum triangle gradient is 0.55.

Two hash-jittered candidates per terrain cell, at most 522242 for 512x512.
Visit in a seed-derived coprime permutation to distribute a capped selection over
the whole map, not a scanline prefix. A smooth four-unit presentation density mask
creates clusters/gaps. Accept with probability <= 0.55 times wetness/cluster factors.
Coordinate hashing is presentation randomness, not a second terrain generator.

Size selection: 83.5% small radius 0.06..0.14, 15% medium 0.14..0.24, 1.5% larger
0.24..0.38; maximum 64 larger stones, 4096 total. These are candidate probabilities,
not guaranteed output proportions after geometry/obstacle rejection. Height is
0.4..0.65 times radius and depth 0.65..1 times radius. Random yaw and small neutral
stone-color variation; align to the exact triangle normal, embed 18% of height.
Use a conservative horizontal support/collision envelope of 1.2 times radius.
Check eight footprint points against the supporting plane (error <= 0.35*height
+0.005) to avoid hanging over ridges or shoreline ledges. Snow/Ocean exclusions
also apply to footprint points. Existing Core boulders remain dominant.

Use a two-unit spatial index for canonical rock envelopes, tree trunk clearance
and accepted stones. Reject overlapping horizontal envelopes; at most 64 obstacle
checks per candidate, rejecting saturated neighborhoods conservatively. No
candidate-by-all-instances or candidate-by-all-water-triangles search. The water
index visits at most 25 neighboring terrain cells; each emitted triangle is wholly
inside one cell. Rendered support, rather than a drainage ID, establishes eligibility.

## Rendering and budgets

Two fixed low-poly closed silhouettes: rounded small gravel and angular larger
stones. Geometry totals below 16 KiB numeric buffers per CPU/GPU copy. Instanced
Lambert materials, per-instance colors, existing lighting/shadows/fog/finishing.
At most two color draws, zero extra shadow draws, textures, targets or frame loops.
Dithered fade: small 28..65 units, larger 55..130. GPU vertex clipping beyond far
reduces fragments but still submits the instance buffers; this is not CPU LOD.

Matrices/colors cost 76 bytes per instance, at most 311296 bytes per CPU/GPU copy.
Placement records cost 52 bytes per accepted stone, at most 212992 bytes, setup-only.
Scratch bounds: water index 4*N+4*T bytes, obstacle index
4*ceil((width-1)/2)*ceil((height-1)/2)+16*(trees+rocks+4096) bytes,
and up to two capped placement buffers while trimming (425984 bytes). T is emitted
water triangle count; geometry/lookup arrays are not duplicated into Core data.
Scalar query scratch is reused, no per-candidate object allocation.
Stage 6C integration additionally retains x,z,radius envelopes (12 bytes/stone,
maximum 49152 CPU-only bytes) for reed clearance; stone placements stay identical.

Each preview owns meshes, geometries, materials and instance buffers. Release on
replacement, destruction and failed setup. Empty eligible shores create no meshes.
Canonical arrays/records and water geometry remain immutable. Setup is display
work excluded from computeMs and performance equivalence.

## Verification

Test seed repeatability, varied irregular transforms, actual triangle contact,
terrain support/exclusions, spacing, rare-large cap, empty/rectangular/max dimensions,
immutable inputs and failure cleanup. Use production-factory fixed wet-bank baseline
and stones/off screenshots, pixel contributions, day/night Reference/HDR/Bloom,
near/far, no-Ocean, two/narrow previews and buffer/draw counts. Compare complete
Local/Remote results; PWA update/offline new-seed regression runs last. Record actual
counts separately from caps; software rasterization is not a physical-GPU FPS claim.
