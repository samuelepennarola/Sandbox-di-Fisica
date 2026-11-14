// Regia e annotazioni alla 3Blue1Brown per gli esperimenti di meccanica.
//   Stage: frecce che crescono quando compaiono (GrowArrow), tracciati che si disegnano (Create),
//          corpi che nascono con un rimbalzo, valori che inseguono morbidi (sopra la classe Regia di manim.js).
//   brace, angleMark, dropLines, formula: parentesi graffe con la misura, archi d'angolo con l'ampiezza,
//          proiezioni tratteggiate e formule dal vivo sulla scena, in LaTeX classico.
//   fc, C: i colori della scena per le formule del pannello (KaTeX \color).
import { Regia, palette, tex, texBox, arrowLabel, vecLabel } from './manim.js';
import { rate, partial, cumulate } from './anim.js';

const reducedMotion = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } };

/* ---------------- Regia ---------------- */

const GROW_S = 0.6;    // GrowArrow
const GONE_S = 0.25;   // un elemento assente da più di così, quando ricompare, ricresce

export class Stage {
  constructor() { this.reset(); }

  // Nuova "scena": tutto ricompare con le sue animazioni d'ingresso (al montaggio dell'esperimento).
  reset() { this.R = new Regia(); this.seen = new Map(); }

  // Da chiamare all'inizio di draw(). Nelle istantanee (ui.snapshot) e con "riduci movimento" tutto è subito
  // allo stato finale e lo stato della regia non viene toccato.
  begin(P, ui = {}) {
    this.snap = !!ui.snapshot;
    this.still = this.snap || reducedMotion();
    if (!this.snap) this.R.tick(this.still);
    this.P = P; this.M = P.M ?? palette(P.c);
    // Le frecce crescono dalla coda quando compaiono; l'etichetta arriva sfumando alla fine della crescita.
    const orig = P.arrow.bind(P);
    P.arrow = (x0, y0, x1, y1, o = {}) => {
      const g = this.grow('arr:' + (o.key ?? o.label ?? o.color ?? 'vel'), GROW_S, o.delay ?? 0);
      if (g <= 0.002) return;
      const ex = x0 + (x1 - x0) * g, ey = y0 + (y1 - y0) * g;
      orig(x0, y0, ex, ey, { ...o, label: null });
      if (!o.label || this.snap) return;   // istantanee: niente vettori, quindi nemmeno le loro etichette
      const [a, b] = P.S(x0, y0), [c, d] = P.S(ex, ey), len = Math.hypot(c - a, d - b);
      if (len <= 18) return;
      const la = (o.alpha ?? 1) * rate.smooth(Math.min(1, Math.max(0, (g - 0.55) / 0.45)));
      arrowLabel(P, { x: c, y: d, ux: (c - a) / len, uy: (d - b) / len, len }, vecLabel(o.label), P.col(o.color ?? 'vel'), this.M, la);
    };
    return this;
  }

  // Avanzamento 0 → 1 (curva smooth di Manim) di un elemento da quando è comparso; delay (s) lo ritarda
  // (LaggedStart: più elementi comparsi insieme crescono uno dopo l'altro).
  grow(key, run = GROW_S, delay = 0) {
    if (this.still) return 1;
    const now = this.R.now, s = this.seen.get(key);
    if (!s || now - s.last > GONE_S) { this.seen.set(key, { t0: now, last: now, sig: null }); return 0; }
    s.last = now;
    const t = (now - s.t0 - delay) / run;
    return t <= 0 ? 0 : t >= 1 ? 1 : rate.smooth(t);
  }

  // Come grow, ma riparte quando sig cambia (per esempio una traiettoria che va ridisegnata da capo).
  replay(key, sig, run = 0.9) {
    if (this.still) return 1;
    const now = this.R.now, s = this.seen.get(key);
    if (!s || now - s.last > GONE_S || s.sig !== sig) { this.seen.set(key, { t0: now, last: now, sig }); return 0; }
    s.last = now;
    const t = (now - s.t0) / run;
    return t >= 1 ? 1 : rate.smooth(t);
  }

  // Scala di un corpo appena comparso (piccolo rimbalzo).
  born(id) { return this.still ? 1 : this.R.born(id); }

  // Valori mostrati che inseguono quelli veri (tau in s); snap: salto immediato (mentre si trascina).
  smooth(key, values, tau = 0.12, snap = false) { return this.snap ? values : this.R.smooth(key, values, tau, snap); }
}

