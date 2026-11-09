import { BufferGeometry, InstancedMesh, MeshLambertMaterial, Vector3 } from 'three';
import { decodeTerrain } from '../data/terrain.contract';
import { MAX_TREES, TreeInstance } from '../data/terrain.models';
import { testMap, testTerrain, testWire } from '../testing/terrain-test-fixture';
import { terrainForestLod, TREE_LOD, treeLodLevel } from './tree-lod';

const tree: TreeInstance = {
  cellIndex: 0,
  kind: 0,
  variant: 0,
  x: 0.5,
  y: 0,
  z: 0.5,
  scale: 1,
  rotation: 0.7,
};
function result(trees: readonly TreeInstance[] = [tree]) {
  const request = { ...testMap, width: 2, height: 2 },
    terrain = testTerrain(request);
  return { ...decodeTerrain(testWire(terrain), request, terrain).result, trees };
}
const triangles = (geometry: BufferGeometry) =>
  (geometry.index?.count ?? geometry.attributes['position'].count) / 3;

describe('tree LOD v1', () => {
  it('freezes initial thresholds, scaled distances and exact hysteresis ties', () => {
    expect(treeLodLevel(56 ** 2, 1)).toBe(0);
    expect(treeLodLevel(56.001 ** 2, 1)).toBe(1);
    expect(treeLodLevel(64 ** 2, 1, 0)).toBe(0);
    expect(treeLodLevel(64.001 ** 2, 1, 0)).toBe(1);
    expect(treeLodLevel(48 ** 2, 1, 1)).toBe(1);
    expect(treeLodLevel(47.999 ** 2, 1, 1)).toBe(0);
    expect(treeLodLevel(100 ** 2, 2)).toBe(0);
    expect(treeLodLevel(130 ** 2, 2, 0)).toBe(1);
  });

  it('renders every species/variant exactly once and reduces actual submitted triangles', () => {
    const trees = ([0, 1, 2] as const).flatMap((kind) =>
      ([0, 1] as const).map((variant) => ({ ...tree, kind, variant })),
    );
    const forest = terrainForestLod(result(trees), 42);
    try {
      expect(forest.meshes).toHaveLength(24);
      expect(forest.casters).toHaveLength(12);
      forest.update(new Vector3(0, 0, 500));
      for (const g of forest.groups) {
        expect(g.trunks.count + g.farTrunks.count).toBe(1);
        expect(g.crowns.count + g.farCrowns.count).toBe(1);
        expect(g.trunks.visible).toBe(false);
        expect(g.farTrunks.visible).toBe(true);
        expect(triangles(g.sourceTrunks.geometry)).toBe(20);
        expect(triangles(g.farTrunks.geometry)).toBe(12);
        expect(triangles(g.sourceCrowns.geometry)).toBe(g.kind === 1 ? 12 : 20);
        expect(triangles(g.farCrowns.geometry)).toBe(g.kind === 1 ? 6 : 8);
        expect(g.farCrowns.material).toBe(g.crowns.material);
        expect(g.farTrunks.material).toBe(g.trunks.material);
        expect(g.farCrowns.instanceColor!.array).toEqual(g.colors);
      }
      forest.update(new Vector3(0, 0, 0));
      for (const g of forest.groups) {
        expect(g.trunks.count).toBe(1);
        expect(g.farTrunks.count).toBe(0);
        expect(g.farCrowns.visible).toBe(false);
        expect(g.crowns.instanceColor!.array).toEqual(g.colors);
      }
    } finally {
      forest.dispose();
    }
  });

  it('bounds all six simultaneously split groups to24 color meshes and12 static casters', () => {
    const trees = ([0, 1, 2] as const).flatMap((kind) =>
      ([0, 1] as const).flatMap((variant) => [
        { ...tree, kind, variant },
        { ...tree, kind, variant, x: 200, cellIndex: 1 },
      ]),
    );
    const forest = terrainForestLod(result(trees), 42);
    try {
      forest.update(new Vector3());
      expect(forest.meshes.filter((m) => m.visible)).toHaveLength(24);
      expect(forest.casters).toHaveLength(12);
      for (const g of forest.groups) {
        expect(g.trunks.count).toBe(1);
        expect(g.farTrunks.count).toBe(1);
        expect(g.sourceTrunks.count).toBe(2);
      }
    } finally {
      forest.dispose();
    }
  });

  it('reuses fixed buffers, skips stationary/light-only work and avoids boundary chatter', () => {
    const forest = terrainForestLod(result(), 42),
      g = forest.groups[0];
    try {
      const buffers = forest.meshes.map((m) => m.instanceMatrix.array);
      forest.update(new Vector3(0, 0, 55));
      const version = g.trunks.instanceMatrix.version;
      expect(forest.update(new Vector3(0, 0, 55))).toBe(false);
      expect(forest.update(new Vector3(0, 0, 55.2))).toBe(false);
      expect(forest.update(new Vector3(0, 0, 60))).toBe(false);
      expect(g.trunks.instanceMatrix.version).toBe(version);
      expect(forest.update(new Vector3(0, 0, 65))).toBe(true);
      expect(g.farTrunks.count).toBe(1);
      for (const z of [63, 56, 50]) expect(forest.update(new Vector3(0, 0, z))).toBe(false);
      expect(forest.update(new Vector3(0, 0, 47))).toBe(true);
      expect(g.trunks.count).toBe(1);
      forest.meshes.forEach((m, i) => expect(m.instanceMatrix.array).toBe(buffers[i]));
      expect(g.trunks.instanceMatrix).toBe(g.crowns.instanceMatrix);
      expect(g.farTrunks.instanceMatrix).toBe(g.farCrowns.instanceMatrix);
    } finally {
      forest.dispose();
    }
  });

  it('preserves canonical shadow bytes, colors, transforms and whole-group bounds', () => {
    const forest = terrainForestLod(result([tree, { ...tree, cellIndex: 1, x: 100 }]), -2147483648),
      g = forest.groups[0];
    try {
      const matrix = g.sourceTrunks.instanceMatrix.array.slice(),
        colors = g.colors.slice();
      const bounds = g.crowns.boundingSphere!.clone(),
        farBounds = g.farCrowns.boundingSphere!.clone();
      forest.update(new Vector3(0, 0, 0));
      expect(g.trunks.count).toBe(1);
      expect(g.farTrunks.count).toBe(1);
      expect(g.trunks.instanceMatrix.array.slice(0, 16)).toEqual(matrix.slice(0, 16));
      expect(g.farTrunks.instanceMatrix.array.slice(0, 16)).toEqual(matrix.slice(16, 32));
      expect(g.farCrowns.instanceColor!.array.slice(0, 3)).toEqual(colors.slice(3, 6));
      for (const z of [300, 20, 100, 0]) forest.update(new Vector3(0, 0, z));
      expect(g.sourceTrunks.instanceMatrix.array).toEqual(matrix);
      expect(g.sourceCrowns.instanceMatrix).toBe(g.sourceTrunks.instanceMatrix);
      expect(g.sourceCrowns.instanceColor).toBeNull();
      expect(g.colors).toEqual(colors);
      expect(g.crowns.boundingSphere).toEqual(bounds);
      expect(g.farCrowns.boundingSphere).toEqual(farBounds);
      expect(g.sourceCrowns.layers.mask).toBe(1 << TREE_LOD.shadowLayer);
      for (const m of forest.meshes) {
        expect(m.castShadow).toBe(false);
        expect(m.layers.mask).toBe(1);
      }
    } finally {
      forest.dispose();
    }
  });

  it('keeps colors stable through reordered input and independent views', () => {
    const trees = [tree, { ...tree, cellIndex: 1, x: 100 }];
    const a = terrainForestLod(result(trees), -1),
      b = terrainForestLod(result([...trees].reverse()), -1);
    try {
      a.update(new Vector3());
      b.update(new Vector3());
      const x = a.groups[0],
        y = b.groups[0];
      expect(x.crowns.instanceColor!.array.slice(0, 3)).toEqual(
        y.crowns.instanceColor!.array.slice(0, 3),
      );
      expect(x.farCrowns.instanceColor!.array.slice(0, 3)).toEqual(
        y.farCrowns.instanceColor!.array.slice(0, 3),
      );
      expect(x.crowns.instanceColor!.array).not.toBe(y.crowns.instanceColor!.array);
      a.update(new Vector3(0, 0, 500));
      expect(y.trunks.count).toBe(1);
    } finally {
      a.dispose();
      b.dispose();
    }
  });

  it('bounds maximum storage and supports empty forests and disposed updates', () => {
    const empty = terrainForestLod(result([]), 0);
    expect(empty.groups).toHaveLength(0);
    expect(empty.update(new Vector3())).toBe(false);
    empty.dispose();
    const forest = terrainForestLod(
      result(Array.from({ length: MAX_TREES }, (_, cellIndex) => ({ ...tree, cellIndex }))),
      42,
    );
    const g = forest.groups[0];
    try {
      forest.update(new Vector3(0, 0, 500));
      expect(g.farTrunks.count).toBe(MAX_TREES);
      const bytes =
        g.sourceTrunks.instanceMatrix.array.byteLength +
        g.trunks.instanceMatrix.array.byteLength +
        g.farTrunks.instanceMatrix.array.byteLength +
        g.crowns.instanceColor!.array.byteLength +
        g.farCrowns.instanceColor!.array.byteLength;
      expect(bytes).toBe(3538944);
      expect(bytes + g.colors.byteLength + g.levels.byteLength).toBe(3751936);
    } finally {
      forest.dispose();
    }
    expect(forest.update(new Vector3())).toBe(false);
  });

  it('disposes all meshes, shared resources once and rolls back partial setup', () => {
    const forest = terrainForestLod(result(), 42);
    const meshes = [...forest.meshes, ...forest.casters];
    const meshDisposal = meshes.map((m) => vi.spyOn(m, 'dispose'));
    const geometries = [...new Set(meshes.map((m) => m.geometry))].map((g) =>
      vi.spyOn(g, 'dispose'),
    );
    const materials = [...new Set(meshes.map((m) => m.material))].map((m) =>
      vi.spyOn(m, 'dispose'),
    );
    forest.dispose();
    forest.dispose();
    for (const spy of [...meshDisposal, ...geometries, ...materials])
      expect(spy).toHaveBeenCalledTimes(1);
    const original = InstancedMesh.prototype.computeBoundingSphere;
    let calls = 0;
    const bounds = vi
      .spyOn(InstancedMesh.prototype, 'computeBoundingSphere')
      .mockImplementation(function (this: InstancedMesh) {
        if (++calls === 3) throw Error('far bounds failure');
        original.call(this);
      });
    const dispose = vi.spyOn(InstancedMesh.prototype, 'dispose');
    const geometry = vi.spyOn(BufferGeometry.prototype, 'dispose');
    const material = vi.spyOn(MeshLambertMaterial.prototype, 'dispose');
    try {
      expect(() => terrainForestLod(result(), 42)).toThrow('far bounds failure');
      expect(dispose).toHaveBeenCalledTimes(6);
      expect(geometry).toHaveBeenCalledTimes(4);
      expect(material).toHaveBeenCalledTimes(2);
    } finally {
      bounds.mockRestore();
      dispose.mockRestore();
      geometry.mockRestore();
      material.mockRestore();
    }
  });
});
