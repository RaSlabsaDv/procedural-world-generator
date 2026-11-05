# Development

## Current implementation

The local WebAssembly path of the interoperability PoC is implemented:

- `src/core/WorldGenerator.Core.csproj`: a pure C# class library targeting `net10.0`, with no external package dependencies.
- `src/wasm/WorldGenerator.Wasm.csproj`: a standalone browser WebAssembly host that references Core and exposes `[JSExport]` methods.
- `src/client`: a minimal standalone Angular application that loads the published host and runs scalar and bulk-array checks.
- `tests/core/WorldGenerator.Core.Tests.csproj`: xUnit tests for the scalar and bulk-array contracts.
- `ProceduralWorldGenerator.slnx`: the solution containing the .NET projects.

The ASP.NET Core API is not implemented yet. `README.md` remains empty. Terrain generation, Three.js, and PWA support belong to later phases.

## Prerequisites and commands

Use .NET SDK 10.0.401 or a later patch in its 10.0.4xx feature band, as specified by `global.json`. Building the WASM host requires the `wasm-tools` workload. Angular requires Node.js and npm; the checked-in `package-lock.json` records the client dependencies.

One-time toolchain setup:

```sh
dotnet workload install wasm-tools
```

If the standalone project needs to be recreated from the template, install the matching template version separately:

```sh
dotnet new install Microsoft.NET.Runtime.WebAssembly.Templates.net10@10.0.14
```

Run the native build and tests from the repository root:

```sh
dotnet restore ProceduralWorldGenerator.slnx --locked-mode
dotnet build ProceduralWorldGenerator.slnx --configuration Release --no-restore
dotnet test ProceduralWorldGenerator.slnx --configuration Release --no-build --no-restore
```

The test project's `packages.lock.json` records its resolved dependencies. When intentionally changing package references, regenerate the lockfile with `dotnet restore ProceduralWorldGenerator.slnx --force-evaluate` and review the changes.

## WASM host and Angular PoC

The WASM host contains two exports:

| Export | Contract |
| --- | --- |
| `Add(int left, int right)` | Calls `ComputationProbe.Add` and returns the exact Int32 result; overflow faults cross the interop boundary. |
| `GenerateSamplesJson(int seed, int count)` | Calls `ComputationProbe.GenerateSamples`, measures only the Core call, and returns `{ "values": number[], "computeMs": number }` as one JSON string. |

`src/wasm/wwwroot/world-generator-host.js` imports `_framework/dotnet.js`, initializes the runtime once, memoizes the exports, and exposes the init duration and initialization count. The Angular service keeps one host module and runtime per page.

`scripts/publish-wasm.sh` runs a Release publish, then copies `_framework` and the host loader into `src/client/public/wasm/`. That directory is generated and ignored by Git. The client's `prebuild` script invokes the publish script, so the complete production build is:

```sh
cd src/client
npm ci
npm run build
```

`npm run build:wasm` performs only the WASM publish and copy step. To serve the production output without the Angular development server:

```sh
python3 -m http.server 8080 --directory src/client/dist/client/browser
```

Open `http://localhost:8080/` and select **Run checks**. The page verifies the scalar result, the five-value fixture, an empty array, the maximum 262,144-value array, a repeated call, and runtime reuse. The maximum array is also hashed as little-endian float32 data and compared with the native fixture value.

Verified in the current environment:

- .NET SDK 10.0.401 with `wasm-tools` workload `10.0.114/10.0.100`.
- Angular CLI 22.2.6, Node.js 24.20.0, npm 11.19.0.
- Release WASM publish and static production build load from `/wasm/` on `http://localhost:8080/` with no development server.
- All six page checks pass; the runtime initializes once across two full check sequences (10 Core calls).
- Native build has zero warnings and all 22 xUnit tests pass; the Angular unit tests pass.

## Computation probe

```csharp
using WorldGenerator.Core;

int sum = ComputationProbe.Add(20, 22); // 42
float[] samples = ComputationProbe.GenerateSamples(seed: 42, count: 5);
```

| Method | Contract |
| --- | --- |
| `Add(int left, int right)` | Exact Int32 addition; throws `OverflowException` if the result cannot fit in Int32 |
| `GenerateSamples(int seed, int count)` | Returns `count` float32 values in `[0, 1)`; accepts every Int32 seed |
| Sample count | Inclusive range `0..262144`; invalid counts throw `ArgumentOutOfRangeException` for `count` before allocation |
| Repeated calls | Identical inputs yield identical values; each nonempty result has independent storage |

The sample sequence is deliberately fixed so future WASM and API results can be checked against known values:

1. Reinterpret the signed seed as an unsigned 32-bit integer.
2. Advance the state using `(1664525 * state + 1013904223) mod 2^32` for each sample.
3. Take the upper 24 bits and multiply by `2^-24`.

These values are exactly representable as float32. For seed `42`, the first five values are:

```json
[0.25234514474868774, 0.08812499046325684, 0.5772811770439148, 0.22255420684814453, 0.3756601810455322]
```

This probe supplies test data for calls and bulk transfer. It is not the terrain generator or a representative performance benchmark. Its array limit matches the planned maximum number of heightmap cells, but does not establish a browser memory or latency budget.

## Next integration step

Add the ASP.NET Core API project referencing the same `WorldGenerator.Core`, with one batched JSON endpoint that mirrors the WASM host contract. Then verify that both hosts return the same scalar and every array element for zero, small, and maximum counts, and document the exact commands.

Keep `[JSExport]`, JSON serialization, runtime initialization, and timing in the thin hosts; Core remains free of browser, HTTP, and JSON dependencies. See the [architecture](ARCHITECTURE.md), [roadmap](IMPLEMENTATION_PLAN.md), and Microsoft's [standalone .NET browser interop guidance](https://learn.microsoft.com/en-us/aspnet/core/client-side/dotnet-interop/wasm-browser-app?view=aspnetcore-10.0).
