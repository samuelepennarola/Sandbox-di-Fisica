// Kit grafico "alla 3Blue1Brown": palette di Manim per i due temi, piano cartesiano (NumberPlane),
// frecce sottili con punta piena e scritte matematiche in LaTeX classico (font Computer Modern di KaTeX,
// già inclusi offline in vendor/katex) disegnate direttamente sul canvas.
// Pensato per essere esteso a tutti gli esperimenti: per ora lo usa "Cariche e campo elettrico".
import { niceStep } from './math.js';
import { MANIM } from './anim.js';

export const isDark = () => document.documentElement.dataset.theme === 'dark';

// Palette: nel tema scuro i colori di Manim su fondo quasi nero; nel tema chiaro le stesse tinte, scurite per la carta.
export function palette(c) {
  if (isDark()) return {
    dark: true, bg: '#0b0b0d', text: '#ece9e0', muted: MANIM.greyB, axis: '#ffffff', plane: MANIM.blueD, planeA: [0.42, 0.13],
    pos: MANIM.red, neg: MANIM.blue, force: MANIM.yellow, fx: MANIM.teal, fy: MANIM.green, field: MANIM.gold, sel: MANIM.blue,
    ramp: [MANIM.blueE, MANIM.blueD, MANIM.blue, MANIM.teal, MANIM.green], lineA: 0.9,
  };
  return {
    dark: false, bg: c.bg, text: '#23211c', muted: '#6b6658', axis: '#23211c', plane: MANIM.blueE, planeA: [0.3, 0.1],
    pos: '#d9443a', neg: '#1f86ad', force: '#b8860b', fx: '#12876c', fy: '#4b8a2a', field: '#c25e12', sel: '#1f86ad',
    ramp: ['#9fbfd0', '#5a9cc0', '#236b8e', '#12876c', '#3f7f22'], lineA: 0.9,
  };
}

// Colore di una linea di campo in base all'intensità (scala logaritmica tra lo e hi, in N/C).
export function rampColor(M, m, lo = 1e4, hi = 3e6) {
  const t = Math.min(1, Math.max(0, Math.log(m / lo) / Math.log(hi / lo))) * (M.ramp.length - 1);
  const i = Math.min(M.ramp.length - 2, Math.floor(t));
  return mixHex(M.ramp[i], M.ramp[i + 1], t - i);
}
export function mixHex(c1, c2, t) {
  const p = c => [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16));
  const a = p(c1), b = p(c2);
  return '#' + a.map((v, i) => Math.round(v + (b[i] - v) * t).toString(16).padStart(2, '0')).join('');
}

/* ---------------- Piano cartesiano ---------------- */

// Griglia del NumberPlane: linee principali più marcate, suddivisioni tenui. Solo le linee (va sotto a tutto).
export function drawPlaneGrid(ctx, cam, M) {
  const step = niceStep(80 / cam.scale), minor = step / 2;
  const { x0, y0, x1, y1 } = cam.bounds();
  ctx.save();
  ctx.strokeStyle = M.plane; ctx.lineWidth = 1;
  for (const [s, alpha] of [[minor, M.planeA[1]], [step, M.planeA[0]]]) {
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    for (let x = Math.ceil(x0 / s) * s; x <= x1; x += s) {
      if (s === minor && Math.abs(x / step - Math.round(x / step)) < 1e-6) continue;
      const [a] = cam.toScreen(x, 0); ctx.moveTo(Math.round(a) + .5, 0); ctx.lineTo(Math.round(a) + .5, cam.h);
    }
    for (let y = Math.ceil(y0 / s) * s; y <= y1; y += s) {
      if (s === minor && Math.abs(y / step - Math.round(y / step)) < 1e-6) continue;
      const [, b] = cam.toScreen(0, y); ctx.moveTo(0, Math.round(b) + .5); ctx.lineTo(cam.w, Math.round(b) + .5);
    }
    ctx.stroke();
  }
  ctx.restore();
}

