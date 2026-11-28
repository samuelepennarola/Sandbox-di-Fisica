import { tn, clamp } from '../core/math.js';
import { tex, rampColor, arrowS } from '../core/manim.js';
import { uq } from '../core/units.js';
import { Stage, C, arrowPx, arrowMag, symVal } from '../core/annot.js';
import { planet } from '../core/grav.js';

// Campo gravitazionale di una, due o tre masse (unità semplici, G = 1), con una massa di prova che si può lasciar
// andare: il campo si vede con i vettori, le superfici equipotenziali e la traiettoria della massa di prova.
const stage = new Stage();
const G = 1, EPS = 0.05;                       // costante e "ammorbidimento" vicino alle masse
const deg = Math.PI / 180;
const VA = { min: 34, max: 110 };
let SC = 50;
let equipCache = { key: '', segs: null };

const masses = p => [1, 2, 3].map(i => ({ i, m: p['m' + i], x: p['x' + i], y: p['y' + i] })).filter(q => q.m > 0);
const rad = m => 0.12 + 0.1 * Math.cbrt(m);
function gAt(p, x, y) {
  let gx = 0, gy = 0, phi = 0;
  for (const q of masses(p)) {
    const dx = q.x - x, dy = q.y - y, r2 = dx * dx + dy * dy + EPS * EPS, r = Math.sqrt(r2);
    gx += G * q.m * dx / (r2 * r); gy += G * q.m * dy / (r2 * r); phi -= G * q.m / r;
  }
  return { gx, gy, g: Math.hypot(gx, gy), phi };
}

