import { tn, clamp } from '../core/math.js';
import { tex } from '../core/manim.js';
import { uq } from '../core/units.js';
import { Stage, C, arrowPx, arrowMag, brace, symVal } from '../core/annot.js';
import { camera3d, background3d, orbit3d, axes3d, prism } from '../core/view3d.js';
import { space3d } from '../core/space3d.js';

const stage = new Stage();
const G = 9.81, LB = 4, H = 1.3, TH = 0.12;     // lunghezza dell'asta, altezza del fulcro, spessore dell'asta (m)
// L'asta ruota finché l'estremità che scende tocca il suolo: θ massimo dalla geometria (fulcro alto H).
const limits = p => [Math.asin(Math.min(1, H / Math.max(1e-6, LB / 2 + p.xf))), Math.asin(Math.min(1, H / Math.max(1e-6, LB / 2 - p.xf)))];
const FREF = 40, FA = { min: 34, max: 120 };      // scala della freccia della forza applicata
let SC = 60, V = null;                            // px per metro e camera dell'ultima scena (per le maniglie)
const deg = Math.PI / 180;

// Le forze sull'asta: punto d'applicazione (coordinata u lungo l'asta, 0 = centro) e componenti nel piano.
function forces(p) {
  const list = [];
  if (p.mb > 0) list.push({ id: 'b', u: 0, fx: 0, fy: -p.mb * G, name: 'P_a', color: 'muted' });
  if (p.m1 > 0) list.push({ id: '1', u: p.d1, fx: 0, fy: -p.m1 * G, name: 'P_1', color: 'vel' });
  if (p.m2 > 0) list.push({ id: '2', u: p.d2, fx: 0, fy: -p.m2 * G, name: 'P_2', color: 'weight' });
  if (p.F > 0) list.push({ id: 'F', u: p.dF, fx: p.F * Math.cos(p.phi * deg), fy: p.F * Math.sin(p.phi * deg), name: 'F', color: 'applied' });
  return list;
}

// Momento (componente z) di una forza applicata nel punto u dell'asta ruotata di th attorno al fulcro.
const rOf = (p, u, th) => [(u - p.xf) * Math.cos(th), (u - p.xf) * Math.sin(th)];
const torque = (p, f, th) => { const [rx, ry] = rOf(p, f.u, th); return rx * f.fy - ry * f.fx; };
const inertia = p => p.mb * (LB * LB / 12 + p.xf * p.xf) + p.m1 * (p.d1 - p.xf) ** 2 + p.m2 * (p.d2 - p.xf) ** 2 + 0.05;

// Arco con la punta attorno al punto (a, b) in px, da a0 ad a1 (rad, antiorari), per il verso di rotazione.
function arcArrow(ctx, a, b, r, a0, a1, color, alpha) {
  ctx.save();
  ctx.globalAlpha = alpha; ctx.strokeStyle = ctx.fillStyle = color; ctx.lineWidth = 2.2; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.arc(a, b, r, -a0, -a1, a1 > a0); ctx.stroke();
  const ex = a + r * Math.cos(a1), ey = b - r * Math.sin(a1), s = Math.sign(a1 - a0);
  const tx = -Math.sin(a1) * s, ty = -Math.cos(a1) * s;   // tangente sullo schermo nel verso di percorrenza
  ctx.beginPath(); ctx.moveTo(ex + tx * 8, ey + ty * 8);
  ctx.lineTo(ex - ty * 4.5, ey + tx * 4.5); ctx.lineTo(ex + ty * 4.5, ey - tx * 4.5); ctx.closePath(); ctx.fill();
  ctx.restore();
}

