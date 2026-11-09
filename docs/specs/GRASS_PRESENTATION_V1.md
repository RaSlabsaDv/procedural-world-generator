# Decorative grass presentation v1

Status: implemented; policy frozen before production implementation. Revision grass-presentation-v1.
Visual Stage 5A; Core, requests/results and workload identities remain unchanged.

## Inputs and deterministic placement

Grass tufts are decoration, not a new ecological model. Use existing Grass coverage,
biomes and slope. Do not use Core vegetationDensity: it describes tree placement.
No new climate, full-map noise/coverage field or Core sampling algorithm in JS.
Candidate generation depends only on seed, dimensions and stable candidate identity.

Desired candidate grid is 2 samples/world unit per axis; scale both counts down
proportionally to at most 131072 candidates. Floor grid dimensions and enforce the
product cap. One jittered candidate per stratum, jitter=.1+.8*hash01, with unsigned
seed/ID/stream avalanche. Fixed separate streams drive position, thinning, priority,
scale/yaw/tint. Camera/time never enters placement. Ignore a.32-unit map-edge margin.

All four quad corners must be non-Ocean/non-Rock/non-SnowHighlands, Grass>=.35,
Sand/Rock/Snow<=.3 and supplied slope<=.55. Triangle-interpolated Grass>=.5 is required;
accept probability=.65*Grass. This thins supplied coverage without a second noise
field. Do not infer suitability from a replacement JS biome classifier. Reject
actual triangle gradients above.6 for stable grounding, not ecological classification.

Use the terrain diagonal NW/SW/NE and NE/SW/SE. For fx+fz<=1, barycentric weights
(NW,SW,NE)=(1-fx-fz,fz,fx); otherwise (NE,SW,SE)=(1-fz,1-fx,fx+fz-1).
Boundaries use the last valid cell; the diagonal tie uses the first triangle.
Interpolate height/coverage from that exact triangle. Derive its geometric normal
for orientation. Tuft origin is height-.01 embedding; roots share that anchor.
Upward alignment is capped 15 degrees; do not resample a bilinear surface.

Conservative XZ exclusions use returned tree trunks (.075*scale+.24 radius) and
rocks (max(scaleX,scaleZ)+.32 radius). Build two center-linked grids with2-unit cells,
at most256x256 heads each for512 maps. Query only neighborhoods covering the actual
maximum radius. At most64 obstacle tests per candidate; when exhausted, conservatively
reject that candidate rather than globally stopping traversal. No candidate×all
instances scans, first-N cutoff or unbounded bucket processing. Drop decoration in
pathologically crowded queries; do not move Core instances.

Keep the lowest 32768 independent priority hashes in a fixed-capacity max heap;
ID breaks priority ties. Scan all candidates even when full, then sort accepted
IDs for deterministic matrix order. Store only IDs/priorities and regenerate their
positions after selection. Uniform priority selection avoids top-left cap bias.
No camera-dependent resampling or per-candidate heap objects.

## Geometry and material

One shared three-blade tuft: 5 vertices/3 triangles per tapered bent blade, totals
15 vertices/9 triangles. Unit height .52, root half-width.028 and tip bend below.12.
Per-instance height scale.7..1.2, width.8..1.25, yaw0..2pi and tint.65.. .9. Use the
existing dominant triangle-vertex biome Grass palette, modulated by restrained
root/tip vertex colors; no new ecological IDs. Shared instanced Lambert material,
DoubleSide, vertex/instance colors, emissive0. Geometry/matrices have conservative
computed bounds. No texture, alpha-cutout asset, wind, flowers, shrubs or new UI.

Receive the existing directional shadow; castShadow=false. Do not add grass to
shadow fitting/caster bounds or invalidate maps for it. Bind shared atmosphere;
night follows existing sun/Hemisphere light without an emissive term.

Compute per-tuft fade from its world anchor distance: full through 20 units, zero
at 55 units. A deterministic4x4 screen Bayer discard gives opaque depth-tested,
depth-writing cutout without sorting/transparency passes. Fully faded vertices
clip out, but vertex processing and the instanced draw remain; this is not LOD or
a measured speedup. Placement and transforms stay stable while orbiting. No loop.

## Ownership and budgets

