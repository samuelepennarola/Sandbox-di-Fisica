// Motore 3D in stile ManimGL / 3Blue1Brown autentico (Three.js locale offline).
// Riproduce fedelmente gli shader di 3b1b/manim:
//   - finalize_color.wgsl (add_light con reflectiveness, gloss, shadow in sRGB puro, NoToneMapping);
//   - stroke.wgsl (nastri 3D orientati alla camera con anti-aliasing SDF a spessore reale in px);
//   - Arrow / Vector di geometry.py (frecce piatte nastriformi con punta a 60° e Z-buffer);
//   - NumberPlane BLUE_D con faded_line_ratio = 4 + ThreeDAxes lunghi da orizzonte a orizzonte con tacche.

import * as THREE from '../../vendor/three/three.module.min.js';
import { palette, texBox } from './manim.js';
import { niceStep } from './math.js';
import { FOV_DEG } from './view3d.js';

const st = {
  ready: false,
  failed: false,
  renderer: null,
  scene: null,
  cam: null,
  root: null,
  floorMesh: null,
  floorMat: null,
  w: 1,
  h: 1,
  dpr: 1,
  active: false,
  dark: true,
  P: null,
  V: null,
  M: null,
  D: 100,
  focus: [0, 0, 50, 50],
  camPos: [0, 0, 100],
  pxScale: 1,
  lastFloorStep: null,
  lastFloorUp: 'y',
  lightViewPos: new THREE.Vector3(-80, 95, 90),
  shadowDark: new THREE.Vector3(0, 0, 0),
  shadowLight: new THREE.Vector3(0.17, 0.15, 0.12),
  // Pool per fotogramma (zero GC a 60 fps)
  pools: {},
  idx: {},
  // Cache condivise
  geoCache: new Map(),
  edgePtsCache: new Map(),
  surfMatCache: new Map(),
  flatMatCache: new Map(),
  glowTexCache: new Map(),
  latticeCache: new Map(),
  unitSphere: null,
  sphereWireSegs: null,
  unitCyl: null,
  circleSegs: null,
  mat4: new THREE.Matrix4(),
};

function canvasEl() { return document.getElementById('stage3d'); }

// Converte #RRGGBB direttamente in componenti sRGB [0..1] senza la linearizzazione gamma di THREE.Color,
// così i ShaderMaterial custom emettono esattamente le tinte esadecimali della palette di Manim.
function srgbArr(hex) {
  if (!hex || typeof hex !== 'string' || hex[0] !== '#') return [0.345, 0.769, 0.867];
  if (hex.length === 4) {
    return [1, 2, 3].map(i => parseInt(hex[i] + hex[i], 16) / 255);
  }
  return [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255);
}
const srgbVec3 = hex => new THREE.Vector3(...srgbArr(hex));

function resolveHex(P, color, structural = false) {
  const raw = !color
    ? (st.M?.text ?? '#ece9e0')
    : (P?.col ? P.col(color) : (st.M?.vec?.[color] ?? st.M?.[color] ?? st.M?.body?.[color] ?? color));
  const hex = /^#/.test(raw) ? raw : '#58C4DD';
  // I solidi strutturali (#2a2c33) in ManimGL hanno una tinta blu-ardesia profonda (stile BLUE_E / GREY_E)
  if (structural && st.dark && hex.toLowerCase() === '#2a2c33') return '#15202b';
  return hex;
}

// Quante unità mondo vale 1 pixel CSS alla profondità del punto 3D q (mantiene spessori in px costanti in prospettiva).
function pxWorld(x, y, z = 0) {
  const f = st.V.f, cp = st.camPos;
  const d = Math.max(st.D * 0.08, (cp[0] - x) * f[0] + (cp[1] - y) * f[1] + (cp[2] - z) * f[2]);
  return (d / st.D) * st.pxScale;
}

function ensure() {
  if (st.ready) return true;
  if (st.failed) return false;
  const el = canvasEl();
  if (!el) { st.failed = true; return false; }
  try {
    const renderer = new THREE.WebGLRenderer({
      canvas: el,
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.NoToneMapping;
    renderer.setPixelRatio(st.dpr);
    renderer.setSize(st.w, st.h, false);

    const scene = new THREE.Scene();
    const cam = new THREE.PerspectiveCamera(FOV_DEG, Math.max(1e-3, st.w / Math.max(1, st.h)), 0.1, 1000);
    cam.matrixAutoUpdate = false;

    const root = new THREE.Group();
    scene.add(root);

    const unitSphere = new THREE.SphereGeometry(1, 40, 28);
    const sphereWireSegs = buildSphereSegPairs(1.008, 16, 8);
    const unitCyl = new THREE.CylinderGeometry(1, 1, 1, 36, 1, false);
    const circleSegs = buildCircleSegPairs(1, 56);

    Object.assign(st, {
      ready: true, renderer, scene, cam, root,
      unitSphere, sphereWireSegs, unitCyl, circleSegs,
    });
    initFloor();
    return true;
  } catch (err) {
    console.warn('WebGL non disponibile per manim3d:', err);
    st.failed = true;
    return false;
  }
}

function buildCircleSegPairs(r, segs) {
  const out = new Float32Array(segs * 6);
  for (let i = 0; i < segs; i++) {
    const a0 = (i / segs) * Math.PI * 2, a1 = ((i + 1) / segs) * Math.PI * 2, o = i * 6;
    out[o] = r * Math.cos(a0); out[o + 1] = r * Math.sin(a0); out[o + 2] = 0;
    out[o + 3] = r * Math.cos(a1); out[o + 4] = r * Math.sin(a1); out[o + 5] = 0;
  }
  return out;
}

// Reticolo SurfaceMesh (meridiani e paralleli) per la sfera unitaria, come SurfaceMesh di three_dimensions.py.
function buildSphereSegPairs(r, meridians, parallels) {
  const list = [];
  const steps = 36;
  for (let m = 0; m < meridians; m++) {
    const phi = (m / meridians) * Math.PI * 2, cp = Math.cos(phi), sp = Math.sin(phi);
    for (let i = 0; i < steps; i++) {
      const t0 = (i / steps) * Math.PI, t1 = ((i + 1) / steps) * Math.PI;
      list.push(
        r * Math.sin(t0) * cp, r * Math.sin(t0) * sp, r * Math.cos(t0),
        r * Math.sin(t1) * cp, r * Math.sin(t1) * sp, r * Math.cos(t1),
      );
    }
  }
  for (let p = 1; p < parallels; p++) {
    const th = (p / parallels) * Math.PI, rr = r * Math.sin(th), zz = r * Math.cos(th);
    for (let i = 0; i < steps; i++) {
      const a0 = (i / steps) * Math.PI * 2, a1 = ((i + 1) / steps) * Math.PI * 2;
      list.push(rr * Math.cos(a0), rr * Math.sin(a0), zz, rr * Math.cos(a1), rr * Math.sin(a1), zz);
    }
  }
  return new Float32Array(list);
}

// Pavimento NumberPlane in GLSL fedele a coordinate_systems.py (BLUE_D #29ABCA + faded_line_ratio = 4).
function initFloor() {
  const floorMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    uniforms: {
      uStep: { value: 1.0 },
      uOrigin: { value: new THREE.Vector2(0, 0) },
      uColor: { value: srgbVec3('#29ABCA') },
      uMajorA: { value: 0.56 },
      uMinorA: { value: 0.17 },
      uRadius: { value: 36.0 },
      uFade: { value: 1.0 },
    },
    vertexShader: `
      uniform float uRadius;
      varying vec2 vPlane;
      void main() {
        vPlane = position.xy * uRadius;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform float uStep;
      uniform vec2 uOrigin;
      uniform vec3 uColor;
      uniform float uMajorA;
      uniform float uMinorA;
      uniform float uRadius;
      uniform float uFade;
      varying vec2 vPlane;

      float gridLine(vec2 coord, float spacing, float pxWidth) {
        vec2 p = coord / spacing;
        vec2 grid = abs(fract(p - 0.5) - 0.5) / max(fwidth(p), vec2(1e-5));
        float line = min(grid.x, grid.y);
        return 1.0 - smoothstep(0.0, pxWidth, line);
      }

      void main() {
        vec2 rel = vPlane - uOrigin;
        float dist = length(rel);
        float rad = smoothstep(uRadius * 0.96, uRadius * 0.18, dist);
        if (rad <= 0.002) discard;

        // Linee principali (stroke_width ~2) e 4 suddivisioni (faded_line_ratio = 4 di ManimGL)
        float major = gridLine(rel, uStep, 1.55);
        float minor = gridLine(rel, uStep * 0.25, 1.05);

        float subFade = smoothstep(uRadius * 0.68, uRadius * 0.10, dist);
        float alpha = max(major * uMajorA, minor * uMinorA * subFade) * rad * uFade;
        if (alpha <= 0.003) discard;

        gl_FragColor = vec4(uColor, alpha);
      }
    `,
  });
  const floorMesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2, 1, 1), floorMat);
  floorMesh.frustumCulled = false;
  floorMesh.renderOrder = -10;
  floorMesh.visible = false;
  st.scene.add(floorMesh);
  st.floorMesh = floorMesh;
  st.floorMat = floorMat;
}

