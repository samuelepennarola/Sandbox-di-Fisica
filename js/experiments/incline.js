import { deg, tn, clamp } from '../core/math.js';
import { crate } from '../core/shapes.js';
import { tex, texBox } from '../core/manim.js';
import { uq, un, ut, uf, utn } from '../core/units.js';
import { Stage, brace, angleMark, rate01, C as Ccol } from '../core/annot.js';

const stage = new Stage();   // regia: frecce che crescono, graffe, piano che si trasforma, cassa che nasce
const num = (v, d = 1) => (v < 0 ? '−' : '') + Math.abs(v).toFixed(d).replace('.', ',');

const L = 10;            // lunghezza del piano (m)
const BW = 1.0, BH = 0.6; // dimensioni del blocco (m)
const KF = 0.08;         // frecce delle forze: metri per newton
const KV = 0.35;         // frecce di velocità: metri per (m/s)
const KA = 0.35;         // frecce di accelerazione: metri per (m/s²)

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

// Geometria: vertice in alto T = (0, L sinα); s misura la distanza lungo il piano da T, positiva verso il basso.
function geom(p) {
  const a = p.alpha * deg, c = Math.cos(a), sn = Math.sin(a);
  return { a, c, sn, T: [0, L * sn], B: [L * c, 0], d: [c, -sn], n: [sn, c] };
}

// Forze lungo il piano per una data velocità: restituisce accelerazione, attrito e regime.
function dynamics(v, p, g) {
  const N = p.m * p.g * g.c, Fpar = p.m * p.g * g.sn;
  if (Math.abs(v) < 1e-9) {
    // Se anche l'attrito dinamico basta a trattenerlo (μd ≥ μs, caso limite), il blocco resta fermo.
    if (Fpar <= p.mus * N || Fpar <= p.muk * N) return { a: 0, f: -Fpar, N, regime: 'statico' };
    const f = -p.muk * N;
    return { a: (Fpar + f) / p.m, f, N, regime: 'dinamico' };
  }
  const f = -Math.sign(v) * p.muk * N;
  return { a: (Fpar + f) / p.m, f, N, regime: 'dinamico' };
}

