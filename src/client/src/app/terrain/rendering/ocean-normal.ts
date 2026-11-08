import { NoColorSpace, RepeatWrapping, Texture, TextureLoader } from 'three';

export function loadOceanNormal(
  load: () => Promise<Texture> = () =>
    new TextureLoader().loadAsync('textures/water/waves-normal.png'),
) {
  let disposed = false,
    texture: Texture | undefined;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    texture?.dispose();
  };
  const ready = load()
    .then((value) => {
      if (disposed) {
        value.dispose();
        throw new Error('Water texture owner has been released.');
      }
      texture = value;
      value.colorSpace = NoColorSpace;
      value.wrapS = value.wrapT = RepeatWrapping;
      value.anisotropy = 1;
      return value;
    })
    .catch((cause: unknown) => {
      dispose();
      throw new Error('Unable to load water normal texture.', { cause });
    });
  return { ready, dispose };
}
