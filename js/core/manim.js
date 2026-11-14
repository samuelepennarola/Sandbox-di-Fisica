// Kit grafico "alla 3Blue1Brown": palette di Manim per i due temi, piano cartesiano (NumberPlane),
// frecce sottili con punta piena e scritte matematiche in LaTeX classico (font Computer Modern di KaTeX,
// già inclusi offline in vendor/katex) disegnate direttamente sul canvas.
// Pensato per essere esteso a tutti gli esperimenti: per ora lo usa "Cariche e campo elettrico".
import { niceStep } from './math.js';
import { MANIM, rate } from './anim.js';

export const isDark = () => document.documentElement.dataset.theme === 'dark';

// Palette: nel tema scuro i colori di Manim su fondo quasi nero; nel tema chiaro le stesse tinte, scurite per la carta.
export function palette(c) {
  if (isDark()) return {
    dark: true, bg: '#0b0b0d', text: '#ece9e0', muted: MANIM.greyB, axis: '#ffffff', plane: MANIM.blueD, planeA: [0.4, 0.12],
    pos: MANIM.red, neg: MANIM.blue, force: MANIM.yellow, fx: MANIM.teal, fy: MANIM.green, field: MANIM.gold, sel: MANIM.blue,
    ramp: [MANIM.blueE, MANIM.blueD, MANIM.blue, MANIM.teal, MANIM.green], lineA: 0.9,
    // Vettori del costruttore (chiavi dei colori dell'app) e colori dei corpi.
    vec: { vel: MANIM.blue, acc: MANIM.yellow, weight: MANIM.red, normal: MANIM.green, friction: MANIM.gold, applied: MANIM.pink,
      tension: '#CAA3E8', spring: MANIM.teal },
    body: { blue: MANIM.blue, red: MANIM.red, green: MANIM.green, yellow: '#E8C11C', wood: MANIM.maroon },
    solid: '#2a2c33', solidEdge: '#c8c8c8', rope: '#dddddd', springC: MANIM.teal,
  };
  return {
    dark: false, bg: c.bg, text: '#23211c', muted: '#6b6658', axis: '#23211c', plane: MANIM.blueE, planeA: [0.3, 0.1],
    pos: '#d9443a', neg: '#1f86ad', force: '#b8860b', fx: '#12876c', fy: '#4b8a2a', field: '#c25e12', sel: '#1f86ad',
    ramp: ['#9fbfd0', '#5a9cc0', '#236b8e', '#12876c', '#3f7f22'], lineA: 0.9,
    vec: { vel: '#1f86ad', acc: '#b8860b', weight: '#d9443a', normal: '#4b8a2a', friction: '#c25e12', applied: '#b0359e',
      tension: '#7d55b0', spring: '#12876c' },
    body: { blue: '#2b8fbf', red: '#d9443a', green: '#5c9a35', yellow: '#d4a514', wood: '#a8495e' },
    solid: '#e4ddcc', solidEdge: '#3a372f', rope: '#3a372f', springC: '#12876c',
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
  ctx.strokeStyle = M.plane;
  for (const [s, alpha] of [[minor, M.planeA[1]], [step, M.planeA[0]]]) {
    ctx.globalAlpha = alpha; ctx.lineWidth = s === minor ? 1 : 1.25;
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
export function arrowS(ctx, a, b, c, d, color, { width = 3, tip = 14, grow = 1, alpha = 1, halo = null, dash = null } = {}) {
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
  if (dash) ctx.setLineDash(dash);
  ctx.beginPath(); ctx.moveTo(a, b); ctx.lineTo(...shaftEnd); ctx.stroke();
  ctx.setLineDash([]);
  tipPath(); ctx.fill();
  ctx.restore();
  return { x: c, y: d, ux, uy, len };
}

/* ---------------- Scritte in LaTeX classico ---------------- */

// Un piccolo sottoinsieme di TeX, abbastanza per le etichette e le formule brevi della scena:
//   lettere latine e greche in corsivo matematico, cifre e segni in tondo, _x _{..} pedici, ^x ^{..} apici,
//   \vec X (freccia sopra), \mathrm{..} testo in tondo (unità), \cdot, \  (spazio), i pedici Unicode ₀..₉,
//   \frac{..}{..} frazioni, \sqrt{..} radici, \Delta e le lettere greche comuni.
const GREEK = { alpha: 'α', beta: 'β', gamma: 'γ', theta: 'θ', sigma: 'σ', lambda: 'λ', mu: 'μ', omega: 'ω', varepsilon: 'ε', epsilon: 'ε', pi: 'π', Delta: 'Δ', phi: 'φ', varphi: 'φ', rho: 'ρ', tau: 'τ' };
const SYMB = { cdot: ['·', 3], times: ['×', 3.5], approx: ['≈', 3.5], to: ['→', 3.5], Rightarrow: ['⇒', 3.5], parallel: ['∥', 0], perp: ['⊥', 0], infty: ['∞', 0], pm: ['±', 3],
  le: ['≤', 3.5], ge: ['≥', 3.5], ne: ['≠', 3.5], circ: ['°', 0], prime: ['′', 0], dots: ['…', 1] };
// Funzioni in tondo con un po' di spazio attorno (\sin\alpha, \cos\theta).
const FUNCS = new Set(['sin', 'cos', 'tan', 'ln', 'log', 'exp', 'max', 'min']);
const SUBS = '₀₁₂₃₄₅₆₇₈₉';

// Albero dei nodi: { t: 'ch', s, font, pad, op, vec } · { t: 'sub' | 'sup', body } · { t: 'frac', num, den } · { t: 'sqrt', body }
//   · { t: 'color', c, body } per \color{#hex}{..} (una parte della formula in un altro colore).
function parse(src) {
  src = src.replace(/[₀-₉]+/g, m => '_{' + [...m].map(c => SUBS.indexOf(c)).join('') + '}').replace(/'/g, '′');
  // Il trattino diventa il segno meno, tranne dentro gli argomenti di \color (#hex senza trattini, ma per sicurezza).
  src = src.replace(/(\\color\{[^}]*\})|-/g, (m, col) => col ?? '−');
  return parseList(src);
}
function parseList(src) {
  const out = [];
  let i = 0;
  const group = () => {
    while (src[i] === ' ') i++;   // come in TeX, gli spazi prima dell'argomento non contano
    if (src[i] === '{') { let depth = 1, j = i + 1; while (j < src.length && depth) { if (src[j] === '{') depth++; else if (src[j] === '}') depth--; j++; } const g = src.slice(i + 1, j - 1); i = j; return g; }
    if (src[i] === '\\') { const m = /^\\[a-zA-Z]+/.exec(src.slice(i)); if (m) { i += m[0].length; return m[0]; } }
    return src[i++] ?? '';
  };
  while (i < src.length) {
    const ch = src[i];
    if (ch === '_' || ch === '^') { i++; out.push({ t: ch === '_' ? 'sub' : 'sup', body: parseList(group()) }); continue; }
    if (ch === '\\') {
      const m = /^\\([a-zA-Z]+|.)/.exec(src.slice(i)); i += m[0].length;
      const cmd = m[1];
      if (cmd === 'vec') { const g = parseList(group()); if (g[0]?.t === 'ch') g[0].vec = true; out.push(...g); }
      else if (cmd === 'color' || cmd === 'textcolor') { const c = group(), body = parseList(group()); out.push({ t: 'color', c, body }); }
      else if (FUNCS.has(cmd)) out.push({ t: 'ch', s: cmd, font: 'main', pad: 2.5 });
      else if (cmd === 'frac' || cmd === 'dfrac' || cmd === 'tfrac') { const num = parseList(group()), den = parseList(group()); out.push({ t: 'frac', num, den }); }
      else if (cmd === 'sqrt') out.push({ t: 'sqrt', body: parseList(group()) });
      else if (cmd === 'mathrm' || cmd === 'text') {
        // Testo in tondo: le parole restano intere (con i loro spazi); se contiene apici o pedici (m/s^2) si impagina.
        const g = group();
        if (/[\^_\\]/.test(g)) out.push(...roman(parseList(g)));
        else out.push({ t: 'ch', s: g, font: 'main' });
      }
      else if (cmd === 'left' || cmd === 'right') { /* \left( \right): basta la parentesi */ }
      else if (SYMB[cmd]) out.push({ t: 'ch', s: SYMB[cmd][0], font: 'main', pad: SYMB[cmd][1], op: SYMB[cmd][1] > 0 });
      else if (cmd === ' ' || cmd === ',' || cmd === ';' || cmd === 'quad' || cmd === 'qquad') out.push({ t: 'ch', s: cmd === 'qquad' ? '      ' : cmd === 'quad' ? '   ' : ' ', font: 'main' });
      else if (GREEK[cmd]) out.push({ t: 'ch', s: GREEK[cmd], font: /^[A-Z]/.test(cmd) ? 'main' : 'math' });
      else out.push({ t: 'ch', s: cmd, font: 'main' });
      continue;
    }
    i++;
    if (ch === '{' || ch === '}' || ch === ' ') continue;   // spazi: solo con \\  (come in TeX)
    if (ch === '′') { out.push({ t: 'sup', body: [{ t: 'ch', s: '′', font: 'main' }] }); continue; }   // apice, come \prime in TeX
    if (/[A-Za-zα-ω]/.test(ch)) out.push({ t: 'ch', s: ch, font: 'math' });
    else if (/[=+−<>≈]/.test(ch)) {
      // Segno unario (all'inizio o dopo un altro segno: "−2,0", "= −2,0") senza spazi attorno.
      const prev = out[out.length - 1], unary = /[+−]/.test(ch) && (!prev || prev.op || prev.s === '(');
      out.push({ t: 'ch', s: ch, font: 'main', pad: unary ? 0 : 3.5, op: true });
    }
    else out.push({ t: 'ch', s: ch, font: 'main' });
  }
  return out;
}

// Tutti i caratteri di un sottoalbero in tondo (per \mathrm con apici: m/s^2).
function roman(nodes) {
  for (const n of nodes) {
    if (n.t === 'ch') n.font = 'main';
    for (const k of ['body', 'num', 'den']) if (n[k]) roman(n[k]);
  }
  return nodes;
}

// Impaginazione: un elenco di operazioni di disegno relative alla linea di mezzo (y = 0), con larghezza e ingombro verticale.
function box(ctx, nodes, size) {
  const ops = [];
  let x = 0, top = -size * 0.5, bot = size * 0.5, lastBase = null;
  const fontOf = (font, sz) => `${font === 'math' ? 'italic ' : ''}${sz}px ${font === 'math' ? 'KaTeX_Math' : 'KaTeX_Main'}, "Times New Roman", serif`;
  const place = (B, dx, dy) => { for (const o of B.ops) ops.push({ ...o, x: o.x + dx, y: o.y + dy, ...(o.x2 != null ? { x2: o.x2 + dx, y2: o.y2 + dy } : {}), ...(o.pts ? { pts: o.pts.map(([a, b]) => [a + dx, b + dy]) } : {}) }); top = Math.min(top, B.top + dy); bot = Math.max(bot, B.bot + dy); };
  for (let k = 0; k < nodes.length; k++) {
    const n = nodes[k];
    if (n.t === 'ch') {
      const font = fontOf(n.font, size);
      ctx.font = font;
      const pd = (n.pad ?? 0) * size / 16;   // spazi attorno ai segni, proporzionali al corpo del testo
      x += pd;
      const w = ctx.measureText(n.s).width;
      ops.push({ k: 'text', s: n.s, font, x, y: 0, w, vec: n.vec, size });
      if (n.vec) top = Math.min(top, -size * 0.78);
      lastBase = { x, w, top: -size * 0.5, bot: size * 0.5 };
      x += w + pd + (n.font === 'math' ? size * 0.04 : 0);
    } else if (n.t === 'sub' || n.t === 'sup') {
      const B = box(ctx, n.body, size * 0.7);
      const base = lastBase ?? { top: -size * 0.5, bot: size * 0.5 };
      // Pedice e apice sullo stesso simbolo: l'apice riparte da dove inizia il pedice.
      const prev = nodes[k - 1], stacked = prev && (prev.t === 'sub' || prev.t === 'sup') && prev.t !== n.t;
      const x0 = stacked ? lastBase.scriptX : x;
      const dy = n.t === 'sub' ? Math.max(size * 0.22, base.bot - size * 0.3) : Math.min(-size * 0.38, base.top + size * 0.1);
      place(B, x0, dy);
      if (!stacked && lastBase) lastBase.scriptX = x0;
      x = Math.max(x, x0 + B.w);
    } else if (n.t === 'frac') {
      // Numeratore e denominatore quasi a grandezza piena (come \dfrac) e staccati dalla riga più dell'alone (2 px).
      const fs = size * 0.92, N = box(ctx, n.num, fs), D = box(ctx, n.den, fs), w = Math.max(N.w, D.w) + size * 0.3, gap = Math.max(4, size * 0.24);
      x += size * 0.12;
      const axis = -size * 0.04;
      place(N, x + (w - N.w) / 2, axis - gap - N.bot);
      place(D, x + (w - D.w) / 2, axis + gap - D.top);
      ops.push({ k: 'rule', x, y: axis, x2: x + w, y2: axis, lw: Math.max(1, size * 0.06) });
      lastBase = { x, w, top: axis - gap - N.bot + N.top, bot: axis + gap - D.top + D.bot };
      x += w + size * 0.12;
    } else if (n.t === 'color') {
      const B = box(ctx, n.body, size);
      for (const o of B.ops) o.col ??= n.c;
      place(B, x, 0);
      lastBase = { x, w: B.w, top: B.top, bot: B.bot };
      x += B.w;
    } else if (n.t === 'sqrt') {
      const B = box(ctx, n.body, size), t = B.top - size * 0.14, b = B.bot + size * 0.06, rw = size * 0.55;
      ops.push({ k: 'path', x: 0, y: 0, lw: Math.max(1, size * 0.06), pts: [[x, (t + b) / 2 + size * 0.05], [x + rw * 0.25, (t + b) / 2 - size * 0.02], [x + rw * 0.55, b], [x + rw, t], [x + rw + B.w + size * 0.08, t]] });
      place(B, x + rw + size * 0.04, 0);
      top = Math.min(top, t - 2);
      lastBase = { x, w: rw + B.w, top: t, bot: b };
      x += rw + B.w + size * 0.14;
    }
  }
  return { ops, w: x, top, bot };
}

// Tutte le scritte della scena sono ingrandite di SCENE_TEXT rispetto al corpo richiesto: nei video di
// 3Blue1Brown le scritte sono grandi rispetto al quadro. Un solo numero da ritoccare per tutta l'app.
export const SCENE_TEXT = 1.2;
const cache = new Map();
function layout(ctx, src, size) {
  size = Math.round(size * SCENE_TEXT * 2) / 2;
  const key = src + '|' + size;
  let L = cache.get(key);
  if (L) return L;
  L = box(ctx, parse(src), size);
  if (cache.size > 600) cache.clear();
  cache.set(key, L);
  return L;
}

// Scritta TeX in coordinate schermo (a, b), centrata in verticale. halo: colore dell'alone (di solito il fondo).
export function tex(P, a, b, src, { size = 16, color = '#fff', align = 'center', halo = null, alpha = 1 } = {}) {
  const ctx = P.ctx, L = layout(ctx, src, size);
  const x0 = align === 'center' ? a - L.w / 2 : align === 'right' ? a - L.w : a;
  ctx.save();
  ctx.globalAlpha = alpha; ctx.textBaseline = 'middle'; ctx.textAlign = 'left'; ctx.lineJoin = ctx.lineCap = 'round';
  // Prima tutti gli aloni, poi le scritte; le righe (frazioni, radici) per ultime, così nessun alone le copre.
  const ordered = [...L.ops.filter(o => o.k === 'text'), ...L.ops.filter(o => o.k !== 'text')];
  for (const pass of halo ? ['halo', 'fill'] : ['fill']) {
    const isHalo = pass === 'halo';
    for (const o of ordered) {
      const x = x0 + o.x, y = b + o.y, c = o.col ?? color;
      ctx.strokeStyle = isHalo ? halo : c; ctx.fillStyle = c;
      if (o.k === 'text') {
        ctx.font = o.font;
        if (isHalo) { ctx.lineWidth = 4; ctx.strokeText(o.s, x, y); }
        else ctx.fillText(o.s, x, y);
        if (o.vec) {
          // Freccetta sopra la lettera, spostata a destra come nel corsivo.
          const sz = o.size, top = y - sz * 0.62, l = x + o.w * 0.18, r = x + o.w * 1.02;
          ctx.lineWidth = Math.max(1, sz * 0.07) + (isHalo ? 3 : 0);
          ctx.beginPath(); ctx.moveTo(l, top); ctx.lineTo(r, top); ctx.moveTo(r - sz * 0.18, top - sz * 0.1); ctx.lineTo(r, top); ctx.lineTo(r - sz * 0.18, top + sz * 0.1); ctx.stroke();
        }
      } else if (o.k === 'rule') {
        ctx.lineWidth = o.lw + (isHalo ? 3 : 0);
        ctx.beginPath(); ctx.moveTo(x0 + o.x, b + o.y); ctx.lineTo(x0 + o.x2, b + o.y2); ctx.stroke();
      } else if (o.k === 'path') {
        ctx.lineWidth = o.lw + (isHalo ? 3 : 0);
        ctx.beginPath(); o.pts.forEach(([px, py], i) => (i ? ctx.lineTo(x0 + px, b + py) : ctx.moveTo(x0 + px, b + py))); ctx.stroke();
      }
    }
  }
  ctx.restore();
  return L.w;
}

// Larghezza in px di una scritta tex(); texBox dà anche l'ingombro verticale (top < 0 < bot, rispetto al centro).
export const texWidth = (P, src, size = 16) => layout(P.ctx, src, size).w;
export const texBox = (P, src, size = 16) => { const L = layout(P.ctx, src, size); return { w: L.w, top: L.top, bot: L.bot }; };

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

/* ---------------- Linee di campo ---------------- */

// Linee colorate in base all'intensità, con la punta del verso a metà. mag(x, y) dà |E| in N/C; lo/hi la scala
// dei colori; alpha la dissolvenza d'ingresso; progress(i) ∈ [0, 1] (facoltativo) traccia solo una parte di ogni linea.
export function drawFieldLinesM(P, lines, M, { mag, progress = () => 1, lo, hi, width = 1.8, alpha = 1 } = {}) {
  const ctx = P.ctx;
  if (alpha <= 0) return;
  ctx.save();
  ctx.lineCap = ctx.lineJoin = 'round'; ctx.lineWidth = width; ctx.globalAlpha = M.lineA * alpha;
  lines.forEach((L, i) => {
    const f = progress(i);
    if (f <= 0 || L.pts.length < 2) return;
    L.mags ??= L.pts.map((pt, k) => (k % 3 ? 0 : mag(pt[0], pt[1])));
    L.acc ??= cumulateLen(L.pts);
    const pts = f < 1 ? partialLine(L.pts, f, L.acc) : L.pts, N = pts.length;
    for (let k = 0; k < N - 1; k += 3) {
      ctx.strokeStyle = rampColor(M, L.mags[k] || lo, lo, hi);
      ctx.beginPath();
      for (let j = k; j <= Math.min(k + 3, N - 1); j++) { const [a, b] = P.S(pts[j][0], pts[j][1]); j === k ? ctx.moveTo(a, b) : ctx.lineTo(a, b); }
      ctx.stroke();
    }
    // La punta del verso a metà linea compare (crescendo) quando il tratto l'ha superata.
    const m = Math.floor(L.pts.length / 2), hs = Math.min(1, Math.max(0, (f - 0.5) / 0.15));
    if (hs > 0 && m > 0) {
      const p0 = P.S(...L.pts[m - 1]), p1 = P.S(...L.pts[m]);
      let dx = (p1[0] - p0[0]) * L.dir, dy = (p1[1] - p0[1]) * L.dir;
      const d = Math.hypot(dx, dy);
      if (d > 1e-6) {
        dx /= d; dy /= d;
        const g = hs * hs * (3 - 2 * hs), h = 9 * g, w = 4.2 * g;
        ctx.fillStyle = rampColor(M, L.mags[m - (m % 3)] || lo, lo, hi);
        ctx.beginPath(); ctx.moveTo(p1[0] + dx * h / 2, p1[1] + dy * h / 2);
        ctx.lineTo(p1[0] - dx * h / 2 - dy * w, p1[1] - dy * h / 2 + dx * w); ctx.lineTo(p1[0] - dx * h / 2 + dy * w, p1[1] - dy * h / 2 - dx * w);
        ctx.closePath(); ctx.fill();
      }
    }
  });
  ctx.restore();
}
function cumulateLen(pts) {
  const acc = [0];
  for (let i = 1; i < pts.length; i++) acc.push(acc[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  return acc;
}
function partialLine(pts, f, acc) {
  const L = acc[acc.length - 1] * f, out = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    if (acc[i] <= L) { out.push(pts[i]); continue; }
    const k = (L - acc[i - 1]) / ((acc[i] - acc[i - 1]) || 1);
    out.push([pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * k, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * k]);
    break;
  }
  return out;
}

/* ---------------- Cariche ---------------- */

// Carica alla Manim: disco pieno con alone e segno bianco. hue: 1 positiva, 0 negativa (valori intermedi
// durante l'inversione: il colore sfuma e il tratto verticale del + si accorcia).
export function chargeDisk(ctx, a, b, r, hue, M, selected = false, glow = true) {
  const col = mixHex(M.neg, M.pos, hue);
  ctx.save();
  if (glow) {
    const g = ctx.createRadialGradient(a, b, r * 0.6, a, b, r * 2.5);
    g.addColorStop(0, col + (M.dark ? '55' : '33')); g.addColorStop(1, col + '00');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(a, b, r * 2.5, 0, Math.PI * 2); ctx.fill();
  }
  if (selected) { ctx.strokeStyle = M.sel; ctx.lineWidth = 2; ctx.setLineDash([5, 4]); ctx.beginPath(); ctx.arc(a, b, r + 6, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]); }
  ctx.fillStyle = col; ctx.globalAlpha = 0.95; ctx.beginPath(); ctx.arc(a, b, r, 0, Math.PI * 2); ctx.fill();
  ctx.globalAlpha = 1; ctx.strokeStyle = mixHex(col, '#ffffff', 0.45); ctx.lineWidth = 1.5; ctx.stroke();
  const h = r * 0.45;
  ctx.strokeStyle = '#ffffff'; ctx.lineWidth = Math.max(1.8, r * 0.13); ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(a - h, b); ctx.lineTo(a + h, b);
  if (hue > 0.03) { ctx.moveTo(a, b - h * hue); ctx.lineTo(a, b + h * hue); }
  ctx.stroke();
  ctx.restore();
}

/* ---------------- Oggetti della meccanica, in stile diagramma ---------------- */

// Suolo: una linea netta, come nei video, con sotto una fascia appena più chiara.
export function groundM(P, M, y0 = 0) {
  const { ctx, cam } = P, [, sy] = P.S(0, y0);
  if (sy > cam.h) return;
  ctx.save();
  ctx.fillStyle = M.dark ? 'rgba(255,255,255,0.035)' : 'rgba(40,30,10,0.05)';
  ctx.fillRect(0, sy, cam.w, cam.h - sy);
  ctx.strokeStyle = M.dark ? '#ffffff' : M.solidEdge; ctx.globalAlpha = 0.95; ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.moveTo(0, sy); ctx.lineTo(cam.w, sy); ctx.stroke();
  ctx.restore();
}

// Piani e superfici: poligono pieno tenue, contorno sottile e tratteggio lungo il bordo d'appoggio.
export function slabM(P, M, pts, { topEdge, selected = false } = {}) {
  const { ctx } = P, sp = pts.map(p => P.S(p[0], p[1]));
  const path = () => { ctx.beginPath(); sp.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath(); };
  ctx.save();
  if (selected) { path(); ctx.strokeStyle = M.sel; ctx.lineWidth = 7; ctx.globalAlpha = 0.4; ctx.lineJoin = 'round'; ctx.stroke(); ctx.globalAlpha = 1; }
  path(); ctx.fillStyle = M.solid; ctx.globalAlpha = M.dark ? 0.85 : 0.9; ctx.fill();
  ctx.globalAlpha = 1; ctx.strokeStyle = M.solidEdge; ctx.lineWidth = 1.4; ctx.lineJoin = 'round'; ctx.stroke();
  if (topEdge) {
    const [a, b] = topEdge.map(p => P.S(p[0], p[1]));
    ctx.strokeStyle = M.text; ctx.lineWidth = 2.2; ctx.beginPath(); ctx.moveTo(...a); ctx.lineTo(...b); ctx.stroke();
  }
  ctx.restore();
}

// Corpo rigido: rettangolo arrotondato pieno (opacità alla Manim) con bordo più chiaro.
export function blockM(P, M, x, y, { w, h, angle = 0, color = 'blue', selected = false, grow = 1 }) {
  const { ctx } = P, [a, b] = P.S(x, y), s = P.cam.scale * grow, col = M.body[color] ?? color;
  const W = w * s, H = h * s;
  if (W < 1 || H < 1) return;
  ctx.save();
  ctx.translate(a, b); ctx.rotate(-angle);
  const r = Math.min(W, H) * 0.08;
  const path = (pad = 0) => { ctx.beginPath(); ctx.roundRect ? ctx.roundRect(-W / 2 - pad, -H / 2 - pad, W + 2 * pad, H + 2 * pad, r + pad) : ctx.rect(-W / 2 - pad, -H / 2 - pad, W + 2 * pad, H + 2 * pad); };
  if (selected) { path(5); ctx.strokeStyle = M.sel; ctx.lineWidth = 2; ctx.setLineDash([6, 4]); ctx.stroke(); ctx.setLineDash([]); }
  path(); ctx.fillStyle = col; ctx.globalAlpha = M.dark ? 0.72 : 0.8; ctx.fill();
  ctx.globalAlpha = 1; ctx.strokeStyle = mixHex(col, M.dark ? '#ffffff' : '#000000', M.dark ? 0.35 : 0.25); ctx.lineWidth = 2; ctx.stroke();
  ctx.restore();
}

// Sfera: disco pieno con un raggio segnato, così si vede la rotazione.
export function ballM(P, M, x, y, { r, color = 'red', spin = 0, selected = false, grow = 1 }) {
  const { ctx } = P, [a, b] = P.S(x, y), R = r * P.cam.scale * grow, col = M.body[color] ?? color;
  if (R < 1) return;
  ctx.save();
  if (selected) { ctx.strokeStyle = M.sel; ctx.lineWidth = 2; ctx.setLineDash([6, 4]); ctx.beginPath(); ctx.arc(a, b, R + 5, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]); }
  ctx.fillStyle = col; ctx.globalAlpha = M.dark ? 0.72 : 0.8; ctx.beginPath(); ctx.arc(a, b, R, 0, Math.PI * 2); ctx.fill();
  ctx.globalAlpha = 1; const edge = mixHex(col, M.dark ? '#ffffff' : '#000000', M.dark ? 0.35 : 0.25);
  ctx.strokeStyle = edge; ctx.lineWidth = 2; ctx.stroke();
  ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(a, b); ctx.lineTo(a + Math.cos(spin) * R, b - Math.sin(spin) * R); ctx.stroke();
  ctx.fillStyle = edge; ctx.beginPath(); ctx.arc(a, b, 2.2, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

// Molla a zig-zag: si stringe e si allunga con la lunghezza (strain > 0 tesa).
export function springM(P, M, p0, p1, { selected = false } = {}) {
  const { ctx } = P, [x0, y0] = P.S(p0[0], p0[1]), [x1, y1] = P.S(p1[0], p1[1]);
  const L = Math.hypot(x1 - x0, y1 - y0);
  if (L < 3) return;
  const ux = (x1 - x0) / L, uy = (y1 - y0) / L, end = Math.min(12, L * 0.15), n = Math.max(6, Math.round((L - 2 * end) / 9)), amp = 6;
  ctx.save();
  ctx.lineJoin = ctx.lineCap = 'round';
  const path = () => {
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x0 + ux * end, y0 + uy * end);
    for (let i = 0; i < n; i++) {
      const t = end + (L - 2 * end) * (i + 0.5) / n, s = i % 2 ? -1 : 1;
      ctx.lineTo(x0 + ux * t - uy * amp * s, y0 + uy * t + ux * amp * s);
    }
    ctx.lineTo(x1 - ux * end, y1 - uy * end); ctx.lineTo(x1, y1);
  };
  if (selected) { path(); ctx.strokeStyle = M.sel; ctx.lineWidth = 8; ctx.globalAlpha = 0.4; ctx.stroke(); ctx.globalAlpha = 1; }
  path(); ctx.strokeStyle = M.springC; ctx.lineWidth = 2; ctx.stroke();
  ctx.restore();
}

// Fune: linea sottile (tratteggiata quando è lenta).
export function ropeM(P, M, pts, { slack = false, selected = false } = {}) {
  if (pts.length < 2) return;
  const { ctx } = P;
  ctx.save(); ctx.lineJoin = ctx.lineCap = 'round';
  const path = () => { ctx.beginPath(); pts.forEach(([x, y], i) => { const [a, b] = P.S(x, y); i ? ctx.lineTo(a, b) : ctx.moveTo(a, b); }); };
  if (selected) { path(); ctx.strokeStyle = M.sel; ctx.lineWidth = 8; ctx.globalAlpha = 0.4; ctx.stroke(); ctx.globalAlpha = 1; }
  path(); ctx.strokeStyle = M.rope; ctx.lineWidth = 1.8; if (slack) ctx.setLineDash([5, 4]); ctx.stroke();
  ctx.restore();
}

// Carrucola: cerchio con i raggi (girano) e il perno.
export function pulleyM(P, M, x, y, rW, angle = 0, { selected = false } = {}) {
  const { ctx } = P, [a, b] = P.S(x, y), r = Math.max(6, rW * P.cam.scale);
  ctx.save();
  if (selected) { ctx.strokeStyle = M.sel; ctx.lineWidth = 2; ctx.setLineDash([6, 4]); ctx.beginPath(); ctx.arc(a, b, r + 6, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]); }
  ctx.fillStyle = M.solid; ctx.beginPath(); ctx.arc(a, b, r, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = M.solidEdge; ctx.lineWidth = 2; ctx.stroke();
  ctx.lineWidth = 1.2; ctx.globalAlpha = 0.7; ctx.beginPath();
  for (let i = 0; i < 3; i++) { const t = angle + i * Math.PI / 3; ctx.moveTo(a - Math.cos(t) * r * 0.85, b + Math.sin(t) * r * 0.85); ctx.lineTo(a + Math.cos(t) * r * 0.85, b - Math.sin(t) * r * 0.85); }
  ctx.stroke();
  ctx.globalAlpha = 1; ctx.fillStyle = M.solidEdge; ctx.beginPath(); ctx.arc(a, b, 3, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

// Punto fisso: piccola piastra con il tratteggio, come un vincolo nei disegni.
export function anchorM(P, M, x, y, { selected = false } = {}) {
  const { ctx } = P, [a, b] = P.S(x, y);
  ctx.save();
  if (selected) { ctx.strokeStyle = M.sel; ctx.lineWidth = 2; ctx.setLineDash([5, 4]); ctx.strokeRect(a - 19, b - 19, 38, 26); ctx.setLineDash([]); }
  ctx.strokeStyle = M.solidEdge; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(a - 14, b - 6); ctx.lineTo(a + 14, b - 6); ctx.stroke();
  ctx.lineWidth = 1; ctx.beginPath();
  for (let i = -14; i < 14; i += 6) { ctx.moveTo(a + i, b - 6); ctx.lineTo(a + i + 6, b - 13); }
  ctx.stroke();
  ctx.fillStyle = M.solidEdge; ctx.beginPath(); ctx.arc(a, b, 3.5, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

/* ---------------- Painter con lo stile di Manim ---------------- */

// Etichetta oltre la punta di una freccia: se è lunga si allinea dal lato verso cui punta la freccia.
export function arrowLabel(P, tip, src, col, M, alpha = 1) {
  const w = texWidth(P, src, 17), d = 19 + Math.max(0, w / 2 - 9) * Math.abs(tip.ux);
  tex(P, tip.x + tip.ux * d, tip.y + tip.uy * 19, src, { size: 17, color: col, halo: M.bg, alpha, align: 'center' });
}

// Etichetta di un vettore dell'app ("P", "F₁₂", "qE", "fs") in TeX: \vec P, \vec F_{12}, q\vec E, \vec f_s.
export function vecLabel(l) {
  if (!l) return '';
  l = l.replace(/[₀-₉]+/g, m => [...m].map(c => '₀₁₂₃₄₅₆₇₈₉'.indexOf(c)).join(''));
  if (/^q[A-Z]$/.test(l)) return `q\\vec ${l[1]}`;
  const m = /^([−-]?)([A-Za-z])(′?)([A-Za-z0-9∥⊥]*)$/.exec(l);
  if (!m) return textToTeX(l);
  return `${m[1]}\\vec ${m[2]}${m[3]}` + (m[4] ? `_{${m[4]}}` : '');
}
// Testo semplice dell'app in TeX: l'unità dopo il numero diventa in tondo ("r = 2,00 m" → r = 2,00 \mathrm{m});
// le parole (almeno tre lettere, con gli spazi tra loro) restano in tondo: "−A (apparente)", "in equilibrio".
export function textToTeX(s) {
  s = String(s);
  if (s.includes('\\')) return s;
  const W = '[A-Za-zÀ-ÿ]';
  s = s.replace(new RegExp(`${W}{2,}(?:\\s+${W}{2,})*`, 'g'), run => (/[A-Za-zÀ-ÿ]{3,}/.test(run) ? `\\mathrm{${run}}` : run));
  s = s.replace(/(\d)\s+([A-Za-zµ°/²³·]+)$/, '$1\\ \\mathrm{$2}');
  return s.replace(/·/g, '\\cdot ');
}

// Colori dell'app sostituiti da quelli di Manim (vettori, testo, fondo, maniglie).
export const manimColors = (c, M) => ({ ...c, bg: M.bg, text: M.text, muted: M.muted, handle: M.sel, axis: M.axis, ideal: M.muted, ...M.vec });

// Painter che disegna frecce e scritte alla Manim: le chiamate esistenti (P.arrow, P.textS, P.arc) restano uguali.
// grow(opts) può restituire il fattore di crescita di una freccia (transizioni).
export function manimPainter(P0, M, PainterClass, { grow = () => 1 } = {}) {
  const P = new PainterClass(P0.ctx, P0.cam, manimColors(P0.c, M));
  P.arrow = (x0, y0, x1, y1, { color = 'vel', width = 3.5, label, dash = null, alpha = 1, head = 13 } = {}) => {
    const [a, b] = P.S(x0, y0), [c, d] = P.S(x1, y1), col = M.vec[color] ?? P.col(color), g = grow({ color, label });
    const tip = arrowS(P.ctx, a, b, c, d, col, { width: Math.max(2.5, width), tip: Math.max(12, head + 3), grow: g, alpha, halo: M.bg, dash });
    if (tip && label && tip.len > 18) arrowLabel(P, tip, vecLabel(label), col, M, alpha * g);
  };
  return P;
}

// Regia delle transizioni: valori che inseguono, oggetti che compaiono, elementi che si accendono.
// tick(still) va chiamato a ogni disegno; still = true (istantanee) porta tutto subito allo stato finale.
const RM = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
export const reducedMotion = () => !!RM?.matches;

export class Regia {
  constructor() { this.now = 0; this.dt = 0; this.last = 0; this.still = false; this.vals = new Map(); this.bornAt = new Map(); this.onAt = {}; this.sigs = {}; }
  // still = true (istantanee) oppure "riduci movimento" del sistema: tutto subito allo stato finale.
  tick(still = false) {
    const now = performance.now() / 1000;
    this.dt = Math.min(0.1, now - (this.last || now)); this.last = this.now = now; this.still = still || reducedMotion();
  }
  // Valore mostrato che insegue quello vero (tau: tempo di risposta in s). snap: salta subito al valore.
  smooth(key, target, tau = 0.09, snap = false) {
    const v = this.vals.get(key);
    if (!v || snap || this.still || v.length !== target.length) { this.vals.set(key, target.slice()); return target; }
    const k = 1 - Math.exp(-this.dt / tau);
    for (let i = 0; i < v.length; i++) v[i] += (target[i] - v[i]) * k;
    return v;
  }
  // Scala di un oggetto appena comparso: piccolo rimbalzo di 0,45 s.
  born(id) {
    if (this.still) return 1;
    if (!this.bornAt.has(id)) this.bornAt.set(id, this.now);
    const t = Math.min(1, (this.now - this.bornAt.get(id)) / 0.45), c = 1.70158;
    return 1 + (c + 1) * (t - 1) ** 3 + c * (t - 1) ** 2;
  }
  // Avanzamento 0 → 1 (in run s) di qualcosa che si accende quando sig cambia (sig = null: spento).
  on(key, sig, run = 0.6) {
    if (sig == null) { this.sigs[key] = null; return 0; }
    if (this.sigs[key] !== sig) { this.sigs[key] = sig; this.onAt[key] = this.now; }
    if (this.still) return 1;
    const t = Math.min(1, (this.now - this.onAt[key]) / run);
    return t * t * (3 - 2 * t);
  }
  // Regia delle linee di campo (key: un insieme di linee; sig: la loro "struttura", cioè numero e segno delle sorgenti).
  //  - prima comparsa (o riaccensione): Create alla Manim, le linee si tracciano una dopo l'altra con la curva smooth;
  //  - cambia la struttura (carica aggiunta, tolta, segno invertito): le linee vecchie sfumano mentre le nuove
  //    si tracciano più in fretta, così non c'è mai uno stacco brusco;
  //  - stessa struttura (trascinamento, valore della carica): le linee seguono le sorgenti senza ripartire.
  // Restituisce { progress(i), old: linee uscenti o null, oldAlpha }.
  fieldLines(key, sig, lines) {
    this.fl ??= {};
    const st = this.fl[key] ??= { sig: undefined, t0: -1e9, seen: -1e9, cur: null, old: null, fast: false };
    const gone = this.now - st.seen > 0.3;   // non disegnate di recente (spente, altro esperimento): da capo
    if (sig !== st.sig || gone) {
      const morph = !gone && !this.still && st.cur?.length && st.sig !== undefined;
      st.old = morph ? st.cur : null;
      st.fast = !!morph; st.sig = sig; st.t0 = this.now;
    }
    // Stessa struttura ma più linee (carica aumentata): solo quelle in più si tracciano.
    if (st.n != null && lines.length > st.n && sig === st.sig && !gone) { st.extraFrom = Math.min(st.extraFrom ?? Infinity, st.n); st.extraT0 = this.now; }
    st.n = lines.length; st.cur = lines; st.seen = this.now;
    const n = Math.max(1, lines.length), t = this.now - st.t0, rs = t => (t <= 0 ? 0 : t >= 1 ? 1 : rate.smooth(t));
    const run = st.fast ? 0.55 : 0.95, lag = st.fast ? Math.min(0.012, 0.3 / n) : Math.min(0.045, 0.75 / n);
    const te = this.now - (st.extraT0 ?? -1e9);
    if (te > 0.5) st.extraFrom = null;
    const progress = this.still ? () => 1 : i => Math.min(rs((t - i * lag) / run), st.extraFrom != null && i >= st.extraFrom ? rs(te / 0.45) : 1);
    const oldAlpha = st.old && !this.still ? 1 - rs(t / 0.45) : 0;
    if (oldAlpha <= 0) st.old = null;
    return { progress, old: st.old, oldAlpha };
  }
  // Istante in cui sig è cambiato l'ultima volta (per le linee di campo che si ridisegnano).
  since(key, sig) {
    if (this.sigs[key] !== sig) { this.sigs[key] = sig; this.onAt[key] = this.now; }
    return this.still ? Infinity : this.now - this.onAt[key];
  }
}
