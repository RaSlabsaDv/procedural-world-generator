import { Matrix4 } from 'three';
import { decodeTerrain, compareTerrains } from '../data/terrain.contract';
import { terrainForest } from './terrain-forest';
import { testTerrain, testWire, testMap } from '../testing/terrain-test-fixture';
import { MAX_TREES, TreeKindId } from '../data/terrain.models';

function fixture() {
  const request = { ...testMap, width: 2, height: 2 };
  const terrain = testTerrain(request),
    wire = testWire(terrain);
  wire.result.values = [1, 2, 3, 4];
  wire.result.biomes.fill(2);
  wire.result.vegetationDensity.fill(1);
  const tree = { cellIndex: 0, x: 0.25, y: 1.75, z: 0.25, scale: 1, rotation: 0, kind: 0 };
  return { request, terrain, wire: { ...wire, result: { ...wire.result, trees: [tree] } } };
}

describe('landscape forest contract and instancing', () => {
  it('normalizes independent environment arrays and immutable tree records', () => {
    const { request, terrain, wire } = fixture();
    const result = decodeTerrain(wire, request, terrain).result;
    expect(result.moisture).toBeInstanceOf(Float32Array);
    wire.result.moisture[0] = 0;
    wire.result.trees[0].x = 0.9;
    expect(result.moisture[0]).toBeCloseTo(0.6);
    expect(result.trees[0].x).toBe(0.25);
    expect(Object.isFrozen(result.trees[0])).toBe(true);
  });

  it('rejects corrupt environmental fields, instance records and budgets', () => {
    for (const mutate of [
      (w: ReturnType<typeof fixture>['wire']) => {
        w.result.moisture[3] = NaN;
      },
      (w: ReturnType<typeof fixture>['wire']) => {
        w.result.temperature = [0];
      },
      (w: ReturnType<typeof fixture>['wire']) => {
        w.result.slope[0] = -1;
      },
      (w: ReturnType<typeof fixture>['wire']) => {
        w.result.biomes[0] = 0;
      },
      (w: ReturnType<typeof fixture>['wire']) => {
        w.result.trees[0].y = 9;
      },
      (w: ReturnType<typeof fixture>['wire']) => {
        w.result.trees[0].cellIndex = 1;
      },
      (w: ReturnType<typeof fixture>['wire']) => {
        w.result.trees[0].scale = 99;
      },
      (w: ReturnType<typeof fixture>['wire']) => {
        w.result.trees.push({ ...w.result.trees[0] });
      },
      (w: ReturnType<typeof fixture>['wire']) => {
        w.result.trees = Array(MAX_TREES + 1).fill(w.result.trees[0]);
      },
    ]) {
      const { request, terrain, wire } = fixture();
      mutate(wire);
      expect(() => decodeTerrain(wire, request, terrain)).toThrow();
    }
  });

  it.each([undefined, null, 3, -1, 0.5, '0', 1, 2])(
    'rejects missing, unsupported or biome-inconsistent kind %j',
    (kind) => {
      const { request, terrain, wire } = fixture();
      Object.assign(wire.result.trees[0], { kind });
      expect(() => decodeTerrain(wire, request, terrain)).toThrow();
    },
  );

  it('compares categories exactly even when placements agree', () => {
    const { request, terrain, wire } = fixture();
    const a = {
      request,
      terrain,
      response: decodeTerrain(wire, request, terrain),
      requestMs: 1,
      initMs: null,
    };
    const b = {
      ...a,
      response: {
        ...a.response,
        result: {
          ...a.response.result,
          trees: [{ ...a.response.result.trees[0], kind: 1 as const }],
        },
      },
    };
    expect(compareTerrains(a, b).vegetationMismatchCount).toBe(1);
  });

  it('renders all categories with at most six meshes and disposes every group', () => {
    const { request, terrain, wire } = fixture();
    const map = decodeTerrain(wire, request, terrain).result;
    const forest = terrainForest({
      ...map,
      trees: [0, 1, 2].map((kind) => ({ ...map.trees[0], kind: kind as TreeKindId })),
    });
    expect(forest.groups.map((group) => group.kind)).toEqual([0, 1, 2]);
    const spies = forest.groups.flatMap(({ trunks, crowns }) =>
      [trunks, crowns].flatMap((mesh) => [
        vi.spyOn(mesh, 'dispose'),
        vi.spyOn(mesh.geometry, 'dispose'),
        vi.spyOn(mesh.material, 'dispose'),
      ]),
    );
    expect(forest.groups.flatMap(({ trunks, crowns }) => [trunks.count, crowns.count])).toEqual([
      1, 1, 1, 1, 1, 1,
    ]);
    forest.dispose();
    for (const spy of spies) expect(spy).toHaveBeenCalledTimes(1);
    expect(terrainForest({ ...map, trees: [] }).groups).toEqual([]);
  });

  it('compares environmental and tree differences independently of height agreement', () => {
    const { request, terrain, wire } = fixture();
    const run = () => ({
      request,
      terrain,
      response: decodeTerrain(wire, request, terrain),
      requestMs: 1,
      initMs: null,
    });
    const a = run(),
      b = run();
    b.response.result.moisture[3] = 0.2;
    expect(compareTerrains(a, b)).toMatchObject({
      numericMatch: false,
      environmentMismatchCount: 1,
      mismatchCount: 0,
    });
    const c = run();
    const altered = {
      ...c,
      response: {
        ...c.response,
        result: { ...c.response.result, trees: [{ ...c.response.result.trees[0], rotation: 1 }] },
      },
    };
    expect(compareTerrains(a, altered)).toMatchObject({
      numericMatch: false,
      vegetationMismatchCount: 1,
    });
  });

  it('creates two shared instanced meshes rooted at the Core terrain surface', () => {
    const { request, terrain, wire } = fixture();
    const response = decodeTerrain(wire, request, terrain);
    const forest = terrainForest(response.result);
    const matrix = new Matrix4();
    forest.groups[0].trunks.getMatrixAt(0, matrix);
    expect(forest.groups[0].trunks.count).toBe(1);
    expect(forest.groups[0].crowns.count).toBe(1);
    expect(matrix.elements.slice(12, 15)).toEqual([-0.25, 1.75, -0.25]);
    const geometry = vi.spyOn(forest.groups[0].trunks.geometry, 'dispose'),
      material = vi.spyOn(forest.groups[0].crowns.material, 'dispose');
    forest.dispose();
    expect(geometry).toHaveBeenCalledTimes(1);
    expect(material).toHaveBeenCalledTimes(1);
    expect(() =>
      terrainForest({
        ...response.result,
        trees: Array(MAX_TREES + 1).fill(response.result.trees[0]),
      }),
    ).toThrow(/budget/);
  });
});
