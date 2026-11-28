import { clamp, deg, niceStep, tn } from '../core/math.js';
import { tex, texBox, arrowS, chargeDisk, drawPlaneAxes, mixHex } from '../core/manim.js';
import { uq, unitView } from '../core/units.js';
import { Stage, arrowPx, arrowMag, brace, rate01, symVal } from '../core/annot.js';
import { camera3d, background3d, orbit3d, axes3d, prism, sphere } from '../core/view3d.js';
import * as m3 from '../core/manim3d.js';
import { space3d } from '../core/space3d.js';
import {
  SEL_L, SEL_H, SLIT_H, PARAMS, PRESETS, GRAPHS, THEORY,
  particleOf, timeUnitOf, timeScale, fieldAt, lorentzForces, analytics, fmtCmTeX,
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
      // Inquadratura iniziale sul primo giro (~1,3 giri): la camera segue poi l'elica in pan3d.
      const zSpan = clamp(an.pitch_cm * Math.min(p.cycles ?? 3, 1.3), -22, 22);
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
    // Freccia del tutto fuori dall'area libera: niente etichetta (finirebbe schiacciata contro il bordo).
    const pad0 = P.cam.padFn?.() ?? { top: 70, right: 20, bottom: 20, left: 20 };
    const out = (u, v) => u < pad0.left || u > P.cam.w - pad0.right || v < pad0.top || v > P.cam.h - pad0.bottom;
    if (out(a, b) && out(c, d)) return;
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
    // Prima si porta l'etichetta dentro l'area libera (tra barra, ispettore, quickbar e moviola),
    // poi si cerca un posto libero: così due etichette spinte contro lo stesso bordo non si toccano.
    const pad = P.cam.padFn?.() ?? { top: 70, right: 20, bottom: 20, left: 20 };
    const cx = v => clamp(v, pad.left + hw + 4, P.cam.w - pad.right - hw - 4);
    const cy = v => clamp(v, pad.top + hh + 4, P.cam.h - pad.bottom - hh - 4);
    x = cx(x); y = cy(y);
    search: if (hits(x, y, hw, hh)) {
      for (let k = 1; k <= 8; k++) {
        for (const [px, py] of [[-uy, ux], [uy, -ux], [ux, uy], [-ux, -uy], [0, -1], [0, 1], [1, 0], [-1, 0]]) {
          const qx = cx(x + px * k * 11), qy = cy(y + py * k * 11);
          if (!hits(qx, qy, hw, hh)) { x = qx; y = qy; break search; }
        }
      }
    }
    placed.push({ x, y, hw, hh });
    tex(P, x, y - (B.top + B.bot) / 2, src, { size: 17, color: resolveCol(P, S.M, color), halo: S.M.bg, alpha: la });
  };
  put.blockS = (a, b, rx, ry = rx) => placed.push({ x: a, y: b, hw: rx, hh: ry });
  put.hits = hits;
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

