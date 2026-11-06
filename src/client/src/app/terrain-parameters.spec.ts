import {
  captureTerrainRequest,
  createParameterForm,
  MAP_PARAMETERS,
  SIMULATION_PARAMETERS,
} from './terrain-parameters';

describe('terrain parameter capture', () => {
  it('captures independent frozen settings and leaves later edits outside the snapshot', () => {
    const map = createParameterForm(MAP_PARAMETERS);
    const simulation = createParameterForm(SIMULATION_PARAMETERS);
    const snapshot = captureTerrainRequest(map, simulation);
    map.controls.seed.setValue(-99);
    simulation.controls.iterations.setValue(128);
    expect(snapshot.heightMap.seed).toBe(42);
    expect(snapshot.iterations).toBe(64);
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.heightMap)).toBe(true);
    expect(captureTerrainRequest(map, simulation).heightMap.seed).toBe(-99);
  });

  it('reports all missing and non-finite fields without turning them into zeros', () => {
    const map = createParameterForm(MAP_PARAMETERS);
    const simulation = createParameterForm(SIMULATION_PARAMETERS);
    map.controls.seed.setValue(null);
    map.controls.noiseScale.setValue(NaN);
    simulation.controls.rainfall.setValue(Infinity);
    try {
      captureTerrainRequest(map, simulation);
      throw new Error('Expected validation failure');
    } catch (error) {
      expect(error).toMatchObject({
        kind: 'validation',
        fields: {
          'heightMap.seed': 'Enter a finite number.',
          'heightMap.noiseScale': 'Enter a finite number.',
          rainfall: 'Enter a finite number.',
        },
      });
    }
  });

  it('preserves valid zeros and forwards finite ranges to canonical Core validation', () => {
    const map = createParameterForm(MAP_PARAMETERS);
    const simulation = createParameterForm(SIMULATION_PARAMETERS);
    map.controls.heightMultiplier.setValue(0);
    map.controls.width.setValue(1);
    simulation.controls.iterations.setValue(0);
    simulation.controls.rainfall.setValue(0);
    const snapshot = captureTerrainRequest(map, simulation);
    expect(snapshot.heightMap.heightMultiplier).toBe(0);
    expect(snapshot.heightMap.width).toBe(1);
    expect(snapshot.iterations).toBe(0);
    expect(snapshot.rainfall).toBe(0);
  });
});
