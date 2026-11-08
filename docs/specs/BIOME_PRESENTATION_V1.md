# Biome ground and foliage presentation v1

Rendering policy: terrain-biome-ground-v1, layered onto unchanged atlas-detail-v1 assets and
terrain-surface-coverage-v2 math. The Core workload, schema and classifications stay
unchanged. This step makes supplied biome IDs visible; it creates no new climate,
snow, coast, vegetation or ecological decisions.

## Representation frozen before implementation

Reuse the supplied Uint8Array biomes as one unnormalized one-component biomeId
BufferAttribute. IDs 0..8 are exactly representable as vertex floats; reject unsupported
IDs/lengths rather than painting a fallback category. The attribute aliases existing
client storage and is never modified; no new map-sized CPU array/intermediate pass
is needed for color derivation. GPU upload adds one byte/sample: 262144 bytes
(0.25 MiB) at 512x512 per view, 0.5 MiB for two views. This adds to existing geometry
and five-MiB coverage storage, not total GPU memory. Float RGB attributes would add
3 MiB/view and quantized RGB factors would add 0.75 MiB/view; neither is necessary.

Two fixed nine-entry vec3 uniform palettes are converted by Three.Color from sRGB
hex to the existing linear working space. Their numeric GPU payload is 216 bytes;
JS Color/array overhead is fixed, not map-sized. Vertex code looks up grass and soil
colors using the exact Core ID, before two vec3 varyings interpolate those colors.
Never interpolate category indices or classify climate/slope/density in the shader.
One added vertex attribute and two vec3 varyings must compile within actual device
limits. Shader program cache key becomes terrain-biome-ground-v1; no new sampler,
material-per-biome mesh, draw, frame loop or smoothing/blur pass is introduced.

## Color and preservation policy

Central pure presentation constants own base surface colors, paired biome grass/soil
colors and Small/Mature crown colors. Grassland is restrained sage; broadleaf forest
has darker green/brown understory; conifer understory is cooler/deeper; dry grassland
and savanna have distinct warm/olive earth; tundra is subdued gray-green/gray-earth.
Ocean, Rock and SnowHighlands use the original grass/soil colors as neutral entries.

The fragment shader substitutes these colors only in the existing grass and soil
coverage contributions. Sand, snow, rock and ocean terms retain their exact original
colors/equations/detail sampling. No tint multiplies the final mixed ground color.
Mixed boundary pixels may contain changed grass/soil and unchanged protected terms.
Ordinary triangle interpolation softens category changes within a cell; there is no
claim of wider ecological blending. Check triangular artifacts in real scenes before
considering any additional separately budgeted smoothing work.

Crown materials alone receive quieter/deeper species colors. Trunk colors, geometry,
variant dimensions, instance records/transforms, batching and shadow settings remain
unchanged. Legend swatches reference ecological categories, not exact shaded mixtures.

## Verification

Run atlas-materials.cjs --biomes --before against the old presentation, then rerun
with --biomes after publication. Seven requests cover mixed grass/forest, conifer,
savanna/dry ground, tundra, snow, gentle sandy shore and steep rocky shore, each at
three fixed zoom levels. Actual matrices/dimensions and full mathematical hashes
must match. Inspect protected-material scenes and capture attribute/device-limit diagnostics
in real WebGL. Preserve five textures, nineteen-call cap, instance caps and static shadow
reuse; validate disposal/replacement/independent comparison views and offline updates.
Tests must exercise supplied IDs, byte encoding, linear conversion and selective
shading, not merely repeat palette constants. README stays empty.


### Recorded implementation evidence

300 Angular tests pass, including ID encoding/aliasing, unchanged geometry and
coverage under ID replacement, linear uniform conversion and selective shader
terms. Seven build/documentation/asset checks and production publication pass.
Chromium 153 compiles the shader with five active attributes against a limit of
16 and reports 31 varying vectors. Maximum geometry uploads exactly 262144 biome
bytes, one live buffer per view; replacement and independent viewport destruction
release old buffers. No map-sized color buffers are created.

All 21 before/after frames retain exact camera matrices, dimensions, requests and
full mathematical hashes. Overview/close/detail samples were visually inspected:
forest ground is darker, conifer ground cooler, dry land warmer, and snow/coastal
contributions remain legible. Existing cell-scale category boundaries remain; no
wider transition or climate improvement is claimed.

Materials, six coast/cross-mode scenarios, lighting and PWA browser checks pass without
page errors. Five textures total 253693 encoded bytes, draw caps remain nineteen,
instance caps remain 16384 trees / 8192 rocks, and static shadows are reused. These
are presentation/resource checks, not controlled performance results. Core/host
sources are unchanged, so native suites were not rerun.

PWA checks cover offline reload/new tabs with fresh seeds, Remote failure/recovery,
no cached API responses, deferred updates while busy and the updated 3D view offline.
The known optional WASM optimization warning remains during publish. Browser reports
and screenshots are retained under ignored artifacts; no benchmark claim is added.


The subsequent [regional climate policy](REGIONAL_CLIMATE_V1.md) changes Core
semantics while retaining this palette/rendering policy. The original paired hashes
above apply to this presentation-only step, before that climate change.
