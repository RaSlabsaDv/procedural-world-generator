import { Component, input } from '@angular/core';
import type { ModeSummary } from '../data/experiment-statistics';

@Component({
  selector: 'app-experiment-summary',
  templateUrl: './experiment-summary.html',
  styleUrls: ['../../shared/panel.css', './experiment-summary.css'],
})
export class ExperimentSummaryPanel {
  readonly modes = input.required<readonly ModeSummary[]>();
  protected readonly metrics = ['computeMs', 'requestMs'] as const;
  protected value(value: number | null): string {
    return value === null ? 'Unavailable' : `${value} ms`;
  }
}
