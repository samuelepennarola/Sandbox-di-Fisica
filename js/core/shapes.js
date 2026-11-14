import { MANIM } from './anim.js';
import { mixHex } from './manim.js';

// Sagome piatte (flat) per rendere riconoscibili gli oggetti senza modellarli.
// Ogni sagoma si disegna in coordinate mondo (metri, y verso l'alto) tramite il Painter:
// le misure sono in metri, con una dimensione minima in px perché resti visibile anche a zoom basso.

// Palette alla Manim: tinte piene ma "velate" dal fondo (come l'opacità di riempimento di Manim), bordo più acceso.
// Per ogni colore K ci sono K (riempimento), KDark (parti in ombra) e KEdge (bordo).
const BASE = {
  dark: {
    bg: '#0b0b0d', red: MANIM.red, blue: MANIM.blue, green: MANIM.green, yellow: '#E8C11C', wood: '#C9925A', metal: MANIM.greyB,
    tire: MANIM.greyD, glass: MANIM.blueE, skin: '#E9B98F', shirt: MANIM.blue, pants: '#5a6170', hair: '#6b4a30',
    leaf: MANIM.green, trunk: '#9b6b45', grass: '#4f7f45', water: MANIM.blueE, asphalt: '#3a3c42', ballast: '#55524c',
  },
  light: {
    bg: '#f6f3ea', red: '#d9443a', blue: '#2b8fbf', green: '#5c9a35', yellow: '#d4a514', wood: '#b07a45', metal: '#8f97a3',
    tire: '#3a3d44', glass: '#9fcfe6', skin: '#e9b98f', shirt: '#2b8fbf', pants: '#4a5263', hair: '#5a3b24',
    leaf: '#5c9a35', trunk: '#8a5a33', grass: '#7fb069', water: '#3d9ccc', asphalt: '#7b7f86', ballast: '#c8bca6',
  },
};
const PALETTE = {};
for (const theme of ['dark', 'light']) {
  const B = BASE[theme], dark = theme === 'dark', pal = PALETTE[theme] = {};
  for (const [k, v] of Object.entries(B)) {
    if (k === 'bg') continue;
    pal[k] = mixHex(v, B.bg, dark ? 0.3 : 0.12);
    pal[k + 'Dark'] = mixHex(v, B.bg, dark ? 0.55 : 0.35);
    pal[k + 'Edge'] = mixHex(v, dark ? '#ffffff' : '#000000', dark ? 0.25 : 0.3);
  }
  Object.assign(pal, dark
    ? { outline: 'rgba(255, 255, 255, .45)', shadow: 'rgba(0, 0, 0, .3)', highlight: 'rgba(255, 255, 255, .2)', waterLine: 'rgba(190, 230, 250, .35)', roadLine: '#d9d4c4' }
    : { outline: 'rgba(30, 25, 15, .5)', shadow: 'rgba(40, 30, 10, .12)', highlight: 'rgba(255, 255, 255, .5)', waterLine: 'rgba(255, 255, 255, .85)', roadLine: '#f6f2e6' });
}

export function palette() {
  return PALETTE[document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light'];
}

// Px per metro, con un minimo: `size` è la dimensione caratteristica dell'oggetto in metri.
function unitFor(P, size, minPx) { return Math.max(P.cam.scale, minPx / size); }

// Esegue fn in un sistema locale centrato in (x, y), ruotato di angle (antiorario), unità = metri, y verso l'alto.
// fn riceve ctx, la palette e lw = spessore di 1 px in unità locali.
function local(P, x, y, angle, unit, fn) {
  const ctx = P.ctx, [a, b] = P.S(x, y);
  ctx.save();
  ctx.translate(a, b); ctx.rotate(-angle); ctx.scale(unit, -unit);
  ctx.lineJoin = ctx.lineCap = 'round';
  fn(ctx, palette(), 1 / unit);
  ctx.restore();
}

function rr(ctx, x, y, w, h, r) {
  r = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r); ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h); ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r); ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}
function paint(ctx, fill, stroke, width) {
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = width; ctx.stroke(); }
}
function disc(ctx, x, y, r) { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); }
const pick = (pal, c) => pal[c] ?? c;

/* ---------------- Corpi semplici ---------------- */