/* ---------------- Materiali Shader ManimGL ---------------- */

// Riproduce finalize_color.wgsl -> add_light(color, point, normal) di 3b1b/manim in view space.
function getSurfaceMat(hex, alpha = 1, shading = [0.30, 0.34, 0.34]) {
  const a = Math.round(Math.max(0, Math.min(1, alpha)) * 100) / 100;
  const shKey = shading.map(v => v.toFixed(2)).join(',');
  const key = `${hex}|${a}|${shKey}|${st.dark ? 1 : 0}`;
  let m = st.surfMatCache.get(key);
  if (m) return m;
  const transparent = a < 0.88;
  m = new THREE.ShaderMaterial({
    transparent,
    depthWrite: !transparent,
    side: transparent ? THREE.DoubleSide : THREE.FrontSide,
    uniforms: {
      uColor: { value: srgbVec3(hex) },
      uShadowColor: { value: st.dark ? st.shadowDark : st.shadowLight },
      uShading: { value: new THREE.Vector3(shading[0], shading[1], shading[2]) },
      uLightViewPos: { value: st.lightViewPos },
      uOpacity: { value: transparent ? a : 1.0 },
    },
    vertexShader: `
      varying vec3 vViewPos;
      varying vec3 vViewNormal;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vViewPos = mv.xyz;
        vViewNormal = normalize(normalMatrix * normal);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: `
      uniform vec3 uColor;
      uniform vec3 uShadowColor;
      uniform vec3 uShading;
      uniform vec3 uLightViewPos;
      uniform float uOpacity;
      varying vec3 vViewPos;
      varying vec3 vViewNormal;

      void main() {
        vec3 n = normalize(vViewNormal);
        if (!gl_FrontFacing) n = -n;
        vec3 to_cam = normalize(-vViewPos);
        vec3 to_light = normalize(uLightViewPos - vViewPos);

        float l_dot_n = dot(to_light, n);
        float bright = max(l_dot_n, 0.0) * uShading.x;
        vec3 refl = reflect(-to_light, n);
        float r_dot_c = clamp(dot(refl, to_cam), -1.0, 1.0);
        bright += uShading.y * exp(-3.0 * pow(1.0 - r_dot_c, 2.0));

        vec3 rgb = mix(uColor, vec3(1.0), clamp(bright, 0.0, 0.84));
        if (l_dot_n < 0.0) {
          rgb = mix(rgb, uShadowColor, clamp(-l_dot_n * uShading.z, 0.0, 0.72));
        }
        gl_FragColor = vec4(rgb, uOpacity);
      }
    `,
  });
  if (st.surfMatCache.size > 260) {
    for (const [k, v] of st.surfMatCache) { v.dispose(); st.surfMatCache.delete(k); if (st.surfMatCache.size <= 180) break; }
  }
  st.surfMatCache.set(key, m);
  return m;
}

// Materiale piatto sRGB puro per frecce Manim e superfici unlit (spicchi di Keplero, piani velati).
function getFlatMat(hex, alpha = 1, polyOffset = 0, writeDepth = null) {
  const a = Math.round(Math.max(0, Math.min(1, alpha)) * 100) / 100;
  const transparent = a < 0.92;
  const dw = writeDepth ?? !transparent;
  const key = `F|${hex}|${a}|${polyOffset}|${dw ? 1 : 0}`;
  let m = st.flatMatCache.get(key);
  if (m) return m;
  m = new THREE.ShaderMaterial({
    transparent,
    depthWrite: dw,
    side: THREE.DoubleSide,
    polygonOffset: polyOffset !== 0,
    polygonOffsetFactor: polyOffset,
    polygonOffsetUnits: polyOffset * 2,
    uniforms: {
      uColor: { value: srgbVec3(hex) },
      uOpacity: { value: a },
    },
    vertexShader: `
      void main() {
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 uColor;
      uniform float uOpacity;
      void main() {
        gl_FragColor = vec4(uColor, uOpacity);
      }
    `,
  });
  st.flatMatCache.set(key, m);
  return m;
}

// Materiale nastro SDF anti-aliasato (come stroke.wgsl di ManimGL) per linee, contorni, tacche e tratteggi.
function createStrokeMesh() {
  const geo = new THREE.BufferGeometry();
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -2,
    uniforms: {
      uColor: { value: new THREE.Vector3(1, 1, 1) },
      uOpacity: { value: 1.0 },
      uDashed: { value: 0.0 },
      uDash: { value: 7.0 },
      uGap: { value: 6.0 },
    },
    vertexShader: `
      attribute float aSide;
      attribute float aAlpha;
      attribute float aDist;
      varying float vSide;
      varying float vAlpha;
      varying float vDist;
      void main() {
        vSide = aSide;
        vAlpha = aAlpha;
        vDist = aDist;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 uColor;
      uniform float uOpacity;
      uniform float uDashed;
      uniform float uDash;
      uniform float uGap;
      varying float vSide;
      varying float vAlpha;
      varying float vDist;
      void main() {
        if (uDashed > 0.5) {
          float m = mod(vDist, uDash + uGap);
          if (m > uDash) discard;
        }
        float aa = smoothstep(1.0, 0.28, abs(vSide));
        float a = aa * uOpacity * vAlpha;
        if (a <= 0.003) discard;
        gl_FragColor = vec4(uColor, a);
      }
    `,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = 3;
  return mesh;
}

function getGlowTex(hex) {
  let tex = st.glowTexCache.get(hex);
  if (tex) return tex;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(64, 64, 3, 64, 64, 64);
  gr.addColorStop(0, hex + 'dd');
  gr.addColorStop(0.26, hex + '66');
  gr.addColorStop(0.60, hex + '1c');
  gr.addColorStop(1, hex + '00');
  g.fillStyle = gr;
  g.fillRect(0, 0, 128, 128);
  tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  st.glowTexCache.set(hex, tex);
  return tex;
}

function cachedGeo(key, build) {
  let g = st.geoCache.get(key);
  if (g) return g;
  g = build();
  if (st.geoCache.size > 180) {
    for (const [k, v] of st.geoCache) { v.dispose(); st.geoCache.delete(k); if (st.geoCache.size <= 120) break; }
  }
  st.geoCache.set(key, g);
  return g;
}

function cachedEdgePairs(key, geo, thresholdAngle = 20) {
  let arr = st.edgePtsCache.get(key);
  if (arr) return arr;
  const eg = new THREE.EdgesGeometry(geo, thresholdAngle);
  arr = new Float32Array(eg.attributes.position.array);
  eg.dispose();
  if (st.edgePtsCache.size > 180) {
    for (const k of st.edgePtsCache.keys()) { st.edgePtsCache.delete(k); if (st.edgePtsCache.size <= 120) break; }
  }
  st.edgePtsCache.set(key, arr);
  return arr;
}

function take(type, factory) {
  const pool = st.pools[type] ??= [];
  const i = st.idx[type] ?? 0;
  st.idx[type] = i + 1;
  let obj = pool[i];
  if (!obj) {
    obj = factory();
    st.root.add(obj);
    pool.push(obj);
  }
  obj.visible = true;
  return obj;
}

/* ---------------- Ciclo fotogramma ---------------- */

export function resize3d(w, h, dpr = 1) {
  st.w = Math.max(1, w);
  st.h = Math.max(1, h);
  st.dpr = Math.min(dpr || 1, 2);
  if (!st.ready) return;
  st.renderer.setPixelRatio(st.dpr);
  st.renderer.setSize(st.w, st.h, false);
}

export function begin3dFrame() {
  st.active = false;
  st.lastFloorStep = null;
  for (const k in st.idx) st.idx[k] = 0;
  if (st.floorMesh) st.floorMesh.visible = false;
}

export function hide3d() {
  const el = canvasEl();
  if (el && el.style.display !== 'none') el.style.display = 'none';
  st.active = false;
}

export function sync3d(P, V) {
  if (!ensure()) return false;
  if (P.cam.w !== st.w || P.cam.h !== st.h) resize3d(P.cam.w, P.cam.h, devicePixelRatio || 1);
  st.active = true;
  st.P = P;
  st.V = V;
  const M = st.M = P.M ?? palette(P.c);
  st.dark = !!M.dark;
  st.pxScale = 1 / Math.max(1e-6, P.cam.scale);

  const el = canvasEl();
  if (el.style.display !== 'block') el.style.display = 'block';

  st.scene.background = new THREE.Color(M.bg);

  // Centro ottico sull'area libera della scena (identico a View3D.focusPt)
  const [px0, py0, sx0, sy0] = st.focus = V.focusPt();
  const pz0 = P.cam.cz || 0;
  const D = st.D = V.dist0();
  const r = V.r, u = V.u, f = V.f;
  const px = px0 + f[0] * D, py = py0 + f[1] * D, pz = pz0 + f[2] * D;
  st.camPos = [px, py, pz];

  // Sorgente luminosa in view space: in alto a sinistra davanti alla scena, come [-10, 10, 10] di ManimGL
  st.lightViewPos.set(-0.85 * D, 0.95 * D, 0.88 * D);

  st.cam.fov = FOV_DEG;
  st.cam.aspect = st.w / Math.max(1, st.h);
  st.cam.near = Math.max(1e-4, D * 0.015);
  st.cam.far = Math.max(20, D * 65);
  st.cam.setViewOffset(st.w, st.h, st.w / 2 - sx0, st.h / 2 - sy0, st.w, st.h);
  st.cam.updateProjectionMatrix();

  st.mat4.set(
    r[0], u[0], f[0], px,
    r[1], u[1], f[1], py,
    r[2], u[2], f[2], pz,
    0,    0,    0,    1,
  );
  st.cam.matrixWorld.copy(st.mat4);
  st.cam.matrixWorldInverse.copy(st.mat4).invert();

  return true;
}

export function end3dFrame() {
  if (!st.ready) return;
  if (!st.active) { hide3d(); return; }
  for (const type in st.pools) {
    const pool = st.pools[type], used = st.idx[type] ?? 0;
    for (let i = used; i < pool.length; i++) pool[i].visible = false;
  }
  st.renderer.render(st.scene, st.cam);
}

export const is3dActive = () => st.active;

/* ---------------- Tratti 3D anti-aliasati (stroke.wgsl) ---------------- */

// Disegna M segmenti 3D indipendenti (flat array di 6*M float: x0,y0,z0, x1,y1,z1, ...) con spessore reale in px.
// alphas (opzionale): Float32Array di 2*M float con l'opacità ai due estremi di ogni segmento; dists: per tratteggio.
function drawSegments3d(flatPairs, { color = '#dddddd', widthPx = 1.6, alpha = 1, alphas = null, dashed = false, dashPx = 7, gapPx = 6, transform = null } = {}) {
  const segCount = Math.floor(flatPairs.length / 6);
  if (!st.active || segCount < 1 || alpha <= 0.005) return;
  const hex = resolveHex(st.P, color);
  const mesh = take('stroke', createStrokeMesh);

  const vCount = segCount * 4, iCount = segCount * 6;
  const pos = new Float32Array(vCount * 3);
  const side = new Float32Array(vCount);
  const vAl = new Float32Array(vCount);
  const dist = new Float32Array(vCount);
  const idx = vCount > 65535 ? new Uint32Array(iCount) : new Uint16Array(iCount);

  const cp = st.camPos;
  const padPx = widthPx * 0.5 + 0.85; // margine per il bordo anti-aliasato
  let cumDist = 0;

  for (let s = 0; s < segCount; s++) {
    const b = s * 6;
    let x0 = flatPairs[b], y0 = flatPairs[b + 1], z0 = flatPairs[b + 2];
    let x1 = flatPairs[b + 3], y1 = flatPairs[b + 4], z1 = flatPairs[b + 5];
    if (transform) {
      [x0, y0, z0] = transform(x0, y0, z0);
      [x1, y1, z1] = transform(x1, y1, z1);
    }
    const dx = x1 - x0, dy = y1 - y0, dz = z1 - z0;
    const segLen = Math.hypot(dx, dy, dz);
    if (segLen < 1e-7) continue;

    const mx = (x0 + x1) * 0.5, my = (y0 + y1) * 0.5, mz = (z0 + z1) * 0.5;
    const vx = cp[0] - mx, vy = cp[1] - my, vz = cp[2] - mz;
    // Normale laterale = dir × toCam
    let nx = dy * vz - dz * vy, ny = dz * vx - dx * vz, nz = dx * vy - dy * vx;
    let nl = Math.hypot(nx, ny, nz);
    if (nl < 1e-6) { nx = st.V.r[0]; ny = st.V.r[1]; nz = st.V.r[2]; nl = 1; }
    nx /= nl; ny /= nl; nz /= nl;

    const w0 = padPx * pxWorld(x0, y0, z0);
    const w1 = padPx * pxWorld(x1, y1, z1);

    const vo = s * 12, ao = s * 4, io = s * 6;
    pos[vo] = x0 - nx * w0;     pos[vo + 1] = y0 - ny * w0;     pos[vo + 2] = z0 - nz * w0;
    pos[vo + 3] = x0 + nx * w0; pos[vo + 4] = y0 + ny * w0;     pos[vo + 5] = z0 + nz * w0;
    pos[vo + 6] = x1 - nx * w1; pos[vo + 7] = y1 - ny * w1;     pos[vo + 8] = z1 - nz * w1;
    pos[vo + 9] = x1 + nx * w1; pos[vo + 10] = y1 + ny * w1;    pos[vo + 11] = z1 + nz * w1;

    side[ao] = -1; side[ao + 1] = 1; side[ao + 2] = -1; side[ao + 3] = 1;
    const a0 = alphas ? alphas[s * 2] : 1, a1 = alphas ? alphas[s * 2 + 1] : 1;
    vAl[ao] = a0; vAl[ao + 1] = a0; vAl[ao + 2] = a1; vAl[ao + 3] = a1;

    const dPx = segLen / Math.max(1e-7, pxWorld(mx, my, mz));
    dist[ao] = cumDist; dist[ao + 1] = cumDist;
    cumDist += dPx;
    dist[ao + 2] = cumDist; dist[ao + 3] = cumDist;

    idx[io] = ao; idx[io + 1] = ao + 1; idx[io + 2] = ao + 2;
    idx[io + 3] = ao + 1; idx[io + 4] = ao + 3; idx[io + 5] = ao + 2;
  }

  const g = mesh.geometry;
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aSide', new THREE.BufferAttribute(side, 1));
  g.setAttribute('aAlpha', new THREE.BufferAttribute(vAl, 1));
  g.setAttribute('aDist', new THREE.BufferAttribute(dist, 1));
  g.setIndex(new THREE.BufferAttribute(idx, 1));

  const u = mesh.material.uniforms;
  u.uColor.value.set(...srgbArr(hex));
  u.uOpacity.value = alpha;
  u.uDashed.value = dashed ? 1.0 : 0.0;
  u.uDash.value = dashPx;
  u.uGap.value = gapPx;
  mesh.renderOrder = dashed ? 2 : (alphas ? 4 : 3);
}

/* ---------------- Primitive 3D ManimGL ---------------- */

// Registra passo e orientamento dello spazio 3D senza disegnare alcun pavimento/griglia piana:
// lo spazio 3D resta puro (#0B0B0D / #f6f3ea) con i soli ThreeDAxes ortogonali, come nei video 3D di 3Blue1Brown.
export function floor({ up = 'y', step = 1 } = {}) {
  if (!st.active) return;
  st.lastFloorStep = step;
  st.lastFloorUp = up;
  if (st.floorMesh) st.floorMesh.visible = false;
}

// Reticolo volumetrico 3D isotropo (x, y, z) stile 3Blue1Brown: avvolge l'intera inquadratura 3D con celle ariose
// e dissolvenza sferica morbida, dando la sensazione di essere immersi nello spazio tridimensionale senza pavimento.
export function lattice3d({ origin = [0, 0, 0], step = 1, rings = 4, alpha = 1 } = {}) {
  if (!st.active) return;
  const k = st.V.tilt(0.1) * alpha;
  if (k <= 0.005) return;

  let cached = st.latticeCache.get(rings);
  if (!cached) {
    const segs = [];
    const alphas = [];
    const radius = rings * 1.38;
    const alphaAt = (x, y, z) => {
      const r3 = Math.hypot(x, y, z) / radius;
      const fade = Math.max(0, 1 - r3);
      return fade * fade;
    };
    const sub = 1.0;
    const steps = Math.round((2 * rings) / sub);
    for (let axis = 0; axis < 3; axis++) {
      for (let a = -rings; a <= rings; a++) {
        for (let b = -rings; b <= rings; b++) {
          if (a === 0 && b === 0) continue; // gli assi principali sono già disegnati da ThreeDAxes
          for (let i = 0; i < steps; i++) {
            const t0 = -rings + i * sub;
            const t1 = t0 + sub;
            const x0 = axis === 0 ? t0 : a, y0 = axis === 1 ? t0 : (axis === 0 ? a : b), z0 = axis === 2 ? t0 : b;
            const x1 = axis === 0 ? t1 : a, y1 = axis === 1 ? t1 : (axis === 0 ? a : b), z1 = axis === 2 ? t1 : b;
            const a0 = alphaAt(x0, y0, z0);
            const a1 = alphaAt(x1, y1, z1);
            if (a0 < 0.025 && a1 < 0.025) continue;
            segs.push(x0, y0, z0, x1, y1, z1);
            alphas.push(a0, a1);
          }
        }
      }
    }
    cached = {
      pairs: new Float32Array(segs),
      alphas: new Float32Array(alphas),
    };
    st.latticeCache.set(rings, cached);
  }

  const [ox = 0, oy = 0, oz = 0] = origin;
  const stp = Math.max(step || st.lastFloorStep || 1, niceStep(135 / st.P.cam.scale));
  drawSegments3d(cached.pairs, {
    color: st.dark ? '#29ABCA' : '#236B8E',
    widthPx: 1.25,
    alpha: k * (st.dark ? 0.44 : 0.28),
    alphas: cached.alphas,
    transform: (x, y, z) => [ox + x * stp, oy + y * stp, oz + z * stp],
  });
}

// Sfera ManimGL con shader add_light, reticolo SurfaceMesh nitido in GREY_A e glow opzionale.
export function sphere(c, r, { color = 'vel', edge = null, alpha = 0.96, spin = 0, spinAxis = 'z', mesh = true, glow = false } = {}) {
  if (!st.active || r <= 0 || alpha <= 0.01) return;
  const hex = resolveHex(st.P, color);
  const cx = c[0], cy = c[1], cz = c[2] ?? 0;

  const g = take('sphere', () => {
    const grp = new THREE.Group();
    const s = new THREE.Mesh(st.unitSphere);
    const sp = new THREE.Sprite();
    sp.center.set(0.5, 0.5);
    grp.add(s, sp);
    grp.userData = { s, sp };
    return grp;
  });
  g.position.set(cx, cy, cz);
  g.rotation.set(0, 0, 0);
  if (spin) {
    if (spinAxis === 'x') g.rotation.x = spin;
    else if (spinAxis === 'y') g.rotation.y = spin;
    else g.rotation.z = spin;
  }
  const { s, sp } = g.userData;
  s.scale.setScalar(r);
  s.material = getSurfaceMat(hex, alpha, glow ? [0.42, 0.45, 0.18] : [0.30, 0.36, 0.34]);
  s.renderOrder = alpha < 0.88 ? 2 : 0;

  if (mesh) {
    const cs = Math.cos(spin), sn = Math.sin(spin);
    const tf = (x, y, z) => {
      let rx = x * r, ry = y * r, rz = z * r;
      if (spin) {
        if (spinAxis === 'x') { const y1 = ry * cs - rz * sn, z1 = ry * sn + rz * cs; ry = y1; rz = z1; }
        else if (spinAxis === 'y') { const x1 = rx * cs + rz * sn, z1 = -rx * sn + rz * cs; rx = x1; rz = z1; }
        else { const x1 = rx * cs - ry * sn, y1 = rx * sn + ry * cs; rx = x1; ry = y1; }
      }
      return [cx + rx, cy + ry, cz + rz];
    };
    const wCol = edge ? resolveHex(st.P, edge) : (st.dark ? '#e6edf3' : '#1b1a17');
    drawSegments3d(st.sphereWireSegs, { color: wCol, widthPx: 1.15, alpha: alpha * (st.dark ? 0.30 : 0.20), transform: tf });
  }

  if (glow && st.dark) {
    sp.visible = true;
    sp.scale.setScalar(r * 5.0);
    let sm = sp.material;
    const tex = getGlowTex(hex);
    if (!sm || sm.map !== tex) {
      sm = sp.material = new THREE.SpriteMaterial({
        map: tex,
        transparent: true,
        opacity: alpha * 0.88,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
    } else {
      sm.opacity = alpha * 0.88;
    }
  } else {
    sp.visible = false;
  }
}

// Cilindro pieno o cavo (anello forato) con shader add_light e contorni SDF nitidi.
export function cylinder(c, r, w, { color = 'solid', edge = null, alpha = 0.92, spin = 0, hollow = false, mark = true, rim = 0.18 } = {}) {
  if (!st.active || r <= 0 || w <= 0 || alpha <= 0.01) return;
  const isStruct = color === 'solid' || color === st.M?.solid;
  const hex = resolveHex(st.P, color, isStruct);
  const edgeHex = resolveHex(st.P, edge ?? (st.dark ? '#d8e2ec' : '#23211c'));
  const cx = c[0], cy = c[1], cz = c[2] ?? 0;
  const cs = Math.cos(spin), sn = Math.sin(spin);
  const tf = (x, y, z) => [cx + x * cs - y * sn, cy + x * sn + y * cs, cz + z];

  if (hollow) {
    const rIn = r * (1 - rim);
    const key = `ring|${r.toFixed(4)}|${rIn.toFixed(4)}|${w.toFixed(4)}`;
    const geo = cachedGeo(key, () => {
      const sh = new THREE.Shape();
      sh.absarc(0, 0, r, 0, Math.PI * 2, false);
      const hole = new THREE.Path();
      hole.absarc(0, 0, rIn, 0, Math.PI * 2, true);
      sh.holes.push(hole);
      const eg = new THREE.ExtrudeGeometry(sh, { depth: w, bevelEnabled: false, curveSegments: 52 });
      eg.translate(0, 0, -w / 2);
      return eg;
    });
    const m = take('hollowMesh', () => new THREE.Mesh());
    m.position.set(cx, cy, cz);
    m.rotation.set(0, 0, spin);
    m.geometry = geo;
    m.material = getSurfaceMat(hex, alpha, isStruct ? [0.22, 0.25, 0.25] : [0.30, 0.36, 0.34]);
    m.renderOrder = alpha < 0.88 ? 2 : 0;

    // Corone di contorno anteriori e posteriori + raggio
    for (const zOff of [-w / 2 - 0.002, w / 2 + 0.002]) {
      drawSegments3d(st.circleSegs, { color: edgeHex, widthPx: 1.5, alpha: alpha * 0.75, transform: (x, y) => tf(x * r, y * r, zOff) });
      drawSegments3d(st.circleSegs, { color: edgeHex, widthPx: 1.3, alpha: alpha * 0.65, transform: (x, y) => tf(x * rIn, y * rIn, zOff) });
    }
    if (mark) {
      const zf = w / 2 + 0.005;
      drawSegments3d([rIn, 0, zf, r, 0, zf], { color: edgeHex, widthPx: 2.2, alpha, transform: tf });
    }
    return;
  }

  const m = take('cylMesh', () => {
    const mesh = new THREE.Mesh(st.unitCyl);
    return mesh;
  });
  m.position.set(cx, cy, cz);
  // unitCyl ha asse lungo Y: ruotiamo di 90° su X per portarlo lungo Z, poi spin attorno a Z
  m.rotation.order = 'ZXY';
  m.rotation.set(Math.PI / 2, 0, spin);
  m.scale.set(r, w, r);
  m.material = getSurfaceMat(hex, alpha, isStruct ? [0.22, 0.25, 0.24] : [0.30, 0.36, 0.34]);
  m.renderOrder = alpha < 0.88 ? 2 : 0;

  drawSegments3d(st.circleSegs, { color: edgeHex, widthPx: 1.55, alpha: alpha * 0.82, transform: (x, y) => tf(x * r, y * r, w / 2 + 0.002) });
  drawSegments3d(st.circleSegs, { color: edgeHex, widthPx: 1.35, alpha: alpha * 0.58, transform: (x, y) => tf(x * r, y * r, -w / 2 - 0.002) });
  if (mark) {
    const zf = w / 2 + 0.005;
    drawSegments3d([0, 0, zf, r, 0, zf], { color: edgeHex, widthPx: 1.9, alpha, transform: tf });
  }
}

// Prisma estruso lungo z tra z0 e z1 con shader add_light (bassa ombra come VCube/Prism di ManimGL) e spigoli SDF.
export function prism(poly, z0, z1, { color = 'solid', edge = null, alpha = 0.92 } = {}) {
  if (!st.active || !poly || poly.length < 3 || alpha <= 0.01) return;
  const dz = Math.abs(z1 - z0);
  if (dz < 1e-6) return;
  const zMin = Math.min(z0, z1);
  const isStruct = color === 'solid' || color === st.M?.solid;
  const hex = resolveHex(st.P, color, isStruct);
  const edgeHex = resolveHex(st.P, edge ?? (st.dark ? '#c8d6e5' : st.M.solidEdge));
  const key = 'pr|' + poly.map(([x, y]) => `${x.toFixed(4)},${y.toFixed(4)}`).join(';') + `|${dz.toFixed(4)}`;
  const geo = cachedGeo(key, () => {
    const sh = new THREE.Shape();
    poly.forEach(([x, y], i) => (i ? sh.lineTo(x, y) : sh.moveTo(x, y)));
    sh.closePath();
    return new THREE.ExtrudeGeometry(sh, { depth: dz, bevelEnabled: false });
  });
  const edgePairs = cachedEdgePairs(key + '|ep', geo, 18);

  const m = take('prismMesh', () => new THREE.Mesh());
  m.position.set(0, 0, zMin);
  m.geometry = geo;
  m.material = getSurfaceMat(hex, alpha, isStruct ? [0.13, 0.16, 0.28] : [0.26, 0.34, 0.26]);
  m.renderOrder = alpha < 0.88 ? 2 : 0;

  drawSegments3d(edgePairs, {
    color: edgeHex,
    widthPx: 1.65,
    alpha: Math.min(1, alpha * 0.82),
    transform: (x, y, z) => [x, y, z + zMin],
  });
}

// Freccia nastriforme alla ManimGL (Arrow / Vector di geometry.py): silhouette piatta orientata alla camera
// con punta triangolare a ~60°, colore vivido puro sRGB, contorno scuro di stacco (halo) e Z-buffer attivo.
export function arrow(a, b, { color = 'vel', widthPx = 3.0, tipPx = 14, alpha = 1, dashed = false, halo = true } = {}) {
  if (!st.active || alpha <= 0.01) return;
  const ax = a[0], ay = a[1], az = a[2] ?? 0;
  const bx = b[0], by = b[1], bz = b[2] ?? 0;
  const dx = bx - ax, dy = by - ay, dz = bz - az;
  const len = Math.hypot(dx, dy, dz);
  if (len <= 1e-5) return;

  const hex = resolveHex(st.P, color);
  const ux = dx / len, uy = dy / len, uz = dz / len;
  const sEnd = pxWorld(bx, by, bz), sStart = pxWorld(ax, ay, az);
  const sMid = 0.5 * (sStart + sEnd);

  const shaftHalf0 = Math.max(1.7, widthPx) * 0.62 * sStart;
  const shaftHalf1 = Math.max(1.7, widthPx) * 0.62 * sEnd;
  const tipLen = Math.min(len * 0.45, Math.max(12, tipPx) * 1.30 * sEnd);
  const tipHalf = Math.min(len * 0.31, Math.max(shaftHalf1 * 3.15, tipLen * 0.43));
  const stemLen = Math.max(0, len - tipLen);

  const mx = (ax + bx) * 0.5, my = (ay + by) * 0.5, mz = (az + bz) * 0.5;
  const vx = st.camPos[0] - mx, vy = st.camPos[1] - my, vz = st.camPos[2] - mz;
  let sx = uy * vz - uz * vy, sy = uz * vx - ux * vz, sz = ux * vy - uy * vx;
  let sl = Math.hypot(sx, sy, sz);
  if (sl < 1e-6) { sx = st.V.r[0]; sy = st.V.r[1]; sz = st.V.r[2]; sl = 1; }
  sx /= sl; sy /= sl; sz /= sl;

  const tx = ax + ux * stemLen, ty = ay + uy * stemLen, tz = az + uz * stemLen;

  const buildArrowTris = (padWorld) => {
    const sh0 = shaftHalf0 + padWorld, sh1 = shaftHalf1 + padWorld, th = tipHalf + padWorld * 1.3;
    const extStart = padWorld;
    const p0x = ax - ux * extStart, p0y = ay - uy * extStart, p0z = az - uz * extStart;
    const tipX = bx + ux * padWorld * 1.2, tipY = by + uy * padWorld * 1.2, tipZ = bz + uz * padWorld * 1.2;
    if (dashed) {
      return new Float32Array([
        tx - sx * th, ty - sy * th, tz - sz * th,
        tx + sx * th, ty + sy * th, tz + sz * th,
        tipX, tipY, tipZ,
      ]);
    }
    return new Float32Array([
      // Fusto (2 triangoli)
      p0x - sx * sh0, p0y - sy * sh0, p0z - sz * sh0,
      p0x + sx * sh0, p0y + sy * sh0, p0z + sz * sh0,
      tx + sx * sh1,  ty + sy * sh1,  tz + sz * sh1,

      p0x - sx * sh0, p0y - sy * sh0, p0z - sz * sh0,
      tx + sx * sh1,  ty + sy * sh1,  tz + sz * sh1,
      tx - sx * sh1,  ty - sy * sh1,  tz - sz * sh1,
      // Punta triangolare (1 triangolo)
      tx - sx * th, ty - sy * th, tz - sz * th,
      tx + sx * th, ty + sy * th, tz + sz * th,
      tipX, tipY, tipZ,
    ]);
  };

  if (dashed && stemLen > 1e-5) {
    line([[ax, ay, az], [tx, ty, tz]], { color: hex, width: widthPx, alpha, dashed: true, dashPx: 7 });
  }

  // Sottile backstroke del colore di fondo (come set_backstroke in ManimGL) solo attorno al bordo esterno:
  // fMesh scrive nel Z-buffer con polyOffset = -2 (più vicino), quindi hMesh (polyOffset = +2, più lontano)
  // viene scartato dallo Z-test su tutti i pixel interni della freccia e disegna solo il contorno esterno!
  if (halo && alpha >= 0.85) {
    const hMesh = take('arrowHalo', () => {
      const m = new THREE.Mesh(new THREE.BufferGeometry());
      m.frustumCulled = false;
      m.renderOrder = 3;
      return m;
    });
    hMesh.geometry.setAttribute('position', new THREE.BufferAttribute(buildArrowTris(1.6 * sMid), 3));
    hMesh.material = getFlatMat(st.M.bg, 0.78, 2, false);
  }

  const fMesh = take('arrowFill', () => {
    const m = new THREE.Mesh(new THREE.BufferGeometry());
    m.frustumCulled = false;
    m.renderOrder = 5;
    return m;
  });
  fMesh.geometry.setAttribute('position', new THREE.BufferAttribute(buildArrowTris(0), 3));
  fMesh.material = getFlatMat(hex, alpha, -2, alpha >= 0.92);
}

// Polilinea 3D anti-aliasata (continua o tratteggiata).
export function line(pts, { color = 'text', width = 1.8, alpha = 1, dashed = false, dashPx = 7 } = {}) {
  if (!st.active || !pts || pts.length < 2 || alpha <= 0.01) return;
  const n = pts.length - 1;
  const pairs = new Float32Array(n * 6);
  for (let i = 0; i < n; i++) {
    const p = pts[i], q = pts[i + 1], o = i * 6;
    pairs[o] = p[0]; pairs[o + 1] = p[1]; pairs[o + 2] = p[2] ?? 0;
    pairs[o + 3] = q[0]; pairs[o + 4] = q[1]; pairs[o + 5] = q[2] ?? 0;
  }
  drawSegments3d(pairs, { color, widthPx: width, alpha, dashed, dashPx, gapPx: dashPx * 0.85 });
}

// Scia 3D luminosa a nastro orientato verso la camera con sfumatura verso la coda (fadeTail) e Z-buffer.
export function tube(pts, { color = 'vel', widthPx = 2.6, alpha = 0.95, fadeTail = true } = {}) {
  if (!st.active || !pts || pts.length < 2 || alpha <= 0.01) return;
  const n = pts.length - 1;
  const pairs = new Float32Array(n * 6);
  const alphas = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) {
    const p = pts[i], q = pts[i + 1], o = i * 6;
    pairs[o] = p[0]; pairs[o + 1] = p[1]; pairs[o + 2] = p[2] ?? 0;
    pairs[o + 3] = q[0]; pairs[o + 4] = q[1]; pairs[o + 5] = q[2] ?? 0;
    alphas[i * 2] = fadeTail ? 0.12 + 0.88 * (i / n) : 1;
    alphas[i * 2 + 1] = fadeTail ? 0.12 + 0.88 * ((i + 1) / n) : 1;
  }
  drawSegments3d(pairs, { color, widthPx, alpha, alphas });
}

// Arco curvo 3D orientato con punta ManimGL (regola della mano destra attorno a un asse 'x', 'y' o 'z'):
// la coda sfuma dolcemente (0.28 → 1.0) e la punta triangolare si orienta lungo la tangente finale.
export function arcArrow(center, r, a0, a1, { axis = 'z', color = 'vel', widthPx = 2.4, tipPx = 11, alpha = 0.9 } = {}) {
  const span = a1 - a0;
  if (!st.active || r <= 1e-5 || Math.abs(span) < 0.06 || alpha <= 0.01) return;
  const cx = center[0], cy = center[1], cz = center[2] ?? 0;
  const ptAt = a => {
    const u = r * Math.cos(a), v = r * Math.sin(a);
    return axis === 'z' ? [cx + u, cy + v, cz] : axis === 'y' ? [cx + u, cy, cz + v] : [cx, cy + u, cz + v];
  };
  const endPt = ptAt(a1);
  const sEnd = pxWorld(endPt[0], endPt[1], endPt[2]);
  const tipWorld = Math.min(r * Math.abs(span) * 0.45, Math.max(10, tipPx) * 1.25 * sEnd);
  const dAng = Math.sign(span) * Math.min(Math.abs(span) * 0.45, tipWorld / Math.max(1e-5, r));
  const aStemEnd = a1 - dAng * 0.85;

  const n = Math.max(16, Math.min(56, Math.ceil(Math.abs(aStemEnd - a0) * 24)));
  const pairs = new Float32Array(n * 6);
  const alphas = new Float32Array(n * 2);
  let pPrev = ptAt(a0);
  for (let i = 0; i < n; i++) {
    const f1 = (i + 1) / n;
    const pNext = ptAt(a0 + (aStemEnd - a0) * f1);
    const o = i * 6;
    pairs[o] = pPrev[0]; pairs[o + 1] = pPrev[1]; pairs[o + 2] = pPrev[2];
    pairs[o + 3] = pNext[0]; pairs[o + 4] = pNext[1]; pairs[o + 5] = pNext[2];
    alphas[i * 2] = 0.28 + 0.72 * (i / n);
    alphas[i * 2 + 1] = 0.28 + 0.72 * f1;
    pPrev = pNext;
  }
  drawSegments3d(pairs, { color, widthPx, alpha, alphas });

  // Tangente esatta in a1 nel verso di percorrenza per orientare la punta ManimGL
  const sg = Math.sign(span), sn = Math.sin(a1), cs = Math.cos(a1);
  const tg = axis === 'z' ? [-sn * sg, cs * sg, 0] : axis === 'y' ? [-sn * sg, 0, cs * sg] : [0, -sn * sg, cs * sg];
  const basePt = [endPt[0] - tg[0] * tipWorld, endPt[1] - tg[1] * tipWorld, endPt[2] - tg[2] * tipWorld];
  arrow(basePt, endPt, { color, widthPx: widthPx * 0.85, tipPx, alpha, halo: false });
}

// Superficie poligonale 3D traslucida (spicchi di Keplero, piani di confine, superfici di rampa).
export function plane(pts, { color = 'muted', alpha = 0.22, borderColor = null, borderAlpha = 0 } = {}) {
  if (!st.active || !pts || pts.length < 3 || alpha <= 0.005) return;
  const hex = resolveHex(st.P, color);
  const n = pts.length;
  const pos = new Float32Array((n - 2) * 9);
  const p0 = pts[0];
  for (let i = 1; i < n - 1; i++) {
    const p1 = pts[i], p2 = pts[i + 1], o = (i - 1) * 9;
    pos[o] = p0[0]; pos[o + 1] = p0[1]; pos[o + 2] = p0[2] ?? 0;
    pos[o + 3] = p1[0]; pos[o + 4] = p1[1]; pos[o + 5] = p1[2] ?? 0;
    pos[o + 6] = p2[0]; pos[o + 7] = p2[1]; pos[o + 8] = p2[2] ?? 0;
  }
  const mesh = take('plane', () => {
    const m = new THREE.Mesh(new THREE.BufferGeometry());
    m.frustumCulled = false;
    m.renderOrder = 1;
    return m;
  });
  mesh.geometry.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  mesh.material = getFlatMat(hex, alpha, 1);

  if (borderColor && borderAlpha > 0.01) {
    line([...pts, pts[0]], { color: borderColor, width: 1.5, alpha: borderAlpha });
  }
}

// ThreeDAxes immersivi alla ManimGL: i tre assi x, y, z attraversano tutto lo spazio da -R a +R sfumando
// solo all'orizzonte, portano tacche regolari ogni step, e piazzano la punta e il nome dentro l'inquadratura.
export function axes({ origin = [0, 0, 0], lx = 3, ly = 3, lz = 2.5, step = null, alpha = 1 } = {}) {
  if (!st.active) return null;
  const k = st.V.tilt() * alpha;
  if (k < 0.02) return null;

  const stp = step ?? st.lastFloorStep ?? niceStep(85 / st.P.cam.scale);
  const [ox, oy, oz] = origin;
  const czAbs = Math.abs(st.P.cam.cz || 0) + Math.hypot(st.P.cam.cx || 0, st.P.cam.cy || 0);
  const R = Math.max(34 * stp, lx * 4, ly * 4, lz * 4, czAbs * 2.2);
  const col = st.M.axis;
  const dirs = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];

  // 1) Rette lunghissime [-R, +R] suddivise in 28 tratti con dissolvenza all'orizzonte
  const NSEG = 28;
  const axisPairs = new Float32Array(3 * NSEG * 6);
  const axisAlphas = new Float32Array(3 * NSEG * 2);
  let ai = 0;
  const fadeAt = t => {
    const u = Math.max(0, 1 - Math.abs(t) / R);
    return (u * u) * (t >= 0 ? 0.92 : 0.62);
  };
  for (const [dx, dy, dz] of dirs) {
    for (let i = 0; i < NSEG; i++) {
      const t0 = -R + (2 * R * i) / NSEG, t1 = -R + (2 * R * (i + 1)) / NSEG;
      const o = ai * 6;
      axisPairs[o]     = ox + dx * t0; axisPairs[o + 1] = oy + dy * t0; axisPairs[o + 2] = oz + dz * t0;
      axisPairs[o + 3] = ox + dx * t1; axisPairs[o + 4] = oy + dy * t1; axisPairs[o + 5] = oz + dz * t1;
      axisAlphas[ai * 2] = fadeAt(t0);
      axisAlphas[ai * 2 + 1] = fadeAt(t1);
      ai++;
    }
  }
  drawSegments3d(axisPairs, { color: col, widthPx: 1.85, alpha: k, alphas: axisAlphas });

  // 2) Tacche metriche (ticks) lungo tutti e 3 gli assi x, y, z ogni step
  const NTICKS = 16;
  const tickList = [];
  const tickAlphas = [];
  const upAx = st.lastFloorUp;
  // Versore della tacca per ciascun asse: sul pavimento per gli assi orizzontali, orizzontale per quello verticale
  const tickDirs = upAx === 'z'
    ? [[0, 1, 0], [1, 0, 0], st.V.r]
    : [[0, 0, 1], st.V.r, [1, 0, 0]];

  for (let aIdx = 0; aIdx < 3; aIdx++) {
    const [dx, dy, dz] = dirs[aIdx];
    const [tx, ty, tz] = tickDirs[aIdx];
    for (let m = -NTICKS; m <= NTICKS; m++) {
      if (m === 0) continue;
      const t = m * stp;
      const px = ox + dx * t, py = oy + dy * t, pz = oz + dz * t;
      const hw = 4.6 * pxWorld(px, py, pz);
      const fade = Math.max(0, 1 - Math.abs(m) / (NTICKS + 2));
      const ta = fade * fade * (m > 0 ? 0.80 : 0.55);
      if (ta < 0.04) continue;
      tickList.push(
        px - tx * hw, py - ty * hw, pz - tz * hw,
        px + tx * hw, py + ty * hw, pz + tz * hw,
      );
      tickAlphas.push(ta, ta);
    }
  }
  if (tickList.length) {
    drawSegments3d(new Float32Array(tickList), {
      color: col,
      widthPx: 1.4,
      alpha: k,
      alphas: new Float32Array(tickAlphas),
    });
  }

  // 3) Punte direzionali Manim ed etichette ancorate dentro i margini visibili (evitando anche le pillole in alto a sinistra)
  const cam = st.P.cam;
  const pad = cam.padFn?.() ?? { top: 76, right: 24, bottom: 72, left: 24 };
  const sMinX = pad.left + 40, sMaxX = cam.w - pad.right - 52;
  const sMaxY = cam.h - pad.bottom - 42;
  const inSafe = (sx, sy) => {
    const topLim = sx < 510 ? pad.top + 82 : pad.top + 38;
    return sx >= sMinX && sx <= sMaxX && sy >= topLim && sy <= sMaxY;
  };
  const [c0, d0] = st.V.S(st.P, ox, oy, oz);
  const tips = [];

  for (let aIdx = 0; aIdx < 3; aIdx++) {
    const [dx, dy, dz] = dirs[aIdx];
    // Campiona lungo il semiasse positivo per trovare il punto più lontano ancora ben dentro il quadro sicuro
    let bestT = null;
    for (let s = 1; s <= 48; s++) {
      const t = (R * 0.65 * s) / 48;
      const [sx, sy] = st.V.S(st.P, ox + dx * t, oy + dy * t, oz + dz * t);
      if (inSafe(sx, sy)) {
        bestT = t;
      } else if (bestT !== null) {
        break;
      }
    }
    if (bestT === null) bestT = [lx, ly, lz][aIdx];
    const ex = ox + dx * bestT, ey = oy + dy * bestT, ez = oz + dz * bestT;
    const [sx, sy] = st.V.S(st.P, ex, ey, ez);
    const Lpx = Math.hypot(sx - c0, sy - d0);
    if (Lpx < 18) { tips.push(null); continue; }

    // Piccola punta Manim sul semiasse positivo (senza rifare il fusto, già disegnato dalla retta continua)
    const backT = Math.max(0, bestT - 15 * pxWorld(ex, ey, ez));
    arrow([ox + dx * backT, oy + dy * backT, oz + dz * backT], [ex, ey, ez], {
      color: col, widthPx: 1.85, tipPx: 11, alpha: 0.92 * k, halo: false,
    });

    const ux = (sx - c0) / Lpx, uy = (sy - d0) / Lpx;
    // Sposta il nome leggermente di lato all'asse così la retta che prosegue non taglia la lettera!
    let nx = -uy, ny = ux;
    if (ny > 0.2) { nx = -nx; ny = -ny; }
    const topLim = sx < 510 ? pad.top + 70 : pad.top + 26;
    tips.push({
      tx: Math.min(sMaxX + 18, Math.max(sMinX - 14, sx + ux * 8 + nx * 16)),
      ty: Math.min(sMaxY + 12, Math.max(topLim, sy + uy * 8 + ny * 16)),
    });
  }
  return tips;
}
