# Development

## Current implementation

The interoperability PoC is implemented for both execution paths:

- `src/core/WorldGenerator.Core.csproj`: a pure C# class library targeting `net10.0`, with no external package dependencies.
- `src/hosts`: shared host transport, strict JSON options, build identity, error envelope, and `GenerationResponse`, linked into both the WASM and API projects.
- `src/wasm/WorldGenerator.Wasm.csproj`: a standalone browser WebAssembly host that references Core and exposes `[JSExport]` methods.
- `src/api/WorldGenerator.Api.csproj`: an ASP.NET Core minimal API that references the same Core project.
- `src/client`: a minimal standalone Angular application that runs scalar and bulk-array checks through WASM and the API.
- `tests/core/WorldGenerator.Core.Tests.csproj`: xUnit tests for the probe, heightmap contracts, preparation and validated-request immutability, validation boundaries, and deterministic generator output.
- `tests/api/WorldGenerator.Api.Tests.csproj`: HTTP and native WASM-export contract tests for the API endpoints, heightmap success/error JSON, build identity, and the shared host serialization contract.
- `ProceduralWorldGenerator.slnx`: the solution containing the .NET projects.

The app does not contain an Architecture Race or a performance comparison view. `README.md` remains empty. Phase 2 now includes the heightmap contracts, canonical validation, shared host transport envelope, deterministic Core generator, and matching WASM/API heightmap endpoints; the Angular heightmap UI, 2D MVP, Three.js, and PWA support belong to later steps.

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

The WASM host contains three exports:

| Export | Contract |
| --- | --- |
| `Add(int left, int right)` | Calls `ComputationProbe.Add` and returns the exact Int32 result; overflow faults cross the interop boundary. |
| `GenerateSamplesJson(int seed, int count)` | Calls `ComputationProbe.GenerateSamples`, measures only the Core call, and returns `{ "values": number[], "computeMs": number }` as one JSON string. |
| `GenerateHeightMapJson(string requestJson)` | Parses and prepares the v1 request, measures `GenerateValidated`, and returns a `GenerationResponse` or shared error envelope as one JSON string. |

`src/wasm/wwwroot/world-generator-host.js` imports `_framework/dotnet.js`, initializes the runtime once, memoizes the exports, and exposes the init duration and initialization count. The Angular service keeps one host module and runtime per page.

`scripts/publish-wasm.sh` runs a Release publish, then copies `_framework` and the host loader into `src/client/public/wasm/`. That directory is generated and ignored by Git. The client's `prebuild` script invokes the publish script.

## API and production deployment

The API exposes the probe operations and the heightmap endpoint:

| Endpoint | Request | Success response |
| --- | --- | --- |
| `POST /api/v1/probe/add` | `{ "left": 20, "right": 22 }` | `{ "sum": 42 }` |
| `POST /api/v1/probe/samples` | `{ "seed": 42, "count": 5 }` | `{ "values": [...], "computeMs": number }` |
| `POST /api/v1/heightmaps` | v1 heightmap request | `GenerationResponse` |
| `GET /api/health` | none | `{ "status": "ok" }` |

All endpoints use `WorldGenerator.Core`. Probe endpoints reject missing or unexpected fields, invalid counts, and integer overflow with `400`; heightmap endpoints use strict JSON and return `400` with the shared `{ "error", "fields" }` envelope for `invalid_json` or `validation`. Unexpected failures return `500`. `computeMs` measures only the Core call in the host; for heightmaps it measures `GenerateValidated` after preparation. It is not displayed as an in-app comparison. Heightmap responses, including errors, use `Cache-Control: no-store`.

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
- Native build has zero warnings; all 98 Core tests and all 78 API/host tests pass, including build-identity fallback and double-overflow regressions. Both Angular unit tests passed during the earlier UI verification.
- A blocked `/api` request produces the expected remote availability error.
- Headless Firefox verification of the published WASM and API hosts matched the 3×2 golden fixture, reused the runtime for repeated calls, returned identical 37×23 results (maximum absolute error 0), produced matching `validation` envelopes for a missing field, and reported the same `coreBuildId`.

