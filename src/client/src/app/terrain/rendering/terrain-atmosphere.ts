import {
  BufferAttribute,
  BufferGeometry,
  Matrix4,
  Mesh,
  MeshLambertMaterial,
  Scene,
  ShaderMaterial,
} from 'three';
import { ATMOSPHERE_GLSL } from './atmosphere-glsl';
import { AtmosphereSettings } from './atmosphere-settings.service';
import type { terrainLighting } from './terrain-lighting';

export const ATMOSPHERE_REVISION = 'atmosphere-v1';
export function terrainAtmosphere(
  scene: Scene,
  environment: ReturnType<typeof terrainLighting>['uniforms'],
  span: number,
  sea: number,
  hasWater: boolean,
  initial: AtmosphereSettings,
) {
  const uniforms = {
    ...environment,
    atmosphereEnabled: { value: 0 },
    atmosphereSpan: { value: span },
    atmosphereHaze: { value: 0 },
    atmosphereValleyFog: { value: 0 },
    atmosphereSea: { value: sea },
    atmosphereWater: { value: hasWater ? 1 : 0 },
  };
  const geometry = new BufferGeometry();
  geometry.setAttribute(
    'position',
    new BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3),
  );
  const material = new ShaderMaterial({
    name: ATMOSPHERE_REVISION,
    depthTest: false,
    depthWrite: false,
    uniforms: {
      ...uniforms,
      skyProjectionInverse: { value: new Matrix4() },
      skyCameraWorld: { value: new Matrix4() },
    },
    vertexShader: `varying vec2 vSkyClip;void main(){vSkyClip=position.xy;gl_Position=vec4(position.xy,1.0,1.0);}`,
    fragmentShader: `${ATMOSPHERE_GLSL}
      uniform mat4 skyProjectionInverse,skyCameraWorld;varying vec2 vSkyClip;
      void main(){vec4 p=skyProjectionInverse*vec4(vSkyClip,1.0,1.0);
        vec3 direction=mat3(skyCameraWorld)*(p.xyz/max(abs(p.w),.00001));
        gl_FragColor=vec4(skyRadiance(direction),1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const sky = new Mesh(geometry, material);
  sky.name = ATMOSPHERE_REVISION;
  sky.frustumCulled = false;
  sky.renderOrder = -1000;
  sky.onBeforeRender = (_renderer, _scene, camera) => {
    material.uniforms['skyProjectionInverse'].value.copy(camera.projectionMatrixInverse);
    material.uniforms['skyCameraWorld'].value.copy(camera.matrixWorld);
  };
  scene.add(sky);
  let disposed = false;
  const update = (settings: AtmosphereSettings) => {
    if (disposed) return;
    uniforms.atmosphereEnabled.value = settings.enabled ? 1 : 0;
    uniforms.atmosphereHaze.value = settings.haze;
    uniforms.atmosphereValleyFog.value = settings.valleyFog;
    sky.visible = settings.enabled;
  };
  update(initial);
  return {
    uniforms,
    sky,
    update,
    dispose: () => {
      if (disposed) return;
      disposed = true;
      scene.remove(sky);
      geometry.dispose();
      material.dispose();
    },
  };
}

/** Compose with existing material extensions; native reference fog keeps its exact ordering. */
export function bindAtmosphere(
  material: MeshLambertMaterial,
  uniforms: ReturnType<typeof terrainAtmosphere>['uniforms'],
  oceanTerrain = false,
): void {
  const before = material.onBeforeCompile,
    key = material.customProgramCacheKey();
  material.customProgramCacheKey = () => key + ':' + ATMOSPHERE_REVISION + ':' + oceanTerrain;
  material.onBeforeCompile = (shader, renderer) => {
    before.call(material, shader, renderer);
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>\nvarying vec3 vAtmosphereWorld;varying float vAtmosphereOcean;`,
      )
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>
        vec4 atmosphereWorld=vec4(transformed,1.0);
        #ifdef USE_INSTANCING
          atmosphereWorld=instanceMatrix*atmosphereWorld;
        #endif
        vAtmosphereWorld=(modelMatrix*atmosphereWorld).xyz;
        vAtmosphereOcean=${oceanTerrain ? '1.0-step(.5,biomeId)' : '0.0'};
      `,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>\n${ATMOSPHERE_GLSL}\nvarying vec3 vAtmosphereWorld;varying float vAtmosphereOcean;`,
      )
      .replace(
        '#include <tonemapping_fragment>',
        `if(atmosphereEnabled>.5) gl_FragColor.rgb=applyAtmosphere(gl_FragColor.rgb,vAtmosphereWorld,vAtmosphereOcean);\n#include <tonemapping_fragment>`,
      )
      .replace('#include <fog_fragment>', `if(atmosphereEnabled<.5){\n#include <fog_fragment>\n}`);
  };
}
