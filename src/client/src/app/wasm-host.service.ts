import { Injectable } from '@angular/core';

export interface WorldGeneratorRuntime {
  add(left: number, right: number): number;
  generateSamplesJson(seed: number, count: number): string;
  generateHeightMapJson(requestJson: string): string;
}

export interface RuntimeInfo {
  initCount: number;
  initMs: number | null;
}

interface HostModule {
  getWorldGenerator(): Promise<WorldGeneratorRuntime>;
  getRuntimeInfo(): RuntimeInfo;
}

let hostModulePromise: Promise<HostModule> | null = null;

@Injectable({ providedIn: 'root' })
export class WasmHostService {
  private runtime: WorldGeneratorRuntime | null = null;
  private runtimePromise: Promise<WorldGeneratorRuntime> | null = null;
  private hostModule: HostModule | null = null;
  private initMs: number | null = null;

  async getRuntime(): Promise<WorldGeneratorRuntime> {
    if (this.runtime) {
      return this.runtime;
    }

    this.runtimePromise ??= this.initialize();
    return this.runtimePromise;
  }

  getInfo(): RuntimeInfo {
    return {
      initCount: this.hostModule?.getRuntimeInfo().initCount ?? 0,
      initMs: this.initMs,
    };
  }

  private async initialize(): Promise<WorldGeneratorRuntime> {
    hostModulePromise ??= import(
      /* webpackIgnore: true */ `${document.baseURI}wasm/world-generator-host.js`
    ) as Promise<HostModule>;

    try {
      this.hostModule = await hostModulePromise;
      this.runtime = await this.hostModule.getWorldGenerator();
      this.initMs = this.hostModule.getRuntimeInfo().initMs;
      return this.runtime;
    } catch (error) {
      hostModulePromise = null;
      this.runtimePromise = null;
      throw error;
    }
  }
}
