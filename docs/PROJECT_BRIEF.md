# Project Brief — Procedural World Generator

## Research objective

**Academic topic:** Comparison of PWA and Traditional Client–Server Architectures for Mathematical Computations.

This project compares two specific ways to execute the same algorithm:

- **Local:** An Angular PWA invokes the C# core through .NET WebAssembly in the browser.
- **Remote:** The same Angular application calls an ASP.NET Core API that executes the same C# core on the server.

PWA and client–server architectures can coexist. The experiment studies **where computation runs** and how that affects latency, startup costs, and offline availability. Results from one test environment must not be generalized to all PWAs or server applications.

Procedural terrain generation provides a reproducible mathematical workload. Visualization helps demonstrate the result but is excluded from generation time.

## Architectural constraints

- The UI uses Angular and TypeScript; the browser .NET host does not replace Angular with Blazor.
- Generation algorithms, biome classification, and canonical parameter validation belong in `WorldGenerator.Core`.
- The WASM host and API reference the same C# project; the generator is not duplicated in TypeScript.
- Comparisons use identical parameters, algorithm versions, and computation workloads.
- The same seed reproduces the result; numerical tolerance is fixed before experiments.
- Computation time is measured separately from initialization, transfer, data conversion, and visualization.

## Scope

| Milestone                  | Deliverable                                                                                                                    |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Technical PoC              | Angular invokes the shared core through WASM and HTTP; scalar results, bulk arrays, and production publishing work             |
| Functional MVP             | Parameters produce deterministic terrain in Local/Remote mode, with real timings, equivalence checks, and loading/error states |
| Required coursework        | PWA/offline support, 3D terrain, simple biomes, Architecture Race, repeated measurements, export, and research findings        |
| Only on a separate request | Adaptive Mode, WASM AOT, presets, and further algorithm extensions                                                             |

The sole generator is **Rich terrain + hydraulic erosion**: regionally blended plains/hills/ridges and a fixed-step hydraulic model. Environment-based biomes and bounded Core-placed vegetation create visible forests. Angular displays the resulting heightfield in Three.js. Parameters include seed, dimensions, noise scale, octaves, height multiplier, mountain strength, warp strength, iterations, rainfall, evaporation, plains/mountain coverage, global moisture, relative sea level, normalized warmth, vegetation density and landform region scale. The exact contract and equations are in [LANDSCAPE_V3.md](specs/LANDSCAPE_V3.md).

A dedicated module worker owns Local execution. Biomes, ecological fields and vegetation placement are computed in Core. V3 adds broadleaf/conifer forests, sparse savanna, tundra and static highland snow, with three explicit climate/vegetation/region controls. Stages 1–2 add fixed-scale surface materials and Core-owned coverage blending, preserving prior terrain and ecology. The extended result contract is specified in [SURFACE_TRANSITIONS_V1.md](specs/SURFACE_TRANSITIONS_V1.md). Stage 3 adds reproducible daylight, static directional shadows and distance fog as presentation only. Stage 4 adds Core-owned groves, clearings, soft forest edges and deterministic Small/Mature tree variants, specified in [VEGETATION_STRUCTURE_V1.md](specs/VEGETATION_STRUCTURE_V1.md). Stage 5 adds decorative Core-placed boulders, outcrops and scree, specified in [ROCK_PLACEMENT_V1.md](specs/ROCK_PLACEMENT_V1.md). Stage 6 adds bounded local geometric relief before erosion, specified in [LOCAL_RELIEF_V1.md](specs/LOCAL_RELIEF_V1.md), while preserving broad plains. Stage 7 adds coastal surface blending and active sand without changing terrain, water or ecological policies, specified in [COASTAL_SURFACES_V1.md](specs/COASTAL_SURFACES_V1.md). The subsequent [regional climate policy](specs/REGIONAL_CLIMATE_V1.md) refines coherent climate zones and highland snow without changing terrain or hydraulic results. [Coastal surfaces v2](specs/COASTAL_SURFACES_V2.md) subsequently widens suitable gentle beaches while preserving ecology, instances and snow. [Rock placement v2](specs/ROCK_PLACEMENT_V2.md) adds sparse multi-cell boulders and varied silhouettes while preserving all non-rock results. The seven detailing stages are complete, as recorded in the [roadmap](IMPLEMENTATION_PLAN.md). Bounded evolution capture and playback remain a later extension for this same generator. Regional geography, probe/baseline public interfaces and 2D previews have been removed to keep one maintained workflow. The model remains illustrative rather than a calibrated geological simulator.

