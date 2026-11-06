import { Texture, RepeatWrapping, ShaderLib, WebGLRenderer } from 'three';
import {
  BIOME_SURFACE,
  loadTerrainSurfaces,
  terrainSurfaceMaterial,
  SURFACE_REPEAT_UNITS,
} from './terrain-surfaces';
import { LANDSCAPE_BIOME_IDS } from '../data/terrain.models';
import { terrainGeometry } from './terrain-geometry';

function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

it('owns four detail textures once and releases late completions after destruction', async () => {
  const requests = Array.from({ length: 4 }, () => deferred<Texture>());
  let index = 0;
  const owner = loadTerrainSurfaces(() => requests[index++].promise);
  const outcome = expect(owner.ready).rejects.toThrow(/released/);
  const a = new Texture(),
    late = [new Texture(), new Texture(), new Texture()];
  const aDispose = vi.spyOn(a, 'dispose'),
    lateDisposals = late.map((texture) => vi.spyOn(texture, 'dispose'));
  requests[0].resolve(a);
  await Promise.resolve();
  await vi.waitFor(() => expect(a.wrapS).toBe(RepeatWrapping));
  owner.dispose();
  owner.dispose();
  requests.slice(1).forEach((request, i) => request.resolve(late[i]));
  await outcome;
  expect(aDispose).toHaveBeenCalledTimes(1);
  for (const disposal of lateDisposals) expect(disposal).toHaveBeenCalledTimes(1);
});

it('cleans successful and late textures when another asset fails', async () => {
  const requests = Array.from({ length: 4 }, () => deferred<Texture>());
  let index = 0;
  const owner = loadTerrainSurfaces(() => requests[index++].promise);
  const outcome = expect(owner.ready).rejects.toThrow('Unable to load soil surface texture');
  const textures = Array.from({ length: 3 }, () => new Texture());
  const disposals = textures.map((texture) => vi.spyOn(texture, 'dispose'));
  requests[0].resolve(textures[0]);
  await Promise.resolve();
  requests[1].reject(new Error('decode'));
  await outcome;
  requests[2].resolve(textures[1]);
  requests[3].resolve(textures[2]);
  await Promise.resolve();
  owner.dispose();
  await vi.waitFor(() => {
    for (const spy of disposals) expect(spy).toHaveBeenCalledTimes(1);
  });
});

it('maps every biome without changing geometry, colors or triangle indices', () => {
  expect(Object.keys(BIOME_SURFACE).map(Number).sort()).toEqual([...LANDSCAPE_BIOME_IDS].sort());
  const values = new Float32Array(9),
    biomes = Uint8Array.from({ length: 9 }, (_, i) => i);
  const geometry = terrainGeometry({ width: 3, height: 3, values, biomes });
  const families = geometry.getAttribute('surfaceFamily');
  expect(families.array).toBeInstanceOf(Uint8Array);
  expect(families.array.slice(0, 4)).toEqual(new Uint8Array(4)); // Ocean: modulation exactly one.
  for (let i = 1; i < 9; i++) {
    const row = [...families.array.slice(i * 4, i * 4 + 4)];
    expect(row.reduce((a, b) => a + b)).toBe(1);
    expect(row[BIOME_SURFACE[i as keyof typeof BIOME_SURFACE]]).toBe(1);
  }
  expect([...values]).toEqual(Array(9).fill(0));
  expect([...geometry.index!.array.slice(0, 6)]).toEqual([0, 3, 1, 1, 3, 4]);
  geometry.dispose();
});

it('keeps repeat distance fixed while translating centered rectangular grids back to grid units', async () => {
  const owner = loadTerrainSurfaces(async () => new Texture());
  const textures = await owner.ready;
  const shaders = [
    terrainSurfaceMaterial(textures, 3, 2),
    terrainSurfaceMaterial(textures, 512, 129),
  ].map((material) => {
    const shader = {
      vertexShader: ShaderLib.lambert.vertexShader,
      fragmentShader: ShaderLib.lambert.fragmentShader,
      uniforms: {} as Record<string, { value: unknown }>,
    };
    material.onBeforeCompile(
      shader as Parameters<typeof material.onBeforeCompile>[0],
      {} as WebGLRenderer,
    );
    material.dispose();
    return shader;
  });
  expect(shaders[0].uniforms['detailRepeat'].value).toBe(SURFACE_REPEAT_UNITS);
  expect(shaders[1].uniforms['detailRepeat'].value).toBe(SURFACE_REPEAT_UNITS);
  expect(shaders[0].uniforms['detailOffset'].value).toEqual([1, 0.5]);
  expect(shaders[1].uniforms['detailOffset'].value).toEqual([255.5, 64]);
  expect(shaders[0].vertexShader).not.toContain('position.y =');
  owner.dispose();
});