// Palla alla Manim: disco pieno con bordo acceso; `spin` (rad) ruota un raggio per mostrare la rotazione.
export function ball(P, x, y, { r = 0.15, minPx = 11, color = 'red', spin = null } = {}) {
  local(P, x, y, 0, unitFor(P, r, minPx), (ctx, pal, lw) => {
    const edge = pal[color + 'Edge'] ?? pal.outline;
    disc(ctx, 0, 0, r); paint(ctx, pick(pal, color), edge, 2 * lw);
    if (spin != null) {
      ctx.strokeStyle = edge; ctx.lineWidth = 1.6 * lw;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(spin) * r, Math.sin(spin) * r); ctx.stroke();
      disc(ctx, 0, 0, 2.2 * lw); paint(ctx, edge);
    }
  });
}

// Ombra a terra (ellisse) che si rimpicciolisce con la quota.
export function groundShadow(P, x, yGround, height, { w = 0.5, minPx = 10 } = {}) {
  const k = 1 / (1 + Math.max(0, height) * 0.25);
  local(P, x, yGround, 0, unitFor(P, w, minPx), (ctx, pal) => {
    ctx.beginPath(); ctx.ellipse(0, 0, w * k, w * 0.22 * k, 0, 0, Math.PI * 2);
    paint(ctx, pal.shadow);
  });
}

// Corpo rigido (cassa) centrato in (x, y), lati w × h, ruotato di angle: rettangolo pieno con bordo acceso.
export function crate(P, x, y, { w = 1, h = 0.7, angle = 0, minPx = 26, color = 'blue' } = {}) {
  local(P, x, y, angle, unitFor(P, Math.max(w, h), minPx), (ctx, pal, lw) => {
    rr(ctx, -w / 2, -h / 2, w, h, Math.min(w, h) * 0.08); paint(ctx, pick(pal, color), pal[color + 'Edge'] ?? pal.outline, 2 * lw);
  });
}

// Ruota alla Manim: pneumatico a contorno, disco velato e raggi sottili; angle = rotazione accumulata (rad).
export function wheel(P, x, y, { r = 0.35, angle = 0, spokes = 8, minPx = 14, tire = 0.18 } = {}) {
  local(P, x, y, angle, unitFor(P, r, minPx), (ctx, pal, lw) => {
    const ri = r * (1 - tire);
    ctx.globalAlpha = 0.5; disc(ctx, 0, 0, r); ctx.arc(0, 0, ri, 0, Math.PI * 2, true); paint(ctx, pal.tire);
    ctx.globalAlpha = 0.15; disc(ctx, 0, 0, ri); paint(ctx, pal.metalEdge);
    ctx.globalAlpha = 1;
    disc(ctx, 0, 0, r); paint(ctx, null, pal.metalEdge, 2 * lw);
    disc(ctx, 0, 0, ri); paint(ctx, null, pal.metalEdge, 1.2 * lw);
    ctx.strokeStyle = pal.metalEdge; ctx.lineWidth = 1.2 * lw; ctx.globalAlpha = 0.75;
    ctx.beginPath();
    for (let i = 0; i < spokes; i++) { const a = i * 2 * Math.PI / spokes; ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a) * ri, Math.sin(a) * ri); }
    ctx.stroke();
    ctx.globalAlpha = 1;
    disc(ctx, 0, 0, Math.max(r * 0.08, 3 * lw)); paint(ctx, pal.metalEdge);
    // Valvola colorata: rende visibile la rotazione.
    disc(ctx, r * (1 - tire * 0.5), 0, Math.max(r * 0.05, 2.5 * lw)); paint(ctx, pal.yellowEdge);
  });
}

// Cannone di lato: affusto in (x, y) a terra, canna inclinata di angle.
export function cannon(P, x, y, { angle = Math.PI / 4, len = 1.4, minPx = 34 } = {}) {
  local(P, x, y, 0, unitFor(P, len, minPx), (ctx, pal, lw) => {
    const r = len * 0.28;
    ctx.save(); ctx.translate(0, r); ctx.rotate(angle);
    rr(ctx, -len * 0.15, -len * 0.13, len * 1.05, len * 0.26, len * 0.1); paint(ctx, pal.metalDark, pal.outline, 1.5 * lw);
    rr(ctx, len * 0.75, -len * 0.16, len * 0.16, len * 0.32, len * 0.05); paint(ctx, pal.metal, pal.outline, 1.5 * lw);
    ctx.restore();
    disc(ctx, 0, r, r); paint(ctx, pal.wood, pal.outline, 1.5 * lw);
    disc(ctx, 0, r, r * 0.3); paint(ctx, pal.woodDark);
  });
}

