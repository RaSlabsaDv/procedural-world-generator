import { Component, computed, input, output } from '@angular/core';
import { ReactiveFormsModule, FormControl } from '@angular/forms';
import { TerrainError } from '../data/terrain.models';
import {
  MAP_PARAMETERS,
  SIMULATION_PARAMETERS,
  SLIDER_GUIDANCE,
  createParameterForm,
  MapParameterForm,
  SimulationParameterForm,
} from './terrain-parameters';

export type GenerationMode = 'local' | 'remote' | 'verify';

@Component({
  selector: 'app-terrain-parameters',
  imports: [ReactiveFormsModule],
  templateUrl: './terrain-parameters-panel.html',
  styleUrls: ['../../shared/panel.css', './terrain-parameters-panel.css'],
})
export class TerrainParametersPanel {
  readonly mapForm = input.required<MapParameterForm>();
  readonly simulationForm = input.required<SimulationParameterForm>();
  readonly busy = input(false);
  readonly error = input<TerrainError | null>(null);
  readonly generate = output<GenerationMode>();
  protected readonly groups = computed(() => {
    const map = (name: keyof typeof MAP_PARAMETERS) => ({
      name,
      nested: true,
      definition: MAP_PARAMETERS[name],
      control: this.mapForm().controls[name],
      slider: undefined,
    });
    const simulation = (name: keyof typeof SIMULATION_PARAMETERS) => ({
      name,
      nested: false,
      definition: SIMULATION_PARAMETERS[name],
      control: this.simulationForm().controls[name],
      slider:
        name in SLIDER_GUIDANCE ? SLIDER_GUIDANCE[name as keyof typeof SLIDER_GUIDANCE] : undefined,
    });
    return [
      {
        title: 'Terrain',
        advanced: false,
        fields: [
          map('seed'),
          map('width'),
          map('height'),
          map('heightMultiplier'),
          simulation('mountainStrength'),
          simulation('plainsCoverage'),
          simulation('mountainCoverage'),
          simulation('seaLevel'),
          simulation('globalMoisture'),
        ],
      },
      {
        title: 'Erosion',
        advanced: false,
        fields: [simulation('iterations'), simulation('rainfall'), simulation('evaporation')],
      },
      {
        title: 'Advanced noise',
        advanced: true,
        fields: [map('noiseScale'), map('octaves'), simulation('warpStrength')],
      },
    ];
  });

  protected randomSeed(): void {
    if (this.busy()) return;
    this.mapForm().controls.seed.setValue(crypto.getRandomValues(new Uint32Array(1))[0] | 0);
  }

  protected resetParameters(): void {
    if (this.busy()) return;
    this.mapForm().reset(createParameterForm(MAP_PARAMETERS).getRawValue());
    this.simulationForm().reset(createParameterForm(SIMULATION_PARAMETERS).getRawValue());
  }

  protected slide(control: FormControl<number | null>, event: Event): void {
    if (!this.busy()) control.setValue((event.target as HTMLInputElement).valueAsNumber);
  }

  protected fieldError(name: string, nested = false): string | undefined {
    const fields = this.error()?.fields;
    return (nested ? fields?.['heightMap.' + name] : undefined) ?? fields?.[name];
  }
}
