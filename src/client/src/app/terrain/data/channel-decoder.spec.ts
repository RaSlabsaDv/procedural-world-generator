import { decodeTerrain } from './terrain-decoder';
import { compareTerrains } from './terrain-comparison';
import {
  testMap,
  testTerrain,
  testWire,
  testWireHydrology,
  testSurfaceWeights,
  finalizeTestWire,
} from '../testing/terrain-test-fixture';
function fixture() {
  const terrain = testTerrain({ ...testMap, width: 34, height: 3 }),
    wire = testWire(terrain);
  wire.result.biomes.fill(1);
  wire.result.surfaceWeights = testSurfaceWeights(wire.result.biomes);
  wire.result.hydrology = testWireHydrology(wire.result);
  wire.result.rivers.cellIndices = [34, 35];
  wire.result.rivers.widths = [0.6038762, 0.6];
  finalizeTestWire(wire);
  wire.result.channels.carveDepth[35] = 0.2;
  wire.result.channels.waterSurfaceHeight = [0, 0.1];
  wire.result.channels.segmentState = [3, 1];
  wire.result.channels.summary = {
    beforeTerrainMass: 0.2,
    afterTerrainMass: 0,
    removedTerrainMass: 0.2,
  };
  wire.simulation.finalTerrainMass = 0.2;
  wire.simulation.initialTerrainMass = 0.2;
  const decode = () => decodeTerrain(wire, terrain.heightMap, terrain);
  return { wire, terrain, decode };
}
it('normalizes bounded channel data and separate shaping mass', () => {
  const f = fixture(),
    c = f.decode().result.channels;
  expect(c.carveDepth).toBeInstanceOf(Float32Array);
  expect(c.segmentState).toBeInstanceOf(Uint8Array);
  expect(c.summary.removedTerrainMass).toBe(0.2);
  f.wire.result.channels.carveDepth[35] = 0;
  expect(c.carveDepth[35]).toBeCloseTo(0.2);
});
it('rejects missing fields, malformed vectors, unsupported versions and state codes', () => {
  for (const change of [
    { algorithmVersion: 'old' },
    { carveDepth: [] },
    { waterSurfaceHeight: [] },
    { segmentState: [3, 7] },
    { segmentState: [1, 1] },
  ]) {
    const f = fixture();
    Object.assign(f.wire.result.channels, change);
    expect(f.decode).toThrow();
  }
  const f = fixture();
  Object.assign(f.wire.result.channels, { extra: 1 });
  expect(f.decode).toThrow();
});
it('rejects cuts outside caps/protected boundaries and water outside bed intervals', () => {
  for (const [field, index, value] of [
    ['carveDepth', 35, 1],
    ['carveDepth', 34, 0.1],
    ['waterSurfaceHeight', 1, -1],
    ['waterSurfaceHeight', 1, 0.3],
  ] as const) {
    const f = fixture();
    f.wire.result.channels[field][index] = value;
    expect(f.decode).toThrow();
  }
});
it('rejects rising exposed water and excessive slope', () => {
  const f = fixture();
  f.wire.result.values[34] = 0.1;
  f.wire.result.hydrology.depressionDepth[35] = 0.1;
  f.wire.result.channels.waterSurfaceHeight = [0.1, 0.05];
  f.wire.result.channels.summary = {
    beforeTerrainMass: 0.3,
    afterTerrainMass: Math.fround(0.1),
    removedTerrainMass: 0.2,
  };
  f.wire.simulation.finalTerrainMass = 0.3;
  expect(f.decode).toThrow();
  const g = fixture();
  g.wire.result.channels.carveDepth[35] = 0.9;
  g.wire.result.channels.waterSurfaceHeight[1] = 0.8;
  g.wire.result.channels.summary = {
    beforeTerrainMass: 0.9,
    afterTerrainMass: 0,
    removedTerrainMass: 0.9,
  };
  g.wire.simulation.finalTerrainMass = 0.9;
  expect(g.decode).toThrow();
});
it('rejects inconsistent shaping/hydraulic mass without rewriting either summary', () => {
  for (const field of ['beforeTerrainMass', 'afterTerrainMass', 'removedTerrainMass'] as const) {
    const f = fixture();
    f.wire.result.channels.summary[field] += 1;
    expect(f.decode).toThrow();
  }
  const f = fixture();
  f.wire.simulation.finalTerrainMass = 1;
  expect(f.decode).toThrow();
});
it('includes every channel vector and summary field in equivalence', () => {
  const f = fixture(),
    response = f.decode(),
    run = {
      response,
      terrain: f.terrain,
      request: f.terrain.heightMap,
      requestMs: 1,
      initMs: null,
    };
  expect(compareTerrains(run, run).channelMismatchCount).toBe(0);
  for (const field of ['carveDepth', 'waterSurfaceHeight', 'segmentState'] as const) {
    const b = fixture().decode();
    b.result.channels[field][0] += 1;
    const c = compareTerrains(run, { ...run, response: b });
    expect(c.channelMismatchCount).toBeGreaterThan(0);
    expect(c.numericMatch).toBe(false);
  }
  for (const field of ['beforeTerrainMass', 'afterTerrainMass', 'removedTerrainMass'] as const) {
    const c = response.result.channels;
    const other = {
      ...run,
      response: {
        ...response,
        result: {
          ...response.result,
          channels: { ...c, summary: { ...c.summary, [field]: c.summary[field] + 1 } },
        },
      },
    };
    expect(compareTerrains(run, other).numericMatch).toBe(false);
  }
});
