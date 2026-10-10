import { Suspense, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import {
  ContactShadows,
  Environment,
  Lightformer,
  Float,
  Sparkles,
  AdaptiveDpr,
  PerformanceMonitor,
} from '@react-three/drei'
import { EffectComposer, Bloom, Vignette } from '@react-three/postprocessing'
import * as THREE from 'three'
import GlassBottle from './GlassBottle'
import { markLoaded } from '../lib/loadProgress'
import { probeGpu } from '../lib/gpu'

const isTouch = typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches
const reducedMotion =
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

const CAMERA_Z = 5.2

// Photography-studio rig: top softbox, two edge strips for the long glass
// highlights, a warm ring behind the bottle. Never ship transmission glass
// lit by a flat environment.
function StudioRig() {
  return (
    <Environment resolution={256}>
      <group rotation={[-Math.PI / 3, 0, 0]}>
        <Lightformer intensity={3.2} position={[0, 5, -9]} scale={[10, 10, 1]} color="#fff4e2" />
        <Lightformer intensity={1.8} position={[-5, 1, -1]} rotation-y={Math.PI / 2} scale={[20, 0.5, 1]} color="#f4ead9" />
        <Lightformer intensity={1.8} position={[5, 1, -1]} rotation-y={-Math.PI / 2} scale={[20, 0.5, 1]} color="#f4ead9" />
        <Lightformer form="ring" color="#e8a33d" intensity={5} position={[0, 1, -4]} scale={2} />
      </group>
    </Environment>
  )
}

// Places the bottle for the viewport: beside the headline on wide screens
// (mirrored for Arabic), centred above it on portrait phones.
function Stage({ side, children }: { side: 1 | -1; children: ReactNode }) {
  const { viewport } = useThree()
  const wide = viewport.aspect >= 1
  // The default camera looks at the origin, so y=0 is screen centre.
  // wide: cap ~15% from the top, base ~76%; portrait: in the band between
  // the nav and the headline block.
  const x = wide ? side * Math.min(viewport.width * 0.22, 2.2) : 0
  const y = wide ? 0 : 0.3
  const scale = wide ? 0.62 : Math.min(0.5, viewport.width / 2.8)
  return (
    <group position={[x, y, 0]} scale={scale}>
      {children}
    </group>
  )
}

// 3D Ken Burns: the camera starts pulled back and settles in once the
// preloader curtain lifts.
function CameraIntro({ ready }: { ready: boolean }) {
  useFrame((state, delta) => {
    const goal = ready || reducedMotion ? CAMERA_Z : CAMERA_Z * 1.14
    state.camera.position.z = THREE.MathUtils.damp(state.camera.position.z, goal, 1.8, delta)
  })
  return null
}

// Reports to the preloader once real frames (shaders compiled) are drawn.
function FirstFrames() {
  const frames = useRef(0)
  useFrame(() => {
    if (++frames.current === 3) markLoaded('frame')
  })
  return null
}

const MAX_DPR = isTouch ? 1.5 : 1.75
// ?hq forces the full tier (lets a software-GPU test browser verify it)
const forceHigh = typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('hq')

// software rasterisers never compile the transmission shader
const softwareGPU = !forceHigh && probeGpu() === 'software'

export default function HeroScene({ side, ready }: { side: 1 | -1; ready: boolean }) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(true)
  const [dpr, setDpr] = useState<number>(softwareGPU ? 1 : MAX_DPR)
  // Quality tier: full transmission glass + bloom, or a cheap glossy
  // glass for software renderers and devices that can't hold frame rate.
  const [low, setLow] = useState(softwareGPU)

  useEffect(() => markLoaded('scene'), [])

  // Pause the render loop while the hero is scrolled away — transmission
  // glass and bloom shouldn't burn battery under the collection grid.
  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const io = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), {
      rootMargin: '80px',
    })
    io.observe(el)
    return () => io.disconnect()
  }, [])

  return (
    <div ref={wrapRef} className="absolute inset-0">
      <Canvas
        frameloop={visible ? 'always' : 'never'}
        dpr={[1, dpr]}
        gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping, alpha: true }}
        camera={{ fov: 34, position: [0, 0.4, CAMERA_Z * 1.14] }}
      >
        <PerformanceMonitor
          onDecline={() => {
            setDpr(1)
            if (!forceHigh) setLow(true)
          }}
          onIncline={() => setDpr(MAX_DPR)}
        />
        <CameraIntro ready={ready} />

        <directionalLight position={[4, 6, 4]} intensity={2} color="#fff2df" />
        <directionalLight position={[-5, 2, -3]} intensity={1.3} color="#d3a05a" />
        <ambientLight intensity={0.3} />

        <Suspense fallback={null}>
          <Stage side={side}>
            <Float
              enabled={!reducedMotion}
              speed={1.1}
              rotationIntensity={0.2}
              floatIntensity={0.45}
              floatingRange={[-0.06, 0.06]}
            >
              <GlassBottle touch={isTouch} reducedMotion={reducedMotion} lowQuality={low} />
            </Float>
            <ContactShadows position={[0, -1.42, 0]} scale={6} blur={2.6} far={4} opacity={0.55} color="#0d0905" />
          </Stage>

          {!reducedMotion && (
            <Sparkles count={isTouch ? 26 : 60} scale={[9, 5, 4]} size={2} speed={0.28} color="#e8c88f" opacity={0.45} />
          )}

          <StudioRig />
          <FirstFrames />
        </Suspense>

        {!isTouch && !low && (
          <EffectComposer enableNormalPass={false}>
            <Bloom luminanceThreshold={1} mipmapBlur intensity={0.8} radius={0.6} />
            <Vignette eskil={false} offset={0.3} darkness={0.6} />
          </EffectComposer>
        )}

        <AdaptiveDpr pixelated={false} />
      </Canvas>
    </div>
  )
}