## Heightmap contracts, hosts, validation, and generator

`WorldGenerator.Core` defines the canonical v1 request, limits, validation errors, result contract, and deterministic generator. The WASM and API hosts share the transport and envelope implementations.

```csharp
using WorldGenerator.Core;

var request = new HeightMapRequest(
    Seed: 42,
    Width: 256,
    Height: 256,
    NoiseScale: 0.03,
    Octaves: 4,
    HeightMultiplier: 30.0,
    AlgorithmVersion: HeightMapLimits.SupportedAlgorithmVersion);

HeightMapPreparation preparation = HeightMapValidator.Prepare(request);
if (!preparation.IsValid)
{
    IReadOnlyList<ValidationError> errors = preparation.Errors;
}

HeightMapResult result = HeightMapGenerator.GenerateValidated(preparation.ValidatedRequest!);
```

`HeightMapGenerator.Generate(request)` remains available for direct callers and performs the same preparation before generation. Hosts use `Prepare` and `GenerateValidated` so validation occurs once and is outside `computeMs`.

| Type | Contract |
| --- | --- |
| `HeightMapRequest` | Immutable positional record; every constructor parameter is required and all Int32 seeds are valid |
| `HeightMapLimits` | Named v1 constants for dimensions, cell count, noise scale, octaves, height multiplier, and supported algorithm version |
| `HeightMapValidator.Validate` | Returns all applicable `ValidationError` values in deterministic field order; a null request returns `request.required` |
| `HeightMapValidator.Prepare` | Returns a `HeightMapPreparation` with either a `ValidatedHeightMapRequest` snapshot or the canonical errors |
| `ValidatedHeightMapRequest` | Opaque immutable snapshot with an internal constructor and no public mutation path; created only by `Prepare` |
| `ValidationError` | Immutable record with `Code`, `Field`, and English `Message` |
| `HeightMapResult` | Result contract with `Width`, `Height`, `Values`, and `AlgorithmVersion`; values are row-major finite float32 heights after the height multiplier |
| `HeightMapGenerator.Generate` | Validates, then generates `value-noise-fbm-v1`; throws `ArgumentNullException` or `ArgumentException` instead of returning an invalid map |
| `HeightMapGenerator.GenerateValidated` | Generates from an already prepared request without validation or allocation of a new request |
| `HeightMapTransport` | Shared host parsing, missing-field detection, Core preparation, and error mapping |
| `HostJson` | Shared strict JSON options and type-info enforcement used by both hosts |
| `CoreBuildId` | Build-time Git revision shared by the WASM and API hosts |
| `GenerationResponse` | Host-owned positional record with `Result`, `ComputeMs`, `CoreBuildId`, and a getter-only `Workload` fixed to `"heightmap"` |

Validation error codes are `request.required`, `field.required`, `value.out_of_range`, `value.not_finite`, `cell_count.exceeded`, and `algorithm_version.unsupported`. The validator checks the algorithm version with ordinal, case-sensitive equality and computes `width * height` with `long` arithmetic. Invalid values are reported, never rounded, clamped, or replaced with defaults; hosts must consume this validator instead of duplicating its rules.

`HeightMapGenerator.Generate` validates the request before allocation and then runs single-threaded 2D value-noise fBm. The exact hash constants, quintic smoothing, x-then-y interpolation, octave order, amplitude normalization, clamp, and final float conversion are specified in the [architecture](ARCHITECTURE.md). `GenerateValidated` runs the same single-threaded generator from the immutable prepared snapshot. A host stopwatch must start after preparation and immediately before `GenerateValidated`; otherwise validation is included in `computeMs`.

