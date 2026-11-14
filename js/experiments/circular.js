import { deg, tn, clamp } from '../core/math.js';
import { ball, palette } from '../core/shapes.js';
import { tex, texBox } from '../core/manim.js';
import { Stage, brace, angleMark, rate01, C } from '../core/annot.js';

const stage = new Stage();   // regia: frecce che crescono, ambientazione che nasce dal centro, graffa del raggio
const num = (v, d = 2) => (v < 0 ? '−' : '') + Math.abs(v).toFixed(d).replace('.', ',');

const TWO_PI = 2 * Math.PI;
const T_ACCEL = 10;   // con accelerazione tangenziale non nulla la simulazione si ferma dopo 10 s
const T_REF = 8;      // istante di riferimento per la scala delle frecce

// Leggi orarie esatte del moto circolare uniformemente accelerato.
// Se la velocità e l'accelerazione tangenziale hanno segno opposto, il corpo frena e si ferma a tStop.
function kin(p) {
  const w0 = p.v0 / p.R, al = p.at / p.R, th0 = p.th0 * deg;
  const tStop = p.v0 * p.at < 0 ? -p.v0 / p.at : null;
  const tEnd = tStop ?? (p.at !== 0 ? T_ACCEL : Infinity);
  return { w0, al, th0, tStop, tEnd };
}

function at(p, k, t) {
  const te = Math.min(t, k.tEnd);
  const th = k.th0 + k.w0 * te + 0.5 * k.al * te * te;
  const w = k.w0 + k.al * te;
  return { th, w, v: w * p.R };
}

// Scale delle frecce (metri di disegno per unità fisica), fisse durante una corsa.
function scales(p, k) {
  const vRef = Math.max(Math.abs(p.v0), Math.abs(at(p, k, Math.min(k.tEnd, T_REF)).v), 0.5);
  const aRef = Math.max(vRef * vRef / p.R, Math.abs(p.at), 0.2);
  return { KV: 0.7 * p.R / vRef, KA: 0.6 * p.R / aRef, cap: 1.6 * p.R };
}

// Aspetto del corpo per ambientazione; k è la scala estetica scelta con la maniglia.
function bodyLook(p, k) {
  const R = p.R;
  if (p.scene === 'road') return { len: 4.2 * k, minPx: 30 * k, size: 4.2 * k };
  const [f, color, minPx] = p.scene === 'carousel' ? [0.07, 'blue', 12] : p.scene === 'wheel' ? [0.06, 'yellow', 9] : [0.05, 'red', 11];
  return { r: R * f * k, color, minPx: minPx * k, size: 2 * R * f * k };
}

// Ambientazioni essenziali alla 3Blue1Brown: solo contorni sottili e tenui, al più un velo appena accennato.
// Servono a riconoscere la situazione; la scena la fanno la traiettoria, il corpo e i vettori.
function ring(P, r, { color = 'muted', width = 1, alpha = 0.5, fill = null, fillAlpha = 0 } = {}) {
  const ctx = P.ctx, [a, b] = P.S(0, 0);
  if (r <= 0.5) return;
  ctx.save();
  ctx.beginPath(); ctx.arc(a, b, r, 0, TWO_PI);
  if (fill) { ctx.globalAlpha = fillAlpha; ctx.fillStyle = P.col(fill); ctx.fill(); }
  ctx.globalAlpha = alpha; ctx.strokeStyle = P.col(color); ctx.lineWidth = width; ctx.stroke();
  ctx.restore();
}

// Giostra: il bordo della piattaforma e un velo appena accennato.
function carouselFlat(P, Rpx) {
  ring(P, Rpx, { width: 1.2, alpha: 0.55, fill: 'text', fillAlpha: 0.035 });
}

// Strada: due bordi sottili della carreggiata attorno alla traiettoria (la mezzeria è la traiettoria stessa).
function roadFlat(P, Rpx, halfPx) {
  ring(P, Rpx + halfPx, { width: 1, alpha: 0.5 });
  if (Rpx - halfPx > 2) ring(P, Rpx - halfPx, { width: 1, alpha: 0.5 });
}

