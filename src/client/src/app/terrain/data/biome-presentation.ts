import { LANDSCAPE_BIOME as B, LandscapeBiomeId, TREE_KIND, TREE_VARIANT } from './terrain.models';

/** Base material colors remain unchanged for protected surface terms. */
export const SURFACE_COLORS = {
  grass: 0xa7b976,
  soil: 0xb5a17a,
  sand: 0xd6c28e,
  rock: 0xa6a397,
  snow: 0xe9eff1,
  ocean: 0x37768b,
} as const;
const NEUTRAL_GROUND = Object.freeze({ grass: SURFACE_COLORS.grass, soil: SURFACE_COLORS.soil });

/** Artistic sRGB colors only. IDs, coverage and suitability are authoritative Core output. */
export const BIOME_GROUND_COLORS = {
  [B.Ocean]: NEUTRAL_GROUND,
  [B.Grassland]: { grass: 0xa0ad7b, soil: 0xad9a77 },
  [B.BroadleafForest]: { grass: 0x7e9169, soil: 0x89795d },
  [B.DryGrassland]: { grass: 0xb6a875, soil: 0xb3a07b },
  [B.Rock]: NEUTRAL_GROUND,
  [B.ConiferForest]: { grass: 0x6d8572, soil: 0x7e8067 },
  [B.Savanna]: { grass: 0xacac72, soil: 0xb0a06d },
  [B.Tundra]: { grass: 0x96a28f, soil: 0x96978b },
  [B.SnowHighlands]: NEUTRAL_GROUND,
} as const satisfies Record<LandscapeBiomeId, { readonly grass: number; readonly soil: number }>;

export const TREE_CROWN_COLORS = {
  [TREE_KIND.Broadleaf]: { [TREE_VARIANT.Small]: 0x427645, [TREE_VARIANT.Mature]: 0x386b40 },
  [TREE_KIND.Conifer]: { [TREE_VARIANT.Small]: 0x376450, [TREE_VARIANT.Mature]: 0x2d5644 },
  [TREE_KIND.Savanna]: { [TREE_VARIANT.Small]: 0x798548, [TREE_VARIANT.Mature]: 0x6f7c43 },
} as const;

/** Presentation mapping only; all climate, snow and species decisions are made in Core. */
export const BIOME_PRESENTATION = {
  [B.Ocean]: { label: 'Ocean', color: SURFACE_COLORS.ocean },
  [B.Grassland]: { label: 'Grassland', color: BIOME_GROUND_COLORS[B.Grassland].grass },
  [B.BroadleafForest]: {
    label: 'Broadleaf forest',
    color: BIOME_GROUND_COLORS[B.BroadleafForest].grass,
  },
  [B.DryGrassland]: { label: 'Dry grassland', color: BIOME_GROUND_COLORS[B.DryGrassland].grass },
  [B.Rock]: { label: 'Rock', color: SURFACE_COLORS.rock },
  [B.ConiferForest]: { label: 'Conifer forest', color: BIOME_GROUND_COLORS[B.ConiferForest].grass },
  [B.Savanna]: { label: 'Savanna', color: BIOME_GROUND_COLORS[B.Savanna].grass },
  [B.Tundra]: { label: 'Tundra', color: BIOME_GROUND_COLORS[B.Tundra].grass },
  [B.SnowHighlands]: { label: 'Snow highlands', color: SURFACE_COLORS.snow },
} satisfies Record<LandscapeBiomeId, { label: string; color: number }>;
export const BIOME_PALETTE = Object.fromEntries(
  Object.entries(BIOME_PRESENTATION).map(([id, presentation]) => [id, presentation.color]),
) as Record<LandscapeBiomeId, number>;
