import { Suspense, useState } from 'react'
import { Canvas } from '@react-three/fiber'
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
import { useI18n } from '../lib/i18n'

const isTouch = typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches
const reducedMotion =
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

// Custom studio rig — Lightformers give the exact soft-box reflections on
// the glass that a flat Environment can't. This is the pro "don't ship flat
// glass" move from the skill's Tier-4 lighting.
function StudioRig() {
  return (
    <Environment resolution={256}>
      <group>
        <Lightformer intensity={2.2} position={[0, 3, 2]} scale={[6, 3, 1]} color="#fff4e2" />
        <Lightformer intensity={1.4} position={[-3, 1, 1]} scale={[3, 4, 1]} color="#dba876" />
        <Lightformer intensity={1.1} position={[3, 0, 1]} scale={[3, 4, 1]} color="#c98a3a" />
        <Lightformer intensity={2} position={[0, -2, 3]} scale={[4, 2, 1]} color="#f4ead9" />
      </group>
    </Environment>
  )
}

export default function HeroScene() {
  const { t } = useI18n()
  // AdaptiveDpr + PerformanceMonitor = the mobile insurance policy: drop
  // resolution automatically if frames sag, so it never janks.
  const [dpr, setDpr] = useState<number>(isTouch ? 1.4 : 2)

  return (
    <div className="relative mx-auto h-[340px] w-full max-w-[440px] sm:h-[420px] md:h-[480px]">
      <Canvas
        dpr={[1, dpr]}
        shadows
        gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping, alpha: true }}
        camera={{ fov: 34, position: [0, 0.4, 5.2] }}
      >
        <PerformanceMonitor
          onDecline={() => setDpr(1)}
          onIncline={() => setDpr(isTouch ? 1.4 : 2)}
        />

        {/* explicit key + rim so the glass silhouette reads even where the
            environment contribution is weak */}
        <directionalLight position={[4, 6, 4]} intensity={2.2} color="#fff2df" castShadow />
        <directionalLight position={[-5, 2, -3]} intensity={1.4} color="#d3a05a" />
        <ambientLight intensity={0.35} />

        <Suspense fallback={null}>
          <Float
            enabled={!reducedMotion}
            speed={1.1}
            rotationIntensity={reducedMotion ? 0 : 0.25}
            floatIntensity={reducedMotion ? 0 : 0.5}
            floatingRange={[-0.06, 0.06]}
          >
            <GlassBottle mobile={isTouch} />
          </Float>

          <ContactShadows
            position={[0, -1.42, 0]}
            scale={7}
            blur={2.6}
            far={4}
            opacity={0.55}
            color="#171009"
          />

          {!reducedMotion && (
            <Sparkles count={isTouch ? 24 : 46} scale={[5, 5, 3]} size={2.2} speed={0.3} color="#e8c88f" opacity={0.5} />
          )}

          <StudioRig />
        </Suspense>

        {/* One–two effects, never more. Bloom lifts the emissive label;
            vignette + subtle grain is the "shot on film" finish. Bloom off
            on touch to protect frame budget. */}
        {!isTouch && (
          <EffectComposer enableNormalPass={false}>
            <Bloom luminanceThreshold={1} mipmapBlur intensity={0.8} radius={0.6} />
            <Vignette eskil={false} offset={0.25} darkness={0.55} />
          </EffectComposer>
        )}

        <AdaptiveDpr pixelated={false} />
      </Canvas>

      {/* accessible label for the canvas */}
      <span className="sr-only">{t.hero.titleAccent}</span>
    </div>
  )
}
