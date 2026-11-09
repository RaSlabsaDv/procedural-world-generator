# Color finishing v1

Policy frozen before production implementation. Visual Stage6A; presentation only.

## Pipeline and reference

The preceding renderer uses NoToneMapping, exposure1 and sRGB output. Palette
integers convert to linear once. Lambert, sky and water include output encoding;
water alpha currently blends encoded values on the default framebuffer. Per-material
nonlinear finishing would therefore not preserve correct compositing.

Use one optional linear-sRGB RGBA16F scene target with depth, followed by one opaque
fullscreen triangle. Keep renderer NoToneMapping and exposure1 for scene rendering.
Three's render-target program variants output working-linear RGB, so terrain,
vegetation, water and sky blend before nonlinear finishing. The final shader alone
performs exposure, ACES (when selected), grading, vignette, then sRGB output encoding.
Reuse the installed Three ACESFilmicToneMapping implementation, including its1/.6
viewing adjustment, with a renamed private exposure uniform to avoid renderer writes.

Final policy after visual assessment: ACES with shadow-toe protection, exposure1,
grading off, vignette off. Pure Three ACES clips the existing dim night fill to black.
For exposed linear luminance L, use mix(exposed, ACES(input), smoothstep(.002,.025,L)).
Both terms apply exposure once; ACES retains its documented1/.6 adjustment. This
adds no light: zero stays zero, very dark inputs preserve the linear response and
lit colors use unchanged Three ACES. This refinement preserves night detail without
retinting palettes or altering shared lighting. Exposure is finite in.25..2,
step.05 in UI. Grading when enabled: Rec.709 saturation.98, then contrast1.02 around
linear.18; clamp negatives. Vignette multiplies linear RGB by
1-.10*smoothstep(.35,1,r), where r=length((uv-.5)*vec2(aspect,1)) /
(.5*sqrt(aspect*aspect+1)). No warmth/palette retint, LUT or automatic exposure.

Reference + exposure1 + both toggles off bypasses the target/final pass entirely,
retaining the exact preceding renderer, antialiasing, transparent blend and fog order.
Reference with nonneutral effects uses the linear target but omits ACES, so it is
not the legacy pixel reference. State this explicitly in the controls. Atmosphere-off
reference fog retains the installed Three ordering; in the HDR path its output is
linear before final finishing. No custom material equations or Core results change.

## Resources and ownership

Allocate only while finishing is active. Target dimensions preserve drawing-buffer
aspect, are never upscaled and are capped at1048576 pixels/view plus actual texture/
renderbuffer limits. Four-sample MSAA is used only when RGBA16F reports support for4;
otherwise single-sample. No mipmaps. Resolve depth is disabled; no sampled depth
texture, auxiliary normal target or composer. Maximum conservative target storage:
RGBA16F8 + depth4 + MSAA color32/depth16 =60 bytes/pixel (60 MiB/view,120 MiB for two).
Without MSAA the target uses12 bytes/pixel. Driver overhead and default canvas/shadow
buffers are additional. One triangle, one sampler and one final color call/view;
whole-scene color ceiling35, shadow ceiling19. No Core/grass/tree buffer change.

Exposure/toggle edits update stable uniforms. Neutral Reference disposes target and
fullscreen geometry/material; active resize replaces target attachments through
Three ownership. Independent views own resources. Restore render targets even on
failure; release partially allocated resources. If float-color rendering is unsupported
or framebuffer allocation is incomplete, show Reference with a visible warning rather
than losing the terrain. Never silently claim active ACES in this fallback.

## Lifecycle and verification

Use one immutable Angular settings snapshot for both views, in a collapsed Appearance
section with tone mode, exposure, independent grading/vignette and Reset. Controls
and settings modules do not import Three; preserve the lazy visualization boundary.

Apply/allocate/resize/render only behind OperationLock. Resume latest settings without
rebuilding terrain, instance buffers or static shadows. Initial finishing setup enters
display CPU preparation/submission, outside computeMs/requestMs. Later edits do not
rewrite that first display metric. Submission is not GPU completion or FPS evidence.

Pair fixed seeds/camera poses/LOD histories/time/wave phase before/after, including
snow, mixed forest, coast, noon/low/night and close/overview. Neutral Reference must
be byte-exact. Verify actual GPU final output against independent color fixtures,
single output encoding/exposure, HDR compositing, passes/formats/MSAA/limits, resize,
cleanup/failure, shared settings, paused work, narrow and offline/PWA behavior.
No bloom, SSAO, new dependency/asset, Core/workload change or performance claim.
