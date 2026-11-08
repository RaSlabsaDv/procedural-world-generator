# Coastal surfaces v2

Status: implemented and verified; policy frozen before production implementation. Supersedes only the
coastal distance/blending policy in COASTAL_SURFACES_V1.md. Regional climate v1,
base coverage, placement and presentation policies remain unchanged.

## Diagnosis and frozen acceptance

Baseline: revision 92d160c, algorithm diverse-landscape-v8 / result v9. Use the
23 requests in landscape-v9-fingerprints.json and paired coasts.cjs --v2 cases.
The plain seed42 shoreline has 470 vertices with Sand>=0.2, reaching Manhattan
distance 6; the wet equivalent has 328, reaching distance 4. Rolling seed2026 has
45, reaching distance 2. Of 1102 above-sea land samples within distance 16 there,
only 159 fit the old relative-height cutoff .05; .10 admits 236. The gentle case is
distance-limited, while rolling shores are also elevation-limited. These are vertex
statistics, not pixel measurements or a claim that the whole width is solid sand.

Freeze a global distance ceiling 16, local width/elevation masks below and the
existing climate-dependent target mixture. For snow-free gentle (s<=.15), warm
(t>=.50), non-wet (m<=.65) ground at d1..4 and e<=.02, require Sand>=.85 (target .9).
The paired gentle scene must have more Sand>=.2 vertices and reach further inland
than baseline; do not require all coast types or seeds to grow sandy. At s>=.90,
the target remains pure Rock apart from protected Snow. No uniform-width sand rim
or new random field is introduced.

## Distance, eligibility and units

Reuse the authoritative boundary-connected Ocean mask. Outside-map space is not
Ocean. Ocean distance 0; land with a four-connected Ocean neighbor starts at1.
Seed row-major, then expand left/right/up/down through land once in a FIFO until
Manhattan distance 16 inclusive. Unreached land=255. Distances are grid/world units,
not Euclidean radii or meters. No diagonal-only seeding, line-of-sight, drainage,
wave/sediment simulation, terrain or water geometry is introduced.

Preserve bound=float32(heightMultiplier), sea=seaLevel*bound in double. Skip
bound==0, Ocean, heights<=sea and unreached samples. In particular, disconnected
below/equal-sea dry pockets remain unchanged. Ordinary proximity on above-sea land
behind ridges is still possible; this is an appearance model.

## Frozen equations and arithmetic

All new arithmetic is double on stored float32 m,t,s. smooth(a,b,x) clamps
u=(x-a)/(b-a) to [0,1], then returns u*u*(3-2*u).

- gentle=1-smooth(.15,.60,s).
- wet=smooth(.65,.90,m).
- room=gentle*(1-.35*wet).
- fullDistance=1+3*room; endDistance=6+10*room.
- fullElevation=.005+.015*room; endElevation=.03+.07*room.
- e=((double)height-sea)/bound.
- influence=(1-smooth(fullDistance,endDistance,d))
  *(1-smooth(fullElevation,endElevation,e)).

Room is a local width mask, not a new stored environmental field. Thus gentle/dry
full/end distances are4/16 and elevations .02/.10; steep full/end are1/6 and
.005/.03. Wetness narrows even gentle beaches. Continuity follows smooth masks;
no map-extrema normalization, per-cell PRNG or extra fBm is used. Local variation
comes from existing coherent climate and terrain. The distance ceiling is not a
promise that every beach has that width.

Skip d==0, d>=16, e<=0 and influence==0 without rewriting any channel. Beyond local
endDistance/endElevation the formula also has exactly zero influence. Keep the
original target mixture and its operation order:

- R=smooth(.35,.90,s).
- B=(.45+.45*smooth(.20,.50,t))*(1-.65*wet).
- G=smooth(.30,.65,m)*smooth(.20,.40,t).
- available=1-(double)originalSnow; ground=available*(1-R).
- targetGrass=ground*(1-B)*G; targetSoil=ground*(1-B)*(1-G).
- targetSand=ground*B; targetRock=available*R.

For Grass/Soil/Sand/Rock, write float32((double)original+(target-original)*influence).
Never rewrite Snow: preserve exact float bits, including signed zero. No repair,
weight addition or post-normalization. Land sums remain1 within 1e-6; Ocean zero.
Coverage outside the influence remains bit-exact.

## Pipeline, identities and budgets

Only CoastalSurfaces changes production math. It still runs after tree/rock
placement in the existing ecology pass and edits the existing final coverage array
in place. Heights, hydraulics, Ocean/biome IDs, climate, slope, density, trees, rocks
and snow remain exact. Trees/rocks can still stand on newly sandy ground; changing
that would require ecological rules and is outside this step.

