import { clamp, deg, niceStep, tn } from '../core/math.js';
import { tex, texBox, arrowS, chargeDisk, drawPlaneAxes, mixHex } from '../core/manim.js';
import { uq, unitView } from '../core/units.js';
import { Stage, arrowPx, arrowMag, brace, rate01, symVal } from '../core/annot.js';
import { camera3d, background3d, orbit3d, axes3d, prism, sphere } from '../core/view3d.js';
import * as m3 from '../core/manim3d.js';
import { space3d } from '../core/space3d.js';
import {
  SEL_L, SEL_H, SLIT_H, PARAMS, PRESETS, GRAPHS, THEORY,
  particleOf, timeUnitOf, timeScale, charTimeSec, fieldAt, lorentzForces, analytics, fmtCmTeX,
  init, step, done, snapshot, stateAt, resumeFrom, sample, formulas,
} from './lorentz-phys.js';

const stage = new Stage();
const V0_CFG = { min: 42, max: 140 };
const V_CFG = { min: 36, max: 118 };
const F_CFG = { min: 32, max: 108 };
const Z_APP = 3.2;     // semiprofondità in z dell'apparato 3D (cm)
const PLATE_T = 0.48;  // spessore delle armature del selettore (cm)
const WALL_T = 0.42;   // spessore dello schermo con fenditura (cm)

let CAM = null;
let SC = 25;

const ptOf = q => (Array.isArray(q) ? [q[0] ?? 0, q[1] ?? 0, q[2] ?? 0] : [q?.x ?? 0, q?.y ?? 0, q?.z ?? 0]);
const paramDef = key => PARAMS.find(d => d.key === key);
const resolveCol = (P, M, k) => M.vec?.[k] ?? M[k] ?? M.body?.[k] ?? P.col(k);
const stepDec = stepVal => Math.max(0, Math.min(10, (String(stepVal ?? 1).split('.')[1] || '').length + 1));

function snapToDef(val, def) {
  if (!def) return val;
  const lo = def.min ?? -Infinity, hi = def.max ?? Infinity;
  if (!(def.step > 0)) return clamp(val, lo, hi);
  const v = Math.round(val / def.step) * def.step;
  return clamp(+v.toFixed(stepDec(def.step)), lo, hi);
}

function v0Range(p) {
  const def = paramDef('v0') ?? { min: 0, max: 1e7, step: 1e4 };
  const maxV = def.max ?? 1e7;
  const qMax = init({ ...p, v0: maxV });
  const maxMs = Math.max(Math.hypot(qMax.vx, qMax.vy, qMax.vz), 1);
  return { def, maxV, maxMs };
}

function viewBox(p) {
  const an = analytics(p);
  const [sx, sy] = ptOf(an.startCm ?? [0, 0, 0]);
  const hasR = Number.isFinite(an.R_cm) && an.R_cm > 0;
  const Rcap = hasR ? Math.min(an.R_cm, 42) : 0;
  const center = an.centerCm ? ptOf(an.centerCm) : null;

  if (p.region === 'spectrometer') {
    let xmin = Math.min(-SEL_L - 2.5, sx - 2.5);
    let xmax = 12;
    let ymin = -SEL_H - 3.6;
    let ymax = SEL_H + 3.6;
    if (hasR) {
      const fSlit = lorentzForces(1, 0, 0, 0.5, 0, 0, p);
      const dirY = center && Math.abs(center[1]) > 1e-6
        ? Math.sign(center[1])
        : (Math.sign(fSlit.FB[1]) || 1);
      const cx = center && Number.isFinite(center[0]) ? clamp(center[0], -4, 4) : 0;
      const cy = center && Number.isFinite(center[1]) ? clamp(center[1], -42, 42) : dirY * Rcap;
      xmax = Math.max(xmax, cx + Rcap + 3.5);
      ymin = Math.min(ymin, Math.min(0, cy - Rcap) - 3.0);
      ymax = Math.max(ymax, Math.max(0, cy + Rcap) + 3.0);
    }
    if (p.show3d) {
      xmin -= 2.5; xmax += 2.5; ymin -= 2; ymax += 2;
    }
    return { xmin, xmax, ymin, ymax };
  }

  if (p.region === 'half') {
    let xmin = Math.min(sx - 3, -6);
    let xmax = Math.max(sx + 16, 14);
    let ymin = -9;
    let ymax = 9;
    if (hasR && center) {
      const dx = center[0] - sx, dy = center[1] - sy, d = Math.hypot(dx, dy) || 1;
      const scale = d > 42 ? 42 / d : 1;
      const cx = sx + dx * scale, cy = sy + dy * scale;
      xmax = Math.max(xmax, cx + Rcap + 3.5);
      ymin = Math.min(ymin, cy - Rcap - 2.5);
      ymax = Math.max(ymax, cy + Rcap + 2.5);
    }
    return { xmin, xmax, ymin, ymax };
  }

  // Regime 'all': campo uniforme in tutto lo spazio.
  if (hasR && center && an.R_cm <= 48) {
    const [cx, cy] = center;
    const hasE = Math.abs(fieldAt(sx, sy, 0, p).Ey) > 1e-6;
    const pad = Math.max(Rcap * 0.35, hasE ? 3 : 1e-5);
    let x0 = Math.min(sx, cx - Rcap) - pad, x1 = Math.max(sx, cx + Rcap) + pad;
    let y0 = Math.min(sy, cy - Rcap) - pad, y1 = Math.max(sy, cy + Rcap) + pad;
    if (p.show3d && Number.isFinite(an.pitch_cm) && Math.abs(an.pitch_cm) > 1e-5) {
      // Proiezione della deriva elicoidale lungo z con l'inquadratura 3/4 (yaw = -34°, pitch = 22°).
      const zSpan = clamp(an.pitch_cm * Math.min(p.cycles ?? 3, 2.2), -56, 56);
      const dx = zSpan * Math.sin(-34 * deg), dy = -zSpan * Math.cos(-34 * deg) * Math.sin(22 * deg);
      x0 = Math.min(x0, cx - Rcap + dx - pad);
      x1 = Math.max(x1, cx + Rcap + dx + pad);
      y0 = Math.min(y0, cy - Rcap + dy - pad);
      y1 = Math.max(y1, cy + Rcap + dy + pad);
    }
    const minSpan = hasE ? 12 : Math.max(Rcap * 2.8, 1e-5);
    const w = Math.max(minSpan, x1 - x0), h = Math.max(minSpan, y1 - y0);
    const mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
    const drift = hasE ? Math.max(w, 2.2 * Rcap) : w;
    return { xmin: mx - drift / 2, xmax: mx + drift / 2, ymin: my - h / 2, ymax: my + h / 2 };
  }
  return { xmin: sx - 8, xmax: sx + 20, ymin: sy - 11, ymax: sy + 11 };
}

