import { object } from './contract-utils';
import { LANDSCAPE_BIOME, MAX_ROCKS, ROCK_ENVELOPE as E, RockInstance } from './terrain.models';

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
        (item['scaleX'] as number) < Math.min(E.minRadius, Math.fround(E.minRadius)) ||
        (item['scaleX'] as number) > Math.fround(E.maxRadius) ||
        (item['scaleY'] as number) < Math.min(E.minHeight, Math.fround(E.minHeight)) ||
        (item['scaleY'] as number) > Math.fround(E.maxHeight) ||
        (item['scaleZ'] as number) < Math.min(E.minDepth, Math.fround(E.minDepth)) ||
        (item['scaleZ'] as number) > (item['scaleX'] as number) ||
        (item['kind'] === 2 &&
          ((item['scaleX'] as number) > Math.fround(E.screeMaxRadius) ||
            (item['scaleY'] as number) > Math.fround(E.screeMaxHeight))) ||
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
        sx < Math.fround(E.minRadius) ||
        sx > Math.fround(E.maxRadius) ||
        sy < Math.fround(E.minHeight) ||
        sy > Math.fround(E.maxHeight) ||
        sz < Math.fround(E.minDepth) ||
        sz > sx ||
        rotation < 0 ||
        rotation > 2 * Math.PI + 1e-6 ||
        fx < 0 ||
        fx >= 1 ||
        fz < 0 ||
        fz >= 1 ||
        x - sx < 0 ||
        x + sx > width - 1 ||
        z - sx < 0 ||
        z + sx > height - 1 ||
        (kind === 2 && (sx > Math.fround(E.screeMaxRadius) || sy > Math.fround(E.screeMaxHeight)))
      )
        return fail();
      const surface = (i: number, px: number, pz: number) =>
        px + pz <= 1
          ? values[i] + (values[i + 1] - values[i]) * px + (values[i + width] - values[i]) * pz
          : values[i + width + 1] +
            (values[i + width] - values[i + width + 1]) * (1 - px) +
            (values[i + 1] - values[i + width + 1]) * (1 - pz);
      let min = Infinity,
        max = -Infinity;
      // Check the supplied geometry envelope, not Core's stochastic eligibility/selection.
      for (let cz = Math.floor(z - sx); cz < Math.ceil(z + sx); cz++)
        for (let cx = Math.floor(x - sx); cx < Math.ceil(x + sx); cx++) {
          const cell = cz * width + cx;
          if (
            [cell, cell + 1, cell + width, cell + width + 1].some(
              (j) => biomes[j] === LANDSCAPE_BIOME.Ocean,
            )
          )
            return fail();
          const x0 = Math.max(0, x - sx - cx),
            x1 = Math.min(1, x + sx - cx);
          const z0 = Math.max(0, z - sx - cz),
            z1 = Math.min(1, z + sx - cz);
          const include = (px: number, pz: number) => {
            const value = surface(cell, px, pz);
            min = Math.min(min, value);
            max = Math.max(max, value);
          };
          include(x0, z0);
          include(x1, z0);
          include(x0, z1);
          include(x1, z1);
          for (const [px, pz] of [
            [x0, 1 - x0],
            [x1, 1 - x1],
            [1 - z0, z0],
            [1 - z1, z1],
          ])
            if (px >= x0 && px <= x1 && pz >= z0 && pz <= z1) include(px, pz);
        }
      const close = (a: number, b: number) =>
        Math.abs(a - b) <= 1e-6 + 1e-5 * Math.max(Math.abs(a), Math.abs(b));
      if (
        !close(groundY, surface(i, fx, fz)) ||
        !close(y, min - E.embedding * sy) ||
        max - min > E.supportFraction * sy + 1e-6
      )
        return fail();
      previous = i;
      return Object.freeze(rock);
    }),
  );
}
