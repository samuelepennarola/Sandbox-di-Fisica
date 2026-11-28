import { tn, clamp } from '../core/math.js';
import { tex } from '../core/manim.js';
import { uq } from '../core/units.js';
import { Stage, C, arrowPx, arrowMag, symVal } from '../core/annot.js';
import { camera3d, background3d, orbit3d, axes3d } from '../core/view3d.js';
import * as m3 from '../core/manim3d.js';
import { space3d } from '../core/space3d.js';
import { scaleOf, scaleParam, elements, conicPts, star, planet, wedges, sectorArea } from '../core/grav.js';

const stage = new Stage();
const deg = Math.PI / 180;
const VA = { min: 40, max: 120 };        // freccia della velocità (px)
const NW = 12;                           // spicchi per periodo (orbite chiuse)
let CAM = null, SC = 50;

// Massa del pianeta: in masse terrestri nel sistema solare, nella stessa unità di M con G = 1. Entra nel moto
// relativo come G(M + m) e decide la grandezza del disegno.
const EARTH = 3.003e-6;   // massa della Terra in masse solari
const mPlanet = p => (p.scale === 'solar' ? (p.mp ?? 1) * EARTH : (p.mp ?? 0.001));
const mu = p => scaleOf(p).G * (p.M + mPlanet(p));
// Raggi disegnati (px): crescono con la radice cubica della massa, su scale diverse per stella e pianeta
// (quella vera non entrerebbe in nessuno schermo); la maniglia quadrata li ingrandisce ancora.
const sunPx = p => 12 + 6 * Math.cbrt(p.M);
// Terra ≈ 5 px, Giove ≈ 14 px; mai più grande di quattro quinti della stella.
const planetPx = p => Math.min(0.8 * sunPx(p), 3 + 1.6 * Math.cbrt(p.scale === 'solar' ? (p.mp ?? 1) : (p.mp ?? 0.001) / 0.001 / 300));
const vCirc = p => Math.sqrt(mu(p) / p.r0);
// Stato iniziale: pianeta in (r0, 0), velocità k·v_circ inclinata di φ rispetto alla direzione radiale.
const init0 = p => { const v = p.k * vCirc(p); return { x: p.r0, y: 0, vx: v * Math.cos(p.phi * deg), vy: v * Math.sin(p.phi * deg) }; };
const el0 = p => { const s = init0(p); return elements(s.x, s.y, s.vx, s.vy, mu(p)); };
const rStar = p => 0.03 * p.r0;          // il "Sole": urto se il pianeta ci finisce dentro
// Intervallo uguale per gli spicchi: un dodicesimo di periodo, o un tempo caratteristico per le orbite aperte.
const dtWedge = p => { const e = el0(p); return e.bound ? e.T / NW : 0.25 * p.r0 / Math.max(p.k * vCirc(p), 1e-6); };

