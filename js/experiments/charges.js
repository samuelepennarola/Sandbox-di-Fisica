import { clamp, fmt, tn, deg } from '../core/math.js';
import { icons } from '../core/icons.js';
import { store } from '../core/store.js';
import { el } from '../core/ui.js';
import { drawGrid } from '../core/render.js';
import { K, MU, pointField, drawFieldLines, chargeSphere } from '../core/electric.js';

// Cariche e campo elettrico (elettrostatica, livello liceo).
// Sorgenti: cariche puntiformi (Coulomb in 3D), barre cariche uniformi (segmenti nel piano),
// lastre cariche viste di taglio (piani infiniti in profondità, campo calcolato in forma esatta).
// Unità: metri, microcoulomb (µC), µC/m² per la densità delle lastre.

const ROD_N = 48;                  // una barra è sommata come 48 cariche puntiformi
const LINES_PER_UC = 6;            // linee di campo per µC
const PLATE_FLUX = 1.7e4;          // lastre: una linea ogni 1,7·10⁴ N/C·m di flusso (≈ ogni 3 cm in un condensatore con σ = 5 µC/m²)
const PROBE_LEN = 0.11;            // lunghezza fissa della freccia di E sulla sonda (m)

const NAMES = { point: 'Carica', rod: 'Barra carica', plate: 'Lastra carica' };

const PROPS = {
  point: [{ key: 'q', label: 'Carica q', unit: 'µC', min: -10, max: 10, step: 0.5 }],
  rod: [
    { key: 'Q', label: 'Carica totale Q', unit: 'µC', min: -20, max: 20, step: 0.5 },
    { key: 'L', label: 'Lunghezza', unit: 'm', min: 0.05, max: 1.5, step: 0.01 },
    { key: 'angle', label: 'Inclinazione', unit: '°', min: -90, max: 90, step: 1 },
  ],
  plate: [
    { key: 'sigma', label: 'Densità di carica σ', unit: 'µC/m²', min: -20, max: 20, step: 0.5 },
    { key: 'L', label: 'Larghezza', unit: 'm', min: 0.1, max: 2, step: 0.01 },
    { key: 'angle', label: 'Inclinazione', unit: '°', min: -90, max: 90, step: 1 },
  ],
};

const TOOLS = [
  ['select', 'select', 'Seleziona'], ['plus', 'chargePlus', 'Carica +'], ['minus', 'chargeMinus', 'Carica −'],
  ['rod', 'rodCharge', 'Barra carica'], ['plate', 'plateCharge', 'Lastra carica'],
];

const B = { spec: null, sel: null, tool: 'select', api: null, linesKey: null, lines: [] };

/* ---------------- Scena ---------------- */

function newSpec() {
  return { sources: [], probe: { x: 0.25, y: 0.18 }, show: { lines: true, E: false, F: true, comp: false, probe: true }, next: 1 };
}
const add = (spec, s) => { s.id = 's' + spec.next++; spec.sources.push(s); return s; };
const srcOf = id => B.spec.sources.find(s => s.id === id);
const save = () => store.set('charges.scene', B.spec);

// Estremi di una barra o di una lastra (centro, lunghezza, inclinazione).
function ends(s) {
  const a = s.angle * deg, hx = Math.cos(a) * s.L / 2, hy = Math.sin(a) * s.L / 2;
  return [[s.x - hx, s.y - hy], [s.x + hx, s.y + hy]];
}

const radius = q => 0.018 + 0.006 * Math.sqrt(Math.abs(q));   // raggio disegnato di una carica (m)

function nameOf(s) {
  if (s.type !== 'point') return NAMES[s.type] + nth(s);
  return 'q' + sub(B.spec.sources.filter(o => o.type === 'point').indexOf(s) + 1);
}
function nth(s) { const same = B.spec.sources.filter(o => o.type === s.type); return same.length > 1 ? ' ' + (same.indexOf(s) + 1) : ''; }
const pIdx = s => B.spec.sources.filter(o => o.type === 'point').indexOf(s) + 1;   // numero della carica, per le formule
const refCharge = () => B.spec.sources.find(o => o.type === 'point');                // q₁: riferimento per distanze e angoli
const snap = v => Math.round(v * 200) / 200;                                          // posizioni a passi di mezzo centimetro
const sub = n => String(n).split('').map(d => '₀₁₂₃₄₅₆₇₈₉'[+d]).join('');

/* ---------------- Fisica ---------------- */

// Campo (N/C) generato in (x, y) dalla sola sorgente s.
function fieldOf(s, x, y) {
  if (s.type === 'point') return pointField(s.x, s.y, s.q * MU, x, y);
  if (s.type === 'rod') {
    const [[ax, ay], [bx, by]] = ends(s), q = s.Q * MU / ROD_N;
    let Ex = 0, Ey = 0;
    for (let i = 0; i < ROD_N; i++) {
      const t = (i + 0.5) / ROD_N, [ex, ey] = pointField(ax + (bx - ax) * t, ay + (by - ay) * t, q, x, y);
      Ex += ex; Ey += ey;
    }
    return [Ex, Ey];
  }
  // Lastra di larghezza L, infinita in profondità: integrale esatto di fili carichi 2kλ/r.
  const a = s.angle * deg, ux = Math.cos(a), uy = Math.sin(a), nx = -uy, ny = ux;
  const px = x - s.x, py = y - s.y, u = px * ux + py * uy;
  let d = px * nx + py * ny;
  if (Math.abs(d) < 1e-7) d = d < 0 ? -1e-7 : 1e-7;
  const h = s.L / 2, ks = K * s.sigma * MU;
  const Eu = ks * Math.log(((u + h) ** 2 + d * d) / ((u - h) ** 2 + d * d));
  const Ed = 2 * ks * (Math.atan((u + h) / d) - Math.atan((u - h) / d));
  return [Eu * ux + Ed * nx, Eu * uy + Ed * ny];
}

function fieldAt(x, y, skip = null) {
  let Ex = 0, Ey = 0;
  for (const s of B.spec.sources) {
    if (s === skip) continue;
    const [ex, ey] = fieldOf(s, x, y);
    Ex += ex; Ey += ey;
  }
  return [Ex, Ey];
}

