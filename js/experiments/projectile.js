import { deg, rk4, tn, clamp } from '../core/math.js';
import { ball } from '../core/shapes.js';
import { trail } from '../core/look.js';
import { tex, texBox } from '../core/manim.js';
import { Stage, createPts, brace, angleMark, dropLines, rate01, C, arrowPx, arrowMag } from '../core/annot.js';

const stage = new Stage();   // regia: frecce che crescono, parabola che si disegna, graffe, corpi che nascono
const num = (v, d = 1) => (v < 0 ? '−' : '') + Math.abs(v).toFixed(d).replace('.', ',');

// Frecce in scala compressa e in px (vedi arrowPx): leggibili a qualsiasi zoom. V0 è la freccia di lancio, che
// porta la maniglia in punta e quindi parte più lunga; V e A sono i vettori istantanei.
const VREF = 40, AREF = 20;                 // m/s e m/s² che danno la freccia più lunga
const V0 = { min: 64, max: 160 }, V = { min: 36, max: 130 }, A = { min: 36, max: 96 };
let SC = 40;                                // px per metro dell'ultima scena disegnata (serve alle maniglie)
const v0Len = v0 => arrowPx(v0, VREF, V0) / SC;                                  // lunghezza in metri della freccia v₀
const kOf = (m, ref, o) => (m > 1e-9 ? arrowPx(m, ref, o) / m / SC : 0);         // metri di freccia per unità

// Etichetta TeX di una freccia (estremi a, b in metri), sempre alla stessa distanza GAP px dal riquadro della scritta:
// oltre la punta oppure, con side = [dx, dy] (verso preferito sullo schermo), di lato al fusto a una frazione at.
// Compare sfumando alla fine della crescita della freccia con la stessa chiave.
const GAP = 8;
function tag(P, S, key, a, b, src, color, { side = null, at = 0.6, alpha = 1, size = 17 } = {}) {
  if (S.snap) return;
  const g = S.grow('arr:' + key), [x0, y0] = P.S(a[0], a[1]);
  const [x1, y1] = P.S(a[0] + (b[0] - a[0]) * g, a[1] + (b[1] - a[1]) * g), len = Math.hypot(x1 - x0, y1 - y0);
  if (len <= 18) return;
  const ux = (x1 - x0) / len, uy = (y1 - y0) / len, B = texBox(P, src, size), hw = B.w / 2 + 2, hh = (B.bot - B.top) / 2;
  const reach = (dx, dy) => GAP + Math.min(Math.abs(dx) > 1e-6 ? hw / Math.abs(dx) : 1e9, Math.abs(dy) > 1e-6 ? hh / Math.abs(dy) : 1e9);
  let cx, cy;
  if (!side) { const k = reach(ux, uy); cx = x1 + ux * k; cy = y1 + uy * k; }
  else {
    // Frecce corte: accanto alla punta, così l'etichetta non finisce sul corpo.
    if (len < 44) at = 1;
    let nx = -uy, ny = ux;
    if (nx * side[0] + ny * side[1] < 0) { nx = -nx; ny = -ny; }
    const k = reach(nx, ny);
    cx = x0 + (x1 - x0) * at + nx * k; cy = y0 + (y1 - y0) * at + ny * k;
  }
  tex(P, cx, cy - (B.top + B.bot) / 2, src, { size, color, halo: S.M.bg, alpha: alpha * rate01(g) });
}

// Superficie piatta alla Manim: riempimento appena accennato, contorno tenue e bordo d'appoggio netto.
function flat(P, M, pts, edge) {
  P.poly(pts, { fill: M.text, alpha: M.dark ? 0.05 : 0.06 });
  P.poly(pts, { stroke: M.muted, width: 1.2, alpha: 0.55 });
  P.line(edge, { color: M.text, width: 2 });
}

function ideal(p) {
  const th = p.theta * deg, vx = p.v0 * Math.cos(th), vy = p.v0 * Math.sin(th);
  const tv = (vy + Math.sqrt(vy * vy + 2 * p.g * p.h0)) / p.g;
  return { vx, vy, tv, R: vx * tv, hmax: p.h0 + vy * vy / (2 * p.g), tApex: vy / p.g };
}

