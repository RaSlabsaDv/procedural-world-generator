import { foliageColor } from './foliage-color';
import { TREE_CROWN_COLORS } from '../data/biome-presentation';
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

/** Fixed presentation definitions, not tree age, placement or ecological rules. */
const APPEARANCE = {
  [TREE_KIND.Broadleaf]: {
    [TREE_VARIANT.Small]: {
      trunk: 0.48,
      radius: 0.36,
      height: 1,
      y: 0.72,
      scale: [0.9, 1.05, 0.95],
      color: TREE_CROWN_COLORS[TREE_KIND.Broadleaf][TREE_VARIANT.Small],
    },
    [TREE_VARIANT.Mature]: {
      trunk: 0.82,
      radius: 0.58,
      height: 1,
      y: 1.18,
      scale: [1.05, 0.85, 1],
      color: TREE_CROWN_COLORS[TREE_KIND.Broadleaf][TREE_VARIANT.Mature],
    },
  },
  [TREE_KIND.Conifer]: {
    [TREE_VARIANT.Small]: {
      trunk: 0.42,
      radius: 0.29,
      height: 0.95,
      y: 0.72,
      scale: [1, 1, 1],
      color: TREE_CROWN_COLORS[TREE_KIND.Conifer][TREE_VARIANT.Small],
    },
    [TREE_VARIANT.Mature]: {
      trunk: 0.7,
      radius: 0.48,
      height: 1.55,
      y: 1.18,
      scale: [1, 1, 1],
      color: TREE_CROWN_COLORS[TREE_KIND.Conifer][TREE_VARIANT.Mature],
    },
  },
  [TREE_KIND.Savanna]: {
    [TREE_VARIANT.Small]: {
      trunk: 0.8,
      radius: 0.46,
      height: 1,
      y: 0.86,
      scale: [1.15, 0.45, 1],
      color: TREE_CROWN_COLORS[TREE_KIND.Savanna][TREE_VARIANT.Small],
    },
    [TREE_VARIANT.Mature]: {
      trunk: 1.22,
      radius: 0.72,
      height: 1,
      y: 1.28,
      scale: [1.4, 0.32, 1.15],
      color: TREE_CROWN_COLORS[TREE_KIND.Savanna][TREE_VARIANT.Mature],
    },
  },
} as const;

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