export default {
  id: 'incline',
  title: 'Piano inclinato',
  subtitle: 'Forze, attrito statico e dinamico, energia',

  params: [
    { key: 'alpha', label: 'Inclinazione α', unit: '°', min: 0, max: 60, step: 1, value: 30 },
    { key: 'm', label: 'Massa m', unit: 'kg', min: 0.5, max: 5, step: 0.1, value: 2 },
    { key: 'mus', label: 'Attrito statico μs', unit: '', min: 0, max: 1.2, step: 0.01, value: 0.5 },
    { key: 'muk', label: 'Attrito dinamico μd', unit: '', min: 0, max: 1.2, step: 0.01, value: 0.3 },
    { key: 'v0', label: 'Velocità iniziale v₀ (+ giù)', unit: 'm/s', min: -10, max: 10, step: 0.1, value: 0 },
    { key: 's0', label: 'Posizione iniziale s₀', unit: 'm', min: BW / 2, max: L - BW / 2, step: 0.1, value: 1.5 },
    { key: 'g', label: 'Gravità g', unit: 'm/s²', min: 1, max: 25, step: 0.01, value: 9.81 },
    { key: 'showComp', type: 'toggle', label: 'Scomponi il peso', value: true, live: true },
    { key: 'showVel', type: 'toggle', label: 'Vettore velocità', value: true, live: true },
    { key: 'showAcc', type: 'toggle', label: 'Vettore accelerazione', value: false, live: true },
  ],

  presets: [
    { label: 'Fermo per attrito', values: { alpha: 25, mus: 0.6, muk: 0.4, v0: 0, s0: 2 } },
    { label: 'Scivola', values: { alpha: 35, mus: 0.5, muk: 0.3, v0: 0, s0: 1.5 } },
    { label: 'Spinto verso l\'alto', values: { alpha: 30, mus: 0.4, muk: 0.25, v0: -6, s0: 8.5 } },
    { label: 'Senza attrito', values: { alpha: 30, mus: 0, muk: 0, v0: 0, s0: 1 } },
  ],

  view(p) {
    const g = geom(p);
    return { xmin: -0.8, xmax: g.B[0] + 0.8, ymin: -0.6, ymax: Math.max(g.T[1], 3) + 1.8 };
  },

  init(p) {
    return { t: 0, s: p.s0, v: p.v0, Q: 0, done: false, ...dynamics(p.v0, p, geom(p)) };
  },

  step(st, dt, p) {
    const g = geom(p);
    const dyn = dynamics(st.v, p, g);
    const vNew = st.v + dyn.a * dt;
    let ds;
    if (st.v !== 0 && Math.sign(vNew) !== Math.sign(st.v)) {
      // Il blocco si ferma durante il passo: arrestalo esattamente.
      const tStop = -st.v / dyn.a;
      ds = st.v * tStop + 0.5 * dyn.a * tStop * tStop;
      st.v = 0;
    } else {
      ds = (st.v + vNew) / 2 * dt;
      st.v = vNew;
    }
    st.s += ds;
    st.Q += Math.abs(dyn.f * ds) * (dyn.regime === 'dinamico' ? 1 : 0);
    st.t += dt;
    Object.assign(st, dyn);
    if (st.s >= L - BW / 2) { st.s = L - BW / 2; st.done = true; }
    if (st.s <= BW / 2 && st.v < 0) { st.s = BW / 2; st.done = true; }
  },

  done: s => s.done,

  sample(s, p) {
    const g = geom(p);
    const K = 0.5 * p.m * s.v * s.v, U = p.m * p.g * (L - s.s) * g.sn;
    return { t: s.t, s: s.s, v: s.v, a: s.a, K, U, Q: s.Q, Em: K + U, E: K + U + s.Q };
  },

  graphs: [
    { title: 'Posizione', series: [{ key: 's', label: 's (m)', color: 'vel' }] },
    { title: 'Velocità', series: [{ key: 'v', label: 'v (m/s)', color: 'vel' }, { key: 'a', label: 'a (m/s²)', color: 'acc' }] },
    { title: 'Energia', series: [
      { key: 'K', label: 'K (J)', color: 'vel' }, { key: 'U', label: 'U (J)', color: 'normal' },
      { key: 'Q', label: 'calore Q (J)', color: 'weight' }, { key: 'E', label: 'K+U+Q (J)', color: 'friction', dash: [5, 4] }] },
  ],

  resizables(s, p, { scale, size }) {
    const g = geom(p), k = size('block'), h = BH * k / 2;
    return [{ key: 'block', x: g.T[0] + g.d[0] * s.s + g.n[0] * h, y: g.T[1] + g.d[1] * s.s + g.n[1] * h, rPx: Math.hypot(BW, BH) * k * scale / 2 }];
  },

  handles(s, p) {
    const g = geom(p);
    const C = [g.T[0] + g.d[0] * s.s + g.n[0] * BH / 2, g.T[1] + g.d[1] * s.s + g.n[1] * BH / 2];
    return [{ id: 'block', x: C[0], y: C[1], r: 30 }, { id: 'alpha', x: g.T[0], y: g.T[1] }];
  },

  drag(id, wx, wy, p) {
    if (id === 'alpha') p.alpha = clamp(Math.round(Math.asin(clamp(wy / L, 0, 1)) / deg), 0, 60);
    if (id === 'block') {
      const g = geom(p);
      const s = (wx - g.T[0]) * g.d[0] + (wy - g.T[1]) * g.d[1];
      p.s0 = clamp(Math.round(s * 10) / 10, BW / 2, L - BW / 2);
    }
  },

  mount() { stage.reset(); },

  draw(P, st, p, ui) {
    const S = stage.begin(P, ui), M = S.M;
    // Inclinazione e posizione mostrate inseguono quelle vere quando cambiano da ferme (il piano si trasforma);
    // durante la corsa o mentre si trascina seguono subito.
    const live = !!ui.active || !!ui.api?.running;
    const [alpha] = S.smooth('alpha', [p.alpha], 0.12, live), [sPos] = S.smooth('s', [st.s], 0.12, live);
    const g = geom({ ...p, alpha }), { T, B, d, n } = g;
    const at = (s, h = 0) => [T[0] + d[0] * s + n[0] * h, T[1] + d[1] * s + n[1] * h];
    const add = (A, v, k) => [A[0] + v[0] * k, A[1] + v[1] * k];
    // Versi sullo schermo (y verso il basso) lungo il piano e verso l'interno del piano.
    const dS = [d[0], -d[1]], inS = [-n[0], n[1]];

    P.ground(0);
    // Piano: triangolo appena velato, cateti tenui e il piano d'appoggio netto.
    const tri = [[0, 0], B, T];
    P.poly(tri, { fill: M.text, alpha: M.dark ? 0.05 : 0.06 });
    P.line([[0, 0], T], { color: 'muted', width: 1.2, alpha: 0.55 });
    P.line([T, B], { color: M.text, width: 2 });

    // Quote: l'angolo α alla base e la lunghezza L lungo il piano (dentro il triangolo). La graffa di L si attenua
    // quando il blocco e le sue frecce le passano sopra.
    if (alpha > 0.5) {
      const gb = S.grow('braces', 0.8), near = Math.abs(sPos - L / 2) < 2.6;
      const dimL = S.smooth('dimL', [near && p.showComp ? 0.2 : 0.55], 0.25)[0];
      brace(P, T, B, 'L', { side: -1, gap: 12, grow: gb, alpha: dimL, color: M.muted });
      angleMark(P, B[0], 0, 46, Math.PI - g.a, Math.PI, '\\alpha', { color: M.text, grow: S.grow('alpha', 0.7) });
    }

    // Blocco: rettangolo piatto appoggiato al piano (ingrandibile solo nel disegno), con il punto d'applicazione.
    const C = at(sPos, BH / 2);
    const kb = ui.size('block') * S.born('block'), Cd = at(sPos, BH * kb / 2);
    if (kb > 0.02) crate(P, Cd[0], Cd[1], { w: BW * kb, h: BH * kb, angle: -g.a, minPx: 0, color: 'blue' });
    P.circle(C[0], C[1], 2.5, { fill: M.text });

    // Forze, ciascuna con il solo nome. Componenti del peso tratteggiate e più tenui.
    const W = p.m * p.g;
    if (p.showComp && alpha > 0.5) {
      const ePar = add(C, d, KF * W * g.sn), ePerp = add(C, n, -KF * W * g.c);
      P.arrow(C[0], C[1], ...ePar, { color: 'weight', width: 2, dash: [5, 4], key: 'Ppar', alpha: 0.7 });
      P.arrow(C[0], C[1], ...ePerp, { color: 'weight', width: 2, dash: [5, 4], key: 'Pperp', alpha: 0.7 });
      tag(P, S, 'Ppar', C, ePar, '\\vec P_{\\parallel}', M.vec.weight, { alpha: 0.9 });
      // P⊥ ha l'etichetta di lato, verso la cima del piano: lontana da P, che punta in basso.
      tag(P, S, 'Pperp', C, ePerp, '\\vec P_{\\perp}', M.vec.weight, { side: [-dS[0], -dS[1]], at: 1, alpha: 0.9 });
    }
    const eP = [C[0], C[1] - KF * W], eN = add(C, n, KF * st.N);
    P.arrow(C[0], C[1], ...eP, { color: 'weight', key: 'P' });
    tag(P, S, 'P', C, eP, '\\vec P', M.vec.weight);
    P.arrow(C[0], C[1], ...eN, { color: 'normal', key: 'N' });
    // Se la punta di N cade all'altezza delle frecce v e a (sopra il blocco), l'etichetta va di lato, dal lato libero.
    const hN = BH / 2 + KF * st.N, busy = (p.showVel && Math.abs(st.v) > 1e-3) || (p.showAcc && Math.abs(st.a) > 1e-3);
    const sv = Math.sign(st.v || st.a || 1);
    tag(P, S, 'N', C, eN, '\\vec N', M.vec.normal, busy && hN > BH && hN < BH + 1.1 ? { side: [-dS[0] * sv, -dS[1] * sv], at: 1 } : {});
    // Attrito lungo la superficie di contatto: parte dallo spigolo del blocco verso cui punta, così resta fuori dalla
    // sagoma; l'etichetta sta sotto la superficie, a metà freccia.
    if (Math.abs(st.f) > 1e-6) {
      const contact = at(sPos + Math.sign(st.f) * BW * kb / 2, 0), eF = add(contact, d, KF * st.f);
      P.arrow(contact[0], contact[1], ...eF, { color: 'friction', key: 'f' });
      tag(P, S, 'f', contact, eF, st.regime === 'statico' ? '\\vec f_s' : '\\vec f_d', M.vec.friction, { side: inS, at: 0.5 });
    }

    // Velocità e accelerazione, parallele al piano, sopra il blocco: partono poco oltre la retta di N, così non la incrociano.
    const off = 14 / P.cam.scale;
    if (p.showVel && Math.abs(st.v) > 1e-3) {
      const top = at(sPos + Math.sign(st.v) * off, BH + 0.3), eV = add(top, d, KV * st.v);
      P.arrow(top[0], top[1], ...eV, { color: 'vel', key: 'v' });
      tag(P, S, 'v', top, eV, '\\vec v', M.vec.vel);
    }
    if (p.showAcc && Math.abs(st.a) > 1e-3) {
      const ta = at(sPos + Math.sign(st.a) * off, BH + 0.75), eA = add(ta, d, KA * st.a);
      P.arrow(ta[0], ta[1], ...eA, { color: 'acc', key: 'a' });
      tag(P, S, 'a', ta, eA, '\\vec a', M.vec.acc);
    }

    P.handle(T[0], T[1], ui.active === 'alpha');
    if (ui.active === 'block') P.handle(C[0], C[1], true);
  },

  formulas(st, p) {
    const g = geom(p), W = p.m * p.g, N = W * g.c, tan = Math.tan(g.a);
    const u = x => `\\ \\mathrm{${x}}`;
    // Stessi colori delle frecce sulla scena: peso, normale, attrito, accelerazione.
    const Pc = x => Ccol('weight', x), Fc = x => Ccol('friction', x), Nc = Ccol('normal', 'N'), Ac = Ccol('acc', 'a');
    const slides = tan > p.mus;
    const aDown = p.g * (g.sn - p.muk * g.c), aUp = -p.g * (g.sn + p.muk * g.c);
    const K = 0.5 * p.m * st.v * st.v, U = W * (L - st.s) * g.sn;
    return [
      { h: 'Scomposizione del peso' },
      { tex: `${Pc('P')}=mg=${uq('N', W)}` },
      { key: true, tex: `${Pc('P_{\\parallel}')}=mg\\sin\\alpha=${uq('N', W * g.sn)}` },
      { key: true, tex: `${Pc('P_{\\perp}')}=mg\\cos\\alpha=${uq('N', N)}\\quad(=${Nc}\\text{, la normale})` },
      { h: 'Equilibrio statico (da fermo)' },
      { key: true, tex: `\\tan\\alpha=${tn(tan, 3)}\\ ${slides ? '>' : '\\le'}\\ \\mu_s=${tn(p.mus)}`, cls: slides ? 'warn' : 'ok' },
      { tex: slides ? `\\Rightarrow\\ \\text{scivola}` : `\\Rightarrow\\ \\text{resta fermo}`, cls: slides ? 'warn' : 'ok' },
      slides && p.muk >= tan && { tex: `\\text{ma }\\mu_d=${tn(p.muk)}\\ \\ge\\ \\tan\\alpha:\\ \\text{si riferma subito (di solito }\\mu_d<\\mu_s)`, cls: 'ok' },
      { tex: `${Fc('f_{s,\\max}')}=\\mu_s ${Nc}=${uq('N', p.mus * N)}` },
      { h: 'Dinamica (asse lungo il piano, + verso il basso)' },
      { tex: `\\text{discesa: } ${Ac}=g(\\sin\\alpha-\\mu_d\\cos\\alpha)=${uq('m/s²', aDown)}` },
      { tex: `\\text{salita: } ${Ac}=-g(\\sin\\alpha+\\mu_d\\cos\\alpha)=${uq('m/s²', aUp)}` },
      { h: 'Istante attuale' },
      { tex: `t=${uq('s', st.t)}\\quad s=${uq('m', st.s)}\\quad ${Ccol('vel', 'v')}=${uq('m/s', st.v)}` },
      { tex: `${Ac}=${uq('m/s²', st.a)}\\quad ${Fc(`f_{${st.regime === 'statico' ? 's' : 'd'}}`)}=${uq('N', st.f)}` },
      { h: 'Energia' },
      { tex: `K=${tn(K)}\\quad U=${tn(U)}\\quad Q=${uq('J', st.Q)}` },
      { tex: `K+U+Q=${uq('J', K + U + st.Q)}` },
    ];
  },

  theory: `
<h2>Piano inclinato</h2>
<p>Un blocco di massa $m$ è appoggiato su un piano inclinato di un angolo $\\alpha$. Sul blocco agiscono tre forze: il <b>peso</b> $\\vec P$, la <b>reazione normale</b> $\\vec N$ e la <b>forza di attrito</b> $\\vec f$.</p>

<h3>Scomposizione del peso</h3>
<p>Conviene usare un sistema di assi orientato lungo il piano e perpendicolare a esso:</p>
$$P_{\\parallel} = mg\\sin\\alpha \\qquad P_{\\perp} = mg\\cos\\alpha$$
<p>Perpendicolarmente al piano il blocco non si muove, quindi le forze si bilanciano: $N = mg\\cos\\alpha$.</p>
<div class="box">Attenzione: in generale $N \\ne mg$! La normale coincide con il peso solo se il piano è orizzontale.</div>

<h3>Attrito statico</h3>
<p>Finché il blocco è fermo, l'attrito statico si adatta per bilanciare $P_{\\parallel}$, ma non può superare un valore massimo:</p>
$$f_s \\le \\mu_s N$$
<p>Il blocco rimane fermo se $mg\\sin\\alpha \\le \\mu_s\\, mg\\cos\\alpha$, cioè se</p>
$$\\tan\\alpha \\le \\mu_s$$
<p>Massa e gravità si semplificano. L'<b>angolo limite</b> $\\alpha_{\\lim} = \\arctan\\mu_s$ dipende solo dalle superfici a contatto.</p>

<h3>Attrito dinamico</h3>
<p>Quando il blocco scivola, l'attrito ha modulo costante $f_d = \\mu_d N$ ed è sempre <b>opposto alla velocità</b>. Di solito $\\mu_d &lt; \\mu_s$. Prendendo positivo il verso <b>verso il basso</b> lungo il piano:</p>
$$\\text{in discesa: } a = g(\\sin\\alpha - \\mu_d\\cos\\alpha)$$
$$\\text{in salita: } a = -g(\\sin\\alpha + \\mu_d\\cos\\alpha)$$
<p>In salita peso e attrito agiscono nello stesso verso, quindi la decelerazione è maggiore. Arrivato in cima alla salita, il blocco si ferma e da lì vale di nuovo la condizione di attrito statico.</p>

<h3>Bilancio energetico</h3>
<p>L'attrito dinamico <b>dissipa</b> energia meccanica, trasformandola in calore $Q$:</p>
$$\\Delta K + \\Delta U = -Q \\qquad Q = \\mu_d\\, m g \\cos\\alpha \\cdot d$$
<p>dove $d$ è la distanza percorsa strisciando. La somma $K + U + Q$ resta costante: nel grafico <i>Energia</i> la linea tratteggiata è orizzontale.</p>

<h3>Prova con la simulazione</h3>
<ol>
  <li>Con $\\mu_s = 0{,}5$, aumenta lentamente $\\alpha$ partendo da 0: a che angolo il blocco inizia a scivolare? Confrontalo con $\\arctan 0{,}5$.</li>
  <li>Cambia la massa: l'accelerazione cambia? Perché?</li>
  <li>Imposta $v_0 = -6$ m/s (spinta verso l'alto): confronta la pendenza di $v(t)$ in salita e in discesa.</li>
  <li>Senza attrito, verifica che $K + U$ rimane costante.</li>
</ol>

<h3>Esercizi</h3>
<details><summary>1. Un blocco di 3 kg è su un piano inclinato di 20° con $\\mu_s = 0{,}4$. Resta fermo? Quanto vale l'attrito statico?</summary>
<p>$\\tan 20^\\circ \\approx 0{,}364 \\le 0{,}4$: resta fermo. $f_s = mg\\sin 20^\\circ \\approx 3 \\cdot 9{,}81 \\cdot 0{,}342 \\approx 10{,}1$ N, minore di $\\mu_s N \\approx 11{,}1$ N.</p></details>
<details><summary>2. Stesso piano inclinato di 35° con $\\mu_d = 0{,}3$: il blocco parte da fermo e percorre 5 m. Quanto vale la velocità finale?</summary>
<p>$a = 9{,}81(\\sin 35^\\circ - 0{,}3\\cos 35^\\circ) \\approx 3{,}22$ m/s²; $\\quad v = \\sqrt{2ad} \\approx 5{,}67$ m/s.</p></details>
<details><summary>3. Un blocco viene lanciato verso l'alto a 6 m/s su un piano di 30° con $\\mu_d = 0{,}25$. Quanta strada percorre prima di fermarsi?</summary>
<p>$|a| = 9{,}81(\\sin 30^\\circ + 0{,}25\\cos 30^\\circ) \\approx 7{,}03$ m/s²; $\\quad d = v_0^2/(2|a|) \\approx 2{,}56$ m.</p></details>
`,
};
