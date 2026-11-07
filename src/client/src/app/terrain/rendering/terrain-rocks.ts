import { IcosahedronGeometry, InstancedMesh, MeshLambertMaterial, Object3D } from 'three';
import { MAX_ROCKS, ROCK_KIND, ROCK_VARIANT, TerrainResponse } from '../data/terrain.models';

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
  const meshes: InstancedMesh<IcosahedronGeometry, MeshLambertMaterial>[] = [];
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
          new IcosahedronGeometry(1, variant === ROCK_VARIANT.Angular ? 0 : 1),
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
