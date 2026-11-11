export const SETTINGS_TABS = [
  { id: 'terrain', label: 'Terrain' },
  { id: 'biomes', label: 'Biomes' },
  { id: 'erosion', label: 'Erosion' },
  { id: 'scene', label: 'Scene' },
  { id: 'extra', label: 'Extra' },
] as const;
export type SettingsTab = (typeof SETTINGS_TABS)[number]['id'];
