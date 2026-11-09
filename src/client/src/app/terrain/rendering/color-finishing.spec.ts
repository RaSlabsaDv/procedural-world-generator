import {
  Camera,
  Mesh,
  Scene,
  ShaderMaterial,
  Vector2,
  WebGLRenderer,
  WebGLRenderTarget,
} from 'three';
import { BLOOM, bloomSize } from './bloom-passes';
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
    { bloom: null },
    { bloom: 1 },
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

it('normalizes the blur and caps bloom targets including thin/minimum dimensions', () => {
  expect(BLOOM.weights[0] + 2 * BLOOM.weights.slice(1).reduce((a, b) => a + b, 0)).toBe(1);
  expect(bloomSize(964, 691)).toEqual([241, 172]);
  for (const [w, h] of [
    [1, 1],
    [512, 512],
    [2048, 2048],
    [1, 1048576],
    [1048576, 1],
    [512, 2],
  ]) {
    const [x, y] = bloomSize(w, h);
    expect(x * y).toBeLessThanOrEqual(BLOOM.maxPixels);
    expect(x).toBeGreaterThan(0);
    expect(y).toBeGreaterThan(0);
    expect(x).toBeLessThanOrEqual(w);
    expect(y).toBeLessThanOrEqual(h);
  }
});
it('adds exactly three passes and independent capped targets only while bloom is enabled', () => {
  const r = renderer(),
    owner = colorFinishing(r.value, { ...DEFAULT_APPEARANCE, bloom: true }),
    scene = new Scene(),
    camera = new Camera();
  const passNames: string[] = [];
  r.fake.render.mockImplementation((s) =>
    passNames.push(
      (s.children[0] as Mesh)?.material instanceof ShaderMaterial
        ? ((s.children[0] as Mesh).material as ShaderMaterial).name
        : 'scene',
    ),
  );
  owner.render(scene, camera);
  expect(passNames).toEqual([
    'scene',
    'bloom-extract-v1',
    'bloom-blur-v1',
    'bloom-blur-v1',
    'color-finishing-v1',
  ]);
  const [hdr, a, b] = [...r.targets];
  expect(a).not.toBe(b);
  for (const t of [a, b]) {
    expect(t.depthBuffer).toBe(false);
    expect(t.samples).toBe(0);
    expect(t.width * t.height).toBeLessThanOrEqual(BLOOM.maxPixels);
  }
  const output = r.fake.render.mock.calls.at(-1)![0] as Scene,
    quad = output.children[0] as Mesh,
    material = quad.material as ShaderMaterial;
  expect(material.defines['USE_BLOOM']).toBe(1);
  expect(material.uniforms['finishBloom'].value).toBe(a.texture);
  const geometry = vi.spyOn(quad.geometry, 'dispose'),
    disposeA = vi.spyOn(a, 'dispose'),
    disposeB = vi.spyOn(b, 'dispose'),
    disposeHdr = vi.spyOn(hdr, 'dispose');
  owner.update(DEFAULT_APPEARANCE);
  r.fake.render.mockClear();
  owner.render(scene, camera);
  expect(r.fake.render).toHaveBeenCalledTimes(2);
  expect(r.targets.size).toBe(3);
  expect(material.defines['USE_BLOOM']).toBeUndefined();
  expect(material.uniforms['finishBloom'].value).toBeNull();
  expect(disposeA).toHaveBeenCalledTimes(1);
  expect(disposeB).toHaveBeenCalledTimes(1);
  expect(disposeHdr).not.toHaveBeenCalled();
  expect(geometry).not.toHaveBeenCalled();
  owner.dispose();
  owner.dispose();
  expect(disposeHdr).toHaveBeenCalledTimes(1);
  expect(geometry).toHaveBeenCalledTimes(1);
});
it('keeps bloom resources independent between views and enables finishing in Reference', () => {
  const a = renderer(),
    b = renderer(),
    settings = { ...REFERENCE_APPEARANCE, bloom: true };
  expect(needsFinishing(settings)).toBe(true);
  const x = colorFinishing(a.value, settings),
    y = colorFinishing(b.value, settings),
    scene = new Scene(),
    camera = new Camera();
  x.render(scene, camera);
  y.render(scene, camera);
  expect(a.targets.size).toBe(3);
  expect(b.targets.size).toBe(3);
  for (const t of a.targets) expect(b.targets.has(t)).toBe(false);
  x.update(REFERENCE_APPEARANCE);
  y.render(scene, camera);
  expect(b.fake.render).toHaveBeenCalledTimes(10);
  x.dispose();
  y.dispose();
});
it('falls back from incomplete bloom only, restores targets and supports a toggle retry', () => {
  const r = renderer();
  r.gl.checkFramebufferStatus.mockReturnValueOnce(7).mockReturnValueOnce(7).mockReturnValueOnce(0);
  const settings = { ...DEFAULT_APPEARANCE, bloom: true },
    owner = colorFinishing(r.value, settings),
    scene = new Scene(),
    camera = new Camera();
  expect(owner.render(scene, camera)).toContain('without bloom');
  expect(r.fake.getRenderTarget()).toBeNull();
  const allocations = r.targets.size;
  owner.render(scene, camera);
  expect(r.targets.size).toBe(allocations);
  owner.update(DEFAULT_APPEARANCE);
  owner.update(settings);
  expect(owner.render(scene, camera)).toBeNull();
  expect(r.targets.size).toBe(5);
  owner.dispose();
});
it('releases shared fullscreen geometry once after a bloom submission failure', () => {
  const r = renderer(),
    owner = colorFinishing(r.value, { ...DEFAULT_APPEARANCE, bloom: true }),
    scene = new Scene(),
    camera = new Camera();
  owner.render(scene, camera);
  const quad = (r.fake.render.mock.calls.at(-1)![0] as Scene).children[0] as Mesh;
  const geometry = vi.spyOn(quad.geometry, 'dispose'),
    spies = [...r.targets].map((t) => vi.spyOn(t, 'dispose'));
  r.fake.render
    .mockImplementationOnce(() => {})
    .mockImplementationOnce(() => {
      throw Error('bloom submission');
    });
  expect(() => owner.render(scene, camera)).toThrow('bloom submission');
  expect(r.fake.getRenderTarget()).toBeNull();
  owner.dispose();
  for (const spy of spies) expect(spy).toHaveBeenCalledTimes(1);
  expect(geometry).toHaveBeenCalledTimes(1);
});
