import { testSurfaceWeights } from '../testing/terrain-test-fixture';
import { terrainGeometry } from './terrain-geometry';

function result(width = 3, height = 2) {
  return {
    width,
    height,
    values: Float32Array.from({ length: width * height }, (_, i) => i),
    biomes: Uint8Array.from({ length: width * height }, (_, i) => i % 4),
    surfaceWeights: Float32Array.from(
      testSurfaceWeights(Uint8Array.from({ length: width * height }, (_, i) => i % 4)),
    ),
    algorithmVersion: 'value-noise-fbm-v1',
    resultVersion: 'heightmap-biomes-v1',
  };
}

describe('terrain geometry', () => {
  it('preserves row-major heights and supplied coverage on rectangular maps', () => {
    const input = result();
    const geometry = terrainGeometry(input);
    const position = geometry.getAttribute('position');
    const coverage = geometry.getAttribute('surfaceCoverage');
    expect(position.count).toBe(6);
    expect([...position.array]).toEqual([
      -1, 0, -0.5, 0, 1, -0.5, 1, 2, -0.5, -1, 3, 0.5, 0, 4, 0.5, 1, 5, 0.5,
    ]);
    expect([...coverage.array.slice(12, 16)]).toEqual([0.5, 0.5, 0, 0]);
    expect(geometry.getAttribute('color')).toBeUndefined();
    expect([...input.values]).toEqual([0, 1, 2, 3, 4, 5]);
    expect([...geometry.index!.array]).toEqual([0, 3, 1, 1, 3, 4, 1, 4, 2, 2, 4, 5]);
    geometry.dispose();
  });

  it('supports 512x512 without truncating indices and produces upward flat normals', () => {
    const input = result(512, 512);
    input.values.fill(0);
    const geometry = terrainGeometry(input);
    expect(geometry.index!.array).toBeInstanceOf(Uint32Array);
    expect(geometry.index!.count).toBe(511 * 511 * 6);
    expect(geometry.index!.array[geometry.index!.count - 1]).toBe(262143);
    expect(geometry.getAttribute('normal').getY(262143)).toBeCloseTo(1);
    expect(geometry.getAttribute('surfaceCoverage').array.byteLength).toBe(4 * 1024 * 1024);
    expect(geometry.getAttribute('sandCoverage').itemSize).toBe(1);
    expect(geometry.getAttribute('sandCoverage').array.byteLength).toBe(1024 * 1024);
    expect(geometry.boundingSphere!.radius).toBeGreaterThan(0);
    geometry.dispose();
  });
});
