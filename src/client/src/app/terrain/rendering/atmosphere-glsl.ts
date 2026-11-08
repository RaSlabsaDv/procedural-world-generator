/** Shared linear-space sky and air attenuation; no texture lookup or ray marching. */
export const ATMOSPHERE_GLSL = `
uniform vec3 environmentSunDirection, environmentSunColor, environmentSkyColor, environmentHorizonColor;
uniform float environmentSunIntensity, environmentFillIntensity;
uniform vec3 environmentMoonColor;
uniform float atmosphereEnabled, atmosphereSpan, atmosphereHaze, atmosphereValleyFog;
uniform float atmosphereSea, atmosphereWater;
vec3 skyRadiance(vec3 direction) {
  vec3 d=direction/max(length(direction),.00001);
  float up=clamp(d.y,0.0,1.0);
  float daylight=clamp(environmentSunIntensity/2.35,0.0,1.0);
  float mu=clamp(dot(d,environmentSunDirection),-1.0,1.0);
  float rayleigh=.75*(1.0+mu*mu);
  float mie=(1.0-.65*.65)/pow(max(.15,1.0+.65*.65-1.3*mu),1.5);
  vec3 zenith=environmentSkyColor*vec3(.38,.60,.90);
  vec3 base=mix(environmentHorizonColor,zenith,pow(up,.45));
  vec3 scatter=environmentSunColor*daylight*(.025*rayleigh+.018*mie)*exp(-up*3.0);
  float disc=smoothstep(.9995,.99985,mu)*smoothstep(-.03,.02,d.y);
  // Illustrative full moon opposite the sun; no independent orbit or clock.
  float moonVisibility=(1.0-daylight)*smoothstep(0.0,.08,-environmentSunDirection.y);
  float moonDot=clamp(dot(d,-environmentSunDirection),-1.0,1.0);
  float moonEdge=max(fwidth(moonDot),.000001);
  float moonDisc=smoothstep(.99995-moonEdge,.99995+moonEdge,moonDot);
  float moonHalo=.012*exp(-max(0.0,1.0-moonDot)*350.0);
  vec3 moon=environmentMoonColor*moonVisibility*(moonDisc*.8+moonHalo);
  return max(vec3(0.0),base+scatter+environmentSunColor*daylight*disc*1.5+moon);
}
float atmosphereDepth(vec3 from,vec3 to) {
  float L=length(to-from);
  float falloff=8.0/atmosphereSpan;
  float a=clamp(-(from.y-atmosphereSea)*falloff,-20.0,20.0);
  float b=clamp(-(to.y-atmosphereSea)*falloff,-20.0,20.0);
  float delta=abs(a-b);
  float average;
  if(delta<.001) average=exp((a+b)*.5)*(1.0+delta*delta/24.0);
  else average=exp(max(a,b))*(1.0-exp(-delta))/delta;
  float daylight=clamp(environmentSunIntensity/2.35,0.0,1.0);
  float density=(.12*atmosphereHaze+.7*atmosphereValleyFog*(.35+.65*(1.0-daylight))*average)/atmosphereSpan;
  return clamp(L*density,0.0,20.0);
}
vec3 applyAtmosphere(vec3 color,vec3 world,float ocean) {
  vec3 ray=world-cameraPosition;
  vec3 airEnd=world;
  if(atmosphereWater>.5 && ocean>0.0 && cameraPosition.y>atmosphereSea && world.y<atmosphereSea) {
    float t=clamp((cameraPosition.y-atmosphereSea)/max(cameraPosition.y-world.y,.00001),0.0,1.0);
    airEnd=cameraPosition+ray*t;
  }
  float T=exp(-atmosphereDepth(cameraPosition,airEnd));
  return mix(skyRadiance(ray),color,T);
}
`;

/** Numerical reference for the frozen analytical air integral (not terrain computation). */
export function atmosphereOpticalDepth(
  length: number,
  fromHeight: number,
  toHeight: number,
  span: number,
  origin: number,
  haze: number,
  valleyFog: number,
  daylight: number,
): number {
  if (
    ![length, fromHeight, toHeight, span, origin, haze, valleyFog, daylight].every(
      Number.isFinite,
    ) ||
    length < 0 ||
    span < 1 ||
    haze < 0 ||
    haze > 1 ||
    valleyFog < 0 ||
    valleyFog > 1 ||
    daylight < 0 ||
    daylight > 1
  )
    throw new RangeError('Invalid atmospheric ray.');
  const clamp = (x: number) => Math.max(-20, Math.min(20, x));
  const a = clamp((-(fromHeight - origin) * 8) / span),
    b = clamp((-(toHeight - origin) * 8) / span),
    delta = Math.abs(a - b);
  const average =
    delta < 0.001
      ? Math.exp((a + b) / 2) * (1 + (delta * delta) / 24)
      : (Math.exp(Math.max(a, b)) * -Math.expm1(-delta)) / delta;
  return Math.min(
    20,
    (length * (0.12 * haze + 0.7 * valleyFog * (0.35 + 0.65 * (1 - daylight)) * average)) / span,
  );
}
