import { Component, input } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { TerrainResultsPanel } from './terrain-results-panel';
import { TerrainPreview } from '../rendering/terrain-preview';
import { TerrainRun } from '../data/terrain.models';
import { decodeTerrain } from '../data/terrain.contract';
import { testTerrain, testWire } from '../testing/terrain-test-fixture';

@Component({ selector: 'app-terrain-preview', template: '' })
class PreviewStub {
  readonly run = input.required<TerrainRun>();
  readonly paused = input(false);
}

it('retains display timing for an unchanged result when the other mode changes', async () => {
  await TestBed.configureTestingModule({ imports: [TerrainResultsPanel] })
    .overrideComponent(TerrainResultsPanel, {
      remove: { imports: [TerrainPreview] },
      add: { imports: [PreviewStub] },
    })
    .compileComponents();
  const terrain = testTerrain();
  const run = (): TerrainRun => ({
    request: terrain.heightMap,
    terrain,
    response: decodeTerrain(testWire(terrain), terrain.heightMap, terrain),
    requestMs: 1,
    initMs: null,
  });
  const fixture = TestBed.createComponent(TerrainResultsPanel);
  fixture.componentRef.setInput('local', run());
  await fixture.whenStable();
  const component = fixture.componentInstance as unknown as {
    recordDisplay(source: string, value: number): void;
    displayTimes(): Partial<Record<string, number>>;
  };
  component.recordDisplay('local', 12.3);
  fixture.componentRef.setInput('remote', run());
  await fixture.whenStable();
  expect(component.displayTimes()['local']).toBe(12.3);
  fixture.componentRef.setInput('local', run());
  await fixture.whenStable();
  expect(component.displayTimes()['local']).toBeUndefined();
});
