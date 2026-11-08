import { BufferAttribute, BufferGeometry } from 'three';
import {
  TerrainResponse,
  SURFACE_CHANNELS,
  SURFACE_CHANNEL,
  LANDSCAPE_BIOME_IDS,
} from '../data/terrain.models';

export function terrainGeometry(
  result: Pick<
    TerrainResponse['result'],
    'width' | 'height' | 'values' | 'surfaceWeights' | 'biomes'
  >,
): BufferGeometry {
  const { width, height, values, surfaceWeights, biomes } = result;
  if (!(biomes instanceof Uint8Array) || biomes.length !== values.length)
    throw new Error('Invalid biome attribute length or encoding.');
  const positions = new Float32Array(values.length * 3);
  const coverage = new Float32Array(values.length * 4);
  const sand = new Float32Array(values.length);
  const indices = new Uint32Array((width - 1) * (height - 1) * 6);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      if (!LANDSCAPE_BIOME_IDS.has(biomes[i])) throw new Error('Unsupported biome ID.');
      positions.set([x - (width - 1) / 2, values[i], y - (height - 1) / 2], i * 3);
      const offset = i * SURFACE_CHANNELS;
      sand[i] = surfaceWeights[offset + SURFACE_CHANNEL.Sand];
      coverage.set(
        [
          surfaceWeights[offset + SURFACE_CHANNEL.Grass],
          surfaceWeights[offset + SURFACE_CHANNEL.Soil],
          surfaceWeights[offset + SURFACE_CHANNEL.Rock],
          surfaceWeights[offset + SURFACE_CHANNEL.Snow],
        ],
        i * 4,
      );
      if (x < width - 1 && y < height - 1) {
        const offset = (y * (width - 1) + x) * 6;
        // Counter-clockwise viewed from above (+Y), with one consistent diagonal.
        indices.set([i, i + width, i + 1, i + 1, i + width, i + width + 1], offset);
      }
    }
  }
  const geometry = new BufferGeometry();
  // Alias validated IDs; geometry disposal releases the GPU buffer, not source data.
  geometry.setAttribute('biomeId', new BufferAttribute(biomes, 1, false));
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.setAttribute('surfaceCoverage', new BufferAttribute(coverage, 4));
  geometry.setAttribute('sandCoverage', new BufferAttribute(sand, 1));
  geometry.setIndex(new BufferAttribute(indices, 1));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}
