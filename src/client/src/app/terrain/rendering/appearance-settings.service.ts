import { Injectable, signal } from '@angular/core';

export interface AppearanceSettings {
  readonly tone: 'reference' | 'aces';
  readonly exposure: number;
  readonly grading: boolean;
  readonly vignette: boolean;
  readonly bloom: boolean;
}
export const DEFAULT_APPEARANCE: AppearanceSettings = Object.freeze({
  tone: 'aces',
  exposure: 1,
  grading: false,
  vignette: false,
  bloom: false,
});
export const REFERENCE_APPEARANCE: AppearanceSettings = Object.freeze({
  ...DEFAULT_APPEARANCE,
  tone: 'reference',
});
export const APPEARANCE_LIMITS = Object.freeze({ minExposure: 0.25, maxExposure: 2, step: 0.05 });
export function needsFinishing(value: AppearanceSettings): boolean {
  return (
    value.tone !== 'reference' ||
    value.exposure !== 1 ||
    value.grading ||
    value.vignette ||
    value.bloom
  );
}
@Injectable({ providedIn: 'root' })
export class AppearanceSettingsService {
  private readonly current = signal(DEFAULT_APPEARANCE);
  readonly settings = this.current.asReadonly();
  set(value: AppearanceSettings): void {
    if (
      !value ||
      Object.keys(value).length !== 5 ||
      !['tone', 'exposure', 'grading', 'vignette', 'bloom'].every((k) => Object.hasOwn(value, k)) ||
      !['reference', 'aces'].includes(value.tone) ||
      !Number.isFinite(value.exposure) ||
      value.exposure < APPEARANCE_LIMITS.minExposure ||
      value.exposure > APPEARANCE_LIMITS.maxExposure ||
      typeof value.grading !== 'boolean' ||
      typeof value.vignette !== 'boolean' ||
      typeof value.bloom !== 'boolean'
    )
      throw new RangeError('Invalid appearance settings.');
    const old = this.current();
    if (
      old.tone !== value.tone ||
      old.exposure !== value.exposure ||
      old.grading !== value.grading ||
      old.vignette !== value.vignette ||
      old.bloom !== value.bloom
    )
      this.current.set(Object.freeze({ ...value }));
  }
  reset(): void {
    this.current.set(DEFAULT_APPEARANCE);
  }
}
