/**
 * v0.4 real-style post-processing (DESIGN-REAL.md 5): the scene and the marker pass (depth cleared, as the direct
 * path's second pass) into a 4x MSAA half-float target, a soft bloom on HDR values only (lamps, sign letters, screens:
 * threshold 1.25), then Khronos PBR Neutral tone mapping, which leaves colours under ~0.76 untouched, so meaning colours
 * (route, markers, accent lines) keep their exact hues. Showcase quality only; everything else renders directly.
 */
import { HalfFloatType, NeutralToneMapping, Vector2, WebGLRenderTarget } from 'three'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'

/**
 * @param {import('three').WebGLRenderer} renderer
 * @returns {{ render(scene: any, markerScene: any, camera: any): void, setSize(w: number, h: number, dpr: number): void, dispose(): void }}
 */
export function createPost(renderer) {
  const rt = new WebGLRenderTarget(4, 4, { type: HalfFloatType, samples: 4 })
  const composer = new EffectComposer(renderer, rt)
  const scenePass = new RenderPass(null, null)
  const markerPass = new RenderPass(null, null)
  markerPass.clear = false
  markerPass.clearDepth = true
  const bloom = new UnrealBloomPass(new Vector2(256, 256), 0.3, 0.35, 2.0)
  composer.addPass(scenePass)
  composer.addPass(markerPass)
  composer.addPass(bloom)
  composer.addPass(new OutputPass())
  return {
    render(scene, markerScene, camera) {
      const tm = renderer.toneMapping
      const ex = renderer.toneMappingExposure
      renderer.toneMapping = NeutralToneMapping
      renderer.toneMappingExposure = 1.15
      scenePass.scene = scene
      scenePass.camera = camera
      markerPass.scene = markerScene
      markerPass.camera = camera
      composer.render()
      renderer.toneMapping = tm
      renderer.toneMappingExposure = ex
    },
    setSize(w, h, dpr) {
      composer.setPixelRatio(dpr)
      composer.setSize(w, h)
      // bloom at half resolution (cheaper on phones; it is a soft glow anyway)
      bloom.resolution.set(Math.max(1, (w * dpr) / 2), Math.max(1, (h * dpr) / 2))
    },
    dispose() {
      composer.dispose()
      rt.dispose()
    },
  }
}
