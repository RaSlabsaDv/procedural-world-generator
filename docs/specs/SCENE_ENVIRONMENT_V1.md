# Shared scene environment v1

Status: implemented and verified; contract frozen before implementation. Presentation revision scene-environment-v1.
No Core, transport, workload, camera, asset or render-pass changes. The existing
sun/shadow rendering policy daylight-shadow-v1 remains the default reference.

## Settings and derivation

One app-scoped Angular service publishes immutable snapshots. Required settings:
timeOfDayHours in [0,24], sunAzimuthDegrees in [0,360), visualTimeSeconds in
[0,86400]. Reject unknown/missing keys, nonfinite/out-of-range values atomically.
Defaults are 12,315,0. This is an illustrative light cycle, not astronomy or climate.
X/Z are the horizontal world axes and +Y is up. Azimuth0 points +Z,90 points +X;
sun direction points from the scene toward the sun. Hours0/24 have identical light.
Visual seconds are an explicit frozen phase for future animations, never wall time.

Let h=sin(pi*(hour-6)/12), except hours<=6 or>=18 use daylight d=0; otherwise
 d=max(0,h). Daylight strength a=smooth(0,.35,d); color weight b=smooth(0,1,d),
where smooth clamps u=(x-lo)/(hi-lo), then u*u*(3-2*u).
Direction=normalize(sqrt(2)*sin(azimuth),2*h,sqrt(2)*cos(azimuth)). Special-case
hour12/azimuth315 to the original normalize(-1,2,1), preserving exact default
floating-point values and shadow matrices. No zero vector exists. Noon has
54.7356-degree elevation; there is no latitude/date model.

Author colors as sRGB hex, convert using the installed Three.Color linear working
space once per derivation. Interpolate in linear RGB, returning the exact endpoint
at weight0/1 rather than introducing cancellation rounding at the default.
Sun color interpolates #ffb774 to #fff4df with b; intensity=2.35*a.
Hemisphere sky interpolates #16253b to #dde8f1 with a, ground stays #81775e;
fill intensity=1.05*(.15+.85*a), using exact1.05 at a=1.
Horizon blends #d8ab8e to #bcc9ce with b, then #101a2b to that daylight color with a.
Linear fog and background share this horizon color. Fog remains near2.2*span,
far7*span, with span=max(width-1,height-1,heightMultiplier,1).
No scattering, height fog, exponential fog or sky geometry is implemented here.

Snapshots contain frozen primitive settings, normalized direction/linear-color
triples, sun intensity, hemisphere state and linear-fog parameters. No shared mutable
Color/Vector3/light/uniform object lives in settings or global defaults. Identical
settings can retain the previous service snapshot; invalid updates keep it intact.

## View ownership and bindings

Each lighting owner creates one stable logical uniform block: world sun direction,
linear sun color/intensity, hemisphere sky/ground/fill, horizon color, scaled fog
near/far, time-of-day and visual seconds. These are ordinary Three uniform wrappers,
not a physical GPU UBO or a new shader/render framework. Existing lights/fog consume
the same view-owned Color values. Future water/sky shaders may bind these wrappers
without guessing another sun direction or copying independent state.

TerrainScene exposes environment application and uniform bindings. TerrainPreview
reads the shared service separately from terrain replacement; environment changes
update live lighting and render on demand without rebuilding geometry/materials,
resetting camera or issuing another display-measurement result. Each comparison
view receives the same snapshot while retaining distinct resources, including
scaled fog ranges when request dimensions differ. Default imagery must stay exact.

Updates while paused/OperationLock busy are deferred; resume applies the latest
snapshot before drawing. Delayed texture/scene setup reads the latest snapshot.
No automatic ticking, requestAnimationFrame loop, worker message or Core call is
introduced. A held operation cannot mutate live scene bindings through this path.

Direction changes refit the existing shadow camera from cached scene bounds and
mark shadows dirty; entering/leaving an active sun also invalidates. Color, fill,
fog and frozen-time-only changes reuse the depth map. Night disables the sun caster
when intensity is zero, retaining the target for daylight recovery. Initial default
setup keeps the original light position, matrices, target size/bias and one update.
Dispose is idempotent, restores prior scene references and releases owned shadows.
Late updates after disposal do nothing; Angular owns/cleans reactive subscriptions.

## Verification

Pure tests cover exact defaults, axes, normalization, bounds, dawn/noon/dusk/night,
continuity, linear colors, deep immutability and atomic validation. Lighting tests
cover state application, stable wrappers, default matrices, shadow dirtiness versus
reuse, nighttime recovery, two-view isolation and disposal. Preview tests cover
no rebuild, deferred/latest updates, replacements and unchanged measurement count.

Capture atlas-materials.cjs --environment --before against the prior publication,
then --environment after: six fixed requests at three zooms compare exact camera,
PNG image bytes and complete numerical hashes. Run Angular, production publication,
packaging and relevant lighting/material/compare/PWA browser regressions. No native
math changes require new numerical baselines or native test reruns. Frozen visual
time and colors are not new benchmark inputs; future interactive presentation
controls must record their settings for reproducible visual/performance campaigns.


## Recorded verification

All 313 Angular tests pass, including default legacy endpoints, independent sRGB
transfer references (within1e-10 for the installed conversion constants), cardinal
axes, sunrise/sunset continuity, midnight equivalence, invalid atomic updates, deep
immutability, shadow reuse/refit, view isolation and deferred/latest preview updates.
Live color/fill/fog bindings and visual-time-only updates reuse the depth map; no
extra display measurement is emitted and terrain replacement retains environment.

Production publication and seven packaging/documentation/asset checks pass. The
optional WASM optimization notice remains. Eighteen paired Chromium153 views match
exact PNG bytes, actual camera matrices and full mathematical result hashes. This
is stronger than a visual-only default comparison; no changed reference image or
Core fixture was accepted to accommodate the refactor.

Actual lighting, material/compare ownership, editor and PWA browser checks pass
without page errors: static shadow reuse, paused computation, maximum dimensions,
independent view destruction, narrow layout, offline reload/new tabs with fresh
seeds, Remote failure/recovery and deferred safe updates remain correct. Existing
five textures, shadow targets and draw/instance ceilings are unchanged.

Nondefault states are exercised by unit/integration tests on real Three objects
with renderer mocks; there is deliberately no production sun-control UI in this
foundation. Future water/sky controls need their own real-browser visual acceptance.
Core/hosts and numerical identities are unchanged, so native suites were not rerun.
No controlled performance campaign was run. README stays empty. Raw ignored
evidence uses artifacts/scene-environment-*.
