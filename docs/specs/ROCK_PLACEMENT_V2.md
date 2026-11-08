# Rock placement v2: sparse boulders and outcrops

Status: implemented and verified; policy frozen before implementation. Supersedes decorative rock placement
v1 only. Existing eleven-member RockInstance and kind/variant IDs retain their
meaning; size is expressed by scales, not overloaded variant IDs or new wire fields.

## Baseline and preservation

Revision b532b30 has single-quad stones with radius .12.. .36 and positions only
.4.. .6 into a cell. The maximum flat case fills the 8192 cap. Baseline geometry uses
the same icosahedral family for every kind. These choices explain repetition and
visible dense scatter. Eight paired baseline scenes and 23 full numeric field
fingerprints are captured before edits in ignored rocks-v2 artifacts and
Fixtures/landscape-v10-fingerprints.json.

Preserve every non-rock field exactly, including full trees, base/final surface
coverage, snow, heights, climate, biomes, ocean, density and hydraulic summaries.
Placement remains after trees and before the final coastal pass. No deformation,
new controls, physics, dependencies, assets or frontend placement decisions.

## Deterministic sparse candidates

Visit quads row-major. Reject a quad with an Ocean corner or a corner slope>1.8.
Let s and r be double means of its four stored slopes and base Rock weights.
Cluster c=Fbm(x/48+71,z/48+29,seed XOR 0x6C8E9CF5,2), world-grid coordinates,
independent of noiseScale. Patch p=smooth(.48,.72,c). Exposure e=clamp(r+.5*s,0,1).
Acceptance chance=(.003+.05*p)*(.35+.65*e), never a target quota. It leaves isolated
background candidates and broad sparse groups separated by empty areas. No extra
companion spawning pass or one-visible-instance-per-cell rule is introduced.
Kinds: Outcrop when s>=.35 and r>=.2; otherwise Scree when s>=.12 and c>=.55;
otherwise Boulder. Existing hash, signed-seed reinterpretation and salts remain:
acceptance 0x91E10DA5, X D192ED03, Z A24BAED5, size 0x9FB21C65, aspect 0xC13FA9A9,
rotation 0xF39CC061, variant 0xB7E15163, priority 0x8AED2A6B. Add class salt 0x3C6EF372.
All hash arithmetic is unchecked uint. smooth is clamped cubic u*u*(3-2*u).

X=float32(cellX+.04+.92*hashX), Z likewise; CellIndex is still the quad containing
the center. Class hash<.10 chooses Large, <.45 Medium, otherwise Small. For Scree,
Large folds into Medium: scree remains fragments rather than giant rubble.
Size q is independent of class; interpolate each range in double then cast once:

| Kind | Class | ScaleX | ScaleY |
| --- | --- | --- | --- |
| Boulder | Small | .22.. .45 | .22.. .45 |
| Boulder | Medium | .70..1.35 | .70..1.20 |
| Boulder | Large | 1.80..3.00 | 1.60..2.60 |
| Outcrop | Small | .30.. .50 | .45.. .70 |
| Outcrop | Medium | .80..1.40 | 1.10..1.80 |
| Outcrop | Large | 1.80..3.00 | 2.00..3.20 |
| Scree | Small | .18.. .35 | .12.. .22 |
| Scree | Medium | .40.. .65 | .25.. .40 |

ScaleZ=float32(storedScaleX*(.35+.20*aspectHash)) for Outcrop, otherwise
float32(storedScaleX*(.65+.30*aspectHash)). Rotation=float32(2*pi*hashRotation).
Angular when variant hash<.5, otherwise Rounded. Candidate transforms do not depend
on trees or traversal; only retention does. No mandatory large rock per seed.

## Full support and clearances

The rendered closed geometry stays inside a unit sphere. Thus radius=ScaleX bounds
all yaw rotations since ScaleZ<=ScaleX. Its central top intersection must be>=.70
in normalized geometry. Check the full square [X-radius,X+radius] by
[Z-radius,Z+radius], conservatively containing the footprint. Reject beyond map
bounds or any intersected quad with an Ocean corner/slope>1.8.

