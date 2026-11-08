# Organizational refactor verification

Verified 2026-11-08, starting at d177e7e plus the existing uncommitted compact parameter editor. The UI changes were preserved throughout; this work remains uncommitted until requested.

## Organization

- Main documentation remains in docs/ root, with INDEX.md for navigation. Frozen specifications moved to specs/, completed prompts to archive/prompts/, and original milestone notes to DETAILING_VERIFICATION.md here.
- DEVELOPMENT.md is now a current 130-line operational guide rather than a 584-line mixture of current and historical instructions. Its stale planned-feature introduction was corrected.
- parameter-definitions.ts owns metadata/default references. terrain-parameters.ts owns forms and immutable capture. parameter-guidance.ts owns pure presentation bounds/balance/work helpers. Components retain interaction/subscription state.
- terrain-scene.ts owns synchronous terrain/forest/rock/light content and idempotent cleanup. TerrainPreview retains async texture readiness, renderer/camera/controls, context/error/pause handling and timing. Template/styles moved into colocated HTML/CSS files.
- Active Core tests are grouped under Generation/Ecology/Validation with unchanged namespaces. Historical sources, reference scripts and existing fixture contents remain intact.
- Browser support/editor.cjs shares field filling, observable completion waits and artifact resolution. Seven entry points retain their own mathematical, rendering and PWA assertions.

Removed duplication consists of repeated browser action/wait blocks, inline scene-content ownership in the Angular component and repeated operational/historical documentation. Active HeightMapTransport preparation, immutable validated-request types and terrain.contract.ts remain because their callers and verification roles were confirmed. Core production folders and public APIs were retained; production C# changes only update specification pointers in comments. Generated outputs stay ignored and publication remains transactional.

## Numerical and UI preservation

Before refactoring, landscape-v8-fingerprints.json captured complete TerrainMap and SimulationSummary JSON hashes for 23 requests referenced from the existing v7 request fixture. It includes final coastal weights and every tree/rock record, as well as versions, while excluding timing and build identity. The new current-pipeline test reproduces all hashes exactly. No old literal or fingerprint expectation was rewritten.

Parameter-panel HTML/CSS remains byte-identical to the working-tree baseline captured before cleanup. Browser editor checks preserve the 226px landform group, dependent ranges, exact drafts, optional tips, keyboard controls and narrow layout. Existing preview lifecycle tests still cover asset/pause wait exclusion, stale completions, camera retention, failed submissions and sand retry/disposal.

Moved specification and prompt text was compared against its original content with only link targets/repository paths normalized. Equations, identifiers and recorded observations are unchanged. A new standard-library Python check validates all repository-relative Markdown link targets in documentation, AGENTS.md and terrain asset provenance. No anchored Markdown links required migration.

## Verification results

- Locked restore and Release build: success, zero warnings/errors.
- Core: 182 passing tests, including the complete current-result fingerprint check.
- API: 39 passing tests.
- Angular: 170 passing tests.
- Python: five passing packaging/asset/document-link checks.
- Node worker RPC: passing.
- Production publication: passing, 38 required catalog assets.
- Chromium 153.0.8010.52: landscape, materials, lighting, editor, coasts, relief and PWA all pass with no page errors.

The actual WASM/API matrix has maximum observed numeric error zero. Five texture uploads/view, existing 2048 PCF targets, static shadow reuse and the 19-call color/initial caster cap remain verified. Maximum tree/rock rendering, independent comparison-view ownership, paused computation, replacement/error cleanup, offline reload/new tabs, Remote recovery and deferred safe updates pass. CPU display boundaries were retained; no GPU completion or controlled performance conclusion is inferred.

Raw ignored artifacts retain landscape-verification.json, coasts-materials-verification.json, lighting/editor/coastal/relief/PWA reports and screenshots. These are smoke evidence rather than peak-memory measurements or mobile guarantees. Source organization can change build identity or generated bundle hashes without changing mathematical identities.

## Deliberate boundaries

No new dependencies, workloads, contracts, generator policies, render features, caches or experimental runner were introduced. Broad legacy API consolidation and historical-source formatting were deferred because they add compatibility/review scope without improving this cleanup. The next feature task is Architecture Race protocol/result contracts; its runner/UI/export and evolution capture remain separate future work.
