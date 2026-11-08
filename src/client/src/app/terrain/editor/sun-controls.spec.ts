import { TestBed } from '@angular/core/testing';
import { OperationLock } from '../../platform/operation-lock.service';
import { SceneEnvironmentService } from '../rendering/scene-environment.service';
import { OceanSettingsService } from '../rendering/ocean-settings.service';
import { AtmosphereSettingsService } from '../rendering/atmosphere-settings.service';
import { SunControls, sunTimeLabel, sunCompassLabel } from './sun-controls';

it('formats quarter-hour boundaries and all eight compass directions', () => {
  for (const [value, label] of [
    [0, '00:00'],
    [6.25, '06:15'],
    [12, '12:00'],
    [17.75, '17:45'],
    [23.75, '23:45'],
    [24, '24:00'],
  ] as const)
    expect(sunTimeLabel(value)).toBe(label);
  [0, 45, 90, 135, 180, 225, 270, 315, 359].forEach((v, i) =>
    expect(sunCompassLabel(v)).toBe(['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW', 'N'][i]),
  );
});
it('maps real sliders into the shared state and preserves visual time on reset', async () => {
  const fixture = TestBed.createComponent(SunControls),
    environment = TestBed.inject(SceneEnvironmentService);
  const water = TestBed.inject(OceanSettingsService),
    atmosphere = TestBed.inject(AtmosphereSettingsService);
  environment.set({ ...environment.snapshot().settings, visualTimeSeconds: 123 });
  water.set({ color: '#224466', turbidity: 0.8, foam: 0.1 });
  atmosphere.set({ enabled: false, haze: 0.4, valleyFog: 0.7 });
  const w = water.settings(),
    a = atmosphere.settings();
  await fixture.whenStable();
  const el = fixture.nativeElement as HTMLElement,
    time = el.querySelector<HTMLInputElement>('#sun-time')!,
    direction = el.querySelector<HTMLInputElement>('#sun-direction')!;
  expect(time.step).toBe('0.25');
  expect(direction.max).toBe('359');
  expect(el.querySelector('output[for="sun-time"]')!.textContent).toBe('12:00');
  time.value = '6.25';
  time.dispatchEvent(new Event('input'));
  direction.value = '90';
  direction.dispatchEvent(new Event('input'));
  await fixture.whenStable();
  expect(environment.snapshot().settings).toEqual({
    timeOfDayHours: 6.25,
    sunAzimuthDegrees: 90,
    visualTimeSeconds: 123,
  });
  expect(el.querySelector('#sun-direction-value')!.textContent).toContain('90° E');
  el.querySelector<HTMLButtonElement>('#reset-sun')!.click();
  await fixture.whenStable();
  expect(environment.snapshot().settings).toEqual({
    timeOfDayHours: 12,
    sunAzimuthDegrees: 315,
    visualTimeSeconds: 123,
  });
  expect(water.settings()).toBe(w);
  expect(atmosphere.settings()).toBe(a);
  fixture.destroy();
});
it('keeps invalid and busy edits inert, including synchronous events before DOM disabling', async () => {
  const fixture = TestBed.createComponent(SunControls),
    environment = TestBed.inject(SceneEnvironmentService);
  await fixture.whenStable();
  const el = fixture.nativeElement as HTMLElement,
    time = el.querySelector<HTMLInputElement>('#sun-time')!;
  const initial = environment.snapshot();
  // Synthetic malformed inputs bypass native range sanitization to exercise the guard.
  for (const value of [NaN, -1, 25, 6.1]) {
    Object.defineProperty(time, 'valueAsNumber', { configurable: true, value });
    time.dispatchEvent(new Event('input'));
    expect(environment.snapshot()).toBe(initial);
  }
  const release = TestBed.inject(OperationLock).tryAcquire()!;
  time.value = '7';
  Object.defineProperty(time, 'valueAsNumber', { configurable: true, value: 7 });
  time.dispatchEvent(new Event('input'));
  el.querySelector<HTMLButtonElement>('#reset-sun')!.click();
  expect(time.value).toBe('12');
  expect(environment.snapshot()).toBe(initial);
  await fixture.whenStable();
  expect(el.querySelector<HTMLFieldSetElement>('fieldset')!.disabled).toBe(true);
  release();
  await fixture.whenStable();
  expect(environment.snapshot()).toBe(initial);
  fixture.destroy();
});
it('keeps two control instances synchronized and releases them without owning global state', async () => {
  const a = TestBed.createComponent(SunControls),
    b = TestBed.createComponent(SunControls);
  await a.whenStable();
  await b.whenStable();
  const environment = TestBed.inject(SceneEnvironmentService),
    time = a.nativeElement.querySelector('#sun-time') as HTMLInputElement;
  time.value = '17.75';
  time.dispatchEvent(new Event('input'));
  await b.whenStable();
  expect(b.nativeElement.querySelector('#sun-time-value').textContent).toBe('17:45');
  a.destroy();
  b.destroy();
  expect(() =>
    environment.set({ ...environment.snapshot().settings, timeOfDayHours: 0 }),
  ).not.toThrow();
});