For every intersected quad, clip that square to the quad. Evaluate its rectangle
corners and all intersections with the rendered diagonal localX+localZ=1. These
are exact extrema of the continuous piecewise-linear terrain, including interior
grid vertices/edges and diagonals; no corner-only or sampled approximation.
Reject max-min>.50*ScaleY. GroundY is the existing exact center triangle height;
Y=float32(min-.12*ScaleY). This guarantees bounded burial and leaves central top
above ground (ground-origin<=.62*ScaleY), supported by actual geometry tests.
The lower half can be underground; this is not rigid-body contact simulation.

Tree clearance uses radius+1.05*tree.Scale+.25, conservatively covering existing
crowns including mature savanna radius1.008*scale. Never move/remove a tree.
Rock clearance is radius+otherRadius+.40, tested between supplied float centers.
Sort candidates by priority then CellIndex; only accepted rocks exclude later ones.
Cap8192 across all kinds, then return sorted unique CellIndex records. Selection
is independent of candidate traversal. One center per quad permits int[N] grids;
search 17x17 neighboring center cells (radius 8), sufficient for max radius 3, jitter
and existing tree-scale<=1.4. Avoid global neighbor scans in production.

## Representation, validation and presentation

Keep all eleven numeric wire members and enum meanings. Broaden documented scale
bounds to X .18..3, Y .12..3.2, Z .105..X (float32 bounds); Scree X<=.65,Y<=.40.
Client checks strict structure/raw bounds, valid IDs, sorted centers within their
quad, full map/Ocean footprint, exact triangulated ground/support and burial using
the same supplied heights. These are geometry/transport checks, not duplicate
noise, candidate acceptance, grouping or selection. Compare all rock fields as before.

Presentation revision rock-shapes-v2 uses six shared closed Three.js polyhedra:
Boulder Angular dodecahedron0 /Rounded icosahedron1; Outcrop Angular octahedron0 /
Rounded dodecahedron0; Scree Angular icosahedron0 /Rounded octahedron1. Bake fixed
small rotations about Z (.18 Outcrop, -.08 Boulder,0 Scree), then shrink X by
.90+.08*Y and Z by .87+.08*the rotated X (before X shrink). No PRNG. Unit-radius
bounds and central-top clearance are tested on actual triangles. Instance scales
and yaw add diverse proportions; neutral existing material colors remain.
Every returned rock is rendered with existing instancing, no recap or sampling.
Actual geometry/instance bounds feed shadows; camera policy and lighting remain.

## Identities, resources and verification

Algorithm diverse-landscape-v10; result landscape-ecology-v11; workload
landscape-ecology-hydraulic-v11; profile landscape-worker-json-v11. No schema change.
Keep simulation/noise/RPC/terrain shader/lighting versions unchanged. Reject prior
live algorithms; do not pool timings across identities. Only rock mesh appearance
has a new presentation revision.

Candidate value array<=quad count, two int[N] center grids and capped record array.
Full support visits at most8x8 quads/candidate; neighbors<=17x17 cells. Bounded
O(N log N+N*(64+289)) work; no quadratic global scans or per-cell heap objects.
Maximum placement allocations including output<=32 MiB at 512x512. Cap remains a
ceiling, not an acceptance requirement; a sparse maximum map must stay below it.
No extra map-sized transport/render buffers. At most6 rock draws,19 total color /
initial caster calls,8192*64 matrix bytes/view,64 KiB shared rock vertex-attribute
storage/view, existing shadows/textures. Cleanup/failure/pause/two-view rules remain.
All selection/support/allocation stays inside computeMs; JSON, client decoding,
comparison and render geometry/bounds stay outside.

