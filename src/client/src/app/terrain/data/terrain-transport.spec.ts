import { testSurfaceWeights } from '../testing/terrain-test-fixture';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { compareTerrains, decodeTerrain } from './terrain.contract';
import { TerrainService } from './terrain.service';
import { WasmHostService } from '../../platform/wasm-host.service';
import {
  ALGORITHM_VERSION,
  RESULT_VERSION,
  TERRAIN_ALGORITHM,
  TERRAIN_WORKLOAD,
  SIMULATION_VERSION,
  TerrainRequest,
} from './terrain.models';

const map = Object.freeze({
  seed: 42,
  width: 3,
  height: 2,
  noiseScale: 0.37,
  octaves: 3,
  heightMultiplier: 30,
  algorithmVersion: ALGORITHM_VERSION,
});
const terrain: TerrainRequest = Object.freeze({
  heightMap: map,
  plainsCoverage: 0.45,
  mountainCoverage: 0.3,
  globalWarmth: 0.6,
  vegetationDensity: 1,
  landformRegionScale: 1,
  globalMoisture: 0.65,
  seaLevel: 0.16,
  mountainStrength: 0.55,
  warpStrength: 2,
  iterations: 2,
  rainfall: 0.05,
  evaporation: 0.1,
  algorithmVersion: TERRAIN_ALGORITHM,
});
function wire() {
  return {
    result: {
      width: 3,
      height: 2,
      values: [9.2, 6.8, 8.3, 6.7, 12.3, 15.7],
      moisture: Array(6).fill(0.6),
      temperature: Array(6).fill(0.7),
      slope: Array(6).fill(0),
      vegetationDensity: Array(6).fill(0),
      trees: [],
      rocks: [],
      biomes: [1, 0, 1, 0, 1, 2],
      surfaceWeights: testSurfaceWeights([1, 0, 1, 0, 1, 2]),
      algorithmVersion: TERRAIN_ALGORITHM,
      resultVersion: RESULT_VERSION,
    },
    parameters: terrain,
    simulationVersion: SIMULATION_VERSION,
    workload: TERRAIN_WORKLOAD,
    executionProfile: 'landscape-worker-json-v7',
    computeMs: 2,
    coreBuildId: 'test',
    simulation: {
      iterations: 2,
      cellIterations: 12,
      initialTerrainMass: 60,
      finalTerrainMass: 59,
      suspendedSediment: 1,
      waterAdded: 1,
      waterRemaining: 0.9,
      waterEvaporated: 0.1,
    },
  };
}

describe('terrain transport and adapters', () => {
  it('requires matching parameters, versions, and completed work', () => {
    expect(decodeTerrain(wire(), map, terrain).simulation!.cellIterations).toBe(12);
    expect(decodeTerrain(wire(), map, terrain).simulationVersion).toBe(SIMULATION_VERSION);
    expect(() => decodeTerrain(wire(), { ...map, seed: 99 }, terrain)).toThrow();
    for (const change of [
      { simulationVersion: 'v2' },
      { parameters: { ...terrain, iterations: 3 } },
      { workload: 'heightmap+biomes' },
      { simulation: { ...wire().simulation, cellIterations: 11 } },
      { simulation: { ...wire().simulation, waterRemaining: -1 } },
      { simulation: { ...wire().simulation, waterRemaining: NaN } },
    ])
      expect(() => decodeTerrain({ ...wire(), ...change }, map, terrain)).toThrow();
  });

  it('rejects comparisons of different erosion settings even when the base map matches', () => {
    const response = decodeTerrain(wire(), map, terrain);
    const run = { request: map, terrain, response, requestMs: 3, initMs: null };
    expect(compareTerrains(run, run).biomesMatch).toBe(true);
    expect(() =>
      compareTerrains(run, { ...run, terrain: { ...terrain, rainfall: 0.1 } }),
    ).toThrow();
  });

  it('awaits worker output and uses the terrain API without changing the snapshot', async () => {
    const generate = vi.fn(async () => JSON.stringify(wire()));
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: WasmHostService,
          useValue: {
            getRuntime: async () => ({ generateTerrainJson: generate }),
            getInfo: () => ({ initCount: 1, initMs: 5 }),
          },
        },
      ],
    });
    const service = TestBed.inject(TerrainService);
    const local = await service.local(terrain);
    expect(local.terrain).toBe(terrain);
    expect(generate).toHaveBeenCalledWith(JSON.stringify(terrain));
    const pending = service.remote(terrain);
    const http = TestBed.inject(HttpTestingController);
    const request = http.expectOne('/api/v1/terrains');
    expect(request.request.body).toBe(terrain);
    request.flush(wire());
    expect(compareTerrains(local, await pending)).toMatchObject({
      numericMatch: true,
      biomesMatch: true,
    });
    http.verify();
  });
});
