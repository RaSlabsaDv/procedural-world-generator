// Test-only production-factory harness, served in memory; no application hook.
import "@angular/compiler";
import * as T from "three";
import { terrainScene } from "../../../src/client/src/app/terrain/rendering/terrain-scene";
import { colorFinishing } from "../../../src/client/src/app/terrain/rendering/color-finishing";
import {
  DEFAULT_APPEARANCE,
  REFERENCE_APPEARANCE,
} from "../../../src/client/src/app/terrain/rendering/appearance-settings.service";
import { loadTerrainSurfaces } from "../../../src/client/src/app/terrain/rendering/terrain-surfaces";
import { loadTerrainMicroNormals } from "../../../src/client/src/app/terrain/rendering/terrain-micro-normals";
import { loadOceanNormal } from "../../../src/client/src/app/terrain/rendering/ocean-normal";
import { DEFAULT_OCEAN_SETTINGS } from "../../../src/client/src/app/terrain/rendering/ocean-settings.service";
import { deriveSceneEnvironment } from "../../../src/client/src/app/terrain/rendering/scene-environment";
import {
  DEFAULT_MAP_PARAMETERS,
  DEFAULT_SIMULATION_PARAMETERS,
} from "../../../src/client/src/app/terrain/data/terrain-defaults";
import {
  decodeTerrain,
  compareTerrains,
} from "../../../src/client/src/app/terrain/data/terrain.contract";
import { TERRAIN_ALGORITHM } from "../../../src/client/src/app/terrain/data/terrain.models";
const digest = async (value: unknown) =>
  Array.from(
    new Uint8Array(
      await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(JSON.stringify(value)),
      ),
    ),
  )
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");

