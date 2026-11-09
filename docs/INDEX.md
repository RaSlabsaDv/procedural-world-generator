# Documentation index

## Start here

- [Project brief](PROJECT_BRIEF.md): research objective, scope and constraints.
- [Architecture](ARCHITECTURE.md): active components, contracts and ownership.
- [Development](DEVELOPMENT.md): setup, commands, repository layout and verification.
- [Benchmarking](BENCHMARKING.md): measurement boundaries and experimental methodology.
- [Implementation plan](IMPLEMENTATION_PLAN.md): completed work and remaining features, including the shared sun/fog foundation, water-first visual stages and execution diagnostics/progress/optimization tracks.

## Frozen policies and specifications

Current behavior composes the policies below; a historical version label does not mean its equations or reference fixtures can be removed. Current identities are diverse-landscape-v13, landscape-ecology-v14, landscape-ecology-hydraulic-v14 and landscape-worker-json-v14.

- [Inland water v1](specs/INLAND_WATER_V1.md): visible lake/river meshes, real shoreline clipping, supported routes, decoration filtering and graphics budgets.
- [Lake basins v1](specs/LAKE_BASINS_V1.md): bounded static inland lakes, authoritative levels, complete spill/crossing connections and v14 workload isolation.
- [River network v1](specs/RIVER_NETWORK_V1.md): threshold-selected river cells, grid-unit widths, reused drainage connectivity and v13 workload isolation.
- [Hydrology v1](specs/HYDROLOGY_V1.md): deterministic drainage foundation, graph/area/depression contracts and v12 workload isolation.
- [Architecture Race v1](specs/ARCHITECTURE_RACE_V1.md): experiment protocol, readonly records and immutable configuration, sequential runner and editor UI, summary inclusion/count rules and versioned JSON/CSV export.
- [Landscape/climate v3](specs/LANDSCAPE_V3.md): base environment and ecological rules; original height composition is historical.
- [Regional climate v1](specs/REGIONAL_CLIMATE_V1.md): current world-grid climate, elevation cooling and highland snow.
- [Biome presentation v1](specs/BIOME_PRESENTATION_V1.md): compact biome ground colors and species crown palettes.
- [Atlas material detail v1](specs/ATLAS_MATERIALS_V1.md): reproducible lower-contrast surface PNGs and presentation-only verification.
- [Surface coverage v1](specs/SURFACE_TRANSITIONS_V1.md): base weights used before placement.
- [Vegetation structure v1](specs/VEGETATION_STRUCTURE_V1.md): groves, edges and variants.
- [Rock placement v2](specs/ROCK_PLACEMENT_V2.md): current sparse boulders, varied silhouettes and multi-cell support.
- [Rock placement v1](specs/ROCK_PLACEMENT_V1.md): historical single-cell rocks and reference fixtures.
- [Local relief v1](specs/LOCAL_RELIEF_V1.md): current pre-erosion height extension.
- [Coastal surfaces v2](specs/COASTAL_SURFACES_V2.md): current wider, context-sensitive post-placement coverage.
- [Coastal surfaces v1](specs/COASTAL_SURFACES_V1.md): historical coastal equations and reference fixtures.
- [Night sky and foam v1](specs/NIGHT_SKY_V1.md): illuminated foam and a shared illustrative full moon.
- [SSAO assessment v1](specs/SSAO_ASSESSMENT_V1.md): rejected stock candidate, visual/resource evidence and unresolved physical-GPU cost; no runtime SSAO.
- [Bloom v1](specs/BLOOM_V1.md): unexposed HDR extraction, normalized quarter-resolution blur, disabled-path guarantees and target budgets.
- [Color finishing v1](specs/COLOR_FINISHING_V1.md): linear HDR composition, ACES shadow toe, exact Reference, exposure and bounded final-pass resources.
- [Tree LOD v1](specs/TREE_LOD_V1.md): two-level geometry, hysteresis, static caster layer and bounded buffer/pass tradeoffs.
- [Foliage variation v1](specs/FOLIAGE_VARIATION_V1.md): stable per-tree linear crown colors, identity/hash policy and resource bounds.
- [Grass presentation v1](specs/GRASS_PRESENTATION_V1.md): bounded deterministic tufts, exact triangle grounding, exclusions, fade and ownership.
- [Terrain microdetail v1](specs/TERRAIN_MICRODETAIL_V1.md): array normal atlas, signed triplanar lighting, fade and resource bounds.
- [Shadow quality v1](specs/SHADOW_QUALITY_V1.md): paired assessment, rejected bias probe and conservative fit regression coverage.
- [Sun controls v1](specs/SUN_CONTROLS_V1.md): interactive shared time/direction, reset, deferred loading and shadow invalidation.
- [Atmosphere v1](specs/ATMOSPHERE_V1.md): shared sky, exponential/height fog, water composition and reference mode.
- [Ocean presentation v1](specs/OCEAN_PRESENTATION_V1.md): sea-level geometry, depth/foam/Fresnel, animation and graphics budgets.
- [Scene environment v1](specs/SCENE_ENVIRONMENT_V1.md): shared immutable sun/fog/time state and independent viewport bindings.
- [Lighting v1](specs/LIGHTING_ATMOSPHERE_V1.md): presentation configuration and resource ownership.
- [Landscape v2](specs/LANDSCAPE_V2.md) and [original workload](specs/TERRAIN_WORKLOAD.md): historical mathematical references.

## History and archived instructions

- [Organizational refactor verification](history/REFACTOR_VERIFICATION.md): preserved behavior, moved responsibilities and checks.

- [Detailing implementation/verification notes](history/DETAILING_VERIFICATION.md): original observations and resource/test counts for completed stages, including the compact editor.
- Completed prompts: [surface materials](archive/prompts/SURFACE_MATERIALS_PROMPT.md), [surface transitions](archive/prompts/SURFACE_TRANSITIONS_PROMPT.md), [lighting](archive/prompts/LIGHTING_ATMOSPHERE_PROMPT.md).

Historical timings and resource observations are not current benchmark results. Independent references, versioned fixtures and test-only historical generators remain part of the verification system. README.md stays empty by design.
