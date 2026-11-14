import { tn, clamp } from '../core/math.js';
import { tex } from '../core/manim.js';
import { uq } from '../core/units.js';
import { Stage, C, symVal } from '../core/annot.js';
import { scopeTrace } from '../core/osc.js';

const stage = new Stage();
const TWO_PI = 2 * Math.PI;
// Celle del campo disegnato (poi ingrandito con smussatura): circa CELLS in tutto lo schermo, di almeno 4 px.
// Un numero fisso di celle tiene il costo di ogni fotogramma uguale su qualsiasi schermo.
const CELLS = 22000;

// Velocità effettiva della sorgente 1: sempre sotto quella dell'onda (oltre si formerebbe un'onda d'urto).
const uOf = p => Math.min(p.vs, 0.95 * p.v);

// Distanza percorsa dall'onda che arriva in (x, y) all'istante t dalla sorgente i, e istante di emissione.
// La sorgente 1 parte da (−d/2, 0) e si muove lungo x con velocità u; la 2 è ferma in (d/2, 0).
// Restituisce solo l'istante di emissione (nessun oggetto: la funzione gira decine di migliaia di volte per fotogramma);
// la distanza percorsa è v (t − τ).
function emitted(p, i, x, y, t) {
  const dx = x - (i === 1 ? -p.d / 2 : p.d / 2), v = p.v;
  const u = i === 1 ? uOf(p) : 0;
  if (u < 1e-9) return t - Math.sqrt(dx * dx + y * y) / v;
  // |(dx, y) − (u τ, 0)| = v (t − τ): equazione di secondo grado in τ; per u < v una sola radice ha τ ≤ t.
  const A = u * u - v * v, B = 2 * v * v * t - 2 * dx * u, Cc = dx * dx + y * y - v * v * t * t;
  const D = Math.sqrt(Math.max(0, B * B - 4 * A * Cc));
  // A < 0: la radice più piccola è quella fisica (l'altra, con τ > t, nasce solo dall'elevamento al quadrato).
  return (-B + D) / (2 * A);
}

// Contributo di una sorgente: sinusoide emessa all'istante tau, che si attenua allontanandosi (onda circolare).
function wave(p, i, x, y, t) {
  if (i === 2 && !p.on2) return 0;
  const tau = emitted(p, i, x, y, t);
  if (tau < 0) return 0;
  const f = i === 1 ? p.f1 : p.f2, lam = p.v / f, ph = i === 1 ? 0 : p.phi * Math.PI / 180, r = p.v * (t - tau);
  const edge = Math.min(1, tau * f * 2);   // il fronte entra morbido (mezzo periodo)
  return edge * Math.sqrt(lam / (r + lam)) * Math.sin(TWO_PI * f * tau + ph);
}
const field = (p, x, y, t) => wave(p, 1, x, y, t) + wave(p, 2, x, y, t);

const srcPos = (p, i, t) => (i === 1 ? [-p.d / 2 + uOf(p) * Math.max(0, t), 0] : [p.d / 2, 0]);

let buf = null;   // canvas fuori schermo per il campo