export default {
  id: 'lever',
  title: 'Momenti e leve',
  subtitle: 'Braccio, momento di una forza, equilibrio',

  params: [
    { key: 'm1', label: 'Massa appesa 1  m₁', unit: 'kg', min: 0, max: 100, step: 0.1, value: 2 },
    { key: 'd1', label: 'Posizione di m₁', unit: 'm', min: -2, max: 2, step: 0.05, value: -1 },
    { key: 'm2', label: 'Massa appesa 2  m₂', unit: 'kg', min: 0, max: 100, step: 0.1, value: 1 },
    { key: 'd2', label: 'Posizione di m₂', unit: 'm', min: -2, max: 2, step: 0.05, value: 1.5 },
    { key: 'F', label: 'Forza applicata F', unit: 'N', min: 0, max: 1000, step: 0.5, value: 0 },
    { key: 'dF', label: 'Punto di applicazione di F', unit: 'm', min: -2, max: 2, step: 0.05, value: 2 },
    { key: 'phi', label: 'Direzione di F', unit: '°', min: -180, max: 180, step: 1, value: 90 },
    { key: 'xf', label: 'Posizione del fulcro', unit: 'm', min: -2, max: 2, step: 0.05, value: 0 },
    { key: 'mb', label: 'Massa dell\'asta', unit: 'kg', min: 0, max: 100, step: 0.1, value: 2 },
    { key: 'tMax', label: 'Durata della simulazione', unit: 's', min: 2, max: 120, step: 1, value: 6 },
    { key: 'show3d', type: 'toggle', label: 'Vista 3D: il momento come vettore', value: false, live: true },
    { key: 'showArm', type: 'toggle', label: 'Bracci e versi di rotazione', value: true, live: true },
  ],

  presets: [
    { label: 'Altalena in equilibrio', values: { m1: 2, d1: -1.5, m2: 1.5, d2: 2, F: 0, xf: 0, mb: 2 } },
    { label: 'Altalena sbilanciata', values: { m1: 2, d1: -1, m2: 1, d2: 1.5, F: 0, xf: 0, mb: 2 } },
    { label: 'Leva di primo genere', values: { m1: 8, d1: -1.8, m2: 0, F: 20, dF: 2, phi: -90, xf: -1.2, mb: 2 } },
    { label: 'Leva di secondo genere', values: { m1: 6, d1: -1, m2: 0, F: 20, dF: 2, phi: 90, xf: -2, mb: 2 } },
    { label: 'Forza obliqua', values: { m1: 3, d1: -1, m2: 0, F: 30, dF: 2, phi: 135, xf: 0, mb: 2 } },
  ],

  view() { return { xmin: -3.2, xmax: 3.2, ymin: -0.4, ymax: 3.6 }; },

  init(p) { return { t: 0, th: 0, w: 0, ground: false, tEnd: p.tMax }; },

  step(s, dt, p) {
    const tau = forces(p).reduce((a, f) => a + torque(p, f, s.th), 0), I = inertia(p);
    s.w += (tau / I - 0.4 * s.w) * dt;   // un po' d'attrito nel perno
    s.th += s.w * dt;
    const [up, dn] = limits(p);
    if (s.th > up) { s.th = up; s.w = 0; s.ground = true; }
    if (s.th < -dn) { s.th = -dn; s.w = 0; s.ground = true; }
    s.t += dt;
  },

  done: s => s.t >= s.tEnd,

  sample(s, p) {
    const fs = forces(p), o = { t: s.t, th: s.th / deg, w: s.w };
    let net = 0;
    for (const f of fs) { const t = torque(p, f, s.th); o['tau' + f.id] = t; net += t; }
    o.tau = net;
    return o;
  },

  graphs: [
    { title: 'Angolo dell\'asta', series: [{ key: 'th', label: 'θ (°)', color: 'vel' }] },
    { title: 'Momenti', series: [{ key: 'tau1', label: 'τ₁ (N·m)', color: 'vel' }, { key: 'tau2', label: 'τ₂ (N·m)', color: 'weight' }, { key: 'tauF', label: 'τ_F (N·m)', color: 'applied' }, { key: 'tau', label: 'τ totale (N·m)', color: 'friction' }] },
  ],

  handles(s, p) {
    if (!V) return [];
    const P3 = u => V.p(u, H, 0), h = [{ id: 'xf', ...xy(V.p(p.xf, H - 0.35, 0)) }];
    if (p.m1 > 0) h.push({ id: 'd1', ...xy(P3(p.d1)) });
    if (p.m2 > 0) h.push({ id: 'd2', ...xy(P3(p.d2)) });
    const L = Math.max(arrowPx(p.F, FREF, FA), FA.min) / SC;
    h.push({ id: 'F', ...xy(V.p(p.dF + L * Math.cos(p.phi * deg), H + L * Math.sin(p.phi * deg), 0)) });
    return h;
  },

  drag(id, sx, sy, p) {
    // Dal punto sullo schermo al piano della leva (z = 0), anche a camera girata.
    const [wx, wy] = V ? V.unproject(sx, sy, 0) : [sx, sy];
    const u = clamp(Math.round(wx * 20) / 20, -2, 2);
    if (id === 'd1' || id === 'd2' || id === 'xf') { p[id] = u; return; }
    if (id === 'F') {
      const dx = wx - p.dF, dy = wy - H;
      p.F = clamp(Math.round(arrowMag(Math.hypot(dx, dy) * SC, FREF, FA) * 2) / 2, 0, 1000);
      if (Math.hypot(dx, dy) * SC > 8) p.phi = Math.round(Math.atan2(dy, dx) / deg);
    }
  },

  // Le masse appese per il diagramma di corpo libero: peso e tensione della fune (in 3D proiettati dalla camera).
  bodies(s, p, { scale }) {
    if (!V) return [];
    const th = s.th, out = [];
    for (const [i, m, d, col] of [[1, p.m1, p.d1, 'vel'], [2, p.m2, p.d2, 'weight']]) {
      if (m <= 0) continue;
      const x = p.xf + (d - p.xf) * Math.cos(th), y = H + (d - p.xf) * Math.sin(th), sz = 0.22 * Math.cbrt(m), yb = y - 0.45 - sz / 2;
      const [X, Y] = V.p(x, yb, 0);
      out.push({ key: 'm' + i, title: `\\text{la massa ${i}}`, x: X, y: Y, wx: x, wy: yb, z: 0, proj: (a, b, c) => V.p(a, b, c),
        rPx: sz * scale * 0.75, m, color: col, noResize: true, a: [0, 0], v: [0, 0],
        forces: [{ name: 'P', fx: 0, fy: -m * G, color: 'weight' }, { name: 'T', fx: 0, fy: m * G, color: 'tension' }],
        note: '\\text{la massa è appesa ferma alla fune: } T = P' });
    }
    return out;
  },

  mount() { stage.reset(); },
  drawBackground: background3d('lever'),
  // In vista 3D un dito sullo spazio vuoto fa girare la camera invece di spostare la scena.
  orbit(dx, dy, p) { return orbit3d('lever', p.show3d, dx, dy); },

  draw(P, s, p, ui) {
    const S = stage.begin(P, ui), M = S.M, sc = P.cam.scale, ctx = P.ctx;
    if (!ui.snapshot) SC = sc;
    const W = camera3d(S, 'lever', p.show3d, 22 * deg, -40 * deg, { up: 'y' });
    space3d(P, W, { origin: [-3, 0, 0], up: 'y', step: 1 });   // griglia a perdita d'occhio, fissa nel mondo
    if (!ui.snapshot) V = W;
    const th = s.t === 0 ? 0 : s.th, piv = [p.xf, H], c = Math.cos(th), sn = Math.sin(th);
    const at = u => [p.xf + (u - p.xf) * c, H + (u - p.xf) * sn];
    const tilt = W.tilt();

    if (W.tilt() < 0.05) P.ground(0);   // in 3D il suolo è un piano perpendicolare: la linea piatta taglierebbe la scena
    // Sostegno del fulcro: un triangolo pieno (prisma in 3D).
    prism(P, W, [[p.xf - 0.28, 0], [p.xf + 0.28, 0], [p.xf, H - 0.02]], -0.2, 0.2, { fill: M.solid, stroke: M.solidEdge, alpha: 0.95 });

    // Asta: prisma sottile, ruotato di th attorno al fulcro.
    const [e0x, e0y] = at(-LB / 2), [e1x, e1y] = at(LB / 2), nx = -sn * TH / 2, ny = c * TH / 2;
    prism(P, W, [[e0x - nx, e0y - ny], [e1x - nx, e1y - ny], [e1x + nx, e1y + ny], [e0x + nx, e0y + ny]], -0.14, 0.14,
      { fill: M.body.wood, stroke: M.text, alpha: 0.9 });
    // Tacche ogni mezzo metro: si leggono le distanze dal fulcro.
    for (let u = -2; u <= 2.001; u += 0.5) {
      const [x, y] = at(u);
      W.line(P, [[x - nx * 1.6, y - ny * 1.6, 0.14], [x + nx * 1.6, y + ny * 1.6, 0.14]], { color: 'text', width: 1, alpha: 0.6 });
    }
    { const [a, b] = W.S(P, p.xf, H, 0.14); ctx.save(); ctx.fillStyle = M.text; ctx.beginPath(); ctx.arc(a, b, 3.5, 0, 7); ctx.fill(); ctx.restore(); }

    // Masse appese: fune verticale e blocco.
    for (const [m, d, col] of [[p.m1, p.d1, 'blue'], [p.m2, p.d2, 'red']]) {
      if (m <= 0) continue;
      const [x, y] = at(d), sz = 0.22 * Math.cbrt(m), yb = y - 0.45 - sz / 2;
      W.line(P, [[x, y, 0], [x, yb + sz / 2, 0]], { color: 'text', width: 1.2, alpha: 0.8 });
      prism(P, W, [[x - sz / 2, yb - sz / 2], [x + sz / 2, yb - sz / 2], [x + sz / 2, yb + sz / 2], [x - sz / 2, yb + sz / 2]], -sz / 2, sz / 2,
        { fill: M.body[col], stroke: M.text, alpha: 0.85 });
    }

    // Forze, linee d'azione, bracci e versi di rotazione.
    const fs = forces(p), [pa, pb] = W.S(P, p.xf, H, 0);
    let ring = 0;
    for (const f of fs) {
      const [x, y] = at(f.u), Fm = Math.hypot(f.fx, f.fy), col = f.color === 'muted' ? M.muted : M.vec[f.color];
      const L = arrowPx(Fm, Math.max(FREF, ...fs.map(q => Math.hypot(q.fx, q.fy))), FA) / sc, ux = f.fx / Fm, uy = f.fy / Fm;
      // I pesi appesi si disegnano sotto il blocco (la loro retta d'azione passa comunque per l'attacco della fune).
      const hang = f.id === '1' || f.id === '2', m = f.id === '1' ? p.m1 : p.m2, y0 = hang ? y - 0.45 - 0.22 * Math.cbrt(m) : y;
      W.arrow(P, [x, y0, 0], [x + ux * L, y0 + uy * L, 0], { color: col, key: 'f' + f.id, width: 3, label: f.name });
      const tq = torque(p, f, th);
      if (!p.showArm || Math.abs(tq) < 1e-6) continue;
      // Linea d'azione e piede della perpendicolare dal fulcro: il braccio.
      const k = (piv[0] - x) * ux + (piv[1] - y) * uy, fx = x + ux * k, fy = y + uy * k, arm = Math.abs(tq) / Fm;
      const ext = Math.max(Math.abs(k), 0.4) + 0.4;
      W.line(P, [[x - ux * ext, y - uy * ext, 0], [x + ux * ext, y + uy * ext, 0]], { color: col, width: 1, dash: [4, 5], alpha: 0.5 * (1 - 0.6 * tilt) });
      if (arm * sc > 14) {
        W.line(P, [[piv[0], piv[1], 0], [fx, fy, 0]], { color: col, width: 1.2, dash: [2, 4], alpha: 0.8 * (1 - 0.6 * tilt) });
        if (tilt < 0.05) brace(P, [fx, fy], piv, symVal(P, `b_{${f.id === 'F' ? 'F' : f.id === 'b' ? 'a' : f.id}}`, uq('m', arm)),
          { side: fy < piv[1] ? 1 : -1, gap: 5, size: 14, grow: S.grow('arm' + f.id, 0.7), color: col, alpha: 0.85 });
      }
      // Arco: antiorario se il momento è positivo. In 3D si attenua, lasciando la scena ai vettori τ.
      ring++;
      const r = 22 + 11 * ring, a0 = Math.PI / 2 - 0.55, a1 = Math.PI / 2 + 0.55;
      // Gli archi del verso di rotazione appartengono alla vista piana: in 3D ne fanno le veci i vettori τ.
      if (tilt < 0.05) arcArrow(ctx, pa, pb, r, tq > 0 ? a0 : a1, tq > 0 ? a1 : a0, col, 0.85 * S.grow('arc' + f.id, 0.6));
    }

    // Vista 3D: i momenti sono vettori lungo z, messi coda-punta sul fulcro; accanto la somma, tratteggiata.
    if (tilt > 0.02) {
      const tmax = Math.max(...fs.map(f => Math.abs(torque(p, f, th))), 1);
      W.line(P, [[p.xf, H, 0], [p.xf, H + 0.45, 0]], { color: 'muted', width: 1, dash: [2, 4], alpha: 0.6 * tilt });
      // Pila coda-punta dei momenti sopra il fulcro, staccata dall'asta e dal supporto; accanto la somma.
      const ty = H + 0.45;
      let z = 0, net = 0;
      for (const f of fs) {
        const tq = torque(p, f, th), col = f.color === 'muted' ? M.muted : M.vec[f.color];
        net += tq;
        if (Math.abs(tq) < 1e-6) continue;
        const Lz = arrowPx(tq, tmax, { min: 36, max: 130 }) / sc * Math.sign(tq) * tilt;
        W.arrow(P, [p.xf, ty, z], [p.xf, ty, z + Lz], { color: col, key: 'tz' + f.id, width: 3.2 });
        const [la, lb] = W.S(P, p.xf, ty, z + Lz * 0.6);
        tex(P, la - 22, lb, `\\vec\\tau_{${f.id === 'F' ? 'F' : f.id === 'b' ? 'a' : f.id}}`, { size: 16, color: col, halo: M.bg, alpha: tilt });
        z += Lz;
      }
      if (Math.abs(net) > 1e-6) {
        const Lz = arrowPx(net, tmax, { min: 36, max: 130 }) / sc * Math.sign(net) * tilt;
        W.arrow(P, [p.xf + 0.55, ty, 0], [p.xf + 0.55, ty, Lz], { color: 'text', key: 'tznet', width: 2, dash: [5, 4] });
        const [la, lb] = W.S(P, p.xf + 0.55, ty, Lz);
        tex(P, la + 18, lb - 12, '\\vec\\tau', { size: 17, color: M.text, halo: M.bg, alpha: tilt });
      } else {
        const [la, lb] = W.S(P, p.xf + 0.3, ty, 0.3);
        tex(P, la + 40, lb, '\\vec\\tau=\\vec 0', { size: 17, color: M.text, halo: M.bg, alpha: tilt });
      }
    }

    if (s.t === 0) for (const h of this.handles(s, p)) P.handle(h.x, h.y, ui.active === h.id);
    axes3d(P, W, { origin: [-3, 0, 0], lx: 6.4, ly: 3.4, lz: 2.6 });
  },

  formulas(s, p) {
    const fs = forces(p), th = s.th, I = inertia(p);
    const rows = fs.map(f => {
      const tq = torque(p, f, th), Fm = Math.hypot(f.fx, f.fy), id = f.id === 'F' ? 'F' : f.id === 'b' ? 'a' : f.id;
      return `${C(f.color === 'muted' ? 'friction' : f.color, `\\tau_{${id}}`)}=${tq >= 0 ? '+' : '-'}${tn(Fm, 1)}\\cdot${tn(Math.abs(tq) / Math.max(Fm, 1e-9), 2)}=${uq('N·m', tq, 1)}`;
    });
    const net = fs.reduce((a, f) => a + torque(p, f, th), 0), eq = Math.abs(net) < 0.05;
    return [
      { h: 'Momento di una forza' },
      { key: true, tex: `\\tau=F\\,b\\qquad \\vec\\tau=\\vec r\\times\\vec F` },
      { tex: `\\text{positivo se fa ruotare in verso antiorario}` },
      { h: 'Momenti rispetto al fulcro' },
      ...rows.map(r => ({ tex: r })),
      { key: true, tex: `\\sum\\tau=${uq('N·m', net, 2)}` },
      { tex: eq ? `\\sum\\tau=0:\\ \\text{equilibrio di rotazione}` : `\\sum\\tau\\neq0:\\ \\text{l'asta ruota}`, cls: eq ? 'warn' : '' },
      { h: 'Dinamica della rotazione' },
      { tex: `I=${uq('kg·m²', I, 2)}\\qquad \\alpha=\\dfrac{\\sum\\tau}{I}=${uq('rad/s²', net / I, 2)}` },
      { tex: `\\theta=${tn(s.th / deg, 1)}°` },
      s.ground && { tex: `\\text{l'asta è appoggiata a terra}`, cls: 'warn' },
    ].filter(Boolean);
  },

  theory: `
<h2>Momenti e leve</h2>
<p>Una forza può far <b>traslare</b> un corpo, ma anche farlo <b>ruotare</b>. L'effetto rotatorio dipende non solo dall'intensità della forza, ma anche da <b>dove</b> e <b>come</b> è applicata: una porta si apre facilmente spingendo vicino alla maniglia, a fatica spingendo vicino ai cardini.</p>

<h3>Braccio e momento</h3>
<p>Il <b>braccio</b> $b$ di una forza rispetto a un punto O (il fulcro) è la distanza tra O e la <b>retta d'azione</b> della forza. Il <b>momento</b> della forza è</p>
$$\\tau = F\\,b$$
<p>con il segno $+$ se la forza tende a far ruotare in verso antiorario, $-$ se in verso orario. Si misura in newton per metro (N·m). Una forza la cui retta d'azione passa per il fulcro ha braccio nullo: non fa ruotare.</p>

<h3>Il momento è un vettore</h3>
<p>Accendi «Vista 3D». Il momento è il <b>prodotto vettoriale</b> $\\vec\\tau = \\vec r \\times \\vec F$, dove $\\vec r$ va dal fulcro al punto d'applicazione. È perpendicolare al piano che contiene $\\vec r$ e $\\vec F$: punta verso di noi se la rotazione è antioraria, lontano da noi se è oraria (regola della mano destra). Il suo modulo è $r F \\sin\\varphi = F\\,b$.</p>
<p>Messi coda-punta, i vettori dei momenti si sommano: se la somma è il vettore nullo, l'asta non comincia a ruotare.</p>

<h3>Equilibrio</h3>
<p>Un corpo rigido fermo resta in equilibrio se sono nulle sia la somma delle forze sia la somma dei momenti:</p>
$$\\sum \\vec F = \\vec 0 \\qquad \\sum \\tau = 0$$
<p>Per una leva con due pesi: $m_1 g\\, b_1 = m_2 g\\, b_2$. Un peso piccolo con un braccio grande bilancia un peso grande con un braccio piccolo (Archimede: «datemi un punto d'appoggio e solleverò il mondo»).</p>

<h3>I tre generi di leve</h3>
<ul>
  <li><b>primo genere</b>: il fulcro sta tra la forza e il carico (altalena, forbici, pinze);</li>
  <li><b>secondo genere</b>: il carico sta tra il fulcro e la forza (carriola, schiaccianoci): sempre vantaggiose;</li>
  <li><b>terzo genere</b>: la forza sta tra il fulcro e il carico (pinzette, avambraccio): svantaggiose, ma veloci.</li>
</ul>

<h3>Prova con la simulazione</h3>
<ol>
  <li>Con «Altalena sbilanciata», sposta $m_2$ finché l'asta resta orizzontale. Verifica $m_1 b_1 = m_2 b_2$.</li>
  <li>Con «Forza obliqua», ruota la forza mantenendo fisso il modulo: quando il braccio è massimo?</li>
  <li>Dai massa all'asta e sposta il fulcro: il peso dell'asta agisce nel suo centro.</li>
  <li>In vista 3D, come cambia il vettore $\\vec\\tau_F$ se la forza passa dall'altra parte?</li>
</ol>

<h3>Esercizi</h3>
<details><summary>1. Un bambino di 30 kg siede a 1,5 m dal fulcro di un'altalena. Dove deve sedersi un adulto di 75 kg per l'equilibrio?</summary>
<p>$75 \\cdot b = 30 \\cdot 1{,}5 \\Rightarrow b = 0{,}6$ m dall'altra parte.</p></details>
<details><summary>2. Una chiave inglese lunga 25 cm è spinta all'estremità con 80 N a 60° rispetto al manico. Quanto vale il momento?</summary>
<p>$\\tau = r F \\sin 60^\\circ = 0{,}25 \\cdot 80 \\cdot 0{,}866 \\approx 17{,}3$ N·m.</p></details>
<details><summary>3. Una carriola porta 60 kg a 40 cm dalla ruota; le maniglie sono a 1,2 m. Che forza serve per sollevarla?</summary>
<p>$F \\cdot 1{,}2 = 60 \\cdot 9{,}81 \\cdot 0{,}4 \\Rightarrow F \\approx 196$ N.</p></details>
`,
};

function xy([x, y]) { return { x, y }; }