/* ---------------- Persone e veicoli ---------------- */

// Persona di lato con i piedi in (x, y). hand = [wx, wy] facoltativo: il braccio punta lì.
export function person(P, x, y, { h = 1.75, hand = null, minPx = 40, shirt = 'shirt' } = {}) {
  local(P, x, y, 0, unitFor(P, h, minPx), (ctx, pal, lw) => {
    const k = h / 1.75, o = 1.5 * lw;
    rr(ctx, -0.17 * k, 0, 0.15 * k, 0.85 * k, 0.06 * k); paint(ctx, pal.pants, pal.outline, o);
    rr(ctx, 0.02 * k, 0, 0.15 * k, 0.85 * k, 0.06 * k); paint(ctx, pal.pants, pal.outline, o);
    rr(ctx, -0.21 * k, 0.8 * k, 0.42 * k, 0.65 * k, 0.12 * k); paint(ctx, pick(pal, shirt), pal.outline, o);
    disc(ctx, 0, 1.6 * k, 0.15 * k); paint(ctx, pal.skin, pal.outline, o);
    ctx.beginPath(); ctx.arc(0, 1.62 * k, 0.155 * k, 0.15 * Math.PI, 0.95 * Math.PI); ctx.lineTo(-0.1 * k, 1.66 * k);
    paint(ctx, pal.hair);
    const sx = 0.02 * k, sy = 1.38 * k;
    let [hx, hy] = hand ? [hand[0] - x, hand[1] - y] : [0.25 * k, 0.9 * k];
    const d = Math.hypot(hx - sx, hy - sy), maxL = 0.68 * k;
    if (d > maxL) { hx = sx + (hx - sx) * maxL / d; hy = sy + (hy - sy) * maxL / d; }
    ctx.strokeStyle = pal.outline; ctx.lineWidth = 0.13 * k + 2 * o;
    ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(hx, hy); ctx.stroke();
    ctx.strokeStyle = pick(pal, shirt); ctx.lineWidth = 0.13 * k;
    ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(hx, hy); ctx.stroke();
    disc(ctx, hx, hy, 0.07 * k); paint(ctx, pal.skin, pal.outline, o);
  });
}

// Auto vista dall'alto, centrata in (x, y), muso nella direzione angle.
export function carTop(P, x, y, { len = 4.2, angle = 0, color = 'red', minPx = 34 } = {}) {
  local(P, x, y, angle, unitFor(P, len, minPx), (ctx, pal, lw) => {
    const k = len / 4.2, W = 1.8 * k, o = 1.5 * lw;
    for (const [wx, wy] of [[1.3, 0.92], [1.3, -0.92], [-1.3, 0.92], [-1.3, -0.92]]) {
      rr(ctx, (wx - 0.36) * k, (wy - 0.14) * k, 0.72 * k, 0.28 * k, 0.08 * k); paint(ctx, pal.tire);
    }
    rr(ctx, -2.1 * k, -W / 2, 4.2 * k, W, 0.5 * k); paint(ctx, pick(pal, color), pal.outline, o);
    rr(ctx, -1.05 * k, -0.72 * k, 2 * k, 1.44 * k, 0.3 * k); paint(ctx, pal[color + 'Dark'] ?? pick(pal, color));
    ctx.beginPath(); ctx.moveTo(0.95 * k, -0.66 * k); ctx.lineTo(1.35 * k, -0.74 * k); ctx.lineTo(1.35 * k, 0.74 * k); ctx.lineTo(0.95 * k, 0.66 * k); ctx.closePath();
    paint(ctx, pal.glass);
    rr(ctx, -1.35 * k, -0.62 * k, 0.28 * k, 1.24 * k, 0.08 * k); paint(ctx, pal.glass);
    for (const s of [1, -1]) { disc(ctx, 2.0 * k, s * 0.62 * k, 0.13 * k); paint(ctx, pal.yellow); }
  });
}

