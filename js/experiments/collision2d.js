import { rk4, tn, clamp } from '../core/math.js';
import { ballM, tex } from '../core/manim.js';
import { trail } from '../core/look.js';
import { uq } from '../core/units.js';
import { Stage, C, arrowPx, arrowMag, angleMark, symVal, degTeX } from '../core/annot.js';
import { contact, slowmo, momentumRows, kBars, panelBg } from '../core/collide.js';

const stage = new Stage();
const V = { min: 34, max: 120 };
const TC = 0.06, TRAIL_DT = 1 / 60;
let SC = 50;

const radius = m => 0.3 * Math.cbrt(m);
const VREF = 6;                               // m/s che danno la freccia più lunga
const deg = Math.PI / 180;
// Velocità iniziali in componenti, dai parametri (modulo e direzione in gradi).
const vel0 = p => [p.v1 * Math.cos(p.a1 * deg), p.v1 * Math.sin(p.a1 * deg), p.v2 * Math.cos(p.a2 * deg), p.v2 * Math.sin(p.a2 * deg)];
// Punta della freccia di una velocità iniziale (anche a velocità nulla resta a una distanza minima, per afferrarla).
const tipOf = (x, y, v, a) => { const L = Math.max(arrowPx(v, VREF, V), V.min) / SC; return [x + Math.cos(a * deg) * L, y + Math.sin(a * deg) * L]; };
const BOX = { x: 5, y: 3 };                    // dove si possono posare i dischi

function overlapOf(s, p) {
  const dx = s.x2 - s.x1, dy = s.y2 - s.y1, d = Math.hypot(dx, dy) || 1e-9;
  return { d: radius(p.m1) + radius(p.m2) - d, nx: dx / d, ny: dy / d };
}
function force(s, p) {
  const { d, nx, ny } = overlapOf(s, p);
  if (d <= 0) return 0;
  const { k, c } = contact(p.m1, p.m2, p.e);
  return k * d + c * ((s.vx1 - s.vx2) * nx + (s.vy1 - s.vy2) * ny);
}

