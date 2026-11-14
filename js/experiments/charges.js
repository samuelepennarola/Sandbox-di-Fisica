import { clamp, fmt, tn, deg } from '../core/math.js';
import { icons } from '../core/icons.js';
import { store } from '../core/store.js';
import { el } from '../core/ui.js';
import { Painter, dragGuides, alignTo } from '../core/render.js';
import { SceneHistory } from '../core/history.js';
import { K, MU, pointField, drawFieldGrid } from '../core/electric.js';
import { palette, mixHex, drawPlaneGrid, drawPlaneAxes, drawFieldLinesM, chargeDisk, arrowS, tex, texWidth, sciTeX } from '../core/manim.js';
import { rate } from '../core/anim.js';

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
const save = () => { store.set('charges.scene', B.spec); B.hist?.record(); };

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
const snap = v => +(Math.round(v * 200) / 200).toFixed(4);                                          // posizioni a passi di mezzo centimetro
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

/* ---------------- Transizioni (regia alla Manim) ---------------- */
// Orologio delle animazioni, fatto avanzare da draw(). Nelle istantanee della Lavagna (A.still) tutto è subito
// al suo stato finale. La fisica non c'entra: qui si anima solo come le cose compaiono e cambiano sullo schermo.
const A = { M: null, now: 0, dt: 0, last: 0, still: false, vals: new Map(), born: new Map(), on: {}, sig: null, linesT0: -1e9 };
const TAU = 0.09;   // tempo di risposta (s) dei valori mostrati che inseguono quelli veri

// Valore mostrato che insegue il valore vero: un vettore che cambia verso si ritira e ricresce dall'altra parte.
function smooth(key, target, tau = TAU) {
  const v = A.vals.get(key);
  if (!v || A.still || B.drag || v.length !== target.length) { A.vals.set(key, target.slice()); return target; }
  const k = 1 - Math.exp(-A.dt / tau);
  for (let i = 0; i < v.length; i++) v[i] += (target[i] - v[i]) * k;
  return v;
}
// Fattore di scala di un oggetto appena comparso (rimbalzo di 0,45 s).
function born(id) {
  if (A.still) return 1;
  if (!A.born.has(id)) A.born.set(id, A.now);
  return rate.backOut(Math.min(1, (A.now - A.born.get(id)) / 0.45));
}
// Avanzamento (0 → 1 in 0,6 s) di un elemento che si accende: forze, componenti, sonda.
A.p = key => (A.still ? 1 : A.on[key] == null ? 0 : Math.min(1, (A.now - A.on[key]) / 0.6));

// Linee di campo alla Manim (kit condiviso): colore in base all'intensità e, quando cambiano le sorgenti
// (numero o segno) o si accendono, si tracciano una dopo l'altra (Create).
function drawLinesM(P, lines) {
  const lag = Math.min(0.05, 0.6 / Math.max(1, lines.length));
  drawFieldLinesM(P, lines, A.M, { mag: (x, y) => Math.hypot(...fieldAt(x, y)), lo: 1e4, hi: 3e6,
    progress: i => (A.still ? 1 : Math.min(1, Math.max(0, (A.now - A.linesT0 - i * lag) / 0.8))) });
}

/* ---------------- Disegno ---------------- */

// Carica alla Manim: disco pieno con un alone morbido e il segno in bianco. Il colore sfuma quando cambia il segno,
// e appena creata la carica "sboccia" con un piccolo rimbalzo.
function drawCharge(P, s, selected) {
  const M = A.M, [a, b] = P.S(s.x, s.y);
  const hue = smooth('hue:' + s.id, [s.q >= 0 ? 1 : 0], 0.16)[0];
  const r = Math.max(10, radius(s.q) * P.cam.scale) * born(s.id);
  if (r <= 0.5) return;
  chargeDisk(P.ctx, a, b, r, hue, M, selected);
  tex(P, a, b + r + 16, `${nameOf(s)} = ${fmt(s.q, 1)}\\ \\mathrm{µC}`, { size: 16, color: M.text, halo: M.bg });
}

