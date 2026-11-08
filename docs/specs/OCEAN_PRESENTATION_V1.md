# Ocean presentation v1

Status: implemented; policy frozen before implementation. Rendering revision ocean-presentation-v1.
All Core fields, workload identities, camera and terrain materials stay unchanged.

## Geometry and mask

Sea world height=seaLevel*float32(heightMultiplier), stored as float32 vertex Y.
Use the same two upward triangles per quad as terrain. Clip each triangle to
height<=sea, only when it contains an authoritative Ocean vertex. Never classify
new Ocean. A triangle containing non-Ocean vertices at/below sea is conservatively
omitted: four-connected Core water can disagree with diagonal triangle connectivity.
This rare ambiguous one-cell area may omit a water sliver rather than flood a dry
pocket. Test and report this limit explicitly. No water outside map bounds.

Depth at original Ocean vertices is max(0,sea-height); new shoreline intersections
have depth0. Interpolate on the original terrain triangles; no scene-depth pass or
bathymetry copy. Canonical indexed edge intersections prevent cracks. Zero-depth
Ocean remains eligible, including zero-height maps. Skip empty geometry entirely.

Two-pass construction allocates exact clipped index capacity and N+intersection
vertices. Each vertex has position3/depth1/shore1 float attributes. At most3N edge
intersections and12N indices: <=32MiB raw typed geometry storage on CPU and GPU separately at512x512 per view,64MiB for
two; typical costs are lower. Three int edge slots per grid vertex provide bounded
caching, no Map/per-triangle heap objects. Scratch is <=4.25MiB raw (edge cache,
byte Ocean shore distance and int FIFO), with a6MiB overhead budget. Original grid
vertices may be unused; their inclusion gives conservative map-sized bounds.

Ocean-only four-connected distance to adjacent land is capped8; outside-map space
is not land. Foam requires both shallow depth and proximity to actual land, avoiding
white zero-depth all-Ocean maps. Shore intersections use distance0. No hydrology,
river masks, terrain deformation or Core changes.

## Shading and presentation controls

UI settings: shallow water color #49b7b5; turbidity .38 in [.02,2] inverse world units;
foam intensity .45 in [0,1]. Validate before mutation. One app-scoped immutable
snapshot feeds both views; controls are collapsed, resettable, disabled during
operations and never enter TerrainRequest. Body tint scales by clamp(environmentFillIntensity/1.05,.05,1.5).
Color is authored sRGB and converted
to linear in the renderer; deep tint multiplies it by (.18,.28,.45).

T=exp(-depth*k), absorption weight A=(1-F)*(1-T). Schlick
F=.02+.98*(1-clamp(dot(N,V),0,1))^5. Reflect the shared horizon/hemisphere sky colors,
not geometry/clouds. Combine premultiplied contributions A*depthTint+F*sky+sunSpec;
coverage=A+F. This retains reflection at depth0. Foam composites over these
contributions, then divide by final alpha for standard straight-alpha blending.
Use FrontSide, depthTest=true, depthWrite=false, polygonOffset -1/-1 against
coincident zero-depth terrain. Opaque terrain/trees/rocks render before the water.
No refraction pass, scene reflection, underwater camera or physical wave geometry.

One128x128 RGB8 periodic CC0 normal tile, generated offline by the standard-library
script, sampled twice at world scales9/4 with distinct scrolling directions. Decode
and combine tangent normals, map their positive Z to world +Y; strength .18 fades
between camera distances80/240. Geometry stays fixed. Sun Blinn-Phong exponent120
uses the view-owned environment world direction/color/intensity. Fog uses existing
linear view-depth fog and shared horizon color, without double tone/output encoding.
Foam depth fade .04.. .65, shore fade .5..2.5 cells; normal/noise sampling supplies
restrained movement. The next sky/fog stage replaces the horizon approximation.

## Animation, ownership and timing

One app-scoped animation hub schedules a single requestAnimationFrame for registered
visible water views outside Angular. Shared phase advances only while unpaused,
page visible, motion allowed and at least one view visible. Reset the last timestamp
on pause/visibility changes; cap drawing at 30 FPS and clamp frame delta to .1s. Both views get the same phase.
Reduced-motion holds a frozen phase; explicit freeze sets the hub phase. The shader
uses hub phase plus shared environment visualTimeSeconds, modulo 1000 seconds. No worker/Core call advances it. Ocean-free views register no animation.

Each preview owns geometry, ShaderMaterial, normal texture and visibility observer.
Normal texture owner supports late completion, release and retry like terrain assets.
Uniform-only settings updates retain mesh/camera and first-submission measurement.
OperationLock is checked synchronously before every render, including pending RAF;
all animation stops during collection. Resize/controls render on demand without
creating another recurring loop. Hidden/offscreen views submit no frames. Disposal
cancels callbacks/observers and restores independent-view ownership.

One extra water color draw, no shadow caster draw or shadow update per normal frame.
Total color cap20, caster cap19; existing terrain/tree/rock ceilings remain. One
extra normal texture per Ocean view, <=128²*4*4/3 GPU bytes plus small material
uniforms; five terrain textures and2048 PCF targets remain. Cache the new asset in
the complete PWA catalog. Scene geometry/GPU setup is display CPU work, not computeMs;
first submission is not GPU completion. No animation competes with timed operations.

## Acceptance

Unit tests cover clipping/equality, full/empty Ocean, isolated dry lowland, diagonal
ambiguity, depth interpolation, nondegenerate indices, min/rectangular/max budgets,
settings validation/reset, shader bindings, late texture/retry ownership, scheduler
pause/visibility/freeze/recovery and disposal. Real Chromium covers frozen-time
paired camera/full Core hashes, shader compilation, controls without generation,
animation movement/pause, two views, resource limits, no-Ocean, zero-height and PWA.
Images must show readable depth, restrained shoreline foam and grazing highlights;
record sorting/mask/low-poly/horizon-reflection limits honestly. README stays empty.

## Verified scope and limits

324 Angular tests, eight Python packaging/asset checks and the worker RPC check pass.
The production publication contains 39 catalog assets. Eighteen paired views retain
exact camera matrices and complete Core numerical hashes; pixels intentionally change.
Real Chromium verifies shader compilation, animated/shared phases, controls without
generation, operation pause, independent resources and maximum Ocean geometry.
Raw evidence is under ignored artifacts/ocean-*. Software WebGL smoke checks are
correctness evidence, not hardware performance measurements.

Water uses the original low-poly shoreline and conservative diagonal omission above.
It does not receive the directional shadow map; shallow terrain retains its existing
shadows. There are no water side walls, scene reflections or physical refraction.
Horizon/hemisphere color reflection is an approximation until the atmosphere stage.

Focused Chromium checks also pass for no-Ocean animation shutdown, 512x512 Ocean
(11509784 raw GPU geometry bytes), zero-height Ocean, cached new-seed offline water,
and narrow layout. Lighting, editor and PWA update regressions pass, including
offline new-tab generation, Remote recovery and update deferral while busy.

Water ripple correction: the original three-wave normal tile produced directional
bands, especially in foam. The same-size offline tile now combines 64 fixed-seed
components with independent phases and balanced perpendicular directions. A normal
covariance regression checks directional balance; geometry, shader sampling cost,
Core values and resource caps remain unchanged.

Ripple correction verification: nine packaging/asset tests and production publish
pass. Eighteen paired camera/full numerical hashes are unchanged. Chromium water
checks pass, including animated comparison views, computation pause and new-seed
offline rendering. Frozen close-up views show removal of the directional bands;
the existing low-poly shoreline remains.
