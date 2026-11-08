import { Injectable, signal } from '@angular/core';

export interface AtmosphereSettings {
  readonly enabled: boolean;
  readonly haze: number;
  readonly valleyFog: number;
}
export const DEFAULT_ATMOSPHERE_SETTINGS: AtmosphereSettings = Object.freeze({
  enabled: true,
  haze: 0.22,
  valleyFog: 0.18,
});
@Injectable({ providedIn: 'root' })
export class AtmosphereSettingsService {
  private readonly current = signal(DEFAULT_ATMOSPHERE_SETTINGS);
  readonly settings = this.current.asReadonly();
  set(value: AtmosphereSettings): void {
    if (
      !value ||
      Object.keys(value).length !== 3 ||
      !['enabled', 'haze', 'valleyFog'].every((k) => Object.hasOwn(value, k)) ||
      typeof value.enabled !== 'boolean' ||
      !Number.isFinite(value.haze) ||
      value.haze < 0 ||
      value.haze > 1 ||
      !Number.isFinite(value.valleyFog) ||
      value.valleyFog < 0 ||
      value.valleyFog > 1
    )
      throw new RangeError('Invalid atmosphere settings.');
    const old = this.current();
    if (
      old.enabled !== value.enabled ||
      old.haze !== value.haze ||
      old.valleyFog !== value.valleyFog
    )
      this.current.set(Object.freeze({ ...value }));
  }
  reset(): void {
    this.current.set(DEFAULT_ATMOSPHERE_SETTINGS);
  }
}
