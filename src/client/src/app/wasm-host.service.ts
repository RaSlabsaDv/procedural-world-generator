import { DestroyRef, inject, Injectable } from '@angular/core';

export interface WorldGeneratorRuntime {
  generateTerrainJson(requestJson: string): Promise<string>;
}

export interface RuntimeInfo {
  initCount: number;
  initMs: number | null;
  runtimeMs: number | null;
  execution: 'worker';
  protocol: string;
}

interface HostModule {
  getWorldGenerator(): Promise<WorldGeneratorRuntime>;
  getRuntimeInfo(): RuntimeInfo;
  disposeWorldGenerator(): void;
}

let hostModulePromise: Promise<HostModule> | null = null;

@Injectable({ providedIn: 'root' })
export class WasmHostService {
  private runtime: WorldGeneratorRuntime | null = null;
  private runtimePromise: Promise<WorldGeneratorRuntime> | null = null;
  private hostModule: HostModule | null = null;

  constructor() {
    inject(DestroyRef).onDestroy(() => this.hostModule?.disposeWorldGenerator());
  }

  async getRuntime(): Promise<WorldGeneratorRuntime> {
    if (this.runtime) {
      return this.runtime;
    }

    this.runtimePromise ??= this.initialize();
    return this.runtimePromise;
  }

  getInfo(): RuntimeInfo {
    return (
      this.hostModule?.getRuntimeInfo() ?? {
        initCount: 0,
        initMs: null,
        runtimeMs: null,
        execution: 'worker',
        protocol: 'worker-rpc-v1',
      }
    );
  }

  private async initialize(): Promise<WorldGeneratorRuntime> {
    hostModulePromise ??= import(
      /* webpackIgnore: true */ `${document.baseURI}wasm/world-generator-host.js`
    ) as Promise<HostModule>;

    try {
      this.hostModule = await hostModulePromise;
      this.runtime = await this.hostModule.getWorldGenerator();
      return this.runtime;
    } catch (error) {
      hostModulePromise = null;
      this.runtimePromise = null;
      throw error;
    }
  }
}
