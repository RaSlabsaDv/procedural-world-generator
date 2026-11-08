import { vi } from 'vitest';
import { downloadExperiment } from './experiment-download';
import { experimentFixture } from '../testing/experiment-fixture';

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('URL', { createObjectURL: vi.fn(() => 'blob:test'), revokeObjectURL: vi.fn() });
});
afterEach(() => {
  vi.runAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it.each(['json', 'csv'] as const)(
  'downloads %s with a safe filename and releases the anchor and URL',
  (format) => {
    const source = experimentFixture();
    const record = {
      ...source,
      metadata: { ...source.metadata, experimentId: '../unsafe/ідентифікатор' },
    };
    let clicked: HTMLAnchorElement | null = null;
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      clicked = this;
    });
    downloadExperiment(record, format, document);
    expect(URL.createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
    expect(clicked!.download).toMatch(
      new RegExp('^architecture-race-[A-Za-z0-9_-]+\\.' + format + '$'),
    );
    expect(document.querySelector('a[download]')).toBeNull();
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
    vi.runAllTimers();
    expect(URL.revokeObjectURL).toHaveBeenCalledExactlyOnceWith('blob:test');
  },
);
it('cleans up even when dispatching a download throws', () => {
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {
    throw new Error('Blocked');
  });
  expect(() => downloadExperiment(experimentFixture(), 'json', document)).toThrow('Blocked');
  expect(document.querySelector('a[download]')).toBeNull();
  expect(URL.revokeObjectURL).toHaveBeenCalledExactlyOnceWith('blob:test');
});
it('does not allocate a URL when serialization fails', () => {
  const bad = { ...experimentFixture(), extra: new Float32Array(1) };
  expect(() => downloadExperiment(bad, 'json', document)).toThrow();
  expect(URL.createObjectURL).not.toHaveBeenCalled();
});
