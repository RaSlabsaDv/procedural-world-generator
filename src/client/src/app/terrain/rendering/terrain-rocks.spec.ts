import { Matrix4, Scene, Mesh, BoxGeometry, MeshLambertMaterial, Raycaster, Vector3 } from 'three';
import { decodeTerrain, compareTerrains } from '../data/terrain.contract';
import { MAX_ROCKS, RockInstance, RockKindId, RockVariantId } from '../data/terrain.models';
import {
  testTerrain,
  testWire,
  testMap,
  testSurfaceWeights,
} from '../testing/terrain-test-fixture';
import { terrainRocks, rockGeometry } from './terrain-rocks';
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
    y: Math.fround(0.952),
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
    [{ ...rock, scaleX: 3 + 1e-6 }],
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
  wire.result.rocks[0] = { ...wire.result.rocks[0], y: Math.fround(-0.048), groundY: 0 };
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
  expect(matrix.elements.slice(12, 15)).toEqual([-0.5, Math.fround(0.952), 0]);
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
    expect(mesh.boundingBox!.max.y).toBeGreaterThan(0.952);
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
  expect(lighting.bounds.min.y).toBeLessThanOrEqual(0.952 - 0.4 * 0.85);
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

it('checks multi-cell footprints including interior peaks and distant Ocean corners', () => {
  const request = { ...testMap, width: 7, height: 7 };
  const terrain = testTerrain(request),
    raw = testWire(terrain);
  const wire = { ...raw, result: { ...raw.result, rocks: [] as RockInstance[] } };
  wire.result.values.fill(1);
  wire.result.biomes.fill(1);
  wire.result.surfaceWeights = testSurfaceWeights(wire.result.biomes);
  const rock: RockInstance = {
    cellIndex: 24,
    x: 3.5,
    z: 3.5,
    y: Math.fround(1 - 0.12 * 2),
    groundY: 1,
    scaleX: 2,
    scaleY: 2,
    scaleZ: 1.5,
    rotation: 0,
    kind: 0,
    variant: 0,
  };
  wire.result.rocks = [rock];
  expect(decodeTerrain(wire, request, terrain).result.rocks[0].scaleX).toBe(2);
  // This vertex is inside the large footprint, outside its center quad.
  wire.result.values[2 * 7 + 2] = 8;
  expect(() => decodeTerrain(wire, request, terrain)).toThrow();
  wire.result.values.fill(1);
  wire.result.biomes[2 * 7 + 2] = 0;
  wire.result.surfaceWeights = testSurfaceWeights(wire.result.biomes);
  expect(() => decodeTerrain(wire, request, terrain)).toThrow();
  wire.result.biomes.fill(1);
  wire.result.surfaceWeights = testSurfaceWeights(wire.result.biomes);
  wire.result.rocks = [{ ...rock, kind: 2 }];
  expect(() => decodeTerrain(wire, request, terrain)).toThrow();
  const scree: RockInstance = {
    ...rock,
    kind: 2,
    scaleX: Math.fround(0.65),
    scaleY: Math.fround(0.4),
    scaleZ: 0.5,
    y: Math.fround(1 - 0.12 * Math.fround(0.4)),
  };
  wire.result.rocks = [scree];
  expect(decodeTerrain(wire, request, terrain).result.rocks).toHaveLength(1);
  wire.result.rocks = [{ ...scree, scaleY: Math.fround(0.4) + 1e-9 }];
  expect(() => decodeTerrain(wire, request, terrain)).toThrow();
});

it('keeps six distinct closed silhouettes within support and vertex budgets', () => {
  const silhouettes = new Set<string>();
  let bytes = 0;
  for (const kind of [0, 1, 2])
    for (const variant of [0, 1]) {
      const geometry = rockGeometry(kind, variant),
        mesh = new Mesh(geometry, new MeshLambertMaterial());
      mesh.updateMatrixWorld();
      const hits = new Raycaster(new Vector3(0, 2, 0), new Vector3(0, -1, 0)).intersectObject(mesh);
      expect(hits.length).toBeGreaterThan(0);
      expect(hits[0].point.y).toBeGreaterThanOrEqual(0.7);
      const position = geometry.getAttribute('position');
      for (let i = 0; i < position.count; i++)
        expect(
          Math.hypot(position.getX(i), position.getY(i), position.getZ(i)),
        ).toBeLessThanOrEqual(1 + 1e-7);
      silhouettes.add(JSON.stringify([...position.array]));
      for (const attribute of Object.values(geometry.attributes))
        bytes += attribute.array.byteLength;
      geometry.dispose();
      mesh.material.dispose();
    }
  expect(silhouettes.size).toBe(6);
  expect(bytes).toBeLessThanOrEqual(64 * 1024);
});

it('fits shadows to actual large transformed rock bounds', () => {
  const { request, terrain, wire } = fixture();
  const result = decodeTerrain(wire, request, terrain).result;
  const rendered = terrainRocks({
    ...result,
    rocks: [{ ...result.rocks[0], y: 29, scaleX: 3, scaleY: 3.2, scaleZ: 2 }],
  });
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
  rendered.meshes[0].computeBoundingBox();
  expect(lighting.bounds.max.y).toBeGreaterThan(request.heightMultiplier);
  expect(lighting.bounds.max.y).toBeGreaterThanOrEqual(rendered.meshes[0].boundingBox!.max.y);
  lighting.dispose();
  rendered.dispose();
  terrainMesh.geometry.dispose();
  terrainMesh.material.dispose();
});
