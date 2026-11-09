import {
  BufferGeometry,
  ConeGeometry,
  CylinderGeometry,
  DynamicDrawUsage,
  InstancedBufferAttribute,
  InstancedMesh,
  MeshLambertMaterial,
  OctahedronGeometry,
  Vector3,
} from 'three';
import { TerrainResponse, TREE_KIND, TREE_VARIANT } from '../data/terrain.models';
import { terrainForest } from './terrain-forest';
import { TREE_APPEARANCE } from './tree-appearance';

export const TREE_LOD = Object.freeze({
  revision: 'tree-lod-v1',
  shadowLayer: 1,
  initialDistance: 56,
  nearDistance: 48,
  farDistance: 64,
  cameraStep: 0.25,
});

/** Exact boundaries retain the previous level. Undefined means first evaluation. */
export function treeLodLevel(distanceSquared: number, scale: number, previous?: number): number {
  const threshold =
    previous === undefined
      ? TREE_LOD.initialDistance
      : previous === 0
        ? TREE_LOD.farDistance
        : TREE_LOD.nearDistance;
  const boundary = (threshold * scale) ** 2;
  return previous === undefined
    ? Number(distanceSquared > boundary)
    : previous === 0
      ? Number(distanceSquared > boundary)
      : Number(distanceSquared >= boundary);
}

type TreeMesh = InstancedMesh<BufferGeometry, MeshLambertMaterial>;

function commitInstances(trunks: TreeMesh, crowns: TreeMesh) {
  const matrixRange = { start: 0, count: 0 },
    colorRange = { start: 0, count: 0 };
  return (count: number) => {
    trunks.count = crowns.count = count;
    trunks.visible = crowns.visible = count > 0;
    if (!count) return;
    matrixRange.count = count * 16;
    trunks.instanceMatrix.clearUpdateRanges();
    trunks.instanceMatrix.updateRanges.push(matrixRange);
    trunks.instanceMatrix.needsUpdate = true;
    colorRange.count = count * 3;
    crowns.instanceColor!.clearUpdateRanges();
    crowns.instanceColor!.updateRanges.push(colorRange);
    crowns.instanceColor!.needsUpdate = true;
  };
}

