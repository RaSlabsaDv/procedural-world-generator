# Local geometric relief v1

Status: implemented and verified; frozen specification. Stage 6 changes height composition before erosion, preserving all ecological, surface, vegetation, rock and hydraulic policies. Algorithm diverse-landscape-v6; result landscape-ecology-v7; workload landscape-ecology-hydraulic-v7; execution profile landscape-worker-json-v7. Schema, request controls and limits stay unchanged. Historical workload timings must remain separate.

## Coordinates and frozen equations

One horizontal grid step is one world unit. Use unwarped grid x/z for local detail, independent of noiseScale and region scale. Existing scaled/warped composition and regional weights P/H/M remain authoritative and are computed once. New streams use existing quintic value noise and ascending fBm (lacunarity2, persistence.5); no primitive changes. All arithmetic is double, existing final conversion to float32 remains after erosion.

At unsigned seed, define:
- mask=smooth(.48,.72,Fbm(x/96+17,z/96+31,seed XOR 0x243F6A89,2)).
- hill=2*Fbm(x/32+47,z/32+13,seed XOR 0x85A308D3,2)-1.
- detail=2*Fbm(x/16+29,z/16+53,seed XOR 0x13198A2E,2)-1.
- plain=mask*(.008*hill+.0015*detail).
- hills=.025*hill+.006*detail.
- gate=smooth(.08,.25,ridge)*(1-smooth(.70,.90,ridge)), using the existing cubed ridge signal.
- bend=2*ValueNoise(x/64+7,z/64+19,seed XOR 0x03707344)-1.
- u=(.8*x+.6*z)/12+.35*bend+13; v=(-.6*x+.8*z)/40+43.
- channel=smooth(.35,.75,ValueNoise(u,v,seed XOR 0xA4093822)).
- mountain=strength*gate*(-.035*channel+.006*detail).
- delta=(P*plain+H*hills)+M*mountain.

smooth(a,b,n): t=clamp((n-a)/(b-a),0,1), then t*t*(3-2*t). Short-circuit bend/channel when M==0, strength==0 or gate==0; mountain then zero. No mutable PRNG, per-map rotation or renderer displacement. Rotated anisotropic channels and slow bending suggest shallow irregular grooves, not drainage or rockfall simulation.

The shortest new fBm lattice spacing is8 grid units, hill spacing16..32, mask48..96, bend64, channel12 across/40 along before rotation. These are noise lattice spacings, not guaranteed sinusoidal wavelengths or sub-grid geometry. The continuous channels can cross individual triangles; additional vertices are never fabricated. A minimum 2x2 map samples only a fragment; map dimensions do not stretch the detail. Existing high-frequency composition remains unchanged.

Let base=the existing clamped Blend result. Compute headroom=min(1,min(base,1-base)/.05), then composed=clamp(base+delta*headroom,0,1). Multiply by float32(heightMultiplier), then run unchanged hydraulic erosion in double and convert final heights to float32. Regional extrema: |plain|<=.0095, |hills|<=.031, |mountain|<=.041*strength, hence |delta|<=.041 for valid weights. Headroom attenuates near bounds and prevents introducing new clamp plateaus; existing clamped plateaus remain. Zero height is exactly zero. At default height30, maximal additions are .285/.93/1.23 world units before headroom/erosion; actual fields are usually smaller.

## Scope, work and acceptance

No added full-map arrays or per-cell heap allocations. Six common ValueNoise calls (three two-octave streams) plus at most two mountain calls per sample, <=32 new lattice hashes. No repeated regional evaluation. LocalRelief has zero scratch-map storage and must allocate zero managed bytes in a warmed sampling loop. Existing simulation/instance caps remain. The full downstream pipeline derives fields and grounded trees/rocks from final heights; their values can change but their policies and resource limits cannot.

