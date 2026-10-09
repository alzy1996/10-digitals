/**
 * Storm sky (DESIGN-GLASS.md 5.2): one full-screen pass drawn first, behind the model. Procedural, no image files.
 *
 * - A cloud texture is generated once (1024 x 512; 512 x 256 looked smeared on phone screens): value-noise fbm with
 *   a domain warp, sampled on a cylinder so it wraps around in x. R = cloud density, G = a soft edge term (lit by the
 *   glow). Every sky frame then costs one or two texture fetches.
 * - Map views: screen space, exactly the CSS backdrop of DESIGN-GLASS 2.1 (so there is no colour jump when the engine
 *   appears; the clouds are the only difference); clouds and glow slide sideways with the camera heading, like a dome.
 * - Walk view: a view-direction dome (horizon band at eye level, the warm glow low in the west-south-west), seen
 *   through the atrium skylight, the entrance glass and the far ends of corridors. `uDome` cross-fades the two
 *   during the dive into (and the rise out of) the Walk view.
 * Colour maths runs in sRGB, like the CSS gradients, so there is no colour step when the engine appears; a small
 * dither keeps 8-bit screens free of banding.
 */
import { BufferAttribute, BufferGeometry, LinearFilter, Matrix4, Mesh, RepeatWrapping, Scene, ShaderMaterial, Vector3, Vector4, WebGLRenderTarget } from 'three'
import { THEMES } from './palette.js'

const VERT = /* glsl */ `
varying vec2 vNdc;
void main(){
vNdc=position.xy;
gl_Position=vec4(position.xy,1.0,1.0);
}
`

const CLOUD_FRAG = /* glsl */ `
varying vec2 vNdc;
float h3(vec3 p){
p=fract(p*0.3183099+0.1)*17.0;
return fract(p.x*p.y*p.z*(p.x+p.y+p.z));
}
float n3(vec3 x){
vec3 i=floor(x);
vec3 f=fract(x);
f=f*f*(3.0-2.0*f);
return mix(mix(mix(h3(i),h3(i+vec3(1,0,0)),f.x),mix(h3(i+vec3(0,1,0)),h3(i+vec3(1,1,0)),f.x),f.y),
mix(mix(h3(i+vec3(0,0,1)),h3(i+vec3(1,0,1)),f.x),mix(h3(i+vec3(0,1,1)),h3(i+1.0),f.x),f.y),f.z);
}
float fbm(vec3 p){
float a=0.5;
float s=0.0;
for(int i=0;i<5;i++){
s+=a*n3(p);
p=p*2.03+vec3(1.7,9.2,3.1);
a*=0.5;
}
return s;
}
void main(){
vec2 uv=vNdc*0.5+0.5;
float t=uv.x*6.2831853;
vec3 p=vec3(cos(t)*2.2,sin(t)*2.2,uv.y*15.0);
vec3 q=vec3(fbm(p),fbm(p+vec3(5.2,1.3,2.8)),fbm(p+vec3(2.1,7.7,4.4)));
float d=smoothstep(0.4,0.74,fbm(p+1.3*q));
gl_FragColor=vec4(d,d*(1.0-d)*4.0,0.0,1.0);
}
`

// Map views: exactly the CSS backdrop of DESIGN-GLASS 2.1 (linear gradient, a haze radial, the glow radial, composited
// premultiplied in that order, as browsers do) plus the clouds. Walk view: the dome formula of DESIGN-GLASS 5.2.
const SKY_FRAG = /* glsl */ `
uniform sampler2D uClouds;
uniform vec3 uTop,uMid,uHor,uLow,uGlow,uCore,uCD,uCL,uCLit;
uniform vec4 uG0,uG1,uCss;
uniform float uAmt,uHead,uAspect,uDome;
uniform mat4 uInvPV;
varying vec2 vNdc;
vec3 grad(float v){
return v<0.55?mix(uLow,uHor,v/0.55):v<0.78?mix(uHor,uMid,(v-0.55)/0.23):mix(uMid,uTop,(v-0.78)/0.22);
}
vec3 clouds(vec3 col,float v,float g,vec2 cuv){
vec4 cl=texture2D(uClouds,cuv);
vec3 cc=mix(uCD,uCL,cl.r)+uCLit*g*(cl.g*1.5+cl.r*0.35);
return mix(col,cc,cl.r*uAmt*smoothstep(0.25,0.6,v));
}
void main(){
vec2 uv=vNdc*0.5+0.5;
vec3 c=vec3(0.0);
if(uDome<0.999){
c=grad(uv.y);
c=mix(c,vec3(0.494,0.549,0.596),uCss.w*max(0.0,1.0-length((uv-vec2(0.18,0.88))/vec2(0.9,0.5))/0.7));
float t=length((uv-vec2(uCss.x+0.08*sin(uHead),0.58))/vec2(0.7,0.38));
vec4 g=t<uCss.y?mix(uG0,uG1,t/uCss.y):mix(uG1,vec4(0.0),clamp((t-uCss.y)/(uCss.z-uCss.y),0.0,1.0));
c=c*(1.0-g.a)+g.rgb;
c=clouds(c,uv.y,g.a/uG0.a,vec2(uv.x*uAspect*0.55+uHead/6.2831853,uv.y*0.9+0.05));
}
if(uDome>0.001){
vec4 wp=uInvPV*vec4(vNdc,1.0,1.0);
vec3 dir=normalize(wp.xyz/wp.w-cameraPosition);
float el=asin(clamp(dir.y,-1.0,1.0));
float az=atan(dir.x,-dir.z);
float v=clamp(0.55+el/1.2,0.0,1.0);
vec2 d=vec2((mod(az-4.3633+3.1415927,6.2831853)-3.1415927)/0.8727,(el-0.0349)/0.1571);
float d2=dot(d,d);
float g=exp(-1.6*d2);
vec3 col=grad(v)+uGlow*g*0.55+uCore*exp(-14.0*d2)*0.35;
c=mix(c,clouds(col,v,g,vec2(az/2.0943951,v*0.9+0.05)),uDome);
}
c+=(fract(sin(dot(gl_FragCoord.xy,vec2(12.9898,78.233)))*43758.5453)-0.5)/255.0;
gl_FragColor=vec4(c,1.0);
}
`