/** Camera-dependent color instances; immutable full-detail sources own tree shadows. */
export function terrainForestLod(result: TerrainResponse['result'], seed: number) {
  const source = terrainForest(result, seed);
  const ownedMeshes: TreeMesh[] = [],
    ownedGeometry: BufferGeometry[] = [];
  const groups: {
    kind: (typeof source.groups)[number]['kind'];
    variant: (typeof source.groups)[number]['variant'];
    trunks: TreeMesh;
    crowns: TreeMesh;
    farTrunks: TreeMesh;
    farCrowns: TreeMesh;
    sourceTrunks: TreeMesh;
    sourceCrowns: TreeMesh;
    trees: TerrainResponse['result']['trees'];
    colors: Float32Array;
    levels: Uint8Array;
    commitNear: (count: number) => void;
    commitFar: (count: number) => void;
  }[] = [];
  let disposed = false,
    initialized = false;
  const lastCamera = new Vector3();
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    for (const mesh of ownedMeshes) mesh.dispose();
    for (const geometry of ownedGeometry) geometry.dispose();
    source.dispose();
  };
  const mesh = (
    geometry: BufferGeometry,
    material: MeshLambertMaterial,
    count: number,
    name: string,
  ) => {
    const value = new InstancedMesh(geometry, material, count);
    ownedMeshes.push(value);
    value.name = name;
    value.instanceMatrix.setUsage(DynamicDrawUsage);
    return value;
  };
  const crownColors = (value: TreeMesh, count: number) => {
    value.instanceColor = new InstancedBufferAttribute(new Float32Array(count * 3), 3).setUsage(
      DynamicDrawUsage,
    );
  };
  try {
    for (const original of source.groups) {
      const { kind, variant } = original,
        appearance = TREE_APPEARANCE[kind][variant];
      const trees = result.trees.filter((tree) => tree.kind === kind && tree.variant === variant);
      const count = trees.length;
      const colors = original.crowns.instanceColor!.array as Float32Array;
      // Canonical tint remains CPU-only; depth rendering needs no color attribute.
      original.crowns.instanceColor = null;
      original.crowns.instanceMatrix = original.trunks.instanceMatrix;
      original.trunks.layers.set(TREE_LOD.shadowLayer);
      original.crowns.layers.set(TREE_LOD.shadowLayer);
      original.trunks.name = 'tree-lod-source-trunk';
      original.crowns.name = 'tree-lod-source-crown';
      const trunks = mesh(
        original.trunks.geometry,
        original.trunks.material,
        count,
        'tree-lod-near-trunk',
      );
      const crowns = mesh(
        original.crowns.geometry,
        original.crowns.material,
        count,
        'tree-lod-near-crown',
      );
      crowns.instanceMatrix = trunks.instanceMatrix;
      crownColors(crowns, count);
      trunks.instanceMatrix.array.set(original.trunks.instanceMatrix.array);
      crowns.instanceColor!.array.set(colors);
      trunks.boundingSphere = original.trunks.boundingSphere!.clone();
      crowns.boundingSphere = original.crowns.boundingSphere!.clone();

      const small = variant === TREE_VARIANT.Small;
      const trunkGeometry = new CylinderGeometry(
        small ? 0.032 : 0.045,
        small ? 0.055 : 0.075,
        appearance.trunk,
        3,
      );
      ownedGeometry.push(trunkGeometry);
      trunkGeometry.translate(0, appearance.trunk / 2, 0);
      const crownGeometry =
        kind === TREE_KIND.Conifer
          ? new ConeGeometry(appearance.radius, appearance.height, 3)
          : new OctahedronGeometry(0.85 * appearance.radius, 0);
      ownedGeometry.push(crownGeometry);
      if (kind !== TREE_KIND.Conifer)
        crownGeometry.scale(appearance.scale[0], appearance.scale[1], appearance.scale[2]);
      crownGeometry.translate(0, appearance.y, 0);
      const farTrunks = mesh(trunkGeometry, original.trunks.material, count, 'tree-lod-far-trunk');
      const farCrowns = mesh(crownGeometry, original.crowns.material, count, 'tree-lod-far-crown');
      farCrowns.instanceMatrix = farTrunks.instanceMatrix;
      crownColors(farCrowns, count);
      // Bounds cover ALL source trees, not just the current compacted subset.
      for (const far of [farTrunks, farCrowns]) {
        const compacted = far.instanceMatrix;
        far.instanceMatrix = original.trunks.instanceMatrix;
        far.computeBoundingSphere();
        far.instanceMatrix = compacted;
        far.count = 0;
        far.visible = false;
      }
      groups.push({
        kind,
        variant,
        trunks,
        crowns,
        farTrunks,
        farCrowns,
        sourceTrunks: original.trunks,
        sourceCrowns: original.crowns,
        trees,
        colors,
        levels: new Uint8Array(count),
        commitNear: commitInstances(trunks, crowns),
        commitFar: commitInstances(farTrunks, farCrowns),
      });
    }
    const update = (camera: Vector3): boolean => {
      if (
        disposed ||
        (initialized && lastCamera.distanceToSquared(camera) < TREE_LOD.cameraStep ** 2)
      )
        return false;
      let changed = false;
      for (const group of groups) {
        let dirty = !initialized;
        for (let i = 0; i < group.trees.length; i++) {
          const tree = group.trees[i];
          const dx = camera.x - (tree.x - (result.width - 1) / 2),
            dy = camera.y - tree.y,
            dz = camera.z - (tree.z - (result.height - 1) / 2);
          const level = treeLodLevel(
            dx * dx + dy * dy + dz * dz,
            tree.scale,
            initialized ? group.levels[i] : undefined,
          );
          if (level !== group.levels[i]) {
            group.levels[i] = level;
            dirty = true;
          }
        }
        if (!dirty) continue;
        changed = true;
        let near = 0,
          far = 0;
        const matrices = group.sourceTrunks.instanceMatrix.array;
        for (let i = 0; i < group.trees.length; i++) {
          const distant = group.levels[i] === 1;
          const index = distant ? far++ : near++;
          const trunks = distant ? group.farTrunks : group.trunks;
          const crowns = distant ? group.farCrowns : group.crowns;
          // Copy without subarray views or temporary per-tree objects.
          for (let j = 0; j < 16; j++)
            trunks.instanceMatrix.array[index * 16 + j] = matrices[i * 16 + j];
          for (let j = 0; j < 3; j++)
            crowns.instanceColor!.array[index * 3 + j] = group.colors[i * 3 + j];
        }
        group.commitNear(near);
        group.commitFar(far);
      }
      initialized = true;
      lastCamera.copy(camera);
      return changed;
    };
    return {
      groups,
      meshes: ownedMeshes,
      casters: source.groups.flatMap((g) => [g.trunks, g.crowns]),
      update,
      dispose,
    };
  } catch (error) {
    dispose();
    throw error;
  }
}
