import { Matrix4, ShaderLib, Vector3 } from 'three';
import { testWire } from '../testing/terrain-test-fixture';
import {
  GRASS,
  grassHash,
  grassPoint,
  newGrassSample,
  placeGrass,
  sampleGrass,
} from './grass-placement';
import { grassMaterial, terrainGrass } from './terrain-grass';
import type { TerrainResponse } from '../data/terrain.models';

function map(width = 33, height = 25): TerrainResponse['result'] {
  const n = width * height,
    weights = new Float32Array(n * 5);
  for (let i = 0; i < n; i++) weights[i * 5] = 1;
  return {
    ...testWire().result,
    width,
    height,
    values: new Float32Array(n),
    biomes: new Uint8Array(n).fill(1),
    slope: new Float32Array(n),
    moisture: new Float32Array(n),
    temperature: new Float32Array(n),
    vegetationDensity: new Float32Array(n),
    surfaceWeights: weights,
    trees: [],
    rocks: [],
  };
}
it('grounds rectangular triangles with the terrain diagonal and deterministic tie', () => {
  const r = map(3, 2);
  r.values.set([0, 0.2, 0.3, 0.1, 0.6, 0.4]);
  const p = newGrassSample();
  expect(sampleGrass(r, 0.25, 0.25, p)).toBe(true);
  expect(p.y).toBeCloseTo(0.075, 7);
  sampleGrass(r, 0.75, 0.75, p);
  expect(p.y).toBeCloseTo(0.375, 7);
  sampleGrass(r, 0.5, 0.5, p);
  expect(p.y).toBeCloseTo(0.15, 7);
  sampleGrass(r, 2, 1, p);
  expect(p.y).toBeCloseTo(0.4, 7);
});
it('is deterministic with signed seeds and independent storage, without mutating source fields', () => {
  const r = map(),
    before = r.surfaceWeights.slice(),
    a = placeGrass(-2147483648, r),
    b = placeGrass(-2147483648, r),
    c = placeGrass(2147483647, r);
  expect(a.ids).toEqual(b.ids);
  expect(a.ids.buffer).not.toBe(b.ids.buffer);
  expect(a.ids).not.toEqual(c.ids);
  expect(r.surfaceWeights).toEqual(before);
  expect(a.ids.length).toBeGreaterThan(0);
  expect(grassHash(-1, 20, 7)).toBeGreaterThanOrEqual(0);
});
it.each([0, 4, 8])('places nothing in excluded biome %j', (biome) => {
  const r = map();
  r.biomes.fill(biome);
  expect(placeGrass(42, r).ids.length).toBe(0);
});
it.each([1, 2, 3, 4])('places nothing on non-grass surface channel %j', (channel) => {
  const r = map();
  r.surfaceWeights.fill(0);
  for (let i = 0; i < r.values.length; i++) r.surfaceWeights[i * 5 + channel] = 1;
  expect(placeGrass(42, r).ids.length).toBe(0);
});
it('rejects steep supplied slopes and steep actual triangles', () => {
  const r = map();
  r.slope.fill(0.6);
  expect(placeGrass(42, r).ids.length).toBe(0);
  r.slope.fill(0);
  for (let z = 0; z < r.height; z++)
    for (let x = 0; x < r.width; x++) r.values[z * r.width + x] = x;
  expect(placeGrass(42, r).ids.length).toBe(0);
});
it('keeps bounded priority selection distributed across a maximum map', () => {
  const r = map(512, 512),
    a = placeGrass(42, r),
    again = placeGrass(42, r),
    quadrants = [0, 0, 0, 0],
    p = { x: 0, z: 0 };
  expect(a.candidates).toBeLessThanOrEqual(GRASS.maxCandidates);
  expect(a.ids.length).toBe(GRASS.maxTufts);
  expect(a.ids).toEqual(again.ids);
  expect(a.scratchBytes).toBeLessThan(1024 * 1024);
  expect(a.obstacleChecks).toBeLessThanOrEqual(a.candidates * 64);
  for (const id of a.ids) {
    grassPoint(42, id, a.grid, p);
    quadrants[(p.x >= 255.5 ? 1 : 0) + (p.z >= 255.5 ? 2 : 0)]++;
  }
  for (const count of quadrants) expect(count).toBeGreaterThan(GRASS.maxTufts * 0.2);
  // Retained priority selection must include later strata, not the first32768 IDs.
  expect(a.ids[a.ids.length - 1]).toBeGreaterThan(a.candidates * 0.95);
});
it('excludes conservative trunk/rock circles and bounds crowded queries', () => {
  const r = { ...map() };
  r.trees = [{ cellIndex: 0, kind: 0, variant: 0, x: 12, y: 0, z: 12, scale: 1, rotation: 0 }];
  r.rocks = [
    {
      cellIndex: 0,
      kind: 0,
      variant: 0,
      x: 20,
      y: 0,
      z: 12,
      scaleX: 2,
      scaleY: 1,
      scaleZ: 1,
      groundY: 0,
      rotation: 0,
    },
  ];
  const a = placeGrass(7, r),
    p = { x: 0, z: 0 };
  for (const id of a.ids) {
    grassPoint(7, id, a.grid, p);
    expect(Math.hypot(p.x - 12, p.z - 12)).toBeGreaterThanOrEqual(0.315);
    expect(Math.hypot(p.x - 20, p.z - 12)).toBeGreaterThanOrEqual(2.32);
  }
  r.trees = Array.from({ length: 1000 }, (_, i) => ({
    ...r.trees[0],
    x: 10 + (i % 2) * 0.01,
    z: 10,
  }));
  const crowded = placeGrass(7, r);
  expect(crowded.obstacleChecks).toBeLessThanOrEqual(crowded.candidates * 64);
  expect(crowded.crowded).toBeGreaterThan(0);
});
it('builds finite bounded transforms on minimum/rectangular maps and owns its resources', () => {
  for (const [w, h] of [
    [2, 2],
    [33, 25],
  ]) {
    const r = map(w, h),
      owner = terrainGrass(w === 2 ? 9 : 42, r);
    expect(owner.mesh).toBeDefined();
    const mesh = owner.mesh!;
    expect(mesh.castShadow).toBe(false);
    expect(mesh.receiveShadow).toBe(true);
    expect(mesh.material.emissive.getHex()).toBe(0);
    expect(mesh.count).toBeLessThanOrEqual(GRASS.maxTufts);
    expect(mesh.geometry.index!.count / 3).toBe(9);
    const matrix = new Matrix4(),
      p = { x: 0, z: 0 },
      sample = newGrassSample(),
      geometryBox = mesh.geometry.boundingBox!;
    for (let i = 0; i < mesh.count; i++) {
      mesh.getMatrixAt(i, matrix);
      expect(matrix.elements.every(Number.isFinite)).toBe(true);
      grassPoint(w === 2 ? 9 : 42, owner.selection.ids[i], owner.selection.grid, p);
      sampleGrass(r, p.x, p.z, sample);
      expect(matrix.elements[13]).toBeCloseTo(sample.y - GRASS.embed, 5);
      const bounds = geometryBox.clone().applyMatrix4(matrix);
      expect(mesh.boundingBox!.containsBox(bounds)).toBe(true);
    }
    const geometry = vi.spyOn(mesh.geometry, 'dispose'),
      material = vi.spyOn(mesh.material, 'dispose'),
      instances = vi.spyOn(mesh, 'dispose');
    owner.dispose();
    owner.dispose();
    expect(geometry).toHaveBeenCalledTimes(1);
    expect(material).toHaveBeenCalledTimes(1);
    expect(instances).toHaveBeenCalledTimes(1);
  }
});
it('keeps opaque distance dithering before shading with no texture or animation', () => {
  const material = grassMaterial(),
    shader = {
      uniforms: {},
      vertexShader: ShaderLib.lambert.vertexShader,
      fragmentShader: ShaderLib.lambert.fragmentShader,
    };
  material.onBeforeCompile(shader as never, null as never);
  expect(material.transparent).toBe(false);
  expect(material.depthWrite).toBe(true);
  expect(shader.vertexShader).toContain('grassAnchor');
  expect(shader.fragmentShader.indexOf('grassBayer')).toBeLessThan(
    shader.fragmentShader.indexOf('#include <lights_lambert_fragment>'),
  );
  expect(shader.fragmentShader).not.toContain('uniform sampler');
  material.dispose();
});