// Etichette dei vettori con posizionamento anti-sovrapposizione (modello circular.js).
function labeler(S, P) {
  const placed = [];
  const hits = (x, y, hw, hh) => placed.some(r => Math.abs(r.x - x) < r.hw + hw && Math.abs(r.y - y) < r.hh + hh);
  const put = (a2d, b2d, src, color, key, { clear = 0, delay = 0, alpha = 1, side = null, at = 0.6 } = {}) => {
    if (S.snap) return;
    const la = alpha * rate01(S.grow('arr:' + key, 0.6, delay));
    const [a, b] = P.S(a2d[0], a2d[1]), [c, d] = P.S(b2d[0], b2d[1]), L = Math.hypot(c - a, d - b);
    if (la <= 0.01 || L <= 16) return;
    const ux = (c - a) / L, uy = (d - b) / L, B = texBox(P, src, 17);
    const hw = B.w / 2 + 3, hh = (B.bot - B.top) / 2 + 2;
    let x, y;
    if (side) {
      let nx = -uy, ny = ux;
      if (nx * side[0] + ny * side[1] < 0) { nx = -nx; ny = -ny; }
      const off = 10 + Math.abs(nx) * hw + Math.abs(ny) * hh;
      x = a + (c - a) * (L < 44 ? 1 : at) + nx * off;
      y = b + (d - b) * (L < 44 ? 1 : at) + ny * off;
    } else {
      const dd = clear + 8 + Math.abs(ux) * hw + Math.abs(uy) * hh;
      x = c + ux * dd;
      y = d + uy * dd;
    }
    search: if (hits(x, y, hw, hh)) {
      for (let k = 1; k <= 6; k++) {
        for (const [px, py] of [[-uy, ux], [uy, -ux], [ux, uy], [-ux, -uy]]) {
          const qx = x + px * k * 11, qy = y + py * k * 11;
          if (!hits(qx, qy, hw, hh)) { x = qx; y = qy; break search; }
        }
      }
    }
    const pad = P.cam.padFn?.() ?? { top: 70, right: 20, bottom: 20, left: 20 };
    x = clamp(x, pad.left + hw + 4, P.cam.w - pad.right - hw - 4);
    y = clamp(y, pad.top + hh + 4, P.cam.h - pad.bottom - hh - 4);
    placed.push({ x, y, hw, hh });
    tex(P, x, y - (B.top + B.bot) / 2, src, { size: 17, color: resolveCol(P, S.M, color), halo: S.M.bg, alpha: la });
  };
  put.blockS = (a, b, rx, ry = rx) => placed.push({ x: a, y: b, hw: rx, hh: ry });
  put.block = (pt2d, r) => { const [a, b] = P.S(pt2d[0], pt2d[1]); put.blockS(a, b, r); };
  return put;
}

function drawBSymbol2D(ctx, sx, sy, sign, color, alpha) {
  const r = 7;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = ctx.fillStyle = color;
  ctx.lineWidth = 1.45;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(sx, sy, r, 0, Math.PI * 2);
  ctx.stroke();
  if (sign > 0) {
    ctx.beginPath();
    ctx.arc(sx, sy, 2.2, 0, Math.PI * 2);
    ctx.fill();
  } else {
    const q = r * 0.52;
    ctx.beginPath();
    ctx.moveTo(sx - q, sy - q); ctx.lineTo(sx + q, sy + q);
    ctx.moveTo(sx - q, sy + q); ctx.lineTo(sx + q, sy - q);
    ctx.stroke();
  }
  ctx.restore();
}

function drawFields2D(P, M, p, fade, ui) {
  if (!p.showFields || fade <= 0.01) return;
  const { ctx, cam } = P, sc = cam.scale;
  const { x0, y0, x1, y1 } = cam.bounds();
  const pad = cam.padFn?.() ?? { top: 70, right: 20, bottom: 20, left: 20 };
  const inSafe = (sx, sy) => sx > pad.left + 28 && sx < cam.w - pad.right - 44 && sy > pad.top + 28 && sy < cam.h - pad.bottom - 36;
  const bCol = M.vec.tension, eCol = M.field;

  if (p.region === 'spectrometer') {
    const fSel = fieldAt(-SEL_L / 2, 0, 0, p);
    // Campo E verticale tra le armature del selettore.
    if (Math.hypot(fSel.Ex, fSel.Ey) > 1e-9) {
      const sy = Math.sign(fSel.Ey) || 1;
      const hSpan = SEL_H * 0.72;
      for (const frac of [0.14, 0.32, 0.5, 0.68, 0.86]) {
        const x = -SEL_L * (1 - frac);
        const [a, b] = P.S(x, -sy * hSpan), [c, d] = P.S(x, sy * hSpan);
        arrowS(ctx, a, b, c, d, eCol, { width: 1.8, tip: 8, alpha: 0.62 * fade });
      }
      if (!ui.snapshot) {
        const [lx, ly] = P.S(-SEL_L * 0.41, SEL_H * 0.25);
        tex(P, lx, ly, '\\vec E', { size: 15, color: eCol, halo: M.bg, alpha: 0.9 * fade });
      }
    }
    // Campo B nel selettore (sfalsato rispetto alle frecce di E).
    if (Math.abs(fSel.Bz) > 1e-12) {
      for (const frac of [0.23, 0.41, 0.59, 0.77]) {
        for (const y of [-SEL_H * 0.52, SEL_H * 0.52]) {
          const [sx, sy] = P.S(-SEL_L * (1 - frac), y);
          drawBSymbol2D(ctx, sx, sy, Math.sign(fSel.Bz), bCol, 0.56 * fade);
        }
      }
    }
    // Campo B nella camera (x > 0), centrato nelle celle della griglia.
    const step = niceStep(72 / sc);
    const k0 = Math.max(0, Math.floor(x0 / step)), k1 = Math.ceil(x1 / step);
    const j0 = Math.floor(y0 / step), j1 = Math.ceil(y1 / step);
    let bTag = null;
    for (let k = k0; k <= k1; k++) {
      const x = (k + 0.5) * step;
      if (x < 0.3 || x > x1) continue;
      for (let j = j0; j <= j1; j++) {
        const y = (j + 0.5) * step;
        if (y < y0 || y > y1) continue;
        const f = fieldAt(x, y, 0, p);
        if (Math.abs(f.Bz) <= 1e-12) continue;
        const [sx, sy] = P.S(x, y);
        drawBSymbol2D(ctx, sx, sy, Math.sign(f.Bz), bCol, 0.5 * fade);
        if (!ui.snapshot && inSafe(sx, sy) && (!bTag || sy < bTag[1] + 2)) bTag = [sx, sy];
      }
    }
    if (bTag && !ui.snapshot) {
      tex(P, bTag[0] + 18, bTag[1] - 10, '\\vec B', { size: 15, color: bCol, halo: M.bg, alpha: 0.85 * fade });
    }
    return;
  }

  // Regimi 'all' e 'half': simboli centrati nelle celle della griglia per non toccare gli assi.
  const step = niceStep(74 / sc);
  const k0 = p.region === 'half' ? Math.max(0, Math.floor(Math.max(0, x0) / step)) : Math.floor(x0 / step);
  const k1 = Math.ceil(x1 / step);
  const j0 = Math.floor(y0 / step), j1 = Math.ceil(y1 / step);
  const eLen = Math.min(34, 0.44 * step * sc);
  const fSample = fieldAt(p.region === 'half' ? 2 : 0, 0, 0, p);
  const hasBoth = Math.abs(fSample.Bz) > 1e-12 && Math.hypot(fSample.Ex, fSample.Ey) > 1e-9;
  let bTag = null, eTag = null;

  for (let k = k0; k <= k1; k++) {
    for (let j = j0; j <= j1; j++) {
      const y = (j + 0.5) * step;
      if (y < y0 || y > y1) continue;
      const bx = (k + (hasBoth ? 0.28 : 0.5)) * step;
      if (bx >= x0 && bx <= x1 && (p.region !== 'half' || bx >= 0.25)) {
        const f = fieldAt(bx, y, 0, p);
        if (Math.abs(f.Bz) > 1e-12) {
          const [sx, sy] = P.S(bx, y);
          drawBSymbol2D(ctx, sx, sy, Math.sign(f.Bz), bCol, 0.5 * fade);
          if (!ui.snapshot && inSafe(sx, sy) && (!bTag || sy < bTag[1] + 2)) bTag = [sx, sy];
        }
      }
      const ex = (k + (hasBoth ? 0.72 : 0.5)) * step;
      if (ex >= x0 && ex <= x1 && (p.region !== 'half' || ex >= 0.25)) {
        const fe = fieldAt(ex, y, 0, p), em = Math.hypot(fe.Ex, fe.Ey);
        if (em > 1e-9) {
          const [cx, cy] = P.S(ex, y);
          const dx = (fe.Ex / em) * eLen * 0.5, dy = -(fe.Ey / em) * eLen * 0.5;
          arrowS(ctx, cx - dx, cy - dy, cx + dx, cy + dy, eCol, { width: 1.7, tip: 7.5, alpha: 0.58 * fade });
          if (!ui.snapshot && inSafe(cx, cy) && (!eTag || cy < eTag[1] + 2)) eTag = [cx, cy];
        }
      }
    }
  }
  if (bTag && !ui.snapshot) tex(P, bTag[0] + 16, bTag[1] - 11, '\\vec B', { size: 15, color: bCol, halo: M.bg, alpha: 0.85 * fade });
  if (eTag && !ui.snapshot) tex(P, eTag[0] + 15, eTag[1], '\\vec E', { size: 15, color: eCol, halo: M.bg, alpha: 0.85 * fade });
}

