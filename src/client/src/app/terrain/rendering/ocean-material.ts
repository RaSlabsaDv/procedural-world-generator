import { ATMOSPHERE_GLSL } from './atmosphere-glsl';
import type { terrainAtmosphere } from './terrain-atmosphere';
import { Color, ShaderMaterial, Texture } from 'three';
import { OceanSettings } from './ocean-settings.service';
import { terrainLighting } from './terrain-lighting';
import { DAYLIGHT_REFERENCE } from './scene-environment';

export function oceanMaterial(
  normal: Texture,
  environment: ReturnType<typeof terrainLighting>['uniforms'],
  settings: OceanSettings,
  atmosphere?: ReturnType<typeof terrainAtmosphere>['uniforms'],
  mode: 'ocean' | 'lake' | 'river' = 'ocean',
) {
  const material = new ShaderMaterial({
    name: 'ocean-presentation-v1',
    transparent: true,
    depthWrite: false,
    depthTest: true,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
    uniforms: {
      atmosphereEnabled: { value: 0 },
      atmosphereSpan: { value: 1 },
      atmosphereHaze: { value: 0 },
      atmosphereValleyFog: { value: 0 },
      atmosphereSea: { value: 0 },
      atmosphereWater: { value: 0 },
      ...environment,
      ...atmosphere,
      normalMap: { value: normal },
      waterColor: { value: new Color(settings.color) },
      foamSkyReference: { value: new Color(DAYLIGHT_REFERENCE.sky) },
      foamSunReference: { value: new Color(DAYLIGHT_REFERENCE.sun) },
      foamFillReference: { value: DAYLIGHT_REFERENCE.fillIntensity },
      foamSunIntensityReference: { value: DAYLIGHT_REFERENCE.sunIntensity },
      turbidity: { value: settings.turbidity },
      foamIntensity: { value: settings.foam },
      waterTime: { value: 0 },
    },
    vertexShader: `
      attribute float waterDepth; attribute float shoreDistance;
      varying vec3 vWorld; varying float vDepth; varying float vShore; varying float vFog;
      void main(){ vec4 world=modelMatrix*vec4(position,1.0); vWorld=world.xyz;
        vec4 mv=modelViewMatrix*vec4(position,1.0); vFog=-mv.z;vDepth=waterDepth;vShore=shoreDistance;
        gl_Position=projectionMatrix*mv; }
    `,
    fragmentShader: `
      uniform sampler2D normalMap;
      ${ATMOSPHERE_GLSL}
      uniform vec3 waterColor,foamSkyReference,foamSunReference;
      uniform float foamFillReference,foamSunIntensityReference;
      uniform float environmentFogNear,environmentFogFar,turbidity,foamIntensity,waterTime;
      varying vec3 vWorld; varying float vDepth; varying float vShore; varying float vFog;
      void main(){
        float distanceToCamera=length(cameraPosition-vWorld);vec3 V=(cameraPosition-vWorld)/max(distanceToCamera,.00001);
        vec3 a=texture2D(normalMap,vWorld.xz/9.0+waterTime*vec2(.017,.009)).xyz*2.0-1.0;
        vec3 b=texture2D(normalMap,vWorld.xz/4.0+waterTime*vec2(-.012,.021)).xyz*2.0-1.0;
        float strength=.18*(1.0-smoothstep(80.0,240.0,distanceToCamera));
        vec3 N=normalize(vec3((a.x+b.x)*strength,a.z*b.z,(a.y+b.y)*strength));
        float F=.02+.98*pow(1.0-clamp(dot(N,V),0.0,1.0),5.0);
        float T=exp(-max(0.0,vDepth)*turbidity);float A=(1.0-F)*(1.0-T);
        vec3 tint=mix(waterColor,waterColor*vec3(.18,.28,.45),1.0-T);
        vec3 reflected=reflect(-V,N);
        vec3 sky=atmosphereEnabled>.5 ? skyRadiance(reflected) : mix(environmentHorizonColor,environmentSkyColor,clamp(reflected.y,0.0,1.0));
        vec3 halfVector=V+environmentSunDirection;vec3 H=halfVector/max(length(halfVector),.00001);
        float spec=pow(max(dot(N,H),0.0),120.0)*max(dot(N,environmentSunDirection),0.0)*environmentSunIntensity*.35;
        float noise=texture2D(normalMap,vWorld.xz/3.0+waterTime*vec2(.025,-.018)).r;
        float foam=(1.0-smoothstep(.04,.65,vDepth))*(1.0-smoothstep(.5,2.5,vShore))*foamIntensity*(.4+.6*smoothstep(.3,.7,noise));
        float alpha=foam+(1.0-foam)*(A+F);
        // Foam is diffuse albedo, not emission. Include the actual linear sky color.
        vec3 ambientFoam=environmentSkyColor/max(foamSkyReference,vec3(.0001))*max(0.0,environmentFillIntensity/foamFillReference);
        float directFoam=clamp(environmentSunIntensity/foamSunIntensityReference,0.0,1.0)*max(dot(N,environmentSunDirection),0.0);
        vec3 foamLight=clamp(mix(ambientFoam,environmentSunColor/max(foamSunReference,vec3(.0001)),directFoam),vec3(0.0),vec3(1.5));
        vec3 energy=foam*vec3(.87,.93,.94)*foamLight+(1.0-foam)*(A*tint*clamp(environmentFillIntensity/1.05,.05,1.5)+F*sky+environmentSunColor*spec);
        vec3 color=energy/max(alpha,.0001);
        float fog=smoothstep(environmentFogNear,environmentFogFar,vFog);
        gl_FragColor=vec4(atmosphereEnabled>.5 ? applyAtmosphere(color,vWorld,1.0) : mix(color,environmentHorizonColor,fog),alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
  if (mode === 'lake') {
    material.name = 'inland-lake-v1';
    material.fragmentShader = material.fragmentShader
      .replace('float foam=(1.0-', 'float foam=.25*(1.0-')
      .replace('float strength=.18*', 'float strength=.08*');
  }
  if (mode === 'river') {
    material.name = 'inland-river-v1';
    material.fragmentShader=material.fragmentShader.replace('float T=exp(-max(0.0,vDepth)*turbidity);','float T=exp(-max(.9,vDepth)*turbidity*smoothstep(0.0,.15,vShore));');
    material.vertexShader = material.vertexShader
      .replace(
        'attribute float waterDepth;',
        'attribute vec2 waterFlow; varying vec2 vFlow; varying vec3 vSurfaceNormal; attribute float waterDepth;',
      )
      .replace(
        'void main(){',
        'void main(){ vFlow=waterFlow; vSurfaceNormal=mat3(modelMatrix)*normal;',
      );
    material.fragmentShader = material.fragmentShader
      .replace(
        'uniform sampler2D normalMap;',
        'uniform sampler2D normalMap; varying vec2 vFlow; varying vec3 vSurfaceNormal;',
      )
      .replace('vWorld.xz/9.0', '(vWorld.xz-vFlow*waterTime*.3)/9.0')
      .replace('vWorld.xz/4.0', '(vWorld.xz-vFlow*waterTime*.3)/4.0')
      .replace(
        'vec3 N=normalize(vec3((a.x+b.x)*strength,a.z*b.z,(a.y+b.y)*strength));',
        'vec3 base=normalize(vSurfaceNormal); vec3 tangent=normalize(vec3(1.0,-base.x/max(base.y,.05),0.0)); vec3 binormal=normalize(cross(tangent,base)); vec3 N=normalize(base*a.z*b.z+tangent*(a.x+b.x)*strength+binormal*(a.y+b.y)*strength);',
      )
      .replace('float foam=(1.0-', 'float foam=.18*(1.0-');
  }
  if (mode !== 'ocean') {
    // Reference output blends after sRGB encoding. Unlit foam must not add coverage
    // there: changing alpha alone can brighten a dark translucent thin surface.
    material.fragmentShader = material.fragmentShader
      .replace('float alpha=foam+(1.0-foam)*(A+F);', '')
      .replace(
        'vec3 energy=',
        'foam*=clamp(max(max(foamLight.r,foamLight.g),foamLight.b),0.0,1.0); float alpha=foam+(1.0-foam)*(A+F); vec3 energy=',
      );
  }
  return material;
}
