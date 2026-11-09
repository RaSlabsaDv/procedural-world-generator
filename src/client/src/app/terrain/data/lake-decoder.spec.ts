import { decodeLakes } from './lake-decoder';
import { compareTerrains } from './terrain-comparison';
import { decodeTerrain } from './terrain-decoder';
import {
  HYDROLOGY_VERSION,
  RIVER_NETWORK_VERSION,
  LAKE_BASINS_VERSION,
  LakeMapResult,
  HydrologyResult,
  RiverNetworkResult,
} from './terrain.models';
import { testMap, testTerrain, testWire } from '../testing/terrain-test-fixture';

function fixture() {
  const request = { ...testMap, width: 20, height: 20, heightMultiplier: 100 };
  const heights = new Float32Array(400).fill(10),
    biomes = new Uint8Array(400).fill(1);
  const receiverIndex = new Int32Array(400).fill(-1),
    flowAccumulation = new Uint32Array(400).fill(1),
    depressionDepth = new Float32Array(400);
  const ids = Array<number>(400).fill(-1);
  for (let y = 2; y < 6; y++)
    for (let x = 2; x < 6; x++) {
      const cell = y * 20 + x;
      heights[cell] = 4;
      depressionDepth[cell] = 6;
      receiverIndex[cell] = cell - 20;
      ids[cell] = 0;
    }
  flowAccumulation[42] = 100;
  const hydrology: HydrologyResult = {
    algorithmVersion: HYDROLOGY_VERSION,
    receiverIndex,
    flowAccumulation,
    depressionDepth,
  };
  const rivers: RiverNetworkResult = {
    algorithmVersion: RIVER_NETWORK_VERSION,
    cellIndices: new Int32Array([42]),
    widths: new Float32Array([0.8]),
  };
  const raw = {
    algorithmVersion: LAKE_BASINS_VERSION,
    lakeIdByCell: ids,
    basins: [{ id: 0, waterLevel: 10, cellCount: 16, primarySpillFrom: 42, primarySpillTo: 22 }],
    spillFromCells: [42, 43, 44, 45],
    riverCrossingFromCells: [42],
  };
  const decode = (...values: [] | [unknown]) =>
    decodeLakes(
      values.length ? values[0] : raw,
      heights,
      biomes,
      hydrology,
      rivers,
      request,
      () => {
        throw Error('invalid');
      },
    );
  return { request, heights, biomes, hydrology, rivers, raw, decode };
}

