import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { MeshTransmissionMaterial } from '@react-three/drei'
import * as THREE from 'three'

// Procedural amber-glass perfume bottle — a lathe-turned body (real
// silhouette, no .glb needed), a gold cap + collar, and an emissive SAM
// label that the selective Bloom pass picks up. Swap the lathe profile for
// useGLTF(yourBottle.glb) later with zero changes to the scene around it.

// half-silhouette profile (x = radius, y = height), revolved 360°
function bottleProfile(): THREE.Vector2[] {
  const p: THREE.Vector2[] = []
  p.push(new THREE.Vector2(0.0, -1.35)) // base center
  p.push(new THREE.Vector2(0.62, -1.35)) // base edge
  p.push(new THREE.Vector2(0.7, -1.2))
  p.push(new THREE.Vector2(0.7, 0.35)) // straight flask body
  p.push(new THREE.Vector2(0.66, 0.7)) // shoulder start
  p.push(new THREE.Vector2(0.42, 1.0)) // shoulder curve
  p.push(new THREE.Vector2(0.16, 1.12)) // neck base
  p.push(new THREE.Vector2(0.16, 1.4)) // neck
  p.push(new THREE.Vector2(0.2, 1.42)) // lip
  p.push(new THREE.Vector2(0.2, 1.46))
  p.push(new THREE.Vector2(0.0, 1.46)) // close top
  return p
}

export default function GlassBottle({ mobile = false }: { mobile?: boolean }) {
  const group = useRef<THREE.Group>(null)
  const bodyGeo = useMemo(() => new THREE.LatheGeometry(bottleProfile(), 64), [])
  const capGeo = useMemo(() => new THREE.CylinderGeometry(0.22, 0.24, 0.34, 48), [])
  const liquidGeo = useMemo(() => {
    // slightly inset body, filled to ~70% — a warmer amber core inside the glass
    const prof = bottleProfile()
      .filter((v) => v.y <= 0.45)
      .map((v) => new THREE.Vector2(Math.max(0, v.x - 0.06), v.y))
    prof.push(new THREE.Vector2(0, 0.45))
    return new THREE.LatheGeometry(prof, 48)
  }, [])

  // Signature mechanic B — damped mouse-parallax tilt. Refs only, no
  // setState per frame (react-three-fiber golden rule).
  useFrame((state, delta) => {
    if (!group.current) return
    const px = state.pointer.x
    const py = state.pointer.y
    group.current.rotation.y = THREE.MathUtils.damp(group.current.rotation.y, px * 0.5, 4, delta)
    group.current.rotation.x = THREE.MathUtils.damp(group.current.rotation.x, -py * 0.18, 4, delta)
    // gentle idle drift so it never feels frozen when the cursor is still
    group.current.position.y = Math.sin(state.clock.elapsedTime * 0.6) * 0.04
  })

  return (
    <group ref={group} rotation={[0, -0.35, 0]}>
      {/* amber liquid core */}
      <mesh geometry={liquidGeo}>
        <meshPhysicalMaterial
          color="#8a4a1c"
          roughness={0.25}
          transmission={0.6}
          thickness={1.2}
          ior={1.33}
          attenuationColor="#e0913f"
          attenuationDistance={0.6}
        />
      </mesh>

      {/* glass body — the killer feature */}
      <mesh geometry={bodyGeo}>
        <MeshTransmissionMaterial
          transmission={1}
          thickness={0.9}
          roughness={0.05}
          ior={1.5}
          chromaticAberration={0.03}
          anisotropy={0.1}
          distortion={0.2}
          distortionScale={0.3}
          temporalDistortion={0.1}
          color="#f0c489"
          attenuationColor="#c98a3a"
          attenuationDistance={2.4}
          samples={mobile ? 4 : 8}
          resolution={mobile ? 256 : 512}
          background={new THREE.Color('#171009')}
        />
      </mesh>

      {/* gold collar under the cap */}
      <mesh position={[0, 1.2, 0]}>
        <cylinderGeometry args={[0.18, 0.18, 0.14, 48]} />
        <meshStandardMaterial color="#d3a05a" metalness={1} roughness={0.28} envMapIntensity={1.3} />
      </mesh>

      {/* gold cap */}
      <mesh geometry={capGeo} position={[0, 1.62, 0]}>
        <meshStandardMaterial color="#e6b56a" metalness={1} roughness={0.22} envMapIntensity={1.4} />
      </mesh>

      {/* emissive gold signature band around the flask — the selective
          Bloom target (a 3D font would need a fetched typeface). */}
      <mesh position={[0, -0.15, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.71, 0.02, 16, 96]} />
        <meshStandardMaterial color="#f4ead9" emissive="#d3a05a" emissiveIntensity={2.2} toneMapped={false} />
      </mesh>
    </group>
  )
}
