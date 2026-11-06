import {
  ConeGeometry,
  CylinderGeometry,
  InstancedMesh,
  MeshLambertMaterial,
  Object3D,
} from 'three';
import { TerrainResponse, MAX_TREES } from '../data/terrain.models';

/** Presentation only: every placement and suitability decision is supplied by Core. */
export function terrainForest(result: TerrainResponse['result']) {
  if (result.trees.length > MAX_TREES) throw new Error('Tree instance budget exceeded.');
  const trunkGeometry = new CylinderGeometry(0.045, 0.075, 0.6, 5).translate(0, 0.3, 0);
  const crownGeometry = new ConeGeometry(0.42, 1.3, 6).translate(0, 1.05, 0);
  const trunks = new InstancedMesh(
    trunkGeometry,
    new MeshLambertMaterial({ color: 0x65503b }),
    result.trees.length,
  );
  const crowns = new InstancedMesh(
    crownGeometry,
    new MeshLambertMaterial({ color: 0x23583a }),
    result.trees.length,
  );
  const pose = new Object3D();
  result.trees.forEach((tree, index) => {
    pose.position.set(tree.x - (result.width - 1) / 2, tree.y, tree.z - (result.height - 1) / 2);
    pose.rotation.set(0, tree.rotation, 0);
    pose.scale.setScalar(tree.scale);
    pose.updateMatrix();
    trunks.setMatrixAt(index, pose.matrix);
    crowns.setMatrixAt(index, pose.matrix);
  });
  if (result.trees.length) {
    trunks.instanceMatrix.needsUpdate = true;
    crowns.instanceMatrix.needsUpdate = true;
    trunks.computeBoundingSphere();
    crowns.computeBoundingSphere();
  }
  return {
    trunks,
    crowns,
    dispose() {
      trunks.dispose();
      crowns.dispose();
      trunkGeometry.dispose();
      crownGeometry.dispose();
      trunks.material.dispose();
      crowns.material.dispose();
    },
  };
}
