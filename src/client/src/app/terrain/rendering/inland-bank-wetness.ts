import { BufferAttribute, BufferGeometry } from 'three';

const REACH = 1.75,
  RISE = 0.65;
const smooth = (x: number) => {
  const t = Math.max(0, Math.min(1, x));
  return t * t * (3 - 2 * t);
};

/** Local presentation field from emitted water triangles; never reads or derives routing. */
export function inlandBankWetness(
  terrain: BufferGeometry,
  width: number,
  height: number,
  water: readonly (BufferGeometry | undefined)[],
): BufferAttribute {
  const wet = new Float32Array(width * height);
  const bed = terrain.getAttribute('position'),
    normal = terrain.getAttribute('normal');
  const biomes = terrain.getAttribute('biomeId');
  const ox = (width - 1) / 2,
    oz = (height - 1) / 2;
  for (const geometry of water) {
    if (!geometry?.index) continue;
    const p = geometry.getAttribute('position'),
      index = geometry.index;
    for (let k = 0; k < index.count; k += 3) {
      const a = index.getX(k),
        b = index.getX(k + 1),
        c = index.getX(k + 2);
      const ax = p.getX(a) + ox,
        az = p.getZ(a) + oz,
        ay = p.getY(a);
      const bx = p.getX(b) + ox,
        bz = p.getZ(b) + oz,
        by = p.getY(b);
      const cx = p.getX(c) + ox,
        cz = p.getZ(c) + oz,
        cy = p.getY(c);
      const det = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
      if (Math.abs(det) < 1e-12) continue;
      const minX = Math.max(0, Math.ceil(Math.min(ax, bx, cx) - REACH));
      const maxX = Math.min(width - 1, Math.floor(Math.max(ax, bx, cx) + REACH));
      const minZ = Math.max(0, Math.ceil(Math.min(az, bz, cz) - REACH));
      const maxZ = Math.min(height - 1, Math.floor(Math.max(az, bz, cz) + REACH));
      for (let z = minZ; z <= maxZ; z++)
        for (let x = minX; x <= maxX; x++) {
          const i = z * width + x;
          if (biomes.getX(i) === 0) continue;
          const wa = ((bz - cz) * (x - cx) + (cx - bx) * (z - cz)) / det;
          const wb = ((cz - az) * (x - cx) + (ax - cx) * (z - cz)) / det;
          let distance = 0,
            level = wa * ay + wb * by + (1 - wa - wb) * cy;
          if (wa < 0 || wb < 0 || wa + wb > 1) {
            let best = Infinity;
            // Closest edge; fixed scalar scratch, no allocation per triangle/vertex.
            for (let edge = 0; edge < 3; edge++) {
              const ux = edge === 0 ? ax : edge === 1 ? bx : cx,
                uz = edge === 0 ? az : edge === 1 ? bz : cz;
              const uy = edge === 0 ? ay : edge === 1 ? by : cy;
              const vx = edge === 0 ? bx : edge === 1 ? cx : ax,
                vz = edge === 0 ? bz : edge === 1 ? cz : az;
              const vy = edge === 0 ? by : edge === 1 ? cy : ay;
              const dx = vx - ux,
                dz = vz - uz,
                len = dx * dx + dz * dz;
              const t =
                len > 0 ? Math.max(0, Math.min(1, ((x - ux) * dx + (z - uz) * dz) / len)) : 0;
              const d = (x - ux - t * dx) ** 2 + (z - uz - t * dz) ** 2;
              if (d < best) {
                best = d;
                level = uy + (vy - uy) * t;
              }
            }
            distance = Math.sqrt(best);
          }
          const rise = bed.getY(i) - level;
          if (rise < -0.025 || rise >= RISE || distance >= REACH) continue;
          const weight =
            (1 - smooth(distance / REACH)) *
            (1 - smooth(Math.max(0, rise) / RISE)) *
            smooth((normal.getY(i) - 0.35) / 0.45);
          wet[i] = Math.max(wet[i], weight);
        }
    }
  }
  return new BufferAttribute(wet, 1);
}