it('caps slope alignment and reproduces independent transform/color buffers', () => {
  const r = map(17, 13);
  for (let z = 0; z < r.height; z++)
    for (let x = 0; x < r.width; x++) r.values[z * r.width + x] = 0.4 * x + 0.1 * z;
  const a = terrainGrass(14, r),
    b = terrainGrass(14, r);
  expect(a.mesh).toBeDefined();
  expect(a.mesh!.instanceMatrix.array).toEqual(b.mesh!.instanceMatrix.array);
  expect(a.mesh!.instanceMatrix.array.buffer).not.toBe(b.mesh!.instanceMatrix.array.buffer);
  expect(a.mesh!.instanceColor!.array).toEqual(b.mesh!.instanceColor!.array);
  const matrix = new Matrix4(),
    up = new Vector3(),
    p = { x: 0, z: 0 },
    sample = newGrassSample();
  for (let i = 0; i < a.mesh!.count; i++) {
    a.mesh!.getMatrixAt(i, matrix);
    up.set(matrix.elements[4], matrix.elements[5], matrix.elements[6]).normalize();
    expect(Math.acos(Math.min(1, up.y))).toBeCloseTo(GRASS.maxTilt, 5);
    grassPoint(14, a.selection.ids[i], a.selection.grid, p);
    sampleGrass(r, p.x, p.z, sample);
    expect(matrix.elements[13]).toBeCloseTo(sample.y - GRASS.embed, 5);
    expect(matrix.elements[12]).toBeCloseTo(p.x - (r.width - 1) / 2, 5);
    expect(matrix.elements[14]).toBeCloseTo(p.z - (r.height - 1) / 2, 5);
  }
  a.dispose();
  b.dispose();
});
