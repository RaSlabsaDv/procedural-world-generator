import { TREE_CROWN_COLORS } from '../data/biome-presentation';
import { TREE_KIND, TREE_VARIANT } from '../data/terrain.models';

/** Fixed presentation definitions, not tree age, placement or ecological rules. */
export const TREE_APPEARANCE = {
  [TREE_KIND.Broadleaf]: {
    [TREE_VARIANT.Small]: {
      trunk: 0.48,
      radius: 0.36,
      height: 1,
      y: 0.72,
      scale: [0.9, 1.05, 0.95],
      color: TREE_CROWN_COLORS[TREE_KIND.Broadleaf][TREE_VARIANT.Small],
    },
    [TREE_VARIANT.Mature]: {
      trunk: 0.82,
      radius: 0.58,
      height: 1,
      y: 1.18,
      scale: [1.05, 0.85, 1],
      color: TREE_CROWN_COLORS[TREE_KIND.Broadleaf][TREE_VARIANT.Mature],
    },
  },
  [TREE_KIND.Conifer]: {
    [TREE_VARIANT.Small]: {
      trunk: 0.42,
      radius: 0.29,
      height: 0.95,
      y: 0.72,
      scale: [1, 1, 1],
      color: TREE_CROWN_COLORS[TREE_KIND.Conifer][TREE_VARIANT.Small],
    },
    [TREE_VARIANT.Mature]: {
      trunk: 0.7,
      radius: 0.48,
      height: 1.55,
      y: 1.18,
      scale: [1, 1, 1],
      color: TREE_CROWN_COLORS[TREE_KIND.Conifer][TREE_VARIANT.Mature],
    },
  },
  [TREE_KIND.Savanna]: {
    [TREE_VARIANT.Small]: {
      trunk: 0.8,
      radius: 0.46,
      height: 1,
      y: 0.86,
      scale: [1.15, 0.45, 1],
      color: TREE_CROWN_COLORS[TREE_KIND.Savanna][TREE_VARIANT.Small],
    },
    [TREE_VARIANT.Mature]: {
      trunk: 1.22,
      radius: 0.72,
      height: 1,
      y: 1.28,
      scale: [1.4, 0.32, 1.15],
      color: TREE_CROWN_COLORS[TREE_KIND.Savanna][TREE_VARIANT.Mature],
    },
  },
} as const;
