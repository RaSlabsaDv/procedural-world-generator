# Atlas terrain detail v1

Presentation revision atlas-detail-v1 refines the five existing local grayscale
surface-detail PNGs for the Atlas Studio interface. It does not version/change
Core mathematics, surface weights, biome decisions, placement, transport or workload.

## Scope and reproduction

Run `python3 scripts/generate-terrain-textures.py` from the repository root.
Python standard library only; fixed seeds 103..107, periodic cubic-interpolated
lattices at frequencies 4/8/16/32/64/128. PROFILES in that script fixes the center,
contrast and relative scale contributions. Grass stretches only fine layers by two;
all other grain is isotropic. Rock subtracts a bounded smooth narrow ridge from an
independent frequency-32 lattice: at most .05 scalar detail, or .03 in the unchanged
shader's multiplier. No directional illumination is baked into the textures.

The intent is coherent distant regions and restrained close detail: less fibrous
grass, fine irregular earth, subdued sand grain, softer mineral surfaces and quiet
snow. Texture tints cannot be independently recolored through grayscale maps. The
existing sage/yellow-green, earth, ochre, stone and snow surface tints are preserved;
no RGB albedo conversion, color-management adjustment or shader tint change is made.
Full palette, foliage, decorative-rock and water styling remain separate future work.

Each file remains 256x256 grayscale 8-bit PNG, lossless and seamless. The sampler is
periodic rather than copying the first/last pixels; neighboring wrap samples need
not be identical. Current files have no black/white clipping and retain nonzero
variation. Texture count, four-unit world repeat, triplanar equations, filtering,
anisotropy, mipmaps and terrain-surface-coverage-v2 remain unchanged. Coast proximity,
snow coverage, ocean color, renderer light/fog/shadow and camera policies are frozen.

[ASSETS.md](../../src/client/public/textures/terrain/ASSETS.md) records provenance,
CC0 dedication, generated SHA256 hashes and encoded byte totals. Assets remain
locally bundled; no artwork service or runtime dependency is introduced. Logical
GPU RGBA8+mip storage stays about 1.67 MiB/view, five textures, with no extra buffers,
texture layers, shader samples or draws. This is not total runtime memory.

## Verification procedure

Run `python3 -m unittest discover -s tests/build -v` for deterministic reproduction,
format, budgets, hash notes, periodic samples, seam-neighbor checks and unclipped,
non-flat detail. Tests verify behavior rather than duplicating palette coefficients.

With the production app running, use the same PWG_* environment as existing browser
checks. Before replacing assets, run `node tests/browser/atlas-materials.cjs --before`;
after regeneration/publication, run `node tests/browser/atlas-materials.cjs`.
The six fixed requests cover mixed terrain, plains, mountains, warm/gentle coasts
and cold snow, each at overview/close/detail zoom. Each generation explicitly resets
the camera; saved actual projection/model-view matrices and viewport dimensions must
match before/after. Complete numerical result/summary hashes must remain identical.
This comparison uses the same current Core in both phases, not historical generators.

Also run materials, coasts, lighting and PWA browser scenarios for real decoding,
shader compilation, full cross-mode comparison, capped instance/draw counts, static
shadow reuse, failure/retry/ownership and offline availability. Diagnostic scripts
collect only terrain parameter inputs; experiment controls are not host parameters.
Screenshots, raw swatches/repeated tiles and JSON evidence are ignored artifacts.
Asset-wait/render observations are not controlled benchmark results.


## Verified results

All 297 Angular tests and seven Python build/asset checks pass. Production publication
succeeds with unchanged CSS/asset budgets and the existing optional WASM optimization
notice. Materials, coasts, lighting and PWA browser scenarios pass without page errors.
The 18 before/after views preserve exact camera matrices/dimensions and complete
numerical result/summary hashes. The six coastal host comparisons retain maximum
observed coverage error zero, gentle sandy shores, steep rocky shores and protected
dry inland depressions. All five actual PNG uploads, independent view cleanup,
maximum returned instances, nineteen-call cap, static shadows and offline reload/
new tabs/updated-version terrain remain verified.

Current encoded assets total 253693 bytes versus 271377 previously. All remain
unclipped scalar microdetail; the standard deviation of the 8-bit detail samples is:

| Texture | Before | Atlas detail v1 |
| --- | ---: | ---: |
| grass.png | 30.60 | 19.79 |
| rock.png | 58.71 | 22.68 |
| sand.png | 26.25 | 20.54 |
| snow.png | 12.63 | 9.55 |
| soil.png | 24.19 | 18.19 |

These intensity statistics describe detail contrast, not rendered RGB saturation or
performance. Actual overview/close/detail scenes and native/repeated swatch sheets
were visually inspected. Full tint/palette changes would require a separately scoped
material-color refinement; tree, decorative-rock and water appearance are preserved.
Core/host sources and numerical fixtures were unchanged; native test suites were not
rerun. Raw ignored evidence includes atlas-materials-before/after.json, atlas-textures-
before/after.json, atlas-materials-before/after-sheet.png and the existing materials/
coasts/lighting/PWA reports. No controlled benchmark findings are claimed.


## Subsequent composition

The assets and their original verification above remain unchanged. Current
terrain-biome-ground-v1 overlays grass/soil and crown palette changes specified in
[Biome presentation v1](BIOME_PRESENTATION_V1.md); protected surface contributions
retain the original equations.
