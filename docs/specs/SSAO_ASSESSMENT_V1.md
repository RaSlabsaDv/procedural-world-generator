# SSAO assessment v1

Policy frozen before prototype execution. This is an assessment, not authorization
to ship SSAO. Existing uncommitted Bloom work is the baseline and remains intact.

## Candidate and architecture

Assess installed Three.js 0.187.0 SSAOPass using actual terrainScene geometry,
materials and tree LOD in an isolated test bundle. No production import, debug hook,
public control or asset. Parameters/cases are frozen in
[the assessment policy](../../tests/browser/ssao/policy.json).

16 seeded hemisphere samples, radius1.5 world units; depth bias .02 and maximum
sample-depth separation2 world units, converted to normalized linear-depth units
using camera far-near. Fixed kernel/noise seed0xc0ffee, independent of Core seeds.
AO runs at half drawing-buffer dimensions, capped262144 pixels/view, no MSAA.
Normals RGBA16F8 bytes/pixel, depth-stencil D24S8 4, raw and blur RGBA16F8 each:
28 bytes/pixel, plus64 bytes for4x4 R32F noise. Maximum7340096 bytes/view (7 MiB+64),
14,680,192 for two. Kernel16vec3 uniform storage192 bytes, outside target accounting.
Driver/framebuffer/program overhead and existing finishing/bloom targets are extra.

The pass re-renders active opaque layer0 meshes with MeshNormalMaterial. Hide sky
and transparent water only during normal/depth override and restore visibility in
finally; never use layer1 full-detail shadow sources. Stock normals are geometric,
not terrain microdetail normals. Stock5x5 equal-weight box blur has no depth/normal
edge stop. Assess this limitation explicitly rather than silently upgrading it.

The stock composition multiplies final scene RGB. Use mix(1,AO,.35) in linear HDR
before bloom/exposure/ACES/toe to bound this approximation. It cannot isolate ambient
light or distinguish already-composited transparent water. This is a diagnostic
candidate only: shipping requires ambient-only integration and correct water/background
protection. No change to production material equations is authorized by the prototype.

Keep original render order and static shadows. Override visibility/material, target,
clear state and renderer hooks only inside the test owner with finally restoration.
Explicitly dispose noise/SSAO material because installed SSAOPass.dispose omits them.
Two-view owners must have independent mutable targets. No animation loop or Core math.

## Frozen gates

Critical visual gates (any failure rejects shipping this candidate):

- Water, background/sky and direct/specular light must not inherit opaque AO.
- Fully faded grass must not contribute normals/depth or phantom occlusion.
- Actual visible tree LOD must supply the G-buffer; hidden shadow sources must not.
- No new shoreline/silhouette halos from blur, unstable cutouts, night blackening,
  or snow readability loss. Capture paired overview/close images before judging.
- Neutral/disabled output must be byte-exact after prototype activation/disposal;
  Core hashes/cameras/canonical instance buffers and static shadows stay unchanged.

Resource gates: <=7 MiB+64 per view, <=35 extra draw calls at structural worst case
(up to 32 opaque override batches + AO + blur + multiply), no leaked targets after
cleanup, correct target/state restoration on failure. No target sharing across views.
Only changed camera snapshots are assessed; controlled generation has already ended.
Prototype is never invoked under production OperationLock or experiment collection.

Hardware gate: <=2 ms median additional GPU time, <=4 ms for two views, on a recorded
supported hardware/browser/resolution setup with valid disjoint-timer samples. If
hardware/timer evidence is unavailable, this gate stays unresolved. Software WebGL
CPU/GPU timings cannot pass it. Record resources and diagnostic CPU submission
separately, without labelling submission as completion or inventing missing timings.

## Evidence matrix and decision procedure

Use frozen policy cases (valleys, rocks, dense/sparse forest, grass, coast, snow,
maximum), overview then a fixed close approach. Add low sun/night and bloom interaction,
small camera changes/LOD crossings, two views and a deterministic contact fixture.
Read actual AO/normal/depth buffers and retain paired PNGs. Record full Core hashes,
actual camera matrices, GL formats/dimensions/calls, renderer identity and timer support.
Use explicitly labelled diagnostic masks/removals only to isolate causes, not as
retuned candidate parameters. Parameters must not be adjusted after seeing outcomes.

Ship only if all critical/resource gates pass and hardware cost is justified. Otherwise
remove production prototype integration, keep assessment-only tooling/evidence, name
failed/unresolved gates and define requirements for reconsideration. No inactive UI,
placeholder pass or allocated buffer. Next independent track: detailed generation
stage timing, then progress/cancellation. README remains empty; no Core/native,
lighting/biome, dependency, adaptive quality or automatic exposure changes.

## Outcome: reject this candidate; defer production SSAO

The frozen stock candidate fails all four critical integration gates. No production
SSAO import, allocation or public toggle is added. The prototype remains solely in
`tests/browser/ssao/entry.ts`, bundled in memory by the assessment runner and served
through Playwright routes. Existing Bloom changes are preserved. No candidate code
is copied into Angular/public assets, and a packaging boundary test guards this.

