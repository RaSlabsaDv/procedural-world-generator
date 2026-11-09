import {
  BufferGeometry,
  Camera,
  Float32BufferAttribute,
  HalfFloatType,
  LinearFilter,
  LinearSRGBColorSpace,
  Mesh,
  NoToneMapping,
  Scene,
  ShaderChunk,
  ShaderMaterial,
  SRGBColorSpace,
  Vector2,
  WebGLRenderer,
  WebGLRenderTarget,
} from 'three';
import { AppearanceSettings, needsFinishing } from './appearance-settings.service';

export const COLOR_FINISHING = Object.freeze({
  revision: 'color-finishing-v1',
  maxPixels: 1048576,
  maxSamples: 4,
});
export function finishingSize(width: number, height: number, maxSize: number): [number, number] {
  const scale = Math.min(
    1,
    Math.sqrt(COLOR_FINISHING.maxPixels / (width * height)),
    maxSize / width,
    maxSize / height,
  );
  return [Math.max(1, Math.floor(width * scale)), Math.max(1, Math.floor(height * scale))];
}
export function finishingMaterial() {
  return new ShaderMaterial({
    name: COLOR_FINISHING.revision,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
    uniforms: {
      finishColor: { value: null },
      finishExposure: { value: 1 },
      finishACES: { value: 1 },
      finishGrading: { value: 0 },
      finishVignette: { value: 0 },
      finishAspect: { value: 1 },
    },
    vertexShader: `varying vec2 vFinishUv;void main(){vFinishUv=position.xy*.5+.5;gl_Position=vec4(position,1.0);}`,
    fragmentShader: `${ShaderChunk.tonemapping_pars_fragment.replaceAll('toneMappingExposure', 'finishExposure')}
      uniform sampler2D finishColor;uniform float finishACES,finishGrading,finishVignette,finishAspect;
      varying vec2 vFinishUv;
      void main(){
        vec3 color=max(texture2D(finishColor,vFinishUv).rgb,vec3(0.0));
        vec3 exposed=color*finishExposure;
        float toe=smoothstep(.002,.025,dot(exposed,vec3(.2126,.7152,.0722)));
        color=finishACES>.5?mix(exposed,ACESFilmicToneMapping(color),toe):exposed;
        if(finishGrading>.5){float l=dot(color,vec3(.2126,.7152,.0722));color=max((mix(vec3(l),color,.98)-.18)*1.02+.18,vec3(0.0));}
        if(finishVignette>.5){float r=length((vFinishUv-.5)*vec2(finishAspect,1.0))/(.5*sqrt(finishAspect*finishAspect+1.0));color*=1.0-.10*smoothstep(.35,1.0,r);}
        gl_FragColor=vec4(color,1.0);
        #include <colorspace_fragment>
      }`,
  });
}

/** Optional final pass; neutral Reference owns no extra GPU resources. */
export function colorFinishing(renderer: WebGLRenderer, initial: AppearanceSettings) {
  let settings = initial,
    disposed = false,
    unavailable = false;
  let target: WebGLRenderTarget | undefined,
    geometry: BufferGeometry | undefined,
    material: ShaderMaterial | undefined;
  let output: Scene | undefined;
  const camera = new Camera(),
    size = new Vector2();
  const release = () => {
    target?.dispose();
    geometry?.dispose();
    material?.dispose();
    target = undefined;
    geometry = undefined;
    material = undefined;
    output = undefined;
  };
  renderer.toneMapping = NoToneMapping;
  renderer.toneMappingExposure = 1;
  renderer.outputColorSpace = SRGBColorSpace;
  const apply = () => {
    if (!material) return;
    material.uniforms['finishExposure'].value = settings.exposure;
    material.uniforms['finishACES'].value = Number(settings.tone === 'aces');
    material.uniforms['finishGrading'].value = Number(settings.grading);
    material.uniforms['finishVignette'].value = Number(settings.vignette);
  };
  return {
    update: (value: AppearanceSettings) => {
      if (disposed) return;
      settings = value;
      if (!needsFinishing(value)) release();
      else apply();
    },
    render: (scene: Scene, sceneCamera: Camera): string | null => {
      if (disposed) return null;
      if (!needsFinishing(settings)) {
        renderer.render(scene, sceneCamera);
        return null;
      }
      const warning = 'HDR finishing unavailable on this device. Showing Reference.';
      if (unavailable) {
        renderer.render(scene, sceneCamera);
        return warning;
      }
      const gl = renderer.getContext() as WebGL2RenderingContext;
      if (!renderer.extensions.has('EXT_color_buffer_float')) {
        unavailable = true;
        renderer.render(scene, sceneCamera);
        return warning;
      }
      const previous = renderer.getRenderTarget();
      try {
        if (!target) {
          target = new WebGLRenderTarget(1, 1, {
            type: HalfFloatType,
            minFilter: LinearFilter,
            magFilter: LinearFilter,
            depthBuffer: true,
            stencilBuffer: false,
            generateMipmaps: false,
          });
          target.texture.name = COLOR_FINISHING.revision;
          target.texture.colorSpace = LinearSRGBColorSpace;
          target.texture.internalFormat = 'RGBA16F';
          const samples = gl.getInternalformatParameter(
            gl.RENDERBUFFER,
            gl.RGBA16F,
            gl.SAMPLES,
          ) as Int32Array;
          target.samples = Array.from(samples).includes(COLOR_FINISHING.maxSamples)
            ? COLOR_FINISHING.maxSamples
            : 0;
          target.resolveDepthBuffer = false;
          geometry = new BufferGeometry();
          geometry.setAttribute(
            'position',
            new Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3),
          );
          material = finishingMaterial();
          material.uniforms['finishColor'].value = target.texture;
          output = new Scene();
          const mesh = new Mesh(geometry, material);
          mesh.frustumCulled = false;
          output.add(mesh);
          apply();
        }
        renderer.getDrawingBufferSize(size);
        const limit = Math.min(
          gl.getParameter(gl.MAX_TEXTURE_SIZE),
          gl.getParameter(gl.MAX_RENDERBUFFER_SIZE),
        );
        const [width, height] = finishingSize(size.x, size.y, limit);
        if (target.width !== width || target.height !== height) target.setSize(width, height);
        material!.uniforms['finishAspect'].value = size.x / size.y;
        renderer.setRenderTarget(target);
        if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
          unavailable = true;
          renderer.setRenderTarget(previous);
          release();
          renderer.render(scene, sceneCamera);
          return warning;
        }
        renderer.render(scene, sceneCamera);
        renderer.setRenderTarget(previous);
        renderer.render(output!, camera);
        return null;
      } catch (error) {
        renderer.setRenderTarget(previous);
        release();
        throw error;
      } finally {
        renderer.setRenderTarget(previous);
      }
    },
    dispose: () => {
      if (disposed) return;
      disposed = true;
      release();
    },
  };
}
