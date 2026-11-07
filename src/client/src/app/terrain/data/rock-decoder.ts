import { object } from './contract-utils';
import { LANDSCAPE_BIOME, MAX_ROCKS, RockInstance } from './terrain.models';

/** Wire/geometry checks only: eligibility, noise, spacing and selection remain in Core. */
export function decodeRocks(
  raw: unknown,
  width: number,
  height: number,
  values: Float32Array,
  biomes: Uint8Array,
  fail: () => never,
): readonly RockInstance[] {
  if (!Array.isArray(raw) || raw.length > MAX_ROCKS) return fail();
  const floats = ['x', 'y', 'z', 'scaleX', 'scaleY', 'scaleZ', 'rotation', 'groundY'] as const;
  const keys = ['cellIndex', 'kind', 'variant', ...floats];
  let previous = -1;
  return Object.freeze(
    raw.map((item): RockInstance => {
      if (
        !object(item) ||
        Object.keys(item).length !== keys.length ||
        keys.some((k) => !(k in item))
      )
        return fail();
      if (floats.some((k) => typeof item[k] !== 'number' || !Number.isFinite(item[k])))
        return fail();
      if (
        (item['scaleX'] as number) < Math.min(0.12, Math.fround(0.12)) ||
        (item['scaleX'] as number) > Math.fround(0.36) ||
        (item['scaleY'] as number) < Math.min(0.1, Math.fround(0.1)) ||
        (item['scaleY'] as number) > Math.fround(0.8) ||
        (item['scaleZ'] as number) < Math.min(0.084, Math.fround(0.084)) ||
        (item['scaleZ'] as number) > (item['scaleX'] as number) ||
        (item['rotation'] as number) < 0 ||
        (item['rotation'] as number) > 2 * Math.PI + 1e-6
      )
        return fail();
      const rock = Object.fromEntries(
        keys.map((k) => [
          k,
          floats.includes(k as (typeof floats)[number]) ? Math.fround(item[k] as number) : item[k],
        ]),
      ) as unknown as RockInstance;
      const {
        cellIndex: i,
        x,
        y,
        z,
        scaleX: sx,
        scaleY: sy,
        scaleZ: sz,
        rotation,
        groundY,
        kind,
        variant,
      } = rock;
      const cx = i % width,
        cz = Math.floor(i / width),
        fx = x - cx,
        fz = z - cz;
      if (
        !Number.isSafeInteger(i) ||
        i <= previous ||
        i < 0 ||
        cx >= width - 1 ||
        cz >= height - 1 ||
        !Number.isInteger(kind) ||
        kind < 0 ||
        kind > 2 ||
        !Number.isInteger(variant) ||
        variant < 0 ||
        variant > 1 ||
        floats.some((k) => !Number.isFinite(rock[k])) ||
        sx < Math.fround(0.12) ||
        sx > Math.fround(0.36) ||
        sy < Math.fround(0.1) ||
        sy > Math.fround(0.8) ||
        sz < Math.fround(0.084) ||
        sz > sx ||
        rotation < 0 ||
        rotation > 2 * Math.PI + 1e-6 ||
        fx - sx < 0 ||
        fx + sx > 1 ||
        fz - sx < 0 ||
        fz + sx > 1
      )
        return fail();
      const corners = [i, i + 1, i + width, i + width + 1];
      if (corners.some((j) => biomes[j] === LANDSCAPE_BIOME.Ocean)) return fail();
      const surface = (px: number, pz: number) =>
        px + pz <= 1
          ? values[i] + (values[i + 1] - values[i]) * px + (values[i + width] - values[i]) * pz
          : values[i + width + 1] +
            (values[i + width] - values[i + width + 1]) * (1 - px) +
            (values[i + 1] - values[i + width + 1]) * (1 - pz);
      const x0 = fx - sx,
        x1 = fx + sx,
        z0 = fz - sx,
        z1 = fz + sx;
      const support = [
        [x0, z0],
        [x1, z0],
        [x0, z1],
        [x1, z1],
      ];
      for (const [px, pz] of [
        [x0, 1 - x0],
        [x1, 1 - x1],
        [1 - z0, z0],
        [1 - z1, z1],
      ])
        if (px >= x0 && px <= x1 && pz >= z0 && pz <= z1) support.push([px, pz]);
      const levels = support.map(([px, pz]) => surface(px, pz)),
        min = Math.min(...levels),
        max = Math.max(...levels);
      const close = (a: number, b: number) =>
        Math.abs(a - b) <= 1e-6 + 1e-5 * Math.max(Math.abs(a), Math.abs(b));
      if (
        !close(groundY, surface(fx, fz)) ||
        !close(y, min - 0.1 * sy) ||
        max - min > 0.7 * sy + 1e-6
      )
        return fail();
      previous = i;
      return Object.freeze(rock);
    }),
  );
}
