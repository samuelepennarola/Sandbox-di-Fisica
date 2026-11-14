import { rk4, tn, clamp } from '../core/math.js';
import { ballM, tex } from '../core/manim.js';
import { trail } from '../core/look.js';
import { uq } from '../core/units.js';
import { Stage, C, arrowPx, arrowMag, angleMark, symVal, degTeX, brace } from '../core/annot.js';
import { contact, slowmo, momentumRows, kBars, panelBg } from '../core/collide.js';

const stage = new Stage();
const X1 = -4;                                 // il disco 1 parte da (X1, 0) verso destra; il 2 è fermo in (0, b)
const V = { min: 34, max: 120 };
const TC = 0.06, TRAIL_DT = 1 / 60;
let SC = 50;

const radius = m => 0.3 * Math.cbrt(m);
const vref = p => Math.max(Math.abs(p.v1), 0.5);

function overlapOf(s, p) {
  const dx = s.x2 - s.x1, dy = s.y2 - s.y1, d = Math.hypot(dx, dy) || 1e-9;
  return { d: radius(p.m1) + radius(p.m2) - d, nx: dx / d, ny: dy / d };
}
function force(s, p) {
  const { d, nx, ny } = overlapOf(s, p);
  if (d <= 0) return 0;
  const { k, c } = contact(p.m1, p.m2, p.e);
  return k * d + c * ((s.vx1 - s.vx2) * nx + (s.vy1 - s.vy2) * ny);
}