// Potenziale (V) rispetto all'infinito: definito solo se non ci sono lastre (piani infiniti).
function potentialAt(x, y) {
  let V = 0;
  for (const s of B.spec.sources) {
    if (s.type === 'plate') return null;
    if (s.type === 'point') V += K * s.q * MU / Math.hypot(x - s.x, y - s.y);
    else {
      const [[ax, ay], [bx, by]] = ends(s);
      for (let i = 0; i < ROD_N; i++) { const t = (i + 0.5) / ROD_N; V += K * s.Q * MU / ROD_N / Math.hypot(x - ax - (bx - ax) * t, y - ay - (by - ay) * t); }
    }
  }
  return V;
}

// Forze su una carica puntiforme: contributo di ogni altra sorgente e risultante.
function forcesOn(c) {
  const list = B.spec.sources.filter(s => s !== c).map(s => {
    const [ex, ey] = fieldOf(s, c.x, c.y);
    return { s, F: [c.q * MU * ex, c.q * MU * ey] };
  });
  const R = list.reduce((a, f) => [a[0] + f.F[0], a[1] + f.F[1]], [0, 0]);
  return { list, R };
}

/* ---------------- Linee di campo ---------------- */

function segDist(x, y, [ax, ay], [bx, by]) {
  const dx = bx - ax, dy = by - ay, t = clamp(((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy || 1e-12), 0, 1);
  return Math.hypot(x - ax - t * dx, y - ay - t * dy);
}

// Le linee partono dalle sorgenti positive (o, se prevale la carica negativa, arrivano a quelle negative):
// il loro numero è proporzionale alla carica. Si ricalcolano solo quando cambiano le sorgenti.
function fieldLines() {
  const key = JSON.stringify(B.spec.sources);
  if (key === B.linesKey) return B.lines;
  B.linesKey = key;
  const src = B.spec.sources;
  if (!src.length) return (B.lines = []);

  const seeds = [];
  let pos = 0, neg = 0;
  for (const s of src) {
    const sign = Math.sign(s.type === 'point' ? s.q : s.type === 'rod' ? s.Q : s.sigma);
    if (!sign) continue;
    if (s.type === 'point') {
      const n = clamp(Math.round(LINES_PER_UC * Math.abs(s.q)), 4, 48), r = radius(s.q) * 1.05;
      for (let i = 0; i < n; i++) { const a = (i + 0.5) / n * 2 * Math.PI; seeds.push({ s, sign, x: s.x + r * Math.cos(a), y: s.y + r * Math.sin(a) }); }
      sign > 0 ? (pos += n) : (neg += n);
    } else if (s.type === 'rod') {
      // Barra: linee proporzionali a Q, divise sui due lati.
      const [A, Bp] = ends(s), n = clamp(Math.round(Math.abs(s.Q) * LINES_PER_UC / 2), 3, 40);
      const a = s.angle * deg, nx = -Math.sin(a), ny = Math.cos(a), off = 0.006;
      for (let i = 0; i < n; i++) {
        const t = (i + 0.5) / n, x = A[0] + (Bp[0] - A[0]) * t, y = A[1] + (Bp[1] - A[1]) * t;
        for (const side of [1, -1]) seeds.push({ s, sign, x: x + side * nx * off, y: y + side * ny * off });
      }
      sign > 0 ? (pos += 2 * n) : (neg += 2 * n);
    } else {
      // Lastra: lungo ogni lato partono linee in proporzione al flusso uscente (componente normale del campo totale),
      // una ogni PLATE_FLUX. Così in un condensatore le linee stanno dentro, dove c'è il campo.
      const [A, Bp] = ends(s), a = s.angle * deg, nx = -Math.sin(a), ny = Math.cos(a), off = 0.006, M = 160, ds = s.L / M;
      let count = 0;
      for (const side of [1, -1]) {
        let acc = 0.5;
        for (let i = 0; i < M; i++) {
          const t = (i + 0.5) / M, x = A[0] + (Bp[0] - A[0]) * t + side * nx * off, y = A[1] + (Bp[1] - A[1]) * t + side * ny * off;
          const [ex, ey] = fieldAt(x, y);
          acc += Math.max(0, sign * (ex * nx + ey * ny) * side) * ds / PLATE_FLUX;
          if (acc >= 1) { acc -= 1; seeds.push({ s, sign, x, y }); count++; }
        }
      }
      sign > 0 ? (pos += count) : (neg += count);
    }
  }
  // Si traccia dal segno che "possiede" più linee: le altre arrivano da sole sulle sorgenti opposte.
  const from = pos >= neg ? 1 : -1;
  const box = bounds(0.9);
  return (B.lines = seeds.filter(sd => sd.sign === from).map(sd => ({ pts: trace(sd, from, box), dir: from })));
}

function bounds(m) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const s of B.spec.sources) {
    const pts = s.type === 'point' ? [[s.x, s.y]] : ends(s);
    for (const [x, y] of pts) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  }
  return [x0 - m, y0 - m, x1 + m, y1 + m];
}

function trace(seed, dir, [x0, y0, x1, y1]) {
  let x = seed.x, y = seed.y;
  const pts = [[x, y]], src = B.spec.sources;
  const unit = (px, py) => { const [ex, ey] = fieldAt(px, py), m = Math.hypot(ex, ey); return m < 1e-9 ? null : [dir * ex / m, dir * ey / m]; };
  for (let i = 0; i < 1400; i++) {
    // Passo più fine vicino alle cariche puntiformi, dove il campo cambia in fretta.
    let near = Infinity;
    for (const s of src) if (s.type === 'point') near = Math.min(near, Math.hypot(x - s.x, y - s.y));
    const h = clamp(near * 0.2, 0.002, 0.012);
    const u1 = unit(x, y);
    if (!u1) break;
    const u2 = unit(x + u1[0] * h / 2, y + u1[1] * h / 2);
    if (!u2) break;
    x += u2[0] * h; y += u2[1] * h;
    pts.push([x, y]);
    if (x < x0 || x > x1 || y < y0 || y > y1) break;
    if (i < 3) continue;
    let hit = false;
    for (const s of src) {
      if (s.type === 'point') { if (Math.hypot(x - s.x, y - s.y) < radius(s.q) * 0.9) hit = true; }
      else if (segDist(x, y, ...ends(s)) < 0.004 && (s !== seed.s || i > 12)) hit = true;
      if (hit) break;
    }
    if (hit) break;
  }
  return pts;
}