Algorithm becomes diverse-landscape-v9; result landscape-ecology-v10; workload
landscape-ecology-hydraulic-v10; profile landscape-worker-json-v10. These are semantic
identities, not a schema change. Keep hydraulic-grid-v1, value-noise-fbm-v1,
worker-rpc-v1 and all presentation revisions unchanged. Reject the prior algorithm
at live hosts; never pool v9/v10 workload measurements.

One byte[N] distance buffer plus one int[N] FIFO, O(N) time, each land sample queued
once, no per-cell heap allocation. Raw scratch at 512x512 is1310720 bytes (1.25MiB);
allocation budget<=2MiB including overhead. Larger radius can visit more existing
samples, not allocate larger arrays. No new wire field, map copy, shader, attribute,
texture, control, dependency or draw. Retain 16384 trees / 8192 rocks, five textures,
nineteen color/initial-caster calls and existing per-viewport ownership/shadows.

Distance allocation/traversal and blending remain inside computeMs in both hosts.
JSON, transport, normalization/comparison and rendering remain outside. Changed
coverage decimals can alter response bytes despite identical schema and instances.

## Verification plan

Keep v1 literals and complete historical fixtures checked using a frozen test-only
CoastalSurfaces under Historical/V8; do not rewrite old expectations. Capture all
23 current v9 field hashes before changing production. Compare every non-coverage
field against them. Reconstruct old coverage with current base climate/coverage
plus frozen coastal v1 and verify its old hash, then verify new Snow bits directly.

Use independent Python distances/blend literals, local/global cutoff and continuity
checks, maximum allocation, zero bound, no/all Ocean, rectangular/min/max sizes,
signed seed extremes, dry disconnected pockets and normalized finite weights.
Check exact outside coverage and every non-coverage field including full instances.

coasts.cjs --v2 --before captures eight scenes at three fixed zooms against v8;
--v2 against v9 checks exact cameras, identical requests except version, hashes of
all non-coverage fields/snow and full worker/API equivalence. Scenes include gentle,
mountain-no-ocean, warm/dry steep shore, cold, no-ocean, inland dry pockets, rolling
and wet shores. Inspect actual images in addition to vertex statistics. Run full
landscape, material, lighting and PWA browser regressions. Evidence is correctness
and appearance verification, not controlled comparative performance findings.


## Implementation evidence

Locked restore, zero-warning/error Release build, 214 Core / 41 API / 300 Angular
tests, seven packaging/documentation/texture checks and worker RPC pass. The new
23-case field manifest preserves complete non-coverage records; reconstructed v1
coverage matches original hashes. Tests cover independent literals, local/global
cutoffs, continuous fades, exact Snow bits (including signed zero), dry pockets,
Ocean/no-Ocean/zero bound, rectangles, extreme seeds and maximum map allocation.
The measured scratch allocation stays within the original byte/int two-buffer
budget and below 2 MiB; no resource limit or assertion was relaxed.

Production Chromium 153 passes eight coastal worker/API comparisons with observed
maximum numeric error 0 and 24 exact paired camera/non-coverage/Snow hashes. The
separate seven-case full landscape matrix, including 512x512x128, also has maximum
error 0 across all fields and instances. Native host rejection and client decoding
checks exclude preceding algorithm/result/workload/profile identities.

Sand>=0.2 vertex count and maximum Manhattan distance from Ocean:

| Scene | Before vertices | After vertices | Before distance | After distance |
| --- | ---: | ---: | ---: | ---: |
| Gentle | 470 | 971 | 6 | 12 |
| Warm/dry | 223 | 520 | 4 | 12 |
| Cold | 0 | 0 | 0 | 0 |
| Wet gentle | 328 | 506 | 4 | 6 |
| Rolling | 45 | 36 | 2 | 2 |

Rolling terrain's local slopes narrow its new influence; wider sand everywhere is
not an acceptance goal. Cold scenes retain their character and exact snow. Warm and
inland cases each retain 94 dry below/equal-sea samples with zero sand; no-Ocean
scenes still have zero sand. Overview/close/detail views show wider gentle beaches
and gradual inland blending; exposed steep rock and grid-scale water edges remain.
Trees may stand on the newly wider sand because ecology/placement is preserved.
These figures are vertex mixture statistics, not raster beach area or performance
measurements. No numerical baseline was rewritten and no new UI controls or assets
were needed.


Production material, lighting and PWA regressions pass without page errors. Five
textures total 253693 encoded bytes; terrain and instance draw/resource limits stay
unchanged, including independent comparison-view cleanup, static shadow reuse and
maximum tree/rock submissions. Offline reload/new tabs generate new seeds, Remote
fails offline and recovers online, and deployment updates defer while busy then
remain usable offline. The known optional WASM optimization warning remains; AOT
was not enabled. README stays empty; changes are not controlled benchmark findings.
