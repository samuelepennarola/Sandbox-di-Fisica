import { tn, clamp } from '../core/math.js';
import { tex, texBox, smoothPath, arrowS } from '../core/manim.js';
import { uq } from '../core/units.js';
import { Stage, C, brace, dropLines, arrowPx, symVal, rate01 } from '../core/annot.js';

const stage = new Stage();

const X_MIN = -3.0;
const X_MAX = 3.0;
const X1 = -2.0;        // ascissa sezione 1
const X2 = 2.0;         // ascissa sezione 2
const P_ATM = 101325;   // pressione atmosferica standard (Pa)
const STREAM_ETAS = [-0.72, -0.36, 0, 0.36, 0.72];
const DOTS_PER_LINE = 8;

// Raccordo liscio C¹ tra tratto 1 (x ≤ −1) e tratto 2 (x ≥ +1).
function blend(x) {
  if (x <= -1) return 0;
  if (x >= 1) return 1;
  return 0.5 - 0.5 * Math.cos(Math.PI * (x + 1) / 2);
}

// Stato fluido e geometrico alla coordinata x ∈ [−3, 3].
function stateAt(x, p) {
  const s = blend(x);
  const d = p.d1 + (p.d2 - p.d1) * s;
  const h = p.h1 + (p.h2 - p.h1) * s;
  const r = d / 2;
  const A1 = Math.PI * (p.d1 / 2) ** 2;
  const A = Math.PI * r * r;
  const Q = A1 * p.v1;
  const v = Q / A;
  const p1Pa = p.p1 * 1000;
  const B = p1Pa + 0.5 * p.rho * p.v1 * p.v1 + p.rho * p.g * p.h1;
  const qPa = 0.5 * p.rho * v * v;
  const uPa = p.rho * p.g * h;
  const pPa = B - qPa - uPa;
  const gamma = p.rho * p.g;
  return {
    d, r, h, A, A1, Q, v,
    pPa, pkPa: pPa / 1000,
    qPa, uPa, B,
    z_p: h + pPa / gamma,
    H_tot: B / gamma,
  };
}

// Velocità locale v(x) = v₁ (d₁ / d(x))².
function velAt(x, p) {
  const s = blend(x);
  const d = p.d1 + (p.d2 - p.d1) * s;
  return p.v1 * (p.d1 / d) ** 2;
}

// Tempo stimato di transito della particella campione da x = −3 a x = +3.
let transitCache = { key: '', T: 4 };
function transitTime(p) {
  const key = `${p.d1}|${p.d2}|${p.v1}`;
  if (transitCache.key === key) return transitCache.T;
  const N = 60, dx = (X_MAX - X_MIN) / N;
  let T = 0;
  for (let i = 0; i < N; i++) {
    const xm = X_MIN + (i + 0.5) * dx;
    T += dx / Math.max(0.05, velAt(xm, p));
  }
  transitCache = { key, T };
  return T;
}

// Particelle traccianti distribuite lungo le linee di corrente secondo la legge oraria del flusso.
let tracers = [];
let tracerSig = '';
function syncTracers(p) {
  const sig = `${p.d1}|${p.d2}|${p.v1}`;
  if (tracers.length && tracerSig === sig) return;
  tracerSig = sig;
  const T = transitTime(p);
  tracers = [];
  for (let r = 0; r < STREAM_ETAS.length; r++) {
    const offset = (r * 0.37) % 1;
    for (let k = 0; k < DOTS_PER_LINE; k++) {
      let x = X_MIN;
      let tTarget = ((k + offset) / DOTS_PER_LINE) * T;
      const sub = Math.max(4, Math.ceil(tTarget / 0.04));
      const h = tTarget / sub;
      for (let j = 0; j < sub; j++) {
        const xm = x + 0.5 * h * velAt(x, p);
        x += h * velAt(xm, p);
        if (x > X_MAX) x -= (X_MAX - X_MIN);
      }
      tracers.push({ row: r, eta: STREAM_ETAS[r], x });
    }
  }
}

function advanceTracers(dt, p) {
  if (dt <= 0) return;
  const sub = Math.min(6, Math.max(1, Math.ceil(dt * velAt(X2, p) / 0.15)));
  const h = dt / sub;
  const span = X_MAX - X_MIN;
  for (const tr of tracers) {
    for (let j = 0; j < sub; j++) {
      const v1 = velAt(tr.x, p);
      const xm = tr.x + 0.5 * h * v1;
      tr.x += h * velAt(clamp(xm, X_MIN, X_MAX), p);
      if (tr.x > X_MAX) tr.x = X_MIN + ((tr.x - X_MAX) % span);
    }
  }
}

// Etichetta TeX legata alla crescita della freccia sulla scena.
const GAP = 8;
function tagArrow(P, S, key, a, b, src, color, { side = null, at = 0.65, size = 16 } = {}) {
  if (S.snap) return;
  const g = S.grow('arr:' + key);
  const [x0, y0] = P.S(a[0], a[1]);
  const [x1, y1] = P.S(a[0] + (b[0] - a[0]) * g, a[1] + (b[1] - a[1]) * g);
  const len = Math.hypot(x1 - x0, y1 - y0);
  if (len <= 16) return;
  const ux = (x1 - x0) / len, uy = (y1 - y0) / len;
  const B = texBox(P, src, size), hw = B.w / 2 + 2, hh = (B.bot - B.top) / 2;
  const reach = (dx, dy) => GAP + Math.min(Math.abs(dx) > 1e-6 ? hw / Math.abs(dx) : 1e9, Math.abs(dy) > 1e-6 ? hh / Math.abs(dy) : 1e9);
  let cx, cy;
  if (!side) {
    const k = reach(ux, uy);
    cx = x1 + ux * k; cy = y1 + uy * k;
  } else {
    if (len < 42) at = 1;
    let nx = -uy, ny = ux;
    if (nx * side[0] + ny * side[1] < 0) { nx = -nx; ny = -ny; }
    const k = reach(nx, ny);
    cx = x0 + (x1 - x0) * at + nx * k;
    cy = y0 + (y1 - y0) * at + ny * k;
  }
  tex(P, cx, cy - (B.top + B.bot) / 2, src, { size, color, halo: S.M.bg, alpha: rate01(g) });
}

