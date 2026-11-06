import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { decodeError, decodeHeightMap } from './heightmap.contract';
import { HeightMapError, HeightMapRequest, HeightMapRun } from './heightmap.models';
import { WasmHostService } from './wasm-host.service';

@Injectable({ providedIn: 'root' })
export class HeightMapService {
  private readonly http = inject(HttpClient);
  private readonly wasm = inject(WasmHostService);

  async local(request: HeightMapRequest): Promise<HeightMapRun> {
    const runtime = await this.wasm.getRuntime();
    const started = performance.now();
    let decoded: unknown;
    try {
      decoded = JSON.parse(runtime.generateHeightMapJson(JSON.stringify(request)));
    } catch (error) {
      throw new HeightMapError(
        'protocol',
        error instanceof Error ? error.message : 'Local execution failed.',
      );
    }
    const response = decodeHeightMap(decoded, request);
    return {
      request,
      response,
      requestMs: performance.now() - started,
      initMs: this.wasm.getInfo().initMs,
    };
  }

  async remote(request: HeightMapRequest): Promise<HeightMapRun> {
    const started = performance.now();
    let decoded: unknown;
    try {
      decoded = await firstValueFrom(this.http.post<unknown>('/api/v1/heightmaps', request));
    } catch (error) {
      if (error instanceof HttpErrorResponse) {
        if (error.status === 0)
          throw new HeightMapError(
            'availability',
            'Remote API is unavailable. Check the connection and retry.',
          );
        const structured = decodeError(error.error);
        if (error.status === 400 && structured) throw structured;
        throw new HeightMapError('protocol', `Remote request failed (HTTP ${error.status}).`);
      }
      throw error;
    }
    const response = decodeHeightMap(decoded, request);
    return { request, response, requestMs: performance.now() - started, initMs: null };
  }
}
