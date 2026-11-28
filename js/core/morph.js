// Formule che si trasformano, alla 3Blue1Brown (TransformMatchingTex di Manim) sul canvas.
//
//   morphTeX(P, from, to, t, opts)   una formula diventa l'altra: i simboli uguali scivolano al loro posto,
//                                    quelli nuovi compaiono crescendo, quelli che spariscono sfumano.
//   emphasize(P, src, t, opts)       evidenzia un termine: 'indicate' (si gonfia e si accende di giallo),
//                                    'circumscribe' (un rettangolo gli passa attorno) o 'box' (il rettangolo resta).
//   new TexSteps(steps, opts)        più trasformazioni in fila, a passi (Avanti / Indietro / Tutto).
//
// Le formule usano il mini-LaTeX di manim.js. I simboli si abbinano per contenuto e ordine: prima la sottosequenza
// comune più lunga (così "P∥ =" resta fermo), poi gli stessi simboli finiti altrove (un termine che passa di lato).
// I numeri sono un simbolo solo ("9,81"), come le parti isolate in Manim: non si mescolano le cifre.
// Con opts.map si dice esplicitamente chi diventa chi: { m: '3{,}0' } fa diventare m il numero 3,0.
import { texLayout, drawTexOp, mixHex, reducedMotion } from './manim.js';
import { rate } from './anim.js';

const clamp01 = x => (x < 0 ? 0 : x > 1 ? 1 : x);
const lerp = (a, b, t) => a + (b - a) * t;
const HL = { dark: '#FFFF00', light: '#b8860b' };   // giallo di Manim (Indicate, Circumscribe); sulla carta, ocra

/* ---------------- Simboli (token) di una formula impaginata ---------------- */

const NUM = /^[0-9]$/, SEP = /^[,.]$/;
const tokCache = new WeakMap();

// Raggruppa le operazioni di disegno in simboli: un glifo, un numero intero (cifre e virgola), una riga, una radice.
function tokens(L) {
  let T = tokCache.get(L);
  if (T) return T;
  T = [];
  for (const o of L.ops) {
    if (o.k === 'text' && !o.s.trim()) continue;   // spazi: non si disegnano e non si abbinano
    const prev = T[T.length - 1], last = prev?.ops[prev.ops.length - 1];
    const digit = o.k === 'text' && NUM.test(o.s), sep = o.k === 'text' && SEP.test(o.s);
    if ((digit || sep) && prev?.num && last.size === o.size && Math.abs(last.y - o.y) < 0.5 && o.x - (last.x + last.w) < o.size * 0.25) {
      prev.ops.push(o); continue;
    }
    T.push({ ops: [o], num: digit });
  }
  for (const k of T) {
    // Una virgola rimasta in fondo a un numero ("3," prima di uno spazio) torna un simbolo a sé: qui basta la chiave.
    k.key = k.ops.map(o => (o.k === 'text' ? o.s : o.k)).join('');
    k.col = k.ops[0].col ?? null;
    k.plain = { ...k, ops: k.ops.map(o => ({ ...o, col: null })) };   // stesso simbolo senza il colore proprio
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const o of k.ops) {
      if (o.k === 'text') { x0 = Math.min(x0, o.x); x1 = Math.max(x1, o.x + o.w); y0 = Math.min(y0, o.y - o.size * 0.42); y1 = Math.max(y1, o.y + o.size * 0.42); }
      else if (o.k === 'rule') { x0 = Math.min(x0, o.x, o.x2); x1 = Math.max(x1, o.x, o.x2); y0 = Math.min(y0, o.y - o.lw); y1 = Math.max(y1, o.y + o.lw); }
      else for (const [a, b] of o.pts) { x0 = Math.min(x0, a); x1 = Math.max(x1, a); y0 = Math.min(y0, b); y1 = Math.max(y1, b); }
    }
    Object.assign(k, k.plain = Object.assign(k.plain, { x0, x1, y0, y1, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, h: Math.max(1, y1 - y0), w: Math.max(1, x1 - x0) }));
    k.size = k.plain.size = k.ops.find(o => o.k === 'text')?.size ?? k.h;
  }
  tokCache.set(L, T);
  return T;
}

