# Tree LOD v1

Policy frozen before production implementation. Visual Stage 5C, presentation only.

## Assessment and representations

The preceding five-sided trunks have 20 triangles; conifer crowns have 12 and
broadleaf/savanna icosahedron crowns have 20. Another intermediate geometry level
would add grouping complexity for little benefit. Use two opaque, fully 3D levels:

- Near: unchanged five-sided trunks and existing crowns (32/40 triangles per tree).
- Far: three-sided trunks (12 triangles), three-sided conifers (6), and octahedron
  broadleaf/savanna crowns (8). Total 18/20 triangles, a 43.75%/50% color-pass reduction.

Far ellipsoids keep existing species/variant scale/height and use .85 of the original
crown radius to match the icosahedron's axial extent. Conifers retain radius/height.
Authored position counts are trunk34→22, conifer27→15 and other crowns60→24;
indexed vertex reuse makes these storage counts distinct from actual shader invocations.
No billboard, texture, alpha sorting, shader discard or extra material is required.
Silhouettes/normals are intentionally coarser at distance; no smooth morph or wind.

## Classification

Use world-space Euclidean distance from camera position to the Core trunk root,
divided by Core scale. First classification: near at <=56, far above56. Thereafter
near becomes far only above64; far becomes near only below48. Exact hysteresis
boundaries retain the prior level. Classification is independent of input order.
Every tree occupies exactly one color representation; there is no crossfade overlap.
Within the hysteresis band, camera history intentionally matters. Local/Remote visual
buffer comparisons must match camera history as well as position; Core equivalence
is independent of presentation history.

Check only when camera translation since the last evaluation is >=.25 world units;
rotation, sun, water, atmosphere and resize alone do not change classification.
This introduces at most .25 world units of camera-motion quantization. First render
and resumed work evaluate the latest camera. No timer or animation loop is added.
Scan at most16384 tree records; repack only changed groups into fixed-capacity arrays.
Do not allocate per-tree objects or arrays during camera updates.

## Static shadows and ownership

Keep full-detail, all-tree source meshes on dedicated layer1; the default camera
sees layer0, while the sun shadow camera explicitly sees layers0+1. Source transforms
never change with LOD. Only these sources cast tree shadows; color near/far meshes
cast none. The original full-detail shadow map, bounds and invalidation policy remain
camera-independent. Low-poly far silhouettes may differ slightly from their shadows.

Per occupied species/variant group: two source meshes, two near and two far meshes.
Near/source share geometry; all levels share the original two Lambert materials.
Only far introduces two geometries. Visible near/far trunks share their respective
matrix attribute with crowns. The two source meshes also share one immutable matrix
attribute. Source crown colors remain CPU reference data, not an extra GPU attribute.
Groups own fixed-capacity arrays; independent views never share mutable buffers.
Dispose color meshes, far geometries and then source ownership exactly once, including
failure rollback. Bounds cover every tree at each level and do not shrink with counts.

Per tree persistent numeric storage: three matrices (192 bytes), three RGB float32
colors (36 bytes: source CPU + near/far), one level byte:229 bytes/view. GPU ceiling
is three matrices plus two colors:216 bytes/tree =3538944 bytes/view at16384 trees,
7077888 for comparison. CPU numeric storage is3751936 bytes/view plus bounded group
metadata and existing Core records. Construction temporarily allocates replacement
matrix attributes from InstancedMesh constructors: up to192 bytes/tree (3145728
bytes/view) await garbage collection, on top of persistent numeric storage. Group
lists retain up to16384 references to existing Core records, without cloning records.
No map-sized fields are added.

## Pass budgets and timing

Up to24 tree color calls when all six groups straddle both levels, previously12.
Up to12 tree shadow calls remain unchanged. Whole-scene ceilings:34 color and19
shadow calls per view (68/38 for two views). At a single level, color ceiling remains22. Each tree contributes
two color instances and two shadow instances; LOD does not discard distant trees.
Crown programs retain seven occupied attribute locations, with no new samplers.

Preparation, classification, repacking and uploads are display work outside
computeMs/requestMs. First display submission includes initial classification;
subsequent camera updates do not rewrite the initial display metric. OperationLock
blocks both classification and uploads during generation/controlled collection.
Structural triangle savings do not establish FPS gains or faster shadows; increased
memory/calls are explicit tradeoffs requiring a controlled hardware campaign.

## Verification and exclusions

Cover thresholds/hysteresis, translated cameras, unchanged colors/transforms,
all species/variants, cap, independent views, fixed buffers, static caster bytes,
resource cleanup/failure and deferred work. Pair fixed requests/cameras/full Core
hashes before/after; screenshots intentionally change. Inspect real GPU counts,
geometry sizes, uploads, static shadows, noon/low/night/reference, offline new seeds
and PWA updates. Preserve Core/contracts/workload identities and README emptiness.
No intermediate level, impostor, UI, wind, species or new dependency in this revision.