/* ---------------- Disegno ---------------- */

function drawCharge(P, s, selected) {
  const [a, b] = P.S(s.x, s.y), r = Math.max(9, radius(s.q) * P.cam.scale);
  chargeSphere(P, a, b, r, s.q >= 0, selected);
  P.textS(a, b + r + 13, `${nameOf(s)} = ${fmt(s.q, 1)} µC`, { size: 12, align: 'center', color: 'text' });
}

function drawBar(P, s, selected) {
  const [A, Bp] = ends(s), ctx = P.ctx, [a1, b1] = P.S(...A), [a2, b2] = P.S(...Bp);
  const value = s.type === 'rod' ? s.Q : s.sigma, posC = value >= 0, hue = posC ? 2 : 214;
  const w = s.type === 'rod' ? 12 : 7;
  ctx.save();
  ctx.lineCap = 'round';
  if (selected) { ctx.strokeStyle = P.c.handle; ctx.lineWidth = w + 8; ctx.globalAlpha = 0.5; ctx.beginPath(); ctx.moveTo(a1, b1); ctx.lineTo(a2, b2); ctx.stroke(); ctx.globalAlpha = 1; }
  ctx.strokeStyle = s.type === 'rod' ? `hsl(${hue} 60% 52%)` : `hsl(${hue} 25% 58%)`; ctx.lineWidth = w;
  ctx.beginPath(); ctx.moveTo(a1, b1); ctx.lineTo(a2, b2); ctx.stroke();
  // Segni + o − distribuiti lungo la sorgente.
  const len = Math.hypot(a2 - a1, b2 - b1), n = Math.max(2, Math.floor(len / 22)), ux = (a2 - a1) / len, uy = (b2 - b1) / len;
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.8;
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n, cx = a1 + (a2 - a1) * t, cy = b1 + (b2 - b1) * t, q = 3.2;
    ctx.beginPath(); ctx.moveTo(cx - ux * q, cy - uy * q); ctx.lineTo(cx + ux * q, cy + uy * q);
    if (posC) { ctx.moveTo(cx + uy * q, cy - ux * q); ctx.lineTo(cx - uy * q, cy + ux * q); }
    ctx.stroke();
  }
  ctx.restore();
  const unit = s.type === 'rod' ? 'µC' : 'µC/m²', sym = s.type === 'rod' ? 'Q' : 'σ';
  P.textS((a1 + a2) / 2 - uy * 20, (b1 + b2) / 2 + ux * 20, `${sym} = ${fmt(value, 1)} ${unit}`, { size: 12, align: 'center' });
}

// Vettori del campo su una griglia: lunghezza e opacità crescono con |E| (scala compressa: il campo varia di ordini di grandezza).
function drawFieldGrid(P) {
  const sp = 54, { w, h } = P.cam, pts = [];
  for (let sy = sp / 2; sy < h; sy += sp) for (let sx = sp / 2; sx < w; sx += sp) {
    const [x, y] = P.cam.toWorld(sx, sy);
    let near = false;
    for (const s of B.spec.sources) {
      if (s.type === 'point' ? Math.hypot(x - s.x, y - s.y) < radius(s.q) * 1.6 : segDist(x, y, ...ends(s)) < 0.02) { near = true; break; }
    }
    if (near) continue;
    const [ex, ey] = fieldAt(x, y), m = Math.hypot(ex, ey);
    if (m > 0) pts.push([x, y, ex / m, ey / m, m]);
  }
  if (!pts.length) return;
  const mags = pts.map(p => p[4]).sort((a, b) => a - b), ref = mags[Math.floor(mags.length * 0.8)] || 1;
  for (const [x, y, ux, uy, m] of pts) {
    const k = Math.min(1, (m / ref) ** 0.5), len = sp * 0.75 * Math.max(0.25, k) / P.cam.scale;
    P.arrow(x - ux * len / 2, y - uy * len / 2, x + ux * len / 2, y + uy * len / 2, { color: 'acc', width: 2, head: 7, alpha: 0.3 + 0.7 * k });
  }
}

function drawForces(P) {
  const charges = B.spec.sources.filter(s => s.type === 'point');
  if (charges.length < 2 && !B.spec.sources.some(s => s.type !== 'point')) return;
  // Con una carica selezionata si mostrano solo le sue forze, in una scala che le rende ben leggibili.
  const focus = charges.find(c => c.id === B.sel);
  const data = (focus ? [focus] : charges).map(c => ({ c, ...forcesOn(c) }));
  let maxF = 0;
  for (const d of data) { maxF = Math.max(maxF, Math.hypot(...d.R)); if (focus) for (const f of d.list) maxF = Math.max(maxF, Math.hypot(...f.F)); }
  if (maxF <= 0) return;
  // La freccia più lunga misura poco più di metà della distanza minima tra le cariche: le frecce sono in scala tra loro.
  let dmin = Infinity;
  for (const a of charges) for (const c of charges) if (a !== c) dmin = Math.min(dmin, Math.hypot(a.x - c.x, a.y - c.y));
  const kf = clamp(0.6 * (Number.isFinite(dmin) ? dmin : 0.3), 0.08, 0.25) / maxF;
  for (const d of data) {
    if (focus) for (const f of d.list) {
      P.arrow(d.c.x, d.c.y, d.c.x + kf * f.F[0], d.c.y + kf * f.F[1], { color: 'applied', width: 2.2, dash: [5, 4], alpha: 0.7, label: 'F' + (f.s.type === 'point' ? '←' + nameOf(f.s) : '') });
    }
    P.arrow(d.c.x, d.c.y, d.c.x + kf * d.R[0], d.c.y + kf * d.R[1], { color: 'applied', width: 4, label: focus ? 'F ris.' : 'F' });
  }
  if (B.spec.show.comp) {
    for (const d of data) drawComponents(P, d, kf, !!focus);
  }
}