function drawBar(P, s, selected) {
  const [E0, E1] = ends(s), ctx = P.ctx, [a1, b1] = P.S(...E0), [a2, b2] = P.S(...E1);
  const value = s.type === 'rod' ? s.Q : s.sigma, posC = value >= 0, M = A.M, col = posC ? M.pos : M.neg;
  const w = s.type === 'rod' ? 12 : 7;
  ctx.save();
  ctx.lineCap = 'round';
  if (selected) { ctx.strokeStyle = M.sel; ctx.lineWidth = w + 8; ctx.globalAlpha = 0.45; ctx.beginPath(); ctx.moveTo(a1, b1); ctx.lineTo(a2, b2); ctx.stroke(); ctx.globalAlpha = 1; }
  ctx.strokeStyle = s.type === 'rod' ? col : mixHex(col, M.bg, 0.35); ctx.lineWidth = w;
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
  const label = s.type === 'rod' ? `Q = ${fmt(value, 1)}\\ \\mathrm{µC}` : `\\sigma = ${fmt(value, 1)}\\ \\mathrm{µC/m}^{2}`;
  tex(P, (a1 + a2) / 2 - uy * 22, (b1 + b2) / 2 + ux * 22, label, { size: 15, color: M.text, halo: M.bg });
}

function drawFieldVectors(P) {
  drawFieldGrid(P, fieldAt, (x, y) => B.spec.sources.some(s => s.type === 'point' ? Math.hypot(x - s.x, y - s.y) < radius(s.q) * 1.6 : segDist(x, y, ...ends(s)) < 0.02));
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
  // Le frecce partono dal bordo della sfera e restano sotto metà della distanza: due cariche che si attraggono
  // non hanno più le frecce (e le etichette) sovrapposte a metà strada.
  const kf = clamp(0.3 * (Number.isFinite(dmin) ? dmin : 0.3), 0.06, 0.25) / maxF;
  const M = A.M, grow = rate.smooth(A.p('F'));
  // Freccia di una forza: parte dal bordo della sfera; il vettore mostrato insegue quello vero (transizione).
  const fromEdge = (c, F, key, color, opts, label) => {
    const [dx, dy] = smooth(key, [kf * F[0], kf * F[1]]), m = Math.hypot(dx, dy);
    if (!m) return;
    const r = Math.max(10, radius(c.q) * P.cam.scale) / P.cam.scale, ux = dx / m, uy = dy / m;
    const [a, b] = P.S(c.x + ux * r, c.y + uy * r), [e, f] = P.S(c.x + ux * r + dx, c.y + uy * r + dy);
    const tip = arrowS(P.ctx, a, b, e, f, color, { grow, halo: M.bg, ...opts });
    // Etichetta a lato dell'asta, dalla parte "di sopra" dello schermo: due forze opposte sulla stessa retta
    // non si sovrappongono più a metà strada.
    if (tip && label && tip.len > 16) {
      let nx = -tip.uy, ny = tip.ux;
      if (ny > 0 || (Math.abs(ny) < 1e-3 && nx < 0)) { nx = -nx; ny = -ny; }
      const t = Math.max(0.55, 1 - 14 / tip.len), mx = a + (tip.x - a) * t, my = b + (tip.y - b) * t;
      tex(P, mx + nx * 17, my + ny * 17, label, { size: 18, color, halo: M.bg, alpha: grow });
    }
  };
  for (const d of data) {
    // Con una sola altra sorgente la forza singola coincide con la risultante: basta una freccia.
    if (focus && d.list.length > 1) for (const f of d.list) {
      fromEdge(d.c, f.F, `F:${d.c.id}:${f.s.id}`, mixHex(M.force, M.bg, 0.35), { width: 2 }, f.s.type === 'point' ? `\\vec F_{${pIdx(f.s)}${pIdx(d.c)}}` : '');
    }
    fromEdge(d.c, d.R, `F:${d.c.id}`, M.force, { width: 3.2 }, focus ? `\\vec F_{\\mathrm{ris}}` : `\\vec F_{${pIdx(d.c)}}`);
  }
  if (B.spec.show.comp) {
    for (const d of data) drawComponents(P, d, kf, !!focus);
  }
}

