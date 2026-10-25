// three.js beard scene shared by the live AR renderer and Photo Studio.
//
// Scene convention (src/ai/mesh/faceMesh.js): units are pixels of the frame the
// landmarks were detected on, y up, an orthographic camera spanning the frame (or a
// crop of it for thumbnails). Draw order, with no depth test against the photo:
//   1. background   video / photo quad (AR only; Studio composites over the photo)
//   2. depth        the face mesh into the depth buffer only
//   3. shell        the beard below the jaw, depth-tested against the face, hidden on
//                   the far side of the head where the segmenter sees neck or clothes
//   4. face         the face mesh with the beard texture (alpha blended)
//   5. overlay      Outline mode tints and target lines (face and shell)
//
// Shading transfer: when the photo (Studio) or the video frame (AR) is bound with
// setPhoto, the hair takes the photo's own local shading (smile creases, the chin
// highlight, the shadow under the jaw) as the ratio of a lightly blurred to a
// heavily blurred luminance. Only local contrast transfers, so the darker albedo of
// a beard the customer already has does not darken the new one.
//
// Lighting (layer 4 of PRD 7.1): diffuse = face normal . light direction (estimated
// from left/right cheek brightness), an ambient term, the per-texel occlusion from
// the texture, and an anisotropic sheen along the strand tangent for oiled / balm /
// waxed finishes. Shading is normalised to 1 for a surface facing the camera, so the
// mid-tone stays on the chosen swatch.

import * as THREE from 'three';
import { buildFaceGeometry, updateFaceGeometry, jawContourFromGeometry, jawNormals2D, extrudeBelowJaw } from '../mesh/faceMesh.js';
import { JAW_CONTOUR, FOREHEAD_TOP, CHIN_BOTTOM } from '../mesh/zones.js';
import { OCC_RANGE } from './beardTextures.js';
import { JAW_U } from './layout.js';

const SHELL_ROWS = 12;
/** Shell columns per jaw segment: narrow quads keep the strand texture free of seams. */
const SHELL_SUB = 3;