function drawFields3D(P, V, M, p, vbox, fade, ui, lab, s) {
  if (!p.showFields || fade <= 0.01) return;
  const bCol = M.vec.tension, eCol = M.field;
  const cam = P.cam, sc = cam.scale;
  const span = Math.max(vbox.xmax - vbox.xmin, vbox.ymax - vbox.ymin, 1e-5);
  const pad = cam.padFn?.() ?? { top: 70, right: 20, bottom: 20, left: 20 };
  const hasKp = typeof document !== 'undefined' && document.body.classList.contains('has-kp');

  // Fascio di campo contenuto interamente nell'area visibile dello schermo, lontano da barra, ispettore e moviola.
  const sMinX = pad.left + 24, sMaxX = cam.w - pad.right - 24;
  const sMinY = pad.top + 36, sMaxY = cam.h - pad.bottom - 36;
  const safeTopAt = sx => (hasKp && sx < 520 ? Math.max(sMinY, pad.top + 56) : sMinY);

  const D = V.dist0(), rV = V.r, uV = V.u, fV = V.f;
  const [px0, py0, sx0, sy0] = V.focusPt();
  const pz0 = cam.cz || 0;
  const dMin = 0.58 * D;
  const depthCam = q => D - ((q[0] - px0) * fV[0] + (q[1] - py0) * fV[1] + (q[2] - pz0) * fV[2]);
  const lerp3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

  // Ritaglio proiettivo esatto sul segmento 3D: impone d >= 0.58*D (niente distorsione grandangolare)
  // e mantiene sia la coda sia la punta finale dentro [sMinX..sMaxX] × [sMinY..sMaxY].
  const kL = (sMinX - sx0) / (D * sc), kR = (sMaxX - sx0) / (D * sc);
  const kB = (sy0 - sMaxY) / (D * sc), kT = (sy0 - sMinY) / (D * sc);
  const clipFrustumSafe = (a, b) => {
    const viewCoords = q => {
      const dx = q[0] - px0, dy = q[1] - py0, dz = q[2] - pz0;
      return [
        dx * rV[0] + dy * rV[1] + dz * rV[2],
        dx * uV[0] + dy * uV[1] + dz * uV[2],
        D - (dx * fV[0] + dy * fV[1] + dz * fV[2]),
      ];
    };
    const [vx0, vy0, d0] = viewCoords(a), [vx1, vy1, d1] = viewCoords(b);
    let t0 = 0, t1 = 1;
    const clipPlane = (g0, g1) => {
      const dg = g1 - g0;
      if (Math.abs(dg) < 1e-9) return g0 >= 0;
      const t = -g0 / dg;
      if (dg > 0) { if (t > t1) return false; if (t > t0) t0 = t; }
      else { if (t < t0) return false; if (t < t1) t1 = t; }
      return true;
    };
    if (!clipPlane(d0 - dMin, d1 - dMin) ||
        !clipPlane(vx0 - kL * d0, vx1 - kL * d1) ||
        !clipPlane(kR * d0 - vx0, kR * d1 - vx1) ||
        !clipPlane(vy0 - kB * d0, vy1 - kB * d1) ||
        !clipPlane(kT * d0 - vy0, kT * d1 - vy1)) return null;
    if (t1 <= t0 + 1e-4) return null;
    return [lerp3(a, b, t0), lerp3(a, b, t1), t0, t1];
  };

  const vec3 = (a, b, col, width, tip, alpha) => {
    if (m3.is3dActive()) {
      m3.arrow(a, b, { color: col, widthPx: width, tipPx: tip, alpha });
      return;
    }
    const [x0, y0] = V.S(P, ...a), [x1, y1] = V.S(P, ...b);
    arrowS(P.ctx, x0, y0, x1, y1, col, { width, tip, alpha });
  };

  // Emette una singola linea di campo pulita, interamente contenuta nel quadro sicuro e con una sola punta finale.
  const emitFieldLine = (a, b, col, width, tip, alpha, tips, periph) => {
    if (alpha <= 0.02) return;
    const clipped = clipFrustumSafe(a, b);
    if (!clipped) return;
    const [p0, p1] = clipped;
    const [x0, y0] = V.S(P, ...p0), [x1, y1] = V.S(P, ...p1);
    if (Math.hypot(x1 - x0, y1 - y0) < 38) return;
    vec3(p0, p1, col, width, tip, alpha);
    tips.push({ pt: p1, periph, isTip: true });
    tips.push({ pt: lerp3(p0, p1, 0.55), periph, isTip: false });
  };

  // Distribuisce n coordinate in [a, b] tenendole lontane dagli assi cartesiani (x ≈ 0 o y ≈ 0).
  const spreadCoords = (a, b, n, padFrac = 0.14) => {
    const w = Math.max(b - a, 1e-5), out = [];
    if (n <= 1) out.push(a + w * 0.5);
    else for (let i = 0; i < n; i++) out.push(a + w * (padFrac + (1 - 2 * padFrac) * i / (n - 1)));
    if (a < 0 && b > 0) {
      const eps = 0.065 * w, push = 0.09 * w;
      return out.map(v => (Math.abs(v) < eps ? (v >= 0 ? push : -push) : v));
    }
    return out;
  };

  const bTips = [], eTips = [];
  const tb = trajBox(p);
  const lx = clamp(Math.abs(vbox.xmax) * 0.85, span * 0.3, span * 0.55);
  const ly = clamp(Math.abs(vbox.ymax) * 0.85, span * 0.3, span * 0.55);
  const lz = Math.min(lx, ly) * 0.9;

  if (p.region === 'spectrometer') {
    const fSel = fieldAt(-SEL_L / 2, 0, 0, p);
    if (Math.hypot(fSel.Ex, fSel.Ey) > 1e-9) {
      const sy = Math.sign(fSel.Ey) || 1, h = SEL_H * 0.72;
      for (const x of [-8, -5, -2]) for (const z of [-1.8, 1.8]) {
        vec3([x, -sy * h, z], [x, sy * h, z], eCol, 1.8, 8.5, 0.46 * fade);
        eTips.push({ pt: [x, sy * h, z], periph: (x === -2 || x === -8) ? 1 : 0.4, isTip: true });
      }
    }
    if (Math.abs(fSel.Bz) > 1e-12) {
      const sz = Math.sign(fSel.Bz) * Math.min(Z_APP * 0.9, span * 0.08);
      for (const x of [-6.5, -3.5]) for (const y of [-2.4, 2.4]) {
        vec3([x, y, -sz], [x, y, sz], bCol, 1.6, 8, 0.36 * fade);
      }
    }
    const cx0 = 2.0, cx1 = Math.max(cx0 + 5, Math.min(Math.max(vbox.xmax - 1.5, tb.x1 + 1.5), 36));
    const cy0 = Math.max(vbox.ymin + 1.6, Math.min(tb.y0 - 2, -9));
    const cy1 = Math.min(vbox.ymax - 1.6, Math.max(tb.y1 + 2, 9));
    const cz0 = Math.min(tb.z0, -Z_APP * 1.15) - 1.0, cz1 = Math.max(tb.z1, Z_APP * 1.15) + 1.0;
    const cxs = spreadCoords(cx0, cx1, 3, 0.12), cys = spreadCoords(cy0, cy1, 3, 0.14);
    cxs.forEach((x, ix) => cys.forEach((y, iy) => {
      const f = fieldAt(x, y, 0, p);
      if (Math.abs(f.Bz) <= 1e-12) return;
      const szDir = Math.sign(f.Bz);
      // Preferenza per il bordo esterno destro della camera magnetica (lontano dal muro x = 0 e dall'asse y).
      const periph = (ix === 2 ? 1.2 : ix === 1 ? 0.5 : 0) + Math.abs(iy - 1) * 0.4;
      emitFieldLine([x, y, szDir > 0 ? cz0 : cz1], [x, y, szDir > 0 ? cz1 : cz0], bCol, 1.8, 9, 0.4 * fade, bTips, periph);
    }));
  } else {
    // Regimi 'all' e 'half': fascio compatto su reticolo fisso nello spazio mondo attorno al fuoco visibile
    // [px0, py0, pz0] con dissolvenza morbida ai bordi, così avanzando lungo z lo spazio scorre intorno all'elica.
    const stepX = Math.max(1e-4, niceStep(lx * 0.36));
    const stepY = Math.max(1e-4, niceStep(ly * 0.38));
    const stepZ = Math.max(1e-4, niceStep(lz * 0.44));
    const stepBZ = stepZ * 4;

    const winCx = p.region === 'half' ? Math.max(0.3 + 0.45 * lx, px0 + 0.25 * lx) : px0;
    const winCy = py0 + 0.45 * ly * Math.sin(V.pitch ?? 0);
    const winCz = pz0 + 0.18 * lz;
    const winRx = 0.76 * lx, winRy = 0.66 * ly, winRz = 1.05 * lz;

    const winFade = (v, c, hw) => {
      const u = Math.abs(v - c) / Math.max(hw, 1e-5);
      if (u >= 1) return 0;
      if (u <= 0.55) return 1;
      const t = (1 - u) / 0.45;
      return t * t * (3 - 2 * t);
    };

    const xMin = p.region === 'half' ? 0.3 : winCx - winRx, xMax = winCx + winRx;
    const yMin = winCy - winRy, yMax = winCy + winRy;
    const zMin = winCz - winRz, zMax = winCz + winRz;

    const fSample = fieldAt(p.region === 'half' ? Math.max(1, winCx) : winCx, winCy, winCz, p);
    const hasB = Math.abs(fSample.Bz) > 1e-12;
    const emSample = Math.hypot(fSample.Ex, fSample.Ey);
    const hasE = emSample > 1e-9;

    const qList = (lo, hi, stp, half) => {
      const out = [];
      const k0 = Math.floor(lo / stp - (half ? 0.5 : 0));
      const k1 = Math.ceil(hi / stp - (half ? 0.5 : 0));
      for (let k = k0; k <= k1; k++) {
        const v = (k + (half ? 0.5 : 0)) * stp;
        if (v >= lo && v <= hi) out.push([k, v]);
      }
      return out;
    };

    if (hasB) {
      const bxs = qList(xMin, xMax, stepX, true);
      const bys = qList(yMin, yMax, stepY, true);
      const kBz0 = Math.floor((zMin - 0.45 * stepBZ) / stepBZ);
      const kBz1 = Math.ceil((zMax + 0.45 * stepBZ) / stepBZ);
      for (const [, x] of bxs) {
        if (p.region === 'half' && x < 0.3) continue;
        const fx = winFade(x, winCx, winRx);
        if (fx <= 0.03) continue;
        for (const [, y] of bys) {
          const fy = winFade(y, winCy, winRy);
          if (fx * fy <= 0.03) continue;
          const periph = Math.max(Math.abs(x - winCx) / winRx, Math.abs(y - winCy) / winRy);
          for (let kz = kBz0; kz <= kBz1; kz++) {
            const zc = kz * stepBZ, fz = winFade(zc, winCz, winRz + 0.35 * stepBZ);
            const alphaB = 0.40 * fade * fx * fy * fz;
            if (alphaB <= 0.025) continue;
            const f = fieldAt(x, y, zc, p);
            if (Math.abs(f.Bz) <= 1e-12) continue;
            const szDir = Math.sign(f.Bz);
            const za = zc - 0.45 * stepBZ, zb = zc + 0.45 * stepBZ;
            emitFieldLine([x, y, szDir > 0 ? za : zb], [x, y, szDir > 0 ? zb : za], bCol, 1.8, 9, alphaB, bTips, periph);
          }
        }
      }
    }

    if (hasE) {
      const ux = fSample.Ex / emSample, uy = fSample.Ey / emSample;
      const nx = -uy, ny = ux;
      const eyLo = winCy - 0.48 * ly, eyHi = winCy + 0.48 * ly;
      const ezs = qList(zMin, zMax, stepZ, true);
      const sMin = Math.min(xMin * nx, xMax * nx) + Math.min(eyLo * ny, eyHi * ny);
      const sMax = Math.max(xMin * nx, xMax * nx) + Math.max(eyLo * ny, eyHi * ny);
      // Quando B è presente, E si sfalsa esattamente a metà tra le linee B ((i + 0.5)*stepX -> i*stepX).
      const exs = Math.abs(ux) < 0.1
        ? qList(xMin, xMax, stepX, !hasB).map(([k, xv]) => [k, xv * nx, xv])
        : qList(sMin, sMax, stepX, true).map(([k, sv]) => [k, sv, null]);

      const clipXY = (px, py) => {
        let tMin = -Infinity, tMax = Infinity;
        for (const [o, d, lo, hi] of [[px, ux, xMin, xMax], [py, uy, eyLo, eyHi]]) {
          if (Math.abs(d) < 1e-9) {
            if (o < lo || o > hi) return null;
          } else {
            const a = (lo - o) / d, b = (hi - o) / d;
            tMin = Math.max(tMin, Math.min(a, b));
            tMax = Math.min(tMax, Math.max(a, b));
            if (tMin > tMax) return null;
          }
        }
        return [tMin, tMax];
      };

      const dOf = ezs.map(([, z]) => V.depth(0, 0, z)), dMinE = Math.min(...dOf), dMaxE = Math.max(...dOf);
      ezs.forEach(([, zc], idxZ) => {
        const fz = winFade(zc, winCz, winRz);
        if (fz <= 0.03) return;
        const depth = dMaxE - dMinE > 1e-9 ? 0.78 + 0.22 * (dOf[idxZ] - dMinE) / (dMaxE - dMinE) : 1;
        for (const [, sVal, xKnown] of exs) {
          const px = sVal * nx, py = sVal * ny;
          const spanT = clipXY(px, py);
          if (!spanT) continue;
          const [tA, tB] = spanT;
          if (tB - tA <= 1e-4) continue;
          const a = [px + tA * ux, py + tA * uy, zc], b = [px + tB * ux, py + tB * uy, zc];
          const mx = (a[0] + b[0]) * 0.5, my = (a[1] + b[1]) * 0.5;
          const fx = xKnown != null ? winFade(xKnown, winCx, winRx) : winFade(mx, winCx, winRx);
          const alphaE = 0.44 * depth * fade * fx * fz;
          if (alphaE <= 0.025) continue;
          const fe = fieldAt(mx, my, zc, p);
          if (Math.hypot(fe.Ex, fe.Ey) <= 1e-9) continue;
          const periph = Math.max(Math.abs(mx - winCx) / winRx, Math.abs(zc - winCz) / winRz);
          emitFieldLine(a, b, eCol, 1.8, 9, alphaE, eTips, periph);
        }
      });
    }
  }

  if (ui.snapshot) return null;

  return () => {
    // Esclusioni dinamiche attorno alla particella, ai vettori e agli assi cartesiani.
    const partS = s ? V.S(P, s.x, s.y, s.z) : null;
    const vecSegs = [];
    if (s) {
      const pos = [s.x, s.y, s.z], pS = partS;
      const addVecSeg = end3 => vecSegs.push([pS, V.S(P, ...end3)]);
      if (p.showVel !== false) {
        const { maxV, maxMs } = v0Range(p);
        if (s.t === 0) {
          const th = ('theta' in p ? p.theta : Math.atan2(s.vy, s.vx) / deg) * deg;
          const Lh = Math.max(p.v0 > 0 ? arrowPx(p.v0, maxV, V0_CFG) : 0, V0_CFG.min) / sc;
          addVecSeg([pos[0] + Math.cos(th) * Lh, pos[1] + Math.sin(th) * Lh, pos[2]]);
          const vMag = Math.hypot(s.vx, s.vy, s.vz);
          if (p.v0 > 0 && Math.abs(s.vz) > 1e-6 && vMag > 1e-6) {
            const L3 = arrowPx(vMag, Math.max(vMag, maxMs * 0.15), V_CFG) / sc;
            addVecSeg([pos[0] + s.vx / vMag * L3, pos[1] + s.vy / vMag * L3, pos[2] + s.vz / vMag * L3]);
          }
        } else {
          const vMag = Math.hypot(s.vx, s.vy, s.vz);
          if (vMag > 1e-6) {
            const q0 = init(p), v0Ms = Math.hypot(q0.vx, q0.vy, q0.vz);
            const vRef = Math.max(v0Ms * 1.5, maxMs * 0.05, vMag, 1);
            const Lv = arrowPx(vMag, vRef, V_CFG) / sc;
            addVecSeg([pos[0] + s.vx / vMag * Lv, pos[1] + s.vy / vMag * Lv, pos[2] + s.vz / vMag * Lv]);
          }
        }
      }
      const showForces = p.showForces ?? p.showForce ?? true;
      if (showForces && ui.sel !== 'particle') {
        const { FE, FB, F } = lorentzForces(s.vx, s.vy, s.vz, s.x, s.y, s.z, p);
        const feM = Math.hypot(...FE), fbM = Math.hypot(...FB), fM = Math.hypot(...F);
        const fRef = Math.max(feM, fbM, fM), tol = fRef * 1e-3;
        for (const [vec, mag] of [[FE, feM], [FB, fbM], [F, fM]]) {
          if (fRef <= 1e-30 || mag <= tol) continue;
          const Lf = arrowPx(mag, fRef, F_CFG) / sc;
          addVecSeg([pos[0] + vec[0] / mag * Lf, pos[1] + vec[1] / mag * Lf, pos[2] + vec[2] / mag * Lf]);
        }
      }
    }

    const origFront = depthCam([0, 0, 0]) >= 0.20 * D;
    const origS = origFront ? V.S(P, 0, 0, 0) : null;
    const axSpan = span * 2.5 + Math.abs(cam.cz || 0) + Math.hypot(cam.cx || 0, cam.cy || 0);
    const clipAxis = (a, b) => {
      const da = depthCam(a), db = depthCam(b), dSafe = 0.20 * D;
      if (da < dSafe && db < dSafe) return null;
      const p0 = da < dSafe ? lerp3(a, b, (dSafe - da) / (db - da)) : a;
      const p1 = db < dSafe ? lerp3(a, b, (dSafe - da) / (db - da)) : b;
      return [V.S(P, ...p0), V.S(P, ...p1)];
    };
    const posAxisSegs = [[axSpan, 0, 0], [0, axSpan, 0], [0, 0, axSpan]].map(e => clipAxis([0, 0, 0], e)).filter(Boolean);
    const negAxisSegs = [[-axSpan, 0, 0], [0, -axSpan, 0], [0, 0, -axSpan]].map(e => clipAxis([0, 0, 0], e)).filter(Boolean);
    const trailS = [];
    if (s?.trail?.length) {
      const stride = Math.max(1, Math.floor(s.trail.length / 18));
      for (let i = 0; i < s.trail.length; i += stride) trailS.push(V.S(P, ...s.trail[i]));
    }

    const distSeg = (px, py, a, b) => {
      const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy;
      const t = l2 > 1e-6 ? clamp(((px - a[0]) * dx + (py - a[1]) * dy) / l2, 0, 1) : 0;
      return Math.hypot(px - (a[0] + t * dx), py - (a[1] + t * dy));
    };
    const placed = [];

    const place = (cands, src, col) => {
      if (!cands.length) return;
      const B = texBox(P, src, 16), hw = B.w / 2 + 4, hh = (B.bot - B.top) / 2 + 4;
      const rBox = Math.hypot(hw, hh);
      const offsets = [[10 + hw, -4], [-10 - hw, -4], [10 + hw, 10 + hh * 0.5], [-10 - hw, 10 + hh * 0.5], [0, -12 - hh], [0, 12 + hh]];
      let best = null;
      for (const c of cands) {
        if (depthCam(c.pt) < dMin * 0.98) continue;
        const [tx, ty] = V.S(P, ...c.pt);
        for (const [ox, oy] of offsets) {
          const x = tx + ox, y = ty + oy;
          if (x - hw < pad.left + 10 || x + hw > P.cam.w - pad.right - 10 || y - hh < safeTopAt(x) || y + hh > P.cam.h - pad.bottom - 10) continue;
          if (placed.some(r => Math.abs(r.x - x) < r.hw + hw + 28 && Math.abs(r.y - y) < r.hh + hh + 20)) continue;
          if (lab?.hits?.(x, y, hw + 8, hh + 8)) continue;
          const dPart = partS ? Math.hypot(x - partS[0], y - partS[1]) : 999;
          if (dPart < 65) continue;
          const dVec = vecSegs.length ? Math.min(...vecSegs.map(seg => distSeg(x, y, seg[0], seg[1]))) - rBox : 999;
          if (dVec < 24) continue;
          const dOrig = origS ? Math.hypot(x - origS[0], y - origS[1]) : 999;
          if (dOrig < 32) continue;
          const dPosAx = posAxisSegs.length ? Math.min(...posAxisSegs.map(seg => distSeg(x, y, seg[0], seg[1]))) : 999;
          if (dPosAx < 26) continue;
          const dNegAx = negAxisSegs.length ? Math.min(...negAxisSegs.map(seg => distSeg(x, y, seg[0], seg[1]))) : 999;
          const dTrail = trailS.length ? Math.min(...trailS.map(pt => Math.hypot(x - pt[0], y - pt[1]))) : 90;
          const negAxPen = dNegAx < 20 ? 240 : 0;
          const score = (c.isTip ? 0 : 900) + negAxPen + (y + 0.28 * x) - c.periph * 180 - Math.min(dPart, 170) * 0.45 - Math.min(dTrail, 80) * 0.9;
          if (!best || score < best.score) best = { x, y, score };
        }
      }
      if (!best) return;
      placed.push({ x: best.x, y: best.y, hw, hh });
      lab?.blockS(best.x, best.y, hw + 4, hh + 4);
      tex(P, best.x, best.y - (B.top + B.bot) / 2, src, { size: 16, color: col, halo: M.bg, alpha: 0.92 * fade });
    };
    place(bTips, '\\vec B', bCol);
    place(eTips, '\\vec E', eCol);
  };
}

