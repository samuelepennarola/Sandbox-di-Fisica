import { tn, clamp } from '../core/math.js';
import { ball } from '../core/shapes.js';
import { uq, un, uname } from '../core/units.js';
import { Stage, brace, C, arrowPx, arrowMag, symVal } from '../core/annot.js';
import { penTrace } from '../core/osc.js';

const stage = new Stage();   // regia: freccia v che cresce, graffe che si aprono, traccia x(t) che si scrive
const RB = 0.5, MINPX = 12;  // raggio del corpo (m) e raggio minimo in px
const VREF = 10, VA = { min: 40, max: 140 };   // freccia v in scala compressa (px), come negli altri esperimenti
let SC = 30;                 // px per metro dell'ultima scena disegnata (serve alle maniglie)
let last = null;             // parametri dell'ultima scena (per pinInfo)

const vLen = v => arrowPx(Math.abs(v), VREF, VA) / SC * Math.sign(v);   // lunghezza in metri della freccia v
const xEnd = p => p.x0 + p.v * p.tMax;
const sgn = x => (x < 0 ? '-' : '+');

export default {
  id: 'uniform',
  title: 'Moto rettilineo uniforme',
  subtitle: 'Velocità costante e legge oraria x(t) = x₀ + v t',
  gridLabels: p => (p.showTrace ? 'x' : true),   // sotto il suolo l'asse verticale del grafico è il tempo

  params: [
    { key: 'x0', label: 'Posizione iniziale x₀', unit: 'm', min: -20, max: 20, step: 0.5, value: -6 },
    { key: 'v', label: 'Velocità v', unit: 'm/s', min: -10, max: 10, step: 0.1, value: 2 },
    { key: 'tMax', label: 'Durata della simulazione', unit: 's', min: 2, max: 60, step: 1, value: 8 },
    { key: 'showTrace', type: 'toggle', label: 'Grafico x(t) sulla scena', value: true, live: true, refit: true },
    { key: 'strobe', type: 'toggle', label: 'Posizioni ogni secondo', value: true, live: true },
  ],

  presets: [
    { label: 'Verso destra', values: { x0: -6, v: 2, tMax: 8 } },
    { label: 'Verso sinistra', values: { x0: 8, v: -1.5, tMax: 8 } },
    { label: 'Passa per l\'origine', values: { x0: -10, v: 2.5, tMax: 8 } },
    { label: 'Fermo', values: { x0: 3, v: 0, tMax: 6 } },
  ],

  view(p) {
    const a = Math.min(0, p.x0, xEnd(p)), b = Math.max(0, p.x0, xEnd(p));
    const m = Math.max(2, 0.12 * (b - a)), w = Math.max(b - a + 2 * m, 12);
    const c = (a + b) / 2;
    // Sotto il suolo, quando è acceso, scorre il grafico x(t): il tempo scende.
    return { xmin: c - w / 2, xmax: c + w / 2, ymin: p.showTrace ? -0.55 * w : -0.15 * w, ymax: 0.2 * w };
  },

  init(p) { return { t: 0, x: p.x0, tEnd: p.tMax, trace: [[0, p.x0]], strobe: [p.x0] }; },

  step(s, dt, p) {
    s.t = Math.min(s.t + dt, s.tEnd);
    s.x = p.x0 + p.v * s.t;
    s.trace.push([s.t, s.x]);
    if (Math.floor(s.t + 1e-9) > s.strobe.length - 1) s.strobe.push(p.x0 + p.v * Math.floor(s.t + 1e-9));
  },

  done: s => s.t >= s.tEnd,

  sample(s, p) { return { t: s.t, x: s.x, v: p.v }; },

  graphs: [
    { title: 'Posizione', series: [{ key: 'x', label: 'x (m)', color: 'vel' }] },
    { title: 'Velocità', series: [{ key: 'v', label: 'v (m/s)', color: 'vel' }] },
  ],

  resizables(s, p, { scale, size }) {
    return [{ key: 'ball', x: s.t === 0 ? p.x0 : s.x, y: RB, rPx: Math.max(RB * scale, MINPX) * size('ball') }];
  },

  handles(s, p) {
    return [{ id: 'x0', x: p.x0, y: RB }, { id: 'v', x: p.x0 + vLen(p.v), y: RB }];
  },

  drag(id, wx, wy, p) {
    if (id === 'x0') p.x0 = clamp(Math.round(wx * 2) / 2, -20, 20);
    if (id === 'v') {
      const d = (wx - p.x0) * SC;
      p.v = clamp(Math.round(Math.sign(d) * arrowMag(Math.abs(d), VREF, VA) * 10) / 10, -10, 10);
    }
  },

  // Valore di una puntina: i parametri della scena corrente (vedi pinValue in main.js).
  pinInfo(key) { return last && key in last && typeof last[key] === 'number' ? { value: last[key] } : undefined; },

  mount() { stage.reset(); },

  draw(P, s, p, ui) {
    const S = stage.begin(P, ui), M = S.M;
    if (!ui.snapshot) { SC = P.cam.scale; last = p; }
    const fresh = s.t === 0;
    // A simulazione ferma all'inizio il corpo segue x₀ e la freccia segue v (con morbidezza, salvo mentre si trascina).
    const [x0, v] = S.smooth('p', [p.x0, p.v], 0.11, !!ui.active || !fresh);
    const x = fresh ? x0 : s.x;
    const k = ui.size('ball') * S.born('ball'), rW = Math.max(RB, MINPX / P.cam.scale) * k;
    P.ground(0);
    P.text(0, 0, 'O', { color: 'muted', dy: 13, dx: -10, align: 'center', size: 12 });

    // Posizioni a intervalli di 1 s: spazi uguali in tempi uguali.
    if (p.strobe && !fresh) for (const xs of s.strobe) P.circle(xs, rW, 3.5, { fill: M.body.red, alpha: 0.55 });

    // Posizione di partenza: un'impronta tenue del corpo, con il tratteggio fino al suolo.
    if (!fresh) {
      P.circle(x0, rW, rW * P.cam.scale, { stroke: M.muted, width: 1.2, alpha: 0.6 });
      P.line([[x0, 0], [x0, 2 * rW]], { color: 'muted', width: 1, dash: [3, 4], alpha: 0.6 });
    }

    // Graffe sopra il corpo: da ferma la posizione x₀ (da O), in moto lo spostamento Δx = v t (da x₀).
    // La graffa va sempre da sinistra a destra, così sta sopra il corpo qualunque sia il verso.
    const yb = 2 * rW + 10 / P.cam.scale, up = (a, b, lab, key) => brace(P, [Math.min(a, b), yb], [Math.max(a, b), yb], lab, { side: 1, grow: S.grow(key, 0.7), color: M.text, alpha: 0.9 });
    if (fresh) {
      if (Math.abs(x0) * P.cam.scale > 16) up(0, x0, symVal(P, 'x_0', uq('m', x0)), 'braceX0');
    } else if (Math.abs(x - x0) * P.cam.scale > 16) up(x0, x, symVal(P, '\\Delta x', uq('m', x - x0)), 'braceDx');

    ball(P, x, rW, { r: RB * k, minPx: MINPX * k, color: 'red' });

    // Vettore velocità: costante, dal centro del corpo.
    if (Math.abs(v) > 1e-6) {
      const L = arrowPx(Math.abs(v), VREF, VA) / P.cam.scale * Math.sign(v);
      P.arrow(x, rW, x + L, rW, { color: 'vel', key: 'v', width: 3.5, label: 'v' });
      if (fresh) P.handle(x + L, rW, ui.active === 'v');
    }

    // Grafico x(t) sotto il suolo: il pennino sta sotto il corpo e il tempo scende; tutta la corsa sta nella carta.
    if (p.showTrace) {
      const [, gy] = P.S(0, 0), top = gy + 40;
      const pad = P.cam.padFn?.() ?? { bottom: 20 }, bottom = P.cam.h - pad.bottom - 30;   // sopra i numeri dell'asse x
      const pxs = Math.max(4, (bottom - top - 24) / Math.max(1, p.tMax));
      penTrace(P, fresh ? [[0, x0]] : s.trace, fresh ? 0 : s.t, { top, end: bottom, pxs, color: M.vec.vel, grow: S.grow('trace', 0.9), nowX: x, link: gy + 3, forward: true });
    }

    if (fresh) P.handle(x0, rW, ui.active === 'x0');
  },

  formulas(s, p) {
    const X = t => C('vel', t), Vv = C('vel', 'v');
    const m = uname('m'), ms = uname('m/s');
    const tO = Math.abs(p.v) > 1e-9 ? -p.x0 / p.v : null;
    return [
      { h: 'Legge oraria' },
      { key: true, tex: `${X('x(t)')}=x_0+${Vv}\\,t` },
      { tex: `${X('x(t)')}=${un('m', p.x0, 1)}\\ ${m}${sgn(p.v)}${un('m/s', Math.abs(p.v), 1)}\\ ${ms}\\cdot t` },
      { h: 'Velocità costante' },
      { key: true, tex: `${Vv}=\\dfrac{\\Delta x}{\\Delta t}=${uq('m/s', p.v, 1)}\\qquad a=0` },
      tO != null && tO > 0 && tO <= p.tMax && { tex: `\\text{passa per O a }t=-\\dfrac{x_0}{${Vv}}=${uq('s', tO)}` },
      { h: s.t >= s.tEnd ? 'Alla fine' : 'Istante attuale' },
      { tex: `t=${uq('s', s.t)}\\qquad ${X('x')}=${uq('m', s.x)}` },
      { tex: `\\Delta x=${Vv}\\,t=${uq('m', s.x - p.x0)}` },
      p.v === 0 && { tex: `${Vv}=0:\\ \\text{il corpo è fermo}`, cls: 'warn' },
    ].filter(Boolean);
  },

  theory: `
<h2>Moto rettilineo uniforme</h2>
<p>Un corpo si muove di <b>moto rettilineo uniforme</b> quando percorre una retta con velocità <b>costante</b>: spazi uguali in tempi uguali. L'accelerazione è nulla.</p>
$$v = \\frac{\\Delta x}{\\Delta t} = \\text{costante} \\qquad a = 0$$

<h3>Legge oraria</h3>
<p>Se all'istante $t = 0$ il corpo si trova in $x_0$:</p>
$$x(t) = x_0 + v\\,t$$
<p>Il grafico di $x(t)$ è una <b>retta</b>: l'intercetta è $x_0$, la pendenza è $v$. Il grafico di $v(t)$ è una retta orizzontale.</p>
<div class="box">Il segno di $v$ dice il <b>verso</b> del moto: $v &gt; 0$ verso le $x$ crescenti, $v &lt; 0$ verso le $x$ decrescenti. Non confondere la posizione $x$ (dove si trova il corpo) con lo spostamento $\\Delta x = x - x_0$ (quanto si è mosso).</div>

<h3>Lo spostamento è un'area</h3>
<p>Nel grafico $v(t)$ lo spostamento $\\Delta x = v\\,t$ è l'area del rettangolo di base $t$ e altezza $v$ (negativa se $v &lt; 0$).</p>

<h3>Quando passa per un punto</h3>
<p>Per sapere quando il corpo arriva in $x_1$ si risolve $x(t) = x_1$:</p>
$$t_1 = \\frac{x_1 - x_0}{v}$$
<p>Due corpi in moto uniforme si incontrano quando hanno la stessa posizione: $x_{0A} + v_A t = x_{0B} + v_B t$.</p>

<h3>Prova con la simulazione</h3>
<ol>
  <li>Con «Posizioni ogni secondo» acceso, i puntini sono equidistanti? Che cosa cambia raddoppiando $v$?</li>
  <li>Guarda il grafico x(t) sotto il suolo: come cambia la sua pendenza se $v$ diventa negativa?</li>
  <li>Trascina il corpo: quale parte del grafico cambia, la pendenza o il punto di partenza?</li>
  <li>Con «Passa per l'origine» prevedi l'istante in cui il corpo passa per O, poi verifica con la moviola.</li>
</ol>

<h3>Esercizi</h3>
<details><summary>1. Un'auto parte da $x_0 = 20$ m e viaggia a $v = 15$ m/s. Dove si trova dopo 4 s?</summary>
<p>$x = 20 + 15 \\cdot 4 = 80$ m.</p></details>
<details><summary>2. Un ciclista passa per $x_0 = 100$ m con $v = -5$ m/s. Quando arriva nell'origine?</summary>
<p>$0 = 100 - 5\\,t \\Rightarrow t = 20$ s.</p></details>
<details><summary>3. Un corpo passa da $x = 3$ m a $x = 18$ m in 6 s con velocità costante. Quanto vale $v$? Scrivi la legge oraria.</summary>
<p>$v = 15/6 = 2{,}5$ m/s; $x(t) = 3 + 2{,}5\\,t$ (in metri, con $t$ in secondi).</p></details>
<details><summary>4. A parte da O a 4 m/s; B parte nello stesso istante da 30 m a −2 m/s. Dove e quando si incontrano?</summary>
<p>$4t = 30 - 2t \\Rightarrow t = 5$ s; $x = 20$ m.</p></details>
`,
};