// Auto di lato con le ruote a terra in y; angle = rotazione delle ruote (rad).
export function carSide(P, x, y, { len = 4.2, color = 'red', wheelAngle = 0, minPx = 40 } = {}) {
  const unit = unitFor(P, len, minPx), k = len / 4.2;
  local(P, x, y, 0, unit, (ctx, pal, lw) => {
    const o = 1.5 * lw;
    ctx.beginPath();
    ctx.moveTo(-1.25 * k, 1.0 * k); ctx.lineTo(-0.75 * k, 1.5 * k); ctx.lineTo(0.7 * k, 1.5 * k); ctx.lineTo(1.25 * k, 1.0 * k); ctx.closePath();
    paint(ctx, pal[color + 'Dark'] ?? pick(pal, color), pal.outline, o);
    ctx.beginPath();
    ctx.moveTo(-1.08 * k, 1.04 * k); ctx.lineTo(-0.68 * k, 1.42 * k); ctx.lineTo(-0.05 * k, 1.42 * k); ctx.lineTo(-0.05 * k, 1.04 * k); ctx.closePath(); paint(ctx, pal.glass);
    ctx.beginPath();
    ctx.moveTo(0.05 * k, 1.04 * k); ctx.lineTo(0.05 * k, 1.42 * k); ctx.lineTo(0.64 * k, 1.42 * k); ctx.lineTo(1.08 * k, 1.04 * k); ctx.closePath(); paint(ctx, pal.glass);
    rr(ctx, -2.1 * k, 0.3 * k, 4.2 * k, 0.75 * k, 0.28 * k); paint(ctx, pick(pal, color), pal.outline, o);
    disc(ctx, 1.98 * k, 0.78 * k, 0.1 * k); paint(ctx, pal.yellow);
  });
  for (const wx of [-1.35, 1.35]) wheel(P, x + wx * k * unit / P.cam.scale, y + 0.36 * k * unit / P.cam.scale, { r: 0.36 * k * unit / P.cam.scale, angle: wheelAngle, spokes: 5, minPx: 0, tire: 0.32 });
}

// Barca vista dall'alto, centrata in (x, y), prua nella direzione angle. wake: scia a V dietro la poppa.
export function boatTop(P, x, y, { len = 3, angle = 0, color = 'red', wake = true, minPx = 34 } = {}) {
  local(P, x, y, angle, unitFor(P, len, minPx), (ctx, pal, lw) => {
    const k = len / 3, o = 1.5 * lw;
    if (wake) {
      ctx.strokeStyle = pal.waterLine; ctx.lineWidth = 0.12 * k;
      ctx.beginPath(); ctx.moveTo(-1.4 * k, 0.5 * k); ctx.lineTo(-3 * k, 1.2 * k); ctx.moveTo(-1.4 * k, -0.5 * k); ctx.lineTo(-3 * k, -1.2 * k); ctx.stroke();
    }
    const hull = s => {
      ctx.beginPath();
      ctx.moveTo(-1.5 * k * s, -0.55 * k * s);
      ctx.lineTo(0.3 * k * s, -0.6 * k * s);
      ctx.quadraticCurveTo(1.2 * k * s, -0.5 * k * s, 1.5 * k * s, 0);
      ctx.quadraticCurveTo(1.2 * k * s, 0.5 * k * s, 0.3 * k * s, 0.6 * k * s);
      ctx.lineTo(-1.5 * k * s, 0.55 * k * s);
      ctx.closePath();
    };
    hull(1); paint(ctx, pick(pal, color), pal.outline, o);
    hull(0.8); paint(ctx, pal.wood);
    ctx.fillStyle = pal.woodDark;
    ctx.fillRect(-0.15 * k, -0.45 * k, 0.22 * k, 0.9 * k);
    ctx.fillRect(-0.95 * k, -0.42 * k, 0.22 * k, 0.84 * k);
    rr(ctx, -1.62 * k, -0.18 * k, 0.26 * k, 0.36 * k, 0.05 * k); paint(ctx, pal.metalDark);
  });
}

