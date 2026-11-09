import { decodeTerrain } from '../data/terrain-decoder';
import { testMap, testTerrain, testWire } from '../testing/terrain-test-fixture';
import { inlandWaterGeometry } from './inland-water-geometry';
import { terrainGeometry } from './terrain-geometry';
import { BufferAttribute, BufferGeometry } from 'three';
import { inlandBankWetness } from './inland-bank-wetness';

function ground(w = 9, h = 7) {
  const g = new BufferGeometry(),
    p = new Float32Array(w * h * 3),
    n = new Float32Array(w * h * 3);
  for (let i = 0; i < w * h; i++) {
    p.set([(i % w) - (w - 1) / 2, 0.1, Math.floor(i / w) - (h - 1) / 2], i * 3);
    n[i * 3 + 1] = 1;
  }
  g.setAttribute('position', new BufferAttribute(p, 3));
  g.setAttribute('normal', new BufferAttribute(n, 3));
  g.setAttribute('biomeId', new BufferAttribute(new Uint8Array(w * h).fill(1), 1));
  return g;
}
function triangle(w = 9, h = 7, y = 0) {
  const g = new BufferGeometry();
  g.setAttribute(
    'position',
    new BufferAttribute(
      Float32Array.from([
        3 - (w - 1) / 2,
        y,
        2 - (h - 1) / 2,
        3 - (w - 1) / 2,
        y,
        3 - (h - 1) / 2,
        4 - (w - 1) / 2,
        y,
        2 - (h - 1) / 2,
      ]),
      3,
    ),
  );
  g.setIndex([0, 1, 2]);
  return g;
}
it('uses exact emitted triangle distances with finite narrow falloff and max overlap', () => {
  const t = ground(),
    water = triangle(),
    before = t.getAttribute('position').array.slice();
  const a = inlandBankWetness(t, 9, 7, [water]);
  const twice = inlandBankWetness(t, 9, 7, [water, water]);
  expect([...a.array]).toEqual([...twice.array]);
  expect(a.getX(2 * 9 + 3)).toBeGreaterThan(a.getX(2 * 9 + 2));
  expect(a.getX(2 * 9 + 2)).toBeGreaterThan(0);
  expect(a.getX(2 * 9 + 1)).toBe(0);
  expect(a.getX(4 * 9 + 5)).toBe(0); // diagonal distance sqrt(4.5) > reach
  expect([...a.array].every((x) => Number.isFinite(x) && x >= 0 && x <= 1)).toBe(true);
  expect(t.getAttribute('position').array).toEqual(before);
  expect(a.array).not.toBe(t.getAttribute('position').array);
  t.dispose();
  water.dispose();
});
it('rejects Ocean, deeply submerged, high and steep vertices without spreading across ridges', () => {
  const t = ground(),
    water = triangle(),
    i = 2 * 9 + 3;
  const p = t.getAttribute('position'),
    n = t.getAttribute('normal'),
    biome = t.getAttribute('biomeId');
  for (const height of [-1, 0.66, 30]) {
    p.setY(i, height);
    expect(inlandBankWetness(t, 9, 7, [water]).getX(i)).toBe(0);
  }
  p.setY(i, 0.1);
  n.setY(i, 0.3);
  expect(inlandBankWetness(t, 9, 7, [water]).getX(i)).toBe(0);
  n.setY(i, 1);
  biome.setX(i, 0);
  expect(inlandBankWetness(t, 9, 7, [water]).getX(i)).toBe(0);
  biome.setX(i, 1);
  expect(inlandBankWetness(t, 9, 7, [water]).getX(i)).toBeGreaterThan(0);
  t.dispose();
  water.dispose();
});
it('handles no emitted water, degenerate triangles and independently owned maximum/rectangular fields', () => {
  for (const [w, h] of [
    [2, 2],
    [17, 3],
    [512, 512],
  ]) {
    const t = ground(w, h),
      water = triangle(w, h);
    const a = inlandBankWetness(t, w, h, []),
      b = inlandBankWetness(t, w, h, [undefined]);
    expect(a.array.byteLength).toBe(4 * w * h);
    expect([...a.array].every((x) => x === 0)).toBe(true);
    expect(a.array).not.toBe(b.array);
    const p = water.getAttribute('position');
    p.setXYZ(2, p.getX(0), p.getY(0), p.getZ(0));
    expect([...inlandBankWetness(t, w, h, [water]).array]).toEqual([...a.array]);
    t.dispose();
    water.dispose();
  }
});
it('interpolates sloped water heights and gives smooth vertical attenuation', () => {
  const t = ground(),
    water = triangle(),
    p = t.getAttribute('position'),
    i = 2 * 9 + 3;
  p.setY(i, 0);
  const at = inlandBankWetness(t, 9, 7, [water]).getX(i);
  p.setY(i, 0.325);
  const half = inlandBankWetness(t, 9, 7, [water]).getX(i);
  expect(at).toBe(1);
  expect(half).toBeCloseTo(0.5);
  water.getAttribute('position').setY(0, 0.325);
  expect(inlandBankWetness(t, 9, 7, [water]).getX(i)).toBeCloseTo(1);
  t.dispose();
  water.dispose();
});

it('does not seed banks from unsupported canonical routes or unselected depressions', () => {
  const map = { ...testMap, width: 7, height: 7 },
    request = testTerrain(map);
  const result = decodeTerrain(testWire(request), map, request).result;
  result.values.fill(5);
  result.biomes.fill(1);
  result.hydrology.receiverIndex[24] = 25;
  result.hydrology.depressionDepth[24] = 2;
  const r = {
    ...result,
    rivers: { ...result.rivers, cellIndices: new Int32Array([24]), widths: new Float32Array([2]) },
    channels: {
      ...result.channels,
      waterSurfaceHeight: new Float32Array([5.2]),
      segmentState: new Uint8Array([0]),
    },
  };
  const owner = inlandWaterGeometry(r, 0),
    t = terrainGeometry(r);
  expect(owner.river).toBeUndefined();
  expect(owner.lake).toBeUndefined();
  expect(
    [...inlandBankWetness(t, 7, 7, [owner.lake, owner.river]).array].every((x) => x === 0),
  ).toBe(true);
  t.dispose();
  owner.dispose();
});

it('joins distinct overlapping lake/river-like footprints without accumulating darkness', () => {
  const t = ground(),
    a = triangle(),
    b = triangle();
  b.translate(1, 0, 0.5);
  const one = inlandBankWetness(t, 9, 7, [a]),
    two = inlandBankWetness(t, 9, 7, [b]);
  const both = inlandBankWetness(t, 9, 7, [a, b]);
  for (let i = 0; i < both.count; i++)
    expect(both.getX(i)).toBe(Math.max(one.getX(i), two.getX(i)));
  t.dispose();
  a.dispose();
  b.dispose();
});
