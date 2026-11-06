# Diverse landscape v2

Status: implemented and verified; v2 equations are frozen for this implementation. This replaces public v1 generation in the existing editor, not a second mode. Historical v1 equations, Python reference and literal fixtures remain separate evidence.

## Identities and contract

Algorithm `diverse-landscape-v2`, result `landscape-ecology-v2`, workload `landscape-ecology-hydraulic-v2`, profile `landscape-worker-json-v2`. Simulation remains `hydraulic-grid-v1`: its arithmetic, timestep and closed boundaries are unchanged.

The existing terrain request additionally requires plainsCoverage, mountainCoverage, globalMoisture and seaLevel. All are finite 0..1; plainsCoverage + mountainCoverage must be <=1. Defaults: .45, .30, .65, .16. They express tendencies, not per-seed area guarantees. Sea level is a fraction of the float32 height bound. Existing seed/map/noise/work limits remain authoritative in Core.

Result retains dimensions, row-major float32 values, numeric biomes and versions, and adds equally sized float32 moisture, temperature, slope, vegetationDensity arrays plus trees. Trees are records with cellIndex, x, y (height), z, scale and rotation, in ascending cellIndex order. Grid coordinates are not centered until rendering. Each cell has at most one tree; at most 16384 trees are returned. No transport defaulting is allowed.

## Composition

Use the existing explicit unchecked uint hash/quintic lattice interpolation. Seed is reinterpreted uint. fBm uses double intermediates, ascending octaves, frequency doubling, amplitude halving, normalization and clamp. Existing warp fields retain XOR A341316C/C8013EA4, frequency .35, offsets (17,31)/(47,13), 3 octaves. Coordinates remain x*noiseScale, y*noiseScale in illustrative grid units.

Define Smooth(a,b,t) by clamping (t-a)/(b-a) and applying u*u*(3-2*u). The regional field is clamp(2*(Fbm(warped*.65, seed XOR D1B54A35,3)-.25),0,1). Plains weight is 1-Smooth(p-.08,p+.08,region); mountain weight is Smooth(1-m-.08,1-m+.08,region); hill weight is max(0,1-plains-mountains). A zero coverage forces its weight to zero, one forces it to one. Sum of coverage <=1 prevents competing full landform claims. Blend by weights, without step thresholds.

Base = .08+.26*Fbm(warped*.18, seed XOR AD90777D,octaves). Rolling = Fbm(warped*.6, seed XOR 68E31DA4,octaves). Detail = Fbm(warped*2, seed XOR 9E3779B9,octaves). Ridge = (1-abs(2*Fbm(warped*.8, seed XOR 7E95761E,octaves)-1))^3.

Plains = base+.012*(2*rolling-1)+.003*(2*detail-1). Hills = base+.07+.13*rolling+.015*detail. Mountains = base+.10+.62*mountainStrength*ridge+.025*detail. Clamp the weighted sum to 0..1, multiply by the float32 height bound and retain double state for erosion. All pure composition passes are row-major. Zero bound still executes the requested work.

## Final environment

Derive from final float32 terrain after erosion. Ocean uses four-connected boundary flood fill of samples <= seaLevel*float32Bound, including equality. Below-sea interior depressions remain dry. Ocean classification is static and does not constrain the erosion kernel's transient water; no lakes, marine exchange or river simulation is claimed. Ocean changes color only; no spill-fill water surfaces are added.

Slope is sqrt(dh/dx squared + dh/dz squared), centered differences internally and one-sided at edges, grid spacing 1. It is a nonnegative illustrative gradient, not a slope angle or a calibrated physical scale.

At unwarped noise coordinates: moisture=clamp(globalMoisture+.7*(Fbm(coords*.65+(11,23),seed XOR B5297A4D,4)-.5)-.15*normalizedHeight,0,1). Temperature=clamp(.78-.5*normalizedHeight+.18*(Fbm(coords*.3,seed XOR 1B56C4E9,3)-.5),0,1), an illustrative normalized warmth proxy. normalizedHeight is zero when bound is zero. Patch=Fbm(coords*1.3,seed XOR 85EBCA6B,3).

Biome precedence: Ocean=0; Rock=4 when slope>.8 or height>.86 and temperature<.4; DryGrassland=3 when moisture<.36; Forest=2 when moisture>=.53, temperature>.25, slope<.5 and patch>.42; otherwise Grassland=1. Forest density=clamp((moisture-.45)/.4,0,1)*(.45+.55*patch)*clamp(1-slope/.8,0,1); all other biomes have density zero. Fields are stored float32 before classification/vegetation eligibility decisions.

## Vegetation

A candidate belongs to a grid quad whose four corners are Forest with slopes <.5. Its acceptance probability is mean corner density*.65, evaluated using the lattice hash at integer (x,z), seed XOR C2B2AE35. Independent XOR seeds 27D4EB2F/165667B1 produce local x/z offsets .15+.7*hash. Round x/z to float32 before computing tree height on the exact terrain triangles (diagonal from top-right to bottom-left). Scale=.6+.8*hash with XOR 94D049BB; rotation=2*pi*hash with XOR 369DEA0F.

For more than 16384 candidates, retain the smallest independent priorities (seed XOR DB4F0B91), tie by cellIndex. A bounded priority queue avoids row-major spatial truncation. Return selected trees sorted by cellIndex. This cap bounds the computed output, not forest coverage; density remains available for all samples. Render every returned instance with shared low-poly trunk/crown geometry, two instanced meshes per viewport. No renderer PRNG or biome classification is used.

## Timing and resource policy

Core computeMs includes composition, unchanged erosion, final environment, ocean flood fill, density, candidate selection, bounded tree allocation, sorting and conversion. Validation, JSON, worker/HTTP transfer, client normalization/comparison and Three.js are excluded. Renderer CPU setup includes terrain/tree geometry, matrices and first submission; it is not GPU completion. Do not pool v1 and v2 timings.

Maximum dimensions remain 512x512, maximum work 33554432 cell-iterations (128 steps at maximum dimensions). Raw final float fields use about 5 MiB plus biome enum storage, queue/output and capped trees; erosion double buffers require about 18 MiB separately. JSON, GC lifetimes, runtime, typed copies and WebGL add overhead; measure production response bytes and WASM memory before claiming a device budget. No capture, timeline, brush tools, presets or benchmark runner are included.

## Verification evidence

Release native tests cover v2 composition against an independent scalar Python fixture, historical v1 fixtures, synthetic mask continuity, ocean connectivity, biome precedence, gradient units, conservation, validation, reproducibility and priority-capped placement. API/native WASM export tests compare complete environment and tree JSON, plus missing/overflowing new fields. Angular tests cover strict field/tree decoding, full-result comparisons, instancing, surface alignment, caps and resource disposal.

Chromium 153 production matrix compared complete Local/Remote fields and tree transforms with maximum observed error zero. Cases included Int32 extremes, zero height, 129x129x32, wetter/drier seeds and 512x512x128 with all-plains/wet settings. The latter returned exactly 16384 trees, a 14587198-byte Local JSON response, and an active main-thread heartbeat. Reserved WASM linear memory grew from 33554432 to 120586240 bytes across the matrix. These are environment-specific smoke observations, not live managed memory, browser RSS, peak memory guarantees or controlled performance findings. The 512x512/16384-tree result also passed the full Angular decoder and WebGL renderer. Offline reload generated a new seed with visible forests. Reproduce with tests/browser/landscape.cjs and the PWG_* settings in DEVELOPMENT.md. Generated screenshots and raw evidence live under ignored artifacts/.