// Lunghezza in px di una freccia per una grandezza di modulo m. La scala è compressa (radice) tra min e max px,
// con max raggiunto quando m = ref: l'ordine delle intensità resta, ma una freccia non diventa mai illeggibile
// né invade la scena. È in px, quindi non dipende dallo zoom. Vicino a zero si accorcia fino a sparire.
export function arrowPx(m, ref, { min = 34, max = 130 } = {}) {
  const u = Math.abs(m) / ref;
  if (!(u > 0)) return 0;
  const L = min + (max - min) * Math.sqrt(Math.min(1, u));
  return u < 0.01 ? L * u / 0.01 : L;
}
// Inversa di arrowPx: il modulo che corrisponde a una freccia lunga px (per le maniglie sulla punta).
export function arrowMag(px, ref, { min = 34, max = 130 } = {}) {
  const u = Math.min(1, Math.max(0, (px - min) / (max - min)));
  return ref * u * u;
}

// Parte iniziale di una polilinea (Create di Manim), f ∈ [0, 1].
export function createPts(pts, f) {
  if (f >= 1 || pts.length < 2) return pts;
  return partial(pts, Math.max(0, f), cumulate(pts));
}

/* ---------------- Annotazioni ---------------- */

const free = cam => cam.padFn?.() ?? { top: 70, right: 20, bottom: 20, left: 20 };

// Formula TeX in coordinate schermo, tenuta dentro l'area libera della scena (barra, ispettore, rail).
export function formula(P, a, b, src, { color, align = 'center', size = 17, alpha = 1 } = {}) {
  const M = P.M ?? palette(P.c), pad = free(P.cam), B = texBox(P, src, size);
  let x0 = align === 'center' ? a - B.w / 2 : align === 'right' ? a - B.w : a;
  x0 = Math.min(Math.max(x0, pad.left + 6), P.cam.w - pad.right - 6 - B.w);
  const y = Math.min(Math.max(b, pad.top + 6 - B.top), P.cam.h - pad.bottom - 6 - B.bot);
  tex(P, x0, y, src, { size, color: color ?? M.text, align: 'left', halo: M.bg, alpha });
  return { x: x0, y, w: B.w, top: B.top, bot: B.bot };
}

// Formula oltre la punta di una freccia (tip in px: x, y e versore ux, uy), distanziata secondo il suo ingombro.
export function formulaAtTip(P, tip, src, { gap = 14, size = 17, ...o } = {}) {
  const B = texBox(P, src, size), d = gap + Math.abs(tip.ux) * B.w / 2 + Math.abs(tip.uy) * (B.bot - B.top) / 2;
  return formula(P, tip.x + tip.ux * d, tip.y + tip.uy * d, src, { size, ...o });
}

// Formula accanto a un segmento (in px, da (a, b) a (c, d)), dal lato "in alto" sullo schermo.
export function formulaBeside(P, a, b, c, d, src, { gap = 10, size = 17, ...o } = {}) {
  const L = Math.hypot(c - a, d - b) || 1;
  let nx = -(d - b) / L, ny = (c - a) / L;
  if (ny > 0 || (Math.abs(ny) < 1e-6 && nx < 0)) { nx = -nx; ny = -ny; }
  const B = texBox(P, src, size), off = gap + Math.abs(nx) * B.w / 2 + Math.abs(ny) * (B.bot - B.top) / 2;
  return formula(P, (a + c) / 2 + nx * off, (b + d) / 2 + ny * off, src, { size, ...o });
}

// Etichette che arrivano alla fine di una crescita g ∈ [0, 1] (l'ultimo 45%).
export const rate01 = g => rate.smooth(Math.min(1, Math.max(0, (g - 0.55) / 0.45)));

