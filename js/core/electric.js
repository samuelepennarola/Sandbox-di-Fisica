// Elettrostatica condivisa tra l'esperimento "Cariche e campo elettrico" e il costruttore libero:
// costante di Coulomb, campo di una carica puntiforme, tracciamento e disegno delle linee di campo,
// aspetto delle cariche.

export const K = 8.9875e9;   // N·m²/C²
export const MU = 1e-6;      // le cariche si danno in microcoulomb

// Campo (N/C) in (x, y) di una carica q (in C) posta in (cx, cy).
export function pointField(cx, cy, q, x, y) {
  const dx = x - cx, dy = y - cy, r2 = dx * dx + dy * dy;
  if (r2 < 1e-10) return [0, 0];
  const f = K * q / (r2 * Math.sqrt(r2));
  return [f * dx, f * dy];
}

// Linea di campo da un seme, nel verso dir (+1 lungo E, −1 contro), con il metodo del punto medio.
// opts: { box: [x0, y0, x1, y1], step(x, y) → passo, stop(x, y, i) → true per fermarsi, max }
export function traceLine(fieldAt, x, y, dir, { box, step, stop, max = 1400 }) {
  const pts = [[x, y]], [x0, y0, x1, y1] = box;
  const unit = (px, py) => { const [ex, ey] = fieldAt(px, py), m = Math.hypot(ex, ey); return m < 1e-9 ? null : [dir * ex / m, dir * ey / m]; };
  for (let i = 0; i < max; i++) {
    const h = step(x, y);
    const u1 = unit(x, y);
    if (!u1) break;
    const u2 = unit(x + u1[0] * h / 2, y + u1[1] * h / 2);
    if (!u2) break;
    x += u2[0] * h; y += u2[1] * h;
    pts.push([x, y]);
    if (x < x0 || x > x1 || y < y0 || y > y1) break;
    if (stop(x, y, i)) break;
  }
  return pts;
}

// Disegno delle linee: tratto sottile e una freccia del verso del campo a metà linea.
// Ogni linea è { pts, dir }: dir = −1 se è stata tracciata contro il campo (da una carica negativa).
export function drawFieldLines(P, lines, { alpha = 0.5 } = {}) {
  const ctx = P.ctx;
  ctx.save();
  ctx.strokeStyle = P.c.text; ctx.fillStyle = P.c.text; ctx.globalAlpha = alpha; ctx.lineWidth = 1.5; ctx.lineJoin = 'round';
  for (const L of lines) {
    if (L.pts.length < 2) continue;
    ctx.beginPath();
    L.pts.forEach(([x, y], i) => { const [a, b] = P.S(x, y); i ? ctx.lineTo(a, b) : ctx.moveTo(a, b); });
    ctx.stroke();
    const m = Math.floor(L.pts.length / 2);
    if (m < 1) continue;
    const [p0, p1] = [P.S(...L.pts[m - 1]), P.S(...L.pts[m])];
    let dx = (p1[0] - p0[0]) * L.dir, dy = (p1[1] - p0[1]) * L.dir;
    const d = Math.hypot(dx, dy);
    if (d < 1e-6) continue;
    dx /= d; dy /= d;
    const [cx, cy] = p1, hl = 8;
    ctx.beginPath(); ctx.moveTo(cx + dx * hl / 2, cy + dy * hl / 2);
    ctx.lineTo(cx - dx * hl / 2 - dy * hl * 0.4, cy - dy * hl / 2 + dx * hl * 0.4);
    ctx.lineTo(cx - dx * hl / 2 + dy * hl * 0.4, cy - dy * hl / 2 - dx * hl * 0.4);
    ctx.closePath(); ctx.fill();
  }
  ctx.restore();
}

const hueOf = positive => positive ? 2 : 214;
const lift = () => document.documentElement.dataset.theme === 'dark' ? 6 : 0;

// Sfera carica (rossa con +, blu con −) di raggio r px centrata in (a, b) px.
export function chargeSphere(P, a, b, r, positive, selected = false) {
  const ctx = P.ctx, hue = hueOf(positive), L = lift();
  ctx.save();
  if (selected) { ctx.strokeStyle = P.c.handle; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(a, b, r + 5, 0, Math.PI * 2); ctx.stroke(); }
  const g = ctx.createRadialGradient(a - r * 0.35, b - r * 0.4, r * 0.1, a, b, r);
  g.addColorStop(0, `hsl(${hue} 80% ${76 + L}%)`); g.addColorStop(0.6, `hsl(${hue} 68% ${54 + L}%)`); g.addColorStop(1, `hsl(${hue} 62% ${38 + L}%)`);
  ctx.shadowColor = 'rgba(0,0,0,.25)'; ctx.shadowBlur = 8; ctx.shadowOffsetY = 2;
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(a, b, r, 0, Math.PI * 2); ctx.fill();
  ctx.shadowColor = 'transparent';
  sign(ctx, a, b, r * 0.45, Math.max(2, r * 0.16), positive);
  ctx.restore();
}

// Piccolo distintivo con il segno, per i corpi carichi del costruttore.
export function chargeBadge(P, a, b, positive, r = 9) {
  const ctx = P.ctx, hue = hueOf(positive), L = lift();
  ctx.save();
  ctx.fillStyle = `hsl(${hue} 66% ${50 + L}%)`; ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(a, b, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  sign(ctx, a, b, r * 0.5, 2, positive);
  ctx.restore();
}

function sign(ctx, a, b, h, w, positive) {
  ctx.strokeStyle = '#fff'; ctx.lineWidth = w; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(a - h, b); ctx.lineTo(a + h, b);
  if (positive) { ctx.moveTo(a, b - h); ctx.lineTo(a, b + h); }
  ctx.stroke();
}
