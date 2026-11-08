# Regional climate and highland snow v1

Status: implemented; policy frozen before production code changes.
This supersedes climate/snow rules in LANDSCAPE_V3 and SURFACE_TRANSITIONS_V1.
Those specifications and v3–v8 fixtures remain historical evidence.

## Diagnosis and invariants

At globalWarmth=0.6, seeds 42, 2026 and -7 on 129x97 with 16 erosion steps
have minimum temperatures 0.39792943, 0.36708888 and 0.43812522. All exceed
old snow fade-out temperature 0.30, yielding zero snow. Relative peak heights
are 0.6305615, 0.710613 and 0.65272727. Raising visual brightness cannot fix
this mismatch. Raw diagnostics are in ignored artifacts/regional-climate-diagnosis-before.json.

Preserve terrain composition, local relief, erosion, float heights, slopes and the
boundary-connected ocean mask exactly. Existing biome IDs, schemas, controls,
placement algorithms/caps, palette, textures, camera and lighting are unchanged.
Moisture, temperature, categories, density, surfaces and downstream instances may
change. Coastal equations are unchanged but consume new climate and base coverage.
They continue preserving snow bits. There is no beach widening in this step.

## Climate sampling

Coordinates are unwarped world-grid x,y, anchored at (0,0), independent of map
extent, observed extrema, fine noiseScale and landformRegionScale. The latter
remains a terrain-region control, not a climate control. Three normalized fBm
octaves use the existing frozen value-noise hash/interpolation, ascending octaves,
lacunarity 2 and persistence 0.5. Signed seeds are reinterpreted as uint.

Let h=storedHeight/(float)heightMultiplier, or zero when that bound is zero.
Use double intermediates, clamp to [0,1] and cast once to float per stored field:

- humidity=Fbm(x/144+11, y/144+23, seed XOR 0xB5297A4D, 3).
- thermal=Fbm(x/128+17, y/128+31, seed XOR 0x1B56C4E9, 3).
- moisture=float(clamp(globalMoisture + 0.8*(humidity-0.5) - 0.15*h
  - 0.10*max(0,globalWarmth-0.6),0,1)).
- temperature=float(clamp(globalWarmth + 0.12 - 0.95*h
  + 0.5*(thermal-0.5),0,1)).

Shortest lattice wavelengths are 36 and 32 grid units; no mandatory latitude
stripe or per-cell random climate is introduced. Height-dependent cooling still
follows terrain. No map-size normalization guarantees all biomes in each seed.
Vegetation patch noise, slope calculation and all non-snow classifier thresholds
and precedence remain unchanged. Flat hot lowlands with globalWarmth>=0.9 and
h<=0.3 have temperature>=0.485, precluding snow for every possible thermal value.

## Snow policy

Let smooth(a,b,v) clamp u=(v-a)/(b-a) to [0,1] then return u*u*(3-2*u).
Base snow fraction is:

smooth(0.38,0.60,h) * (1-smooth(0.20,0.38,storedTemperature))
  * (1-smooth(1.0,1.4,storedSlope)).

Ocean coverage remains zero. Keep the existing remaining/grass/soil/exposed-rock
blend and float cast order. Snow is static illustrative coverage, not accumulation
or seasons. At slope>=1.4 it is zero, leaving exposed rock. Highland eligibility
uses h>=0.48, temperature<=0.26 and slope<=1.2; Ocean still has first precedence.
These categorical thresholds intentionally differ from continuous coverage: a
transition can display partial snow without becoming SnowHighlands. No new type
or semantic reinterpretation of existing IDs is required.

For identical geometry, increasing globalWarmth cannot lower stored temperature
or increase snow at any sample, including after coastal blending.

## Versions and budgets

Algorithm becomes diverse-landscape-v8; result semantics landscape-ecology-v9;
workload landscape-ecology-hydraulic-v9; execution profile landscape-worker-json-v9.
The result identity changes for semantics, not JSON shape. Keep hydraulic-grid-v1,
value-noise-fbm-v1, worker-rpc-v1 and presentation revisions unchanged. Reject old
algorithm versions at live hosts; do not combine old and new benchmark identities.

