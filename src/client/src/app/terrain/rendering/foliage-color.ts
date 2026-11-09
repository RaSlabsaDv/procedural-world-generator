import { Color } from 'three';
import { TreeInstance } from '../data/terrain.models';

function sample(identity: number, stream: number): number {
  let hash = identity ^ stream;
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x7feb352d);
  hash ^= hash >>> 15;
  hash = Math.imul(hash, 0x846ca68b);
  hash ^= hash >>> 16;
  return (hash >>> 0) / 4294967296;
}

/** Presentation tint only. Base/output are linear RGB; output may be reused. */
export function foliageColor(
  seed: number,
  tree: Pick<TreeInstance, 'cellIndex' | 'kind' | 'variant'>,
  base: Color,
  output: Color,
): Color {
  const identity =
    (seed >>> 0) ^
    Math.imul(tree.cellIndex, 0x9e3779b1) ^
    Math.imul(tree.kind + 1, 0x85ebca6b) ^
    Math.imul(tree.variant + 1, 0xc2b2ae35);
  const brightness = 0.88 + 0.24 * sample(identity, 0xa511e9b3);
  const warmth = -0.035 + 0.07 * sample(identity, 0x63d83595);
  const saturation = 0.96 + 0.08 * sample(identity, 0xb5297a4d);
  const r = base.r * brightness * (1 + warmth);
  const g = base.g * brightness;
  const b = base.b * brightness * (1 - warmth);
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const channel = (value: number) =>
    Math.max(0, Math.min(1, luminance + saturation * (value - luminance)));
  // Direct assignment preserves linear working space without another sRGB conversion.
  output.r = channel(r);
  output.g = channel(g);
  output.b = channel(b);
  return output;
}