The [hydrology foundation](specs/HYDROLOGY_V1.md) adds deterministic Core-owned drainage receivers, contributing land area and potential depression fill on the finalized terrain. It preserves the existing landscape and ocean visualization. The [river network](specs/RIVER_NETWORK_V1.md) now selects channels and illustrative widths from that graph without changing the landscape. The [lake basin policy](specs/LAKE_BASINS_V1.md) now selects bounded static inland water bodies and preserves all drainage exits and river crossings. The [inland water presentation](specs/INLAND_WATER_V1.md) now displays selected lakes and supported exposed river routes, with shoreline clipping and submerged-decoration filtering. The [channel policy](specs/RIVER_CHANNELS_V1.md) adds one bounded post-erosion shaping pass and final-graph water profiles before rendering. Ecology and instances describe the carved terrain. Hydraulic and channel-removal mass are accounted separately. Unsupported barriers remain explicit; there is no dynamic flow/discharge model.

## Architecture Race

One action captures a parameter snapshot, runs both modes, and displays:

- Side-by-side maps generated from identical inputs.
- Core execution time and time until data is ready for each mode.
- Separate startup, overhead, and display metrics where measured.
- Checks of dimensions, all values, and numerical error.
- Repeated-trial results and experimental conditions.

Baseline execution is sequential. Concurrent race animation is unnecessary because both modes can compete for browser resources. The controlled-trial methodology is defined in [BENCHMARKING.md](BENCHMARKING.md).

## Research questions

1. How does execution time for the same C# computation differ between WASM and server .NET on the selected hardware?
2. What share of latency comes from core execution, and what share comes from combined overhead?
3. How does time until data is ready vary with map size and network conditions?
4. What download size and first-run latency does Local require?
5. Under which verified conditions does Local work offline while Remote becomes unavailable?

Pure network latency cannot be obtained by simply subtracting core execution time from HTTP request duration. No winner is assumed in advance.

## Coursework completion criteria

- Both modes invoke one core implementation; automated determinism and cross-mode equivalence checks pass.
- Documented commands reproduce the build and startup from a clean checkout.
- The application provides a 3D view, correct error handling, and real measurements.
- After caching, the production build reloads offline and generates a map with a new seed.
- Architecture Race uses an immutable parameter snapshot; repeated trials are exported with their conditions and errors.
- Several map sizes and at least two reproducible network conditions are tested; raw results are retained.
- The report includes methodology, charts/tables, limitations, and conclusions supported by measurements.

Authentication, databases, multiplayer, microservices, and automatic mode selection are outside the required scope. The implementation sequence is defined in the [roadmap](IMPLEMENTATION_PLAN.md).

[Inland bank materials v1](specs/INLAND_BANK_MATERIALS_V1.md) adds narrow visual damp
soil/sand/rock transitions beside actually rendered lakes and rivers. Snow is
preserved. This does not change canonical moisture, generation or water profiles.

[Shore stones v1](specs/INLAND_SHORE_STONES_V1.md) adds sparse decorative gravel and
occasional larger stones beside visible inland water, preserving canonical terrain,
Core rock instances and water profiles. Reeds use a separate presentation policy below.

[Inland reeds v1](specs/INLAND_REEDS_V1.md) adds sparse upright decorative tufts on
suitable damp banks and shallow edges, using actual visible water and a nearby dry
shore witness. This illustrative layer does not change ecological species, terrain,
water profiles or the measured generation workload.
