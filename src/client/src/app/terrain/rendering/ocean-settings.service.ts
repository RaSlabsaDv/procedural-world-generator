import { Injectable, signal } from '@angular/core';

export interface OceanSettings {
  readonly color: string;
  readonly turbidity: number;
  readonly foam: number;
}
export const DEFAULT_OCEAN_SETTINGS: OceanSettings = Object.freeze({
  color: '#49b7b5',
  turbidity: 0.38,
  foam: 0.45,
});
@Injectable({ providedIn: 'root' })
export class OceanSettingsService {
  private readonly current = signal(DEFAULT_OCEAN_SETTINGS);
  readonly settings = this.current.asReadonly();
  set(input: OceanSettings): void {
    if (
      !input ||
      Object.keys(input).length !== 3 ||
      !['color', 'turbidity', 'foam'].every((k) => Object.hasOwn(input, k)) ||
      typeof input.color !== 'string' ||
      !/^#[0-9a-f]{6}$/i.test(input.color) ||
      !Number.isFinite(input.turbidity) ||
      input.turbidity < 0.02 ||
      input.turbidity > 2 ||
      !Number.isFinite(input.foam) ||
      input.foam < 0 ||
      input.foam > 1
    )
      throw new RangeError('Invalid water settings.');
    const next = Object.freeze({
        color: input.color.toLowerCase(),
        turbidity: input.turbidity,
        foam: input.foam,
      }),
      old = this.current();
    if (next.color !== old.color || next.turbidity !== old.turbidity || next.foam !== old.foam)
      this.current.set(next);
  }
  reset(): void {
    this.current.set(DEFAULT_OCEAN_SETTINGS);
  }
}