function drawFields3D(P, V, M, p, vbox, fade, ui) {
  if (!p.showFields || fade <= 0.01) return;
  const bCol = M.vec.tension, eCol = M.field;
  const span = Math.max(vbox.xmax - vbox.xmin, vbox.ymax - vbox.ymin, 1e-5);
  const bLen = span * 0.16;

  const vec3 = (a, b, col, width, tip, alpha) => {
    if (m3.is3dActive()) {
      m3.arrow(a, b, { color: col, widthPx: width, tipPx: tip, alpha });
      return;
    }
    const [x0, y0] = V.S(P, ...a), [x1, y1] = V.S(P, ...b);
    arrowS(P.ctx, x0, y0, x1, y1, col, { width, tip, alpha });
  };

  if (p.region === 'spectrometer') {
    const fSel = fieldAt(-SEL_L / 2, 0, 0, p);
    if (Math.hypot(fSel.Ex, fSel.Ey) > 1e-9) {
      const sy = Math.sign(fSel.Ey) || 1, h = SEL_H * 0.72;
      for (const x of [-8, -5, -2]) for (const z of [-1.8, 1.8]) {
        vec3([x, -sy * h, z], [x, sy * h, z], eCol, 1.8, 8, 0.5 * fade);
      }
      if (!ui.snapshot) {
        const [lx, ly] = V.S(P, -2, sy * h, 1.8);
        tex(P, lx + 14, ly, '\\vec E', { size: 15, color: eCol, halo: M.bg, alpha: 0.9 * fade });
      }
    }
    if (Math.abs(fSel.Bz) > 1e-12) {
      const sz = Math.sign(fSel.Bz) * bLen * 0.45;
      for (const x of [-6.5, -3.5]) for (const y of [-2.4, 2.4]) {
        vec3([x, y, -sz], [x, y, sz], bCol, 1.6, 7.5, 0.36 * fade);
      }
    }
    const cx0 = 2.5, cx1 = Math.max(cx0 + 4, Math.min(vbox.xmax - 1.5, 22));
    const cy0 = Math.max(vbox.ymin + 1.8, -10), cy1 = Math.min(vbox.ymax - 1.8, 10);
    let bTip = null;
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
      const x = cx0 + (cx1 - cx0) * i / 2, y = cy0 + (cy1 - cy0) * j / 2;
      const f = fieldAt(x, y, 0, p);
      if (Math.abs(f.Bz) <= 1e-12) continue;
      const sz = Math.sign(f.Bz) * bLen * 0.55;
      vec3([x, y, -sz], [x, y, sz], bCol, 1.9, 8.5, 0.4 * fade);
      if (i === 2 && j === 2) bTip = [x, y, sz];
    }
    if (bTip && !ui.snapshot) {
      const [lx, ly] = V.S(P, ...bTip);
      tex(P, lx + 14, ly, '\\vec B', { size: 16, color: bCol, halo: M.bg, alpha: 0.9 * fade });
    }
    return;
  }

  // Regimi 'all' e 'half': reticolo arioso nel volume della traiettoria.
  // Il riquadro xy è quello del moto nel piano (senza la proiezione della deriva usata per
  // inquadrare la camera 3D); gli strati in z coprono tutta la corsa lungo B.
  const box = viewBox({ ...p, show3d: false });
  const an = analytics(p);
  const fE = fieldAt(p.region === 'half' ? 2 : 0, 0, 0, p), hasE = Math.hypot(fE.Ex, fE.Ey) > 1e-9;
  const cols = [];
  if (p.region === 'all' && !hasE && an.centerCm && Number.isFinite(an.R_cm) && an.R_cm > 0 && an.R_cm <= 48) {
    // Elica o cerchio: otto colonne attorno all'asse, appena fuori dal cilindro della traiettoria.
    const [cx, cy] = an.centerCm, g = an.R_cm * 1.3;
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
      if (i || j) cols.push([cx + i * g, cy + j * g]);
    }
  } else {
    const w = box.xmax - box.xmin, h = box.ymax - box.ymin;
    const x0 = p.region === 'half' ? Math.max(2, box.xmin + w * 0.16) : box.xmin + w * 0.16;
    const x1 = Math.max(x0 + 4, box.xmax - w * 0.16);
    const y0 = box.ymin + h * 0.18, y1 = box.ymax - h * 0.18;
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
      cols.push([x0 + (x1 - x0) * i / 2, y0 + (y1 - y0) * j / 2]);
    }
  }
  const cg = cols.length > 1 ? Math.hypot(cols[1][0] - cols[0][0], cols[1][1] - cols[0][1]) : span * 0.3;

  // Corsa in z: dalla partenza a z0 + vz·t_fine (stessa durata della simulazione).
  const st0 = init(p);
  const zA = st0.z, zB = st0.z + clamp(st0.vz * (p.cycles ?? 3) * charTimeSec(p) * 100, -80, 80);
  const zLo = Math.min(zA, zB), zHi = Math.max(zA, zB);
  // Strati distribuiti su tutta la corsa: il primo e l'ultimo appena dentro gli estremi, così
  // le frecce accompagnano l'elica dall'inizio alla fine senza attraversare il piano z = 0.
  // Con E e B insieme le frecce raddoppiano: meno strati per restare sobri.
  const hasB = Math.abs(fieldAt(cols[0][0], cols[0][1], 0, p).Bz) > 1e-12;
  const nL = 1 + clamp(Math.round((zHi - zLo) / (3 * cg)), 0, hasE && hasB ? 1 : 3);
  const dz = (zHi - zLo) / nL;
  const bL = nL > 1 ? Math.min(bLen, dz * 0.5) : bLen;
  const za = zLo + 0.6 * bL, zb = zHi - 0.6 * bL;
  const layers = nL > 1
    ? Array.from({ length: nL }, (_, k) => za + (zb - za) * k / (nL - 1))
    : [(zLo + zHi) / 2];
  // Etichette solo dove non finiscono sotto la barra o l'ispettore.
  const pad = P.cam.padFn?.() ?? { top: 70, right: 20, bottom: 20, left: 20 };
  const inSafe = q => {
    const [sx, sy] = V.S(P, ...q);
    return sx > pad.left + 28 && sx < P.cam.w - pad.right - 44 && sy > pad.top + 28 && sy < P.cam.h - pad.bottom - 36;
  };
  const better = (q, cur) => inSafe(q) && (!cur || V.S(P, ...q)[1] < V.S(P, ...cur)[1] - 2);
  const eLen = Math.min(span * 0.18, cg * 0.6);
  const ez = Math.min(span * 0.06, nL > 1 ? dz * 0.3 : Infinity);
  const ex0 = cols.length > 1 ? Math.max(...cols.map(c => c[0])) - Math.min(...cols.map(c => c[0])) : span;
  let bTip = null, eTip = null;

  layers.forEach((zc, k) => {
    // Gli strati più lontani dalla partenza si attenuano appena, per dare profondità.
    const depth = nL > 1 ? 1 - 0.25 * k / (nL - 1) : 1;
    for (const [x, y] of cols) {
      const f = fieldAt(x, y, zc, p);
      if (Math.abs(f.Bz) > 1e-12) {
        const sz = Math.sign(f.Bz) * bL * 0.5;
        vec3([x, y, zc - sz], [x, y, zc + sz], bCol, 1.9, 8.5, 0.4 * depth * fade);
        if (k === 0 && better([x, y, zc + sz], bTip)) bTip = [x, y, zc + sz];
      }
      const ex = x + ex0 * 0.14, ey = y, fe = fieldAt(ex, ey, zc, p);
      if (Math.hypot(fe.Ex, fe.Ey) > 1e-9) {
        const em = Math.hypot(fe.Ex, fe.Ey), ux = fe.Ex / em * eLen * 0.5, uy = fe.Ey / em * eLen * 0.5;
        vec3([ex - ux, ey - uy, zc + ez], [ex + ux, ey + uy, zc + ez], eCol, 1.9, 8.5, 0.46 * depth * fade);
        if (k === 0 && better([ex + ux, ey + uy, zc + ez], eTip)) eTip = [ex + ux, ey + uy, zc + ez];
      }
    }
  });
  if (bTip && !ui.snapshot) {
    const [lx, ly] = V.S(P, ...bTip);
    tex(P, lx + 14, ly, '\\vec B', { size: 16, color: bCol, halo: M.bg, alpha: 0.9 * fade });
  }
  if (eTip && !ui.snapshot) {
    const [lx, ly] = V.S(P, ...eTip);
    tex(P, lx + 14, ly - 8, '\\vec E', { size: 16, color: eCol, halo: M.bg, alpha: 0.9 * fade });
  }
}

