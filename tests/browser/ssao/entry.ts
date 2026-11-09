// Assessment-only entry. Bundled/served by ssao-assessment.cjs, never by Angular.
import "@angular/compiler";
import * as THREE from "three";
import { SSAOPass } from "three/addons/postprocessing/SSAOPass.js";
import { FullScreenQuad } from "three/addons/postprocessing/Pass.js";
import { terrainScene } from "../../../src/client/src/app/terrain/rendering/terrain-scene";
import { colorFinishing } from "../../../src/client/src/app/terrain/rendering/color-finishing";
import { DEFAULT_APPEARANCE } from "../../../src/client/src/app/terrain/rendering/appearance-settings.service";
import { loadTerrainSurfaces } from "../../../src/client/src/app/terrain/rendering/terrain-surfaces";
import { loadTerrainMicroNormals } from "../../../src/client/src/app/terrain/rendering/terrain-micro-normals";
import { loadOceanNormal } from "../../../src/client/src/app/terrain/rendering/ocean-normal";
import { DEFAULT_OCEAN_SETTINGS } from "../../../src/client/src/app/terrain/rendering/ocean-settings.service";
import {
  DEFAULT_ENVIRONMENT_SETTINGS,
  deriveSceneEnvironment,
} from "../../../src/client/src/app/terrain/rendering/scene-environment";
import {
  DEFAULT_MAP_PARAMETERS,
  DEFAULT_SIMULATION_PARAMETERS,
} from "../../../src/client/src/app/terrain/data/terrain-defaults";
import {
  decodeTerrain,
  compareTerrains,
} from "../../../src/client/src/app/terrain/data/terrain.contract";
import policy from "./policy.json";

