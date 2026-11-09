import {
  BufferGeometry,
  Color,
  DodecahedronGeometry,
  IcosahedronGeometry,
  InstancedMesh,
  MeshLambertMaterial,
  Object3D,
  Quaternion,
  Vector3,
} from 'three';
import type { TerrainResponse } from '../data/terrain.models';
import { placeShoreStones, SHORE_STONES } from './shore-stone-placement';

export function shoreStoneGeometry(angular: boolean): BufferGeometry {
  const geometry = angular ? new DodecahedronGeometry(1, 0) : new IcosahedronGeometry(1, 1);
  try {
    const p = geometry.getAttribute('position');
    geometry.computeBoundingBox();
    const min = geometry.boundingBox!.min.y,
      span = geometry.boundingBox!.max.y - min;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i),
        y = (p.getY(i) - min) / span,
        z = p.getZ(i);
      p.setXYZ(i, x * (0.92 + 0.06 * z), Math.max(0, (y - 0.12) / 0.88), z * (0.9 + 0.07 * x));
    }
    geometry.computeVertexNormals();
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    return geometry;
  } catch (error) {
    geometry.dispose();
    throw error;
  }
}
export function shoreStoneMaterial(large: boolean) {
  const material = new MeshLambertMaterial({ color: 0x89877f, flatShading: true });
  material.name = SHORE_STONES.revision;
  material.customProgramCacheKey = () => SHORE_STONES.revision + ':' + large;
  material.onBeforeCompile = (shader) => {
    shader.uniforms['shoreFadeNear'] = { value: large ? 55 : 28 };
    shader.uniforms['shoreFadeFar'] = { value: large ? 130 : 65 };
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        '#include <common>\nuniform float shoreFadeNear,shoreFadeFar;varying float vShoreFade;',
      )
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>
        vec3 shoreAnchor=(modelMatrix*instanceMatrix*vec4(0.0,0.0,0.0,1.0)).xyz;
        vShoreFade=1.0-smoothstep(shoreFadeNear,shoreFadeFar,length(cameraPosition-shoreAnchor));
        if(vShoreFade<=0.0)gl_Position=vec4(2.0,2.0,2.0,1.0);`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vShoreFade;')
      .replace(
        '#include <clipping_planes_fragment>',
        `#include <clipping_planes_fragment>
        const int shoreBayer[16]=int[16](0,8,2,10,12,4,14,6,3,11,1,9,15,7,13,5);
        int shoreCell=(int(gl_FragCoord.x)&3)+4*(int(gl_FragCoord.y)&3);
        if(vShoreFade<=(float(shoreBayer[shoreCell])+.5)/16.0)discard;`,
      );
  };
  return material;
}

/** Each preview owns its decorative scatter; canonical rocks stay untouched. */
export function shoreStones(
  seed: number,
  result: TerrainResponse['result'],
  terrain: BufferGeometry,
  water: readonly (BufferGeometry | undefined)[],
) {
  const selection = placeShoreStones(seed, result, terrain, water);
  const meshes: InstancedMesh<BufferGeometry, MeshLambertMaterial>[] = [];
  let pendingGeometry: BufferGeometry | undefined,
    pendingMaterial: MeshLambertMaterial | undefined,
    disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    for (const mesh of meshes) {
      mesh.removeFromParent();
      mesh.dispose();
      mesh.geometry.dispose();
      mesh.material.dispose();
    }
    pendingGeometry?.dispose();
    pendingMaterial?.dispose();
  };
  const stats = {
    count: selection.records.length / SHORE_STONES.stride,
    large: selection.large,
    candidates: selection.candidates,
    scratchBytes: selection.scratchBytes,
    instanceBytes: 0,
    geometryBytes: 0,
    checks: selection.checks,
    crowded: selection.crowded,
  };
  try {
    const r = selection.records,
      stride = SHORE_STONES.stride;
    for (let group = 0; group < 2; group++) {
      let count = 0;
      for (let o = 0; o < r.length; o += stride) if ((r[o + 11] === 0 ? 0 : 1) === group) count++;
      if (!count) continue;
      pendingGeometry = shoreStoneGeometry(group === 1);
      pendingMaterial = shoreStoneMaterial(group === 1);
      const mesh = new InstancedMesh(pendingGeometry, pendingMaterial, count);
      meshes.push(mesh);
      pendingGeometry = undefined;
      pendingMaterial = undefined;
      mesh.name = SHORE_STONES.revision + ':' + group;
      mesh.castShadow = false;
      mesh.receiveShadow = true;
      const pose = new Object3D(),
        up = new Vector3(0, 1, 0),
        normal = new Vector3(),
        tilt = new Quaternion(),
        yaw = new Quaternion(),
        color = new Color();
      let cursor = 0;
      for (let o = 0; o < r.length; o += stride) {
        if ((r[o + 11] === 0 ? 0 : 1) !== group) continue;
        normal.set(r[o + 6], r[o + 7], r[o + 8]).normalize();
        tilt.setFromUnitVectors(up, normal);
        yaw.setFromAxisAngle(up, r[o + 9]);
        pose.quaternion.copy(tilt).multiply(yaw);
        pose.position.set(
          r[o] - (result.width - 1) / 2,
          r[o + 1] - SHORE_STONES.embed * r[o + 4],
          r[o + 2] - (result.height - 1) / 2,
        );
        pose.scale.set(r[o + 3], r[o + 4], r[o + 5]);
        pose.updateMatrix();
        mesh.setMatrixAt(cursor, pose.matrix);
        color.setRGB(r[o + 10], r[o + 10], r[o + 10]);
        mesh.setColorAt(cursor++, color);
      }
      mesh.instanceMatrix.needsUpdate = true;
      mesh.instanceColor!.needsUpdate = true;
      mesh.computeBoundingBox();
      mesh.computeBoundingSphere();
      stats.instanceBytes +=
        mesh.instanceMatrix.array.byteLength + mesh.instanceColor!.array.byteLength;
      for (const a of Object.values(mesh.geometry.attributes))
        stats.geometryBytes += a.array.byteLength;
      stats.geometryBytes += mesh.geometry.index?.array.byteLength ?? 0;
    }
    return { meshes, stats, dispose };
  } catch (error) {
    dispose();
    throw error;
  }
}
