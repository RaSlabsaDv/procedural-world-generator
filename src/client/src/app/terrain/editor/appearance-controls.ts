import { Component, inject, signal, input } from '@angular/core';
import { OperationLock } from '../../platform/operation-lock.service';
import {
  APPEARANCE_LIMITS,
  AppearanceSettingsService,
} from '../rendering/appearance-settings.service';

@Component({
  selector: 'app-appearance-controls',
  template: `<details [open]="expanded()" id="appearance-settings">
    <summary>Appearance <span>Color & exposure</span></summary>
    <fieldset [disabled]="busy()">
      <label for="appearance-tone"
        >Tone mapping
        <select
          id="appearance-tone"
          [value]="appearance.settings().tone"
          (change)="change('tone', $event)"
        >
          <option value="reference">Reference</option>
          <option value="aces">ACES</option>
        </select>
      </label>
      <label for="appearance-exposure"
        >Exposure <output>{{ appearance.settings().exposure.toFixed(2) }}</output></label
      >
      <input
        id="appearance-exposure"
        type="range"
        [min]="limits.minExposure"
        [max]="limits.maxExposure"
        [step]="limits.step"
        [value]="appearance.settings().exposure"
        (input)="change('exposure', $event)"
      />
      <label for="appearance-grading"
        >Color grading<input
          id="appearance-grading"
          type="checkbox"
          [checked]="appearance.settings().grading"
          (change)="change('grading', $event)"
      /></label>
      <label for="appearance-vignette"
        >Vignette<input
          id="appearance-vignette"
          type="checkbox"
          [checked]="appearance.settings().vignette"
          (change)="change('vignette', $event)"
      /></label>
      <label for="appearance-bloom"
        >Bloom<input
          id="appearance-bloom"
          type="checkbox"
          [checked]="appearance.settings().bloom"
          (change)="change('bloom', $event)"
      /></label>
      <button id="reset-appearance" class="secondary" type="button" (click)="reset()">
        Reset appearance
      </button>
      <p>Updates both views. Exact Reference: exposure 1, all three effects off.</p>
      @if (problem()) {
        <p role="alert">{{ problem() }}</p>
      }
    </fieldset>
  </details>`,
  styleUrls: ['../../shared/panel.css'],
  styles: [
    `
      details {
        margin-top: 0.6rem;
        border: 1px solid var(--atlas-input-border);
        border-radius: var(--atlas-radius-sm);
        padding: 0.6rem;
      }
      summary {
        font-size: 0.8rem;
        font-weight: 600;
        cursor: pointer;
      }
      summary span {
        float: right;
        font-weight: 400;
        opacity: 0.65;
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
        gap: 0.4rem;
      }
      input[type='range'] {
        width: 100%;
        accent-color: var(--atlas-primary);
      }
      select {
        width: auto;
        max-width: 8rem;
        padding: 0.2rem 0.4rem;
        font-size: 0.76rem;
      }
      p {
        font-size: 0.7rem;
        opacity: 0.7;
        margin: 0.5rem 0 0;
      }
    `,
  ],
})
export class AppearanceControls {
  readonly expanded = input(false);
  protected readonly appearance = inject(AppearanceSettingsService);
  protected readonly busy = inject(OperationLock).busy;
  protected readonly limits = APPEARANCE_LIMITS;
  protected readonly problem = signal('');
  protected change(
    key: 'tone' | 'exposure' | 'grading' | 'vignette' | 'bloom',
    event: Event,
  ): void {
    if (this.busy()) return;
    const input = event.target as HTMLInputElement;
    try {
      this.appearance.set({
        ...this.appearance.settings(),
        [key]:
          key === 'tone' ? input.value : key === 'exposure' ? input.valueAsNumber : input.checked,
      });
      this.problem.set('');
    } catch {
      this.problem.set('Choose a valid appearance setting.');
    }
  }
  protected reset(): void {
    if (!this.busy()) {
      this.appearance.reset();
      this.problem.set('');
    }
  }
}
