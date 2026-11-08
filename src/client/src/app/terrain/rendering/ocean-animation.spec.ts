import { TestBed } from '@angular/core/testing';
import { OceanAnimationService, OCEAN_FRAMES } from './ocean-animation.service';
import { OperationLock } from '../../platform/operation-lock.service';

it('shares one bounded phase, pauses synchronously, resumes without jumps and releases all RAF callbacks', async () => {
  const callbacks = new Map<number, FrameRequestCallback>();
  let id = 0;
  vi.stubGlobal('matchMedia', () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  }));
  TestBed.configureTestingModule({
    providers: [
      {
        provide: OCEAN_FRAMES,
        useValue: {
          request: (cb: FrameRequestCallback) => {
            callbacks.set(++id, cb);
            return id;
          },
          cancel: (n: number) => callbacks.delete(n),
        },
      },
    ],
  });
  const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
  try {
    const hub = TestBed.inject(OceanAnimationService),
      lock = TestBed.inject(OperationLock),
      a = vi.fn(),
      b = vi.fn();
    let visible = true;
    const offA = hub.register(() => visible, a),
      offB = hub.register(() => visible, b);
    const tick = (t: number) => {
      const [n, cb] = callbacks.entries().next().value!;
      callbacks.delete(n);
      cb(t);
    };
    expect(callbacks.size).toBe(1);
    tick(0);
    tick(40);
    expect(a.mock.calls.at(-1)![0]).toBe(0.04);
    expect(b.mock.calls).toEqual(a.mock.calls);
    const release = lock.tryAcquire()!;
    tick(1000);
    expect(callbacks.size).toBe(0);
    expect(hub.time).toBe(0.04);
    release();
    hub.refresh();
    tick(5000);
    expect(hub.time).toBe(0.04);
    visible = false;
    hub.refresh();
    expect(callbacks.size).toBe(0);
    visible = true;
    hub.refresh();
    tick(10000);
    expect(hub.time).toBe(0.04);
    hidden.mockReturnValue(true);
    document.dispatchEvent(new Event('visibilitychange'));
    expect(callbacks.size).toBe(0);
    hidden.mockReturnValue(false);
    document.dispatchEvent(new Event('visibilitychange'));
    tick(15000);
    expect(hub.time).toBe(0.04);
    hub.freeze(12);
    expect(callbacks.size).toBe(0);
    expect(a.mock.calls.at(-1)![0]).toBe(12);
    hub.resume();
    tick(20000);
    expect(hub.time).toBe(12);
    offA();
    offB();
    expect(callbacks.size).toBe(0);
  } finally {
    TestBed.resetTestingModule();
    hidden.mockRestore();
    vi.unstubAllGlobals();
  }
});
