/**
 * Target ring at the next turn (DESIGN-GLASS.md 5.8, refs 3 + 4): a ring with a fine grid (two inner rings, eight
 * spokes) and a soft halo on the floor, a thin light beam up to 2.2 m (the Walk view's turn bubble sits on its top),
 * and, only while the walk plays, one ripple growing out of the centre every 1.6 s. Depth-tested (walls hide it),
 * drawn after the route. Teal for a turn or connector, mint for the arrival.
 */
import { Color, DoubleSide, Group, Mesh, PlaneGeometry, ShaderMaterial } from 'three'
import { themeColor } from './palette.js'

const VERT = /* glsl */ `
varying vec2 vUv;
void main(){
vUv=uv;
gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);
}
`

const RING_FRAG = /* glsl */ `
uniform vec3 uC,uH;
uniform float uRip,uRipOn;
varying vec2 vUv;
float ring(float r,float c,float w,float aa){
return 1.0-smoothstep(w*0.5-aa,w*0.5+aa,abs(r-c));
}
void main(){
vec2 p=(vUv-0.5)*3.2;
float r=length(p);
float aa=fwidth(r)+1e-4;
float a=max(ring(r,1.1,0.08,aa),0.45*max(ring(r,0.35,0.03,aa),ring(r,0.7,0.03,aa)));
float sp=abs(fract(atan(p.y,p.x)/0.7853982+0.5)-0.5)*0.7853982*r;
if(r>0.35&&r<1.1)a=max(a,0.35*(1.0-smoothstep(0.01-aa,0.01+aa,sp)));
if(uRipOn>0.5)a=max(a,0.6*(1.0-uRip)*ring(r,mix(0.35,1.6,uRip),0.05,aa));
float h=r>1.1&&r<1.6?0.25*(1.6-r)/0.5:0.0;
float oa=a+h*(1.0-a);
if(oa<0.003)discard;
gl_FragColor=vec4((uC*a+uH*h*(1.0-a))/oa,oa);
#include <colorspace_fragment>
}
`

const BEAM_FRAG = /* glsl */ `
uniform vec3 uC;
varying vec2 vUv;
void main(){
float edge=1.0-abs(vUv.x-0.5)*2.0;
gl_FragColor=vec4(uC,0.9*(1.0-vUv.y)*smoothstep(0.0,0.6,edge));
#include <colorspace_fragment>
}
`

export class TargetRing {
  constructor() {
    this.root = new Group()
    this.root.name = 'target-ring'
    this.root.visible = false
    const mat = (frag, uniforms) => new ShaderMaterial({ vertexShader: VERT, fragmentShader: frag, uniforms, transparent: true, depthWrite: false, side: DoubleSide })
    this.ringMat = mat(RING_FRAG, { uC: { value: new Color() }, uH: { value: new Color() }, uRip: { value: 0 }, uRipOn: { value: 0 } })
    this.beamMat = mat(BEAM_FRAG, { uC: { value: new Color() } })
    const rg = new PlaneGeometry(3.2, 3.2)
    rg.rotateX(-Math.PI / 2)
    this.ring = new Mesh(rg, this.ringMat)
    const bg = new PlaneGeometry(0.06, 2.2)
    bg.translate(0, 1.1, 0)
    this.beam = new Mesh(bg, this.beamMat)
    this.ring.renderOrder = 7
    this.beam.renderOrder = 7
    this.root.add(this.ring, this.beam)
    /** @type {{ levelId: string, x: number, y: number, kind: string } | null} */
    this.target = null
    this.palette = 'storm'
  }

  /** @param {{ levelId: string, x: number, y: number, kind?: string } | null} t */
  set(t) {
    this.target = t ? { levelId: t.levelId, x: t.x, y: t.y, kind: t.kind ?? 'turn' } : null
    this.setPalette(this.palette)
  }

  setPalette(palette) {
    this.palette = palette
    const arrive = this.target?.kind === 'arrive'
    this.ringMat.uniforms.uC.value.copy(themeColor(palette, arrive ? 'dest' : 'turnRing'))
    this.ringMat.uniforms.uH.value.copy(themeColor(palette, arrive ? 'dest' : 'routeGlow'))
    this.beamMat.uniforms.uC.value.copy(themeColor(palette, arrive ? 'dest' : 'routeRim'))
  }

  /**
   * Place it for this frame.
   * @param {{ shown: boolean, y: number, scale: number, camera: import('three').Camera, ripple: number|null }} f
   *   ripple: phase 0..1 while the walk plays, null = no ripple
   */
  layout(f) {
    const t = this.target
    this.root.visible = Boolean(t && f.shown)
    if (!this.root.visible) return
    this.root.position.set(t.x, f.y + 0.04, -t.y)
    this.root.scale.setScalar(f.scale)
    // the beam turns to face the camera (a vertical strip)
    this.beam.rotation.y = Math.atan2(f.camera.position.x - t.x, f.camera.position.z + t.y)
    this.ringMat.uniforms.uRipOn.value = f.ripple == null ? 0 : 1
    this.ringMat.uniforms.uRip.value = f.ripple ?? 0
  }

  dispose() {
    this.ring.geometry.dispose()
    this.beam.geometry.dispose()
    this.ringMat.dispose()
    this.beamMat.dispose()
  }
}
