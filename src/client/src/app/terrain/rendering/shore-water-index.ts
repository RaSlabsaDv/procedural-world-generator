import type { BufferGeometry } from 'three';

/** Setup-only spatial lookup of emitted triangles, never drainage or inferred basins. */
export function shoreWaterIndex(
  width: number,
  height: number,
  water: readonly (BufferGeometry | undefined)[],
) {
  const geometries = water.filter((g): g is BufferGeometry => !!g?.index);
  const counts = geometries.map((g) => g.index!.count / 3),
    total = counts.reduce((a, b) => a + b, 0);
  const heads = new Int32Array(width * height).fill(-1),
    next = new Int32Array(total);
  const ox = (width - 1) / 2,
    oz = (height - 1) / 2;
  let base = 0;
  for (let g = 0; g < geometries.length; g++) {
    const geometry = geometries[g],
      p = geometry.getAttribute('position'),
      index = geometry.index!;
    for (let t = 0; t < counts[g]; t++) {
      const a = index.getX(t * 3),
        b = index.getX(t * 3 + 1),
        c = index.getX(t * 3 + 2);
      const x = Math.min(
        width - 2,
        Math.max(0, Math.floor((p.getX(a) + p.getX(b) + p.getX(c)) / 3 + ox)),
      );
      const z = Math.min(
        height - 2,
        Math.max(0, Math.floor((p.getZ(a) + p.getZ(b) + p.getZ(c)) / 3 + oz)),
      );
      const cell = z * width + x,
        id = base + t;
      next[id] = heads[cell];
      heads[cell] = id;
    }
    base += counts[g];
  }
  const contact = { distance: Infinity, level: 0 };
  return {
    bytes: heads.byteLength + next.byteLength,
    /** Reuses one record; callers must consume it before the next query. */
    sample(x: number, z: number) {
      contact.distance = Infinity;
      contact.level = 0;
      const cx = Math.floor(x),
        cz = Math.floor(z);
      for (let iz = Math.max(0, cz - 2); iz <= Math.min(height - 2, cz + 2); iz++)
        for (let ix = Math.max(0, cx - 2); ix <= Math.min(width - 2, cx + 2); ix++)
          for (let id = heads[iz * width + ix]; id >= 0; id = next[id]) {
            let g = 0,
              t = id;
            while (g < counts.length - 1 && t >= counts[g]) t -= counts[g++];
            const p = geometries[g].getAttribute('position'),
              index = geometries[g].index!;
            const a = index.getX(t * 3),
              b = index.getX(t * 3 + 1),
              c = index.getX(t * 3 + 2);
            const ax = p.getX(a) + ox,
              az = p.getZ(a) + oz,
              ay = p.getY(a);
            const bx = p.getX(b) + ox,
              bz = p.getZ(b) + oz,
              by = p.getY(b);
            const dx = p.getX(c) + ox,
              dz = p.getZ(c) + oz,
              dy = p.getY(c);
            const det = (bz - dz) * (ax - dx) + (dx - bx) * (az - dz);
            if (Math.abs(det) < 1e-12) continue;
            const wa = ((bz - dz) * (x - dx) + (dx - bx) * (z - dz)) / det;
            const wb = ((dz - az) * (x - dx) + (ax - dx) * (z - dz)) / det;
            let distance = 0,
              level = wa * ay + wb * by + (1 - wa - wb) * dy;
            if (wa < 0 || wb < 0 || wa + wb > 1) {
              let best = Infinity;
              for (let edge = 0; edge < 3; edge++) {
                const ux = edge === 0 ? ax : edge === 1 ? bx : dx,
                  uz = edge === 0 ? az : edge === 1 ? bz : dz,
                  uy = edge === 0 ? ay : edge === 1 ? by : dy;
                const vx = edge === 0 ? bx : edge === 1 ? dx : ax,
                  vz = edge === 0 ? bz : edge === 1 ? dz : az,
                  vy = edge === 0 ? by : edge === 1 ? dy : ay;
                const ex = vx - ux,
                  ez = vz - uz,
                  len = ex * ex + ez * ez;
                const f =
                  len > 0 ? Math.max(0, Math.min(1, ((x - ux) * ex + (z - uz) * ez) / len)) : 0;
                const d = (x - ux - f * ex) ** 2 + (z - uz - f * ez) ** 2;
                if (d < best) {
                  best = d;
                  level = uy + (vy - uy) * f;
                }
              }
              distance = Math.sqrt(best);
            }
            if (distance < contact.distance) {
              contact.distance = distance;
              contact.level = level;
            }
          }
      return contact;
    },
  };
}
