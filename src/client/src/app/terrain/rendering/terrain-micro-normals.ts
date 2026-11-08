import {
  DataArrayTexture,
  ImageBitmapLoader,
  LinearFilter,
  LinearMipmapLinearFilter,
  NoColorSpace,
  RepeatWrapping,
} from 'three';

export const MICRO_NORMAL_SIZE = 128;
export const MICRO_NORMAL_LAYERS = 5;
export interface MicroNormalPixels {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8Array;
}

async function decodeAtlas(): Promise<MicroNormalPixels> {
  const image = await new ImageBitmapLoader()
    .setOptions({ colorSpaceConversion: 'none', premultiplyAlpha: 'none' })
    .loadAsync('textures/microdetail/normals.png');
  try {
    if (
      image.width !== MICRO_NORMAL_SIZE ||
      image.height !== MICRO_NORMAL_SIZE * MICRO_NORMAL_LAYERS
    )
      throw new Error('Invalid terrain normal atlas dimensions.');
    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('Unable to decode terrain normal atlas.');
    ctx.drawImage(image, 0, 0);
    const pixels = ctx.getImageData(0, 0, image.width, image.height).data;
    return {
      width: image.width,
      height: image.height,
      data: new Uint8Array(pixels.buffer, pixels.byteOffset, pixels.byteLength),
    };
  } finally {
    image.close();
  }
}

/** One bounded CPU decode and array-texture owner per preview, reused across scenes. */
export function loadTerrainMicroNormals(load: () => Promise<MicroNormalPixels> = decodeAtlas) {
  let disposed = false,
    texture: DataArrayTexture | undefined;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    texture?.dispose();
  };
  const ready = load()
    .then((pixels) => {
      if (disposed) throw new Error('Terrain normal owner has been released.');
      if (
        pixels.width !== MICRO_NORMAL_SIZE ||
        pixels.height !== MICRO_NORMAL_SIZE * MICRO_NORMAL_LAYERS ||
        !(pixels.data instanceof Uint8Array) ||
        pixels.data.byteLength !== MICRO_NORMAL_SIZE * MICRO_NORMAL_SIZE * MICRO_NORMAL_LAYERS * 4
      )
        throw new Error('Invalid terrain normal atlas data.');
      texture = new DataArrayTexture(
        pixels.data,
        MICRO_NORMAL_SIZE,
        MICRO_NORMAL_SIZE,
        MICRO_NORMAL_LAYERS,
      );
      texture.colorSpace = NoColorSpace;
      texture.wrapS = texture.wrapT = RepeatWrapping;
      texture.minFilter = LinearMipmapLinearFilter;
      texture.magFilter = LinearFilter;
      texture.generateMipmaps = true;
      texture.anisotropy = 1;
      texture.needsUpdate = true;
      texture.name = 'terrain-microdetail-v1';
      return texture;
    })
    .catch((cause: unknown) => {
      dispose();
      throw new Error('Unable to load terrain microdetail normals.', { cause });
    });
  return { ready, dispose };
}
