import {
  DataArrayTexture,
  LinearMipmapLinearFilter,
  Mesh,
  MeshLambertMaterial,
  BoxGeometry,
  RepeatWrapping,
  NoColorSpace,
  Scene,
  ShaderLib,
  Texture,
} from 'three';
import { loadTerrainMicroNormals } from './terrain-micro-normals';
import { terrainSurfaceMaterial } from './terrain-surfaces';
import { bindAtmosphere, terrainAtmosphere } from './terrain-atmosphere';
import { terrainLighting } from './terrain-lighting';
import { DEFAULT_ATMOSPHERE_SETTINGS } from './atmosphere-settings.service';
import { testMap } from '../testing/terrain-test-fixture';

const pixels = () => ({ width: 128, height: 640, data: new Uint8Array(128 * 640 * 4) });
it('uploads one linear repeated five-layer mipmapped array and disposes exactly once', async () => {
  const p = pixels(),
    owner = loadTerrainMicroNormals(async () => p),
    texture = await owner.ready;
  expect(texture.image.data).toBe(p.data);
  expect(texture.image.width).toBe(128);
  expect(texture.image.height).toBe(128);
  expect(texture.image.depth).toBe(5);
  expect(texture.colorSpace).toBe(NoColorSpace);
  expect(texture.wrapS).toBe(RepeatWrapping);
  expect(texture.wrapT).toBe(RepeatWrapping);
  expect(texture.generateMipmaps).toBe(true);
  expect(texture.minFilter).toBe(LinearMipmapLinearFilter);
  expect(texture.flipY).toBe(false);
  const dispose = vi.spyOn(texture, 'dispose');
  owner.dispose();
  owner.dispose();
  expect(dispose).toHaveBeenCalledTimes(1);
});
it('rejects late completion and malformed decode without a usable texture', async () => {
  let resolve!: (p: ReturnType<typeof pixels>) => void;
  const owner = loadTerrainMicroNormals(() => new Promise((r) => (resolve = r)));
  const failure = expect(owner.ready).rejects.toThrow(/microdetail normals/);
  owner.dispose();
  resolve(pixels());
  await failure;
  for (const p of [
    { ...pixels(), width: 640 },
    { ...pixels(), height: 128 },
    { ...pixels(), data: new Uint8Array(16) },
  ])
    await expect(loadTerrainMicroNormals(async () => p).ready).rejects.toThrow(
      /microdetail normals/,
    );
});
it('isolates concurrent owners and retries after rejection', async () => {
  await expect(
    loadTerrainMicroNormals(async () => {
      throw Error('decode failed');
    }).ready,
  ).rejects.toThrow(/microdetail normals/);
  const a = loadTerrainMicroNormals(async () => pixels()),
    b = loadTerrainMicroNormals(async () => pixels());
  const ta = await a.ready,
    tb = await b.ready;
  expect(ta).not.toBe(tb);
  expect(ta.image.data).not.toBe(tb.image.data);
  const release = vi.spyOn(tb, 'dispose');
  a.dispose();
  expect(release).not.toHaveBeenCalled();
  b.dispose();
  expect(release).toHaveBeenCalledTimes(1);
});
it('composes fragment normals with coverage and atmosphere while retaining vertex/shadow geometry', () => {
  const textures = {
      grass: new Texture(),
      soil: new Texture(),
      sand: new Texture(),
      rock: new Texture(),
      snow: new Texture(),
    },
    normal = new DataArrayTexture();
  const material = terrainSurfaceMaterial(textures, 129, 97, normal),
    scene = new Scene(),
    mesh = new Mesh(new BoxGeometry(), new MeshLambertMaterial());
  const light = terrainLighting(scene, { shadowMap: {} } as never, testMap, mesh, []),
    atmosphere = terrainAtmosphere(
      scene,
      light.uniforms,
      128,
      0,
      false,
      DEFAULT_ATMOSPHERE_SETTINGS,
    );
  bindAtmosphere(material, atmosphere.uniforms, true);
  const shader = {
    uniforms: {} as Record<string, { value: unknown }>,
    vertexShader: ShaderLib.lambert.vertexShader,
    fragmentShader: ShaderLib.lambert.fragmentShader,
  };
  material.onBeforeCompile(shader as never, null as never);
  expect(shader.uniforms['microNormals'].value).toBe(normal);
  expect(shader.uniforms['detail_grass'].value).toBe(textures.grass);
  expect(shader.uniforms['microStrength'].value).toBeGreaterThan(0);
  expect(shader.uniforms['microFadeFar'].value).toBeGreaterThan(
    shader.uniforms['microFadeNear'].value as number,
  );
  expect(shader.fragmentShader).toContain('textureGrad(microNormals');
  expect(shader.fragmentShader.indexOf('vec3 microDx=')).toBeLessThan(
    shader.fragmentShader.indexOf('if(microStrength>0.0'),
  );
  expect(shader.fragmentShader.indexOf('normal=normalize(mat3(viewMatrix)')).toBeLessThan(
    shader.fragmentShader.indexOf('#include <lights_lambert_fragment>'),
  );
  expect(shader.fragmentShader).toContain('applyAtmosphere');
  expect(shader.vertexShader).toContain('#include <shadowmap_vertex>');
  expect(shader.vertexShader).not.toContain('transformed +=');
  expect(material.customProgramCacheKey()).toContain('terrain-microdetail-v1');
  const reference = terrainSurfaceMaterial(textures, 129, 97),
    s = {
      uniforms: {},
      vertexShader: ShaderLib.lambert.vertexShader,
      fragmentShader: ShaderLib.lambert.fragmentShader,
    };
  reference.onBeforeCompile(s as never, null as never);
  expect((s.uniforms as Record<string, { value: number }>)['microStrength'].value).toBe(0);
  reference.dispose();
  material.dispose();
  normal.dispose();
  Object.values(textures).forEach((t) => t.dispose());
  atmosphere.dispose();
  light.dispose();
  mesh.geometry.dispose();
  mesh.material.dispose();
});