// Ruota: cerchione e pochi raggi sottili che girano con il corpo.
function wheelFlat(P, rpx, angle) {
  ring(P, rpx, { width: 1.5, alpha: 0.6 });
  ring(P, rpx * 0.88, { width: 1, alpha: 0.3 });
  const ctx = P.ctx, [a, b] = P.S(0, 0);
  ctx.save();
  ctx.globalAlpha = 0.3; ctx.strokeStyle = P.col('muted'); ctx.lineWidth = 1; ctx.lineCap = 'round';
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const t = angle + i * TWO_PI / 6;
    ctx.moveTo(a, b); ctx.lineTo(a + Math.cos(t) * rpx * 0.88, b - Math.sin(t) * rpx * 0.88);
  }
  ctx.stroke();
  ctx.restore();
}

// Auto vista dall'alto come forma piatta: carrozzeria con il bordo acceso e il parabrezza. Misure in px.
function carFlat(P, x, y, angle, lenPx) {
  const pal = palette(), ctx = P.ctx, [a, b] = P.S(x, y), L = lenPx, W = L * 0.43;
  ctx.save();
  ctx.translate(a, b); ctx.rotate(-angle);
  ctx.lineJoin = 'round';
  ctx.beginPath(); ctx.roundRect(-L / 2, -W / 2, L, W, W * 0.28);
  ctx.fillStyle = pal.red; ctx.fill();
  ctx.strokeStyle = pal.redEdge; ctx.lineWidth = 1.5; ctx.stroke();
  ctx.beginPath(); ctx.roundRect(L * 0.06, -W * 0.36, L * 0.16, W * 0.72, W * 0.1);
  ctx.fillStyle = pal.redEdge; ctx.globalAlpha = 0.55; ctx.fill();
  ctx.restore();
}

// Etichette dei vettori, tutte alla stessa distanza dalla punta (dal bordo della maniglia, se la freccia ne ha una)
// e mai sovrapposte: se una scritta tocca una già posata, o un ostacolo (maniglie, corpo), scivola di lato,
// perpendicolare alla sua freccia. Arriva sfumando alla fine della crescita della freccia, come in Stage.
const LABEL_GAP = 8;
function labeler(S, P) {
  const placed = [];
  const hits = (x, y, hw, hh) => placed.some(r => Math.abs(r.x - x) < r.hw + hw && Math.abs(r.y - y) < r.hh + hh);
  const put = (x0, y0, x1, y1, src, color, key, { clear = 0, delay = 0, alpha = 1 } = {}) => {
    if (S.snap) return;
    const la = alpha * rate01(S.grow('arr:' + key, 0.6, delay));
    const [a, b] = P.S(x0, y0), [c, d] = P.S(x1, y1), L = Math.hypot(c - a, d - b);
    if (la <= 0.01 || L <= 18) return;
    const ux = (c - a) / L, uy = (d - b) / L, B = texBox(P, src, 17), hw = B.w / 2 + 2, hh = (B.bot - B.top) / 2 + 1;
    const dd = clear + LABEL_GAP + Math.abs(ux) * hw + Math.abs(uy) * hh;
    let x = c + ux * dd, y = d + uy * dd;
    search: if (hits(x, y, hw, hh)) {
      // Primo posto libero più vicino: di lato alla freccia (da una parte o dall'altra) o un po' oltre la punta.
      for (let k = 1; k <= 5; k++) for (const [px, py] of [[-uy, ux], [uy, -ux], [ux, uy]]) {
        const qx = x + px * k * 9, qy = y + py * k * 9;
        if (!hits(qx, qy, hw, hh)) { x = qx; y = qy; break search; }
      }
    }
    placed.push({ x, y, hw, hh });
    tex(P, x, y, src, { size: 17, color: P.col(color), halo: S.M.bg, alpha: la });
  };
  // Ostacoli: in coordinate schermo (semilati in px) o in coordinate mondo (raggio in px: maniglie, corpo).
  put.blockS = (a, b, rx, ry = rx) => placed.push({ x: a, y: b, hw: rx, hh: ry });
  put.block = (wx, wy, r) => { const [a, b] = P.S(wx, wy); put.blockS(a, b, r); };
  return put;
}

