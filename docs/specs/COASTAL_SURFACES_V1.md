# Coastal surfaces v1

Status: implemented and verified; frozen specification. Stage 7 changes only final surface coverage. Algorithm diverse-landscape-v7; result landscape-ecology-v8; workload landscape-ecology-hydraulic-v8; profile landscape-worker-json-v8. Request/output schema, hydraulic-grid-v1, value-noise-fbm-v1, terrain, sea rules and ecological/instance policies remain unchanged. Never pool v7/v8 workload timings.

## Shoreline distance and eligibility

Reuse the existing final-height boundary-connected ocean bool array, including height<=sea equality. Outside the map is not ocean. Ocean distance is 0; land with a four-connected Ocean neighbor starts at 1. Propagate through land in four-connected steps, each sample once, stopping at distance 8. Diagonal contact alone does not seed a shore. Unreached land uses byte 255. A diagonal step may still be reached later by a valid two-step land path. Distance is inland Manhattan grid/world units, not meters or a Euclidean radius; one horizontal grid step is one world unit.

One byte[N] buffer and one int[N] FIFO, raw 1.25 MiB at 512x512; allocation budget<=2 MiB including array overhead. No per-cell heap objects, nearest-ocean searches or new wire maps. No-ocean maps remain unchanged; all-ocean coverage stays zero. Queue land only, seed in row-major order, expand left/right/up/down, O(N) bounded work.

Let bound=float32(heightMultiplier), sea=seaLevel*bound in double. Skip Ocean, bound==0, unreached land and heights<=sea. The latter explicitly protects dry disconnected depressions below/equal sea even when close to a real shoreline. Their low elevation alone never makes a beach. This does not stop ordinary proximity effects on above-sea land behind a ridge; no line-of-sight or drainage model is introduced.

## Frozen blending equations

smooth(a,b,x): u=clamp((x-a)/(b-a),0,1), then u*u*(3-2*u).
At eligible land, e=((double)height-sea)/bound. Influence a=(1-smooth(2,8,distance))*(1-smooth(.01,.05,e)). Thus d>=8 or e>=.05 has exactly zero influence. Skip a==0 without rewriting any original weights.

Use stored float32 moisture m, temperature t and slope s; all new arithmetic is double. Define:

- R=smooth(.35,.90,s), the coastal rock fraction.
- B=(.45+.45*smooth(.20,.50,t))*(1-.65*smooth(.65,.90,m)), the sand fraction of non-rock ground. Warm/drier shores favor sand; wet shores retain more grass/soil, cold shores can still contain sand.
- G=smooth(.30,.65,m)*smooth(.20,.40,t), the grass fraction of the remaining ground.
- S=the original stored float32 Snow coverage; preserve its exact bits.
- targetGrass=(1-S)*(1-R)*(1-B)*G.
- targetSoil=(1-S)*(1-R)*(1-B)*(1-G).
- targetSand=(1-S)*(1-R)*B.
- targetRock=(1-S)*R.
- targetSnow=S.

For channels Grass/Soil/Sand/Rock, output=float32((double)original+(target-original)*a). Snow is not rewritten. The target vector sums to1 analytically; the original float32 vector is already normalized within1e-6. No independent weight additions, repair or post-normalization. Output vectors remain finite/bounded; Ocean vectors remain all zero. Beyond influence, original coverage stays bit-exact. Sand is now a supported nonzero land channel; biome IDs remain ecological categories rather than surface colors.

## Pipeline and preservation boundary

Keep SurfaceCoverage.Derive/Write as the frozen base surface-v1 policy. Trees and rocks are generated against existing fields and base coverage first. Apply CoastalSurfaces in place to that same weights array only after RockPlacement finishes, using the authoritative ocean mask. This ordering is essential: rocks consume base Rock coverage for suitability, so feeding coastal appearance into placement would silently change instance policies. No second coverage map is allocated. Final wire coverage includes coastal blending; base coverage is not a new public field.

All heights, hydraulic summaries, ocean/biome IDs, climate/slope/density arrays, full tree/rock records remain exact for identical mathematical inputs. Trees/rocks may stand near or on sand; protecting entire beaches from vegetation would require separate ecological rules and is out of scope. No new controls, dependencies, assets, water geometry, lake filling, hydrology, terrain deformation or resolution changes.

## Rendering, budgets and timing

Use the existing local sand.png asset. Activate five detail textures per viewport, preserving four-unit world-space triplanar sampling and linear Lambert color blending. Sand tint is #d6c28e. Pack the existing vec4 Grass/Soil/Rock/Snow coverage plus a scalar sandCoverage attribute/varying; never use a five-component vertex attribute. Ocean complement uses the sum of all five supplied weights. Shader revision terrain-surface-coverage-v2; no ecological shader rules or displacement.

