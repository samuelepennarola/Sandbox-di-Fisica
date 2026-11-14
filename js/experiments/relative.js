import { deg, tn, fmt, clamp } from '../core/math.js';
import { ball, boatTop, flatcar, grass, person, rails, treeSide, treeTop, water } from '../core/shapes.js';
import { Stage, angleMark, formulaBeside, rate01, fc, C } from '../core/annot.js';

const stage = new Stage();   // regia: frecce che crescono, passaggio morbido tra i punti di vista, corpi che nascono

const Y_HAND = 2;     // treno: quota del punto di lancio (m)
const Y_DECK = 1;     // treno: quota del pianale (m)
const CAR = 6;        // treno: semilunghezza del carro pianale (m)
const T_FREE = 20;    // fiume: durata massima se la barca non punta verso l'altra riva
const KV_TRAIN = 0.2; // treno: metri di disegno per (m/s)

const kvOf = p => (p.scene === 'river' ? p.L / 40 : KV_TRAIN);
const start = p => (p.scene === 'river' ? [0, 0] : [0, Y_HAND]);

// Moto di S′ rispetto a S: X(t) = V t + ½ A t².
// Fiume: la barca ha velocità costante v′ rispetto all'acqua (S′).
// Treno: la pallina, una volta lanciata, è soggetta solo alla gravità in S.
function model(p) {
  const vpx = p.vp * Math.cos(p.phi * deg), vpy = p.vp * Math.sin(p.phi * deg);
  let tEnd;
  if (p.scene === 'river') tEnd = vpy > 1e-9 ? p.L / vpy : T_FREE;
  else tEnd = (vpy + Math.sqrt(vpy * vpy + 2 * p.g * (Y_HAND - Y_DECK))) / p.g;
  return { vpx, vpy, tEnd };
}

function stateAt(p, m, t) {
  const X = p.V * t + 0.5 * p.A * t * t, VX = p.V + p.A * t;
  let xp, yp, vpxt, vpyt;
  if (p.scene === 'river') {
    xp = m.vpx * t; yp = m.vpy * t; vpxt = m.vpx; vpyt = m.vpy;
  } else {
    // In S: x = (V + v′x) t, y = y₀ + v′y t − ½ g t². In S′ si sottrae X(t).
    xp = m.vpx * t - 0.5 * p.A * t * t; yp = Y_HAND + m.vpy * t - 0.5 * p.g * t * t;
    vpxt = m.vpx - p.A * t; vpyt = m.vpy - p.g * t;
  }
  return { X, VX, xp, yp, vpx: vpxt, vpy: vpyt, x: xp + X, y: yp, vx: vpxt + VX, vy: vpyt };
}

