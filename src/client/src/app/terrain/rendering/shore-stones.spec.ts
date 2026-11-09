import {
  BufferAttribute,
  BufferGeometry,
  InstancedMesh,
  ShaderLib,
  Scene,
  MeshLambertMaterial,
  Matrix4,
  Quaternion,
  Vector3,
} from 'three';
import { testMap, testTerrain, testWire } from '../testing/terrain-test-fixture';
import { decodeTerrain } from '../data/terrain-decoder';
import { terrainGeometry } from './terrain-geometry';
import { inlandBankWetness } from './inland-bank-wetness';
import { shoreWaterIndex } from './shore-water-index';
import { placeShoreStones, shoreGround, SHORE_STONES as S } from './shore-stone-placement';
import { shoreStoneGeometry, shoreStoneMaterial, shoreStones } from './shore-stones';

function fixture(w = 65, h = 49, stripes = false) {
  const map = { ...testMap, width: w, height: h },
    request = testTerrain(map);
  const r = decodeTerrain(testWire(request), map, request).result;
  r.biomes.fill(1);
  r.values.fill(0.1);
  r.surfaceWeights.fill(0);
  for (let i = 0; i < w * h; i++) r.surfaceWeights[i * 5] = 1;
  const t = terrainGeometry(r),
    water = new BufferGeometry();
  const p = new Float32Array(w * h * 3),
    indices: number[] = [];
  for (let z = 0; z < h; z++)
    for (let x = 0; x < w; x++) {
      const i = z * w + x;
      p.set([x - (w - 1) / 2, 0, z - (h - 1) / 2], i * 3);
      if (z < h - 1 && x < w - 1 && (stripes ? x % 4 === 2 : x === Math.floor(w / 2)))
        indices.push(i, i + w, i + 1, i + 1, i + w, i + w + 1);
    }
  water.setAttribute('position', new BufferAttribute(p, 3));
  water.setIndex(indices);
  t.setAttribute('bankWetness', inlandBankWetness(t, w, h, [water]));
  return {
    r,
    t,
    water,
    dispose: () => {
      t.dispose();
      water.dispose();
    },
  };
}
it('queries actual emitted triangles, finite local support and interpolated water height', () => {
  const f = fixture(9, 7),
    index = shoreWaterIndex(9, 7, [f.water]);
  expect(index.sample(4.5, 2.5).distance).toBe(0);
  expect(index.sample(3.5, 2.5).distance).toBeCloseTo(0.5);
  expect(index.sample(3.5, 2.5).level).toBe(0);
  expect(index.sample(0, 0).distance).toBe(Infinity);
  const p = f.water.getAttribute('position');
  for (let i = 0; i < p.count; i++) p.setY(i, p.getX(i) * 0.1);
  expect(index.sample(4.5, 2.5).level).toBeCloseTo(0.05);
  f.dispose();
});
it('produces repeatable irregular, sparse transforms without changing source buffers', () => {
  const f = fixture(),
    snapshot = JSON.stringify(f.r),
    before = f.water.getAttribute('position').array.slice();
  const a = placeShoreStones(42, f.r, f.t, [f.water]),
    b = placeShoreStones(42, f.r, f.t, [f.water]),
    c = placeShoreStones(-2147483648, f.r, f.t, [f.water]);
  expect(a.records.length).toBeGreaterThan(100);
  expect(a.records).toEqual(b.records);
  expect(a.records).not.toEqual(c.records);
  expect([...a.records].every(Number.isFinite)).toBe(true);
  const radii = new Set(),
    yaw = new Set(),
    fractionalX = new Set(),
    kinds = new Set();
  const sample = { y: 0, nx: 0, ny: 1, nz: 0, wet: 0 },
    contact = shoreWaterIndex(f.r.width, f.r.height, [f.water]);
  for (let o = 0; o < a.records.length; o += S.stride) {
    const r = a.records,
      x = r[o],
      z = r[o + 2];
    expect(shoreGround(f.r, f.t.getAttribute('bankWetness') as BufferAttribute, x, z, sample)).toBe(
      true,
    );
    expect(r[o + 1]).toBeCloseTo(sample.y, 6);
    expect(contact.sample(x, z).distance).toBeGreaterThanOrEqual(S.minDistance - 1e-5);
    expect(contact.sample(x, z).distance).toBeLessThanOrEqual(S.reach + 1e-5);
    radii.add(r[o + 3]);
    yaw.add(r[o + 9]);
    fractionalX.add((x % 1).toFixed(3));
    kinds.add(r[o + 11]);
    for (let other = 0; other < o; other += S.stride)
      expect(Math.hypot(x - r[other], z - r[other + 2]) + 1e-5).toBeGreaterThanOrEqual(
        1.2 * (r[o + 3] + r[other + 3]),
      );
  }
  expect(radii.size).toBeGreaterThan(10);
  expect(yaw.size).toBeGreaterThan(10);
  expect(fractionalX.size).toBeGreaterThan(10);
  expect(kinds.has(0)).toBe(true);
  expect(kinds.has(1)).toBe(true);
  expect(a.large).toBeLessThanOrEqual(S.maxLarge);
  expect(JSON.stringify(f.r)).toBe(snapshot);
  expect(f.water.getAttribute('position').array).toEqual(before);
  f.dispose();
});
it.each(['snow', 'ocean', 'steep', 'submerged', 'high', 'dry'] as const)(
  'excludes %s ground and unsupported empty surfaces',
  (kind) => {
    const f = fixture();
    if (kind === 'snow')
      for (let i = 0; i < f.r.values.length; i++) f.r.surfaceWeights[i * 5 + 4] = 0.1;
    if (kind === 'ocean') f.r.biomes.fill(0);
    if (kind === 'steep') for (let i = 0; i < f.r.values.length; i++) f.r.values[i] = i % f.r.width;
    if (kind === 'submerged') f.r.values.fill(-1);
    if (kind === 'high') f.r.values.fill(2);
    if (kind === 'dry') f.t.getAttribute('bankWetness').array.fill(0);
    expect(placeShoreStones(42, f.r, f.t, [f.water]).records.length).toBe(0);
    expect(placeShoreStones(42, f.r, f.t, [undefined]).scratchBytes).toBe(0);
    f.dispose();
  },
);
it('avoids existing rock envelopes and tree trunks', () => {
  const f = fixture(),
    base = placeShoreStones(42, f.r, f.t, [f.water]),
    x = base.records[0],
    z = base.records[2];
  const result = {
    ...f.r,
    rocks: [
      {
        cellIndex: 0,
        x,
        y: 0.1,
        z,
        scaleX: 2,
        scaleY: 1,
        scaleZ: 1,
        rotation: 0,
        groundY: 0.1,
        kind: 0 as const,
        variant: 0 as const,
      },
    ],
    trees: [
      {
        cellIndex: 1,
        x: x + 1,
        y: 0.1,
        z: z + 5,
        scale: 2,
        rotation: 0,
        kind: 0 as const,
        variant: 0 as const,
      },
    ],
  };
  const placed = placeShoreStones(42, result, f.t, [f.water]);
  for (let o = 0; o < placed.records.length; o += S.stride) {
    const r = placed.records;
    expect(Math.hypot(r[o] - x, r[o + 2] - z) + 1e-5).toBeGreaterThanOrEqual(2.12 + 1.2 * r[o + 3]);
    expect(Math.hypot(r[o] - x - 1, r[o + 2] - z - 5) + 1e-5).toBeGreaterThanOrEqual(
      0.25 + 1.2 * r[o + 3],
    );
  }
  expect(placed.checks).toBeGreaterThan(0);
  f.dispose();
});
it('bounds maximum-map selection, large stones, scratch and instance buffers', () => {
  const f = fixture(512, 512, true),
    selection = placeShoreStones(-7, f.r, f.t, [f.water]);
  expect(selection.records.length / S.stride).toBe(S.maxCount);
  expect(selection.large).toBeLessThanOrEqual(S.maxLarge);
  expect(selection.candidates).toBeLessThanOrEqual(2 * 511 * 511);
  const triangles = f.water.index!.count / 3;
  expect(selection.scratchBytes).toBeLessThanOrEqual(
    4 * 512 * 512 + 4 * triangles + 4 * 256 * 256 + 16 * 4096 + 2 * 52 * 4096,
  );
  f.dispose();
}, 15000);
it('owns two bounded batches, stays grounded and cleans independent previews exactly once', () => {
  const f = fixture(),
    a = shoreStones(42, f.r, f.t, [f.water]),
    b = shoreStones(42, f.r, f.t, [f.water]),
    scene = new Scene();
  expect(a.meshes.length).toBe(2);
  expect(a.stats.instanceBytes).toBe(a.stats.count * 76);
  expect(a.stats.geometryBytes).toBeLessThan(16384);
  const matrix = new Matrix4(),
    position = new Vector3(),
    normal = new Vector3();
  for (const mesh of a.meshes) {
    expect(mesh.castShadow).toBe(false);
    expect(mesh.receiveShadow).toBe(true);
    scene.add(mesh);
    for (let i = 0; i < mesh.count; i++) {
      mesh.getMatrixAt(i, matrix);
      position.setFromMatrixPosition(matrix);
      normal.setFromMatrixColumn(matrix, 1);
      expect(position.y).toBeCloseTo(0.1 - S.embed * normal.length(), 6);
    }
  }
  const spies = a.meshes.map((m) => [
    vi.spyOn(m, 'dispose'),
    vi.spyOn(m.geometry, 'dispose'),
    vi.spyOn(m.material, 'dispose'),
  ]);
  expect(a.meshes[0].geometry).not.toBe(b.meshes[0].geometry);
  a.dispose();
  a.dispose();
  expect(scene.children).toHaveLength(0);
  for (const group of spies) for (const spy of group) expect(spy).toHaveBeenCalledTimes(1);
  expect(b.meshes[0].count).toBeGreaterThan(0);
  b.dispose();
  f.dispose();
});
it('releases owned batches after setup failure and allocates no empty-shore meshes', () => {
  const f = fixture(),
    geometry = vi.spyOn(BufferGeometry.prototype, 'dispose'),
    material = vi.spyOn(MeshLambertMaterial.prototype, 'dispose'),
    instance = vi.spyOn(InstancedMesh.prototype, 'dispose');
  const fail = vi
    .spyOn(InstancedMesh.prototype, 'computeBoundingSphere')
    .mockImplementationOnce(() => {
      throw Error('bounds');
    });
  expect(() => shoreStones(42, f.r, f.t, [f.water])).toThrow('bounds');
  expect(geometry).toHaveBeenCalled();
  expect(material).toHaveBeenCalled();
  expect(instance).toHaveBeenCalled();
  fail.mockRestore();
  const empty = shoreStones(42, f.r, f.t, []);
  expect(empty.meshes).toHaveLength(0);
  empty.dispose();
  vi.restoreAllMocks();
  f.dispose();
});
it('composes distance fade with normal Lambert lighting without alpha or emissive output', () => {
  for (const large of [false, true]) {
    const m = shoreStoneMaterial(large),
      s = {
        uniforms: {} as Record<string, { value: number }>,
        vertexShader: ShaderLib.lambert.vertexShader,
        fragmentShader: ShaderLib.lambert.fragmentShader,
      };
    m.onBeforeCompile(s as never, null as never);
    expect(s.uniforms['shoreFadeFar'].value).toBe(large ? 130 : 65);
    expect(s.vertexShader).toContain('instanceMatrix');
    expect(s.fragmentShader).toContain('discard');
    expect(m.transparent).toBe(false);
    expect(m.emissive.getHex()).toBe(0);
    m.dispose();
    const g = shoreStoneGeometry(large);
    expect(g.boundingBox!.min.y).toBe(0);
    expect(g.boundingBox!.max.y).toBeCloseTo(1);
    g.dispose();
  }
});

