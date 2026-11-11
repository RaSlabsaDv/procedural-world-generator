import { Component, inject, signal, input } from '@angular/core';
import { OperationLock } from '../../platform/operation-lock.service';
import {
  AtmosphereSettings,
  AtmosphereSettingsService,
} from '../rendering/atmosphere-settings.service';

@Component({
  selector: 'app-atmosphere-controls',
  template: `<details [open]="expanded()" id="atmosphere-settings">
    <summary>Atmosphere <span>Appearance</span></summary>
    <fieldset [disabled]="busy()">
      <label for="atmosphere-enabled"
        >Enabled
        <input
          id="atmosphere-enabled"
          type="checkbox"
          [checked]="atmosphere.settings().enabled"
          (change)="change('enabled', $event)"
        />
      </label>
      <label for="atmosphere-haze"
        >Haze <output>{{ atmosphere.settings().haze.toFixed(2) }}</output></label
      >
      <input
        id="atmosphere-haze"
        type="range"
        min="0"
        max="1"
        step="0.01"
        [value]="atmosphere.settings().haze"
        (input)="change('haze', $event)"
      />
      <label for="atmosphere-valley-fog"
        >Valley fog <output>{{ atmosphere.settings().valleyFog.toFixed(2) }}</output></label
      >
      <input
        id="atmosphere-valley-fog"
        type="range"
        min="0"
        max="1"
        step="0.01"
        [value]="atmosphere.settings().valleyFog"
        (input)="change('valleyFog', $event)"
      />
      <button type="button" class="secondary" id="reset-atmosphere" (click)="reset()">
        Reset atmosphere
      </button>
      <p>Updates both views without regenerating.</p>
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
      }
      input[type='range'] {
        width: 100%;
        accent-color: var(--atlas-primary);
      }
      input[type='color'] {
        width: 2.5rem;
        height: 1.5rem;
        padding: 0;
        border: 0;
        background: none;
      }
      p {
        font-size: 0.7rem;
        opacity: 0.7;
        margin: 0.5rem 0 0;
      }
    `,
  ],
})
export class AtmosphereControls {
  readonly expanded = input(false);
  protected readonly atmosphere = inject(AtmosphereSettingsService);
  protected readonly busy = inject(OperationLock).busy;
  protected readonly problem = signal('');
  protected change(key: keyof AtmosphereSettings, event: Event): void {
    if (this.busy()) return;
    const raw = (event.target as HTMLInputElement).value;
    try {
      this.atmosphere.set({
        ...this.atmosphere.settings(),
        [key]: key === 'enabled' ? (event.target as HTMLInputElement).checked : Number(raw),
      });
      this.problem.set('');
    } catch {
      this.problem.set('Choose a valid atmosphere setting.');
    }
  }
  protected reset(): void {
    if (!this.busy()) {
      this.atmosphere.reset();
      this.problem.set('');
    }
  }
}