// Carro pianale di lato: centrato in x, rotaie a y = 0. rot = rotazione delle ruote (rad).
export function flatcar(P, x, { len = 12, deck = 1, color = 'blue', rot = 0, minPx = 60 } = {}) {
  const r = 0.32;
  local(P, x, 0, 0, unitFor(P, len, minPx), (ctx, pal, lw) => {
    const o = 1.5 * lw;
    rr(ctx, -len / 2 - 0.35, deck - 0.22, 0.4, 0.14, 0.05); paint(ctx, pal.metalDark);
    rr(ctx, len / 2 - 0.05, deck - 0.22, 0.4, 0.14, 0.05); paint(ctx, pal.metalDark);
    rr(ctx, -len / 2, deck - 0.38, len, 0.38, 0.08); paint(ctx, pick(pal, color), pal.outline, o);
    rr(ctx, -len / 2, deck - 0.08, len, 0.08, 0.03); paint(ctx, pal.wood);
    for (const s of [-1, 1]) { rr(ctx, s * len * 0.35 - 0.9, r - 0.12, 1.8, deck - 0.38 - r + 0.18, 0.08); paint(ctx, pal.metalDark); }
  });
  for (const s of [-1, 1]) for (const d of [-0.5, 0.5]) wheel(P, x + s * len * 0.35 + d, r, { r, angle: rot, spokes: 6, minPx: 8, tire: 0.22 });
}

/* ---------------- Ambienti ---------------- */

// Albero visto dall'alto (chioma velata con il bordo) o di lato (tronco e chioma).
export function treeTop(P, x, y, { r = 1, minPx = 14 } = {}) {
  local(P, x, y, 0, unitFor(P, r, minPx), (ctx, pal, lw) => {
    ctx.globalAlpha = 0.55; disc(ctx, 0, 0, r); paint(ctx, pal.leafDark);
    ctx.globalAlpha = 1; disc(ctx, 0, 0, r); paint(ctx, null, pal.leafEdge, 1.5 * lw);
    disc(ctx, -r * 0.25, r * 0.22, r * 0.5); paint(ctx, null, pal.leafEdge, 1 * lw);
  });
}
export function treeSide(P, x, y, { h = 4, minPx = 30 } = {}) {
  local(P, x, y, 0, unitFor(P, h, minPx), (ctx, pal, lw) => {
    rr(ctx, -h * 0.04, 0, h * 0.08, h * 0.45, h * 0.02); paint(ctx, pal.trunkDark, pal.trunkEdge, 1.5 * lw);
    for (const [cx, cy, cr] of [[0, 0.62, 0.3], [-0.17, 0.55, 0.2], [0.16, 0.72, 0.18]]) {
      ctx.globalAlpha = 0.45; disc(ctx, cx * h, cy * h, cr * h); paint(ctx, pal.leafDark);
      ctx.globalAlpha = 1; disc(ctx, cx * h, cy * h, cr * h); paint(ctx, null, pal.leafEdge, 1.5 * lw);
    }
  });
}

// Fascia d'acqua tra y0 e y1 con increspature che scorrono: phase in metri (spostamento dell'acqua).
// Velata come un riempimento di Manim: sotto si vede ancora la griglia.
export function water(P, y0, y1, { phase = 0 } = {}) {
  const pal = palette(), b = P.cam.bounds(), dark = document.documentElement.dataset.theme === 'dark';
  P.poly([[b.x0, y0], [b.x1, y0], [b.x1, y1], [b.x0, y1]], { fill: pal.waterEdge, alpha: dark ? 0.16 : 0.22 });
  P.line([[b.x0, y0], [b.x1, y0]], { color: pal.waterEdge, width: 1.5, alpha: 0.8 });
  P.line([[b.x0, y1], [b.x1, y1]], { color: pal.waterEdge, width: 1.5, alpha: 0.8 });
  const H = y1 - y0, dx = Math.max(H / 4, 30 / P.cam.scale), rows = 5;
  for (let i = 0; i < rows; i++) {
    const yy = y0 + H * (i + 0.5) / rows, sh = phase + (i % 2) * dx / 2;
    for (let u = Math.floor((b.x0 - sh) / dx) * dx; u <= b.x1 - sh; u += dx) {
      const xx = u + sh, w = dx * 0.28, a = H * 0.02;
      P.line([[xx - w, yy], [xx - w / 2, yy + a], [xx, yy], [xx + w / 2, yy + a], [xx + w, yy]], { color: pal.waterEdge, width: 1.5, alpha: 0.45 });
    }
  }
}

