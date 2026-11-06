import { Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class OperationLock {
  private readonly held = signal(false);
  readonly busy = this.held.asReadonly();
  private readonly waiting: ((release: () => void) => void)[] = [];

  tryAcquire(): (() => void) | null {
    if (this.held()) return null;
    this.held.set(true);
    return this.releaseHandle();
  }

  acquire(): Promise<() => void> {
    const release = this.tryAcquire();
    return release
      ? Promise.resolve(release)
      : new Promise((resolve) => this.waiting.push(resolve));
  }

  private releaseHandle(): () => void {
    let released = false;
    return () => {
      if (released) return;
      released = true;
      const next = this.waiting.shift();
      if (next) next(this.releaseHandle());
      else this.held.set(false);
    };
  }
}