const digest = async (value: unknown) =>
  [
    ...new Uint8Array(
      await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(JSON.stringify(value)),
      ),
    ),
  ]
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
export async function fetchTerrain(fields: Record<string, number>) {
  const heightMap = {
    ...DEFAULT_MAP_PARAMETERS,
    width: 129,
    height: 97,
    algorithmVersion: "value-noise-fbm-v1",
  };
  const request = {
    ...DEFAULT_SIMULATION_PARAMETERS,
    iterations: 16,
    heightMap,
    algorithmVersion: "diverse-landscape-v14",
  };
  for (const [key, value] of Object.entries(fields)) {
    if (key in heightMap) (heightMap as any)[key] = value;
    else (request as any)[key] = value;
  }
  const response = await fetch("/api/v1/terrains", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });
  if (!response.ok) throw Error("Assessment API request failed");
  const wire = await response.json(),
    remote = decodeTerrain(wire, heightMap, request as any);
  const host = await import(/* @vite-ignore */ "/wasm/world-generator-host.js");
  const localWire = JSON.parse(
    await (
      await host.getWorldGenerator()
    ).generateTerrainJson(JSON.stringify(request)),
  );
  const local = decodeTerrain(localWire, heightMap, request as any);
  const run = (response: any) => ({
    request: heightMap,
    terrain: request,
    response,
    requestMs: 0,
    initMs: null,
  });
  const comparison = compareTerrains(run(local) as any, run(remote) as any);
  if (!comparison.numericMatch)
    throw Error("Assessment Local/Remote results differ");
  return {
    request,
    result: remote.result,
    simulation: remote.simulation,
    comparison,
    remoteBuildId: wire.coreBuildId,
    localBuildId: localWire.coreBuildId,
    remoteHash: await digest({
      result: wire.result,
      simulation: wire.simulation,
    }),
    localHash: await digest({
      result: localWire.result,
      simulation: localWire.simulation,
    }),
  };
}
export function seededPass(
  scene: THREE.Scene,
  camera: THREE.PerspectiveCamera,
  width: number,
  height: number,
) {
  const previous = Math.random;
  let seed = policy.randomSeed;
  Math.random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  try {
    const pass = new SSAOPass(scene, camera, width, height, policy.samples);
    pass.kernelRadius = policy.radius;
    pass.minDistance = policy.biasWorld / (camera.far - camera.near);
    pass.maxDistance = policy.maxDistanceWorld / (camera.far - camera.near);
    pass.copyMaterial.fragmentShader = pass.copyMaterial.fragmentShader.replace(
      "gl_FragColor = opacity * texel;",
      `gl_FragColor = vec4(mix(vec3(1.0),texel.rgb,${policy.strength}),1.0);`,
    );
    return pass;
  } finally {
    Math.random = previous;
  }
}
export async function createView(
  data: Awaited<ReturnType<typeof fetchTerrain>>,
  id: string,
  width = 800,
  height = 600,
  contact = false,
) {
  const canvas = document.createElement("canvas");
  canvas.id = id;
  document.body.append(canvas);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(1);
  renderer.setSize(width, height, false);
  const gl = renderer.getContext() as WebGL2RenderingContext,
    debug = gl.getExtension("WEBGL_debug_renderer_info");
  const device = {
    renderer: debug
      ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL)
      : gl.getParameter(gl.RENDERER),
    vendor: debug
      ? gl.getParameter(debug.UNMASKED_VENDOR_WEBGL)
      : gl.getParameter(gl.VENDOR),
    timer: !!gl.getExtension("EXT_disjoint_timer_query_webgl2"),
    version: gl.getParameter(gl.VERSION),
  };
  const allocations = new Map<WebGLTexture, unknown>(),
    textureHooks: (() => void)[] = [];
  for (const name of ["texStorage2D", "texImage2D"] as const) {
    const original = gl[name].bind(gl) as (...args: any[]) => void;
    (gl as any)[name] = (...args: any[]) => {
      const format = args[name === "texStorage2D" ? 2 : 2],
        w = args[3],
        h = args[4];
      if (typeof w === "number")
        allocations.set(gl.getParameter(gl.TEXTURE_BINDING_2D), {
          format,
          width: w,
          height: h,
        });
      return original(...args);
    };
    textureHooks.push(() => {
      (gl as any)[name] = original;
    });
  }
  const fixtureMeshes: THREE.Mesh[] = [];
  const surfaces = loadTerrainSurfaces(),
    micro = loadTerrainMicroNormals(),
    normal = loadOceanNormal();
  const textures = await surfaces.ready,
    microTexture = await micro.ready,
    normalTexture = await normal.ready;
  const scene = new THREE.Scene(),
    map = data.request.heightMap;
  const content = terrainScene(
    scene,
    renderer,
    map as any,
    data.result,
    textures,
    undefined,
    {
      seaLevel: data.request.seaLevel,
      normal: normalTexture,
      settings: DEFAULT_OCEAN_SETTINGS,
    },
    undefined,
    microTexture,
  );
  const span = Math.max(map.width - 1, map.height - 1, map.heightMultiplier, 1),
    target = new THREE.Vector3(0, map.heightMultiplier / 2, 0);
  const camera = new THREE.PerspectiveCamera(
    45,
    width / height,
    span / 1000,
    span * 20,
  );
  const distance = span * 1.05 * Math.max(1, height / width);
  camera.position.set(distance, target.y + distance, distance);
  camera.lookAt(target);
  camera.updateMatrixWorld();
  if (contact) {
    for (const object of scene.children)
      if (object instanceof THREE.Mesh && object.name !== "atmosphere-v1")
        object.visible = false;
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(20, 20).rotateX(-Math.PI / 2),
      new THREE.MeshLambertMaterial({ color: 0xbdb9a9 }),
    );
    scene.add(ground);
    fixtureMeshes.push(ground);
    for (const [x, y, z, w, h, d] of [
      [0, 1, 0, 2, 2, 2],
      [2, 1.5, -1, 0.3, 3, 4],
    ]) {
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(w, h, d),
        new THREE.MeshLambertMaterial({ color: 0xbdb9a9 }),
      );
      mesh.position.set(x, y, z);
      scene.add(mesh);
      fixtureMeshes.push(mesh);
    }
    target.set(0, 0.5, 0);
    camera.position.set(5, 4, 6);
    camera.lookAt(target);
    camera.updateMatrixWorld();
  }
  const finish = colorFinishing(renderer, DEFAULT_APPEARANCE);
  const scale = Math.min(
    policy.scale,
    Math.sqrt(policy.maxPixels / (width * height)),
  );
  let aoWidth = Math.max(1, Math.floor(width * scale)),
    aoHeight = Math.max(1, Math.floor(height * scale));
  const dimensions = { width, height, aoWidth, aoHeight };
  const pass = seededPass(scene, camera, aoWidth, aoHeight);
  const grass = scene.getObjectByName("grass-presentation-v1") as
    THREE.Mesh | undefined;
  const ocean = scene.getObjectByName("ocean-presentation-v1") as
    THREE.Mesh | undefined;
  const sky = scene.getObjectByName("atmosphere-v1");
  let active = false,
    inAO = false,
    omitGrass = false,
    fail = false,
    aoCalls = 0,
    lastCpu = 0,
    disposed = false;
  const originalRender = renderer.render.bind(renderer);
  const calls: { type: string; instances: number; triangles: number }[] = [];
  const drawHooks: (() => void)[] = [];
  for (const method of [
    "drawElements",
    "drawArrays",
    "drawElementsInstanced",
    "drawArraysInstanced",
  ] as const) {
    const original = gl[method].bind(gl) as (...args: any[]) => void;
    (gl as any)[method] = (...args: any[]) => {
      calls.push({
        type: inAO ? "assessment" : "baseline",
        instances: method.endsWith("Instanced") ? args.at(-1) : 1,
        triangles: args[method.startsWith("drawArrays") ? 2 : 1] / 3,
      });
      original(...args);
    };
    drawHooks.push(() => {
      (gl as any)[method] = original;
    });
  }
  const canonical = () =>
    scene.children
      .filter(
        (o: any) => o.isInstancedMesh && o.name.startsWith("tree-lod-source"),
      )
      .map((o: any) => Array.from(o.instanceMatrix.array));
  const initialCanonical = await digest(canonical()),
    initialData = await digest({
      result: data.result,
      simulation: data.simulation,
    });
  renderer.render = ((object: any, cam: any) => {
    if (
      fail &&
      inAO &&
      object === scene &&
      scene.overrideMaterial === pass.normalMaterial
    )
      throw Error("Injected assessment failure");
    originalRender(object, cam);
    if (!active || inAO || object !== scene || scene.overrideMaterial) return;
    const savedTarget = renderer.getRenderTarget(),
      override = scene.overrideMaterial,
      auto = renderer.autoClear;
    const clear = renderer.getClearColor(new THREE.Color()),
      alpha = renderer.getClearAlpha();
    const visible: { object: THREE.Object3D; value: boolean }[] = [];
    scene.traverse((object) => visible.push({ object, value: object.visible }));
    try {
      inAO = true;
      if (sky) sky.visible = false;
      if (ocean) ocean.visible = false;
      if (omitGrass && grass) grass.visible = false;
      pass.render(renderer, null as any, savedTarget as any);
    } finally {
      for (const item of visible) item.object.visible = item.value;
      scene.overrideMaterial = override;
      renderer.autoClear = auto;
      renderer.setClearColor(clear, alpha);
      renderer.setRenderTarget(savedTarget);
      inAO = false;
    }
  }) as any;
  function render(enabled: boolean) {
    active = enabled;
    calls.length = 0;
    content.updateTreeLod(camera.position);
    content.waterTime(0);
    const started = performance.now();
    const warning = finish.render(scene, camera);
    lastCpu = performance.now() - started;
    if (warning) throw Error(warning);
    return {
      camera: {
        projection: camera.projectionMatrix.toArray(),
        world: camera.matrixWorld.toArray(),
      },
      calls: [...calls],
      cpuSubmissionMs: lastCpu,
    };
  }
  function floatPixels(target: THREE.WebGLRenderTarget) {
    const previous = renderer.getRenderTarget(),
      values = new Float32Array(target.width * target.height * 4);
    try {
      renderer.setRenderTarget(target);
      gl.readPixels(
        0,
        0,
        target.width,
        target.height,
        gl.RGBA,
        gl.FLOAT,
        values,
      );
      const error = gl.getError();
      if (error) throw Error("Assessment float readback GL error " + error);
      return values;
    } finally {
      renderer.setRenderTarget(previous);
    }
  }
  function diagnosticMask(kind: "background" | "water") {
    if (kind === "water" && (!ocean || !ocean.visible))
      return new Uint8Array(aoWidth * aoHeight * 4);
    const targetRT = new THREE.WebGLRenderTarget(aoWidth, aoHeight, {
      depthBuffer: false,
    });
    let material: THREE.Material | undefined, quad: FullScreenQuad | undefined;
    const states = scene.children.map((object) => ({
        object,
        visible: object.visible,
      })),
      override = scene.overrideMaterial,
      background = scene.background;
    const saved = renderer.getRenderTarget(),
      clear = renderer.getClearColor(new THREE.Color()),
      alpha = renderer.getClearAlpha();
    try {
      if (kind === "background") {
        material = new THREE.ShaderMaterial({
          uniforms: { tDepth: { value: pass.normalRenderTarget.depthTexture } },
          depthTest: false,
          depthWrite: false,
          vertexShader:
            "varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position,1.0);}",
          fragmentShader:
            "uniform sampler2D tDepth;varying vec2 vUv;void main(){gl_FragColor=vec4(vec3(step(.999999,texture2D(tDepth,vUv).r)),1.0);}",
        });
        quad = new FullScreenQuad(material);
        renderer.setRenderTarget(targetRT);
        quad.render(renderer);
      } else {
        material = new THREE.MeshBasicMaterial({ color: 0xffffff });
        scene.background = null;
        scene.overrideMaterial = material;
        for (const { object } of states) object.visible = object === ocean;
        renderer.setClearColor(0, 1);
        renderer.setRenderTarget(targetRT);
        renderer.clear();
        originalRender(scene, camera);
      }
      const pixels = new Uint8Array(aoWidth * aoHeight * 4);
      renderer.readRenderTargetPixels(
        targetRT,
        0,
        0,
        aoWidth,
        aoHeight,
        pixels,
      );
      return pixels;
    } finally {
      scene.background = background;
      scene.overrideMaterial = override;
      for (const s of states) s.object.visible = s.visible;
      renderer.setClearColor(clear, alpha);
      renderer.setRenderTarget(saved);
      targetRT.dispose();
      material?.dispose();
      // FullScreenQuad uses shared immutable geometry; do not dispose it while candidate lives.
    }
  }
  function metrics() {
    const raw = floatPixels(pass.ssaoRenderTarget),
      blur = floatPixels(pass.blurRenderTarget);
    const background = diagnosticMask("background"),
      water = diagnosticMask("water");
    let occluded = 0,
      backgroundPixels = 0,
      backgroundAffected = 0,
      waterPixels = 0,
      waterAffected = 0,
      min = 1,
      sum = 0;
    for (let i = 0; i < blur.length; i += 4) {
      const value = blur[i];
      if (!Number.isFinite(value) || value < 0 || value > 1.001)
        throw Error("Invalid SSAO output");
      min = Math.min(min, value);
      sum += value;
      if (value < 0.999) occluded++;
      if (background[i] > 127) {
        backgroundPixels++;
        if (value < 0.999) backgroundAffected++;
      }
      if (water[i] > 127) {
        waterPixels++;
        if (value < 0.999) waterAffected++;
      }
    }
    return {
      occluded,
      min,
      mean: sum / (aoWidth * aoHeight),
      backgroundPixels,
      backgroundAffected,
      waterPixels,
      waterAffected,
      raw: Array.from(raw.filter((_, i) => i % 4 === 0)),
      blur: Array.from(blur.filter((_, i) => i % 4 === 0)),
    };
  }
  const handle = (texture: THREE.Texture) =>
    (renderer.properties.get(texture) as any).__webglTexture as WebGLTexture;
  return {
    device,
    dimensions,
    canvas,
    render,
    metrics,
    setHour: (hour: number) =>
      content.updateEnvironment(
        deriveSceneEnvironment({
          ...DEFAULT_ENVIRONMENT_SETTINGS,
          timeOfDayHours: hour,
        }),
      ),
    setBloom: (value: boolean) =>
      finish.update({ ...DEFAULT_APPEARANCE, bloom: value }),
    setClose: () => {
      camera.position
        .copy(target)
        .addScaledVector(new THREE.Vector3(1, 1, 1).normalize(), span * 0.18);
      camera.lookAt(target);
      camera.updateMatrixWorld();
    },
    ambientZero: () => {
      for (const object of scene.children)
        if (object instanceof THREE.HemisphereLight) object.intensity = 0;
    },
    resize: (w: number, h: number) => {
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      const scale = Math.min(
        policy.scale,
        Math.sqrt(policy.maxPixels / (w * h)),
      );
      aoWidth = Math.max(1, Math.floor(w * scale));
      aoHeight = Math.max(1, Math.floor(h * scale));
      pass.setSize(aoWidth, aoHeight);
      Object.assign(dimensions, { width: w, height: h, aoWidth, aoHeight });
    },
    targets: () => [
      pass.normalRenderTarget,
      pass.ssaoRenderTarget,
      pass.blurRenderTarget,
    ],
    lodCounts: () => ({
      near: scene.children
        .filter((o) => o.name === "tree-lod-near-crown")
        .reduce((n, o: any) => n + (o.visible ? o.count : 0), 0),
      far: scene.children
        .filter((o) => o.name === "tree-lod-far-crown")
        .reduce((n, o: any) => n + (o.visible ? o.count : 0), 0),
    }),
    move: (dx: number) => {
      camera.position.x += dx;
      camera.lookAt(target);
      camera.updateMatrixWorld();
    },
    grassDiagnostic: () => {
      const before = floatPixels(pass.normalRenderTarget);
      omitGrass = true;
      try {
        render(true);
      } finally {
        omitGrass = false;
      }
      const after = floatPixels(pass.normalRenderTarget);
      let changed = 0;
      for (let i = 0; i < before.length; i += 4)
        if (
          before[i] !== after[i] ||
          before[i + 1] !== after[i + 1] ||
          before[i + 2] !== after[i + 2]
        )
          changed++;
      let minRootDistance = Infinity;
      if (grass) {
        const mesh = grass as THREE.InstancedMesh;
        for (let i = 0; i < mesh.count; i++) {
          const a = mesh.instanceMatrix.array;
          minRootDistance = Math.min(
            minRootDistance,
            Math.hypot(
              camera.position.x - a[i * 16 + 12],
              camera.position.y - a[i * 16 + 13],
              camera.position.z - a[i * 16 + 14],
            ),
          );
        }
      }
      return {
        minRootDistance,
        fullyFaded: minRootDistance >= 55,
        count: grass ? (grass as THREE.InstancedMesh).count : 0,
        normalPixelsChanged: changed,
        normalShaderHasGrassFade: pass.normalMaterial.onBeforeCompile
          .toString()
          .includes("grassFade"),
        cameraDistance: camera.position.distanceTo(target),
      };
    },
    failure: () => {
      fail = true;
      try {
        render(true);
        throw Error("Failure injection did not run");
      } catch (e) {
        if (!(e as Error).message.includes("Injected")) throw e;
      } finally {
        fail = false;
      }
      return {
        targetRestored: renderer.getRenderTarget() === null,
        overrideRestored: scene.overrideMaterial === null,
        visibilityRestored: (!sky || sky.visible) && (!ocean || ocean.visible),
        autoClearRestored: renderer.autoClear === true,
      };
    },
    snapshot: async () => ({
      dataHash: await digest({
        result: data.result,
        simulation: data.simulation,
      }),
      canonicalHash: await digest(canonical()),
      initialData,
      initialCanonical,
      sourceLayerExcluded: scene.children
        .filter((o) => o.name.startsWith("tree-lod-source"))
        .every((o) => !camera.layers.test(o.layers)),
      memory: {
        actualFormats: [
          pass.normalRenderTarget.texture,
          pass.normalRenderTarget.depthTexture!,
          pass.ssaoRenderTarget.texture,
          pass.blurRenderTarget.texture,
          pass.noiseTexture!,
        ].map((t) => allocations.get(handle(t))),
        normalType: pass.normalRenderTarget.texture.type,
        depthFormat: pass.normalRenderTarget.depthTexture!.format,
        depthType: pass.normalRenderTarget.depthTexture!.type,
        bytes: aoWidth * aoHeight * 28 + 64,
        targets: [
          pass.normalRenderTarget,
          pass.ssaoRenderTarget,
          pass.blurRenderTarget,
        ].map((t) => ({
          width: t.width,
          height: t.height,
          type: t.texture.type,
          samples: t.samples,
        })),
      },
    }),
    dispose: () => {
      if (disposed) return;
      disposed = true;
      const textures = [
        pass.normalRenderTarget.texture,
        pass.normalRenderTarget.depthTexture!,
        pass.ssaoRenderTarget.texture,
        pass.blurRenderTarget.texture,
        pass.noiseTexture!,
      ];
      const handles = textures.map(handle).filter(Boolean);
      pass.dispose();
      pass.ssaoMaterial.dispose();
      pass.noiseTexture!.dispose();
      const leaked = handles.filter((t) => gl.isTexture(t)).length;
      renderer.render = originalRender;
      finish.dispose();
      content.dispose();
      surfaces.dispose();
      normal.dispose();
      micro.dispose();
      for (const restore of [...drawHooks, ...textureHooks]) restore();
      for (const mesh of fixtureMeshes) {
        mesh.geometry.dispose();
        (mesh.material as THREE.Material).dispose();
      }
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.remove();
      return { leakedCandidateTextures: leaked };
    },
  };
}
