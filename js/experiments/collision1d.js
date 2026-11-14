import { rk4, tn, clamp } from '../core/math.js';
import { blockM, tex } from '../core/manim.js';
import { uq, un } from '../core/units.js';
import { Stage, C, arrowPx, arrowMag } from '../core/annot.js';
import { contact, slowmo, momentumRows, kBars, panelBg } from '../core/collide.js';

const stage = new Stage();
const V = { min: 34, max: 120 };              // frecce delle velocità (px)
const TC = 0.06;
let SC = 60;                                  // px per metro dell'ultima scena disegnata (per le maniglie)

const width = m => 0.8 * Math.cbrt(m);        // il carrello più pesante è più grande (stessa densità)
const height = m => 0.75 * width(m);
const vref = p => Math.max(Math.abs(p.v1), Math.abs(p.v2), ...Object.values(ideal(p)).map(Math.abs), 0.5);

// Velocità dopo l'urto secondo la teoria (con il coefficiente di restituzione e).
function ideal(p) {
  const M = p.m1 + p.m2, P = p.m1 * p.v1 + p.m2 * p.v2, vr = p.v1 - p.v2;
  return { u1: (P - p.m2 * p.e * vr) / M, u2: (P + p.m1 * p.e * vr) / M };
}

const overlap = (s, p) => (width(p.m1) + width(p.m2)) / 2 - (s.x2 - s.x1);

function force(s, p) {
  const d = overlap(s, p);
  if (d <= 0) return 0;
  const { k, c } = contact(p.m1, p.m2, p.e);
  return k * d + c * (s.v1 - s.v2);   // positiva: spinge il 2 in avanti e l'1 indietro
}

