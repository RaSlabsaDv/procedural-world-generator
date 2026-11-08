import {
  deriveSceneEnvironment,
  DEFAULT_ENVIRONMENT_SETTINGS,
  DEFAULT_SCENE_ENVIRONMENT,
} from './scene-environment';
import {
  BoxGeometry,
  DepthTexture,
  DoubleSide,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshLambertMaterial,
  PCFShadowMap,
  Scene,
  Vector3,
  WebGLRenderer,
  WebGLRenderTarget,
} from 'three';
import { testMap } from '../testing/terrain-test-fixture';
import { terrainLighting, TERRAIN_LIGHTING } from './terrain-lighting';

function setup(width = 129, height = 97, heightMultiplier = 30) {
  const scene = new Scene(),
    terrain = new Mesh(new BoxGeometry(1, 1, 1), new MeshLambertMaterial());
  const tree = new InstancedMesh(new BoxGeometry(2, 4, 2), new MeshLambertMaterial(), 1);
  tree.setMatrixAt(0, new Matrix4().makeTranslation((width - 1) / 2, heightMultiplier + 2, 0));
  const renderer = {
    shadowMap: { enabled: false, type: PCFShadowMap, autoUpdate: true, needsUpdate: false },
  } as Pick<WebGLRenderer, 'shadowMap'>;
  const lighting = terrainLighting(
    scene,
    renderer,
    { ...testMap, width, height, heightMultiplier },
    terrain,
    [tree],
  );
  return {
    scene,
    terrain,
    tree,
    renderer,
    lighting,
    dispose: () => {
      lighting.dispose();
      terrain.geometry.dispose();
      terrain.material.dispose();
      tree.dispose();
      tree.geometry.dispose();
      tree.material.dispose();
    },
  };
}

it.each([
  [2, 2, 0],
  [3, 2, 1000],
  [129, 97, 30],
  [512, 512, 80],
])(
  'fits terrain and actual tree tips with positive light-space depth (%j,%j,%j)',
  (w, h, bound) => {
    const test = setup(w, h, bound),
      { sun, bounds } = test.lighting,
      camera = sun.shadow.camera;
    expect(bounds.min.y).toBe(0);
    expect(bounds.max.y).toBe(bound + 4);
    expect(bounds.max.x).toBe((w - 1) / 2 + 1);
    expect(camera.near).toBeGreaterThan(0);
    expect(camera.far).toBeGreaterThan(camera.near);
    const projected = bounds.clone().applyMatrix4(camera.matrixWorldInverse);
    expect(camera.left).toBeLessThan(projected.min.x);
    expect(camera.right).toBeGreaterThan(projected.max.x);
    expect(camera.bottom).toBeLessThan(projected.min.y);
    expect(camera.top).toBeGreaterThan(projected.max.y);
    expect(camera.near).toBeLessThan(-projected.max.z);
    expect(camera.far).toBeGreaterThan(-projected.min.z);
    for (const x of [bounds.min.x, bounds.max.x])
      for (const y of [bounds.min.y, bounds.max.y])
        for (const z of [bounds.min.z, bounds.max.z]) {
          const clip = new Vector3(x, y, z)
            .applyMatrix4(camera.matrixWorldInverse)
            .applyMatrix4(camera.projectionMatrix);
          expect(Math.max(Math.abs(clip.x), Math.abs(clip.y), Math.abs(clip.z))).toBeLessThan(1);
        }
    test.dispose();
  },
);

