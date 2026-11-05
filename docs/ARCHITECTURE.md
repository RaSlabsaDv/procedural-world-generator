# Architecture

**Status:** the shared `WorldGenerator.Core` computation probe, native/API tests, standalone WASM host, ASP.NET Core API, and minimal Angular local/remote paths are implemented. A single-origin Release build loads the WASM bundle and API, and scalar, bulk-array, runtime-reuse, API-error, and publishing checks pass. Phase 2 Step 1 now provides the canonical heightmap request/result contracts, request validation, and a shared host-owned `GenerationResponse` envelope; the terrain generator, host heightmap endpoints, and the Race/benchmark UI remain planned. See [development instructions](DEVELOPMENT.md) for the current code and commands. The [Project Brief](PROJECT_BRIEF.md) defines the required scope.

## 1. Components and dependencies

One monorepo, one Angular application, two thin execution hosts, and one algorithm library. Additional Domain/Application/Infrastructure layers are unnecessary for this scope.

```mermaid
flowchart TD
    UI[Angular: controls and results] --> G[GenerationService]
    R[Race / benchmark runner] --> G
    G --> L[Local adapter]
    G --> H[Remote adapter]
    L --> W[Standalone .NET WASM host]
    H --> A[ASP.NET Core API]
    W --> C[WorldGenerator.Core]
    A --> C
    G --> V[2D / Three.js renderer]
```

The arrows to Core represent dependencies on the same C# source project. The browser and server run separate instances of the execution environment.

Proposed structure after bootstrapping:

```text
src/
  client/          Angular, adapters, UI, visualization, runner
  core/            WorldGenerator.Core: models, validation, algorithms
  hosts/           GenerationResponse: shared host transport source
  wasm/            WorldGenerator.Wasm: JS exports, runtime startup
  api/             WorldGenerator.Api: HTTP endpoints
tests/
  core/            determinism, validation, reference outputs
  api/             HTTP and host serialization contracts
  browser/         WASM/API parity, production and offline smoke tests
scripts/           only the necessary build/packaging scripts
docs/
```

A separate `Contracts` project is not needed yet: pure input and output models belong in Core. Transport envelopes containing timings belong to the hosts; contract tests verify their consistency.

| Component | Responsibility |
| --- | --- |
| Core | Deterministic generator, canonical validation, models, algorithm version; biome classification later |
| WASM host | One-time runtime initialization, batched JS/.NET calls, data adaptation, Core timer |
| API | A generation request, HTTP input validation, Core invocation, timer, response |
| GenerationService | Adapter selection, input snapshot, request state, browser timings, common result format |
| Renderer | Map → pixels or mesh, palette, camera, Three.js resource cleanup |
| Runner | Execution order, output comparison, statistics, and export |

Core has no dependencies on HTTP, JSON, the DOM, Three.js, or timers. TypeScript may convert formats, build meshes, and calculate comparison statistics; the generation algorithm and biome rules remain in C#.

## 2. Contract v1

The request and result contracts are implemented in `WorldGenerator.Core`; host integration and generation are the next Phase 2 steps. Tests establish the contract before measurements begin.

```json
{
  "seed": 42,
  "width": 256,
  "height": 256,
  "noiseScale": 0.03,
  "octaves": 4,
  "heightMultiplier": 30.0,
  "algorithmVersion": "value-noise-fbm-v1"
}
```

| Field | Type and v1 rule |
| --- | --- |
| `seed` | C# `int` / signed 32-bit integer; negative values are allowed |
| `width`, `height` | Integers from 2 to 512; also require `width × height ≤ 262144`, checked before allocation |
| `noiseScale` | Finite number from 0.0001 to 1; sampling frequency per cell |
| `octaves` | Integer from 1 to 8 |
| `heightMultiplier` | Finite number from 0 to 1000; height scale in world units |
| `algorithmVersion` | Exactly `value-noise-fbm-v1`, compared with ordinal, case-sensitive equality |

These are initial limits, not a verified memory or performance budget. The PoC or profiling may require lowering them equally for both modes. Raising the limits is a separate decision made before a new measurement campaign.

`HeightMapRequest` is an immutable positional record whose constructor requires every field. `HeightMapLimits` exposes the named v1 constants (including `SupportedAlgorithmVersion = "value-noise-fbm-v1"`). `HeightMapValidator.Validate` returns every applicable structured `ValidationError` without rounding, clamping, or substituting defaults; `IsValid` is a convenience wrapper. A null request produces one `request.required` error rather than an exception. Errors are ordered deterministically by request field: `width`, `height`, cell count, `noiseScale`, `octaves`, `heightMultiplier`, `algorithmVersion`.