### Visual findings

The contact fixture gains visible grounding, and some terrain creases/forest contacts
become more defined. This does not justify applying the same approximation everywhere.

| Gate | Observed evidence | Decision |
| --- | --- | --- |
| Background protection | Coast overview: nonneutral blurred AO on 1,632 of 101,288 background texels | Fail: stock box blur crosses silhouettes |
| Water protection | Coast overview: nonneutral AO on 7,992 of 8,012 water-mask texels; close view 5,442 of 29,542 | Fail: post-composition multiply changes water/foam/reflection energy |
| Faded grass | All 30,591 grass tufts beyond the 55-unit fade; minimum root distance 183.4. Omitting grass changes 566 normal pixels | Fail: override ignores actual vertex clipping/Bayer cutout |
| Ambient-only shading | Paired contact images change with hemisphere/ambient light explicitly zero | Fail: direct lighting is multiplied too |
| Active LOD | Current layer0 near/far meshes rendered; all layer1 shadow sources excluded; motion crosses levels | Pass |
| Neutral state/data | All 16 paired base views return byte-exact pixels after disabling; full normalized Core/canonical source hashes and cameras unchanged | Pass |

Counts above refer to the 400x300 AO grid and labelled geometric water/background
masks, not counts of full-resolution final image pixels. Hidden water is excluded
from diagnostic masks, including the independent contact fixture. The water plane
and sky were hidden during normal override; hiding them alone cannot fix final-color
multiplication. The stock 5x5 blur has neither depth nor normal edge rejection.
Near/far geometry and canonical instance data are retained, but stock normals omit
terrain microdetail and grass material behavior. Motion/low-sun/night/snow/Bloom
captures are retained without claiming temporal stability from still images alone.

### Resource evidence

Actual GL allocation formats are RGBA16F normals/raw/blur, DEPTH24_STENCIL8 depth,
and4x4 R32F noise, all single-sample. At 800x600 output the 400x300 AO grid uses 3,360,064
attachment/noise bytes per view. The frozen ceiling is 7,340,096 bytes/view,
14,680,192 for two; diagnostic masks/readback scratch and driver overhead are excluded.
Two 480x400 views use 1,344,064 bytes each. Resize to 390x560 yields 195x280 AO and 1,528,864
bytes. Three candidate color targets plus sampled depth and noise release correctly;
no candidate GL texture handles remain after disposal.

Observed additional draws range 4..23 across the base matrix; the structural ceiling
remains 35 (up to 32 opaque normal batches plus AO/blur/multiply). Geometry submission
and depth rendering are additional work even where the visible benefit is small.
Render-target/override/clear/visibility state restores after an injected exception
inside the stock normal override. Mutable targets are independent between views.

### Hardware evidence and limits

Chromium 153.0.8010.52 used ANGLE Vulkan SwiftShader (Subzero), not a physical GPU.
The timer-query extension is present but does not make software timing hardware
performance evidence. The 2 ms/4 ms hardware gate stays UNRESOLVED, with null GPU
samples/timings. CPU submission diagnostics include software-driver/compiler behavior
and are not completion time or FPS. No controlled performance campaign was run.

The report records the actual dirty source revision (including the prior Bloom work),
policy/bundle hashes, exact requests, matching Core build identities, Local/Remote
result hashes, actual cameras and per-view resources. This is reproducible correctness
and visual assessment, not a verified architecture-performance claim.

### Requirements for reconsideration

A future candidate needs material-compatible normal/depth output for grass cutout and
all visible LODs, a depth/normal-aware denoiser with background rejection, ambient-only
integration before fog/water/bloom, and a physical-device GPU campaign within a newly
approved budget. Evaluate this as a separate policy; do not retune the rejected
candidate after these results. Core AO, lighting redesign and adaptive quality were
not introduced. Next implementation track is detailed generation-stage timing,
followed by progress and cancellation.

Reproduce against a local matching production API using the documented PWG_* browser
overrides: `node tests/browser/ssao-assessment.cjs`. Raw evidence is ignored under
`artifacts/ssao-*`; the assessment bundle/HTML are never written to public assets.
No SSAO production rendering changed, so no SSAO-specific PWA update is required.
The preceding Bloom publication/PWA verification remains the production baseline.


Verification: the complete assessment passes its reproducibility/resource/state checks,
while correctly rejecting the critical visual gates. All eight Local/Remote full
result/simulation hashes and Core build identities match. All candidate texture
handles are released; injected normal-override failure restores target, clear mode,
visibility and override state. The repository retains399 passing Angular tests,
13 packaging/asset checks (including the new rejected-candidate boundary) and worker
RPC. No production rendering or native code changed for this assessment, so production
publication/native suites/PWA were not repeated. The prior Bloom build/PWA evidence
remains applicable. No commit is made by this implementation step.
