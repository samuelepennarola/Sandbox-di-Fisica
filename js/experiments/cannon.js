import { tn, clamp } from '../core/math.js';
import { tex, mixHex } from '../core/manim.js';
import { uq } from '../core/units.js';
import { Stage, C, arrowPx, arrowMag, symVal } from '../core/annot.js';
import { elements, conicPts } from '../core/grav.js';

// Il cannone di Newton (Principia, libro III): dalla cima di una montagna altissima si spara in orizzontale.
// Dati veri della Terra; distanze in km, tempi in minuti, velocità in km/s.
const stage = new Stage();
const RE = 6371, GM = 398600 * 3600;     // raggio terrestre (km) e G·M in km³/min²
const VA = { min: 36, max: 110 }, VREF = 30;
let shots = [], lastSim = null, SC = 0.4; // colpi precedenti (scelta «Colpi precedenti») e scala ultima scena

const r0 = p => RE + p.h;
const near = p => Math.max(1600, 4 * p.h);   // larghezza (km) dell'inquadratura di partenza
const vCirc = p => Math.sqrt(398600 / r0(p));   // km/s

export default {
  id: 'cannon',
  title: 'Il cannone di Newton',
  subtitle: 'Dalla caduta all\'orbita, fino alla fuga',
  timeUnit: 'min',
  axes: true,
  dt: 1 / 60,
  // Dieci minuti di simulazione per ogni secondo vero: un giro attorno alla Terra dura una decina di secondi.
  timeScale: () => 10,

  params: [
    { key: 'v', label: 'Velocità di sparo v', unit: 'km/s', min: 0.5, max: 30, step: 0.05, value: 6.5 },
    { key: 'h', label: 'Altezza della montagna h', unit: 'km', min: 10, max: 20000, step: 10, value: 600, refit: true },
    { key: 'tMax', label: 'Durata della simulazione', unit: 'min', min: 30, max: 2000, step: 10, value: 300 },
    { key: 'keepShots', type: 'toggle', label: 'Colpi precedenti', value: true, live: true },
    { key: 'showConic', type: 'toggle', label: 'Orbita prevista', value: false, live: true },
  ],

  presets: [
    { label: 'Ricade vicino', values: { v: 3, h: 600 } },
    { label: 'Ricade lontano', values: { v: 6.8, h: 600 } },
    { label: 'Orbita circolare', values: { v: 7.56, h: 600 } },
    { label: 'Orbita ellittica', values: { v: 9, h: 600 } },
    { label: 'Velocità di fuga', values: { v: 10.7, h: 600 } },
  ],

  // Si parte da vicino: attorno al cannone la Terra sembra un piano. Mentre il colpo sale e si allontana la camera
  // lo segue (follow) e arretra, e il "piano" si curva fino a diventare il globo.
  view(p) { const W = near(p); return { xmin: -W * 0.45, xmax: W * 0.95, ymin: r0(p) - W * 0.5, ymax: r0(p) + W * 0.25 }; },

  follow(s, p) {
    const W = near(p), pts = [[0, r0(p)], [s.x, s.y]], r = Math.hypot(s.x, s.y);
    // Il punto del suolo sotto il proiettile: la curvatura si vede tra il cannone e lì.
    pts.push([s.x / r * RE, s.y / r * RE]);
    // Quando il colpo è lontano (o ha fatto mezzo giro) entra tutta la Terra.
    const far = r > 1.6 * RE || Math.atan2(s.x, s.y) > Math.PI / 2 || Math.atan2(s.x, s.y) < -0.2;
    if (far) pts.push([-RE, -RE], [RE, RE]);
    let x0 = Math.min(...pts.map(q => q[0])), x1 = Math.max(...pts.map(q => q[0]));
    let y0 = Math.min(...pts.map(q => q[1])), y1 = Math.max(...pts.map(q => q[1]));
    const pad = 0.25 * Math.max(x1 - x0, y1 - y0, W);
    x0 -= pad; x1 += pad; y0 -= pad; y1 += pad;
    // Mai più vicino dell'inquadratura di partenza.
    if (x1 - x0 < W * 1.4) { const c = (x0 + x1) / 2; x0 = c - W * 0.7; x1 = c + W * 0.7; }
    if (y1 - y0 < W * 0.75) { const c = (y0 + y1) / 2; y0 = c - W * 0.375; y1 = c + W * 0.375; }
    return { xmin: x0, xmax: x1, ymin: y0, ymax: y1 };
  },

  init(p) {
    // Il colpo appena finito resta tra i precedenti (se ha volato davvero).
    if (lastSim && lastSim.path.length > 4) {
      shots.push({ v: lastSim.v, path: lastSim.path });
      if (shots.length > 6) shots.shift();
    }
    const s = { t: 0, x: 0, y: r0(p), vx: p.v * 60, vy: 0, v: p.v, path: [[0, r0(p)]], landed: false, gone: false, tEnd: p.tMax };
    lastSim = s;
    return s;
  },

  step(s, dt) {
    let left = dt;
    while (left > 1e-9 && !s.landed && !s.gone) {
      const r = Math.hypot(s.x, s.y), h = Math.min(left, 0.004 * Math.sqrt(r ** 3 / GM));
      const f = ([x, y, vx, vy]) => { const r3 = Math.hypot(x, y) ** 3; return [vx, vy, -GM * x / r3, -GM * y / r3]; };
      const y0 = [s.x, s.y, s.vx, s.vy], k1 = f(y0);
      const k2 = f(y0.map((q, i) => q + h / 2 * k1[i])), k3 = f(y0.map((q, i) => q + h / 2 * k2[i])), k4 = f(y0.map((q, i) => q + h * k3[i]));
      [s.x, s.y, s.vx, s.vy] = y0.map((q, i) => q + h / 6 * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]));
      s.t += h; left -= h;
      const last = s.path[s.path.length - 1];
      if (Math.hypot(s.x - last[0], s.y - last[1]) > 40) s.path.push([s.x, s.y]);
      if (Math.hypot(s.x, s.y) <= RE) {
        const k = RE / Math.hypot(s.x, s.y); s.x *= k; s.y *= k; s.landed = true; s.path.push([s.x, s.y]);
      }
      if (Math.hypot(s.x, s.y) > 12 * RE) s.gone = true;
    }
  },

  done: s => s.landed || s.gone || s.t >= s.tEnd,

  sample(s) {
    const r = Math.hypot(s.x, s.y), v = Math.hypot(s.vx, s.vy) / 60;
    return { t: s.t, h: r - RE, v };
  },

  graphs: [
    { title: 'Quota', series: [{ key: 'h', label: 'quota (km)', color: 'vel' }] },
    { title: 'Velocità', series: [{ key: 'v', label: 'v (km/s)', color: 'vel' }] },
  ],

  // La palla di cannone per il diagramma di corpo libero: il suo peso, sempre verso il centro della Terra.
  bodies(s, p) {
    const r = Math.hypot(s.x, s.y), g = GM / (r * r) / 3600 * 1000;   // m/s²
    return [{ key: 'ball', title: 'la palla di cannone', x: s.x, y: s.y, rPx: 9, m: 1, color: 'weight', noResize: true,
      v: [s.vx / 60, s.vy / 60], a: [-g * s.x / r, -g * s.y / r], forces: [{ name: 'P', fx: -g * s.x / r, fy: -g * s.y / r, color: 'weight' }],
      note: `\\text{per 1 kg: } g = ${tn(g, 2)}\\ \\mathrm{m/s^2}\\ \\text{a quota } ${tn(r - RE, 0)}\\ \\mathrm{km}` }];
  },

  handles(s, p) {
    if (s.t > 0) return [];
    const arrowLen = arrowPx(p.v, VREF, VA) / SC;
    return [{ id: 'h', x: 0, y: r0(p) }, { id: 'v', x: arrowLen, y: r0(p) }];
  },

  drag(id, wx, wy, p) {
    if (id === 'h') p.h = clamp(Math.round((wy - RE) / 10) * 10, 10, 20000);
    if (id === 'v') p.v = clamp(Math.round(arrowMag(Math.max(0, wx) * SC, VREF, VA) * 20) / 20, 0.5, 30);
  },

  mount() { stage.reset(); },
  unmount() { shots = []; lastSim = null; },

  draw(P, s, p, ui) {
    const S = stage.begin(P, ui), M = S.M, ctx = P.ctx, sc = P.cam.scale;
    if (!ui.snapshot) SC = sc;
    const [ox, oy] = P.S(0, 0), Rpx = RE * sc;

    // La Terra: disco pieno con l'atmosfera appena accennata e qualche meridiano tenue.
    ctx.save();
    const glow = ctx.createRadialGradient(ox, oy, Rpx, ox, oy, Rpx * 1.06);
    glow.addColorStop(0, mixHex(M.body.blue, M.bg, 0.3) + '88'); glow.addColorStop(1, M.body.blue + '00');
    ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(ox, oy, Rpx * 1.06, 0, 7); ctx.fill();
    ctx.fillStyle = mixHex(M.body.blue, M.bg, M.dark ? 0.55 : 0.4); ctx.beginPath(); ctx.arc(ox, oy, Rpx, 0, 7); ctx.fill();
    ctx.strokeStyle = M.body.blue; ctx.lineWidth = 1.8; ctx.stroke();
    ctx.globalAlpha = 0.25; ctx.lineWidth = 1;
    for (let k = 1; k < 4; k++) { ctx.beginPath(); ctx.ellipse(ox, oy, Rpx * k / 4, Rpx, 0, 0, 7); ctx.stroke(); }
    ctx.restore();

    // La montagna di Newton, in cima, alta h.
    const hw = Math.max(p.h * 0.8, 300);
    P.poly([[-hw, Math.sqrt(RE * RE - hw * hw)], [hw, Math.sqrt(RE * RE - hw * hw)], [0, r0(p)]], { fill: M.solid, stroke: M.solidEdge, width: 1.4 });

    // Orbita circolare di riferimento (tenue) e, a richiesta, l'orbita prevista per questo colpo.
    P.line(circle(r0(p)), { color: 'muted', width: 1, dash: [3, 7], alpha: 0.35 });
    if (p.showConic) {
      const el = elements(0, r0(p), p.v * 60, 0, GM);
      for (const seg of conicPts(el, 12 * RE)) P.line(seg, { color: 'muted', width: 1.3, dash: [6, 6], alpha: 0.7 * S.grow('conic', 0.8) });
    }

    // Colpi precedenti, grigi, con la loro velocità.
    if (p.keepShots) for (const sh of shots) {
      if (Math.abs(sh.v - p.v) < 1e-9 && sh.path === s.path) continue;
      P.line(sh.path, { color: 'muted', width: 1.4, alpha: 0.55 });
      const e = sh.path[sh.path.length - 1], [a, b] = P.S(e[0], e[1]);
      tex(P, a + 8, b - 10, `${tn(sh.v, 1)}\\ \\mathrm{km/s}`, { size: 13, color: M.muted, halo: M.bg, align: 'left' });
    }

    // Il colpo di adesso.
    P.line(s.path.concat([[s.x, s.y]]), { color: 'vel', width: 2.4 });
    const [bx, by] = P.S(s.x, s.y);
    ctx.save(); ctx.fillStyle = M.text; ctx.beginPath(); ctx.arc(bx, by, 5, 0, 7); ctx.fill(); ctx.restore();
    const v = Math.hypot(s.vx, s.vy) / 60;
    if (v > 1e-6 && !s.landed) {
      const L = arrowPx(v, VREF, VA) / sc;
      P.arrow(s.x, s.y, s.x + s.vx / 60 / v * L, s.y + s.vy / 60 / v * L, { color: 'vel', key: 'v', width: 3, label: 'v' });
    }
    // Il cannone, sulla vetta.
    const [cx, cy] = P.S(0, r0(p));
    ctx.save(); ctx.translate(cx, cy); ctx.fillStyle = M.text; ctx.fillRect(-4, -9, 22, 7); ctx.beginPath(); ctx.arc(0, -4, 5, 0, 7); ctx.fill(); ctx.restore();
    if (s.t === 0) {
      tex(P, cx, cy - 30, symVal(P, 'h', uq('km', p.h, 0)), { size: 15, color: M.text, halo: M.bg });
      if (!ui.snapshot) {
        P.handle(0, r0(p), ui.active === 'h');
        P.handle(arrowPx(p.v, VREF, VA) / sc, r0(p), ui.active === 'v');
      }
    }
  },

  formulas(s, p) {
    const vc = vCirc(p), vf = Math.sqrt(2) * vc, el = elements(0, r0(p), p.v * 60, 0, GM);
    const kind = p.v < vc * 0.999 && el.a * (1 - el.e) < RE ? 'ricade a terra' : el.bound ? (Math.abs(p.v - vc) / vc < 0.005 ? 'orbita circolare' : 'orbita ellittica') : 'sfugge alla Terra';
    const r = Math.hypot(s.x, s.y);
    return [
      { h: 'Velocità caratteristiche a quota h' },
      { key: true, tex: `${C('vel', 'v_c')}=\\sqrt{\\dfrac{GM}{R+h}}=${uq('km/s', vc, 2)}` },
      { key: true, tex: `${C('acc', 'v_f')}=\\sqrt{\\dfrac{2GM}{R+h}}=${uq('km/s', vf, 2)}` },
      { tex: `R=${uq('km', RE, 0)}\\qquad GM=3{,}986\\cdot10^{5}\\ \\mathrm{km^3/s^2}` },
      { h: `Questo colpo: ${kind}` },
      { tex: `v=${uq('km/s', p.v, 2)}=${tn(p.v / vc, 3)}\\,v_c` },
      el.bound && { tex: `T=2\\pi\\sqrt{\\dfrac{a^3}{GM}}=${uq('min', el.T, 1)}` },
      { h: s.landed ? 'Atterrato' : s.gone ? 'Sfuggito' : 'Istante attuale' },
      { tex: `t=${uq('min', s.t, 1)}\\qquad \\text{quota } ${uq('km', r - RE, 0)}` },
    ].filter(Boolean);
  },

  theory: `
<h2>Il cannone di Newton</h2>
<p>Nei <i>Principia</i> Newton immagina una montagna così alta da superare l'atmosfera, con un cannone che spara in orizzontale. Più veloce è il colpo, più lontano cade. Ma la Terra è curva: se il proiettile è abbastanza veloce, mentre cade la superficie «scappa» sotto di lui e il proiettile non tocca mai terra. È in <b>orbita</b>.</p>

<h3>Cadere attorno alla Terra</h3>
<p>Un satellite in orbita non è «senza gravità»: sta cadendo continuamente verso il centro della Terra. La sua accelerazione è centripeta e vale $g$ a quella quota:</p>
$$\\frac{v_c^2}{R + h} = \\frac{G M}{(R + h)^2} \\quad\\Rightarrow\\quad v_c = \\sqrt{\\frac{G M}{R + h}}$$
<p>Vicino alla superficie è circa 7,9 km/s: un giro in un'ora e mezza.</p>

<h3>Più veloce: ellissi e fuga</h3>
<ul>
  <li>$v < v_c$: il proiettile ricade (la sua traiettoria è un pezzo di ellisse con il fuoco nel centro della Terra);</li>
  <li>$v = v_c$: orbita circolare;</li>
  <li>$v_c < v < v_f$: orbita ellittica, con il cannone nel punto più vicino alla Terra;</li>
  <li>$v \\ge v_f = \\sqrt2\\,v_c$: il proiettile sfugge e non torna più.</li>
</ul>
<div class="box">La traiettoria parabolica del moto del proiettile è solo un'approssimazione: è un piccolo pezzo di ellisse, quando la Terra si può considerare piatta.</div>

<h3>Prova con la simulazione</h3>
<ol>
  <li>Spara con velocità crescenti: i colpi precedenti restano disegnati, come nella figura di Newton.</li>
  <li>Trova la velocità che dà l'orbita circolare e confrontala con $v_c$ nelle formule.</li>
  <li>Alza la montagna: la velocità circolare cresce o diminuisce? E il periodo?</li>
</ol>

<h3>Esercizi</h3>
<details><summary>1. La Stazione Spaziale orbita a 400 km di quota. Che velocità ha? Quanto dura un giro?</summary>
<p>$v_c = \\sqrt{398600/6771} \\approx 7{,}67$ km/s; $T = 2\\pi \\cdot 6771 / 7{,}67 \\approx 5545$ s $\\approx 92$ min.</p></details>
<details><summary>2. Qual è la velocità di fuga dalla superficie terrestre?</summary>
<p>$v_f = \\sqrt{2 \\cdot 398600 / 6371} \\approx 11{,}2$ km/s.</p></details>
`,
};

function circle(r, n = 180) { const pts = []; for (let i = 0; i <= n; i++) pts.push([r * Math.cos(2 * Math.PI * i / n), r * Math.sin(2 * Math.PI * i / n)]); return pts; }
