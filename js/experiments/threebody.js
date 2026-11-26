import { tn, clamp } from '../core/math.js';
import { tex } from '../core/manim.js';
import { uq } from '../core/units.js';
import { Stage, arrowPx, arrowMag, symVal } from '../core/annot.js';
import { scaleOf, scaleParam, planet, star } from '../core/grav.js';

// Il problema dei tre corpi: tre masse che si attraggono a vicenda. Nessuna formula chiusa: solo il calcolo passo
// passo, con il passo che si accorcia negli incontri ravvicinati. Unità a scelta (sistema solare o G = 1).
const stage = new Stage();
const EPS = 1e-3;
const VA = { min: 30, max: 100 };
const COLORS = ['blue', 'red', 'green'], KEYS = ['vel', 'weight', 'normal'];
let SC = 50;

const bodiesOf = p => [0, 1, 2].map(i => ({ i, m: p['m' + (i + 1)], x: p['x' + (i + 1)], y: p['y' + (i + 1)], vx: p['vx' + (i + 1)], vy: p['vy' + (i + 1)] }));
const vref = p => Math.max(...bodiesOf(p).map(b => Math.hypot(b.vx, b.vy)), 1e-6) * 1.2;
const rad = (m, M) => 0.03 + 0.07 * Math.cbrt(m / M);

// Accelerazioni di tutti i corpi (stato piatto: x, y, vx, vy per ognuno) in un buffer preallocato.
const _rk = { tmp: new Float64Array(12), k1: new Float64Array(12), k2: new Float64Array(12), k3: new Float64Array(12), k4: new Float64Array(12) };
function derivInto(st, ms, G, out) {
  const n = ms.length;
  out.fill(0);
  for (let i = 0; i < n; i++) { out[4 * i] = st[4 * i + 2]; out[4 * i + 1] = st[4 * i + 3]; }
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
    const dx = st[4 * j] - st[4 * i], dy = st[4 * j + 1] - st[4 * i + 1], r2 = dx * dx + dy * dy + EPS * EPS, r3 = r2 * Math.sqrt(r2);
    out[4 * i + 2] += G * ms[j] * dx / r3; out[4 * i + 3] += G * ms[j] * dy / r3;
    out[4 * j + 2] -= G * ms[i] * dx / r3; out[4 * j + 3] -= G * ms[i] * dy / r3;
  }
}

const PRESET = (label, scale, b, extra = {}) => ({
  label, values: { scale, ...extra, ...Object.fromEntries(b.flatMap((q, i) => [['m' + (i + 1), q[0]], ['x' + (i + 1), q[1]], ['y' + (i + 1), q[2]], ['vx' + (i + 1), q[3]], ['vy' + (i + 1), q[4]]])) },
});
// Figura a otto (Chenciner e Montgomery, 2000): tre masse uguali si inseguono lungo la stessa curva.
const v3 = [-0.93240737, -0.86473146];
const EIGHT = PRESET('Figura a otto', 'simple', [[1, -0.97000436, 0.24308753, -v3[0] / 2, -v3[1] / 2], [1, 0.97000436, -0.24308753, -v3[0] / 2, -v3[1] / 2], [1, 0, 0, v3[0], v3[1]]]);
// Triangolo di Lagrange: tre masse uguali ai vertici di un triangolo equilatero che ruota rigidamente.
const LW = Math.sqrt(3 / Math.pow(Math.sqrt(3), 3)), LAG = [90, 210, 330].map(a => [1, Math.cos(a * Math.PI / 180), Math.sin(a * Math.PI / 180), -LW * Math.sin(a * Math.PI / 180), LW * Math.cos(a * Math.PI / 180)]);

