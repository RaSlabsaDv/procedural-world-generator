# River channels v1

Policy frozen before implementation. Identity river-channels-v1. Bounded deterministic
terrain shaping and illustrative static water profiles, not discharge/sediment physics.

## Pipeline and planning

Compose and hydraulically erode as before; convert heights to float32. Derive preliminary
Ocean/non-Ocean, drainage, rivers and lakes (no ecology/instances). Apply ONE shaping
pass. Recompute final drainage/rivers/lakes and all ecology/instances from carved heights.
Profiles use only that final graph. No convergence loop or second hydraulic simulation.

Cap lowering by min(1.5, .03*heightMultiplier). Protect boundary cells, Ocean/lake members
and their one-cell D8 ring. Original Ocean barriers and selected-lake rims are untouched.
Preliminary river centers start with desired cut min(cap, heightMultiplier*(.002 +
.001*sqrt(accumulation/T))), where T is river-network-v1 threshold. Use the drainage
processing order reversed (upstream first); each unprotected river center proposes a
receiver bed no higher than its planned bed. Clamp every proposal to that receiver's
original bed minus cap and zero. Protected sources/targets do not propagate cuts.
An insufficient cap never authorizes deeper cutting or raising terrain.

At each preliminary river center use its Core half-width plus .75 grid-unit bank halo.
Inside half-width use the full planned cut; across the halo use quintic smoothstep of
remaining normalized radius. Combine overlap with MAX cut, never a sum. Protected
cells receive no proposals. Double intermediates; store planned centers as float32.
Apply max proposals once. Round the lower bound UP to a representable float32 if needed,
then clamp rounded output between that lower bound and original height. Actual
carveDepth=max(0, original-final) in float32. Zero cut leaves original bits untouched.

## Final profiles

Required result.channels has five fields: algorithmVersion, dense float32 carveDepth[N],
float32 waterSurfaceHeight[K], segmentState[K] (JSON numeric enum array), and summary.
K aligns exactly with FINAL rivers.cellIndices; no duplicate cell/receiver graph.
State codes: Unsupported0, Exposed1, Submerged2, Boundary3.

Use final drainage processing order (receiver before source). Initialize each node to
its final bed. Ocean surface is seaLevel*float32(heightMultiplier). Selected lake members
pin to their final basin level. Other river nodes desire bed + min(.5*actualCut,
.01*heightMultiplier), rounded float32; upper feasible level is bed+actualCut, bounded
by float32(heightMultiplier). A node can raise its desired level to its receiver's
already-computed level only within that interval. Otherwise retain desired level and
mark that edge unsupported. A shared receiver always has one shared profile value.

Boundary sources (receiver=-1) are Boundary. Same-lake edges are Submerged. Different-
lake direct edges are Unsupported. Other feasible edges are Exposed only if downstream
water does not rise beyond existing tolerance and drop/edge length <=min(.6,.05*
heightMultiplier) within tolerance. Flat reaches are allowed, no epsilon slope. Lake
pins ignore the dry-bed upper interval; infeasible lake outlets remain unsupported.
All profile values remain finite even when no surface is rendered. A locally supported
reach may terminate at an unsupported barrier; do not fabricate a bypass or waterfall.

## Accounting and versions

summary has beforeTerrainMass, afterTerrainMass and removedTerrainMass (double).
Sum float32 samples in ascending order; removal sums double(original)-double(final).
The hydraulic finalTerrainMass still means post-erosion/pre-shaping DOUBLE terrain.
Float32 conversion may shift mass slightly before channel shaping. Do not add channel
removal to hydraulic suspended sediment or water. Check each conservation relation
separately with documented float/accumulation tolerance.

Generation diverse-landscape-v14; result/workload/profile v15. Unchanged noise,
hydraulic, drainage, river and lake equations retain their identities. Existing inputs
remain identical across hosts. Whole-call Core time includes BOTH bounded drainage
analyses, shaping, final ecology and profiles; transport/decoding/rendering remain out.

## Complexity and presentation

Two priority floods O(N log N); shaping/profile traversals O(N), bounded local radius
<=2.25. Output4N+8K bytes plus summary/headers (segment enums are int32 in .NET, Uint8
on client). Preliminary planning/output lifetimes stay separate; no per-cell objects.
Shaping scratch: float32 planned bed/width, double proposals, byte protection =17N;
profile scratch: float32 node heights + int32 lookup =8N, plus final drainage order4N.
These exclude drainage/lake scratch, retained outputs, JSON and object headers.

Renderer uses Core states/heights, interpolating centerline values into its existing
coverage mesh and clipping against carved bed/banks. A .25-grid-unit edge taper meets
the bed at coverage boundaries; protected lake/Ocean shore triangles retain a thin
film joining the exact water-body level. Shared grid-derived normals avoid faceted
reflections between separately clipped polygons. Optical river thickness has a .9
minimum fading at .15-grid-unit banks; this is styling, not canonical water depth. No TypeScript profile repair or
eligibility solver. Zero-depth uncarved exposed reaches may retain a thin visual film;
optical styling remains illustrative. Submerged/unsupported reaches are not drawn.
Protect ocean/lake appearances, animation, ownership, HDR/Bloom and no-Ocean operation.
Keep historical v13 output testable through a frozen pre-channel pipeline. Never update
old expected hashes to match newly carved terrain. README empty; no new controls.
