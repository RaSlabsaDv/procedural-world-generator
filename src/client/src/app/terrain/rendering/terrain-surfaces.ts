import { bindTerrainMicrodetail } from './terrain-microdetail';
import type { DataArrayTexture } from 'three';
import {
  Color,
  MeshLambertMaterial,
  NoColorSpace,
  RepeatWrapping,
  Texture,
  TextureLoader,
} from 'three';
import { LANDSCAPE_BIOME } from '../data/terrain.models';
import { BIOME_GROUND_COLORS, SURFACE_COLORS } from '../data/biome-presentation';
export const SURFACE_REPEAT_UNITS = 4;
export const SURFACE_TEXTURE_NAMES = ['grass', 'soil', 'sand', 'rock', 'snow'] as const;
type SurfaceName = (typeof SURFACE_TEXTURE_NAMES)[number];
export type SurfaceTextures = Record<SurfaceName, Texture>;

export { SURFACE_COLORS } from '../data/biome-presentation';
export const BIOME_GROUND_REVISION = 'terrain-biome-ground-v1';
const BIOME_IDS = Object.values(LANDSCAPE_BIOME);

export interface TerrainSurfaces {
  readonly ready: Promise<SurfaceTextures>;
  dispose(): void;
}

/** One owner per preview, shared by its successive materials; no global GPU cache. */
export function loadTerrainSurfaces(
  load: (url: string) => Promise<Texture> = (url) => new TextureLoader().loadAsync(url),
): TerrainSurfaces {
  let disposed = false;
  const owned: Texture[] = [];
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    for (const texture of owned) texture.dispose();
    owned.length = 0;
  };
  const ready = Promise.all(
    SURFACE_TEXTURE_NAMES.map(async (name) => {
      const texture = await load(`textures/terrain/${name}.png`).catch((cause: unknown) => {
        throw new Error(`Unable to load ${name} surface texture.`, { cause });
      });
      if (disposed) {
        texture.dispose();
        throw new Error('Surface texture owner has been released.');
      }
      owned.push(texture);
      texture.wrapS = texture.wrapT = RepeatWrapping;
      texture.colorSpace = NoColorSpace;
      texture.anisotropy = 1;
      return [name, texture] as const;
    }),
  )
    .then((entries) => Object.fromEntries(entries) as SurfaceTextures)
    .catch((error) => {
      dispose();
      throw error;
    });
  return { ready, dispose };
}

/** Frozen Lambert extension: no displacement, extra lights, ecological fields or extra draw calls. */
export function terrainSurfaceMaterial(
  textures: SurfaceTextures,
  width: number,
  height: number,
  microNormals?: DataArrayTexture,
) {
  const material = new MeshLambertMaterial();
  material.customProgramCacheKey = () => BIOME_GROUND_REVISION;
  material.onBeforeCompile = (shader) => {
    for (const name of SURFACE_TEXTURE_NAMES)
      shader.uniforms[`detail_${name}`] = { value: textures[name] };
    for (const name of ['sand', 'rock', 'snow', 'ocean'] as const)
      shader.uniforms[`surface_${name}`] = { value: new Color(SURFACE_COLORS[name]) };
    shader.uniforms['biomeGrass'] = {
      value: BIOME_IDS.map((id) => new Color(BIOME_GROUND_COLORS[id].grass)),
    };
    shader.uniforms['biomeSoil'] = {
      value: BIOME_IDS.map((id) => new Color(BIOME_GROUND_COLORS[id].soil)),
    };
    shader.uniforms['detailOffset'] = { value: [(width - 1) / 2, (height - 1) / 2] };
    shader.uniforms['detailRepeat'] = { value: SURFACE_REPEAT_UNITS };
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `
      #include <common>
      attribute float biomeId;
      uniform vec3 biomeGrass[${BIOME_IDS.length}];
      uniform vec3 biomeSoil[${BIOME_IDS.length}];
      varying vec3 vBiomeGrass;
      varying vec3 vBiomeSoil;
      attribute vec4 surfaceCoverage;
      attribute float sandCoverage;
      uniform vec2 detailOffset;
      varying vec4 vSurfaceCoverage;
      varying float vSandCoverage;
      varying vec3 vDetailPosition;
      varying vec3 vDetailNormal;
    `,
      )
      .replace(
        '#include <begin_vertex>',
        `
      #include <begin_vertex>
      // Lookup category colors before interpolation, never interpolate/reclassify IDs.
      vBiomeGrass = biomeGrass[int(biomeId)];
      vBiomeSoil = biomeSoil[int(biomeId)];
      vSurfaceCoverage = surfaceCoverage;
      vSandCoverage = sandCoverage;
      vDetailPosition = position + vec3(detailOffset.x, 0.0, detailOffset.y);
      vDetailNormal = normal;
    `,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `
      #include <common>
      uniform sampler2D detail_grass;
      uniform sampler2D detail_soil;
      uniform sampler2D detail_sand;
      uniform sampler2D detail_rock;
      uniform sampler2D detail_snow;
      uniform float detailRepeat;
      varying vec3 vBiomeGrass;
      varying vec3 vBiomeSoil;
      uniform vec3 surface_sand;
      uniform vec3 surface_rock;
      uniform vec3 surface_snow;
      uniform vec3 surface_ocean;
      varying vec4 vSurfaceCoverage;
      varying float vSandCoverage;
      varying vec3 vDetailPosition;
      varying vec3 vDetailNormal;
      float projectedDetail(sampler2D detail, vec3 p, vec3 axis) {
        return dot(vec3(texture2D(detail, p.yz).r, texture2D(detail, p.xz).r,
          texture2D(detail, p.xy).r), axis);
      }
    `,
      )
      .replace(
        '#include <color_fragment>',
        `
      #include <color_fragment>
      vec3 detailAxis = pow(abs(normalize(vDetailNormal)), vec3(4.0));
      detailAxis /= max(dot(detailAxis, vec3(1.0)), 0.0001);
      vec3 detailPoint = vDetailPosition / detailRepeat;
      float land = dot(vSurfaceCoverage, vec4(1.0)) + vSandCoverage;
      vec3 ground = max(0.0, 1.0-land) * surface_ocean;
      if (vSurfaceCoverage.x > 0.0) ground += vSurfaceCoverage.x * vBiomeGrass * (0.7 + 0.6 * projectedDetail(detail_grass, detailPoint, detailAxis));
      if (vSurfaceCoverage.y > 0.0) ground += vSurfaceCoverage.y * vBiomeSoil * (0.7 + 0.6 * projectedDetail(detail_soil, detailPoint, detailAxis));
      if (vSurfaceCoverage.z > 0.0) ground += vSurfaceCoverage.z * surface_rock * (0.7 + 0.6 * projectedDetail(detail_rock, detailPoint, detailAxis));
      if (vSurfaceCoverage.w > 0.0) ground += vSurfaceCoverage.w * surface_snow * (0.7 + 0.6 * projectedDetail(detail_snow, detailPoint, detailAxis));
      if (vSandCoverage > 0.0) ground += vSandCoverage * surface_sand * (0.7 + 0.6 * projectedDetail(detail_sand, detailPoint, detailAxis));
      diffuseColor.rgb *= ground;
    `,
      );
  };
  bindTerrainMicrodetail(material, microNormals);
  return material;
}
