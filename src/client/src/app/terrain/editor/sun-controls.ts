import { Component, inject, signal } from '@angular/core';
import { OperationLock } from '../../platform/operation-lock.service';
import { SceneEnvironmentService } from '../rendering/scene-environment.service';
import { DEFAULT_ENVIRONMENT_SETTINGS } from '../rendering/scene-environment';

export function sunTimeLabel(hours: number): string {
  const minutes = Math.round(hours * 60);
  return `${Math.floor(minutes / 60)
    .toString()
    .padStart(2, '0')}:${(minutes % 60).toString().padStart(2, '0')}`;
}
export function sunCompassLabel(degrees: number): string {
  return ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(degrees / 45) % 8];
}

/** Loaded on panel interaction, preserving the initial editor's deferred Three boundary. */
@Component({
  selector: 'app-sun-controls',
  template: `<fieldset [disabled]="busy()">
    <label for="sun-time"
      >Time of day
      <output for="sun-time" id="sun-time-value">{{
        timeLabel(environment.snapshot().settings.timeOfDayHours)
      }}</output></label
    >
    <input
      id="sun-time"
      type="range"
      min="0"
      max="24"
      step="0.25"
      [value]="environment.snapshot().settings.timeOfDayHours"
      (input)="change('timeOfDayHours', $event)"
      aria-describedby="sun-time-value sun-note"
    />
    <label for="sun-direction"
      >Sun direction
      <output for="sun-direction" id="sun-direction-value"
        >{{ environment.snapshot().settings.sunAzimuthDegrees }}°
        {{ compassLabel(environment.snapshot().settings.sunAzimuthDegrees) }}</output
      ></label
    >
    <input
      id="sun-direction"
      type="range"
      min="0"
      max="359"
      step="1"
      [value]="environment.snapshot().settings.sunAzimuthDegrees"
      (input)="change('sunAzimuthDegrees', $event)"
      aria-describedby="sun-direction-value sun-note"
    />
    <button type="button" class="secondary" id="reset-sun" (click)="reset()">Reset sun</button>
    <p id="sun-note">Updates both views without regenerating. 0° N = +Z; 90° E = +X.</p>
    @if (problem()) {
      <p role="alert">{{ problem() }}</p>
    }
  </fieldset>`,
  styleUrls: ['../../shared/panel.css'],
  styles: [
    `
      :host {
        display: block;
      }
      fieldset {
        border: 0;
        padding: 0.6rem 0 0;
        margin: 0;
        min-width: 0;
      }
      label {
        display: flex;
        align-items: center;
        justify-content: space-between;
        font-size: 0.76rem;
        margin-top: 0.4rem;
      }
      input[type='range'] {
        width: 100%;
        accent-color: var(--atlas-primary);
      }
      p {
        font-size: 0.7rem;
        opacity: 0.7;
        margin: 0.5rem 0 0;
      }
    `,
  ],
})
export class SunControls {
  protected readonly environment = inject(SceneEnvironmentService);
  protected readonly busy = inject(OperationLock).busy;
  protected readonly problem = signal('');
  protected readonly timeLabel = sunTimeLabel;
  protected readonly compassLabel = sunCompassLabel;

  protected change(key: 'timeOfDayHours' | 'sunAzimuthDegrees', event: Event): void {
    const input = event.target as HTMLInputElement;
    if (this.busy()) {
      input.value = String(this.environment.snapshot().settings[key]);
      return;
    }
    const value = input.valueAsNumber;
    const max = key === 'timeOfDayHours' ? 24 : 359;
    const step = key === 'timeOfDayHours' ? 0.25 : 1;
    try {
      if (!Number.isFinite(value) || value < 0 || value > max || !Number.isInteger(value / step))
        throw new RangeError('Invalid sun setting.');
      this.environment.set({ ...this.environment.snapshot().settings, [key]: value });
      this.problem.set('');
    } catch {
      input.value = String(this.environment.snapshot().settings[key]);
      this.problem.set('Choose a valid sun setting.');
    }
  }
  protected reset(): void {
    if (this.busy()) return;
    this.environment.set({
      ...this.environment.snapshot().settings,
      timeOfDayHours: DEFAULT_ENVIRONMENT_SETTINGS.timeOfDayHours,
      sunAzimuthDegrees: DEFAULT_ENVIRONMENT_SETTINGS.sunAzimuthDegrees,
    });
    this.problem.set('');
  }
}
