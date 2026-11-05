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

| Milestone | Deliverable |
| --- | --- |
| Technical PoC | Angular invokes the shared core through WASM and HTTP; scalar results, bulk arrays, and production publishing work |
| Functional MVP | Parameters produce a deterministic 2D map in Local/Remote mode, with real timings, equivalence checks, and loading/error states |
| Required coursework | PWA/offline support, 3D terrain, simple biomes, Architecture Race, repeated measurements, export, and research findings |
| Only on a separate request | Adaptive Mode, WASM AOT, Web Workers, more complex algorithms, history, and presets |

User parameters are seed, map width/height, noise scale, octave count, and height multiplier. The initial generator uses layered 2D value noise (fBm); exact rules and limits are defined in the [architecture](ARCHITECTURE.md).

The 3D view uses Three.js. Biomes are a simple height-based classification in the core: water, plains, forest, and mountains. Colors belong to visualization. This is a demonstration model without climate or erosion simulation.

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
- The application provides 2D/3D views, correct error handling, and real measurements.
- After caching, the production build reloads offline and generates a map with a new seed.
- Architecture Race uses an immutable parameter snapshot; repeated trials are exported with their conditions and errors.
- Several map sizes and at least two reproducible network conditions are tested; raw results are retained.
- The report includes methodology, charts/tables, limitations, and conclusions supported by measurements.

Authentication, databases, multiplayer, microservices, and automatic mode selection are outside the required scope. The implementation sequence is defined in the [roadmap](IMPLEMENTATION_PLAN.md).
