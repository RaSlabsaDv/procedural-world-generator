import { Mesh, Scene, WebGLRenderer } from 'three';
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
) {
  let terrain:
    Mesh<ReturnType<typeof terrainGeometry>, ReturnType<typeof terrainSurfaceMaterial>> | undefined;
  let forest: ReturnType<typeof terrainForest> | undefined;
  let rocks: ReturnType<typeof terrainRocks> | undefined;
  let lighting: ReturnType<typeof terrainLighting> | undefined;
  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
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
    lighting = terrainLighting(scene, renderer, request, terrain, [
      ...forest.groups.flatMap((group) => [group.trunks, group.crowns]),
      ...rocks.meshes,
    ]);
    return { dispose };
  } catch (error) {
    dispose();
    throw error;
  }
}
