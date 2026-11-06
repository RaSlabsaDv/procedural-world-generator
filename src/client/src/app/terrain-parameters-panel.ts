import { Component, input, output } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { TerrainError } from './terrain.models';
import {
  MAP_PARAMETERS,
  SIMULATION_PARAMETERS,
  MapParameterForm,
  SimulationParameterForm,
} from './terrain-parameters';

export type GenerationMode = 'local' | 'remote' | 'verify';

@Component({
  selector: 'app-terrain-parameters',
  imports: [ReactiveFormsModule],
  templateUrl: './terrain-parameters-panel.html',
  styleUrls: ['./panel.css', './terrain-parameters-panel.css'],
})
export class TerrainParametersPanel {
  readonly mapForm = input.required<MapParameterForm>();
  readonly simulationForm = input.required<SimulationParameterForm>();
  readonly busy = input(false);
  readonly error = input<TerrainError | null>(null);
  readonly generate = output<GenerationMode>();
  protected readonly mapParameters = Object.entries(MAP_PARAMETERS).map(([name, definition]) => ({
    name,
    ...definition,
  }));
  protected readonly simulationParameters = Object.entries(SIMULATION_PARAMETERS).map(
    ([name, definition]) => ({ name, ...definition }),
  );

  protected fieldError(name: string, nested = false): string | undefined {
    const fields = this.error()?.fields;
    return (nested ? fields?.['heightMap.' + name] : undefined) ?? fields?.[name];
  }
}
