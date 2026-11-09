import {
  BufferGeometry,
  Float32BufferAttribute,
  Color,
  DoubleSide,
  InstancedMesh,
  MeshLambertMaterial,
  Object3D,
  Quaternion,
  Vector3,
} from 'three';
import { BIOME_GROUND_COLORS } from '../data/biome-presentation';
import { LandscapeBiomeId, TerrainResponse } from '../data/terrain.models';
import {
  GRASS,
  grassPoint,
  grassRandom,
  newGrassSample,
  placeGrass,
  sampleGrass,
} from './grass-placement';

export function grassGeometry() {
  const positions: number[] = [],
    colors: number[] = [],
    indices: number[] = [];
  for (let blade = 0; blade < 3; blade++) {
    const angle = (blade * Math.PI) / 3,
      cs = Math.cos(angle),
      sn = Math.sin(angle),
      offset = blade * 5;
    for (const [x, y, z] of [
      [-0.028, 0, 0],
      [0.028, 0, 0],
      [0.015, 0.28, 0.035],
      [0.045, 0.28, 0.035],
      [0.09, 0.52, 0.06],
    ]) {
      positions.push(x * cs + z * sn, y, -x * sn + z * cs);
      const t = y / 0.52;
      colors.push(0.45 + 0.45 * t, 0.55 + 0.45 * t, 0.35 + 0.4 * t);
    }
    indices.push(
      offset,
      offset + 1,
      offset + 2,
      offset + 1,
      offset + 3,
      offset + 2,
      offset + 2,
      offset + 3,
      offset + 4,
    );
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}
export function grassMaterial() {
  const material = new MeshLambertMaterial({ vertexColors: true, side: DoubleSide });
  material.name = GRASS.revision;
  material.customProgramCacheKey = () => GRASS.revision;
  material.onBeforeCompile = (shader) => {
    shader.uniforms['grassFadeNear'] = { value: GRASS.fadeNear };
    shader.uniforms['grassFadeFar'] = { value: GRASS.fadeFar };
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        '#include <common>\nuniform float grassFadeNear,grassFadeFar;varying float vGrassFade;',
      )
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>
        vec3 grassAnchor=(modelMatrix*instanceMatrix*vec4(0.0,0.0,0.0,1.0)).xyz;
        vGrassFade=1.0-smoothstep(grassFadeNear,grassFadeFar,length(cameraPosition-grassAnchor));
        if(vGrassFade<=0.0)gl_Position=vec4(2.0,2.0,2.0,1.0);
      `,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vGrassFade;')
      .replace(
        '#include <clipping_planes_fragment>',
        `#include <clipping_planes_fragment>
        const int grassBayer[16]=int[16](0,8,2,10,12,4,14,6,3,11,1,9,15,7,13,5);
        int grassCell=(int(gl_FragCoord.x)&3)+4*(int(gl_FragCoord.y)&3);
        if(vGrassFade<=(float(grassBayer[grassCell])+.5)/16.0)discard;
      `,
      );
  };
  return material;
}
export function terrainGrass(seed: number, result: TerrainResponse['result']) {
  const selection = placeGrass(seed, result);
  let mesh: InstancedMesh<BufferGeometry, MeshLambertMaterial> | undefined;
  let geometry: BufferGeometry | undefined,
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
  try {
    if (selection.ids.length) {
      geometry = grassGeometry();
      material = grassMaterial();
      mesh = new InstancedMesh(geometry, material, selection.ids.length);
      mesh.name = GRASS.revision;
      mesh.castShadow = false;
      mesh.receiveShadow = true;
      const pose = new Object3D(),
        point = { x: 0, z: 0 },
        sample = newGrassSample(),
        up = new Vector3(0, 1, 0),
        normal = new Vector3(),
        tilt = new Quaternion(),
        yaw = new Quaternion(),
        color = new Color();
      const palette = Object.fromEntries(
        Object.entries(BIOME_GROUND_COLORS).map(([k, v]) => [k, new Color(v.grass)]),
      ) as Record<LandscapeBiomeId, Color>;
      selection.ids.forEach((id, index) => {
        grassPoint(seed, id, selection.grid, point);
        sampleGrass(result, point.x, point.z, sample);
        normal.set(sample.nx, sample.ny, sample.nz);
        const angle = Math.acos(Math.min(1, Math.max(-1, normal.y)));
        if (angle > GRASS.maxTilt) {
          const h = Math.hypot(normal.x, normal.z);
          normal.set(
            (normal.x / h) * Math.sin(GRASS.maxTilt),
            Math.cos(GRASS.maxTilt),
            (normal.z / h) * Math.sin(GRASS.maxTilt),
          );
        }
        tilt.setFromUnitVectors(up, normal);
        yaw.setFromAxisAngle(up, grassRandom(seed, id, 0x1a37) * Math.PI * 2);
        pose.quaternion.copy(tilt).multiply(yaw);
        pose.position.set(
          point.x - (result.width - 1) / 2,
          sample.y - GRASS.embed,
          point.z - (result.height - 1) / 2,
        );
        const width = 0.8 + 0.45 * grassRandom(seed, id, 0x3b25);
        pose.scale.set(width, 0.7 + 0.5 * grassRandom(seed, id, 0x4d91), width);
        pose.updateMatrix();
        mesh!.setMatrixAt(index, pose.matrix);
        color
          .copy(palette[sample.biome as LandscapeBiomeId])
          .multiplyScalar(0.65 + 0.25 * grassRandom(seed, id, 0x8f27));
        mesh!.setColorAt(index, color);
      });
      mesh.instanceMatrix.needsUpdate = true;
      mesh.instanceColor!.needsUpdate = true;
      mesh.computeBoundingBox();
      mesh.computeBoundingSphere();
    }
    return { mesh, selection, dispose };
  } catch (error) {
    dispose();
    throw error;
  }
}