// Parentesi graffa tra i punti mondo a e b, sul lato side (+1: a sinistra andando da a verso b), con etichetta TeX.
// grow ∈ [0, 1] la fa crescere dal centro (GrowFromCenter); alpha la sfuma.
export function brace(P, a, b, label, { side = 1, gap = 8, color, alpha = 1, grow = 1, size = 16 } = {}) {
  const M = P.M ?? palette(P.c), ctx = P.ctx, col = color ?? M.text;
  let [ax, ay] = P.S(a[0], a[1]), [bx, by] = P.S(b[0], b[1]);
  const mx = (ax + bx) / 2, my = (ay + by) / 2;
  ax = mx + (ax - mx) * grow; ay = my + (ay - my) * grow; bx = mx + (bx - mx) * grow; by = my + (by - my) * grow;
  const len = Math.hypot(bx - ax, by - ay);
  if (len < 4 || alpha <= 0) return;
  const ux = (bx - ax) / len, uy = (by - ay) / len, nx = uy * side, ny = -ux * side;
  const w = Math.min(11, Math.max(5, len * 0.12)), q = Math.min(w * 1.2, len / 4);
  const p = (s, h) => [ax + ux * s + nx * (gap + h), ay + uy * s + ny * (gap + h)];
  ctx.save();
  ctx.globalAlpha = alpha; ctx.strokeStyle = col; ctx.lineWidth = 2.4; ctx.lineJoin = ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(...p(0, 0));
  ctx.quadraticCurveTo(...p(0, w / 2), ...p(q, w / 2));
  ctx.lineTo(...p(len / 2 - q, w / 2));
  ctx.quadraticCurveTo(...p(len / 2, w / 2), ...p(len / 2, w));
  ctx.quadraticCurveTo(...p(len / 2, w / 2), ...p(len / 2 + q, w / 2));
  ctx.lineTo(...p(len - q, w / 2));
  ctx.quadraticCurveTo(...p(len, w / 2), ...p(len, 0));
  ctx.stroke();
  ctx.restore();
  if (!label) return;
  // Etichetta oltre la punta della graffa, distanziata secondo il suo ingombro nella direzione della normale.
  const B = texBox(P, label, size), d = gap + w + 6 + Math.abs(nx) * B.w / 2 + Math.abs(ny) * (B.bot - B.top) / 2;
  const la = alpha * rate.smooth(Math.min(1, Math.max(0, (grow - 0.5) / 0.5)));
  tex(P, mx + nx * d, my + ny * d, label, { size, color: col, halo: M.bg, alpha: la });
}

// Arco d'angolo attorno al punto mondo (x, y), raggio r px, dagli angoli a0 ad a1 (rad, antiorari da +x),
// con l'etichetta TeX (per esempio "\theta = 50°") a metà arco. grow traccia l'arco da a0.
export function angleMark(P, x, y, r, a0, a1, label, { color, alpha = 1, grow = 1, size = 16, labelR } = {}) {
  const M = P.M ?? palette(P.c), ctx = P.ctx, col = color ?? M.text, [cx, cy] = P.S(x, y);
  const e = a0 + (a1 - a0) * grow;
  if (Math.abs(e - a0) < 1e-3 || alpha <= 0) return;
  ctx.save();
  ctx.globalAlpha = alpha; ctx.strokeStyle = col; ctx.lineWidth = 2.4; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.arc(cx, cy, r, -a0, -e, e > a0); ctx.stroke();
  ctx.restore();
  if (!label) return;
  const m = (a0 + a1) / 2, B = texBox(P, label, size);
  const R = labelR ?? r + 12 + Math.abs(Math.cos(m)) * B.w / 2 + Math.abs(Math.sin(m)) * (B.bot - B.top) / 2;
  const la = alpha * rate.smooth(Math.min(1, Math.max(0, (grow - 0.5) / 0.5)));
  tex(P, cx + Math.cos(m) * R, cy - Math.sin(m) * R, label, { size, color: col, halo: M.bg, alpha: la });
}

// Proiezioni tratteggiate di un punto: verso la retta y = toY (verticale) e verso la retta x = toX (orizzontale),
// con un pallino sul piede. Una delle due può mancare (null).
export function dropLines(P, x, y, { toY = 0, toX = null, color, colorX, colorY, alpha = 1 } = {}) {
  const M = P.M ?? palette(P.c), cV = colorY ?? color ?? M.muted, cH = colorX ?? color ?? M.muted;
  if (toY != null && Math.abs(y - toY) * P.cam.scale > 3) {
    P.line([[x, y], [x, toY]], { color: cV, width: 1.4, dash: [4, 5], alpha: 0.8 * alpha });
    P.circle(x, toY, 3.5, { fill: cV, alpha });
  }
  if (toX != null && Math.abs(x - toX) * P.cam.scale > 3) {
    P.line([[x, y], [toX, y]], { color: cH, width: 1.4, dash: [4, 5], alpha: 0.8 * alpha });
    P.circle(toX, y, 3.5, { fill: cH, alpha });
  }
}

/* ---------------- Colori nelle formule ---------------- */

// Colore della scena (chiave del Painter: vel, acc, weight, normal, friction, applied, ...) nel tema corrente.
export function fc(key) {
  const M = palette({ bg: '#f6f3ea' });
  return M.vec[key] ?? M[key] ?? key;
}
// Parte di una formula KaTeX nel colore della grandezza sulla scena: C('vel', 'v_0').
export const C = (key, s) => `\\textcolor{${fc(key)}}{${s}}`;