/**
 * The CSS backdrop's radial glow per palette (DESIGN-GLASS 2.1): premultiplied stop colours at 0 and at `t1`, the end
 * stop (transparent) at `t2`, the centre x, and the haze radial's alpha.
 */
const CSS_GLOW = {
  storm: { g0: [255, 159, 85, 0.5], g1: [214, 112, 60, 0.22], cx: 0.64, t1: 0.34, t2: 0.72, haze: 0.3 },
  stormBasement: { g0: [90, 169, 255, 0.22], g1: [90, 169, 255, 0.11], cx: 0.6, t1: 0.35, t2: 0.7, haze: 0 },
}
const premul = ([r, g, b, a], out) => out.set((r / 255) * a, (g / 255) * a, (b / 255) * a, a)

/** sRGB components of a #RRGGBB colour (no colour management: the sky is composed in sRGB, like CSS). */
function srgb(hex, out = new Vector3()) {
  const n = parseInt(hex.slice(1), 16)
  return out.set(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255)
}

function fullScreenMesh(material) {
  const g = new BufferGeometry()
  g.setAttribute('position', new BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3))
  const m = new Mesh(g, material)
  m.frustumCulled = false
  return m
}

const COLOR_KEYS = { uTop: 'skyTop', uMid: 'skyMid', uHor: 'skyHorizon', uLow: 'skyLow', uGlow: 'glow', uCore: 'glowCore', uCD: 'cloudDark', uCL: 'cloudLight', uCLit: 'cloudLit' }

export class SkyLayer {
  constructor() {
    const uniforms = { uClouds: { value: null }, uAmt: { value: 0.55 }, uHead: { value: 0 }, uAspect: { value: 0.5 }, uDome: { value: 0 }, uInvPV: { value: new Matrix4() }, uG0: { value: new Vector4() }, uG1: { value: new Vector4() }, uCss: { value: new Vector4() } }
    for (const k of Object.keys(COLOR_KEYS)) uniforms[k] = { value: new Vector3() }
    this.material = new ShaderMaterial({ vertexShader: VERT, fragmentShader: SKY_FRAG, uniforms, depthTest: false, depthWrite: false })
    this.mesh = fullScreenMesh(this.material)
    this.mesh.renderOrder = -1000
    this.mesh.name = 'sky'
    this.target = null
  }

  /** @param {string} palette a THEMES table name */
  setPalette(palette) {
    const T = THEMES[palette]
    // classic has no sky (the CSS backdrop shows through a transparent canvas): keep the last colours
    if (!T?.skyTop) return
    const u = this.material.uniforms
    for (const [k, key] of Object.entries(COLOR_KEYS)) srgb(T[key], u[k].value)
    u.uAmt.value = T.cloudAmt
    const c = CSS_GLOW[palette] ?? CSS_GLOW.storm
    premul(c.g0, u.uG0.value)
    premul(c.g1, u.uG1.value)
    u.uCss.value.set(c.cx, c.t1, c.t2, c.haze)
  }

  /**
   * Per frame: camera heading (radians, compass), aspect, the dome mix (0 = map views, 1 = Walk view) and the camera.
   * Generates the cloud texture on first use.
   * @param {import('three').WebGLRenderer} renderer
   * @param {import('three').PerspectiveCamera} camera
   */
  update(renderer, camera, headingRad, aspect, dome) {
    if (!this.target) {
      this.target = new WebGLRenderTarget(1024, 512, { wrapS: RepeatWrapping, minFilter: LinearFilter, magFilter: LinearFilter, depthBuffer: false, generateMipmaps: false })
      const gen = fullScreenMesh(new ShaderMaterial({ vertexShader: VERT, fragmentShader: CLOUD_FRAG, depthTest: false, depthWrite: false }))
      const scene = new Scene()
      scene.add(gen)
      const prev = renderer.getRenderTarget()
      renderer.setRenderTarget(this.target)
      renderer.render(scene, camera)
      renderer.setRenderTarget(prev)
      gen.geometry.dispose()
      gen.material.dispose()
      this.material.uniforms.uClouds.value = this.target.texture
    }
    const u = this.material.uniforms
    u.uHead.value = headingRad
    u.uAspect.value = aspect
    u.uDome.value = dome
    if (dome > 0.001) u.uInvPV.value.multiplyMatrices(camera.matrixWorld, camera.projectionMatrixInverse)
  }

  /** Draw the clouds again on the next update (after a WebGL context loss and restore). */
  invalidate() {
    this.target?.dispose()
    this.target = null
  }

  dispose() {
    this.invalidate()
    this.mesh.geometry.dispose()
    this.material.dispose()
  }
}