| Error code | Meaning |
| --- | --- |
| `request.required` | The request object is null |
| `field.required` | A required field is null or empty (currently the algorithm version) |
| `value.out_of_range` | A finite value is outside its inclusive range |
| `value.not_finite` | A floating-point value is NaN or an infinity |
| `cell_count.exceeded` | `width × height` exceeds 262144, using overflow-safe arithmetic |
| `algorithm_version.unsupported` | The version is nonempty but not exactly `value-noise-fbm-v1` |

Hosts must call this validator rather than duplicate the limits or comparison rules. Transport parsing and detection of missing wire fields remain host concerns and must not turn omitted fields into valid default values. `HeightMapResult` contains `width`, `height`, `values` (`float[]`), and `algorithmVersion`.

```text
HeightMapResult:
  width, height: int
  values: float[]                # IEEE 754 float32; heights 0…heightMultiplier
  algorithmVersion: string

GenerationResponse:
  result: HeightMapResult
  computeMs: double             # generator time only, measured in this host
  coreBuildId: string           # shared Core revision for WASM and API
  workload: "heightmap"         # scope of the measured computation
```

Data is flattened as `values[y * width + x]`, with `x` increasing within each row. The length equals `width × height`, and all values are finite. Core has already scaled the heights; the renderer must not apply the multiplier a second time.

`GenerationResponse` is a host transport envelope, not a Core model: it belongs outside `WorldGenerator.Core` because it carries host measurement and build metadata. It is implemented as `src/hosts/GenerationResponse.cs`, a host-owned source file linked into both `WorldGenerator.Wasm` and `WorldGenerator.Api`; no separate project or package is required. The positional record contains `Result`, `ComputeMs`, and `CoreBuildId`, while `Workload` is a getter-only property fixed to `"heightmap"`. The WASM host registers the envelope in its JSON source-generation context, and both hosts serialize the camelCase names `result`, `computeMs`, `coreBuildId`, and `workload`. `computeMs` measures generation after validation and excludes serialization, interop, transport, and rendering. `coreBuildId` identifies the shared Core revision used by each host, not the host build. `workload` is metadata describing the measured computation, not a user-controlled generation parameter.

In phase 3B, the result gains a `biomeIds` array in the same order: `byte[]` in C#, a JSON array of integer codes at the boundary, and `Uint8Array` in the client. Classification belongs to Core and is included in `computeMs` in both modes; `workload` becomes `heightmap+biomes`. The codes, thresholds, and a new version of the extended contract/algorithm must be defined by that phase. The final campaign uses this same workload in both modes.

All request fields are required. Invalid values are neither rounded nor replaced with defaults. The UI provides guidance, but Core performs the same authoritative validation in both modes. Both hosts reject unexpected fields and invalid types at the transport boundary. Missing numeric fields must not silently become C# zeros.

## 3. Generator and determinism

Initial implementation: 2D value noise with smooth interpolation, combined across fBm octaves. The parameters `lacunarity = 2` and `persistence = 0.5` are fixed by the algorithm version, without additional UI controls.

- Sampling coordinates are `(x * noiseScale, y * noiseScale)`; increasing the dimensions expands the map area.
- Choose and document a specific integer hash for noise lattice points, including its seed handling, constants, and explicit `uint` wraparound arithmetic. Do not rely on `GetHashCode()` or an unspecified `Random` implementation.
- Normalize the octave sum to `[0, 1]` using the sum of amplitudes, then multiply by `heightMultiplier`. Do not normalize using the minimum and maximum of the individual map.
- Fix the operation order; use `double` for intermediate values and `float` for final heights. The baseline is single-threaded in both hosts.
- Before completing the generator phase, document the exact hash, interpolation, and rounding rules, and add reference tests, including a negative seed, zero height, and a rectangular map.

Numerical tolerance and full-array comparison are described in the [measurement protocol](BENCHMARKING.md). Changes to formulas or biome rules require a new version; build changes are recorded separately using `coreBuildId`.

## 4. Execution boundaries and transport format

The initial baseline is `json-v1`: one call for the entire map. The WASM export accepts a JSON request string and returns a JSON response string; the API accepts and returns JSON through `POST /api/v1/heightmaps`. Both paths use the same JSON rules and Core models. This is a deliberately simple starting point, and its overhead is included in the research results.

Adapters convert `values` to `Float32Array` and validate the contract. Parsing, copying, and result validation are included in adapter time, but excluded from `computeMs`. The UI, Race, and renderer receive the same result type regardless of mode.

