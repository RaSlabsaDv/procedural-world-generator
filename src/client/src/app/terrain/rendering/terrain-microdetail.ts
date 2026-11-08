import type { DataArrayTexture, MeshLambertMaterial } from 'three';
export const TERRAIN_MICRODETAIL_REVISION = 'terrain-microdetail-v1';
export const MICRODETAIL = Object.freeze({
  repeat: 2.4,
  strength: 0.24,
  fadeNear: 24,
  fadeFar: 72,
});

export const MICRODETAIL_GLSL = `
      uniform highp sampler2DArray microNormals;
      uniform float microStrength,microRepeat,microFadeNear,microFadeFar;
      varying vec3 vMicroWorld;
      vec2 microSlope(vec2 uv,float layer,vec2 dx,vec2 dy){
        vec3 n=(textureGrad(microNormals,vec3(uv,layer),dx,dy).xyz*255.0-128.0)/127.0;
        return n.xy/max(n.z,.25);
      }
      vec3 microGradient(vec3 p,float layer,vec3 base,vec3 weights,vec3 dx,vec3 dy){
        vec3 s=vec3(base.x<0.0?-1.0:1.0,base.y<0.0?-1.0:1.0,base.z<0.0?-1.0:1.0);
        vec2 x=microSlope(vec2(-s.x*p.z,p.y),layer,vec2(-s.x*dx.z,dx.y),vec2(-s.x*dy.z,dy.y));
        vec2 y=microSlope(vec2(p.x,-s.y*p.z),layer,vec2(dx.x,-s.y*dx.z),vec2(dy.x,-s.y*dy.z));
        vec2 z=microSlope(vec2(s.z*p.x,p.y),layer,vec2(s.z*dx.x,dx.y),vec2(s.z*dy.x,dy.y));
        return weights.x*vec3(0.0,x.y,-s.x*x.x)+weights.y*vec3(y.x,0.0,-s.y*y.y)+weights.z*vec3(s.z*z.x,z.y,0.0);
      }
`;

/** Fragment lighting only. Explicit gradients keep array mip selection stable across weights. */
export function bindTerrainMicrodetail(
  material: MeshLambertMaterial,
  texture?: DataArrayTexture,
): void {
  const before = material.onBeforeCompile,
    key = material.customProgramCacheKey();
  material.customProgramCacheKey = () => key + ':' + TERRAIN_MICRODETAIL_REVISION;
  material.onBeforeCompile = (shader, renderer) => {
    before.call(material, shader, renderer);
    Object.assign(shader.uniforms, {
      microNormals: { value: texture ?? null },
      microStrength: { value: texture ? MICRODETAIL.strength : 0 },
      microRepeat: { value: MICRODETAIL.repeat },
      microFadeNear: { value: MICRODETAIL.fadeNear },
      microFadeFar: { value: MICRODETAIL.fadeFar },
    });
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vMicroWorld;')
      .replace(
        '#include <project_vertex>',
        '#include <project_vertex>\nvMicroWorld=(modelMatrix*vec4(transformed,1.0)).xyz;',
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
${MICRODETAIL_GLSL}
    `,
      )
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
      vec3 microPoint=vMicroWorld/microRepeat;
      vec3 microDx=dFdx(microPoint),microDy=dFdy(microPoint);
      float microFade=1.0-smoothstep(microFadeNear,microFadeFar,length(vViewPosition));
      if(microStrength>0.0 && microFade>0.0 && (dot(vSurfaceCoverage,vec4(1.0))+vSandCoverage)>0.0){
        vec3 base=inverseTransformDirection(normal,viewMatrix);
        vec3 axes=pow(abs(base),vec3(4.0));axes/=max(dot(axes,vec3(1.0)),.00001);
        vec3 gradient=vec3(0.0);
        if(vSurfaceCoverage.x>0.0) gradient+=vSurfaceCoverage.x*microGradient(microPoint,0.0,base,axes,microDx,microDy);
        if(vSurfaceCoverage.y>0.0) gradient+=vSurfaceCoverage.y*microGradient(microPoint,1.0,base,axes,microDx,microDy);
        if(vSandCoverage>0.0) gradient+=vSandCoverage*microGradient(microPoint,2.0,base,axes,microDx,microDy);
        if(vSurfaceCoverage.z>0.0) gradient+=vSurfaceCoverage.z*microGradient(microPoint,3.0,base,axes,microDx,microDy);
        if(vSurfaceCoverage.w>0.0) gradient+=vSurfaceCoverage.w*microGradient(microPoint,4.0,base,axes,microDx,microDy);
        gradient-=base*dot(gradient,base);
        normal=normalize(mat3(viewMatrix)*normalize(base+gradient*microStrength*microFade));
      }
    `,
      );
  };
}
