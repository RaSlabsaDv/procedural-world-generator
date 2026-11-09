import { BufferGeometry, Color, InstancedMesh, Matrix4, MeshLambertMaterial, Vector3 } from 'three';
import { TREE_CROWN_COLORS } from '../data/biome-presentation';
import { MAX_TREES } from '../data/terrain.models';
import { decodeTerrain } from '../data/terrain.contract';
import { testMap, testTerrain, testWire } from '../testing/terrain-test-fixture';
import { foliageColor } from './foliage-color';
import { terrainForest } from './terrain-forest';

const tree = {
  cellIndex: 0,
  kind: 0 as const,
  variant: 0 as const,
  x: 0.25,
  y: 1,
  z: 0.25,
  scale: 1.2,
  rotation: 0.7,
};
const result = () => {
  const request = { ...testMap, width: 2, height: 2 };
  const terrain = testTerrain(request);
  return decodeTerrain(testWire(terrain), request, terrain).result;
};
const rgb = (cellIndex: number, seed = 42) =>
  foliageColor(
    seed,
    { ...tree, cellIndex },
    new Color(TREE_CROWN_COLORS[0][0]),
    new Color(),
  ).toArray();

describe('foliage variation v1', () => {
  it.each([0, -1, -2147483648, 2147483647])('is reproducible for signed seed %s', (seed) => {
    expect(rgb(0, seed)).toEqual(rgb(0, seed));
    expect(rgb(0, seed)).not.toEqual(rgb(1, seed));
    expect(rgb(0, seed)).not.toEqual(rgb(0, seed === 0 ? 1 : 0));
  });

  it('keeps all frozen linear palettes bounded and near their original species color', () => {
    const scratch = new Color();
    for (const kind of [0, 1, 2] as const)
      for (const variant of [0, 1] as const) {
        const base = new Color(TREE_CROWN_COLORS[kind][variant]);
        let minRatio = Infinity,
          maxRatio = 0,
          maxChannel = 0;
        for (let cellIndex = 0; cellIndex < MAX_TREES; cellIndex++) {
          const color = foliageColor(42, { cellIndex, kind, variant }, base, scratch);
          for (const [i, value] of color.toArray().entries()) {
            maxChannel = Math.max(maxChannel, value);
            minRatio = Math.min(minRatio, value / base.toArray()[i]);
            maxRatio = Math.max(maxRatio, value / base.toArray()[i]);
          }
        }
        expect(maxChannel).toBeLessThan(1);
        expect(minRatio).toBeGreaterThan(0.75);
        expect(maxRatio).toBeLessThan(1.25);
      }
  });

  it('matches an independently calculated linear reference', () => {
    const color = foliageColor(42, tree, new Color(0.1, 0.2, 0.3), new Color());
    const expected = [0.10630318874015461, 0.2099736372397011, 0.31212612687389796];
    color.toArray().forEach((v, i) => expect(v).toBeCloseTo(expected[i], 14));
  });

  it('keys variation by kind and variant too, preserving the base', () => {
    const base = new Color(0.1, 0.2, 0.3),
      before = base.toArray();
    const colors = [0, 1, 2].flatMap((kind) =>
      [0, 1].map((variant) =>
        foliageColor(
          42,
          { ...tree, kind: kind as 0 | 1 | 2, variant: variant as 0 | 1 },
          base,
          new Color(),
        )
          .toArray()
          .join(','),
      ),
    );
    expect(new Set(colors).size).toBe(6);
    expect(base.toArray()).toEqual(before);
  });

  it('preserves retained colors across reorder, insertion and removal with independent buffers', () => {
    const map = result(),
      trees = [tree, { ...tree, cellIndex: 2 }, { ...tree, cellIndex: 3 }];
    const forests = [trees, [trees[2], { ...tree, cellIndex: 1 }, trees[0]], [trees[0]]].map(
      (trees) => terrainForest({ ...map, trees }, 42),
    );
    try {
      const buffers = forests.map((f) => f.groups[0].crowns.instanceColor!);
      const read = (b: (typeof buffers)[number], i: number) =>
        Array.from(b.array.slice(i * 3, i * 3 + 3));
      expect(buffers[0].array).not.toBe(buffers[1].array);
      expect(read(buffers[0], 0)).toEqual(read(buffers[1], 2));
      expect(read(buffers[0], 2)).toEqual(read(buffers[1], 0));
      expect(read(buffers[0], 0)).toEqual(read(buffers[2], 0));
      expect(read(buffers[0], 0)).toEqual(Array.from(new Float32Array(rgb(0))));
    } finally {
      forests.forEach((f) => f.dispose());
    }
  });

  it('uses the linear base once and preserves trunk materials and instance transforms', () => {
    const forest = terrainForest({ ...result(), trees: [tree] }, 42);
    try {
      const { trunks, crowns } = forest.groups[0];
      expect(crowns.material.color.toArray()).toEqual([1, 1, 1]);
      expect(trunks.material.color.getHex()).toBe(0x756047);
      expect(trunks.instanceColor).toBeNull();
      const expected = new Matrix4()
        .makeRotationY(tree.rotation)
        .scale(new Vector3().setScalar(tree.scale))
        .setPosition(tree.x - 0.5, tree.y, tree.z - 0.5);
      expect(Array.from(trunks.instanceMatrix.array)).toEqual(
        Array.from(new Float32Array(expected.elements)),
      );
      expect(crowns.instanceMatrix.array).toEqual(trunks.instanceMatrix.array);
      expect(crowns.instanceColor!.array).toEqual(new Float32Array(rgb(0)));
    } finally {
      forest.dispose();
    }
  });

  it('bounds color storage to 12 bytes per tree at the cap', () => {
    const forest = terrainForest(
      {
        ...result(),
        trees: Array.from({ length: MAX_TREES }, (_, cellIndex) => ({ ...tree, cellIndex })),
      },
      42,
    );
    try {
      const buffer = forest.groups[0].crowns.instanceColor!;
      expect(buffer.itemSize).toBe(3);
      expect(buffer.array).toBeInstanceOf(Float32Array);
      expect(buffer.array.byteLength).toBe(196608);
      expect(forest.groups).toHaveLength(1);
    } finally {
      forest.dispose();
    }
  });

  it('disposes both meshes when color setup fails', () => {
    const disposed: InstancedMesh[] = [];
    const dispose = vi.spyOn(InstancedMesh.prototype, 'dispose').mockImplementation(function (
      this: InstancedMesh,
    ) {
      disposed.push(this);
    });
    const geometry = vi.spyOn(BufferGeometry.prototype, 'dispose');
    const material = vi.spyOn(MeshLambertMaterial.prototype, 'dispose');
    const color = vi.spyOn(InstancedMesh.prototype, 'setColorAt').mockImplementation(() => {
      throw Error('color failure');
    });
    try {
      expect(() => terrainForest({ ...result(), trees: [tree] }, 42)).toThrow('color failure');
      expect(disposed).toHaveLength(2);
      expect(disposed[0]).not.toBe(disposed[1]);
      expect(geometry).toHaveBeenCalledTimes(2);
      expect(material).toHaveBeenCalledTimes(2);
    } finally {
      color.mockRestore();
      dispose.mockRestore();
      geometry.mockRestore();
      material.mockRestore();
    }
  });
});
