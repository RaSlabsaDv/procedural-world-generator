export const ALGORITHM_VERSION = 'value-noise-fbm-v1';

export interface HeightMapRequest {
  readonly seed: number;
  readonly width: number;
  readonly height: number;
  readonly noiseScale: number;
  readonly octaves: number;
  readonly heightMultiplier: number;
  readonly algorithmVersion: string;
}

export interface HeightMapResponse {
  readonly result: {
    readonly width: number;
    readonly height: number;
    readonly values: Float32Array;
    readonly algorithmVersion: string;
  };
  readonly computeMs: number;
  readonly coreBuildId: string;
  readonly workload: 'heightmap';
}

export interface HeightMapRun {
  readonly request: HeightMapRequest;
  readonly response: HeightMapResponse;
  readonly requestMs: number;
  readonly initMs: number | null;
}

export class HeightMapError extends Error {
  constructor(
    readonly kind: 'validation' | 'invalid_json' | 'availability' | 'protocol',
    message: string,
    readonly fields: Readonly<Record<string, string>> = {},
  ) {
    super(message);
  }
}
