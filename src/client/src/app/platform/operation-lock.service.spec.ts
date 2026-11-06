import { OperationLock } from './operation-lock.service';

describe('OperationLock', () => {
  it('rejects overlapping foreground operations', () => {
    const lock = new OperationLock();
    const release = lock.tryAcquire()!;
    expect(lock.busy()).toBe(true);
    expect(lock.tryAcquire()).toBeNull();
    release();
    expect(lock.busy()).toBe(false);
  });

  it('hands the lock to a queued preparation without an idle gap', async () => {
    const lock = new OperationLock();
    const first = lock.tryAcquire()!;
    const waiting = lock.acquire();
    first();
    expect(lock.busy()).toBe(true);
    const second = await waiting;
    first(); // Releasing an old handle twice cannot unlock the current owner.
    expect(lock.tryAcquire()).toBeNull();
    second();
    expect(lock.busy()).toBe(false);
  });
});