For the PoC, begin with an exact integer scalar, then an array through the same batched path. Do not assume that an arbitrary C# DTO automatically supports `[JSExport]`: check supported types and marshalling against the [interop documentation](https://learn.microsoft.com/en-us/aspnet/core/client-side/dotnet-interop/?view=aspnetcore-10.0).

Typed-array interop and binary HTTP remain possible changes after JSON overhead has been measured. Do not mix formats within one baseline campaign; changing the representation requires a new measurement profile. Record HTTP compression and its settings as part of the experimental conditions.

The API returns `400` with an error code and field errors for invalid input; an unexpected failure returns `500`. Local maps its errors to the same application error codes. Network failures and timeouts are reported separately and do not trigger a hidden fallback to Local.

## 5. Angular, UI, and lifecycle

- Use standalone Angular components, ordinary services, and local state; a global state-management library is unnecessary for the first version.
- Load WASM on the first Local run, then reuse a single runtime. Initialization has a separate status and timer; failed initialization can be retried without creating parallel runtimes.
- Allow only one active generation request at a time. Copy parameters before execution, block repeated submissions, and associate each result with its input snapshot.
- Race invokes both adapters sequentially with the same snapshot and displays the maps after the pair completes. Different `coreBuildId`, versions, or `workload` values mark the comparison as incompatible.
- Main-thread WASM can block the UI; a `Promise` alone does not prevent this. Display the loading state before the synchronous call. Limit baseline dimensions; do not promise progress updates or immediate cancellation of Core.
- Cancelling the HTTP wait does not guarantee that server computation stops. Preserve failed runs and ensure the previous computation has finished before the next measurement.
- Three.js reuses or disposes of geometry/materials; continuous animation stops during measurement series. Geometry and palettes are identical for Local and Remote.

A Web Worker is an optional future execution change, not a required MVP dependency. If a supported size blocks the UI for too long, first lower the limit and document the restriction.

## 6. Deployment and offline support

The initial deployment uses one origin: static Angular and the WASM bundle alongside `/api`. During development, the Angular proxy forwards `/api` to ASP.NET. SSR, a CDN, and a separate gateway are unnecessary.

The standalone .NET host uses its own published assets and `[JSExport]`; the PoC verifies the working template, workload, JS loader, and paths for the selected SDK. Microsoft describes [running .NET from JavaScript without Blazor and deploying the publish output](https://learn.microsoft.com/en-us/aspnet/core/client-side/dotnet-interop/wasm-browser-app?view=aspnetcore-10.0). Do not mix `.csproj` examples from different SDK versions.

Production build order:

1. Publish the WASM host in Release mode.
2. Copy the entire required publish bundle into a dedicated Angular assets directory, such as `/wasm/`, preserving relative paths.
3. Build Angular; once PWA support is added, generate the service-worker manifest with the WASM assets already included.
4. Deploy the Angular output and API; verify MIME types, loader URLs, and that missing runtime files do not receive the SPA fallback.

Once PWA support is enabled, a dedicated asset group caches the required `/wasm/**` files alongside the application shell using `prefetch`. The resources must enter the manifest during the Angular build; the rules are described in the [Angular service-worker configuration](https://angular.dev/ecosystem/service-workers/config). Prefetch caches files but does not initialize the .NET runtime.

Neither the service worker nor the server caches API responses; generation responses use `Cache-Control: no-store`. Offline behavior must not present an old response as a new Remote computation. All required fonts and modules are also local assets.

Test the production build over HTTPS or localhost, as described in the [Angular PWA setup](https://angular.dev/ecosystem/service-workers/getting-started). Confirm offline readiness after cache installation and a successful Local check, rather than relying on `navigator.onLine`. The complete reload and new-seed scenario is in [BENCHMARKING.md](BENCHMARKING.md).

Angular and WASM assets are updated as one version. Activate a new version between runs with a reload, not during an experiment. The API may already have a different revision; the `coreBuildId` check must detect this.

## 7. Decisions verified by the PoC

| Decision | Acceptance condition |
| --- | --- |
| Toolchain versions | Supported stable .NET SDK, matching WASM tooling/template, compatible Angular/Node/TypeScript; exact versions in project files and project documentation |
| Local execution | A scalar and an array work from Angular through the standalone host; repeated calls reuse the existing runtime |
| Packaging | Release publish output loads from static hosting without dev-server dependencies |
| Baseline | JSON transfers batched data correctly; startup overhead and computation are measured separately |

Check Angular compatibility with Node/TypeScript against the [official table](https://angular.dev/reference/versions). Do not add dependencies for workers, AOT, persistence, or adaptive selection without a separate request. Phases and verification criteria are in the [roadmap](IMPLEMENTATION_PLAN.md).