// Proiezioni sugli assi x e y: assi locali tratteggiati per la carica, linee di proiezione dalle punte dei vettori
// e frecce delle componenti della risultante (Fx, Fy), che crescono quando si accendono.
function drawComponents(P, d, kf, detail) {
  const { c } = d, ctx = P.ctx, M = A.M, [a, b] = P.S(c.x, c.y), g = rate.smooth(A.p('comp'));
  const R = smooth(`F:${c.id}`, [kf * d.R[0], kf * d.R[1]]).map(v => v / kf);
  const vecs = [...(detail ? d.list.map(f => f.F) : []), R];
  let ext = 40;
  for (const F of vecs) ext = Math.max(ext, Math.abs(kf * F[0]) * P.cam.scale + 24, Math.abs(kf * F[1]) * P.cam.scale + 24);
  ctx.save();
  ctx.globalAlpha = g;
  ctx.strokeStyle = M.muted; ctx.lineWidth = 1.1; ctx.setLineDash([4, 4]);
  ctx.beginPath(); ctx.moveTo(a - ext * g, b); ctx.lineTo(a + ext * g, b); ctx.moveTo(a, b - ext * g); ctx.lineTo(a, b + ext * g); ctx.stroke();
  // Linee di proiezione: dalla punta di ogni vettore, perpendicolari agli assi.
  ctx.setLineDash([2, 4]); ctx.lineWidth = 1.2;
  vecs.forEach((F, i) => {
    const last = i === vecs.length - 1, [tx, ty] = P.S(c.x + kf * F[0], c.y + kf * F[1]);
    ctx.strokeStyle = M.force; ctx.globalAlpha = g * (last ? 0.75 : 0.4);
    ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(tx, ty + (b - ty) * g); ctx.moveTo(tx, ty); ctx.lineTo(tx + (a - tx) * g, ty); ctx.stroke();
  });
  ctx.restore();
  if (g > 0.05) {
    tex(P, a + ext * g + 9, b, 'x', { size: 15, color: M.muted, align: 'left', halo: M.bg, alpha: g });
    tex(P, a, b - ext * g - 10, 'y', { size: 15, color: M.muted, halo: M.bg, alpha: g });
  }
  const [ex] = P.S(c.x + kf * R[0], c.y), [, ey] = P.S(c.x, c.y + kf * R[1]), n = pIdx(c);
  const tx = arrowS(ctx, a, b, ex, b, M.fx, { width: 2.6, tip: 11, grow: g, halo: M.bg });
  const ty = arrowS(ctx, a, b, a, ey, M.fy, { width: 2.6, tip: 11, grow: g, halo: M.bg });
  if (tx && tx.len > 14) tex(P, tx.x + tx.ux * 22, b + 14, `F_{${n}x}`, { size: 15, color: M.fx, halo: M.bg, alpha: g });
  if (ty && ty.len > 14) tex(P, a - 22, ty.y + ty.uy * 14, `F_{${n}y}`, { size: 15, color: M.fy, halo: M.bg, alpha: g });
}

// Carica selezionata (diversa da q₁): segmento da q₁ e angolo θ rispetto all'asse x.
function drawPolar(P) {
  const s = srcOf(B.sel), ref = refCharge();
  if (s?.type !== 'point' || !ref || s === ref) return;
  const r = Math.hypot(s.x - ref.x, s.y - ref.y), th = Math.atan2(s.y - ref.y, s.x - ref.x);
  P.line([[ref.x, ref.y], [s.x, s.y]], { color: 'handle', width: 1.5, dash: [6, 5], alpha: 0.8 });
  P.line([[ref.x, ref.y], [ref.x + Math.max(r * 0.6, 0.06), ref.y]], { color: 'muted', width: 1.2, dash: [3, 4] });
  const R = clamp(r * P.cam.scale * 0.35, 22, 60);
  P.arc(ref.x, ref.y, R, Math.min(0, th), Math.max(0, th), { color: 'handle', width: 1.6 });
  { const m = th / 2, [ra, rb] = P.S(ref.x, ref.y); tex(P, ra + Math.cos(m) * (R + 18), rb - Math.sin(m) * (R + 18), `\\theta = ${fmt(th / deg, 0)}°`, { size: 15, color: A.M.sel, halo: A.M.bg }); }
  const [mx, my] = P.S((ref.x + s.x) / 2, (ref.y + s.y) / 2), nx = -Math.sin(th), ny = -Math.cos(th);
  tex(P, mx + nx * 16, my + ny * 16, `r = ${fmt(r * 100, 1)}\\ \\mathrm{cm}`, { size: 15, color: A.M.sel, halo: A.M.bg });
}