const VERT = /* glsl */ `
  uniform float uMirror;
  uniform vec2 uFrame;
  uniform float uVScale;
  attribute float aFar;
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec2 vImg;
  varying float vFar;
  void main() {
    vUv = vec2(uv.x, uv.y * uVScale);
    vNormal = normal;
    vFar = aFar;
    float xi = uMirror > 0.5 ? uFrame.x - position.x : position.x;
    vImg = vec2(xi / uFrame.x, 1.0 - position.y / uFrame.y);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const FRAG = /* glsl */ `
  uniform sampler2D uColor;
  uniform sampler2D uLight;
  uniform sampler2D uSeg;
  uniform float uSegOn;
  uniform vec3 uLightDir;
  uniform float uAmbient;
  uniform float uExposure;
  uniform float uSheen;
  uniform float uOpacity;
  uniform float uMirror;
  uniform float uFlat;
  uniform float uSkinOnly;
  uniform sampler2D uPhoto;
  uniform float uPhotoOn;
  uniform vec3 uSkinChroma;
  uniform float uSkinTest;
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec2 vImg;
  varying float vFar;

  float luma(vec3 c) {
    return dot(c, vec3(0.2126, 0.7152, 0.0722));
  }
  vec3 toLinear(vec3 c) {
    return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c));
  }
  vec3 toSrgb(vec3 c) {
    c = clamp(c, 0.0, 1.0);
    return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
  }

  void main() {
    if (vUv.y > 1.0) discard;
    vec4 c = texture2D(uColor, vUv);
    vec4 l = texture2D(uLight, vUv);
    float a = c.a * uOpacity;
    vec2 pu = vec2(vImg.x, 1.0 - vImg.y);
    if (uSegOn < 0.5 && uSkinTest > 0.5 && uPhotoOn > 0.5 && uSkinChroma.x > 0.0) {
      // No segmentation: hair lying on the neck stays where the photo looks like the
      // customer's skin (never on a white collar or a dark suit).
      vec3 p = toLinear(texture2D(uPhoto, pu, 1.0).rgb);
      vec3 ch = p / max(p.r + p.g + p.b, 0.0001);
      float notSkin = smoothstep(0.05, 0.11, length(ch - uSkinChroma));
      a *= 1.0 - notSkin * max(1.0 - l.a, uSkinOnly);
    }
    if (uSegOn > 0.5) {
      // Segmenter classes: 0 background, 1 hair, 2 body skin, 3 face skin, 4 clothes.
      float cls = floor(texture2D(uSeg, vImg).r * 255.0 + 0.5);
      bool onSkin = cls > 0.5 && cls < 3.5;
      bool neckOrClothes = (cls > 1.5 && cls < 2.5) || (cls > 3.5 && cls < 4.5);
      // Hair lying on the neck skin (light alpha 0) only shows where there is skin
      // or hair; the far side of a hanging beard hides behind the neck and clothes.
      float hide = onSkin ? 0.0 : max(1.0 - l.a, uSkinOnly);
      if (neckOrClothes) hide = max(hide, vFar);
      a *= 1.0 - hide;
    }
    if (a < 0.004) discard;
    if (uFlat > 0.5) {
      gl_FragColor = vec4(c.rgb, a);
      return;
    }
    vec3 n = normalize(vNormal);
    float lam = max(dot(n, uLightDir), 0.0);
    float lamRef = max(uLightDir.z, 0.25);
    float shade = (uAmbient + (1.0 - uAmbient) * lam) / (uAmbient + (1.0 - uAmbient) * lamRef);
    shade = clamp(shade, 0.5, 1.2);
    if (uPhotoOn > 0.5) {
      vec3 near = texture2D(uPhoto, pu, 1.5).rgb;
      vec3 far = texture2D(uPhoto, pu, 5.0).rgb;
      float ratio = clamp(luma(toLinear(near)) / max(luma(toLinear(far)), 0.002), 0.45, 1.6);
      // Hair lying on the skin follows the skin's shading closely; hanging hair less.
      shade *= pow(ratio, mix(0.85, 0.4, l.a));
    }
    vec3 col = toLinear(c.rgb) * (l.r * ${OCC_RANGE.toFixed(3)}) * shade * uExposure;
    float ang = (l.b - 0.5) * 3.14159265;
    vec3 t = normalize(vec3(sin(ang) * (uMirror > 0.5 ? -1.0 : 1.0), -cos(ang), 0.2));
    vec3 h = normalize(uLightDir + vec3(0.0, 0.0, 1.0));
    float th = dot(t, h);
    // Highlights only on the lighter (top) locks, never a grey veil over the beard.
    float top = smoothstep(0.95, 1.35, l.r * ${OCC_RANGE.toFixed(3)});
    float spec = pow(sqrt(max(0.0, 1.0 - th * th)), 60.0) * (0.015 + 0.12 * uSheen) * l.g * top * (0.3 + 0.7 * lam);
    col += vec3(spec);
    gl_FragColor = vec4(toSrgb(col), a);
  }
`;

const BG_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;
const BG_FRAG = /* glsl */ `
  uniform sampler2D uMap;
  uniform float uMirror;
  uniform vec4 uCrop;
  varying vec2 vUv;
  void main() {
    // uCrop: the shown part of the frame in display coordinates (normalized, top-left
    // origin, mirrored when uMirror is on); the texture has flipY (v up).
    float xd = uCrop.x + vUv.x * uCrop.z;
    float yd = uCrop.y + (1.0 - vUv.y) * uCrop.w;
    float xi = uMirror > 0.5 ? 1.0 - xd : xd;
    gl_FragColor = vec4(texture2D(uMap, vec2(xi, 1.0 - yd)).rgb, 1.0);
  }
