# Implementation plan

## Current foundation

The supported product is **Rich terrain + hydraulic erosion** with a Three.js preview. Local C# WebAssembly runs in a dedicated worker; Remote runs the same C# library through ASP.NET Core. Controls, strict validation, full-array equivalence checks, separate timings, transactional WASM publishing and production PWA/offline behavior are implemented.

Baseline/probe interfaces, the experimental regional generator, and all 2D views have been removed. Their browser scripts and feature-specific tests are removed with them. Noise, height contracts and validation remain as dependencies of the supported terrain generator. README stays empty; documentation stays in English.

## Editor preparation and proposed layout

Preparation is implemented: typed parameter/default metadata and independent parameters, results and PWA panels. Existing generation and safe-update integration tests exercise the extracted components. The current UI still exposes the same generation actions and deferred 3D view; there are no new presets, brush tools, sliders or history controls yet.

The proposed editor uses a large central Three.js viewport, a left parameter panel, a right results/measurement panel, and a bottom timeline once capture is implemented. Group controls into terrain, erosion and advanced noise settings. Changing controls should update a draft; explicit Generate applies one immutable snapshot. Do not automatically start expensive simulation on every slider movement. Single-result display is the default design direction; comparison can open a second view on demand with identical camera scale.

Keep Local/Remote execution, numerical comparison, startup and computation metrics accessible. PWA state should become compact while retaining visible recovery/update actions. First establish the layout and parameter interactions, then implement the bounded capture pipeline below and connect its playback controls. Preserve the preferred generator appearance throughout.

## Next: evolution of the selected terrain

1. Specify bounded snapshot capture for the existing hydraulic model: initial state, interval frames, final state, no duplicate final frame, and overflow-safe storage budgets.
2. Add opt-in capture without changing generation arithmetic or final output. Preserve the current generation workload; give capture a separate version/workload and include copying in its Core time.
3. Extend shared host contracts and both execution paths together. Verify exact final identity with capture disabled and Local/Remote equivalence of every frame.
4. Add Three.js playback: play/pause, scrub, reset, speed and iteration labels. Reuse geometry and preserve camera; pause during measured work and dispose resources.
5. Verify memory bounds, zero steps, error handling, replacement and offline playback. Keep model iterations distinct from real-world days or years.

This extension is planned and is not part of the cleanup implementation.

## Later: improve the world model incrementally

Preserve the preferred terrain appearance. Develop diagnostic layers for slope/erosion, then climate and richer biomes. Add visible rivers/lakes only with an explicit water model and tests for supply, drainage and evaporation. A depression's spill level is a routing limit, not evidence that the depression is full of water. No new regional mode or 2D view is planned.

## Architecture Race and research campaign

Build a sequential runner with immutable inputs, alternating execution order, warm-up, raw trial retention, statistics and JSON/CSV export. Use `terrain-hydraulic-v1` and the worker JSON profile as the primary generation workload; evaluate any future capture workload separately. Follow [BENCHMARKING.md](BENCHMARKING.md).

Run a controlled size/iteration/seed matrix under documented network profiles. Keep compute, initialization, request overhead and rendering separate. Report failures and environment limits; browser smoke checks are correctness evidence, not a performance campaign.
