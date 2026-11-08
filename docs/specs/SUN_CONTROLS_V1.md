# Sun controls v1

Status: implemented; interaction policy frozen before implementation. Presentation revision sun-controls-v1.
Visual Stage 3A exposes scene-environment-v1 without changing its equations or Core.

## Interaction

Collapsed Sun panel beside Water/Atmosphere. Time slider 0..24 hours, step .25, shows
HH:mm including24:00. Direction slider 0..359 degrees, step 1, shows degrees and an
eight-point compass label (N,NE,E,SE,S,SW,W,NW; nearest 45 degrees). Azimuth0 points
world+Z/N and90 points+X/E. Defaults 12:00/315 degrees NW; Reset sun restores only
those fields. visualTimeSeconds, water and atmosphere settings stay unchanged.
No clock, playback, persistence, presets, latitude/date or astronomical claims.

Validate finite slider values and exact step/range before mutation. Service-level
validation remains authoritative for complete environment snapshots. Missing,
empty, malformed or off-step UI input preserves the last valid state. Associate
labels/outputs with inputs and show concise validation feedback. Fieldset disabled
under OperationLock; handlers check the lock synchronously, including Reset.

Sun controls load on first opening outside OperationLock via Angular defer.
Opening during an operation defers the import until unlock. This keeps
Three/environment derivation out of the initial editor bundle until a graphics
feature is requested. No additional store/clock or renderer dependency is added.
SceneEnvironmentService remains the one shared immutable source of sun state.

## Rendering and shadows

Use the existing afterRenderEffect update path: Angular coalesces synchronous
snapshot changes and previews apply the latest state only outside OperationLock.
No timer, RAF loop, global listener or debounce delay is added for sun controls.
Both independent views update light/fill, analytical sky, fog, water reflection and
highlights from existing stable wrappers. Preserve all geometry/material/texture,
camera/controls and first-display measurements. No generation or worker/HTTP calls.

Directional-light direction changes retain the current fit to terrain and actual
instance bounds. Refit and invalidate the single 2048 shadow map only if an active
shadow direction changes or shadow activation changes. Color/intensity-only and
visual-time-only changes reuse it unless activation changes. Night direction changes
still update the light transform, but need no shadow-camera fit or shadow pass.
Day/night/day transitions must recover without replacing attachments or resources.
Water/atmosphere-only settings retain static reuse; reference atmosphere-off mode
still responds to the shared light cycle. Pending programmatic snapshots under a
lock apply latest-only after release; disabled UI events do not queue edits.

## Acceptance and scope

Unit tests cover formatting, UI validation/reset/preservation, shared independent
views, latest-state deferral and shadow activation/refit rules. Production Chromium
covers actual UI noon/dawn/sunset/night and multiple directions, frozen camera/phase,
water, atmosphere off/on, comparison views, rapid edits/reset, no generation/uploads,
resource stability, operation pause, narrow/offline and PWA updates. Inspect actual
images for clipping, acne/detached shadows, darkness and transitions. Compare full
Core hashes for identical inputs; preserve default noon pixels and mathematical
identities. Software WebGL is correctness evidence, not a performance result.

Budgets stay atmosphere-v1: color ceiling 21, caster ceiling 19, one 2048 shadow map,
existing textures and no new graphics allocation. Sun updates are presentation work
outside computeMs/requestMs; first submission is not GPU completion. The illustrative
night can be dark, and low sun stretches fitted-map shadows; shadow quality is a
separate Stage 3B assessment. No CSM, AO, quality control, new asset or dependency.
Docs/UI stay English, README empty; do not commit until requested.


## Verification

338 Angular tests, nine packaging/asset checks, worker RPC and production publication
pass. The six-case/18-view Sun atlas retains exact full Core hashes, camera matrices
and default noon PNG bytes against the preceding atmosphere publication. Real
Chromium verifies UI hours 6.25/9/17.75/0/24/12, multiple azimuths, exact reset pixels,
shared view uniforms, zero generation requests and unchanged geometry uploads.
Twenty synchronous direction edits coalesce into one shadow update per view.
Shadow attachments survive night/day and unrelated appearance edits reuse shadows.

Operation tests include synchronous synthetic input (restores the old slider thumb
and value), no draw/shadow passes while busy, and first panel opening held behind
a blocked Remote request until unlock. Offline reload/new-seed generation and first
Sun interaction, narrow layout, material ownership and lighting/editor regressions
pass. The lazy code split yields 40 catalog assets without new texture/dependency;
Three stays deferred. Existing darkness near dawn/night and stretched low-sun
shadows remain illustrative-model/quality limitations for Stage 3B. No controlled
performance result or native algorithm change is claimed. Raw ignored evidence is
under artifacts/sun-*; README stays empty.

Production PWA regression passes: offline reload/new tabs and new seeds, Remote
failure/recovery, deferred update while busy and updated-version offline 3D terrain.
Generated deployment assets were restored after the update simulation.
