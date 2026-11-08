import { Color, Vector3 } from 'three';

export const SCENE_ENVIRONMENT_REVISION = 'scene-environment-v1';
export const DAYLIGHT_REFERENCE = Object.freeze({
  sky: 0xdde8f1,
  ground: 0x81775e,
  fillIntensity: 1.05,
  sun: 0xfff4df,
  sunIntensity: 2.35,
  atmosphere: 0xbcc9ce,
  fogNearSpan: 2.2,
  fogFarSpan: 7,
});
type Triple = readonly [number, number, number];
export interface EnvironmentSettings {
  readonly timeOfDayHours: number;
  readonly sunAzimuthDegrees: number;
  readonly visualTimeSeconds: number;
}
export interface SceneEnvironmentSnapshot {
  readonly revision: typeof SCENE_ENVIRONMENT_REVISION;
  readonly settings: EnvironmentSettings;
  readonly sun: { readonly direction: Triple; readonly color: Triple; readonly intensity: number };
  readonly fill: { readonly sky: Triple; readonly ground: Triple; readonly intensity: number };
  readonly fog: { readonly color: Triple; readonly nearSpan: number; readonly farSpan: number };
}
export const DEFAULT_ENVIRONMENT_SETTINGS: EnvironmentSettings = Object.freeze({
  timeOfDayHours: 12,
  sunAzimuthDegrees: 315,
  visualTimeSeconds: 0,
});
const triple = (value: number[]): Triple => Object.freeze(value) as unknown as Triple;
const linear = (hex: number): Triple => triple(new Color(hex).toArray());
const mix = (a: Triple, b: Triple, weight: number): Triple =>
  weight === 0 ? a : weight === 1 ? b : triple(a.map((v, i) => v + (b[i] - v) * weight));
const smooth = (a: number, b: number, value: number) => {
  const u = Math.max(0, Math.min(1, (value - a) / (b - a)));
  return u * u * (3 - 2 * u);
};

/** Pure presentation derivation. No clock, scene, Core request or mutable shared Three object. */
export function deriveSceneEnvironment(
  settings: EnvironmentSettings = DEFAULT_ENVIRONMENT_SETTINGS,
): SceneEnvironmentSnapshot {
  const keys = ['timeOfDayHours', 'sunAzimuthDegrees', 'visualTimeSeconds'] as const;
  if (
    !settings ||
    Object.keys(settings).length !== keys.length ||
    keys.some((k) => !Object.hasOwn(settings, k) || !Number.isFinite(settings[k])) ||
    settings.timeOfDayHours < 0 ||
    settings.timeOfDayHours > 24 ||
    settings.sunAzimuthDegrees < 0 ||
    settings.sunAzimuthDegrees >= 360 ||
    settings.visualTimeSeconds < 0 ||
    settings.visualTimeSeconds > 86400
  )
    throw new RangeError('Invalid scene environment settings.');
  const { timeOfDayHours: hour, sunAzimuthDegrees: azimuth } = settings;
  const phase = Math.sin((Math.PI * (hour - 6)) / 12);
  const daylight = hour <= 6 || hour >= 18 ? 0 : Math.max(0, phase);
  const strength = smooth(0, 0.35, daylight),
    warmth = smooth(0, 1, daylight);
  const radians = (azimuth * Math.PI) / 180;
  const direction =
    hour === 12 && azimuth === 315
      ? new Vector3(-1, 2, 1).normalize()
      : new Vector3(
          Math.SQRT2 * Math.sin(radians),
          2 * phase,
          Math.SQRT2 * Math.cos(radians),
        ).normalize();
  const d = DAYLIGHT_REFERENCE;
  const horizon = mix(
    linear(0x101a2b),
    mix(linear(0xd8ab8e), linear(d.atmosphere), warmth),
    strength,
  );
  return Object.freeze({
    revision: SCENE_ENVIRONMENT_REVISION,
    settings: Object.freeze({ ...settings }),
    sun: Object.freeze({
      direction: triple(direction.toArray()),
      color: mix(linear(0xffb774), linear(d.sun), warmth),
      intensity: d.sunIntensity * strength,
    }),
    fill: Object.freeze({
      sky: mix(linear(0x16253b), linear(d.sky), strength),
      ground: linear(d.ground),
      intensity: strength === 1 ? d.fillIntensity : d.fillIntensity * (0.15 + 0.85 * strength),
    }),
    fog: Object.freeze({ color: horizon, nearSpan: d.fogNearSpan, farSpan: d.fogFarSpan }),
  });
}
export const DEFAULT_SCENE_ENVIRONMENT = deriveSceneEnvironment();
