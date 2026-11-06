# Architecture

**Status:** Phases 0–3B are implemented: shared deterministic C# computation, WASM/API hosts, the Angular heightmap MVP, and production PWA/offline support. Offline readiness verifies a complete version-specific asset cache and Local execution; updates reload only between operations. Real browser tests cover offline reload, new-tab generation, API unavailability/recovery, and updating to another offline-capable version. Three.js renders the shared heights and Core biome IDs; Architecture Race remains planned. See [development instructions](DEVELOPMENT.md) for commands and verification evidence.

## 1. Components and dependencies

One monorepo, one Angular application, two thin execution hosts, and one algorithm library. Additional Domain/Application/Infrastructure layers are unnecessary for this scope.

```mermaid
flowchart TD
    UI[Angular: controls and results] --> G[HeightMapService]
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

Current project structure:

```text
src/
  client/          Angular, adapters, UI, visualization, runner
  core/            WorldGenerator.Core: models, validation, algorithms
  hosts/           shared transport, JSON, build identity, GenerationResponse
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
| Core | Deterministic generator, canonical validation, models, algorithm/result versions and deterministic biome classification |
| WASM host | One-time runtime initialization, batched JS/.NET calls, data adaptation, Core timer |
| API | A generation request, HTTP input validation, Core invocation, timer, response |
| HeightMapService | Adapter selection, input snapshot, request state, browser timings, common result format |
| Renderer | Map → pixels or mesh, palette, camera, Three.js resource cleanup |
| Runner | Execution order, output comparison, statistics, and export |

Core has no dependencies on HTTP, JSON, the DOM, Three.js, or timers. TypeScript may convert formats, build meshes, and calculate comparison statistics; the generation algorithm and biome rules remain in C#.

## 2. Request v1 and extended result

The request and result contracts and the Core generator are implemented in `WorldGenerator.Core`. Host integration is implemented through the WASM export `GenerateHeightMapJson` and the API endpoint `POST /api/v1/heightmaps`; Angular provides 2D and 3D views. Tests establish the contract before measurements begin.

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

`HeightMapValidator.Prepare` wraps validation in a `HeightMapPreparation` result. A valid preparation contains a `ValidatedHeightMapRequest`, an immutable snapshot with an internal constructor and no public mutation path, so a host can validate once and generate without revalidating mutable input. Generation APIs are `Generate(HeightMapRequest?)`, which validates and preserves the existing exception contract, and `GenerateValidated(ValidatedHeightMapRequest)`, which performs generation only. Hosts must use `Prepare`/`GenerateValidated` so validation is authoritative and not included in generation timing.

| Error code | Meaning |
| --- | --- |
| `request.required` | The request object is null |
| `field.required` | A required field is null or empty (currently the algorithm version) |
| `value.out_of_range` | A finite value is outside its inclusive range |
| `value.not_finite` | A floating-point value is NaN or an infinity |
| `cell_count.exceeded` | `width × height` exceeds 262144, using overflow-safe arithmetic |
| `algorithm_version.unsupported` | The version is nonempty but not exactly `value-noise-fbm-v1` |

Hosts must call this validator rather than duplicate the limits or comparison rules. Transport parsing and detection of missing wire fields remain host concerns and must not turn omitted fields into valid default values. The shared host path parses a nullable wire request, reports missing fields in canonical order, then calls Core `Prepare`; it does not create a `HeightMapRequest` with substituted defaults. `HeightMapResult` contains `width`, `height`, `values` (`float[]`), `algorithmVersion`, `biomes` (`BiomeId[]`), and `resultVersion`.

```text
HeightMapResult:
  width, height: int
  values: float[]                # IEEE 754 float32; heights 0…heightMultiplier
  algorithmVersion: string       # unchanged value-noise-fbm-v1
  biomes: BiomeId[]               # numeric JSON array; client Uint8Array
  resultVersion: "heightmap-biomes-v1"

GenerationResponse:
  result: HeightMapResult
  computeMs: double             # GenerateValidated time only, measured in this host
  coreBuildId: string           # build-time Git revision shared by WASM and API
  workload: "heightmap+biomes"         # scope of the measured computation
```

Data is flattened as `values[y * width + x]`, with `x` increasing within each row. The length equals `width × height`, and all values are finite. Core has already scaled the heights; the renderer must not apply the multiplier a second time.

`GenerationResponse` is a host transport envelope, not a Core model: it belongs outside `WorldGenerator.Core` because it carries host measurement and build metadata. It is implemented as `src/hosts/GenerationResponse.cs`, a host-owned source file linked into both `WorldGenerator.Wasm` and `WorldGenerator.Api`; no separate project or package is required. The positional record contains `Result`, `ComputeMs`, and `CoreBuildId`, while `Workload` is a getter-only property fixed to `"heightmap+biomes"`. The WASM host registers the envelope in its JSON source-generation context, and both hosts serialize the camelCase names `result`, `computeMs`, `coreBuildId`, and `workload`. `computeMs` measures generation after parsing and preparation and excludes serialization, interop, transport, and rendering. `coreBuildId` identifies the shared Core revision used by each host, not the host build. `workload` is metadata describing the measured computation, not a user-controlled generation parameter.