One extra float per sample adds 1 MiB at 512x512; coverage GPU attributes become 5 MiB/view. Client coverage stays 5 MiB and schema stays five numeric channels. Five 256x256 RGBA8 textures with mipmaps estimate 1747627 bytes/view (about 1.67 MiB), two views 3495253 bytes. All five encoded source textures were already bundled/cached (271377 bytes total), so no new asset downloads or catalog entries are added. Terrain still one draw; total<=19 color/initial caster calls. Existing 2048 PCF shadow estimate 32 MiB/view is unchanged. Matrix caps/ownership remain unchanged.

Core timing includes distance allocation/traversal and in-place coastal blending after unchanged placements in both hosts. Parsing, JSON, normalization, full comparison, fifth-texture loading and GPU packing/setup remain outside computeMs. Existing asset-wait, pause, failure/retry, replacement/two-view disposal and offline update behavior must cover sand equally.

## Baselines and acceptance

Before implementation, landscape-v7-fingerprints.json captures 37e3862 numeric fields for 23 requests: the 18 Stage 6 shape/extreme/work cases plus explicit no/all-ocean, mountain terrain and warm/cold shores. Test all unchanged fields directly against these hashes; reconstruct historical base coverage when checking its old hash. Historical V5 ecology is frozen before adding coasts so older fixtures retain their meaning.

Freeze acceptance: d1..2, gentle s<=.35, warm t>=.50 and m<=.65, e<=.01 must yield Sand>=.85 on snow-free base ground after full influence. Steep s>=.90 yields coastal target Rock=1-S; stored Snow stays exact at every influence. d>=8, e>=.05, no-ocean and dry below-sea land retain original coverage exactly. Synthetic disconnected pockets and diagonal-only/non-ocean boundaries must pass. Actual WASM/API parity includes every channel and non-coverage record; preserve maximum budgets and record real payload/resource figures. Do not retune these criteria to fit production output. Coastal pictures are illustrative, not calibrated sedimentology or a performance campaign.

## Verification and practical limits

Locked restore, Release build (zero warnings/errors), production publication, 181 Core/39 API/164 Angular tests, four Python packaging/asset tests and worker RPC pass. Independent Python distance/blend literals match. Current integration checks every non-coverage field and full tree/rock record against 23 pre-coastal requests, while reconstructed base coverage matches its old hash. Older V5 ecology is frozen before this change so earlier fingerprints retain their meaning. Tests cover shoreline equality, diagonal distance, no/all-ocean and zero-height cases, disconnected pockets, exact outside coverage/snow, warm/wet/cold/steep targets, normalization and maximum traversal. Distance+queue allocation at 512x512 is 1310768 bytes including array overhead (raw 1310720), below 2 MiB. No thresholds or acceptance criteria were retuned after specification.

Production Chromium 153.0.8010.52 passes coasts, landscape, materials, lighting, editor, relief and PWA. Seven full WASM/API cases match every field and instance with maximum observed error zero. The 512x512x128 case returns 16384 trees and 8192 rocks, response 19022993 UTF-8 bytes, coverage array 2621441 wire bytes and 182910976 reserved WASM bytes across the matrix. Reserved memory is not live managed memory, browser RSS or an isolated measure of coastal scratch use. Payload timings/bytes include real serialization characteristics; no controlled performance comparison is claimed.

Five real texture uploads per view are verified, with independent comparison-view cleanup and late/failed sand retry. Maximum coverage attributes are 4194304+1048576 bytes, checked in geometry tests and used by the real shader. The mixed scene uses 19 main and 19 initial caster calls; static 2048 PCF maps and terrain geometry stay unchanged. Maximum tree/rock submission, pause, camera/replacement/error ownership, empty ocean, narrow/offline generation, offline reload/new tabs, Remote recovery and safe updates pass. Encoded source assets remain 271377 bytes and the complete catalog 38 entries. The existing unoptimized-publish notice remains; AOT is not enabled.

Gentle coast: 599 sand-positive samples, maxSand .9. Warm/cold scenes contain 144/41 shoreline samples with slope>=.9 and 214/47 shoreline samples with Rock>=.8. Warm and inland scenes each contain 94 dry below/equal-sea samples, all with zero sand. The pure-mountain request at seaLevel .30 has no ocean; its descriptive label is mountain-no-ocean rather than a claimed steep coastline. Actual steep coast evidence comes from warm/cold views. No-ocean scenes have zero sand. Baseline/after captures retain identical numeric requests and overview/close framing.

Ignored evidence: coasts-before/after-verification.json, coasts-materials-verification.json, landscape/lighting/editor/relief/PWA JSON, coasts-before/after-{gentle,mountain-no-ocean,warm,cold,no-ocean,inland}-{overview,close}.png and materials images. Trees/rocks may remain on sand because ecological policies are unchanged. Grid-scale four-connected distance and ordinary triangle interpolation can show angular shore edges; sand textures do not add shoreline geometry. Distance has no line-of-sight barrier, while below-sea dry pockets are explicitly protected. These are illustrative surfaces, not a sediment/coastal erosion model or a mobile resource guarantee.
