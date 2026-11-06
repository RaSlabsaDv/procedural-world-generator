# Terrain hydraulic workload v1

This is the historical v1 workload specification. The current public generator is specified in [LANDSCAPE_V2.md](LANDSCAPE_V2.md). V1 reference equations and literal fixtures remain in tests; it is not exposed as another editor mode. Its arithmetic is frozen. Reproduction commands and environment-specific smoke evidence are in [DEVELOPMENT.md](DEVELOPMENT.md).

## Contract and limits

The `POST /api/v1/terrains` and WASM `GenerateTerrainJson` accept a required `heightMap` object with the composition request fields, plus required `mountainStrength`, `warpStrength`, `iterations`, `rainfall`, `evaporation`, and `algorithmVersion = warped-ridged-hydraulic-v1`. Units are illustrative world units with grid spacing 1. UI defaults are 0.55, 2, 64, 0.05, and 0.1 respectively. Mountain strength is 0..1, warp strength 0..8 noise-coordinate units, iterations 0..2048, rainfall 0..1 water-depth units per simulation-time unit, evaporation 0..1 per time unit. All doubles must be finite. Existing map limits remain 2..512 and 262144 cells. `cells * iterations <= 33554432`, checked with Int64 before allocation, bounds simulation work. At 512x512 this permits 128 iterations.

The response contains the same height/biome result shape (`heightmap-biomes-v1`) with the new algorithm version, `workload = terrain-hydraulic-v1`, `simulationVersion = hydraulic-grid-v1`, an exact parameter echo, and a simulation summary. Core computation includes terrain composition, allocation, all requested simulation steps, diagnostics, float32 conversion, and final biome classification. Parameter validation and transport remain outside.

## Base terrain

Reuse the frozen v1 value-noise hash, quintic interpolation, octave order, and normalization, with double intermediates. Reinterpret seed as uint. Independent fields use seed XOR constants, not a platform PRNG. Let F be normalized fBm at the specified octave count. Coordinates are x*noiseScale, y*noiseScale. Warp fields use 3 octaves, frequency 0.35, offsets (17,31)/(47,13), and seeds XOR 0xA341316C/0xC8013EA4. Offset each coordinate by warpStrength*(2*F-1). Broad landforms use F at frequency 0.2 with seed XOR 0xAD90777D, squared to emphasize plains. Ridges use F at frequency 0.8, seed XOR 0x7E95761E, shaped as (1-abs(2*F-1)) cubed. Detail uses F at frequency 2, seed XOR 0x9E3779B9. Compose clamp((1-mountainStrength)*broad + mountainStrength*ridge + 0.1*(detail-0.5), 0, 1), scale by the float32 height bound, and retain doubles during simulation. Final heights are float32; final biomes use the quarter-bound rules specified below.

## Hydraulic model and operation order

