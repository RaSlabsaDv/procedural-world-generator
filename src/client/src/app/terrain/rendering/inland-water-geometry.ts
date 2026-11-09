import { lakeTriangleOwner } from './lake-footprint';
import { BufferAttribute, BufferGeometry } from 'three';
import { TerrainResponse } from '../data/terrain.models';

type Result = TerrainResponse['result'];
const OFFSET = 0.012,
  EPS = 1e-12;

/** Geometry clipping only: canonical membership, receivers and widths are never changed. */
export function inlandWaterGeometry(result: Result, sea: number) {
  const { width: w, height: h, values: bed, lakes, hydrology, rivers, biomes } = result,
    n = w * h;
  const stats = {
    supported: 0,
    suppressed: 0,
    connectors: 0,
    confluences: 0,
    lakeVertices: 0,
    riverVertices: 0,
    bytes: 0,
  };
  if (!lakes.basins.length && !rivers.cellIndices.length)
    return {
      lake: undefined,
      river: undefined,
      stats,
      riverSurfaceAt: () => -1,
      dispose: () => {},
    };
  const coverage = new Float32Array(n).fill(-4),
    flowX = new Float32Array(n),
    flowZ = new Float32Array(n);
  const incoming = new Uint8Array(n),
    widthByCell = new Float32Array(n);
  for (let i = 0; i < rivers.cellIndices.length; i++)
    widthByCell[rivers.cellIndices[i]] = rivers.widths[i];
  for (let k = 0; k < rivers.cellIndices.length; k++) {
    const a = rivers.cellIndices[k],
      b = hydrology.receiverIndex[a];
    if (b < 0) continue;
    const la = lakes.lakeIdByCell[a],
      lb = lakes.lakeIdByCell[b];
    let level = -1,
      valid = true;
    const close = (x: number, y: number) =>
      Math.abs(x - y) <= 1e-6 + 1e-5 * Math.max(Math.abs(x), Math.abs(y));
    if (la >= 0 || lb >= 0) {
      if (la === lb || (la >= 0 && lb >= 0)) valid = false;
      else {
        const id = la >= 0 ? la : lb,
          dry = la >= 0 ? b : a;
        level = lakes.basins[id].waterLevel;
        valid =
          biomes[dry] !== 0 &&
          hydrology.depressionDepth[dry] === 0 &&
          (bed[dry] >= level || close(bed[dry], level)) &&
          (la < 0 || bed[dry] <= level || close(bed[dry], level));
      }
    } else if (biomes[b] === 0 && biomes[a] !== 0 && hydrology.depressionDepth[a] === 0) {
      level = sea;
      valid = bed[a] >= sea || close(bed[a], sea);
    } else
      valid =
        biomes[a] !== 0 &&
        biomes[b] !== 0 &&
        hydrology.depressionDepth[a] === 0 &&
        hydrology.depressionDepth[b] === 0 &&
        (bed[b] <= bed[a] || close(bed[a], bed[b]));
    if (!valid) {
      stats.suppressed++;
      continue;
    }
    stats.supported++;
    if (level >= 0) stats.connectors++;
    if (++incoming[b] === 2) stats.confluences++;
    const ax = a % w,
      az = Math.floor(a / w),
      bx = b % w,
      bz = Math.floor(b / w),
      dx = bx - ax,
      dz = bz - az,
      len2 = dx * dx + dz * dz,
      len = Math.sqrt(len2);
    const ra = rivers.widths[k] * 0.5;
    const rb = widthByCell[b] > 0 ? widthByCell[b] * 0.5 : ra,
      radius = Math.max(ra, rb);
    for (
      let z = Math.max(0, Math.floor(Math.min(az, bz) - radius));
      z <= Math.min(h - 1, Math.ceil(Math.max(az, bz) + radius));
      z++
    )
      for (
        let x = Math.max(0, Math.floor(Math.min(ax, bx) - radius));
        x <= Math.min(w - 1, Math.ceil(Math.max(ax, bx) + radius));
        x++
      ) {
        const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / len2));
        const value = ra + (rb - ra) * t - Math.hypot(x - ax - t * dx, z - az - t * dz),
          i = z * w + x;
        if (value > coverage[i]) {
          coverage[i] = value;
          flowX[i] = dx / len;
          flowZ[i] = dz / len;
        }
      }
  }
  let lake: BufferGeometry | undefined, river: BufferGeometry | undefined;
  try {
    lake = build(false);
    river = stats.supported ? build(true) : undefined;
    stats.lakeVertices = lake?.getAttribute('position').count ?? 0;
    stats.riverVertices = river?.getAttribute('position').count ?? 0;
    for (const g of [lake, river])
      if (g) {
        for (const a of Object.values(g.attributes)) stats.bytes += a.array.byteLength;
        stats.bytes += g.index?.array.byteLength ?? 0;
      }
    let disposed = false;
    return {
      lake,
      river,
      stats,
      riverSurfaceAt: sampleRiver,
      dispose: () => {
        if (disposed) return;
        disposed = true;
        lake?.dispose();
        river?.dispose();
      },
    };
  } catch (error) {
    lake?.dispose();
    river?.dispose();
    throw error;
  }

  function sampleRiver(x: number, z: number): number {
    if (x < 0 || z < 0 || x > w - 1 || z > h - 1) return -1;
    const cx = Math.min(w - 2, Math.floor(x)),
      cz = Math.min(h - 2, Math.floor(z)),
      i = cz * w + cx,
      fx = x - cx,
      fz = z - cz,
      first = fx + fz <= 1;
    const a = first ? i : i + 1,
      b = i + w,
      c = first ? i + 1 : i + w + 1;
    const wa = first ? 1 - fx - fz : 1 - fz,
      wb = first ? fz : 1 - fx,
      wc = first ? fx : fx + fz - 1;
    if (wa * coverage[a] + wb * coverage[b] + wc * coverage[c] <= 0) return -1;
    const allowed = (j: number) =>
      hydrology.depressionDepth[j] === 0 || lakes.lakeIdByCell[j] >= 0 ? 1 : 0;
    if (wa * allowed(a) + wb * allowed(b) + wc * allowed(c) < 0.5) return -1;
    const ground = wa * bed[a] + wb * bed[b] + wc * bed[c],
      owner = lakeTriangleOwner(result, a, b, c);
    if (owner === -2 || (owner >= 0 && ground < lakes.basins[owner].waterLevel)) return -1;
    if ((biomes[a] === 0 || biomes[b] === 0 || biomes[c] === 0) && ground < sea) return -1;
    return ground + OFFSET;
  }

  function build(isRiver: boolean): BufferGeometry | undefined {
    let poly = new Float64Array(24),
      scratch = new Float64Array(24),
      count = 0;
    let a = 0,
      b = 0,
      c = 0,
      level = 0,
      pass = 0,
      vertices = 0,
      indexCount = 0,
      vCursor = 0,
      iCursor = 0;
    let position: Float32Array,
      depth: Float32Array,
      shore: Float32Array,
      flow: Float32Array,
      indices: Uint32Array;
    const sample = (va: number, vb: number, vc: number, u: number, v: number) =>
      va * (1 - u - v) + vb * u + vc * v;
    const clip = (fa: number, fb: number, fc: number) => {
      if (count === 0) return;
      let out = 0;
      const append = (u: number, v: number) => {
        if (
          out > 0 &&
          Math.abs(scratch[(out - 1) * 2] - u) < EPS &&
          Math.abs(scratch[(out - 1) * 2 + 1] - v) < EPS
        )
          return;
        scratch[out * 2] = u;
        scratch[out * 2 + 1] = v;
        out++;
      };
      let pu = poly[(count - 1) * 2],
        pv = poly[(count - 1) * 2 + 1],
        pf = sample(fa, fb, fc, pu, pv);
      for (let i = 0; i < count; i++) {
        const u = poly[i * 2],
          v = poly[i * 2 + 1],
          f = sample(fa, fb, fc, u, v);
        if (f >= 0 !== pf >= 0) {
          const t = pf / (pf - f);
          append(pu + (u - pu) * t, pv + (v - pv) * t);
        }
        if (f >= 0) append(u, v);
        pu = u;
        pv = v;
        pf = f;
      }
      if (
        out > 1 &&
        Math.abs(scratch[0] - scratch[(out - 1) * 2]) < EPS &&
        Math.abs(scratch[1] - scratch[(out - 1) * 2 + 1]) < EPS
      )
        out--;
      const swap = poly;
      poly = scratch;
      scratch = swap;
      count = out;
    };
    const emit = () => {
      if (count < 3) return;
      let triangles = 0;
      for (let k = 1; k < count - 1; k++)
        if (
          (poly[k * 2] - poly[0]) * (poly[(k + 1) * 2 + 1] - poly[1]) -
            (poly[k * 2 + 1] - poly[1]) * (poly[(k + 1) * 2] - poly[0]) >
          EPS
        )
          triangles++;
      if (!triangles) return;
      if (pass === 0) {
        vertices += count;
        indexCount += triangles * 3;
        return;
      }
      const base = vCursor;
      for (let k = 0; k < count; k++) {
        const u = poly[k * 2],
          v = poly[k * 2 + 1],
          x = sample(a % w, b % w, c % w, u, v),
          z = sample(Math.floor(a / w), Math.floor(b / w), Math.floor(c / w), u, v),
          ground = sample(bed[a], bed[b], bed[c], u, v);
        const y = isRiver ? ground + OFFSET : level;
        position[vCursor * 3] = x - (w - 1) / 2;
        position[vCursor * 3 + 1] = y;
        position[vCursor * 3 + 2] = z - (h - 1) / 2;
        depth[vCursor] = isRiver ? 0.9 : Math.max(0, level - ground);
        shore[vCursor] = isRiver
          ? Math.max(0, sample(coverage[a], coverage[b], coverage[c], u, v))
          : Math.min(3, Math.max(0, level - ground) * 2);
        if (isRiver) {
          flow[vCursor * 2] = sample(flowX[a], flowX[b], flowX[c], u, v);
          flow[vCursor * 2 + 1] = sample(flowZ[a], flowZ[b], flowZ[c], u, v);
        }
        vCursor++;
      }
      for (let k = 1; k < count - 1; k++)
        if (
          (poly[k * 2] - poly[0]) * (poly[(k + 1) * 2 + 1] - poly[1]) -
            (poly[k * 2 + 1] - poly[1]) * (poly[(k + 1) * 2] - poly[0]) >
          EPS
        ) {
          indices[iCursor++] = base;
          indices[iCursor++] = base + k;
          indices[iCursor++] = base + k + 1;
        }
    };
    const triangle = (aa: number, bb: number, cc: number) => {
      a = aa;
      b = bb;
      c = cc;
      const reset = () => {
        count = 3;
        poly[0] = 0;
        poly[1] = 0;
        poly[2] = 1;
        poly[3] = 0;
        poly[4] = 0;
        poly[5] = 1;
      };
      const owner = lakeTriangleOwner(result, a, b, c);
      if (owner === -2) return;
      if (!isRiver) {
        if (owner < 0) return;
        level = lakes.basins[owner].waterLevel;
        reset();
        clip(level - bed[a], level - bed[b], level - bed[c]);
        emit();
      } else {
        if (coverage[a] <= 0 && coverage[b] <= 0 && coverage[c] <= 0) return;
        reset();
        clip(coverage[a], coverage[b], coverage[c]);
        const allowed = (i: number) =>
          hydrology.depressionDepth[i] === 0 || lakes.lakeIdByCell[i] >= 0 ? 1 : 0;
        clip(allowed(a) - 0.5, allowed(b) - 0.5, allowed(c) - 0.5);
        if (owner >= 0) {
          const surface = lakes.basins[owner].waterLevel;
          clip(bed[a] - surface, bed[b] - surface, bed[c] - surface);
        }
        if (biomes[a] === 0 || biomes[b] === 0 || biomes[c] === 0)
          clip(bed[a] - sea, bed[b] - sea, bed[c] - sea);
        emit();
      }
    };
    const traverse = () => {
      for (let z = 0; z < h - 1; z++)
        for (let x = 0; x < w - 1; x++) {
          const i = z * w + x;
          triangle(i, i + w, i + 1);
          triangle(i + 1, i + w, i + w + 1);
        }
    };
    traverse();
    if (!indexCount) return undefined;
    position = new Float32Array(vertices * 3);
    depth = new Float32Array(vertices);
    shore = new Float32Array(vertices);
    flow = new Float32Array(isRiver ? vertices * 2 : 0);
    indices = new Uint32Array(indexCount);
    pass = 1;
    traverse();
    const geometry = new BufferGeometry();
    try {
      geometry.name = isRiver ? 'inland-river-v1' : 'inland-lake-v1';
      geometry.setAttribute('position', new BufferAttribute(position, 3));
      geometry.setAttribute('waterDepth', new BufferAttribute(depth, 1));
      geometry.setAttribute('shoreDistance', new BufferAttribute(shore, 1));
      geometry.setIndex(new BufferAttribute(indices, 1));
      if (isRiver) {
        geometry.setAttribute('waterFlow', new BufferAttribute(flow, 2));
        geometry.computeVertexNormals();
      }
      geometry.computeBoundingSphere();
      return geometry;
    } catch (error) {
      geometry.dispose();
      throw error;
    }
  }
}
