// One throwaway WebGL context, probed once and cached, decides the hero's
// tier before anything heavy mounts:
//   none     → no canvas, CSS bottle (and the 3D chunk is never fetched)
//   software → glossy low-cost glass (SwiftShader / llvmpipe rasterisers)
//   hardware → full transmission glass + bloom
// R3F creates its context asynchronously, so a failure there can't be
// caught by an error boundary — hence probing up front.
export type GpuTier = 'none' | 'software' | 'hardware'

let cached: GpuTier | null = null

export function probeGpu(): GpuTier {
  if (cached) return cached
  cached = 'none'
  try {
    const c = document.createElement('canvas')
    const ctx = (c.getContext('webgl2') ?? c.getContext('webgl')) as WebGLRenderingContext | null
    if (ctx) {
      const info = ctx.getExtension('WEBGL_debug_renderer_info')
      const name = String(info ? ctx.getParameter(info.UNMASKED_RENDERER_WEBGL) : ctx.getParameter(ctx.RENDERER))
      cached = /swiftshader|llvmpipe|software|basic render/i.test(name) ? 'software' : 'hardware'
      ctx.getExtension('WEBGL_lose_context')?.loseContext()
    }
  } catch {
    cached = 'none'
  }
  return cached
}