Shared transport behavior lives in `src/hosts`: `HeightMapWireRequest` distinguishes missing fields from zero values, `HeightMapTransport` parses and prepares the request, and `HostJson` applies the same strict JSON options to both hosts. JSON is camelCase, case-sensitive, rejects unknown members, numeric strings, comments, trailing commas, and non-finite numbers. The API uses `DefaultJsonTypeInfoResolver` for internal requests; the WASM host uses the source-generated `HostJsonContext`. Transport failures use the shared `{ "error", "fields" }` envelope: `invalid_json` means malformed or incompatible JSON, and `validation` contains canonical field errors. `error` is a category and `fields` maps request field names to details. API failures return HTTP 400 and successful or failed generation responses use `Cache-Control: no-store`.

`CoreBuildId` is generated at build time by `src/hosts/HostBuildIdentity.targets` from repository HEAD, checking `global.json`, `src/core`, and `src/hosts` for modifications. The normal value is `git:<commit-abbreviation>` (at least 12 hexadecimal characters), with a `-dirty` suffix when those inputs are modified. Both Git commands must succeed, and the revision must match the SHA format. Missing Git, a missing repository, an invalid revision, or a failed status check produces `unversioned`, which is not valid benchmark identity. Git diagnostics are never used as identity or dirty-state data after a failed command. An explicit `CoreBuildId` MSBuild property overrides auto-detection; `CoreBuildIdGitExecutable` optionally selects the Git executable. The build ID is deliberately not an assembly `ModuleVersionId`.

Transport overflow such as `1e400` or `-1e400` in either double field returns `invalid_json` before Core preparation. A finite representable number outside the parameter limits still returns `validation`. Direct Core callers retain canonical non-finite validation.

The extended result uses `resultVersion = "heightmap-biomes-v1"` and `workload = "heightmap+biomes"`. The request, endpoint, transport profile `json-v1`, and frozen height algorithm `value-noise-fbm-v1` are unchanged. Previous height fixtures remain valid, but previous height-only responses are rejected by the current client. The separate result version identifies the added contract and classification rules. Any future change to these rules requires a new result version.

`biomes` has exactly `width × height` entries in the same row-major order as heights. C# uses `BiomeId[]` (numeric enum values serialized as a JSON array, not `byte[]`, which System.Text.Json serializes as base64). The client validates every ID before copying to `Uint8Array`; TypeScript never classifies heights. IDs and rules are frozen:

| ID | Biome | Relative final height |
| --- | --- | --- |
| 0 | Water | `[0, 0.25)` |
| 1 | Plains | `[0.25, 0.5)` |
| 2 | Forest | `[0.5, 0.75)` |
| 3 | Mountains | `[0.75, 1]` |

Core first stores the generated height as float32. It casts `heightMultiplier` to float32 for the bound, then compares the stored height against `(double)bound * threshold`, in ascending order. Equality belongs to the higher band. An exactly zero float32 bound (including a tiny positive multiplier that rounds to zero) yields water for every cell. Binary-exact thresholds avoid division and boundary ambiguity. Classification and allocation of biome IDs occur inside `GenerateValidated` and are included in both hosts' `computeMs`; validation, serialization, rendering, and comparison remain outside.

All request fields are required. Invalid values are neither rounded nor replaced with defaults. The UI provides guidance, but Core performs the same authoritative validation in both modes. Both hosts reject unexpected fields and invalid types at the transport boundary. Missing numeric fields must not silently become C# zeros, and zero is accepted only where the canonical range permits it, such as `heightMultiplier`. The native API and WASM export tests verify that both hosts produce the same error categories and field errors.

## 3. Generator and determinism

`HeightMapGenerator.Generate` implements `value-noise-fbm-v1` synchronously on one thread and returns independent storage for each call. It validates before allocating output and throws `ArgumentNullException` for a null request or `ArgumentException` with parameter name `request` for invalid input. `GenerateValidated` accepts only an already prepared request and performs the generator work without validation. This preserves the public exception contract while allowing hosts to start `computeMs` after transport parsing and Core preparation and immediately before `GenerateValidated`; a timer around validating `Generate` would include validation and is not the measurement boundary.

The algorithm is fixed as follows:

