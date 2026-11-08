import { TestBed } from '@angular/core/testing';
import { Color, Vector3 } from 'three';
import {
  DEFAULT_ENVIRONMENT_SETTINGS as S,
  DEFAULT_SCENE_ENVIRONMENT as D,
  deriveSceneEnvironment,
  EnvironmentSettings,
} from './scene-environment';
import { SceneEnvironmentService } from './scene-environment.service';

describe('scene environment derivation', () => {
  it('retains exact legacy direction/intensities and linear color endpoints', () => {
    expect(D.sun.direction).toEqual(new Vector3(-1, 2, 1).normalize().toArray());
    expect(D.sun.color).toEqual(new Color(0xfff4df).toArray());
    expect(D.fog.color).toEqual(new Color(0xbcc9ce).toArray());
    expect(D.sun.intensity).toBe(2.35);
    expect(D.fill.intensity).toBe(1.05);
    expect(D.fog.nearSpan).toBe(2.2);
    expect(D.fog.farSpan).toBe(7);
    // Independent sRGB transfer, rather than comparing two calls to Three.Color.
    const linear = (n: number) => {
      const c = n / 255;
      return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    };
    expect(D.sun.color[1]).toBeCloseTo(linear(244), 10);
    [188, 201, 206].forEach((v, i) => expect(D.fog.color[i]).toBeCloseTo(linear(v), 10));
    for (const value of [
      D,
      D.settings,
      D.sun,
      D.sun.direction,
      D.sun.color,
      D.fill,
      D.fill.sky,
      D.fog,
      D.fog.color,
    ])
      expect(Object.isFrozen(value)).toBe(true);
  });
  it.each([
    [0, [0, 2, Math.SQRT2]],
    [90, [Math.SQRT2, 2, 0]],
    [180, [0, 2, -Math.SQRT2]],
    [270, [-Math.SQRT2, 2, 0]],
  ])('defines world azimuth %j', (az, expected) => {
    const d = deriveSceneEnvironment({ ...S, sunAzimuthDegrees: az as number }).sun.direction;
    expect(
      new Vector3(...d).distanceTo(
        new Vector3(...(expected as [number, number, number])).normalize(),
      ),
    ).toBeLessThan(1e-12);
  });
  it('covers day/night cycle without invalid directions or negative light', () => {
    for (const hour of [0, 5.99999, 6, 6.00001, 9, 12, 15, 17.99999, 18, 18.00001, 24]) {
      const e = deriveSceneEnvironment({ ...S, timeOfDayHours: hour });
      expect(new Vector3(...e.sun.direction).length()).toBeCloseTo(1, 12);
      expect(e.sun.intensity).toBeGreaterThanOrEqual(0);
      expect(e.sun.intensity).toBeLessThanOrEqual(2.35);
      expect([...e.sun.color, ...e.fill.sky, ...e.fog.color].every(Number.isFinite)).toBe(true);
    }
    const midnight = deriveSceneEnvironment({ ...S, timeOfDayHours: 0 }),
      end = deriveSceneEnvironment({ ...S, timeOfDayHours: 24 });
    expect(midnight.sun).toEqual(end.sun);
    expect(midnight.sun.intensity).toBe(0);
    for (const hour of [6, 18]) {
      const a = deriveSceneEnvironment({ ...S, timeOfDayHours: hour - 1e-5 });
      const b = deriveSceneEnvironment({ ...S, timeOfDayHours: hour + 1e-5 });
      expect(Math.abs(a.sun.intensity - b.sun.intensity)).toBeLessThan(1e-7);
      expect(
        new Vector3(...a.sun.direction).distanceTo(new Vector3(...b.sun.direction)),
      ).toBeLessThan(1e-4);
    }
  });
  it('validates updates atomically and deduplicates identical immutable settings', () => {
    const service = TestBed.inject(SceneEnvironmentService);
    expect(service.snapshot()).toBe(D);
    service.set({ ...S });
    expect(service.snapshot()).toBe(D);
    for (const bad of [
      null,
      {},
      { ...S, extra: 1 },
      { ...S, timeOfDayHours: NaN },
      { ...S, timeOfDayHours: 24.1 },
      { ...S, timeOfDayHours: -1 },
      { ...S, sunAzimuthDegrees: 360 },
      { ...S, sunAzimuthDegrees: -1 },
      { ...S, visualTimeSeconds: Infinity },
      { ...S, visualTimeSeconds: -1 },
      { ...S, visualTimeSeconds: 86401 },
    ]) {
      expect(() => service.set(bad as EnvironmentSettings)).toThrow(RangeError);
      expect(service.snapshot()).toBe(D);
    }
    const settings = { ...S, timeOfDayHours: 9, visualTimeSeconds: 15 };
    service.set(settings);
    settings.timeOfDayHours = 20;
    expect(service.snapshot().settings.timeOfDayHours).toBe(9);
    expect(service.snapshot().settings.visualTimeSeconds).toBe(15);
    expect(service.snapshot().sun.intensity).toBeGreaterThan(0);
  });
});
