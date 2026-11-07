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
