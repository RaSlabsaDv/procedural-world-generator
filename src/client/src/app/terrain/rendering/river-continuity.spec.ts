import { BufferGeometry } from 'three';
import { testMap, testTerrain, testWire } from '../testing/terrain-test-fixture';
import { decodeTerrain } from '../data/terrain-decoder';
import { inlandWaterGeometry } from './inland-water-geometry';
import { shoreWaterIndex } from './shore-water-index';
function fixture(
  w = 9,
  h = 7,
  edges: number[][] = [
    [20, 30],
    [30, 40],
  ],
) {
  const map = { ...testMap, width: w, height: h },
    request = testTerrain(map),
    base = decodeTerrain(testWire(request), map, request).result;
  base.values.fill(5);
  base.biomes.fill(1);
  for (const [a, b] of edges) base.hydrology.receiverIndex[a] = b;
  const cells = [...new Set(edges.flat())].sort((a, b) => a - b);
  return {
    ...base,
    rivers: {
      ...base.rivers,
      cellIndices: Int32Array.from(cells),
      widths: new Float32Array(cells.length).fill(0.6),
    },
    channels: {
      ...base.channels,
      waterSurfaceHeight: new Float32Array(cells.length).fill(5.1),
      segmentState: Uint8Array.from(cells, (c) => (edges.some((e) => e[0] === c) ? 1 : 3)),
    },
  };
}
it.each([
  [
    [20, 30],
    [30, 40],
  ], // previously missing NW–SE center
  [
    [22, 30],
    [30, 38],
  ], // existing NE–SW diagonal
  [
    [20, 21],
    [21, 31],
    [31, 40],
  ], // bend
  [
    [20, 30],
    [22, 30],
    [30, 40],
  ], // confluence
])('keeps narrow flat supported paths continuous: %j', (...edges) => {
  const r = fixture(9, 7, edges as number[][]),
    before = JSON.stringify(r),
    owner = inlandWaterGeometry(r, 0);
  for (const [a, b] of edges as number[][])
    for (let k = 1; k < 64; k++) {
      const t = k / 64,
        x = (a % 9) * (1 - t) + (b % 9) * t,
        z = Math.floor(a / 9) * (1 - t) + Math.floor(b / 9) * t;
      expect(owner.riverSurfaceAt(x, z)).toBeGreaterThanOrEqual(5);
    }
  expect(JSON.stringify(r)).toBe(before);
  owner.dispose();
});
it('returns exactly emitted heights, including bank taper and cell boundaries', () => {
  const r = fixture(),
    owner = inlandWaterGeometry(r, 0),
    g = owner.river!,
    p = g.getAttribute('position'),
    idx = g.index!;
  for (let k = 0; k < idx.count; k += 3) {
    const a = idx.getX(k),
      b = idx.getX(k + 1),
      c = idx.getX(k + 2);
    const x = (p.getX(a) + p.getX(b) + p.getX(c)) / 3 + 4,
      z = (p.getZ(a) + p.getZ(b) + p.getZ(c)) / 3 + 3;
    expect(owner.riverSurfaceAt(x, z)).toBeCloseTo((p.getY(a) + p.getY(b) + p.getY(c)) / 3, 5);
  }
  const actual = shoreWaterIndex(9, 7, [g]);
  for (let z = 1; z < 6; z += 0.125)
    for (let x = 1; x < 8; x += 0.125) {
      const q = actual.sample(x, z);
      expect(owner.riverSurfaceAt(x, z) >= 0).toBe(q.distance < 1e-7);
    }
  owner.dispose();
  expect(owner.riverSurfaceAt(3, 3)).toBe(-1);
});
it('preserves actual terrain barriers and unsupported routes instead of bridging them', () => {
  const r = fixture(9, 7, [[20, 30]]);
  // The real terrain diagonal crosses the high off-route corners, despite low endpoints.
  r.values[21] = 7;
  r.values[29] = 7;
  const blocked = inlandWaterGeometry(r, 0);
  expect(blocked.riverSurfaceAt(2.5, 2.5)).toBe(-1);
  blocked.dispose();
  r.channels.segmentState.fill(0);
  const absent = inlandWaterGeometry(r, 0);
  expect(absent.river).toBeUndefined();
  expect(absent.stats.supported).toBe(0);
  absent.dispose();
});
it('bounds finite buffers on a maximum rectangular map and retains no center arrays without exposed edges', () => {
  const r = fixture(512, 511, [
      [1026, 1539],
      [1539, 2052],
    ]),
    owner = inlandWaterGeometry(r, 0),
    n = 512 * 511;
  expect(owner.stats.fieldBytes).toBeLessThanOrEqual(69 * n + 4);
  expect(owner.stats.bytes).toBeLessThanOrEqual(340 * 4 * n);
  for (const a of Object.values(owner.river!.attributes))
    expect([...a.array].every(Number.isFinite)).toBe(true);
  for (const i of owner.river!.index!.array)
    expect(i).toBeLessThan(owner.river!.getAttribute('position').count);
  owner.dispose();
  r.channels.segmentState.fill(0);
  const absent = inlandWaterGeometry(r, 0);
  expect(absent.stats.fieldBytes).toBeLessThanOrEqual(25 * n);
  absent.dispose();
});
it('releases refined geometry exactly once, including failed construction', () => {
  const r = fixture(),
    owner = inlandWaterGeometry(r, 0),
    spy = vi.spyOn(owner.river!, 'dispose');
  owner.dispose();
  owner.dispose();
  expect(spy).toHaveBeenCalledTimes(1);
  const dispose = vi.spyOn(BufferGeometry.prototype, 'dispose'),
    fail = vi
      .spyOn(BufferGeometry.prototype, 'computeBoundingSphere')
      .mockImplementationOnce(() => {
        throw Error('bounds');
      });
  expect(() => inlandWaterGeometry(r, 0)).toThrow('bounds');
  expect(dispose).toHaveBeenCalled();
  fail.mockRestore();
  dispose.mockRestore();
});

it('retains a continuous zero-depth visual film on flat supported channels', () => {
  const r = fixture();
  r.channels.waterSurfaceHeight.fill(5);
  const owner = inlandWaterGeometry(r, 0);
  for (let t = 0.02; t < 1; t += 0.02)
    expect(owner.riverSurfaceAt(2 + t, 2 + t)).toBeGreaterThan(5);
  owner.dispose();
});
it('keeps exact midpoint precision when bed and water interpolate between adjacent floats', () => {
  const r = fixture(9, 7, [[20, 30]]),
    upper = Math.fround(5.000000476837158);
  for (let i = 0; i < r.values.length; i++) r.values[i] = i % 9 <= 2 ? 5 : upper;
  r.channels.waterSurfaceHeight[0] = 5;
  r.channels.waterSurfaceHeight[1] = upper;
  const owner = inlandWaterGeometry(r, 0);
  expect(owner.riverSurfaceAt(2.5, 2.5)).toBeGreaterThan(5);
  owner.dispose();
});
