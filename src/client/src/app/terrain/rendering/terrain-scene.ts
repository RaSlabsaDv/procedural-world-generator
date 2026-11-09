import { inlandReeds } from './inland-reeds';
import { shoreStones } from './shore-stones';
import { inlandBankWetness } from './inland-bank-wetness';
import { inlandWaterGeometry } from './inland-water-geometry';
import { visibleDecorations } from './lake-footprint';
import { terrainGrass } from './terrain-grass';
import type { DataArrayTexture } from 'three';
import { AtmosphereSettings, DEFAULT_ATMOSPHERE_SETTINGS } from './atmosphere-settings.service';
import { bindAtmosphere, terrainAtmosphere } from './terrain-atmosphere';
import { Texture } from 'three';
import { oceanGeometry } from './ocean-geometry';
import { oceanMaterial } from './ocean-material';
import { OceanSettings } from './ocean-settings.service';
import { Mesh, Scene, WebGLRenderer } from 'three';
import { DEFAULT_SCENE_ENVIRONMENT, SceneEnvironmentSnapshot } from './scene-environment';
import { HeightMapRequest, TerrainResponse } from '../data/terrain.models';
import { terrainGeometry } from './terrain-geometry';
import { terrainForestLod } from './tree-lod';
import { terrainRocks } from './terrain-rocks';
import { terrainLighting } from './terrain-lighting';
import { terrainSurfaceMaterial, SurfaceTextures } from './terrain-surfaces';