// Rettangolo arrotondato (in coordinate mondo x0..x1, y0..y1) per barre del trinomio e fluidi.
function fillRectWorld(ctx, P, x0, y0, x1, y1, fill, { stroke = null, width = 1.5, alpha = 1, radius = 0 } = {}) {
  const [ax, ay] = P.S(x0, y1);
  const [bx, by] = P.S(x1, y0);
  const w = bx - ax, h = by - ay;
  if (w < 1 || h < 1) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.beginPath();
  if (radius > 0 && ctx.roundRect) ctx.roundRect(ax, ay, w, h, radius);
  else ctx.rect(ax, ay, w, h);
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = width; ctx.stroke(); }
  ctx.restore();
}

export default {
  id: 'bernoulli',
  title: 'Teorema di Bernoulli',
  subtitle: 'Continuità, effetto Venturi e trinomio invariante',

  params: [
    { key: 'd1', label: 'Diametro sezione 1  d₁', unit: 'm', min: 0.20, max: 1.00, step: 0.02, value: 0.60, refit: true },
    { key: 'd2', label: 'Diametro sezione 2  d₂', unit: 'm', min: 0.15, max: 1.00, step: 0.02, value: 0.30, quick: true, short: 'd₂', refit: true },
    { key: 'v1', label: 'Velocità in ingresso  v₁', unit: 'm/s', min: 0.2, max: 6.0, step: 0.1, value: 1.5, quick: true, short: 'v₁' },
    { key: 'h1', label: 'Quota asse tratto 1  h₁', unit: 'm', min: 0.0, max: 2.0, step: 0.05, value: 0.60, refit: true },
    { key: 'h2', label: 'Quota asse tratto 2  h₂', unit: 'm', min: 0.0, max: 2.5, step: 0.05, value: 0.60, quick: true, short: 'h₂', refit: true },
    { key: 'p1', label: 'Pressione relativa in ingresso  p₁', unit: 'kPa', min: 5, max: 80, step: 1, value: 12, refit: true },
    { key: 'rho', label: 'Densità del fluido  ρ', unit: 'kg/m³', min: 500, max: 13600, step: 50, value: 1000, refit: true },
    { key: 'g', label: 'Gravità  g', unit: 'm/s²', min: 1, max: 25, step: 0.01, value: 9.81, refit: true },
    { key: 'showPiezo', type: 'toggle', label: 'Piezometri e linea di carico', value: true, live: true, refit: true },
    { key: 'showStream', type: 'toggle', label: 'Linee di corrente e particelle', value: true, live: true },
    { key: 'showBars', type: 'toggle', label: 'Confronto del trinomio (p, ½ρv², ρgh)', value: true, live: true, refit: true },
  ],

  presets: [
    { label: 'Tubo di Venturi orizzontale', values: { h1: 0.5, h2: 0.5, d1: 0.60, d2: 0.30, v1: 1.2, p1: 14, rho: 1000, g: 9.81 } },
    { label: 'Condotto in salita (d₁ = d₂)', values: { h1: 0.3, h2: 1.2, d1: 0.45, d2: 0.45, v1: 1.5, p1: 16, rho: 1000, g: 9.81 } },
    { label: 'Strozzatura in salita', values: { h1: 0.3, h2: 1.0, d1: 0.60, d2: 0.32, v1: 1.1, p1: 16, rho: 1000, g: 9.81 } },
    { label: 'Diffusore (rallenta → p sale)', values: { h1: 0.5, h2: 0.5, d1: 0.30, d2: 0.60, v1: 3.5, p1: 6, rho: 1000, g: 9.81 } },
    { label: 'Depressione / Cavitazione', values: { h1: 0.5, h2: 0.5, d1: 0.65, d2: 0.22, v1: 1.8, p1: 10, rho: 1000, g: 9.81 } },
  ],

  view(p) {
    const s1 = stateAt(X1, p);
    const s2 = stateAt(X2, p);
    const pipeTop = Math.max(p.h1 + p.d1 / 2, p.h2 + p.d2 / 2);
    const pipeBot = Math.min(p.h1 - p.d1 / 2, p.h2 - p.d2 / 2);
    const hMaxVis = Math.min(Math.max(s1.H_tot, s1.z_p, s2.z_p), pipeTop + 3.0);
    const ymax = p.showPiezo
      ? Math.max(pipeTop + 1.05, hMaxVis + 0.72)
      : pipeTop + 0.95;
    const barTop = Math.min(-0.38, pipeBot - 0.38);
    const ymin = p.showBars ? barTop - 1.55 : Math.min(-0.65, pipeBot - 0.65);
    return { xmin: -4.15, xmax: 4.25, ymin, ymax };
  },

  init() {
    return { t: 0, sampleX: X_MIN, done: false };
  },

  step(st, dt, p) {
    if (st.done) return;
    // Integrazione al 2° ordine dell'elemento fluido campione lungo l'asse del condotto.
    const vA = velAt(st.sampleX, p);
    const xm = clamp(st.sampleX + 0.5 * dt * vA, X_MIN, X_MAX);
    st.sampleX += dt * velAt(xm, p);
    st.t += dt;
    if (st.sampleX >= X_MAX || st.t >= 40) {
      st.sampleX = Math.min(st.sampleX, X_MAX);
      st.done = true;
    }
  },

  done: s => s.done,

  timeScale(s, p) {
    const T = transitTime(p);
    return clamp(T / 4.5, 0.25, 1);
  },

  sample(s, p) {
    const cur = stateAt(clamp(s.sampleX, X_MIN, X_MAX), p);
    return {
      t: s.t,
      v: cur.v,
      p: cur.pkPa,
      pkPa: cur.pkPa,
      qkPa: cur.qPa / 1000,
      ukPa: cur.uPa / 1000,
      BkPa: cur.B / 1000,
    };
  },

  graphs: [
    { title: 'Velocità', series: [{ key: 'v', label: 'v (m/s)', color: 'vel' }] },
    { title: 'Pressione relativa', series: [{ key: 'p', label: 'p (kPa)', color: 'friction' }] },
    {
      title: 'Trinomio di Bernoulli',
      series: [
        { key: 'pkPa', label: 'p (kPa)', color: 'friction' },
        { key: 'qkPa', label: '½ρv² (kPa)', color: 'vel' },
        { key: 'ukPa', label: 'ρgh (kPa)', color: 'normal' },
        { key: 'BkPa', label: 'B tot (kPa)', color: 'tension', dash: [5, 4] },
      ],
    },
  ],

  handles(s, p) {
    return [
      { id: 'd2', x: X2, y: p.h2 + p.d2 / 2 },
      { id: 'h2', x: 2.45, y: p.h2 },
      { id: 'd1', x: X1, y: p.h1 + p.d1 / 2 },
      { id: 'h1', x: -2.45, y: p.h1 },
    ];
  },

  drag(id, wx, wy, p) {
    if (id === 'd2') p.d2 = clamp(Math.round((wy - p.h2) * 2 * 50) / 50, 0.15, 1.00);
    if (id === 'd1') p.d1 = clamp(Math.round((wy - p.h1) * 2 * 50) / 50, 0.20, 1.00);
    if (id === 'h2') p.h2 = clamp(Math.round(wy * 20) / 20, 0.0, 2.5);
    if (id === 'h1') p.h1 = clamp(Math.round(wy * 20) / 20, 0.0, 2.0);
  },

  mount() {
    stage.reset();
    tracers = [];
    tracerSig = '';
  },

  draw(P, st, p, ui) {
    const S = stage.begin(P, ui), M = S.M, ctx = P.ctx;
    const live = !!ui.active || !!ui.api?.running;
    const [d1v, d2v, h1v, h2v, v1v, p1v, rhov, gv] = S.smooth(
      'geom',
      [p.d1, p.d2, p.h1, p.h2, p.v1, p.p1, p.rho, p.g],
      0.12,
      live
    );
    const pv = { ...p, d1: d1v, d2: d2v, h1: h1v, h2: h2v, v1: v1v, p1: p1v, rho: rhov, g: gv };
    const s1 = stateAt(X1, pv);
    const s2 = stateAt(X2, pv);
    const pipeTop = Math.max(h1v + d1v / 2, h2v + d2v / 2);
    const pipeBot = Math.min(h1v - d1v / 2, h2v - d2v / 2);

    // Particelle traccianti: scorrono lungo le linee di corrente sia da fermo sia in Play.
    syncTracers(pv);
    if (!ui.snapshot && !S.still) {
      advanceTracers(Math.min(0.05, S.R.dt || 0.016), pv);
    }

    // 1. Quota di riferimento h = 0.
    P.line([[-3.35, 0], [3.35, 0]], { color: 'muted', width: 1.2, dash: [6, 5], alpha: 0.55 });
    {
      const [lx, ly] = P.S(-3.38, 0);
      tex(P, lx, ly + 11, 'h=0', { size: 13, color: M.muted, align: 'left', halo: M.bg, alpha: 0.85 });
    }

    // 2. Corpo del condotto (pareti lisce C¹ e riempimento fluido tenue).
    const N = 84;
    const topPts = [], botPts = [], topPx = [], botPx = [];
    for (let i = 0; i <= N; i++) {
      const x = X_MIN + (X_MAX - X_MIN) * (i / N);
      const s = blend(x);
      const h = h1v + (h2v - h1v) * s;
      const r = (d1v + (d2v - d1v) * s) / 2;
      topPts.push([x, h + r]);
      botPts.push([x, h - r]);
      topPx.push(P.S(x, h + r));
      botPx.push(P.S(x, h - r));
    }

    // Interno fluido traslucido.
    P.poly([...topPts, ...botPts.slice().reverse()], {
      fill: M.vec.vel,
      alpha: M.dark ? 0.13 : 0.10,
    });

    // 3. Linee di corrente e particelle traccianti.
    if (p.showStream) {
      for (let r = 0; r < STREAM_ETAS.length; r++) {
        const eta = STREAM_ETAS[r], pts = [];
        for (let i = 0; i <= N; i++) {
          const x = X_MIN + (X_MAX - X_MIN) * (i / N);
          const s = blend(x);
          const h = h1v + (h2v - h1v) * s;
          const rad = (d1v + (d2v - d1v) * s) / 2;
          pts.push(P.S(x, h + eta * rad));
        }
        ctx.save();
        ctx.strokeStyle = M.vec.vel;
        ctx.globalAlpha = eta === 0 ? 0.36 : 0.24;
        ctx.lineWidth = eta === 0 ? 1.4 : 1.05;
        if (eta === 0) ctx.setLineDash([5, 5]);
        smoothPath(ctx, pts);
        ctx.stroke();
        ctx.restore();
      }

      // Particelle fluide sulle linee di corrente.
      ctx.save();
      for (const tr of tracers) {
        const stTr = stateAt(tr.x, pv);
        const y = stTr.h + tr.eta * stTr.r;
        const [ax, ay] = P.S(tr.x, y);
        ctx.globalAlpha = M.dark ? 0.82 : 0.85;
        ctx.fillStyle = M.vec.vel;
        ctx.beginPath();
        ctx.arc(ax, ay, 3.1, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    // Elemento fluido campione (percorre il condotto durante il Play ed è sincronizzato con i grafici).
    {
      const sx = clamp(st.sampleX, X_MIN, X_MAX);
      const sc = stateAt(sx, pv);
      const [ax, ay] = P.S(sx, sc.h);
      ctx.save();
      const g = ctx.createRadialGradient(ax, ay, 1, ax, ay, 13);
      g.addColorStop(0, M.vec.acc + (M.dark ? '99' : '66'));
      g.addColorStop(1, M.vec.acc + '00');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(ax, ay, 13, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = M.vec.acc;
      ctx.beginPath(); ctx.arc(ax, ay, 5.2, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = M.dark ? '#0b0b0d' : '#ffffff';
      ctx.lineWidth = 1.6;
      ctx.stroke();
      ctx.restore();
    }

    // Pareti superiore e inferiore del condotto (con imbocchi netti alle estremità).
    ctx.save();
    ctx.strokeStyle = M.solidEdge;
    ctx.lineWidth = 2.8;
    ctx.lineCap = 'round';
    smoothPath(ctx, topPx); ctx.stroke();
    smoothPath(ctx, botPx); ctx.stroke();
    ctx.lineWidth = 2.0;
    ctx.globalAlpha = 0.7;
    ctx.beginPath();
    ctx.moveTo(...topPx[0]); ctx.lineTo(...botPx[0]);
    ctx.moveTo(...topPx[topPx.length - 1]); ctx.lineTo(...botPx[botPx.length - 1]);
    ctx.stroke();
    ctx.restore();

    // 4. Sezioni di misura 1 e 2 (tratteggio trasversale + etichetta sezione).
    for (const [idx, xSec, sSec] of [[1, X1, s1], [2, X2, s2]]) {
      P.line([[xSec, sSec.h - sSec.r], [xSec, sSec.h + sSec.r]], { color: 'muted', width: 1.3, dash: [4, 4], alpha: 0.75 });
      const [sx, sy] = P.S(xSec, sSec.h - sSec.r);
      tex(P, sx, sy + 14, `\\text{Sez. ${idx}}`, { size: 13, color: M.muted, halo: M.bg });
    }

    // Frecce delle velocità v₁ e v₂ sulle due sezioni.
    {
      const vRef = Math.max(5, s1.v, s2.v);
      const l1 = arrowPx(s1.v, vRef, { min: 28, max: 96 }) / P.cam.scale;
      const l2 = arrowPx(s2.v, vRef, { min: 28, max: 96 }) / P.cam.scale;
      const a1 = [X1, s1.h], b1 = [X1 + l1, s1.h];
      const a2 = [X2, s2.h], b2 = [X2 + l2, s2.h];
      P.arrow(...a1, ...b1, { color: 'vel', key: 'v1', width: 3.2 });
      P.arrow(...a2, ...b2, { color: 'vel', key: 'v2', width: 3.2 });
      tagArrow(P, S, 'v1', a1, b1, `v_1=${uq('m/s', s1.v, 1)}`, M.vec.vel, { side: [0, -1], at: 0.7, size: 14 });
      tagArrow(P, S, 'v2', a2, b2, `v_2=${uq('m/s', s2.v, 1)}`, M.vec.vel, { side: [0, -1], at: 0.7, size: 14 });
    }

    // Quote dei diametri d₁, d₂ alle estremità e delle altezze h₁, h₂ rispetto a h = 0.
    const gb = S.grow('braces', 0.75);
    brace(P, [-2.88, h1v - d1v / 2], [-2.88, h1v + d1v / 2], symVal(P, 'd_1', uq('m', d1v, 2)),
      { side: 1, gap: 8, size: 14, grow: gb, color: M.text, alpha: 0.85 });
    brace(P, [2.88, h2v - d2v / 2], [2.88, h2v + d2v / 2], symVal(P, 'd_2', uq('m', d2v, 2)),
      { side: -1, gap: 8, size: 14, grow: gb, color: M.text, alpha: 0.85 });

    if (h1v > 0.14) {
      dropLines(P, -2.45, h1v, { toY: 0, colorY: 'normal', alpha: 0.75 });
      const [hx, hy] = P.S(-2.45, h1v * 0.5);
      tex(P, hx - 10, hy, symVal(P, 'h_1', uq('m', h1v, 2)), { size: 13, color: M.vec.normal, align: 'right', halo: M.bg });
    }
    if (h2v > 0.14) {
      dropLines(P, 2.45, h2v, { toY: 0, colorY: 'normal', alpha: 0.75 });
      const [hx, hy] = P.S(2.45, h2v * 0.5);
      tex(P, hx + 10, hy, symVal(P, 'h_2', uq('m', h2v, 2)), { size: 13, color: M.vec.normal, align: 'left', halo: M.bg });
    }

    // 5. Piezometri e linea del carico totale H_tot (in scala 1:1 reale in metri).
    if (p.showPiezo) {
      const tubeCap = pipeTop + 3.0;
      const hVis = Math.min(s1.H_tot, tubeCap);
      const tubeTopY = Math.max(pipeTop + 0.55, hVis + 0.28);
      const gp = S.grow('piezo', 0.7);
      const sc = P.cam.scale;

      // Linea orizzontale del carico totale H_tot = B / (ρg), con formula ben sopra la linea.
      if (s1.H_tot <= tubeCap + 0.05) {
        P.line([[-2.45, s1.H_tot], [2.45, s1.H_tot]], { color: M.vec.tension, width: 1.7, dash: [6, 5], alpha: 0.88 * gp });
        const hLbl = `H_{\\text{tot}}=\\dfrac{B}{\\rho g}=${uq('m', s1.H_tot, 2)}`;
        const hb = texBox(P, hLbl, 14);
        const [hx, hy] = P.S(0, s1.H_tot);
        tex(P, hx, hy - hb.bot - 7, hLbl,
          { size: 14, color: M.vec.tension, halo: M.bg, alpha: gp });
      } else {
        const hLbl = `H_{\\text{tot}}=${uq('m', s1.H_tot, 2)}\\ (\\text{fuori scala})`;
        const hb = texBox(P, hLbl, 14);
        const [hx, hy] = P.S(0, tubeCap);
        tex(P, hx, hy - hb.bot - 6, hLbl,
          { size: 14, color: M.vec.tension, halo: M.bg, alpha: gp });
      }

      const halfW = Math.max(0.08, 11 / sc);
      for (const [idx, xSec, sSec] of [[1, X1, s1], [2, X2, s2]]) {
        const yWall = sSec.h + sSec.r;
        const tTop = Math.max(yWall + 0.42, tubeTopY);

        // Tubo piezometrico trasparente collegato al bordo superiore del condotto.
        fillRectWorld(ctx, P, xSec - halfW, yWall, xSec + halfW, tTop,
          M.dark ? 'rgba(255,255,255,0.04)' : 'rgba(30,25,18,0.04)', { alpha: gp });
        P.line([[xSec - halfW, yWall], [xSec - halfW, tTop]], { color: M.solidEdge, width: 1.6, alpha: 0.75 * gp });
        P.line([[xSec + halfW, yWall], [xSec + halfW, tTop]], { color: M.solidEdge, width: 1.6, alpha: 0.75 * gp });

        if (sSec.pPa >= 0) {
          const zDraw = Math.min(sSec.z_p, tTop - 0.06);
          if (zDraw > yWall) {
            fillRectWorld(ctx, P, xSec - halfW + 0.008, yWall, xSec + halfW - 0.008, zDraw,
              M.vec.friction, { alpha: 0.42 * gp });
            P.line([[xSec - halfW, zDraw], [xSec + halfW, zDraw]],
              { color: M.vec.friction, width: 2.2, alpha: gp });
          }
          if (sSec.z_p > tTop - 0.06) {
            const [ax, ay0] = P.S(xSec, tTop - 0.02);
            arrowS(ctx, ax, ay0, ax, ay0 - 20, M.vec.friction, { width: 2.2, tip: 9, grow: gp, halo: M.bg });
          }
          // Indicazione dello scarto cinetico v²/(2g) tra menisco piezometrico e linea H_tot.
          const zPx = P.S(xSec, zDraw)[1];
          const hPx = P.S(xSec, Math.min(s1.H_tot, tubeCap))[1];
          if (s1.H_tot <= tubeCap + 0.05 && zDraw < s1.H_tot && (zPx - hPx) > 16) {
            const xOff = idx === 1 ? xSec + halfW + 0.12 : xSec - halfW - 0.12;
            P.line([[xOff, zDraw], [xOff, s1.H_tot]], { color: M.vec.vel, width: 1.6, dash: [3, 3], alpha: 0.85 * gp });
            const [lx, ly] = P.S(xOff, (zDraw + s1.H_tot) / 2);
            tex(P, idx === 1 ? lx + 8 : lx - 8, ly, `\\dfrac{v_${idx}^2}{2g}`,
              { size: 13, color: M.vec.vel, align: idx === 1 ? 'left' : 'right', halo: M.bg, alpha: gp });
          }
          // Valore della pressione accanto al piezometro (sempre abbastanza alto sopra la parete per non toccare v).
          const labelY = Math.min(Math.max(zDraw, yWall + 36 / sc), tTop - 0.12);
          const [px, py] = P.S(idx === 1 ? xSec - halfW : xSec + halfW, labelY);
          tex(P, idx === 1 ? px - 10 : px + 10, py,
            `p_${idx}=${uq('kPa', sSec.pkPa, 1)}`,
            { size: 14, color: M.vec.friction, align: idx === 1 ? 'right' : 'left', halo: M.bg, alpha: gp });
        } else {
          // Depressione (p < 0 relativa): colonna vuota con freccia di suzione nel tubo ed etichette pulite a sinistra.
          const cav = sSec.pPa < -P_ATM;
          P.line([[xSec - halfW, yWall], [xSec + halfW, yWall]], { color: M.vec.weight, width: 2.2, alpha: gp });
          const [sxTube, ay0] = P.S(xSec, Math.min(tTop - 0.06, yWall + Math.max(0.45, 36 / sc)));
          const [, ay1] = P.S(xSec, yWall + 0.03);
          if (ay1 - ay0 > 12) {
            arrowS(ctx, sxTube, ay0, sxTube, ay1, M.vec.weight, { width: 2.4, tip: 10, grow: gp, halo: M.bg });
          }
          const labelY = Math.min(tTop - 0.22, yWall + Math.max(0.42, 36 / sc));
          const [tx, ty] = P.S(xSec - halfW, labelY);
          tex(P, tx - 10, ty - 9, `p_${idx}=${uq('kPa', sSec.pkPa, 1)}`,
            { size: 14, color: M.vec.weight, align: 'right', halo: M.bg, alpha: gp });
          tex(P, tx - 10, ty + 10, cav ? '\\text{cavitazione!}' : '\\text{depressione}',
            { size: 13, color: M.vec.weight, align: 'right', halo: M.bg, alpha: gp });
        }
      }
    }

    // 6. Confronto visivo del trinomio di Bernoulli (p, ½ρv², ρgh) nelle due sezioni.
    if (p.showBars) {
      const barTop = Math.min(-0.38, pipeBot - 0.38);
      const barH = 1.15;
      const barBot = barTop - barH;
      const gBar = S.grow('bars', 0.75);
      const sc = P.cam.scale;

      const maxPa = Math.max(
        Math.abs(s1.B),
        Math.max(0, s1.pPa) + s1.qPa + s1.uPa,
        Math.max(0, s2.pPa) + s2.qPa + s2.uPa,
        s2.qPa + s2.uPa,
        1000
      );
      const kPa = (barH * 0.92) / maxPa;
      const yB = barBot + Math.max(0, s1.B) * kPa;

      // Linea di base 0 kPa e linea dell'invariante B = cost.
      P.line([[-2.38, barBot], [2.38, barBot]], { color: 'muted', width: 1.2, alpha: 0.65 * gBar });
      P.line([[-2.38, yB], [2.38, yB]], { color: M.vec.tension, width: 1.6, dash: [6, 4], alpha: 0.9 * gBar });
      {
        const bLbl = `B=${uq('kPa', s1.B / 1000, 1)}\\ (\\text{cost})`;
        const bb = texBox(P, bLbl, 13.5);
        const [bx, byLine] = P.S(0, yB);
        const byB = byLine - bb.bot - 6;
        tex(P, bx, byB, bLbl, { size: 13.5, color: M.vec.tension, halo: M.bg, alpha: gBar });

        // Il segno "=" sta tra le due colonne ma non tocca mai la scritta né la linea tratteggiata di B.
        const [, yTopPx] = P.S(0, barTop);
        const [, yBotPx] = P.S(0, barBot);
        let ey = (yTopPx + yBotPx) * 0.5;
        const bTop = byB + bb.top - 6;
        const bBot = byLine + 6;
        if (ey > bTop - 18 && ey < bBot + 18) {
          const candAbove = bTop - 18;
          const candBelow = bBot + 18;
          if (candAbove >= yTopPx + 6) ey = candAbove;
          else if (candBelow <= yBotPx - 12) ey = candBelow;
        }
        tex(P, bx, ey, '=', { size: 22, color: M.muted, halo: M.bg, alpha: gBar });
      }

      const placeStack = (items, minGap = 28) => {
        const sorted = items.map(it => ({ ...it })).sort((a, b) => b.y - a.y);
        for (let i = 1; i < sorted.length; i++) {
          if (sorted[i - 1].y - sorted[i].y < minGap) sorted[i].y = sorted[i - 1].y - minGap;
        }
        return sorted;
      };

      const bw = 0.48;
      for (const [idx, cx, sSec] of [[1, -1.72, s1], [2, 1.72, s2]]) {
        const xL = cx - bw / 2, xR = cx + bw / 2;
        const hU = sSec.uPa * kPa * gBar;
        const hQ = sSec.qPa * kPa * gBar;
        const hP = sSec.pPa * kPa * gBar;

        let yCur = barBot;
        if (hU > 0.002) {
          fillRectWorld(ctx, P, xL, yCur, xR, yCur + hU, M.vec.normal, { stroke: M.bg, width: 1, alpha: 0.85 });
          yCur += hU;
        }
        if (hQ > 0.002) {
          fillRectWorld(ctx, P, xL, yCur, xR, yCur + hQ, M.vec.vel, { stroke: M.bg, width: 1, alpha: 0.85 });
          yCur += hQ;
        }

        const posItems = [];
        if (hU * sc >= 13) posItems.push({ y: P.S(0, barBot + hU / 2)[1], lbl: `\\rho g h_${idx}`, col: M.vec.normal });
        if (hQ * sc >= 13) posItems.push({ y: P.S(0, barBot + hU + hQ / 2)[1], lbl: `\\tfrac12\\rho v_${idx}^2`, col: M.vec.vel });

        if (hP >= 0) {
          if (hP > 0.002) {
            fillRectWorld(ctx, P, xL, yCur, xR, yCur + hP, M.vec.friction, { stroke: M.bg, width: 1, alpha: 0.85 });
          }
          if (hP * sc >= 13) posItems.push({ y: P.S(0, yCur + hP / 2)[1], lbl: `p_${idx}`, col: M.vec.friction });

          const sideX = idx === 1 ? xL : xR;
          const align = idx === 1 ? 'right' : 'left';
          const dx = idx === 1 ? -8 : 8;
          const [sx] = P.S(sideX, 0);
          for (const it of placeStack(posItems)) {
            tex(P, sx + dx, it.y, it.lbl, { size: 13, color: it.col, align, halo: M.bg, alpha: gBar });
          }
        } else {
          // Pressione relativa negativa: la colonnina principale resta pura (ρgh + ½ρv²) e a lato una colonnina/freccia
          // rossa scende dall'apice fino alla linea invariante B (= positivo − |p|), senza impastare i colori.
          const yNegBot = yCur + hP;
          const subX0 = idx === 1 ? xL - 0.24 : xR + 0.08;
          const subX1 = subX0 + 0.16;
          const subCx = (subX0 + subX1) / 2;
          const edgeX = idx === 1 ? xL : xR;
          const guideEnd = idx === 1 ? subX0 : subX1;
          P.line([[edgeX, yCur], [guideEnd, yCur]], { color: M.vec.weight, width: 1.2, dash: [3, 3], alpha: 0.7 * gBar });
          fillRectWorld(ctx, P, subX0, Math.min(yNegBot, yCur), subX1, Math.max(yNegBot, yCur),
            M.vec.weight, { stroke: M.vec.weight, width: 1.4, alpha: 0.24 * gBar });
          const [axS, ayTopS] = P.S(subCx, yCur);
          const [, ayBotS] = P.S(subCx, yNegBot);
          if (ayBotS - ayTopS >= 8) {
            arrowS(ctx, axS, ayTopS, axS, ayBotS, M.vec.weight, { width: 2.3, tip: 9, alpha: gBar, halo: M.bg });
          }

          // Etichette su lati opposti: termini positivi sul lato interno, p < 0 sul lato esterno della colonnina rossa.
          const posSideX = idx === 1 ? xR : xL;
          const posAlign = idx === 1 ? 'left' : 'right';
          const posDx = idx === 1 ? 8 : -8;
          const [psx] = P.S(posSideX, 0);
          for (const it of placeStack(posItems)) {
            tex(P, psx + posDx, it.y, it.lbl, { size: 13, color: it.col, align: posAlign, halo: M.bg, alpha: gBar });
          }

          if (Math.abs(hP) * sc >= 8) {
            const negSideX = idx === 1 ? subX0 : subX1;
            const negAlign = idx === 1 ? 'right' : 'left';
            const negDx = idx === 1 ? -8 : 8;
            const [nsx, nsy] = P.S(negSideX, (yCur + yNegBot) * 0.5);
            tex(P, nsx + negDx, nsy, `p_${idx}<0`, { size: 13, color: M.vec.weight, align: negAlign, halo: M.bg, alpha: gBar });
          }
        }

        // Etichetta sezione sotto la barra.
        const [tx, ty] = P.S(cx, barBot);
        tex(P, tx, ty + 14, `\\text{Trinomio sez. ${idx}}`, { size: 13, color: M.text, halo: M.bg, alpha: gBar });
      }
    }

    // 7. Maniglie interattive.
    for (const h of this.handles(st, pv)) P.handle(h.x, h.y, ui.active === h.id);
  },

  formulas(st, p) {
    const s1 = stateAt(X1, p);
    const s2 = stateAt(X2, p);
    const sc = stateAt(clamp(st.sampleX, X_MIN, X_MAX), p);
    const Pcol = s => C('friction', s);
    const Vcol = s => C('vel', s);
    const Hcol = s => C('normal', s);
    const Bcol = s => C('tension', s);
    const cav = s2.pPa < -P_ATM;
    const dep = s2.pPa < 0;

    return [
      { h: 'Equazione di continuità' },
      { tex: `A_1=\\pi\\left(\\dfrac{d_1}{2}\\right)^2=${tn(s1.A, 3)}\\ \\mathrm{m^2}\\qquad A_2=${tn(s2.A, 3)}\\ \\mathrm{m^2}` },
      { key: true, tex: `Q=A_1${Vcol('v_1')}=A_2${Vcol('v_2')}=${tn(s1.Q, 3)}\\ \\mathrm{m^3/s}` },
      { tex: `${Vcol('v_2')}=${Vcol('v_1')}\\left(\\dfrac{d_1}{d_2}\\right)^2=${uq('m/s', s2.v, 2)}` },
      { h: 'Teorema di Bernoulli' },
      { key: true, tex: `${Pcol('p_1')}+\\tfrac12\\rho ${Vcol('v_1')}^2+\\rho g ${Hcol('h_1')}=${Pcol('p_2')}+\\tfrac12\\rho ${Vcol('v_2')}^2+\\rho g ${Hcol('h_2')}` },
      { tex: `${Pcol('p_2')}=${uq('kPa', s2.pkPa, 2)}\\qquad ${Bcol('B')}=${uq('kPa', s1.B / 1000, 2)}` },
      cav && { tex: `\\text{Attenzione: cavitazione nel tratto 2 (} p_{\\text{ass}}=${uq('kPa', 101.325 + s2.pkPa, 1)}<0\\text{)}`, cls: 'warn' },
      !cav && dep && { tex: `\\text{Depressione nel tratto 2: } p_2 < 0\\text{ (relativa)}`, cls: 'warn' },
      { h: 'Termini del trinomio (per unità di volume)' },
      { tex: `\\text{Sez. 1: } ${Pcol('p_1')}=${uq('kPa', s1.pkPa, 2)}\\quad \\tfrac12\\rho ${Vcol('v_1')}^2=${uq('kPa', s1.qPa / 1000, 2)}\\quad \\rho g ${Hcol('h_1')}=${uq('kPa', s1.uPa / 1000, 2)}` },
      { tex: `\\text{Sez. 2: } ${Pcol('p_2')}=${uq('kPa', s2.pkPa, 2)}\\quad \\tfrac12\\rho ${Vcol('v_2')}^2=${uq('kPa', s2.qPa / 1000, 2)}\\quad \\rho g ${Hcol('h_2')}=${uq('kPa', s2.uPa / 1000, 2)}` },
      { h: 'Carico idraulico (piezometri)' },
      { tex: `${Bcol('H_{\\text{tot}}')}=\\dfrac{B}{\\rho g}=${uq('m', s1.H_tot, 2)}\\qquad z_{p1}=${uq('m', s1.z_p, 2)}\\qquad z_{p2}=${uq('m', s2.z_p, 2)}` },
      { h: 'Elemento fluido campione' },
      { tex: `t=${uq('s', st.t, 2)}\\quad x=${uq('m', st.sampleX, 2)}\\quad ${Vcol('v')}=${uq('m/s', sc.v, 2)}\\quad ${Pcol('p')}=${uq('kPa', sc.pkPa, 2)}` },
    ].filter(Boolean);
  },

  derivation() {
    return {
      title: 'Derivazione del teorema di Bernoulli',
      steps: [
        { tex: 'W_{\\text{press}} = \\Delta K + \\Delta U', note: 'Il lavoro delle forze di pressione varia l’energia meccanica del volumetto ΔV' },
        { tex: '(p_1 - p_2)\\Delta V = \\tfrac{1}{2}m(v_2^2 - v_1^2) + m g(h_2 - h_1)', note: 'Il lavoro netto delle pressioni alle due estremità vale (p₁ − p₂) ΔV' },
        { tex: '(p_1 - p_2)\\Delta V = \\tfrac{1}{2}\\rho\\Delta V(v_2^2 - v_1^2) + \\rho\\Delta V\\, g(h_2 - h_1)', note: 'Sostituiamo la massa del volumetto: m = ρ ΔV' },
        { indicate: '\\Delta V', note: 'Il volume ΔV compare in tutti i termini e si semplifica' },
        { tex: 'p_1 - p_2 = \\tfrac{1}{2}\\rho(v_2^2 - v_1^2) + \\rho g(h_2 - h_1)', note: 'Raccogliamo da una parte la sezione 1 e dall’altra la sezione 2' },
        { tex: 'p_1 + \\tfrac{1}{2}\\rho v_1^2 + \\rho g h_1 = p_2 + \\tfrac{1}{2}\\rho v_2^2 + \\rho g h_2', note: 'La somma dei tre termini resta uguale lungo tutta la linea di corrente' },
        { box: 'p + \\tfrac{1}{2}\\rho v^2 + \\rho g h = \\text{costante}', note: 'Teorema di Bernoulli (fluido ideale, stazionario e incomprimibile)' },
      ],
    };
  },

  theory: `
<h2>Teorema di Bernoulli</h2>
<p>Consideriamo un <b>fluido ideale</b> (privo di viscosità), <b>incomprimibile</b> (densità $\\rho$ costante) e in <b>moto stazionario</b> (in ogni punto la velocità non cambia nel tempo) lungo un condotto a sezione e quota variabili.</p>

<h3>Portata ed equazione di continuità</h3>
<p>Poiché il fluido non si comprime né si accumula lungo il condotto, in ogni secondo attraversa qualsiasi sezione trasversale lo stesso volume di fluido. La <b>portata volumetrica</b> $Q$ è costante:</p>
$$Q = A_1 v_1 = A_2 v_2 = \\text{costante}$$
<p>Per un tubo circolare di diametro $d$, l'area è $A = \\pi(d/2)^2$, quindi</p>
$$v_2 = v_1\\left(\\frac{d_1}{d_2}\\right)^2$$
<p>Dimezzando il diametro, l'area si riduce a un quarto e la velocità <b>quadruplica</b>: le particelle traccianti si allontanano lungo il tratto stretto proprio perché scorrono più veloci.</p>

<h3>Conservazione dell'energia: il trinomio di Bernoulli</h3>
<p>Il teorema di Bernoulli esprime la conservazione dell'energia meccanica riferita all'unità di volume:</p>
$$p + \\frac{1}{2}\\rho v^2 + \\rho g h = B = \\text{costante}$$
<ul>
  <li>$p$ è la <b>pressione statica</b> (lavoro delle forze di pressione per unità di volume);</li>
  <li>$\\frac{1}{2}\\rho v^2$ è la <b>pressione dinamica</b> (energia cinetica per unità di volume);</li>
  <li>$\\rho g h$ è il <b>termine idrostatico</b> (energia potenziale gravitazionale per unità di volume).</li>
</ul>

<h3>Effetto Venturi</h3>
<p>In un condotto orizzontale ($h_1 = h_2$), dove la sezione si restringe la velocità aumenta: affinché il fluido acceleri entrando nella strozzatura, deve esserci una spinta maggiore alle sue spalle che davanti, cioè $p_1 &gt; p_2$. Perciò <b>dove il fluido corre più veloce, la pressione statica è minore</b>.</p>
<div class="box">Attenzione: la pressione diminuisce non per magia, ma perché la differenza di pressione $p_1 - p_2$ è proprio ciò che accelera le particelle verso la strozzatura!</div>

<h3>Carico idraulico e piezometri</h3>
<p>Dividendo il trinomio per $\\rho g$ si ottengono grandezze espresse in <b>metri di colonna fluida</b>:</p>
$$H_{\\text{tot}} = h + \\frac{p}{\\rho g} + \\frac{v^2}{2g} = \\text{costante}$$
<p>Nei tubi piezometrici verticali il liquido sale fino alla <b>quota piezometrica</b> $z_p = h + p/(\\rho g)$. La distanza verticale tra il pelo del liquido nel piezometro e la linea orizzontale del carico totale $H_{\\text{tot}}$ misura esattamente l'altezza cinetica $v^2/(2g)$.</p>
<p>Se la strozzatura è molto stretta o la velocità iniziale è alta, la pressione relativa $p_2$ può scendere sotto zero (<b>depressione</b>) e, quando la pressione assoluta scende sotto la tensione di vapore del liquido, si innesca la <b>cavitazione</b> (formazione di bolle di vapore).</p>

<h3>Applicazioni reali</h3>
<ul>
  <li><b>Nebulizzatori e carburatori:</b> un getto veloce d'aria crea una depressione che aspira il liquido dal serbatoio sottostante.</li>
  <li><b>Portanza alare:</b> la diversa velocità dell'aria sopra e sotto il profilo genera una differenza di pressione che contribuisce alla forza verso l'alto.</li>
  <li><b>Stenosi e aneurismi:</b> nei vasi sanguigni un restringimento accelera il flusso e abbassa la pressione sulle pareti (rischio di collasso), mentre una dilatazione rallenta il flusso e fa salire la pressione.</li>
</ul>

<h3>Prova con la simulazione</h3>
<ol>
  <li>Apri il preset <i>Tubo di Venturi orizzontale</i> e dimezza $d_2$ rispetto a $d_1$: verifica che $v_2$ quadruplica e che nei grafici i tre termini di $B$ si scambiano mantenendo costante la somma.</li>
  <li>Con <i>Condotto in salita</i> ($d_1 = d_2$), osserva che $v_1 = v_2$ e la differenza $p_1 - p_2$ coincide esattamente con $\\rho g(h_2 - h_1)$ (legge di Stevino!).</li>
  <li>Prova il <i>Diffusore</i>: allargando il tubo il fluido rallenta e la pressione <b>aumenta</b> lungo il moto.</li>
  <li>Prova <i>Depressione / Cavitazione</i> e guarda come nel grafico del trinomio il termine negativo $p_2 &lt; 0$ compensa l'eccesso di energia cinetica per conservare $B$.</li>
</ol>

<h3>Esercizi</h3>
<details><summary>1. Un tubo orizzontale si restringe da $d_1 = 20$ cm a $d_2 = 10$ cm. L'acqua entra a $v_1 = 1{,}5$ m/s. Quanto vale $v_2$?</summary>
<p>$v_2 = v_1(d_1/d_2)^2 = 1{,}5 \\cdot (20/10)^2 = 1{,}5 \\cdot 4 = 6{,}0$ m/s.</p></details>
<details><summary>2. Nel tubo precedente ($\\rho = 1000$ kg/m³), la pressione relativa in ingresso è $p_1 = 30$ kPa. Quanto vale $p_2$ nella strozzatura?</summary>
<p>$p_2 = p_1 + \\tfrac12\\rho(v_1^2 - v_2^2) = 30\\,000 + 500(1{,}5^2 - 6{,}0^2) = 30\\,000 - 16\\,875 \\approx 13{,}1$ kPa.</p></details>
<details><summary>3. Un condotto a sezione costante sale di $\\Delta h = 2{,}0$ m trasportando acqua. Se alla base $p_1 = 40$ kPa, quanto vale la pressione in cima?</summary>
<p>Con sezione costante $v_1 = v_2$, quindi $p_2 = p_1 - \\rho g \\Delta h = 40\\,000 - 1000 \\cdot 9{,}81 \\cdot 2{,}0 \\approx 20{,}4$ kPa.</p></details>
<details><summary>4. Perché una strozzatura troppo stretta può provocare cavitazione nel fluido?</summary>
<p>L'aumento di velocità fa crescere $\\tfrac12\\rho v_2^2$; se supera $B$, la pressione relativa $p_2$ diventa negativa e la pressione assoluta $p_{\\text{atm}} + p_2$ può scendere sotto la tensione di vapore, formando bolle di vapore.</p></details>
`,
};
