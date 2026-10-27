// WebGL2 renderer: draws the camera frame / photo, then each nail with the selected polish.
import { COPY_VS, COPY_FS, NAIL_VS, NAIL_FS } from './shaders.js'
import { hexToLinear, isHex, mixHex } from '../lib/color.js'
import { FINISH_BY_KEY, SHAPE_BY_KEY, TYPE_BY_KEY } from '../../../data/nails/taxonomy.js'

/** Preview the look under different light (partial von-Kries adaptation, linear RGB multipliers). */
export const LIGHT_PRESETS = {
  salon: [1, 1, 1],
  daylight: [0.96, 1.0, 1.08],
  evening: [1.0, 0.84, 0.7],
}

const ART_CODE = { none: 0, french: 1, microfrench: 2, ombre: 3, chrometip: 4, halfmoon: 5 }

function compile(gl, type, src) {
  const sh = gl.createShader(type)
  gl.shaderSource(sh, src)
  gl.compileShader(sh)
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh)
    gl.deleteShader(sh)
    throw new Error('Shader compile failed: ' + log)
  }
  return sh
}

function program(gl, vs, fs) {
  const p = gl.createProgram()
  gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, vs))
  gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fs))
  gl.linkProgram(p)
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('Program link failed: ' + gl.getProgramInfoLog(p))
  const uniforms = {}
  const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS)
  for (let i = 0; i < n; i++) {
    const info = gl.getActiveUniform(p, i)
    uniforms[info.name] = gl.getUniformLocation(p, info.name)
  }
  return { p, u: uniforms }
}

export function webgl2Supported() {
  try {
    const c = document.createElement('canvas')
    return !!c.getContext('webgl2')
  } catch {
    return false
  }
}

/** Resolve the look (color, finish, art, shape) for one finger from the design. */
export function resolveLook(design, finger) {
  const per = design.perFinger?.[finger]
  const base = per && per.hex ? per : design.base
  const finishKey = (per && per.hex ? per.finish : design.base.finish) || 'creme'
  const finish = FINISH_BY_KEY[finishKey] || FINISH_BY_KEY.creme
  const type = TYPE_BY_KEY[design.type] || TYPE_BY_KEY.gel
  const shape = SHAPE_BY_KEY[design.shape] || SHAPE_BY_KEY.natural
  const hex = isHex(base.hex) ? base.hex : '#B5121B'
  let hex2 = isHex(base.hex2) ? base.hex2 : null
  if (!hex2) {
    if (finish.mode === 3) hex2 = mixHex(hex, '#FFFFFF', 0.55)
    else if (finish.mode === 4) hex2 = mixHex(hex, '#7FD3FF', 0.6)
    else if (finish.mode === 5) hex2 = mixHex(hex, '#FFFFFF', 0.35)
    else hex2 = hex
  }
  return {
    hex,
    hex2,
    finish,
    type,
    shape,
    art: design.art || 'none',
    artHex: isHex(design.artHex) ? design.artHex : '#FBFBFA',
    length: typeof design.length === 'number' ? design.length : 0,
  }
}