The golden fixture uses seed `42`, a `3×2` map, `noiseScale = 0.37`, `octaves = 3`, and `heightMultiplier = 30.0`. Its row-major values are:

```json
[2.9216370582580566, 3.6088085174560547, 6.840007781982422, 6.314371109008789, 6.954989910125732, 6.4931135177612305]
```

The fixture was established with an independent implementation and is stored as literal values in the Core tests. Generator tests also cover repeated and interleaved calls, negative and extreme seeds, rectangular and boundary dimensions, zero height, independent storage, finite ranges, invalid requests, and row-major positions.

`GenerationResponse` is defined in `src/hosts/GenerationResponse.cs` and linked into both hosts, so no separate transport project or package is needed. The WASM host registers it in its JSON source-generation context, and both hosts serialize the camelCase names `result`, `computeMs`, `coreBuildId`, and `workload`. `computeMs` measures `GenerateValidated` after preparation and excludes serialization, interop, transport, and rendering. `coreBuildId` is generated from the Git revision at build time and identifies the shared Core inputs, not the host build. `workload` describes the measured computation and is not a request input.

Both hosts share `HeightMapTransport` and `HostJson`. The wire request is nullable so missing fields are rejected in canonical order rather than becoming zero; zero remains valid where the range permits it. JSON is camelCase and case-sensitive, rejects unknown members, numeric strings, comments, trailing commas, and non-finite numbers, and uses `DefaultJsonTypeInfoResolver` in the API and `HostJsonContext.Default` in WASM. Failures return the shared `{ "error", "fields" }` envelope with `invalid_json` or `validation`; successful and failed API responses use `Cache-Control: no-store`.

Both double fields reject JSON numeric overflow (`1e400` and `-1e400`) as `invalid_json`. Representable finite numbers outside the allowed ranges remain `validation` errors. Core validation still handles non-finite values supplied by direct C# callers.

Build identity auto-detection checks both Git exit codes and validates the revision format. With no repository, no Git executable, or a failed revision/status command, the generated value is `unversioned`. Error output cannot become a revision or a dirty marker. Supply `-p:CoreBuildId=release-id` for an explicit identity or `-p:CoreBuildIdGitExecutable=/path/to/git` for a specific Git executable. `CoreBuildIdentityTests` exercises the actual MSBuild target in isolated temporary fixtures for clean, dirty, unavailable-Git, missing-repository, failed-status, and explicit-override cases.

## Heightmap endpoints

The API exposes `POST /api/v1/heightmaps` and the WASM host exposes `GenerateHeightMapJson(string requestJson)`. Both accept the v1 request JSON and return the `GenerationResponse` JSON, including `coreBuildId`. The API returns HTTP 400 for `invalid_json` and `validation` failures. The browser host wraps the WASM export as `generateHeightMapJson` in `world-generator-host.js` and the Angular runtime interface.

The published hosts were checked in headless Firefox with a 3×2 golden fixture, repeated calls, a 37×23 comparison, and an invalid request. Golden values matched after float32 comparison, runtime initialization stayed at one, the larger local and remote maps were numerically identical (maximum absolute error 0), both hosts returned `{ "error": "validation", "fields": { "width": "field.required: Required." } }`, and both reported `git:f9eb4e02b215-dirty`. The fixtures and automated native checks are in `tests/core/HeightMapGeneratorTests.cs`, `tests/api/HeightMapEndpointsTests.cs`, and `tests/api/WasmHeightMapExportTests.cs`.

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

Integrate the implemented heightmap workload into the Angular local/remote checks and add a minimal 2D preview. Keep the probe tests and use the same request, validation, and response envelope in both execution modes.

Keep mathematical algorithms in Core, keep transport and timers in the thin hosts, and preserve identical parameters and validation for both execution paths. Do not add the Architecture Race or a performance comparison view yet. See the [architecture](ARCHITECTURE.md), [roadmap](IMPLEMENTATION_PLAN.md), and [measurement protocol](BENCHMARKING.md).
