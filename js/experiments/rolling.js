import { tn, clamp } from '../core/math.js';
import { tex, mixHex } from '../core/manim.js';
import { rate } from '../core/anim.js';
import { uq } from '../core/units.js';
import { Stage, C, angleMark, symVal, degTeX, brace } from '../core/annot.js';
import { camera3d, background3d, orbit3d, axes3d, prism, cylinder, sphere } from '../core/view3d.js';
import { space3d } from '../core/space3d.js';

const stage = new Stage();
let CAM = null;   // camera dell'ultima scena (per i corpi selezionabili)
const G = 9.81, R = 0.25, W = 0.32;          // raggio e spessore dei corpi (m)
const deg = Math.PI / 180;

// I corpi in gara: I = k m R². Il blocco scivola senza attrito (nessuna rotazione): è il riferimento.
const BODIES = [
  { id: 'sphere', name: 'Sfera piena', k: 2 / 5, kTeX: '\\tfrac25', kIn: '2/5', color: 'blue', lane: -0.75 },
  { id: 'cyl', name: 'Cilindro pieno', k: 1 / 2, kTeX: '\\tfrac12', kIn: '1/2', color: 'green', lane: 0 },
  { id: 'ring', name: 'Anello', k: 1, kTeX: '1', kIn: '1', color: 'red', lane: 0.75 },
  { id: 'block', name: 'Blocco che scivola', k: 0, kTeX: '0', kIn: '0', color: 'yellow', lane: 1.5 },
];
const on = (p, b) => !!p['b_' + b.id];
const M_COL = { blue: 'vel', green: 'normal', red: 'weight', yellow: 'acc' };   // colore della scia di ogni corpo
const acc = (p, b) => G * Math.sin(p.alpha * deg) / (1 + b.k);
const tFinish = (p, b) => Math.sqrt(2 * p.L / acc(p, b));
const sAt = (p, b, t) => Math.min(p.L, 0.5 * acc(p, b) * t * t);
function zBounds(p) {
  const zLanes = BODIES.filter(b => on(p, b)).map(b => b.lane);
  return [Math.min(-0.5, ...zLanes) - 0.4, Math.max(0.5, ...zLanes) + 0.4];
}

