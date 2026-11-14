import { rk4, tn, clamp } from '../core/math.js';
import { blockM } from '../core/manim.js';
import { uq, un } from '../core/units.js';
import { Stage, brace, C, arrowPx, symVal, degTeX, angleMark } from '../core/annot.js';
import { penTrace, paperSpeed, phasor, coilSpring, wallM, energyBars } from '../core/osc.js';

const stage = new Stage();
const TWO_PI = 2 * Math.PI;
const LS = 1.0, BW = 0.4, BH = 0.4;     // lunghezza a riposo della molla, larghezza e altezza del blocco (m)
const XW = -(LS + BW / 2);              // posizione della parete
const TRACE_DT = 1 / 60;

const w0 = p => Math.sqrt(p.k / p.m);
const ampView = p => Math.max(Math.abs(p.x0), 0.25);

function accel(p, x, v, t) {
  return (-p.k * x - p.b * v + p.F0 * Math.cos(TWO_PI * p.ff * t)) / p.m;
}

export default {
  id: 'spring',
  title: 'Massa e molla',
  subtitle: 'Oscillatore armonico, smorzato e forzato',
  axes: true,   // niente numeri sulla griglia: sotto il suolo scorre la traccia, dove l'asse verticale è il tempo

  params: [
    { key: 'm', label: 'Massa m', unit: 'kg', min: 0.1, max: 5, step: 0.05, value: 1 },
    { key: 'k', label: 'Costante elastica k', unit: 'N/m', min: 1, max: 200, step: 1, value: 40 },
    { key: 'x0', label: 'Spostamento iniziale x₀', unit: 'm', min: -0.5, max: 0.5, step: 0.01, value: 0.3 },
    { key: 'b', label: 'Smorzamento b', unit: 'kg/s', min: 0, max: 10, step: 0.05, value: 0 },
    { key: 'F0', label: 'Forzante F₀', unit: 'N', min: 0, max: 10, step: 0.1, value: 0 },
    { key: 'ff', label: 'Frequenza della forzante f_F', unit: 'Hz', min: 0.05, max: 3, step: 0.01, value: 0.5 },
    { key: 'tMax', label: 'Durata della simulazione', unit: 's', min: 5, max: 300, step: 5, value: 30 },
    { key: 'showPhasor', type: 'toggle', label: 'Fasore (moto circolare)', value: false, live: true, refit: true },
    { key: 'showTrace', type: 'toggle', label: 'Traccia x(t)', value: true, live: true, refit: true },
    { key: 'showForce', type: 'toggle', label: 'Forza elastica', value: true, live: true },
    { key: 'showEnergy', type: 'toggle', label: 'Barre delle energie', value: false, live: true },
  ],

  presets: [
    { label: 'Oscillazione libera', values: { m: 1, k: 40, x0: 0.3, b: 0, F0: 0 } },
    { label: 'Smorzata', values: { m: 1, k: 40, x0: 0.4, b: 1.2, F0: 0 } },
    { label: 'Risonanza', values: { m: 1, k: 40, x0: 0, b: 0.8, F0: 2, ff: 1.01 } },
    { label: 'Fuori risonanza', values: { m: 1, k: 40, x0: 0, b: 0.8, F0: 2, ff: 2.2 } },
  ],

  view(p) {
    const A = ampView(p), top = p.showPhasor ? BH + 0.25 + 2 * A + 0.15 : BH + 0.6;
    return { xmin: XW - 0.6, xmax: 0.75, ymin: p.showTrace ? -1.25 * top : -0.3, ymax: top };
  },

  init(p) { return { t: 0, x: p.x0, v: 0, trace: [[0, p.x0]], hit: false, tEnd: p.tMax }; },

  step(s, dt, p) {
    const [x, v, t] = rk4([s.x, s.v, s.t], dt, ([x, v, t]) => [v, accel(p, x, v, t), 1]);
    Object.assign(s, { x, v, t });
    if (t - s.trace[s.trace.length - 1][0] >= TRACE_DT - 1e-9) s.trace.push([t, x]);
    // Oltre questo limite le spire si toccherebbero (o la molla si strapperebbe): la simulazione si ferma.
    if (Math.abs(x) > 0.9 * LS) s.hit = true;
  },

  done: s => s.hit || s.t >= s.tEnd,

  sample(s, p) {
    const K = 0.5 * p.m * s.v * s.v, U = 0.5 * p.k * s.x * s.x;
    return { t: s.t, x: s.x, v: s.v, a: accel(p, s.x, s.v, s.t), K, U, E: K + U };
  },

  graphs: [
    { title: 'Posizione', series: [{ key: 'x', label: 'x (m)', color: 'vel' }] },
    { title: 'Velocità e accelerazione', series: [{ key: 'v', label: 'v (m/s)', color: 'vel' }, { key: 'a', label: 'a (m/s²)', color: 'acc' }] },
    { title: 'Energia', series: [{ key: 'K', label: 'K cinetica (J)', color: 'vel' }, { key: 'U', label: 'U elastica (J)', color: 'spring' }, { key: 'E', label: 'E meccanica (J)', color: 'friction' }] },
  ],

  handles(s, p) { return [{ id: 'x0', x: p.x0, y: BH / 2 }]; },

  // Il blocco per il diagramma di corpo libero: peso, reazione del piano, forza elastica, smorzamento, forzante.
  bodies(s, p, { scale, size }) {
    const kz = size('block'), x = s.t === 0 ? p.x0 : s.x, v = s.t === 0 ? 0 : s.v, t = s.t;
    const forces = [
      { name: 'P', fx: 0, fy: -p.m * 9.81, color: 'weight' },
      { name: 'N', fx: 0, fy: p.m * 9.81, color: 'normal' },
      { name: 'F_{el}', fx: -p.k * x, fy: 0, color: 'spring' },
    ];
    if (p.b > 0) forces.push({ name: 'F_v', fx: -p.b * v, fy: 0, color: 'friction' });
    if (p.F0 > 0) forces.push({ name: 'F', fx: p.F0 * Math.cos(TWO_PI * p.ff * t), fy: 0, color: 'applied' });
    return [{ key: 'block', title: '\\text{il blocco}', x, y: BH * kz / 2, rPx: Math.max(BW, BH) * kz * scale / 2, m: p.m,
      forces, a: [accel(p, x, v, t), 0], v: [v, 0], color: 'vel' }];
  },

  drag(id, wx, wy, p) {
    if (id === 'x0') p.x0 = clamp(Math.round(wx * 100) / 100, -0.5, 0.5);
  },

  mount() { stage.reset(); },

  draw(P, s, p, ui) {
    const S = stage.begin(P, ui), M = S.M, w = w0(p);
    // Il tempo della simulazione ha senso solo se lo stato è stato calcolato con questi parametri:
    // a simulazione ferma all'inizio il blocco segue x₀.
    const fresh = s.t === 0, x = fresh ? p.x0 : s.x, v = fresh ? 0 : s.v;

    P.ground(0);
    wallM(P, [XW, 0], [XW, BH + 0.45], { nx: -1, ny: 0 });
    // Posizione di equilibrio: linea tenue con la O.
    P.line([[0, 0], [0, BH + 0.05]], { color: 'muted', width: 1, dash: [3, 4], alpha: 0.6 });
    P.text(0, 0, 'O', { color: 'muted', dy: 13, dx: -12, align: 'center', size: 12 });

    const kz = ui.size?.('block') ?? 1;   // ingrandimento solo estetico del blocco (maniglia quadrata)
    coilSpring(P, [XW, BH / 2], [x - BW * kz / 2, BH / 2], { coils: 11, amp: Math.max(6, 0.09 * P.cam.scale * BH) });
    blockM(P, M, x, BH * kz / 2, { w: BW * kz, h: BH * kz, color: 'blue', grow: S.born('block') });

    // Spostamento: graffa da O al blocco, con il valore (a simulazione ferma è x₀, poi x(t)).
    if (Math.abs(x) * P.cam.scale > 14) {
      brace(P, [0, BH], [x, BH], symVal(P, fresh ? 'x_0' : 'x', uq('m', x)), { side: x > 0 ? 1 : -1, gap: 6, grow: S.grow('braceX', 0.7), color: M.text, alpha: p.showPhasor ? 0.35 : 0.9 });
    }

    // Forza elastica e forzante, in scala compressa (px) per restare leggibili.
    if (p.showForce && ui.sel !== 'block') {   // con il blocco selezionato parla il diagramma di corpo libero
      const F = -p.k * x, ref = p.k * 0.5;
      const L = arrowPx(F, ref, { min: 30, max: 110 }) / P.cam.scale * Math.sign(F);
      const e = x + Math.sign(F) * BW / 2;   // la freccia parte dal lato del blocco verso cui tira
      if (Math.abs(L) > 1e-6) P.arrow(e, BH * 0.32, e + L, BH * 0.32, { color: 'spring', key: 'Fel', width: 3.5, label: 'F_{el}' });
      if (p.F0 > 0) {
        const Ff = p.F0 * Math.cos(TWO_PI * p.ff * (fresh ? 0 : s.t));
        const Lf = arrowPx(Ff, ref, { min: 24, max: 110 }) / P.cam.scale * Math.sign(Ff);
        const ef = x + Math.sign(Ff) * BW / 2;
        if (Math.abs(Lf) > 1e-6) P.arrow(ef, BH * 0.72, ef + Lf, BH * 0.72, { color: 'applied', key: 'Ff', width: 3, label: 'F' });
      }
    }

    // Fasore su richiesta: la circonferenza si disegna, poi il vettore; la sua ombra sull'asse x è il blocco.
    if (p.showPhasor) {
      const A0 = ampView(p), cy = BH + 0.25 + A0, R = Math.hypot(x, v / w);
      const tipX = x, tipY = cy - v / w;
      phasor(P, 0, cy, R, tipX, tipY, BH, { grow: S.grow('phasor', 1.1), color: M.vec.vel });
      const ph = Math.atan2(tipY - cy, tipX), phm = ((ph % TWO_PI) + TWO_PI) % TWO_PI;
      if (R * P.cam.scale > 30 && S.grow('phasor', 1.1) > 0.98 && phm > 0.05)
        angleMark(P, 0, cy, 22, 0, phm, symVal(P, '\\varphi', degTeX(phm)), { color: M.text, alpha: 0.8 });
    }

    // Traccia x(t): parte sotto il suolo e scende; la carta scorre in modo che si vedano circa tre periodi.
    const [, gy] = P.S(0, 0), top = gy + 34;
    if (p.showTrace) {
      const pad = P.cam.padFn?.() ?? { bottom: 20 };
      const pxs = paperSpeed(P.cam.h - pad.bottom - 8 - top, TWO_PI / w, 3);
      const pts = fresh ? [[0, p.x0]] : s.trace;
      penTrace(P, pts, fresh ? 0 : s.t, { top, pxs, color: M.vec.vel, grow: S.grow('trace', 0.9), nowX: x });
      const [bx] = P.S(x, 0);
      P.ctx.save(); P.ctx.strokeStyle = M.vec.vel; P.ctx.globalAlpha = 0.35; P.ctx.setLineDash([2, 4]); P.ctx.lineWidth = 1;
      P.ctx.beginPath(); P.ctx.moveTo(bx, gy + 3); P.ctx.lineTo(bx, top - 5); P.ctx.stroke(); P.ctx.restore();
    }

    if (p.showEnergy) {
      const K = 0.5 * p.m * v * v, U = 0.5 * p.k * x * x;
      const Emax = Math.max(0.5 * p.k * p.x0 * p.x0, 0.5 * p.k * 0.0625);
      // A sinistra della parete, dove la scena è libera.
      const [wx] = P.S(XW, 0), padT = P.cam.padFn?.().top ?? 70, h = Math.min(140, gy - 14 - padT - 30);
      if (h > 40) energyBars(P, wx - 3 * 26 - 18, gy - 14, [
        { v: K, color: M.vec.vel, name: 'K' }, { v: U, color: M.vec.spring, name: 'U' }, { v: K + U, color: M.vec.friction, name: 'E' },
      ], Emax, { h });
    }

    if (fresh) P.handle(p.x0, BH / 2, ui.active === 'x0');
  },

  formulas(s, p) {
    const w = w0(p), T = TWO_PI / w, f = 1 / T;
    const K = 0.5 * p.m * s.v * s.v, U = 0.5 * p.k * s.x * s.x;
    const X = t => C('vel', t), Fe = C('spring', 'F_{el}');
    const forced = p.F0 > 0, damped = p.b > 0;
    const near = forced && Math.abs(p.ff - f) / f < 0.08;
    return [
      { h: 'Legge di Hooke' },
      { tex: `${Fe}=-k\\,x\\qquad a=-\\dfrac{k}{m}\\,x` },
      { h: 'Periodo e frequenza' },
      { key: true, tex: `T=2\\pi\\sqrt{\\dfrac{m}{k}}=${uq('s', T)}\\qquad f=\\dfrac1T=${uq('Hz', f)}` },
      { tex: `\\omega=\\sqrt{\\dfrac{k}{m}}=${uq('rad/s', w)}` },
      { h: 'Legge oraria' },
      !forced && !damped && { key: true, tex: `${X('x(t)')}=A\\cos(\\omega t)=${un('m', p.x0)}\\cos(${tn(w, 2)}\\,t)` },
      damped && !forced && { key: true, tex: `${X('x(t)')}\\approx A\\,e^{-t/\\tau}\\cos(\\omega t)\\qquad \\tau=\\dfrac{2m}{b}=${uq('s', 2 * p.m / p.b)}` },
      forced && { key: true, tex: `f_F=${uq('Hz', p.ff)}\\qquad f_0=${uq('Hz', f)}` },
      { tex: `v_{\\max}=\\omega A\\qquad a_{\\max}=\\omega^2 A` },
      { h: s.hit ? 'Spire a contatto' : 'Istante attuale' },
      { tex: `t=${uq('s', s.t)}\\qquad ${X('x')}=${uq('m', s.x)}\\qquad v=${uq('m/s', s.v)}` },
      { tex: `K=\\tfrac12 m v^2=${uq('J', K)}\\qquad U=\\tfrac12 k x^2=${uq('J', U)}` },
      { tex: `E=K+U=${uq('J', K + U)}` },
      near && { tex: `f_F\\approx f_0:\\ \\text{risonanza!}`, cls: 'warn' },
      s.hit && { tex: `|x|>${uq('m', 0.9 * LS)}:\\ \\text{la molla non regge}`, cls: 'warn' },
    ].filter(Boolean);
  },

  theory: `
<h2>Massa e molla</h2>
<p>Un corpo di massa $m$ attaccato a una molla di costante elastica $k$, su un piano senza attrito, oscilla attorno alla <b>posizione di equilibrio</b> O, dove la molla non è né tesa né compressa. Se $x$ è lo spostamento da O, la molla esercita la forza di <b>Hooke</b>:</p>
$$F_{el} = -k\\,x$$
<p>Il segno meno dice che la forza è sempre <b>di richiamo</b>: punta verso O. Per il secondo principio:</p>
$$a = -\\frac{k}{m}\\,x = -\\omega^2 x \\qquad \\omega = \\sqrt{\\frac{k}{m}}$$
<p>Un moto in cui l'accelerazione è proporzionale allo spostamento e di verso opposto si chiama <b>moto armonico</b>.</p>

<h3>Legge oraria</h3>
$$x(t) = A\\cos(\\omega t + \\varphi) \\qquad v(t) = -\\omega A\\sin(\\omega t + \\varphi) \\qquad a(t) = -\\omega^2 A\\cos(\\omega t + \\varphi)$$
<p>$A$ è l'<b>ampiezza</b> (lo spostamento massimo) e $\\varphi$ la fase iniziale. Se il corpo parte fermo da $x_0$, allora $A = x_0$ e $\\varphi = 0$.</p>
$$T = 2\\pi\\sqrt{\\frac{m}{k}} \\qquad f = \\frac1T$$
<div class="box">Il periodo <b>non dipende dall'ampiezza</b>: piccole o grandi, le oscillazioni durano lo stesso tempo (isocronismo).</div>

<h3>Il legame con il moto circolare</h3>
<p>Accendi «Fasore»: un punto che gira di moto circolare uniforme con velocità angolare $\\omega$ su una circonferenza di raggio $A$ ha come <b>ombra</b> sul diametro orizzontale proprio $x(t) = A\\cos(\\omega t)$. Il moto armonico è la proiezione di un moto circolare uniforme: per questo compaiono $\\omega$, il coseno e un periodo $2\\pi/\\omega$.</p>

<h3>Energia</h3>
$$E = \\tfrac12 m v^2 + \\tfrac12 k x^2 = \\tfrac12 k A^2 = \\text{costante}$$
<p>L'energia passa di continuo dalla forma elastica (massima agli estremi, dove $v = 0$) a quella cinetica (massima in O, dove $x = 0$).</p>

<h3>Smorzamento</h3>
<p>Con un attrito proporzionale alla velocità, $F = -b\\,v$, l'ampiezza diminuisce nel tempo e l'energia si dissipa. Se lo smorzamento è piccolo il corpo continua a oscillare con quasi lo stesso periodo, dentro un <b>inviluppo</b> che si restringe; se è grande torna in O senza oscillare.</p>

<h3>Oscillazioni forzate e risonanza</h3>
<p>Se una forza esterna periodica di frequenza $f_F$ spinge il corpo, dopo un transitorio il corpo oscilla alla frequenza $f_F$ della forzante, non alla propria. L'ampiezza è tanto più grande quanto più $f_F$ è vicina alla frequenza propria $f_0$: è la <b>risonanza</b>. Con poco smorzamento l'ampiezza a risonanza può diventare enorme (ponti, bicchieri, altalene spinte al momento giusto).</p>

<h3>Prova con la simulazione</h3>
<ol>
  <li>Raddoppia l'ampiezza: il periodo cambia? Guarda la traccia.</li>
  <li>Quadruplica la massa: di quanto cresce il periodo?</li>
  <li>Accendi le barre delle energie: dove è massima $K$? Dove è massima $U$?</li>
  <li>Con «Risonanza» confronta l'ampiezza raggiunta con quella di «Fuori risonanza».</li>
  <li>Accendi il fasore con «Smorzata»: che figura descrive la punta del vettore?</li>
</ol>

<h3>Esercizi</h3>
<details><summary>1. Una massa di 0,5 kg è attaccata a una molla con $k = 50$ N/m. Calcola periodo e frequenza.</summary>
<p>$T = 2\\pi\\sqrt{0{,}5/50} \\approx 0{,}628$ s; $f \\approx 1{,}59$ Hz.</p></details>
<details><summary>2. La stessa massa parte ferma da 10 cm. Qual è la velocità massima?</summary>
<p>$\\omega = \\sqrt{50/0{,}5} = 10$ rad/s; $v_{\\max} = \\omega A = 1$ m/s.</p></details>
<details><summary>3. Quanta energia è immagazzinata nella molla dell'esercizio 2?</summary>
<p>$E = \\tfrac12 k A^2 = \\tfrac12 \\cdot 50 \\cdot 0{,}1^2 = 0{,}25$ J.</p></details>
<details><summary>4. Per raddoppiare la frequenza, di quanto bisogna cambiare la costante elastica?</summary>
<p>$f \\propto \\sqrt{k}$: bisogna quadruplicarla.</p></details>
`,
};
