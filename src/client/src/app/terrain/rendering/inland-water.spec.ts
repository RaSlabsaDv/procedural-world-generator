import { BufferGeometry, Scene, Texture, WebGLRenderer } from 'three';
import { inlandWaterGeometry } from './inland-water-geometry';
import { lakeSurfaceAt, visibleDecorations } from './lake-footprint';
import { decodeTerrain } from '../data/terrain-decoder';
import { testMap, testTerrain, testWire } from '../testing/terrain-test-fixture';
import { TerrainResponse } from '../data/terrain.models';
import { terrainScene } from './terrain-scene';
import { DEFAULT_OCEAN_SETTINGS } from './ocean-settings.service';
import { oceanMaterial } from './ocean-material';
import { terrainLighting } from './terrain-lighting';
import { Mesh, BoxGeometry, MeshLambertMaterial } from 'three';

function fixture(w = 7, h = 7): TerrainResponse['result'] {
  const request = { ...testMap, width: w, height: h },
    terrain = testTerrain(request);
  const result = decodeTerrain(testWire(terrain), request, terrain).result;
  result.biomes.fill(1);
  result.values.fill(5);
  return result;
}
function lakeFixture() {
  const r = fixture();
  for (let z = 2; z <= 4; z++)
    for (let x = 2; x <= 4; x++) {
      const i = z * r.width + x;
      r.values[i] = 4;
      r.lakes.lakeIdByCell[i] = 0;
      r.hydrology.depressionDepth[i] = 1;
    }
  return {
    ...r,
    lakes: {
      ...r.lakes,
      basins: [{ id: 0, waterLevel: 5, cellCount: 9, primarySpillFrom: 16, primarySpillTo: 9 }],
    },
  };
}
function valid(g: BufferGeometry) {
  const p = g.getAttribute('position');
  for (const attr of Object.values(g.attributes))
    expect(Array.from(attr.array).every(Number.isFinite)).toBe(true);
  for (const id of g.index!.array) expect(id).toBeLessThan(p.count);
  for (let k = 0; k < g.index!.count; k += 3) {
    const a = g.index!.getX(k),
      b = g.index!.getX(k + 1),
      c = g.index!.getX(k + 2);
    expect(
      (p.getZ(b) - p.getZ(a)) * (p.getX(c) - p.getX(a)) -
        (p.getX(b) - p.getX(a)) * (p.getZ(c) - p.getZ(a)),
    ).toBeGreaterThan(0);
  }
}
it('clips a flat lake to actual shorelines without hanging boundary edges or source changes', () => {
  const r = lakeFixture(),
    before = JSON.stringify(r),
    owner = inlandWaterGeometry(r, 0),
    g = owner.lake!;
  valid(g);
  const p = g.getAttribute('position');
  for (let i = 0; i < p.count; i++) expect(p.getY(i)).toBe(5);
  expect(lakeSurfaceAt(r, 3, 3)).toBe(5);
  expect(lakeSurfaceAt(r, 0, 0)).toBe(-1);
  expect(JSON.stringify(r)).toBe(before);
  const dispose = vi.spyOn(g, 'dispose');
  owner.dispose();
  owner.dispose();
  expect(dispose).toHaveBeenCalledTimes(1);
});
it('ends every external lake boundary at the terrain surface', () => {
  const owner = inlandWaterGeometry(lakeFixture(), 0),
    g = owner.lake!,
    p = g.getAttribute('position'),
    d = g.getAttribute('waterDepth');
  const edges = new Map<string, { count: number; depth: number }>();
  const key = (i: number) => [p.getX(i), p.getY(i), p.getZ(i)].map((n) => n.toFixed(5)).join(',');
  for (let k = 0; k < g.index!.count; k += 3)
    for (let e = 0; e < 3; e++) {
      const a = g.index!.getX(k + e),
        b = g.index!.getX(k + ((e + 1) % 3)),
        label = [key(a), key(b)].sort().join('/');
      const previous = edges.get(label);
      edges.set(label, {
        count: (previous?.count ?? 0) + 1,
        depth: Math.max(d.getX(a), d.getX(b)),
      });
    }
  for (const edge of edges.values()) if (edge.count === 1) expect(edge.depth).toBeLessThan(1e-5);
  owner.dispose();
});
it('keeps distinct lake levels separate and suppresses ambiguous touching triangles', () => {
  const r = fixture(9, 7);
  r.values.fill(7);
  r.values[20] = 4;
  r.values[24] = 5.5;
  r.lakes.lakeIdByCell[20] = 0;
  r.lakes.lakeIdByCell[24] = 1;
  const lakes = {
    ...r.lakes,
    basins: [
      { id: 0, waterLevel: 5, cellCount: 1, primarySpillFrom: 20, primarySpillTo: 11 },
      { id: 1, waterLevel: 6, cellCount: 1, primarySpillFrom: 24, primarySpillTo: 15 },
    ],
  };
  const owner = inlandWaterGeometry({ ...r, lakes }, 0),
    p = owner.lake!.getAttribute('position');
  expect(new Set(p.array.filter((_, i) => i % 3 === 1))).toEqual(new Set([5, 6]));
  valid(owner.lake!);
  owner.dispose();
  const mixed = { ...r, lakes: { ...lakes, lakeIdByCell: lakes.lakeIdByCell.slice() } };
  mixed.lakes.lakeIdByCell[21] = 1;
  mixed.values[21] = 5.5;
  expect(lakeSurfaceAt(mixed, 2.3, 2.1)).toBe(-1);
});
it('joins bends/confluences through one grounded, nonoverlapping field', () => {
  const r = fixture();
  for (let i = 0; i < r.values.length; i++) r.values[i] = 10 - Math.floor(i / 7) * 0.2;
  r.hydrology.receiverIndex[16] = 24;
  r.hydrology.receiverIndex[18] = 24;
  r.hydrology.receiverIndex[24] = 31;
  const rivers = {
    ...r.rivers,
    cellIndices: new Int32Array([16, 18, 24]),
    widths: new Float32Array([1, 1.2, 1.4]),
  };
  const owner = inlandWaterGeometry({ ...r, rivers }, 0);
  valid(owner.river!);
  expect(owner.stats.supported).toBe(3);
  expect(owner.stats.confluences).toBe(1);
  expect(owner.river!.getAttribute('waterFlow').count).toBe(
    owner.river!.getAttribute('position').count,
  );
  expect(owner.river!.getAttribute('normal').array.every(Number.isFinite)).toBe(true);
  owner.dispose();
});
it('suppresses uphill, unselected-depression and submerged edges', () => {
  for (const kind of ['uphill', 'depression', 'submerged']) {
    const r = kind === 'submerged' ? lakeFixture() : fixture();
    r.hydrology.receiverIndex[16] = 24;
    if (kind === 'uphill') r.values[24] = 6;
    if (kind === 'depression') r.hydrology.depressionDepth[24] = 1;
    const owner = inlandWaterGeometry(
      {
        ...r,
        rivers: { ...r.rivers, cellIndices: new Int32Array([16]), widths: new Float32Array([1]) },
      },
      0,
    );
    expect(owner.river).toBeUndefined();
    expect(owner.stats.suppressed).toBe(1);
    owner.dispose();
  }
});
it('connects admissible lake shores and ocean mouths without emitting under water', () => {
  const r = lakeFixture();
  r.hydrology.receiverIndex[9] = 16;
  let owner = inlandWaterGeometry(
    {
      ...r,
      rivers: { ...r.rivers, cellIndices: new Int32Array([9]), widths: new Float32Array([1]) },
    },
    0,
  );
  expect(owner.stats.connectors).toBe(1);
  valid(owner.river!);
  owner.dispose();
  const s = fixture();
  s.biomes[24] = 0;
  s.values[24] = 3;
  s.hydrology.receiverIndex[16] = 24;
  owner = inlandWaterGeometry(
    {
      ...s,
      rivers: { ...s.rivers, cellIndices: new Int32Array([16]), widths: new Float32Array([1]) },
    },
    4,
  );
  valid(owner.river!);
  expect(owner.stats.connectors).toBe(1);
  const p = owner.river!.getAttribute('position');
  for (let i = 0; i < p.count; i++) expect(p.getY(i)).toBeGreaterThanOrEqual(4);
  owner.dispose();
});
it.each([
  [2, 2],
  [17, 9],
  [512, 512],
])('handles empty and rectangular %ix%i maps with bounded storage', (w, h) => {
  const r = fixture(w, h),
    owner = inlandWaterGeometry(r, 0);
  expect(owner.lake).toBeUndefined();
  expect(owner.river).toBeUndefined();
  expect(owner.stats.bytes).toBe(0);
  owner.dispose();
});
it('filters underwater decoration without changing canonical lists', () => {
  const r = lakeFixture(),
    tree = {
      cellIndex: 24,
      x: 3,
      y: 4,
      z: 3,
      scale: 1,
      rotation: 0,
      kind: 0 as const,
      variant: 0 as const,
    };
  const rock = {
    cellIndex: 24,
    x: 3,
    y: 3,
    z: 3,
    scaleX: 1,
    scaleY: 1,
    scaleZ: 1,
    rotation: 0,
    kind: 0 as const,
    variant: 0 as const,
    groundY: 4,
  };
  const source = { ...r, trees: [tree], rocks: [rock, { ...rock, scaleY: 3 }] },
    visible = visibleDecorations(source);
  expect(visible.trees).toHaveLength(0);
  expect(visible.rocks).toHaveLength(1);
  expect(source.trees).toHaveLength(1);
  expect(source.rocks).toHaveLength(2);
});
it('owns inland-only scene updates, independence and cleanup', () => {
  const r = lakeFixture(),
    request = { ...testMap, width: 7, height: 7 },
    scene = new Scene();
  const textures = {
    grass: new Texture(),
    sand: new Texture(),
    rock: new Texture(),
    snow: new Texture(),
    soil: new Texture(),
  } as any;
  const renderer = {
    shadowMap: { enabled: false, type: 0 },
    capabilities: { maxTextureSize: 2048 },
  } as unknown as WebGLRenderer;
  const normal = new Texture();
  const a = terrainScene(scene, renderer, request, r, textures, undefined, {
    seaLevel: 0,
    normal,
    settings: DEFAULT_OCEAN_SETTINGS,
  });
  expect(a.hasOcean).toBe(false);
  expect(a.hasWater).toBe(true);
  a.waterTime(7);
  const mesh = scene.children.find((x) => x.name === 'inland-lake-v1') as Mesh<
    BufferGeometry,
    ReturnType<typeof oceanMaterial>
  >;
  expect(mesh.material.uniforms['waterTime'].value).toBe(7);
  a.updateWater({ ...DEFAULT_OCEAN_SETTINGS, foam: 0.1 });
  expect(mesh.material.uniforms['foamIntensity'].value).toBe(0.1);
  const b = terrainScene(new Scene(), renderer, request, r, textures, undefined, {
    seaLevel: 0,
    normal,
    settings: DEFAULT_OCEAN_SETTINGS,
  });
  a.dispose();
  a.dispose();
  expect(mesh.parent).toBeNull();
  expect(b.hasWater).toBe(true);
  b.dispose();
  normal.dispose();
});
it('releases a geometry when final construction fails', () => {
  const dispose = vi.spyOn(BufferGeometry.prototype, 'dispose');
  const fail = vi
    .spyOn(BufferGeometry.prototype, 'computeBoundingSphere')
    .mockImplementationOnce(() => {
      throw Error('fixture');
    });
  expect(() => inlandWaterGeometry(lakeFixture(), 0)).toThrow('fixture');
  expect(dispose).toHaveBeenCalled();
  fail.mockRestore();
  dispose.mockRestore();
});
