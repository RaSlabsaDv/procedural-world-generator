import { Matrix4, Scene, Mesh, BoxGeometry, MeshLambertMaterial } from 'three';
import { decodeTerrain, compareTerrains } from '../data/terrain.contract';
import { MAX_ROCKS, RockInstance, RockKindId, RockVariantId } from '../data/terrain.models';
import {
  testTerrain,
  testWire,
  testMap,
  testSurfaceWeights,
} from '../testing/terrain-test-fixture';
import { terrainRocks } from './terrain-rocks';
import { terrainLighting } from './terrain-lighting';

function fixture() {
  const request = { ...testMap, width: 3, height: 2 };
  const terrain = testTerrain(request),
    wire = testWire(terrain);
  wire.result.values.fill(1);
  wire.result.biomes.fill(1);
  wire.result.surfaceWeights = testSurfaceWeights(wire.result.biomes);
  const rock: RockInstance = {
    cellIndex: 0,
    x: 0.5,
    y: Math.fround(0.96),
    z: 0.5,
    scaleX: Math.fround(0.3),
    scaleY: Math.fround(0.4),
    scaleZ: Math.fround(0.25),
    rotation: 0,
    groundY: 1,
    kind: 0,
    variant: 0,
  };
  return { request, terrain, wire: { ...wire, result: { ...wire.result, rocks: [rock] } } };
}

it('requires rocks, exact members, valid finite transforms, support, IDs and budget', () => {
  const { request, terrain, wire } = fixture();
  const rock = wire.result.rocks[0];
  for (const rocks of [
    undefined,
    null,
    {},
    [null],
    [{ ...rock, extra: 0 }],
    [{ ...rock, scaleX: '0.3' }],
    [{ ...rock, y: NaN }],
    [{ ...rock, x: Infinity }],
    [{ ...rock, scaleZ: 0.5 }],
    [{ ...rock, scaleX: 0.36 + 1e-7 }],
    [{ ...rock, scaleY: 0 }],
    [{ ...rock, variant: 2 }],
    [{ ...rock, kind: '0' }],
    [{ ...rock, cellIndex: 2 }],
    [{ ...rock, cellIndex: -1 }],
    [{ ...rock, rotation: -1 }],
    [{ ...rock, x: 0.1 }],
    [{ ...rock, groundY: 5 }],
    [{ ...rock, y: 2 }],
    [rock, rock],
    Array(MAX_ROCKS + 1).fill(rock),
  ])
    expect(() =>
      decodeTerrain({ ...wire, result: { ...wire.result, rocks } }, request, terrain),
    ).toThrow();
  const { groundY, ...missing } = rock;
  expect(() =>
    decodeTerrain({ ...wire, result: { ...wire.result, rocks: [missing] } }, request, terrain),
  ).toThrow();
  wire.result.biomes[1] = 0;
  wire.result.surfaceWeights = testSurfaceWeights(wire.result.biomes);
  expect(() => decodeTerrain(wire, request, terrain)).toThrow();
});

it('normalizes independent immutable records and permits embedded origins below dry zero ground', () => {
  const { request, terrain, wire } = fixture();
  wire.result.values.fill(0);
  wire.result.rocks[0] = { ...wire.result.rocks[0], y: Math.fround(-0.04), groundY: 0 };
  const result = decodeTerrain(wire, request, terrain).result;
  expect(Object.isFrozen(result.rocks)).toBe(true);
  expect(Object.isFrozen(result.rocks[0])).toBe(true);
  wire.result.rocks[0] = { ...wire.result.rocks[0], kind: 1 };
  expect(result.rocks[0].kind).toBe(0);
});

it('compares every rock transform, category, variant and index independently', () => {
  const { request, terrain, wire } = fixture();
  const a = {
    request,
    terrain,
    response: decodeTerrain(wire, request, terrain),
    requestMs: 1,
    initMs: null,
  };
  for (const field of [
    'x',
    'y',
    'z',
    'scaleX',
    'scaleY',
    'scaleZ',
    'rotation',
    'groundY',
    'kind',
    'variant',
    'cellIndex',
  ] as const) {
    const changed = {
      ...a.response.result.rocks[0],
      [field]: a.response.result.rocks[0][field] + 0.1,
    };
    const b = {
      ...a,
      response: {
        ...a.response,
        result: { ...a.response.result, rocks: [changed] as RockInstance[] },
      },
    };
    expect(compareTerrains(a, b)).toMatchObject({
      numericMatch: false,
      rockMismatchCount: 1,
      mismatchCount: 0,
      vegetationMismatchCount: 0,
    });
  }
  expect(compareTerrains(a, a).rockMismatchCount).toBe(0);
  expect(
    compareTerrains(a, {
      ...a,
      response: { ...a.response, result: { ...a.response.result, rocks: [] } },
    }).rockMismatchCount,
  ).toBe(1);
});

it('renders all six groups with complete supplied matrices and idempotent disposal', () => {
  const { request, terrain, wire } = fixture();
  const result = decodeTerrain(wire, request, terrain).result;
  const rocks = [0, 1, 2].flatMap((kind) =>
    [0, 1].map((variant) => ({
      ...result.rocks[0],
      kind: kind as RockKindId,
      variant: variant as RockVariantId,
    })),
  );
  const rendered = terrainRocks({ ...result, rocks });
  expect(rendered.meshes.length).toBe(6);
  const spies = rendered.meshes.flatMap((m) => [
    vi.spyOn(m, 'dispose'),
    vi.spyOn(m.geometry, 'dispose'),
    vi.spyOn(m.material, 'dispose'),
  ]);
  const matrix = new Matrix4();
  rendered.meshes[0].getMatrixAt(0, matrix);
  expect(matrix.elements.slice(12, 15)).toEqual([-0.5, Math.fround(0.96), 0]);
  expect(matrix.elements[0]).toBe(Math.fround(0.3));
  expect(matrix.elements[5]).toBe(Math.fround(0.4));
  for (const mesh of rendered.meshes) {
    expect(mesh.count).toBe(1);
    expect(mesh.castShadow && mesh.receiveShadow).toBe(true);
    const positions = mesh.geometry.getAttribute('position');
    for (let i = 0; i < positions.count; i++)
      expect(
        Math.hypot(positions.getX(i), positions.getY(i), positions.getZ(i)),
      ).toBeLessThanOrEqual(1 + 1e-7);
    mesh.computeBoundingBox();
    expect(mesh.boundingBox!.max.y).toBeGreaterThan(0.96);
  }
  const scene = new Scene(),
    terrainMesh = new Mesh(new BoxGeometry(), new MeshLambertMaterial());
  scene.add(terrainMesh, ...rendered.meshes);
  const lighting = terrainLighting(
    scene,
    { shadowMap: {} as never },
    request,
    terrainMesh,
    rendered.meshes,
  );
  expect(lighting.bounds.min.y).toBeLessThanOrEqual(0.96 - 0.4 * 0.85);
  expect(rendered.meshes.every((m) => m.receiveShadow)).toBe(true);
  lighting.dispose();
  terrainMesh.geometry.dispose();
  terrainMesh.material.dispose();
  rendered.dispose();
  rendered.dispose();
  for (const spy of spies) expect(spy).toHaveBeenCalledTimes(1);
  expect(terrainRocks({ ...result, rocks: [] }).meshes).toEqual([]);
  expect(() => terrainRocks({ ...result, rocks: Array(MAX_ROCKS + 1).fill(rocks[0]) })).toThrow(
    /budget/,
  );
});
