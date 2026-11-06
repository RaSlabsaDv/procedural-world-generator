# Development

## Current implementation

The interoperability PoC is implemented for both execution paths:

- `src/core/WorldGenerator.Core.csproj`: a pure C# class library targeting `net10.0`, with no external package dependencies.
- `src/hosts`: shared host transport, strict JSON options, build identity, error envelope, and `GenerationResponse`, linked into both the WASM and API projects.
- `src/wasm/WorldGenerator.Wasm.csproj`: a standalone browser WebAssembly host that references Core and exposes `[JSExport]` methods.
- `src/api/WorldGenerator.Api.csproj`: an ASP.NET Core minimal API that references the same Core project.
- `src/client`: an Angular heightmap explorer with parameter controls, Local/Remote generation, sequential equivalence checks, real timings, Canvas 2D and Three.js biome previews, and collapsed probe diagnostics.
- `tests/core/WorldGenerator.Core.Tests.csproj`: xUnit tests for the probe, heightmap contracts, preparation and validated-request immutability, validation boundaries, and deterministic generator output.
- `tests/api/WorldGenerator.Api.Tests.csproj`: HTTP and native WASM-export contract tests for the API endpoints, heightmap success/error JSON, build identity, and the shared host serialization contract.
- `ProceduralWorldGenerator.slnx`: the solution containing the .NET projects.

Phases 2, 3A, and 3B are complete, including the Angular heightmap UI, verified PWA/offline support, and Three.js with Core biome classification. Architecture Race is next. `README.md` remains empty.

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

The WASM/API hosts and test projects have checked-in `packages.lock.json` files recording resolved dependencies. When intentionally changing package references, regenerate the lockfiles with `dotnet restore ProceduralWorldGenerator.slnx --force-evaluate` and review the changes.

## WASM host and Angular PoC

The WASM host contains three exports:

| Export | Contract |
| --- | --- |
| `Add(int left, int right)` | Calls `ComputationProbe.Add` and returns the exact Int32 result; overflow faults cross the interop boundary. |
| `GenerateSamplesJson(int seed, int count)` | Calls `ComputationProbe.GenerateSamples`, measures only the Core call, and returns `{ "values": number[], "computeMs": number }` as one JSON string. |
| `GenerateHeightMapJson(string requestJson)` | Parses and prepares the v1 request, measures `GenerateValidated`, and returns a `GenerationResponse` or shared error envelope as one JSON string. |

`src/wasm/wwwroot/world-generator-host.js` imports `_framework/dotnet.js`, initializes the runtime once, memoizes the exports, and exposes the init duration and initialization count. The Angular service keeps one host module and runtime per page.

`scripts/publish-wasm.sh` performs an explicit locked restore with Release configuration, then Release publish with `--no-restore` into a clean temporary directory. It validates the loader and required runtime files, stages the client bundle, and promotes both directories with rollback. Failed restore, publish, validation, or promotion preserves the previous outputs; repeated publishing does not accumulate stale hashes. Temporary files are removed on exit. That directory is ignored by Git. The client's `prebuild` hook invokes this script. After `ng build`, `scripts/finalize-pwa.mjs` emits the versioned offline asset catalog, embeds its URL in the index, and regenerates Angular’s service-worker manifest. `publish-app.sh` likewise restores the API in locked mode before publishing without restore. Host lockfiles pin NuGet dependencies; the SDK and installed workload remain separate toolchain prerequisites.

## API and production deployment

The API exposes the probe operations and the heightmap endpoint:

| Endpoint | Request | Success response |
| --- | --- | --- |
| `POST /api/v1/probe/add` | `{ "left": 20, "right": 22 }` | `{ "sum": 42 }` |
| `POST /api/v1/probe/samples` | `{ "seed": 42, "count": 5 }` | `{ "values": [...], "computeMs": number }` |
| `POST /api/v1/heightmaps` | v1 heightmap request | `GenerationResponse` |
| `GET /api/health` | none | `{ "status": "ok" }` |

All endpoints use `WorldGenerator.Core`. Probe endpoints reject missing or unexpected fields, invalid counts, and integer overflow with `400`; heightmap endpoints use strict JSON and return `400` with the shared `{ "error", "fields" }` envelope for `invalid_json` or `validation`. Unexpected failures return `500`. `computeMs` measures only the Core call in the host; for heightmaps it measures `GenerateValidated` after preparation. The heightmap cards display this alongside browser request-to-data timing; neither metric includes preview rendering. Heightmap responses, including errors, use `Cache-Control: no-store`.

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