Freeze acceptance before production tuning: at 129x97, height30, scale.03, warp2, pure plains and seeds42,-7,intMin,intMax, steps 0/32, at least85% of samples must have slope<=.1 and the largest four-connected low-slope area must cover at least60% of samples. Mean slope must be <=baseline*1.35+.005. On a512x512 pure-plain sampling domain, at least25% of samples must have mask exactly zero and some must have mask>.25. For mixed and mountain requests, delta must be nonzero and bounded, vary spatially, and preserve continuous regional transitions. At least one quarter of tested mixed-map samples must differ from baseline; do not assert unchanged tree counts. Verify supported grid spacings, exact bounds/headroom, extrema, derivative continuity and all downstream invariants. Keep historical literal expectations on the frozen pre-relief path.

Core timing includes all added noise/blending work; validation, JSON, decoding/comparison and rendering remain excluded. Report production bytes, counts, reserved WASM memory and separate smoke timings; no comparative performance conclusions from smoke runs. No dependencies, controls, water/coast changes, resolution increases or extra rendering work are introduced.

## Historical baseline

landscape-v6-fingerprints.json captures c0d0f50 before implementation: 18 requests, including eroded climate/extreme-seed maps, pure plains, mountains, minimum/maximum dimensions, zero height, height 1000 and max iterations. Hashes cover all numeric fields, full trees/rocks and hydraulic summaries. Frozen test-only V5 composition/orchestration reproduces historical results using unchanged current hydraulic/ecological policies; historical specifications and earlier expectations are not overwritten. Baseline screenshots use the same requests/framing as subsequent browser captures.

## Verification and limitations

Locked restore, Release build (zero warnings/errors), production publication, 174 Core/38 API/161 Angular tests, four Python packaging/asset tests and worker RPC pass. Independent Python literals freeze five relief samples and a complete zero-warp pure-plain float32 map. Historical V5 composition/orchestration reproduces all 18 baseline requests including complete tree/rock transforms and simulation summaries; earlier v1–v5 expectations remain unchanged. New tests cover signed seeds, blend/spatial continuity, bounds/headroom, zero allocation, zero height, minimum/rectangular/maximum maps, conservation and final derived/grounded output.

Pure plains at 129x97/height 30, four seeds and steps 0/32 retain 95.68–100% low-slope coverage; all these low-slope samples form one connected component except the minimum-seed case, where the largest differs by less than .01 percentage points. Mean slopes are .02267–.04410, within the predeclared relative bound. The finest new lattice spacing is eight units; no sub-grid displacement is introduced. Zero-mask patches and masked variation coexist on the tested 512x512 domain. No amplitudes, masks or acceptance criteria were retuned after the initial specification.

Production Chromium 153.0.8010.52 passes landscape, materials, lighting, editor, relief and PWA scenarios. All seven WASM/API cases have zero observed numeric error across every height, field, category, tree/rock transform and summary. All kind/variant pairs occur. The 512x512x128 request returns 16384 trees and 8192 rocks, response 19022998 UTF-8 bytes and 184680448 reserved WASM bytes across the sequence. Count/size changes arise from new heights, not a changed schema or ecological rule. Reserved memory is not live managed memory or browser RAM, and it cannot isolate the sampler's memory cost. The warmed native sampling loop allocates exactly zero bytes; mathematical work adds at most eight noise evaluations/32 lattice hashes per sample. No controlled old/new performance claim is made from smoke timings.

The mixed presentation case has 678 trees and 1017 rocks with all six groups of each: 19 main and 19 initial caster calls. The maximal scene submits every returned record within the existing caps. Texture assets, shadow targets, vertex formats and renderer code are unchanged. Static reuse, paused worker computation, camera/replacement/failure ownership, empty ocean, narrow/offline generation, offline reload/new tabs, Remote recovery and safe updates pass. The SDK's pre-existing unoptimized-publish notice remains; AOT is not enabled.

Ignored artifacts retain exact requests and views: landscape-verification.json, relief-materials-verification.json, relief-before/after-verification.json; relief-before/after-{normal,cold,warm,conifer,mixed}-{overview,close}.png and pure/eroded-plains/mountain pairs. Native quantitative metrics are emitted by LocalReliefTests. Plains intentionally remain broad and visually restrained; grooves are illustrative surface shape, not physical drainage. Erosion can smooth the added features, while thresholds can move coastlines/biomes and change instance selection naturally. Existing grid triangulation and shadow texel limits remain. No mobile resource guarantee or universal terrain realism claim is made. Coastal surface classification remains Stage 7.
