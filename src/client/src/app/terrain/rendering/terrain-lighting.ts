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
import {
  DAYLIGHT_REFERENCE,
  DEFAULT_SCENE_ENVIRONMENT,
  SceneEnvironmentSnapshot,
} from './scene-environment';
import { HeightMapRequest } from '../data/terrain.models';

export const TERRAIN_LIGHTING = Object.freeze({
  revision: 'daylight-shadow-v1',
  ...DAYLIGHT_REFERENCE,
  shadowSize: 2048,
  shadowBias: -0.0005,
  normalBias: 0.08,
});

/** Fixed scene fit; no camera-dependent updates or generation mathematics. */
export function terrainLighting(
  scene: Scene,
  renderer: Pick<WebGLRenderer, 'shadowMap'>,
  request: HeightMapRequest,
  terrain: Mesh,
  instances: readonly Mesh[],
  initialEnvironment: SceneEnvironmentSnapshot = DEFAULT_SCENE_ENVIRONMENT,
) {
  const config = TERRAIN_LIGHTING;
  const span = Math.max(request.width - 1, request.height - 1, request.heightMultiplier, 1);
  const bounds = new Box3(
    new Vector3(-(request.width - 1) / 2, 0, -(request.height - 1) / 2),
    new Vector3((request.width - 1) / 2, request.heightMultiplier, (request.height - 1) / 2),
  );
  for (const instance of instances) {
    instance.castShadow = true;
    // InstancedMesh computes a union of actual transformed geometry bounds once, in setup.
    bounds.expandByObject(instance);
  }
  terrain.castShadow = terrain.receiveShadow = true;
  const materials = Array.isArray(terrain.material) ? terrain.material : [terrain.material];
  for (const material of materials) material.shadowSide = DoubleSide;

  const center = bounds.getCenter(new Vector3());
  // Stable view-owned wrappers: future shaders and Three lights consume the same values.
  const uniforms = {
    environmentSunDirection: { value: new Vector3() },
    environmentMoonColor: { value: new Color(0xc8d8f4) },
    environmentSunColor: { value: new Color(0) },
    environmentSunIntensity: { value: 0 },
    environmentSkyColor: { value: new Color(0) },
    environmentGroundColor: { value: new Color(0) },
    environmentFillIntensity: { value: 0 },
    environmentHorizonColor: { value: new Color(0) },
    environmentFogNear: { value: 0 },
    environmentFogFar: { value: 0 },
    environmentTimeOfDayHours: { value: -1 },
    environmentVisualTimeSeconds: { value: -1 },
  };
  const sun = new DirectionalLight();
  sun.color = uniforms.environmentSunColor.value;
  sun.name = config.revision;
  const fill = new HemisphereLight();
  fill.color = uniforms.environmentSkyColor.value;
  fill.groundColor = uniforms.environmentGroundColor.value;
  const background = uniforms.environmentHorizonColor.value;
  const fog = new Fog(background, 1, 2);
  fog.color = background;
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
  const updateSunTransform = () => {
    sun.position
      .copy(center)
      .addScaledVector(
        uniforms.environmentSunDirection.value,
        bounds.getSize(new Vector3()).length() + 2 * span,
      );
    sun.target.position.copy(center);
    sun.updateMatrixWorld(true);
    sun.target.updateMatrixWorld(true);
  };
  const refitShadow = () => {
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
    sun.updateMatrixWorld(true);
    sun.target.updateMatrixWorld(true);
  };
  const update = (snapshot: SceneEnvironmentSnapshot): boolean => {
    if (disposed) return false;
    const d = uniforms.environmentSunDirection.value,
      next = snapshot.sun.direction;
    const directionChanged = d.x !== next[0] || d.y !== next[1] || d.z !== next[2];
    const activeChanged = sun.castShadow !== snapshot.sun.intensity > 0;
    let changed = directionChanged || activeChanged;
    d.fromArray(next);
    const color = (value: Color, rgb: readonly number[]) => {
      if (value.r !== rgb[0] || value.g !== rgb[1] || value.b !== rgb[2]) {
        value.fromArray(rgb);
        changed = true;
      }
    };
    const scalar = (wrapper: { value: number }, value: number) => {
      if (wrapper.value !== value) {
        wrapper.value = value;
        changed = true;
      }
    };
    color(sun.color, snapshot.sun.color);
    color(fill.color, snapshot.fill.sky);
    color(fill.groundColor, snapshot.fill.ground);
    color(background, snapshot.fog.color);
    scalar(uniforms.environmentSunIntensity, snapshot.sun.intensity);
    scalar(uniforms.environmentFillIntensity, snapshot.fill.intensity);
    scalar(uniforms.environmentFogNear, snapshot.fog.nearSpan * span);
    scalar(uniforms.environmentFogFar, snapshot.fog.farSpan * span);
    scalar(uniforms.environmentTimeOfDayHours, snapshot.settings.timeOfDayHours);
    scalar(uniforms.environmentVisualTimeSeconds, snapshot.settings.visualTimeSeconds);
    sun.intensity = uniforms.environmentSunIntensity.value;
    fill.intensity = uniforms.environmentFillIntensity.value;
    fog.near = uniforms.environmentFogNear.value;
    fog.far = uniforms.environmentFogFar.value;
    sun.castShadow = snapshot.sun.intensity > 0;
    if (directionChanged || activeChanged) updateSunTransform();
    if ((directionChanged && sun.castShadow) || activeChanged) {
      if (sun.castShadow) refitShadow();
      sun.shadow.needsUpdate = true;
      renderer.shadowMap.needsUpdate = true;
    }
    return changed;
  };
  try {
    sun.castShadow = true;
    sun.shadow.mapSize.set(config.shadowSize, config.shadowSize);
    sun.shadow.bias = config.shadowBias;
    sun.shadow.normalBias = config.normalBias;
    sun.shadow.radius = 1;
    sun.shadow.autoUpdate = false;
    sun.shadow.needsUpdate = true;
    update(initialEnvironment);
    scene.add(sun, sun.target, fill);
    sun.updateMatrixWorld(true);
    sun.target.updateMatrixWorld(true);
    scene.fog = fog;
    scene.background = background;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = PCFShadowMap;
    renderer.shadowMap.autoUpdate = false;
    renderer.shadowMap.needsUpdate = true;
    return { sun, fill, fog, bounds, uniforms, update, dispose };
  } catch (error) {
    dispose();
    throw error;
  }
}
