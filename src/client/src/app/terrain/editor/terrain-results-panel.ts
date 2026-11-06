import { Component, computed, effect, input, signal, untracked } from '@angular/core';
import { TerrainComparison } from '../data/terrain.contract';
import { TerrainRequest, TerrainRun, MAX_TREES } from '../data/terrain.models';
import { sameTerrainParameters } from './terrain-parameters';
import { BIOME_PRESENTATION } from '../data/biome-presentation';
import { TerrainPreview } from '../rendering/terrain-preview';

type Source = 'local' | 'remote';
interface Entry {
  source: Source;
  name: string;
  run: TerrainRun;
}

@Component({
  selector: 'app-terrain-results',
  imports: [TerrainPreview],
  templateUrl: './terrain-results-panel.html',
  styleUrls: ['../../shared/panel.css', './terrain-results-panel.css'],
})
export class TerrainResultsPanel {
  protected readonly biomeLegend = Object.values(BIOME_PRESENTATION).map((entry) => ({
    ...entry,
    cssColor: '#' + entry.color.toString(16).padStart(6, '0'),
  }));
  protected readonly maxTrees = MAX_TREES;
  readonly local = input<TerrainRun | null>(null);
  readonly remote = input<TerrainRun | null>(null);
  readonly comparison = input<TerrainComparison | null>(null);
  readonly busy = input(false);
  readonly draft = input<TerrainRequest | null>(null);
  readonly preferred = input<Source>('local');
  protected readonly selected = signal<Source>('local');
  protected readonly comparing = signal(false);
  protected readonly displayTimes = signal<Partial<Record<Source, number>>>({});
  protected readonly entries = computed(() => {
    const result: Entry[] = [];
    const local = this.local(),
      remote = this.remote();
    if (local) result.push({ source: 'local', name: 'Local WebAssembly', run: local });
    if (remote) result.push({ source: 'remote', name: 'Remote API', run: remote });
    return result;
  });
  protected readonly visible = computed(() => {
    const entries = this.entries();
    if (this.comparing()) return entries;
    const selected = entries.find((entry) => entry.source === this.selected()) ?? entries[0];
    return selected ? [selected] : [];
  });

  private previousRuns: Record<Source, TerrainRun | null> = { local: null, remote: null };

  constructor() {
    effect(() => {
      const source = this.preferred();
      untracked(() => this.selected.set(source));
    });
    effect(() => {
      const runs = { local: this.local(), remote: this.remote() };
      untracked(() =>
        this.displayTimes.update((times) => {
          const retained: Partial<Record<Source, number>> = {};
          for (const source of ['local', 'remote'] as const)
            if (runs[source] === this.previousRuns[source] && times[source] !== undefined)
              retained[source] = times[source];
          this.previousRuns = runs;
          return retained;
        }),
      );
    });
  }

  protected matchesDraft(run: TerrainRun): boolean {
    return sameTerrainParameters(run.terrain, this.draft());
  }

  protected sameResults(): boolean {
    return sameTerrainParameters(this.local()?.terrain ?? null, this.remote()?.terrain ?? null);
  }

  protected summary(run: TerrainRun): [string, number][] {
    const s = run.response.simulation;
    return [
      ['Initial terrain mass', s.initialTerrainMass],
      ['Final terrain mass', s.finalTerrainMass],
      ['Suspended sediment', s.suspendedSediment],
      ['Water added', s.waterAdded],
      ['Water remaining', s.waterRemaining],
      ['Water evaporated', s.waterEvaporated],
    ];
  }

  protected recordDisplay(source: Source, value: number): void {
    this.displayTimes.update((times) => ({ ...times, [source]: value }));
  }
}
