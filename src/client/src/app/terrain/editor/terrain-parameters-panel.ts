import {
  SLIDER_GUIDANCE,
  INPUT_GUIDANCE,
  ParameterName,
  coverageBalance,
  coverageLimit,
  iterationLimit,
} from './parameter-guidance';
import { Component, computed, effect, input, output, signal } from '@angular/core';
import { ReactiveFormsModule, FormControl } from '@angular/forms';
import { TerrainError } from '../data/terrain.models';
import { MAP_PARAMETERS, SIMULATION_PARAMETERS } from './parameter-definitions';
import {
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
  protected readonly showTips = signal(false);
  private readonly formRevision = signal(0);
  private readonly numberFormat = new Intl.NumberFormat('en', { maximumFractionDigits: 4 });
  protected readonly coverage = computed(() => {
    this.formRevision();
    const controls = this.simulationForm().controls;
    return coverageBalance(controls.plainsCoverage.value, controls.mountainCoverage.value);
  });

  constructor() {
    effect((cleanup) => {
      const changed = () => this.formRevision.update((value) => value + 1);
      const map = this.mapForm().valueChanges.subscribe(changed);
      const simulation = this.simulationForm().valueChanges.subscribe(changed);
      cleanup(() => {
        map.unsubscribe();
        simulation.unsubscribe();
      });
    });
  }

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
        kind: 'terrain',
        advanced: false,
        fields: [
          map('seed'),
          map('width'),
          map('height'),
          map('heightMultiplier'),
          simulation('mountainStrength'),
          simulation('seaLevel'),
          simulation('landformRegionScale'),
        ],
      },
      {
        title: 'Landform balance',
        kind: 'coverage',
        advanced: false,
        fields: [simulation('plainsCoverage'), simulation('mountainCoverage')],
      },
      {
        title: 'Climate & vegetation',
        kind: 'climate',
        advanced: false,
        fields: [
          simulation('globalWarmth'),
          simulation('globalMoisture'),
          simulation('vegetationDensity'),
        ],
      },
      {
        title: 'Erosion',
        kind: 'erosion',
        advanced: false,
        fields: [simulation('iterations'), simulation('rainfall'), simulation('evaporation')],
      },
      {
        title: 'Advanced noise',
        kind: 'noise',
        advanced: true,
        fields: [map('noiseScale'), map('octaves'), simulation('warpStrength')],
      },
    ];
  });

  protected format(value: number): string {
    return this.numberFormat.format(value);
  }
  protected percent(value: number): string {
    return this.format(value * 100) + '%';
  }

  protected range(name: ParameterName): { min: number; max: number } {
    this.formRevision();
    const bounds = INPUT_GUIDANCE[name];
    if (name === 'plainsCoverage' || name === 'mountainCoverage') {
      const other =
        this.simulationForm().controls[
          name === 'plainsCoverage' ? 'mountainCoverage' : 'plainsCoverage'
        ].value;
      return { min: bounds.min, max: coverageLimit(other) ?? bounds.max };
    }
    if (name === 'iterations') return { min: bounds.min, max: this.iterationLimit() ?? bounds.max };
    return bounds;
  }

  protected readonly iterationLimit = computed(() => {
    this.formRevision();
    const { width, height } = this.mapForm().controls;
    return iterationLimit(width.value, height.value);
  });

  protected inputError(
    name: ParameterName,
    nested: boolean,
    control: FormControl<number | null>,
  ): string | undefined {
    const host = this.fieldError(name, nested);
    if (host) return host;
    const value = control.value;
    if (value === null) return undefined;
    const bounds = this.range(name);
    if ((name === 'plainsCoverage' || name === 'mountainCoverage') && value > bounds.max)
      return 'Exceeds the shared landform budget.';
    if (!Number.isFinite(value) || value < bounds.min || value > bounds.max)
      return 'Use ' + this.format(bounds.min) + '–' + this.format(bounds.max) + '.';
    return undefined;
  }

  protected toggleTips(): void {
    if (!this.busy()) this.showTips.update((value) => !value);
  }

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