- Reinterpret the signed seed as `uint` using an unchecked conversion and use the same seed for every octave.
- Start with frequency `1.0` and amplitude `1.0`; use `lacunarity = 2` and `persistence = 0.5`. Process octaves in ascending order.
- For each cell in row-major order, sample `sampleX = x * noiseScale * frequency` and `sampleY = y * noiseScale * frequency`.
- Select the lattice cell with `Math.Floor` for both coordinates. For each fractional coordinate `t`, apply quintic smoothing: `t * t * t * (t * (t * 6 - 15) + 10)`.
- Interpolate with `Lerp(a, b, t) = a + (b - a) * t`, along x first and then along y.
- Hash integer lattice coordinates with explicit `uint` wraparound arithmetic:

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

- For each octave, accumulate `noise * amplitude` and the amplitude sum. Then multiply frequency by `2` and amplitude by `0.5` for the next octave.
- Normalize with `Math.Clamp(sum / amplitudeSum, 0.0, 1.0)` and return `(float)(normalized * heightMultiplier)`. Do not normalize using the generated map's minimum and maximum.
- Use `double` for intermediates and an explicit cast to `float` for final heights.

Numerical tolerance and full-array comparison are described in the [measurement protocol](BENCHMARKING.md). Changes to formulas or biome rules require a new version; build changes are recorded separately using `coreBuildId`.

## 4. Execution boundaries and transport format

The initial baseline is `json-v1`: one call for the entire map. The WASM export accepts a JSON request string and returns a JSON response string; the API accepts and returns JSON through `POST /api/v1/heightmaps`. Both paths use the same JSON rules and Core models. This is a deliberately simple starting point, and its overhead is included in the research results.

Adapters convert `values` to `Float32Array` and `biomes` to `Uint8Array` and validate the contract. Parsing, copying, and result validation are included in adapter time, but excluded from `computeMs`. The UI, Race, and renderer receive the same result type regardless of mode.

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

### Implemented Angular heightmap MVP

`HeightMapService.local` and `.remote` use the existing WASM runtime and HTTP endpoint. Both pass responses through `heightmap.contract.ts`, which checks the envelope, request dimensions/version, workload, timings, identity, the result version, and every height/biome ID before returning independent `Float32Array` storage. Structured host errors are distinguished from protocol and availability failures. Canonical parameter validation remains in Core; the form only rejects empty or unparseable numbers and provides HTML input guidance.

`App` captures a frozen request and uses the shared `OperationLock` across heightmap actions, `ProbeDiagnostics`, offline preparation, and update reloads. Changed inputs invalidate comparison state; obsolete asynchronous results are discarded. Existing maps retain their original parameter labels. The Local path permits a browser frame before synchronous computation; it can still block the main thread.

“Verify equivalence” runs Local then Remote using one snapshot and renders after the pair. It compares every biome ID exactly and every height with the documented tolerance, reports maximum/mean absolute error and mismatch count, and distinguishes numerical agreement from build compatibility. Different IDs are incompatible; matching dirty/unversioned IDs remain unverifiable. This is a correctness check without repeated trials, winner rankings, or performance charts.

`HeightMapPreview` builds row-major grayscale Canvas 2D pixels on the CPU. Both maps use zero as black and the captured height multiplier as white, with an explicit zero-height case. It does not normalize each map by its own extrema or modify heights. `computeMs` comes from the host; browser `requestMs` ends after decoding and normalization, before comparison/rendering. Runtime initialization is displayed separately.

### Implemented Three.js view

The default view remains Canvas 2D. Selecting **3D biomes** loads `TerrainPreview` through Angular `@defer`; the production service worker prefetches its chunk along with the shell, so it is available offline even before the first 3D selection. Three.js and its TypeScript types are pinned in the npm lockfile. No renderer library is added to Core or either host.

`terrainGeometry` uses one vertex per sample: `(x - (width - 1)/2, values[y * width + x], y - (height - 1)/2)`. It builds two consistently wound triangles per grid quad, uses `Uint32Array` indices for the 512×512 limit, computes normals, and assigns a fixed visualization palette by Core ID. Vertex colors interpolate across triangle surfaces; discrete biome IDs remain unchanged. Both modes use identical geometry, palette, lighting, initial camera, and scale based on their captured request. Heights remain in world units without a second multiplier. OrbitControls provides orbit, zoom, and pan; there is no continuous animation loop. Controls and rendering pause while the shared operation lock is held.

The geometry's position/color/normal/index arrays use about 15 MiB per maximum-size map, excluding transport, scene/driver overhead, and GPU copies. The shared 512×512 limit was retained after a Chromium smoke check; this is not a device-independent memory/latency guarantee. On replacement/destruction, the component disposes geometry, material, controls, resize observer, and renderer; destruction also releases the WebGL context. Unsupported/lost WebGL shows a recoverable presentation error; switching to 2D remains possible.