// Assi con tacche e numeri in Computer Modern. Se l'origine esce dalla vista l'asse resta sul bordo.
// k converte i metri nell'unità mostrata (100 per i centimetri).
export function drawPlaneAxes(P, M, { unit = 'm', k = 1 } = {}) {
  const { ctx, cam } = P;
  const pad = cam.padFn?.() ?? { top: 70, right: 20, bottom: 20, left: 20 };
  const L = pad.left + 8, R = cam.w - pad.right - 8, T = pad.top - 6, Bm = cam.h - pad.bottom + 6;
  let [ox, oy] = cam.toScreen(0, 0);
  ox = Math.min(Math.max(ox, L + 30), R - 30);
  oy = Math.min(Math.max(oy, T + 30), Bm - 20);
  const step = niceStep(80 / cam.scale);
  const dec = Math.max(0, -Math.floor(Math.log10(step * k) + 1e-9));
  const lab = v => { const u = Math.abs(v) < 1e-9 ? 0 : v * k; return (u < 0 ? '−' : '') + Math.abs(u).toFixed(dec).replace('.', ','); };
  ctx.save();
  ctx.strokeStyle = ctx.fillStyle = M.axis; ctx.globalAlpha = M.dark ? 0.85 : 0.75; ctx.lineWidth = 1.6;
  ctx.beginPath(); ctx.moveTo(L, oy); ctx.lineTo(R, oy); ctx.moveTo(ox, Bm); ctx.lineTo(ox, T); ctx.stroke();
  const head = (x, y, dx, dy) => { ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - dx * 10 - dy * 4.5, y - dy * 10 + dx * 4.5); ctx.lineTo(x - dx * 10 + dy * 4.5, y - dy * 10 - dx * 4.5); ctx.closePath(); ctx.fill(); };
  head(R, oy, 1, 0); head(ox, T, 0, -1);
  const { x0, y0, x1, y1 } = cam.bounds();
  ctx.lineWidth = 1.3; ctx.beginPath();
  const xs = [], ys = [];
  for (let x = Math.ceil(x0 / step) * step; x <= x1; x += step) {
    const [a] = cam.toScreen(x, 0);
    if (a < L + 4 || a > R - 24 || Math.abs(a - ox) < 3) continue;
    ctx.moveTo(a, oy - 5); ctx.lineTo(a, oy + 5); xs.push([a, lab(x)]);
  }
  for (let y = Math.ceil(y0 / step) * step; y <= y1; y += step) {
    const [, b] = cam.toScreen(0, y);
    if (b < T + 22 || b > Bm - 4 || Math.abs(b - oy) < 3) continue;
    ctx.moveTo(ox - 5, b); ctx.lineTo(ox + 5, b); ys.push([b, lab(y)]);
  }
  ctx.stroke();
  ctx.restore();
  for (const [a, t] of xs) tex(P, a, oy + 16, t, { size: 13, color: M.muted, halo: M.bg });
  for (const [b, t] of ys) tex(P, ox - 9, b, t, { size: 13, color: M.muted, align: 'right', halo: M.bg });
  tex(P, R - 2, oy - 14, `x\\ (\\mathrm{${unit}})`, { size: 17, color: M.text, align: 'right', halo: M.bg });
  tex(P, ox + 10, T + 10, `y\\ (\\mathrm{${unit}})`, { size: 17, color: M.text, align: 'left', halo: M.bg });
}

/* ---------------- Frecce ---------------- */