Scene owns grass geometry, material and instance buffers. Dispose once on failure,
replacement/destruction. Shared environment changes update existing uniforms/lights
without placement/rebuild, camera reset or another first-display measurement.
Existing OperationLock defers all scene setup and submission; retain prior maps.
Placement/matrix construction/upload are presentation/display work, outside computeMs/
requestMs. No partial Core data or grass records enter numerical comparison/export.

At most 131072 candidates/32768 instances; at most8388608 obstacle checks. Fixed heap
IDs/priorities256KiB. Spatial heads<=512KiB plus<=96KiB next entries. Matrices2MiB
and instance colors 384 KiB per maximum view; no extra full-map attributes. Tuft shared
geometry about594 bytes before Three object overhead. Raw typed storage about3.22MiB
per view; allow8MiB additional CPU preparation excluding engine/renderer internals.
GPU instance buffers2.375MiB/view, 4.75 MiB for two plus shared geometry per view.

One additional color draw, total ceiling 22; caster ceiling 19 unchanged. Current
sky/water/terrain textures and shadow attachments stay unchanged. Grass has five active attribute declarations consuming eight locations
(position/normal/color +four matrix slots +instance color); the tested driver used
a nine-slot index span including a gap, within its16-location limit. One
fade varying and existing shared atmosphere/shadow uniforms. No new sampler; shadow
sampling only. Record actual resources and pixel evidence. No package/PWA asset
addition beyond changed application JS; keep all required code cached.

## Acceptance

Capture fixed-seed grass/open plain, forest clearing, soil, coast, rock, snow, mixed
and maximum scenes at overview/close/grazing with frozen sun/waves/camera. Verify full
Core/camera hashes, readable nearby tufts, transitions and exact distant reference
where every tuft is faded. Test deterministic independent storage, exact triangle
height/tie, eligibility/empty categories, finite transforms/bounds, cap selection
spatial distribution, exclusions/query limits and maximum work. Test ownership,
operation deferral, retained results and light updates without rebuilding.
Real Chromium covers actual grass instances/draws/fade, noon/low/night/reference
atmosphere, both views/replacement, shadow reuse/no caster increase, narrow/offline
new seeds and PWA updates last. Inspect images, not just compilation/counts. No
native tests if native sources unchanged; no software-WebGL performance claims.
Docs/UI English; README empty. Do not commit until requested. Tree tint/LOD remains
later; timing diagnostics and generation cancellation are separate execution work.

Acceptance tuning: the initial10..38 fade reduced standard close-view tufts to
sparse stipple before their blades became readable. The frozen final range20..55
retains solid nearby blades and a longer bounded transition, while overview views
still clip all grass. No density/placement/cap or additional pass was changed.


## Verification

364 Angular tests, 12 packaging/asset checks, worker RPC and production publication
pass. 24 paired Core/camera views preserve complete hashes; all 8 overview PNGs remain
byte-exact with distant grass clipped. Chromium Grass/materials/Sun/night checks
pass without errors: readable nearby blades, per-tuft fade, shared sky/shadows,
reference atmosphere, two independent views, exact Local/Remote GPU matrix/color
hashes, paused draw/upload work, max/min maps, narrow layout and offline new seeds.
The hero scene has 30591 tufts despite zero Core tree density; max reaches 32768.
Actual buffers are 64/12 bytes per instance for matrices/colors; six live grass
buffers remain after scene replacement, with no old-buffer accumulation. Grass
geometry has 9 triangles; shader uses five active attributes/eight occupied locations,
with highest index span 9 in the test driver (limit 16). Materials matrix observed
up to 20 color calls; structural ceiling 22 and unchanged caster ceiling 19 are tested.
No new asset/sampler/render pass or Core identity. The existing 41-asset catalog is
retained. Raw evidence is in ignored artifacts/grass-* and grass-presentation-*.
Software WebGL is correctness evidence, not performance benchmarking. Dither stipple
in the fade band, fixed-cap sparsity on very large maps and rigid blades are v1 limits.

Grass PWA regression passes: cached reload/new tabs and new seeds, Remote recovery,
deferred update while busy and updated-version offline 3D terrain. Generated
deployment assets were restored after the update simulation.