`;

function dataTexture(data, width, height, { flip = false } = {}) {
  let buf = data;
  if (flip) {
    buf = new Uint8Array(data.length);
    const row = width * 4;
    for (let y = 0; y < height; y++) buf.set(data.subarray((height - 1 - y) * row, (height - y) * row), y * row);
  }
  const tex = new THREE.DataTexture(buf, width, height, THREE.RGBAFormat, THREE.UnsignedByteType);
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  return tex;
}

function beardMaterial(extra = {}) {
  return new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    uniforms: {
      uColor: { value: null },
      uLight: { value: null },
      uSeg: { value: null },
      uSegOn: { value: 0 },
      uLightDir: { value: new THREE.Vector3(0, 0.3, 0.95).normalize() },
      uAmbient: { value: 0.45 },
      uExposure: { value: 1 },
      uSheen: { value: 0.05 },
      uOpacity: { value: 1 },
      uMirror: { value: 0 },
      uFlat: { value: 0 },
      uFrame: { value: new THREE.Vector2(1, 1) },
      uVScale: { value: 1 },
      uSkinOnly: { value: 0 },
      uPhoto: { value: null },
      uPhotoOn: { value: 0 },
      uSkinChroma: { value: new THREE.Vector3(0, 0, 0) },
      uSkinTest: { value: 0 },
    },
    transparent: true,
    depthWrite: false,
    ...extra,
  });
}

/** Normal of a 2D vector, normalised. */
function norm2(v) {
  const l = Math.hypot(v[0], v[1]) || 1;
  return [v[0] / l, v[1] / l];
}

/**
 * Creates the beard scene for a renderer.
 * @param {{ background?: boolean }} [opts] background: draw a video / image quad first
 */
export function createBeardScene({ background = false } = {}) {
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(0, 1, 1, 0, -10000, 10000);
  camera.position.set(0, 0, 0);

  const faceGeo = buildFaceGeometry(THREE);
  // The shell shader reads aFar; the face never hides, so its aFar is 0.
  faceGeo.setAttribute('aFar', new THREE.BufferAttribute(new Float32Array(faceGeo.getAttribute('position').count), 1));

  const depthMat = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: true, depthTest: true });
  const depthMesh = new THREE.Mesh(faceGeo, depthMat);
  depthMesh.renderOrder = 1;
  depthMesh.frustumCulled = false;

  const faceMat = beardMaterial({ depthTest: false });
  const faceMesh = new THREE.Mesh(faceGeo, faceMat);
  faceMesh.renderOrder = 3;
  faceMesh.frustumCulled = false;

  const overlayMat = beardMaterial({ depthTest: false });
  overlayMat.uniforms.uFlat.value = 1;
  const overlayMesh = new THREE.Mesh(faceGeo, overlayMat);
  overlayMesh.renderOrder = 5;
  overlayMesh.frustumCulled = false;
  overlayMesh.visible = false;

  const shellMat = beardMaterial({ depthTest: true });
  const shellOverlayMat = beardMaterial({ depthTest: true });
  shellMat.uniforms.uSkinTest.value = 1;
  shellOverlayMat.uniforms.uSkinTest.value = 1;
  shellOverlayMat.uniforms.uFlat.value = 1;
  // Outline tints on the neck stay on the skin (never on the collar).
  shellOverlayMat.uniforms.uSkinOnly.value = 1;
  const neutralLight = new THREE.DataTexture(new Uint8Array([170, 0, 128, 255]), 1, 1, THREE.RGBAFormat, THREE.UnsignedByteType);
  neutralLight.needsUpdate = true;
  overlayMat.uniforms.uLight.value = neutralLight;
  shellOverlayMat.uniforms.uLight.value = neutralLight;
  let shellGeo = null;
  let shellMesh = null;
  let shellOverlayMesh = null;

  scene.add(depthMesh, faceMesh, overlayMesh);

  let bgMesh = null;
  let bgTex = null;
  if (background) {
    const bgMat = new THREE.ShaderMaterial({
      vertexShader: BG_VERT,
      fragmentShader: BG_FRAG,
      uniforms: { uMap: { value: null }, uMirror: { value: 1 }, uCrop: { value: new THREE.Vector4(0, 0, 1, 1) } },
      depthTest: false,
      depthWrite: false,
    });
    bgMesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), bgMat);
    bgMesh.renderOrder = 0;
    bgMesh.frustumCulled = false;
    scene.add(bgMesh);
  }

  const textures = { faceColor: null, faceLight: null, shellColor: null, shellLight: null, ovFace: null, ovShell: null, seg: null };
  let beard = null;
  let overlay = null;
  let segSize = [0, 0];

  function disposeTex(key) {
    if (textures[key]) {
      textures[key].dispose();
      textures[key] = null;
    }
  }

  /** Beard textures from generateBeardTextures (null hides the beard). */
  function setBeard(tex) {
    if (beard === tex) return;
    beard = tex;
    disposeTex('faceColor');
    disposeTex('faceLight');
    disposeTex('shellColor');
    disposeTex('shellLight');
    if (tex) {
      textures.faceColor = dataTexture(tex.face.color, tex.face.width, tex.face.height, { flip: true });
      textures.faceLight = dataTexture(tex.face.light, tex.face.width, tex.face.height, { flip: true });
      if (tex.shell) {
        textures.shellColor = dataTexture(tex.shell.color, tex.shell.width, tex.shell.height);
        textures.shellLight = dataTexture(tex.shell.light, tex.shell.width, tex.shell.height);
      }
    }
    faceMat.uniforms.uColor.value = textures.faceColor;
    faceMat.uniforms.uLight.value = textures.faceLight;
    faceMat.uniforms.uSheen.value = tex ? tex.sheen : 0;
    shellMat.uniforms.uColor.value = textures.shellColor;
    shellMat.uniforms.uLight.value = textures.shellLight;
    shellMat.uniforms.uSheen.value = tex ? tex.sheen : 0;
  }

  /** Outline textures from inpaint.js buildOutlineTextures (null hides the overlay). */
  function setOverlay(tex) {
    if (overlay === tex) return;
    overlay = tex;
    disposeTex('ovFace');
    disposeTex('ovShell');
    if (tex) {
      textures.ovFace = dataTexture(tex.face.color, tex.face.width, tex.face.height, { flip: true });
      if (tex.shell) textures.ovShell = dataTexture(tex.shell.color, tex.shell.width, tex.shell.height);
    }
    overlayMat.uniforms.uColor.value = textures.ovFace;
    shellOverlayMat.uniforms.uColor.value = textures.ovShell;
  }

  /** Segmentation categories (Uint8Array, row 0 = top of the un-mirrored frame). */
  function setSegmentation(seg) {
    if (!seg || !seg.categories) {
      for (const m of [shellMat, shellOverlayMat]) m.uniforms.uSegOn.value = 0;
      return;
    }
    if (!textures.seg || segSize[0] !== seg.width || segSize[1] !== seg.height) {
      disposeTex('seg');
      const t = new THREE.DataTexture(new Uint8Array(seg.width * seg.height), seg.width, seg.height, THREE.RedFormat, THREE.UnsignedByteType);
      t.minFilter = THREE.NearestFilter;
      t.magFilter = THREE.NearestFilter;
      t.generateMipmaps = false;
      t.unpackAlignment = 1;
      textures.seg = t;
      segSize = [seg.width, seg.height];
    }
    textures.seg.image.data.set(seg.categories.subarray(0, seg.width * seg.height));
    textures.seg.needsUpdate = true;
    for (const m of [shellMat, shellOverlayMat]) {
      m.uniforms.uSeg.value = textures.seg;
      m.uniforms.uSegOn.value = 1;
    }
  }

  /**
   * Photo or video texture of the frame (flipY = true, mipmapped) for the shading
   * transfer; null turns it off.
   */
  function setPhoto(texture) {
    for (const m of [faceMat, shellMat, shellOverlayMat]) {
      m.uniforms.uPhoto.value = texture || null;
      m.uniforms.uPhotoOn.value = texture ? 1 : 0;
    }
  }

  function setBackground(texture, mirror) {
    if (!bgMesh) return;
    if (bgTex && bgTex !== texture) bgTex.dispose();
    bgTex = texture;
    bgMesh.material.uniforms.uMap.value = texture;
    bgMesh.material.uniforms.uMirror.value = mirror ? 1 : 0;
    bgMesh.visible = !!texture;
  }

  /**
   * Places the face mesh and shell for a frame.
   * @param {object} f
   * @param {Array} f.landmarks normalized landmarks of the UN-mirrored frame
   * @param {number} f.width frame width (px)
   * @param {number} f.height frame height (px)
   * @param {boolean} [f.mirror=false]
   * @param {number} f.mmPerPx frame scale (from the iris)
   * @param {{ dir: number[], ambient: number, exposure: number }} [f.light]
   * @param {{ x, y, w, h }} [f.view] crop of the frame to render (top-left origin)
   * @param {string} [f.mode='beard'] 'beard' | 'outline' (outline hides the beard)
   */
  function update(f) {
    const { landmarks, width: W, height: H, mirror = false, mmPerPx, light, view, mode = 'beard' } = f;
    const v = view || { x: 0, y: 0, w: W, h: H };
    camera.left = v.x;
    camera.right = v.x + v.w;
    camera.top = H - v.y;
    camera.bottom = H - (v.y + v.h);
    camera.near = -10 * Math.max(W, H);
    camera.far = 10 * Math.max(W, H);
    camera.updateProjectionMatrix();
    if (bgMesh) bgMesh.material.uniforms.uCrop.value.set(v.x / W, v.y / H, v.w / W, v.h / H);
    const hasFace = !!landmarks && landmarks.length >= 468;
    depthMesh.visible = hasFace;
    if (!hasFace) {
      // No face this frame: only the background is drawn.
      faceMesh.visible = false;
      overlayMesh.visible = false;
      if (shellMesh) shellMesh.visible = false;
      if (shellOverlayMesh) shellOverlayMesh.visible = false;
      return;
    }
    updateFaceGeometry(faceGeo, landmarks, W, H, { mirror });

    const dir = light && light.dir ? light.dir : [0, 0.3, 0.95];
    const lx = mirror ? -dir[0] : dir[0];
    const showBeard = mode !== 'outline' && !!beard;
    const mats = [faceMat, shellMat, overlayMat, shellOverlayMat];
    const skin = light && Array.isArray(light.skinRgb) && light.skinRgb.every(Number.isFinite) ? light.skinRgb : null;
    const skinSum = skin ? skin[0] + skin[1] + skin[2] : 0;
    for (const m of mats) {
      if (skinSum > 1e-4) m.uniforms.uSkinChroma.value.set(skin[0] / skinSum, skin[1] / skinSum, skin[2] / skinSum);
      else m.uniforms.uSkinChroma.value.set(0, 0, 0);
      m.uniforms.uLightDir.value.set(lx, dir[1], dir[2]).normalize();
      m.uniforms.uAmbient.value = light && Number.isFinite(light.ambient) ? light.ambient : 0.45;
      m.uniforms.uExposure.value = light && Number.isFinite(light.exposure) ? light.exposure : 1;
      m.uniforms.uMirror.value = mirror ? 1 : 0;
      m.uniforms.uFrame.value.set(W, H);
    }
    faceMesh.visible = showBeard;
    overlayMesh.visible = !!overlay && !!textures.ovFace;

    // Beard shell below the jaw.
    const shellTex = beard && beard.shell;
    const ovShell = overlay && overlay.shell;
    const lengthMm = Math.max(shellTex && showBeard ? shellTex.lengthMm : 0, ovShell ? ovShell.lengthMm : 0);
    if (!(lengthMm > 0) || !(mmPerPx > 0)) {
      if (shellMesh) shellMesh.visible = false;
      if (shellOverlayMesh) shellOverlayMesh.visible = false;
      return;
    }
    const jaw = jawContourFromGeometry(faceGeo, JAW_CONTOUR);
    const pos = faceGeo.getAttribute('position').array;
    const nrm = faceGeo.getAttribute('normal').array;
    const top = [pos[3 * FOREHEAD_TOP], pos[3 * FOREHEAD_TOP + 1]];
    const chin = [pos[3 * CHIN_BOTTOM], pos[3 * CHIN_BOTTOM + 1]];
    const faceDown = norm2([chin[0] - top[0], chin[1] - top[1]]);
    const down = norm2([faceDown[0] * 0.5, faceDown[1] * 0.5 - 0.5]);
    // SHELL_SUB columns per jaw segment, interpolated between the landmarks (the
    // face mesh edge is straight between them, so the seam still matches exactly).
    const contour = [];
    const src = [];
    for (let k = 0; k < jaw.length - 1; k++) {
      for (let s = 0; s < SHELL_SUB; s++) {
        const t = s / SHELL_SUB;
        const a = jaw[k];
        const b = jaw[k + 1];
        contour.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]);
        src.push([k, t]);
      }
    }
    contour.push(jaw[jaw.length - 1].slice());
    src.push([jaw.length - 1, 0]);
    const cols = contour.length;
    const normals = jawNormals2D(contour, down).map((n) => norm2([n[0] + down[0], n[1] + down[1]]));
    shellGeo = extrudeBelowJaw(THREE, contour, lengthMm / mmPerPx, normals, {
      rows: SHELL_ROWS,
      gravity: 0.55,
      down,
      zOffset: 2,
      geometry: shellGeo || undefined,
    });
    if (!shellGeo.getAttribute('aFar')) {
      shellGeo.setAttribute('aFar', new THREE.BufferAttribute(new Float32Array(shellGeo.getAttribute('position').count), 1));
    }
    const lerpAt = (values, j) => {
      const [k, t] = src[j];
      return k + 1 < values.length ? values[k] + (values[k + 1] - values[k]) * t : values[k];
    };
    // u along the jaw by canonical arc length, the layout of the shell textures (the
    // screen-space arc length drifts when the head is turned).
    const suv = shellGeo.getAttribute('uv');
    // Far side of a turned head: jaw points whose surface faces away from the camera
    // (in a frontal view the sides of the jaw face sideways, nz near 0, and the beard
    // hanging there is in front of the shoulders, not behind the neck).
    const farAt = JAW_CONTOUR.map((i) => Math.min(1, Math.max(0, (-0.12 - nrm[3 * i + 2]) / 0.3)));
    const far = shellGeo.getAttribute('aFar');
    // Shell normals: the jaw's own normal at the seam (so the light matches the face
    // texture there), turning to a slightly down-facing normal toward the tips.
    const sn = shellGeo.getAttribute('normal');
    for (let j = 0; j < cols; j++) {
      const u = lerpAt(JAW_U, j);
      const fv = lerpAt(farAt, j);
      const n0 = [0, 1, 2].map((c) => lerpAt(JAW_CONTOUR.map((i) => nrm[3 * i + c]), j));
      for (let r = 0; r <= SHELL_ROWS; r++) {
        const v = r * cols + j;
        suv.array[2 * v] = u;
        far.array[v] = fv;
        const t = r / SHELL_ROWS;
        let x = n0[0] * (1 - t) + down[0] * 0.35 * t;
        let y = n0[1] * (1 - t) + down[1] * 0.35 * t;
        let z = n0[2] * (1 - t) + 0.94 * t;
        const l = Math.hypot(x, y, z) || 1;
        x /= l;
        y /= l;
        z /= l;
        sn.array[3 * v] = x;
        sn.array[3 * v + 1] = y;
        sn.array[3 * v + 2] = z;
      }
    }
    suv.needsUpdate = true;
    far.needsUpdate = true;
    sn.needsUpdate = true;
    if (!shellMesh) {
      shellMesh = new THREE.Mesh(shellGeo, shellMat);
      shellMesh.renderOrder = 2;
      shellMesh.frustumCulled = false;
      shellOverlayMesh = new THREE.Mesh(shellGeo, shellOverlayMat);
      shellOverlayMesh.renderOrder = 4;
      shellOverlayMesh.frustumCulled = false;
      scene.add(shellMesh, shellOverlayMesh);
    }
    shellMesh.visible = !!(shellTex && showBeard && textures.shellColor);
    shellOverlayMesh.visible = !!(ovShell && textures.ovShell);
    // uv.v runs 0..1 over lengthMm; each texture covers its own length.
    shellMat.uniforms.uVScale.value = shellTex ? lengthMm / shellTex.lengthMm : 1;
    shellOverlayMat.uniforms.uVScale.value = ovShell ? lengthMm / ovShell.lengthMm : 1;
  }

  function dispose() {
    for (const k of Object.keys(textures)) disposeTex(k);
    if (bgTex) bgTex.dispose();
    faceGeo.dispose();
    if (shellGeo) shellGeo.dispose();
    for (const m of [depthMat, faceMat, overlayMat, shellMat, shellOverlayMat]) m.dispose();
    neutralLight.dispose();
    if (bgMesh) {
      bgMesh.geometry.dispose();
      bgMesh.material.dispose();
    }
  }

  return { scene, camera, setBeard, setOverlay, setSegmentation, setBackground, setPhoto, update, dispose, faceGeo };
}