export default {
  id: 'sources',
  title: 'Due sorgenti',
  subtitle: 'Interferenza, battimenti ed effetto Doppler',
  dt: 1 / 120,
  sweepHorizon: 15,

  params: [
    { key: 'look', type: 'select', label: 'Vista', value: 'field', live: true,
      options: [{ label: 'Campo dell\'onda', value: 'field' }, { label: 'Fronti d\'onda', value: 'fronts' }] },
    { key: 'f1', label: 'Frequenza sorgente 1  f₁', unit: 'Hz', min: 0.1, max: 10, step: 0.01, value: 1 },
    { key: 'f2', label: 'Frequenza sorgente 2  f₂', unit: 'Hz', min: 0.1, max: 10, step: 0.01, value: 1 },
    { key: 'v', label: 'Velocità dell\'onda v', unit: 'm/s', min: 0.2, max: 50, step: 0.1, value: 2 },
    { key: 'd', label: 'Distanza tra le sorgenti d', unit: 'm', min: 0, max: 30, step: 0.1, value: 4 },
    { key: 'phi', label: 'Sfasamento della sorgente 2  φ', unit: '°', min: 0, max: 360, step: 1, value: 0 },
    { key: 'vs', label: 'Velocità della sorgente 1 (Doppler)', unit: 'm/s', min: 0, max: 50, step: 0.05, value: 0 },
    { key: 'on2', type: 'toggle', label: 'Seconda sorgente', value: true },
    { key: 'showLines', type: 'toggle', label: 'Linee nodali', value: false, live: true },
    { key: 'showTrace', type: 'toggle', label: 'Segnale nella sonda', short: 'Segnale sonda', icon: 'probe', value: true, live: true },
    { key: 'px', label: 'Sonda x', unit: 'm', min: -20, max: 20, step: 0.1, value: 3, live: true, hidden: true },
    { key: 'py', label: 'Sonda y', unit: 'm', min: -20, max: 20, step: 0.1, value: 4, live: true, hidden: true },
    { key: 'tMax', label: 'Durata della simulazione', unit: 's', min: 5, max: 300, step: 5, value: 60 },
  ],

  presets: [
    { label: 'Interferenza', values: { look: 'field', f1: 1, f2: 1, v: 2, d: 4, phi: 0, vs: 0, on2: true, showLines: true } },
    { label: 'Sorgenti in opposizione', values: { look: 'field', f1: 1, f2: 1, v: 2, d: 4, phi: 180, vs: 0, on2: true, showLines: true } },
    { label: 'Battimenti', values: { look: 'field', f1: 1, f2: 1.15, v: 2, d: 0.6, phi: 0, vs: 0, on2: true, showLines: false } },
    { label: 'Effetto Doppler', values: { look: 'fronts', f1: 1, v: 2, d: 6, vs: 1, on2: false, showLines: false } },
  ],

  view(p) {
    const W = clamp(Math.max(p.d * 0.75 + 3, 4 * p.v / p.f1), 5, 30);
    return { xmin: -W, xmax: W, ymin: -0.7 * W, ymax: 0.7 * W };
  },

  init(p) { return { t: 0, tEnd: p.tMax }; },
  step(s, dt) { s.t += dt; },
  done: s => s.t >= s.tEnd,

  sample(s, p) {
    return { t: s.t, y: field(p, p.px, p.py, s.t), y1: wave(p, 1, p.px, p.py, s.t), y2: wave(p, 2, p.px, p.py, s.t) };
  },

  graphs: [
    { title: 'Segnale nella sonda', series: [{ key: 'y', label: 'somma', color: 'weight' }] },
    { title: 'Singole sorgenti', series: [{ key: 'y1', label: 'sorgente 1', color: 'vel' }, { key: 'y2', label: 'sorgente 2', color: 'acc' }] },
  ],

  handles(s, p) {
    const h = [{ id: 'probe', x: p.px, y: p.py }];
    if (p.on2) h.push({ id: 'src2', x: p.d / 2, y: 0 });
    return h;
  },

  drag(id, wx, wy, p) {
    if (id === 'probe') { p.px = Math.round(wx * 10) / 10; p.py = Math.round(wy * 10) / 10; return 'live'; }
    if (id === 'src2') p.d = clamp(Math.round(wx * 2 * 10) / 10, 0, 12);
  },

  mount() { stage.reset(); },

  draw(P, s, p, ui) {
    const S = stage.begin(P, ui), M = S.M, cam = P.cam, ctx = P.ctx, t = s.t;
    // Creste blu e valli arancio tenue (MANIM gold): la tinta più accesa resta alle sorgenti e alla sonda.
    const cPos = M.vec.vel, cNeg = M.vec.friction;

    if (p.look === 'field') {
      // Campo: celle colorate (blu le creste, giallo le valli), trasparenti dove l'onda si annulla.
      const CELL = Math.max(4, Math.ceil(Math.sqrt(cam.w * cam.h / CELLS)));
      const w = Math.ceil(cam.w / CELL), h = Math.ceil(cam.h / CELL);
      if (!buf || buf.width !== w || buf.height !== h) { buf = document.createElement('canvas'); buf.width = w; buf.height = h; }
      const bctx = buf.getContext('2d'), img = bctx.createImageData(w, h), d = img.data;
      const rgb = c => [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16));
      const [pr, pg, pb] = rgb(cPos), [nr, ng, nb] = rgb(cNeg);
      const norm = p.on2 ? 1.6 : 1;
      // La camera è lineare: le coordinate mondo delle celle si ottengono per incrementi.
      const [ax, ay] = cam.toWorld(0.5 * CELL, 0.5 * CELL), [bx2, by2] = cam.toWorld(1.5 * CELL, 1.5 * CELL);
      const sx = bx2 - ax, sy = by2 - ay;
      for (let j = 0; j < h; j++) {
        const y = ay + j * sy;
        for (let i = 0; i < w; i++) {
          const z = field(p, ax + i * sx, y, t) / norm, k = (j * w + i) * 4, a = Math.min(1, Math.abs(z));
          if (z >= 0) { d[k] = pr; d[k + 1] = pg; d[k + 2] = pb; } else { d[k] = nr; d[k + 1] = ng; d[k + 2] = nb; }
          d[k + 3] = Math.round(255 * 0.55 * Math.pow(a, 1.15));
        }
      }
      bctx.putImageData(img, 0, 0);
      ctx.save();
      ctx.globalAlpha = S.grow('field', 0.8);
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(buf, 0, 0, w * CELL, h * CELL);
      ctx.restore();
    } else {
      // Fronti d'onda: una circonferenza per ogni cresta emessa, centrata dove si trovava la sorgente in quel momento.
      const { x0, x1, y0, y1 } = cam.bounds(), Rmax = Math.hypot(x1 - x0, y1 - y0);
      for (const i of p.on2 ? [1, 2] : [1]) {
        const f = i === 1 ? p.f1 : p.f2, ph = i === 1 ? 0 : p.phi * Math.PI / 180, col = i === 1 ? cPos : cNeg;
        const n0 = Math.ceil(((t - Rmax / p.v) * TWO_PI * f + ph - Math.PI / 2) / TWO_PI);
        ctx.save(); ctx.strokeStyle = col; ctx.lineWidth = 1.8;
        for (let n = Math.max(0, n0); ; n++) {
          const tau = (Math.PI / 2 - ph + TWO_PI * n) / (TWO_PI * f);
          if (tau < 0) continue;
          if (tau > t) break;
          const [cx, cy] = srcPos(p, i, tau), r = p.v * (t - tau) * cam.scale, [a, b] = P.S(cx, cy);
          ctx.globalAlpha = 0.9 * Math.max(0.15, 1 - r / (Rmax * cam.scale));
          ctx.beginPath(); ctx.arc(a, b, r, 0, TWO_PI); ctx.stroke();
        }
        ctx.restore();
      }
    }

    // Linee nodali (interferenza distruttiva): iperboli con fuochi nelle sorgenti, solo per sorgenti uguali e ferme.
    const same = p.on2 && Math.abs(p.f1 - p.f2) < 1e-9 && uOf(p) < 1e-9 && p.d > 0;
    if (p.showLines && same) {
      const lam = p.v / p.f1, c = p.d / 2, g = S.grow('lines', 1);
      for (let m = -40; m <= 40; m++) {
        const D = (m + 0.5 - p.phi / 360) * lam;
        if (Math.abs(D) >= p.d - 1e-6) continue;
        const a = Math.abs(D) / 2, b = Math.sqrt(c * c - a * a), sg = Math.sign(D) || 1, pts = [];
        for (let k = -60; k <= 60; k++) { const u = k / 60 * 3.2 * g; pts.push([sg * a * Math.cosh(u), b * Math.sinh(u)]); }
        if (a < 1e-9) { pts.length = 0; pts.push([0, -40 * g], [0, 40 * g]); }
        P.line(pts, { color: 'text', width: 1.2, dash: [6, 6], alpha: 0.7 });
      }
    }

    // Sorgenti.
    for (const i of p.on2 ? [1, 2] : [1]) {
      const [x, y] = srcPos(p, i, t), col = i === 1 ? cPos : cNeg, [a, b] = P.S(x, y);
      P.circle(x, y, 7, { fill: col });
      P.circle(x, y, 11, { stroke: col, width: 1.4, alpha: 0.6 });
      tex(P, a, b + 24, `S_${i}`, { size: 17, color: col, halo: M.bg });
      if (i === 1 && uOf(p) > 0) P.arrow(x, y, x + Math.max(1, uOf(p)) * 1.2, y, { color: 'text', key: 'vs', width: 2.5, label: 'v_s' });
    }
    // Distanza d, solo se le sorgenti sono ferme.
    if (p.on2 && uOf(p) < 1e-9 && p.d * cam.scale > 30) {
      const [a] = P.S(-p.d / 2, 0), [c, b] = P.S(p.d / 2, 0);
      tex(P, (a + c) / 2, b - 20, symVal(P, 'd', uq('m', p.d)), { size: 16, color: M.text, halo: M.bg, alpha: 0.85 });
    }

    // Sonda, con il suo segnale scritto dal vivo accanto (il tempo scorre verso destra, l'adesso è sulla sonda).
    const [qa, qb] = P.S(p.px, p.py);
    if (p.showTrace) {
      const fAvg = p.on2 ? (p.f1 + p.f2) / 2 : p.f1, df = p.on2 ? Math.abs(p.f1 - p.f2) : 0;
      const win = Math.min(20, Math.max(3 / fAvg, df > 0.02 ? 1.5 / df : 0)), norm = p.on2 ? 1.6 : 1;
      scopeTrace(P, qa, qb, tt => field(p, p.px, p.py, tt) / norm, t, { win, valPx: z => z * 34, color: M.vec.weight, grow: S.grow('scope', 0.8) });
    }
    P.circle(p.px, p.py, 5, { fill: 'weight' });
    P.handle(p.px, p.py, ui.active === 'probe');
    if (p.on2) P.handle(p.d / 2, 0, ui.active === 'src2');
  },

  formulas(s, p) {
    const lam1 = p.v / p.f1, lam2 = p.v / p.f2, u = uOf(p);
    const r1 = Math.hypot(p.px + p.d / 2, p.py), r2 = Math.hypot(p.px - p.d / 2, p.py);
    const same = p.on2 && Math.abs(p.f1 - p.f2) < 1e-9 && u < 1e-9;
    const q = (r1 - r2) / lam1 + p.phi / 360;   // differenza di fase in giri
    const frac = ((q % 1) + 1) % 1, kind = frac < 0.12 || frac > 0.88 ? 'costruttiva' : Math.abs(frac - 0.5) < 0.12 ? 'distruttiva' : 'intermedia';
    const S1 = t => C('vel', t), S2 = t => C('acc', t);
    return [
      { h: 'Lunghezza d\'onda' },
      { key: true, tex: `\\lambda=\\dfrac{v}{f}=${uq('m', lam1)}` + (p.on2 && p.f2 !== p.f1 ? `\\qquad \\lambda_2=${uq('m', lam2)}` : '') },
      same && { h: 'Interferenza nella sonda' },
      same && { tex: `${S1('r_1')}=${uq('m', r1)}\\qquad ${S2('r_2')}=${uq('m', r2)}` },
      same && { key: true, tex: `\\dfrac{|${S1('r_1')}-${S2('r_2')}|}{\\lambda}=${tn(Math.abs(r1 - r2) / lam1, 2)}\\ \\Rightarrow\\ \\text{${kind}}` },
      same && { tex: p.phi === 0 ? `\\text{costruttiva: } |r_1-r_2|=n\\lambda\\qquad \\text{distruttiva: } |r_1-r_2|=\\left(n+\\tfrac12\\right)\\lambda` : `\\text{con lo sfasamento } \\varphi=${p.phi}°\\ \\text{le condizioni si spostano}` },
      p.on2 && p.f1 !== p.f2 && { h: 'Battimenti' },
      p.on2 && p.f1 !== p.f2 && { key: true, tex: `f_b=|f_1-f_2|=${uq('Hz', Math.abs(p.f1 - p.f2))}\\qquad T_b=${uq('s', 1 / Math.abs(p.f1 - p.f2))}` },
      u > 0 && { h: 'Effetto Doppler (sorgente 1 in moto)' },
      u > 0 && { key: true, tex: `f_{\\text{davanti}}=f\\,\\dfrac{v}{v-v_s}=${uq('Hz', p.f1 * p.v / (p.v - u))}` },
      u > 0 && { tex: `f_{\\text{dietro}}=f\\,\\dfrac{v}{v+v_s}=${uq('Hz', p.f1 * p.v / (p.v + u))}` },
      p.vs >= 0.95 * p.v && { tex: `v_s\\ge v:\\ \\text{onda d'urto (limitata a } 0{,}95\\,v)`, cls: 'warn' },
      { h: 'Istante attuale' },
      { tex: `t=${uq('s', s.t)}` },
    ].filter(Boolean);
  },

  theory: `
<h2>Due sorgenti</h2>
<p>Una sorgente puntiforme che oscilla sulla superficie dell'acqua genera onde <b>circolari</b>: le creste sono circonferenze che si allargano con velocità $v$, distanti tra loro una lunghezza d'onda $\\lambda = v/f$. Allontanandosi l'onda si indebolisce, perché la stessa energia si distribuisce su una circonferenza sempre più lunga.</p>

<h3>Interferenza</h3>
<p>Con due sorgenti uguali e in fase, in ogni punto arrivano due onde che hanno percorso distanze $r_1$ e $r_2$. Si sommano (sovrapposizione):</p>
<ul>
  <li>se $|r_1 - r_2| = n\\lambda$ arrivano in fase: <b>interferenza costruttiva</b>, l'acqua oscilla al massimo;</li>
  <li>se $|r_1 - r_2| = \\left(n + \\tfrac12\\right)\\lambda$ arrivano in opposizione: <b>interferenza distruttiva</b>, l'acqua resta ferma.</li>
</ul>
<p>I punti di interferenza distruttiva stanno su <b>iperboli</b> con i fuochi nelle sorgenti, le <b>linee nodali</b>. Più le sorgenti sono distanti (rispetto a $\\lambda$), più linee nodali ci sono. Accendi «Linee nodali» e sposta la sonda su una di esse.</p>
<div class="box">È lo stesso fenomeno dell'esperimento di Young con la luce: lì le due sorgenti sono due fenditure e le linee nodali diventano frange scure su uno schermo.</div>

<h3>Battimenti</h3>
<p>Se le due sorgenti hanno frequenze vicine ma diverse, $f_1$ e $f_2$, in un punto le onde passano lentamente da in fase a in opposizione e viceversa. L'intensità pulsa con la <b>frequenza di battimento</b></p>
$$f_b = |f_1 - f_2|$$
<p>È ciò che sentono i musicisti quando accordano due strumenti: il «vibrato» rallenta fino a sparire quando le frequenze coincidono.</p>

<h3>Effetto Doppler</h3>
<p>Se la sorgente si muove con velocità $v_s$, ogni cresta parte da un punto diverso: davanti alla sorgente le creste si addensano (lunghezza d'onda più corta, frequenza più alta), dietro si diradano. Per un ascoltatore fermo</p>
$$f' = f\\,\\frac{v}{v \\mp v_s}$$
<p>con il segno meno quando la sorgente si avvicina. È il suono della sirena che cambia mentre l'ambulanza passa. Se la sorgente raggiunge la velocità dell'onda le creste si accumulano in un'<b>onda d'urto</b> (il «bang» supersonico).</p>

<h3>Prova con la simulazione</h3>
<ol>
  <li>Con «Interferenza» trascina la sonda lungo una linea nodale: cosa mostra il segnale?</li>
  <li>Avvicina le sorgenti: le linee nodali aumentano o diminuiscono?</li>
  <li>Con «Sorgenti in opposizione», cosa succede sull'asse tra le due sorgenti?</li>
  <li>Con «Battimenti» misura il periodo delle pulsazioni nel segnale della sonda e confrontalo con $1/|f_1 - f_2|$.</li>
  <li>Con «Effetto Doppler» passa alla vista «Fronti d'onda»: dove sono più fitte le creste?</li>
</ol>

<h3>Esercizi</h3>
<details><summary>1. Due sorgenti in fase emettono onde con $\\lambda = 2$ cm. Un punto dista 10 cm dalla prima e 13 cm dalla seconda. L'interferenza è costruttiva o distruttiva?</summary>
<p>$|r_1 - r_2| = 3$ cm $= 1{,}5\\,\\lambda$: distruttiva.</p></details>
<details><summary>2. Due diapason a 440 Hz e 444 Hz suonano insieme. Quanti battimenti al secondo si sentono?</summary>
<p>$f_b = 4$ Hz.</p></details>
<details><summary>3. Un'ambulanza a 30 m/s emette una sirena a 700 Hz. Che frequenza senti mentre si avvicina? E mentre si allontana? ($v_{\\text{suono}} = 340$ m/s)</summary>
<p>$f' = 700 \\cdot 340/310 \\approx 768$ Hz in avvicinamento; $700 \\cdot 340/370 \\approx 643$ Hz in allontanamento.</p></details>
`,
};
