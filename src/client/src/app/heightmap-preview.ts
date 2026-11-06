import { afterRenderEffect, Component, ElementRef, input, viewChild } from '@angular/core';
import { HeightMapRun } from './heightmap.models';

export function heightMapPixels(values: Float32Array, heightMultiplier: number): Uint8ClampedArray {
  const pixels = new Uint8ClampedArray(values.length * 4);
  for (let index = 0; index < values.length; index++) {
    const shade =
      heightMultiplier === 0
        ? 0
        : Math.round(255 * Math.min(1, Math.max(0, values[index] / heightMultiplier)));
    pixels[index * 4] = shade;
    pixels[index * 4 + 1] = shade;
    pixels[index * 4 + 2] = shade;
    pixels[index * 4 + 3] = 255;
  }
  return pixels;
}

@Component({
  selector: 'app-heightmap-preview',
  template: `<canvas
    #canvas
    role="img"
    [attr.aria-label]="'Heightmap for seed ' + run().request.seed"
  ></canvas>`,
  styles: `
    canvas {
      display: block;
      width: 100%;
      height: auto;
      image-rendering: pixelated;
      background: #111;
      border-radius: 0.5rem;
    }
  `,
})
export class HeightMapPreview {
  readonly run = input.required<HeightMapRun>();
  private readonly canvas = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');

  constructor() {
    afterRenderEffect(() => {
      const run = this.run();
      const canvas = this.canvas().nativeElement;
      canvas.width = run.response.result.width;
      canvas.height = run.response.result.height;
      const context = canvas.getContext('2d');
      if (context) {
        const image = context.createImageData(canvas.width, canvas.height);
        image.data.set(heightMapPixels(run.response.result.values, run.request.heightMultiplier));
        context.putImageData(image, 0, 0);
      }
    });
  }
}
