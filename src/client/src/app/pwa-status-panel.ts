import { Component, inject } from '@angular/core';
import { OfflineReadinessService } from './offline-readiness.service';
import { OperationLock } from './operation-lock.service';

@Component({
  selector: 'app-pwa-status',
  templateUrl: './pwa-status-panel.html',
  styleUrls: ['./panel.css', './pwa-status-panel.css'],
})
export class PwaStatusPanel {
  protected readonly offline = inject(OfflineReadinessService);
  private readonly operations = inject(OperationLock);
  protected readonly busy = this.operations.busy;

  constructor() {
    void this.offline.start();
  }

  protected retryOfflinePreparation(): void {
    if (this.busy()) return;
    void this.offline.prepare();
  }

  protected checkForUpdates(): void {
    if (this.busy()) return;
    void this.offline.checkForUpdate();
  }

  protected async reloadForUpdate(): Promise<void> {
    if (this.busy() || !this.offline.updateReady()) return;
    const release = this.operations.tryAcquire();
    if (!release) return;
    try {
      this.offline.prepareForReload();
      this.reloadPage();
    } catch (error) {
      this.offline.cancelReload(error instanceof Error ? error.message : String(error));
      release();
    }
  }

  protected reloadPage(): void {
    globalThis.location.reload();
  }
}
