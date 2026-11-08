# Night sky and foam v1

Presentation correction on top of Sun controls v1; Core and all mathematical
identities stay unchanged. Keep the preceding uncommitted Sun work.

Foam previously contributed constant pale RGB as emission. It now multiplies that
albedo by actual linear sky/fill illumination, plus bounded direct-sun influence.
Reference sky/sun colors and intensities come from DAYLIGHT_REFERENCE; at default
noon both normalized contributions equal one, preserving the daytime appearance.
At night the low fill intensity AND dark blue sky color reduce foam to a dim blue
shoreline. Zero fill and zero sun produce zero foam emission. Foam coverage/depth,
normal animation and geometry are unchanged. Reference atmosphere-off mode also
uses the corrected illumination; disabling fog must not restore glowing foam.

The shared sky-radiance function adds an illustrative full moon opposite the sun,
using the same existing direction and time state. Visibility=(1-daylight) times
smoothstep(0,.08,moonDirection.y). Moon color is authored sRGB #c8d8f4 and converted
once to linear in a viewport-owned uniform. Disk threshold cos(angle)=.99995
(about .57-degree radius), derivative-softened edge; radiance .8 times color and a
small .012*exp(-(1-dot)*350) halo. No monthly phase/calendar model or extra clock.
The same radiance appears in sky reflection and directional fog. It introduces no
texture, mesh, light, shadow or render pass; existing night Hemisphere fill stays.
This is a visible moon, not a new shadow-casting lunar light or calibrated astronomy.
Sky bodies require a sky-facing camera; the initial map view looks downward.
Atmosphere-off reference mode intentionally retains its flat background.

Check real GPU night foam pixels against noon with fixed camera/waves, and inspect
the moon at night/day with the shared sky function. Test dark/zero illumination,
shared moon binding, no daylight moon, finite shader output, sun UI and offline/PWA.
Document evidence, keep README empty and do not commit until requested.


## Verification

338 Angular tests, nine packaging/asset checks, worker RPC and production publish
pass. The Sun UI browser regression passes, including both views, operation guards,
shadow reuse, offline first interaction and reset. All 18 fixed-camera/full Core
hashes/default noon PNGs remain exact. The focused Chromium pixel probe observes
foam-positive RGB differences of 393673 at noon, 24779 at night and 998 under zero
water-light uniforms; this is an image regression metric, not a physical brightness
or performance measurement. Small zero-light differences come from coverage/fog
composition, not foam emission. The night moon center luminance is .775 versus .130
background; the noon center/background both measure .712 (no moon disk). Sky-facing
night/day images were inspected. Offline new-seed generation passes without errors.
Evidence is under ignored artifacts/night-*. No native source/workload changes.

Night correction PWA regression also passes: cached reload/new tabs/new seeds,
Remote recovery, deferred update while busy and updated-version offline 3D terrain.
Generated deployment assets were restored afterwards.