// Freccia alla Manim, in px: asta sottile e punta triangolare piena; grow (0..1) la fa crescere dalla coda.
export function arrowS(ctx, a, b, c, d, color, { width = 3, tip = 14, grow = 1, alpha = 1, halo = null } = {}) {
  c = a + (c - a) * grow; d = b + (d - b) * grow;
  const len = Math.hypot(c - a, d - b);
  if (len < 1.5) return null;
  const ux = (c - a) / len, uy = (d - b) / len, h = Math.min(tip, len * 0.5), w = h * 0.5;
  const shaftEnd = [c - ux * h * 0.9, d - uy * h * 0.9];
  const tipPath = () => { ctx.beginPath(); ctx.moveTo(c, d); ctx.lineTo(c - ux * h - uy * w, d - uy * h + ux * w); ctx.lineTo(c - ux * h + uy * w, d - uy * h - ux * w); ctx.closePath(); };
  ctx.save();
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  if (halo) {
    // Alone del colore di fondo: stacca la freccia dalle linee di campo che attraversa.
    ctx.globalAlpha = alpha * 0.7; ctx.strokeStyle = halo; ctx.lineWidth = width + 4;
    ctx.beginPath(); ctx.moveTo(a, b); ctx.lineTo(...shaftEnd); ctx.stroke();
    tipPath(); ctx.lineWidth = 4; ctx.stroke();
  }
  ctx.globalAlpha = alpha; ctx.strokeStyle = ctx.fillStyle = color; ctx.lineWidth = width;
  ctx.beginPath(); ctx.moveTo(a, b); ctx.lineTo(...shaftEnd); ctx.stroke();
  tipPath(); ctx.fill();
  ctx.restore();
  return { x: c, y: d, ux, uy, len };
}

/* ---------------- Scritte in LaTeX classico ---------------- */

// Un piccolo sottoinsieme di TeX, abbastanza per le etichette della scena:
//   lettere latine e greche in corsivo matematico, cifre e segni in tondo, _x _{..} pedici, ^x ^{..} apici,
//   \vec X (freccia sopra), \mathrm{..} testo in tondo (unità), \cdot, \  (spazio), i pedici Unicode ₀..₉.
const GREEK = { alpha: 'α', beta: 'β', theta: 'θ', sigma: 'σ', lambda: 'λ', mu: 'μ', omega: 'ω', varepsilon: 'ε', epsilon: 'ε', pi: 'π', Delta: 'Δ', phi: 'φ' };
const SUBS = '₀₁₂₃₄₅₆₇₈₉';

function parse(src) {
  src = src.replace(/[₀-₉]+/g, m => '_{' + [...m].map(c => SUBS.indexOf(c)).join('') + '}').replace(/-/g, '−');
  const out = [];
  let i = 0;
  const group = () => {
    while (src[i] === ' ') i++;   // come in TeX, gli spazi prima dell'argomento non contano
    if (src[i] === '{') { let depth = 1, j = i + 1; while (j < src.length && depth) { if (src[j] === '{') depth++; else if (src[j] === '}') depth--; j++; } const g = src.slice(i + 1, j - 1); i = j; return g; }
    if (src[i] === '\\') { const m = /^\\[a-zA-Z]+/.exec(src.slice(i)); if (m) { i += m[0].length; return m[0]; } }
    return src[i++];
  };
  const push = (items, level, extra = {}) => { for (const it of items) out.push({ ...it, level: it.level + level, ...extra }); };
  while (i < src.length) {
    const ch = src[i];
    if (ch === '_' || ch === '^') { i++; push(parse(group()), 0, { script: ch === '_' ? 'sub' : 'sup' }); continue; }
    if (ch === '\\') {
      const m = /^\\([a-zA-Z]+|.)/.exec(src.slice(i)); i += m[0].length;
      const cmd = m[1];
      if (cmd === 'vec') { const g = parse(group()); g.forEach((t, k) => { if (k === 0) t.vec = true; }); push(g, 0); }
      else if (cmd === 'mathrm' || cmd === 'text') out.push({ s: group(), font: 'main', level: 0 });
      else if (cmd === 'cdot') out.push({ s: '·', font: 'main', level: 0, pad: 3 });
      else if (cmd === ' ' || cmd === ',') out.push({ s: ' ', font: 'main', level: 0 });
      else if (GREEK[cmd]) out.push({ s: GREEK[cmd], font: 'math', level: 0 });
      else out.push({ s: cmd, font: 'main', level: 0 });
      continue;
    }
    i++;
    if (ch === '{' || ch === '}' || ch === ' ') continue;   // spazi: solo con \\  (come in TeX)
    if (/[A-Za-zα-ωΔ]/.test(ch)) out.push({ s: ch, font: 'math', level: 0 });
    else if (/[=+−<>]/.test(ch)) {
      // Segno unario (all'inizio o dopo un altro segno: "−2,0", "= −2,0") senza spazi attorno.
      const prev = out[out.length - 1], unary = /[+−]/.test(ch) && (!prev || prev.op || prev.s === '(');
      out.push({ s: ch, font: 'main', level: 0, pad: unary ? 0 : 3.5, op: true });
    }
    else out.push({ s: ch, font: 'main', level: 0 });
  }
  return out;
}

