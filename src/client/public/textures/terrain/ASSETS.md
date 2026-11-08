# Terrain detail assets

Revision: atlas-detail-v1. Original assets created for this repository by
scripts/generate-terrain-textures.py, refined for Atlas Studio. The five PNG images
and their generator remain dedicated under CC0 1.0 Universal:
https://creativecommons.org/publicdomain/zero/1.0/ . No third-party imagery, fonts,
trained model output or external downloads are used.

Reproduce from the repository root with Python 3:
`python3 scripts/generate-terrain-textures.py`.
The standard-library generator uses fixed seeds 103..107, periodic interpolated
lattices and restrained scalar microdetail. This is offline asset preparation,
not application terrain computation. Files remain 256x256, grayscale, 8-bit,
lossless PNG with no baked directional lighting. Values are linear detail
multipliers, not RGB/sRGB albedo. The unchanged shader remaps intensity to 0.7..1.3.

Grass has fine weakly elongated grain; soil has smaller irregular crumbs; sand
emphasizes fine grain; rock uses fine mineral variation with shallow nondirectional
fractures; snow uses very quiet fine variation. This revision reduces contrast and
hard clipping while keeping meaningful detail. It does not alter hue or saturation
independently: the existing surface tints and color management remain authoritative.

The renderer still loads five textures once per preview lifetime, with periodic
four-grid/world-unit triplanar repeat. Texture paths, filtering, mipmaps, shader,
coverage/geometry, instances, lighting and ocean appearance remain unchanged.
All five are active and included in the complete offline catalog. No terrain math,
validation, workload or result identity changes. See the material specification:
[Atlas materials v1](../../../../../docs/specs/ATLAS_MATERIALS_V1.md).

## Current generated files

| File | Encoded bytes | SHA256 |
| --- | ---: | --- |
| grass.png | 52347 | e84a3e54fcf30a371ee6b0dbc3a34ab3676d5d1258da52cf45c05b7d8c5300be |
| rock.png | 53712 | d85c12b8397a0b55fcfab1fb49e5bc18af5071a3e1787871cd2e0773c4ac7bec |
| sand.png | 53176 | bd63e654feac0ffa126b680af404cd46b63696791bb9086776d196b7b6ede6d6 |
| snow.png | 43242 | 49198d8aa1d4328dcd02acb4be24caf50a60fcda3f1657bf019ba524bf8958d5 |
| soil.png | 51216 | 419e13fb49da4ae148cf34fb08c78679860bb8e15e5b255a16c73c7231c3457e |

Total encoded bytes: 253693. GPU RGBA8+mipmap estimate remains
1747627 bytes/view for five textures; encoded size is not live GPU/managed memory.
