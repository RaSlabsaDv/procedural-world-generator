import { LANDSCAPE_BIOME } from '../data/terrain.models';
import { BIOME_GROUND_COLORS, SURFACE_COLORS } from '../data/biome-presentation';
import { testSurfaceWeights } from '../testing/terrain-test-fixture';
import { Color, Texture, RepeatWrapping, ShaderLib, WebGLRenderer } from 'three';
import {
  loadTerrainSurfaces,
  terrainSurfaceMaterial,
  SURFACE_REPEAT_UNITS,
} from './terrain-surfaces';
import { terrainGeometry } from './terrain-geometry';

function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

it('owns five detail textures once and releases late completions after destruction', async () => {
  const requests = Array.from({ length: 5 }, () => deferred<Texture>());
  let index = 0;
  const owner = loadTerrainSurfaces(() => requests[index++].promise);
  const outcome = expect(owner.ready).rejects.toThrow(/released/);
  const a = new Texture(),
    late = [new Texture(), new Texture(), new Texture(), new Texture()];
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

it.each([
  ['soil', 1],
  ['sand', 2],
] as const)('cleans successful and late textures when %s fails', async (name, failed) => {
  const requests = Array.from({ length: 5 }, () => deferred<Texture>());
  let index = 0;
  const owner = loadTerrainSurfaces(() => requests[index++].promise);
  const outcome = expect(owner.ready).rejects.toThrow(`Unable to load ${name} surface texture`);
  const textures = Array.from({ length: 5 }, () => new Texture());
  const disposals = textures.map((texture) => vi.spyOn(texture, 'dispose'));
  requests[0].resolve(textures[0]);
  await Promise.resolve();
  requests[failed].reject(new Error('decode'));
  await outcome;
  for (let i = 1; i < requests.length; i++) if (i !== failed) requests[i].resolve(textures[i]);
  await Promise.resolve();
  owner.dispose();
  await vi.waitFor(() => {
    for (let i = 0; i < disposals.length; i++)
      if (i !== failed) expect(disposals[i]).toHaveBeenCalledTimes(1);
  });
});

it('unpacks continuous Core weights without category mapping or changed triangle indices', () => {
  const values = new Float32Array(9),
    biomes = Uint8Array.from({ length: 9 }, (_, i) => i);
  const surfaceWeights = Float32Array.from(testSurfaceWeights(biomes));
  surfaceWeights.set([0.1, 0.2, 0.3, 0.15, 0.25], 5);
  const geometry = terrainGeometry({ width: 3, height: 3, values, surfaceWeights, biomes });
  const coverage = geometry.getAttribute('surfaceCoverage');
  expect(coverage.array).toBeInstanceOf(Float32Array);
  expect([...coverage.array.slice(0, 4)]).toEqual([0, 0, 0, 0]);
  expect([...coverage.array.slice(4, 8)]).toEqual([...Float32Array.from([0.1, 0.2, 0.15, 0.25])]);
  expect(geometry.getAttribute('sandCoverage').itemSize).toBe(1);
  expect(geometry.getAttribute('sandCoverage').array[1]).toBe(Math.fround(0.3));
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
  expect(shaders[0].vertexShader).toContain('attribute float sandCoverage');
  expect(shaders[0].fragmentShader).toContain(' + vSandCoverage');
  expect(shaders[0].fragmentShader).toContain('projectedDetail(detail_sand');
  expect(shaders[0].uniforms['detail_sand'].value).toBe(textures.sand);
  owner.dispose();
});

it('looks up linear grass/soil colors at vertices and leaves protected material terms untouched', async () => {
  const owner = loadTerrainSurfaces(async () => new Texture());
  const material = terrainSurfaceMaterial(await owner.ready, 3, 3);
  const shader = {
    vertexShader: ShaderLib.lambert.vertexShader,
    fragmentShader: ShaderLib.lambert.fragmentShader,
    uniforms: {} as Record<string, { value: unknown }>,
  };
  material.onBeforeCompile(
    shader as Parameters<typeof material.onBeforeCompile>[0],
    {} as WebGLRenderer,
  );
  expect(material.customProgramCacheKey()).toBe('terrain-biome-ground-v1:terrain-microdetail-v1');
  expect(shader.vertexShader).toContain('attribute float biomeId;');
  expect(shader.vertexShader).toContain('vBiomeGrass = biomeGrass[int(biomeId)]');
  expect(shader.vertexShader).toContain('vBiomeSoil = biomeSoil[int(biomeId)]');
  expect(shader.fragmentShader).not.toContain('int(biomeId)');
  expect(shader.fragmentShader).toContain('vSurfaceCoverage.x * vBiomeGrass *');
  expect(shader.fragmentShader).toContain('vSurfaceCoverage.y * vBiomeSoil *');
  expect(shader.fragmentShader).toContain(
    'vSurfaceCoverage.z * surface_rock * (0.7 + 0.6 * projectedDetail(detail_rock',
  );
  expect(shader.fragmentShader).toContain(
    'vSurfaceCoverage.w * surface_snow * (0.7 + 0.6 * projectedDetail(detail_snow',
  );
  expect(shader.fragmentShader).toContain(
    'vSandCoverage * surface_sand * (0.7 + 0.6 * projectedDetail(detail_sand',
  );
  expect(shader.fragmentShader).toContain('vec3 ground = max(0.0, 1.0-land) * surface_ocean;');
  expect(shader.fragmentShader).toContain('diffuseColor.rgb *= ground;');
  const grass = shader.uniforms['biomeGrass'].value as Color[],
    soil = shader.uniforms['biomeSoil'].value as Color[];
  expect(grass).toHaveLength(9);
  expect(soil).toHaveLength(9);
  for (const id of Object.values(LANDSCAPE_BIOME)) {
    expect(grass[id].getHex()).toBe(BIOME_GROUND_COLORS[id].grass);
    expect(soil[id].getHex()).toBe(BIOME_GROUND_COLORS[id].soil);
    expect(grass[id].r).toBeGreaterThan(0);
    expect(grass[id].r).toBeLessThan(((BIOME_GROUND_COLORS[id].grass >> 16) & 255) / 255);
  }
  for (const id of [LANDSCAPE_BIOME.Ocean, LANDSCAPE_BIOME.Rock, LANDSCAPE_BIOME.SnowHighlands]) {
    expect(grass[id].toArray()).toEqual(new Color(SURFACE_COLORS.grass).toArray());
    expect(soil[id].toArray()).toEqual(new Color(SURFACE_COLORS.soil).toArray());
  }
  // Independent sRGB transfer reference: red=160/255 -> linear 0.3515326, not raw byte/255.
  expect(grass[LANDSCAPE_BIOME.Grassland].r).toBeCloseTo(0.3515326, 6);
  expect(grass[LANDSCAPE_BIOME.Grassland]).not.toBe(grass[LANDSCAPE_BIOME.BroadleafForest]);
  material.dispose();
  owner.dispose();
});
