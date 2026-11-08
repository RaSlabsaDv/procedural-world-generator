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
import { terrainForest } from './terrain-forest';
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
  let forest: ReturnType<typeof terrainForest> | undefined;
  let rocks: ReturnType<typeof terrainRocks> | undefined;
  let lighting: ReturnType<typeof terrainLighting> | undefined;
  let ocean:
    | Mesh<NonNullable<ReturnType<typeof oceanGeometry>>, ReturnType<typeof oceanMaterial>>
    | undefined;
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
    atmosphere?.dispose();
    pendingGeometry?.dispose();
    lighting?.dispose();
    forest?.dispose();
    rocks?.dispose();
    terrain?.geometry.dispose();
    terrain?.material.dispose();
  };
  try {
    terrain = new Mesh(
      terrainGeometry(result),
      terrainSurfaceMaterial(textures, result.width, result.height, microNormals),
    );
    scene.add(terrain);
    forest = terrainForest(result);
    for (const group of forest.groups) scene.add(group.trunks, group.crowns);
    rocks = terrainRocks(result);
    for (const rock of rocks.meshes) scene.add(rock);
    lighting = terrainLighting(
      scene,
      renderer,
      request,
      terrain,
      [...forest.groups.flatMap((group) => [group.trunks, group.crowns]), ...rocks.meshes],
      environment,
    );
    const sea = water ? water.seaLevel * Math.fround(request.heightMultiplier) : 0;
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
        ocean.name = 'ocean-presentation-v1';
        ocean.renderOrder = 1;
        scene.add(ocean);
        atmosphere.uniforms.atmosphereWater.value = 1;
      }
    }
    return {
      dispose,
      updateAtmosphere: atmosphere.update,
      updateEnvironment: lighting.update,
      environmentUniforms: lighting.uniforms,
      hasOcean: !!ocean,
      updateWater: (settings: OceanSettings) => {
        if (disposed || !ocean) return;
        ocean.material.uniforms['waterColor'].value.set(settings.color);
        ocean.material.uniforms['turbidity'].value = settings.turbidity;
        ocean.material.uniforms['foamIntensity'].value = settings.foam;
      },
      waterTime: (seconds: number) => {
        if (!disposed && ocean)
          ocean.material.uniforms['waterTime'].value =
            (seconds + lighting!.uniforms.environmentVisualTimeSeconds.value) % 1000;
      },
    };
  } catch (error) {
    dispose();
    throw error;
  }
}