function drawBoundaryHalf(P, V, M, vbox, tilt) {
  const y0 = vbox.ymin, y1 = vbox.ymax;
  if (tilt < 0.08) {
    V.line(P, [[0, y0, 0], [0, y1, 0]], { color: 'muted', width: 1.6, dash: [6, 5], alpha: 0.75 });
  } else {
    const z = Z_APP;
    V.poly(P, [[0, y0, -z], [0, y1, -z], [0, y1, z], [0, y0, z]], { fill: M.muted, alpha: 0.06 * tilt });
    V.line(P, [[0, y0, -z], [0, y1, -z], [0, y1, z], [0, y0, z], [0, y0, -z]], { color: 'muted', width: 1.3, dash: [5, 5], alpha: 0.65 * tilt });
  }
}

function drawSign2D(ctx, sx, sy, pos, color, alpha) {
  const q = 3.4;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.8;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(sx - q, sy); ctx.lineTo(sx + q, sy);
  if (pos) { ctx.moveTo(sx, sy - q); ctx.lineTo(sx, sy + q); }
  ctx.stroke();
  ctx.restore();
}

function drawSpectrometer(P, V, M, p, vbox, s, tilt) {
  const ctx = P.ctx, sc = P.cam.scale;
  const fSel = fieldAt(-SEL_L / 2, 0, 0, p);
  const ePol = Math.abs(fSel.Ey) > 1e-9 ? Math.sign(fSel.Ey) : (Math.sign(p.E ?? 0) || 0);
  // Ey > 0: campo dal basso (+) verso l'alto (−). Ey < 0: dall'alto (+) verso il basso (−).
  const topSign = -ePol, botSign = ePol;
  const plateColor = sg => (sg > 0 ? mixHex(M.pos, M.bg, 0.3) : sg < 0 ? mixHex(M.neg, M.bg, 0.3) : M.solid);
  const plateEdge = sg => (sg > 0 ? M.pos : sg < 0 ? M.neg : M.solidEdge);

  const hitY = s.hit === 'detector' && s.hitPos ? Math.abs(ptOf(s.hitPos)[1]) : 0;
  const wallTop = Math.max(SEL_H + 1.5, hitY + 2, vbox.ymax - 0.5);
  const wallBot = Math.min(-SEL_H - 1.5, -hitY - 2, vbox.ymin + 0.5);
  const tVis2D = Math.max(PLATE_T, 9 / sc);

  const items = [
    {
      kind: 'plate', y0: -SEL_H - PLATE_T, y1: -SEL_H, y2d0: -SEL_H - tVis2D, y2d1: -SEL_H,
      sg: botSign, depth: V.depth(-SEL_L / 2, -SEL_H, 0),
    },
    {
      kind: 'plate', y0: SEL_H, y1: SEL_H + PLATE_T, y2d0: SEL_H, y2d1: SEL_H + tVis2D,
      sg: topSign, depth: V.depth(-SEL_L / 2, SEL_H, 0),
    },
    {
      kind: 'wall', y0: wallBot, y1: -SLIT_H, depth: V.depth(0, (wallBot - SLIT_H) / 2, 0),
    },
    {
      kind: 'wall', y0: SLIT_H, y1: wallTop, depth: V.depth(0, (SLIT_H + wallTop) / 2, 0),
    },
  ];
  items.sort((a, b) => a.depth - b.depth);

  for (const it of items) {
    if (it.kind === 'plate') {
      const fill = plateColor(it.sg), edge = plateEdge(it.sg);
      if (tilt < 0.06) {
        const poly = [[-SEL_L, it.y2d0], [0, it.y2d0], [0, it.y2d1], [-SEL_L, it.y2d1]];
        P.poly(poly, { fill, stroke: edge, width: 1.5, alpha: 0.9 });
        if (it.sg !== 0) {
          const ym = (it.y2d0 + it.y2d1) / 2;
          for (let i = 0; i < 5; i++) {
            const [sx, sy] = P.S(-SEL_L * (0.12 + 0.76 * i / 4), ym);
            drawSign2D(ctx, sx, sy, it.sg > 0, '#ffffff', 0.92);
          }
        }
      } else {
        const poly = [[-SEL_L, it.y0], [0, it.y0], [0, it.y1], [-SEL_L, it.y1]];
        prism(P, V, poly, -Z_APP, Z_APP, { fill, stroke: edge, alpha: 0.62 });
        if (it.sg !== 0) {
          const ym = (it.y0 + it.y1) / 2;
          for (let i = 0; i < 5; i++) {
            const [sx, sy] = V.S(P, -SEL_L * (0.12 + 0.76 * i / 4), ym, Z_APP);
            drawSign2D(ctx, sx, sy, it.sg > 0, '#ffffff', 0.9);
          }
        }
      }
    } else {
      const poly = [[-WALL_T, it.y0], [0, it.y0], [0, it.y1], [-WALL_T, it.y1]];
      if (tilt < 0.06) {
        P.poly(poly, { fill: M.solid, stroke: M.solidEdge, width: 1.4, alpha: 0.88 });
        // Faccia rivelatrice lungo x = 0 rivolta verso la camera magnetica con tacche graduate.
        P.line([[0, it.y0], [0, it.y1]], { color: 'text', width: 2.2, alpha: 0.85 });
        const stepT = 2;
        for (let y = Math.ceil(it.y0 / stepT) * stepT; y <= it.y1; y += stepT) {
          if (Math.abs(y) < SLIT_H + 0.2) continue;
          P.line([[-WALL_T * 0.45, y], [0, y]], { color: 'muted', width: 1, alpha: 0.6 });
        }
      } else {
        prism(P, V, poly, -Z_APP, Z_APP, { fill: M.solid, stroke: M.solidEdge, alpha: 0.5 });
        V.line(P, [[0, it.y0, Z_APP], [0, it.y1, Z_APP]], { color: 'text', width: 2, alpha: 0.75 });
      }
    }
  }
}

