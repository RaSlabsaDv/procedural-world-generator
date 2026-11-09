import {
  Camera,
  Mesh,
  Scene,
  ShaderMaterial,
  Vector2,
  WebGLRenderer,
  WebGLRenderTarget,
} from 'three';
import { colorFinishing, COLOR_FINISHING, finishingSize } from './color-finishing';
import {
  AppearanceSettingsService,
  DEFAULT_APPEARANCE,
  needsFinishing,
  REFERENCE_APPEARANCE,
} from './appearance-settings.service';

function renderer(supported = true) {
  let target: WebGLRenderTarget | null = null;
  const targets = new Set<WebGLRenderTarget>();
  const gl = {
    RENDERBUFFER: 1,
    RGBA16F: 2,
    SAMPLES: 3,
    MAX_TEXTURE_SIZE: 4,
    MAX_RENDERBUFFER_SIZE: 5,
    FRAMEBUFFER: 6,
    FRAMEBUFFER_COMPLETE: 7,
    getInternalformatParameter: () => new Int32Array([4]),
    getParameter: () => 4096,
    checkFramebufferStatus: vi.fn(() => 7),
  };
  const fake = {
    extensions: { has: vi.fn(() => supported) },
    getContext: () => gl,
    getDrawingBufferSize: (out: Vector2) => out.set(1600, 1000),
    getRenderTarget: () => target,
    setRenderTarget: vi.fn((value: WebGLRenderTarget | null) => {
      target = value;
      if (value) targets.add(value);
    }),
    render: vi.fn(),
  };
  return { value: fake as unknown as WebGLRenderer, fake, gl, targets };
}

