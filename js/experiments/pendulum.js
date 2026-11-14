import { rk4, tn, clamp, deg } from '../core/math.js';
import { ballM } from '../core/manim.js';
import { uq, un } from '../core/units.js';
import { Stage, C, arrowPx, symVal, degTeX, angleMark, brace } from '../core/annot.js';
import { penTrace, paperSpeed, phasor, wallM } from '../core/osc.js';

const stage = new Stage();
const TWO_PI = 2 * Math.PI;
const TRACE_DT = 1 / 60;

const w0 = p => Math.sqrt(p.g / p.L);
const ampX = p => p.L * Math.sin(Math.min(Math.abs(p.th0), 90) * deg);   // ampiezza orizzontale massima
const bobR = p => Math.max(0.08, 0.07 * p.L);

export default {
  id: 'pendulum',
  title: 'Pendolo semplice',
  subtitle: 'Piccole e grandi oscillazioni',
  axes: true,   // niente numeri sulla griglia: sotto il pendolo scorre la traccia

  params: [
    { key: 'L', label: 'Lunghezza del filo L', unit: 'm', min: 0.2, max: 5, step: 0.05, value: 1.5 },
    { key: 'th0', label: 'Angolo iniziale θ₀', unit: '°', min: -170, max: 170, step: 1, value: 20 },
    { key: 'm', label: 'Massa m', unit: 'kg', min: 0.1, max: 5, step: 0.1, value: 1 },
    { key: 'g', label: 'Gravità g', unit: 'm/s²', min: 1, max: 25, step: 0.01, value: 9.81 },
    { key: 'gam', label: 'Smorzamento γ', unit: '1/s', min: 0, max: 1, step: 0.01, value: 0 },
    { key: 'tMax', label: 'Durata della simulazione', unit: 's', min: 5, max: 300, step: 5, value: 30 },
    { key: 'showPhasor', type: 'toggle', label: 'Fasore (moto circolare)', value: false, live: true, refit: true },
    { key: 'showTrace', type: 'toggle', label: 'Traccia x(t)', value: true, live: true, refit: true },
    { key: 'showHarm', type: 'toggle', label: 'Confronto con il moto armonico', value: false, live: true },
    { key: 'showForce', type: 'toggle', label: 'Peso e sue componenti', value: false, live: true },
  ],

  presets: [
    { label: 'Piccole oscillazioni', values: { L: 1.5, th0: 10, g: 9.81, gam: 0, showHarm: true } },
    { label: 'Grandi oscillazioni', values: { L: 1.5, th0: 120, g: 9.81, gam: 0, showHarm: true } },
    { label: 'Pendolo che batte il secondo', values: { L: 0.99, th0: 8, g: 9.81, gam: 0 } },
    { label: 'Sulla Luna', values: { L: 1.5, th0: 20, g: 1.62, gam: 0 } },
    { label: 'Smorzato', values: { L: 1.5, th0: 40, g: 9.81, gam: 0.15 } },
  ],

  view(p) {
    // Lo spazio del fasore (sopra) e della traccia (sotto) si riserva solo quando sono accesi.
    const A = Math.max(ampX(p), 0.35 * p.L), above = Math.max(0, -Math.cos(p.th0 * deg)) * p.L;
    const top = Math.max(0.15 * p.L + above, p.showPhasor ? 0.2 * p.L + 2 * A + 0.1 * p.L : 0);
    const low = p.L + bobR(p), span = Math.max(p.L, ampX(p)) * 1.15;
    return { xmin: -span, xmax: span, ymin: -low - (p.showTrace ? 0.7 * (low + top) : 0.1 * p.L), ymax: top };
  },

  init(p) {
    const th = p.th0 * deg, x = p.L * Math.sin(th);
    return { t: 0, th, w: 0, trace: [[0, x]], tExt: 0, Tm: null, tEnd: p.tMax };
  },

  step(s, dt, p) {
    const f = ([th, w]) => [w, -(p.g / p.L) * Math.sin(th) - p.gam * w];
    const [th, w] = rk4([s.th, s.w], dt, f);
    // Periodo misurato: due volte l'intervallo tra due estremi consecutivi (dove ω cambia segno).
    if (s.w !== 0 && Math.sign(w) !== Math.sign(s.w) && w !== 0) {
      const tc = s.t + dt * Math.abs(s.w) / (Math.abs(s.w) + Math.abs(w));
      s.Tm = 2 * (tc - s.tExt); s.tExt = tc;
    }
    Object.assign(s, { th, w, t: s.t + dt });
    if (s.t - s.trace[s.trace.length - 1][0] >= TRACE_DT - 1e-9) s.trace.push([s.t, p.L * Math.sin(th)]);
  },

  done: s => s.t >= s.tEnd,

  sample(s, p) {
    const h = p.L * (1 - Math.cos(s.th)), v = s.w * p.L;
    const K = 0.5 * p.m * v * v, U = p.m * p.g * h;
    return { t: s.t, th: s.th / deg, thH: p.th0 * Math.cos(w0(p) * s.t), x: p.L * Math.sin(s.th), K, U, E: K + U };
  },

  graphs: [
    { title: 'Angolo', series: [{ key: 'th', label: 'θ (°)', color: 'vel' }, { key: 'thH', label: 'θ armonico (°)', color: 'muted' }] },
    { title: 'Spostamento orizzontale', series: [{ key: 'x', label: 'x (m)', color: 'vel' }] },
    { title: 'Energia', series: [{ key: 'K', label: 'K cinetica (J)', color: 'vel' }, { key: 'U', label: 'U potenziale (J)', color: 'normal' }, { key: 'E', label: 'E meccanica (J)', color: 'friction' }] },
  ],

  handles(s, p) {
    const th = p.th0 * deg;
    return [{ id: 'bob', x: p.L * Math.sin(th), y: -p.L * Math.cos(th) }];
  },

  drag(id, wx, wy, p) {
    if (id !== 'bob') return;
    p.L = clamp(Math.round(Math.hypot(wx, wy) * 20) / 20, 0.2, 5);
    p.th0 = clamp(Math.round(Math.atan2(wx, -wy) / deg), -170, 170);
  },

  mount() { stage.reset(); },

  draw(P, s, p, ui) {
    const S = stage.begin(P, ui), M = S.M, w = w0(p), sc = P.cam.scale;
    const fresh = s.t === 0, th = fresh ? p.th0 * deg : s.th, om = fresh ? 0 : s.w;
    const bx = p.L * Math.sin(th), by = -p.L * Math.cos(th), r = bobR(p);

    // Soffitto e verticale per il punto di sospensione.
    const cw = Math.max(0.25 * p.L, 40 / sc);
    wallM(P, [-cw, 0], [cw, 0], { nx: 0, ny: -1 });
    P.line([[0, 0], [0, -p.L - r * 1.5]], { color: 'muted', width: 1, dash: [3, 5], alpha: 0.55 });

    // Confronto con il moto armonico: un secondo pendolo, tenue, con θ(t) = θ₀ cos(ωt).
    if (p.showHarm) {
      const thH = p.th0 * deg * Math.cos(w * (fresh ? 0 : s.t)), hx = p.L * Math.sin(thH), hy = -p.L * Math.cos(thH);
      const a = S.grow('harm', 0.6) * 0.45;
      P.line([[0, 0], [hx, hy]], { color: 'muted', width: 1.2, alpha: a });
      P.circle(hx, hy, r * sc, { stroke: M.muted, width: 1.6, alpha: a * 1.6 });
    }

    // Filo e angolo θ dalla verticale.
    P.line([[0, 0], [bx, by]], { color: 'text', width: 1.6 });
    const thm = Math.abs(th) > Math.PI ? th - Math.sign(th) * TWO_PI : th;
    if (Math.abs(thm) > 0.03) angleMark(P, 0, 0, Math.min(46, 0.4 * p.L * sc), -Math.PI / 2, -Math.PI / 2 + thm, symVal(P, '\\theta', degTeX(Math.abs(thm))), { color: M.text, alpha: 0.9 });
    // Lunghezza del filo, a simulazione ferma.
    if (fresh && p.L * sc > 60) {
      const sd = th >= 0 ? -1 : 1;
      brace(P, [0, 0], [bx, by], symVal(P, 'L', uq('m', p.L)), { side: sd, gap: 8, grow: S.grow('braceL', 0.8), color: M.text, alpha: 0.75 });
    }
    P.circle(0, 0, 3, { fill: 'text' });

    ballM(P, M, bx, by, { r, color: 'red', grow: S.born('bob'), spin: th - Math.PI / 2 });

    // Peso e componenti: quella tangente al filo, m g sin θ, è la forza di richiamo.
    if (p.showForce) {
      const W = p.m * p.g, ref = p.m * p.g, L1 = arrowPx(W, ref, { min: 40, max: 90 }) / sc;
      P.arrow(bx, by, bx, by - L1, { color: 'weight', key: 'P', width: 3.5, label: 'P' });
      const tx = Math.cos(th), ty = Math.sin(th), Ft = -Math.sin(th);   // versore tangente (verso θ crescente) e componente
      const Lt = L1 * Ft, nx = -Math.sin(th), ny = Math.cos(th), Ln = L1 * Math.cos(th);
      if (Math.abs(Lt) * sc > 6) P.arrow(bx, by, bx + tx * Lt, by + ty * Lt, { color: 'weight', key: 'Pt', width: 2.5, dash: [5, 4], alpha: 0.85, label: 'P_t' });
      if (Math.abs(Ln) * sc > 6) P.arrow(bx, by, bx - nx * Ln, by - ny * Ln, { color: 'weight', key: 'Pn', width: 2, dash: [5, 4], alpha: 0.5 });
    }

    // Fasore: centrato sopra il punto di sospensione, la sua ombra orizzontale segue la pallina.
    if (p.showPhasor) {
      const A = Math.max(ampX(p), 0.35 * p.L), cy = 0.2 * p.L + A;
      const vx = p.L * Math.cos(th) * om, R = Math.hypot(bx, vx / w);
      phasor(P, 0, cy, R, bx, cy - vx / w, by, { grow: S.grow('phasor', 1.1), color: M.vec.vel });
    }

    // Traccia x(t) sotto la pallina.
    if (p.showTrace) {
      const [, gy] = P.S(0, -p.L - r), top = gy + 30;
      const pad = P.cam.padFn?.() ?? { bottom: 20 };
      const pxs = paperSpeed(P.cam.h - pad.bottom - 8 - top, TWO_PI / w, 3);
      penTrace(P, fresh ? [[0, bx]] : s.trace, fresh ? 0 : s.t, { top, pxs, color: M.vec.vel, grow: S.grow('trace', 0.9) });
    }

    if (fresh) P.handle(bx, by, ui.active === 'bob');
  },

  formulas(s, p) {
    const w = w0(p), T0 = TWO_PI / w, th0 = Math.abs(p.th0) * deg;
    const Tapprox = T0 * (1 + th0 * th0 / 16);
    const h = p.L * (1 - Math.cos(s.th)), v = s.w * p.L;
    const K = 0.5 * p.m * v * v, U = p.m * p.g * h;
    const big = Math.abs(p.th0) > 15;
    return [
      { h: 'Piccole oscillazioni' },
      { key: true, tex: `T_0=2\\pi\\sqrt{\\dfrac{L}{g}}=${uq('s', T0)}` },
      { tex: `\\omega=\\sqrt{\\dfrac{g}{L}}=${uq('rad/s', w)}\\qquad f=${uq('Hz', 1 / T0)}` },
      { tex: `\\theta(t)\\approx\\theta_0\\cos(\\omega t)` },
      { h: 'Periodo misurato' },
      { key: true, tex: s.Tm ? `T=${uq('s', s.Tm)}\\quad(${tn(100 * (s.Tm / T0 - 1), 1)}\\%\\ \\text{rispetto a } T_0)` : `T=\\ ?\\quad\\text{(avvia la simulazione)}` },
      big && { tex: `T\\approx T_0\\left(1+\\dfrac{\\theta_0^2}{16}\\right)=${uq('s', Tapprox)}` },
      { h: 'Istante attuale' },
      { tex: `t=${uq('s', s.t)}\\qquad \\theta=${tn(s.th / deg, 1)}°` },
      { tex: `${C('weight', 'P_t')}=-m g\\sin\\theta=${uq('N', -p.m * p.g * Math.sin(s.th))}` },
      { tex: `K=${uq('J', K)}\\qquad U=m g L(1-\\cos\\theta)=${uq('J', U)}` },
      big && { tex: `\\theta_0=${Math.abs(p.th0)}°:\\ \\sin\\theta\\not\\approx\\theta,\\ \\text{il moto non è armonico}`, cls: 'warn' },
    ].filter(Boolean);
  },

  theory: `
<h2>Pendolo semplice</h2>
<p>Una pallina di massa $m$ appesa a un filo inestensibile di lunghezza $L$, spostata dalla verticale di un angolo $\\theta_0$ e lasciata andare, oscilla avanti e indietro. Le forze sono il peso $\\vec P$ e la tensione del filo. Scomponiamo il peso lungo il filo e lungo la tangente alla traiettoria: la componente lungo il filo è bilanciata (insieme alla tensione fornisce la forza centripeta); quella tangente</p>
$$P_t = -m g \\sin\\theta$$
<p>riporta la pallina verso il basso: è la <b>forza di richiamo</b>.</p>

<h3>Piccole oscillazioni</h3>
<p>Per angoli piccoli (in radianti) $\\sin\\theta \\approx \\theta$, e lo spostamento lungo l'arco è $s = L\\theta$. Allora</p>
$$a = -\\frac{g}{L}\\,s$$
<p>che è la stessa equazione della massa e molla, con $\\omega^2 = g/L$. Il moto è <b>armonico</b>:</p>
$$\\theta(t) = \\theta_0\\cos(\\omega t) \\qquad T_0 = 2\\pi\\sqrt{\\frac{L}{g}}$$
<div class="box">Il periodo <b>non dipende dalla massa</b> e, per piccole oscillazioni, nemmeno dall'ampiezza (Galileo, il lampadario del Duomo di Pisa).</div>

<h3>Grandi oscillazioni</h3>
<p>Quando $\\theta_0$ supera una quindicina di gradi, $\\sin\\theta$ è sensibilmente più piccolo di $\\theta$: la forza di richiamo è più debole di quella armonica e il pendolo impiega <b>più tempo</b>. Una buona approssimazione è</p>
$$T \\approx T_0\\left(1 + \\frac{\\theta_0^2}{16}\\right)$$
<p>Accendi «Confronto con il moto armonico»: il pendolo tenue segue $\\theta_0\\cos(\\omega t)$; con grandi ampiezze quello vero resta indietro.</p>

<h3>Energia</h3>
<p>Prendendo come riferimento il punto più basso, l'altezza della pallina è $h = L(1 - \\cos\\theta)$. Senza attriti</p>
$$E = \\tfrac12 m v^2 + m g L(1 - \\cos\\theta) = m g L(1 - \\cos\\theta_0)$$
<p>da cui la velocità nel punto più basso: $v_{\\max} = \\sqrt{2 g L (1 - \\cos\\theta_0)}$.</p>

<h3>Prova con la simulazione</h3>
<ol>
  <li>Cambia la massa: il periodo misurato cambia?</li>
  <li>Quadruplica la lunghezza: di quanto cresce il periodo?</li>
  <li>Con «Grandi oscillazioni» confronta $T$ misurato con $T_0$. E con la formula approssimata?</li>
  <li>Che lunghezza serve per un pendolo che batte il secondo (mezzo periodo = 1 s)?</li>
  <li>Sulla Luna il periodo è più lungo o più corto? Di quanto?</li>
</ol>

<h3>Esercizi</h3>
<details><summary>1. Calcola il periodo di un pendolo lungo 2 m.</summary>
<p>$T_0 = 2\\pi\\sqrt{2/9{,}81} \\approx 2{,}84$ s.</p></details>
<details><summary>2. Un pendolo ha periodo 1,5 s. Quanto è lungo?</summary>
<p>$L = g\\,T^2 / (4\\pi^2) = 9{,}81 \\cdot 2{,}25 / 39{,}48 \\approx 0{,}56$ m.</p></details>
<details><summary>3. Un pendolo lungo 1 m parte da 30°. Con che velocità passa per il punto più basso?</summary>
<p>$v = \\sqrt{2 \\cdot 9{,}81 \\cdot 1 \\cdot (1 - \\cos 30^\\circ)} \\approx 1{,}62$ m/s.</p></details>
<details><summary>4. Su un pianeta un pendolo di 1 m ha periodo 3 s. Quanto vale $g$ lassù?</summary>
<p>$g = 4\\pi^2 L / T^2 \\approx 4{,}39$ m/s².</p></details>
`,
};