export default {
  id: 'rolling',
  title: 'Rotolamento',
  subtitle: 'Sfera, cilindro e anello sul piano inclinato',
  sweepHorizon: 10,

  params: [
    { key: 'alpha', label: 'Inclinazione α', unit: '°', min: 1, max: 80, step: 1, value: 20, refit: true, quick: true },
    { key: 'L', label: 'Lunghezza del piano L', unit: 'm', min: 1, max: 100, step: 0.5, value: 5, refit: true, quick: true },
    { key: 'b_sphere', type: 'toggle', label: 'Sfera piena', value: true, live: true },
    { key: 'b_cyl', type: 'toggle', label: 'Cilindro pieno', value: true, live: true },
    { key: 'b_ring', type: 'toggle', label: 'Anello', value: true, live: true },
    { key: 'b_block', type: 'toggle', label: 'Blocco che scivola (senza attrito)', value: false, live: true },
    { key: 'show3d', type: 'toggle', label: 'Vista 3D: i corpi affiancati', value: true, live: true },
    { key: 'showEnergy', type: 'toggle', label: 'Energia: traslazione e rotazione', value: true, live: true },
  ],

  presets: [
    { label: 'Gara classica', values: { alpha: 20, L: 5, b_sphere: true, b_cyl: true, b_ring: true, b_block: false } },
    { label: 'Con il blocco', values: { alpha: 20, L: 5, b_sphere: true, b_cyl: true, b_ring: true, b_block: true } },
    { label: 'Piano ripido', values: { alpha: 40, L: 5, b_sphere: true, b_cyl: true, b_ring: true, b_block: false } },
    { label: 'Sfera contro anello', values: { alpha: 15, L: 6, b_sphere: true, b_cyl: false, b_ring: true, b_block: false } },
  ],

  view(p) {
    const a = p.alpha * deg, w = p.L * Math.cos(a), h = p.L * Math.sin(a);
    return { xmin: -1.2, xmax: w + 2.2, ymin: -0.8, ymax: h + 1.6 };
  },

  init(p) { return { t: 0, tEnd: Math.max(...BODIES.map(b => tFinish(p, b))) + 0.6 }; },
  step(s, dt) { s.t += dt; },
  done: s => s.t >= s.tEnd,
  // Rallentamento dolce automatico così la gara tra sfera, cilindro e anello dura ~7 s reali.
  timeScale: s => clamp((s?.tEnd ?? 7) / 7, 0.28, 1),

  sample(s, p) {
    const o = { t: s.t };
    for (const b of BODIES) {
      const a = acc(p, b), tt = Math.min(s.t, tFinish(p, b));
      o['s_' + b.id] = on(p, b) ? sAt(p, b, s.t) : null;
      o['v_' + b.id] = on(p, b) ? a * tt : null;
    }
    return o;
  },

  graphs: [
    { title: 'Distanza percorsa', series: BODIES.map(b => ({ key: 's_' + b.id, label: `${b.name} (m)`, color: b.id === 'sphere' ? 'vel' : b.id === 'cyl' ? 'normal' : b.id === 'ring' ? 'weight' : 'acc' })) },
    { title: 'Velocità', series: BODIES.map(b => ({ key: 'v_' + b.id, label: `${b.name} (m/s)`, color: b.id === 'sphere' ? 'vel' : b.id === 'cyl' ? 'normal' : b.id === 'ring' ? 'weight' : 'acc' })) },
  ],

  // I corpi in gara per il diagramma di corpo libero: peso, reazione del piano, attrito statico (che li fa ruotare).
  bodies(s, p, { scale }) {
    if (!CAM) return [];
    const a = p.alpha * deg, w = p.L * Math.cos(a), h = p.L * Math.sin(a), tilt = CAM.tilt(), m = 1;
    return BODIES.filter(b => on(p, b)).map(b => {
      const ss = sAt(p, b, s.t), cx = ss * Math.cos(a) + Math.sin(a) * R, cy = h - ss * Math.sin(a) + Math.cos(a) * R, z = b.lane * tilt;
      const [X, Y] = CAM.p(cx, cy, z), N = m * G * Math.cos(a), f = m * G * Math.sin(a) * b.k / (1 + b.k), ac = ss < p.L ? acc(p, b) : 0;
      const forces = [{ name: 'P', fx: 0, fy: -m * G, color: 'weight' }, { name: 'N', fx: N * Math.sin(a), fy: N * Math.cos(a), color: 'normal' }];
      if (b.k > 0) forces.push({ name: 'f_s', fx: -f * Math.cos(a), fy: f * Math.sin(a), color: 'friction' });
      return { key: b.id, title: `\\text{${b.name.toLowerCase()}}`, x: X, y: Y, wx: cx, wy: cy, z, proj: (x, y, zz) => CAM.p(x, y, zz),
        rPx: R * scale, m, forces, a: [ac * Math.cos(a), -ac * Math.sin(a)], v: [acc(p, b) * Math.min(s.t, tFinish(p, b)) * Math.cos(a), -acc(p, b) * Math.min(s.t, tFinish(p, b)) * Math.sin(a)],
        color: M_COL[b.color], noResize: true, note: b.k > 0 ? '\\text{massa di riferimento 1 kg: le accelerazioni non dipendono dalla massa}' : '\\text{il blocco scivola senza attrito}' };
    });
  },

  handles(s, p) {
    if (!CAM || s.t > 0) return [];
    const a = p.alpha * deg, w = p.L * Math.cos(a), h = p.L * Math.sin(a), z = zBounds(p)[1] * CAM.tilt();
    const [ax, ay] = CAM.p(0, h, z), [lx, ly] = CAM.p(w, 0, z);
    return [{ id: 'alpha', x: ax, y: ay }, { id: 'L', x: lx, y: ly }];
  },

  drag(id, sx, sy, p) {
    const [, z1] = zBounds(p);
    const [wx, wy] = CAM ? CAM.unproject(sx, sy, z1 * CAM.tilt()) : [sx, sy];
    if (id === 'alpha') p.alpha = clamp(Math.round(Math.asin(clamp(wy / p.L, 0, 1)) / deg), 1, 80);
    if (id === 'L') p.L = clamp(Math.round(wx / Math.cos(p.alpha * deg) * 2) / 2, 1, 100);
  },

  mount() { stage.reset(); },
  drawBackground: background3d('rolling', { default3d: true }),
  // In vista 3D un dito sullo spazio vuoto fa girare la camera invece di spostare la scena.
  orbit(dx, dy, p) { return orbit3d('rolling', p.show3d, dx, dy); },

  draw(P, s, p, ui) {
    const S = stage.begin(P, ui), M = S.M, ctx = P.ctx;
    const [alpha, L] = S.smooth('geo', [p.alpha, p.L], 0.15, !!ui.active);
    const a = alpha * deg, w = L * Math.cos(a), h = L * Math.sin(a);
    const V = camera3d(S, 'rolling', p.show3d, 18 * deg, -32 * deg, { up: 'y' }), tilt = V.tilt();
    if (!ui.snapshot) CAM = V;
    space3d(P, V, { origin: [-1, 0, 0], up: 'y', step: 1 });   // griglia a perdita d'occhio, fissa nel mondo
    const [z0, z1] = zBounds(p);

    if (tilt < 0.05) P.ground(0);   // in 3D la linea del suolo taglierebbe la rampa
    // Piano inclinato: un prisma (in vista frontale è il solito triangolo).
    prism(P, V, [[0, 0], [w, 0], [0, h]], tilt > 0.02 ? z0 : -0.3, tilt > 0.02 ? z1 : 0.3, { fill: M.solid, stroke: M.solidEdge, alpha: 0.95 });
    V.line(P, [[0, h, z1 * tilt], [w, 0, z1 * tilt]], { color: 'text', width: 2.2 });
    if (tilt > 0.02) {
      // Faccia superiore un po' più chiara e una corsia per ogni corpo: sollevate di 5 mm per evitare z-fighting.
      const ox = Math.sin(a) * 0.005, oy = Math.cos(a) * 0.005;
      V.poly(P, [[ox, h + oy, z0], [w + ox, oy, z0], [w + ox, oy, z1], [ox, h + oy, z1]], { fill: M.text, alpha: 0.08 * tilt });
      for (const b of BODIES) if (on(p, b)) V.line(P, [[ox, h + oy, b.lane * tilt], [w + ox, oy, b.lane * tilt]], { color: M.body[b.color], width: 1.2, alpha: 0.65 * tilt, dash: [5, 5] });
    }
    if (tilt < 0.5) {
      angleMark(P, w, 0, 46, Math.PI, Math.PI - a, symVal(P, '\\alpha', degTeX(a)), { color: M.text, alpha: 1 - 2 * tilt });
      brace(P, [0, h], [w, 0], symVal(P, 'L', uq('m', L)), { side: 1, gap: 2 * R * P.cam.scale + 12, grow: S.grow('L', 0.7), color: M.text, alpha: 0.75 * (1 - 2 * tilt) });
    }
    // Traguardo.
    V.line(P, [[w, 0, z0 * Math.max(tilt, 0.3)], [w, 0, z1 * Math.max(tilt, 0.3)]], { color: 'text', width: 1, alpha: 0.4 * tilt });

    // I corpi: in vista frontale sovrapposti e semitrasparenti (in dissolvenza l'uno sull'altro);
    // girando la camera ognuno scivola sulla sua corsia.
    const nrm = [Math.sin(a), Math.cos(a)];
    const list = BODIES.filter(b => on(p, b)).map(b => {
      const ss = sAt({ ...p, alpha, L }, b, s.t), cx = ss * Math.cos(a) + nrm[0] * R, cy = h - ss * Math.sin(a) + nrm[1] * R;
      return { b, ss, c: [cx, cy, b.lane * tilt], g: S.grow('body:' + b.id, 0.6) };
    });
    list.sort((u, v) => V.depth(...u.c) - V.depth(...v.c));
    for (const { b, ss, c, g } of list) {
      const col = M.body[b.color], spin = -ss / R, al = (tilt > 0.3 ? 0.9 : 0.55) * g;
      if (b.id === 'sphere') sphere(P, V, c, R, { color: col, alpha: al, spin });
      else if (b.id === 'cyl') cylinder(P, V, c, R, W, { color: col, alpha: al, spin });
      else if (b.id === 'ring') cylinder(P, V, c, R, W, { color: col, alpha: al, spin, hollow: true });
      else {
        // Il blocco scivola: un cubo appoggiato al piano (la sua base, non il suo centro, sta sulla superficie).
        const hs = R * 0.9, bx = c[0] - nrm[0] * (R - hs), by = c[1] - nrm[1] * (R - hs), tx = Math.cos(a), ty = -Math.sin(a);
        const pts = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([u, v]) => [bx + (u * tx + v * nrm[0]) * hs, by + (u * ty + v * nrm[1]) * hs]);
        prism(P, V, pts, c[2] - hs, c[2] + hs, { fill: col, stroke: col, alpha: al });
      }
    }

    // Tabellone in alto a destra: corpo, momento d'inerzia, tempo all'arrivo; sotto, la divisione dell'energia.
    const pad = P.cam.padFn?.() ?? { top: 70, right: 20 }, x0 = P.cam.w - pad.right - 300, y0 = pad.top + (x0 < 440 ? 78 : 26);
    const gT = S.grow('board', 0.7);
    let row = 0;
    for (const b of BODIES) {
      if (!on(p, b)) continue;
      const col = M.body[b.color], y = y0 + row * 30, tf = tFinish({ ...p }, b), done = s.t >= tf;
      // Lampo dorato Indicate alla Manim quando il corpo taglia il traguardo
      const finU = done && !ui.snapshot ? Math.min(1, Math.max(0, (s.t - tf) / 0.55)) : 1;
      const indW = finU < 1 ? rate.thereAndBack(finU) : 0;
      const tCol = done ? (indW > 0.02 ? mixHex(col, M.dark ? '#FFFF00' : '#b8860b', indW) : col) : M.muted;
      ctx.save(); ctx.globalAlpha = gT; ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x0, y, 6 + 1.8 * indW, 0, 7); ctx.fill(); ctx.restore();
      tex(P, x0 + 14, y, b.k ? `I=${b.kIn}\\,mR^2` : '\\text{non ruota}', { size: 15, color: M.text, halo: M.bg, align: 'left', alpha: gT });
      tex(P, x0 + 128, y, done ? `t=${uq('s', tf)}` : `t=${uq('s', s.t)}`, { size: 15 + 2.2 * indW, color: tCol, halo: M.bg, align: 'left', alpha: gT });
      if (p.showEnergy) {
        // Barra orizzontale: parte di traslazione (piena) e di rotazione (velata), sul totale m g h già convertito.
        const E = G * Math.min(sAt(p, b, s.t), p.L) * Math.sin(p.alpha * deg), Et = E / (1 + b.k), Er = E - Et;
        const Emax = G * p.L * Math.sin(p.alpha * deg), bw = 80, bx = x0 + 212;
        ctx.save(); ctx.globalAlpha = 0.3 * gT; ctx.strokeStyle = M.muted; ctx.strokeRect(bx, y - 6, bw, 12);
        ctx.globalAlpha = 0.9 * gT; ctx.fillStyle = col; ctx.fillRect(bx, y - 6, bw * Et / Emax, 12);
        ctx.globalAlpha = 0.4 * gT; ctx.fillRect(bx + bw * Et / Emax, y - 6, bw * Er / Emax, 12);
        ctx.restore();
      }
      row++;
    }
    if (p.showEnergy && row) {
      tex(P, x0 + 212, y0 + row * 30 - 6, '\\text{traslazione}', { size: 12, color: M.muted, halo: M.bg, align: 'left', alpha: gT });
      tex(P, x0 + 212, y0 + row * 30 + 10, '\\text{rotazione (velata)}', { size: 12, color: M.muted, halo: M.bg, align: 'left', alpha: gT });
    }
    axes3d(P, V, { origin: [-1, 0, 0], lx: 8, ly: 3.4, lz: 1.6 });
    if (!ui.snapshot && s.t === 0) {
      P.handle(...V.p(0, h, z1 * tilt), ui.active === 'alpha');
      P.handle(...V.p(w, 0, z1 * tilt), ui.active === 'L');
    }
  },

  formulas(s, p) {
    const a = p.alpha * deg, h = p.L * Math.sin(a);
    const rows = BODIES.filter(b => on(p, b)).map(b => ({ tex: `${b.name === 'Blocco che scivola' ? '\\text{blocco}' : `\\text{${b.name.split(' ')[0].toLowerCase()}}`}:\\ a=\\dfrac{g\\sin\\alpha}{1+${b.kTeX}}=${uq('m/s²', acc(p, b))}\\quad t=${uq('s', tFinish(p, b))}` }));
    return [
      { h: 'Rotolamento senza strisciare' },
      { key: true, tex: `v=\\omega R\\qquad I=k\\,mR^2` },
      { key: true, tex: `a=\\dfrac{g\\sin\\alpha}{1+k}` },
      { h: 'Energia' },
      { tex: `m g h=\\tfrac12 m v^2+\\tfrac12 I\\omega^2=\\tfrac12 m v^2\\,(1+k)` },
      { tex: `h=${uq('m', h)}` },
      { h: 'In gara' },
      ...rows,
      { tex: `\\text{la massa e il raggio non contano: conta solo } k`, cls: 'warn' },
    ];
  },

  theory: `
<h2>Rotolamento sul piano inclinato</h2>
<p>Una sfera, un cilindro pieno e un anello, tutti con la stessa massa e lo stesso raggio, partono insieme da fermi lungo lo stesso piano inclinato e rotolano senza strisciare. Chi arriva prima?</p>

<h3>Rotolare costa energia</h3>
<p>Un corpo che rotola si muove in due modi insieme: il centro <b>trasla</b> e il corpo <b>ruota</b> attorno al centro. L'energia potenziale persa si divide tra i due moti:</p>
$$m g h = \\tfrac12 m v^2 + \\tfrac12 I \\omega^2$$
<p>Senza strisciamento il punto di contatto è fermo e $v = \\omega R$. Il <b>momento d'inerzia</b> si scrive $I = k\\,m R^2$, dove $k$ dipende solo dalla forma: $k = 2/5$ per la sfera piena, $1/2$ per il cilindro pieno, $1$ per l'anello, in cui tutta la massa sta lontano dall'asse.</p>
$$m g h = \\tfrac12 m v^2 (1 + k) \\qquad v = \\sqrt{\\frac{2 g h}{1 + k}}$$

<h3>L'accelerazione</h3>
$$a = \\frac{g \\sin\\alpha}{1 + k}$$
<p>Più grande è $k$, più energia finisce nella rotazione e meno nella traslazione: il corpo è più lento. La classifica è quindi sempre sfera, cilindro, anello, <b>qualunque</b> siano la massa, il raggio e l'inclinazione. Il blocco che scivola senza attrito ($k = 0$) batte tutti: non spende niente per ruotare.</p>
<div class="box">Nel tabellone le barre mostrano la divisione dell'energia: piena la parte di traslazione, velata quella di rotazione. Per l'anello metà e metà.</div>

<h3>Perché rotola?</h3>
<p>A far ruotare il corpo è l'<b>attrito statico</b> nel punto di contatto, l'unica forza con un momento rispetto al centro. È statico perché il punto di contatto non scivola: per questo non dissipa energia.</p>

<h3>Prova con la simulazione</h3>
<ol>
  <li>Prevedi l'ordine d'arrivo, poi avvia la gara. Accendi «Vista 3D» per vedere i corpi affiancati.</li>
  <li>Cambia l'inclinazione: l'ordine cambia? E i rapporti tra i tempi?</li>
  <li>Aggiungi il blocco: di quanto arriva prima della sfera?</li>
  <li>Calcola il rapporto tra i tempi dell'anello e della sfera e confrontalo con $\\sqrt{2/1{,}4}$.</li>
</ol>

<h3>Esercizi</h3>
<details><summary>1. Un cilindro pieno rotola da un'altezza di 1,2 m. Con che velocità arriva in fondo?</summary>
<p>$v = \\sqrt{2 g h / 1{,}5} = \\sqrt{2 \\cdot 9{,}81 \\cdot 1{,}2 / 1{,}5} \\approx 3{,}96$ m/s.</p></details>
<details><summary>2. Su un piano inclinato di 30°, quanto vale l'accelerazione di una sfera piena?</summary>
<p>$a = 9{,}81 \\cdot 0{,}5 / 1{,}4 \\approx 3{,}50$ m/s².</p></details>
<details><summary>3. Che frazione dell'energia cinetica di un anello che rotola è rotazionale?</summary>
<p>Con $k = 1$: $\\tfrac12 I\\omega^2 = \\tfrac12 m v^2$, quindi metà.</p></details>
`,
};
