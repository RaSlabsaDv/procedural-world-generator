# Implementation plan

## Current foundation

The supported product is **Rich terrain + hydraulic erosion** with a Three.js preview. Local C# WebAssembly runs in a dedicated worker; Remote runs the same C# library through ASP.NET Core. Controls, strict validation, full-array equivalence checks, separate timings, transactional WASM publishing and production PWA/offline behavior are implemented.

Baseline/probe interfaces, the experimental regional generator, and all 2D views have been removed. Their browser scripts and feature-specific tests are removed with them. Noise, height contracts and validation remain as dependencies of the supported terrain generator. README stays empty; documentation stays in English.

## Terrain editor: implemented

The editor provides a large central Three.js viewport, grouped parameter sidebar, measurements sidebar and compact PWA header. Numeric/slider controls share values; Random seed and Reset affect drafts only. One result is shown by default, with explicit Local/Remote selection and comparison views. Captured labels distinguish previous results from draft edits. Generation/errors retain prior terrain; stale or destroyed-component responses are discarded without releasing the lock before real completion.

Same-scale preview updates preserve the camera and Reset camera restores default framing. Details expose captured parameters, versions, simulation totals and separate initialization/display timing. Full-result comparisons, worker ownership and safe PWA updates remain supported; generation now uses the v2 ecology contract below. Tests cover editor state transitions, camera lifecycle and responsive/offline browser behavior.

No new dependencies, presets, brushes, 2D views, simulation history or placeholder timeline controls were added. Bounded capture is a later extension; its player will occupy a bottom timeline after real frame data exists.

## Diverse terrain and vegetation

Current generation uses diverse-landscape-v2 with landscape-ecology-v2 results: regional plains/hills/mountain composition, explicit boundary-connected ocean, environment-based biomes, density and capped deterministic trees. Both hosts share Core; the editor adds four required controls. Two instanced meshes per viewport render every returned tree. Hydraulic-grid-v1 arithmetic and closed boundaries are unchanged. Historical v1 fixtures remain test-only evidence, not another public mode. See [LANDSCAPE_V2.md](LANDSCAPE_V2.md) for exact rules and limits.

## Organization and polishing: complete

Core is split into Contracts, Validation, Generation and Ecology, with separate composition, sea, biome and vegetation responsibilities. Angular separates platform, terrain data/editor/rendering and shared styles. Pure defaults no longer couple PWA readiness to Angular forms. Wire biome IDs and their palette are explicit and centralized. Decoder and comparison implementations are separate behind the contract entry point. A stale display-timing reset was corrected; updating one mode preserves the other mode's measurement.

Unused Angular routing and the duplicate hydraulic browser script were removed. The landscape, editor and PWA browser scenarios share setup/readiness helpers. Existing v2 mathematics, contracts, limits and workload identities remain the baseline; new biome behavior is not implemented in this cleanup.

## Next planning priority: climate and vegetation diversity

Specify the next version before implementing additional biome types or controls. Candidate scope is differentiated leaf/conifer forests, savanna, tundra and high-altitude snow, with global warmth, vegetation density and independent landform-region scale. Final rules, limits and output identity are still to be defined. Keep v2 as the reproducible comparison baseline until a replacement is explicitly specified.

## Later: evolution of the selected terrain

1. Specify bounded snapshot capture for the existing hydraulic model: initial state, interval frames, final state, no duplicate final frame, and overflow-safe storage budgets.
2. Add opt-in capture without changing generation arithmetic or final output. Preserve the current generation workload; give capture a separate version/workload and include copying in its Core time.
3. Extend shared host contracts and both execution paths together. Verify exact final identity with capture disabled and Local/Remote equivalence of every frame.
4. Add Three.js playback: play/pause, scrub, reset, speed and iteration labels. Reuse geometry and preserve camera; pause during measured work and dispose resources.
5. Verify memory bounds, zero steps, error handling, replacement and offline playback. Keep model iterations distinct from real-world days or years.

This extension is planned and is not part of the cleanup implementation.

## Later: improve the world model incrementally

Preserve the preferred terrain appearance. Develop diagnostic layers for slope/erosion and refine the illustrative environmental fields as separately versioned work. Add visible rivers/lakes only with an explicit water model and tests for supply, drainage and evaporation. A depression's spill level is a routing limit, not evidence that the depression is full of water. No new regional mode or 2D view is planned.

## Architecture Race and research campaign

Build a sequential runner with immutable inputs, alternating execution order, warm-up, raw trial retention, statistics and JSON/CSV export. Use `landscape-ecology-hydraulic-v2` and `landscape-worker-json-v2` as the primary generation workload; evaluate any future capture workload separately. Follow [BENCHMARKING.md](BENCHMARKING.md).

Run a controlled size/iteration/seed matrix under documented network profiles. Keep compute, initialization, request overhead and rendering separate. Report failures and environment limits; browser smoke checks are correctness evidence, not a performance campaign.
