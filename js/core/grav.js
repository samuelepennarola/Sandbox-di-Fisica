// Strumenti comuni del modulo Gravitazione.
//   SCALES: due sistemi di unità (scelta dell'utente: entrambe). «Sistema solare»: UA, anni, masse solari, con
//           G = 4π² (così la Terra fa un giro in un anno a 1 UA). «Unità semplici»: G = 1, numeri piccoli.
//   elements: elementi dell'orbita di un corpo attorno a una massa (μ = G M) da posizione e velocità;
//   conicPts: i punti della conica prevista; star / planet: corpi celesti in stile Manim.
import { palette, mixHex, shadedDisc } from './manim.js';

export const SCALES = {
  solar: { G: 4 * Math.PI * Math.PI, L: 'UA', T: 'anni', M: 'M_\\odot', Mtxt: 'M☉', name: 'Sistema solare' },
  simple: { G: 1, L: 'm', T: 's', M: 'kg', Mtxt: 'kg', name: 'Unità semplici (G = 1)' },
};
export const scaleOf = p => SCALES[p.scale] ?? SCALES.simple;
export const scaleParam = (value = 'solar') => ({
  key: 'scale', type: 'select', label: 'Scala', value,
  options: [{ label: 'Sistema solare (UA, anni)', value: 'solar' }, { label: 'Unità semplici (G = 1)', value: 'simple' }],
});

// Elementi dell'orbita kepleriana relativa (r, v rispetto alla massa centrale, μ = G M).
export function elements(x, y, vx, vy, mu) {
  const r = Math.hypot(x, y), v2 = vx * vx + vy * vy, h = x * vy - y * vx;
  const E = v2 / 2 - mu / r;                                       // energia specifica
  const rv = x * vx + y * vy;
  const ex = ((v2 - mu / r) * x - rv * vx) / mu, ey = ((v2 - mu / r) * y - rv * vy) / mu;
  const e = Math.hypot(ex, ey), p = h * h / mu, a = Math.abs(E) > 1e-12 ? -mu / (2 * E) : Infinity;
  const T = E < 0 ? 2 * Math.PI * Math.sqrt(a * a * a / mu) : Infinity;
  return { r, h, E, e, ex, ey, p, a, T, w: Math.atan2(ey, ex), bound: E < 0 };
}

// Punti della conica prevista (fuoco nell'origine). Per parabole e iperboli solo il ramo percorso, fino a rmax.
export function conicPts(el, rmax, n = 240) {
  const pts = [], sgn = el.h >= 0 ? 1 : -1;
  const nuMax = el.e < 1 ? Math.PI : Math.acos(Math.max(-1, -1 / el.e)) - 1e-3;
  for (let i = 0; i <= n; i++) {
    const nu = -nuMax + 2 * nuMax * i / n, den = 1 + el.e * Math.cos(nu);
    if (den <= 1e-6) continue;
    const r = el.p / den;
    if (r > rmax) { if (pts.length && pts[pts.length - 1] !== null) pts.push(null); continue; }
    const th = el.w + sgn * nu;
    pts.push([r * Math.cos(th), r * Math.sin(th)]);
  }
  // Spezza in tratti dove la conica esce dalla vista.
  const segs = [[]];
  for (const q of pts) { if (q === null) segs.push([]); else segs[segs.length - 1].push(q); }
  return segs.filter(s => s.length > 1);
}

// Stella: disco luminoso (alone nel tema scuro, disco nitido con corona delicata nel tema chiaro).
export function star(P, x, y, rPx, { color, alpha = 1 } = {}) {
  const M = P.M ?? palette(P.c), ctx = P.ctx, [a, b] = P.S(x, y), col = color ?? (M.dark ? '#FFD84A' : '#d4a514');
  ctx.save();
  if (M.dark) {
    const g = ctx.createRadialGradient(a, b, 0, a, b, rPx * 3.2);
    g.addColorStop(0, col + 'bb'); g.addColorStop(0.45, col + '33'); g.addColorStop(1, col + '00');
    ctx.globalAlpha = alpha; ctx.fillStyle = g; ctx.beginPath(); ctx.arc(a, b, rPx * 3.2, 0, Math.PI * 2); ctx.fill();
  }
  shadedDisc(ctx, a, b, rPx, col, M.dark, { alpha, glow: false });
  ctx.restore();
}

// Pianeta: sfera 2.5D con doppio registro scuro/chiaro.
export function planet(P, x, y, rPx, color, { alpha = 1 } = {}) {
  const M = P.M ?? palette(P.c), ctx = P.ctx, [a, b] = P.S(x, y), col = M.body[color] ?? color;
  ctx.save();
  shadedDisc(ctx, a, b, rPx, col, M.dark, { alpha, glow: M.dark && rPx >= 5 });
  ctx.restore();
}

// Spicchi di Keplero: dal Sole (fuoco) alle posizioni del pianeta agli istanti segnati; colori alternati.
// marks: [[x, y], ...] alle fine di ogni intervallo uguale; path: tutte le posizioni (per il bordo curvo).
export function wedges(P, path, cuts, { colors, alpha = 0.32, proj = null } = {}) {
  const ctx = P.ctx, S = (x, y) => (proj ? P.S(...proj(x, y, 0)) : P.S(x, y));
  for (let i = 0; i + 1 < cuts.length; i++) {
    const i0 = cuts[i], i1 = cuts[i + 1];
    ctx.save();
    ctx.globalAlpha = alpha; ctx.fillStyle = colors[i % colors.length];
    ctx.beginPath();
    const [ox, oy] = S(0, 0); ctx.moveTo(ox, oy);
    for (let k = i0; k <= i1; k++) { const [a, b] = S(path[k][0], path[k][1]); ctx.lineTo(a, b); }
    ctx.closePath(); ctx.fill();
    ctx.restore();
  }
}

// Area di un settore (fuoco nell'origine) lungo un tratto del percorso: somma dei triangolini.
export function sectorArea(path, i0, i1) {
  let A = 0;
  for (let k = i0; k < i1; k++) A += 0.5 * (path[k][0] * path[k + 1][1] - path[k][1] * path[k + 1][0]);
  return Math.abs(A);
}
