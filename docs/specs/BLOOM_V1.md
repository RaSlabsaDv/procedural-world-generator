# Bloom v1

Policy frozen before production implementation. Visual Stage 6B; presentation only.

## Linear extraction and composition

Reuse color-finishing-v1's linear RGBA16F scene after opaque/transparent composition.
Extract UNEXPOSED Rec.709 luminance L=dot(max(rgb,0),(.2126,.7152,.0722)). Threshold
T=1.25, knee K=.25. Let s=clamp(L-T+K,0,2*K), e=max(L-T,s*s/(4*K)); output
max(rgb,0)*e/max(L,.00001). All inputs with L<=1 produce zero, including black.
No sRGB conversion, exposure or tone mapping occurs in extraction/blur.

Each reduced pixel averages extraction from a4x4 source grid at source-texel offsets
{-1.5,-.5,.5,1.5}². Extract each sample before averaging, preserving bright peaks.
Clamp sample UV to source texel centers. Downsample to floor(HDR dimensions/4),
minimum1, capped65536 pixels with proportional reduction and bounded thin-aspect
rounding. Never upscale relative to the source. No mipmaps, wrapping or depth.

Blur horizontally then vertically with normalized separable binomial9-tap weights:
[1,8,28,56,70,56,28,8,1]/256. Offsets use reduced-target texels. Clamp UV to texel
centers; edges extend rather than wrapping. Same kernel at any resolution; constant
brightness is preserved. Halo radius is at most4 reduced texels per axis, with
bilinear upsampling. Pixel-space radius is an explicit limitation, not world-space
light scattering or a temporal filter.

The existing final pass samples the blurred texture and adds .12*bloom to the linear
scene BEFORE exposure/ACES (including the existing shadow toe), grading, vignette
and one output encoding. Both scene and halo receive exposure exactly once. Changing
exposure does not change extraction eligibility. No mask based on ecological IDs.

## Disabled path, settings and resources

One independent Bloom checkbox in shared Appearance settings; default/reset off.
No additional artistic controls, dependencies, assets or animation loop. Exact legacy
Reference requires exposure1 and ALL THREE effects off. Reference with bloom uses
HDR composition and omits ACES, not the exact legacy path.

Bloom-off compiles out the extra sample and executes the original final shader math.
No bloom targets, materials or passes remain after disabling. Retain the existing HDR
scene target when other finishing is active. Reuse its fullscreen geometry; bloom
owns two materials and two single-sample RGBA16F targets, without depth/stencil/MSAA.
Three extra fullscreen calls: extraction→A, horizontal A→B, vertical B→A. The final
pass composites A without feedback. Maximum extra storage2*65536*8=1048576 bytes/view,
2097152 for two. Maximum whole-scene color calls38, shadow19; bloom-off stays35/19,
neutral direct Reference34/19. Texture/framebuffer/program overhead is additional.

Independent views own mutable targets/uniforms. Resize replaces attachments through
Three ownership. Disable/replacement/failure/destruction release resources exactly
once. Restore renderer target even on failure. Unsupported HDR retains the existing
visible Reference fallback. Incomplete bloom attachments fall back to finishing
without bloom with an explicit warning, retaining terrain and numeric results.

## Timing and verification

Allocate/update/resize/draw only behind existing OperationLock; resume latest shared
settings after waits. Bloom must not regenerate terrain, alter canonical instance
buffers or refresh static shadows. Initial display CPU preparation/submission includes
bloom; later toggles do not rewrite it. Work stays outside computeMs/requestMs.

Freeze camera and LOD history, seed, sun/atmosphere and waves for before/after checks.
Bloom-off must retain Stage6A camera/Core hashes and PNG bytes. Verify actual GPU
extraction/normalized halos/zero and subthreshold output, exposure/output encoding,
formats/dimensions/pass counts, no feedback, one/two views, cleanup/failure/pause,
snow/coast/noon/low/night/moon, maximum/narrow/offline and PWA update last. Resource
accounting is not a memory profiler or FPS finding. SSAO remains a separate assessment.
