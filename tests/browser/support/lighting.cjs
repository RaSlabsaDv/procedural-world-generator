// Test-only WebGL instrumentation. No renderer/debug API is exposed by the application.
async function instrumentLighting(context) {
  await context.addInitScript(() => {
    window.__lightingContexts = [];
    const getContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (...args) {
      const gl = getContext.apply(this, args);
      if (!gl || args[0] !== "webgl2" || gl.__lightingMeasured) return gl;
      gl.__lightingMeasured = true;
      const state = {
        gl,
        textures: new Map(),
        framebuffers: new Map(),
        passes: [],
        framebufferIds: new WeakMap(),
        nextFramebufferId: 1,
      };
      window.__lightingContexts.push(state);
      const update = (info) => {
        const texture = gl.getParameter(gl.TEXTURE_BINDING_2D);
        if (texture)
          state.textures.set(texture, {
            ...state.textures.get(texture),
            ...info,
          });
      };
      const storage = gl.texStorage2D;
      gl.texStorage2D = function (target, levels, format, width, height) {
        if (target === gl.TEXTURE_2D) update({ levels, format, width, height });
        return storage.apply(this, arguments);
      };
      for (const name of ["texImage2D", "texSubImage2D"]) {
        const original = gl[name];
        gl[name] = function (...args) {
          if (args[0] === gl.TEXTURE_2D) {
            const image = args.at(-1);
            if (image?.src?.includes("/textures/terrain/"))
              update({ source: image.src.split("/").at(-1) });
            if (name === "texImage2D" && args.length === 9 && args[1] === 0)
              update({
                levels: 1,
                format: args[2],
                width: args[3],
                height: args[4],
              });
          }
          return original.apply(this, args);
        };
      }
      const attach = gl.framebufferTexture2D;
      gl.framebufferTexture2D = function (
        target,
        attachment,
        textarget,
        texture,
        level,
      ) {
        const framebuffer = gl.getParameter(gl.FRAMEBUFFER_BINDING);
        if (framebuffer && texture) {
          if (!state.framebufferIds.has(framebuffer))
            state.framebufferIds.set(framebuffer, state.nextFramebufferId++);
          const attachments = state.framebuffers.get(framebuffer) || new Map();
          attachments.set(attachment, texture);
          state.framebuffers.set(framebuffer, attachments);
        }
        return attach.apply(this, arguments);
      };
      const deleteTexture = gl.deleteTexture,
        deleteFramebuffer = gl.deleteFramebuffer;
      gl.deleteTexture = function (texture) {
        state.textures.delete(texture);
        return deleteTexture.call(this, texture);
      };
      gl.deleteFramebuffer = function (framebuffer) {
        state.framebuffers.delete(framebuffer);
        return deleteFramebuffer.call(this, framebuffer);
      };
      const target = () =>
        gl.getParameter(gl.FRAMEBUFFER_BINDING) ? "shadow" : "color";
      const clear = gl.clear;
      gl.clear = function (...args) {
        state.passes.push({
          target: target(),
          framebuffer:
            state.framebufferIds.get(gl.getParameter(gl.FRAMEBUFFER_BINDING)) ||
            0,
          calls: 0,
          terrainCalls: 0,
        });
        return clear.apply(this, args);
      };
      for (const name of [
        "drawElements",
        "drawArrays",
        "drawElementsInstanced",
        "drawArraysInstanced",
      ]) {
        const original = gl[name];
        gl[name] = function (...args) {
          if (!state.passes.length || state.passes.at(-1).target !== target())
            state.passes.push({
              target: target(),
              framebuffer:
                state.framebufferIds.get(
                  gl.getParameter(gl.FRAMEBUFFER_BINDING),
                ) || 0,
              calls: 0,
              terrainCalls: 0,
            });
          const pass = state.passes.at(-1);
          pass.calls++;
          if (!name.endsWith("Instanced")) pass.terrainCalls++;
          return original.apply(this, args);
        };
      }
      return gl;
    };
  });
}

async function lightingResources(page) {
  return page.evaluate(() =>
    window.__lightingContexts.map(
      ({ gl, textures, framebuffers, passes, framebufferIds }) => {
        const attachments = [];
        for (const [handle, framebuffer] of framebuffers)
          for (const [slot, texture] of framebuffer) {
            const image = textures.get(texture);
            if (!image) continue;
            const formats = {
              [gl.RGBA8]: "RGBA8",
              [gl.RGBA]: "RGBA",
              [gl.DEPTH_COMPONENT24]: "DEPTH_COMPONENT24",
              [gl.DEPTH_COMPONENT32F]: "DEPTH_COMPONENT32F",
              [gl.DEPTH_COMPONENT16]: "DEPTH_COMPONENT16",
            };
            // Depth24 has a conservative four-byte aligned storage estimate.
            const bytesPerTexel = image.format === gl.DEPTH_COMPONENT16 ? 2 : 4;
            attachments.push({
              slot: slot === gl.DEPTH_ATTACHMENT ? "depth" : "color",
              framebuffer: framebufferIds.get(handle),
              ...image,
              format: formats[image.format] || image.format,
              estimatedBytes: image.width * image.height * bytesPerTexel,
            });
          }
        return {
          lost: gl.isContextLost(),
          detailTextures: [...textures.values()].filter((t) => t.source).length,
          attachments,
          passes,
          activeShadowUpdates: passes.filter(
            (pass) =>
              pass.target === "shadow" &&
              attachments.some((a) => a.framebuffer === pass.framebuffer),
          ).length,
        };
      },
    ),
  );
}
module.exports = { instrumentLighting, lightingResources };
