// WebGL2 renderer for color, techniques, light, regrowth and the hijab zone. One draw < 50 ms.
import fragSrc from './recolor.frag?raw';

const VERT = `#version 300 es
in vec2 aPos;
out vec2 vUv;
void main() {
  vUv = vec2(aPos.x * 0.5 + 0.5, 0.5 - aPos.y * 0.5);
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

function compile(gl, type, src) {
  const sh = gl.createShader(type);
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh);
    gl.deleteShader(sh);
    throw new Error(`shader: ${log}`);
  }
  return sh;
}

export function webgl2Available() {
  try {
    const c = document.createElement('canvas');
    return Boolean(c.getContext('webgl2'));
  } catch {
    return false;
  }
}

const IDENTITY3 = new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]);
const ZERO_AUX = new Uint8Array([0, 0, 0, 0]);

/**
 * @param {HTMLCanvasElement} canvas
 */
export function createRenderer(canvas) {
  const gl = canvas.getContext('webgl2', { preserveDrawingBuffer: true, premultipliedAlpha: false, antialias: false });
  if (!gl) throw new Error('webgl2-unavailable');
  const prog = gl.createProgram();
  gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, VERT));
  gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, fragSrc));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(`link: ${gl.getProgramInfoLog(prog)}`);
  gl.useProgram(prog);

  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, 'aPos');
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

  const U = {};
  const n = gl.getProgramParameter(prog, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < n; i += 1) {
    const info = gl.getActiveUniform(prog, i);
    U[info.name] = gl.getUniformLocation(prog, info.name);
  }

  const textures = {};
  const units = { uSrc: 0, uAux1: 1, uAux2: 2, uAux3: 3, uAux4: 4 };
  function tex(name) {
    if (!textures[name]) {
      const t = gl.createTexture();
      gl.activeTexture(gl.TEXTURE0 + units[name]);
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, ZERO_AUX);
      textures[name] = t;
      gl.uniform1i(U[name], units[name]);
    }
    gl.activeTexture(gl.TEXTURE0 + units[name]);
    gl.bindTexture(gl.TEXTURE_2D, textures[name]);
    return textures[name];
  }
  Object.keys(units).forEach(tex);

  let size = { w: 1, h: 1 };

  function setSource(source, w, h) {
    tex('uSrc');
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    if (source instanceof Uint8Array || source instanceof Uint8ClampedArray) {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(source.buffer, source.byteOffset, source.byteLength));
    } else {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, source);
    }
    size = { w, h };
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
  }

  function setAux(name, data, w, h) {
    tex(name);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
  }

  function setAuxAll(aux) {
    setAux('uAux1', aux.aux1, aux.width, aux.height);
    if (aux.aux2) setAux('uAux2', aux.aux2, aux.width, aux.height);
    if (aux.aux3) setAux('uAux3', aux.aux3, aux.width, aux.height);
    if (aux.aux4) setAux('uAux4', aux.aux4, aux.width, aux.height);
  }

  /**
   * @param {object} p see techniques.js / lightSwitch.js / finishes.js
   */
  function draw(p) {
    gl.viewport(0, 0, size.w, size.h);
    gl.useProgram(prog);
    gl.bindVertexArray(vao);
    Object.keys(units).forEach(tex);
    gl.uniform1i(U.uTech, p.tech ?? 0);
    gl.uniform1f(U.uStart, p.start ?? 0);
    gl.uniform1f(U.uDensity, p.density ?? 1);
    gl.uniform1f(U.uSoftness, p.softness ?? 0.3);
    gl.uniform3fv(U.uTarget, p.target || [30, 5, 10]);
    gl.uniform3fv(U.uTarget2, p.target2 || p.target || [30, 5, 10]);
    gl.uniform3fv(U.uTarget3, p.target3 || p.target || [30, 5, 10]);
    gl.uniform3fv(U.uFoilEnds, p.foilEnds || p.target || [30, 5, 10]);
    gl.uniform1f(U.uHairMeanL, p.hairMeanL ?? 30);
    gl.uniform1f(U.uMaxCm, p.maxCm ?? 40);
    gl.uniform1f(U.uPartX, p.partX ?? 0.5);
    gl.uniform1f(U.uRegrowthCm, p.regrowthCm ?? 0);
    gl.uniform1f(U.uRegrowthSoft, p.regrowthSoft ?? 0.2);
    gl.uniform1f(U.uFinishSpec, p.finish?.spec ?? 1);
    gl.uniform1f(U.uFinishTight, p.finish?.tight ?? 1);
    gl.uniform3fv(U.uFinishTint, p.finish?.tint || [1, 1, 1]);
    gl.uniformMatrix3fv(U.uLight, false, p.light?.matrix || IDENTITY3);
    gl.uniform1f(U.uContrast, p.light?.contrast ?? 1);
    gl.uniform1f(U.uLightSpec, p.light?.spec ?? 1);
    gl.uniform1f(U.uHijab, p.hijab ? 1 : 0);
    gl.uniform1f(U.uShowMask, p.showMask ?? 0);
    gl.uniform1f(U.uAmount, p.amount ?? 1);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  function readPixels() {
    const out = new Uint8Array(size.w * size.h * 4);
    gl.readPixels(0, 0, size.w, size.h, gl.RGBA, gl.UNSIGNED_BYTE, out);
    // WebGL rows are bottom-up
    const row = size.w * 4;
    const flipped = new Uint8ClampedArray(out.length);
    for (let y = 0; y < size.h; y += 1) flipped.set(out.subarray((size.h - 1 - y) * row, (size.h - y) * row), y * row);
    return { width: size.w, height: size.h, data: flipped };
  }

  function dispose() {
    Object.values(textures).forEach((t) => gl.deleteTexture(t));
    gl.deleteBuffer(buf);
    gl.deleteProgram(prog);
    gl.getExtension('WEBGL_lose_context')?.loseContext();
  }

  return { gl, setSource, setAux, setAuxAll, draw, readPixels, dispose, get size() { return size; } };
}
