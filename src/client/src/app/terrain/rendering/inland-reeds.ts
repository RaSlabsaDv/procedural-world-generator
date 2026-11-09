import {
  BufferGeometry,
  Float32BufferAttribute,
  Color,
  DoubleSide,
  InstancedMesh,
  MeshLambertMaterial,
  Object3D,
} from 'three';
import type { TerrainResponse } from '../data/terrain.models';
import { placeReeds, REEDS } from './reed-placement';

/** Five upright stems with narrow leaves and small seed heads; no bitmap alpha. */
export function reedGeometry() {
  const geometry = new BufferGeometry();
  try {
    const positions: number[] = [],
      colors: number[] = [],
      indices: number[] = [];
    const quad = (
      x: number,
      z: number,
      angle: number,
      width: number,
      bottom: number,
      top: number,
      lean: number,
      head = false,
    ) => {
      const base = positions.length / 3,
        cs = Math.cos(angle),
        sn = Math.sin(angle);
      for (const [side, y] of [
        [-1, bottom],
        [1, bottom],
        [-1, top],
        [1, top],
      ]) {
        positions.push(
          x + side * width * cs + lean * y,
          y,
          z + side * width * sn + lean * y * 0.35,
        );
        colors.push(
          head ? 0.85 : 0.65 + 0.25 * y,
          head ? 0.62 : 0.75 + 0.2 * y,
          head ? 0.3 : 0.5 + 0.2 * y,
        );
      }
      indices.push(base, base + 2, base + 1, base + 1, base + 2, base + 3);
    };
    for (let stem = 0; stem < 5; stem++) {
      const a = stem * 2.399963229728653,
        x = Math.cos(a) * 0.075,
        z = Math.sin(a) * 0.075,
        h = 0.78 + stem * 0.045;
      for (const angle of [a, a + Math.PI / 2]) quad(x, z, angle, 0.009, 0, h - 0.12, 0.025);
      quad(x, z, a, 0.018, h - 0.12, h, 0.025, true);
      // A narrow tapered leaf reaching sideways, visibly different from short grass.
      const base = positions.length / 3;
      const leafX = x + 0.025 * 0.34,
        leafZ = z + 0.025 * 0.35 * 0.34;
      positions.push(
        leafX,
        0.34,
        leafZ,
        leafX + Math.cos(a) * 0.11,
        0.58,
        leafZ + Math.sin(a) * 0.11,
        leafX + Math.cos(a) * 0.15,
        0.64,
        leafZ + Math.sin(a) * 0.15,
      );
      colors.push(0.6, 0.8, 0.5, 0.75, 0.9, 0.6, 0.8, 0.95, 0.65);
      indices.push(base, base + 1, base + 2);
    }
    geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    return geometry;
  } catch (error) {
    geometry.dispose();
    throw error;
  }
}
export function reedMaterial() {
  const material = new MeshLambertMaterial({ vertexColors: true, side: DoubleSide });
  material.name = REEDS.revision;
  material.customProgramCacheKey = () => REEDS.revision;
  material.onBeforeCompile = (shader) => {
    shader.uniforms['reedFadeNear'] = { value: REEDS.fadeNear };
    shader.uniforms['reedFadeFar'] = { value: REEDS.fadeFar };
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        '#include <common>\nuniform float reedFadeNear,reedFadeFar;varying float vReedFade;',
      )
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>
        vec3 reedAnchor=(modelMatrix*instanceMatrix*vec4(0.0,0.0,0.0,1.0)).xyz;
        vReedFade=1.0-smoothstep(reedFadeNear,reedFadeFar,length(cameraPosition-reedAnchor));
        if(vReedFade<=0.0)gl_Position=vec4(2.0,2.0,2.0,1.0);`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vReedFade;')
      .replace(
        '#include <clipping_planes_fragment>',
        `#include <clipping_planes_fragment>
        const int reedBayer[16]=int[16](0,8,2,10,12,4,14,6,3,11,1,9,15,7,13,5);
        int reedCell=(int(gl_FragCoord.x)&3)+4*(int(gl_FragCoord.y)&3);
        if(vReedFade<=(float(reedBayer[reedCell])+.5)/16.0)discard;`,
      );
  };
  return material;
}
export function inlandReeds(
  seed: number,
  result: TerrainResponse['result'],
  terrain: BufferGeometry,
  water: readonly (BufferGeometry | undefined)[],
  stones = new Float32Array(0),
) {
  const selection = placeReeds(seed, result, terrain, water, stones);
  let mesh: InstancedMesh<BufferGeometry, MeshLambertMaterial> | undefined,
    geometry: BufferGeometry | undefined,
    material: MeshLambertMaterial | undefined,
    disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    mesh?.removeFromParent();
    mesh?.dispose();
    geometry?.dispose();
    material?.dispose();
  };
  const stats = {
    count: selection.records.length / REEDS.stride,
    submerged: selection.submerged,
    candidates: selection.candidates,
    scratchBytes: selection.scratchBytes,
    instanceBytes: 0,
    geometryBytes: 0,
    checks: selection.checks,
    crowded: selection.crowded,
  };
  try {
    if (stats.count) {
      geometry = reedGeometry();
      material = reedMaterial();
      mesh = new InstancedMesh(geometry, material, stats.count);
      mesh.name = REEDS.revision;
      mesh.castShadow = false;
      mesh.receiveShadow = true;
      const pose = new Object3D(),
        color = new Color(),
        green = new Color(0x697943),
        straw = new Color(0x96905e),
        r = selection.records;
      for (let o = 0, i = 0; o < r.length; o += REEDS.stride, i++) {
        pose.position.set(
          r[o] - (result.width - 1) / 2,
          r[o + 1],
          r[o + 2] - (result.height - 1) / 2,
        );
        pose.rotation.set(0, r[o + 5], 0);
        pose.scale.set(r[o + 3], r[o + 4], r[o + 3]);
        pose.updateMatrix();
        mesh.setMatrixAt(i, pose.matrix);
        color.copy(green).lerp(straw, r[o + 6] * 0.6);
        mesh.setColorAt(i, color);
      }
      mesh.instanceMatrix.needsUpdate = true;
      mesh.instanceColor!.needsUpdate = true;
      mesh.computeBoundingBox();
      mesh.computeBoundingSphere();
      stats.instanceBytes =
        mesh.instanceMatrix.array.byteLength + mesh.instanceColor!.array.byteLength;
      for (const a of Object.values(geometry.attributes)) stats.geometryBytes += a.array.byteLength;
      stats.geometryBytes += geometry.index?.array.byteLength ?? 0;
    }
    return { mesh, stats, dispose };
  } catch (error) {
    dispose();
    throw error;
  }
}
