import { LANDSCAPE_BIOME as B, LandscapeBiomeId } from './terrain.models';

/** Presentation mapping only; all climate, snow and species decisions are made in Core. */
export const BIOME_PRESENTATION = {
  [B.Ocean]: { label: 'Ocean', color: 0x37768b },
  [B.Grassland]: { label: 'Grassland', color: 0xa7b976 },
  [B.BroadleafForest]: { label: 'Broadleaf forest', color: 0x6f995f },
  [B.DryGrassland]: { label: 'Dry grassland', color: 0xc1ac78 },
  [B.Rock]: { label: 'Rock', color: 0xa6a397 },
  [B.ConiferForest]: { label: 'Conifer forest', color: 0x3e6c58 },
  [B.Savanna]: { label: 'Savanna', color: 0xc1b36b },
  [B.Tundra]: { label: 'Tundra', color: 0x939d88 },
  [B.SnowHighlands]: { label: 'Snow highlands', color: 0xe9eff1 },
} satisfies Record<LandscapeBiomeId, { label: string; color: number }>;
export const BIOME_PALETTE = Object.fromEntries(
  Object.entries(BIOME_PRESENTATION).map(([id, presentation]) => [id, presentation.color]),
) as Record<LandscapeBiomeId, number>;