// Proiezioni sugli assi x e y: assi locali tratteggiati per la carica, linee di proiezione dalle punte dei vettori
// e frecce delle componenti della risultante (Fx, Fy). Con una carica selezionata si proiettano anche le singole forze.
function drawComponents(P, d, kf, detail) {
  const { c, R } = d, ctx = P.ctx, [a, b] = P.S(c.x, c.y);
  const vecs = [...(detail ? d.list.map(f => f.F) : []), R];
  let ext = 40;
  for (const F of vecs) ext = Math.max(ext, Math.abs(kf * F[0]) * P.cam.scale + 24, Math.abs(kf * F[1]) * P.cam.scale + 24);
  ctx.save();
  ctx.strokeStyle = P.c.muted; ctx.lineWidth = 1.2; ctx.setLineDash([4, 4]);
  ctx.beginPath(); ctx.moveTo(a - ext, b); ctx.lineTo(a + ext, b); ctx.moveTo(a, b - ext); ctx.lineTo(a, b + ext); ctx.stroke();
  ctx.font = 'italic 600 12px system-ui, sans-serif'; ctx.fillStyle = P.c.muted; ctx.setLineDash([]);
  ctx.fillText('x', a + ext + 3, b + 4); ctx.fillText('y', a - 4, b - ext - 5);
  // Linee di proiezione: dalla punta di ogni vettore, perpendicolari agli assi.
  ctx.setLineDash([2, 4]); ctx.lineWidth = 1.3;
  vecs.forEach((F, i) => {
    const last = i === vecs.length - 1, [tx, ty] = P.S(c.x + kf * F[0], c.y + kf * F[1]);
    ctx.strokeStyle = P.c.applied; ctx.globalAlpha = last ? 0.85 : 0.45;
    ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(tx, b); ctx.moveTo(tx, ty); ctx.lineTo(a, ty); ctx.stroke();
  });
  ctx.restore();
  const opt = { color: 'applied', width: 3, head: 10 };
  P.arrow(c.x, c.y, c.x + kf * R[0], c.y, { ...opt, label: 'Fx' });
  P.arrow(c.x, c.y, c.x, c.y + kf * R[1], { ...opt, label: 'Fy' });
}

// Carica selezionata (diversa da q₁): segmento da q₁ e angolo θ rispetto all'asse x.
function drawPolar(P) {
  const s = srcOf(B.sel), ref = refCharge();
  if (s?.type !== 'point' || !ref || s === ref) return;
  const r = Math.hypot(s.x - ref.x, s.y - ref.y), th = Math.atan2(s.y - ref.y, s.x - ref.x);
  P.line([[ref.x, ref.y], [s.x, s.y]], { color: 'handle', width: 1.5, dash: [6, 5], alpha: 0.8 });
  P.line([[ref.x, ref.y], [ref.x + Math.max(r * 0.6, 0.06), ref.y]], { color: 'muted', width: 1.2, dash: [3, 4] });
  const R = clamp(r * P.cam.scale * 0.35, 22, 60);
  P.arc(ref.x, ref.y, R, Math.min(0, th), Math.max(0, th), { color: 'handle', width: 1.8, label: `${fmt(th / deg, 0)}°`, labelR: R + 16 });
  const [mx, my] = P.S((ref.x + s.x) / 2, (ref.y + s.y) / 2), nx = -Math.sin(th), ny = -Math.cos(th);
  P.textS(mx + nx * 14, my + ny * 14, `r = ${fmt(r * 100, 1)} cm`, { size: 12, color: 'handle', align: 'center' });
}

