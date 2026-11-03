// Sagome piatte (flat) per rendere riconoscibili gli oggetti senza modellarli.
// Ogni sagoma si disegna in coordinate mondo (metri, y verso l'alto) tramite il Painter:
// le misure sono in metri, con una dimensione minima in px perché resti visibile anche a zoom basso.

const PALETTE = {
  light: {
    outline: 'rgba(40, 32, 22, .55)', shadow: 'rgba(40, 30, 10, .16)', highlight: 'rgba(255, 255, 255, .55)',
    red: '#e4574b', redDark: '#b63c31', blue: '#3f7fd9', blueDark: '#2b5fae', yellow: '#f2b630', yellowDark: '#c98d12',
    green: '#4fa65a', greenDark: '#357d40', wood: '#c98b4f', woodDark: '#99652f', metal: '#97a1ae', metalDark: '#5f6875',
    tire: '#30333a', glass: '#bfe3f5', skin: '#f0c39c', shirt: '#3f7fd9', pants: '#3d4556', hair: '#5a3b24',
    leaf: '#6cb860', leafDark: '#468f42', trunk: '#8a5a33', grass: '#b5d99a', grassEdge: '#7fb069',
    water: '#bfe0f2', waterLine: 'rgba(255, 255, 255, .85)', asphalt: '#70747b', asphaltEdge: '#4d5056', roadLine: '#f6f2e6',
    ballast: '#c8bca6',
  },
  dark: {
    outline: 'rgba(0, 0, 0, .55)', shadow: 'rgba(0, 0, 0, .35)', highlight: 'rgba(255, 255, 255, .35)',
    red: '#ff6b5e', redDark: '#c4463b', blue: '#5f9df2', blueDark: '#3b72c2', yellow: '#ffc94d', yellowDark: '#d39b1f',
    green: '#5cc06a', greenDark: '#3d8c49', wood: '#d49b63', woodDark: '#a06a35', metal: '#a9b3c0', metalDark: '#6c7684',
    tire: '#15171b', glass: '#8fc6e0', skin: '#f0c39c', shirt: '#5f9df2', pants: '#2c3342', hair: '#3b2616',
    leaf: '#4f9e55', leafDark: '#357a3c', trunk: '#7a5030', grass: '#2f5238', grassEdge: '#4c7d56',
    water: '#21465c', waterLine: 'rgba(190, 225, 245, .45)', asphalt: '#3a3f46', asphaltEdge: '#25292e', roadLine: '#d9d4c4',
    ballast: '#4a4a46',
  },
};

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