Open `http://localhost:8080/` and use **Generate Local**, **Generate Remote**, or **Verify equivalence**. The latter runs the same snapshot sequentially and displays both maps and full-array error statistics. For the original probe checks, expand **Probe diagnostics** and select **Run local checks** and **Run remote checks**. Both paths verify the scalar result, the five-value fixture, an empty array, the maximum 262,144-value array, and a repeated call. Both maximum-array results are hashed as little-endian float32 data and compared with the native fixture value. The local section also checks runtime reuse; the remote section checks the API's invalid-input response. If the API is unreachable, the remote section reports a clear availability error.

Verified in the current environment:

- .NET SDK 10.0.401 with `wasm-tools` workload `10.0.114/10.0.100`.
- Angular CLI 22.2.6, Node.js 24.20.0, npm 11.19.0.
- Release WASM publish and the single-origin production bundle load from `http://localhost:8090/` without a development server.
- All local and remote page checks pass. Both maximum-array digests equal `cbd49d9128202d264bddde63406dd224d2a0d4f0d841bed3697a1f17ff424dd8`.
- Native build has zero warnings; all 114 Core tests and all 78 API/host tests pass, including build-identity fallback and double-overflow regressions. All 83 Angular tests pass, covering response validation, adapters, comparison, pixel mapping, immutable snapshots, stale-result handling, errors, and the shared operation lock.
- A blocked `/api` request produces the expected remote availability error.
- Headless Firefox verification of the published WASM and API hosts matched the 3×2 golden fixture, reused the runtime for repeated calls, returned identical 37×23 results (maximum absolute error 0), produced matching `validation` envelopes for a missing field, and reported the same `coreBuildId`.

## Angular heightmap UI and verification

The page defaults to seed `42`, a `128×128` map, scale `0.03`, four octaves, and height `30`. Host validation errors appear beside the corresponding fields and in an alert. Blank/unparseable inputs are rejected before execution without substituting zero. A single operation lock covers generation and probe checks; results show their original inputs after edits, and changed inputs clear comparison state.

Both previews use the same grayscale scale defined by the captured height multiplier; zero height renders black. Equivalence uses every float32 height and the tolerance in [BENCHMARKING.md](BENCHMARKING.md). Matching numerical output and compatible build identity are reported separately. Matching dirty or unversioned IDs cannot establish build compatibility.

Run frontend checks from the repository root:

```sh
npm --prefix src/client ci
npm --prefix src/client run build
npm --prefix src/client test -- --watch=false
```

The normal `npm run build` and `./scripts/publish-app.sh` paths both completed. The earlier restore hang did not reproduce outside the sandbox: the initial sandbox attempt reported inaccessible NuGet audit data and an MSBuild task-host communication failure. The updated scripts separate restore/publish and fail on errors; they do not bypass network failures, suppress auditing, or fall back to stale assets. Publish still emits an informational message that optional WASM binary optimizations are unavailable in this environment; no AOT or optimization settings were changed.

Production UI smoke checks used headless Chromium 153 against the single-origin API bundle on localhost, without an Angular development server:

- Seed `42`, `3×2`, scale `0.37`, three octaves, height `30`: both maps matched the golden fixture; row-major grayscale values were `[25, 31, 58, 54, 59, 55]`.
- Seed `-7`, `37×23`, scale `0.07`, five octaves, height `123.5`: full-array numerical comparison and both canvas images matched.
- Zero height rendered black, repeated Local calls kept initialization count at one, invalid width showed structured validation, and a blocked API request showed availability failure.
- An intercepted response with a different build ID was flagged as incompatible despite numerical agreement. No browser page errors occurred.
- The supported maximum `512×512`, eight octaves, scale `1`, height `1000`, and seed `Int32.MinValue` matched across both modes on a 390-pixel viewport without horizontal overflow.

These are correctness and usability checks, not controlled performance findings. Main-thread WASM can still block during computation. PWA/offline verification is documented below.

## PWA readiness, updates, and offline reproduction

Production builds register Angular service worker immediately and include a local web manifest/icons. Development builds report offline support as unavailable. `@angular/service-worker` and `@angular/core` both resolve to `22.2.4` in the checked-in lockfile.

The `offline` asset group prefetches the shell, icons, exact catalog, and required WASM files. Compressed mirrors and debug files are excluded. `finalize-pwa.mjs` uses Angular’s generated asset hashes to build a catalog whose URL is part of the cached index. Readiness checks each asset’s bytes in the same complete version cache, confirms that the service worker serves the same index/catalog as the open document, and verifies a tiny Local computation. A version or controller change requires reload rather than reporting readiness for mixed assets. It does not merge old/new caches, rely on filename patterns alone, or use the network indicator as proof. Angular manages the cache; no custom service worker is added. The deployment uses root scope `/`.

