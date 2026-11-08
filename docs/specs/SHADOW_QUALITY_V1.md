# Shadow quality assessment v1

Status: policy frozen after baseline/probe inspection; production parameters retained.
Visual Stage 3B is an assessment with regression coverage, not a new shadow renderer.

## Evidence and decision

Seven production scenes cover mountains/valleys, forest, rocks, coast, flat, minimum
and 512-square terrain. The standard map is rectangular129x97. Noon315 degrees and
low sun at07:00 with 225/135-degree azimuths are captured at overview/close scales:
42 views. Additional forest/maximum contact views at greater zoom add12 views.
Waves use reduced-motion phase0; actual camera matrices, complete request/result
hashes, tree/rock counts, GPU shadow matrix/bias/radius and attachment formats are
recorded under ignored artifacts/shadow-quality-* and shadow-contact-*.

No obvious boundary clipping was observed in these views. Small tree contacts and
near-ground shadows lose detail on the maximum map. Measured noon depth range is
about492.46 world units and the largest shadow texel spans .36592 world units there;
constant bias -.0005 corresponds to .24623 world units. Forest 129x97 has a .08071-unit
texel and .06131-unit depth bias. Narrow trunks can be smaller than one shadow texel.
Low-poly silhouettes, diffuse shading and texture detail must not be mislabeled
as shadow defects; the far close-view resolution limit remains.

A test-only GPU probe replaced terrain receiver bias with
-min(.08,max(.002,.35*texelWorld))/depthRange, retaining normalBias .08 and filtering.
Forest contact changes were modest. On 512-square terrain it introduced conspicuous
periodic self-shadow acne at noon and low sun. The failed probe did not modify
production source and is retained as diagnostic evidence, not an accepted fix.
No safe uniform bias correction across the inspected scales was demonstrated.
Therefore keep production parameters and default appearance unchanged. Do not
trade broad surface striping for a small contact improvement.

## Retained policy and source verification

One 2048-square directional PCF map; bias -.0005 in normalized comparison depth,
normalBias .08 in world units and radius 1. Fit the documented request terrain box
plus complete actual transformed instanced geometry. Padding=max(.025*span,.1),
near=max(.01,-lightBounds.max.z-padding), far=max(near+.1,-lightBounds.min.z+padding).
Do not tighten to observed sample heights or discard edge/tall instances.

The installed Three 187 PCF shader uses a hardware-linear sampler2DShadow with five
Vogel-disk samples (effectively 20 filtered taps), rotated by interleaved gradient
noise; shadowRadius scales offsets in texels. Thus radius affects this version's
PCF implementation. PCFSoftShadowMap is removed/redirected to PCF in this installation;
no filter substitution or assumed soft-radius behavior is introduced. Evidence:
node_modules/three/src/renderers/shaders/ShaderChunk/shadowmap_pars_fragment.glsl.js
and renderers/webgl/WebGLShadowMap.js. Normal bias offsets the receiver world point
along its transformed normal before directional-shadow projection.

Keep existing active-direction/activation invalidation, inactive-night skip, static
reuse, latest-state OperationLock deferral and independent-view disposal. Sun,
Moon, foam, atmosphere, camera and all Core identities/results remain unchanged.
Color ceiling 21 and caster ceiling 19; unchanged RGBA8+DEPTH_COMPONENT24 attachments,
32 MiB/view estimated storage, no target/pass/light/texture/dependency added.

## Acceptance and remaining limitations

Expanded tests cover full request-box corners plus rotated/scaled edge instances,
including tall geometry, shifted mesh transforms, dimensions 2/3/512, height 0/1/1000
and near-horizontal sun at 6.01/17.99 hours across multiple azimuths. Points must lie
inside finite light clip bounds with valid positive near/far. Existing unit/browser
lifecycle, operation pause, night/day recovery, compare ownership and cleanup remain.
After publication, pair all 54 accepted views against the baseline: exact request,
Core hashes, actual cameras, GPU shadow policy and PNG hashes are required because
production rendering is deliberately unchanged. Keep the rejected probe separate.
Run relevant tests/builds, Sun/night/materials/lighting/editor regressions as needed,
offline and PWA-update verification; PWA last. Native sources are unchanged.

No CSM/AO/SSAO, larger map, cascades, additional shadow caster/receiver or water
shadow behavior is added. CSM could address close-view spatial resolution at extra
resource cost; contact AO targets a different shading problem and does not recover
thin directional shadows. Either needs a separate policy/budget and acceptance
before implementation. This assessment authorizes neither. Next planned visual
stage remains terrain material microdetail. No performance claim. README empty.


Shadow assessment verification: 342 Angular tests, nine packaging/asset checks,
worker RPC and production publication pass. Both accepted atlases pass with exact
54 PNG hashes, GPU shadow values, request/full Core hashes and camera matrices
(42 standard views plus 12 contact views). Sun UI and night pixel/offline regressions
pass, preserving independent views, operation pause, shadow-target reuse, Moon
visibility and non-emissive foam. No runtime rendering parameter was changed.
The rejected probe is isolated in shadow-contact-probe-*; accepted evidence and
summary are under ignored artifacts/shadow-quality-*/shadow-contact-*.

Shadow assessment PWA regression passes: cached reload/new tabs and new seeds,
Remote recovery, deferred update while busy and updated-version offline 3D terrain.
Generated deployment assets were restored after the update simulation.
