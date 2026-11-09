import { TestBed } from '@angular/core/testing';
import { AppearanceControls } from './appearance-controls';
import {
  AppearanceSettingsService,
  DEFAULT_APPEARANCE,
} from '../rendering/appearance-settings.service';
import { OperationLock } from '../../platform/operation-lock.service';
it('shares compact collapsed controls, independent toggles, bounds, reset and busy protection', async () => {
  const a = TestBed.createComponent(AppearanceControls),
    b = TestBed.createComponent(AppearanceControls);
  const state = TestBed.inject(AppearanceSettingsService);
  await a.whenStable();
  await b.whenStable();
  const root = a.nativeElement as HTMLElement;
  expect(root.querySelector('details')!.open).toBe(false);
  const mode = root.querySelector<HTMLSelectElement>('select')!,
    exposure = root.querySelector<HTMLInputElement>('#appearance-exposure')!;
  const grading = root.querySelector<HTMLInputElement>('#appearance-grading')!,
    vignette = root.querySelector<HTMLInputElement>('#appearance-vignette')!;
  expect(exposure.min).toBe('0.25');
  expect(exposure.max).toBe('2');
  mode.value = 'reference';
  mode.dispatchEvent(new Event('change'));
  exposure.value = '1.25';
  exposure.dispatchEvent(new Event('input'));
  grading.checked = true;
  grading.dispatchEvent(new Event('change'));
  expect(state.settings()).toEqual({
    tone: 'reference',
    exposure: 1.25,
    grading: true,
    vignette: false,
    bloom: false,
  });
  const bloom = root.querySelector<HTMLInputElement>('#appearance-bloom')!;
  bloom.checked = true;
  bloom.dispatchEvent(new Event('change'));
  expect(state.settings().bloom).toBe(true);
  expect(state.settings().grading).toBe(true);
  await b.whenStable();
  expect(b.nativeElement.querySelector('#appearance-bloom').checked).toBe(true);
  expect(b.nativeElement.querySelector('#appearance-grading').checked).toBe(true);
  const release = TestBed.inject(OperationLock).tryAcquire()!;
  await a.whenStable();
  expect(root.querySelector('fieldset')!.disabled).toBe(true);
  vignette.checked = true;
  vignette.dispatchEvent(new Event('change'));
  root.querySelector<HTMLButtonElement>('button')!.click();
  expect(state.settings().vignette).toBe(false);
  release();
  await a.whenStable();
  root.querySelector<HTMLButtonElement>('button')!.click();
  expect(state.settings()).toBe(DEFAULT_APPEARANCE);
});