Preparation is outside generation timings and shares `OperationLock` with generation and diagnostics. WASM is therefore initialized during successful offline preparation, before the first interactive Local run. Registration/control/cache waits are bounded; slow first downloads can require keeping the page online and retrying. Readiness describes the observed current cache, not permanent storage: clearing site data or browser eviction requires preparation again. Unrecoverable service-worker errors invalidate the ready state.

A `VERSION_READY` event offers **Reload to update**. This button is disabled while another operation holds the lock. The app does not call `activateUpdate()` before reload; navigation assigns the new version without mixing a live old runtime with new assets. The new document verifies readiness again. See [Angular’s update guidance](https://angular.dev/ecosystem/service-workers/communications).

Manual reproduction, using the production bundle above:

1. Clear site data or use a fresh browser profile. Open online and wait for **Offline ready**.
2. Generate Local and Remote once. In DevTools Application/Cache Storage, confirm the required assets and the absence of API response entries.
3. Disable networking for the site and API, reload normally, wait for readiness, and generate Local with a new seed.
4. Open the same URL in a new ordinary tab in the same profile, still offline. Generate with another new seed; this creates a fresh WASM runtime from cached assets.
5. Invoke Remote: it must report unavailability without a cached result or Local fallback.
6. Restore networking and verify Remote succeeds.
7. Deploy a changed bundle, click **Check for updates**, and verify notification. During an active operation, reload must stay disabled. Reload when idle, verify readiness for the new version, then repeat offline reload/generation.

Automated checks:

```sh
python3 -m unittest discover -s tests/build -v
npm --prefix src/client test -- --watch=false
```

The three build tests use isolated fixtures to exercise stale-asset cleanup, rollback after restore/publish/validation/promotion failures, catalog integrity/idempotence, and the generated Angular manifest’s cache policy. They need Python 3, Node.js, Git/Bash tools, and the installed frontend dependencies; no extra Python packages are required.

The optional E2E script requires an external `playwright-core` installation and Chromium. With the local production server already running, point it at those tools:

```sh
PWG_PLAYWRIGHT_MODULE=/absolute/path/to/playwright-core \
PWG_BROWSER_EXECUTABLE=/absolute/path/to/chromium \
PWG_BASE_URL=http://127.0.0.1:8080 \
node tests/browser/pwa.cjs
```

It uses a clean isolated browser context, disables actual network access, and temporarily modifies only generated deployment assets to simulate an update. It restores the original deployment in `finally` and writes evidence to `artifacts/pwa-verification.json`. It never edits application source.

Verified with Chromium `153.0.8010.52`: offline reload generated seed `777`; a new offline tab generated `-778`; Remote failed offline and recovered online; no API responses were cached. A changed loader/catalog produced an update notification. Reload was disabled during an intercepted active Remote operation, then the new application version loaded and generated seed `1001` after another offline reload. Runtime initialization stayed at one per document and no browser page errors occurred. These checks passed against the single-origin production bundle without a development server. Angular unit tests alone are not the evidence for these claims.

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
| `HeightMapResult` | Result contract with `Width`, `Height`, `Values`, `AlgorithmVersion`, `Biomes`, and `ResultVersion`; values are row-major finite float32 heights after the height multiplier |
| `HeightMapGenerator.Generate` | Validates, then generates `value-noise-fbm-v1`; throws `ArgumentNullException` or `ArgumentException` instead of returning an invalid map |
| `HeightMapGenerator.GenerateValidated` | Generates from an already prepared request without validation or allocation of a new request |
| `HeightMapTransport` | Shared host parsing, missing-field detection, Core preparation, and error mapping |
| `HostJson` | Shared strict JSON options and type-info enforcement used by both hosts |
| `CoreBuildId` | Build-time Git revision shared by the WASM and API hosts |
| `GenerationResponse` | Host-owned positional record with `Result`, `ComputeMs`, `CoreBuildId`, and a getter-only `Workload` fixed to `"heightmap+biomes"` |

Validation error codes are `request.required`, `field.required`, `value.out_of_range`, `value.not_finite`, `cell_count.exceeded`, and `algorithm_version.unsupported`. The validator checks the algorithm version with ordinal, case-sensitive equality and computes `width * height` with `long` arithmetic. Invalid values are reported, never rounded, clamped, or replaced with defaults; hosts must consume this validator instead of duplicating its rules.

`HeightMapGenerator.Generate` validates the request before allocation and then runs single-threaded 2D value-noise fBm. The exact hash constants, quintic smoothing, x-then-y interpolation, octave order, amplitude normalization, clamp, and final float conversion are specified in the [architecture](ARCHITECTURE.md). `GenerateValidated` runs the same single-threaded generator from the immutable prepared snapshot. A host stopwatch must start after preparation and immediately before `GenerateValidated`; otherwise validation is included in `computeMs`.

The golden fixture uses seed `42`, a `3×2` map, `noiseScale = 0.37`, `octaves = 3`, and `heightMultiplier = 30.0`. Its row-major values are:

```json
[2.9216370582580566, 3.6088085174560547, 6.840007781982422, 6.314371109008789, 6.954989910125732, 6.4931135177612305]
```

The extended fixture has `resultVersion = "heightmap-biomes-v1"`, `biomes = [0, 0, 0, 0, 0, 0]`, and `workload = "heightmap+biomes"`. Its original heights were established with an independent implementation and is stored as literal values in the Core tests. Generator tests also cover repeated and interleaved calls, negative and extreme seeds, rectangular and boundary dimensions, zero height, independent storage, finite ranges, invalid requests, and row-major positions.

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

Phases 0–3B are complete. The next planned step is Phase 4: Architecture Race, sequential alternating trials, warm-up, statistics, and raw JSON/CSV export. Preserve offline behavior, diagnostics, and separate compute/render timing.

Keep mathematical algorithms in Core, keep transport and timers in the thin hosts, and preserve identical parameters and validation for both execution paths. Do not add the Architecture Race or a performance comparison view yet. See the [architecture](ARCHITECTURE.md), [roadmap](IMPLEMENTATION_PLAN.md), and [measurement protocol](BENCHMARKING.md).

## Three.js and biome verification (Phase 3B)

Use the existing start/publish commands. Generate Local, Remote, or Verify equivalence, then select **3D biomes**. Drag to orbit, scroll/pinch to zoom, and right-drag to pan. **2D heights** restores the grayscale preview. Biome IDs come exclusively from Core; the fixed bands, zero-height behavior, numeric JSON representation, and result version are specified in [ARCHITECTURE.md](ARCHITECTURE.md). Existing request parameters and the height algorithm are unchanged. This is an extended result contract: an older frontend/host pair must be rebuilt and deployed together.

`computeMs` now includes biome allocation and classification in both hosts. CPU scene setup/first draw submission is displayed separately; it is not GPU timing. The Three.js chunk is deferred by the UI but included in the complete PWA prefetch cache. WebGL failures affect presentation only and leave the 2D view available.

Verification commands (from the repository root, after installing frontend dependencies):

```bash
dotnet restore ProceduralWorldGenerator.slnx --locked-mode
dotnet build ProceduralWorldGenerator.slnx --configuration Release --no-restore
dotnet test ProceduralWorldGenerator.slnx --configuration Release --no-build --no-restore
npm --prefix src/client test -- --watch=false
python3 -m unittest discover -s tests/build -v
./scripts/publish-app.sh
dotnet artifacts/app/WorldGenerator.Api.dll --urls http://127.0.0.1:8080
```

With the production server running, the optional browser test uses the same externally supplied Playwright Core/Chromium setup as the PWA test:

```bash
PWG_PLAYWRIGHT_MODULE=/path/to/node_modules/playwright-core \
PWG_BROWSER_EXECUTABLE=/path/to/chromium \
PWG_BASE_URL=http://127.0.0.1:8080 \
node tests/browser/terrain.cjs
```

The Chromium 153 production check verified full WASM/API arrays for a 3×2 golden request, a 17×9 map with Int32 minimum seed and fractional height, a zero-height 2×2 map with Int32 maximum seed, and 512×512 at height 1000. Maximum observed height error was zero; all biome IDs matched exactly. UI checks cover side-by-side 3D, orbit/zoom, repeated replacement/view switching, maximum mesh size, zero height, and a new Local seed with 3D after offline reload. Evidence goes to ignored `artifacts/terrain-verification.json` and `artifacts/terrain-preview.png`; software WebGL in this smoke test is not representative performance evidence. Unit tests verify resource disposal and unsupported WebGL independently. The existing production PWA update/reload scenario also passed after this change: offline reload/new tab, Remote failure/recovery without cached results, deferred reload while busy, and offline generation after updating.
