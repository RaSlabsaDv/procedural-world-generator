export interface SampleResponse {
  values: number[];
  computeMs: number;
}

export interface ApiErrorResponse {
  error: string;
  fields?: Record<string, string>;
}