export default {
  id: 'collision2d',
  title: 'Urti nel piano',
  subtitle: 'Due dischi su un tavolo senza attrito',
  dt: 1 / 2000,

  params: [
    { key: 'm1', label: 'Massa del disco 1  m₁', unit: 'kg', min: 0.2, max: 10, step: 0.1, value: 1 },
    { key: 'm2', label: 'Massa del disco 2  m₂', unit: 'kg', min: 0.2, max: 10, step: 0.1, value: 1 },
    { key: 'v1', label: 'Velocità del disco 1  v₁', unit: 'm/s', min: 0, max: 6, step: 0.1, value: 2.5 },
    { key: 'a1', label: 'Direzione di v₁', unit: '°', min: -180, max: 180, step: 1, value: 0 },
    { key: 'v2', label: 'Velocità del disco 2  v₂', unit: 'm/s', min: 0, max: 6, step: 0.1, value: 0 },
    { key: 'a2', label: 'Direzione di v₂', unit: '°', min: -180, max: 180, step: 1, value: 180 },
    { key: 'x1', label: 'Disco 1 x', unit: 'm', min: -5, max: 5, step: 0.05, value: -4, hidden: true },
    { key: 'y1', label: 'Disco 1 y', unit: 'm', min: -3, max: 3, step: 0.05, value: 0, hidden: true },
    { key: 'x2', label: 'Disco 2 x', unit: 'm', min: -5, max: 5, step: 0.05, value: 0, hidden: true },
    { key: 'y2', label: 'Disco 2 y', unit: 'm', min: -3, max: 3, step: 0.05, value: 0.3, hidden: true },
    { key: 'e', label: 'Coefficiente di restituzione e', unit: '', min: 0, max: 1, step: 0.01, value: 1 },
    { key: 'tMax', label: 'Durata della simulazione', unit: 's', min: 2, max: 30, step: 1, value: 5 },
    { key: 'slowmo', type: 'toggle', label: 'Rallentatore all\'urto', value: true, live: true },
    { key: 'showBal', type: 'toggle', label: 'Bilancio di p e K', value: true, live: true },
    { key: 'showForce', type: 'toggle', label: 'Forze durante l\'urto', value: true, live: true },
  ],

  presets: [
    { label: 'Biliardo: masse uguali', values: { m1: 1, m2: 1, v1: 2.5, a1: 0, v2: 0, a2: 180, x1: -4, y1: 0, x2: 0, y2: 0.3, e: 1 } },
    { label: 'Urto centrale', values: { m1: 1, m2: 1, v1: 2.5, a1: 0, v2: 0, a2: 180, x1: -4, y1: 0, x2: 0, y2: 0, e: 1 } },
    { label: 'Contro un disco pesante', values: { m1: 1, m2: 6, v1: 2.5, a1: 0, v2: 0, a2: 180, x1: -4, y1: 0, x2: 0, y2: 0.4, e: 1 } },
    { label: 'Uno contro l\'altro', values: { m1: 1, m2: 1, v1: 2, a1: 0, v2: 2, a2: 180, x1: -3, y1: 0, x2: 3, y2: 0.25, e: 1 } },
    { label: 'Incrocio ad angolo retto', values: { m1: 1, m2: 2, v1: 2, a1: 0, v2: 1.5, a2: 90, x1: -3.5, y1: 0, x2: 0.3, y2: -2.4, e: 0.6 } },
  ],

  view() { return { xmin: -5.5, xmax: 5.5, ymin: -3.2, ymax: 3.6 }; },

  init(p) {
    const [vx1, vy1, vx2, vy2] = vel0(p);
    return { t: 0, x1: p.x1, y1: p.y1, vx1, vy1, x2: p.x2, y2: p.y2, vx2, vy2,
      tc0: null, cp: null, tr1: [[p.x1, p.y1]], tr2: [[p.x2, p.y2]], tEnd: p.tMax };
  },

  step(s, dt, p) {
    const { k, c } = contact(p.m1, p.m2, p.e), R = radius(p.m1) + radius(p.m2);
    const f = ([x1, y1, vx1, vy1, x2, y2, vx2, vy2]) => {
      const dx = x2 - x1, dy = y2 - y1, dd = Math.hypot(dx, dy) || 1e-9, d = R - dd;
      let F = 0, nx = 0, ny = 0;
      if (d > 0) { nx = dx / dd; ny = dy / dd; F = k * d + c * ((vx1 - vx2) * nx + (vy1 - vy2) * ny); }
      return [vx1, vy1, -F * nx / p.m1, -F * ny / p.m1, vx2, vy2, F * nx / p.m2, F * ny / p.m2];
    };
    const y = rk4([s.x1, s.y1, s.vx1, s.vy1, s.x2, s.y2, s.vx2, s.vy2], dt, f);
    [s.x1, s.y1, s.vx1, s.vy1, s.x2, s.y2, s.vx2, s.vy2] = y;
    s.t += dt;
    if (s.tc0 == null && overlapOf(s, p).d > 0) {
      s.tc0 = s.t;
      const r1 = radius(p.m1), { nx, ny } = overlapOf(s, p);
      s.cp = [s.x1 + nx * r1, s.y1 + ny * r1];   // punto di contatto
    }
    const l1 = s.tr1[s.tr1.length - 1];
    if (Math.hypot(s.x1 - l1[0], s.y1 - l1[1]) > 0.04) s.tr1.push([s.x1, s.y1]);
    const l2 = s.tr2[s.tr2.length - 1];
    if (Math.hypot(s.x2 - l2[0], s.y2 - l2[1]) > 0.04) s.tr2.push([s.x2, s.y2]);
  },

  done: s => s.t >= s.tEnd,

  timeScale(s, p) {
    if (!p.slowmo) return 1;
    const inC = s.tc0 != null && s.t - s.tc0 < 1.5 * TC;
    let ttc = Infinity;
    if (s.tc0 == null) {
      // Tempo al contatto lungo la traiettoria rettilinea del disco 1.
      const R = radius(p.m1) + radius(p.m2), rx = s.x1 - s.x2, ry = s.y1 - s.y2, vx = s.vx1 - s.vx2, vy = s.vy1 - s.vy2;
      const a = vx * vx + vy * vy, bq = 2 * (rx * vx + ry * vy), cq = rx * rx + ry * ry - R * R, D = bq * bq - 4 * a * cq;
      if (a > 1e-12 && D >= 0) { const t = (-bq - Math.sqrt(D)) / (2 * a); if (t >= 0) ttc = t; }
    }
    const since = s.tc0 != null && !inC ? s.t - s.tc0 - 1.5 * TC : Infinity;
    return slowmo(inC, ttc, since);
  },

  sample(s, p) {
    const px = p.m1 * s.vx1 + p.m2 * s.vx2, py = p.m1 * s.vy1 + p.m2 * s.vy2;
    const K1 = 0.5 * p.m1 * (s.vx1 ** 2 + s.vy1 ** 2), K2 = 0.5 * p.m2 * (s.vx2 ** 2 + s.vy2 ** 2);
    return { t: s.t, v1: Math.hypot(s.vx1, s.vy1), v2: Math.hypot(s.vx2, s.vy2), px, py, K1, K2, K: K1 + K2, F: force(s, p) };
  },

  graphs: [
    { title: 'Velocità', series: [{ key: 'v1', label: '|v₁| (m/s)', color: 'vel' }, { key: 'v2', label: '|v₂| (m/s)', color: 'weight' }] },
    { title: 'Quantità di moto totale', series: [{ key: 'px', label: 'Px (kg·m/s)', color: 'friction' }, { key: 'py', label: 'Py (kg·m/s)', color: 'normal' }] },
    { title: 'Energia cinetica', series: [{ key: 'K1', label: 'K₁ (J)', color: 'vel' }, { key: 'K2', label: 'K₂ (J)', color: 'weight' }, { key: 'K', label: 'K totale (J)', color: 'friction' }] },
    { title: 'Forza di contatto', series: [{ key: 'F', label: 'F (N)', color: 'applied' }] },
  ],

  // Si trascinano i dischi (posizione) e le punte delle frecce (modulo e direzione della velocità).
  handles(s, p) {
    const [t1x, t1y] = tipOf(p.x1, p.y1, p.v1, p.a1), [t2x, t2y] = tipOf(p.x2, p.y2, p.v2, p.a2);
    return [
      { id: 'v1', x: t1x, y: t1y }, { id: 'v2', x: t2x, y: t2y },
      { id: 'p1', x: p.x1, y: p.y1 }, { id: 'p2', x: p.x2, y: p.y2 },
    ];
  },

  drag(id, wx, wy, p) {
    const i = id[1], x = p['x' + i], y = p['y' + i];
    if (id[0] === 'v') {
      const dx = wx - x, dy = wy - y;
      p['v' + i] = clamp(Math.round(arrowMag(Math.hypot(dx, dy) * SC, VREF, V) * 10) / 10, 0, 6);
      if (Math.hypot(dx, dy) * SC > 8) p['a' + i] = Math.round(Math.atan2(dy, dx) / deg);
      return;
    }
    // Posizione: dentro il tavolo e mai sovrapposto all'altro disco (se lo tocca, scivola attorno a lui).
    let nx = clamp(Math.round(wx * 20) / 20, -BOX.x, BOX.x), ny = clamp(Math.round(wy * 20) / 20, -BOX.y, BOX.y);
    const j = i === '1' ? '2' : '1', ox = p['x' + j], oy = p['y' + j], R = radius(p.m1) + radius(p.m2) + 0.02;
    const d = Math.hypot(nx - ox, ny - oy);
    if (d < R) { const ux = d > 1e-6 ? (nx - ox) / d : 1, uy = d > 1e-6 ? (ny - oy) / d : 0; nx = ox + ux * R; ny = oy + uy * R; }
    p['x' + i] = nx; p['y' + i] = ny;
  },

  // I dischi per il diagramma di corpo libero, visti dall'alto: nel piano agisce solo la forza di contatto.
  bodies(s, p, { scale }) {
    const F = force(s, p), { nx, ny } = overlapOf(s, p);
    return [[1, s.x1, s.y1, s.vx1, s.vy1, p.m1, -1, 'vel'], [2, s.x2, s.y2, s.vx2, s.vy2, p.m2, 1, 'weight']].map(([i, x, y, vx, vy, m, sg, col]) => {
      const forces = F > 1e-6 ? [{ name: i === 1 ? 'F_{21}' : 'F_{12}', fx: sg * F * nx, fy: sg * F * ny, color: 'applied' }] : [];
      return { key: 'd' + i, title: `\\text{il disco ${i}}`, x, y, rPx: radius(m) * scale, m, forces,
        a: [sg * F * nx / m, sg * F * ny / m], v: [vx, vy], color: col, noResize: true,
        note: '\\text{peso e reazione del tavolo sono perpendicolari al piano e si annullano}' };
    });
  },

  mount() { stage.reset(); },

  draw(P, s, p, ui) {
    const S = stage.begin(P, ui), M = S.M, sc = P.cam.scale;
    if (!ui.snapshot) SC = sc;
    const fresh = s.t === 0, c1 = M.body.blue, c2 = M.body.red, r1 = radius(p.m1), r2 = radius(p.m2);

    // A simulazione ferma: la linea di volo di ogni disco che si muove, per prendere la mira.
    if (fresh) for (const [x, y, v, a, col] of [[p.x1, p.y1, p.v1, p.a1, c1], [p.x2, p.y2, p.v2, p.a2, c2]]) {
      if (v < 1e-3) continue;
      P.line([[x, y], [x + Math.cos(a * deg) * 14, y + Math.sin(a * deg) * 14]], { color: col, width: 1, dash: [4, 6], alpha: 0.4 });
    }

    trail(P, s.tr1, c1, 2);
    trail(P, s.tr2, c2, 2);

    ballM(P, M, s.x1, s.y1, { r: r1, color: 'blue', grow: S.born('d1') });
    ballM(P, M, s.x2, s.y2, { r: r2, color: 'red', grow: S.born('d2') });

    // Velocità (scala compressa in px).
    const ref = VREF;
    for (const [i, x, y, vx, vy, col] of [[1, s.x1, s.y1, s.vx1, s.vy1, c1], [2, s.x2, s.y2, s.vx2, s.vy2, c2]]) {
      const v = Math.hypot(vx, vy);
      if (v < 1e-3) continue;
      const L = arrowPx(v, ref, V) / sc;
      P.arrow(x, y, x + vx / v * L, y + vy / v * L, { color: col, key: 'v' + i, width: 3.5, label: `v_${i}` });
    }

    // Forze di contatto lungo la congiungente dei centri.
    const F = force(s, p);
    if (p.showForce && F > 1e-6 && ui.sel !== 'd1' && ui.sel !== 'd2') {
      const { k } = contact(p.m1, p.m2, p.e), mu = p.m1 * p.m2 / (p.m1 + p.m2), Fpk = Math.sqrt(k * mu) * p.v1;
      const { nx, ny } = overlapOf(s, p), L = arrowPx(F, Fpk, { min: 30, max: 90 }) / sc;
      const cx = s.x1 + nx * r1, cy = s.y1 + ny * r1;
      P.arrow(cx, cy, cx + nx * L, cy + ny * L, { color: 'applied', key: 'F12', width: 3, label: 'F_{12}' });
      P.arrow(cx, cy, cx - nx * L, cy - ny * L, { color: 'applied', key: 'F21', width: 3, label: 'F_{21}' });
    }

    // Dopo l'urto: le direzioni delle due velocità uscenti dal punto di contatto e l'angolo tra loro.
    if (s.cp && s.t - s.tc0 > 1.5 * TC) {
      const a1 = Math.atan2(s.vy1, s.vx1), a2 = Math.atan2(s.vy2, s.vx2);
      const v1 = Math.hypot(s.vx1, s.vy1), v2 = Math.hypot(s.vx2, s.vy2), g = S.grow('after', 0.8);
      if (v1 > 0.02 && v2 > 0.02) {
        const Lr = 1.4;
        P.line([s.cp, [s.cp[0] + Math.cos(a1) * Lr, s.cp[1] + Math.sin(a1) * Lr]], { color: c1, width: 1.2, dash: [4, 4], alpha: 0.7 * g });
        P.line([s.cp, [s.cp[0] + Math.cos(a2) * Lr, s.cp[1] + Math.sin(a2) * Lr]], { color: c2, width: 1.2, dash: [4, 4], alpha: 0.7 * g });
        let d = a1 - a2;
        while (d > Math.PI) d -= 2 * Math.PI;
        while (d < -Math.PI) d += 2 * Math.PI;
        const [lo, hi] = d > 0 ? [a2, a2 + d] : [a1, a1 - d];
        angleMark(P, s.cp[0], s.cp[1], 30, lo, hi, symVal(P, '\\theta', degTeX(Math.abs(d))), { color: M.text, grow: g, alpha: 0.9 });
      }
    }

    // Bilancio in alto a sinistra: p coda-punta (prima e ora, affiancati) e barre di K.
    if (p.showBal) {
      const pad = P.cam.padFn?.() ?? { top: 70, left: 20 }, g = S.grow('bal', 0.7);
      // Ogni riga ha la sua cella di 170 px: le frecce coda-punta, lunghe in tutto al più 88 px, ci stanno sempre.
      const [u1x, u1y, u2x, u2y] = vel0(p);
      const pmax = Math.max(p.m1 * p.v1 + p.m2 * p.v2, 1e-6), ks = 88 / pmax;
      const x0 = pad.left + 30, y0 = pad.top + 104;
      panelBg(P, x0 - 18, y0 - 98, 480, 196, g);
      const row = (label, v1x, v1y, v2x, v2y, ox) => ({ label, origin: [ox, y0], labelAt: [ox + 20, y0 + 84], titleAt: [x0, y0 - 80],
        vecs: [{ x: p.m1 * v1x * ks, y: p.m1 * v1y * ks, color: c1 }, { x: p.m2 * v2x * ks, y: p.m2 * v2y * ks, color: c2 }] });
      momentumRows(P, [row('\\text{prima}', u1x, u1y, u2x, u2y, x0 + 75), row('\\text{ora}', s.vx1, s.vy1, s.vx2, s.vy2, x0 + 245)], { title: '\\vec p_1+\\vec p_2', alpha: g });
      const K10 = 0.5 * p.m1 * p.v1 ** 2, K20 = 0.5 * p.m2 * p.v2 ** 2, { d } = overlapOf(s, p), { k } = contact(p.m1, p.m2, p.e);
      kBars(P, [
        { label: '\\text{prima}', parts: [{ v: K10, color: c1 }, { v: K20, color: c2 }] },
        { label: '\\text{ora}', parts: [{ v: 0.5 * p.m1 * (s.vx1 ** 2 + s.vy1 ** 2), color: c1 }, { v: 0.5 * p.m2 * (s.vx2 ** 2 + s.vy2 ** 2), color: c2 }, { v: d > 0 && p.e > 0.001 ? 0.5 * k * d * d : 0, color: M.vec.spring }] },
      ], K10 + K20, { x: x0 + 375, yBase: y0 + 62, h: 120, w: 16, gap: 20, alpha: g });
    }

    const ts = this.timeScale(s, p);
    if (ts < 0.97 && ui.api?.running) {
      const pad = P.cam.padFn?.() ?? { top: 70 };
      tex(P, P.cam.w / 2, pad.top + 20, '\\text{rallentatore}', { size: 16, color: M.muted, halo: M.bg, alpha: Math.min(1, (1 - ts) * 1.4) });
    }

    if (fresh) for (const h of this.handles(s, p)) P.handle(h.x, h.y, ui.active === h.id);
  },

  formulas(s, p) {
    const [u1x, u1y, u2x, u2y] = vel0(p);
    const P0x = p.m1 * u1x + p.m2 * u2x, P0y = p.m1 * u1y + p.m2 * u2y, px = p.m1 * s.vx1 + p.m2 * s.vx2, py = p.m1 * s.vy1 + p.m2 * s.vy2;
    // Parametro d'urto: distanza tra il centro del disco 2 e la retta su cui si muove il disco 1 rispetto al 2.
    const rx = p.x2 - p.x1, ry = p.y2 - p.y1, wx = u1x - u2x, wy = u1y - u2y, wv = Math.hypot(wx, wy);
    const b = wv > 1e-9 ? Math.abs(rx * wy - ry * wx) / wv : null, closing = wv > 1e-9 && rx * wx + ry * wy > 0;
    const K0 = 0.5 * p.m1 * p.v1 ** 2 + 0.5 * p.m2 * p.v2 ** 2, K = 0.5 * p.m1 * (s.vx1 ** 2 + s.vy1 ** 2) + 0.5 * p.m2 * (s.vx2 ** 2 + s.vy2 ** 2);
    const A = t => C('vel', t), B = t => C('weight', t);
    const after = s.tc0 != null && s.t - s.tc0 > 1.5 * TC;
    const th = after ? Math.abs(Math.atan2(s.vx1 * s.vy2 - s.vy1 * s.vx2, s.vx1 * s.vx2 + s.vy1 * s.vy2)) * 180 / Math.PI : null;
    const R = radius(p.m1) + radius(p.m2);
    return [
      { h: 'Conservazione della quantità di moto' },
      { key: true, tex: `${A('m_1\\vec v_1')}+${B('m_2\\vec v_2')}=${A("m_1\\vec v_1'")}+${B("m_2\\vec v_2'")}` },
      { tex: `P_x:\\ ${uq('kg·m/s', P0x)}\\to${uq('kg·m/s', px)}\\qquad P_y:\\ ${uq('kg·m/s', P0y)}\\to${uq('kg·m/s', py)}` },
      { h: 'Geometria dell\'urto' },
      b != null && { tex: `b=${uq('m', b)}\\qquad r_1+r_2=${uq('m', R)}` },
      (!closing || b >= R) && s.tc0 == null && { tex: `\\text{con queste velocità i dischi non si toccano}`, cls: 'warn' },
      { h: 'Energia cinetica' },
      { tex: `K_{\\text{prima}}=${uq('J', K0)}\\qquad K=${uq('J', K)}` },
      th != null && { h: 'Dopo l\'urto' },
      th != null && { key: true, tex: `\\theta=${tn(th, 1)}°\\qquad |${A("\\vec v_1'")}|=${uq('m/s', Math.hypot(s.vx1, s.vy1))}\\quad |${B("\\vec v_2'")}|=${uq('m/s', Math.hypot(s.vx2, s.vy2))}` },
      th != null && p.e >= 0.999 && Math.abs(p.m1 - p.m2) < 1e-9 && p.v2 === 0 && b > 1e-3 && { tex: `m_1=m_2,\\ \\text{urto elastico}:\\ \\theta=90°`, cls: 'warn' },
      { h: 'Istante attuale' },
      { tex: `t=${uq('s', s.t, 3)}` },
    ].filter(Boolean);
  },

  theory: `
<h2>Urti nel piano</h2>
<p>Un disco ne colpisce un altro fermo, su un tavolo senza attrito. Se l'urto non è centrale, i dischi ripartono in direzioni diverse. La distanza tra la linea di volo del disco 1 e il centro del disco 2 si chiama <b>parametro d'urto</b> $b$: con $b = 0$ l'urto è centrale (e torna unidimensionale), con $b \\ge r_1 + r_2$ i dischi non si toccano.</p>
<p>Sulla scena puoi <b>trascinare i dischi</b> per spostarli e la <b>punta delle frecce</b> per cambiare modulo e direzione delle velocità, anche quella del disco 2.</p>

<h3>La quantità di moto è un vettore</h3>
<p>Durante l'urto le forze tra i dischi sono uguali e opposte e dirette lungo la congiungente dei centri. Si conserva il <b>vettore</b> quantità di moto totale, cioè entrambe le componenti:</p>
$$m_1\\vec v_1 + m_2\\vec v_2 = m_1\\vec v_1' + m_2\\vec v_2'$$
$$P_x:\\ m_1 v_1 = m_1 v_{1x}' + m_2 v_{2x}' \\qquad P_y:\\ 0 = m_1 v_{1y}' + m_2 v_{2y}'$$
<p>Nel bilancio sulla scena le frecce $m_1\\vec v_1'$ e $m_2\\vec v_2'$ messe coda-punta chiudono sempre sulla stessa freccia tratteggiata: quella di prima dell'urto.</p>

<h3>Masse uguali, urto elastico: 90°</h3>
<p>Se le masse sono uguali e l'urto è elastico, dividendo per $m$:</p>
$$\\vec v_1 = \\vec v_1' + \\vec v_2' \\qquad v_1^2 = v_1'^2 + v_2'^2$$
<p>La seconda è il teorema di Pitagora applicato al triangolo della prima: i vettori $\\vec v_1'$ e $\\vec v_2'$ sono <b>perpendicolari</b>. I giocatori di biliardo lo sanno bene.</p>
<div class="box">La direzione in cui parte il disco colpito è sempre quella della congiungente dei centri nell'istante del contatto: è la direzione della forza che ha ricevuto.</div>

<h3>Urti anelastici</h3>
<p>Con $e < 1$ si perde energia cinetica e l'angolo tra le velocità finali è minore di 90°. La quantità di moto, invece, si conserva sempre.</p>

<h3>Prova con la simulazione</h3>
<ol>
  <li>Con masse uguali varia $b$: l'angolo $\\theta$ cambia? E le singole direzioni?</li>
  <li>Con $b = 0$ cosa succede? Confronta con gli urti in una dimensione.</li>
  <li>Contro un disco pesante, l'angolo è maggiore o minore di 90°?</li>
  <li>Abbassa $e$ e osserva le barre di $K$ e l'angolo.</li>
</ol>

<h3>Esercizi</h3>
<details><summary>1. Una palla da biliardo a 3 m/s urta elasticamente una ferma uguale e devia di 30°. Con che velocità ripartono?</summary>
<p>$v_1' = 3\\cos 30^\\circ \\approx 2{,}60$ m/s; $v_2' = 3\\sin 30^\\circ = 1{,}5$ m/s, a 60° dall'altra parte.</p></details>
<details><summary>2. Dopo un urto il disco 1 (1 kg) ha $\\vec v_1' = (1;\\ 1)$ m/s. Prima viaggiava a 3 m/s lungo $x$ e il disco 2 (2 kg) era fermo. Quanto vale $\\vec v_2'$?</summary>
<p>$P_x$: $3 = 1 + 2 v_{2x}' \\Rightarrow v_{2x}' = 1$ m/s; $P_y$: $0 = 1 + 2 v_{2y}' \\Rightarrow v_{2y}' = -0{,}5$ m/s.</p></details>
`,
};