// Riquadro 3D (cm) dell'intera traiettoria con i parametri correnti: la si simula una volta sola
// (in memoria finché i parametri non cambiano) per stendere il reticolo dei campi su tutto il moto.
let TB_KEY = '', TB = null;
function trajBox(p) {
  const key = JSON.stringify(['particle', 'q', 'mA', 'region', 'v0', 'theta', 'vz', 'B', 'E', 'cycles'].map(k => p[k]));
  if (key === TB_KEY && TB) return TB;
  const s = init(p);
  const box = { x0: s.x, x1: s.x, y0: s.y, y1: s.y, z0: s.z, z1: s.z };
  const grow = (x, y, z) => {
    if (!Number.isFinite(x + y + z)) return;
    box.x0 = Math.min(box.x0, x); box.x1 = Math.max(box.x1, x);
    box.y0 = Math.min(box.y0, y); box.y1 = Math.max(box.y1, y);
    box.z0 = Math.min(box.z0, z); box.z1 = Math.max(box.z1, z);
  };
  const dt = s.tEnd / 240;
  for (let i = 0; i < 400 && !done(s) && dt > 0; i++) {
    step(s, dt, p);
    for (const q of s.trail.splice(0, Math.max(0, s.trail.length - 1))) grow(...q);
    grow(s.x, s.y, s.z);
  }
  // Limite di sicurezza per moti che fuggono lontano (campo E da solo, raggi enormi).
  const cap = 120;
  box.x0 = Math.max(box.x0, -cap); box.x1 = Math.min(box.x1, cap);
  box.y0 = Math.max(box.y0, -cap); box.y1 = Math.min(box.y1, cap);
  box.z0 = Math.max(box.z0, -cap); box.z1 = Math.min(box.z1, cap);
  TB_KEY = key; TB = box;
  return box;
}

