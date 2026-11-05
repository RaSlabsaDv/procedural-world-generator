# Development

## Current implementation

The interoperability PoC is implemented for both execution paths:

- `src/core/WorldGenerator.Core.csproj`: a pure C# class library targeting `net10.0`, with no external package dependencies.
- `src/wasm/WorldGenerator.Wasm.csproj`: a standalone browser WebAssembly host that references Core and exposes `[JSExport]` methods.
- `src/api/WorldGenerator.Api.csproj`: an ASP.NET Core minimal API that references the same Core project.
- `src/client`: a minimal standalone Angular application that runs scalar and bulk-array checks through WASM and the API.
- `tests/core/WorldGenerator.Core.Tests.csproj`: xUnit tests for the scalar and bulk-array contracts.
- `tests/api/WorldGenerator.Api.Tests.csproj`: HTTP contract tests for the API endpoints and error responses.
- `ProceduralWorldGenerator.slnx`: the solution containing the .NET projects.

The app does not contain an Architecture Race or a performance comparison view. `README.md` remains empty. Terrain generation, Three.js, and PWA support belong to later phases.

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

The test projects' `packages.lock.json` files record their resolved dependencies. When intentionally changing package references, regenerate the lockfiles with `dotnet restore ProceduralWorldGenerator.slnx --force-evaluate` and review the changes.

## WASM host and Angular PoC

The WASM host contains two exports:

| Export | Contract |
| --- | --- |
| `Add(int left, int right)` | Calls `ComputationProbe.Add` and returns the exact Int32 result; overflow faults cross the interop boundary. |
| `GenerateSamplesJson(int seed, int count)` | Calls `ComputationProbe.GenerateSamples`, measures only the Core call, and returns `{ "values": number[], "computeMs": number }` as one JSON string. |

`src/wasm/wwwroot/world-generator-host.js` imports `_framework/dotnet.js`, initializes the runtime once, memoizes the exports, and exposes the init duration and initialization count. The Angular service keeps one host module and runtime per page.

`scripts/publish-wasm.sh` runs a Release publish, then copies `_framework` and the host loader into `src/client/public/wasm/`. That directory is generated and ignored by Git. The client's `prebuild` script invokes the publish script.

## API and production deployment

The API exposes the same probe operations as the WASM host:

| Endpoint | Request | Success response |
| --- | --- | --- |
| `POST /api/v1/probe/add` | `{ "left": 20, "right": 22 }` | `{ "sum": 42 }` |
| `POST /api/v1/probe/samples` | `{ "seed": 42, "count": 5 }` | `{ "values": [...], "computeMs": number }` |
| `GET /api/health` | none | `{ "status": "ok" }` |

Both probe endpoints use `WorldGenerator.Core`. Missing fields, unexpected fields, invalid counts, and integer overflow return `400` with an error code; unexpected failures return `500`. `computeMs` measures only the Core call in the host and is not displayed as an in-app comparison.

For development, start the API and Angular separately; the Angular proxy forwards `/api` to port 5180:

```sh
dotnet run --project src/api
```

```sh
cd src/client
npm ci
npm run build:wasm
npm start
```

For a single-origin production bundle, `scripts/publish-app.sh` builds Angular (including the WASM assets), publishes the API, and copies the Angular output into the API's `wwwroot`:

```sh
./scripts/publish-app.sh
dotnet artifacts/app/WorldGenerator.Api.dll --urls http://localhost:8080
```

Open `http://localhost:8080/` and select **Run local checks** and **Run remote checks**. Both paths verify the scalar result, the five-value fixture, an empty array, the maximum 262,144-value array, and a repeated call. Both maximum-array results are hashed as little-endian float32 data and compared with the native fixture value. The local section also checks runtime reuse; the remote section checks the API's invalid-input response. If the API is unreachable, the remote section reports a clear availability error.

Verified in the current environment:

- .NET SDK 10.0.401 with `wasm-tools` workload `10.0.114/10.0.100`.
- Angular CLI 22.2.6, Node.js 24.20.0, npm 11.19.0.
- Release WASM publish and the single-origin production bundle load from `http://localhost:8090/` without a development server.
- All local and remote page checks pass. Both maximum-array digests equal `cbd49d9128202d264bddde63406dd224d2a0d4f0d841bed3697a1f17ff424dd8`.
- Native build has zero warnings; all 22 Core tests and all 7 API tests pass; both Angular unit tests pass.
- A blocked `/api` request produces the expected remote availability error.

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

Implement the Phase 2 heightmap contract and generator in `WorldGenerator.Core`: validation, 2D value-noise/fBm, deterministic reference outputs, and a shared batched result for both hosts. Then replace the probe with the real heightmap workload in the Angular local/remote checks and add the minimal 2D preview.

Keep mathematical algorithms in Core, keep transport and timers in the thin hosts, and preserve identical parameters and validation for both execution paths. Do not add the Architecture Race or a performance comparison view yet. See the [architecture](ARCHITECTURE.md), [roadmap](IMPLEMENTATION_PLAN.md), and [measurement protocol](BENCHMARKING.md).