Compute both climate fields inside the existing O(N) ecology pass: six value-noise
samples per cell versus seven previously. Only scalar/tuple locals are added;
additional map-sized allocation is zero. Existing moisture/temperature buffers total
2 MiB at 512x512. No extra transport field, GPU attribute, texture, draw call or
instance cap is introduced. All climate/classification/placement remains inside
computeMs; validation, JSON, worker/network and display stay outside.

## Verification plan

Preserve historical v8 ecology/surface/classifier code only under tests, checked
against unchanged complete v8 hashes. Compare current height/slope/ocean/simulation
against that baseline and earlier field fingerprints. Derive new literal climate/
snow references with an independent standard-library Python implementation.
Exercise boundaries, normalized finite fields, zero height, rectangles, signed seed
extremes, maximum dimensions, warm/cold/mixed requests and pointwise warmth sweeps.
Check downstream support/caps with existing placement tests and full host parity.

Use atlas-materials.cjs --climate --before against the previous publication, then
--climate after publication. Seven requests and three fixed zooms preserve exact
camera matrices and height/slope/ocean/simulation hashes; ecological output is
expected to differ. After scenes also run the editor's complete WASM/API comparison.
Run the full landscape matrix plus material, coast, lighting and PWA regressions.
Evidence is correctness/appearance verification, never controlled performance data.


## Recorded verification

Locked restore, zero-warning/error Release build and all 202 Core / 40 API tests
pass. The 23 pre-climate requests preserve height, slope and hydraulic hashes; ocean
classification, finite normalized fields and bounded coverage/instances also pass.
Independent float32 climate/coverage literals, classifier boundaries, continuity,
pointwise warmth sweeps, anchored rectangular grids and no-map-allocation checks
pass. The allocation test for existing vegetation now warms the same branch/size
before measuring, retaining its original two-buffer budget.

All 300 Angular tests, seven packaging/documentation/texture checks and worker RPC
checks pass. Native host contract tests reject the preceding algorithm version;
client decoding rejects all preceding result/workload/profile identities.

Production Chromium 153 passes seven full WASM/API requests including signed seed
extremes, zero-height minimum size, rectangles, warm/cold scenes and 512x512 with
128 hydraulic steps. Maximum observed numeric error is zero across all fields,
trees and rocks. The maximum request still reaches existing instance caps; no
request/compute/display timing boundaries changed. Software-WebGL timings are
diagnostic evidence only.

Twenty-one before/after views preserve exact camera matrices, request settings
except algorithm version, and complete height/slope/ocean/simulation hashes. All
after scenes run the worker/API equivalence action. Overview and close-up scenes
show highland snow and broadleaf/conifer differentiation; no lighting or texture
changes were needed. Regional fields are broad, but local elevation still shapes
boundaries; this is not a geological or meteorological simulation.

For the three diagnosis seeds at warmth 0.6, average snow fraction across all grid
samples changes from zero to 0.04003, 0.31270 and 0.02179 respectively. These are
mean coverage weights, not percentages of snowy land. The very mountainous seed
2026 is substantially snowier than seed 42; there is no equal-biome quota. At warmth
0.9, seed 42 has zero snow; other seeds can retain partial snow on cold high peaks.
Hot lowlands remain snow-free by both the formula bound and tests.

The materials all-species fixture now uses warmth 0.7 rather than 0.6, so it still
exercises all three species and both variants after ecological eligibility changes.
Its assertions and resource caps are retained. Old numerical fixture files were not
regenerated. Raw evidence uses ignored artifacts/regional-climate-* and the existing
landscape/materials/coast browser reports. README remains empty.

Materials, six coastal parity scenarios, lighting and PWA regression checks pass
without page errors. The five textures, nineteen-call ceiling, 16384 tree / 8192
rock caps, static shadow reuse and independent viewport disposal remain intact.
Offline reload/new tabs generate fresh seeds; Remote fails offline and recovers
online; deployment updates defer while busy and remain usable offline afterwards.
The known optional WASM optimization warning persists; AOT was not enabled.
