import { deg, tn, clamp } from '../core/math.js';
import { crate } from '../core/shapes.js';
import { slab, dust } from '../core/look.js';
import { Stage, brace, angleMark, formulaAtTip, rate01, C as Ccol } from '../core/annot.js';

const stage = new Stage();   // regia: frecce che crescono, graffe, piano che si trasforma, cassa che nasce
const num = (v, d = 1) => (v < 0 ? '−' : '') + Math.abs(v).toFixed(d).replace('.', ',');

const L = 10;            // lunghezza del piano (m)
const BW = 1.0, BH = 0.6; // dimensioni del blocco (m)
const KF = 0.08;         // frecce delle forze: metri per newton
const KV = 0.35;         // frecce di velocità: metri per (m/s)
const KA = 0.35;         // frecce di accelerazione: metri per (m/s²)

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

    P.ground(0);
    slab(P, [[0, 0], B, T], { topEdge: [T, B] });
    // Misure del piano: lunghezza lungo l'ipotenusa (dentro il triangolo) e altezza sul lato verticale.
    if (alpha > 0.5) {
      const gb = S.grow('braces', 0.8);
      brace(P, T, B, `L = ${num(L, 0)}\\ \\mathrm{m}`, { side: -1, gap: 10, grow: gb, color: M.muted });
      brace(P, [0, 0], T, `h = ${num(T[1], 2)}\\ \\mathrm{m}`, { side: -1, gap: 8, grow: gb, color: M.muted });
      angleMark(P, B[0], 0, 46, Math.PI - g.a, Math.PI, `\\alpha = ${Math.round(alpha)}°`, { color: M.text, grow: S.grow('alpha', 0.7) });
    }

    // Blocco.
    const C = at(sPos, BH / 2);
    // La cassa disegnata si può ingrandire (solo estetica): resta appoggiata al piano.
    const kb = ui.size('block') * S.born('block'), Cd = at(sPos, BH * kb / 2);
    if (kb > 0.02) crate(P, Cd[0], Cd[1], { w: BW * kb, h: BH * kb, angle: -g.a, minPx: 0, color: 'blue' });
    P.circle(C[0], C[1], 3, { fill: 'bg' });
    // Polvere mentre striscia con attrito dinamico.
    if (st.regime === 'dinamico' && Math.abs(st.v) > 0.05 && p.muk > 0) {
      const sg = Math.sign(st.v), c0 = at(sPos, 0);
      dust(c0[0], c0[1], d[0] * sg, d[1] * sg, Math.min(1.2, Math.abs(st.f * st.v) * 0.04));
    }

    // Forze. Il peso si scompone e accanto alla componente parallela compare la sua formula dal vivo.
    const W = p.m * p.g;
    if (p.showComp && alpha > 0.5) {
      const tipPar = add(C, d, KF * W * g.sn);
      P.arrow(C[0], C[1], ...tipPar, { color: 'weight', width: 2, dash: [5, 4], key: 'Ppar', alpha: 0.8 });
      P.arrow(C[0], C[1], ...add(C, n, -KF * W * g.c), { color: 'weight', width: 2, dash: [5, 4], label: 'P⊥', alpha: 0.8 });
      const gp = S.grow('arr:Ppar'), [a0, b0] = P.S(C[0], C[1]), [c0, d0] = P.S(C[0] + (tipPar[0] - C[0]) * gp, C[1] + (tipPar[1] - C[1]) * gp);
      const Lp = Math.hypot(c0 - a0, d0 - b0);
      if (!S.snap && Lp > 14) formulaAtTip(P, { x: c0, y: d0, ux: (c0 - a0) / Lp, uy: (d0 - b0) / Lp },
        `\\vec P_{\\parallel} = mg\\sin\\alpha = ${num(W * g.sn, 2)}\\ \\mathrm{N}`, { color: M.vec.weight, size: 16, alpha: rate01(gp) });
    }
    P.arrow(C[0], C[1], C[0], C[1] - KF * W, { color: 'weight', label: 'P' });
    P.arrow(C[0], C[1], ...add(C, n, KF * st.N), { color: 'normal', label: 'N' });
    const contact = at(sPos, 0);
    if (Math.abs(st.f) > 1e-6) P.arrow(contact[0], contact[1], ...add(contact, d, KF * st.f), { color: 'friction', key: 'f', label: st.regime === 'statico' ? 'fs' : 'fd' });

    const top = at(sPos, BH + 0.25);
    if (p.showVel && Math.abs(st.v) > 1e-3) P.arrow(top[0], top[1], ...add(top, d, KV * st.v), { color: 'vel', label: 'v' });
    if (p.showAcc && Math.abs(st.a) > 1e-3) {
      const ta = at(sPos, BH + 0.6);
      P.arrow(ta[0], ta[1], ...add(ta, d, KA * st.a), { color: 'acc', label: 'a' });
    }
    if (st.regime === 'statico') P.text(C[0], C[1], 'in equilibrio', { color: 'normal', size: 12.5, align: 'center', dy: -54 });

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
      { tex: `${Pc('P')}=mg=${tn(W)}${u('N')}` },
      { tex: `${Pc('P_{\\parallel}')}=mg\\sin\\alpha=${tn(W * g.sn)}${u('N')}` },
      { tex: `${Pc('P_{\\perp}')}=mg\\cos\\alpha=${tn(N)}${u('N')}\\quad(=${Nc}\\text{, la normale})` },
      { h: 'Equilibrio statico (da fermo)' },
      { tex: `\\tan\\alpha=${tn(tan, 3)}\\ ${slides ? '>' : '\\le'}\\ \\mu_s=${tn(p.mus)}`, cls: slides ? 'warn' : 'ok' },
      { tex: slides ? `\\Rightarrow\\ \\text{scivola}` : `\\Rightarrow\\ \\text{resta fermo}`, cls: slides ? 'warn' : 'ok' },
      slides && p.muk >= tan && { tex: `\\text{ma }\\mu_d=${tn(p.muk)}\\ \\ge\\ \\tan\\alpha:\\ \\text{si riferma subito (di solito }\\mu_d<\\mu_s)`, cls: 'ok' },
      { tex: `${Fc('f_{s,\\max}')}=\\mu_s ${Nc}=${tn(p.mus * N)}${u('N')}` },
      { h: 'Dinamica (asse lungo il piano, + verso il basso)' },
      { tex: `\\text{discesa: } ${Ac}=g(\\sin\\alpha-\\mu_d\\cos\\alpha)=${tn(aDown)}${u('m/s^2')}` },
      { tex: `\\text{salita: } ${Ac}=-g(\\sin\\alpha+\\mu_d\\cos\\alpha)=${tn(aUp)}${u('m/s^2')}` },
      { h: 'Istante attuale' },
      { tex: `t=${tn(st.t)}${u('s')}\\quad s=${tn(st.s)}${u('m')}\\quad ${Ccol('vel', 'v')}=${tn(st.v)}${u('m/s')}` },
      { tex: `${Ac}=${tn(st.a)}${u('m/s^2')}\\quad ${Fc(`f_{${st.regime === 'statico' ? 's' : 'd'}}`)}=${tn(st.f)}${u('N')}` },
      { h: 'Energia' },
      { tex: `K=${tn(K)}\\quad U=${tn(U)}\\quad Q=${tn(st.Q)}${u('J')}` },
      { tex: `K+U+Q=${tn(K + U + st.Q)}${u('J')}` },
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