it('disposes geometry when silhouette setup itself fails', () => {
  const disposal = vi.spyOn(BufferGeometry.prototype, 'dispose');
  const failure = vi
    .spyOn(BufferGeometry.prototype, 'computeBoundingSphere')
    .mockImplementationOnce(() => {
      throw Error('geometry bounds');
    });
  expect(() => shoreStoneGeometry(false)).toThrow('geometry bounds');
  expect(disposal).toHaveBeenCalledTimes(1);
  failure.mockRestore();
  disposal.mockRestore();
});

it('keeps every tilted silhouette inside its conservative horizontal support envelope', () => {
  const normal = new Vector3(0.55, 1, 0).normalize(),
    up = new Vector3(0, 1, 0);
  const tilt = new Quaternion().setFromUnitVectors(up, normal),
    yaw = new Quaternion(),
    point = new Vector3();
  for (const large of [false, true]) {
    const geometry = shoreStoneGeometry(large),
      p = geometry.getAttribute('position');
    for (let angle = 0; angle < 12; angle++) {
      yaw.setFromAxisAngle(up, (angle * Math.PI) / 6);
      for (let i = 0; i < p.count; i++) {
        point.fromBufferAttribute(p, i);
        point.y *= 0.65;
        point.applyQuaternion(yaw).applyQuaternion(tilt);
        expect(Math.hypot(point.x, point.z)).toBeLessThanOrEqual(S.footprintScale);
        expect(point.dot(normal)).toBeGreaterThanOrEqual(-1e-7);
      }
    }
    geometry.dispose();
  }
});
it('supports the minimum rectangle and creates no batches on ineligible shores', () => {
  const small = fixture(2, 2),
    empty = shoreStones(1, small.r, small.t, [small.water]);
  expect(empty.meshes).toHaveLength(0);
  empty.dispose();
  small.dispose();
  const f = fixture(17, 5);
  f.r.values.fill(2);
  const high = shoreStones(1, f.r, f.t, [f.water]);
  expect(high.meshes).toHaveLength(0);
  high.dispose();
  f.dispose();
});
