import { BufferAttribute, BufferGeometry, Color } from 'three';
import { BIOME_SURFACE } from './terrain-surfaces';
import { TerrainResponse, LandscapeBiomeId } from '../data/terrain.models';

import { BIOME_PALETTE } from '../data/biome-presentation';
export { BIOME_PALETTE } from '../data/biome-presentation';

export function terrainGeometry(
  result: Pick<TerrainResponse['result'], 'width' | 'height' | 'values' | 'biomes'>,
): BufferGeometry {
  const { width, height, values, biomes } = result;
  const positions = new Float32Array(values.length * 3);
  const colors = new Float32Array(values.length * 3);
  const families = new Uint8Array(values.length * 4);
  const palette: Color[] = [];
  for (const [id, hex] of Object.entries(BIOME_PALETTE)) palette[Number(id)] = new Color(hex);
  const indices = new Uint32Array((width - 1) * (height - 1) * 6);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      positions.set([x - (width - 1) / 2, values[i], y - (height - 1) / 2], i * 3);
      palette[biomes[i]].toArray(colors, i * 3);
      const family = BIOME_SURFACE[biomes[i] as LandscapeBiomeId];
      if (family >= 0) families[i * 4 + family] = 1;
      if (x < width - 1 && y < height - 1) {
        const offset = (y * (width - 1) + x) * 6;
        // Counter-clockwise viewed from above (+Y), with one consistent diagonal.
        indices.set([i, i + width, i + 1, i + 1, i + width, i + width + 1], offset);
      }
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.setAttribute('color', new BufferAttribute(colors, 3));
  geometry.setAttribute('surfaceFamily', new BufferAttribute(families, 4));
  geometry.setIndex(new BufferAttribute(indices, 1));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}
