import { tn, clamp } from '../core/math.js';
import { tex } from '../core/manim.js';
import { uq } from '../core/units.js';
import { Stage, C, arrowPx, brace, symVal } from '../core/annot.js';
import { camera3d, triad, cylinder, sphere } from '../core/view3d.js';

const stage = new Stage();
const RP = 1.5;                                  // raggio della piattaforma (m)
const deg = Math.PI / 180;
const RMIN = 0.2, RMAX = 1.4;
let V = null;

const I0 = p => 0.5 * p.Mp * RP * RP;
const Iof = (p, r) => I0(p) + 2 * p.m * r * r;
// Con «Avvicina e allontana» le masse vanno avanti e indietro lungo le guide da sole (periodo 6 s).
const rAuto = (p, t) => RMIN + (p.r - RMIN) * (0.5 + 0.5 * Math.cos(2 * Math.PI * t / 6));

export default {
  id: 'angmom',
  title: 'Momento angolare',
  subtitle: 'Una piattaforma che gira più veloce stringendo le braccia',

  params: [
    { key: 'Mp', label: 'Massa della piattaforma', unit: 'kg', min: 2, max: 60, step: 1, value: 20 },
    { key: 'm', label: 'Masse sulle guide (ognuna)', unit: 'kg', min: 0.5, max: 15, step: 0.5, value: 6 },
    { key: 'r', label: 'Distanza delle masse dall\'asse r', unit: 'm', min: RMIN, max: RMAX, step: 0.01, value: 1.3, live: true },
    { key: 'w0', label: 'Velocità angolare iniziale ω₀', unit: 'rad/s', min: 0.2, max: 6, step: 0.1, value: 1.5 },
    { key: 'tMax', label: 'Durata della simulazione', unit: 's', min: 5, max: 120, step: 5, value: 30 },
    { key: 'auto', type: 'toggle', label: 'Avvicina e allontana da sole', value: false, live: true },
    { key: 'show3d', type: 'toggle', label: 'Vista 3D: L e ω come vettori', value: true, live: true },
  ],

  presets: [
    { label: 'Pattinatrice', values: { Mp: 10, m: 8, r: 1.3, w0: 1.5, auto: true } },
    { label: 'Piattaforma pesante', values: { Mp: 60, m: 4, r: 1.3, w0: 1.5, auto: true } },
    { label: 'Masse leggere', values: { Mp: 20, m: 1, r: 1.3, w0: 1.5, auto: true } },
  ],

  view() { return { xmin: -2.6, xmax: 2.6, ymin: -2, ymax: 3 }; },

  init(p) {
    const L = Iof(p, p.r) * p.w0;
    return { t: 0, th: 0, r: p.r, L, w: p.w0, tEnd: p.tMax };
  },

  // Nessun momento esterno: L resta costante; ω si adegua al momento d'inerzia del momento.
  step(s, dt, p) {
    s.t += dt;
    s.r = p.auto ? rAuto(p, s.t) : p.r;
    s.w = s.L / Iof(p, s.r);
    s.th += s.w * dt;
  },

  done: s => s.t >= s.tEnd,

  sample(s, p) {
    const I = Iof(p, s.r);
    return { t: s.t, w: s.w, I, L: s.L, K: s.L * s.L / (2 * I), r: s.r };
  },

  graphs: [
    { title: 'Velocità angolare', series: [{ key: 'w', label: 'ω (rad/s)', color: 'vel' }] },
    { title: 'Momento angolare', series: [{ key: 'L', label: 'L (kg·m²/s)', color: 'friction' }] },
    { title: 'Momento d\'inerzia', series: [{ key: 'I', label: 'I (kg·m²)', color: 'normal' }] },
    { title: 'Energia cinetica', series: [{ key: 'K', label: 'K (J)', color: 'weight' }] },
  ],

  // Le masse si trascinano lungo le guide anche mentre la piattaforma gira (non si riparte da capo).
  handles(s, p) {
    if (!V || p.auto) return [];
    const [x, y] = V.p(s.r * Math.cos(s.th), s.r * Math.sin(s.th), 0.12);
    return [{ id: 'r', x, y }];
  },
  drag(id, wx, wy, p) {
    if (id !== 'r' || !V) return;
    // Dal punto sullo schermo al piano della piattaforma (z = 0): si annulla l'inclinazione della camera.
    const y = Math.abs(V.cp) > 0.2 ? wy / V.cp : wy;
    p.r = clamp(Math.round(Math.hypot(wx, y) * 100) / 100, RMIN, RMAX);
    return 'live';
  },

  mount() { stage.reset(); },

  draw(P, s, p, ui) {
    const S = stage.begin(P, ui), M = S.M, sc = P.cam.scale, ctx = P.ctx;
    const W = camera3d(S, 'angmom', p.show3d, -58 * deg, 0), tilt = W.tilt(0.8);
    if (!ui.snapshot) V = W;
    const r = s.t === 0 ? p.r : s.r, th = s.th;

    // Asse di rotazione, sotto la piattaforma (disegnato prima, così il disco lo copre).
    W.line(P, [[0, 0, -0.9], [0, 0, -0.1]], { color: 'text', width: 2.5, alpha: tilt });
    // Piattaforma vista dall'alto (di fronte) o di sbieco (3D): un disco spesso con le guide.
    cylinder(P, W, [0, 0, -0.08], RP, 0.16, { color: M.solid, edge: M.text, alpha: 0.95, spin: th, mark: false });
    for (const k of [0, 1]) {
      const a = th + k * Math.PI;
      W.line(P, [[0, 0, 0.01], [RP * 0.97 * Math.cos(a), RP * 0.97 * Math.sin(a), 0.01]], { color: 'text', width: 1.6, alpha: 0.8 });
    }
    for (let i = 0; i < 12; i++) {
      const a = th + i * Math.PI / 6;
      W.line(P, [[RP * 0.9 * Math.cos(a), RP * 0.9 * Math.sin(a), 0.01], [RP * Math.cos(a), RP * Math.sin(a), 0.01]], { color: 'text', width: 1, alpha: 0.5 });
    }

    // Masse sulle guide: le due sfere, con la distanza r segnata.
    const rr = 0.12 * Math.cbrt(p.m / 6), pts = [0, 1].map(k => [r * Math.cos(th + k * Math.PI), r * Math.sin(th + k * Math.PI), rr]);
    pts.sort((u, v) => W.depth(...u) - W.depth(...v));
    for (const c of pts) sphere(P, W, c, rr, { color: M.body.blue, alpha: 1, spin: th });
    if (tilt < 0.15 && r * sc > 30) {
      const e = [r * Math.cos(th), r * Math.sin(th)];
      brace(P, [0, 0], e, symVal(P, 'r', uq('m', r)), { side: 1, gap: rr * sc + 4, size: 15, grow: S.grow('r', 0.6), color: M.text, alpha: 0.8 });
    }

    // Verso di rotazione nel piano: arco con la freccia (antiorario).
    if (tilt < 0.95) {
      const [a, b] = W.S(P, 0, 0, 0), rad = (RP + 0.2) * sc, a0 = th + 0.2, a1 = th + 0.9;
      ctx.save(); ctx.globalAlpha = 0.8 * (1 - tilt); ctx.strokeStyle = ctx.fillStyle = M.vec.vel; ctx.lineWidth = 2.2;
      ctx.beginPath(); ctx.arc(a, b, rad, -a0, -a1, true); ctx.stroke();
      const ex = a + rad * Math.cos(a1), ey = b - rad * Math.sin(a1), tx = -Math.sin(a1), ty = -Math.cos(a1);
      ctx.beginPath(); ctx.moveTo(ex + tx * 9, ey + ty * 9); ctx.lineTo(ex - ty * 5, ey + tx * 5); ctx.lineTo(ex + ty * 5, ey - tx * 5); ctx.closePath(); ctx.fill();
      ctx.restore();
      tex(P, a + (rad + 18) * Math.cos(a1), b - (rad + 18) * Math.sin(a1), '\\omega', { size: 17, color: M.vec.vel, halo: M.bg, alpha: 1 - tilt });
    }

    // In 3D: L (costante) e ω (cambia) lungo l'asse, uno accanto all'altro.
    if (tilt > 0.02) {
      const Lmax = s.L, wmax = s.L / Iof(p, RMIN);
      const lL = arrowPx(s.L, Lmax, { min: 30, max: 110 }) / sc * tilt, lw = arrowPx(s.w, wmax, { min: 24, max: 150 }) / sc * tilt;
      W.arrow(P, [0, 0, 0.02], [0, 0, 0.02 + lL], { color: 'friction', key: 'L', width: 3.6 });
      W.arrow(P, [0.22, 0, 0.02], [0.22, 0, 0.02 + lw], { color: 'vel', key: 'w', width: 3 });
      const [la, lb] = W.S(P, 0, 0, 0.02 + lL), [wa, wb] = W.S(P, 0.22, 0, 0.02 + lw);
      tex(P, la - 22, lb, '\\vec L', { size: 18, color: M.vec.friction, halo: M.bg, alpha: tilt });
      tex(P, wa + 22, wb, '\\vec\\omega', { size: 18, color: M.vec.vel, halo: M.bg, alpha: tilt });
    }

    if (!p.auto) for (const h of this.handles(s, p)) P.handle(h.x, h.y, ui.active === h.id);
    triad(P, W);
  },

  formulas(s, p) {
    const r = s.t === 0 ? p.r : s.r, I = Iof(p, r), w = s.L / I, K = s.L * s.L / (2 * I);
    return [
      { h: 'Conservazione del momento angolare' },
      { key: true, tex: `${C('friction', 'L')}=I\\,${C('vel', '\\omega')}=${uq('kg·m²/s', s.L, 2)}\\ \\ \\text{costante}` },
      { tex: `I=\\tfrac12 M R^2+2\\,m\\,r^2=${uq('kg·m²', I, 2)}` },
      { key: true, tex: `${C('vel', '\\omega')}=\\dfrac{L}{I}=${uq('rad/s', w, 2)}\\qquad T=\\dfrac{2\\pi}{\\omega}=${uq('s', 2 * Math.PI / w, 2)}` },
      { h: 'Energia cinetica' },
      { tex: `K=\\dfrac{L^2}{2I}=${uq('J', K, 1)}` },
      { tex: `\\text{avvicinando le masse } K \\text{ cresce: il lavoro lo fa chi tira}` },
      { h: 'Istante attuale' },
      { tex: `t=${uq('s', s.t)}\\qquad r=${uq('m', r)}` },
    ].filter(Boolean);
  },

  theory: `
<h2>Conservazione del momento angolare</h2>
<p>Una pattinatrice che gira su sé stessa con le braccia aperte, quando le stringe al petto, gira molto più veloce. Nessuno l'ha spinta: è la conservazione del <b>momento angolare</b>.</p>

<h3>Momento angolare</h3>
<p>Per un corpo che ruota attorno a un asse fisso il momento angolare è</p>
$$L = I\\,\\omega$$
<p>È l'analogo per le rotazioni della quantità di moto $p = m v$. Come $\\vec F = \\Delta\\vec p / \\Delta t$, vale $\\tau = \\Delta L / \\Delta t$: solo un momento esterno può cambiare $L$.</p>

<h3>Se non ci sono momenti esterni</h3>
$$I_1\\,\\omega_1 = I_2\\,\\omega_2$$
<p>Avvicinando le masse all'asse, $I$ diminuisce (conta $r^2$) e $\\omega$ aumenta nella stessa proporzione. Allontanandole, la rotazione rallenta. Le forze che spostano le masse lungo le guide sono dirette verso l'asse: hanno braccio nullo, quindi non cambiano $L$.</p>

<h3>Il vettore $\\vec L$</h3>
<p>Nella vista 3D il momento angolare è un vettore lungo l'asse di rotazione (regola della mano destra). Guardalo mentre le masse si muovono: $\\vec L$ non cambia, mentre $\\vec\\omega$ si allunga e si accorcia.</p>
<div class="box">L'energia cinetica $K = L^2 / (2I)$ invece <b>non</b> si conserva: stringendo le braccia la pattinatrice compie lavoro, e quel lavoro diventa energia di rotazione.</div>

<h3>Prova con la simulazione</h3>
<ol>
  <li>Avvia la simulazione e trascina una massa verso il centro: cosa fa $\\omega$? E $L$?</li>
  <li>Con «Piattaforma pesante», perché l'effetto è più piccolo?</li>
  <li>Guarda il grafico dell'energia: quando cresce $K$?</li>
</ol>

<h3>Esercizi</h3>
<details><summary>1. Una pattinatrice ha $I = 4$ kg·m² e gira a 2 giri/s. Stringe le braccia e $I$ scende a 1,6 kg·m². A che frequenza gira?</summary>
<p>$f_2 = f_1 I_1 / I_2 = 2 \\cdot 4 / 1{,}6 = 5$ giri/s.</p></details>
<details><summary>2. Nell'esercizio 1, di quanto aumenta l'energia cinetica?</summary>
<p>$K = L^2/(2I)$ con $L$ costante: $K_2/K_1 = I_1/I_2 = 2{,}5$.</p></details>
`,
};