it('validates immutable shared settings, no-op identity and neutral reference', () => {
  const service = new AppearanceSettingsService();
  expect(service.settings()).toBe(DEFAULT_APPEARANCE);
  expect(needsFinishing(DEFAULT_APPEARANCE)).toBe(true);
  expect(needsFinishing(REFERENCE_APPEARANCE)).toBe(false);
  service.set({ ...DEFAULT_APPEARANCE });
  expect(service.settings()).toBe(DEFAULT_APPEARANCE);
  service.set({ ...REFERENCE_APPEARANCE, exposure: 0.25, grading: true });
  expect(Object.isFrozen(service.settings())).toBe(true);
  service.reset();
  expect(service.settings()).toBe(DEFAULT_APPEARANCE);
  for (const invalid of [
    { exposure: NaN },
    { exposure: Infinity },
    { exposure: 0 },
    { exposure: 2.01 },
    { tone: 'film' },
    { grading: 1 },
    { vignette: null },
    { extra: true },
  ])
    expect(() => service.set({ ...DEFAULT_APPEARANCE, ...invalid } as never)).toThrow(RangeError);
  expect(service.settings()).toBe(DEFAULT_APPEARANCE);
});
it('bounds target dimensions without upscaling and respects hardware limits', () => {
  expect(finishingSize(640, 400, 4096)).toEqual([640, 400]);
  for (const [w, h, limit] of [
    [4000, 3000, 8192],
    [100000, 10, 4096],
    [10, 100000, 1024],
    [1, 1, 4096],
  ]) {
    const [x, y] = finishingSize(w, h, limit);
    expect(x * y).toBeLessThanOrEqual(COLOR_FINISHING.maxPixels);
    expect(Math.max(x, y)).toBeLessThanOrEqual(limit);
    expect(x).toBeGreaterThan(0);
    expect(y).toBeGreaterThan(0);
  }
});
it('owns no GPU resources in neutral Reference', () => {
  const r = renderer(),
    owner = colorFinishing(r.value, REFERENCE_APPEARANCE),
    scene = new Scene(),
    camera = new Camera();
  expect(owner.render(scene, camera)).toBeNull();
  expect(r.fake.render).toHaveBeenCalledExactlyOnceWith(scene, camera);
  expect(r.targets.size).toBe(0);
  expect(r.fake.extensions.has).not.toHaveBeenCalled();
  owner.dispose();
});
it('uses one bounded HDR target and final triangle, stable uniforms and exact neutral cleanup', () => {
  const r = renderer(),
    owner = colorFinishing(r.value, DEFAULT_APPEARANCE),
    scene = new Scene(),
    camera = new Camera();
  owner.render(scene, camera);
  expect(r.fake.render).toHaveBeenCalledTimes(2);
  const target = [...r.targets][0],
    output = r.fake.render.mock.calls.at(-1)![0] as Scene;
  const mesh = output.children[0] as Mesh,
    material = mesh.material as ShaderMaterial;
  expect(target.texture.internalFormat).toBe('RGBA16F');
  expect(target.samples).toBe(4);
  expect(target.resolveDepthBuffer).toBe(false);
  expect(target.width * target.height).toBeLessThanOrEqual(COLOR_FINISHING.maxPixels);
  expect(material.fragmentShader.match(/#include <colorspace_fragment>/g)).toHaveLength(1);
  expect(material.fragmentShader).not.toContain('toneMappingExposure');
  const geometry = vi.spyOn(mesh.geometry, 'dispose'),
    disposeMaterial = vi.spyOn(material, 'dispose'),
    disposeTarget = vi.spyOn(target, 'dispose');
  owner.update({ ...DEFAULT_APPEARANCE, exposure: 1.25, grading: true, vignette: true });
  owner.render(scene, camera);
  expect(r.targets.size).toBe(1);
  expect(r.fake.render.mock.calls.at(-1)![0]).toBe(output);
  expect(material.uniforms['finishExposure'].value).toBe(1.25);
  expect(material.uniforms['finishGrading'].value).toBe(1);
  owner.update(REFERENCE_APPEARANCE);
  expect(disposeTarget).toHaveBeenCalledTimes(1);
  expect(geometry).toHaveBeenCalledTimes(1);
  expect(disposeMaterial).toHaveBeenCalledTimes(1);
  r.fake.render.mockClear();
  owner.render(scene, camera);
  expect(r.fake.render).toHaveBeenCalledTimes(1);
  owner.dispose();
  owner.dispose();
  expect(disposeTarget).toHaveBeenCalledTimes(1);
  expect(r.fake.getRenderTarget()).toBeNull();
});
it('has independent view resources and releases after render failure', () => {
  const a = renderer(),
    b = renderer(),
    x = colorFinishing(a.value, DEFAULT_APPEARANCE),
    y = colorFinishing(b.value, DEFAULT_APPEARANCE);
  const scene = new Scene(),
    camera = new Camera();
  x.render(scene, camera);
  y.render(scene, camera);
  expect([...a.targets][0]).not.toBe([...b.targets][0]);
  const disposal = vi.spyOn([...a.targets][0], 'dispose');
  a.fake.render.mockImplementationOnce(() => {
    throw Error('failed submission');
  });
  expect(() => x.render(scene, camera)).toThrow('failed submission');
  expect(a.fake.getRenderTarget()).toBeNull();
  expect(disposal).toHaveBeenCalledTimes(1);
  x.dispose();
  y.dispose();
});
it('falls back visibly for unsupported or incomplete float targets without losing terrain', () => {
  for (const unsupported of [true, false]) {
    const r = renderer(!unsupported);
    if (!unsupported) r.gl.checkFramebufferStatus.mockReturnValue(0);
    const owner = colorFinishing(r.value, DEFAULT_APPEARANCE),
      scene = new Scene(),
      camera = new Camera();
    expect(owner.render(scene, camera)).toContain('Showing Reference');
    expect(r.fake.render).toHaveBeenLastCalledWith(scene, camera);
    expect(r.fake.getRenderTarget()).toBeNull();
    const allocations = r.targets.size;
    owner.render(scene, camera);
    expect(r.targets.size).toBe(allocations);
    owner.update(REFERENCE_APPEARANCE);
    expect(owner.render(scene, camera)).toBeNull();
    owner.dispose();
  }
});