describe('lake membership contract', () => {
  it('normalizes independent typed vectors and frozen descriptors', () => {
    const f = fixture(),
      result = f.decode();
    expect(result.lakeIdByCell).toBeInstanceOf(Int32Array);
    expect(result.spillFromCells).toBeInstanceOf(Int32Array);
    expect(result.basins[0].waterLevel).toBe(10);
    f.raw.lakeIdByCell[42] = -1;
    expect(result.lakeIdByCell[42]).toBe(0);
    expect(Object.isFrozen(result.basins[0])).toBe(true);
  });
  it('rejects missing, stale, extra and malformed contracts', () => {
    for (const value of [
      undefined,
      null,
      {},
      { ...fixture().raw, algorithmVersion: 'old' },
      { ...fixture().raw, extra: 1 },
      { ...fixture().raw, lakeIdByCell: [] },
      { ...fixture().raw, basins: Array(65).fill({}) },
    ])
      expect(() => fixture().decode(value)).toThrow();
  });
  it('rejects invalid membership, descriptor counts and levels', () => {
    const changes = [
      (f: ReturnType<typeof fixture>) => {
        f.raw.lakeIdByCell[42] = 1;
      },
      (f: ReturnType<typeof fixture>) => {
        f.raw.lakeIdByCell[42] = 0.5;
      },
      (f: ReturnType<typeof fixture>) => {
        f.raw.basins[0].cellCount = 17;
      },
      (f: ReturnType<typeof fixture>) => {
        f.raw.basins[0].waterLevel = NaN;
      },
      (f: ReturnType<typeof fixture>) => {
        f.raw.basins[0].waterLevel = 9;
      },
      (f: ReturnType<typeof fixture>) => {
        f.biomes[42] = 0;
      },
      (f: ReturnType<typeof fixture>) => {
        f.hydrology.depressionDepth[42] = 0;
      },
      (f: ReturnType<typeof fixture>) => {
        f.rivers.cellIndices[0] = 0;
      },
    ];
    changes.push((f) => {
      for (let i = 0; i < 400; i++)
        if (f.raw.lakeIdByCell[i] === 0) {
          f.heights[i] = 9.5;
          f.hydrology.depressionDepth[i] = 0.5;
        }
    });
    for (const change of changes) {
      const f = fixture();
      change(f);
      expect(() => f.decode()).toThrow();
    }
  });
  it('rejects disconnected membership and area-budget violations', () => {
    const f = fixture();
    f.raw.lakeIdByCell[105] = -1;
    f.raw.lakeIdByCell[210] = 0;
    f.heights[210] = 4;
    f.hydrology.depressionDepth[210] = 6;
    expect(() => f.decode()).toThrow();
    const g = fixture();
    g.biomes.fill(0);
    for (let i = 0; i < 400; i++) if (g.raw.lakeIdByCell[i] === 0) g.biomes[i] = 1;
    expect(() => g.decode()).toThrow();
  });
  it('requires complete sorted exits, crossings and the correct primary spill', () => {
    for (const values of [[], [42], [43, 42, 44, 45], [42, 42, 44, 45], [42, 43, 44, 46]]) {
      const f = fixture();
      f.raw.spillFromCells = values;
      expect(() => f.decode()).toThrow();
    }
    for (const values of [[], [42, 43], [43]]) {
      const f = fixture();
      f.raw.riverCrossingFromCells = values;
      expect(() => f.decode()).toThrow();
    }
    const f = fixture();
    f.raw.basins[0].primarySpillFrom = 43;
    f.raw.basins[0].primarySpillTo = 23;
    expect(() => f.decode()).toThrow();
  });
  it('retains inlet, outlet and lake-to-lake crossings', () => {
    const f = fixture();
    for (let i = 0; i < 400; i++) if (f.raw.lakeIdByCell[i] === 0) f.heights[i] = 6;
    f.raw.basins[0] = {
      id: 0,
      waterLevel: 12,
      cellCount: 16,
      primarySpillFrom: 45,
      primarySpillTo: 46,
    };
    for (let y = 2; y < 6; y++)
      for (let x = 6; x < 10; x++) {
        const i = y * 20 + x;
        f.raw.lakeIdByCell[i] = 1;
        f.heights[i] = 4;
        f.hydrology.depressionDepth[i] = 6;
        f.hydrology.receiverIndex[i] = i - 20;
      }
    f.raw.basins.push({
      id: 1,
      waterLevel: 10,
      cellCount: 16,
      primarySpillFrom: 46,
      primarySpillTo: 26,
    });
    f.hydrology.receiverIndex[45] = 46;
    f.hydrology.flowAccumulation[45] = 200;
    f.hydrology.flowAccumulation[46] = 100;
    f.hydrology.receiverIndex[122] = 102;
    const rivers = {
      ...f.rivers,
      cellIndices: new Int32Array([42, 45, 46, 122]),
      widths: new Float32Array(4).fill(0.8),
    };
    f.raw.spillFromCells = [42, 43, 44, 45, 46, 47, 48, 49];
    f.raw.riverCrossingFromCells = [42, 45, 46, 122];
    const result = decodeLakes(f.raw, f.heights, f.biomes, f.hydrology, rivers, f.request, () => {
      throw Error('invalid');
    });
    expect([...result.riverCrossingFromCells]).toEqual([42, 45, 46, 122]);
  });
  it('includes all lake vectors and descriptor fields in numeric equivalence', () => {
    const terrain = testTerrain(),
      response = decodeTerrain(testWire(), testMap, terrain);
    const lakes = fixture().decode();
    const a = {
      request: testMap,
      terrain,
      response: {
        ...response,
        result: {
          ...response.result,
          lakes: { ...lakes, lakeIdByCell: new Int32Array(6).fill(-1) },
        },
      },
      requestMs: 1,
      initMs: null,
    };
    const mutations: ((l: LakeMapResult) => LakeMapResult)[] = [
      (l) => ({ ...l, lakeIdByCell: new Int32Array([0, -1, -1, -1, -1, -1]) }),
      (l) => ({ ...l, spillFromCells: new Int32Array([43, 43, 44, 45]) }),
      (l) => ({ ...l, riverCrossingFromCells: new Int32Array() }),
      ...(['id', 'waterLevel', 'cellCount', 'primarySpillFrom', 'primarySpillTo'] as const).map(
        (field) => (l: LakeMapResult) => ({
          ...l,
          basins: [{ ...l.basins[0], [field]: l.basins[0][field] + 1 }],
        }),
      ),
    ];
    for (const change of mutations) {
      const b = {
        ...a,
        response: {
          ...a.response,
          result: { ...a.response.result, lakes: change(a.response.result.lakes) },
        },
      };
      const result = compareTerrains(a, b);
      expect(result.lakeMismatchCount).toBeGreaterThan(0);
      expect(result.numericMatch).toBe(false);
    }
  });
});
