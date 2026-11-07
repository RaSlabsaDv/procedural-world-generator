import {
  Box3,
  Color,
  DirectionalLight,
  DoubleSide,
  Fog,
  HemisphereLight,
  Mesh,
  PCFShadowMap,
  Scene,
  Vector3,
  WebGLRenderer,
} from 'three';
import { HeightMapRequest } from '../data/terrain.models';

export const TERRAIN_LIGHTING = Object.freeze({
  revision: 'daylight-shadow-v1',
  sky: 0xdde8f1,
  ground: 0x81775e,
  fillIntensity: 1.05,
  sun: 0xfff4df,
  sunIntensity: 2.35,
  atmosphere: 0xbcc9ce,
  shadowSize: 2048,
  shadowBias: -0.0005,
  normalBias: 0.08,
  fogNearSpan: 2.2,
  fogFarSpan: 7,
});

/** Fixed scene fit; no camera-dependent updates or generation mathematics. */
export function terrainLighting(
  scene: Scene,
  renderer: Pick<WebGLRenderer, 'shadowMap'>,
  request: HeightMapRequest,
  terrain: Mesh,
  trees: readonly Mesh[],
) {
  const config = TERRAIN_LIGHTING;
  const span = Math.max(request.width - 1, request.height - 1, request.heightMultiplier, 1);
  const bounds = new Box3(
    new Vector3(-(request.width - 1) / 2, 0, -(request.height - 1) / 2),
    new Vector3((request.width - 1) / 2, request.heightMultiplier, (request.height - 1) / 2),
  );
  for (const tree of trees) {
    tree.castShadow = true;
    tree.receiveShadow = false;
    // InstancedMesh computes a union of actual transformed geometry bounds once, in setup.
    bounds.expandByObject(tree);
  }
  terrain.castShadow = terrain.receiveShadow = true;
  const materials = Array.isArray(terrain.material) ? terrain.material : [terrain.material];
  for (const material of materials) material.shadowSide = DoubleSide;

  const center = bounds.getCenter(new Vector3());
  const sun = new DirectionalLight(config.sun, config.sunIntensity);
  sun.name = config.revision;
  const fill = new HemisphereLight(config.sky, config.ground, config.fillIntensity);
  const fog = new Fog(config.atmosphere, span * config.fogNearSpan, span * config.fogFarSpan);
  const previousFog = scene.fog,
    previousBackground = scene.background;
  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    sun.shadow.dispose();
    sun.shadow.map = null;
    sun.shadow.mapPass = null;
    scene.remove(sun, sun.target, fill);
    if (scene.fog === fog) scene.fog = previousFog;
    if (scene.background === background) scene.background = previousBackground;
  };
  const background = new Color(config.atmosphere);
  try {
    sun.position
      .copy(center)
      .addScaledVector(
        new Vector3(-1, 2, 1).normalize(),
        bounds.getSize(new Vector3()).length() + 2 * span,
      );
    sun.target.position.copy(center);
    sun.castShadow = true;
    sun.shadow.mapSize.set(config.shadowSize, config.shadowSize);
    sun.shadow.bias = config.shadowBias;
    sun.shadow.normalBias = config.normalBias;
    sun.shadow.radius = 1;
    sun.shadow.autoUpdate = false;
    sun.shadow.needsUpdate = true;
    const camera = sun.shadow.camera;
    camera.position.copy(sun.position);
    camera.lookAt(center);
    camera.updateMatrixWorld(true);
    const lightBounds = bounds.clone().applyMatrix4(camera.matrixWorldInverse);
    const padding = Math.max(0.025 * span, 0.1);
    camera.left = lightBounds.min.x - padding;
    camera.right = lightBounds.max.x + padding;
    camera.bottom = lightBounds.min.y - padding;
    camera.top = lightBounds.max.y + padding;
    camera.near = Math.max(0.01, -lightBounds.max.z - padding);
    camera.far = Math.max(camera.near + 0.1, -lightBounds.min.z + padding);
    camera.updateProjectionMatrix();
    scene.add(sun, sun.target, fill);
    sun.updateMatrixWorld(true);
    sun.target.updateMatrixWorld(true);
    scene.fog = fog;
    scene.background = background;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = PCFShadowMap;
    renderer.shadowMap.autoUpdate = false;
    renderer.shadowMap.needsUpdate = true;
    return { sun, fill, fog, bounds, dispose };
  } catch (error) {
    dispose();
    throw error;
  }
}
