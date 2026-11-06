import { BufferAttribute, BufferGeometry, Color } from 'three';
import { TerrainResponse } from './terrain.models';

// Presentation only: numeric biome IDs are supplied by Core; no classification here.
export const BIOME_PALETTE = [0x286caa, 0x9cb85a, 0x34714b, 0xb8b5ac] as const;

export function terrainGeometry(result: TerrainResponse['result']): BufferGeometry {
  const { width, height, values, biomes } = result;
  const positions = new Float32Array(values.length * 3);
  const colors = new Float32Array(values.length * 3);
  const palette = BIOME_PALETTE.map((hex) => new Color(hex));
  const indices = new Uint32Array((width - 1) * (height - 1) * 6);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      positions.set([x - (width - 1) / 2, values[i], y - (height - 1) / 2], i * 3);
      palette[biomes[i]].toArray(colors, i * 3);
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
  geometry.setIndex(new BufferAttribute(indices, 1));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}
