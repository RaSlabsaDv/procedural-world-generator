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
) {
  let terrain:
    Mesh<ReturnType<typeof terrainGeometry>, ReturnType<typeof terrainSurfaceMaterial>> | undefined;
  let forest: ReturnType<typeof terrainForest> | undefined;
  let rocks: ReturnType<typeof terrainRocks> | undefined;
  let lighting: ReturnType<typeof terrainLighting> | undefined;
  let ocean:
    | Mesh<NonNullable<ReturnType<typeof oceanGeometry>>, ReturnType<typeof oceanMaterial>>
    | undefined;
  let pendingGeometry: ReturnType<typeof oceanGeometry>;
  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    if (ocean) {
      scene.remove(ocean);
      ocean.material.dispose();
    }
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
      terrainSurfaceMaterial(textures, result.width, result.height),
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
    if (water) {
      pendingGeometry = oceanGeometry(
        result,
        water.seaLevel * Math.fround(request.heightMultiplier),
      );
      if (pendingGeometry) {
        ocean = new Mesh(
          pendingGeometry,
          oceanMaterial(water.normal, lighting.uniforms, water.settings),
        );
        ocean.name = 'ocean-presentation-v1';
        ocean.renderOrder = 1;
        scene.add(ocean);
      }
    }
    return {
      dispose,
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
