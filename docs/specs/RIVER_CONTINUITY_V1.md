# River continuity v1 — presentation refinement

## Diagnosis and version boundary

Generation v14 / result, workload and execution profile v15 remain unchanged.
No Core shaping limits, graph, profiles, lake levels or sea level change.
The existing two-triangle terrain diagonal loses narrow NW–SE river coverage:
positive endpoint coverage interpolates through two negative off-route corners.
A 0.6-unit flat diagonal reach can disappear midway despite valid Core support.

Before diagnostics sample 31 interior points per Exposed receiver edge, separately
classifying actual terrain above the Core interpolated profile, ambiguous lake
triangles, already submerged water-body samples and eligible renderer losses.
Mixed seed42: 698 exposed edges, 516 complete sampled edges, 436 eligible missing
samples (393 NW–SE), 2263 bed-blocked samples. No-Ocean seed-7: 557 exposed,
394 complete, 353 eligible missing, 2591 bed-blocked. These counts are sampling
observations, not physical flow or pixel area. Quantized touching mesh components
are descriptive; reducing them by flooding is not an objective.

## Frozen correction

Keep lake geometry unchanged. Refine river cells by adding exactly one point at
the midpoint of the existing NE–SW terrain diagonal. Split each original triangle
into two, so both D8 diagonals have mesh edges through that center. The center bed
is the mean of the NE/SW heights: no terrain tessellation, displacement or hidden
channel cut. This preserves the exact existing piecewise-planar terrain.

Rasterize existing Exposed edge capsules at both integer vertices and cell centers,
using the same Core widths, receiver edges and coverage maximum. Select profile
and flow from the nearest supported centerline (stable ascending-index ties), rather
than whichever wider neighboring capsule wins coverage. A wider neighboring reach
must not overwrite an authoritative centerline height. Two squared-distance fields
track that choice; no Core water value is repaired. Center profiles retain double
interpolation precision so zero-depth flat reaches do not disappear from rounding
a midpoint below its exact terrain plane. No unsupported edge seeds coverage.
Centers do not invent water heights. Four fan triangles per cell replace two river
triangles; clip each using its original terrain triangle's lake ownership, bed,
coverage and water profile. Preserve Ocean/lake shore clipping and bank taper.
Lake/Ocean surfaces and the default Ocean shader are unchanged.

Reuse shared grid normals and interpolate center normals from NE/SW to avoid
polygon reflection facets. Index emitted river triangles by terrain cell. The
river-surface query interpolates the actual emitted triangles, including their
bank taper, instead of evaluating an approximate nonlinear height separately.
This gives decoration filtering the same footprint/heights as actual water.
Wet banks, shoreline stones and reeds already consume emitted geometry.

Bed barriers above authoritative water remain dry. Unsupported/Submerged/Boundary
states retain their meanings. Conflicting neighboring profiles and finite grid
approximations may still interrupt routes. No waterfall, bypass, global plane,
profile solver, convergence loop or extra carving is introduced in TypeScript.

## Budgets and ownership

At most two water color batches and zero new shadow passes, textures or frame loops.
River output bound doubles to 340*4*N numeric bytes per CPU/GPU copy (conservative
worst case, actual bytes recorded separately). Lake bound unchanged. Add three
float32 center fields and one float64 profile field (20*N), and a cell-to-index
range array (<=4*N+4), to the prior
37*N retained/scratch field bound, plus two nearest-distance float32 fields (8*N):
<=69*N+4 numeric bytes, excluding output.
At 512x512 this field bound is about 17.25 MiB. Only allocate river-specific new
fields/ranges when exposed edges exist. Construction remains O(N+bounded edge
stencils+output). Queries visit a cell's emitted triangle range (both neighbors at
integer boundaries), not all triangles.
Each emitted triangle stays in one original terrain cell, preserving existing shore
spatial-index assumptions. Setup remains display work excluded from computeMs.
View ownership releases all new buffers with its geometry/query owner, including
failure cleanup; no source arrays or global caches are mutated.

## Acceptance

Literal flat narrow diagonal reaches must remain supported along their entire
interior, including bends/confluences. Blocked terrain, unsupported reaches and
submerged ownership must not become bridges. Test emitted geometry/query agreement,
terrain bounds, finite attributes, valid indices, rectangular/min/max cases,
resource caps and cleanup. Preserve complete canonical before fingerprints.
Run before/after generated diagnostics and fixed-camera full-scene screenshots,
with day/night Reference/HDR/Bloom, no-Ocean, independent/narrow views and downstream
shore decorations. Report eligible losses and remaining bed barriers separately.
Production publication and PWA update/offline new-seed regression run last.
Software-rendered browser evidence does not establish physical-GPU frame rates.
