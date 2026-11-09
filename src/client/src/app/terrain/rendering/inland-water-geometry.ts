import { lakeTriangleOwner } from './lake-footprint';
import { BufferAttribute, BufferGeometry } from 'three';
import { CHANNEL_STATE, TerrainResponse } from '../data/terrain.models';

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
    fieldBytes: 0,
  };
  if (!lakes.basins.length && !rivers.cellIndices.length)
    return {
      lake: undefined,
      river: undefined,
      stats,
      riverSurfaceAt: () => -1,
      dispose: () => {},
    };
  const hasExposed = result.channels.segmentState.includes(CHANNEL_STATE.Exposed);
  const centerCoverage = new Float32Array(hasExposed ? n : 0).fill(-4),
    centerFlowX = new Float32Array(hasExposed ? n : 0),
    centerFlowZ = new Float32Array(hasExposed ? n : 0),
    centerProfile = new Float64Array(hasExposed ? n : 0),
    centerDistance = new Float32Array(hasExposed ? n : 0).fill(Infinity),
    gridDistance = new Float32Array(hasExposed ? n : 0).fill(Infinity),
    riverRanges = new Uint32Array(hasExposed ? (w - 1) * (h - 1) + 1 : 0);
  const at = (field: Float32Array, center: Float32Array | Float64Array, i: number) =>
    i < n ? field[i] : center[i - n];
  const bedAt = (i: number) => (i < n ? bed[i] : (bed[i - n + 1] + bed[i - n + w]) * 0.5);
  const xAt = (i: number) => (i < n ? i % w : ((i - n) % w) + 0.5);
  const zAt = (i: number) => (i < n ? Math.floor(i / w) : Math.floor((i - n) / w) + 0.5);
  const coverage = new Float32Array(n).fill(-4),
    flowX = new Float32Array(n),
    flowZ = new Float32Array(n),
    profile = new Float32Array(n),
    node = bed.slice();
  const incoming = new Uint8Array(n),
    widthByCell = new Float32Array(n);
  for (let i = 0; i < n; i++) if (biomes[i] === 0) node[i] = sea;
  for (let i = 0; i < rivers.cellIndices.length; i++) {
    widthByCell[rivers.cellIndices[i]] = rivers.widths[i];
    node[rivers.cellIndices[i]] = result.channels.waterSurfaceHeight[i];
  }
  for (let k = 0; k < rivers.cellIndices.length; k++) {
    const a = rivers.cellIndices[k],
      b = hydrology.receiverIndex[a];
    if (b < 0) continue;
    if (result.channels.segmentState[k] !== CHANNEL_STATE.Exposed) {
      stats.suppressed++;
      continue;
    }
    const la = lakes.lakeIdByCell[a],
      lb = lakes.lakeIdByCell[b];
    const level = la >= 0 || lb >= 0 || biomes[b] === 0 ? 0 : -1;
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
    for (let grid = 0; grid < 2; grid++) {
      const offset = grid * 0.5,
        cov = grid ? centerCoverage : coverage,
        fx = grid ? centerFlowX : flowX,
        fz = grid ? centerFlowZ : flowZ,
        levels = grid ? centerProfile : profile,
        nearest = grid ? centerDistance : gridDistance;
      for (
        let z = Math.max(0, Math.floor(Math.min(az, bz) - radius));
        z <= Math.min(h - 1 - grid, Math.ceil(Math.max(az, bz) + radius));
        z++
      )
        for (
          let x = Math.max(0, Math.floor(Math.min(ax, bx) - radius));
          x <= Math.min(w - 1 - grid, Math.ceil(Math.max(ax, bx) + radius));
          x++
        ) {
          const px = x + offset,
            pz = z + offset;
          const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / len2));
          const value = ra + (rb - ra) * t - Math.hypot(px - ax - t * dx, pz - az - t * dz),
            i = z * w + x;
          if (value > cov[i]) cov[i] = value;
          const distanceSquared = (px - ax - t * dx) ** 2 + (pz - az - t * dz) ** 2;
          if (distanceSquared < nearest[i]) {
            nearest[i] = distanceSquared;
            fx[i] = dx / len;
            fz[i] = dz / len;
            levels[i] = node[a] + (node[b] - node[a]) * t;
          }
        }
    }
  }
  // Shared grid normals avoid faceted reflection seams between independently clipped polygons.
  const surfaceNormals = new Float32Array(stats.supported ? n * 3 : 0);
  if (stats.supported)
    for (let i = 0; i < n; i++) {
      const x = i % w,
        z = Math.floor(i / w),
        center = profile[i];
      const left = x > 0 && coverage[i - 1] > 0 ? profile[i - 1] : center,
        right = x < w - 1 && coverage[i + 1] > 0 ? profile[i + 1] : center;
      const top = z > 0 && coverage[i - w] > 0 ? profile[i - w] : center,
        bottom = z < h - 1 && coverage[i + w] > 0 ? profile[i + w] : center;
      const dx = (right - left) * 0.5,
        dz = (bottom - top) * 0.5,
        len = Math.hypot(dx, 1, dz);
      surfaceNormals[i * 3] = -dx / len;
      surfaceNormals[i * 3 + 1] = 1 / len;
      surfaceNormals[i * 3 + 2] = -dz / len;
    }
  stats.fieldBytes =
    coverage.byteLength +
    flowX.byteLength +
    flowZ.byteLength +
    profile.byteLength +
    node.byteLength +
    incoming.byteLength +
    widthByCell.byteLength +
    surfaceNormals.byteLength +
    centerCoverage.byteLength +
    centerFlowX.byteLength +
    centerFlowZ.byteLength +
    centerProfile.byteLength +
    centerDistance.byteLength +
    gridDistance.byteLength +
    riverRanges.byteLength;
  let lake: BufferGeometry | undefined, river: BufferGeometry | undefined;
  let disposed = false;
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

  /** Exact emitted triangles, including clipped banks and interpolated displayed heights. */
  function sampleRiver(x: number, z: number): number {
    if (!river || disposed || x < 0 || z < 0 || x > w - 1 || z > h - 1) return -1;
    const cx = Math.min(w - 2, Math.floor(x)),
      cz = Math.min(h - 2, Math.floor(z));
    const p = river.getAttribute('position'),
      idx = river.index!,
      px = x - (w - 1) / 2,
      pz = z - (h - 1) / 2;
    const minX = Math.max(0, Math.min(w - 2, Math.floor(x - 1e-7))),
      minZ = Math.max(0, Math.min(h - 2, Math.floor(z - 1e-7)));
    for (let qz = minZ; qz <= cz; qz++)
      for (let qx = minX; qx <= cx; qx++) {
        const q = qz * (w - 1) + qx;
        for (let k = riverRanges[q]; k < riverRanges[q + 1]; k += 3) {
          const a = idx.getX(k),
            b = idx.getX(k + 1),
            c = idx.getX(k + 2);
          const ax = p.getX(a),
            az = p.getZ(a),
            bx = p.getX(b),
            bz = p.getZ(b),
            dx = p.getX(c),
            dz = p.getZ(c);
          const det = (bz - dz) * (ax - dx) + (dx - bx) * (az - dz);
          if (Math.abs(det) < EPS) continue;
          const wa = ((bz - dz) * (px - dx) + (dx - bx) * (pz - dz)) / det,
            wb = ((dz - az) * (px - dx) + (ax - dx) * (pz - dz)) / det,
            wc = 1 - wa - wb;
          if (
            (wa >= 0 && wb >= 0 && wc >= 0) ||
            (wa * Math.abs(det) >= -1e-7 * Math.hypot(bx - dx, bz - dz) &&
              wb * Math.abs(det) >= -1e-7 * Math.hypot(dx - ax, dz - az) &&
              wc * Math.abs(det) >= -1e-7 * Math.hypot(ax - bx, az - bz))
          )
            return wa * p.getY(a) + wb * p.getY(b) + wc * p.getY(c);
        }
      }
    return -1;
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
      iCursor = 0,
      lakeOwner = -1,
      mouth = false;
    let position: Float32Array,
      depth: Float32Array,
      shore: Float32Array,
      flow: Float32Array,
      normal: Float32Array,
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
          x = sample(xAt(a), xAt(b), xAt(c), u, v),
          z = sample(zAt(a), zAt(b), zAt(c), u, v),
          ground = sample(bedAt(a), bedAt(b), bedAt(c), u, v);
        const cover = isRiver
          ? Math.max(
              0,
              sample(
                at(coverage, centerCoverage, a),
                at(coverage, centerCoverage, b),
                at(coverage, centerCoverage, c),
                u,
                v,
              ),
            )
          : 0;
        const rawWater = isRiver
          ? sample(
              at(profile, centerProfile, a),
              at(profile, centerProfile, b),
              at(profile, centerProfile, c),
              u,
              v,
            )
          : level;
        const fade = Math.min(1, cover / 0.25),
          shoreTriangle = lakeOwner >= 0 || mouth;
        const shown = isRiver
          ? ground +
            (shoreTriangle ? 0 : Math.max(0, rawWater - ground) * fade * fade * (3 - 2 * fade))
          : level;
        const y = isRiver ? shown + OFFSET : level;
        position[vCursor * 3] = x - (w - 1) / 2;
        position[vCursor * 3 + 1] = y;
        position[vCursor * 3 + 2] = z - (h - 1) / 2;
        depth[vCursor] = Math.max(0, shown - ground);
        shore[vCursor] = isRiver
          ? Math.max(
              0,
              sample(
                at(coverage, centerCoverage, a),
                at(coverage, centerCoverage, b),
                at(coverage, centerCoverage, c),
                u,
                v,
              ),
            )
          : Math.min(3, Math.max(0, level - ground) * 2);
        if (isRiver) {
          flow[vCursor * 2] = sample(
            at(flowX, centerFlowX, a),
            at(flowX, centerFlowX, b),
            at(flowX, centerFlowX, c),
            u,
            v,
          );
          flow[vCursor * 2 + 1] = sample(
            at(flowZ, centerFlowZ, a),
            at(flowZ, centerFlowZ, b),
            at(flowZ, centerFlowZ, c),
            u,
            v,
          );
          for (let axis = 0; axis < 3; axis++)
            normal[vCursor * 3 + axis] = sample(
              normalAt(a, axis),
              normalAt(b, axis),
              normalAt(c, axis),
              u,
              v,
            );
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
    const normalAt = (i: number, axis: number) =>
      i < n
        ? surfaceNormals[i * 3 + axis]
        : (surfaceNormals[(i - n + 1) * 3 + axis] + surfaceNormals[(i - n + w) * 3 + axis]) * 0.5;
    const triangle = (aa: number, bb: number, cc: number, owner: number, ocean: boolean) => {
      lakeOwner = owner;
      mouth = ocean;
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
      if (owner === -2) return;
      if (!isRiver) {
        if (owner < 0) return;
        level = lakes.basins[owner].waterLevel;
        reset();
        clip(level - bedAt(a), level - bedAt(b), level - bedAt(c));
        emit();
      } else {
        if (
          at(coverage, centerCoverage, a) <= 0 &&
          at(coverage, centerCoverage, b) <= 0 &&
          at(coverage, centerCoverage, c) <= 0
        )
          return;
        reset();
        clip(
          at(coverage, centerCoverage, a),
          at(coverage, centerCoverage, b),
          at(coverage, centerCoverage, c),
        );
        clip(
          at(profile, centerProfile, a) - bedAt(a),
          at(profile, centerProfile, b) - bedAt(b),
          at(profile, centerProfile, c) - bedAt(c),
        );
        if (owner >= 0) {
          const surface = lakes.basins[owner].waterLevel;
          clip(bedAt(a) - surface, bedAt(b) - surface, bedAt(c) - surface);
        }
        if (mouth) clip(bedAt(a) - sea, bedAt(b) - sea, bedAt(c) - sea);
        emit();
      }
    };
    const traverse = () => {
      for (let z = 0; z < h - 1; z++)
        for (let x = 0; x < w - 1; x++) {
          const i = z * w + x,
            m = n + i,
            cell = z * (w - 1) + x;
          if (isRiver && pass === 1) riverRanges[cell] = iCursor;
          const owner0 = lakeTriangleOwner(result, i, i + w, i + 1),
            owner1 = lakeTriangleOwner(result, i + 1, i + w, i + w + 1);
          const mouth0 = biomes[i] === 0 || biomes[i + w] === 0 || biomes[i + 1] === 0,
            mouth1 = biomes[i + 1] === 0 || biomes[i + w] === 0 || biomes[i + w + 1] === 0;
          if (isRiver) {
            triangle(i, i + w, m, owner0, mouth0);
            triangle(i, m, i + 1, owner0, mouth0);
            triangle(i + 1, m, i + w + 1, owner1, mouth1);
            triangle(m, i + w, i + w + 1, owner1, mouth1);
          } else {
            triangle(i, i + w, i + 1, owner0, mouth0);
            triangle(i + 1, i + w, i + w + 1, owner1, mouth1);
          }
        }
      if (isRiver && pass === 1) riverRanges[(w - 1) * (h - 1)] = iCursor;
    };
    traverse();
    if (!indexCount) return undefined;
    position = new Float32Array(vertices * 3);
    depth = new Float32Array(vertices);
    shore = new Float32Array(vertices);
    flow = new Float32Array(isRiver ? vertices * 2 : 0);
    normal = new Float32Array(isRiver ? vertices * 3 : 0);
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
        geometry.setAttribute('normal', new BufferAttribute(normal, 3));
      }
      geometry.computeBoundingSphere();
      return geometry;
    } catch (error) {
      geometry.dispose();
      throw error;
    }
  }
}
