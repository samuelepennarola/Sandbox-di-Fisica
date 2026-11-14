import { tn, clamp } from '../core/math.js';
import { tex } from '../core/manim.js';
import { uq } from '../core/units.js';
import { Stage, C, arrowPx, brace, symVal } from '../core/annot.js';
import { camera3d, background3d, stage3d, axes3d, prism, cylinder, sphere } from '../core/view3d.js';

const stage = new Stage();
const G = 9.81, H = 2.6;                 // altezza dell'asse
const RW = 0.6, MW = 1, RH = 0.12;       // ruota: raggio, massa (disco sottile), raggio del mozzo su cui si avvolge la fune
const Y0 = 1.9;                          // quota iniziale della base del peso appeso
const deg = Math.PI / 180;
let V = null;

const Iof = p => 0.5 * MW * RW * RW + 4 * p.mm * p.r * p.r;
const accOf = p => p.mh * G / (p.mh + Iof(p) / (RH * RH));
const sizeH = p => 0.16 * Math.cbrt(p.mh / 0.3);
const tLand = p => Math.sqrt(2 * (Y0 - 0.02) / accOf(p));

// Stato analitico: finché il peso scende la ruota accelera; quando tocca terra la fune si allenta e la ruota gira a ω costante.
function kin(p, t) {
  const a = accOf(p), al = a / RH, tl = tLand(p);
  if (t <= tl) return { y: Y0 - 0.5 * a * t * t, th: -0.5 * al * t * t, w: -al * t, taut: true };
  return { y: 0.02, th: -0.5 * al * tl * tl - al * tl * (t - tl), w: -al * tl, taut: false };
}