function arrowTo(P, x, y, dx, dy, cap, opts) {
  const L = Math.hypot(dx, dy);
  const f = L > cap ? cap / L : 1;
  P.arrow(x, y, x + dx * f, y + dy * f, { ...opts, dash: f < 1 ? [7, 4] : opts.dash });
  return [x + dx * f, y + dy * f];
}

export default {
  id: 'circular',
  title: 'Moto circolare',
  subtitle: 'Uniforme e uniformemente accelerato',

  params: [
    { key: 'scene', type: 'select', label: 'Ambientazione', value: 'carousel', live: true,
      options: [{ label: 'Giostra', value: 'carousel' }, { label: 'Strada', value: 'road' }, { label: 'Ruota', value: 'wheel' }, { label: 'Punto', value: 'point' }] },
    { key: 'R', label: 'Raggio R', unit: 'm', min: 0.2, max: 60, step: 0.05, value: 4 },
    { key: 'v0', label: 'Velocità iniziale v₀', unit: 'm/s', min: -30, max: 30, step: 0.1, value: 3 },
    { key: 'at', label: 'Accelerazione tangenziale aₜ', unit: 'm/s²', min: -5, max: 10, step: 0.05, value: 0 },
    { key: 'th0', label: 'Angolo iniziale θ₀', unit: '°', min: 0, max: 360, step: 1, value: 0 },
    { key: 'showAcc', type: 'toggle', label: 'Vettori accelerazione', value: true, live: true },
    { key: 'showProj', type: 'toggle', label: 'Proiezioni su x e y', value: false, live: true },
    { key: 'strobe', type: 'toggle', label: 'Posizioni ogni 0,25 s', value: false, live: true },
  ],

  presets: [
    { label: 'Giostra', values: { scene: 'carousel', R: 4, v0: 3, at: 0, th0: 0 } },
    { label: 'Centrifuga che parte', values: { scene: 'wheel', R: 0.3, v0: 0, at: 2.4, th0: 0 } },
    { label: 'Auto in curva che accelera', values: { scene: 'road', R: 50, v0: 10, at: 2, th0: 270 } },
    { label: 'Ruota che frena', values: { scene: 'wheel', R: 0.35, v0: 7, at: -1.4, th0: 90 } },
  ],

  view(p) {
    const m = p.R * 1.45;
    return { xmin: -m, xmax: m, ymin: -m, ymax: m };
  },

  init(p) {
    const k = kin(p), c = at(p, k, 0);
    return { t: 0, tEnd: k.tEnd, th: c.th, w: c.w, v: c.v, stopped: false, strobe: [c.th] };
  },

  step(s, dt, p) {
    const k = kin(p);
    s.t = Math.min(s.t + dt, k.tEnd);
    Object.assign(s, at(p, k, s.t));
    s.stopped = k.tStop != null && s.t >= k.tStop;
    if (Math.floor(s.t / 0.25 + 1e-9) > s.strobe.length - 1) s.strobe.push(s.th);
  },

  done: s => s.stopped || s.t >= s.tEnd,

  sample(s, p) {
    const k = kin(p);
    return {
      t: s.t, th: s.th, w: s.w, v: s.v,
      x: p.R * Math.cos(s.th), y: p.R * Math.sin(s.th),
      ac: s.v * s.v / p.R, at: s.stopped ? 0 : p.at,
    };
  },

  graphs: [
    { title: 'Angolo', series: [{ key: 'th', label: 'θ (rad)', color: 'vel' }] },
    { title: 'Velocità angolare', series: [{ key: 'w', label: 'ω (rad/s)', color: 'vel' }] },
    { title: 'Proiezioni', series: [{ key: 'x', label: 'x = R cos θ (m)', color: 'vel' }, { key: 'y', label: 'y = R sin θ (m)', color: 'weight' }] },
    { title: 'Accelerazioni', series: [{ key: 'ac', label: 'a꜀ centripeta (m/s²)', color: 'acc' }, { key: 'at', label: 'aₜ tangenziale (m/s²)', color: 'friction' }] },
  ],

  resizables(s, p, { scale, size }) {
    const b = bodyLook(p, size('body'));
    return [{ key: 'body', x: p.R * Math.cos(s.th), y: p.R * Math.sin(s.th), rPx: Math.max(b.size * scale, b.minPx) / 2 }];
  },

  handles(s, p) {
    const k = kin(p), { KV } = scales(p, k);
    const c = Math.cos(k.th0), sn = Math.sin(k.th0);
    const bx = p.R * c, by = p.R * sn;
    return [
      { id: 'pos', x: bx, y: by },
      { id: 'v0', x: bx - sn * KV * p.v0, y: by + c * KV * p.v0 },
    ];
  },

  drag(id, wx, wy, p) {
    if (id === 'pos') {
      p.R = clamp(Math.round(Math.hypot(wx, wy) * 20) / 20, 0.2, 60);
      p.th0 = (Math.round(Math.atan2(wy, wx) / deg) + 360) % 360;
    }
    if (id === 'v0') {
      // Solo la componente tangenziale conta: proiettiamo lo spostamento sulla tangente in θ₀.
      const k = kin(p), { KV } = scales(p, k);
      const c = Math.cos(k.th0), sn = Math.sin(k.th0);
      const along = (wx - p.R * c) * -sn + (wy - p.R * sn) * c;
      p.v0 = clamp(Math.round(along / KV * 10) / 10, -30, 30);
    }
  },

  mount() { stage.reset(); },

  draw(P, s, p, ui) {
    const S = stage.begin(P, ui), M = S.M;
    // Il raggio mostrato insegue quello vero quando cambia da fermo; in corsa o trascinando segue subito.
    const [R] = S.smooth('R', [p.R], 0.12, !!ui.active || !!ui.api?.running);
    const q = { ...p, R }, k = kin(q), { KV, KA, cap } = scales(q, k);
    const x = R * Math.cos(s.th), y = R * Math.sin(s.th);
    const ux = Math.cos(s.th), uy = Math.sin(s.th);   // versore radiale
    const tx = -uy, ty = ux;                          // versore tangente (verso antiorario)

    // Ambientazione: ruota insieme al corpo (giostra, ruota) oppure resta ferma (strada).
    // Al cambio di ambientazione la nuova cresce dal centro (GrowFromCenter).
    const sc = P.cam.scale, Rpx = R * sc;
    const b = bodyLook(q, ui.size('body') * S.born('body'));
    const gs = S.grow('scene:' + p.scene, 0.7);
    if (gs > 0.01) {
      if (p.scene === 'carousel') carouselFlat(P, Rpx * 1.12 * gs);
      if (p.scene === 'road') roadFlat(P, Rpx * gs, Math.max(b.len * sc, b.minPx) * 0.43 * gs);
      if (p.scene === 'wheel') wheelFlat(P, Rpx / 0.94 * gs, s.th);
    }

    // Assi per il centro (tenui) e traiettoria.
    const ext = R * 1.3;
    P.line([[-ext, 0], [ext, 0]], { color: 'axis', width: 1, alpha: 0.35 });
    P.line([[0, -ext], [0, ext]], { color: 'axis', width: 1, alpha: 0.35 });
    P.text(ext, 0, 'x', { color: 'muted', dx: 10 });
    P.text(0, ext, 'y', { color: 'muted', dy: -12, align: 'center' });

    const circle = [];
    for (let i = 0; i <= 160; i++) circle.push([R * Math.cos(TWO_PI * i / 160), R * Math.sin(TWO_PI * i / 160)]);
    P.line(circle, { color: 'ideal', width: 1.2, dash: [5, 6], alpha: 0.6 });

    // Arco già percorso (al più un giro intero).
    const swept = s.th - k.th0;
    if (Math.abs(swept) >= TWO_PI) P.line(circle, { color: 'vel', width: 2.5, alpha: 0.5 });
    else if (Math.abs(swept) > 1e-4) {
      const n = Math.max(2, Math.ceil(Math.abs(swept) / 0.03)), pts = [];
      for (let i = 0; i <= n; i++) { const a = k.th0 + swept * i / n; pts.push([R * Math.cos(a), R * Math.sin(a)]); }
      P.line(pts, { color: 'vel', width: 2.5, alpha: 0.5 });
    }

    if (p.strobe) for (const a of s.strobe.slice(-48)) P.circle(R * Math.cos(a), R * Math.sin(a), 4, { fill: 'muted', alpha: 0.45 });

    // Raggio vettore e angolo θ (ridotto all'intervallo [0, 2π)): quote tenui.
    P.line([[0, 0], [x, y]], { color: 'muted', width: 1.2, alpha: 0.8 });
    const thm = ((s.th % TWO_PI) + TWO_PI) % TWO_PI;
    if (thm > 0.02) angleMark(P, 0, 0, 28, 0, thm, '\\theta', { color: M.muted, alpha: 0.85 });
    // Graffa del raggio sotto l'asse x.
    brace(P, [0, 0], [R, 0], `R = ${num(R)}\\ \\mathrm{m}`, { side: -1, gap: 9, grow: S.grow('braceR', 0.8), color: M.muted, alpha: 0.75 });
    P.circle(0, 0, 3, { fill: 'muted' });

    const lab = labeler(S, P);
    // Le scritte fisse (θ e la misura della graffa) fanno da ostacolo alle etichette dei vettori.
    {
      const [o0, o1] = P.S(0, 0), len = Rpx, w = Math.min(11, Math.max(5, len * 0.12));
      const Bb = texBox(P, `R = ${num(R)}\\ \\mathrm{m}`, 16), hb = (Bb.bot - Bb.top) / 2;
      lab.blockS(o0 + len / 2, o1 + 9 + w + 6 + hb, Bb.w / 2 + 2, hb + 1);
      if (thm > 0.02) {
        const Bt = texBox(P, '\\theta', 16), m = thm / 2, ht = (Bt.bot - Bt.top) / 2;
        const Rt = 28 + 12 + Math.abs(Math.cos(m)) * Bt.w / 2 + Math.abs(Math.sin(m)) * ht;
        lab.blockS(o0 + Math.cos(m) * Rt, o1 - Math.sin(m) * Rt, Bt.w / 2 + 2, ht + 1);
      }
    }
    // Proiezioni: il loro moto è armonico.
    if (p.showProj) {
      P.line([[x, y], [x, 0]], { color: 'vel', width: 1, dash: [3, 4], alpha: 0.7 });
      P.line([[x, y], [0, y]], { color: 'weight', width: 1, dash: [3, 4], alpha: 0.7 });
      P.circle(x, 0, 5, { fill: 'vel' });
      P.circle(0, y, 5, { fill: 'weight' });
      // Nomi delle proiezioni, salvo quando il piede coincide con il corpo (proiezione ovvia, scritta d'ingombro).
      const [px, py] = P.S(x, y), [qx, qy] = P.S(x, 0), [rx, ry] = P.S(0, y);
      if (Math.hypot(px - qx, py - qy) > 22) { P.text(x, 0, 'x(t)', { color: 'vel', size: 12.5, align: 'center', dy: 17 }); lab.blockS(qx, qy + 17, 16, 10); }
      if (Math.hypot(px - rx, py - ry) > 22) { P.text(0, y, 'y(t)', { color: 'weight', size: 12.5, align: 'right', dx: -12 }); lab.blockS(rx - 28, ry, 16, 10); }
    }

    // Maniglie della posizione iniziale e di v₀ (visibili a simulazione ferma all'inizio).
    if (s.t === 0) {
      const c = Math.cos(k.th0), sn = Math.sin(k.th0), bx = R * c, by = R * sn;
      const hx = bx - sn * KV * p.v0, hy = by + c * KV * p.v0;
      lab.block(bx, by, 13); lab.block(hx, hy, 13);
      if (Math.abs(p.v0) > 1e-9) {
        P.arrow(bx, by, hx, hy, { color: 'vel', key: 'v0', width: 4 });
        lab(bx, by, hx, hy, '\\vec v_0', 'vel', 'v0', { clear: 13 });
      }
      P.handle(hx, hy, ui.active === 'v0');
    }

    // Corpo e vettori istantanei.
    if (p.scene === 'road') {
      const dir = Math.sign(s.v || p.v0 || p.at || 1);
      carFlat(P, x, y, s.th + dir * Math.PI / 2, Math.max(b.len * sc, b.minPx));
    } else ball(P, x, y, { r: b.r, color: b.color, minPx: b.minPx });
    if (s.t === 0) P.handle(x, y, ui.active === 'pos');
    // Sulla scena solo i nomi dei vettori: i valori e le formule sono nel pannello.
    // Le etichette si posano dopo tutte le frecce, dalla più importante: v, poi a_c e a_t, infine a.
    const tips = [];
    if (s.t > 0 && Math.abs(s.v) > 1e-9) tips.push(['\\vec v', 'vel', 'v', arrowTo(P, x, y, tx * KV * s.v, ty * KV * s.v, cap, { color: 'vel', key: 'v', width: 4 })]);
    if (p.showAcc) {
      const ac = s.v * s.v / R, aT = s.stopped ? 0 : p.at;
      if (ac > 1e-9) tips.push(['\\vec a_c', 'acc', 'ac', arrowTo(P, x, y, -ux * KA * ac, -uy * KA * ac, cap, { color: 'acc', key: 'ac', width: 3.5 })]);
      if (Math.abs(aT) > 1e-9) {
        tips.push(['\\vec a_t', 'friction', 'at', arrowTo(P, x, y, tx * KA * aT, ty * KA * aT, cap, { color: 'friction', key: 'at', width: 3.5 })]);
        tips.push(['\\vec a', 'weight', 'a', arrowTo(P, x, y, (-ux * ac + tx * aT) * KA, (-uy * ac + ty * aT) * KA, cap, { color: 'weight', key: 'a', width: 2.5, dash: [5, 4], alpha: 0.85 })]);
      }
    }
    if (s.t > 0) lab.block(x, y, Math.max(b.size * sc, b.minPx) / 2 + 2);
    for (const [src, col, key, [ex, ey]] of tips) lab(x, y, ex, ey, src, col, key);
  },

  formulas(s, p) {
    const k = kin(p), u = x => `\\ \\mathrm{${x}}`;
    const v = Math.abs(s.v), w = Math.abs(s.w);
    const ac = s.v * s.v / p.R, aT = s.stopped ? 0 : p.at;
    const T = w > 1e-9 ? `${tn(TWO_PI / w)}${u('s')}` : '\\infty';
    const f = w / TWO_PI;
    const uniform = p.at === 0;
    const sgn = x => (x < 0 ? '-' : '+');
    // Stessi colori della scena: velocità, centripeta, tangenziale e accelerazione totale.
    const Vv = x => C('vel', x), Ac = C('acc', 'a_c'), At = C('friction', 'a_t');
    return [
      { h: 'Grandezze angolari' },
      { tex: `\\omega_0=\\dfrac{${Vv('v_0')}}{R}=${tn(k.w0, 3)}${u('rad/s')}` },
      !uniform && { tex: `\\alpha=\\dfrac{${At}}{R}=${tn(k.al, 3)}${u('rad/s^2')}` },
      { h: 'Leggi orarie' },
      { tex: uniform
        ? `\\theta(t)=${tn(k.th0, 3)}${sgn(k.w0)}${tn(Math.abs(k.w0), 3)}\\,t`
        : `\\theta(t)=${tn(k.th0, 3)}${sgn(k.w0)}${tn(Math.abs(k.w0), 3)}\\,t${sgn(k.al)}${tn(Math.abs(k.al) / 2, 4)}\\,t^2` },
      !uniform && { tex: `\\omega(t)=${tn(k.w0, 3)}${sgn(k.al)}${tn(Math.abs(k.al), 3)}\\,t` },
      { tex: `x=R\\cos\\theta\\qquad y=R\\sin\\theta` },
      { h: s.stopped ? 'All\'arresto' : 'Istante attuale' },
      { tex: `t=${tn(s.t)}${u('s')}\\qquad \\theta=${tn(s.th, 2)}${u('rad')}\\ \\ (${tn((s.th - k.th0) / TWO_PI, 2)}\\ \\text{giri})` },
      { key: true, tex: `${Vv('v')}=\\omega R=${tn(v)}${u('m/s')}\\qquad \\omega=${tn(w, 3)}${u('rad/s')}` },
      { tex: `T=\\dfrac{2\\pi}{\\omega}=${T}\\qquad f=\\dfrac1T=${tn(f, 3)}${u('Hz')}` },
      { h: 'Accelerazioni' },
      { key: true, tex: `${Ac}=\\dfrac{${Vv('v^2')}}{R}=\\omega^2R=${tn(ac)}${u('m/s^2')}` },
      !uniform && { tex: `${At}=\\alpha R=${tn(aT)}${u('m/s^2')}\\qquad |${C('weight', '\\vec a')}|=\\sqrt{${C('acc', 'a_c^2')}+${C('friction', 'a_t^2')}}=${tn(Math.hypot(ac, aT))}${u('m/s^2')}` },
      ac > 9.81 && { tex: `${Ac}\\approx${tn(ac / 9.81, 1)}\\,g`, cls: 'warn' },
      k.tStop != null && { tex: `t_{\\text{stop}}=-\\dfrac{\\omega_0}{\\alpha}=${tn(k.tStop)}${u('s')}\\qquad \\Delta\\theta=\\dfrac{\\omega_0^2}{2|\\alpha|}=${tn(k.w0 * k.w0 / (2 * Math.abs(k.al)), 2)}${u('rad')}` },
    ].filter(Boolean);
  },

  theory: `
<h2>Moto circolare</h2>
<p>Un punto si muove di moto circolare quando la sua traiettoria è una circonferenza di raggio $R$. Conviene descrivere la posizione con l'<b>angolo</b> $\\theta$ che il raggio forma con l'asse $x$, misurato in <b>radianti</b>. L'arco percorso è $s = R\\,\\theta$.</p>

<h3>Moto circolare uniforme</h3>
<p>Il modulo della velocità è costante. Il punto percorre archi uguali in tempi uguali, quindi:</p>
$$\\omega = \\frac{\\Delta\\theta}{\\Delta t} \\qquad v = \\omega R \\qquad T = \\frac{2\\pi}{\\omega} = \\frac{2\\pi R}{v} \\qquad f = \\frac1T$$
<p>La velocità è sempre <b>tangente</b> alla circonferenza. Anche se il suo modulo non cambia, la sua <b>direzione</b> cambia di continuo, quindi c'è un'accelerazione, diretta verso il centro:</p>
$$a_c = \\frac{v^2}{R} = \\omega^2 R$$
<div class="box">«Uniforme» non significa «senza accelerazione». L'accelerazione centripeta esiste perché il vettore $\\vec v$ ruota.</div>

<h3>Da dove viene $v^2/R$</h3>
<p>In un intervallo $\\Delta t$ il raggio ruota di $\\Delta\\theta = \\omega\\,\\Delta t$ e il vettore velocità ruota dello stesso angolo. Il triangolo formato da $\\vec v$, $\\vec{v}'$ e $\\Delta\\vec v$ è isoscele, e per angoli piccoli $|\\Delta\\vec v| \\approx v\\,\\Delta\\theta$. Dividendo per $\\Delta t$ si ottiene $a = v\\,\\omega = v^2/R$, con $\\Delta\\vec v$ che punta verso il centro.</p>

<h3>Moto circolare uniformemente accelerato</h3>
<p>Se il modulo della velocità cresce (o diminuisce) a ritmo costante, compare un'<b>accelerazione tangenziale</b> $a_t$ e un'accelerazione angolare $\\alpha = a_t / R$. Le leggi orarie hanno la stessa forma di quelle del moto rettilineo uniformemente accelerato:</p>
$$\\theta(t) = \\theta_0 + \\omega_0 t + \\tfrac12\\alpha t^2 \\qquad \\omega(t) = \\omega_0 + \\alpha t \\qquad \\omega^2 = \\omega_0^2 + 2\\alpha\\,\\Delta\\theta$$
<p>L'accelerazione totale ha due componenti perpendicolari: quella tangenziale, costante, e quella centripeta, che cresce con $v^2$:</p>
$$\\vec a = \\vec a_t + \\vec a_c \\qquad |\\vec a| = \\sqrt{a_t^2 + \\left(\\frac{v^2}{R}\\right)^2}$$

<h3>Legame con il moto armonico</h3>
<p>Le proiezioni del punto sugli assi si muovono avanti e indietro lungo un diametro:</p>
$$x(t) = R\\cos(\\omega t + \\theta_0) \\qquad y(t) = R\\sin(\\omega t + \\theta_0)$$
<p>È il <b>moto armonico</b>, lo stesso di una massa attaccata a una molla, che studieremo nel modulo sulle oscillazioni. Attiva «Proiezioni su x e y» e guarda il grafico <i>Proiezioni</i>: compaiono due sinusoidi sfasate di un quarto di periodo.</p>

<h3>Chi fornisce l'accelerazione centripeta?</h3>
<p>Per il secondo principio serve una forza risultante diretta verso il centro, $F_c = m v^2 / R$. Non è una forza nuova: è il ruolo che svolge una forza già presente, come la tensione di una fune, l'attrito tra pneumatici e asfalto, la reazione del cestello della centrifuga o la gravità per un satellite. Un'auto in curva su strada piana resta in traiettoria finché</p>
$$\\frac{m v^2}{R} \\le \\mu_s\\, m g \\quad\\Longrightarrow\\quad v_{\\max} = \\sqrt{\\mu_s g R}$$
<p>Nell'auto che accelera in curva l'attrito deve fornire sia $a_c$ sia $a_t$: per questo accelerare in curva fa slittare prima.</p>

<h3>Prova con la simulazione</h3>
<ol>
  <li>Nella «Giostra», raddoppia $v_0$: come cambiano $T$ e $a_c$? E se invece raddoppi $R$ lasciando uguale $v_0$?</li>
  <li>Trascina la freccia $v_0$ dalla parte opposta: cosa cambia nel grafico <i>Angolo</i>?</li>
  <li>Con «Centrifuga che parte» osserva come ruota il vettore $\\vec a$ totale: all'inizio è tangente, poi punta quasi verso il centro. Perché?</li>
  <li>Con «Ruota che frena» prevedi quanti giri compie prima di fermarsi, poi verifica.</li>
  <li>Con accelerazione nulla, il grafico <i>Angolo</i> è una retta. Che forma ha quando $a_t \\neq 0$?</li>
</ol>

<h3>Esercizi</h3>
<details><summary>1. Una giostra di raggio 4 m compie un giro in 8 s. Calcola $\\omega$, $v$ e $a_c$ di un bambino seduto sul bordo.</summary>
<p>$\\omega = 2\\pi/8 \\approx 0{,}785$ rad/s; $v = \\omega R \\approx 3{,}14$ m/s; $a_c = \\omega^2 R \\approx 2{,}47$ m/s².</p></details>
<details><summary>2. Il cestello di una lavatrice ($R = 0{,}25$ m) gira a 1200 giri/min. Quanto vale l'accelerazione centripeta, in multipli di $g$?</summary>
<p>$\\omega = 1200 \\cdot 2\\pi / 60 \\approx 125{,}7$ rad/s; $a_c = \\omega^2 R \\approx 3{,}95 \\cdot 10^3$ m/s² $\\approx 402\\,g$.</p></details>
<details><summary>3. Un'auto percorre una curva di raggio 50 m. Con $\\mu_s = 0{,}8$, qual è la velocità massima?</summary>
<p>$v_{\\max} = \\sqrt{\\mu_s g R} = \\sqrt{0{,}8 \\cdot 9{,}81 \\cdot 50} \\approx 19{,}8$ m/s $\\approx 71$ km/h.</p></details>
<details><summary>4. Una ruota gira a 20 rad/s e si ferma uniformemente in 5 s. Quanti giri compie durante la frenata?</summary>
<p>$\\alpha = -20/5 = -4$ rad/s²; $\\Delta\\theta = \\omega_0^2 / (2|\\alpha|) = 400/8 = 50$ rad $\\approx 7{,}96$ giri.</p></details>
`,
};