Retain old rock rules under tests/Historical/V8 and a minimal pre-v2 V10 pipeline
for prior integration fixtures. Do not rewrite historical expectations. Independently
freeze new hash/transform/flat placement literals in Python. Test all size classes,
variants across fixed matrices, support interior extrema, water/map edges, crown /
rock exclusion, deterministic selection/ties/rejected candidates, signed seeds,
rectangles/min/max/zero cases, sparse/empty regions and allocation/resource caps.
Capture eight scenes at three fixed zooms via atlas-materials.cjs --rocks --before
and --rocks after publication: camera and all non-rock numerical hashes must match.
After scenes and full landscape matrix verify actual worker/WASM/API equivalence.
Run material/light/coast/PWA regressions. Record visual limits and real costs;
smoke timings are correctness evidence, not controlled performance findings.


## Recorded implementation evidence

Locked restore, zero-warning/error Release build and 231 Core / 42 API tests pass.
Independent float32 transforms and flat selection references cover signed/extreme
seeds. Full-square support tests include interior peaks, diagonal extrema, Ocean
vertices, map edges and unsupported height ranges. Large neighboring-cell exclusion,
priority ties, rejected-candidate behavior, crown clearance and all classes/variants
pass. Every non-rock field across 23 pre-change requests matches exact hashes; old
rock output is reconstructed with frozen v1 and matches its original hashes.

The maximum 512x512 dry-flat placement returns 1693 rocks, below the 8192 ceiling, and
allocates 16856656 bytes including output (inputs outside measurement), below 32 MiB.
This is a native allocation observation, not peak memory or a timing comparison.
303 Angular tests pass, including multi-cell interior corruption, raw range checks,
six distinct closed silhouettes, unit-radius/central-roof bounds,<=64 KiB total
shared vertex attributes, full matrices, actual large-object shadow fitting and
idempotent disposal. Seven packaging/documentation/texture checks and worker RPC
also pass; production publication retains the optional unoptimized-WASM notice.

Eight paired scenes at three zooms preserve exact camera matrices, requests except
version and every non-rock numerical hash. Actual after views invoke full worker/API
equivalence. Inspected views show isolated large boulders, small companions and
open spaces rather than a stone carpet. Counts and observed maximum radii:

| Scene | Before | After | Large count (radius>=1.8) | Max radius |
| --- | ---: | ---: | ---: | ---: |
| Mixed | 767 | 31 | 1 | 2.049 |
| Plains | 865 | 48 | 1 | 2.049 |
| Hills | 666 | 8 | 0 | 1.313 |
| Mountains | 700 | 10 | 0 | .831 |
| Forest | 715 | 24 | 1 | 2.049 |
| Cold | 667 | 11 | 1 | 2.734 |
| Warm coast | 775 | 26 | 0 | 1.018 |
| All-species reference | 775 | 31 | 2 | 2.049 |

No variant/size is guaranteed per scene. Steep slopes and conservative crown/water
exclusion can leave large areas without rocks. This favors supported sparse scenery
over filling quotas; it is an illustrative distribution, not calibrated geology.

Seven full actual WASM/API requests, including 512x512x128, have maximum observed
error 0 across every array, instance and hydraulic summary. The maximum wet-plains
request returns 16384 trees and 810 rocks, with rock matrices 51840 bytes and response
18104514 UTF-8 bytes in this smoke run. Full non-rock comparisons and every rock
field remain enabled. Native thread allocation and reserved WASM heap are distinct
measurements; no performance conclusion is inferred from them.

Browser assertions were updated specifically for the new contract: full multi-cell
map/Ocean support replaces single-quad containment; sparse maximum counts replace
mandatory cap filling. All instance/draw/texture/shadow resource ceilings remain
unchanged. Original frozen literal expectations were never regenerated.


Materials, six coastal parity scenarios, lighting and PWA browser regressions pass
without page errors. Five textures and the existing shadow targets remain unchanged;
actual submissions match every returned tree/rock, static shadow reuse and independent
viewport replacement/destruction pass. Offline reload/new tabs generate fresh seeds,
Remote fails offline and recovers online, and updates defer while busy then remain
usable offline. README stays empty. Evidence under ignored artifacts/rocks-v2-* is
correctness/appearance verification, not a controlled performance campaign.