export async function fetchTerrain(fields: Record<string, number>) {
  const map = {
    ...DEFAULT_MAP_PARAMETERS,
    width: 129,
    height: 97,
    algorithmVersion: "value-noise-fbm-v1",
  };
  const request = {
    ...DEFAULT_SIMULATION_PARAMETERS,
    iterations: 8,
    heightMap: map,
    algorithmVersion: TERRAIN_ALGORITHM,
  };
  for (const [k, v] of Object.entries(fields)) {
    if (k in map) (map as any)[k] = v;
    else (request as any)[k] = v;
  }
  const r = await fetch("/api/v1/terrains", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });
  if (!r.ok) throw Error("API " + r.status);
  const remote = await r.json(),
    host = await import(/* @vite-ignore */ "/wasm/world-generator-host.js");
  const local = JSON.parse(
    await (
      await host.getWorldGenerator()
    ).generateTerrainJson(JSON.stringify(request)),
  );
  const data = decodeTerrain(remote, map, request),
    other = decodeTerrain(local, map, request);
  const run = (response: any) => ({
    request: map,
    terrain: request,
    response,
    requestMs: 0,
    initMs: null,
  });
  const comparison = compareTerrains(run(data), run(other));
  if (
    !comparison.numericMatch ||
    !comparison.biomesMatch ||
    remote.coreBuildId !== local.coreBuildId
  )
    throw Error("Core mismatch");
  return {
    request,
    result: data.result,
    wireHash: await digest({
      result: remote.result,
      simulation: remote.simulation,
    }),
    localHash: await digest({
      result: local.result,
      simulation: local.simulation,
    }),
    comparison,
  };
}
export async function createView(
  data: Awaited<ReturnType<typeof fetchTerrain>>,
  id: string,
  width = 960,
  height = 720,
) {
  const canvas = document.createElement("canvas");
  canvas.id = id;
  document.body.append(canvas);
  const renderer = new T.WebGLRenderer({
    canvas,
    antialias: true,
    preserveDrawingBuffer: true,
  });
  renderer.setSize(width, height, false);
  renderer.setPixelRatio(1);
  const errors: string[] = [];
  renderer.debug.onShaderError = () => {
    errors.push("shader");
  };
  const surfaces = loadTerrainSurfaces(),
    micro = loadTerrainMicroNormals(),
    normal = loadOceanNormal();
  const [textures, normals, water] = await Promise.all([
    surfaces.ready,
    micro.ready,
    normal.ready,
  ]);
  const scene = new T.Scene(),
    map = data.request.heightMap,
    content = terrainScene(
      scene,
      renderer,
      map,
      data.result,
      textures,
      undefined,
      {
        seaLevel: data.request.seaLevel,
        normal: water,
        settings: DEFAULT_OCEAN_SETTINGS,
      },
      undefined,
      normals,
    );
  const finish = colorFinishing(renderer, DEFAULT_APPEARANCE),
    span = Math.max(map.width - 1, map.height - 1, map.heightMultiplier, 1);
  const camera = new T.PerspectiveCamera(
    45,
    width / height,
    span / 2000,
    span * 20,
  );
  let target = new T.Vector3(0, map.heightMultiplier * 0.35, 0),
    distance = span * 0.9;
  let waterCalls = 0;
  const waterMeshes = scene.children.filter(
    (x) => x.name === "inland-lake-v1" || x.name === "inland-river-v1",
  );
  for (const mesh of waterMeshes) {
    mesh.onBeforeRender = () => {
      waterCalls++;
    };
    const g = (mesh as T.Mesh).geometry,
      p = g.getAttribute("position");
    for (const attribute of Object.values(g.attributes))
      for (const value of attribute.array)
        if (!Number.isFinite(value)) throw Error("Nonfinite water geometry");
    if (g.index)
      for (const index of g.index.array)
        if (index >= p.count) throw Error("Water index overflow");
  }
  const stoneMeshes = scene.children.filter((m) =>
    m.name.startsWith("inland-shore-stones-v1:"),
  ) as T.InstancedMesh[];
  let stoneCalls = 0;
  for (const mesh of stoneMeshes) {
    mesh.onBeforeRender = () => {
      stoneCalls++;
    };
    for (const value of mesh.instanceMatrix.array)
      if (!Number.isFinite(value)) throw Error("nonfinite stone matrix");
  }
  function setStones(enabled: boolean) {
    for (const mesh of stoneMeshes) mesh.visible = enabled;
  }
  function measureStones(
    options: { hour?: number; mode?: string; bloom?: boolean } = {},
  ) {
    setStones(false);
    const offDraw = draw(options),
      off = pixels();
    setStones(true);
    const onDraw = draw(options),
      on = pixels();
    let changed = 0,
      difference = 0;
    for (let i = 0; i < off.length; i += 4) {
      const delta = Math.max(
        Math.abs(off[i] - on[i]),
        Math.abs(off[i + 1] - on[i + 1]),
        Math.abs(off[i + 2] - on[i + 2]),
      );
      if (delta > 1) changed++;
      difference +=
        Math.abs(off[i] - on[i]) +
        Math.abs(off[i + 1] - on[i + 1]) +
        Math.abs(off[i + 2] - on[i + 2]);
    }
    return {
      changed,
      difference,
      offCalls: offDraw.drawCalls,
      onCalls: onDraw.drawCalls,
      stoneCalls: onDraw.stoneCalls,
    };
  }
  const bankTerrain = scene.children.find((m) =>
    (m as T.Mesh).geometry?.getAttribute("bankWetness"),
  ) as T.Mesh;
  const wetAttribute = bankTerrain.geometry.getAttribute("bankWetness");
  const originalWet = wetAttribute.array.slice();
  function setWetness(enabled: boolean) {
    if (enabled) wetAttribute.array.set(originalWet);
    else wetAttribute.array.fill(0);
    wetAttribute.needsUpdate = true;
  }
  function pixels() {
    const gl = renderer.getContext(),
      size = renderer.getDrawingBufferSize(new T.Vector2());
    const bytes = new Uint8Array(size.x * size.y * 4);
    gl.readPixels(0, 0, size.x, size.y, gl.RGBA, gl.UNSIGNED_BYTE, bytes);
    return bytes;
  }
  function measureBanks() {
    setWetness(false);
    const offDraw = draw({ mode: "reference" }),
      off = pixels();
    setWetness(true);
    const onDraw = draw({ mode: "reference" }),
      on = pixels();
    const previousMaterial = bankTerrain.material,
      background = scene.background;
    const visible = scene.children.map((m) => m.visible);
    const mask = new T.ShaderMaterial({
      vertexShader:
        "attribute float bankWetness; varying float wet; void main(){wet=bankWetness; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}",
      fragmentShader:
        "varying float wet; void main(){if(wet<=0.0) discard; gl_FragColor=vec4(1.0,0.0,0.0,1.0);}",
    });
    let support: Uint8Array;
    try {
      for (const child of scene.children) child.visible = child === bankTerrain;
      scene.background = new T.Color(0);
      bankTerrain.material = mask;
      renderer.render(scene, camera);
      support = pixels();
    } finally {
      bankTerrain.material = previousMaterial;
      scene.background = background;
      scene.children.forEach((m, i) => (m.visible = visible[i]));
      mask.dispose();
    }
    const size = renderer.getDrawingBufferSize(new T.Vector2());
    let changed = 0,
      outsideChanged = 0,
      farPixels = 0;
    for (let y = 0; y < size.y; y++)
      for (let x = 0; x < size.x; x++) {
        const i = (y * size.x + x) * 4;
        let near = false;
        for (let dz = -2; dz <= 2 && !near; dz++)
          for (let dx = -2; dx <= 2; dx++) {
            const sx = x + dx,
              sy = y + dz;
            if (
              sx >= 0 &&
              sx < size.x &&
              sy >= 0 &&
              sy < size.y &&
              support[(sy * size.x + sx) * 4] > 0
            ) {
              near = true;
              break;
            }
          }
        const delta = Math.max(
          Math.abs(off[i] - on[i]),
          Math.abs(off[i + 1] - on[i + 1]),
          Math.abs(off[i + 2] - on[i + 2]),
        );
        if (delta > 1) {
          changed++;
          if (!near) outsideChanged++;
        }
        if (!near) farPixels++;
      }
    draw();
    return {
      changed,
      outsideChanged,
      farPixels,
      offCalls: offDraw.drawCalls,
      onCalls: onDraw.drawCalls,
      bytes: originalWet.byteLength,
      vertices: originalWet.length,
      wetVertices: Array.from(originalWet).filter((v) => v > 0).length,
    };
  }
  function focus(kind: string) {
    let cell = -1;
    distance = span * 0.9;
    if (kind === "stones" && stoneMeshes.length) {
      const mesh =
        stoneMeshes.find((m) => m.name.endsWith(":1")) ?? stoneMeshes[0];
      const matrix = new T.Matrix4(),
        p = new T.Vector3();
      let best = Infinity;
      for (let i = 0; i < mesh.count; i++) {
        mesh.getMatrixAt(i, matrix);
        p.setFromMatrixPosition(matrix);
        const score = p.x * p.x + p.z * p.z;
        if (score < best) {
          best = score;
          target.copy(p);
        }
      }
      distance = 5;
    } else if (kind === "lake" && data.result.lakes.basins.length) {
      let count = 0,
        x = 0,
        z = 0;
      const basin = data.result.lakes.basins.reduce((a, b) =>
        a.cellCount > b.cellCount ? a : b,
      );
      for (let i = 0; i < data.result.values.length; i++)
        if (data.result.lakes.lakeIdByCell[i] === basin.id) {
          count++;
          x += i % map.width;
          z += Math.floor(i / map.width);
        }
      target.set(
        x / count - (map.width - 1) / 2,
        basin.waterLevel,
        z / count - (map.height - 1) / 2,
      );
      distance = Math.max(9, Math.sqrt(count) * 2.8);
    } else if (kind === "river" || kind === "confluence") {
      const incoming = new Uint8Array(data.result.values.length),
        supported = new Uint8Array(data.result.values.length);
      data.result.rivers.cellIndices.forEach((i, k) => {
        if (data.result.channels.segmentState[k] === 1) {
          supported[i] = 1;
          const next = data.result.hydrology.receiverIndex[i];
          if (next >= 0) incoming[next]++;
        }
      });
      let best = Infinity;
      for (const i of data.result.rivers.cellIndices) {
        if (!supported[i] || (kind === "confluence" && incoming[i] < 2))
          continue;
        const d =
          ((i % map.width) - map.width / 2) ** 2 +
          (Math.floor(i / map.width) - map.height / 2) ** 2;
        if (d < best) {
          best = d;
          cell = i;
        }
      }
      if (cell >= 0) {
        target.set(
          (cell % map.width) - (map.width - 1) / 2,
          data.result.values[cell],
          Math.floor(cell / map.width) - (map.height - 1) / 2,
        );
        distance = 14;
      }
    } else target.set(0, map.heightMultiplier * 0.35, 0);
    camera.position.set(
      target.x + distance * 0.8,
      target.y + distance * 0.8,
      target.z + distance,
    );
    camera.lookAt(target);
    camera.updateMatrixWorld();
  }
  function draw(
    options: {
      hour?: number;
      mode?: string;
      bloom?: boolean;
      phase?: number;
      visible?: boolean;
    } = {},
  ) {
    content.updateEnvironment(
      deriveSceneEnvironment({
        timeOfDayHours: options.hour ?? 12,
        sunAzimuthDegrees: 315,
        visualTimeSeconds: 0,
      }),
    );
    finish.update({
      ...(options.mode === "reference"
        ? REFERENCE_APPEARANCE
        : DEFAULT_APPEARANCE),
      bloom: options.bloom ?? false,
    });
    for (const mesh of waterMeshes) mesh.visible = options.visible ?? true;
    content.updateTreeLod(camera.position);
    content.waterTime(options.phase ?? 7);
    waterCalls = 0;
    stoneCalls = 0;
    renderer.info.autoReset = false;
    renderer.info.reset();
    const warning = finish.render(scene, camera);
    if (warning) throw Error(warning);
    if (errors.length) throw Error(errors.join(","));
    return {
      stats: content.inlandStats,
      shoreStones: content.shoreStoneStats,
      stoneCalls,
      stoneShadowCasters: stoneMeshes.filter((m) => m.castShadow).length,
      drawCalls: renderer.info.render.calls,
      geometries: renderer.info.memory.geometries,
      hasWater: content.hasWater,
      hasOcean: content.hasOcean,
      camera: camera.position.toArray(),
      target: target.toArray(),
      waterMeshes: waterMeshes.length,
      waterCalls,
      waterShadowCasters: waterMeshes.filter((m) => m.castShadow).length,
    };
  }
  function measure(kind: "lake" | "river") {
    const chosen = waterMeshes.filter((m) => m.name === `inland-${kind}-v1`),
      gl = renderer.getContext();
    const pixels = () => {
      const size = renderer.getDrawingBufferSize(new T.Vector2()),
        bytes = new Uint8Array(size.x * size.y * 4);
      gl.readPixels(0, 0, size.x, size.y, gl.RGBA, gl.UNSIGNED_BYTE, bytes);
      return bytes;
    };
    draw({ mode: "reference", visible: false });
    const off = pixels();
    for (const m of chosen) m.visible = true;
    content.waterTime(7);
    finish.render(scene, camera);
    const on = pixels();
    let changed = 0;
    for (let i = 0; i < off.length; i += 4)
      if (
        Math.max(
          Math.abs(off[i] - on[i]),
          Math.abs(off[i + 1] - on[i + 1]),
          Math.abs(off[i + 2] - on[i + 2]),
        ) > 1
      )
        changed++;
    draw();
    return changed;
  }
  focus("map");
  return {
    draw,
    focus,
    pose: (position: number[], look: number[]) => {
      camera.position.fromArray(position);
      target.fromArray(look);
      camera.lookAt(target);
      camera.updateMatrixWorld();
    },
    measure,
    measureBanks,
    setWetness,
    setStones,
    measureStones,
    resize: (w: number, h: number) => {
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    },
    digest: () => digest(data.result),
    dispose: () => {
      content.dispose();
      finish.dispose();
      surfaces.dispose();
      micro.dispose();
      normal.dispose();
      const remaining = {
        geometries: renderer.info.memory.geometries,
        textures: renderer.info.memory.textures,
      };
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.remove();
      return remaining;
    },
  };
}