/** Owns synchronous scene content only. The preview owns camera, controls, renderer and textures. */
export function terrainScene(
  scene: Scene,
  renderer: WebGLRenderer,
  request: HeightMapRequest,
  result: TerrainResponse['result'],
  textures: SurfaceTextures,
  environment: SceneEnvironmentSnapshot = DEFAULT_SCENE_ENVIRONMENT,
  water?: { seaLevel: number; normal: Texture; settings: OceanSettings },
  atmosphereSettings: AtmosphereSettings = DEFAULT_ATMOSPHERE_SETTINGS,
  microNormals?: DataArrayTexture,
) {
  let terrain:
    Mesh<ReturnType<typeof terrainGeometry>, ReturnType<typeof terrainSurfaceMaterial>> | undefined;
  let forest: ReturnType<typeof terrainForestLod> | undefined;
  let grass: ReturnType<typeof terrainGrass> | undefined;
  let rocks: ReturnType<typeof terrainRocks> | undefined;
  let shore: ReturnType<typeof shoreStones> | undefined;
  let reeds: ReturnType<typeof inlandReeds> | undefined;
  let lighting: ReturnType<typeof terrainLighting> | undefined;
  let ocean:
    | Mesh<NonNullable<ReturnType<typeof oceanGeometry>>, ReturnType<typeof oceanMaterial>>
    | undefined;
  let inland: ReturnType<typeof inlandWaterGeometry> | undefined;
  const waters: Mesh<
    NonNullable<ReturnType<typeof oceanGeometry>>,
    ReturnType<typeof oceanMaterial>
  >[] = [];
  const inlandMeshes: typeof waters = [],
    inlandMaterials: ReturnType<typeof oceanMaterial>[] = [];
  let atmosphere: ReturnType<typeof terrainAtmosphere> | undefined;
  let pendingGeometry: ReturnType<typeof oceanGeometry>;
  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    if (ocean) {
      scene.remove(ocean);
      ocean.material.dispose();
    }
    for (const mesh of inlandMeshes) mesh.removeFromParent();
    for (const material of inlandMaterials) material.dispose();
    inland?.dispose();
    atmosphere?.dispose();
    pendingGeometry?.dispose();
    lighting?.dispose();
    grass?.dispose();
    forest?.dispose();
    rocks?.dispose();
    shore?.dispose();
    reeds?.dispose();
    terrain?.geometry.dispose();
    terrain?.material.dispose();
  };
  try {
    terrain = new Mesh(
      terrainGeometry(result),
      terrainSurfaceMaterial(textures, result.width, result.height, microNormals),
    );
    scene.add(terrain);
    const sea = water ? water.seaLevel * Math.fround(request.heightMultiplier) : 0;
    if (water) inland = inlandWaterGeometry(result, sea);
    terrain.geometry.setAttribute(
      'bankWetness',
      inlandBankWetness(terrain.geometry, result.width, result.height, [
        inland?.lake,
        inland?.river,
      ]),
    );
    shore = shoreStones(request.seed, result, terrain.geometry, [inland?.lake, inland?.river]);
    for (const mesh of shore.meshes) scene.add(mesh);
    reeds = inlandReeds(
      request.seed,
      result,
      terrain.geometry,
      [inland?.lake, inland?.river],
      shore.footprints,
    );
    if (reeds.mesh) scene.add(reeds.mesh);
    const decorations = water ? visibleDecorations(result, inland?.riverSurfaceAt) : result;
    forest = terrainForestLod(decorations, request.seed);
    for (const mesh of forest.casters) scene.add(mesh);
    for (const mesh of forest.meshes) scene.add(mesh);
    rocks = terrainRocks(decorations);
    for (const rock of rocks.meshes) scene.add(rock);
    lighting = terrainLighting(
      scene,
      renderer,
      request,
      terrain,
      [...forest.casters, ...rocks.meshes],
      environment,
    );
    atmosphere = terrainAtmosphere(
      scene,
      lighting.uniforms,
      Math.max(request.width - 1, request.height - 1, request.heightMultiplier, 1),
      sea,
      false,
      atmosphereSettings,
    );
    bindAtmosphere(terrain.material, atmosphere.uniforms, true);
    for (const group of forest.groups) {
      bindAtmosphere(group.trunks.material, atmosphere.uniforms);
      bindAtmosphere(group.crowns.material, atmosphere.uniforms);
    }
    for (const rock of rocks.meshes) bindAtmosphere(rock.material, atmosphere.uniforms);
    for (const mesh of shore.meshes) bindAtmosphere(mesh.material, atmosphere.uniforms);
    if (reeds.mesh) bindAtmosphere(reeds.mesh.material, atmosphere.uniforms);
    grass = terrainGrass(request.seed, decorations, !!water, inland?.riverSurfaceAt);
    if (grass.mesh) {
      scene.add(grass.mesh);
      bindAtmosphere(grass.mesh.material, atmosphere.uniforms);
    }
    if (water) {
      pendingGeometry = oceanGeometry(
        result,
        water.seaLevel * Math.fround(request.heightMultiplier),
      );
      if (pendingGeometry) {
        ocean = new Mesh(
          pendingGeometry,
          oceanMaterial(water.normal, lighting.uniforms, water.settings, atmosphere.uniforms),
        );
        waters.push(ocean);
        ocean.name = 'ocean-presentation-v1';
        ocean.renderOrder = 1;
        scene.add(ocean);
        atmosphere.uniforms.atmosphereWater.value = 1;
      }

      for (const geometry of [inland!.lake, inland!.river]) {
        if (!geometry) continue;
        const material = oceanMaterial(
          water.normal,
          lighting.uniforms,
          water.settings,
          atmosphere.uniforms,
          geometry === inland!.river ? 'river' : 'lake',
        );
        inlandMaterials.push(material);
        const mesh = new Mesh(geometry, material);
        mesh.name = geometry.name;
        mesh.renderOrder = 1;
        inlandMeshes.push(mesh);
        waters.push(mesh);
        scene.add(mesh);
      }
      atmosphere.uniforms.atmosphereWater.value = waters.length ? 1 : 0;
    }
    return {
      dispose,
      updateTreeLod: forest.update,
      updateAtmosphere: atmosphere.update,
      updateEnvironment: lighting.update,
      environmentUniforms: lighting.uniforms,
      hasOcean: !!ocean,
      hasWater: waters.length > 0,
      inlandStats: inland?.stats,
      shoreStoneStats: shore.stats,
      reedStats: reeds.stats,
      updateWater: (settings: OceanSettings) => {
        if (disposed) return;
        for (const mesh of waters) {
          mesh.material.uniforms['waterColor'].value.set(settings.color);
          mesh.material.uniforms['turbidity'].value = settings.turbidity;
          mesh.material.uniforms['foamIntensity'].value = settings.foam;
        }
      },
      waterTime: (seconds: number) => {
        if (!disposed)
          for (const mesh of waters)
            mesh.material.uniforms['waterTime'].value =
              (seconds + lighting!.uniforms.environmentVisualTimeSeconds.value) % 1000;
      },
    };
  } catch (error) {
    dispose();
    throw error;
  }
}