// Fascia d'erba (riva) tra y0 e y1; edge = quota del bordo da evidenziare.
export function grass(P, y0, y1, edge) {
  const pal = palette(), b = P.cam.bounds(), dark = document.documentElement.dataset.theme === 'dark';
  P.poly([[b.x0, y0], [b.x1, y0], [b.x1, y1], [b.x0, y1]], { fill: pal.grassEdge, alpha: dark ? 0.1 : 0.16 });
  if (edge != null) P.line([[b.x0, edge], [b.x1, edge]], { color: pal.grassEdge, width: 2 });
}

// Binario a y = 0 con traversine ogni `gap` m; offset sposta le traversine (metri).
export function rails(P, { offset = 0, gap = 0.8 } = {}) {
  const pal = palette(), b = P.cam.bounds();
  P.poly([[b.x0, -0.18], [b.x1, -0.18], [b.x1, 0], [b.x0, 0]], { fill: pal.ballast });
  const ctx = P.ctx, [, ys] = P.S(0, 0), th = Math.max(4, 0.08 * P.cam.scale);
  ctx.save(); ctx.fillStyle = pal.woodDark;
  for (let u = Math.floor((b.x0 - offset) / gap) * gap; u <= b.x1 - offset; u += gap) {
    const [xs] = P.S(u + offset, 0), w = Math.max(5, 0.22 * P.cam.scale);
    ctx.fillRect(xs - w / 2, ys - th * 0.4, w, th);
  }
  ctx.restore();
  P.line([[b.x0, 0.02], [b.x1, 0.02]], { color: pal.metalDark, width: Math.max(3, 0.06 * P.cam.scale) });
}

// Anello di strada centrato in (cx, cy) con raggio medio R e larghezza w (metri): fascia velata e mezzeria tratteggiata.
export function roadRing(P, cx, cy, R, w) {
  const pal = palette(), ctx = P.ctx, [a, b] = P.S(cx, cy), s = P.cam.scale;
  const ro = (R + w / 2) * s, ri = Math.max(0, R - w / 2) * s;
  ctx.save();
  ctx.beginPath(); ctx.arc(a, b, ro, 0, Math.PI * 2); ctx.arc(a, b, ri, 0, Math.PI * 2, true);
  ctx.fillStyle = pal.asphaltEdge; ctx.globalAlpha = 0.25; ctx.fill();
  ctx.globalAlpha = 1; ctx.strokeStyle = pal.asphaltEdge; ctx.lineWidth = 1.5;
  for (const r of [ro, ri]) if (r > 0) { ctx.beginPath(); ctx.arc(a, b, r, 0, Math.PI * 2); ctx.stroke(); }
  ctx.strokeStyle = pal.roadLine; ctx.globalAlpha = 0.6; ctx.lineWidth = 1.5;
  ctx.setLineDash([Math.max(8, 1.5 * s), Math.max(8, 1.5 * s)]);
  ctx.beginPath(); ctx.arc(a, b, R * s, 0, Math.PI * 2); ctx.stroke();
  ctx.restore();
}

// Piattaforma di giostra vista dall'alto, ruotata di angle; il bordo esterno è a raggio R.
// Spicchi velati alternati (rosso e giallo di Manim) con i raggi e il bordo marcati.
export function carousel(P, cx, cy, { R = 4, angle = 0, sectors = 8 } = {}) {
  local(P, cx, cy, angle, P.cam.scale, (ctx, pal, lw) => {
    for (let i = 0; i < sectors; i++) {
      ctx.beginPath(); ctx.moveTo(0, 0);
      ctx.arc(0, 0, R, i * 2 * Math.PI / sectors, (i + 1) * 2 * Math.PI / sectors); ctx.closePath();
      ctx.globalAlpha = 0.2; paint(ctx, i % 2 ? pal.yellowEdge : pal.redEdge);
    }
    ctx.globalAlpha = 0.6; ctx.strokeStyle = pal.outline; ctx.lineWidth = 1 * lw; ctx.beginPath();
    for (let i = 0; i < sectors; i++) { const t = i * 2 * Math.PI / sectors; ctx.moveTo(0, 0); ctx.lineTo(Math.cos(t) * R, Math.sin(t) * R); }
    ctx.stroke();
    ctx.globalAlpha = 1;
    disc(ctx, 0, 0, R); paint(ctx, null, pal.redEdge, 2 * lw);
    disc(ctx, 0, 0, R * 0.12); paint(ctx, pal.metalDark, pal.metalEdge, 1.5 * lw);
  });
}
