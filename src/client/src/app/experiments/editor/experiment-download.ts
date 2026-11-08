import type { ExperimentResult } from '../data/experiment.models';
import { serializeExperimentCsv, serializeExperimentJson } from '../data/experiment-export';

export function downloadExperiment(
  record: ExperimentResult,
  format: 'json' | 'csv',
  document: Document,
): void {
  const text = format === 'json' ? serializeExperimentJson(record) : serializeExperimentCsv(record);
  const id =
    record.metadata.experimentId.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 80) || 'experiment';
  const blob = new Blob([text], {
    type: format === 'json' ? 'application/json;charset=utf-8' : 'text/csv;charset=utf-8',
  });
  const anchor = document.createElement('a');
  const url = URL.createObjectURL(blob);
  let clicked = false;
  try {
    anchor.href = url;
    anchor.download = `architecture-race-${id}.${format}`;
    anchor.hidden = true;
    document.body.append(anchor);
    anchor.click();
    clicked = true;
  } finally {
    anchor.remove();
    if (clicked) setTimeout(() => URL.revokeObjectURL(url), 0);
    else URL.revokeObjectURL(url);
  }
}
