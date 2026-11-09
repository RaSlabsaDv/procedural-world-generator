import {
  BufferGeometry,
  Camera,
  HalfFloatType,
  LinearFilter,
  LinearSRGBColorSpace,
  Mesh,
  Scene,
  ShaderMaterial,
  Texture,
  Vector2,
  WebGLRenderer,
  WebGLRenderTarget,
} from 'three';

export const BLOOM = Object.freeze({
  revision: 'bloom-v1',
  threshold: 1.25,
  knee: 0.25,
  intensity: 0.12,
  maxPixels: 65536,
  scale: 0.25,
  weights: Object.freeze([70 / 256, 56 / 256, 28 / 256, 8 / 256, 1 / 256]),
});
export function bloomSize(width: number, height: number): [number, number] {
  let w = Math.max(1, Math.floor(width * BLOOM.scale)),
    h = Math.max(1, Math.floor(height * BLOOM.scale));
  const scale = Math.min(1, Math.sqrt(BLOOM.maxPixels / (w * h)));
  w = Math.max(1, Math.min(width, BLOOM.maxPixels, Math.floor(w * scale)));
  h = Math.max(1, Math.min(height, Math.floor(BLOOM.maxPixels / w), Math.floor(h * scale)));
  return [w, h];
}
const vertexShader = `varying vec2 vBloomUv;void main(){vBloomUv=position.xy*.5+.5;gl_Position=vec4(position,1.0);}`;
export function bloomMaterial(blur: boolean) {
  return new ShaderMaterial({
    name: blur ? 'bloom-blur-v1' : 'bloom-extract-v1',
    toneMapped: false,
    depthTest: false,
    depthWrite: false,
    uniforms: blur
      ? {
          bloomInput: { value: null },
          bloomStep: { value: new Vector2() },
          bloomTexel: { value: new Vector2() },
        }
      : { bloomInput: { value: null }, bloomSourceTexel: { value: new Vector2() } },
    vertexShader,
    fragmentShader: blur
      ? `
      uniform sampler2D bloomInput;uniform vec2 bloomStep,bloomTexel;varying vec2 vBloomUv;
      vec3 sampleBloom(vec2 uv){return texture2D(bloomInput,clamp(uv,.5*bloomTexel,vec2(1.0)-.5*bloomTexel)).rgb;}
      void main(){vec3 color=sampleBloom(vBloomUv)*${BLOOM.weights[0]};
        ${BLOOM.weights
          .slice(1)
          .map(
            (w, i) =>
              `color+=(sampleBloom(vBloomUv+bloomStep*${i + 1}.0)+sampleBloom(vBloomUv-bloomStep*${i + 1}.0))*${w};`,
          )
          .join('\n')}
        gl_FragColor=vec4(color,1.0);
      }`
      : `
      uniform sampler2D bloomInput;uniform vec2 bloomSourceTexel;varying vec2 vBloomUv;
      vec3 extractBloom(vec2 uv){
        vec3 color=max(texture2D(bloomInput,clamp(uv,.5*bloomSourceTexel,vec2(1.0)-.5*bloomSourceTexel)).rgb,vec3(0.0));
        float l=dot(color,vec3(.2126,.7152,.0722));
        float soft=clamp(l-${BLOOM.threshold}+${BLOOM.knee},0.0,${2 * BLOOM.knee});
        float excess=max(l-${BLOOM.threshold},soft*soft/${(4 * BLOOM.knee).toFixed(8)});
        return color*excess/max(l,.00001);
      }
      void main(){vec3 color=vec3(0.0);
        for(int y=0;y<4;y++)for(int x=0;x<4;x++)
          color+=extractBloom(vBloomUv+(vec2(float(x),float(y))-1.5)*bloomSourceTexel);
        gl_FragColor=vec4(color/16.0,1.0);
      }`,
  });
}

/** Two ping-pong targets. Fullscreen geometry remains owned by colorFinishing. */
export function bloomPasses(renderer: WebGLRenderer, geometry: BufferGeometry) {
  const targets: WebGLRenderTarget[] = [],
    materials: ShaderMaterial[] = [];
  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    for (const t of targets) t.dispose();
    for (const m of materials) m.dispose();
  };
  try {
    for (let i = 0; i < 2; i++) {
      const target = new WebGLRenderTarget(1, 1, {
        type: HalfFloatType,
        minFilter: LinearFilter,
        magFilter: LinearFilter,
        depthBuffer: false,
        stencilBuffer: false,
        generateMipmaps: false,
      });
      targets.push(target);
      target.texture.internalFormat = 'RGBA16F';
      target.texture.colorSpace = LinearSRGBColorSpace;
      target.texture.name = BLOOM.revision;
    }
    const bright = bloomMaterial(false);
    materials.push(bright);
    const blur = bloomMaterial(true);
    materials.push(blur);
    const scene = new Scene(),
      camera = new Camera(),
      mesh = new Mesh(geometry, bright);
    mesh.frustumCulled = false;
    scene.add(mesh);
    return {
      render: (source: WebGLRenderTarget): Texture | null => {
        if (disposed) return null;
        const previous = renderer.getRenderTarget(),
          gl = renderer.getContext() as WebGL2RenderingContext;
        try {
          const [width, height] = bloomSize(source.width, source.height);
          for (const target of targets)
            if (target.width !== width || target.height !== height) target.setSize(width, height);
          bright.uniforms['bloomInput'].value = source.texture;
          bright.uniforms['bloomSourceTexel'].value.set(1 / source.width, 1 / source.height);
          mesh.material = bright;
          bright.uniformsNeedUpdate = true;
          renderer.setRenderTarget(targets[0]);
          if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
            dispose();
            return null;
          }
          renderer.render(scene, camera);
          mesh.material = blur;
          blur.uniforms['bloomTexel'].value.set(1 / width, 1 / height);
          blur.uniforms['bloomInput'].value = targets[0].texture;
          blur.uniforms['bloomStep'].value.set(1 / width, 0);
          blur.uniformsNeedUpdate = true;
          renderer.setRenderTarget(targets[1]);
          if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
            dispose();
            return null;
          }
          renderer.render(scene, camera);
          blur.uniforms['bloomInput'].value = targets[1].texture;
          blur.uniforms['bloomStep'].value.set(0, 1 / height);
          blur.uniformsNeedUpdate = true;
          renderer.setRenderTarget(targets[0]);
          renderer.render(scene, camera);
          return targets[0].texture;
        } catch (error) {
          dispose();
          throw error;
        } finally {
          renderer.setRenderTarget(previous);
        }
      },
      dispose,
    };
  } catch (error) {
    dispose();
    throw error;
  }
}