export default {
  id: 'threebody',
  title: 'Il problema dei tre corpi',
  subtitle: 'Orbite periodiche, Lagrange e caos',
  timeUnit: p => scaleOf(p).T,
  // Il tempo scorre in proporzione al tempo caratteristico del sistema (un "giro" del corpo più lontano dal centro
  // di massa dura circa otto secondi): né frenetico né lentissimo, qualunque siano masse e distanze.
  timeScale(s, p) {
    const bs = bodiesOf(p).filter(b => b.m > 0), Mt = bs.reduce((a, b) => a + b.m, 0);
    if (!(Mt > 0)) return 1;
    const cx = bs.reduce((a, b) => a + b.m * b.x, 0) / Mt, cy = bs.reduce((a, b) => a + b.m * b.y, 0) / Mt;
    const R = Math.max(...bs.map(b => Math.hypot(b.x - cx, b.y - cy)), 1e-3);
    return Math.min(500, Math.max(1e-3, 2 * Math.PI * Math.sqrt(R ** 3 / (scaleOf(p).G * Mt)) / 8));
  },
  axes: true,

  params: [
    scaleParam('simple'),
    { key: 'm1', label: 'Massa 1', unit: '', min: 0, max: 1000, step: 0.001, value: 1 },
    { key: 'm2', label: 'Massa 2', unit: '', min: 0, max: 1000, step: 0.001, value: 1 },
    { key: 'm3', label: 'Massa 3', unit: '', min: 0, max: 1000, step: 0.001, value: 1 },
    { key: 'tMax', label: 'Durata della simulazione', unit: '', min: 5, max: 2000, step: 5, value: 60 },
    ...[1, 2, 3].flatMap(i => ['x', 'y', 'vx', 'vy'].map(k => ({ key: k + i, label: k + i, unit: '', min: -50, max: 50, step: 0.0001, value: EIGHT.values[k + i], hidden: true }))),
    { key: 'showTrails', type: 'toggle', label: 'Scie', value: true, live: true },
    { key: 'showCM', type: 'toggle', label: 'Centro di massa', value: true, live: true },
  ],

  presets: [
    EIGHT,
    PRESET('Triangolo di Lagrange', 'simple', LAG),
    PRESET('Stella doppia e pianeta', 'simple', [[10, -1, 0, 0, -1.58], [10, 1, 0, 0, 1.58], [0.01, 0, 8, -1.58, 0]]),
    PRESET('Problema pitagorico (caos)', 'simple', [[3, 1, 3, 0, 0], [4, -2, -1, 0, 0], [5, 1, -1, 0, 0]]),
    PRESET('Sole, Giove e un asteroide troiano', 'solar', [[1, 0, 0, 0, 0], [0.001, 5.2, 0, 0, 2.755], [1e-9, 2.6, 4.503, -2.386, 1.3775]], { tMax: 120 }),
    PRESET('Sole, Terra e Luna (unità semplici)', 'simple', [[100, 0, 0, 0, 0], [1, 5, 0, 0, 4.472], [0.01, 5.35, 0, 0, 6.162]]),
  ],

  view(p) {
    const bs = bodiesOf(p).filter(b => b.m > 0), R = Math.max(...bs.map(b => Math.hypot(b.x, b.y)), 1) * 1.6;
    return { xmin: -R, xmax: R, ymin: -R, ymax: R };
  },

  init(p) {
    const bs = bodiesOf(p);
    return { t: 0, st: bs.flatMap(b => [b.x, b.y, b.vx, b.vy]), trails: bs.map(b => [[b.x, b.y]]), tEnd: p.tMax };
  },

  snapshot(s) { return { t: s.t, st: s.st.slice(), n: s.trails.map(t => t.length), tEnd: s.tEnd }; },
  stateAt(sim, snap) { return { t: snap.t, st: snap.st, trails: sim.trails.map((t, i) => t.slice(0, snap.n[i])), tEnd: snap.tEnd }; },
  resumeFrom(sim, snap) { sim.t = snap.t; sim.st = snap.st.slice(); sim.trails.forEach((t, i) => { t.length = snap.n[i]; }); },

  step(s, dt, p) {
    const ms = [p.m1, p.m2, p.m3], G = scaleOf(p).G, n = ms.length, len = s.st.length;
    const { tmp, k1, k2, k3, k4 } = _rk;
    const MAX_SUB = 160;
    let left = dt, sub = 0;
    while (left > 1e-12 && sub++ < MAX_SUB) {
      // Passo adattivo: proporzionale al tempo caratteristico dell'incontro più stretto.
      let tmin = Infinity;
      for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
        if (!(ms[i] + ms[j] > 0)) continue;
        const dx = s.st[4 * j] - s.st[4 * i], dy = s.st[4 * j + 1] - s.st[4 * i + 1], r = Math.hypot(dx, dy) + EPS;
        tmin = Math.min(tmin, Math.sqrt(r * r * r / (G * (ms[i] + ms[j]))));
      }
      const h = Math.min(left, Math.max(1e-6, 0.01 * tmin)), h2 = h / 2, h6 = h / 6;
      const y = s.st;
      derivInto(y, ms, G, k1);
      for (let i = 0; i < len; i++) tmp[i] = y[i] + h2 * k1[i];
      derivInto(tmp, ms, G, k2);
      for (let i = 0; i < len; i++) tmp[i] = y[i] + h2 * k2[i];
      derivInto(tmp, ms, G, k3);
      for (let i = 0; i < len; i++) tmp[i] = y[i] + h * k3[i];
      derivInto(tmp, ms, G, k4);
      for (let i = 0; i < len; i++) y[i] = y[i] + h6 * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]);
      s.t += h; left -= h;
    }
    for (let i = 0; i < n; i++) {
      const tr = s.trails[i], last = tr[tr.length - 1], x = s.st[4 * i], yy = s.st[4 * i + 1];
      if (Math.hypot(x - last[0], yy - last[1]) > 0.01) tr.push([x, yy]);
    }
  },

  done: s => s.t >= s.tEnd,

  sample(s, p) {
    const ms = bodiesOf(p).map(b => b.m), G = scaleOf(p).G, st = s.st;
    let K = 0, U = 0, L = 0;
    for (let i = 0; i < 3; i++) {
      K += 0.5 * ms[i] * (st[4 * i + 2] ** 2 + st[4 * i + 3] ** 2);
      L += ms[i] * (st[4 * i] * st[4 * i + 3] - st[4 * i + 1] * st[4 * i + 2]);
      for (let j = i + 1; j < 3; j++) U -= G * ms[i] * ms[j] / (Math.hypot(st[4 * j] - st[4 * i], st[4 * j + 1] - st[4 * i + 1]) + EPS);
    }
    return { t: s.t, K, U, E: K + U, L };
  },

  graphs: [
    { title: 'Energia', series: [{ key: 'K', label: 'K', color: 'vel' }, { key: 'U', label: 'U', color: 'normal' }, { key: 'E', label: 'E totale', color: 'friction' }] },
    { title: 'Momento angolare totale', series: [{ key: 'L', label: 'L', color: 'friction' }] },
  ],

  handles(s, p) {
    const out = [], vr = vref(p);
    for (const b of bodiesOf(p)) {
      if (b.m <= 0) continue;
      out.push({ id: 'p' + b.i, x: b.x, y: b.y });
      const v = Math.hypot(b.vx, b.vy), L = Math.max(arrowPx(v, vr, VA), VA.min) / SC, ux = v > 1e-9 ? b.vx / v : 1, uy = v > 1e-9 ? b.vy / v : 0;
      out.push({ id: 'v' + b.i, x: b.x + ux * L, y: b.y + uy * L });
    }
    return out;
  },

  drag(id, wx, wy, p) {
    const k = +id[1] + 1;
    if (id[0] === 'p') { p['x' + k] = Math.round(wx * 100) / 100; p['y' + k] = Math.round(wy * 100) / 100; return; }
    const dx = wx - p['x' + k], dy = wy - p['y' + k], d = Math.hypot(dx, dy), vr = vref(p), v = arrowMag(d * SC, vr, VA);
    p['vx' + k] = d > 1e-9 ? Math.round(v * dx / d * 1000) / 1000 : 0;
    p['vy' + k] = d > 1e-9 ? Math.round(v * dy / d * 1000) / 1000 : 0;
  },

  // Ogni corpo per il diagramma di corpo libero: l'attrazione di ciascuno degli altri due.
  bodies(s, p, { size }) {
    const bs = bodiesOf(p), G = scaleOf(p).G, st = s.st, Mmax = Math.max(...bs.map(b => b.m));
    return bs.filter(b => b.m > 0).map(b => {
      const i = b.i, x = st[4 * i], y = st[4 * i + 1], forces = [];
      let ax = 0, ay = 0;
      for (const o of bs) {
        if (o.i === i || o.m <= 0) continue;
        const dx = st[4 * o.i] - x, dy = st[4 * o.i + 1] - y, r2 = dx * dx + dy * dy + EPS * EPS, r = Math.sqrt(r2), F = G * b.m * o.m / r2;
        forces.push({ name: `F_{${i + 1}${o.i + 1}}`, fx: F * dx / r, fy: F * dy / r, color: KEYS[o.i] });
        ax += F * dx / r / b.m; ay += F * dy / r / b.m;
      }
      return { key: 'b' + i, title: `il corpo ${i + 1}`, x, y, rPx: Math.max(8, rad(b.m, Mmax) * SC * size('b' + i)), m: b.m, color: KEYS[i],
        forces, a: [ax, ay], v: [st[4 * i + 2], st[4 * i + 3]] };
    });
  },

  mount() { stage.reset(); },

  draw(P, s, p, ui) {
    const S = stage.begin(P, ui), M = S.M, sc = P.cam.scale, ctx = P.ctx;
    if (!ui.snapshot) SC = sc;
    const bs = bodiesOf(p), Mmax = Math.max(...bs.map(b => b.m)), Mtot = bs.reduce((a, b) => a + b.m, 0);

    if (p.showTrails) bs.forEach((b, i) => { if (b.m > 0) P.line(s.trails[i].concat([[s.st[4 * i], s.st[4 * i + 1]]]), { color: KEYS[i], width: 1.8, alpha: 0.6 }); });

    // Centro di massa: resta fermo (o si muove di moto rettilineo uniforme) qualunque cosa facciano i corpi.
    if (p.showCM && Mtot > 0) {
      let cx = 0, cy = 0; bs.forEach((b, i) => { cx += b.m * s.st[4 * i]; cy += b.m * s.st[4 * i + 1]; });
      const [a, c] = P.S(cx / Mtot, cy / Mtot);
      ctx.save(); ctx.strokeStyle = M.text; ctx.lineWidth = 1.4; ctx.globalAlpha = 0.85;
      ctx.beginPath(); ctx.arc(a, c, 7, 0, 7); ctx.moveTo(a - 10, c); ctx.lineTo(a + 10, c); ctx.moveTo(a, c - 10); ctx.lineTo(a, c + 10); ctx.stroke(); ctx.restore();
      tex(P, a + 16, c - 12, '\\mathrm{CM}', { size: 13, color: M.muted, halo: M.bg, align: 'left' });
    }

    bs.forEach((b, i) => {
      if (b.m <= 0) return;
      const x = s.st[4 * i], y = s.st[4 * i + 1], r = Math.max(6, rad(b.m, Mmax) * sc) * (ui.size?.('b' + i) ?? 1);
      if (b.m >= Mmax * 50 && Mmax > 0) star(P, x, y, r); else planet(P, x, y, r, COLORS[i], { alpha: S.born('b' + i) });
      // Velocità iniziali (trascinabili) a simulazione ferma.
      if (s.t === 0) {
        const v = Math.hypot(b.vx, b.vy);
        if (v > 1e-9) { const L = arrowPx(v, vref(p), VA) / sc; P.arrow(b.x, b.y, b.x + b.vx / v * L, b.y + b.vy / v * L, { color: KEYS[i], key: 'v' + i, width: 2.6 }); }
        const [a, c] = P.S(x, y);
        tex(P, a, c + r + 14, `m_${i + 1}`, { size: 14, color: M.text, halo: M.bg });
      }
    });
    if (s.t === 0) for (const h of this.handles(s, p)) P.handle(h.x, h.y, ui.active === h.id);
  },

  formulas(s, p) {
    const sm = this.sample(s, p), s0 = this.sample(this.init(p), p), sc = scaleOf(p);
    const dE = Math.abs(sm.E - s0.E) / Math.max(Math.abs(s0.E), 1e-12);
    return [
      { h: 'Gravitazione tra ogni coppia' },
      { key: true, tex: `F_{ij}=\\dfrac{G\\,m_i\\,m_j}{r_{ij}^2}\\qquad G=${p.scale === 'solar' ? '4\\pi^2' : '1'}` },
      { h: 'Cosa si conserva' },
      { key: true, tex: `E=K+U=${tn(sm.E, 4)}\\qquad L=${tn(sm.L, 4)}` },
      { tex: `\\text{scarto numerico dell'energia: } ${tn(100 * dE, 4)}\\%` },
      { tex: `\\text{il centro di massa si muove di moto rettilineo uniforme}` },
      { h: 'Istante attuale' },
      { tex: `t=${uq(sc.T, s.t)}` },
    ];
  },

  theory: `
<h2>Il problema dei tre corpi</h2>
<p>Con due corpi la gravità dà orbite perfette e prevedibili: ellissi, parabole, iperboli (leggi di Keplero). Basta aggiungere un terzo corpo e tutto cambia: <b>non esiste una formula</b> che descriva il moto in generale. Lo si calcola passo per passo, come fa questa simulazione.</p>

<h3>Che cosa resta vero</h3>
<p>Le forze tra i corpi sono interne e a coppie uguali e opposte, quindi si conservano comunque:</p>
<ul>
  <li>la <b>quantità di moto</b> totale: il centro di massa resta fermo o si muove di moto rettilineo uniforme;</li>
  <li>l'<b>energia</b> totale $E = K + U$, con $U = -\\sum G m_i m_j / r_{ij}$;</li>
  <li>il <b>momento angolare</b> totale.</li>
</ul>

<h3>Caos</h3>
<p>Nella maggior parte dei casi il moto è <b>caotico</b>: una differenza minuscola nelle condizioni iniziali cresce fino a cambiare completamente l'esito. Con il «Problema pitagorico» (masse 3, 4, 5 ferme ai vertici di un triangolo rettangolo) i corpi si avvicinano, danzano, e alla fine uno viene espulso.</p>

<h3>Le eccezioni: orbite periodiche</h3>
<ul>
  <li><b>Lagrange (1772)</b>: tre masse ai vertici di un triangolo equilatero che ruota rigidamente. Gli asteroidi troiani stanno così, 60° avanti e dietro a Giove.</li>
  <li><b>La figura a otto</b> (Chenciner e Montgomery, 2000): tre masse uguali si inseguono lungo la stessa curva a forma di otto.</li>
</ul>

<h3>Prova con la simulazione</h3>
<ol>
  <li>Con la «Figura a otto», sposta di pochissimo uno dei corpi: quanto resiste l'otto?</li>
  <li>Con il «Triangolo di Lagrange», cambia leggermente una velocità: il triangolo è stabile?</li>
  <li>Guarda il grafico dell'energia: le singole $K$ e $U$ cambiano molto, la somma no.</li>
  <li>Tocca un corpo: il diagramma di corpo libero mostra le due attrazioni che subisce.</li>
</ol>
`,
};