function drawBoundaryHalf(P, V, M, vbox, tilt) {
  const b = P.cam.bounds();
  const y0 = tilt < 0.08 ? Math.min(vbox.ymin, b.y0) : vbox.ymin;
  const y1 = tilt < 0.08 ? Math.max(vbox.ymax, b.y1) : vbox.ymax;
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

  const b = P.cam.bounds();
  const hitY = s.hit === 'detector' && s.hitPos ? Math.abs(ptOf(s.hitPos)[1]) : 0;
  const wallTop = Math.max(SEL_H + 1.5, hitY + 2, vbox.ymax - 0.5, tilt < 0.06 ? b.y1 : -Infinity);
  const wallBot = Math.min(-SEL_H - 1.5, -hitY - 2, vbox.ymin + 0.5, tilt < 0.06 ? b.y0 : Infinity);
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
      const src = symVal(P, 'p', fmtCmTeX(Math.abs(pitch))), Bp = texBox(P, src, 14);
      tex(P, px + 14, py, src, { size: 14, color: M.vec.tension, halo: M.bg, align: 'left', alpha: 0.9 * tilt * g });
      lab?.blockS(px + 14 + Bp.w / 2, py, Bp.w / 2 + 4, (Bp.bot - Bp.top) / 2 + 3);
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
  // Direzione sullo schermo (coordinate mondo 2D) di un vettore applicato alla carica.
  const dir2 = vec => {
    const m = Math.hypot(...vec) || 1, e = 40 / sc;
    const [bx, by] = V.p(pos[0] + vec[0] / m * e, pos[1] + vec[1] / m * e, pos[2] + vec[2] / m * e);
    const dx = bx - px2, dy = by - py2, d = Math.hypot(dx, dy) || 1;
    return [dx / d, dy / d];
  };
  const showF = both && fM > fRef * 0.025;
  // Se la risultante è quasi allineata (stesso verso) con F_B o F_E, la si scosta di lato e le
  // etichette vanno sui due lati opposti della coppia di frecce.
  let fOpt = { width: 2.6, dash: [5, 4], side: [1, -1], at: 0.8 }, feOpt = {}, fbOpt = {};
  if (showF) {
    const dF = dir2(F), nW = [-dF[1], dF[0]], nS = [nW[0], -nW[1]];
    const near = v => { const d = dir2(v); return d[0] * dF[0] + d[1] * dF[1] > 0.94; };
    const partner = fbM > tol && near(FB) ? 'FB' : (feM > tol && near(FE) ? 'FE' : null);
    if (partner) {
      fOpt = { ...fOpt, lat: 7, side: nS, at: 0.7 };
      const o = { lat: -3, side: [-nS[0], -nS[1]], at: 0.5 };
      if (partner === 'FB') fbOpt = o; else feOpt = o;
    }
  }
  drawF(FE, feM, 'applied', 'FE', '\\vec F_E', { lat: parallel ? -5 : 0, side: parallel ? [-1, 0] : (inSel ? [1, 0] : (onYAxis ? [1, 0] : null)), at: 0.62, ...feOpt });
  drawF(FB, fbM, 'normal', 'FB', '\\vec F_B', { lat: parallel ? 5 : 0, side: parallel ? [1, 0] : fSide, at: 0.62, ...fbOpt });
  if (showF) drawF(F, fM, 'weight', 'F', '\\vec F', fOpt);
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
  // Carrellata 3D lungo l'elica e la deriva E×B, oppure inquadratura 2D.
  follow(s, p) {
    if (p.show3d) {
      return CAM ? { mode: 'pan3d', point: [s.x, s.y, s.z], V: CAM, margin: 0.16, padPx: 32 } : null;
    }
    const an = analytics(p);
    const [sx0, sy0] = ptOf(an.startCm ?? [0, 0, 0]);
    return {
      mode: 'contain',
      pts: [[sx0, sy0], [s.x, s.y]],
      focus: [[s.x, s.y]],
      maxOut: 2.2,
      panOnMaxOut: true,
      padPx: 24,
    };
  },
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
    const lab = labeler(S, P);
    const placeFieldLabels = drawFields3D(P, V, M, p, vbox, fade3d, ui, lab, s);

    if (p.region === 'half') drawBoundaryHalf(P, V, M, vbox, tilt);
    if (p.region === 'spectrometer') drawSpectrometer(P, V, M, p, vbox, s, tilt);

    const an = analytics(p);
    drawIdealGuide(P, V, S, M, p, an, tilt, ui, lab);
    placeFieldLabels?.();

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
