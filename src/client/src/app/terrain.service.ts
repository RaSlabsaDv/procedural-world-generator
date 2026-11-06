import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { decodeError, decodeTerrain } from './terrain.contract';
import { TerrainError, TerrainRun, TerrainRequest } from './terrain.models';
import { WasmHostService } from './wasm-host.service';

@Injectable({ providedIn: 'root' })
export class TerrainService {
  private readonly http = inject(HttpClient);
  private readonly wasm = inject(WasmHostService);

  async local(terrain: TerrainRequest): Promise<TerrainRun> {
    const request = terrain.heightMap;
    const runtime = await this.wasm.getRuntime();
    const started = performance.now();
    let decoded: unknown;
    try {
      decoded = JSON.parse(await runtime.generateTerrainJson(JSON.stringify(terrain)));
    } catch (error) {
      throw new TerrainError(
        'protocol',
        error instanceof Error ? error.message : 'Local execution failed.',
      );
    }
    const response = decodeTerrain(decoded, request, terrain);
    return {
      request,
      terrain,
      response,
      requestMs: performance.now() - started,
      initMs: this.wasm.getInfo().initMs,
    };
  }

  async remote(terrain: TerrainRequest): Promise<TerrainRun> {
    const request = terrain.heightMap;
    const started = performance.now();
    let decoded: unknown;
    try {
      decoded = await firstValueFrom(this.http.post<unknown>('/api/v1/terrains', terrain));
    } catch (error) {
      if (error instanceof HttpErrorResponse) {
        if (error.status === 0 || [502, 503, 504].includes(error.status))
          throw new TerrainError(
            'availability',
            'Remote API is unavailable. Check the connection and retry.',
          );
        const structured = decodeError(error.error);
        if (error.status === 400 && structured) throw structured;
        throw new TerrainError('protocol', `Remote request failed (HTTP ${error.status}).`);
      }
      throw error;
    }
    const response = decodeTerrain(decoded, request, terrain);
    return {
      request,
      terrain,
      response,
      requestMs: performance.now() - started,
      initMs: null,
    };
  }
}
