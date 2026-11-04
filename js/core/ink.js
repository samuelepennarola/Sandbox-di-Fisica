import { store } from './store.js';

// Per ogni tratto teniamo in cache (non nei dati salvati) il riquadro e la curva già pronta come Path2D
// in coordinate mondo: a ogni fotogramma basta applicare zoom e spostamento, senza ricalcolare nulla.
const CACHE = new WeakMap();

// Appunti a penna in coordinate mondo: seguono zoom e spostamento della scena.
// Ogni tratto: { c: chiave colore, w: spessore base in metri, k: tipo ('pen' | 'brush'), pts: [[x, y, pressione], ...] }
export class Ink {
  constructor() { this.strokes = []; this.cur = null; this.key = null; }

  load(key) {
    this.flush();
    this.key = key;
    this.strokes = store.get('ink.' + key, []);
    this.cur = null;
  }

  // Il salvataggio serializza tutti i tratti: lo rimandiamo a quando si smette di scrivere,
  // così non occupa il processore proprio mentre arriva il tocco successivo della Pencil.
  save() {
    clearTimeout(this.saveTimer);
    const key = this.key, strokes = this.strokes;
    this.saveTimer = setTimeout(() => store.set('ink.' + key, strokes), 800);
  }

  flush() {
    if (this.saveTimer == null) return;
    clearTimeout(this.saveTimer);
    this.saveTimer = null;
    store.set('ink.' + this.key, this.strokes);
  }

  begin(x, y, p, w, c, k = 'pen') {
    this.cur = { c, w, k, pts: [[x, y, p]] };
    this.strokes.push(this.cur);
  }

  add(x, y, p) {
    if (!this.cur) return;
    const pts = this.cur.pts, last = pts[pts.length - 1];
    if (Math.hypot(x - last[0], y - last[1]) < this.cur.w * 0.2) return;
    // Pressione leggermente smorzata: evita scatti di spessore tra un punto e l'altro.
    const ps = last[2] * 0.45 + p * 0.55;
    pts.push([+x.toFixed(4), +y.toFixed(4), +ps.toFixed(2)]);
    CACHE.delete(this.cur);
  }

  end() { if (this.cur) { this.cur = null; this.save(); } }

  cancel() {
    if (!this.cur) return;
    this.strokes.splice(this.strokes.indexOf(this.cur), 1);
    this.cur = null;
  }

  undo() { this.strokes.pop(); this.save(); }
  clear() { this.strokes = []; this.save(); }

  // Gomma precisa: toglie solo la parte di tratto entro r dal punto, spezzando il tratto se serve.
  erasePartAt(x, y, r) {
    let changed = false;
    const out = [];
    for (const s of this.strokes) {
      const rr = r + s.w / 2, [x0, y0, x1, y1] = strokeBox(s);
      if (x < x0 - rr || x > x1 + rr || y < y0 - rr || y > y1 + rr || !touches(s.pts, x, y, rr)) { out.push(s); continue; }
      changed = true;
      if (s.pts.length === 1) continue;
      // Infittisce i punti (i tratti veloci ne hanno pochi), poi tiene solo i pezzi fuori dalla gomma.
      let run = [];
      for (const p of densify(s.pts, rr / 2)) {
        if (Math.hypot(p[0] - x, p[1] - y) < rr) { if (run.length > 1) out.push({ ...s, pts: run }); run = []; } else run.push(p);
      }
      if (run.length > 1) out.push({ ...s, pts: run });
    }
    if (changed) { this.strokes = out; this.save(); }
  }

  // Il tratto è stato spostato o ridimensionato (lazo): la curva in cache va ricalcolata.
  touch(s) { CACHE.delete(s); }

  // Gomma a tratti interi: rimuove ogni tratto che passa entro r (metri) dal punto.
  eraseAt(x, y, r) {
    const before = this.strokes.length;
    this.strokes = this.strokes.filter(s => !s.pts.some(([px, py]) => Math.hypot(px - x, py - y) < r + s.w));
    if (this.strokes.length !== before) this.save();
  }

  draw(ctx, cam, colors) {
    const vb = cam.bounds(), k = cam.scale;
    ctx.save();
    // Da qui in poi si disegna in metri: stessa trasformazione della camera (y verso l'alto).
    ctx.transform(k, 0, 0, -k, cam.w / 2 - cam.cx * k, cam.h / 2 + cam.cy * k);
    ctx.lineCap = ctx.lineJoin = 'round';
    for (const s of this.strokes) {
      let c = CACHE.get(s);
      if (!c) CACHE.set(s, c = build(s));
      const [x0, y0, x1, y1] = c.bb;
      if (x1 < vb.x0 - s.w || x0 > vb.x1 + s.w || y1 < vb.y0 - s.w || y0 > vb.y1 + s.w) continue;
      ctx.strokeStyle = ctx.fillStyle = colors[s.c] || colors.ink;
      if (c.dot) {
        ctx.beginPath(); ctx.arc(c.dot[0], c.dot[1], Math.max(1.6 / k, c.dot[2]), 0, Math.PI * 2); ctx.fill();
        continue;
      }
      if (c.fill) {
        ctx.fill(c.fill);
        for (const [x, y, r] of c.caps) { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); }
        continue;
      }
      for (const g of c.groups) { ctx.lineWidth = Math.max(0.6 / k, g.w); ctx.stroke(g.path); }
    }
    ctx.restore();
  }
}

// Riquadro [x0, y0, x1, y1] di un tratto in coordinate mondo.
export function strokeBox(s) {
  let c = CACHE.get(s);
  if (!c) CACHE.set(s, c = build(s));
  return c.bb;
}

