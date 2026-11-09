import { DOCUMENT } from '@angular/common';
import { DestroyRef, Injectable, NgZone, InjectionToken, effect, inject } from '@angular/core';
import { OperationLock } from '../../platform/operation-lock.service';

export const OCEAN_FRAMES = new InjectionToken<{
  request: (callback: FrameRequestCallback) => number;
  cancel: (id: number) => void;
}>('Ocean frame scheduler', {
  providedIn: 'root',
  factory: () => ({
    request: (callback) => requestAnimationFrame(callback),
    cancel: (id) => cancelAnimationFrame(id),
  }),
});

/** One RAF and phase for all visible water views; no Angular signal updates per frame. */
@Injectable({ providedIn: 'root' })
export class OceanAnimationService {
  private readonly frames = inject(OCEAN_FRAMES);
  private readonly operations = inject(OperationLock);
  private readonly document = inject(DOCUMENT);
  private readonly zone = inject(NgZone);
  private readonly views = new Set<{ active: () => boolean; draw: (time: number) => void }>();
  private readonly motion = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)');
  private frame: number | undefined;
  private last: number | undefined;
  private seconds = 0;
  private frozen = false;
  get time(): number {
    return this.seconds;
  }
  constructor() {
    const refresh = () => this.refresh();
    this.document.addEventListener('visibilitychange', refresh);
    this.motion?.addEventListener('change', refresh);
    effect(() => {
      this.operations.busy();
      this.refresh();
    });
    inject(DestroyRef).onDestroy(() => {
      this.stop();
      this.views.clear();
      this.document.removeEventListener('visibilitychange', refresh);
      this.motion?.removeEventListener('change', refresh);
    });
  }
  register(active: () => boolean, draw: (time: number) => void): () => void {
    const entry = { active, draw };
    this.views.add(entry);
    this.refresh();
    return () => {
      this.views.delete(entry);
      this.refresh();
    };
  }
  freeze(time = 0): void {
    if (!Number.isFinite(time) || time < 0) throw new RangeError('Invalid water phase.');
    this.seconds = time;
    this.frozen = true;
    this.refresh();
    if (!this.operations.busy() && !this.document.hidden)
      this.zone.runOutsideAngular(() => {
        for (const view of this.views) if (view.active()) view.draw(this.seconds);
      });
  }
  resume(): void {
    this.frozen = false;
    this.refresh();
  }
  refresh(): void {
    const enabled =
      !this.frozen &&
      !this.motion?.matches &&
      !this.operations.busy() &&
      !this.document.hidden &&
      [...this.views].some((v) => v.active());
    if (!enabled) {
      this.stop();
      return;
    }
    if (this.frame !== undefined) return;
    this.zone.runOutsideAngular(() => {
      this.frame = this.frames.request((t) => {
        this.frame = undefined;
        if (this.operations.busy() || this.document.hidden || this.frozen || this.motion?.matches) {
          this.stop();
          return;
        }
        const active = [...this.views].filter((v) => v.active());
        if (!active.length) {
          this.stop();
          return;
        }
        if (this.last !== undefined && t - this.last < 1000 / 30) {
          this.refresh();
          return;
        }
        if (this.last !== undefined)
          this.seconds += Math.max(0, Math.min(0.1, (t - this.last) / 1000));
        this.last = t;
        for (const view of active) {
          if (this.operations.busy()) break;
          view.draw(this.seconds);
        }
        this.refresh();
      });
    });
  }
  private stop(): void {
    if (this.frame !== undefined) this.frames.cancel(this.frame);
    this.frame = undefined;
    this.last = undefined;
  }
}