export class NailRenderer {
  constructor(canvas) {
    this.canvas = canvas
    const gl = canvas.getContext('webgl2', {
      premultipliedAlpha: false,
      alpha: false,
      antialias: false,
      preserveDrawingBuffer: false,
      powerPreference: 'high-performance',
    })
    if (!gl) throw new Error('WEBGL2_UNSUPPORTED')
    this.gl = gl
    this.copy = program(gl, COPY_VS, COPY_FS)
    this.nail = program(gl, NAIL_VS, NAIL_FS)

    this.quad = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quad)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW)
    this.copyVao = gl.createVertexArray()
    gl.bindVertexArray(this.copyVao)
    const locC = gl.getAttribLocation(this.copy.p, 'aPos')
    gl.enableVertexAttribArray(locC)
    gl.vertexAttribPointer(locC, 2, gl.FLOAT, false, 0, 0)

    this.nailBuf = gl.createBuffer()
    this.nailVao = gl.createVertexArray()
    gl.bindVertexArray(this.nailVao)
    gl.bindBuffer(gl.ARRAY_BUFFER, this.nailBuf)
    gl.bufferData(gl.ARRAY_BUFFER, 8 * 4, gl.DYNAMIC_DRAW)
    const locN = gl.getAttribLocation(this.nail.p, 'aLocal')
    gl.enableVertexAttribArray(locN)
    gl.vertexAttribPointer(locN, 2, gl.FLOAT, false, 0, 0)
    gl.bindVertexArray(null)

    this.tex = gl.createTexture()
    gl.bindTexture(gl.TEXTURE_2D, this.tex)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false)
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false)
    // nail mask texture (RG8: coverage, nail id) — 1×1 empty until an AI Perfect Fit mask arrives
    this.maskTex = gl.createTexture()
    gl.bindTexture(gl.TEXTURE_2D, this.maskTex)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RG8, 1, 1, 0, gl.RG, gl.UNSIGNED_BYTE, new Uint8Array([0, 0]))
    this.maskW = 1
    this.maskH = 1
    this.hasMask = false
    this.w = 0
    this.h = 0
    this.lost = false
    canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault()
      this.lost = true
    })
  }

  /** Pixel mask for the current photo: data = Uint8Array(w*h*2) [coverage, nailId] per pixel. */
  setMask(data, w, h) {
    const gl = this.gl
    gl.bindTexture(gl.TEXTURE_2D, this.maskTex)
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RG8, w, h, 0, gl.RG, gl.UNSIGNED_BYTE, data)
    this.maskW = w
    this.maskH = h
    this.hasMask = true
  }

  clearMask() {
    this.hasMask = false
  }

  /** Upload the current camera frame / photo. Call once per frame for video. */
  upload(source, w, h) {
    const gl = this.gl
    if (this.lost || !w || !h) return false
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w
      this.canvas.height = h
    }
    this.w = w
    this.h = h
    gl.bindTexture(gl.TEXTURE_2D, this.tex)
    try {
      if (this.texW !== w || this.texH !== h) {
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.SRGB8_ALPHA8, gl.RGBA, gl.UNSIGNED_BYTE, source)
        this.texW = w
        this.texH = h
      } else {
        gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, source)
      }
    } catch (e) {
      return false
    }
    gl.generateMipmap(gl.TEXTURE_2D)
    this.maxLod = Math.floor(Math.log2(Math.max(w, h)))
    return true
  }

  /**
   * Draw the frame and the nails.
   * @param nails  [{key, finger, cx, cy, ux, uy, len, wid, alpha}]
   * @param design current design (see features/tryon/design.js)
   * @param opts   {time, tilt:[x,y], exposure, illum:[r,g,b], lightDir:[x,y,z], showOriginal, showEdges, lookFor(finger,nail)}
   */
  render(nails, design, opts = {}) {
    const gl = this.gl
    if (this.lost || !this.w) return
    gl.viewport(0, 0, this.w, this.h)
    gl.disable(gl.BLEND)
    gl.useProgram(this.copy.p)
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, this.tex)
    gl.uniform1i(this.copy.u.uSrc, 0)
    const tint = opts.tint || [1, 1, 1]
    gl.uniform3f(this.copy.u.uTint, tint[0], tint[1], tint[2])
    gl.bindVertexArray(this.copyVao)
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
    if (opts.showOriginal || !nails || !nails.length || !design) return

    gl.enable(gl.BLEND)
    gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ZERO, gl.ONE)
    const P = this.nail
    gl.useProgram(P.p)
    gl.bindVertexArray(this.nailVao)
    gl.bindBuffer(gl.ARRAY_BUFFER, this.nailBuf)
    const u = P.u
    gl.uniform1i(u.uSrc, 0)
    gl.activeTexture(gl.TEXTURE1)
    gl.bindTexture(gl.TEXTURE_2D, this.maskTex)
    gl.uniform1i(u.uMask, 1)
    gl.uniform2f(u.uMaskSize, this.maskW, this.maskH)
    gl.activeTexture(gl.TEXTURE0)
    gl.uniform1f(u.uAutoExposure, opts.autoExposure ?? 0.6)
    const cast = opts.cast || [1, 1, 1]
    gl.uniform3f(u.uCast, cast[0], cast[1], cast[2])
    gl.uniform1f(u.uSat, opts.sat ?? 1)
    gl.uniform2f(u.uRes, this.w, this.h)
    gl.uniform1f(u.uTime, (opts.time || 0) / 1000)
    gl.uniform2f(u.uTilt, opts.tilt?.[0] || 0, opts.tilt?.[1] || 0)
    gl.uniform1f(u.uExposure, opts.exposure ?? 1)
    const il = opts.illum || [1, 1, 1]
    gl.uniform3f(u.uIllum, il[0], il[1], il[2])
    const ld = opts.lightDir || [-0.35, -0.6, 0.72]
    gl.uniform3f(u.uLightDir, ld[0], ld[1], ld[2])
    gl.uniform1f(u.uFrameLod, this.maxLod)
    gl.uniform1f(u.uShowEdges, opts.showEdges ? 1 : 0)
    gl.uniform3f(u.uTint, tint[0], tint[1], tint[2])

    for (const n of nails) {
      if (!n || n.alpha <= 0.01 || n.len < 2 || n.wid < 2) continue
      const look = opts.lookFor ? opts.lookFor(n.finger, n) : resolveLook(design, n.finger)
      if (!look) continue
      const shape = look.shape
      const minExt = shape.minLen || 0
      const extFrac = Math.max(look.length, minExt)
      const ext = extFrac * n.len * 0.95
      const cutX = n.cx - n.ux * n.len * 0.5
      const cutY = n.cy - n.uy * n.len * 0.5
      const halfW = n.wid * 0.5 * 1.15 + 2
      const top = n.len + ext + 3
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, new Float32Array([-halfW, -3, halfW, -3, -halfW, top, halfW, top]))
      gl.uniform2f(u.uCuticle, cutX, cutY)
      gl.uniform2f(u.uAxis, n.ux, n.uy)
      gl.uniform2f(u.uCenterUv, n.cx / this.w, n.cy / this.h)
      gl.uniform1f(u.uLen, n.len)
      gl.uniform1f(u.uExt, ext)
      gl.uniform1f(u.uWid, n.wid)
      gl.uniform1f(u.uTipRound, shape.tipRound)
      gl.uniform1f(u.uTaper, shape.taper)
      gl.uniform1f(u.uPoint, shape.point)
      gl.uniform1f(u.uCoffin, shape.coffin)
      const c1 = hexToLinear(look.hex)
      const c2 = hexToLinear(look.hex2)
      const ca = hexToLinear(look.artHex)
      gl.uniform3f(u.uColor, c1[0], c1[1], c1[2])
      gl.uniform3f(u.uColor2, c2[0], c2[1], c2[2])
      gl.uniform3f(u.uArtColor, ca[0], ca[1], ca[2])
      gl.uniform1i(u.uArt, ART_CODE[look.art] ?? 0)
      const f = look.finish
      const t = look.type
      gl.uniform1f(u.uOpacity, f.opacity)
      gl.uniform1f(u.uGloss, Math.min(1, Math.max(0, f.gloss + (f.gloss > 0 ? t.glossBoost : 0))))
      gl.uniform1f(u.uRough, f.rough)
      gl.uniform1f(u.uMetal, f.metal)
      gl.uniform1f(u.uSparkle, f.sparkle)
      gl.uniform1f(u.uFlake, f.flake)
      gl.uniform1f(u.uIrid, f.irid)
      gl.uniform1i(u.uMode, f.mode)
      gl.uniform1f(u.uApex, t.apex)
      gl.uniform1f(u.uAlpha, Math.min(1, n.alpha))
      gl.uniform1i(u.uMaskId, this.hasMask && n.maskId ? n.maskId : 0)
      gl.uniform1f(u.uNailL, n.nailL || 0)
      gl.uniform1f(u.uSeed, seedOf(n.key))
      gl.uniform1f(u.uMeanLod, Math.max(0, Math.log2(Math.max(n.wid, 2) * 1.1)))
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
    }
    gl.disable(gl.BLEND)
    gl.bindVertexArray(null)
  }

  /** Render + read back in the same task (works without preserveDrawingBuffer). */
  capture(nails, design, opts = {}, type = 'image/jpeg', quality = 0.92) {
    this.render(nails, design, opts)
    return this.canvas.toDataURL(type, quality)
  }

  dispose() {
    const gl = this.gl
    gl.deleteTexture(this.tex)
    gl.deleteTexture(this.maskTex)
    gl.deleteBuffer(this.quad)
    gl.deleteBuffer(this.nailBuf)
    gl.deleteProgram(this.copy.p)
    gl.deleteProgram(this.nail.p)
    gl.getExtension('WEBGL_lose_context')?.loseContext()
  }
}

function seedOf(key) {
  let h = 2166136261
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return ((h >>> 0) % 1000) / 1000
}