it('uses fixed direction, static PCF, scale-based fog and unchanged instance transforms', () => {
  const test = setup(),
    { sun, fog } = test.lighting;
  expect(
    sun.position
      .clone()
      .sub(sun.target.position)
      .normalize()
      .distanceTo(new Vector3(-1, 2, 1).normalize()),
  ).toBeLessThan(1e-12);
  expect(test.renderer.shadowMap).toMatchObject({
    enabled: true,
    type: PCFShadowMap,
    autoUpdate: false,
    needsUpdate: true,
  });
  expect(sun.shadow.autoUpdate).toBe(false);
  expect(sun.shadow.needsUpdate).toBe(true);
  expect(sun.shadow.mapSize.toArray()).toEqual([
    TERRAIN_LIGHTING.shadowSize,
    TERRAIN_LIGHTING.shadowSize,
  ]);
  expect(fog.near).toBe(128 * TERRAIN_LIGHTING.fogNearSpan);
  expect(fog.far).toBe(128 * TERRAIN_LIGHTING.fogFarSpan);
  expect(test.terrain.castShadow && test.terrain.receiveShadow).toBe(true);
  expect(test.terrain.material.shadowSide).toBe(DoubleSide);
  expect(test.tree.castShadow).toBe(true);
  expect(test.tree.receiveShadow).toBe(false);
  const matrix = new Matrix4();
  test.tree.getMatrixAt(0, matrix);
  expect(matrix.elements.slice(12, 15)).toEqual([64, 32, 0]);
  const repeat = setup();
  expect(
    sun.shadow.camera.projectionMatrix.equals(repeat.lighting.sun.shadow.camera.projectionMatrix),
  ).toBe(true);
  expect(sun.position.distanceTo(repeat.lighting.sun.position)).toBe(0);
  repeat.dispose();
  test.dispose();
});

it('releases each owned shadow target once and restores scene references', () => {
  const test = setup();
  const map = new WebGLRenderTarget(16, 16);
  map.depthTexture = new DepthTexture(16, 16);
  test.lighting.sun.shadow.map = map;
  const dispose = vi.spyOn(map, 'dispose');
  test.lighting.dispose();
  test.lighting.dispose();
  expect(dispose).toHaveBeenCalledTimes(1);
  expect(test.lighting.sun.shadow.map).toBeNull();
  expect(test.scene.children).toEqual([]);
  expect(test.scene.fog).toBeNull();
  expect(test.scene.background).toBeNull();
  test.dispose();
});

it('handles flat all-ocean extent without tree bounds', () => {
  const scene = new Scene(),
    terrain = new Mesh(new BoxGeometry(1, 0, 1), new MeshLambertMaterial());
  const renderer = { shadowMap: {} } as Pick<WebGLRenderer, 'shadowMap'>;
  const light = terrainLighting(
    scene,
    renderer,
    { ...testMap, width: 2, height: 2, heightMultiplier: 0 },
    terrain,
    [],
  );
  expect(light.bounds.min.y).toBe(0);
  expect(light.bounds.max.y).toBe(0);
  expect(light.sun.shadow.camera.near).toBeGreaterThan(0);
  expect(light.sun.shadow.camera.far).toBeGreaterThan(light.sun.shadow.camera.near);
  light.dispose();
  terrain.geometry.dispose();
  terrain.material.dispose();
});