The displayed **3D setup and first render submission (CPU)** measures scene/geometry preparation through the first `renderer.render` return. It excludes deferred module download and Angular scheduling, and is neither GPU completion nor time until pixels are visible. Ordinary resize/orbit draws are not benchmark samples. This value is separate from host `computeMs` and adapter request-to-data time. Cleanup follows the [Three.js resource disposal guidance](https://threejs.org/manual/en/cleanup.html).

## 6. Deployment and offline support

The initial deployment uses one origin: static Angular and the WASM bundle alongside `/api`. During development, the Angular proxy forwards `/api` to ASP.NET. SSR, a CDN, and a separate gateway are unnecessary.

The standalone .NET host uses its own published assets and `[JSExport]`; the PoC verifies the working template, workload, JS loader, and paths for the selected SDK. Microsoft describes [running .NET from JavaScript without Blazor and deploying the publish output](https://learn.microsoft.com/en-us/aspnet/core/client-side/dotnet-interop/wasm-browser-app?view=aspnetcore-10.0). Do not mix `.csproj` examples from different SDK versions.

Production build order:

1. Publish the WASM host in Release mode.
2. Copy the entire required publish bundle into a dedicated Angular assets directory, such as `/wasm/`, preserving relative paths.
3. Build Angular with WASM assets already present, run `scripts/finalize-pwa.mjs`, then generate the final Angular service-worker manifest. The finalizer embeds a versioned offline catalog reference in the index before invoking Angular’s own manifest generator.
4. Deploy the Angular output and API; verify MIME types, loader URLs, and that missing runtime files do not receive the SPA fallback.

PWA support uses one `offline` asset group with `prefetch` install/update policies for the shell, icons, versioned offline catalog, and complete required `/wasm/**` bundle. Compressed mirrors (`.br`/`.gz`) and debug files are excluded. The build finalizer derives a version identifier from Angular’s asset hashes, embeds the catalog URL in `index.html`, and regenerates `ngsw.json` using the supported Angular CLI. The catalog records the exact expected SHA-1 of every required asset, including the final index. It is verification metadata; Angular remains the only cache manager. Using one group lets readiness verify one complete cache rather than accidentally combining different app versions. Rules follow the [Angular service-worker configuration](https://angular.dev/ecosystem/service-workers/config).

Neither the service worker nor the server caches API responses; generation responses use `Cache-Control: no-store`. Offline behavior must not present an old response as a new Remote computation. All required fonts and modules are also local assets.

`OfflineReadinessService` waits for service-worker control, checks that each cache containing the current index’s exact catalog has every required asset with matching bytes, confirms that the controlled index/catalog matches the open document, and verifies a tiny Local request. A mismatched version or a controller change cannot produce a ready state. It never unions caches across versions or treats `navigator.onLine` as proof. Preparation is deduplicated and holds `OperationLock`, outside generation timings. Bounded registration/control/cache waits fail with a retry message; unsupported development/nonsecure contexts remain usable for ordinary generation. Unrecoverable service-worker errors invalidate readiness. Cache eviction and clearing site data require preparation again.

Test production over HTTPS or localhost, as described in the [Angular PWA setup](https://angular.dev/ecosystem/service-workers/getting-started). The complete reload and new-seed scenario is in [BENCHMARKING.md](BENCHMARKING.md); the automated browser reproduction is `tests/browser/pwa.cjs`.

Angular and WASM assets are updated as one version. `SwUpdate.versionUpdates` notifies the user when a version is ready. The update button acquires the same operation lock, invalidates readiness, and reloads; it does not call `activateUpdate()` in the live page. The lock stays held until navigation, and a failed reload is reported and unlocks retry. The new document independently verifies its own catalog and runtime. This follows [Angular’s update/reload guidance](https://angular.dev/ecosystem/service-workers/communications). The API may already have another revision, so `coreBuildId` compatibility checks still apply.

WASM publishing stages a fresh output and client bundle, validates required runtime files, and then promotes both directories with rollback. Previous assets survive restore, publish, validation, and promotion failures. The stage is cleaned on exit; repeated builds do not retain stale hashed files. No compilation or optimization mode was changed.

## 7. Decisions verified by the PoC

| Decision | Acceptance condition |
| --- | --- |
| Toolchain versions | Supported stable .NET SDK, matching WASM tooling/template, compatible Angular/Node/TypeScript; exact versions in project files and project documentation |
| Local execution | Scalar, array, and heightmap JSON work through the standalone host; repeated calls reuse the existing runtime |
| Packaging | Release publish output loads from static hosting without dev-server dependencies |
| Heightmap hosts | Published WASM and API use the same strict JSON contract, error categories, build ID, and deterministic result |
| Baseline | JSON transfers batched data correctly; startup overhead and computation are measured separately |

Check Angular compatibility with Node/TypeScript against the [official table](https://angular.dev/reference/versions). Do not add dependencies for workers, AOT, persistence, or adaptive selection without a separate request. Phases and verification criteria are in the [roadmap](IMPLEMENTATION_PLAN.md).