// Indici dei simboli di L che compongono il termine `term` (TeX), oppure null. from: da dove cercare.
function findTerm(P, L, term, size, from = 0) {
  const T = tokens(L), want = tokens(texLayout(P, term, size)).map(k => k.key);
  if (!want.length) return null;
  for (let i = from; i + want.length <= T.length; i++)
    if (want.every((k, j) => T[i + j].key === k)) return want.map((_, j) => i + j);
  return null;
}

// Spostamento orizzontale della formula: 'eq' allinea il primo segno = su x (se c'è), 'left' parte da x, 'center' centra.
function originX(L, x, align) {
  if (align === 'eq') { const e = tokens(L).find(k => k.key === '='); if (e) return x - e.cx; align = 'center'; }
  return align === 'left' ? x : align === 'right' ? x - L.w : x - L.w / 2;
}

const bboxOf = list => {
  const b = { x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity };
  for (const k of list) { b.x0 = Math.min(b.x0, k.x0); b.x1 = Math.max(b.x1, k.x1); b.y0 = Math.min(b.y0, k.y0); b.y1 = Math.max(b.y1, k.y1); }
  b.cx = (b.x0 + b.x1) / 2; b.cy = (b.y0 + b.y1) / 2; b.h = Math.max(1, b.y1 - b.y0); b.w = Math.max(1, b.x1 - b.x0);
  return b;
};

/* ---------------- Abbinamento ---------------- */

// Sottosequenza comune più lunga tra due elenchi di chiavi (solo tra gli indici liberi).
function lcs(A, B) {
  const n = A.length, m = B.length, D = Array.from({ length: n + 1 }, () => new Int16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--)
    D[i][j] = A[i].key === B[j].key ? D[i + 1][j + 1] + 1 : Math.max(D[i + 1][j], D[i][j + 1]);
  const out = [];
  for (let i = 0, j = 0; i < n && j < m;) {
    if (A[i].key === B[j].key) { out.push([A[i].i, B[j].i]); i++; j++; }
    else if (D[i + 1][j] >= D[i][j + 1]) i++; else j++;
  }
  return out;
}

const planCache = new WeakMap();