// Il tratto passa entro r dal punto (controllando i segmenti, non solo i punti campionati)?
function touches(P, x, y, r) {
  if (P.length === 1) return Math.hypot(P[0][0] - x, P[0][1] - y) < r;
  for (let i = 1; i < P.length; i++) {
    const [ax, ay] = P[i - 1], [bx, by] = P[i], dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy || 1e-12;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / L2));
    if (Math.hypot(ax + t * dx - x, ay + t * dy - y) < r) return true;
  }
  return false;
}

// Aggiunge punti intermedi in modo che due punti consecutivi distino al più `step`.
function densify(P, step) {
  const out = [P[0]];
  for (let i = 1; i < P.length; i++) {
    const a = P[i - 1], b = P[i], n = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / step);
    for (let k = 1; k <= n; k++) { const t = k / n; out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]); }
  }
  return out;
}

// Spessore in metri per una data pressione.
// Spessore in metri per una data pressione, secondo il tipo di tratto:
// penna = quasi costante (come una sfera); pennello = molto sensibile alla pressione.
// I tratti salvati prima dei tipi (senza k) conservano il loro aspetto.
export function widthOf(s, p) {
  if (s.k === 'brush') return s.w * (0.12 + 1.7 * p ** 1.3);
  if (s.k === 'pen') return s.w * (0.75 + 0.5 * p);
  return s.w * (0.35 + 0.9 * p);
}

// Il pennello si assottiglia all'inizio e alla fine del tratto (lungo circa 4 spessori).
function taper(s, S) {
  if (s.k !== 'brush' || S.length < 3) return S.map(() => 1);
  const d = [0];
  for (let i = 1; i < S.length; i++) d.push(d[i - 1] + Math.hypot(S[i][0] - S[i - 1][0], S[i][1] - S[i - 1][1]));
  const L = d[d.length - 1], T = Math.min(4 * s.w, L / 3);
  return d.map(x => Math.max(0.15, Math.min(1, x / T, (L - x) / T)) ** 0.7);
}

function build(s) {
  const pts = s.pts;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of pts) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  const bb = [x0, y0, x1, y1];
  if (pts.length === 1) return { bb, dot: [pts[0][0], pts[0][1], widthOf(s, pts[0][2]) / 2] };
  const S = smooth(pts, s.w * (s.k === 'brush' ? 0.5 : 1.2));
  return s.k === 'brush' ? { bb, ...outline(s, S) } : { bb, groups: groupByWidth(s, S) };
}

// Curva liscia per i punti medi (Bézier quadratiche con i punti campionati come controlli),
// suddivisa in pezzetti lunghi circa `step`: le curve non appaiono più come poligoni.
function smooth(P, step) {
  if (P.length < 3) return P;
  const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
  const out = [P[0]];
  let start = P[0];
  for (let i = 1; i < P.length - 1; i++) {
    const c = P[i], end = mid(P[i], P[i + 1]);
    const len = Math.hypot(c[0] - start[0], c[1] - start[1]) + Math.hypot(end[0] - c[0], end[1] - c[1]);
    const n = Math.max(1, Math.min(24, Math.ceil(len / step)));
    for (let k = 1; k <= n; k++) {
      const t = k / n, u = 1 - t, a = u * u, b = 2 * u * t, d = t * t;
      out.push([a * start[0] + b * c[0] + d * end[0], a * start[1] + b * c[1] + d * end[1], a * start[2] + b * c[2] + d * end[2]]);
    }
    start = end;
  }
  out.push(P[P.length - 1]);
  return out;
}

// Pennello: sagoma piena delimitata dai due bordi del tratto (bordi lisci anche con spessori grandi),
// più due cerchietti per arrotondare le estremità.
function outline(s, S) {
  const tf = taper(s, S), n = S.length, Lft = [], Rgt = [];
  for (let i = 0; i < n; i++) {
    const a = S[Math.max(0, i - 1)], b = S[Math.min(n - 1, i + 1)];
    let tx = b[0] - a[0], ty = b[1] - a[1];
    const l = Math.hypot(tx, ty) || 1; tx /= l; ty /= l;
    const r = widthOf(s, S[i][2]) * tf[i] / 2;
    Lft.push([S[i][0] - ty * r, S[i][1] + tx * r]);
    Rgt.push([S[i][0] + ty * r, S[i][1] - tx * r]);
  }
  const fill = new Path2D();
  fill.moveTo(Lft[0][0], Lft[0][1]);
  for (let i = 1; i < n; i++) fill.lineTo(Lft[i][0], Lft[i][1]);
  for (let i = n - 1; i >= 0; i--) fill.lineTo(Rgt[i][0], Rgt[i][1]);
  fill.closePath();
  const cap = i => [S[i][0], S[i][1], widthOf(s, S[i][2]) * tf[i] / 2];
  return { fill, caps: [cap(0), cap(n - 1)] };
}

// Spessore variabile: i pezzetti consecutivi con lo stesso spessore (arrotondato a 1/10 dello spessore base)
// finiscono in un unico percorso, così le giunture restano invisibili.
function groupByWidth(s, S) {
  const tf = taper(s, S);
  const q = s.w / 10, wq = i => Math.round(widthOf(s, (S[i - 1][2] + S[i][2]) / 2) * (tf[i - 1] + tf[i]) / 2 / q) * q;
  const groups = [];
  let i = 1;
  while (i < S.length) {
    const w = wq(i), path = new Path2D();
    path.moveTo(S[i - 1][0], S[i - 1][1]);
    while (i < S.length && wq(i) === w) { path.lineTo(S[i][0], S[i][1]); i++; }
    groups.push({ w, path });
  }
  return groups;
}
