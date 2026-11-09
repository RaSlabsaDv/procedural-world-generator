/** Coordinate/stream randomness for decoration only; independent of terrain computation. */
export function presentationHash(seed: number, id: number, stream: number): number {
  let h = (seed ^ Math.imul(id + 1, 0x9e3779b1) ^ stream) >>> 0;
  h ^= h >>> 16;
  h = Math.imul(h, 0x7feb352d);
  h ^= h >>> 15;
  h = Math.imul(h, 0x846ca68b);
  h ^= h >>> 16;
  return h >>> 0;
}
export const presentationRandom = (seed: number, id: number, stream: number) =>
  (presentationHash(seed, id, stream) + 0.5) / 4294967296;