export default {
  id: 'inertia',
  title: 'Momento d\'inerzia',
  subtitle: 'Una ruota messa in rotazione da un peso',

  params: [
    { key: 'mh', label: 'Massa appesa m', unit: 'kg', min: 0.05, max: 2, step: 0.05, value: 0.3 },
    { key: 'mm', label: 'Masse sui raggi (ognuna)', unit: 'kg', min: 0, max: 2, step: 0.05, value: 0.5 },
    { key: 'r', label: 'Distanza delle masse dall\'asse r', unit: 'm', min: 0.1, max: 0.55, step: 0.01, value: 0.45 },
    { key: 'show3d', type: 'toggle', label: 'Vista 3D: ω e τ come vettori', value: false, live: true },
    { key: 'showForce', type: 'toggle', label: 'Forze e momento', value: true, live: true },
  ],

  presets: [
    { label: 'Masse lontane dall\'asse', values: { mh: 0.3, mm: 0.5, r: 0.5 } },
    { label: 'Masse vicine all\'asse', values: { mh: 0.3, mm: 0.5, r: 0.12 } },
    { label: 'Ruota scarica', values: { mh: 0.3, mm: 0, r: 0.3 } },
    { label: 'Peso pesante', values: { mh: 1.5, mm: 0.5, r: 0.45 } },
  ],

  view() { return { xmin: -2.4, xmax: 2.4, ymin: -0.4, ymax: 3.5 }; },

  init(p) { return { t: 0, tEnd: tLand(p) + 3 }; },
  step(s, dt) { s.t += dt; },
  done: s => s.t >= s.tEnd,

  sample(s, p) {
    const k = kin(p, s.t), a = k.taut ? accOf(p) : 0;
    return { t: s.t, w: -k.w, th: -k.th / (2 * Math.PI), y: k.y, T: k.taut ? p.mh * (G - a) : 0 };
  },

  graphs: [
    { title: 'Velocità angolare', series: [{ key: 'w', label: 'ω (rad/s)', color: 'vel' }] },
    { title: 'Giri compiuti', series: [{ key: 'th', label: 'giri', color: 'vel' }] },
    { title: 'Quota del peso', series: [{ key: 'y', label: 'y (m)', color: 'weight' }] },
    { title: 'Tensione della fune', series: [{ key: 'T', label: 'T (N)', color: 'tension' }] },
  ],

  // Le masse sui raggi si trascinano lungo il raggio (cambia r).
  handles(s, p) {
    if (!V || p.mm <= 0) return [];
    const th = kin(p, s.t).th + Math.PI / 4;
    const [x, y] = V.p(p.r * Math.cos(th), H + p.r * Math.sin(th), 0.06);
    return [{ id: 'r', x, y }];
  },
  drag(id, wx, wy, p) {
    if (id === 'r') p.r = clamp(Math.round(Math.hypot(wx, wy - H) * 100) / 100, 0.1, 0.55);
  },

  mount() { stage.reset(); },
  drawBackground: background3d('inertia'),

  draw(P, s, p, ui) {
    const S = stage.begin(P, ui), M = S.M, sc = P.cam.scale, ctx = P.ctx;
    const W = camera3d(S, 'inertia', p.show3d, 18 * deg, -38 * deg, { swing: 0.2 }), tilt = W.tilt();
    stage3d(P, W);   // la griglia ruota con la camera: il piano dell'esperimento sfuma, compare il pavimento
    if (!ui.snapshot) V = W;
    const k = kin(p, s.t), th = k.th;

    if (W.tilt() < 0.05) P.ground(0);   // in 3D il suolo è un piano perpendicolare: la linea piatta taglierebbe la scena
    // Supporto: colonna dietro la ruota.
    prism(P, W, [[-0.08, 0], [0.08, 0], [0.08, H], [-0.08, H]], -0.32, -0.16, { fill: M.solid, stroke: M.solidEdge, alpha: 0.95 });
    W.line(P, [[0, H, -0.24], [0, H, 0.12]], { color: 'text', width: 2.5 });

    // Ruota: disco sottile velato, raggi e masse che girano con lei; mozzo su cui si avvolge la fune.
    cylinder(P, W, [0, H, 0], RW, 0.05, { color: M.muted, edge: M.text, alpha: 0.35, spin: th, mark: false });
    for (let i = 0; i < 4; i++) {
      const a = th + Math.PI / 4 + i * Math.PI / 2;
      W.line(P, [[0, H, 0.03], [RW * Math.cos(a), H + RW * Math.sin(a), 0.03]], { color: 'text', width: 1.4, alpha: 0.7 });
    }
    cylinder(P, W, [0, H, 0.04], RH, 0.08, { color: M.solid, edge: M.text, alpha: 0.95, spin: th });
    if (p.mm > 0) for (let i = 0; i < 4; i++) {
      const a = th + Math.PI / 4 + i * Math.PI / 2, rr = 0.07 * Math.cbrt(p.mm / 0.5);
      sphere(P, W, [p.r * Math.cos(a), H + p.r * Math.sin(a), 0.06], rr, { color: M.body.blue, alpha: 1, spin: th });
    }

    // Fune e peso appeso.
    const hs = sizeH(p), yTop = k.y + hs;
    W.line(P, [[RH, H, 0.04], [RH, yTop, 0.04]], { color: 'text', width: 1.4, alpha: k.taut ? 0.9 : 0.4, dash: k.taut ? null : [3, 4] });
    prism(P, W, [[RH - hs / 2, k.y], [RH + hs / 2, k.y], [RH + hs / 2, yTop], [RH - hs / 2, yTop]], 0.04 - hs / 2, 0.04 + hs / 2,
      { fill: M.body.red, stroke: M.text, alpha: 0.9 });

    // Forze: peso e tensione sul blocco, tensione sul mozzo; braccio r_h e verso di rotazione.
    const a = k.taut ? accOf(p) : 0, T = k.taut ? p.mh * (G - a) : 0, Pw = p.mh * G;
    if (p.showForce) {
      const ref = Math.max(Pw, 1), L = f => arrowPx(f, ref, { min: 30, max: 90 }) / sc;
      W.arrow(P, [RH, k.y, 0.04], [RH, k.y - L(Pw), 0.04], { color: 'weight', key: 'P', width: 3, label: 'P' });
      if (T > 0) {
        W.arrow(P, [RH, yTop, 0.04], [RH, yTop + L(T), 0.04], { color: 'tension', key: 'T', width: 3, label: 'T' });
        W.arrow(P, [RH, H, 0.04], [RH, H - L(T), 0.04], { color: 'tension', key: 'Th', width: 3 });
        if (tilt < 0.1) brace(P, [0, H], [RH, H], symVal(P, 'r_h', uq('m', RH)), { side: 1, gap: 4, size: 13, grow: S.grow('rh', 0.6), color: M.text, alpha: 0.8 });
      }
    }

    // Vista 3D: velocità angolare e momento come vettori lungo l'asse (regola della mano destra: orario = verso −z).
    if (tilt > 0.02) {
      W.zAxis(P, [0, H, 0.12], 1.6);
      const wmax = Math.max(accOf(p) / RH * tLand(p), 1e-6), Lw = arrowPx(k.w, wmax, { min: 24, max: 110 }) / sc * tilt;
      if (Math.abs(k.w) > 1e-6) {
        W.arrow(P, [0, H, 0.14], [0, H, 0.14 + Math.sign(k.w) * Lw], { color: 'vel', key: 'wz', width: 3.2 });
        const [la, lb] = W.S(P, 0, H, 0.14 + Math.sign(k.w) * Lw);
        tex(P, la - 18, lb + 4, '\\vec\\omega', { size: 17, color: M.vec.vel, halo: M.bg, alpha: tilt });
      }
      if (T > 0) {
        const Lt = 70 / sc * tilt;
        W.arrow(P, [0.12, H + 0.12, 0.14], [0.12, H + 0.12, 0.14 - Lt], { color: 'tension', key: 'tz', width: 2.4, dash: [5, 4] });
        const [la, lb] = W.S(P, 0.12, H + 0.12, 0.14 - Lt);
        tex(P, la + 16, lb, '\\vec\\tau', { size: 17, color: M.vec.tension, halo: M.bg, alpha: tilt });
      }
    }

    if (s.t === 0) for (const h of this.handles(s, p)) P.handle(h.x, h.y, ui.active === h.id);
    axes3d(P, W, { origin: [-2, 0, 0], lx: 4.2, ly: 3.4, lz: 2 });
  },

  formulas(s, p) {
    const I = Iof(p), a = accOf(p), al = a / RH, k = kin(p, s.t), T = p.mh * (G - a);
    const Iw = 0.5 * MW * RW * RW;
    return [
      { h: 'Momento d\'inerzia' },
      { key: true, tex: `I=I_{\\text{ruota}}+4\\,m_r r^2=${tn(Iw, 3)}+4\\cdot${tn(p.mm, 2)}\\cdot${tn(p.r, 2)}^2=${uq('kg·m²', I, 3)}` },
      { h: 'Secondo principio per le rotazioni' },
      { key: true, tex: `\\tau=I\\alpha\\qquad ${C('tension', 'T')}\\,r_h=I\\,\\dfrac{a}{r_h}` },
      { tex: `m g-${C('tension', 'T')}=m a\\ \\Rightarrow\\ a=\\dfrac{m g}{m+I/r_h^2}=${uq('m/s²', a, 3)}` },
      { tex: `\\alpha=\\dfrac{a}{r_h}=${uq('rad/s²', al, 2)}\\qquad ${C('tension', 'T')}=${uq('N', T, 2)}` },
      { h: k.taut ? 'Istante attuale' : 'Il peso ha toccato terra' },
      { tex: `t=${uq('s', s.t)}\\qquad \\omega=${uq('rad/s', Math.abs(k.w), 2)}\\qquad ${tn(-k.th / (2 * Math.PI), 2)}\\ \\text{giri}` },
      !k.taut && { tex: `\\text{fune lenta: niente momento, } \\omega \\text{ resta costante}`, cls: 'warn' },
    ].filter(Boolean);
  },

  theory: `
<h2>Momento d'inerzia</h2>
<p>Una fune avvolta sul mozzo di una ruota regge un peso. Lasciato libero, il peso scende e la ruota comincia a girare sempre più veloce. Quanto in fretta? Dipende da come è distribuita la massa della ruota.</p>

<h3>Il secondo principio per le rotazioni</h3>
<p>Per un corpo che ruota attorno a un asse fisso vale l'analogo di $F = m a$:</p>
$$\\tau = I\\,\\alpha$$
<p>Il momento $\\tau$ prende il posto della forza, l'accelerazione angolare $\\alpha$ quello dell'accelerazione e il <b>momento d'inerzia</b> $I$ quello della massa: misura quanto il corpo «resiste» a cambiare la sua rotazione.</p>

<h3>Che cos'è $I$</h3>
$$I = \\sum m_i\\, r_i^2$$
<p>Ogni pezzetto di massa conta per il <b>quadrato</b> della sua distanza dall'asse. Avvicinando le masse sui raggi all'asse, $I$ diminuisce molto e la ruota accelera più in fretta, anche se la massa totale è la stessa.</p>

<h3>Il conto completo</h3>
<p>Sul peso: $m g - T = m a$. Sulla ruota: $T r_h = I \\alpha$. Senza strisciamento della fune $a = \\alpha\\, r_h$. Mettendo insieme:</p>
$$a = \\frac{m g}{m + I / r_h^2}$$
<p>La tensione è sempre minore del peso: se fosse uguale, il peso non accelererebbe.</p>

<h3>Il momento e la velocità angolare sono vettori</h3>
<p>Accendi «Vista 3D». La velocità angolare $\\vec\\omega$ e il momento $\\vec\\tau$ stanno sull'asse di rotazione, con il verso dato dalla regola della mano destra. Il momento della tensione è concorde con $\\vec\\omega$: per questo la fa crescere. Quando il peso tocca terra la fune si allenta, $\\vec\\tau$ sparisce e $\\vec\\omega$ resta costante.</p>

<h3>Prova con la simulazione</h3>
<ol>
  <li>Confronta «Masse lontane» e «Masse vicine»: quanti giri compie la ruota prima che il peso tocchi terra?</li>
  <li>Dimezza $r$: di quanto cambia la parte di $I$ dovuta alle masse?</li>
  <li>Con la ruota scarica, perché il peso non cade comunque in caduta libera?</li>
</ol>

<h3>Esercizi</h3>
<details><summary>1. Quattro masse da 0,5 kg a 0,4 m dall'asse: quanto vale il loro momento d'inerzia? E se le porti a 0,2 m?</summary>
<p>$4 \\cdot 0{,}5 \\cdot 0{,}16 = 0{,}32$ kg·m²; a 0,2 m diventa $0{,}08$ kg·m², un quarto.</p></details>
<details><summary>2. Una ruota con $I = 0{,}2$ kg·m² riceve un momento di 0,5 N·m. Quanto vale $\\alpha$? Dopo 4 s, che $\\omega$ ha?</summary>
<p>$\\alpha = 2{,}5$ rad/s²; $\\omega = 10$ rad/s.</p></details>
`,
};
