import { MeshLambertMaterial, NoColorSpace, RepeatWrapping, Texture, TextureLoader } from 'three';
import { LANDSCAPE_BIOME as B, LandscapeBiomeId } from '../data/terrain.models';

export const SURFACE_REPEAT_UNITS = 4;
export const SURFACE_TEXTURE_NAMES = ['grass', 'soil', 'rock', 'snow'] as const;
type SurfaceName = (typeof SURFACE_TEXTURE_NAMES)[number];
type SurfaceTextures = Record<SurfaceName, Texture>;

/** Display mapping of existing categories, not ecological coverage/suitability. Ocean is untinted. */
export const BIOME_SURFACE = {
  [B.Ocean]: -1,
  [B.Grassland]: 0,
  [B.BroadleafForest]: 0,
  [B.DryGrassland]: 1,
  [B.Rock]: 2,
  [B.ConiferForest]: 0,
  [B.Savanna]: 1,
  [B.Tundra]: 2,
  [B.SnowHighlands]: 3,
} as const satisfies Record<LandscapeBiomeId, number>;

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
export function terrainSurfaceMaterial(textures: SurfaceTextures, width: number, height: number) {
  const material = new MeshLambertMaterial({ vertexColors: true });
  material.customProgramCacheKey = () => 'terrain-detail-triplanar-v1';
  material.onBeforeCompile = (shader) => {
    for (const name of SURFACE_TEXTURE_NAMES)
      shader.uniforms[`detail_${name}`] = { value: textures[name] };
    shader.uniforms['detailOffset'] = { value: [(width - 1) / 2, (height - 1) / 2] };
    shader.uniforms['detailRepeat'] = { value: SURFACE_REPEAT_UNITS };
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `
      #include <common>
      attribute vec4 surfaceFamily;
      uniform vec2 detailOffset;
      varying vec4 vSurfaceFamily;
      varying vec3 vDetailPosition;
      varying vec3 vDetailNormal;
    `,
      )
      .replace(
        '#include <begin_vertex>',
        `
      #include <begin_vertex>
      vSurfaceFamily = surfaceFamily;
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
      uniform sampler2D detail_rock;
      uniform sampler2D detail_snow;
      uniform float detailRepeat;
      varying vec4 vSurfaceFamily;
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
      float modulation = 1.0;
      if (vSurfaceFamily.x > 0.0) modulation += vSurfaceFamily.x * (0.6 * projectedDetail(detail_grass, detailPoint, detailAxis) - 0.3);
      if (vSurfaceFamily.y > 0.0) modulation += vSurfaceFamily.y * (0.6 * projectedDetail(detail_soil, detailPoint, detailAxis) - 0.3);
      if (vSurfaceFamily.z > 0.0) modulation += vSurfaceFamily.z * (0.6 * projectedDetail(detail_rock, detailPoint, detailAxis) - 0.3);
      if (vSurfaceFamily.w > 0.0) modulation += vSurfaceFamily.w * (0.6 * projectedDetail(detail_snow, detailPoint, detailAxis) - 0.3);
      diffuseColor.rgb *= modulation;
    `,
      );
  };
  return material;
}
