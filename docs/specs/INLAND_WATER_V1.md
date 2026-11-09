# Inland water presentation v1

Frozen presentation policy before implementation. Canonical C# outputs and identities
remain diverse-landscape-v13 / result, workload and profile v14. No Core or wire change.

## Surfaces

Use the existing terrain diagonal. A triangle supports a lake only if it touches
exactly one selected basin and every nonmember corner is at/above that lake's level.
Clip its linearly interpolated bed against the exact Core waterLevel. This finite
one-ring footprint meets the actual shoreline instead of ending above submerged
terrain at an artificial membership threshold. Never scan/flood further triangles.
Ambiguous mixed basins or below-level outsiders are unsupported and suppressed.
Different basins never share positive-area ownership; membership itself is unchanged.

River geometry is a union coverage field on terrain vertices, derived ONLY from
existing receiver edges and Core widths. Radius is half width, linearly interpolated
along an edge. Rasterize radius-minus-distance within a fixed local bounding box;
max union joins bends/confluences without overlapping transparent quads or miters.
Clip terrain triangles against positive coverage and allowed-bank membership. Widths
below one grid cell have a piecewise-linear approximation; no sub-grid tessellation.

Expose ordinary land edges only if both endpoints have zero analysis depression
depth and downstream terrain does not rise beyond existing float tolerance. Do not
render edges through unselected positive-depth cells, same-lake submerged edges,
lake-to-lake drops or unsupported cliffs. This intentionally shows only supported
parts of the complete canonical network. Coverage is grounded on interpolated bed
plus 0.012 grid units, not the priority-flood surface. A 0.9 optical-depth convention
makes thin surfaces legible; it is not physical channel depth or discharge.

Support lake shore connectors with one selected endpoint and one dry endpoint at/
above lake level within float tolerance. An outlet's dry endpoint must also be at/
below that level within tolerance: cliff drops/uphill outlets are suppressed. Clip
river coverage against bed>=lake level in a lake-owned triangle, meeting the real
shoreline. River vertices stay on bed+0.012; no raised shelf or spill-surface bridge.
Ocean mouths require the land source at/above sea level; clip bed>=sea within Ocean-
adjacent triangles. No waterfalls or invented canonical levels. The whole canonical
network remains available even when some routes have no supported exposed surface.

## Rendering and ownership

At most two extra color draws/view: one batched lake mesh and one river mesh;
no water shadow passes. Reuse ocean material/normal asset, lighting, atmosphere,
settings, HDR/Bloom and shared clock. Ocean shader/default path stays unchanged;
river mode adds directional normal advection, slope normals and reduced foam.
No per-frame buffer construction or extra RAF. Inland-only maps load the normal
and register through hasWater. Respect busy/hidden/reduced-motion/frozen-phase gates.

Triangle clipping uses fixed reusable polygon scratch and two passes for exact-sized
indexed buffers. Lake polygons have at most 4 vertices/6 indices, and at most 6B owner-
triangles for B selected cells: 104*6B numeric bytes. River polygons have at most 7
vertices/15 indices (at most 4 planes), at most 2N triangles; position, depth, shore,
flow and normals take at most 340*2N bytes. These are conservative per CPU/GPU copy
bounds, not observed allocations or combined memory peaks. Never silently truncate.
Coverage/flow/width/degree arrays use 17N scratch bytes (4.25 MiB at 512x512), conservatively
retained while the setup-only river surface query is owned. Fixed local neighborhoods
follow width<=3 and D8 length<=sqrt2. Empty inland data allocates no field buffers.
Record actual sizes separately. No per-frame geometry construction or allocation.

Suppress tree/grass anchors below the actual lake OR rendered river surface, and
fully submerged rocks (top bound=y+scaleY). Use the same terrain triangles, clipped
shoreline and coverage predicate for decoration. Filter a presentation view without
changing Core arrays; the same filtered tree list feeds LOD/casters. Large emergent
rocks remain. No shadows from suppressed instances. Lake foam is 0.25 of the shared
formula with 0.08 detail-normal strength; river foam is 0.18 with receiver-direction
advection. Inland foam coverage also follows diffuse light to avoid sRGB Reference
blending brightening an unlit thin surface. The default Ocean shader is unchanged.
These are appearance conventions, not physical flow speeds/depths.

Scene owns and disposes all inland geometry/materials, including failed builds.
Comparison views share no mutable materials. Existing normal owner remains preview-
owned. Settings and phase update every water mesh, including no-Ocean maps.

## Verification

Use geometry/ownership/lifecycle tests and actual production browser screenshots
with fixed cameras/phases for lakes, rivers, confluences, transitions, day/night,
Reference/HDR/Bloom, two views, narrow viewport and no-Ocean maps. Preserve all
versioned Core fingerprints. Water construction belongs to existing CPU display
setup; first submission is not GPU completion. No performance improvement claim.
PWA update/offline regression last. README empty; production SSAO stays deferred.
