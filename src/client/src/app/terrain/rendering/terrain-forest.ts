import {
  ConeGeometry,
  CylinderGeometry,
  IcosahedronGeometry,
  InstancedMesh,
  MeshLambertMaterial,
  Object3D,
} from 'three';
import {
  TerrainResponse,
  MAX_TREES,
  TREE_KIND,
  TREE_KIND_IDS,
  TreeKindId,
} from '../data/terrain.models';

/** Presentation only. Core supplies all categories, suitability and placements. */
export function terrainForest(result: TerrainResponse['result']) {
  if (result.trees.length > MAX_TREES) throw new Error('Tree instance budget exceeded.');
  if (result.trees.some((tree) => !TREE_KIND_IDS.has(tree.kind)))
    throw new Error('Unsupported tree category.');
  const groups: {
    kind: TreeKindId;
    trunks: InstancedMesh<CylinderGeometry, MeshLambertMaterial>;
    crowns: InstancedMesh<ConeGeometry | IcosahedronGeometry, MeshLambertMaterial>;
  }[] = [];
  const dispose = () => {
    for (const { trunks, crowns } of groups) {
      trunks.dispose();
      crowns.dispose();
      trunks.geometry.dispose();
      crowns.geometry.dispose();
      trunks.material.dispose();
      crowns.material.dispose();
    }
  };
  try {
    for (const kind of Object.values(TREE_KIND)) {
      const trees = result.trees.filter((tree) => tree.kind === kind);
      if (!trees.length) continue;
      const trunkHeight =
        kind === TREE_KIND.Savanna ? 1.1 : kind === TREE_KIND.Broadleaf ? 0.7 : 0.6;
      const trunkGeometry = new CylinderGeometry(0.045, 0.075, trunkHeight, 5).translate(
        0,
        trunkHeight / 2,
        0,
      );
      const crownGeometry =
        kind === TREE_KIND.Conifer
          ? new ConeGeometry(0.42, 1.3, 6).translate(0, 1.05, 0)
          : kind === TREE_KIND.Savanna
            ? new IcosahedronGeometry(0.65, 0).scale(1.35, 0.32, 1.1).translate(0, 1.15, 0)
            : new IcosahedronGeometry(0.52, 0).scale(1, 0.85, 1).translate(0, 1.05, 0);
      const trunks = new InstancedMesh(
        trunkGeometry,
        new MeshLambertMaterial({ color: 0x65503b }),
        trees.length,
      );
      const crowns = new InstancedMesh(
        crownGeometry,
        new MeshLambertMaterial({
          color:
            kind === TREE_KIND.Conifer
              ? 0x234c3a
              : kind === TREE_KIND.Savanna
                ? 0x788449
                : 0x37744a,
        }),
        trees.length,
      );
      groups.push({ kind, trunks, crowns });
      const pose = new Object3D();
      trees.forEach((tree, index) => {
        pose.position.set(
          tree.x - (result.width - 1) / 2,
          tree.y,
          tree.z - (result.height - 1) / 2,
        );
        pose.rotation.set(0, tree.rotation, 0);
        pose.scale.setScalar(tree.scale);
        pose.updateMatrix();
        trunks.setMatrixAt(index, pose.matrix);
        crowns.setMatrixAt(index, pose.matrix);
      });
      trunks.instanceMatrix.needsUpdate = true;
      crowns.instanceMatrix.needsUpdate = true;
      trunks.computeBoundingSphere();
      crowns.computeBoundingSphere();
    }
    return { groups, dispose };
  } catch (error) {
    dispose();
    throw error;
  }
}
