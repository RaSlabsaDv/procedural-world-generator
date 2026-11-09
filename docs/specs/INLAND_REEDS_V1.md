# Inland reeds v1

Hydrology Stage 6C, presentation only. Keep generation v14, result/workload/profile
v15 and all Core contracts, ecological species, water geometry and profiles fixed.
No textures, dependencies, UI controls, wind or water simulation.

## Frozen eligibility and scatter

Use emitted inland water triangles and the existing wet-bank attribute. Exact
terrain-triangle sampling rejects Ocean/snow corners, snow coverage >0.08 and
triangle gradients >0.35. Interpolated wet-bank cue must be >=0.02.
Dry-bank anchors require wetness >=0.08, nearest water distance <=0.75 units and
terrain rise <=0.20 units. Shallow-water anchors must lie inside emitted water,
with bed depth <=0.18 units. Negative rise on a point outside emitted water is
rejected, never treated as evidence of inundation.

Shallow anchors require a dry-bank witness within 1.2 units: test eight directions
at radii 0.4, 0.8, 1.2. Witness wetness >=0.08, bed at/above its nearest actual water,
water distance 0.02..0.75 and rise <=0.20. Witness water level must differ by <=0.20
from the anchor surface. Sampling is deliberately conservative and terrain-grid
limited; no flow-speed or physically derived wetland classification is implied.

Two hash-jittered candidates per terrain cell, visited in a seed-derived coprime
permutation; maximum 522242 candidates at 512x512. A smooth four-unit density mask
with a separate random stream supplies irregular clusters and gaps. Acceptance
probability <=0.45; maximum 2048 tufts. Width 0.8..1.2, height 1.0..1.65, full yaw
variation and muted green/straw tint. Reeds remain upright, independent of wind/time.

Check eight root-support points at radius 0.12*width. Supporting bed range <=0.12;
all support points obey snow/Ocean/slope and depth/rise bounds. Embed the shared
root plane 0.015 below the lowest support sample. This avoids floating roots; the
small tuft may be partly buried on a slope. Collision radius 0.24*width plus 0.05
clearance. Use bounded two-unit spatial queries for canonical rocks, trunks,
shoreline-stone envelopes (+0.06 clearance) and accepted reeds; reject saturated
queries after 64 obstacle checks. No candidate-by-all-obstacles search.

## Rendering and ownership

One opaque, double-sided instanced Lambert tuft with upright stems, narrow leaves
and restrained seed-head color, using vertex/instance colors. No alpha textures,
sorting, emissive output, new shadows, targets or frame loop. Existing sun, moon,
shadow receiving, atmosphere, HDR/Bloom and measured-work suspension apply.
Dithered camera-distance fade 45..140 units; far vertices clip, static instance
buffers are still submitted. This is not CPU LOD or an FPS claim.

At most one color draw and zero shadow draws. Fixed tuft geometry <=8 KiB numeric
buffers per CPU/GPU copy. Matrices/colors 76 bytes per tuft, at most 155648 bytes
per copy. Packed setup records: x,y,z,width,height,yaw,tint,id,depth (36 bytes each),
up to two capped arrays during trimming (147456 bytes). Numeric scratch bounds:
water index 4*N+4*T; obstacle index
4*ceil((width-1)/2)*ceil((height-1)/2)+16*(trees+rocks+shoreStones+2048),
plus the capped record arrays. Scalar sampling scratch is reused. JS/driver object
sizes are excluded. Shoreline stones expose only packed x,z,radius envelopes,
12 bytes per stone, CPU-only and view-owned; their placement remains unchanged.

Every preview owns its mesh, geometry, material and instance buffers. Release on
replacement, destruction and partial setup failure. Empty eligible shores create
no mesh. Canonical arrays/instances, prior decorative placements and water meshes
are immutable. All scatter/setup costs are display work, excluded from computeMs.

## Verification

Test deterministic varied placement, finite bounds, shallow/dry eligibility,
witnesses and exclusions, terrain support, obstacle clearance and allocation caps.
Preserve prior grass/stone fixtures. Cover empty/min/rectangular/max maps, independent
owners and setup failures. Production-factory reeds/off screenshots use fixed Core
requests/cameras/light/water phase, near/far, lake/river/confluence, no-Ocean, night,
Reference/HDR/Bloom and two/narrow views. Verify visible pixel contribution and GPU
cleanup, complete immutable source hashes and published WASM/API equivalence.
Run PWA update/offline new-seed checks last, including reed-instance submission on
an eligible generated fixture. Software rasterization is not physical-GPU evidence.