function drawIdealGuide(P, V, S, M, p, an, tilt, ui, lab) {
  if (!p.showIdeal) return;
  const g = S.grow('ideal', 0.85);
  if (g <= 0.01) return;
  const [sx, sy, sz] = ptOf(an.startCm ?? [0, 0, 0]);
  const R = an.R_cm, hasR = Number.isFinite(R) && R > 1e-6 && R < 500;

  if (p.region === 'spectrometer') {
    V.line(P, [[-SEL_L, 0, sz], [0, 0, sz]], { color: 'ideal', width: 1.3, dash: [5, 5], alpha: 0.65 * g });
  }
  if (!hasR || !an.centerCm) return;
  const [cx, cy] = ptOf(an.centerCm);
  if (p.region === 'all') {
    const f0 = fieldAt(sx, sy, sz, p);
    if (Math.hypot(f0.Ex, f0.Ey) > 1e-6) return;
  }

  // Semicerchio in x >= 0 per 'spectrometer'/'half', circonferenza intera in 'all'.
  const ringPts = V.ring([cx, cy, sz], R, 'z', 120);
  if (p.region === 'all') {
    V.line(P, ringPts, { color: 'ideal', width: 1.35, dash: [5, 5], alpha: 0.65 * g });
  } else {
    let seg = [];
    for (const q of ringPts) {
      if (q[0] >= -0.05) seg.push(q);
      else if (seg.length > 1) { V.line(P, seg, { color: 'ideal', width: 1.35, dash: [5, 5], alpha: 0.68 * g }); seg = []; }
      else seg = [];
    }
    if (seg.length > 1) V.line(P, seg, { color: 'ideal', width: 1.35, dash: [5, 5], alpha: 0.68 * g });
  }

  // Centro e raggio R annotato con symVal.
  const [ocx, ocy] = V.p(cx, cy, sz);
  P.circle(ocx, ocy, 3, { fill: 'muted', alpha: 0.85 * g });
  const ang = p.region === 'all'
    ? Math.atan2(sy - cy, sx - cx) + 2.15
    : (cy >= 0 ? -Math.PI / 6 : Math.PI / 6);
  const rx = cx + R * Math.cos(ang), ry = cy + R * Math.sin(ang);
  V.line(P, [[cx, cy, sz], [rx, ry, sz]], { color: 'muted', width: 1.25, dash: [3, 4], alpha: 0.8 * g });
  if (!ui.snapshot && g > 0.4 && R * P.cam.scale > 20) {
    const [mx, my] = V.S(P, (cx + rx) / 2, (cy + ry) / 2, sz);
    const [p0x, p0y] = V.S(P, cx, cy, sz), [p1x, p1y] = V.S(P, rx, ry, sz);
    const len = Math.hypot(p1x - p0x, p1y - p0y) || 1;
    let nx = -(p1y - p0y) / len, ny = (p1x - p0x) / len;
    if (ny > 0) { nx = -nx; ny = -ny; }
    const src = symVal(P, 'R', fmtCmTeX(R)), B = texBox(P, src, 15);
    const tx = mx + nx * 16, ty = my + ny * 16;
    tex(P, tx, ty, src, { size: 15, color: M.text, halo: M.bg, alpha: 0.9 * g });
    lab?.blockS(tx, ty, B.w / 2 + 4, (B.bot - B.top) / 2 + 3);
  }

  // Elica guida e passo elicoidale p in 3D quando v_z != 0.
  const pitch = an.pitch_cm;
  if (tilt > 0.1 && p.region === 'all' && Number.isFinite(pitch) && Math.abs(pitch) > 1e-5 && Math.abs(pitch) < 60) {
    const th0 = Math.atan2(sy - cy, sx - cx), turns = 1.25, n = 90, hPts = [];
    const dir = Math.sign(an.qOverM || 1) * (Math.sign(fieldAt(sx, sy, sz, p).Bz) || 1);
    const wSign = dir ? -dir : 1;
    for (let i = 0; i <= n; i++) {
      const f = i / n, a = th0 + wSign * 2 * Math.PI * turns * f;
      hPts.push([cx + R * Math.cos(a), cy + R * Math.sin(a), sz + pitch * turns * f]);
    }
    V.line(P, hPts, { color: 'ideal', width: 1.2, dash: [4, 5], alpha: 0.45 * tilt * g });
    V.line(P, V.ring([cx, cy, sz + pitch], R, 'z', 80), { color: 'ideal', width: 1, dash: [3, 5], alpha: 0.3 * tilt * g });
    // Segmento del passo sul bordo esterno del cerchio (lontano dall'asse z).
    const pxW = cx + R, pyW = cy;
    V.line(P, [[pxW, pyW, sz], [pxW, pyW, sz + pitch]], { color: 'tension', width: 1.4, dash: [3, 4], alpha: 0.8 * tilt * g });
    if (!ui.snapshot && g > 0.4) {
      const [px, py] = V.S(P, pxW, pyW, sz + pitch * 0.5);
      const src = symVal(P, 'p', fmtCmTeX(Math.abs(pitch)));
      tex(P, px + 14, py, src, { size: 14, color: M.vec.tension, halo: M.bg, align: 'left', alpha: 0.9 * tilt * g });
    }
  }
}