export default {
  id: 'projectile',
  title: 'Moto parabolico',
  subtitle: 'Lancio di un proiettile, con o senza aria',

  params: [
    { key: 'v0', label: 'Velocità iniziale v₀', unit: 'm/s', min: 1, max: 40, step: 0.5, value: 18 },
    { key: 'theta', label: 'Angolo di lancio θ', unit: '°', min: 0, max: 90, step: 1, value: 50 },
    { key: 'h0', label: 'Altezza iniziale h₀', unit: 'm', min: 0, max: 30, step: 0.5, value: 0 },
    { key: 'g', label: 'Gravità g', unit: 'm/s²', min: 1, max: 25, step: 0.01, value: 9.81 },
    { key: 'm', label: 'Massa m', unit: 'kg', min: 0.1, max: 10, step: 0.1, value: 1 },
    { key: 'k', label: 'Resistenza dell\'aria k', unit: '1/m', min: 0, max: 0.1, step: 0.001, value: 0 },
    { key: 'showComp', type: 'toggle', label: 'Componenti di v', value: true, live: true },
    { key: 'showAcc', type: 'toggle', label: 'Vettore accelerazione', value: false, live: true },
    { key: 'showIdeal', type: 'toggle', label: 'Parabola ideale', value: true, live: true },
    { key: 'strobe', type: 'toggle', label: 'Posizioni ogni 0,25 s', value: false, live: true },
  ],

  presets: [
    { label: '45°: gittata massima', values: { v0: 20, theta: 45, h0: 0, g: 9.81, k: 0 } },
    { label: 'Lancio orizzontale', values: { v0: 10, theta: 0, h0: 20, g: 9.81, k: 0 } },
    { label: 'Sulla Luna', values: { v0: 10, theta: 45, h0: 0, g: 1.62, k: 0 } },
    { label: 'Con l\'aria', values: { v0: 25, theta: 45, h0: 0, g: 9.81, k: 0.02 } },
  ],

  view(p) {
    const { R, hmax } = ideal(p);
    return { xmin: -3, xmax: Math.max(R, 10) + 3, ymin: -2, ymax: Math.max(hmax, p.h0, 5) + 3 };
  },

  init(p) {
    const th = p.theta * deg;
    return { t: 0, x: 0, y: p.h0, vx: p.v0 * Math.cos(th), vy: p.v0 * Math.sin(th), trail: [[0, p.h0]], strobe: [[0, p.h0]], landed: false };
  },

  step(s, dt, p) {
    const f = ([, , vx, vy]) => {
      const v = Math.hypot(vx, vy);
      return [vx, vy, -p.k * v * vx, -p.g - p.k * v * vy];
    };
    const [x, y, vx, vy] = rk4([s.x, s.y, s.vx, s.vy], dt, f);
    if (y < 0) {
      // Interpola l'istante di contatto col suolo (u = 0 se partiva già a terra verso il basso).
      const u = s.y > 0 ? s.y / (s.y - y) : 0;
      Object.assign(s, { x: s.x + (x - s.x) * u, y: 0, vx: s.vx + (vx - s.vx) * u, vy: s.vy + (vy - s.vy) * u, t: s.t + dt * u, landed: true });
    } else {
      Object.assign(s, { x, y, vx, vy, t: s.t + dt });
    }
    const last = s.trail[s.trail.length - 1];
    if (s.landed || Math.hypot(s.x - last[0], s.y - last[1]) > 0.04) s.trail.push([s.x, s.y]);
    if (Math.floor(s.t / 0.25 + 1e-9) > s.strobe.length - 1) s.strobe.push([s.x, s.y]);
  },

  done: s => s.landed,

  sample(s, p) {
    const v2 = s.vx * s.vx + s.vy * s.vy, K = 0.5 * p.m * v2, U = p.m * p.g * s.y;
    return { t: s.t, x: s.x, y: s.y, vx: s.vx, vy: s.vy, K, U, E: K + U };
  },

  graphs: [
    { title: 'Posizione', series: [{ key: 'x', label: 'x (m)', color: 'vel' }, { key: 'y', label: 'y (m)', color: 'weight' }] },
    { title: 'Velocità', series: [{ key: 'vx', label: 'vx (m/s)', color: 'vel' }, { key: 'vy', label: 'vy (m/s)', color: 'weight' }] },
    { title: 'Energia', series: [{ key: 'K', label: 'K cinetica (J)', color: 'vel' }, { key: 'U', label: 'U potenziale (J)', color: 'normal' }, { key: 'E', label: 'E meccanica (J)', color: 'friction' }] },
  ],

  // Oggetti che si possono ingrandire per vederli meglio (non cambia la fisica).
  resizables(s, p, { scale, size }) {
    return [
      { key: 'ball', x: s.x, y: s.y, rPx: Math.max(0.18 * scale, 10) * size('ball') },
    ];
  },

  handles(s, p) {
    const th = p.theta * deg;
    return [
      { id: 'v0', x: v0Len(p.v0) * Math.cos(th), y: p.h0 + v0Len(p.v0) * Math.sin(th) },
      { id: 'h0', x: 0, y: p.h0 },
    ];
  },

  drag(id, wx, wy, p) {
    if (id === 'h0') p.h0 = clamp(Math.round(wy * 2) / 2, 0, 30);
    if (id === 'v0') {
      const dx = wx, dy = wy - p.h0;
      p.v0 = clamp(Math.round(arrowMag(Math.hypot(dx, dy) * SC, VREF, V0) * 2) / 2, 1, 40);
      p.theta = clamp(Math.round(Math.atan2(dy, dx) / deg), 0, 90);
    }
  },

  mount() { stage.reset(); },

  draw(P, s, p, ui) {
    const S = stage.begin(P, ui), M = S.M;
    if (!ui.snapshot) SC = P.cam.scale;
    // Parametri mostrati: inseguono quelli veri (la parabola si trasforma con morbidezza); mentre si trascina
    // una maniglia seguono il dito senza ritardo.
    const [v0, theta, h0, g] = S.smooth('p', [p.v0, p.theta, p.h0, p.g], 0.11, !!ui.active);
    const q = { ...p, v0, theta, h0, g };
    const th = theta * deg;
    const id = ideal(q);
    P.ground(0);

    // Piattaforma di lancio (solo se h₀ > 0): un rettangolo piatto e tenue, con il bordo superiore netto.
    if (h0 > 0.02) {
      const w = Math.max(1, 26 / P.cam.scale);
      flat(P, M, [[-w, 0], [0, 0], [0, h0], [-w, h0]], [[-w, h0], [0, h0]]);
    }

    // Traiettoria ideale (senza attrito): si disegna quando compare (Create), poi le graffe di h_max e R.
    if (p.showIdeal) {
      const f = S.grow('ideal', 1.1), pts = [];
      for (let i = 0; i <= 120; i++) {
        const t = id.tv * i / 120;
        pts.push([id.vx * t, h0 + id.vy * t - 0.5 * g * t * t]);
      }
      P.line(createPts(pts, f), { color: 'ideal', width: 1.4, dash: [6, 6], alpha: 0.75 });
      // Le graffe arrivano alla fine del tracciato; durante il volo si attenuano per lasciare spazio al corpo.
      const gb = Math.min(1, Math.max(0, (f - 0.55) / 0.45)), dim = S.smooth('dim', [s.t > 0 && !s.landed ? 0.3 : 0.85], 0.25)[0];
      if (id.vy > 0 && id.hmax > 0.05) {
        const ax = id.vx * id.tApex;
        P.line([[ax, 0], [ax, id.hmax]], { color: 'ideal', width: 1, dash: [2, 4], alpha: 0.7 * gb * dim });
        P.circle(ax, id.hmax, 3, { fill: 'muted', alpha: gb });
        if ((id.hmax) * P.cam.scale > 34) brace(P, [ax, 0], [ax, id.hmax], 'h_{\\mathrm{max}}', { side: 1, grow: gb, alpha: dim, color: M.muted });
      }
      if (id.R > 0.05) {
        P.circle(id.R, 0, 3, { fill: 'muted', alpha: gb });
        // Sotto il suolo, oltre il tratteggio del terreno.
        brace(P, [0, 0], [id.R, 0], 'R', { side: -1, gap: 20, grow: gb, alpha: dim, color: M.muted });
      }
    }

    // Scia e posizioni stroboscopiche (puntini).
    trail(P, s.trail, 'vel', 2.5);
    if (p.strobe) for (const [x, y] of s.strobe) P.circle(x, y, 3.5, { fill: M.body.red, alpha: 0.6 });

    // Il corpo: un disco pieno. A simulazione ferma all'inizio segue il punto di lancio mostrato.
    const fresh = s.t === 0, [bx, by] = fresh ? [0, h0] : [s.x, s.y], kB = ui.size('ball') * S.born('ball');
    ball(P, bx, by, { r: 0.18 * kB, minPx: 10 * kB, color: 'red' });

    // Vettore v₀ di lancio con angolo θ (trascinabile): l'etichetta sta di lato, non sulla maniglia della punta.
    const L0 = arrowPx(v0, VREF, V0) / P.cam.scale, tipx = L0 * Math.cos(th), tipy = h0 + L0 * Math.sin(th);
    if (th > 0.01) angleMark(P, 0, h0, 34, 0, th, '\\theta', { color: M.muted, grow: S.grow('theta', 0.7) });
    P.line([[0, h0], [L0 * 0.9, h0]], { color: 'muted', width: 1, dash: [3, 4], alpha: 0.6 });
    const a0 = fresh ? 1 : 0.4;
    P.arrow(0, h0, tipx, tipy, { color: 'vel', width: fresh ? 3 : 2, alpha: a0, dash: fresh ? null : [5, 4], key: 'v0' });
    tag(P, S, 'v0', [0, h0], [tipx, tipy], 'v_0', M.vec.vel, { side: [-1, -1], at: 0.5, alpha: a0 });

    // Vettori istantanei.
    const KV = kOf(Math.hypot(s.vx, s.vy), VREF, V) * SC / P.cam.scale;   // stessa scala per v e per le sue componenti
    if (!fresh) {
      if (p.showComp) {
        dropLines(P, s.x, s.y, { toY: 0, toX: 0, alpha: 0.45 * S.grow('proj', 0.5) });
        const ex = [s.x + KV * s.vx, s.y], ey = [s.x, s.y + KV * s.vy];
        P.arrow(s.x, s.y, ...ex, { color: 'vel', width: 2, dash: [4, 4], key: 'vx', alpha: 0.7 });
        P.arrow(s.x, s.y, ...ey, { color: 'vel', width: 2, dash: [4, 4], key: 'vy', alpha: 0.7 });
        tag(P, S, 'vx', [s.x, s.y], ex, 'v_x', M.vec.vel, { side: [0, s.vy > 0 ? 1 : -1], at: 0.55, alpha: 0.85 });
        tag(P, S, 'vy', [s.x, s.y], ey, 'v_y', M.vec.vel, { side: [-Math.sign(s.vx || 1), 0], at: 0.55, alpha: 0.85 });
      }
      const ev = [s.x + KV * s.vx, s.y + KV * s.vy];
      P.arrow(s.x, s.y, ...ev, { color: 'vel', key: 'v' });
      tag(P, S, 'v', [s.x, s.y], ev, '\\vec v', M.vec.vel);
    }
    if (p.showAcc) {
      const v = Math.hypot(s.vx, s.vy), ax = -p.k * v * s.vx, ay = -p.g - p.k * v * s.vy;
      const KA = kOf(Math.hypot(ax, ay), AREF, A) * SC / P.cam.scale;
      const ea = [bx + KA * ax, by + KA * ay];
      P.arrow(bx, by, ...ea, { color: 'acc', key: 'acc' });
      tag(P, S, 'acc', [bx, by], ea, p.k > 0 ? '\\vec a' : '\\vec g', M.vec.acc,
        { side: [Math.sign(s.vx) || 1, 0], at: 1 });   // accanto alla punta, dal lato opposto a v_y
    }
    P.handle(0, h0, ui.active === 'h0');
    P.handle(tipx, tipy, ui.active === 'v0');
  },

  formulas(s, p) {
    const id = ideal(p), v = Math.hypot(s.vx, s.vy);
    const u = x => `\\ \\mathrm{${x}}`;
    // Stessi colori della scena: velocità (e componenti) come le frecce v, gravità come la freccia g.
    const V = x => C('vel', x), G = C('acc', 'g');
    return [
      { h: 'Condizioni iniziali' },
      { tex: `${V('v_{0x}')}=${V('v_0')}\\cos\\theta=${tn(id.vx)}${u('m/s')}` },
      { tex: `${V('v_{0y}')}=${V('v_0')}\\sin\\theta=${tn(id.vy)}${u('m/s')}` },
      { h: 'Leggi orarie' },
      { key: true, tex: `x(t)=${tn(id.vx)}\\,t` },
      { key: true, tex: `y(t)=${tn(p.h0, 1)}+${tn(id.vy)}\\,t-${tn(p.g / 2, 3)}\\,t^2` },
      { h: p.k > 0 ? 'Previsioni ideali (senza aria)' : 'Previsioni' },
      { tex: `t_{\\text{volo}}=\\dfrac{${V('v_{0y}')}+\\sqrt{${V('v_{0y}^2')}+2${G}h_0}}{${G}}=${tn(id.tv)}${u('s')}` },
      { tex: `h_{\\max}=h_0+\\dfrac{${V('v_{0y}^2')}}{2${G}}=${tn(id.hmax)}${u('m')}` },
      { key: true, tex: `R=${V('v_{0x}')}\\,t_{\\text{volo}}=${tn(id.R)}${u('m')}` },
      { h: s.landed ? 'All\'atterraggio' : 'Istante attuale' },
      { tex: `t=${tn(s.t)}${u('s')}\\qquad x=${tn(s.x)}${u('m')}\\qquad y=${tn(s.y)}${u('m')}` },
      { tex: `${V('v_x')}=${tn(s.vx)}\\quad ${V('v_y')}=${tn(s.vy)}\\quad |${V('\\vec v')}|=${tn(v)}${u('m/s')}` },
      p.k > 0 && s.landed && { tex: `\\text{gittata reale } ${tn(s.x)}${u('m')}\\ \\ (${tn(100 * s.x / id.R, 0)}\\%\\text{ dell'ideale})`, cls: 'warn' },
    ].filter(Boolean);
  },

  theory: `
<h2>Moto parabolico</h2>
<p>Un corpo lanciato con velocità iniziale $\\vec v_0$, inclinata di un angolo $\\theta$ sull'orizzontale e soggetto alla sola forza peso, descrive una <b>parabola</b>. Il moto si scompone in due moti <b>indipendenti</b>:</p>
<ul>
  <li><b>orizzontale</b>: rettilineo uniforme, perché $a_x = 0$;</li>
  <li><b>verticale</b>: uniformemente accelerato, con $a_y = -g$.</li>
</ul>

<h3>Componenti della velocità iniziale</h3>
$$v_{0x} = v_0\\cos\\theta \\qquad v_{0y} = v_0\\sin\\theta$$

<h3>Leggi orarie</h3>
$$x(t) = v_{0x}\\,t \\qquad y(t) = h_0 + v_{0y}\\,t - \\tfrac12 g t^2$$
$$v_x(t) = v_{0x} \\qquad v_y(t) = v_{0y} - g\\,t$$
<p>La componente orizzontale della velocità <b>non cambia mai</b>; quella verticale diminuisce di $g$ ogni secondo, si annulla nel punto più alto e poi diventa negativa.</p>

<h3>Equazione della traiettoria</h3>
<p>Eliminando il tempo ($t = x / v_{0x}$):</p>
$$y = h_0 + x\\tan\\theta - \\frac{g}{2 v_0^2 \\cos^2\\theta}\\,x^2$$
<p>È una parabola con la concavità rivolta verso il basso.</p>

<h3>Grandezze caratteristiche</h3>
<p>Se il lancio parte e arriva alla stessa quota ($h_0 = 0$):</p>
$$t_{\\text{volo}} = \\frac{2 v_0 \\sin\\theta}{g} \\qquad h_{\\max} = \\frac{v_0^2 \\sin^2\\theta}{2g} \\qquad R = \\frac{v_0^2 \\sin 2\\theta}{g}$$
<div class="box">La gittata è <b>massima per $\\theta = 45^\\circ$</b>, dove $\\sin 2\\theta = 1$. Due angoli <b>complementari</b> (per esempio 30° e 60°) danno la stessa gittata, perché $\\sin 2\\theta = \\sin(180^\\circ - 2\\theta)$.</div>
<p>Se il lancio parte da un'altezza $h_0 > 0$, il tempo di volo si ricava risolvendo $y(t) = 0$:</p>
$$t_{\\text{volo}} = \\frac{v_{0y} + \\sqrt{v_{0y}^2 + 2 g h_0}}{g}$$

<h3>Bilancio energetico</h3>
<p>Senza attriti l'energia meccanica si conserva:</p>
$$E = \\tfrac12 m v^2 + m g y = \\text{costante}$$
<p>Nel punto più alto l'energia cinetica <b>non si annulla</b>: resta $\\tfrac12 m v_{0x}^2$, perché il corpo continua a muoversi in orizzontale.</p>

<h3>Approfondimento: la resistenza dell'aria</h3>
<p>Con un modello di attrito <b>quadratico</b> nella velocità:</p>
$$\\vec a = -g\\,\\hat y - k\\,|\\vec v|\\,\\vec v \\qquad k = \\frac{\\rho\\,C_D\\,A}{2m}$$
<p>Le due componenti del moto non sono più indipendenti e non esiste una soluzione in forma chiusa. La simulazione la calcola numericamente con il metodo di Runge-Kutta del 4° ordine. Effetti principali: la traiettoria diventa asimmetrica (la discesa è più ripida della salita), la gittata si riduce, l'angolo ottimale scende sotto i 45° e la caduta tende alla velocità limite $v_\\infty = \\sqrt{g/k}$.</p>

<h3>Prova con la simulazione</h3>
<ol>
  <li>Trova due angoli diversi con la stessa gittata. Sono complementari?</li>
  <li>Lancio orizzontale da $h_0 = 20$ m con $v_0 = 10$ m/s: prevedi il punto di atterraggio, poi verifica.</li>
  <li>Imposta $k = 0{,}02$: per quale angolo la gittata è ora massima?</li>
  <li>Nel grafico <i>Energia</i>, perché $K$ non arriva mai a zero?</li>
  <li>Nel grafico <i>Velocità</i>, quanto vale la pendenza della retta $v_y(t)$?</li>
</ol>

<h3>Esercizi</h3>
<details><summary>1. Un pallone viene calciato a 15 m/s con un angolo di 35°. Calcola gittata e altezza massima.</summary>
<p>$R = \\dfrac{15^2 \\sin 70^\\circ}{9{,}81} \\approx 21{,}6$ m; $\\quad h_{\\max} = \\dfrac{15^2 \\sin^2 35^\\circ}{2 \\cdot 9{,}81} \\approx 3{,}77$ m.</p></details>
<details><summary>2. Un sasso viene lanciato orizzontalmente a 8 m/s da una scogliera alta 45 m. Dove e con che velocità tocca l'acqua?</summary>
<p>$t = \\sqrt{2h/g} \\approx 3{,}03$ s; $x = 8 \\cdot 3{,}03 \\approx 24{,}2$ m; $v_y = -g t \\approx -29{,}7$ m/s; $|\\vec v| = \\sqrt{8^2 + 29{,}7^2} \\approx 30{,}8$ m/s.</p></details>
<details><summary>3. Con quale angolo bisogna lanciare a 20 m/s per colpire un bersaglio a terra distante 30 m?</summary>
<p>$\\sin 2\\theta = \\dfrac{gR}{v_0^2} = \\dfrac{9{,}81 \\cdot 30}{400} \\approx 0{,}736 \\Rightarrow \\theta \\approx 23{,}7^\\circ$ oppure $\\theta \\approx 66{,}3^\\circ$.</p></details>
`,
};