export default {
  id: 'collision2d',
  title: 'Urti nel piano',
  subtitle: 'Due dischi su un tavolo senza attrito',
  dt: 1 / 2000,

  params: [
    { key: 'm1', label: 'Massa del disco 1  m₁', unit: 'kg', min: 0.2, max: 10, step: 0.1, value: 1 },
    { key: 'm2', label: 'Massa del disco 2  m₂', unit: 'kg', min: 0.2, max: 10, step: 0.1, value: 1 },
    { key: 'v1', label: 'Velocità del disco 1  v₁', unit: 'm/s', min: 0.2, max: 6, step: 0.1, value: 2.5 },
    { key: 'b', label: 'Parametro d\'urto b', unit: 'm', min: 0, max: 1.2, step: 0.01, value: 0.3 },
    { key: 'e', label: 'Coefficiente di restituzione e', unit: '', min: 0, max: 1, step: 0.01, value: 1 },
    { key: 'tMax', label: 'Durata della simulazione', unit: 's', min: 2, max: 30, step: 1, value: 5 },
    { key: 'slowmo', type: 'toggle', label: 'Rallentatore all\'urto', value: true, live: true },
    { key: 'showBal', type: 'toggle', label: 'Bilancio di p e K', value: true, live: true },
    { key: 'showForce', type: 'toggle', label: 'Forze durante l\'urto', value: true, live: true },
  ],

  presets: [
    { label: 'Biliardo: masse uguali', values: { m1: 1, m2: 1, v1: 2.5, b: 0.3, e: 1 } },
    { label: 'Urto centrale', values: { m1: 1, m2: 1, v1: 2.5, b: 0, e: 1 } },
    { label: 'Contro un disco pesante', values: { m1: 1, m2: 6, v1: 2.5, b: 0.4, e: 1 } },
    { label: 'Anelastico', values: { m1: 1, m2: 1, v1: 2.5, b: 0.3, e: 0.4 } },
  ],

  view() { return { xmin: -5.5, xmax: 5.5, ymin: -3.2, ymax: 3.6 }; },

  init(p) {
    return { t: 0, x1: X1, y1: 0, vx1: p.v1, vy1: 0, x2: 0, y2: p.b, vx2: 0, vy2: 0,
      tc0: null, cp: null, tr1: [[X1, 0]], tr2: [[0, p.b]], tEnd: p.tMax };
  },

  step(s, dt, p) {
    const { k, c } = contact(p.m1, p.m2, p.e), R = radius(p.m1) + radius(p.m2);
    const f = ([x1, y1, vx1, vy1, x2, y2, vx2, vy2]) => {
      const dx = x2 - x1, dy = y2 - y1, dd = Math.hypot(dx, dy) || 1e-9, d = R - dd;
      let F = 0, nx = 0, ny = 0;
      if (d > 0) { nx = dx / dd; ny = dy / dd; F = k * d + c * ((vx1 - vx2) * nx + (vy1 - vy2) * ny); }
      return [vx1, vy1, -F * nx / p.m1, -F * ny / p.m1, vx2, vy2, F * nx / p.m2, F * ny / p.m2];
    };
    const y = rk4([s.x1, s.y1, s.vx1, s.vy1, s.x2, s.y2, s.vx2, s.vy2], dt, f);
    [s.x1, s.y1, s.vx1, s.vy1, s.x2, s.y2, s.vx2, s.vy2] = y;
    s.t += dt;
    if (s.tc0 == null && overlapOf(s, p).d > 0) {
      s.tc0 = s.t;
      const r1 = radius(p.m1), { nx, ny } = overlapOf(s, p);
      s.cp = [s.x1 + nx * r1, s.y1 + ny * r1];   // punto di contatto
    }
    const l1 = s.tr1[s.tr1.length - 1];
    if (Math.hypot(s.x1 - l1[0], s.y1 - l1[1]) > 0.04) s.tr1.push([s.x1, s.y1]);
    const l2 = s.tr2[s.tr2.length - 1];
    if (Math.hypot(s.x2 - l2[0], s.y2 - l2[1]) > 0.04) s.tr2.push([s.x2, s.y2]);
  },

  done: s => s.t >= s.tEnd,

  timeScale(s, p) {
    if (!p.slowmo) return 1;
    const inC = s.tc0 != null && s.t - s.tc0 < 1.5 * TC;
    let ttc = Infinity;
    if (s.tc0 == null) {
      // Tempo al contatto lungo la traiettoria rettilinea del disco 1.
      const R = radius(p.m1) + radius(p.m2), rx = s.x1 - s.x2, ry = s.y1 - s.y2, vx = s.vx1 - s.vx2, vy = s.vy1 - s.vy2;
      const a = vx * vx + vy * vy, bq = 2 * (rx * vx + ry * vy), cq = rx * rx + ry * ry - R * R, D = bq * bq - 4 * a * cq;
      if (a > 1e-12 && D >= 0) { const t = (-bq - Math.sqrt(D)) / (2 * a); if (t >= 0) ttc = t; }
    }
    const since = s.tc0 != null && !inC ? s.t - s.tc0 - 1.5 * TC : Infinity;
    return slowmo(inC, ttc, since);
  },

  sample(s, p) {
    const px = p.m1 * s.vx1 + p.m2 * s.vx2, py = p.m1 * s.vy1 + p.m2 * s.vy2;
    const K1 = 0.5 * p.m1 * (s.vx1 ** 2 + s.vy1 ** 2), K2 = 0.5 * p.m2 * (s.vx2 ** 2 + s.vy2 ** 2);
    return { t: s.t, v1: Math.hypot(s.vx1, s.vy1), v2: Math.hypot(s.vx2, s.vy2), px, py, K1, K2, K: K1 + K2, F: force(s, p) };
  },

  graphs: [
    { title: 'Velocità', series: [{ key: 'v1', label: '|v₁| (m/s)', color: 'vel' }, { key: 'v2', label: '|v₂| (m/s)', color: 'weight' }] },
    { title: 'Quantità di moto totale', series: [{ key: 'px', label: 'Px (kg·m/s)', color: 'friction' }, { key: 'py', label: 'Py (kg·m/s)', color: 'normal' }] },
    { title: 'Energia cinetica', series: [{ key: 'K1', label: 'K₁ (J)', color: 'vel' }, { key: 'K2', label: 'K₂ (J)', color: 'weight' }, { key: 'K', label: 'K totale (J)', color: 'friction' }] },
    { title: 'Forza di contatto', series: [{ key: 'F', label: 'F (N)', color: 'applied' }] },
  ],

  handles(s, p) {
    return [
      { id: 'v1', x: X1 + arrowPx(p.v1, vref({ v1: 6 }), V) / SC, y: 0 },
      { id: 'b', x: 0, y: p.b },
    ];
  },

  drag(id, wx, wy, p) {
    if (id === 'v1') p.v1 = clamp(Math.round(arrowMag(Math.max(0, wx - X1) * SC, vref({ v1: 6 }), V) * 10) / 10, 0.2, 6);
    if (id === 'b') p.b = clamp(Math.round(Math.abs(wy) * 100) / 100, 0, 1.2);
  },

  mount() { stage.reset(); },

  draw(P, s, p, ui) {
    const S = stage.begin(P, ui), M = S.M, sc = P.cam.scale;
    if (!ui.snapshot) SC = sc;
    const fresh = s.t === 0, c1 = M.body.blue, c2 = M.body.red, r1 = radius(p.m1), r2 = radius(p.m2);

    // Linea di volo del disco 1 e parametro d'urto b (distanza tra quella linea e il centro del disco 2).
    P.line([[X1 - 1, 0], [5, 0]], { color: 'muted', width: 1, dash: [4, 6], alpha: 0.45 });
    if (fresh && p.b * sc > 16) brace(P, [0, 0], [0, p.b], symVal(P, 'b', uq('m', p.b)), { side: -1, gap: r2 * sc + 6, grow: S.grow('b', 0.7), color: M.text, alpha: 0.8 });

    trail(P, s.tr1, c1, 2);
    trail(P, s.tr2, c2, 2);

    ballM(P, M, s.x1, s.y1, { r: r1, color: 'blue', grow: S.born('d1') });
    ballM(P, M, s.x2, s.y2, { r: r2, color: 'red', grow: S.born('d2') });

    // Velocità (scala compressa in px).
    const ref = vref({ v1: 6 });
    for (const [i, x, y, vx, vy, col] of [[1, s.x1, s.y1, s.vx1, s.vy1, c1], [2, s.x2, s.y2, s.vx2, s.vy2, c2]]) {
      const v = Math.hypot(vx, vy);
      if (v < 1e-3) continue;
      const L = arrowPx(v, ref, V) / sc;
      P.arrow(x, y, x + vx / v * L, y + vy / v * L, { color: col, key: 'v' + i, width: 3.5, label: `v_${i}` });
    }

    // Forze di contatto lungo la congiungente dei centri.
    const F = force(s, p);
    if (p.showForce && F > 1e-6) {
      const { k } = contact(p.m1, p.m2, p.e), mu = p.m1 * p.m2 / (p.m1 + p.m2), Fpk = Math.sqrt(k * mu) * p.v1;
      const { nx, ny } = overlapOf(s, p), L = arrowPx(F, Fpk, { min: 30, max: 90 }) / sc;
      const cx = s.x1 + nx * r1, cy = s.y1 + ny * r1;
      P.arrow(cx, cy, cx + nx * L, cy + ny * L, { color: 'applied', key: 'F12', width: 3, label: 'F_{12}' });
      P.arrow(cx, cy, cx - nx * L, cy - ny * L, { color: 'applied', key: 'F21', width: 3, label: 'F_{21}' });
    }

    // Dopo l'urto: le direzioni delle due velocità uscenti dal punto di contatto e l'angolo tra loro.
    if (s.cp && s.t - s.tc0 > 1.5 * TC) {
      const a1 = Math.atan2(s.vy1, s.vx1), a2 = Math.atan2(s.vy2, s.vx2);
      const v1 = Math.hypot(s.vx1, s.vy1), v2 = Math.hypot(s.vx2, s.vy2), g = S.grow('after', 0.8);
      if (v1 > 0.02 && v2 > 0.02) {
        const Lr = 1.4;
        P.line([s.cp, [s.cp[0] + Math.cos(a1) * Lr, s.cp[1] + Math.sin(a1) * Lr]], { color: c1, width: 1.2, dash: [4, 4], alpha: 0.7 * g });
        P.line([s.cp, [s.cp[0] + Math.cos(a2) * Lr, s.cp[1] + Math.sin(a2) * Lr]], { color: c2, width: 1.2, dash: [4, 4], alpha: 0.7 * g });
        let d = a1 - a2;
        while (d > Math.PI) d -= 2 * Math.PI;
        while (d < -Math.PI) d += 2 * Math.PI;
        const [lo, hi] = d > 0 ? [a2, a2 + d] : [a1, a1 - d];
        angleMark(P, s.cp[0], s.cp[1], 30, lo, hi, symVal(P, '\\theta', degTeX(Math.abs(d))), { color: M.text, grow: g, alpha: 0.9 });
      }
    }

    // Bilancio in alto a sinistra: p coda-punta (prima e ora, affiancati) e barre di K.
    if (p.showBal) {
      const pad = P.cam.padFn?.() ?? { top: 70, left: 20 }, g = S.grow('bal', 0.7);
      const pmax = Math.max(p.m1 * p.v1, 1e-6), ks = 90 / pmax;
      const x0 = pad.left + 30, y0 = pad.top + 112;
      panelBg(P, x0 - 18, y0 - 104, 420, 190, g);
      const row = (label, v1x, v1y, v2x, v2y, ox) => ({ label, origin: [ox, y0], labelAt: [ox + 45, y0 + 60], titleAt: [x0, y0 - 84],
        vecs: [{ x: p.m1 * v1x * ks, y: p.m1 * v1y * ks, color: c1 }, { x: p.m2 * v2x * ks, y: p.m2 * v2y * ks, color: c2 }] });
      momentumRows(P, [row('\\text{prima}', p.v1, 0, 0, 0, x0), row('\\text{ora}', s.vx1, s.vy1, s.vx2, s.vy2, x0 + 125)], { title: '\\vec p_1+\\vec p_2', alpha: g });
      const K10 = 0.5 * p.m1 * p.v1 ** 2, { d } = overlapOf(s, p), { k } = contact(p.m1, p.m2, p.e);
      kBars(P, [
        { label: '\\text{prima}', parts: [{ v: K10, color: c1 }, { v: 0, color: c2 }] },
        { label: '\\text{ora}', parts: [{ v: 0.5 * p.m1 * (s.vx1 ** 2 + s.vy1 ** 2), color: c1 }, { v: 0.5 * p.m2 * (s.vx2 ** 2 + s.vy2 ** 2), color: c2 }, { v: d > 0 && p.e > 0.001 ? 0.5 * k * d * d : 0, color: M.vec.spring }] },
      ], K10, { x: x0 + 300, yBase: y0 + 58, h: 120, w: 16, gap: 20, alpha: g });
    }

    const ts = this.timeScale(s, p);
    if (ts < 0.97 && ui.api?.running) {
      const pad = P.cam.padFn?.() ?? { top: 70 };
      tex(P, P.cam.w / 2, pad.top + 20, '\\text{rallentatore}', { size: 16, color: M.muted, halo: M.bg, alpha: Math.min(1, (1 - ts) * 1.4) });
    }

    if (fresh) for (const h of this.handles(s, p)) P.handle(h.x, h.y, ui.active === h.id);
  },

  formulas(s, p) {
    const P0 = p.m1 * p.v1, px = p.m1 * s.vx1 + p.m2 * s.vx2, py = p.m1 * s.vy1 + p.m2 * s.vy2;
    const K0 = 0.5 * p.m1 * p.v1 ** 2, K = 0.5 * p.m1 * (s.vx1 ** 2 + s.vy1 ** 2) + 0.5 * p.m2 * (s.vx2 ** 2 + s.vy2 ** 2);
    const A = t => C('vel', t), B = t => C('weight', t);
    const after = s.tc0 != null && s.t - s.tc0 > 1.5 * TC;
    const th = after ? Math.abs(Math.atan2(s.vx1 * s.vy2 - s.vy1 * s.vx2, s.vx1 * s.vx2 + s.vy1 * s.vy2)) * 180 / Math.PI : null;
    const R = radius(p.m1) + radius(p.m2);
    return [
      { h: 'Conservazione della quantità di moto' },
      { key: true, tex: `${A('m_1\\vec v_1')}+${B('m_2\\vec v_2')}=${A("m_1\\vec v_1'")}+${B("m_2\\vec v_2'")}` },
      { tex: `P_x:\\ ${uq('kg·m/s', P0)}\\to${uq('kg·m/s', px)}\\qquad P_y:\\ 0\\to${uq('kg·m/s', py)}` },
      { h: 'Geometria dell\'urto' },
      { tex: `b=${uq('m', p.b)}\\qquad r_1+r_2=${uq('m', R)}` },
      p.b >= R && { tex: `b\\ge r_1+r_2:\\ \\text{i dischi non si toccano}`, cls: 'warn' },
      { h: 'Energia cinetica' },
      { tex: `K_{\\text{prima}}=${uq('J', K0)}\\qquad K=${uq('J', K)}` },
      th != null && { h: 'Dopo l\'urto' },
      th != null && { key: true, tex: `\\theta=${tn(th, 1)}°\\qquad |${A("\\vec v_1'")}|=${uq('m/s', Math.hypot(s.vx1, s.vy1))}\\quad |${B("\\vec v_2'")}|=${uq('m/s', Math.hypot(s.vx2, s.vy2))}` },
      th != null && p.e >= 0.999 && Math.abs(p.m1 - p.m2) < 1e-9 && p.b > 0 && { tex: `m_1=m_2,\\ \\text{urto elastico}:\\ \\theta=90°`, cls: 'warn' },
      { h: 'Istante attuale' },
      { tex: `t=${uq('s', s.t, 3)}` },
    ].filter(Boolean);
  },

  theory: `
<h2>Urti nel piano</h2>
<p>Un disco ne colpisce un altro fermo, su un tavolo senza attrito. Se l'urto non è centrale, i dischi ripartono in direzioni diverse. La distanza tra la linea di volo del disco 1 e il centro del disco 2 si chiama <b>parametro d'urto</b> $b$: con $b = 0$ l'urto è centrale (e torna unidimensionale), con $b \\ge r_1 + r_2$ i dischi non si toccano.</p>

<h3>La quantità di moto è un vettore</h3>
<p>Durante l'urto le forze tra i dischi sono uguali e opposte e dirette lungo la congiungente dei centri. Si conserva il <b>vettore</b> quantità di moto totale, cioè entrambe le componenti:</p>
$$m_1\\vec v_1 + m_2\\vec v_2 = m_1\\vec v_1' + m_2\\vec v_2'$$
$$P_x:\\ m_1 v_1 = m_1 v_{1x}' + m_2 v_{2x}' \\qquad P_y:\\ 0 = m_1 v_{1y}' + m_2 v_{2y}'$$
<p>Nel bilancio sulla scena le frecce $m_1\\vec v_1'$ e $m_2\\vec v_2'$ messe coda-punta chiudono sempre sulla stessa freccia tratteggiata: quella di prima dell'urto.</p>

<h3>Masse uguali, urto elastico: 90°</h3>
<p>Se le masse sono uguali e l'urto è elastico, dividendo per $m$:</p>
$$\\vec v_1 = \\vec v_1' + \\vec v_2' \\qquad v_1^2 = v_1'^2 + v_2'^2$$
<p>La seconda è il teorema di Pitagora applicato al triangolo della prima: i vettori $\\vec v_1'$ e $\\vec v_2'$ sono <b>perpendicolari</b>. I giocatori di biliardo lo sanno bene.</p>
<div class="box">La direzione in cui parte il disco colpito è sempre quella della congiungente dei centri nell'istante del contatto: è la direzione della forza che ha ricevuto.</div>

<h3>Urti anelastici</h3>
<p>Con $e < 1$ si perde energia cinetica e l'angolo tra le velocità finali è minore di 90°. La quantità di moto, invece, si conserva sempre.</p>

<h3>Prova con la simulazione</h3>
<ol>
  <li>Con masse uguali varia $b$: l'angolo $\\theta$ cambia? E le singole direzioni?</li>
  <li>Con $b = 0$ cosa succede? Confronta con gli urti in una dimensione.</li>
  <li>Contro un disco pesante, l'angolo è maggiore o minore di 90°?</li>
  <li>Abbassa $e$ e osserva le barre di $K$ e l'angolo.</li>
</ol>

<h3>Esercizi</h3>
<details><summary>1. Una palla da biliardo a 3 m/s urta elasticamente una ferma uguale e devia di 30°. Con che velocità ripartono?</summary>
<p>$v_1' = 3\\cos 30^\\circ \\approx 2{,}60$ m/s; $v_2' = 3\\sin 30^\\circ = 1{,}5$ m/s, a 60° dall'altra parte.</p></details>
<details><summary>2. Dopo un urto il disco 1 (1 kg) ha $\\vec v_1' = (1;\\ 1)$ m/s. Prima viaggiava a 3 m/s lungo $x$ e il disco 2 (2 kg) era fermo. Quanto vale $\\vec v_2'$?</summary>
<p>$P_x$: $3 = 1 + 2 v_{2x}' \\Rightarrow v_{2x}' = 1$ m/s; $P_y$: $0 = 1 + 2 v_{2y}' \\Rightarrow v_{2y}' = -0{,}5$ m/s.</p></details>
`,
};