export default {
  id: 'relative',
  title: 'Moti relativi',
  subtitle: 'Due sistemi di riferimento e la composizione delle velocità',

  params: [
    { key: 'scene', type: 'select', label: 'Situazione', value: 'river',
      options: [{ label: 'Barca sul fiume', value: 'river' }, { label: 'Pallina dal treno', value: 'train' }] },
    { key: 'view', type: 'select', label: 'Punto di vista', value: 'both', live: true,
      options: [{ label: 'Da S', value: 'S' }, { label: 'Da S′', value: 'Sp' }, { label: 'Entrambi', value: 'both' }] },
    { key: 'V', label: 'Velocità di S′ rispetto a S, V', unit: 'm/s', min: -15, max: 15, step: 0.5, value: 2 },
    { key: 'A', label: 'Accelerazione di S′, A', unit: 'm/s²', min: -3, max: 3, step: 0.1, value: 0 },
    { key: 'vp', label: 'Velocità del corpo in S′, v′', unit: 'm/s', min: 0, max: 20, step: 0.5, value: 3 },
    { key: 'phi', label: 'Direzione di v′ (da +x)', unit: '°', min: -180, max: 180, step: 1, value: 90 },
    { key: 'L', label: 'Larghezza del fiume L', unit: 'm', min: 5, max: 100, step: 1, value: 20 },
    { key: 'g', label: 'Gravità g (treno)', unit: 'm/s²', min: 1, max: 25, step: 0.01, value: 9.81 },
    { key: 'showTri', type: 'toggle', label: 'Triangolo delle velocità', value: true, live: true },
  ],

  presets: [
    { label: 'Fiume: prua perpendicolare', values: { scene: 'river', V: 2, A: 0, vp: 3, phi: 90, L: 20 } },
    { label: 'Fiume: traversata dritta', values: { scene: 'river', V: 2, A: 0, vp: 3, phi: 180 - Math.acos(2 / 3) / deg, L: 20 } },
    { label: 'Treno: lancio in verticale', values: { scene: 'train', V: 10, A: 0, vp: 6, phi: 90, g: 9.81 } },
    { label: 'Treno che accelera', values: { scene: 'train', V: 10, A: 3, vp: 6, phi: 90, g: 9.81 } },
    { label: 'Treno: lancio all\'indietro a −V', values: { scene: 'train', V: 10, A: 0, vp: 10, phi: 180, g: 9.81 } },
  ],

  view(p) {
    const m = model(p), e = stateAt(p, m, m.tEnd);
    // Con «Da S′» tutto è disegnato spostato di −X: S′ resta fermo, la scia vista da S parte da −X.
    const sp = p.view === 'Sp';
    const xs = sp ? [0, e.xp, -e.X] : [0, e.x, e.X];
    if (p.scene === 'river') {
      const pad = p.L * 0.2;
      return { xmin: Math.min(...xs) - pad, xmax: Math.max(...xs) + pad, ymin: -p.L * 0.18, ymax: p.L * 1.18 };
    }
    xs.push(-CAR, CAR, CAR + (sp ? 0 : e.X));
    const top = Y_HAND + (m.vpy > 0 ? m.vpy * m.vpy / (2 * p.g) : 0);
    return { xmin: Math.min(...xs) - 2, xmax: Math.max(...xs) + 2, ymin: -1.5, ymax: Math.max(top, 3) + 1.5 };
  },

  init(p) {
    const m = model(p), c = stateAt(p, m, 0);
    return { t: 0, tEnd: m.tEnd, ...c, trailS: [[c.x, c.y]], trailP: [[c.xp, c.yp]] };
  },

  step(s, dt, p) {
    const m = model(p);
    s.t = Math.min(s.t + dt, m.tEnd);
    Object.assign(s, stateAt(p, m, s.t));
    const last = s.trailP[s.trailP.length - 1], lastS = s.trailS[s.trailS.length - 1];
    const tol = p.scene === 'river' ? p.L / 400 : 0.03;
    if (s.t >= m.tEnd || Math.hypot(s.xp - last[0], s.yp - last[1]) > tol || Math.hypot(s.x - lastS[0], s.y - lastS[1]) > tol) {
      s.trailS.push([s.x, s.y]);
      s.trailP.push([s.xp, s.yp]);
    }
  },

  done: s => s.t >= s.tEnd,

  sample(s) {
    return { t: s.t, x: s.x, xp: s.xp, y: s.y, vx: s.vx, vpx: s.vpx, VX: s.VX, vy: s.vy };
  },

  graphs: [
    { title: 'Posizione x', series: [{ key: 'x', label: 'x in S (m)', color: 'vel' }, { key: 'xp', label: 'x′ in S′ (m)', color: 'applied' }] },
    { title: 'Velocità x', series: [{ key: 'vx', label: 'vₓ in S (m/s)', color: 'vel' }, { key: 'vpx', label: 'v′ₓ in S′ (m/s)', color: 'applied' }, { key: 'VX', label: 'V di S′ (m/s)', color: 'friction' }] },
    { title: 'Posizione y', series: [{ key: 'y', label: 'y = y′ (m)', color: 'normal' }] },
  ],

  // Il corpo (barca o pallina) si può ingrandire per vederlo meglio: non cambia la fisica.
  resizables(s, p, { scale, size }) {
    const k = size('body'), off = p.view === 'Sp' ? s.X : 0;
    const rPx = p.scene === 'river' ? Math.max(Math.max(2, p.L * 0.09) * scale, 34) * k / 2 : Math.max(0.13 * scale, 10) * k;
    return [{ key: 'body', x: s.x - off, y: s.y, rPx }];
  },

  handles(s, p) {
    const [x0, y0] = start(p), m = model(p), kv = kvOf(p);
    return [{ id: 'vp', x: x0 + kv * m.vpx, y: y0 + kv * m.vpy }];
  },

  drag(id, wx, wy, p) {
    if (id !== 'vp') return;
    const [x0, y0] = start(p), kv = kvOf(p), dx = wx - x0, dy = wy - y0;
    p.vp = clamp(Math.round(Math.hypot(dx, dy) / kv * 2) / 2, 0, 20);
    p.phi = clamp(Math.round(Math.atan2(dy, dx) / deg), -180, 180);
  },

  mount() { stage.reset(); },

  draw(P, s, p, ui) {
    const S = stage.begin(P, ui), M = S.M;
    const river = p.scene === 'river';
    // Spostamento di disegno: con «Da S′» S′ resta fermo. Al cambio di punto di vista la scena scivola
    // dall'uno all'altro (si interpola il peso del punto di vista, non lo spostamento, che in corsa cambia di continuo).
    const [wSp] = S.smooth('view', [p.view === 'Sp' ? 1 : 0], 0.16);
    const off = wSp * s.X;
    const inS = ([x, y]) => [x - off, y];
    const inP = ([x, y]) => [x + s.X - off, y];
    const b = P.cam.bounds(), kv = kvOf(p);
    const span = (step, shift, fn) => { for (let u = Math.ceil((b.x0 - shift) / step) * step; u <= b.x1 - shift; u += step) fn(u + shift, u); };

    if (river) {
      // Rive d'erba con alberi (fermi in S) e acqua con increspature (ferme in S′, quindi scorrono con la corrente).
      const big = p.L * 3, gap = Math.max(4, p.L * 0.45), tr = Math.max(0.8, p.L * 0.05);
      grass(P, -big, 0, 0);
      grass(P, p.L, p.L + big, p.L);
      water(P, 0, p.L, { phase: s.X - off });
      span(gap, -off, x => { treeTop(P, x, -tr * 1.6, { r: tr }); treeTop(P, x + gap / 2, p.L + tr * 1.6, { r: tr }); });
    } else {
      // Alberi sullo sfondo e binario (fermi in S), carro pianale con una persona (fermi in S′).
      span(9, -off, x => treeSide(P, x, 0, { h: 4.5 }));
      P.ground(-0.18);
      rails(P, { offset: -off });
      const cx = s.X - off;
      flatcar(P, cx, { len: 2 * CAR, deck: Y_DECK, rot: -s.X / 0.32 });
      person(P, cx - 0.45, Y_DECK, { hand: [cx, Y_HAND] });
    }

    // Origini dei due sistemi di riferimento.
    const ax = river ? p.L * 0.08 : 1.2, oy = river ? 0 : Y_DECK;
    const [sx0] = inS([0, 0]);
    P.arrow(sx0, 0, sx0 + ax, 0, { color: 'text', width: 2, head: 9 });
    P.arrow(sx0, 0, sx0, ax, { color: 'text', width: 2, head: 9 });
    P.text(sx0, 0, 'S', { dx: -12, dy: 12, weight: 700 });
    const [px0] = inP([0, 0]);
    P.arrow(px0, oy, px0 + ax, oy, { color: 'applied', width: 2, head: 9 });
    P.arrow(px0, oy, px0, oy + ax, { color: 'applied', width: 2, head: 9 });
    P.text(px0, oy, 'S′', { color: 'applied', dx: -14, dy: 12, weight: 700 });
    if (Math.abs(s.VX) > 1e-9) P.arrow(px0, oy - ax * 0.5, px0 + kv * s.VX, oy - ax * 0.5, { color: 'friction', key: 'Vframe', width: 3.5, label: `V = ${fmt(Math.abs(s.VX), 1)} m/s` });

    // Traiettorie: quella vista da S e quella «disegnata» su S′, che si muove con lui.
    const tS = s.trailS.map(inS), tP = s.trailP.map(inP);
    const showS = p.view !== 'Sp', showP = p.view !== 'S';
    P.line(tS, { color: 'vel', width: showS ? 4 : 2, alpha: showS ? 0.75 : 0.5, dash: showS ? null : [5, 5] });
    P.line(tP, { color: 'applied', width: showP ? 4 : 2, alpha: showP ? 0.75 : 0.5, dash: showP ? null : [5, 5] });

    // Vettore v′ iniziale trascinabile.
    const [x0, y0] = start(p), m = model(p);
    if (s.t === 0) {
      P.arrow(x0, y0, x0 + kv * m.vpx, y0 + kv * m.vpy, { color: 'applied', label: 'v′', width: 2.5 });
      if (Math.abs(p.phi) > 0.5 && p.vp > 0) angleMark(P, x0, y0, 30, 0, p.phi * deg, `\\varphi = ${Math.round(p.phi)}°`, { color: M.muted, grow: S.grow('phi', 0.7) });
    }
    P.handle(x0 + kv * m.vpx, y0 + kv * m.vpy, ui.active === 'vp');

    // Corpo e composizione delle velocità v = v′ + V.
    const [bx, by] = inS([s.x, s.y]);
    if (river) {
      // La prua è orientata come v′ (dove punta la barca), non come v.
      const k = ui.size('body') * S.born('boat');
      boatTop(P, bx, by, { len: Math.max(2, p.L * 0.09) * k, angle: Math.atan2(s.vpy, s.vpx), minPx: 34 * k });
    } else {
      const k = ui.size('body') * S.born('ball');
      ball(P, bx, by, { r: 0.13 * k, color: 'red', minPx: 10 * k, spin: s.t * 6 });
    }
    const lab = (n, vx, vy) => `${n} = ${fmt(Math.hypot(vx, vy), 1)} m/s`;
    if (s.t > 0) {
      const vp = [kv * s.vpx, kv * s.vpy], V = [kv * s.VX, 0], v = [kv * s.vx, kv * s.vy];
      if (p.showTri) {
        // Triangolo delle velocità: i tre lati crescono uno dopo l'altro, poi accanto alla risultante
        // compare la composizione galileiana scritta per esteso, con i colori dei vettori.
        P.arrow(bx, by, bx + vp[0], by + vp[1], { color: 'applied', key: 'vp', label: 'v′', width: 3.5 });
        P.arrow(bx + vp[0], by + vp[1], bx + v[0], by + v[1], { color: 'friction', key: 'V', label: 'V', width: 3, dash: [6, 4], delay: 0.35 });
        P.arrow(bx, by, bx + v[0], by + v[1], { color: 'vel', key: 'v', label: 'v', width: 4, delay: 0.7 });
        const gv = S.grow('arr:v', 0.6, 0.7), [a0, b0] = P.S(bx, by), [c0, d0] = P.S(bx + v[0] * gv, by + v[1] * gv);
        if (!S.snap && Math.hypot(c0 - a0, d0 - b0) > 24) {
          const t = (k, x) => `\\textcolor{${fc(k)}}{${x}}`;
          formulaBeside(P, a0, b0, c0, d0, `${t('vel', '\\vec v')} = ${t('applied', "\\vec v'")} + ${t('friction', '\\vec V')},\\ \\ |${t('vel', '\\vec v')}| = ${fmt(Math.hypot(s.vx, s.vy), 1)}\\ \\mathrm{m/s}`,
            { size: 16, alpha: rate01(gv) });
        }
      } else {
        if (showS) P.arrow(bx, by, bx + v[0], by + v[1], { color: 'vel', key: 'v', label: lab('v', s.vx, s.vy), width: 4 });
        if (showP) P.arrow(bx, by, bx + vp[0], by + vp[1], { color: 'applied', key: 'vp', label: lab('v′', s.vpx, s.vpy), width: 3.5 });
      }
      // Forza apparente per unità di massa, se S′ accelera.
      if (showP && Math.abs(p.A) > 1e-9) P.arrow(bx, by, bx - kv * p.A * 1.5, by, { color: 'acc', key: 'A', label: '−A (apparente)', width: 3 });
    }
  },

  formulas(s, p) {
    const m = model(p), river = p.scene === 'river', u = x => `\\ \\mathrm{${x}}`;
    const sgn = x => (x < 0 ? '-' : '+'), abs = Math.abs;
    // Stessi colori della scena: v (in S) azzurra, v′ (in S′) rosa, V e A di S′.
    const Vs = x => C('vel', x), Vp = x => C('applied', x), VV = x => C('friction', x);
    const out = [
      { h: 'Composizione galileiana' },
      { tex: `${Vs('\\vec v')}=${Vp("\\vec{v}'")}+${VV('\\vec V')}\\qquad \\vec a=\\vec{a}'+${C('acc', '\\vec A')}` },
      { tex: `${Vp("v'_x")}=${tn(s.vpx)}\\quad ${Vp("v'_y")}=${tn(s.vpy)}\\quad ${VV('V')}=${tn(s.VX)}${u('m/s')}` },
      { tex: `${Vs('v_x')}=${Vp("v'_x")}+${VV('V')}=${tn(s.vx)}\\quad ${Vs('v_y')}=${tn(s.vy)}\\quad |${Vs('\\vec v')}|=${tn(Math.hypot(s.vx, s.vy))}${u('m/s')}` },
    ];
    if (river) {
      out.push({ h: 'Traversata' });
      if (m.vpy > 1e-9) {
        out.push({ tex: `t=\\dfrac{L}{v'_y}=\\dfrac{${tn(p.L, 0)}}{${tn(m.vpy)}}=${tn(m.tEnd)}${u('s')}` });
        if (p.A === 0) out.push({ tex: `d=(v'_x+V)\\,t=${tn(m.vpx + p.V)}\\cdot${tn(m.tEnd)}=${tn((m.vpx + p.V) * m.tEnd)}${u('m')}` });
        else out.push({ tex: `d=v'_x t+V t+\\tfrac12At^2=${tn(m.vpx * m.tEnd + p.V * m.tEnd + 0.5 * p.A * m.tEnd ** 2)}${u('m')}` });
      } else out.push({ tex: `v'_y\\le 0:\\ \\text{la barca non raggiunge l'altra riva}`, cls: 'warn' });
      if (p.A === 0 && p.V !== 0) out.push(p.vp > abs(p.V)
        ? { tex: `\\text{per arrivare dritti: }\\cos\\varphi=-\\dfrac{V}{v'}\\Rightarrow\\varphi=${tn(Math.acos(-p.V / p.vp) / deg, 1)}^\\circ` }
        : { tex: `v'\\le|V|:\\ \\text{impossibile arrivare dritti}`, cls: 'warn' });
    } else {
      const ex = m.vpx * m.tEnd - 0.5 * p.A * m.tEnd ** 2;
      out.push(
        { h: 'Leggi orarie' },
        { tex: `\\text{in S: }x=${tn(p.V + m.vpx)}\\,t\\qquad y=${tn(Y_HAND, 0)}${sgn(m.vpy)}${tn(abs(m.vpy))}\\,t-${tn(p.g / 2, 3)}\\,t^2` },
        { tex: `\\text{in S}':\\ x'=x-X=${tn(m.vpx)}\\,t${p.A ? `${sgn(-p.A)}${tn(abs(p.A) / 2, 2)}\\,t^2` : ''}\\qquad y'=y` },
        { h: 'Atterraggio sul pianale' },
        { tex: `t_{\\text{volo}}=${tn(m.tEnd)}${u('s')}\\qquad x'=${tn(ex)}${u('m')}` },
        abs(ex) > CAR && { tex: `|x'|>${CAR}\\ \\mathrm{m}:\\ \\text{la pallina cade fuori dal carro}`, cls: 'warn' },
      );
    }
    out.push(
      { h: 'Istante attuale' },
      { tex: `t=${tn(s.t)}${u('s')}\\qquad X=${tn(s.X)}${u('m')}` },
      { tex: `\\text{S: }(${tn(s.x)},\\ ${tn(s.y)})\\qquad \\text{S}':\\ (${tn(s.xp)},\\ ${tn(s.yp)})` },
    );
    return out.filter(Boolean);
  },

  theory: `
<h2>Moti relativi</h2>
<p>Lo stesso moto appare diverso a osservatori diversi. Un <b>sistema di riferimento</b> è un osservatore con i suoi assi e il suo orologio. Qui ne usiamo due: $S$, fermo rispetto al suolo, e $S'$, che si muove lungo $x$ con velocità $V$ (l'acqua del fiume, oppure il treno).</p>

<h3>Trasformazioni di Galileo</h3>
<p>Se all'istante $t=0$ le origini coincidono e $S'$ si muove di moto uniforme:</p>
$$x = x' + V t \\qquad y = y' \\qquad t = t'$$
<p>Il tempo è lo stesso per tutti: è l'ipotesi della fisica classica, che cade solo a velocità vicine a quella della luce.</p>

<h3>Composizione delle velocità</h3>
<p>Derivando le trasformazioni rispetto al tempo:</p>
$$\\vec v = \\vec{v}' + \\vec V$$
<p>La velocità rispetto a $S$ (<i>assoluta</i>) è la somma vettoriale della velocità rispetto a $S'$ (<i>relativa</i>) e della velocità di $S'$ rispetto a $S$ (<i>di trascinamento</i>). I tre vettori formano un triangolo: attiva «Triangolo delle velocità».</p>

<h3>Esempio: la barca sul fiume</h3>
<p>Una barca ha velocità $v'$ rispetto all'acqua; la corrente ha velocità $V$ rispetto alle rive. Il fiume è largo $L$.</p>
<ul>
  <li><b>Prua perpendicolare alla riva</b> ($\\varphi = 90^\\circ$): il tempo di traversata è il <b>minimo possibile</b>, $t = L/v'$, ma la barca arriva spostata a valle di $d = V\\,t$.</li>
  <li><b>Arrivo dritto di fronte</b>: la prua va inclinata controcorrente in modo che $v'\\cos\\varphi = -V$. Serve $v' > V$, e il tempo diventa $t = L / \\sqrt{v'^2 - V^2}$, più lungo.</li>
</ul>
<div class="box">La corrente non cambia il tempo di traversata, che dipende solo dalla componente di $\\vec{v}'$ perpendicolare alle rive. Moti perpendicolari sono indipendenti, come nel moto parabolico.</div>

<h3>Esempio: la pallina lanciata dal treno</h3>
<p>Una persona su un carro che viaggia a velocità costante lancia una pallina verso l'alto. In $S'$ la pallina sale e ricade nella mano: moto verticale. In $S$ la pallina ha anche la velocità orizzontale $V$ del treno e descrive una <b>parabola</b>. Le due descrizioni sono entrambe corrette: le leggi della dinamica valgono allo stesso modo in tutti i sistemi <b>inerziali</b>, cioè in moto rettilineo uniforme l'uno rispetto all'altro (<b>principio di relatività galileiana</b>).</p>

<h3>Quando S′ accelera: le forze apparenti</h3>
<p>Se $S'$ ha accelerazione $\\vec A$, derivando ancora si ottiene</p>
$$\\vec a = \\vec{a}' + \\vec A \\quad\\Longrightarrow\\quad m\\vec{a}' = \\vec F - m\\vec A$$
<p>Un osservatore in $S'$ vede il corpo accelerare anche senza forze reali in quella direzione. Per salvare la seconda legge di Newton deve introdurre una <b>forza apparente</b> (o fittizia) $-m\\vec A$, opposta all'accelerazione del suo sistema. È la spinta «all'indietro» che si sente in un treno che parte. Nel treno che accelera la pallina ricade <b>dietro</b> la mano, di $\\tfrac12 A t^2$. La forza centrifuga è un altro esempio di forza apparente, in un sistema che ruota.</p>

<h3>Prova con la simulazione</h3>
<ol>
  <li>Fiume: aumenta la corrente $V$ con prua perpendicolare. Il tempo di traversata cambia? E la deriva?</li>
  <li>Con «Traversata dritta» prova a ridurre $v'$ sotto $V$: riesci ancora ad arrivare di fronte?</li>
  <li>Treno: con «Lancio in verticale» passa da «Da S» a «Da S′». Quale traiettoria è «quella vera»?</li>
  <li>Con «Lancio all'indietro a −V», che velocità ha la pallina per chi è a terra? Che traiettoria vede?</li>
  <li>Con «Treno che accelera» misura dove cade la pallina e confronta con $-\\tfrac12 A t_{\\text{volo}}^2$.</li>
</ol>

<h3>Esercizi</h3>
<details><summary>1. Un fiume largo 20 m scorre a 2 m/s. Una barca va a 3 m/s rispetto all'acqua con la prua perpendicolare alla riva. Quanto tempo impiega e di quanto viene trascinata?</summary>
<p>$t = 20/3 \\approx 6{,}67$ s; $d = 2 \\cdot 6{,}67 \\approx 13{,}3$ m; velocità rispetto alla riva $\\sqrt{3^2 + 2^2} \\approx 3{,}61$ m/s.</p></details>
<details><summary>2. Nello stesso fiume, come va orientata la prua per arrivare esattamente di fronte? Quanto dura la traversata?</summary>
<p>$\\cos\\varphi = -2/3 \\Rightarrow \\varphi \\approx 131{,}8^\\circ$ dalla direzione della corrente (cioè $41{,}8^\\circ$ controcorrente rispetto alla perpendicolare); $t = 20 / \\sqrt{9 - 4} \\approx 8{,}94$ s.</p></details>
<details><summary>3. Su un treno che viaggia a 10 m/s una pallina viene lanciata verso l'alto a 6 m/s da 2 m di altezza e ricade sul pianale, 1 m più in basso. Quanto spazio percorre in orizzontale per chi è a terra?</summary>
<p>$t = \\dfrac{6 + \\sqrt{36 + 2 \\cdot 9{,}81 \\cdot 1}}{9{,}81} \\approx 1{,}37$ s; per chi è a terra $x = 10 \\cdot 1{,}37 \\approx 13{,}7$ m; sul treno $x' = 0$.</p></details>
<details><summary>4. Se il treno dell'esercizio 3 accelera con $A = 3$ m/s², dove ricade la pallina rispetto alla mano?</summary>
<p>$x' = -\\tfrac12 A t^2 = -\\tfrac12 \\cdot 3 \\cdot 1{,}37^2 \\approx -2{,}82$ m: circa 2,8 m dietro, per effetto della forza apparente $-mA$.</p></details>
`,
};
