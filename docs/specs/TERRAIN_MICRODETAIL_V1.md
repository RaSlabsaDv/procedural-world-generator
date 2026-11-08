# Terrain material microdetail v1

Status: implemented; policy frozen before production implementation. Presentation revision terrain-microdetail-v1.
Preserve all Core heights/fields, ecological categories, coverage, instances and identities.
No geometry displacement, shadow-policy change, new rendering mode or material UI.

## Baseline and assets

Eight fixed-seed cases: grass/plains, forest, dry soil, coast, steep rock, snow, mixed
transitions and512-square terrain. Standard dimensions129x97. Capture overview,
close and grazing views at identical cameras/sun with reduced-motion frozen waves.
Record full Core/API hashes and actual camera matrices; inspect rather than relying
on shader compilation. Low-poly geometry and global shadow-resolution limits are
not material defects. Target flat-looking close surfaces and repeated scalar detail.

One original reproducible RGB8 PNG stores five vertically stacked128-square normal
tiles (Grass/Soil/Sand/Rock/Snow). Decode once into 327680 RGBA bytes and upload as one
WebGL2 DataArrayTexture with five 128x128 layers. Hardware repeat/filter/mipmaps operate
per layer, so unrelated atlas tiles cannot bleed. This uses one sampler/download,
no manual atlas gutters or cross-tile mip filtering. Preserve the five existing
256-square grayscale PNGs and their colors. Normal data uses NoColorSpace.

Offline Python standard-library generator creates periodic band-limited scalar
microheight profiles and derives tangent normals without baked directional lighting.
RGB encoding is round(128+127*N), positive tangent Z; neutral128/128/255 decodes exactly
(0,0,1). Decode=(RGB*255-128)/127; slopes=XY/max(Z,.25). Document provenance, profile
seeds, encoded bytes and SHA256 beside the asset. No external image dependency.
An ImageBitmap/canvas2D decode is preparation only, not a user-facing 2D preview;
close the bitmap on completion/failure. Validate exact dimensions and byte length.

## Shader policy

Existing Lambert material/onBeforeCompile and atmosphere composition stay in place.
Grayscale color detail keeps its four-world-unit period. Normal detail uses a fixed
2.4-world-unit period, multiple offline spatial frequencies and strength .24; no
second runtime octave/sample set. Fade smoothly from full at24 world units to zero
at72, independent of map resolution. This avoids overview sparkle and sampling work.
Zero strength/full fade executes no normal sampling or lighting-normal replacement.

Obtain the base world normal from the existing view-space lighting normal via
inverseTransformDirection(normal,viewMatrix). Interpolate one world position varying;
no map-sized attribute/buffer. Let sx/sy/sz be axis signs and weights proportional to
abs(baseNormal)^4. Right-handed projection frames/UVs are:
X: T=(0,0,-sx), B=(0,1,0), UV=(-sx*z,y).
Y: T=(1,0,0), B=(0,0,-sy), UV=(x,-sy*z).
Z: T=(sz,0,0), B=(0,1,0), UV=(sz*x,y).
Each T cross B equals its signed projection normal. Convert sampled slopes into
world gradient in those frames and weight axes, then Grass/Soil/Sand/Rock/Snow by
existing coverage. Remove the component along the base normal and normalize
base+fade*strength*tangentGradient. Neutral samples preserve arbitrary base normals;
negative faces do not flip handedness. Convert back with mat3(viewMatrix).

Compute world-position derivatives before any weight/fade branch; use textureGrad
with explicit projection gradients so coverage branches do not break mip selection.
Perturb after normal_fragment_maps and before Lambert lighting. Preserve original
geometry normals, shadow generation/query inputs, biome palettes and coverage.
Ocean vertices have zero land weights and skip detail. Water uses its own shader.

## Ownership and budget

One cached micro-normal owner per preview, separate from the existing scalar-texture
owner. Support release/late completion, validated decode, load failure/retry and
independent views. Release texture on destruction; scene replacement reuses it.
Include load/decode wait in textureWaitMs; allocation/upload remain display work
outside computeMs/requestMs. Defer setup under OperationLock and keep original
first-submission semantics. No animation/dependency or eager Three import.

One extra array sampler: five scalar samplers plus one normal array plus existing
shadow sampler, seven for the current terrain program (verify against actual GPU
limits; WebGL2 minimum 16). At most15 additional normal lookups (five active channels
x three axes) when near; typical channels fewer. Existing scalar maximum15 lookups
and PCF shader sampling remain. No additional draw/pass/target or full-map arrays.
Raw CPU decoded buffer320KiB/view; mipmapped GPU array about426.7KiB/view,853.3KiB
for two (actual8 mip levels sum436900 bytes/view). PNG target<=256KiB. Existing
five grayscale GPU maps/normal-water/shadow budgets unchanged; add one required PWA
asset. Color ceiling21, caster ceiling19. Record actual allocations/sampler counts.

## Acceptance

Test deterministic assets, period/seams, bounded normalized data and exact neutral
encoding. Test loading/configuration, independent texture ownership, late disposal,
failure/retry, shader/atmosphere composition, signed projection frames and neutral/
fade behavior. Real Chromium verifies actual array mip levels/layers/samplers,
material orientation/strength/fade via isolated probes, paired eight-case camera/
full Core hashes, close/grazing appearance, noon/low sun/night, both views, resource
cleanup, operation pause, min/max sizes, narrow/offline generation and PWA updates.
Freeze camera and waves for pixel comparisons. Skip native suites if native source
is unchanged. Software WebGL evidence proves correctness, not performance gains.
Docs/UI English; README empty. Do not commit until requested. Next visual stage:
vegetation variation/LOD; execution diagnostics/cancellation remain separate.


## Verification

347 Angular tests, 12 packaging/asset checks, worker RPC and production publication
pass. Encoded PNG 201699 bytes; actual GPU array 128x128x5 RGBA8 with 8 mip levels,
436900 bytes/view. Terrain uses 7 samplers (tested limit 32; WebGL2 minimum 16) and 5 attributes.
Material regression keeps 21 color/19 caster ceilings, five scalar textures and
static shadow ownership, including replacement/failure/independent-view cleanup.
Actual GPU fixtures exercise 28 signed-axis/neutral/zero-strength and non-axis cases
using the production GLSL functions. World fade gives an exact on/off overview
reference; all 8 prior overview PNGs are byte-exact. 24 paired views preserve exact
camera matrices and complete Core hashes through 512-square terrain. Close/grazing
images were inspected; Sun/noon/low-sun/night, Moon/foam and offline/narrow scenarios
pass. No native code, workload identity or Core result changes. Raw evidence is in
ignored artifacts/terrain-microdetail-* and microdetail-*; software WebGL checks
establish correctness, not performance gains. Decode transient budget 2 MiB/view
excludes browser-internal storage; retained raw bytes 327680/view are explicit.

Microdetail PWA regression passes: cached reload/new tabs and new seeds, Remote
recovery, deferred update while busy and updated-version offline 3D terrain with
the new normal atlas. Deployment assets were restored after the update simulation.
