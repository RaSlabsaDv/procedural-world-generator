import {
  IcosahedronGeometry,
  DodecahedronGeometry,
  OctahedronGeometry,
  BufferGeometry,
  InstancedMesh,
  MeshLambertMaterial,
  Object3D,
} from 'three';
import { MAX_ROCKS, ROCK_KIND, ROCK_VARIANT, TerrainResponse } from '../data/terrain.models';

export const ROCK_SHAPES_REVISION = 'rock-shapes-v2';

const COLORS = [0x89877f, 0x85857f, 0x999487] as const;

/** Core supplies complete transforms; centered unit-radius geometry respects its support envelope. */
export function terrainRocks(result: TerrainResponse['result']) {
  if (result.rocks.length > MAX_ROCKS) throw new Error('Rock instance budget exceeded.');
  if (
    result.rocks.some(
      (r) =>
        !Object.values(ROCK_KIND).includes(r.kind) ||
        !Object.values(ROCK_VARIANT).includes(r.variant),
    )
  )
    throw new Error('Unsupported rock category or variant.');
  const meshes: InstancedMesh<BufferGeometry, MeshLambertMaterial>[] = [];
  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    for (const mesh of meshes) {
      mesh.dispose();
      mesh.geometry.dispose();
      mesh.material.dispose();
    }
  };
  try {
    for (const kind of Object.values(ROCK_KIND))
      for (const variant of Object.values(ROCK_VARIANT)) {
        const rocks = result.rocks.filter((r) => r.kind === kind && r.variant === variant);
        if (!rocks.length) continue;
        const mesh = new InstancedMesh(
          rockGeometry(kind, variant),
          new MeshLambertMaterial({ color: COLORS[kind], flatShading: true }),
          rocks.length,
        );
        meshes.push(mesh);
        const pose = new Object3D();
        rocks.forEach((rock, index) => {
          pose.position.set(
            rock.x - (result.width - 1) / 2,
            rock.y,
            rock.z - (result.height - 1) / 2,
          );
          pose.rotation.set(0, rock.rotation, 0);
          pose.scale.set(rock.scaleX, rock.scaleY, rock.scaleZ);
          pose.updateMatrix();
          mesh.setMatrixAt(index, pose.matrix);
        });
        mesh.instanceMatrix.needsUpdate = true;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.computeBoundingSphere();
      }
    return { meshes, dispose };
  } catch (error) {
    dispose();
    throw error;
  }
}

/** Six shared, closed, bounded silhouettes. Geometry only; no per-instance randomness. */
export function rockGeometry(kind: number, variant: number): BufferGeometry {
  const angular = variant === ROCK_VARIANT.Angular;
  const geometry =
    kind === ROCK_KIND.Boulder
      ? angular
        ? new DodecahedronGeometry(1, 0)
        : new IcosahedronGeometry(1, 1)
      : kind === ROCK_KIND.Outcrop
        ? angular
          ? new OctahedronGeometry(1, 0)
          : new DodecahedronGeometry(1, 0)
        : angular
          ? new IcosahedronGeometry(1, 0)
          : new OctahedronGeometry(1, 1);
  geometry.rotateZ(kind === ROCK_KIND.Outcrop ? 0.18 : kind === ROCK_KIND.Boulder ? -0.08 : 0);
  const position = geometry.getAttribute('position');
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i),
      y = position.getY(i),
      z = position.getZ(i);
    position.setXYZ(i, x * (0.9 + 0.08 * y), y, z * (0.87 + 0.08 * x));
  }
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  geometry.name = ROCK_SHAPES_REVISION + ':' + kind + ':' + variant;
  return geometry;
}