export default {
  id: 'collision1d',
  title: 'Urti in una dimensione',
  subtitle: 'Elastici, anelastici, perfettamente anelastici',
  dt: 1 / 2000,

  params: [
    { key: 'm1', label: 'Massa del carrello 1  m₁', unit: 'kg', min: 0.2, max: 10, step: 0.1, value: 1 },
    { key: 'm2', label: 'Massa del carrello 2  m₂', unit: 'kg', min: 0.2, max: 10, step: 0.1, value: 1 },
    { key: 'v1', label: 'Velocità iniziale v₁', unit: 'm/s', min: -5, max: 5, step: 0.1, value: 2 },
    { key: 'v2', label: 'Velocità iniziale v₂', unit: 'm/s', min: -5, max: 5, step: 0.1, value: 0 },
    { key: 'x1', label: 'Posizione del carrello 1', unit: 'm', min: -4.5, max: 4.5, step: 0.05, value: -3, hidden: true },
    { key: 'x2', label: 'Posizione del carrello 2', unit: 'm', min: -4.5, max: 4.5, step: 0.05, value: 1, hidden: true },
    { key: 'e', label: 'Coefficiente di restituzione e', unit: '', min: 0, max: 1, step: 0.01, value: 1 },
    { key: 'tMax', label: 'Durata della simulazione', unit: 's', min: 2, max: 30, step: 1, value: 4 },
    { key: 'slowmo', type: 'toggle', label: 'Rallentatore all\'urto', value: true, live: true },
    { key: 'showBal', type: 'toggle', label: 'Bilancio di p e K', value: true, live: true },
    { key: 'showForce', type: 'toggle', label: 'Forze durante l\'urto', value: true, live: true },
  ],

  presets: [
    { label: 'Elastico, masse uguali', values: { m1: 1, m2: 1, v1: 2, v2: 0, e: 1, x1: -3, x2: 1 } },
    { label: 'Contro un carrello pesante', values: { m1: 1, m2: 8, v1: 2, v2: 0, e: 1, x1: -3, x2: 1 } },
    { label: 'Carrello pesante contro leggero', values: { m1: 8, m2: 1, v1: 2, v2: 0, e: 1, x1: -3, x2: 1 } },
    { label: 'Anelastico', values: { m1: 1, m2: 2, v1: 3, v2: -1, e: 0.5, x1: -3, x2: 1 } },
    { label: 'Restano uniti', values: { m1: 1, m2: 1, v1: 2, v2: 0, e: 0, x1: -3, x2: 1 } },
  ],

  view() { return { xmin: -5, xmax: 5, ymin: -0.8, ymax: 3.4 }; },

  init(p) { return { t: 0, x1: p.x1, v1: p.v1, x2: p.x2, v2: p.v2, tc0: null, tEnd: p.tMax }; },

  step(s, dt, p) {
    const { k, c } = contact(p.m1, p.m2, p.e), wsum = (width(p.m1) + width(p.m2)) / 2;
    const f = ([x1, v1, x2, v2]) => {
      const d = wsum - (x2 - x1), F = d > 0 ? k * d + c * (v1 - v2) : 0;
      return [v1, -F / p.m1, v2, F / p.m2];
    };
    const [x1, v1, x2, v2] = rk4([s.x1, s.v1, s.x2, s.v2], dt, f);
    Object.assign(s, { x1, v1, x2, v2, t: s.t + dt });
    if (s.tc0 == null && overlap(s, p) > 0) s.tc0 = s.t;
  },

  done: s => s.t >= s.tEnd,

  // Rallentatore: vicino al contatto il tempo scorre molto più piano.
  timeScale(s, p) {
    if (!p.slowmo) return 1;
    const d = overlap(s, p), closing = s.v1 - s.v2;
    const inC = s.tc0 != null && s.t - s.tc0 < 1.5 * TC;
    const ttc = s.tc0 == null && closing > 0 ? -d / closing : Infinity;
    const since = s.tc0 != null && !inC ? s.t - s.tc0 - 1.5 * TC : Infinity;
    return slowmo(inC, ttc, since);
  },

  sample(s, p) {
    const p1 = p.m1 * s.v1, p2 = p.m2 * s.v2, K1 = 0.5 * p.m1 * s.v1 ** 2, K2 = 0.5 * p.m2 * s.v2 ** 2;
    return { t: s.t, v1: s.v1, v2: s.v2, p1, p2, P: p1 + p2, K1, K2, K: K1 + K2, F: force(s, p) };
  },

  graphs: [
    { title: 'Velocità', series: [{ key: 'v1', label: 'v₁ (m/s)', color: 'vel' }, { key: 'v2', label: 'v₂ (m/s)', color: 'weight' }] },
    { title: 'Quantità di moto', series: [{ key: 'p1', label: 'p₁ (kg·m/s)', color: 'vel' }, { key: 'p2', label: 'p₂ (kg·m/s)', color: 'weight' }, { key: 'P', label: 'P totale (kg·m/s)', color: 'friction' }] },
    { title: 'Energia cinetica', series: [{ key: 'K1', label: 'K₁ (J)', color: 'vel' }, { key: 'K2', label: 'K₂ (J)', color: 'weight' }, { key: 'K', label: 'K totale (J)', color: 'friction' }] },
    { title: 'Forza di contatto', series: [{ key: 'F', label: 'F (N)', color: 'applied' }] },
  ],

  handles(s, p) {
    const r = vref(p), h = [];
    for (const [i, x, v, m] of [[1, p.x1, p.v1, p.m1], [2, p.x2, p.v2, p.m2]]) {
      const L = arrowPx(v, r, V) / SC * Math.sign(v || 1);
      h.push({ id: 'v' + i, x: x + (Math.abs(v) < 1e-9 ? 0.6 * Math.sign(i === 1 ? 1 : -1) : L), y: height(m) + 0.35 });
    }
    // Anche i carrelli si spostano trascinandoli.
    h.push({ id: 'c1', x: p.x1, y: height(p.m1) / 2 }, { id: 'c2', x: p.x2, y: height(p.m2) / 2 });
    return h;
  },

  drag(id, wx, wy, p) {
    if (id[0] === 'c') {
      // Il carrello 1 resta a sinistra del 2, senza sovrapporsi.
      const gap = (width(p.m1) + width(p.m2)) / 2 + 0.05, x = clamp(Math.round(wx * 20) / 20, -4.5, 4.5);
      if (id === 'c1') p.x1 = Math.min(x, p.x2 - gap); else p.x2 = Math.max(x, p.x1 + gap);
      return;
    }
    const i = id === 'v1' ? 1 : 2, x = p['x' + i], dx = wx - x, r = vref({ ...p, ['v' + i]: 5 });
    p['v' + i] = clamp(Math.round(Math.sign(dx) * arrowMag(Math.abs(dx) * SC, r, V) * 10) / 10, -5, 5);
  },

  // I carrelli per il diagramma di corpo libero: peso, reazione della rotaia e forza di contatto durante l'urto.
  bodies(s, p, { scale }) {
    const F = force(s, p), g = 9.81;
    return [[1, s.x1, s.v1, p.m1, -F, 'vel'], [2, s.x2, s.v2, p.m2, F, 'weight']].map(([i, x, v, m, Fc, col]) => {
      const forces = [{ name: 'P', fx: 0, fy: -m * g, color: 'weight' }, { name: 'N', fx: 0, fy: m * g, color: 'normal' }];
      if (Math.abs(Fc) > 1e-6) forces.push({ name: i === 1 ? 'F_{21}' : 'F_{12}', fx: Fc, fy: 0, color: 'applied' });
      return { key: 'c' + i, title: `\\text{il carrello ${i}}`, x, y: height(m) / 2, rPx: width(m) * scale / 2, m, forces,
        a: [Fc / m, 0], v: [v, 0], color: col, noResize: true };
    });
  },

  mount() { stage.reset(); },

  draw(P, s, p, ui) {
    const S = stage.begin(P, ui), M = S.M, sc = P.cam.scale;
    if (!ui.snapshot) SC = sc;
    const fresh = s.t === 0, c1 = M.body.blue, c2 = M.body.red;
    P.ground(0);

    // Carrelli.
    const bodies = [[1, s.x1, s.v1, p.m1, 'blue'], [2, s.x2, s.v2, p.m2, 'red']];
    for (const [i, x, , m, col] of bodies) {
      blockM(P, M, x, height(m) / 2, { w: width(m), h: height(m), color: col, grow: S.born('c' + i) });
      tex(P, ...P.S(x, height(m) / 2), `m_${i}`, { size: 16, color: M.text, halo: M.bg, alpha: 0.9 });
    }

    // Velocità sopra i carrelli (scala compressa in px).
    const r = vref(p);
    for (const [i, x, v, m] of bodies) {
      if (Math.abs(v) < 1e-3) continue;
      const L = arrowPx(v, r, V) / sc * Math.sign(v), y = height(m) + 0.35;
      P.arrow(x, y, x + L, y, { color: i === 1 ? c1 : c2, key: 'v' + i, width: 3.5, label: `v_${i}` });
    }

    // Forze di contatto (azione e reazione) durante l'urto.
    const F = force(s, p);
    if (p.showForce && F > 1e-6 && ui.sel !== 'c1' && ui.sel !== 'c2') {
      const { k } = contact(p.m1, p.m2, p.e), Fpk = Math.sqrt(k * p.m1 * p.m2 / (p.m1 + p.m2)) * Math.max(Math.abs(p.v1 - p.v2), 0.1);
      const L = arrowPx(F, Fpk, { min: 30, max: 90 }) / sc, xc = (s.x1 + width(p.m1) / 2 + s.x2 - width(p.m2) / 2) / 2;
      const y = Math.min(height(p.m1), height(p.m2)) * 0.45;
      P.arrow(xc, y, xc + L, y, { color: 'applied', key: 'F21', width: 3, label: 'F_{12}' });
      P.arrow(xc, y, xc - L, y, { color: 'applied', key: 'F12', width: 3, label: 'F_{21}' });
    }

    // Bilancio, in alto a sinistra: p coda-punta (prima / ora) e barre di K (prima / ora).
    if (p.showBal) {
      const pad = P.cam.padFn?.() ?? { top: 70, left: 20 }, g = S.grow('bal', 0.7);
      const id = ideal(p), pmax = Math.max(Math.abs(p.m1 * p.v1) + Math.abs(p.m2 * p.v2), Math.abs(p.m1 * id.u1) + Math.abs(p.m2 * id.u2), 1e-6);
      const ks = 150 / pmax, x0 = pad.left + 70, w = 300, oX = x0 + w / 2, y0 = pad.top + 50;
      panelBg(P, x0 - 64, y0 - 44, w + 64 + 150, 150, g);
      const row = (label, v1, v2, y) => ({ label, origin: [oX, y], labelAt: [x0 - 4, y], sumOffset: [0, 9],
        vecs: [{ x: p.m1 * v1 * ks, y: 0, color: c1 }, { x: p.m2 * v2 * ks, y: 0, color: c2 }] });
      momentumRows(P, [row('\\text{prima}', p.v1, p.v2, y0), row('\\text{ora}', s.v1, s.v2, y0 + 48)], { title: '\\vec p_1+\\vec p_2', alpha: g, titleAt: null });
      // Energia elastica immagazzinata nel contatto (solo durante l'urto).
      const d = Math.max(0, overlap(s, p)), { k } = contact(p.m1, p.m2, p.e);
      const K10 = 0.5 * p.m1 * p.v1 ** 2, K20 = 0.5 * p.m2 * p.v2 ** 2;
      kBars(P, [
        { label: '\\text{prima}', parts: [{ v: K10, color: c1 }, { v: K20, color: c2 }] },
        { label: '\\text{ora}', parts: [{ v: 0.5 * p.m1 * s.v1 ** 2, color: c1 }, { v: 0.5 * p.m2 * s.v2 ** 2, color: c2 }, { v: d > 0 && p.e > 0.001 ? 0.5 * k * d * d : 0, color: M.vec.spring }] },
      ], K10 + K20, { x: x0 + w + 40, yBase: y0 + 82, h: 105, w: 18, gap: 22, alpha: g });
    }

    // Scritta del rallentatore.
    const ts = this.timeScale(s, p);
    if (ts < 0.97 && ui.api?.running) {
      const pad = P.cam.padFn?.() ?? { top: 70 };
      tex(P, P.cam.w / 2, pad.top + 20, '\\text{rallentatore}', { size: 16, color: M.muted, halo: M.bg, alpha: Math.min(1, (1 - ts) * 1.4) });
    }

    if (fresh) for (const h of this.handles(s, p)) P.handle(h.x, h.y, ui.active === h.id);
  },

  formulas(s, p) {
    const id = ideal(p), P0 = p.m1 * p.v1 + p.m2 * p.v2, K0 = 0.5 * p.m1 * p.v1 ** 2 + 0.5 * p.m2 * p.v2 ** 2;
    const Kf = 0.5 * p.m1 * id.u1 ** 2 + 0.5 * p.m2 * id.u2 ** 2, Pnow = p.m1 * s.v1 + p.m2 * s.v2;
    const K = 0.5 * p.m1 * s.v1 ** 2 + 0.5 * p.m2 * s.v2 ** 2;
    const A = t => C('vel', t), B = t => C('weight', t);
    const kind = p.e >= 0.999 ? 'elastico' : p.e <= 0.001 ? 'perfettamente anelastico' : 'anelastico';
    return [
      { h: `Urto ${kind}` },
      { key: true, tex: `${A('m_1v_1')}+${B('m_2v_2')}=${A("m_1v_1'")}+${B("m_2v_2'")}=${uq('kg·m/s', P0)}` },
      { tex: `e=-\\dfrac{v_2'-v_1'}{v_2-v_1}=${tn(p.e, 2)}` },
      { h: 'Velocità dopo l\'urto' },
      { key: true, tex: `${A("v_1'")}=${uq('m/s', id.u1)}\\qquad ${B("v_2'")}=${uq('m/s', id.u2)}` },
      p.e >= 0.999 && { tex: `v_1'=\\dfrac{(m_1-m_2)v_1+2m_2v_2}{m_1+m_2}\\qquad v_2'=\\dfrac{(m_2-m_1)v_2+2m_1v_1}{m_1+m_2}` },
      p.e <= 0.001 && { tex: `v'=\\dfrac{m_1v_1+m_2v_2}{m_1+m_2}` },
      { h: 'Energia cinetica' },
      { tex: `K_{\\text{prima}}=${uq('J', K0)}\\qquad K_{\\text{dopo}}=${uq('J', Kf)}` },
      p.e < 0.999 && { tex: `\\Delta K=${uq('J', Kf - K0)}\\ \\ (${tn(100 * (K0 - Kf) / Math.max(K0, 1e-9), 0)}\\%\\ \\text{dissipata})`, cls: 'warn' },
      { h: 'Istante attuale' },
      { tex: `t=${uq('s', s.t, 3)}\\qquad ${A('v_1')}=${uq('m/s', s.v1)}\\qquad ${B('v_2')}=${uq('m/s', s.v2)}` },
      { tex: `P=${uq('kg·m/s', Pnow)}\\qquad K=${uq('J', K)}` },
      force(s, p) > 0 && { tex: `F=${uq('N', force(s, p), 1)}\\ \\ \\text{(azione e reazione)}`, cls: 'warn' },
    ].filter(Boolean);
  },

  theory: `
<h2>Urti in una dimensione</h2>
<p>Due carrelli su una rotaia senza attrito si scontrano. Durante l'urto si scambiano forze molto intense per un tempo molto breve; per il terzo principio le due forze sono <b>uguali e opposte</b>, $\\vec F_{12} = -\\vec F_{21}$. Accendi il rallentatore per vederle.</p>

<h3>Quantità di moto</h3>
<p>La quantità di moto di un corpo è $\\vec p = m\\vec v$. Per il secondo principio $\\vec F = \\Delta\\vec p / \\Delta t$: la forza che il carrello 1 riceve cambia $\\vec p_1$, quella uguale e opposta cambia $\\vec p_2$ della stessa quantità in verso opposto. Quindi la <b>quantità di moto totale si conserva</b>:</p>
$$m_1 v_1 + m_2 v_2 = m_1 v_1' + m_2 v_2'$$
<p>Nel bilancio sulla scena le frecce $\\vec p_1$ e $\\vec p_2$ sono messe coda-punta: la loro somma (tratteggiata) è la stessa prima e dopo l'urto, anche se le singole frecce cambiano.</p>
<div class="box">La quantità di moto si conserva in <b>ogni</b> urto, purché non agiscano forze esterne. L'energia cinetica, invece, no.</div>

<h3>Coefficiente di restituzione</h3>
$$e = -\\frac{v_2' - v_1'}{v_2 - v_1}$$
<p>È il rapporto tra la velocità con cui i corpi si allontanano dopo l'urto e quella con cui si avvicinavano prima.</p>
<ul>
  <li>$e = 1$: urto <b>elastico</b>, l'energia cinetica si conserva;</li>
  <li>$0 < e < 1$: urto <b>anelastico</b>, parte dell'energia cinetica diventa calore, suono, deformazione;</li>
  <li>$e = 0$: urto <b>perfettamente anelastico</b>, i corpi restano uniti; è il caso in cui si perde più energia.</li>
</ul>

<h3>Urto elastico</h3>
$$v_1' = \\frac{(m_1 - m_2)\\,v_1 + 2 m_2 v_2}{m_1 + m_2} \\qquad v_2' = \\frac{(m_2 - m_1)\\,v_2 + 2 m_1 v_1}{m_1 + m_2}$$
<p>Casi notevoli con il carrello 2 fermo: a masse uguali i carrelli si <b>scambiano le velocità</b>; contro un corpo molto pesante il carrello 1 rimbalza quasi con la stessa velocità; un corpo molto pesante contro uno leggero prosegue quasi indisturbato e lancia il leggero al doppio della sua velocità.</p>

<h3>Urto perfettamente anelastico</h3>
$$v' = \\frac{m_1 v_1 + m_2 v_2}{m_1 + m_2}$$

<h3>Prova con la simulazione</h3>
<ol>
  <li>Con masse uguali e urto elastico, cosa succede alle velocità? Guarda le barre di $K$.</li>
  <li>Durante l'urto elastico, dove «va» l'energia cinetica che sembra sparire per un attimo?</li>
  <li>Con «Restano uniti», quanta energia si perde? Prova a raddoppiare $m_2$.</li>
  <li>Nel grafico <i>Forza di contatto</i>, l'area sotto la curva è l'impulso $J = \\Delta p$: confrontala con la variazione di $p_1$.</li>
</ol>

<h3>Esercizi</h3>
<details><summary>1. Un carrello di 2 kg a 3 m/s urta e resta attaccato a uno di 1 kg fermo. Velocità finale e energia persa?</summary>
<p>$v' = 6/3 = 2$ m/s; $K$ passa da 9 J a 6 J: si perdono 3 J.</p></details>
<details><summary>2. Urto elastico: 1 kg a 4 m/s contro 3 kg fermo. Velocità dopo l'urto?</summary>
<p>$v_1' = (1-3)\\cdot 4/4 = -2$ m/s; $v_2' = 2\\cdot 1\\cdot 4/4 = 2$ m/s.</p></details>
<details><summary>3. Una pallina cade da 1 m e rimbalza fino a 64 cm. Quanto vale $e$?</summary>
<p>$e = v'/v = \\sqrt{h'/h} = 0{,}8$.</p></details>
`,
};
