import { TestBed } from '@angular/core/testing';
import {
  Mesh,
  BoxGeometry,
  MeshLambertMaterial,
  Scene,
  Texture,
  NoColorSpace,
  RepeatWrapping,
} from 'three';
import { oceanGeometry } from './ocean-geometry';
import { oceanMaterial } from './ocean-material';
import { loadOceanNormal } from './ocean-normal';
import { terrainLighting } from './terrain-lighting';
import { DEFAULT_OCEAN_SETTINGS as D, OceanSettingsService } from './ocean-settings.service';
import { testMap } from '../testing/terrain-test-fixture';

function fixture(width = 2, height = 2) {
  return {
    width,
    height,
    values: new Float32Array(width * height),
    biomes: new Uint8Array(width * height),
  };
}
function triangles(
  geometry: NonNullable<ReturnType<typeof oceanGeometry>>,
  limit = geometry.drawRange.count,
) {
  const p = geometry.getAttribute('position'),
    i = geometry.index!.array;
  const rows = [];
  for (let k = 0; k < Math.min(limit, geometry.drawRange.count); k += 3)
    rows.push([i[k], i[k + 1], i[k + 2]].map((n) => [p.getX(n), p.getY(n), p.getZ(n)]));
  return rows;
}
it('clips shoreline triangles at exact height intersections and interpolates depth without changing source', () => {
  const r = fixture();
  r.values.set([0, 2, 2, 2]);
  r.biomes.set([0, 1, 1, 1]);
  const g = oceanGeometry(r, 1)!;
  expect(g.drawRange.count).toBe(3);
  expect(triangles(g)[0]).toEqual(
    expect.arrayContaining([
      [-0.5, 1, -0.5],
      [0, 1, -0.5],
      [-0.5, 1, 0],
    ]),
  );
  expect([...g.getAttribute('waterDepth').array].filter((x) => x > 0)).toEqual([1]);
  expect([...r.values]).toEqual([0, 2, 2, 2]);
  expect([...r.biomes]).toEqual([0, 1, 1, 1]);
  g.dispose();
});
it('protects disconnected below-sea vertices including ambiguous diagonal connectivity', () => {
  const r = fixture();
  r.values.set([2, 0, 0, 2]);
  r.biomes.set([1, 0, 1, 1]);
  expect(oceanGeometry(r, 1)).toBeUndefined();
  r.biomes.fill(1);
  expect(oceanGeometry(r, 1)).toBeUndefined();
});
it.each([
  [2, 2, 0],
  [3, 2, 2],
  [512, 512, 30],
])('handles all-Ocean %j/%j/%j without false edge foam or geometry budget growth', (w, h, sea) => {
  const r = fixture(w, h),
    g = oceanGeometry(r, sea)!;
  expect(g.drawRange.count).toBe((w - 1) * (h - 1) * 6);
  expect([...g.getAttribute('shoreDistance').array].every((v) => v === 8)).toBe(true);
  const bytes =
    Object.values(g.attributes).reduce((sum, a) => sum + a.array.byteLength, 0) +
    g.index!.array.byteLength;
  expect(bytes).toBeLessThanOrEqual(32 * 1024 * 1024);
  expect(g.index!.array).toBeInstanceOf(Uint32Array);
  expect(g.index!.array.every((i) => i < g.getAttribute('position').count)).toBe(true);
  for (const t of triangles(g, 60)) {
    expect(t.every((p) => p[1] === sea)).toBe(true);
    const [a, b, c] = t;
    expect((b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2])).toBeGreaterThan(0);
  }
  g.dispose();
});
it('keeps equality without degenerate triangles and shares canonical clipped edge vertices', () => {
  const r = fixture();
  r.values.set([0, 1, 1, 2]);
  r.biomes.set([0, 0, 0, 1]);
  const g = oceanGeometry(r, 1)!;
  expect(g.drawRange.count).toBe(3);
  g.dispose();
  const s = fixture();
  s.values.set([0, 0, 0, 2]);
  s.biomes.set([0, 0, 0, 1]);
  const a = oceanGeometry(s, 1)!;
  expect(a.drawRange.count).toBe(9);
  expect(a.getAttribute('position').count).toBe(6);
  a.dispose();
});
it('validates shared water settings atomically and resets', () => {
  const service = TestBed.inject(OceanSettingsService);
  expect(service.settings()).toBe(D);
  for (const input of [
    { ...D, turbidity: NaN },
    { ...D, turbidity: 0 },
    { ...D, turbidity: 3 },
    { ...D, foam: -1 },
    { ...D, foam: 2 },
    { ...D, color: 'red' },
    { ...D, extra: 0 },
  ]) {
    expect(() => service.set(input)).toThrow(RangeError);
    expect(service.settings()).toBe(D);
  }
  service.set({ color: '#11AA22', turbidity: 0.8, foam: 0.1 });
  expect(service.settings().color).toBe('#11aa22');
  expect(Object.isFrozen(service.settings())).toBe(true);
  service.reset();
  expect(service.settings()).toBe(D);
});
it('loads linear repeated normal data and disposes late completion/failure safely', async () => {
  const texture = new Texture(),
    dispose = vi.spyOn(texture, 'dispose');
  let resolve!: (t: Texture) => void;
  const owner = loadOceanNormal(
    () =>
      new Promise((r) => {
        resolve = r;
      }),
  );
  owner.dispose();
  resolve(texture);
  await expect(owner.ready).rejects.toThrow(/water normal/);
  expect(dispose).toHaveBeenCalledTimes(1);
  const value = new Texture(),
    live = loadOceanNormal(async () => value);
  await live.ready;
  expect(value.colorSpace).toBe(NoColorSpace);
  expect(value.wrapS).toBe(RepeatWrapping);
  live.dispose();
  live.dispose();
  await expect(
    loadOceanNormal(async () => {
      throw Error('missing');
    }).ready,
  ).rejects.toThrow(/water normal/);
});
it('binds shared environment with depth/transmission/reflection and guarded sun math', () => {
  const scene = new Scene(),
    mesh = new Mesh(new BoxGeometry(), new MeshLambertMaterial());
  const light = terrainLighting(scene, { shadowMap: {} } as never, testMap, mesh, []);
  const normal = new Texture(),
    material = oceanMaterial(normal, light.uniforms, D);
  expect(material.uniforms['environmentSunDirection']).toBe(light.uniforms.environmentSunDirection);
  expect(material.uniforms['normalMap'].value).toBe(normal);
  expect(material.transparent).toBe(true);
  expect(material.depthWrite).toBe(false);
  expect(material.fragmentShader).toContain('exp(-max(0.0,vDepth)*turbidity)');
  expect(material.fragmentShader).toContain('(A+F)'); // Alpha includes Fresnel rather than depth alone.
  material.dispose();
  light.dispose();
  normal.dispose();
  mesh.geometry.dispose();
  mesh.material.dispose();
});
