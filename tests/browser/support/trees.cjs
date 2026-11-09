// Test-only inspection of actual crown color/matrix and static caster GPU buffers.
async function instrumentTrees(context) {
  await context.addInitScript(() => {
    window.__treeViews = [];
    const get = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (...args) {
      const gl = get.apply(this, args);
      if (!gl || args[0] !== "webgl2" || gl.__trees) return gl;
      gl.__trees = true;
      const row = {
        gl,
        colors: new Set(),
        matrices: new Set(),
        frame: [],
        shadows: [],
        calls: 0,
        uploads: 0,
        sourceUploads: 0,
      };
      window.__treeViews.push(row);
      function attribute(program, name) {
        const location = gl.getAttribLocation(program, name);
        const buffer = gl.getVertexAttrib(
          location,
          gl.VERTEX_ATTRIB_ARRAY_BUFFER_BINDING,
        );
        const old = gl.getParameter(gl.ARRAY_BUFFER_BINDING);
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        const bytes = gl.getBufferParameter(gl.ARRAY_BUFFER, gl.BUFFER_SIZE);
        gl.bindBuffer(gl.ARRAY_BUFFER, old);
        return { buffer, bytes };
      }
      const clear = gl.clear;
      gl.clear = function (...args) {
        if (!gl.getParameter(gl.FRAMEBUFFER_BINDING)) {
          row.frame = [];
          row.calls = 0;
        }
        return clear.apply(this, args);
      };
      for (const method of ["bufferData", "bufferSubData"]) {
        const original = gl[method];
        gl[method] = function (...args) {
          row.uploads++;
          if (
            row.shadows.some(
              (s) =>
                s.matrix.buffer === gl.getParameter(gl.ARRAY_BUFFER_BINDING),
            )
          )
            row.sourceUploads++;
          return original.apply(this, args);
        };
      }
      for (const method of [
        "drawElements",
        "drawArrays",
        "drawElementsInstanced",
        "drawArraysInstanced",
      ]) {
        const draw = gl[method];
        gl[method] = function (...args) {
          const program = gl.getParameter(gl.CURRENT_PROGRAM),
            instanced = method.endsWith("Instanced");
          if (!gl.getParameter(gl.FRAMEBUFFER_BINDING)) {
            row.calls++;
            if (
              instanced &&
              gl.getAttribLocation(program, "instanceColor") >= 0 &&
              gl.getUniformLocation(program, "grassFadeNear") === null
            ) {
              const matrix = attribute(program, "instanceMatrix"),
                color = attribute(program, "instanceColor");
              row.colors.add(color.buffer);
              row.matrices.add(matrix.buffer);
              const triangles =
                args[method.startsWith("drawArrays") ? 2 : 1] / 3;
              row.frame.push({
                matrix,
                color,
                count: args.at(-1),
                triangles,
                level: triangles <= 8 ? "far" : "near",
                diffuse: Array.from(
                  gl.getUniform(
                    program,
                    gl.getUniformLocation(program, "diffuse"),
                  ),
                ),
              });
            }
          } else if (
            instanced &&
            gl.getAttribLocation(program, "instanceMatrix") >= 0
          ) {
            const matrix = attribute(program, "instanceMatrix");
            if (!row.shadows.some((s) => s.matrix.buffer === matrix.buffer))
              row.shadows.push({ matrix, count: args.at(-1) });
          }
          return draw.apply(this, args);
        };
      }
      return gl;
    };
  });
}
async function treeState(page) {
  return page.evaluate(async () => {
    const out = [];
    for (const row of window.__treeViews.filter((r) => !r.gl.isContextLost())) {
      const gl = row.gl;
      async function read(info, count) {
        const previous = gl.getParameter(gl.ARRAY_BUFFER_BINDING);
        gl.bindBuffer(gl.ARRAY_BUFFER, info.buffer);
        const data = new Float32Array(count);
        gl.getBufferSubData(gl.ARRAY_BUFFER, 0, data);
        gl.bindBuffer(gl.ARRAY_BUFFER, previous);
        const hash = [
          ...new Uint8Array(await crypto.subtle.digest("SHA-256", data)),
        ]
          .map((x) => x.toString(16).padStart(2, "0"))
          .join("");
        return { bytes: info.bytes, hash, finite: data.every(Number.isFinite) };
      }
      const groups = [];
      for (const g of row.frame)
        groups.push({
          ...g,
          matrix: await read(g.matrix, g.count * 16),
          color: await read(g.color, g.count * 3),
        });
      const shadows = [];
      for (const s of row.shadows.filter((s) => gl.isBuffer(s.matrix.buffer)))
        shadows.push(await read(s.matrix, s.count * 16));
      out.push({
        groups,
        shadows,
        uploads: row.uploads,
        sourceUploads: row.sourceUploads,
        calls: row.calls,
        liveColors: [...row.colors].filter((b) => gl.isBuffer(b)).length,
        liveMatrices: [...row.matrices].filter((b) => gl.isBuffer(b)).length,
      });
    }
    return out;
  });
}
module.exports = { instrumentTrees, treeState };
