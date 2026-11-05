import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { SampleResponse } from './probe.models';

interface AddResponse {
  sum: number;
}

@Injectable({ providedIn: 'root' })
export class RemoteProbeService {
  private readonly http = inject(HttpClient);

  async add(left: number, right: number): Promise<number> {
    const response = await firstValueFrom(
      this.http.post<AddResponse>('/api/v1/probe/add', { left, right }),
    );
    return response.sum;
  }

  generateSamples(seed: number, count: number): Promise<SampleResponse> {
    return firstValueFrom(this.http.post<SampleResponse>('/api/v1/probe/samples', { seed, count }));
  }
}