it('owns stable bindings, refits only relevant shadows and recovers from night', () => {
  const test = setup(),
    { lighting, renderer } = test,
    { sun, uniforms } = lighting;
  const identity = uniforms.environmentSunDirection.value;
  sun.shadow.needsUpdate = false;
  renderer.shadowMap.needsUpdate = false;
  const projection = sun.shadow.camera.projectionMatrix.clone();
  expect(lighting.update(DEFAULT_SCENE_ENVIRONMENT)).toBe(false);
  const timed = deriveSceneEnvironment({ ...DEFAULT_ENVIRONMENT_SETTINGS, visualTimeSeconds: 10 });
  expect(lighting.update(timed)).toBe(true);
  expect(uniforms.environmentVisualTimeSeconds.value).toBe(10);
  expect(sun.shadow.needsUpdate).toBe(false);
  expect(renderer.shadowMap.needsUpdate).toBe(false);
  expect(sun.shadow.camera.projectionMatrix.equals(projection)).toBe(true);
  const colorsOnly = {
    ...timed,
    sun: { ...timed.sun, color: [0.2, 0.3, 0.4] as const },
    fill: { ...timed.fill, intensity: 0.5 },
    fog: { ...timed.fog, color: [0.3, 0.4, 0.5] as const },
  };
  lighting.update(colorsOnly);
  expect(sun.color.toArray()).toEqual([0.2, 0.3, 0.4]);
  expect(lighting.fill.intensity).toBe(0.5);
  expect(lighting.fog.color.toArray()).toEqual([0.3, 0.4, 0.5]);
  expect(test.scene.background).toBe(lighting.fog.color);
  expect(sun.shadow.needsUpdate).toBe(false);
  expect(renderer.shadowMap.needsUpdate).toBe(false);
  const turned = deriveSceneEnvironment({ ...DEFAULT_ENVIRONMENT_SETTINGS, sunAzimuthDegrees: 45 });
  lighting.update(turned);
  expect(uniforms.environmentSunDirection.value).toBe(identity);
  expect(sun.shadow.needsUpdate).toBe(true);
  expect(renderer.shadowMap.needsUpdate).toBe(true);
  expect(sun.shadow.camera.projectionMatrix.equals(projection)).toBe(false);
  expect(sun.color).toBe(uniforms.environmentSunColor.value);
  expect(lighting.fog.color).toBe(uniforms.environmentHorizonColor.value);
  lighting.update(deriveSceneEnvironment({ ...DEFAULT_ENVIRONMENT_SETTINGS, timeOfDayHours: 0 }));
  expect(sun.intensity).toBe(0);
  expect(sun.castShadow).toBe(false);
  lighting.update(DEFAULT_SCENE_ENVIRONMENT);
  expect(sun.castShadow).toBe(true);
  expect(sun.intensity).toBe(2.35);
  test.dispose();
  expect(lighting.update(timed)).toBe(false);
});

it('isolates mutable uniforms and shadows between views using the same immutable snapshot', () => {
  const a = setup(),
    b = setup();
  expect(a.lighting.uniforms).not.toBe(b.lighting.uniforms);
  expect(a.lighting.uniforms.environmentSunColor.value).not.toBe(
    b.lighting.uniforms.environmentSunColor.value,
  );
  a.lighting.update(deriveSceneEnvironment({ ...DEFAULT_ENVIRONMENT_SETTINGS, timeOfDayHours: 7 }));
  expect(b.lighting.sun.intensity).toBe(2.35);
  expect(b.lighting.sun.color.toArray()).toEqual(DEFAULT_SCENE_ENVIRONMENT.sun.color);
  a.dispose();
  expect(b.scene.children).toContain(b.lighting.sun);
  b.dispose();
});

it('reuses shadow targets for color/intensity changes and skips refits for night direction edits', () => {
  const test = setup(),
    { lighting, renderer } = test,
    { sun } = lighting;
  const refit = vi.spyOn(sun.shadow.camera, 'updateProjectionMatrix');
  const consume = () => {
    sun.shadow.needsUpdate = false;
    renderer.shadowMap.needsUpdate = false;
    refit.mockClear();
  };
  consume();
  lighting.update({
    ...DEFAULT_SCENE_ENVIRONMENT,
    sun: { ...DEFAULT_SCENE_ENVIRONMENT.sun, intensity: 1, color: [0.1, 0.2, 0.3] },
  });
  expect(refit).not.toHaveBeenCalled();
  expect(sun.shadow.needsUpdate).toBe(false);
  lighting.update(deriveSceneEnvironment({ ...DEFAULT_ENVIRONMENT_SETTINGS, timeOfDayHours: 0 }));
  expect(sun.castShadow).toBe(false);
  consume();
  const previous = sun.position.clone();
  lighting.update(
    deriveSceneEnvironment({
      ...DEFAULT_ENVIRONMENT_SETTINGS,
      timeOfDayHours: 0,
      sunAzimuthDegrees: 90,
    }),
  );
  expect(sun.position.equals(previous)).toBe(false);
  expect(refit).not.toHaveBeenCalled();
  expect(sun.shadow.needsUpdate).toBe(false);
  expect(renderer.shadowMap.needsUpdate).toBe(false);
  lighting.update(DEFAULT_SCENE_ENVIRONMENT);
  expect(refit).toHaveBeenCalledTimes(1);
  expect(sun.castShadow).toBe(true);
  expect(sun.shadow.needsUpdate).toBe(true);
  test.dispose();
});

