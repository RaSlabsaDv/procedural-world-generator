import {
  BufferAttribute,
  BufferGeometry,
  InstancedMesh,
  MeshLambertMaterial,
  Matrix4,
  ShaderLib,
  Scene,
} from 'three';
import { testMap, testTerrain, testWire } from '../testing/terrain-test-fixture';
import { decodeTerrain } from '../data/terrain-decoder';
import { terrainGeometry } from './terrain-geometry';
import { inlandWaterGeometry } from './inland-water-geometry';
import { inlandBankWetness } from './inland-bank-wetness';
import { shoreWaterIndex } from './shore-water-index';
import { placeReeds, reedSiteSampler, newReedSite, REEDS as R } from './reed-placement';
import { inlandReeds, reedGeometry, reedMaterial } from './inland-reeds';
import { shoreStones } from './shore-stones';

function fixture(w = 65, h = 49, stripes = false) {
  const map = { ...testMap, width: w, height: h },
    request = testTerrain(map);
  const original = decodeTerrain(testWire(request), map, request).result;
  original.biomes.fill(1);
  original.values.fill(0.1);
  original.surfaceWeights.fill(0);
  for (let i = 0; i < w * h; i++) original.surfaceWeights[i * 5] = 1;
  let count = 0;
  for (let z = 1; z < h - 1; z++)
    for (let x = 1; x < w - 1; x++)
      if (stripes ? x % 8 === 3 : x === Math.floor(w / 2)) {
        const i = z * w + x;
        original.values[i] = -0.1;
        original.lakes.lakeIdByCell[i] = 0;
        count++;
      }
  const r = {
    ...original,
    lakes: {
      ...original.lakes,
      basins: count
        ? [{ id: 0, waterLevel: 0, cellCount: count, primarySpillFrom: 0, primarySpillTo: 1 }]
        : [],
    },
  };
  const water = inlandWaterGeometry(r, 0),
    t = terrainGeometry(r);
  const surfaces = [water.lake, water.river];
  t.setAttribute('bankWetness', inlandBankWetness(t, w, h, surfaces));
  return {
    r,
    t,
    water,
    surfaces,
    dispose: () => {
      t.dispose();
      water.dispose();
    },
  };
}
it('accepts damp banks and shallow roots only with an actual nearby dry-bank witness', () => {
  const f = fixture(),
    wet = f.t.getAttribute('bankWetness') as BufferAttribute;
  const sample = reedSiteSampler(f.r, wet, shoreWaterIndex(65, 49, f.surfaces)),
    out = newReedSite();
  expect(sample(31.4, 20, out)).toBe(true);
  expect(out.depth).toBe(0);
  expect(sample(31.75, 20, out)).toBe(true);
  expect(out.depth).toBeGreaterThan(0);
  // Submerged grid centers without a wet-bank cue stay conservatively empty.
  expect(sample(32, 20, out)).toBe(false);
  expect(sample(0.5, 0.5, out)).toBe(false);
  // A wetness cue alone cannot turn a remote shallow surface into a shoreline.
  f.r.values.fill(-0.1);
  wet.array.fill(1);
  expect(sample(32, 20, out)).toBe(false);
  f.dispose();
});
it('gives reproducible irregular tufts, shallow/dry variation, immutable sources and supported roots', () => {
  const f = fixture(),
    before = JSON.stringify(f.r),
    positions = f.water.lake!.getAttribute('position').array.slice();
  const a = placeReeds(42, f.r, f.t, f.surfaces),
    b = placeReeds(42, f.r, f.t, f.surfaces),
    c = placeReeds(-2147483648, f.r, f.t, f.surfaces);
  expect(a.records.length).toBeGreaterThan(100);
  expect(a.records).toEqual(b.records);
  expect(a.records).not.toEqual(c.records);
  expect(a.submerged).toBeGreaterThan(0);
  expect(a.submerged).toBeLessThan(a.records.length / R.stride);
  const heights = new Set(),
    yaw = new Set(),
    fractions = new Set(),
    sample = reedSiteSampler(
      f.r,
      f.t.getAttribute('bankWetness') as BufferAttribute,
      shoreWaterIndex(65, 49, f.surfaces),
    ),
    site = newReedSite();
  for (let o = 0; o < a.records.length; o += R.stride) {
    const r = a.records;
    expect(sample(r[o], r[o + 2], site)).toBe(true);
    expect(r[o + 1]).toBeLessThanOrEqual(site.y);
    expect(site.y - r[o + 1]).toBeLessThanOrEqual(R.maxBedRange + R.embed + 1e-6);
    expect(r[o + 3]).toBeGreaterThanOrEqual(0.8);
    expect(r[o + 3]).toBeLessThanOrEqual(1.2 + 1e-6);
    expect(r[o + 4]).toBeGreaterThanOrEqual(1);
    expect(r[o + 4]).toBeLessThanOrEqual(1.65 + 1e-6);
    heights.add(r[o + 4]);
    yaw.add(r[o + 5]);
    fractions.add((r[o] % 1).toFixed(3));
    for (let j = 0; j < o; j += R.stride)
      expect(Math.hypot(r[o] - r[j], r[o + 2] - r[j + 2]) + 1e-5).toBeGreaterThanOrEqual(
        R.collisionRadius * (r[o + 3] + r[j + 3]) + 2 * R.clearance,
      );
  }
  expect([...a.records].every(Number.isFinite)).toBe(true);
  expect(heights.size).toBeGreaterThan(10);
  expect(yaw.size).toBeGreaterThan(10);
  expect(fractions.size).toBeGreaterThan(10);
  expect(JSON.stringify(f.r)).toBe(before);
  expect(f.water.lake!.getAttribute('position').array).toEqual(positions);
  f.dispose();
});
it.each(['deep', 'high', 'snow', 'ocean', 'steep', 'dry'] as const)(
  'rejects %s sites and empty unsupported water',
  (kind) => {
    const f = fixture();
    if (kind === 'deep') f.r.values.fill(-0.3);
    if (kind === 'high') f.r.values.fill(1);
    if (kind === 'snow')
      for (let i = 0; i < f.r.values.length; i++) f.r.surfaceWeights[i * 5 + 4] = 0.1;
    if (kind === 'ocean') f.r.biomes.fill(0);
    if (kind === 'steep') for (let i = 0; i < f.r.values.length; i++) f.r.values[i] = i % 65;
    if (kind === 'dry') f.t.getAttribute('bankWetness').array.fill(0);
    expect(placeReeds(42, f.r, f.t, f.surfaces).records.length).toBe(0);
    expect(placeReeds(42, f.r, f.t, []).scratchBytes).toBe(0);
    f.dispose();
  },
);
it('clears canonical rocks/trunks and actual decorative stone envelopes', () => {
  const f = fixture(),
    stones = shoreStones(42, f.r, f.t, f.surfaces),
    base = placeReeds(42, f.r, f.t, f.surfaces, stones.footprints);
  const x = base.records[0],
    z = base.records[2];
  expect(Number.isFinite(x)).toBe(true);
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
        x,
        y: 0.1,
        z: z + 5,
        scale: 2,
        rotation: 0,
        kind: 0 as const,
        variant: 0 as const,
      },
    ],
  };
  const a = placeReeds(42, result, f.t, f.surfaces, stones.footprints),
    r = a.records;
  for (let o = 0; o < r.length; o += R.stride) {
    const radius = R.collisionRadius * r[o + 3] + R.clearance;
    expect(Math.hypot(r[o] - x, r[o + 2] - z) + 1e-5).toBeGreaterThanOrEqual(2.12 + radius);
    expect(Math.hypot(r[o] - x, r[o + 2] - z - 5) + 1e-5).toBeGreaterThanOrEqual(0.25 + radius);
    for (let j = 0; j < stones.footprints.length; j += 3)
      expect(
        Math.hypot(r[o] - stones.footprints[j], r[o + 2] - stones.footprints[j + 1]) + 1e-5,
      ).toBeGreaterThanOrEqual(radius + stones.footprints[j + 2] + R.stoneClearance);
  }
  expect(a.checks).toBeGreaterThan(0);
  stones.dispose();
  f.dispose();
});
it('bounds the maximum map, scratch arrays and total selection', () => {
  const f = fixture(512, 512, true),
    a = placeReeds(-7, f.r, f.t, f.surfaces);
  expect(a.records.length / R.stride).toBe(R.maxCount);
  expect(a.candidates).toBeLessThanOrEqual(2 * 511 * 511);
  const triangles = (f.water.lake?.index?.count ?? 0) / 3;
  expect(a.scratchBytes).toBeLessThanOrEqual(
    4 * 512 * 512 + 4 * triangles + 4 * 256 * 256 + 16 * 2048 + 2 * 36 * 2048,
  );
  f.dispose();
}, 15000);
it('owns one static opaque batch, independent buffers and complete disposal', () => {
  const f = fixture(),
    a = inlandReeds(42, f.r, f.t, f.surfaces),
    b = inlandReeds(42, f.r, f.t, f.surfaces),
    scene = new Scene();
  expect(a.mesh).toBeDefined();
  expect(a.stats.instanceBytes).toBe(76 * a.stats.count);
  expect(a.stats.geometryBytes).toBeLessThanOrEqual(8192);
  expect(a.mesh!.castShadow).toBe(false);
  expect(a.mesh!.material.transparent).toBe(false);
  expect(a.mesh!.geometry).not.toBe(b.mesh!.geometry);
  const matrix = new Matrix4();
  a.mesh!.getMatrixAt(0, matrix);
  expect([...matrix.elements].every(Number.isFinite)).toBe(true);
  const spies = [
    vi.spyOn(a.mesh!, 'dispose'),
    vi.spyOn(a.mesh!.geometry, 'dispose'),
    vi.spyOn(a.mesh!.material, 'dispose'),
  ];
  scene.add(a.mesh!);
  a.dispose();
  a.dispose();
  expect(scene.children).toHaveLength(0);
  for (const spy of spies) expect(spy).toHaveBeenCalledTimes(1);
  b.dispose();
  f.dispose();
});
it('cleans partial setup and geometry failures, and creates no empty-shore mesh', () => {
  const f = fixture(),
    geo = vi.spyOn(BufferGeometry.prototype, 'dispose'),
    mat = vi.spyOn(MeshLambertMaterial.prototype, 'dispose'),
    mesh = vi.spyOn(InstancedMesh.prototype, 'dispose');
  const fail = vi
    .spyOn(InstancedMesh.prototype, 'computeBoundingSphere')
    .mockImplementationOnce(() => {
      throw Error('bounds');
    });
  expect(() => inlandReeds(42, f.r, f.t, f.surfaces)).toThrow('bounds');
  expect(geo).toHaveBeenCalled();
  expect(mat).toHaveBeenCalled();
  expect(mesh).toHaveBeenCalled();
  fail.mockRestore();
  expect(inlandReeds(42, f.r, f.t, []).mesh).toBeUndefined();
  vi.restoreAllMocks();
  f.dispose();
  const dispose = vi.spyOn(BufferGeometry.prototype, 'dispose'),
    failGeo = vi
      .spyOn(BufferGeometry.prototype, 'computeBoundingSphere')
      .mockImplementationOnce(() => {
        throw Error('geometry');
      });
  expect(() => reedGeometry()).toThrow('geometry');
  expect(dispose).toHaveBeenCalledTimes(1);
  failGeo.mockRestore();
  dispose.mockRestore();
});
it('keeps upright geometry within the root/collision budgets and composes Lambert distance fading', () => {
  const g = reedGeometry(),
    p = g.getAttribute('position');
  for (let i = 0; i < p.count; i++) {
    expect(Math.hypot(p.getX(i), p.getZ(i))).toBeLessThanOrEqual(R.collisionRadius);
    expect(p.getY(i)).toBeGreaterThanOrEqual(0);
    expect(p.getY(i)).toBeLessThanOrEqual(1);
  }
  // Stem tops meet seed heads at an edge, without coplanar colored faces.
  expect(p.getY(2)).toBe(p.getY(8));
  expect(p.getY(3)).toBe(p.getY(9));
  expect(p.getX(12)).toBeCloseTo(0.075 + 0.025 * 0.34, 6);
  const m = reedMaterial(),
    s = {
      vertexShader: ShaderLib.lambert.vertexShader,
      fragmentShader: ShaderLib.lambert.fragmentShader,
      uniforms: {} as Record<string, { value: number }>,
    };
  m.onBeforeCompile(s as never, null as never);
  expect(s.uniforms['reedFadeFar'].value).toBe(R.fadeFar);
  expect(s.vertexShader).toContain('instanceMatrix');
  expect(s.fragmentShader).toContain('discard');
  expect(m.emissive.getHex()).toBe(0);
  g.dispose();
  m.dispose();
});
it('handles minimum and narrow rectangles without water or floating edge roots', () => {
  for (const [w, h] of [
    [2, 2],
    [17, 3],
  ]) {
    const f = fixture(w, h),
      a = inlandReeds(42, f.r, f.t, f.surfaces);
    expect(a.stats.count).toBeLessThanOrEqual(R.maxCount);
    a.dispose();
    f.dispose();
  }
});
