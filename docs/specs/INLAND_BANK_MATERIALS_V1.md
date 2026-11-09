# Inland bank materials v1

Presentation only; generation v14, result/workload/execution profile v15 and all
hydrology identities remain unchanged. No Core input/output or moisture is changed.

## Frozen policy

Seeds are the indexed triangles actually emitted by inlandWaterGeometry (both
selected lakes and supported exposed river surfaces), not drainage membership.
For each triangle, visit only grid vertices inside its XZ bounding box expanded
by 1.75 terrain units. Compute closest XZ point on that triangle and interpolate
its rendered surface height. Degenerate projected triangles are ignored.

A vertex contributes only on land (non-Ocean), at or above water minus 0.025 units,
and below water plus 0.65 units. Weight is the product of complementary smoothstep
falloffs over horizontal distance 0..1.75 and vertical rise 0..0.65. Underwater
vertices beyond the small presentation offset tolerance contribute zero. Combine
all contributions by maximum, never addition. Multiply by smoothstep(0.35, 0.8,
terrain normal Y) to suppress steep walls. This finite local support cannot climb
ridges or turn whole plains into wetlands; interpolation is terrain-grid limited.
The shader interpolates these samples across the existing terrain triangles, so
visible support may extend by up to one triangle beyond positive grid samples.
No propagation, rerouting, new water, geometry displacement or water mesh edits.

## Material and shader order

One Float32 wetness attribute per terrain vertex; zero where there is no visible
inland water. Existing Lambert surface mixing remains. Before Lambert lighting,
fog, tone mapping and output conversion, grass receives a maximum 16% blend
toward the existing textured soil color. Land terms darken at most 22% and receive
4% desaturation. Sand keeps its identity; rock uses only 45% of the darkening.
Snow and Ocean terms are unchanged, including partial snow coverage. Zero wetness
leaves the old albedo expression unchanged. No emission or roughness parameter.
The cache identity composes bank v1, biome ground, microdetail and atmosphere.

## Resources and ownership

Setup only, no per-frame work, allocations, extra textures, draws, shadow passes
or targets. Retained CPU attribute and GPU upload each cost 4*N bytes (1 MiB at
512x512); scalar scratch is constant. Work is proportional to emitted triangles
with a fixed local stencil (each emitted triangle lies within one terrain cell;
at most 36 grid vertices visited). Empty water avoids the triangle traversal.
Terrain geometry owns the attribute and releases its GPU buffer on normal,
replacement and failed scene disposal. No global cache or mutable source alias.

## Acceptance and limits

Unit tests cover exact triangle-distance support, maximum overlap, slope/vertical
and Ocean gates, rectangular/empty/max dimensions, finite bounded values and
source immutability. Production-factory browser tests compare wet/off at identical
camera/light/water phase and inspect real shaders with Reference/HDR/Bloom/night.
A pixel outside finite support remains unchanged. This is illustrative dampness,
not simulated soil moisture, erosion, gravel, reeds or dynamic shore transport.
