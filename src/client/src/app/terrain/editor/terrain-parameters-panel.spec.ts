import { TestBed } from '@angular/core/testing';
import { TerrainParametersPanel } from './terrain-parameters-panel';
import { MAP_PARAMETERS, SIMULATION_PARAMETERS } from './parameter-definitions';
import { createParameterForm, captureTerrainRequest } from './terrain-parameters';

async function setup() {
  const fixture = TestBed.createComponent(TerrainParametersPanel);
  const map = createParameterForm(MAP_PARAMETERS),
    simulation = createParameterForm(SIMULATION_PARAMETERS);
  fixture.componentRef.setInput('mapForm', map);
  fixture.componentRef.setInput('simulationForm', simulation);
  await fixture.whenStable();
  return { fixture, map, simulation, el: fixture.nativeElement as HTMLElement };
}

it('shows shared coverage, remaining hills and dependent slider/number limits', async () => {
  const { fixture, simulation, el } = await setup();
  expect(el.querySelector('#coverage-budget')!.textContent).toContain('25% remains for hills');
  expect(el.querySelector<HTMLInputElement>('#plainsCoverage-slider')!.max).toBe('0.7');
  simulation.controls.mountainCoverage.setValue(0.6);
  await fixture.whenStable();
  expect(el.querySelector('#coverage-budget')!.textContent).toContain(
    'Combined values exceed 100%',
  );
  expect(el.querySelector<HTMLInputElement>('#plainsCoverage')!.value).toBe('0.45');
  expect(el.querySelector<HTMLInputElement>('#plainsCoverage-slider')!.max).toBe('0.4');
  const slider = el.querySelector<HTMLInputElement>('#plainsCoverage-slider')!;
  slider.value = '.4';
  slider.dispatchEvent(new Event('input', { bubbles: true }));
  await fixture.whenStable();
  expect(simulation.controls.plainsCoverage.value).toBe(0.4);
  expect(simulation.controls.mountainCoverage.value).toBe(0.6);
  expect(el.querySelector('#coverage-budget')!.textContent).toContain('0% remains for hills');
});

it('updates work-dependent iteration guidance and preserves out-of-range manual drafts', async () => {
  const { fixture, map, simulation, el } = await setup();
  map.patchValue({ width: 512, height: 512 });
  simulation.controls.iterations.setValue(200);
  await fixture.whenStable();
  expect(el.querySelector<HTMLInputElement>('#iterations')!.max).toBe('128');
  expect(el.querySelector('#iterations-error')!.textContent).toContain('0–128');
  expect(captureTerrainRequest(map, simulation).iterations).toBe(200);
  map.patchValue({ width: 128, height: 128 });
  await fixture.whenStable();
  expect(el.querySelector<HTMLInputElement>('#iterations')!.max).toBe('2048');
  expect(el.querySelector('#iterations-error')!.textContent?.trim()).toBe('');
  expect(el.querySelector<HTMLInputElement>('#noiseScale')!.min).toBe('0.0001');
});

it('handles missing/invalid coverage without inventing defaults and reset restores the balance', async () => {
  const { fixture, simulation, el } = await setup();
  simulation.controls.plainsCoverage.setValue(null);
  await fixture.whenStable();
  expect(el.querySelector('#coverage-budget')!.textContent).toContain('Enter both coverages');
  expect(el.querySelector<HTMLInputElement>('#mountainCoverage-slider')!.disabled).toBe(true);
  expect(simulation.controls.plainsCoverage.value).toBeNull();
  el.querySelector<HTMLButtonElement>('#reset-parameters')!.click();
  await fixture.whenStable();
  expect(el.querySelector('#coverage-budget')!.textContent).toContain('25% remains for hills');
  expect(el.querySelector<HTMLInputElement>('#mountainCoverage-slider')!.disabled).toBe(false);
});

it('keeps slider edits and draft actions inert while busy', async () => {
  const { fixture, simulation, el } = await setup();
  fixture.componentRef.setInput('busy', true);
  await fixture.whenStable();
  const slider = el.querySelector<HTMLInputElement>('#plainsCoverage-slider')!;
  slider.value = '.2';
  slider.dispatchEvent(new Event('input', { bubbles: true }));
  await fixture.whenStable();
  expect(simulation.controls.plainsCoverage.value).toBe(0.45);
  expect(el.querySelector<HTMLFieldSetElement>('fieldset')!.disabled).toBe(true);
});

it('does not round a shared limit upward or invent a work limit for invalid dimensions', async () => {
  const { fixture, simulation, map, el } = await setup();
  simulation.controls.mountainCoverage.setValue(0.58000000001);
  await fixture.whenStable();
  const slider = el.querySelector<HTMLInputElement>('#plainsCoverage-slider')!;
  slider.value = '1';
  slider.dispatchEvent(new Event('input', { bubbles: true }));
  await fixture.whenStable();
  expect(
    simulation.controls.plainsCoverage.value! + simulation.controls.mountainCoverage.value!,
  ).toBeLessThanOrEqual(1);
  map.controls.width.setValue(null);
  await fixture.whenStable();
  expect(el.querySelector('.work-estimate')!.textContent).toContain('Enter valid dimensions');
});

it('keeps explanations collapsed until requested and preserves drafts when toggling them', async () => {
  const { fixture, map, el } = await setup();
  const help = el.querySelector<HTMLElement>('#seed-help')!;
  const toggle = el.querySelector<HTMLButtonElement>('#toggle-parameter-tips')!;
  expect(help.hidden).toBe(true);
  expect(toggle.getAttribute('aria-pressed')).toBe('false');
  toggle.click();
  await fixture.whenStable();
  expect(help.hidden).toBe(false);
  expect(map.controls.seed.value).toBe(42);
  fixture.componentRef.setInput('busy', true);
  await fixture.whenStable();
  toggle.dispatchEvent(new Event('click', { bubbles: true }));
  await fixture.whenStable();
  expect(help.hidden).toBe(false);
});