// Piano della trasformazione: coppie che scivolano, gruppi che si scambiano (dissolvenza incrociata in movimento),
// simboli che compaiono o spariscono da soli.
function plan(P, LA, LB, size, map) {
  const mk = JSON.stringify(map ?? {});
  let byB = planCache.get(LA);
  if (!byB) planCache.set(LA, byB = new WeakMap());
  let byMap = byB.get(LB);
  if (!byMap) byB.set(LB, byMap = new Map());
  if (byMap.has(mk)) return byMap.get(mk);

  const A = tokens(LA), B = tokens(LB), usedA = new Set(), usedB = new Set();
  const slides = [], groups = [];
  // 1. Sostituzioni dichiarate (m → 3,0): ogni occorrenza, nell'ordine.
  for (const [fa, tb] of Object.entries(map ?? {})) {
    let ia = 0, ib = 0;
    for (;;) {
      const ga = findTerm(P, LA, fa, size, ia), gb = findTerm(P, LB, tb, size, ib);
      if (!ga || !gb) break;
      if (ga.some(i => usedA.has(i)) || gb.some(i => usedB.has(i))) { ia = ga[0] + 1; ib = gb[0] + 1; continue; }
      ga.forEach(i => usedA.add(i)); gb.forEach(i => usedB.add(i));
      groups.push([ga, gb]);
      ia = ga[ga.length - 1] + 1; ib = gb[gb.length - 1] + 1;
    }
  }
  // 2. Stessi simboli nello stesso ordine.
  const freeA = A.map((k, i) => ({ key: k.key, i })).filter(k => !usedA.has(k.i));
  const freeB = B.map((k, i) => ({ key: k.key, i })).filter(k => !usedB.has(k.i));
  const anchors = lcs(freeA, freeB);
  for (const [i, j] of anchors) { slides.push([i, j]); usedA.add(i); usedB.add(j); }
  // 3. Stessi simboli in un altro punto: il più vicino in proporzione.
  for (let i = 0; i < A.length; i++) {
    if (usedA.has(i)) continue;
    let best = -1, bd = Infinity;
    for (let j = 0; j < B.length; j++) {
      if (usedB.has(j) || B[j].key !== A[i].key) continue;
      const d = Math.abs(i / A.length - j / B.length);
      if (d < bd) { bd = d; best = j; }
    }
    if (best >= 0) { slides.push([i, best]); usedA.add(i); usedB.add(best); }
  }
  // 4. Ciò che resta, tra due simboli fermi uguali, si scambia in gruppo (m g → 3,0 · 9,81 ·).
  const gapA = new Map(), gapB = new Map();
  const gapOf = (idx, side) => anchors.filter(p => p[side] < idx).length;
  for (let i = 0; i < A.length; i++) if (!usedA.has(i)) { const g = gapOf(i, 0); (gapA.get(g) ?? gapA.set(g, []).get(g)).push(i); }
  for (let j = 0; j < B.length; j++) if (!usedB.has(j)) { const g = gapOf(j, 1); (gapB.get(g) ?? gapB.set(g, []).get(g)).push(j); }
  const fadeOut = [], fadeIn = [];
  for (const [g, ia] of gapA) { if (gapB.has(g)) { groups.push([ia, gapB.get(g)]); gapB.delete(g); } else fadeOut.push(...ia); }
  for (const jb of gapB.values()) fadeIn.push(...jb);

  const res = { A, B, slides, groups: groups.map(([ga, gb]) => ({ ga, gb, BA: bboxOf(ga.map(i => A[i])), BB: bboxOf(gb.map(j => B[j])) })), fadeOut, fadeIn };
  byMap.set(mk, res);
  return res;
}

/* ---------------- Disegno ---------------- */

