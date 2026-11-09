import { foliageColor } from './foliage-color';
import { TREE_APPEARANCE as APPEARANCE } from './tree-appearance';
import {
  Color,
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
  TREE_VARIANT,
  TREE_VARIANT_IDS,
  TreeVariantId,
} from '../data/terrain.models';

/** Core owns categories, variants, suitability and transforms. All returned instances are rendered. */
export function terrainForest(result: TerrainResponse['result'], seed: number) {
  if (result.trees.length > MAX_TREES) throw new Error('Tree instance budget exceeded.');
  if (
    result.trees.some(
      (tree) => !TREE_KIND_IDS.has(tree.kind) || !TREE_VARIANT_IDS.has(tree.variant),
    )
  )
    throw new Error('Unsupported tree category or variant.');
  const groups: {
    kind: TreeKindId;
    variant: TreeVariantId;
    trunks: InstancedMesh<CylinderGeometry, MeshLambertMaterial>;
    crowns: InstancedMesh<ConeGeometry | IcosahedronGeometry, MeshLambertMaterial>;
  }[] = [];
  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
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
    for (const kind of Object.values(TREE_KIND))
      for (const variant of Object.values(TREE_VARIANT)) {
        const trees = result.trees.filter((tree) => tree.kind === kind && tree.variant === variant);
        if (!trees.length) continue;
        const appearance = APPEARANCE[kind][variant],
          small = variant === TREE_VARIANT.Small;
        const trunkGeometry = new CylinderGeometry(
          small ? 0.032 : 0.045,
          small ? 0.055 : 0.075,
          appearance.trunk,
          5,
        ).translate(0, appearance.trunk / 2, 0);
        const crownGeometry =
          kind === TREE_KIND.Conifer
            ? new ConeGeometry(appearance.radius, appearance.height, 6).translate(
                0,
                appearance.y,
                0,
              )
            : new IcosahedronGeometry(appearance.radius, 0)
                .scale(appearance.scale[0], appearance.scale[1], appearance.scale[2])
                .translate(0, appearance.y, 0);
        const trunks = new InstancedMesh(
          trunkGeometry,
          new MeshLambertMaterial({ color: small ? 0x756047 : 0x65503b }),
          trees.length,
        );
        const crowns = new InstancedMesh(
          crownGeometry,
          new MeshLambertMaterial({ color: 0xffffff }),
          trees.length,
        );
        groups.push({ kind, variant, trunks, crowns });
        crowns.name = 'foliage-variation-v1';
        const base = new Color(appearance.color),
          tint = new Color();
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
          crowns.setColorAt(index, foliageColor(seed, tree, base, tint));
        });
        trunks.instanceMatrix.needsUpdate = true;
        crowns.instanceMatrix.needsUpdate = true;
        crowns.instanceColor!.needsUpdate = true;
        trunks.computeBoundingSphere();
        crowns.computeBoundingSphere();
      }
    return { groups, dispose };
  } catch (error) {
    dispose();
    throw error;
  }
}