/** Isolated real Lambert shader checks; no production test switches. */
export async function verifyBankMaterials() {
  const { terrainGeometry } =
    await import("../../../src/client/src/app/terrain/rendering/terrain-geometry");
  const { terrainSurfaceMaterial } =
    await import("../../../src/client/src/app/terrain/rendering/terrain-surfaces");
  const renderer = new T.WebGLRenderer({
    antialias: false,
    preserveDrawingBuffer: true,
  });
  renderer.setSize(32, 32);
  renderer.toneMapping = T.NoToneMapping;
  const owner = loadTerrainSurfaces(),
    textures = await owner.ready;
  const scene = new T.Scene(),
    light = new T.AmbientLight(0xffffff, 1);
  scene.add(light);
  const camera = new T.PerspectiveCamera(45, 1, 0.01, 20);
  camera.position.set(0, 2, 0);
  camera.lookAt(0, 0, 0);
  const colors = [];
  try {
    for (let channel = 0; channel < 6; channel++) {
      const surfaceWeights = new Float32Array(20);
      for (let i = 0; i < 4; i++) {
        if (channel === 5) {
          surfaceWeights[i * 5 + 1] = 0.5;
          surfaceWeights[i * 5 + 4] = 0.5;
        } else surfaceWeights[i * 5 + channel] = 1;
      }
      const geometry = terrainGeometry({
        width: 2,
        height: 2,
        values: new Float32Array(4),
        biomes: new Uint8Array(4).fill(1),
        surfaceWeights,
      });
      const wet = new T.BufferAttribute(new Float32Array(4), 1);
      geometry.setAttribute("bankWetness", wet);
      const material = terrainSurfaceMaterial(textures, 2, 2),
        mesh = new T.Mesh(geometry, material);
      scene.add(mesh);
      const sample = () => {
        renderer.render(scene, camera);
        const gl = renderer.getContext(),
          p = new Uint8Array(4);
        gl.readPixels(16, 16, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, p);
        return Array.from(p).slice(0, 3);
      };
      try {
        const dry = sample();
        wet.array.fill(1);
        wet.needsUpdate = true;
        const damp = sample();
        light.intensity = 0;
        const dark = sample();
        light.intensity = 1;
        wet.array.fill(0);
        wet.needsUpdate = true;
        const reset = sample();
        colors.push({ channel, dry, damp, dark, reset });
      } finally {
        mesh.removeFromParent();
        geometry.dispose();
        material.dispose();
      }
    }
    return colors;
  } finally {
    owner.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
  }
}