// Un simbolo con centro in (cx, cy), scala s, opacità a e colore c. outline: solo contorno (Write di Manim).
function drawTok(ctx, k, cx, cy, s, a, c, outline = false, halo = null) {
  if (a <= 0.003 || s <= 0.01) return;
  ctx.save();
  ctx.globalAlpha *= Math.min(1, a);
  ctx.translate(cx, cy); ctx.scale(s, s);
  if (halo && !outline) for (const o of k.ops) drawTexOp(ctx, o, -k.cx, -k.cy, o.col ?? c, halo, false);
  for (const o of k.ops) drawTexOp(ctx, o, -k.cx, -k.cy, o.col ?? c, null, outline);
  ctx.restore();
}
const prep = ctx => { ctx.textBaseline = 'middle'; ctx.textAlign = 'left'; ctx.lineJoin = ctx.lineCap = 'round'; };
const mixC = (a, b, t) => (a === b || t <= 0 ? a : t >= 1 ? b : /^#[0-9a-f]{6}$/i.test(a) && /^#[0-9a-f]{6}$/i.test(b) ? mixHex(a, b, t) : t < 0.5 ? a : b);

// Animazione Write di Manim (DrawBorderThenFill): ogni simbolo nasce prima dal contorno e poi si riempie.
export function writeTeX(P, src, t, { x, y, size = 24, color = '#fff', align = 'eq', alpha = 1, halo = null } = {}) {
  if (t >= 1) return drawTeX(P, src, { x, y, size, color, align, alpha, halo });
  if (t <= 0) return;
  const L = texLayout(P, src, size), T = tokens(L), ox = originX(L, x, align), ctx = P.ctx;
  const n = T.length, lag = 0.5 / Math.max(1, n - 1);
  ctx.save(); prep(ctx); ctx.globalAlpha = alpha;
  T.forEach((k, i) => {
    const u = clamp01((t - i * lag) / 0.5);
    if (u <= 0) return;
    const strokeA = u < 0.55 ? rate.smooth(u / 0.55) : 1 - rate.smooth((u - 0.55) / 0.45);
    const fillA = u > 0.42 ? rate.smooth((u - 0.42) / 0.58) : 0;
    const cx = ox + k.cx, cy = y + k.cy;
    if (fillA > 0.005) drawTok(ctx, k, cx, cy, 1, fillA, k.col ?? color, false, halo);
    if (strokeA > 0.005) drawTok(ctx, k, cx, cy, 1, strokeA * 0.9, k.col ?? color, true, null);
  });
  ctx.restore();
}

// Formula ferma (con l'allineamento di morphTeX): utile come primo e ultimo fotogramma.
export function drawTeX(P, src, { x, y, size = 24, color = '#fff', align = 'eq', alpha = 1, halo = null } = {}) {
  const L = texLayout(P, src, size), ox = originX(L, x, align), ctx = P.ctx;
  ctx.save(); prep(ctx); ctx.globalAlpha = alpha;
  for (const k of tokens(L)) drawTok(ctx, k, ox + k.cx, y + k.cy, 1, 1, k.col ?? color, false, halo);
  ctx.restore();
}

// Trasformazione di `from` in `to` all'istante t ∈ [0, 1] (lineare: la curva smooth di Manim è applicata qui).
// opts: x, y (punto d'appoggio), size, color, align ('eq' | 'left' | 'center' | 'right'), map, ease, halo.
export function morphTeX(P, from, to, t, { x, y, size = 24, color = '#fff', align = 'eq', map = null, ease = rate.smooth, alpha = 1, halo = null } = {}) {
  const LA = texLayout(P, from, size), LB = texLayout(P, to, size), ctx = P.ctx;
  if (t <= 0) return drawTeX(P, from, { x, y, size, color, align, alpha, halo });
  if (t >= 1) return drawTeX(P, to, { x, y, size, color, align, alpha, halo });
  const pl = plan(P, LA, LB, size, map), oa = originX(LA, x, align), ob = originX(LB, x, align);
  const e = ease(t);
  // Uscite e ingressi un po' sfalsati: chi se ne va lascia il posto prima che arrivi il nuovo, così non si sovrappongono.
  const out = rate.smooth(clamp01(t / 0.6)), inn = rate.smooth(clamp01((t - 0.4) / 0.6));
  ctx.save(); prep(ctx); ctx.globalAlpha = alpha;

  for (const i of pl.fadeOut) { const k = pl.A[i]; drawTok(ctx, k, oa + k.cx, y + k.cy, 1, 1 - out, k.col ?? color, false, halo); }
  for (const { ga, gb, BA, BB } of pl.groups) {
    // Il gruppo vecchio va verso il posto del nuovo adattandosi alla sua altezza e sfuma; il nuovo arriva da lì e cresce.
    // Ciascuno si adatta alla scatola dell'altro (FadeTransform), così non invade mai i simboli vicini.
    const fit = (X, Y) => Math.min(1.25, Math.max(0.35, Math.min(Y.w / X.w, Y.h / X.h)));
    const ax = oa + BA.cx, bx = ob + BB.cx, ay = y + BA.cy, by = y + BB.cy;
    const gx = lerp(ax, bx, e), gy = lerp(ay, by, e);
    const sA = lerp(1, fit(BA, BB), e), sB = lerp(fit(BB, BA), 1, e);
    // Dissolvenza incrociata un po' sfalsata: il vecchio cede il posto, il nuovo lo prende; mai un istante vuoto.
    const fo = 1 - clamp01(e / 0.75), fi = clamp01((e - 0.25) / 0.75);
    for (const i of ga) { const k = pl.A[i]; drawTok(ctx, k, gx + (k.cx - BA.cx) * sA, gy + (k.cy - BA.cy) * sA, sA, fo, k.col ?? color, false, halo); }
    for (const j of gb) { const k = pl.B[j]; drawTok(ctx, k, gx + (k.cx - BB.cx) * sB, gy + (k.cy - BB.cy) * sB, sB, fi, k.col ?? color, false, halo); }
  }
  for (const [i, j] of pl.slides) {
    const a = pl.A[i], b = pl.B[j], s = lerp(1, b.size / a.size, e);
    const ca = a.col ?? color, cb = b.col ?? color;
    // Stesso simbolo: scivola (e cambia corpo o colore se serve). Si disegna con le operazioni di partenza.
    const c = mixC(ca, cb, e);
    drawTok(ctx, a.plain, lerp(oa + a.cx, ob + b.cx, e), lerp(y + a.cy, y + b.cy, e), s, 1, c, false, halo);
  }
  for (const j of pl.fadeIn) { const k = pl.B[j]; drawTok(ctx, k, ob + k.cx, y + k.cy, lerp(0.5, 1, inn), inn, k.col ?? color, false, halo); }
  ctx.restore();
}

// Rettangolo attorno a una scatola, tracciato solo tra le frazioni lo e hi del perimetro (Create, ShowPassingFlash).
function rectPart(ctx, b, lo, hi) {
  if (hi - lo <= 1e-4) return;
  const pts = [[b.x0, b.y0], [b.x1, b.y0], [b.x1, b.y1], [b.x0, b.y1], [b.x0, b.y0]];
  const seg = [b.w, b.h, b.w, b.h], P = 2 * (b.w + b.h), A = lo * P, Z = hi * P;
  ctx.beginPath();
  let acc = 0, started = false;
  for (let i = 0; i < 4; i++) {
    const s0 = acc, s1 = acc + seg[i]; acc = s1;
    const u0 = Math.max(A, s0), u1 = Math.min(Z, s1);
    if (u1 <= u0) continue;
    const at = u => [lerp(pts[i][0], pts[i + 1][0], (u - s0) / seg[i]), lerp(pts[i][1], pts[i + 1][1], (u - s0) / seg[i])];
    if (!started) { ctx.moveTo(...at(u0)); started = true; }
    ctx.lineTo(...at(u1));
  }
  ctx.stroke();
}

// Evidenzia `term` (TeX, o un elenco di termini) dentro la formula `src` all'istante t ∈ [0, 1].
//   kind 'indicate'     il termine si gonfia del 20 % e diventa giallo, poi torna com'era (Indicate)
//   kind 'circumscribe' un rettangolo giallo gli corre attorno e si cancella (Circumscribe)
//   kind 'box'          il rettangolo si traccia e resta (SurroundingRectangle con Create); boxAlpha lo attenua
export function emphasize(P, src, t, { x, y, size = 24, color = '#fff', align = 'eq', term, kind = 'indicate', hl, dark = true, alpha = 1, boxAlpha = 1, halo = null } = {}) {
  const L = texLayout(P, src, size), T = tokens(L), ox = originX(L, x, align), ctx = P.ctx;
  hl ??= dark ? HL.dark : HL.light;
  const terms = (Array.isArray(term) ? term : [term]).map(s => findTerm(P, L, s, size)).filter(Boolean);
  const pick = new Map();   // indice del simbolo → scatola del suo termine e quanto può gonfiarsi
  for (const g of terms) {
    const b = bboxOf(g.map(i => T[i])), L0 = T[g[0] - 1], R0 = T[g[g.length - 1] + 1];
    // Come Indicate (×1,2), ma senza arrivare ai vicini: al più il 40 % dello spazio libero per lato.
    const room = Math.min(L0 ? b.x0 - L0.x1 : 1e9, R0 ? R0.x0 - b.x1 : 1e9);
    b.grow = Math.max(0.06, Math.min(0.2, (2 * 0.4 * room) / b.w));
    for (const i of g) pick.set(i, b);
  }
  const w = kind === 'indicate' ? rate.thereAndBack(clamp01(t)) : 0;
  ctx.save(); prep(ctx); ctx.globalAlpha = alpha;
  if (kind === 'indicate' && w > 0.01 && alpha > 0) {
    // Alone dorato diffuso + sottile sottolineatura luminosa (ShowPassingFlash) sotto il termine evidenziato
    for (const g of terms) {
      const b = bboxOf(g.map(i => T[i]));
      const cx = ox + b.cx, cy = y + b.cy, rx = Math.max(14, b.w * 0.75 + 8);
      if (dark) {
        const gr = ctx.createRadialGradient(cx, cy, 2, cx, cy, rx);
        gr.addColorStop(0, hl + '3a');
        gr.addColorStop(1, hl + '00');
        ctx.save();
        ctx.globalAlpha = alpha * w;
        ctx.fillStyle = gr;
        ctx.beginPath(); ctx.arc(cx, cy, rx, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      }
      const uy = y + b.y1 + Math.max(2.5, size * 0.14), hw = (b.w * 0.5 + 3) * (0.35 + 0.65 * w);
      ctx.save();
      ctx.globalAlpha = alpha * w * (dark ? 0.88 : 0.78);
      ctx.strokeStyle = hl;
      ctx.lineWidth = Math.max(1.8, size * 0.095);
      ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(cx - hw, uy); ctx.lineTo(cx + hw, uy); ctx.stroke();
      ctx.restore();
    }
  }
  if (alpha > 0) T.forEach((k, i) => {
    const b = pick.get(i);
    if (!b || !w) return drawTok(ctx, k, ox + k.cx, y + k.cy, 1, 1, k.col ?? color, false, halo);
    const s = 1 + b.grow * w;
    drawTok(ctx, k, ox + b.cx + (k.cx - b.cx) * s, y + b.cy + (k.cy - b.cy) * s, s, 1, mixC(k.col ?? color, hl, w), false, halo);
  });
  if (kind !== 'indicate') {
    ctx.strokeStyle = hl; ctx.lineWidth = Math.max(2, size * 0.1); ctx.lineJoin = 'miter'; ctx.lineCap = 'butt';
    ctx.globalAlpha = boxAlpha;
    for (const g of terms) {
      // Margine come SurroundingRectangle, ma senza mai toccare i simboli vicini (resta a metà dello spazio libero).
      const b = bboxOf(g.map(i => T[i])), pad = size * 0.28, L0 = T[g[0] - 1], R0 = T[g[g.length - 1] + 1];
      const pl = Math.min(pad, L0 ? Math.max(2, (b.x0 - L0.x1) / 2) : pad), pr = Math.min(pad, R0 ? Math.max(2, (R0.x0 - b.x1) / 2) : pad);
      const R = { x0: ox + b.x0 - pl, x1: ox + b.x1 + pr, y0: y + b.y0 - pad, y1: y + b.y1 + pad };
      R.w = R.x1 - R.x0; R.h = R.y1 - R.y0;
      if (kind === 'box') rectPart(ctx, R, 0, rate.smooth(clamp01(t)));
      else { const s = rate.smooth(clamp01(t)) * 2; rectPart(ctx, R, Math.max(0, s - 1), Math.min(1, s)); }
    }
  }
  ctx.restore();
}

/* ---------------- Passi in fila ---------------- */

// Una soluzione animata a passi. Ogni passo è uno di:
//   { tex }                    la prima formula compare (simboli in dissolvenza sfalsata, salendo appena: Write/FadeIn)
//   { tex, map }               la formula attuale si trasforma in questa (morphTeX)
//   { indicate: termine/i }    { circumscribe: termine/i }   { box: termine }  (il riquadro resta fino al passo dopo)
// Ogni passo può avere run (s). update(dt) a ogni fotogramma, draw(P, x, y, opts) per disegnare.
const RUN = { show: 1.1, morph: 1.4, indicate: 1.0, circumscribe: 1.2, box: 0.9 };
const kindOf = s => (s.indicate ? 'indicate' : s.circumscribe ? 'circumscribe' : s.box ? 'box' : 'tex');

export class TexSteps {
  constructor(steps, opts = {}) {
    this.steps = steps; this.opts = opts;
    // Stato dopo ogni passo: formula mostrata e riquadro persistente.
    this.states = [];
    let cur = null, box = null;
    for (const s of steps) {
      if (kindOf(s) === 'tex') { cur = s.tex; box = null; }
      if (s.box) box = s.box;
      this.states.push({ tex: cur, box });
    }
    this.reset();
  }
  reset() { this.i = -1; this.t = 1; this.queue = 0; }
  get busy() { return this.t < 1 || this.queue > 0; }
  get done() { return this.i >= this.steps.length - 1 && this.t >= 1; }
  // Passo successivo (se uno è in corso, lo chiude e parte il nuovo, come 3b1b quando si incalza).
  next() { if (this.i >= this.steps.length - 1) return false; if (this.t < 1) this.t = 1; this.i++; this.t = reducedMotion() ? 1 : 0; return true; }
  prev() { this.queue = 0; if (this.i < 0) return; this.i--; this.t = 1; }
  // Tutto di fila, con una pausa tra un passo e l'altro.
  playAll(pause = 0.55) { if (this.done) this.reset(); this.pause = pause; this.queue = this.steps.length - 1 - this.i; this.wait = Infinity; }
  stop() { this.queue = 0; }
  update(dt) {
    if (this.t < 1) {
      const s = this.steps[this.i], k = kindOf(s);
      const run = s.run ?? RUN[k === 'tex' ? (this.i > 0 && this.states[this.i - 1].tex ? 'morph' : 'show') : k];
      this.t = Math.min(1, this.t + dt / run);
      if (this.t >= 1) this.wait = 0;
    } else if (this.queue > 0) {
      this.wait += dt;
      if (this.wait >= (this.pause ?? 0.55)) { this.queue--; this.next(); }
    }
  }
  draw(P, x, y, { size = 26, color = '#fff', dark = true, align = 'eq' } = {}) {
    if (this.i < 0) return;
    const s = this.steps[this.i], st = this.states[this.i], prev = this.states[this.i - 1] ?? { tex: null, box: null };
    const o = { x, y, size, color, align, dark }, k = kindOf(s), t = this.t;
    if (k === 'tex') {
      if (!prev.tex) return this.#appear(P, st.tex, t, o);
      morphTeX(P, prev.tex, st.tex, t, { ...o, map: s.map });
      // Il riquadro del passo prima sfuma mentre la formula cambia.
      if (prev.box) emphasize(P, prev.tex, 1, { ...o, term: prev.box, kind: 'box', alpha: 0, boxAlpha: 1 - rate.smooth(clamp01(t / 0.4)) });
      return;
    }
    if (k === 'box') return emphasize(P, st.tex, t, { ...o, term: s.box, kind: 'box' });
    emphasize(P, st.tex, t, { ...o, term: s.indicate ?? s.circumscribe, kind: k });
    if (st.box) emphasize(P, st.tex, 1, { ...o, term: st.box, kind: 'box', alpha: 0 });
  }
  // Ingombro orizzontale di tutte le formule rispetto al punto d'appoggio x: { left, right } (left ≤ 0).
  extent(P, size = 26, align = 'eq') {
    let left = 0, right = 0;
    for (const st of this.states) {
      if (!st.tex) continue;
      const L = texLayout(P, st.tex, size), ox = originX(L, 0, align);
      left = Math.min(left, ox); right = Math.max(right, ox + L.w);
    }
    return { left, right };
  }
  // Prima comparsa: Write di Manim (DrawBorderThenFill) su ogni simbolo da sinistra a destra.
  #appear(P, src, t, { x, y, size, color, align }) {
    writeTeX(P, src, t, { x, y, size, color, align });
  }
}