function drawTrail3D(P, V, M, s, p, partCol, tilt) {
  const pts = s.trail?.length ? s.trail.slice() : [[s.x, s.y, s.z]];
  const last = pts[pts.length - 1];
  if (Math.hypot(s.x - last[0], s.y - last[1], s.z - last[2]) > 1e-7) pts.push([s.x, s.y, s.z]);
  if (pts.length < 2) return;

  // Proiezione sul piano xy (z = 0) in vista 3D.
  if (p.showProj && tilt > 0.03) {
    V.line(P, pts.map(([x, y]) => [x, y, 0]), { color: 'muted', width: 1.4, dash: [4, 5], alpha: 0.65 * tilt });
    if (Math.abs(s.z) > 1e-6) {
      V.line(P, [[s.x, s.y, s.z], [s.x, s.y, 0]], { color: 'muted', width: 1.3, dash: [3, 4], alpha: 0.75 * tilt });
      const [px, py] = V.p(s.x, s.y, 0);
      P.circle(px, py, 3.8, { fill: 'muted', stroke: M.bg, width: 1, alpha: 0.85 * tilt });
    }
  }

  // Scia principale a tratti sfumati nel tempo.
  if (m3.is3dActive()) {
    m3.tube(pts, { color: partCol, widthPx: 2.5, alpha: 0.92, fadeTail: true });
    return;
  }
  const n = pts.length, chunk = Math.max(2, Math.ceil(n / 32));
  for (let i = 0; i < n - 1; i += chunk) {
    const a = 0.2 + 0.72 * (i / n);
    V.line(P, pts.slice(i, i + chunk + 1), { color: partCol, width: 2.3, alpha: a });
  }
}