function drawProbe(P) {
  const { x, y } = B.spec.probe, [ex, ey] = fieldAt(x, y), m = Math.hypot(ex, ey);
  if (m > 0) P.arrow(x, y, x + PROBE_LEN * ex / m, y + PROBE_LEN * ey / m, { color: 'acc', width: 3.5, label: 'E' });
  const [a, b] = P.S(x, y), ctx = P.ctx;
  ctx.save();
  ctx.strokeStyle = P.c.handle; ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.arc(a, b, 9, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(a - 14, b); ctx.lineTo(a - 5, b); ctx.moveTo(a + 5, b); ctx.lineTo(a + 14, b);
  ctx.moveTo(a, b - 14); ctx.lineTo(a, b - 5); ctx.moveTo(a, b + 5); ctx.lineTo(a, b + 14); ctx.stroke();
  ctx.restore();
  P.textS(a + 14, b + 20, `|E| = ${sciText(m)} N/C`, { size: 12, color: 'acc' });
}

/* ---------------- Numeri ---------------- */

// Notazione scientifica italiana: 452000 → "4,52·10⁵" (testo) o "4{,}52\cdot 10^{5}" (LaTeX).
function sciParts(v) {
  if (v === 0 || !Number.isFinite(v)) return [0, 0];
  const e = Math.floor(Math.log10(Math.abs(v)));
  return Math.abs(e) <= 2 ? [v, 0] : [v / 10 ** e, e];
}
const SUP = { '-': '⁻', 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' };
function sciText(v, d = 2) { const [m, e] = sciParts(v); return e ? `${fmt(m, d)}·10${String(e).split('').map(c => SUP[c]).join('')}` : fmt(m, d); }
function sciTex(v, d = 2) { const [m, e] = sciParts(v); return e ? `${tn(m, d)}\\cdot 10^{${e}}` : tn(m, d); }

// Tabella delle componenti: ogni forza con modulo, angolo, Fx e Fy; l'ultima riga è la somma (la risultante).
function compTable(list, R) {
  const n = v => fmt(v, Math.abs(v) < 0.1 ? 4 : 3), ang = F => fmt(Math.atan2(F[1], F[0]) / deg, 0) + '°';
  const rows = list.map(f => `<tr><td>${f.s.type === 'point' ? 'da ' + nameOf(f.s) : nameOf(f.s)}</td><td>${n(Math.hypot(...f.F))}</td><td>${ang(f.F)}</td><td>${n(f.F[0])}</td><td>${n(f.F[1])}</td></tr>`).join('');
  return `<table class="ftable"><tr><td></td><td>F (N)</td><td>θ</td><td>Fx (N)</td><td>Fy (N)</td></tr>${rows}`
    + `<tr class="sum"><td>Risultante</td><td>${n(Math.hypot(...R))}</td><td>${ang(R)}</td><td>${n(R[0])}</td><td>${n(R[1])}</td></tr></table>`;
}

/* ---------------- Interazione ---------------- */

function hit(wx, wy, tol) {
  const P = B.spec.probe;
  if (B.spec.show.probe && Math.hypot(wx - P.x, wy - P.y) < tol * 1.6) return { probe: true };
  for (const s of [...B.spec.sources].reverse()) {
    if (s.type === 'point' && Math.hypot(wx - s.x, wy - s.y) < radius(s.q) + tol) return { s };
  }
  for (const s of [...B.spec.sources].reverse()) {
    if (s.type !== 'point' && segDist(wx, wy, ...ends(s)) < tol * 1.2) return { s };
  }
  return null;
}

function select(id) { B.sel = id; B.api.rebuildPanel(); B.api.refresh(); }

function changed() { save(); B.api.refresh(); }

function handlesOf(s) { return s && s.type !== 'point' ? ends(s).map((p, i) => ({ i, x: p[0], y: p[1] })) : []; }

export default {
  id: 'charges',
  title: 'Cariche e campo elettrico',
  subtitle: 'Coulomb, linee di campo, barre e lastre cariche',
  panelTitle: 'Cariche',
  noSim: true,
  keepPanels: ['formulas'],
  params: [],
  graphs: [],

  mount(api) {
    B.api = api;
    B.spec ??= store.get('charges.scene', null) ?? PRESETS[1].make();
    B.spec.show.comp ??= false;
    B.tool = 'select';
  },
  unmount() { B.tool = 'select'; },

  init: () => ({ t: 0 }),
  step() {},
  done: () => true,
  sample: s => ({ t: s.t }),

  view() {
    if (!B.spec.sources.length) return { xmin: -0.5, xmax: 0.5, ymin: -0.35, ymax: 0.35 };
    const [x0, y0, x1, y1] = bounds(0.22);
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, w = Math.max(x1 - x0, 0.8), h = Math.max(y1 - y0, 0.55);
    return { xmin: cx - w / 2, xmax: cx + w / 2, ymin: cy - h / 2, ymax: cy + h / 2 };
  },

  drawBackground(ctx, cam, c) {
    ctx.fillStyle = c.bg;
    ctx.fillRect(0, 0, cam.w, cam.h);
    drawGrid(ctx, cam, c);
  },

  draw(P) {
    const show = B.spec.show;
    if (show.lines) drawFieldLines(P, fieldLines());
    if (show.E) drawFieldGrid(P);
    for (const s of B.spec.sources) if (s.type !== 'point') drawBar(P, s, s.id === B.sel);
    drawPolar(P);
    if (show.F) drawForces(P);
    for (const s of B.spec.sources) if (s.type === 'point') drawCharge(P, s, s.id === B.sel);
    for (const h of handlesOf(srcOf(B.sel))) P.sizeHandle(h.x, h.y, B.dragHandle === h.i);
    if (show.probe) drawProbe(P);
  },

  formulas() {
    const out = [], spec = B.spec, s = srcOf(B.sel);
    const kTex = `k = 8{,}99\\cdot 10^{9}\\ \\mathrm{\\tfrac{N\\,m^2}{C^2}}`;
    if (s?.type === 'point') {
      const { list, R } = forcesOn(s);
      out.push({ h: `Forze su ${nameOf(s)} = ${fmt(s.q, 1)} µC` });
      for (const f of list) {
        const F = Math.hypot(...f.F);
        if (f.s.type === 'point') {
          const r = Math.hypot(f.s.x - s.x, f.s.y - s.y);
          out.push({ tex: `F_{${pIdx(f.s)}} = k\\dfrac{|q_{${pIdx(s)}}\\,q_{${pIdx(f.s)}}|}{r^2} = ${tn(K * Math.abs(s.q * f.s.q) * MU * MU / (r * r), 3)}\\ \\mathrm{N}\\quad (r = ${tn(r * 100, 1)}\\ \\mathrm{cm},\\ ${s.q * f.s.q > 0 ? '\\text{repulsiva}' : '\\text{attrattiva}'})` });
        } else {
          out.push({ tex: `F_{\\text{${nameOf(f.s)}}} = q\\,E = ${tn(F, 3)}\\ \\mathrm{N}` });
        }
      }
      if (list.length) {
        out.push({ h: 'Componenti (proiezioni sugli assi)' });
        out.push({ tex: `F_x = F\\cos\\theta \\qquad F_y = F\\sin\\theta` });
        out.push({ html: compTable(list, R) });
        out.push({ h: 'Risultante (principio di sovrapposizione)' });
        out.push({ tex: `\\vec F = \\textstyle\\sum \\vec F_i = (${tn(R[0], 3)},\\ ${tn(R[1], 3)})\\ \\mathrm{N}` });
        out.push({ tex: `|\\vec F| = ${tn(Math.hypot(...R), 3)}\\ \\mathrm{N}\\qquad \\theta = ${tn(Math.atan2(R[1], R[0]) / deg, 0)}^\\circ` });
      }
    } else if (s) {
      out.push({ h: nameOf(s) });
      if (s.type === 'rod') out.push({ tex: `\\lambda = \\dfrac{Q}{L} = ${tn(s.Q / s.L, 2)}\\ \\mathrm{\\mu C/m}` });
      else {
        out.push({ tex: `E_{\\text{vicino al centro}} \\approx \\dfrac{\\sigma}{2\\varepsilon_0} = ${sciTex(Math.abs(s.sigma) * MU / (2 * 8.854e-12))}\\ \\mathrm{N/C}` });
        out.push({ html: '<div class="hint">Due lastre opposte formano un condensatore piano: all\'interno E = σ/ε₀, fuori quasi zero.</div>' });
      }
    }
    if (spec.show.probe) {
      const { x, y } = spec.probe, [ex, ey] = fieldAt(x, y), m = Math.hypot(ex, ey), V = potentialAt(x, y);
      out.push({ h: `Sonda in (${fmt(x * 100, 1)} ; ${fmt(y * 100, 1)}) cm` });
      out.push({ tex: `\\vec E = (${sciTex(ex)},\\ ${sciTex(ey)})\\ \\mathrm{N/C}` });
      out.push({ tex: `|\\vec E| = ${sciTex(m)}\\ \\mathrm{N/C}\\qquad \\theta = ${tn(Math.atan2(ey, ex) / deg, 0)}^\\circ` });
      if (V != null) out.push({ tex: `V = \\textstyle\\sum k\\dfrac{q_i}{r_i} = ${sciTex(V)}\\ \\mathrm{V}` });
      const pts = spec.sources.filter(o => o.type === 'point');
      if (pts.length && pts.length <= 4) {
        out.push({ h: 'Contributi delle cariche' });
        for (const o of pts) {
          const r = Math.hypot(x - o.x, y - o.y);
          out.push({ tex: `E_{${pIdx(o)}} = k\\dfrac{|q_{${pIdx(o)}}|}{r^2} = ${sciTex(K * Math.abs(o.q) * MU / (r * r))}\\ \\mathrm{N/C}\\quad (r = ${tn(r * 100, 1)}\\ \\mathrm{cm})` });
        }
      }
    }
    if (!out.length) out.push({ html: '<div class="hint">Tocca una carica per vedere le forze che agiscono su di essa, oppure attiva la sonda per misurare il campo.</div>' });
    out.push({ h: 'Costante' }, { tex: kTex });
    return out;
  },

  buildPanel(body, api) {
    body.innerHTML = '';
    const grid = el('div', 'toolgrid');
    for (const [t, ic, label] of TOOLS) {
      const b = el('button', B.tool === t ? 'on' : '', `${icons[ic]}<span>${label}</span>`);
      b.onclick = () => { B.tool = B.tool === t ? 'select' : t; api.rebuildPanel(); };
      grid.appendChild(b);
    }
    body.append(grid, el('div', 'hint', B.tool === 'select'
      ? 'Trascina cariche, barre, lastre e sonda (col dito o con la Pencil). Tocca una carica per vederne le forze e cambiarne valore e posizione.'
      : 'Tocca il foglio per aggiungere.'));

    const s = srcOf(B.sel);
    if (s) {
      body.append(el('div', 'sub', 'Selezione'), el('div', 'sel-title', `<span class="dot"></span>${nameOf(s)}`));
      for (const def of PROPS[s.type]) {
        body.appendChild(api.control({ ...def, pinLabel: `${nameOf(s)} · ${def.label}` }, () => s[def.key], v => { s[def.key] = v; changed(); }, `${s.id}.${def.key}`));
      }
      body.appendChild(el('div', 'sub', 'Posizione'));
      const ref = refCharge();
      if (s.type === 'point' && ref && ref !== s) {
        // Coordinate polari rispetto a q₁: distanza r e angolo θ dall'asse x (positivo in senso antiorario).
        const polar = () => ({ r: Math.hypot(s.x - ref.x, s.y - ref.y), th: Math.atan2(s.y - ref.y, s.x - ref.x) / deg });
        const place = (r, th) => { s.x = ref.x + r * Math.cos(th * deg); s.y = ref.y + r * Math.sin(th * deg); changed(); };
        body.appendChild(el('div', 'hint', `Rispetto a ${nameOf(ref)}: distanza r e angolo θ misurato dall'asse x.`));
        body.appendChild(api.control({ key: 'r', label: `Distanza da ${nameOf(ref)}`, pinLabel: `${nameOf(s)} · distanza da ${nameOf(ref)}`, unit: 'cm', min: 1, max: 80, step: 0.5, hardMin: 0.5 },
          () => polar().r * 100, v => place(v / 100, polar().th), `${s.id}.r`));
        body.appendChild(api.control({ key: 'th', label: 'Angolo θ', pinLabel: `${nameOf(s)} · angolo θ`, unit: '°', min: -180, max: 180, step: 1, hardMin: -360, hardMax: 360 },
          () => polar().th, v => place(polar().r, v), `${s.id}.th`));
      } else {
        for (const [k, label] of [['x', 'Posizione x'], ['y', 'Posizione y']]) {
          body.appendChild(api.control({ key: k, label, pinLabel: `${nameOf(s)} · ${k}`, unit: 'cm', min: -100, max: 100, step: 0.5, hardMin: -1000, hardMax: 1000 },
            () => s[k] * 100, v => { s[k] = v / 100; changed(); }, `${s.id}.${k}`));
        }
      }
      const row = el('div', 'btn-row'), del = el('button', 'btn danger', 'Elimina'), des = el('button', 'btn', 'Deseleziona');
      del.onclick = () => { B.spec.sources = B.spec.sources.filter(o => o !== s); B.sel = null; changed(); api.rebuildPanel(); };
      des.onclick = () => select(null);
      row.append(del, des);
      body.appendChild(row);
      return;
    }

    if (B.spec.sources.length) {
      body.appendChild(el('div', 'sub', 'In scena (tocca per modificare)'));
      const list = el('div', 'chips');
      for (const o of B.spec.sources) {
        const v = o.type === 'point' ? `${fmt(o.q, 1)} µC` : o.type === 'rod' ? `${fmt(o.Q, 1)} µC` : `${fmt(o.sigma, 1)} µC/m²`;
        const b = el('button', '', `${nameOf(o)} · ${v}`);
        b.onclick = () => select(o.id);
        list.appendChild(b);
      }
      body.appendChild(list);
    }
    body.appendChild(el('div', 'sub', 'Mostra'));
    for (const [k, label] of [['lines', 'Linee di campo'], ['E', 'Vettori del campo E'], ['F', 'Forze sulle cariche'], ['comp', 'Componenti x e y delle forze'], ['probe', 'Sonda']]) {
      body.appendChild(api.control({ key: k, type: 'toggle', label }, () => B.spec.show[k], v => { B.spec.show[k] = v; changed(); }, 'charges.show.' + k));
    }
    body.appendChild(el('div', 'sub', 'Situazioni tipiche'));
    const chips = el('div', 'chips');
    for (const p of PRESETS) {
      const b = el('button', '', p.label);
      b.onclick = () => { B.spec = p.make(); B.sel = p.sel ?? null; changed(); api.fit(); api.rebuildPanel(); };
      chips.appendChild(b);
    }
    const clear = el('button', '', 'Scena vuota');
    clear.onclick = () => { B.spec = { ...newSpec(), show: B.spec.show }; B.sel = null; changed(); api.rebuildPanel(); };
    chips.appendChild(clear);
    body.appendChild(chips);
  },

  pointerDown({ wx, wy, api }) {
    const tol = 12 / api.cam.scale, t = B.tool;
    if (t !== 'select') {
      const s = t === 'plus' ? { type: 'point', x: wx, y: wy, q: 2 }
        : t === 'minus' ? { type: 'point', x: wx, y: wy, q: -2 }
        : t === 'rod' ? { type: 'rod', x: wx, y: wy, Q: 4, L: 0.3, angle: 0 }
        : { type: 'plate', x: wx, y: wy, sigma: 5, L: 0.6, angle: 0 };
      add(B.spec, s);
      B.tool = 'select';
      select(s.id); save();
      return moveGesture(s, wx, wy);
    }
    // Estremi della barra o lastra selezionata: ne cambiano lunghezza e inclinazione.
    const sel = srcOf(B.sel);
    for (const h of handlesOf(sel)) {
      if (Math.hypot(wx - h.x, wy - h.y) < tol * 2) {
        const other = ends(sel)[1 - h.i];
        B.dragHandle = h.i;
        return {
          move: ({ wx: x, wy: y }) => {
            const dx = (x - other[0]) * (h.i ? 1 : -1), dy = (y - other[1]) * (h.i ? 1 : -1);
            sel.L = clamp(Math.round(Math.hypot(dx, dy) * 100) / 100, 0.05, 2);
            let a = Math.atan2(dy, dx) / deg;
            if (a > 90) a -= 180; if (a < -90) a += 180;
            sel.angle = Math.round(a);
            const e = ends({ ...sel, x: 0, y: 0 });
            sel.x = other[0] - e[1 - h.i][0]; sel.y = other[1] - e[1 - h.i][1];
            B.api.refresh();
          },
          up: () => { B.dragHandle = null; changed(); },
        };
      }
    }
    const h = hit(wx, wy, tol);
    if (!h) { if (B.sel) select(null); return { pan: true }; }
    if (h.probe) return moveGesture(B.spec.probe, wx, wy);
    if (B.sel !== h.s.id) select(h.s.id);
    return moveGesture(h.s, wx, wy);
  },

  cursorAt({ wx, wy, api }) { return B.tool !== 'select' ? 'crosshair' : hit(wx, wy, 12 / api.cam.scale) ? 'grab' : 'default'; },

  onKey(e) {
    if ((e.key === 'Backspace' || e.key === 'Delete') && B.sel) {
      B.spec.sources = B.spec.sources.filter(o => o.id !== B.sel); B.sel = null; changed(); B.api.rebuildPanel();
    }
  },

  theory: `
<h2>Cariche e campo elettrico</h2>
<p>La carica elettrica si misura in coulomb (C); in questa simulazione si usano i <b>microcoulomb</b>: 1 µC = 10⁻⁶ C. Cariche dello stesso segno si respingono, di segno opposto si attraggono.</p>

<h3>Legge di Coulomb</h3>
<p>Due cariche puntiformi $q_1$ e $q_2$ a distanza $r$ si scambiano una forza diretta lungo la congiungente, di modulo</p>
$$F = k\\,\\frac{|q_1\\,q_2|}{r^2} \\qquad k = \\frac{1}{4\\pi\\varepsilon_0} = 8{,}99\\cdot 10^{9}\\ \\mathrm{\\frac{N\\,m^2}{C^2}}$$
<p>Le due forze sono uguali e opposte (terza legge della dinamica). Raddoppiando la distanza la forza diventa <b>quattro volte</b> più piccola.</p>

<h3>Principio di sovrapposizione</h3>
<p>Se le cariche sono più di due, la forza su una carica è la <b>somma vettoriale</b> delle forze esercitate da ciascuna delle altre, come se le altre non ci fossero:</p>
$$\\vec F = \\vec F_1 + \\vec F_2 + \\dots$$
<p>Tocca una carica: le frecce tratteggiate sono le singole forze, quella piena è la risultante.</p>

<h3>Sommare le forze con le componenti</h3>
<p>Per sommare vettori non allineati conviene <b>proiettarli sugli assi</b>. Una forza di modulo $F$ che forma l'angolo $\\theta$ con l'asse x ha componenti</p>
$$F_x = F\\cos\\theta \\qquad F_y = F\\sin\\theta$$
<p>Le componenti si sommano come numeri (con il segno): $R_x = \\sum F_{x,i}$, $R_y = \\sum F_{y,i}$. Poi</p>
$$R = \\sqrt{R_x^2 + R_y^2} \\qquad \\tan\\theta_R = \\frac{R_y}{R_x}$$
<p>Attiva <i>Componenti x e y delle forze</i>: le linee punteggiate proiettano ogni forza sugli assi della carica selezionata e la tabella nel pannello Formule riporta $F$, $\\theta$, $F_x$ e $F_y$ di ogni forza e della risultante.</p>
<p>Selezionando una carica puoi anche fissarne la posizione rispetto a $q_1$ con la <b>distanza</b> $r$ e l'<b>angolo</b> $\\theta$: così costruisci triangoli precisi (per esempio equilateri, con angoli di 60°) come negli esercizi.</p>

<h3>Il campo elettrico</h3>
<p>Il campo in un punto è la forza che subirebbe una carica di prova positiva $q_0$, divisa per $q_0$:</p>
$$\\vec E = \\frac{\\vec F}{q_0} \\qquad [E] = \\mathrm{N/C}$$
<p>Per una carica puntiforme $E = k\\,\\dfrac{|q|}{r^2}$, uscente dalle cariche positive ed entrante in quelle negative. Anche i campi si sommano vettorialmente. Una carica $q$ posta in un campo $\\vec E$ subisce la forza $\\vec F = q\\,\\vec E$.</p>
<p>La <b>sonda</b> misura $\\vec E$ nel punto in cui la metti e mostra il contributo di ogni carica.</p>

<h3>Linee di campo</h3>
<ul>
  <li>sono tangenti al campo in ogni punto e orientate come $\\vec E$;</li>
  <li>escono dalle cariche positive ed entrano in quelle negative;</li>
  <li>il loro numero è proporzionale alla carica, e dove sono più fitte il campo è più intenso;</li>
  <li>non si incrociano mai (in ogni punto il campo ha una sola direzione).</li>
</ul>

<h3>Distribuzioni uniformi di carica</h3>
<p><b>Barra (filo) carico</b> con densità lineare $\\lambda = Q/L$: vicino a un filo molto lungo il campo è perpendicolare al filo e vale</p>
$$E = \\frac{\\lambda}{2\\pi\\varepsilon_0\\, r}$$
<p>(diminuisce come $1/r$, più lentamente di una carica puntiforme).</p>
<p><b>Lastra (piano) carica</b> con densità superficiale $\\sigma$: il campo è perpendicolare al piano e, lontano dai bordi, <b>non dipende dalla distanza</b>:</p>
$$E = \\frac{\\sigma}{2\\varepsilon_0}$$
<p><b>Condensatore piano</b>: due lastre con cariche opposte $\\pm\\sigma$. All'interno i due campi si sommano, all'esterno si annullano:</p>
$$E_{\\text{interno}} = \\frac{\\sigma}{\\varepsilon_0} \\qquad E_{\\text{esterno}} \\approx 0$$
<p>Nella simulazione si vedono anche gli <i>effetti di bordo</i>: vicino alle estremità le linee si incurvano.</p>

<h3>Il potenziale</h3>
<p>Il potenziale di una carica puntiforme è $V = k\\,q/r$ (scalare, con il segno della carica); più cariche: si sommano i potenziali. La sonda lo mostra quando non ci sono lastre (per un piano infinito non si può prendere lo zero all'infinito).</p>

<h3>Prova con la simulazione</h3>
<ol>
  <li><b>Dipolo</b>: dove è più intenso il campo? Sposta la sonda lungo l'asse e lungo la perpendicolare.</li>
  <li><b>Cariche uguali</b>: trova il punto in cui il campo è nullo. Perché lì non passa nessuna linea?</li>
  <li><b>Tre cariche</b>: la carica in alto è già selezionata. Verifica nella tabella che le componenti della risultante sono la somma delle componenti delle due forze. Poi cambia l'angolo θ (o premi ▸ per animarlo): quando la forza risultante è orizzontale?</li>
  <li><b>Condensatore</b>: sposta la sonda tra le armature: il campo cambia? E fuori?</li>
  <li>Raddoppia la distanza tra due cariche: di quanto cambia la forza?</li>
</ol>

<h3>Esercizi</h3>
<details><summary>1. Due cariche di +3 µC e −2 µC distano 15 cm. Quanto vale la forza tra loro? È attrattiva o repulsiva?</summary>
<p>$F = 8{,}99\\cdot10^9 \\cdot \\dfrac{3\\cdot10^{-6}\\cdot 2\\cdot10^{-6}}{0{,}15^2} \\approx 2{,}40$ N, attrattiva (segni opposti).</p></details>
<details><summary>2. Quanto vale il campo generato da una carica di 2 µC a 20 cm di distanza?</summary>
<p>$E = 8{,}99\\cdot10^9 \\cdot \\dfrac{2\\cdot10^{-6}}{0{,}20^2} \\approx 4{,}5\\cdot10^5$ N/C, diretto in verso uscente dalla carica.</p></details>
<details><summary>3. Due cariche di +2 µC si trovano a 30 cm l'una dall'altra. Dove è nullo il campo?</summary>
<p>Nel punto medio: i due campi hanno lo stesso modulo e versi opposti.</p></details>
<details><summary>4. Le armature di un condensatore piano hanno σ = 5 µC/m². Quanto vale il campo all'interno?</summary>
<p>$E = \\dfrac{\\sigma}{\\varepsilon_0} = \\dfrac{5\\cdot10^{-6}}{8{,}85\\cdot10^{-12}} \\approx 5{,}6\\cdot10^5$ N/C.</p></details>
`,
};

function moveGesture(o, wx0, wy0) {
  const ox = o.x, oy = o.y;
  return {
    move: ({ wx, wy }) => { o.x = snap(ox + wx - wx0); o.y = snap(oy + wy - wy0); B.api.refresh(); },
    up: () => changed(),
  };
}

const PRESETS = [
  { label: 'Carica singola', make() { const s = newSpec(); add(s, { type: 'point', x: 0, y: 0, q: 2 }); return s; } },
  { label: 'Dipolo', make() { const s = newSpec(); add(s, { type: 'point', x: -0.15, y: 0, q: 2 }); add(s, { type: 'point', x: 0.15, y: 0, q: -2 }); return s; } },
  { label: 'Cariche uguali', make() { const s = newSpec(); add(s, { type: 'point', x: -0.15, y: 0, q: 2 }); add(s, { type: 'point', x: 0.15, y: 0, q: 2 }); s.probe = { x: 0, y: 0.12 }; return s; } },
  { label: 'Tre cariche', sel: 's3', make() {
    // Triangolo: q₂ a 30 cm da q₁ lungo l'asse x, q₃ a 25 cm da q₁ a 60°. Si vedono le componenti delle forze.
    const s = newSpec(), x0 = -0.15, y0 = -0.1;
    add(s, { type: 'point', x: x0, y: y0, q: 2 }); add(s, { type: 'point', x: x0 + 0.3, y: y0, q: -2 });
    add(s, { type: 'point', x: x0 + 0.25 * Math.cos(60 * deg), y: y0 + 0.25 * Math.sin(60 * deg), q: 1 });
    s.probe = { x: 0.3, y: 0.15 }; s.show.comp = true; s.show.probe = false; return s;
  } },
  { label: 'Condensatore piano', make() { const s = newSpec(); add(s, { type: 'plate', x: 0, y: 0.07, sigma: 5, L: 1.4, angle: 0 }); add(s, { type: 'plate', x: 0, y: -0.07, sigma: -5, L: 1.4, angle: 0 }); s.probe = { x: 0.05, y: 0 }; s.show.F = false; return s; } },
  { label: 'Barra e carica', make() { const s = newSpec(); add(s, { type: 'rod', x: 0, y: -0.1, Q: 6, L: 0.5, angle: 0 }); add(s, { type: 'point', x: 0, y: 0.15, q: -1 }); s.probe = { x: 0.32, y: 0.05 }; return s; } },
];