it.each([
  [2, 2, 0],
  [3, 512, 1000],
  [512, 3, 1],
  [512, 512, 1000],
])(
  'contains rotated/scaled edge instances at near-horizontal sun (%j,%j,%j)',
  (width, height, heightMultiplier) => {
    const scene = new Scene(),
      terrain = new Mesh(new BoxGeometry(1, 1, 1), new MeshLambertMaterial());
    const instances = new InstancedMesh(new BoxGeometry(2, 4, 3), new MeshLambertMaterial(), 2);
    const poses = [
      new Matrix4()
        .makeRotationY(0.73)
        .scale(new Vector3(4, 3, 2))
        .setPosition((width - 1) / 2, heightMultiplier + 10, (height - 1) / 2),
      new Matrix4()
        .makeRotationZ(0.4)
        .scale(new Vector3(3, 2, 5))
        .setPosition(-(width - 1) / 2, -1, -(height - 1) / 2),
    ];
    poses.forEach((m, i) => instances.setMatrixAt(i, m));
    // Test the actual float32 instance transforms uploaded to the GPU, not the
    // higher-precision construction matrices that can exceed those bounds slightly.
    const renderedPoses = poses.map((_, i) => {
      const matrix = new Matrix4();
      instances.getMatrixAt(i, matrix);
      return matrix;
    });
    instances.position.set(2, 1, -3);
    scene.add(instances);
    instances.updateMatrixWorld(true);
    const renderer = { shadowMap: {} } as Pick<WebGLRenderer, 'shadowMap'>;
    const lighting = terrainLighting(
      scene,
      renderer,
      { ...testMap, width, height, heightMultiplier },
      terrain,
      [instances],
    );
    for (const [hour, azimuth] of [
      [6.01, 0],
      [7, 90],
      [12, 315],
      [17.99, 225],
    ]) {
      lighting.update(
        deriveSceneEnvironment({
          ...DEFAULT_ENVIRONMENT_SETTINGS,
          timeOfDayHours: hour,
          sunAzimuthDegrees: azimuth,
        }),
      );
      const camera = lighting.sun.shadow.camera;
      expect(camera.near).toBeGreaterThan(0);
      expect(camera.far).toBeGreaterThan(camera.near);
      expect(
        [...camera.projectionMatrix.elements, ...camera.matrixWorldInverse.elements].every(
          Number.isFinite,
        ),
      ).toBe(true);
      const visible = (world: Vector3) => {
        expect(lighting.bounds.containsPoint(world)).toBe(true);
        const p = world
          .clone()
          .applyMatrix4(camera.matrixWorldInverse)
          .applyMatrix4(camera.projectionMatrix);
        expect(Math.max(Math.abs(p.x), Math.abs(p.y), Math.abs(p.z))).toBeLessThan(1);
      };
      for (const x of [-(width - 1) / 2, (width - 1) / 2])
        for (const y of [0, heightMultiplier])
          for (const z of [-(height - 1) / 2, (height - 1) / 2]) visible(new Vector3(x, y, z));
      for (const pose of renderedPoses)
        for (const x of [-1, 1])
          for (const y of [-2, 2])
            for (const z of [-1.5, 1.5])
              visible(new Vector3(x, y, z).applyMatrix4(pose).applyMatrix4(instances.matrixWorld));
    }
    lighting.dispose();
    instances.dispose();
    instances.geometry.dispose();
    instances.material.dispose();
    terrain.geometry.dispose();
    terrain.material.dispose();
  },
);
