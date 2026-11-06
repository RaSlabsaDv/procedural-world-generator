# Terrain detail assets

Original assets created for this repository by scripts/generate-terrain-textures.py.
The five PNG images and their generator are dedicated under CC0 1.0 Universal:
https://creativecommons.org/publicdomain/zero/1.0/ . No third-party source imagery,
fonts, trained model output or external downloads are used.

Reproduce from the repository root with Python 3: `python3 scripts/generate-terrain-textures.py`.
The standard-library generator uses fixed seeds and periodic interpolated lattices;
it performs offline texture preparation, not application terrain computation.
Each file is 256x256, grayscale, 8-bit, losslessly encoded PNG. Values are linear
detail multipliers, not sRGB albedo. The shader remaps intensity to 0.7..1.3 and
multiplies the existing biome tint; no directional lighting is baked into assets.
Grass has fine elongated grain; soil has mixed granular scales; sand emphasizes
fine grain; rock has broad irregular contrast; snow uses subdued fine variation.

The renderer loads grass, soil, rock and snow once per preview lifetime. Sand is
reserved for the later coastal stage, remains unused by the shader and is still
included in the complete offline catalog. All images tile periodically. The
repeat distance is four grid/world units on each triplanar projection axis.
