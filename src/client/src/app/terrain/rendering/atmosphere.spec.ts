import { TestBed } from '@angular/core/testing';
import {
  BufferGeometry,
  Color,
  Mesh,
  MeshLambertMaterial,
  PerspectiveCamera,
  Scene,
  ShaderLib,
  Texture,
} from 'three';
import { vi } from 'vitest';
import { atmosphereOpticalDepth as depth, ATMOSPHERE_GLSL } from './atmosphere-glsl';
import {
  AtmosphereSettingsService,
  DEFAULT_ATMOSPHERE_SETTINGS as D,
} from './atmosphere-settings.service';
import { bindAtmosphere, terrainAtmosphere } from './terrain-atmosphere';
import { terrainLighting } from './terrain-lighting';
import { deriveSceneEnvironment, DEFAULT_ENVIRONMENT_SETTINGS } from './scene-environment';
import { oceanMaterial } from './ocean-material';
import { DEFAULT_OCEAN_SETTINGS } from './ocean-settings.service';

function owner() {
  const scene = new Scene(),
    mesh = new Mesh(new BufferGeometry(), new MeshLambertMaterial());
  const lighting = terrainLighting(
    scene,
    { shadowMap: {} } as never,
    { width: 129, height: 97, heightMultiplier: 30 } as never,
    mesh,
    [],
  );
  return {
    scene,
    lighting,
    atmosphere: terrainAtmosphere(scene, lighting.uniforms, 128, 6, true, D),
  };
}
it('validates immutable shared atmosphere state atomically and resets', () => {
  const service = TestBed.inject(AtmosphereSettingsService);
  for (const value of [
    { ...D, haze: NaN },
    { ...D, valleyFog: -1 },
    { ...D, haze: 2 },
    { ...D, enabled: 1 },
    { ...D, extra: 0 },
    { haze: 0, valleyFog: 0 },
  ]) {
    expect(() => service.set(value as never)).toThrow(RangeError);
    expect(service.settings()).toBe(D);
  }
  service.set({ enabled: false, haze: 0.4, valleyFog: 0.2 });
  expect(Object.isFrozen(service.settings())).toBe(true);
  const same = service.settings();
  service.set({ ...same });
  expect(service.settings()).toBe(same);
  service.reset();
  expect(service.settings()).toBe(D);
});
it('integrates a horizontal constant-density ray and zero-length ray exactly', () => {
  expect(depth(0, 0, 0, 128, 0, 1, 1, 1)).toBe(0);
  expect(depth(128, 0, 0, 128, 0, 0.2, 0.4, 1)).toBeCloseTo(0.12 * 0.2 + 0.7 * 0.4 * 0.35, 12);
  expect(depth(128, 0, 0, 128, 0, 0, 0, 1)).toBe(0);
});
it('agrees with independent midpoint quadrature and near-horizontal limits', () => {
  for (const [from, to] of [
    [10, 10.000001],
    [0, 20],
    [40, 2],
    [-4, 10],
  ]) {
    const n = 10000,
      span = 128,
      L = 200;
    let sum = 0;
    for (let i = 0; i < n; i++)
      sum += Math.exp((-(from + ((to - from) * (i + 0.5)) / n) * 8) / span);
    const expected = (L * (0.12 * 0.22 + (0.7 * 0.18 * 0.35 * sum) / n)) / span;
    expect(depth(L, from, to, span, 0, 0.22, 0.18, 1)).toBeCloseTo(expected, 7);
    expect(depth(L, to, from, span, 0, 0.22, 0.18, 1)).toBeCloseTo(expected, 7);
  }
});
it('bounds extreme exponents and is continuous and monotone for longer horizontal rays', () => {
  expect(depth(1e8, -1e8, 1e8, 1, 0, 1, 1, 0)).toBe(20);
  expect(depth(100, 1e8, 1e8, 1, 0, 0, 1, 0)).toBeGreaterThanOrEqual(0);
  expect(depth(200, 0, 0, 128, 0, 0.2, 0.3, 1)).toBeGreaterThan(
    depth(100, 0, 0, 128, 0, 0.2, 0.3, 1),
  );
  expect(depth(100, 10, 10.001, 128, 0, 0.2, 0.3, 1)).toBeCloseTo(
    depth(100, 10, 10, 128, 0, 0.2, 0.3, 1),
    4,
  );
  expect(() => depth(-1, 0, 0, 1, 0, 1, 1, 1)).toThrow();
});
it('composes transparent water with one common air attenuation', () => {
  const T = Math.exp(-depth(100, 25, 6, 128, 6, 0.22, 0.18, 1)),
    sky = 0.6,
    bottom = 0.2,
    water = 0.4,
    alpha = 0.3;
  const fog = (c: number) => T * c + (1 - T) * sky;
  expect(alpha * fog(water) + (1 - alpha) * fog(bottom)).toBeCloseTo(
    fog(alpha * water + (1 - alpha) * bottom),
    14,
  );
  expect(ATMOSPHERE_GLSL).toContain('cameraPosition+ray*t');
});
it('shares environment wrappers while owning independent sky resources and camera uniforms', () => {
  const a = owner(),
    b = owner();
  expect(a.atmosphere.uniforms.environmentSunDirection).toBe(
    a.lighting.uniforms.environmentSunDirection,
  );
  expect(a.atmosphere.uniforms.atmosphereHaze).not.toBe(b.atmosphere.uniforms.atmosphereHaze);
  const shader = a.atmosphere.sky.material;
  expect(shader.fragmentShader).toContain(ATMOSPHERE_GLSL);
  expect(a.atmosphere.sky.geometry.getAttribute('position').array.byteLength).toBe(36);
  const camera = new PerspectiveCamera();
  camera.position.set(3, 8, 5);
  camera.updateMatrixWorld();
  a.atmosphere.sky.onBeforeRender(
    null as never,
    a.scene,
    camera,
    null as never,
    null as never,
    null as never,
  );
  expect(shader.uniforms['skyCameraWorld'].value).toEqual(camera.matrixWorld);
  a.atmosphere.update({ enabled: false, haze: 0, valleyFog: 0 });
  expect(a.atmosphere.sky.visible).toBe(false);
  expect(b.atmosphere.sky.visible).toBe(true);
  const dispose = vi.spyOn(shader, 'dispose'),
    geometry = vi.spyOn(a.atmosphere.sky.geometry, 'dispose');
  a.atmosphere.dispose();
  a.atmosphere.dispose();
  expect(dispose).toHaveBeenCalledTimes(1);
  expect(geometry).toHaveBeenCalledTimes(1);
  expect(a.scene.children).not.toContain(a.atmosphere.sky);
  b.atmosphere.dispose();
  a.lighting.dispose();
  b.lighting.dispose();
});
it('composes Lambert hooks before output encoding and keeps reference fog and instancing', () => {
  const a = owner(),
    material = new MeshLambertMaterial(),
    before = vi.fn();
  material.onBeforeCompile = before;
  bindAtmosphere(material, a.atmosphere.uniforms);
  const shader = {
    uniforms: {},
    vertexShader: ShaderLib.lambert.vertexShader,
    fragmentShader: ShaderLib.lambert.fragmentShader,
  };
  material.onBeforeCompile(shader as never, null as never);
  expect(before).toHaveBeenCalledTimes(1);
  expect(shader.vertexShader).toContain('atmosphereWorld=instanceMatrix*atmosphereWorld');
  expect(shader.fragmentShader.indexOf('gl_FragColor.rgb=applyAtmosphere')).toBeLessThan(
    shader.fragmentShader.indexOf('#include <tonemapping_fragment>'),
  );
  expect(shader.fragmentShader).toContain('if(atmosphereEnabled<.5)');
  expect(material.customProgramCacheKey()).toContain('atmosphere-v1');
  material.dispose();
  a.atmosphere.dispose();
  a.lighting.dispose();
});
it('updates sky and water from actual sun state without changing atmosphere resources', () => {
  const a = owner(),
    texture = new Texture(),
    water = oceanMaterial(
      texture,
      a.lighting.uniforms,
      DEFAULT_OCEAN_SETTINGS,
      a.atmosphere.uniforms,
    );
  expect(water.uniforms['atmosphereEnabled']).toBe(a.atmosphere.uniforms.atmosphereEnabled);
  expect(water.fragmentShader).toContain('skyRadiance(reflected)');
  for (const hour of [0, 6, 6.2, 12, 17.8, 18, 24]) {
    a.lighting.update(
      deriveSceneEnvironment({ ...DEFAULT_ENVIRONMENT_SETTINGS, timeOfDayHours: hour }),
    );
    expect(water.uniforms['environmentSunIntensity'].value).toBe(a.lighting.sun.intensity);
    expect(
      new Color()
        .copy(a.atmosphere.uniforms.environmentSkyColor.value)
        .toArray()
        .every(Number.isFinite),
    ).toBe(true);
  }
  a.atmosphere.update({ enabled: false, haze: 1, valleyFog: 1 });
  expect(water.uniforms['atmosphereEnabled'].value).toBe(0);
  water.dispose();
  texture.dispose();
  a.atmosphere.dispose();
  a.lighting.dispose();
});