// Palla con ombreggiatura a due toni; `spin` (rad) ruota una banda per mostrare la rotazione.
export function ball(P, x, y, { r = 0.15, minPx = 11, color = 'red', spin = null } = {}) {
  local(P, x, y, 0, unitFor(P, r, minPx), (ctx, pal, lw) => {
    const base = pick(pal, color), dark = pal[color + 'Dark'] ?? base;
    disc(ctx, 0, 0, r); paint(ctx, dark);
    ctx.save(); disc(ctx, 0, 0, r); ctx.clip();
    disc(ctx, -r * 0.18, r * 0.18, r * 0.92); paint(ctx, base);
    if (spin != null) {
      ctx.rotate(spin);
      ctx.fillStyle = pal.highlight; ctx.fillRect(-r, -r * 0.14, 2 * r, r * 0.28);
    }
    ctx.restore();
    disc(ctx, -r * 0.38, r * 0.4, r * 0.2); paint(ctx, pal.highlight);
    disc(ctx, 0, 0, r); paint(ctx, null, pal.outline, 1.5 * lw);
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

// Cassa di legno centrata in (x, y), lati w × h, ruotata di angle.
export function crate(P, x, y, { w = 1, h = 0.7, angle = 0, minPx = 26, color = 'wood' } = {}) {
  local(P, x, y, angle, unitFor(P, Math.max(w, h), minPx), (ctx, pal, lw) => {
    const base = pick(pal, color), dark = pal[color + 'Dark'] ?? base;
    const m = Math.min(w, h) * 0.12;
    rr(ctx, -w / 2, -h / 2, w, h, m * 0.6); paint(ctx, base, pal.outline, 1.5 * lw);
    ctx.strokeStyle = dark; ctx.lineWidth = Math.max(m * 0.55, 1.5 * lw);
    rr(ctx, -w / 2 + m, -h / 2 + m, w - 2 * m, h - 2 * m, m * 0.3); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-w / 2 + m, -h / 2 + m); ctx.lineTo(w / 2 - m, h / 2 - m); ctx.stroke();
  });
}

// Ruota con cerchione e raggi; angle = rotazione accumulata (rad).
export function wheel(P, x, y, { r = 0.35, angle = 0, spokes = 8, minPx = 14, tire = 0.18 } = {}) {
  local(P, x, y, angle, unitFor(P, r, minPx), (ctx, pal, lw) => {
    disc(ctx, 0, 0, r); paint(ctx, pal.tire, pal.outline, 1.5 * lw);
    disc(ctx, 0, 0, r * (1 - tire)); paint(ctx, pal.metal);
    ctx.strokeStyle = pal.metalDark; ctx.lineWidth = Math.max(r * 0.06, 1.5 * lw);
    ctx.beginPath();
    for (let i = 0; i < spokes; i++) { const a = i * 2 * Math.PI / spokes; ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a) * r * (1 - tire), Math.sin(a) * r * (1 - tire)); }
    ctx.stroke();
    disc(ctx, 0, 0, r * 0.16); paint(ctx, pal.metalDark);
    // Valvola colorata: rende visibile la rotazione.
    disc(ctx, r * (1 - tire * 0.5), 0, r * 0.07); paint(ctx, pal.yellow);
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

// Albero visto dall'alto (chioma a grappolo) o di lato (tronco e chioma).
export function treeTop(P, x, y, { r = 1, minPx = 14 } = {}) {
  local(P, x, y, 0, unitFor(P, r, minPx), (ctx, pal, lw) => {
    disc(ctx, r * 0.15, -r * 0.15, r); paint(ctx, pal.shadow);
    disc(ctx, 0, 0, r); paint(ctx, pal.leafDark, pal.outline, 1.2 * lw);
    disc(ctx, -r * 0.25, r * 0.22, r * 0.62); paint(ctx, pal.leaf);
    disc(ctx, r * 0.35, r * 0.1, r * 0.35); paint(ctx, pal.leaf);
  });
}
export function treeSide(P, x, y, { h = 4, minPx = 30 } = {}) {
  local(P, x, y, 0, unitFor(P, h, minPx), (ctx, pal, lw) => {
    rr(ctx, -h * 0.05, 0, h * 0.1, h * 0.5, h * 0.03); paint(ctx, pal.trunk, pal.outline, 1.2 * lw);
    for (const [cx, cy, cr, c] of [[0, 0.62, 0.3, 'leafDark'], [-0.17, 0.55, 0.2, 'leaf'], [0.16, 0.72, 0.18, 'leaf']]) {
      disc(ctx, cx * h, cy * h, cr * h); paint(ctx, pal[c], c === 'leafDark' ? pal.outline : null, 1.2 * lw);
    }
  });
}

// Fascia d'acqua tra y0 e y1 con increspature che scorrono: phase in metri (spostamento dell'acqua).
export function water(P, y0, y1, { phase = 0 } = {}) {
  const pal = palette(), b = P.cam.bounds();
  P.poly([[b.x0, y0], [b.x1, y0], [b.x1, y1], [b.x0, y1]], { fill: pal.water });
  const H = y1 - y0, dx = Math.max(H / 4, 30 / P.cam.scale), rows = 5;
  for (let i = 0; i < rows; i++) {
    const yy = y0 + H * (i + 0.5) / rows, sh = phase + (i % 2) * dx / 2;
    for (let u = Math.floor((b.x0 - sh) / dx) * dx; u <= b.x1 - sh; u += dx) {
      const xx = u + sh, w = dx * 0.28, a = H * 0.02;
      P.line([[xx - w, yy], [xx - w / 2, yy + a], [xx, yy], [xx + w / 2, yy + a], [xx + w, yy]], { color: pal.waterLine, width: 2 });
    }
  }
}

// Fascia d'erba (riva) tra y0 e y1; edge = quota del bordo da evidenziare.
export function grass(P, y0, y1, edge) {
  const pal = palette(), b = P.cam.bounds();
  P.poly([[b.x0, y0], [b.x1, y0], [b.x1, y1], [b.x0, y1]], { fill: pal.grass });
  if (edge != null) P.line([[b.x0, edge], [b.x1, edge]], { color: pal.grassEdge, width: 3 });
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

// Anello di strada centrato in (cx, cy) con raggio medio R e larghezza w (metri).
export function roadRing(P, cx, cy, R, w) {
  const pal = palette(), ctx = P.ctx, [a, b] = P.S(cx, cy), s = P.cam.scale;
  const ro = (R + w / 2) * s, ri = Math.max(0, R - w / 2) * s;
  ctx.save();
  ctx.beginPath(); ctx.arc(a, b, ro, 0, Math.PI * 2); ctx.arc(a, b, ri, 0, Math.PI * 2, true);
  ctx.fillStyle = pal.asphalt; ctx.fill();
  ctx.strokeStyle = pal.roadLine; ctx.lineWidth = Math.max(2, 0.12 * s);
  for (const r of [ro - ctx.lineWidth, ri + ctx.lineWidth]) if (r > 0) { ctx.beginPath(); ctx.arc(a, b, r, 0, Math.PI * 2); ctx.stroke(); }
  ctx.setLineDash([Math.max(8, 1.5 * s), Math.max(8, 1.5 * s)]);
  ctx.beginPath(); ctx.arc(a, b, R * s, 0, Math.PI * 2); ctx.stroke();
  ctx.restore();
}

// Piattaforma di giostra vista dall'alto, ruotata di angle; il bordo esterno è a raggio R.
export function carousel(P, cx, cy, { R = 4, angle = 0, sectors = 8 } = {}) {
  local(P, cx, cy, angle, P.cam.scale, (ctx, pal, lw) => {
    for (let i = 0; i < sectors; i++) {
      ctx.beginPath(); ctx.moveTo(0, 0);
      ctx.arc(0, 0, R, i * 2 * Math.PI / sectors, (i + 1) * 2 * Math.PI / sectors); ctx.closePath();
      paint(ctx, i % 2 ? pal.yellow : pal.red);
    }
    disc(ctx, 0, 0, R); paint(ctx, null, pal.outline, 2 * lw);
    ctx.strokeStyle = pal.highlight; ctx.lineWidth = R * 0.04;
    disc(ctx, 0, 0, R * 0.93); ctx.stroke();
    disc(ctx, 0, 0, R * 0.14); paint(ctx, pal.metal, pal.outline, 1.5 * lw);
    disc(ctx, 0, 0, R * 0.06); paint(ctx, pal.metalDark);
  });
}