function drawParticle(P, V, S, M, s, part, partCol, sc, ui, tilt) {
  const rPx = clamp(0.45 * sc, 9, 15) * (ui.size?.('particle') ?? 1) * S.born('particle');
  if (rPx <= 0.5) return;
  const [sx2d, sy2d] = V.p(s.x, s.y, s.z);
  const [ax, ay] = P.S(sx2d, sy2d);
  const selected = ui.sel === 'particle';
  const signTxt = part.sign === 0 ? '0' : Math.abs(part.qE) === 1 ? (part.sign > 0 ? '+' : '−') : `${Math.abs(part.qE)}${part.sign > 0 ? '+' : '−'}`;

  if (tilt < 0.08 && Math.abs(part.qE) === 1) {
    chargeDisk(P.ctx, ax, ay, rPx, part.sign > 0 ? 1 : 0, M, selected, true);
    return;
  }

  const ctx = P.ctx, isHex = /^#[0-9a-f]{6}$/i.test(partCol);
  const edgeCol = isHex ? mixHex(partCol, '#ffffff', 0.45) : partCol;
  ctx.save();
  if (isHex) {
    const g = ctx.createRadialGradient(ax, ay, rPx * 0.5, ax, ay, rPx * 2.3);
    g.addColorStop(0, partCol + (M.dark ? '55' : '33'));
    g.addColorStop(1, partCol + '00');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(ax, ay, rPx * 2.3, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();

  if (tilt >= 0.08) {
    sphere(P, V, [s.x, s.y, s.z], rPx / sc, { color: partCol, edge: edgeCol, alpha: 0.96, mesh: false, glow: true });
    if (!m3.is3dActive()) P.circle(sx2d, sy2d, rPx * 0.62, { fill: partCol, alpha: 0.6 });
  } else {
    P.circle(sx2d, sy2d, rPx, { fill: partCol, stroke: edgeCol, width: 1.5, alpha: 0.95 });
  }
  if (selected) P.ringS(ax, ay, rPx + 6);

  ctx.save();
  ctx.fillStyle = '#ffffff';
  ctx.font = `700 ${Math.round(rPx * (signTxt.length > 1 ? 0.9 : 1.15))}px -apple-system, BlinkMacSystemFont, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(signTxt, ax, ay + 0.5);
  ctx.restore();
}

function drawDetectorHit(P, V, M, s, partCol, tilt, ui, lab) {
  if (!s.hit || !s.hitPos) return;
  const [hx, hy, hz] = ptOf(s.hitPos);
  const [px, py] = V.p(hx, hy, hz);
  P.circle(px, py, 7, { fill: partCol, alpha: 0.28 });
  P.circle(px, py, 3.8, { fill: partCol, stroke: M.bg, width: 1.2, alpha: 0.95 });
  if (s.hit !== 'detector' || Math.abs(hy) < 0.05) return;

  const dTeX = symVal(P, 'd', uq('cm', Math.abs(hy), 2));
  if (tilt < 0.08) {
    const side = hy >= 0 ? -1 : 1;
    brace(P, [0, 0], [0, hy], dTeX, { side, gap: 10, size: 15, color: M.text, alpha: 0.9 });
    if (!ui.snapshot && lab) {
      const [mx, my] = P.S(0, hy / 2), B = texBox(P, dTeX, 15);
      lab.blockS(mx + 34, my, B.w / 2 + 8, (B.bot - B.top) / 2 + 4);
    }
  } else {
    V.line(P, [[0, 0, hz], [0, hy, hz]], { color: 'text', width: 1.8, dash: [3, 4], alpha: 0.8 });
    if (!ui.snapshot) {
      const [mx, my] = V.S(P, 0, hy * 0.5, hz);
      tex(P, mx + 14, my, dTeX, { size: 15, color: M.text, halo: M.bg, align: 'left', alpha: 0.9 });
    }
  }
}

function drawVectors(P, V, S, M, s, p, an, sc, ui, lab) {
  const fresh = s.t === 0;
  const pos = [s.x, s.y, s.z];
  const [px2, py2] = V.p(...pos);
  const { def: v0Def, maxV, maxMs } = v0Range(p);
  const rPart = clamp(0.45 * sc, 9, 15) * (ui.size?.('particle') ?? 1);
  lab.block([px2, py2], rPart + 4);

  if (fresh) {
    if (p.showVel !== false) {
      const th = ('theta' in p ? p.theta : Math.atan2(s.vy, s.vx) / deg) * deg, ux = Math.cos(th), uy = Math.sin(th);
      const Lh = Math.max(p.v0 > 0 ? arrowPx(p.v0, maxV, V0_CFG) : 0, V0_CFG.min) / sc;
      const h3 = [pos[0] + ux * Lh, pos[1] + uy * Lh, pos[2]];
      const [hx2, hy2] = V.p(...h3);
      if (!ui.snapshot) lab.block([hx2, hy2], 14);

      if (p.v0 > 0) {
        const vMag = Math.hypot(s.vx, s.vy, s.vz);
        if (Math.abs(s.vz) > 1e-6 && vMag > 1e-6) {
          const L3 = arrowPx(vMag, Math.max(vMag, maxMs * 0.15), V_CFG) / sc;
          const t3 = [pos[0] + s.vx / vMag * L3, pos[1] + s.vy / vMag * L3, pos[2] + s.vz / vMag * L3];
          V.arrow(P, pos, h3, { color: 'vel', key: 'v0xy', width: 2.2, dash: [4, 4], alpha: 0.7 });
          V.arrow(P, pos, t3, { color: 'vel', key: 'v0', width: 3.4 });
          const [a2, b2] = [V.p(...pos), V.p(...t3)];
          lab(a2, b2, '\\vec v_0', 'vel', 'v0', { clear: 4 });
        } else {
          V.arrow(P, pos, h3, { color: 'vel', key: 'v0', width: 3.4 });
          const [a2, b2] = [V.p(...pos), V.p(...h3)];
          lab(a2, b2, '\\vec v_0', 'vel', 'v0', { clear: 14, side: [0, -1], at: 0.65 });
        }
      }
      if (!ui.snapshot) {
        for (const hd of [{ id: 'v0', x: hx2, y: hy2 }]) P.handle(hd.x, hd.y, ui.active === hd.id);
      }
    }
  } else if (p.showVel !== false) {
    const vMag = Math.hypot(s.vx, s.vy, s.vz);
    if (vMag > 1e-6) {
      const q0 = init(p), v0Ms = Math.hypot(q0.vx, q0.vy, q0.vz);
      const vRef = Math.max(v0Ms * 1.5, maxMs * 0.05, vMag, 1);
      const Lv = arrowPx(vMag, vRef, V_CFG) / sc;
      const t3 = [pos[0] + s.vx / vMag * Lv, pos[1] + s.vy / vMag * Lv, pos[2] + s.vz / vMag * Lv];
      V.arrow(P, pos, t3, { color: 'vel', key: 'v', width: 3.4 });
      lab([px2, py2], V.p(...t3), '\\vec v', 'vel', 'v');
    }
  }

  // Vettori forza: se la particella è selezionata (ui.sel === 'particle'), parla il diagramma di corpo libero.
  const showForces = p.showForces ?? p.showForce ?? true;
  if (!showForces || ui.sel === 'particle') return;
  const { FE, FB, F } = lorentzForces(s.vx, s.vy, s.vz, s.x, s.y, s.z, p);
  const feM = Math.hypot(...FE), fbM = Math.hypot(...FB), fM = Math.hypot(...F);
  const fRef = Math.max(feM, fbM, fM);
  if (fRef <= 1e-30) return;
  const tol = fRef * 1e-3;
  const both = feM > tol && fbM > tol;
  const parallel = both && (FE[0] * FB[0] + FE[1] * FB[1] + FE[2] * FB[2]) > 0.96 * feM * fbM;
  const drawF = (vec, mag, col, key, texLbl, opts = {}) => {
    if (mag <= tol) return;
    const Lf = arrowPx(mag, fRef, F_CFG) / sc;
    const end = [pos[0] + vec[0] / mag * Lf, pos[1] + vec[1] / mag * Lf, pos[2] + vec[2] / mag * Lf];
    const [e2x, e2y] = V.p(...end);
    let ox = 0, oy = 0;
    if (opts.lat) {
      const dx = e2x - px2, dy = e2y - py2, d = Math.hypot(dx, dy) || 1;
      ox = -dy / d * opts.lat / sc; oy = dx / d * opts.lat / sc;
    }
    if (m3.is3dActive()) {
      const a3 = [pos[0] + ox, pos[1] + oy, pos[2]], b3 = [end[0] + ox, end[1] + oy, end[2]];
      m3.arrow(a3, b3, { color: col, widthPx: opts.width ?? 3, dashed: !!opts.dash });
      lab(V.p(...a3), V.p(...b3), texLbl, col, key, { side: opts.side ?? null, at: opts.at ?? 0.65 });
      return;
    }
    const [p0x, p0y] = V.p(...pos);
    P.arrow(p0x + ox, p0y + oy, e2x + ox, e2y + oy, { color: col, key, width: opts.width ?? 3, dash: opts.dash ?? null });
    lab([p0x + ox, p0y + oy], [e2x + ox, e2y + oy], texLbl, col, key, { side: opts.side ?? null, at: opts.at ?? 0.65 });
  };

  const onYAxis = Math.abs(pos[0]) < 0.25 && Math.abs(FE[0]) < 1e-30 && Math.abs(FB[0]) < 1e-30;
  const inSel = p.region === 'spectrometer' && pos[0] < 0;
  const fSide = inSel ? [1, 0] : (onYAxis ? [-1, 0] : null);
  drawF(FE, feM, 'applied', 'FE', '\\vec F_E', { lat: parallel ? -5 : 0, side: parallel ? [-1, 0] : (inSel ? [1, 0] : (onYAxis ? [1, 0] : null)), at: 0.62 });
  drawF(FB, fbM, 'normal', 'FB', '\\vec F_B', { lat: parallel ? 5 : 0, side: parallel ? [1, 0] : fSide, at: 0.62 });
  if (both && fM > fRef * 0.025) {
    drawF(F, fM, 'weight', 'F', '\\vec F', { width: 2.6, dash: [5, 4], side: [1, -1], at: 0.8 });
  }
  void an;
  void v0Def;
}

function drawAxes3d(P, V, M, origin, lx, ly, lz, ui, uName = unitView('cm').name) {
  const k = V.tilt();
  if (k < 0.15) return;
  const fade = Math.min(1, (k - 0.15) / 0.35);
  const labels = [`x\\ (\\mathrm{${uName}})`, `y\\ (\\mathrm{${uName}})`, `z\\ (\\mathrm{${uName}})`];
  if (m3.is3dActive()) {
    axes3d(P, V, { origin, lx, ly, lz, labels, size: 15, alpha: fade, snap: !!ui.snapshot });
    return;
  }
  const [ox, oy, oz] = origin;
  const pad = P.cam.padFn?.() ?? { top: 70, right: 20, bottom: 20, left: 20 };
  const sMinX = pad.left + 26, sMaxX = P.cam.w - pad.right - 34;
  const sMinY = pad.top + 22, sMaxY = P.cam.h - pad.bottom - 22;
  const ax = [
    ['x', [ox + lx, oy, oz], labels[0]],
    ['y', [ox, oy + ly, oz], labels[1]],
    ['z', [ox, oy, oz + lz], labels[2]],
  ];
  const [c, d] = V.S(P, ox, oy, oz);
  const placed = [];
  for (const [, e, lbl] of ax) {
    let [a, b] = V.S(P, ...e);
    const B = texBox(P, lbl, 15);
    let f = 1;
    const mx = B.w / 2 + 12, my = (B.bot - B.top) / 2 + 12;
    if (a > sMaxX - mx && a > c + 5) f = Math.min(f, (sMaxX - mx - c) / (a - c));
    if (a < sMinX + mx && a < c - 5) f = Math.min(f, (c - sMinX - mx) / (c - a));
    if (b < sMinY + my && b < d - 5) f = Math.min(f, (d - sMinY - my) / (d - b));
    if (b > sMaxY - my && b > d + 5) f = Math.min(f, (sMaxY - my - d) / (b - d));
    f = Math.max(0.25, f);
    a = c + (a - c) * f; b = d + (b - d) * f;
    const L = Math.hypot(a - c, b - d);
    if (L < 22) continue;
    arrowS(P.ctx, c, d, a, b, M.axis, { width: 2, tip: 10, alpha: 0.85 * fade });
    if (ui.snapshot) continue;
    const ux = (a - c) / L, uy = (b - d) / L;
    const off = 10 + Math.abs(ux) * B.w / 2 + Math.abs(uy) * (B.bot - B.top) / 2;
    const tx = a + ux * off, ty = b + uy * off, hw = B.w / 2 + 4, hh = (B.bot - B.top) / 2 + 4;
    if (placed.some(r => Math.abs(r.x - tx) < r.hw + hw && Math.abs(r.y - ty) < r.hh + hh)) continue;
    placed.push({ x: tx, y: ty, hw, hh });
    tex(P, tx, ty, lbl, { size: 15, color: M.text, halo: M.bg, alpha: fade });
  }
}

export default {
  id: 'lorentz',
  title: 'Cariche in campi E e B',
  subtitle: 'Forza di Lorentz, moto ciclotronico e selettore di velocità',
  axes: true,
  timeUnit: p => timeUnitOf(p),
  timeScale: (s, p) => timeScale(s, p),

  params: PARAMS,
  presets: PRESETS,
  graphs: GRAPHS,
  theory: THEORY,

  view(p) { return viewBox(p); },
  init(p) { return init(p); },
  step(s, dtUnit, p) { step(s, dtUnit, p); },
  done(s) { return done(s); },
  snapshot(s) { return snapshot(s); },
  stateAt(sim, snap) { return stateAt(sim, snap); },
  resumeFrom(sim, snap) { return resumeFrom(sim, snap); },
  sample(s, p) { return sample(s, p); },
  formulas(s, p) { return formulas(s, p); },

  derivation() {
    return {
      title: 'Raggio di ciclotrone in campo magnetico',
      steps: [
        { tex: 'F_L = F_c', note: 'La forza di Lorentz fornisce la forza centripeta' },
        { tex: '|q| v B = m \\frac{v^2}{R}', note: 'Esplicitiamo entrambe le forze' },
        { indicate: 'v', note: 'Semplifichiamo una potenza della velocità v' },
        { tex: '|q| B = m \\frac{v}{R}', note: 'Isoliamo il raggio R' },
        { tex: 'R = \\frac{m v}{|q| B}', note: 'Raggio di ciclotrone (raggio di Larmor)' },
        { box: 'R = \\frac{m v}{|q| B}', note: 'Base dello spettrometro di massa per separare gli isotopi' },
      ],
    };
  },

  handles(s, p) {
    if (!CAM || s.t !== 0 || p.showVel === false) return [];
    const an = analytics(p);
    const [sx, sy, sz] = ptOf(an.startCm ?? [s.x, s.y, s.z]);
    const { maxV } = v0Range(p);
    const L = Math.max(p.v0 > 0 ? arrowPx(p.v0, maxV, V0_CFG) : 0, V0_CFG.min) / SC;
    const th = ('theta' in p ? p.theta : Math.atan2(s.vy, s.vx) / deg) * deg;
    const [hx, hy] = CAM.p(sx + L * Math.cos(th), sy + L * Math.sin(th), sz);
    return [{ id: 'v0', x: hx, y: hy }];
  },

  drag(id, sx, sy, p) {
    if (id !== 'v0') return;
    const an = analytics(p);
    const [sx0, sy0, sz0] = ptOf(an.startCm ?? [0, 0, 0]);
    const [wx, wy] = CAM ? CAM.unproject(sx, sy, sz0) : [sx, sy];
    const dx = wx - sx0, dy = wy - sy0, distPx = Math.hypot(dx, dy) * SC;
    const { def: v0Def, maxV } = v0Range(p);
    p.v0 = snapToDef(arrowMag(distPx, maxV, V0_CFG), v0Def);
    const thDef = paramDef('theta');
    if (thDef && distPx > 8) {
      let ang = Math.atan2(dy, dx) / deg;
      if ((thDef.min ?? -180) >= 0 && ang < 0) ang += 360;
      p.theta = snapToDef(ang, thDef);
    }
  },

  bodies(s, p, { scale, size }) {
    if (!CAM) return [];
    const part = particleOf(p);
    const [X, Y] = CAM.p(s.x, s.y, s.z);
    const { FE, FB, F, a } = lorentzForces(s.vx, s.vy, s.vz, s.x, s.y, s.z, p);
    const feM = Math.hypot(FE[0], FE[1]), fbM = Math.hypot(FB[0], FB[1]);
    const fMax = Math.max(feM, fbM);
    const exp = fMax > 0 ? Math.floor(Math.log10(fMax)) - 1 : 0;
    const fScale = fMax > 0 ? 10 ** (-exp) : 1;
    const forces = [];
    if (feM > 0) forces.push({ name: 'F_E', fx: FE[0] * fScale, fy: FE[1] * fScale, color: 'applied' });
    if (fbM > 0) forces.push({ name: 'F_B', fx: FB[0] * fScale, fy: FB[1] * fScale, color: 'normal' });
    const { maxMs } = v0Range(p);
    const vScale = 5 / Math.max(maxMs, 1);
    const rPx = clamp(0.45 * scale, 9, 15) * size('particle');
    const note = fMax > 0
      ? `\\text{forze scalate di } 10^{${-exp}}\\ (|F_E|=${tn(feM * fScale, 2)},\\ |F_B|=${tn(fbM * fScale, 2)})`
      : '\\text{nessuna forza agente sulla particella}';
    const BODY_COL = { red: 'weight', blue: 'vel', green: 'normal', yellow: 'acc', pos: 'weight', neg: 'vel' };
    const col = BODY_COL[part.color] ?? part.color ?? 'vel';
    void a;
    return [{
      key: 'particle',
      title: `\\text{${part.name}}`,
      x: X, y: Y, wx: s.x, wy: s.y, z: s.z,
      proj: (x, y, z = 0) => CAM.p(x, y, z),
      rPx: Math.max(12, rPx),
      m: 1,
      color: col,
      forces,
      a: [F[0] * fScale, F[1] * fScale],
      v: [s.vx * vScale, s.vy * vScale],
      params: ['v0', 'B', 'E'],
      note,
    }];
  },

  mount() { stage.reset(); },
  drawBackground: background3d('lorentz', { labels: false }),
  orbit(dx, dy, p) { return orbit3d('lorentz', p.show3d, dx, dy); },

  draw(P, s, p, ui) {
    const S = stage.begin(P, ui), M = S.M, sc = P.cam.scale;
    const V = camera3d(S, 'lorentz', p.show3d, 22 * deg, -34 * deg, { up: 'y' });
    const tilt = V.tilt();
    if (!ui.snapshot) { SC = sc; CAM = V; }

    const vbox = viewBox(p);
    const span = Math.max(vbox.xmax - vbox.xmin, vbox.ymax - vbox.ymin, 1e-5);
    const axisUnit = span < 0.08
      ? { unit: 'µm', k: 1e4, lbl: '\\mu m' }
      : span < 0.8
        ? { unit: 'mm', k: 10, lbl: 'mm' }
        : { unit: 'cm', k: 1, lbl: unitView('cm').name };
    space3d(P, V, { origin: [0, 0, 0], up: 'y', step: niceStep(span / 10) });
    if (!ui.snapshot && tilt < 0.05) drawPlaneAxes(P, M, { unit: axisUnit.unit, k: axisUnit.k });

    const fade2d = clamp(1 - tilt / 0.08, 0, 1);
    const fade3d = clamp((tilt - 0.05) / 0.22, 0, 1);
    drawFields2D(P, M, p, fade2d, ui);
    drawFields3D(P, V, M, p, vbox, fade3d, ui);

    if (p.region === 'half') drawBoundaryHalf(P, V, M, vbox, tilt);
    if (p.region === 'spectrometer') drawSpectrometer(P, V, M, p, vbox, s, tilt);

    const an = analytics(p);
    const lab = labeler(S, P);
    drawIdealGuide(P, V, S, M, p, an, tilt, ui, lab);

    const part = particleOf(p);
    const partCol = resolveCol(P, M, part.color ?? 'vel');
    drawTrail3D(P, V, M, s, p, partCol, tilt);
    drawDetectorHit(P, V, M, s, partCol, tilt, ui, lab);
    drawParticle(P, V, S, M, s, part, partCol, sc, ui, tilt);
    drawVectors(P, V, S, M, s, p, an, sc, ui, lab);

    const lx = clamp(Math.abs(vbox.xmax) * 0.85, span * 0.3, span * 0.55);
    const ly = clamp(Math.abs(vbox.ymax) * 0.85, span * 0.3, span * 0.55);
    const lz = Math.min(lx, ly) * 0.9;
    drawAxes3d(P, V, M, [0, 0, 0], lx, ly, lz, ui, axisUnit.lbl);
  },
};