const cache = new Map();
function layout(ctx, src, size) {
  const key = src + '|' + size;
  let L = cache.get(key);
  if (L) return L;
  const toks = parse(src);
  let x = 0;
  for (const t of toks) {
    const sz = t.script ? size * 0.7 : size;
    t.font = `${t.font === 'math' ? 'italic ' : ''}${sz}px ${t.font === 'math' ? 'KaTeX_Math' : 'KaTeX_Main'}, "Times New Roman", serif`;
    t.dy = t.script === 'sub' ? size * 0.22 : t.script === 'sup' ? -size * 0.38 : 0;
    ctx.font = t.font;
    x += t.pad ?? 0;
    t.x = x;
    t.w = ctx.measureText(t.s).width;
    x += t.w + (t.pad ?? 0) + (t.font.startsWith('italic') && !t.script ? size * 0.04 : 0);
  }
  L = { toks, w: x };
  if (cache.size > 600) cache.clear();
  cache.set(key, L);
  return L;
}

// Scritta TeX in coordinate schermo (a, b), centrata in verticale. halo: colore dell'alone (di solito il fondo).
export function tex(P, a, b, src, { size = 16, color = '#fff', align = 'center', halo = null, alpha = 1 } = {}) {
  const ctx = P.ctx, L = layout(ctx, src, size);
  const x0 = align === 'center' ? a - L.w / 2 : align === 'right' ? a - L.w : a;
  ctx.save();
  ctx.globalAlpha = alpha; ctx.textBaseline = 'middle'; ctx.textAlign = 'left'; ctx.lineJoin = 'round';
  for (const pass of halo ? ['halo', 'fill'] : ['fill']) {
    for (const t of L.toks) {
      ctx.font = t.font;
      const x = x0 + t.x, y = b + t.dy;
      if (pass === 'halo') { ctx.strokeStyle = halo; ctx.lineWidth = 4; ctx.strokeText(t.s, x, y); continue; }
      ctx.fillStyle = color; ctx.fillText(t.s, x, y);
      if (t.vec) {
        // Freccetta sopra la lettera, spostata a destra come nel corsivo.
        const top = y - size * 0.62, l = x + t.w * 0.18, r = x + t.w * 1.02;
        ctx.strokeStyle = color; ctx.lineWidth = Math.max(1, size * 0.07); ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(l, top); ctx.lineTo(r, top); ctx.moveTo(r - size * 0.18, top - size * 0.1); ctx.lineTo(r, top); ctx.lineTo(r - size * 0.18, top + size * 0.1); ctx.stroke();
      }
    }
  }
  ctx.restore();
  return L.w;
}

// Larghezza in px di una scritta tex().
export const texWidth = (P, src, size = 16) => layout(P.ctx, src, size).w;

// Numero in notazione scientifica per tex(): 452000 → "4,52\cdot10^{5}".
export function sciTeX(v, d = 2) {
  if (v === 0 || !Number.isFinite(v)) return '0';
  const e = Math.floor(Math.log10(Math.abs(v)));
  const f = (x, n) => (x < 0 ? '−' : '') + Math.abs(x).toFixed(n).replace('.', ',');
  if (e >= -2 && e <= 3) return f(v, Math.max(0, d - Math.max(0, e)));
  return `${f(v / 10 ** e, d)}\\cdot10^{${e}}`;
}

// I font di KaTeX vanno caricati prima di disegnare sul canvas (altrimenti si vede il serif di sistema).
export const fontsReady = (document.fonts?.load
  ? Promise.all([document.fonts.load('italic 16px KaTeX_Math'), document.fonts.load('16px KaTeX_Main')]).catch(() => {})
  : Promise.resolve());
fontsReady.then(() => cache.clear());   // le misure prese col font di riserva non valgono più