function drawProbe(P) {
  const { x, y } = B.spec.probe, [ex, ey] = fieldAt(x, y), m = Math.hypot(ex, ey), M = A.M, g = rate.smooth(A.p('probe'));
  const [a, b] = P.S(x, y), ctx = P.ctx;
  if (m > 0) {
    const [ux, uy] = smooth('E', [ex / m, ey / m]), L = PROBE_LEN * P.cam.scale;
    arrowS(ctx, a, b, a + ux * L, b - uy * L, M.field, { width: 3, grow: g, halo: M.bg });
  }
  ctx.save();
  ctx.globalAlpha = Math.min(1, g * 2); ctx.strokeStyle = M.field; ctx.lineWidth = 1.8;
  ctx.beginPath(); ctx.arc(a, b, 8, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(a - 13, b); ctx.lineTo(a - 4, b); ctx.moveTo(a + 4, b); ctx.lineTo(a + 13, b);
  ctx.moveTo(a, b - 13); ctx.lineTo(a, b - 4); ctx.moveTo(a, b + 4); ctx.lineTo(a, b + 13); ctx.stroke();
  ctx.restore();
  // L'etichetta sta dalla parte opposta alla freccia, per non coprirla. Il valore scorre fino a quello vero.
  const shown = smooth('Emag', [m])[0], lx = m > 0 ? -ex / m : 0, ly = m > 0 ? ey / m : 1;
  const label = `|\\vec E| = ${sciTeX(shown)}\\ \\mathrm{N/C}`, w = texWidth(P, label, 16);
  const align = lx > 0.3 ? 'left' : lx < -0.3 ? 'right' : 'center';
  // Resta dentro l'area libera (non sotto l'ispettore o la barra a sinistra).
  const pad = P.cam.padFn?.() ?? { left: 10, right: 10 }, x0 = pad.left + 6, x1 = P.cam.w - pad.right - 6;
  let lxS = a + lx * 24, left = align === 'left' ? lxS : align === 'right' ? lxS - w : lxS - w / 2;
  left = Math.min(Math.max(left, x0), x1 - w);
  tex(P, left, b + ly * 24 + (Math.abs(ly) > 0.5 ? Math.sign(ly) * 6 : 0), label, { size: 16, color: M.field, halo: M.bg, align: 'left', alpha: g });
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
  axes: true,
  noSim: true,
  keepPanels: ['formulas'],
  params: [],
  graphs: [],

  mount(api) {
    B.api = api;
    B.spec ??= store.get('charges.scene', null) ?? PRESETS[1].make();
    B.spec.show.comp ??= false;
    B.hist ??= new SceneHistory(() => B.spec, sc => {
      B.spec = sc; B.sel = null; B.tool = 'select';
      store.set('charges.scene', sc);
      B.api.rebuildPanel(); B.api.refresh();
    }, () => B.api.recordChange());
    B.tool = 'select';
  },
  unmount() { B.tool = 'select'; },
  get history() { return B.hist; },

  selectionBar() {
    const s = srcOf(B.sel);
    if (!s || B.drag || B.tool !== 'select') return null;
    const top = s.type === 'point' ? s.y + radius(s.q) : Math.max(...ends(s).map(p => p[1]));
    const key = s.type === 'point' ? 'q' : s.type === 'rod' ? 'Q' : 'sigma';
    return {
      key: s.id, x: s.x, y: top,
      actions: [
        { label: 'Duplica', run: () => { const c = add(B.spec, { ...structuredClone(s), x: snap(s.x + 0.1) }); select(c.id); save(); } },
        { label: '± Segno', run: () => { s[key] = -s[key]; changed(); B.api.rebuildPanel(); } },
        { label: 'Elimina', danger: true, run: () => { B.spec.sources = B.spec.sources.filter(o => o !== s); B.sel = null; changed(); B.api.rebuildPanel(); } },
      ],
    };
  },

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
    A.M = palette(c);
    ctx.fillStyle = A.M.bg;
    ctx.fillRect(0, 0, cam.w, cam.h);
    drawPlaneGrid(ctx, cam, A.M);
  },

  draw(P0, s, p, ui) {
    const now = performance.now() / 1000;
    A.dt = Math.min(0.1, now - (A.last || now)); A.last = A.now = now;
    A.still = !!ui?.snapshot;
    const M = A.M = palette(P0.c);
    // Painter con i colori del kit Manim (aloni del colore di fondo, maniglie e guide nel blu di Manim).
    const P = new Painter(P0.ctx, P0.cam, { ...P0.c, bg: M.bg, text: M.text, muted: M.muted, handle: M.sel, acc: M.field });
    if (A.still) { P.arrow = P0.arrow; P.handle = P0.handle; P.sizeHandle = P0.sizeHandle; }
    const show = B.spec.show;
    for (const k of ['F', 'comp', 'probe']) { if (!show[k]) A.on[k] = null; else if (A.on[k] == null) A.on[k] = now; }
    // Le linee si ridisegnano quando cambiano il numero o il segno delle sorgenti, o quando si accendono.
    const sig = show.lines + '|' + B.spec.sources.map(o => o.id + (Math.sign(o.type === 'point' ? o.q : o.type === 'rod' ? o.Q : o.sigma))).join(',');
    if (sig !== A.sig) { A.sig = sig; A.linesT0 = now; }
    if (!ui?.snapshot) drawPlaneAxes(P, M, { unit: 'cm', k: 100 });
    if (show.lines) drawLinesM(P, fieldLines());
    if (show.E) drawFieldVectors(P);
    for (const s of B.spec.sources) if (s.type !== 'point') drawBar(P, s, s.id === B.sel);
    drawPolar(P);
    if (show.F && !A.still) drawForces(P);
    for (const s of B.spec.sources) if (s.type === 'point') drawCharge(P, s, s.id === B.sel);
    for (const h of handlesOf(srcOf(B.sel))) P.sizeHandle(h.x, h.y, B.dragHandle === h.i);
    if (show.probe && !A.still) drawProbe(P);
    if (B.drag) dragGuides(P, { x: B.drag.o.x, y: B.drag.o.y, vx: B.drag.vx, hy: B.drag.hy, text: `x = ${fmt(B.drag.o.x * 100, 1)} cm · y = ${fmt(B.drag.o.y * 100, 1)} cm` });
  },

  // Valore di una puntina dalla scena corrente (vedi pinValue in main.js).
  pinInfo(key) {
    if (!B.spec || key.startsWith('charges.')) return undefined;
    const i = key.lastIndexOf('.'), s = srcOf(key.slice(0, i)), prop = key.slice(i + 1);
    if (!s) return null;
    const ref = refCharge();
    let value = s[prop];
    if (prop === 'r' || prop === 'th') {
      if (!ref || ref === s) return null;
      value = prop === 'r' ? Math.hypot(s.x - ref.x, s.y - ref.y) * 100 : Math.atan2(s.y - ref.y, s.x - ref.x) / deg;
    } else if (prop === 'x' || prop === 'y') value = s[prop] * 100;
    return value == null ? null : { value, name: nameOf(s) };
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
    api.setRail([{ title: 'Sorgenti', items: TOOLS }], B.tool, (t, force) => { B.tool = !force && B.tool === t && t !== 'select' ? 'select' : t; api.rebuildPanel(); });
    if (B.tool !== 'select') body.appendChild(el('div', 'hint', 'Tocca la scena per aggiungere.'));

    const s = srcOf(B.sel);
    if (s) {
      body.append(el('div', 'sel-title', `<span class="dot"></span>${nameOf(s)}`));
      for (const def of PROPS[s.type]) {
        body.appendChild(api.control({ ...def, pinLabel: `${nameOf(s)} · ${def.label}` }, () => s[def.key], v => { s[def.key] = v; changed(); }, `${s.id}.${def.key}`));
      }
      const posBox = api.section(body, 'Posizione', 'c.pos', true);
      const ref = refCharge();
      if (s.type === 'point' && ref && ref !== s) {
        // Coordinate polari rispetto a q₁: distanza r e angolo θ dall'asse x (positivo in senso antiorario).
        const polar = () => ({ r: Math.hypot(s.x - ref.x, s.y - ref.y), th: Math.atan2(s.y - ref.y, s.x - ref.x) / deg });
        const place = (r, th) => { s.x = ref.x + r * Math.cos(th * deg); s.y = ref.y + r * Math.sin(th * deg); changed(); };
        posBox.appendChild(el('div', 'hint', `Rispetto a ${nameOf(ref)}: distanza r e angolo θ misurato dall'asse x.`));
        posBox.appendChild(api.control({ key: 'r', label: `Distanza da ${nameOf(ref)}`, pinLabel: `${nameOf(s)} · distanza da ${nameOf(ref)}`, unit: 'cm', min: 1, max: 80, step: 0.5, hardMin: 0.5 },
          () => polar().r * 100, v => place(v / 100, polar().th), `${s.id}.r`));
        posBox.appendChild(api.control({ key: 'th', label: 'Angolo θ', pinLabel: `${nameOf(s)} · angolo θ`, unit: '°', min: -180, max: 180, step: 1, hardMin: -360, hardMax: 360 },
          () => polar().th, v => place(polar().r, v), `${s.id}.th`));
      } else {
        for (const [k, label] of [['x', 'Posizione x'], ['y', 'Posizione y']]) {
          posBox.appendChild(api.control({ key: k, label, pinLabel: `${nameOf(s)} · ${k}`, unit: 'cm', min: -100, max: 100, step: 0.5, hardMin: -1000, hardMax: 1000 },
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

    if (B.tool === 'select') body.appendChild(el('div', 'hint', 'Aggiungi cariche dalla barra a sinistra; trascinale col dito o con la Pencil. Toccane una per vederne forze, valore e posizione.'));
    const top = el('div', 'btn-row scene-actions');
    const wipe = el('button', 'btn danger', 'Svuota la scena');
    wipe.disabled = !B.spec.sources.length;
    wipe.onclick = () => { B.spec = { ...newSpec(), show: B.spec.show }; B.sel = null; changed(); api.rebuildPanel(); };
    const fitB = el('button', 'btn', 'Inquadra');
    fitB.onclick = () => api.fit();
    top.append(wipe, fitB);
    body.appendChild(top);
    if (B.spec.sources.length) {
      const inScene = api.section(body, 'In scena', 'c.list', true);
      const list = el('div', 'chips');
      for (const o of B.spec.sources) {
        const v = o.type === 'point' ? `${fmt(o.q, 1)} µC` : o.type === 'rod' ? `${fmt(o.Q, 1)} µC` : `${fmt(o.sigma, 1)} µC/m²`;
        const b = el('button', '', `${nameOf(o)} · ${v}`);
        b.onclick = () => select(o.id);
        list.appendChild(b);
      }
      inScene.appendChild(list);
    }
    const showBox = api.section(body, 'Mostra', 'c.show', true);
    for (const [k, label] of [['lines', 'Linee di campo'], ['E', 'Vettori del campo E'], ['F', 'Forze sulle cariche'], ['comp', 'Componenti x e y delle forze'], ['probe', 'Sonda']]) {
      showBox.appendChild(api.control({ key: k, type: 'toggle', label }, () => B.spec.show[k], v => { B.spec.show[k] = v; changed(); }, 'charges.show.' + k));
    }
    const presets = api.section(body, 'Situazioni tipiche', 'c.presets', true);
    const chips = el('div', 'chips');
    for (const p of PRESETS) {
      const b = el('button', '', p.label);
      b.onclick = () => { B.spec = p.make(); B.sel = p.sel ?? null; changed(); api.fit(); api.rebuildPanel(); };
      chips.appendChild(b);
    }
    presets.appendChild(chips);
  },

  pointerDown({ wx, wy, api }) {
    const tol = 12 / api.cam.scale, t = B.tool;
    if (t !== 'select') {
      wx = snap(wx); wy = snap(wy);
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
  const others = [[0, 0], ...B.spec.sources.filter(p => p !== o).map(p => [p.x, p.y]), ...(o === B.spec.probe ? [] : [[B.spec.probe.x, B.spec.probe.y]])];
  return {
    move: ({ wx, wy }) => {
      // Mezzo centimetro di griglia, più l'aggancio agli allineamenti con le altre cariche (linee guida).
      const al = alignTo(ox + wx - wx0, oy + wy - wy0, others, 10 / B.api.cam.scale);
      o.x = al.vx ?? snap(al.x); o.y = al.hy ?? snap(al.y);
      B.drag = { o, vx: al.vx, hy: al.hy };
      B.api.refresh();
    },
    up: () => { B.drag = null; changed(); },
    cancel: () => { B.drag = null; },
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