export default {
  id: 'orbits',
  title: 'Orbite e leggi di Keplero',
  subtitle: 'Ellissi, aree uguali, T² ∝ a³',
  timeUnit: p => scaleOf(p).T,
  // Il tempo scorre in proporzione all'orbita: un giro dura circa otto secondi, che sia Mercurio o una cometa.
  timeScale(s, p) {
    const e = el0(p), Tc = e.bound ? e.T : 4 * p.r0 / Math.max(p.k * vCirc(p), 1e-9);
    return Math.min(500, Math.max(1e-3, Tc / 8));
  },
  axes: true,

  params: [
    scaleParam('solar'),
    { key: 'M', label: 'Massa centrale M', unit: '', min: 0.01, max: 1000, step: 0.1, value: 1, refit: true },
    { key: 'mp', label: 'Massa del pianeta (masse terrestri o unità)', unit: '', min: 0.001, max: 1000, step: 0.001, value: 1 },
    { key: 'r0', label: 'Distanza iniziale r₀', unit: '', min: 0.05, max: 100, step: 0.01, value: 1, refit: true },
    { key: 'k', label: 'Velocità iniziale (in v circolari)', unit: '', min: 0, max: 3, step: 0.01, value: 1, refit: true },
    { key: 'phi', label: 'Angolo tra v₀ e il raggio', unit: '°', min: 0, max: 180, step: 1, value: 90, refit: true },
    { key: 'tMax', label: 'Durata della simulazione', unit: '', min: 1, max: 2000, step: 1, value: 20 },
    { key: 'showAreas', type: 'toggle', label: 'Aree in tempi uguali (II legge)', value: true, live: true },
    { key: 'showConic', type: 'toggle', label: 'Orbita prevista', value: true, live: true },
    { key: 'show3d', type: 'toggle', label: 'Vista 3D: il momento angolare', value: false, live: true },
  ],

  presets: [
    { label: 'Terra', values: { scale: 'solar', M: 1, mp: 1, r0: 1, k: 1, phi: 90 } },
    { label: 'Marte', values: { scale: 'solar', M: 1, mp: 0.107, r0: 1.52, k: 1, phi: 90 } },
    { label: 'Giove', values: { scale: 'solar', M: 1, mp: 318, r0: 5.2, k: 1, phi: 90 } },
    { label: 'Mercurio (ellittica)', values: { scale: 'solar', M: 1, mp: 0.055, r0: 0.31, k: 1.095, phi: 90 } },
    { label: 'Una cometa', values: { scale: 'solar', M: 1, mp: 0.001, r0: 0.6, k: 1.38, phi: 90, tMax: 200 } },
    { label: 'Ellisse (unità semplici)', values: { scale: 'simple', M: 1, mp: 0.001, r0: 1, k: 0.75, phi: 90 } },
    { label: 'Parabola: velocità di fuga', values: { scale: 'simple', M: 1, mp: 0.001, r0: 1, k: 1.41, phi: 90 } },
    { label: 'Iperbole', values: { scale: 'simple', M: 1, mp: 0.001, r0: 1, k: 1.7, phi: 90 } },
    { label: 'Lancio obliquo', values: { scale: 'simple', M: 1, mp: 0.001, r0: 1, k: 0.9, phi: 60 } },
  ],

  view(p) {
    const e = el0(p), ra = e.bound ? e.a * (1 + e.e) : 3 * p.r0, R = Math.max(ra, p.r0) * 1.2;
    if (!e.bound) return { xmin: -R, xmax: R, ymin: -R, ymax: R };
    // L'ellisse ha il centro in −a·e lungo la direzione del perielio: la vista la segue.
    const cx = -e.a * e.ex, cy = -e.a * e.ey, b = e.a * Math.sqrt(Math.max(0, 1 - e.e * e.e)), w = Math.max(e.a, b) * 1.25;
    return { xmin: cx - w, xmax: cx + w, ymin: cy - w, ymax: cy + w };
  },

  init(p) {
    const q = init0(p);
    return { t: 0, ...q, path: [[q.x, q.y]], cuts: [0], next: dtWedge(p), hit: false, tEnd: p.tMax };
  },

  step(s, dt, p) {
    const m = mu(p), acc = (x, y) => { const r3 = Math.hypot(x, y) ** 3; return [-m * x / r3, -m * y / r3]; };
    let left = dt;
    while (left > 1e-12 && !s.hit) {
      // Passo adattivo: piccolo vicino alla massa centrale (dove la velocità è massima).
      const r = Math.hypot(s.x, s.y), h = Math.min(left, 0.004 * Math.sqrt(r * r * r / m));
      const f = ([x, y, vx, vy]) => { const [ax, ay] = acc(x, y); return [vx, vy, ax, ay]; };
      const k1 = f([s.x, s.y, s.vx, s.vy]);
      const k2 = f([s.x + h / 2 * k1[0], s.y + h / 2 * k1[1], s.vx + h / 2 * k1[2], s.vy + h / 2 * k1[3]]);
      const k3 = f([s.x + h / 2 * k2[0], s.y + h / 2 * k2[1], s.vx + h / 2 * k2[2], s.vy + h / 2 * k2[3]]);
      const k4 = f([s.x + h * k3[0], s.y + h * k3[1], s.vx + h * k3[2], s.vy + h * k3[3]]);
      s.x += h / 6 * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0]); s.y += h / 6 * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1]);
      s.vx += h / 6 * (k1[2] + 2 * k2[2] + 2 * k3[2] + k4[2]); s.vy += h / 6 * (k1[3] + 2 * k2[3] + 2 * k3[3] + k4[3]);
      s.t += h; left -= h;
      const last = s.path[s.path.length - 1];
      if (Math.hypot(s.x - last[0], s.y - last[1]) > 0.004 * p.r0 || s.t >= s.next) s.path.push([s.x, s.y]);
      if (s.t >= s.next) { s.cuts.push(s.path.length - 1); s.next += dtWedge(p); }
      if (Math.hypot(s.x, s.y) < rStar(p)) s.hit = true;
    }
  },

  done: s => s.hit || s.t >= s.tEnd,

  sample(s, p) {
    const r = Math.hypot(s.x, s.y), v = Math.hypot(s.vx, s.vy), m = mu(p);
    return { t: s.t, r, v, K: 0.5 * v * v, U: -m / r, E: 0.5 * v * v - m / r, h: s.x * s.vy - s.y * s.vx };
  },

  graphs: [
    { title: 'Distanza dal Sole', series: [{ key: 'r', label: 'r', color: 'vel' }] },
    { title: 'Velocità', series: [{ key: 'v', label: 'v', color: 'vel' }] },
    { title: 'Energia (per unità di massa)', series: [{ key: 'K', label: 'K', color: 'vel' }, { key: 'U', label: 'U', color: 'normal' }, { key: 'E', label: 'E', color: 'friction' }] },
    { title: 'Momento angolare (per unità di massa)', series: [{ key: 'h', label: 'L/m', color: 'friction' }] },
  ],

  handles(s, p) {
    if (!CAM) return [];
    const q = init0(p), v = Math.hypot(q.vx, q.vy), L = Math.max(arrowPx(p.k, 3, VA), VA.min) / SC;
    const ux = v > 1e-9 ? q.vx / v : Math.cos(p.phi * deg), uy = v > 1e-9 ? q.vy / v : Math.sin(p.phi * deg);
    const [px, py] = CAM.p(q.x, q.y, 0), [tx, ty] = CAM.p(q.x + ux * L, q.y + uy * L, 0);
    return [{ id: 'r0', x: px, y: py }, { id: 'v0', x: tx, y: ty }];
  },

  drag(id, sx, sy, p) {
    // Dal punto sullo schermo al piano dell'orbita (z = 0), anche a camera girata.
    const [wx, wy] = CAM ? CAM.unproject(sx, sy, 0) : [sx, sy];
    if (id === 'r0') p.r0 = clamp(Math.round(Math.max(0.05, wx) * 100) / 100, 0.05, 100);
    if (id === 'v0') {
      const dx = wx - p.r0, dy = wy;
      p.k = clamp(Math.round(arrowMag(Math.hypot(dx, dy) * SC, 3, VA) * 100) / 100, 0, 3);
      if (Math.hypot(dx, dy) * SC > 8) p.phi = clamp(Math.round(Math.atan2(dy, dx) / deg), 0, 180);
    }
  },

  // Il pianeta per il diagramma di corpo libero: la sola forza di gravità, diretta verso il Sole.
  bodies(s, p, { scale, size }) {
    if (!CAM) return [];
    const m = mu(p), r = Math.hypot(s.x, s.y), g = m / (r * r), [X, Y] = CAM.p(s.x, s.y, 0), [SX, SY] = CAM.p(0, 0, 0);
    return [{ key: 'sun', title: 'la stella', x: SX, y: SY, rPx: sunPx(p) * size('sun'), m: p.M, color: 'acc' },
      { key: 'planet', title: 'il pianeta', x: X, y: Y, wx: s.x, wy: s.y, z: 0, proj: (a, b, c) => CAM.p(a, b, c),
      rPx: Math.max(9, planetPx(p) * size('planet')), m: 1, color: 'vel', v: [s.vx, s.vy], a: [-g * s.x / r, -g * s.y / r],
      forces: [{ name: 'F_g', fx: -g * s.x / r, fy: -g * s.y / r, color: 'weight' }],
      note: '\\text{forza per unità di massa del pianeta: } F_g = G M m / r^2' }];
  },

  mount() { stage.reset(); },
  drawBackground: background3d('orbits', { labels: false }),   // le distanze sono in UA o in unità semplici
  orbit(dx, dy, p) { return orbit3d('orbits', p.show3d, dx, dy); },

  draw(P, s, p, ui) {
    const S = stage.begin(P, ui), M = S.M, sc = P.cam.scale, ctx = P.ctx;
    if (!ui.snapshot) SC = sc;
    const V = camera3d(S, 'orbits', p.show3d, -60 * deg, -30 * deg, { up: 'z' }), tilt = V.tilt();
    if (!ui.snapshot) CAM = V;
    const pr = (x, y, z = 0) => V.p(x, y, z), line = (pts, o) => P.line(pts.map(q => pr(q[0], q[1], q[2] ?? 0)), o);
    const e0 = el0(p), ext = (e0.bound ? e0.a * (1 + e0.e) : 3 * p.r0) * 1.3;
    space3d(P, V, { origin: [0, 0, 0], up: 'z', step: niceGrid(ext) });   // griglia a perdita d'occhio, fissa nel mondo

    // Orbita prevista (conica) con il secondo fuoco e l'asse maggiore.
    if (p.showConic) {
      const g = S.grow('conic', 1);
      for (const seg of conicPts(e0, ext * 1.5)) {
        const pts = seg.slice(0, Math.max(2, Math.round(seg.length * g)));
        if (m3.is3dActive()) m3.line(pts.map(([x, y]) => [x, y, 0]), { color: 'muted', dashed: true, alpha: 0.75 });
        else line(pts, { color: 'muted', width: 1.3, dash: [5, 6], alpha: 0.75 });
      }
      if (e0.bound && e0.e > 0.02) {
        const rp = e0.a * (1 - e0.e), ra = e0.a * (1 + e0.e), ux = Math.cos(e0.w), uy = Math.sin(e0.w);
        line([[rp * ux, rp * uy], [-ra * ux, -ra * uy]], { color: 'muted', width: 1, dash: [2, 5], alpha: 0.5 * g });
        const [fx, fy] = pr(-2 * e0.a * e0.e * ux, -2 * e0.a * e0.e * uy);
        P.circle(fx, fy, 3, { fill: 'muted', alpha: g });
        if (tilt < 0.05 && g > 0.95) {
          const [mx, my] = P.S(...pr(-e0.a * e0.e * ux, -e0.a * e0.e * uy));
          tex(P, mx, my - 14, symVal(P, 'a', uq(scaleOf(p).L, e0.a)), { size: 15, color: M.text, halo: M.bg, alpha: 0.85 });
        }
      }
    }

    // Seconda legge: spicchi in tempi uguali, colori alternati; sull'ultimo completo il valore dell'area.
    if (p.showAreas && s.cuts.length > 1) {
      // Solo l'ultimo giro: dopo molte rivoluzioni gli spicchi sovrapposti diventerebbero colore pieno.
      const cuts = s.cuts.slice(-(NW + 1)), first = s.cuts.length - cuts.length;
      const cols = first % 2 ? [M.vec.acc, M.vec.vel] : [M.vec.vel, M.vec.acc];
      if (m3.is3dActive()) {
        for (let i = 0; i + 1 < cuts.length; i++) {
          const i0 = cuts[i], i1 = cuts[i + 1];
          const pts = [[0, 0, 0]];
          for (let k = i0; k <= i1; k++) pts.push([s.path[k][0], s.path[k][1], 0]);
          m3.plane(pts, { color: cols[i % cols.length], alpha: 0.26 });
        }
      } else {
        wedges(P, s.path, cuts, { colors: cols, alpha: 0.26, proj: pr });
      }
      if (tilt < 0.05) {
        const n = s.cuts.length - 1, i0 = s.cuts[n - 1], i1 = s.cuts[n], A = sectorArea(s.path, i0, i1);
        const mid = s.path[Math.floor((i0 + i1) / 2)], [a, b] = P.S(...pr(mid[0] * 0.62, mid[1] * 0.62));
        tex(P, a, b, symVal(P, 'A', uq(scaleOf(p).L + '²', A, 3)), { size: 14, color: M.text, halo: M.bg, alpha: 0.9 });
      }
    }

    // Scia del pianeta.
    if (m3.is3dActive()) {
      m3.tube(s.path.map(([x, y]) => [x, y, 0]), { color: 'vel', widthPx: 2.2, alpha: 0.85, fadeTail: true });
    } else {
      line(s.path, { color: 'vel', width: 2, alpha: 0.75 });
    }

    // Sole e pianeta.
    if (m3.is3dActive()) {
      m3.sphere([0, 0, 0], sunPx(p) * (ui.size?.('sun') ?? 1) / sc, { color: M.dark ? '#FFD84A' : '#d4a514', mesh: false, glow: true, emissive: 0.7 });
      m3.sphere([s.x, s.y, 0], planetPx(p) * (ui.size?.('planet') ?? 1) / sc, { color: 'vel', mesh: true, alpha: S.born('planet') });
    } else {
      const [ox, oy] = pr(0, 0);
      star(P, ox, oy, sunPx(p) * (ui.size?.('sun') ?? 1));
      const [X, Y] = pr(s.x, s.y);
      planet(P, X, Y, planetPx(p) * (ui.size?.('planet') ?? 1), 'blue', { alpha: S.born('planet') });
    }

    // Velocità del pianeta (scala compressa) e, a simulazione ferma, le maniglie.
    const v = Math.hypot(s.vx, s.vy), vc = vCirc(p);
    if (v > 1e-9) {
      const L = arrowPx(v / vc, 3, VA) / sc;
      if (m3.is3dActive()) {
        const end = [s.x + s.vx / v * L, s.y + s.vy / v * L, 0];
        V.arrow(P, [s.x, s.y, 0], end, { color: 'vel', key: 'v', width: 3, label: 'v' });
      } else {
        const [X, Y] = pr(s.x, s.y), [tx, ty] = pr(s.x + s.vx / v * L, s.y + s.vy / v * L);
        P.arrow(X, Y, tx, ty, { color: 'vel', key: 'v', width: 3, label: 'v' });
      }
    }

    // Vista 3D: il momento angolare, perpendicolare al piano dell'orbita e costante.
    if (tilt > 0.02) {
      const h = s.x * s.vy - s.y * s.vx, Lz = Math.sign(h) * 0.55 * ext * tilt;
      if (m3.is3dActive()) {
        m3.arrow([0, 0, 0], [0, 0, Lz], { color: 'friction', widthPx: 3.4 });
        const [la, lb] = V.S(P, 0, 0, Lz);
        tex(P, la + 18, lb, '\\vec L', { size: 18, color: M.vec.friction, halo: M.bg, alpha: tilt });
      } else {
        const [a0, b0] = pr(0, 0, 0), [a1, b1] = pr(0, 0, Lz);
        P.arrow(a0, b0, a1, b1, { color: 'friction', key: 'L', width: 3.4 });
        const [la, lb] = P.S(a1, b1);
        tex(P, la + 18, lb, '\\vec L', { size: 18, color: M.vec.friction, halo: M.bg, alpha: tilt });
      }
      axes3d(P, V, { origin: [0, 0, 0], lx: ext * 0.9, ly: ext * 0.9, lz: ext * 0.7 });
    }

    if (s.t === 0) for (const hd of this.handles(s, p)) P.handle(hd.x, hd.y, ui.active === hd.id);
    void ctx;
  },

  formulas(s, p) {
    const sc = scaleOf(p), m = mu(p), e = el0(p), r = Math.hypot(s.x, s.y), v = Math.hypot(s.vx, s.vy), L = sc.L, T = sc.T;
    const vu = `${L}/${T === 'anni' ? 'anno' : T}`;
    const kind = !e.bound ? (Math.abs(e.e - 1) < 0.01 ? 'parabola' : 'iperbole') : e.e < 0.01 ? 'circonferenza' : 'ellisse';
    const n = s.cuts.length - 1, A = n >= 1 ? sectorArea(s.path, s.cuts[n - 1], s.cuts[n]) : null;
    return [
      { h: 'Gravitazione universale' },
      { tex: `F=\\dfrac{G M m}{r^2}\\qquad G=${p.scale === 'solar' ? '4\\pi^2\\ \\mathrm{UA^3/(anni^2\\,M_\\odot)}' : '1'}` },
      { h: `Orbita: ${kind}` },
      { tex: `v_0=${tn(p.k, 2)}\\,v_c=${uq(vu, p.k * vCirc(p))}\\qquad v_c=\\sqrt{\\dfrac{GM}{r_0}}\\qquad v_f=\\sqrt2\\,v_c` },
      { key: true, tex: `${C('friction', 'E')}=\\tfrac12 ${C('vel', 'v')}^2-\\dfrac{GM}{r}=${tn(e.E, 3)}\\ \\Rightarrow\\ \\text{${e.bound ? 'orbita chiusa (E < 0)' : 'orbita aperta (E ≥ 0)'}}` },
      { tex: `e=${tn(e.e, 3)}` + (e.bound ? `\\qquad a=${uq(L, e.a, 3)}` : '') },
      e.bound && { tex: `r_{\\min}=${uq(L, e.a * (1 - e.e), 3)}\\qquad r_{\\max}=${uq(L, e.a * (1 + e.e), 3)}` },
      { h: 'Leggi di Keplero' },
      e.bound && { key: true, tex: `${C('vel', 'T')}=2\\pi\\sqrt{\\dfrac{a^3}{GM}}=${uq(T, e.T, 3)}` + (p.scale === 'solar' && Math.abs(p.M - 1) < 1e-9 ? `\\qquad ${C('vel', 'T')}^2=a^3` : '') },
      { tex: `\\dfrac{\\Delta A}{\\Delta t}=\\dfrac{L}{2m}=${tn(Math.abs(e.h) / 2, 3)}\\ \\ \\text{costante}` },
      A != null && { tex: `\\text{ultimo spicchio: } A=${uq(L + '²', A, 3)}\\ \\ \\text{in } \\Delta t=${uq(T, dtWedge(p), 3)}` },
      { h: s.hit ? 'Il pianeta è caduto sul Sole' : 'Istante attuale' },
      { tex: `t=${uq(T, s.t)}\\qquad r=${uq(L, r, 3)}\\qquad v=${uq(vu, v, 2)}` },
      s.hit && { tex: `\\text{con poca velocità tangenziale il pianeta precipita}`, cls: 'warn' },
    ].filter(Boolean);
  },

  theory: `
<h2>Orbite e leggi di Keplero</h2>
<p>Un pianeta attorno al Sole è attratto dalla forza di gravità di Newton, diretta verso il Sole e proporzionale all'inverso del quadrato della distanza:</p>
$$F = \\frac{G M m}{r^2}$$
<p>Con questa sola forza, la traiettoria è sempre una <b>conica</b> con il Sole in un fuoco: una circonferenza, un'ellisse, una parabola o un'iperbole. Quale, lo decide l'energia.</p>

<h3>Energia e forma dell'orbita</h3>
$$E = \\tfrac12 m v^2 - \\frac{G M m}{r}$$
<ul>
  <li>$E < 0$: il pianeta è <b>legato</b>, l'orbita è un'ellisse (una circonferenza se $v = v_c = \\sqrt{GM/r}$);</li>
  <li>$E = 0$: parabola, alla <b>velocità di fuga</b> $v_f = \\sqrt{2 G M / r} = \\sqrt2\\,v_c$;</li>
  <li>$E > 0$: iperbole, il corpo se ne va per sempre.</li>
</ul>

<h3>Le tre leggi di Keplero</h3>
<ol>
  <li>I pianeti descrivono <b>ellissi</b> di cui il Sole occupa uno dei fuochi.</li>
  <li>Il raggio vettore spazza <b>aree uguali in tempi uguali</b>: vicino al Sole il pianeta corre, lontano rallenta. Gli spicchi colorati sono presi a intervalli di tempo uguali e hanno tutti la stessa area.</li>
  <li>Il quadrato del periodo è proporzionale al cubo del semiasse maggiore: $T^2 = \\dfrac{4\\pi^2}{G M}\\,a^3$. In anni e unità astronomiche, attorno al Sole, $T^2 = a^3$.</li>
</ol>

<h3>Perché aree uguali: il momento angolare</h3>
<p>La gravità punta sempre verso il Sole: il suo momento rispetto al Sole è nullo, quindi il momento angolare $\\vec L = \\vec r \\times m\\vec v$ si conserva. L'area spazzata in un tempo $\\Delta t$ è $\\Delta A = \\frac{L}{2m}\\Delta t$: costante. Accendi «Vista 3D»: $\\vec L$ è perpendicolare al piano dell'orbita e non cambia mai, né in lunghezza né in direzione. Per questo l'orbita resta in un piano.</p>

<h3>Prova con la simulazione</h3>
<ol>
  <li>Con «Terra», verifica che il periodo sia un anno. Con «Marte», verifica che $T^2 = a^3$.</li>
  <li>Con «Una cometa», guarda come cambiano forma e velocità degli spicchi vicino e lontano dal Sole.</li>
  <li>Porta la velocità a $\\sqrt2\\,v_c \\approx 1{,}41\\,v_c$: che succede?</li>
  <li>Inclina la velocità iniziale (angolo minore di 90°): dove finisce il perielio?</li>
</ol>

<h3>Esercizi</h3>
<details><summary>1. Un asteroide ha un semiasse maggiore di 2,77 UA. Qual è il suo periodo?</summary>
<p>$T = \\sqrt{2{,}77^3} \\approx 4{,}61$ anni.</p></details>
<details><summary>2. La velocità orbitale della Terra è circa 30 km/s. Quale velocità servirebbe per sfuggire al Sole partendo dall'orbita terrestre?</summary>
<p>$v_f = \\sqrt2 \\cdot 30 \\approx 42$ km/s.</p></details>
<details><summary>3. Una cometa passa al perielio a 0,6 UA e all'afelio a 35 UA. Quanto vale il suo periodo?</summary>
<p>$a = (0{,}6 + 35)/2 = 17{,}8$ UA; $T = \\sqrt{17{,}8^3} \\approx 75$ anni (come la cometa di Halley).</p></details>
`,
};

// Passo dei quadretti della stanza 3D: circa otto quadretti sul raggio dell'orbita.
function niceGrid(ext) {
  const raw = ext / 4, p = 10 ** Math.floor(Math.log10(raw)), m = raw / p;
  return (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * p;
}
