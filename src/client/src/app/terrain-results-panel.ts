import { Component, input } from '@angular/core';
import { TerrainComparison } from './terrain.contract';
import { TerrainRun } from './terrain.models';
import { TerrainPreview } from './terrain-preview';

@Component({
  selector: 'app-terrain-results',
  imports: [TerrainPreview],
  templateUrl: './terrain-results-panel.html',
  styleUrls: ['./panel.css', './terrain-results-panel.css'],
})
export class TerrainResultsPanel {
  readonly local = input<TerrainRun | null>(null);
  readonly remote = input<TerrainRun | null>(null);
  readonly comparison = input<TerrainComparison | null>(null);
  readonly busy = input(false);
}
