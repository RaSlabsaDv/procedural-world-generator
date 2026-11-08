# Atmosphere v1

Status: implemented; policy frozen before implementation. Presentation revision atmosphere-v1.
Core, mathematical identities, cameras, texture assets and shadow policy stay unchanged.

## State and budget

Shared immutable settings: enabled=true, haze=.22 in [0,1], valleyFog=.18 in [0,1].
Reject missing/unknown fields, nonboolean enabled and nonfinite/out-of-range numbers
atomically. One collapsed Atmosphere panel updates both views without generation.
OperationLock defers application and rendering. Reset restores defaults. No clock,
sun controls or recurring sky loop. Sun state comes from scene-environment-v1.

Per viewport: one 3-vertex fullscreen triangle (36 raw position bytes), one material,
stable ordinary uniform wrappers. Color ceiling 21 (existing20 plus sky); caster
ceiling 19 and existing textures/shadow attachments stay unchanged. No render target,
asset, depth pass or full-map buffer. Reference mode hides the sky and restores the
existing background/linear fog and water horizon reflection. No geometry rebuild.

## Sky approximation

One shared GLSL skyRadiance(world direction) is used by the background, atmospheric
in-scattering and water reflection. Directions are normalized with guarded lengths.
A compact illustrative Rayleigh/Mie-inspired model combines blue zenith, warm horizon,
Rayleigh angular weight .75*(1+mu²), bounded forward Mie scattering (g=.65), and a
small soft sun disc. The existing shared sun and hemisphere colors drive daylight,
with the same below-horizon transition; no independent lighting model or astronomy.
Document exact shader coefficients in source. This is not calibrated physical
scattering, aerial multiple scattering or a volumetric cloud model. Below-horizon
sky approaches the horizon rather than mirroring a second sun.

## Optical depth

World +Y is up; span=max(width-1,height-1,heightMultiplier,1). Height origin is the
actual sea plane (or zero without Ocean). Falloff=8/span. Distance density=.12*haze/span;
height density=.7*valleyFog/span, multiplied by .35+.65*(1-daylight) for stronger
low-sun haze. For a ray segment length L, endpoint relative heights h0,h1, integrate
rho(y)=rho0*exp(-falloff*(y-origin)) analytically. Bound exponents to [-20,20].
Use endpoint exponents a,b: average density factor is
(exp(max(a,b)) * (1-exp(-abs(a-b))) / abs(a-b)); for |a-b|<.001 use
exp((a+b)/2)*(1+(a-b)²/24). Clamp total optical depth to [0,20], T=exp(-tau).
The clamp bounds below-origin density and avoids overflow; zero-length rays return0.
Distance and height optical depths add once before attenuation. GLSL and a small
CPU reference use the same documented equation for numerical-limit tests.

Lit linear color becomes T*color+(1-T)*skyRadiance(view direction), before tone/output
conversion. Terrain, instanced trunks/crowns, rocks and water share one function.
Reference mode retains the previous shader ordering exactly. Fog does not turn
missing terrain into an infinite land surface; map edges can remain visible.

## Transparent water

No atmospheric refraction or underwater-camera support. For camera above sea,
underwater Ocean terrain clips its air segment at the sea-plane intersection.
Use the existing biome vertex attribute (interpolated Ocean membership >0) only;
no new ecological classification/buffer. Water uses that same camera-to-plane air
segment. Straight-alpha composition then applies one common air attenuation to
both components, rather than fogging the transmitted bottom through air twice.
The algebra is exact in linear color before tone/output conversion; existing
output-space transparent blending is an approximation without an offscreen linear
compositing target. Below-water cameras use the ordinary bounded fog fallback.
Conservative diagonal water omissions and low-poly coast transitions remain limits.

## Ownership and acceptance

Patch existing Lambert onBeforeCompile hooks compositionally, including instanced
world transforms, and use distinct program keys. Native fog is bypassed only in
enabled mode; no duplicate fog or tone mapping. Sky shares environment uniforms,
updates camera inverse projection/world matrices before draw, writes no depth and
casts no shadow. All owners dispose safely on replacement/failure/destruction.
Atmosphere-only settings do not invalidate the static shadow map.

Test finite/nonnegative optical depth, horizontal/near-horizontal/short and deep
rays, monotonic attenuation, shared sky/water bindings, reference restoration,
view isolation, deferred operation updates and cleanup. Real Chromium must compile
all material groups and cover fixed-camera scenes, nondefault sun via test-only
instrumentation, min/rectangular/max sizes, no/all Ocean, zero height, two views,
narrow layout, cached offline generation and PWA updates. Verify full Core hashes
and exact reference camera/image restoration. Freeze wave phase for comparisons.
Record actual budgets and limitations. Setup/display is outside computeMs/requestMs;
first submission is not GPU completion. README stays empty; no performance claims.


## Verification

333 Angular tests, nine packaging/asset checks, worker RPC and production publish
pass. Real Chromium atmosphere/materials/lighting/editor checks pass. Eighteen full
Core/camera comparisons remain exact; all 18 frozen reference PNGs are byte-exact
against the preceding Ocean publication. Controls cause no generation, buffer upload
or program replacement. Shared phases/operation locking and static shadow reuse
remain verified. Tests cover 512-square/min/rectangular maps, all/no Ocean, zero
height, offline new seeds and narrow layout. Sun fixtures use the real environment
derivation at 6.2/17.8/0 via isolated test-only source substitution; no modified
bundle enters the PWA cache. The sky position buffer is 36 bytes; actual draw checks
retain color ceiling 21 and caster ceiling 19, with no new target/texture. Native
sources and Core identities remain unchanged. Evidence is under ignored artifacts/.
Software WebGL establishes correctness, not controlled performance findings.

The materials matrix observed up to 19 color calls including exactly one sky draw;
the structural ceiling is 21 when every terrain/tree/rock/water group is present.
Existing 2048-square shadow attachments remain 32 MiB per view (format-based
estimate), with one static update per unchanged scene.

Production PWA regression also passes: cached reload/new tabs and new seeds, Remote
failure/recovery, deferred update while busy, and updated-version offline 3D terrain.
Deployment assets were restored after the update simulation.