export default {
  id: 'gfield',
  title: 'Campo gravitazionale',
  subtitle: 'Vettori, equipotenziali, una massa di prova',
  axes: true,

  params: [
    { key: 'm1', label: 'Massa 1  m₁', unit: 'kg', min: 0, max: 200, step: 0.1, value: 10 },
    { key: 'm2', label: 'Massa 2  m₂', unit: 'kg', min: 0, max: 200, step: 0.1, value: 0 },
    { key: 'm3', label: 'Massa 3  m₃', unit: 'kg', min: 0, max: 200, step: 0.1, value: 0 },
    { key: 'v0', label: 'Velocità della massa di prova v₀', unit: 'm/s', min: 0, max: 20, step: 0.05, value: 0 },
    { key: 'phi', label: 'Direzione di v₀', unit: '°', min: -180, max: 180, step: 1, value: 90 },
    { key: 'tMax', label: 'Durata della simulazione', unit: 's', min: 5, max: 120, step: 5, value: 30 },
    { key: 'x1', label: 'x₁', unit: 'm', min: -8, max: 8, step: 0.05, value: 0, hidden: true },
    { key: 'y1', label: 'y₁', unit: 'm', min: -6, max: 6, step: 0.05, value: 0, hidden: true },
    { key: 'x2', label: 'x₂', unit: 'm', min: -8, max: 8, step: 0.05, value: 2.5, hidden: true },
    { key: 'y2', label: 'y₂', unit: 'm', min: -6, max: 6, step: 0.05, value: 0, hidden: true },
    { key: 'x3', label: 'x₃', unit: 'm', min: -8, max: 8, step: 0.05, value: 0, hidden: true },
    { key: 'y3', label: 'y₃', unit: 'm', min: -6, max: 6, step: 0.05, value: 2.5, hidden: true },
    { key: 'px', label: 'x della prova', unit: 'm', min: -8, max: 8, step: 0.05, value: 3, hidden: true },
    { key: 'py', label: 'y della prova', unit: 'm', min: -6, max: 6, step: 0.05, value: 2, hidden: true },
    { key: 'showVec', type: 'toggle', label: 'Vettori del campo', value: true, live: true },
    { key: 'showEquip', type: 'toggle', label: 'Superfici equipotenziali', value: true, live: true },
  ],

  presets: [
    { label: 'Una massa', values: { m1: 10, m2: 0, m3: 0, x1: 0, y1: 0, px: 3, py: 2, v0: 0 } },
    { label: 'Orbita attorno a una massa', values: { m1: 10, m2: 0, m3: 0, x1: 0, y1: 0, px: 3, py: 0, v0: 1.83, phi: 90 } },
    { label: 'Due masse uguali', values: { m1: 10, m2: 10, m3: 0, x1: -2, y1: 0, x2: 2, y2: 0, px: 0, py: 3, v0: 0 } },
    { label: 'Terra e Luna', values: { m1: 16, m2: 2, m3: 0, x1: -1.5, y1: 0, x2: 2.5, y2: 0, px: 1.2, py: 0.4, v0: 0 } },
    { label: 'Tre masse', values: { m1: 10, m2: 6, m3: 8, x1: -2.5, y1: -1, x2: 2.5, y2: -1, x3: 0, y3: 2.5, px: 0, py: 0.2, v0: 0.6, phi: 0 } },
  ],

  view() { return { xmin: -6, xmax: 6, ymin: -4.2, ymax: 4.2 }; },

  init(p) {
    const v = p.v0, a = p.phi * deg;
    return { t: 0, x: p.px, y: p.py, vx: v * Math.cos(a), vy: v * Math.sin(a), path: [[p.px, p.py]], hit: false, tEnd: p.tMax };
  },

  step(s, dt, p) {
    let left = dt;
    while (left > 1e-9 && !s.hit) {
      const near = Math.min(...masses(p).map(q => Math.hypot(q.x - s.x, q.y - s.y)), 10);
      const h = Math.min(left, Math.max(2e-4, 0.01 * near * near));
      const f = ([x, y, vx, vy]) => { const g = gAt(p, x, y); return [vx, vy, g.gx, g.gy]; };
      const y0 = [s.x, s.y, s.vx, s.vy], k1 = f(y0);
      const k2 = f(y0.map((q, i) => q + h / 2 * k1[i])), k3 = f(y0.map((q, i) => q + h / 2 * k2[i])), k4 = f(y0.map((q, i) => q + h * k3[i]));
      [s.x, s.y, s.vx, s.vy] = y0.map((q, i) => q + h / 6 * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]));
      s.t += h; left -= h;
      const last = s.path[s.path.length - 1];
      if (Math.hypot(s.x - last[0], s.y - last[1]) > 0.03) s.path.push([s.x, s.y]);
      if (masses(p).some(q => Math.hypot(q.x - s.x, q.y - s.y) < rad(q.m))) s.hit = true;
      if (Math.abs(s.x) > 30 || Math.abs(s.y) > 30) s.hit = true;
    }
  },

  done: s => s.hit || s.t >= s.tEnd,

  sample(s, p) { const g = gAt(p, s.x, s.y), v = Math.hypot(s.vx, s.vy); return { t: s.t, g: g.g, v, E: 0.5 * v * v + g.phi }; },

  graphs: [
    { title: 'Campo nella posizione della prova', series: [{ key: 'g', label: 'g (N/kg)', color: 'weight' }] },
    { title: 'Velocità', series: [{ key: 'v', label: 'v (m/s)', color: 'vel' }] },
    { title: 'Energia per unità di massa', series: [{ key: 'E', label: 'E (J/kg)', color: 'friction' }] },
  ],

  handles(s, p) {
    const h = masses(p).map(q => ({ id: 'm' + q.i, x: q.x, y: q.y, r: 24 }));
    h.push({ id: 'probe', x: p.px, y: p.py });
    const L = Math.max(arrowPx(p.v0, 20, VA), VA.min) / SC;
    h.push({ id: 'v0', x: p.px + L * Math.cos(p.phi * deg), y: p.py + L * Math.sin(p.phi * deg) });
    return h;
  },

  drag(id, wx, wy, p) {
    const x = clamp(Math.round(wx * 20) / 20, -8, 8), y = clamp(Math.round(wy * 20) / 20, -6, 6);
    if (id === 'probe') { p.px = x; p.py = y; return; }
    if (id === 'v0') {
      const dx = wx - p.px, dy = wy - p.py;
      p.v0 = clamp(Math.round(arrowMag(Math.hypot(dx, dy) * SC, 20, VA) * 20) / 20, 0, 20);
      if (Math.hypot(dx, dy) * SC > 8) p.phi = Math.round(Math.atan2(dy, dx) / deg);
      return;
    }
    const i = id[1]; p['x' + i] = x; p['y' + i] = y;
  },

  // La massa di prova (1 kg): una forza per ogni massa che la attira; la loro somma è m·g.
  bodies(s, p) {
    const forces = masses(p).map(q => {
      const dx = q.x - s.x, dy = q.y - s.y, r2 = dx * dx + dy * dy + EPS * EPS, r = Math.sqrt(r2), F = G * q.m / r2;
      return { name: `F_${q.i}`, fx: F * dx / r, fy: F * dy / r, color: q.i === 1 ? 'vel' : q.i === 2 ? 'weight' : 'normal' };
    });
    const g = gAt(p, s.x, s.y);
    return [{ key: 'probe', title: 'la massa di prova (1 kg)', x: s.x, y: s.y, rPx: 10, m: 1, color: 'text', noResize: true,
      forces, a: [g.gx, g.gy], v: [s.vx, s.vy] }];
  },

  mount() { stage.reset(); equipCache = { key: '', segs: null }; },

  draw(P, s, p, ui) {
    const S = stage.begin(P, ui), M = S.M, cam = P.cam, ctx = P.ctx;
    if (!ui.snapshot) SC = cam.scale;
    const ms = masses(p), mTot = ms.reduce((a, q) => a + q.m, 0) || 1;
    const gRef = G * mTot / 9;   // campo a 3 m da tutta la massa: riferimento per colori e frecce

    // Equipotenziali: marching squares su una griglia di celle di 14 px, livelli in progressione geometrica.
    if (p.showEquip && ms.length) {
      const key = ms.map(q => `${q.m.toFixed(4)},${q.x.toFixed(4)},${q.y.toFixed(4)}`).join('|') + `|${Math.round(cam.cx * 100)},${Math.round(cam.cy * 100)},${Math.round(cam.scale * 100)},${cam.w},${cam.h}`;
      if (equipCache.key !== key) {
        const cell = 14, nx = Math.ceil(cam.w / cell) + 1, ny = Math.ceil(cam.h / cell) + 1, V = new Float64Array(nx * ny);
        for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { const [x, y] = cam.toWorld(i * cell, j * cell); V[j * nx + i] = gAt(p, x, y).phi; }
        const levels = []; for (let k = 0; k < 14; k++) levels.push(-G * mTot / (0.6 * 1.35 ** k));
        const segs = [];
        for (const L of levels) for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
          const a = V[j * nx + i], b = V[j * nx + i + 1], c = V[(j + 1) * nx + i + 1], d = V[(j + 1) * nx + i];
          const pts = [];
          const edge = (v1, v2, x1, y1, x2, y2) => { if ((v1 - L) * (v2 - L) < 0) { const t = (L - v1) / (v2 - v1); pts.push([x1 + (x2 - x1) * t, y1 + (y2 - y1) * t]); } };
          const X = i * cell, Y = j * cell;
          edge(a, b, X, Y, X + cell, Y); edge(b, c, X + cell, Y, X + cell, Y + cell);
          edge(c, d, X + cell, Y + cell, X, Y + cell); edge(d, a, X, Y + cell, X, Y);
          if (pts.length >= 2) segs.push(pts[0][0], pts[0][1], pts[1][0], pts[1][1]);
          if (pts.length === 4) segs.push(pts[2][0], pts[2][1], pts[3][0], pts[3][1]);
        }
        equipCache = { key, segs };
      }
      ctx.save(); ctx.strokeStyle = M.vec.acc; ctx.lineWidth = 1.1; ctx.globalAlpha = 0.5 * S.grow('equip', 0.8);
      ctx.beginPath();
      const segs = equipCache.segs;
      for (let k = 0; k < segs.length; k += 4) { ctx.moveTo(segs[k], segs[k + 1]); ctx.lineTo(segs[k + 2], segs[k + 3]); }
      ctx.stroke(); ctx.restore();
    }

    // Vettori del campo su una griglia di 56 px: verso le masse, colore e lunghezza secondo l'intensità.
    if (p.showVec && ms.length) {
      const step = 56, g0 = S.grow('vec', 0.8);
      for (let b = step / 2; b < cam.h; b += step) for (let a = step / 2; a < cam.w; a += step) {
        const [x, y] = cam.toWorld(a, b);
        if (ms.some(q => Math.hypot(q.x - x, q.y - y) < rad(q.m) + 0.25)) continue;
        const g = gAt(p, x, y), L = Math.min(24, 8 + 16 * Math.sqrt(Math.min(1, g.g / (gRef * 4)))) * g0;
        if (g.g < 1e-9 || L < 2) continue;
        const col = rampColor(M, g.g, gRef / 20, gRef * 6);
        arrowS(ctx, a - g.gx / g.g * L / 2, b + g.gy / g.g * L / 2, a + g.gx / g.g * L / 2, b - g.gy / g.g * L / 2, col, { width: 1.8, tip: 7, alpha: 0.9 });
      }
    }

    // Le masse.
    for (const q of ms) {
      planet(P, q.x, q.y, rad(q.m) * cam.scale, q.i === 1 ? 'blue' : q.i === 2 ? 'red' : 'green', { alpha: S.born('m' + q.i) });
      const [a, b] = P.S(q.x, q.y);
      tex(P, a, b + rad(q.m) * cam.scale + 14, symVal(P, `m_${q.i}`, uq('kg', q.m, 1)), { size: 14, color: M.text, halo: M.bg, alpha: 0.85 });
    }

    // Traiettoria e massa di prova, con il campo nel punto in cui si trova.
    P.line(s.path.concat([[s.x, s.y]]), { color: 'vel', width: 2.2, alpha: 0.85 });
    const g = gAt(p, s.x, s.y), [a, b] = P.S(s.x, s.y);
    if (ui.sel !== 'probe' && g.g > 1e-9) {
      const L = arrowPx(g.g, gRef * 4, { min: 34, max: 110 }) / cam.scale;
      P.arrow(s.x, s.y, s.x + g.gx / g.g * L, s.y + g.gy / g.g * L, { color: 'weight', key: 'g', width: 3, label: 'g' });
    }
    ctx.save(); ctx.fillStyle = M.text; ctx.beginPath(); ctx.arc(a, b, 5.5, 0, 7); ctx.fill(); ctx.restore();
    if (s.t === 0 && p.v0 > 0) {
      const L = arrowPx(p.v0, 20, VA) / cam.scale;
      P.arrow(p.px, p.py, p.px + L * Math.cos(p.phi * deg), p.py + L * Math.sin(p.phi * deg), { color: 'vel', key: 'v0', width: 3, label: 'v_0' });
    }
    if (s.t === 0) for (const h of this.handles(s, p)) P.handle(h.x, h.y, ui.active === h.id);
  },

  formulas(s, p) {
    const g = gAt(p, s.x, s.y), ms = masses(p);
    return [
      { h: 'Campo di una massa puntiforme' },
      { key: true, tex: `${C('weight', 'g')}=\\dfrac{G M}{r^2}\\qquad ${C('acc', '\\varphi')}=-\\dfrac{G M}{r}\\qquad (G=1)` },
      { h: 'Sovrapposizione' },
      { tex: `\\vec g=${ms.map(q => `\\vec g_{${q.i}}`).join('+') || '\\vec 0'}` },
      { h: 'Nella posizione della massa di prova' },
      { key: true, tex: `${C('weight', '|\\vec g|')}=${uq('N/kg', g.g, 3)}\\qquad ${C('acc', '\\varphi')}=${uq('J/kg', g.phi, 3)}` },
      { tex: `\\vec g=(${tn(g.gx, 3)};\\ ${tn(g.gy, 3)})\\ \\mathrm{N/kg}` },
      s.hit && { tex: `\\text{la massa di prova è caduta su una massa (o è uscita dalla scena)}`, cls: 'warn' },
    ].filter(Boolean);
  },

  theory: `
<h2>Campo gravitazionale</h2>
<p>Una massa $M$ modifica lo spazio attorno a sé: qualunque altra massa $m$ messa in un punto sente una forza $\\vec F = m\\,\\vec g$. Il vettore $\\vec g$ è il <b>campo gravitazionale</b> in quel punto e si misura in N/kg (cioè in m/s²): è l'accelerazione che avrebbe un corpo lasciato libero lì.</p>
$$g = \\frac{G M}{r^2} \\qquad \\text{diretto verso la massa}$$
<p>Sulla superficie terrestre $g \\approx 9{,}81$ N/kg.</p>

<h3>Più masse: la sovrapposizione</h3>
<p>Il campo di più masse è la <b>somma vettoriale</b> dei campi di ciascuna. Tocca la massa di prova: il suo diagramma di corpo libero mostra una forza per ogni massa, e la loro somma è $m\\,\\vec g$. Tra due masse uguali c'è un punto in cui i due campi si annullano.</p>

<h3>Potenziale e superfici equipotenziali</h3>
<p>Il <b>potenziale</b> gravitazionale è l'energia potenziale per unità di massa: $\\varphi = -GM/r$ (zero all'infinito, negativo ovunque). Le linee gialle uniscono i punti con lo stesso potenziale: muoversi lungo una di esse non costa lavoro. Il campo è sempre <b>perpendicolare</b> alle equipotenziali e punta verso potenziali più bassi, come l'acqua che scende lungo la massima pendenza.</p>

<h3>Prova con la simulazione</h3>
<ol>
  <li>Con «Due masse uguali», trova il punto di campo nullo. È di equilibrio stabile?</li>
  <li>Lascia andare la massa di prova da ferma: la traiettoria segue i vettori del campo?</li>
  <li>Con «Orbita attorno a una massa», cambia di poco la velocità iniziale: che forma prende l'orbita?</li>
  <li>Con «Terra e Luna», dove si trova il punto in cui le due attrazioni si bilanciano? È più vicino alla Terra o alla Luna?</li>
</ol>

<h3>Esercizi</h3>
<details><summary>1. Quanto vale $g$ a un'altezza pari al raggio terrestre?</summary>
<p>A distanza $2R$ dal centro: $g = 9{,}81/4 \\approx 2{,}45$ N/kg.</p></details>
<details><summary>2. Due masse uguali $M$ distano $d$. Quanto vale il campo nel punto medio? E a metà sull'asse, a distanza $d/2$ dalla congiungente?</summary>
<p>Nel punto medio è nullo. Sull'asse i due contributi hanno componenti lungo l'asse che si sommano: $g = 2 \\cdot \\frac{GM}{d^2/2} \\cdot \\frac{\\sqrt2}{2} = \\frac{2\\sqrt2\\,GM}{d^2}$.</p></details>
`,
};