This is a deliberately simplified, conservative heightfield model, inspired by grid/pipe approaches such as [Stava et al., 2008](https://dcgi.fel.cvut.cz/publications/2008/stava-sca-erosion/), not a reproduction of that paper or a calibrated geological simulator. No GPU, multithreading, erosion randomness, or adaptive timestep is used.

Constants: dt=0.2, conductivity=0.25, capacity coefficient=4, erosion rate=0.25, deposition rate=0.25, minimum capacity slope=0.01, epsilon=1e-12. Direction order is west, east, north, south. All passes and summations are row-major and single-threaded. Closed boundaries have zero flux and no wraparound. Water, sediment, and outgoing flux start at zero.

Each iteration performs complete separate passes:

1. Add rainfall*dt water to every cell. No rainfall randomness.
2. From the same pre-transfer terrain/water state, compute candidate outgoing water amounts q=dt*conductivity*max((h+w)-(neighborH+neighborW),0). Missing neighbors contribute zero. Multiply all outgoing amounts by min(1,w/sum(q)) if the sum is positive. Record maximum downhill terrain drop for sediment capacity.
3. Capacity=4*sum(outgoingAmounts)*max(maximumDownhillDrop,0.01). If suspended sediment exceeds capacity, deposit min((sediment-capacity)*0.25, float32HeightBound-h). Otherwise erode min((capacity-sediment)*0.25,h). Exchange the exact same double amount between terrain and sediment. The ceiling prevents height overflow; excess sediment stays suspended.
4. Transport water and the updated sediment into cleared destination buffers. Retain water minus outgoing water and sediment minus outgoing sediment locally; add outgoing amounts to neighbors. Each outgoing sediment amount is sediment*(q/w) when w>epsilon, otherwise zero. Limit numerical subtraction residues to zero. Every transfer uses the source snapshot, not partly updated neighbors.
5. Evaporate the fraction evaporation*dt of destination water. Sediment does not evaporate. Swap buffers. Reject non-finite or materially negative state; do not return a fabricated successful result. Tiny negative roundoff tolerance is 1e-10.

Terrain+sediment is conserved to double roundoff. WaterAdded=rainfall*dt*cells*iterations; waterRemaining+waterEvaporated approximately equals WaterAdded. Final suspended sediment/water are retained in summary totals rather than silently deposited or discarded. Summary terrain masses describe internal double state before float32 result rounding. Zero iterations produces composed terrain with zero water/sediment. Zero height still executes all requested steps and returns zero heights. No convergence shortcut changes cell-iteration counts.

## Execution and resource policy

Core is independent of JSON, HTTP, timers, DOM, and workers. Two water buffers, two sediment buffers, terrain, and four outgoing flux fields require approximately 18 MiB of double-array storage at 512x512, plus output, transient metadata, JSON, and runtime/renderer overhead. Iterations increase CPU work without enlarging the response or adding simulation-history arrays.

The Local host runs in one dedicated module worker shared by all Local calls. RPC protocol is worker-rpc-v1. Initialization includes worker startup and WASM startup; C# computeMs excludes both and worker messaging. Requests have correlation IDs; worker failure rejects pending operations. No fake progress or cancellation is offered. Rendering pauses during operations. Worker and runtime assets belong to the existing versioned PWA cache. See Microsoft's [custom frontend worker guidance](https://learn.microsoft.com/en-us/aspnet/core/client-side/dotnet-on-webworkers?view=aspnetcore-10.0).

## Noise primitive and biome identity

The nested `heightMap.algorithmVersion = value-noise-fbm-v1` identifies the noise settings/primitive used by the composer, not a public baseline endpoint. Dimension limits are 2..512 with at most 262144 cells; noiseScale is 0.0001..1, octaves 1..8, and heightMultiplier 0..1000. Seed is signed Int32. All doubles must be finite.

For each lattice coordinate, hash with unchecked uint arithmetic in this exact order:

```csharp
var hash = unchecked((uint)x * 0x8DA6B343u);
hash = unchecked(hash + (uint)y * 0xD8163841u);
hash = unchecked(hash + seed * 0xCB1AB31Fu);
hash ^= hash >> 16;
hash = unchecked(hash * 0x7FEB352Du);
hash ^= hash >> 15;
hash = unchecked(hash * 0x846CA68Bu);
hash ^= hash >> 16;
return hash * (1.0 / 4_294_967_296.0);
```

Floor sample coordinates to locate four lattice corners. Smooth the fractional parts using `t*t*t*(t*(t*6-15)+10)`. Interpolate x first, then y, with `a+(b-a)*t`. fBm starts frequency/amplitude at 1, doubles frequency and halves amplitude in ascending octave order, then clamps sum/amplitudeSum to 0..1. Use double intermediates throughout composition/simulation; cast final heights to float32.

Biome IDs are numeric arrays in row-major order, never base64: Water=0 below 0.25 of the float32 bound, Plains=1 below 0.5, Forest=2 below 0.75, Mountains=3 otherwise. Compare stored float heights to double products of the float32 bound; equality belongs to the higher band. Zero bound yields Water. The display uses these colors without filling valleys with separate water surfaces.

## Verification

Core tests retain independent literal Python fixtures for zero and two erosion steps, deterministic/independent arrays, extreme seeds, bounded dimensions, validation and conservation. Both hosts serialize identical full results, settings and summaries. Client tests cover strict decoding, full-array comparisons, service adapters, operation locking, 3D resource disposal and offline version integrity.

Reproduce native, client and browser checks with [DEVELOPMENT.md](DEVELOPMENT.md). The hydraulic browser matrix includes 512x512x128, active main-thread heartbeats, 3D and offline new-seed generation. These checks verify correctness and practical operation, not a controlled performance advantage or a universal device memory guarantee.
