import { deg, tn, clamp } from '../core/math.js';
import { ball, palette } from '../core/shapes.js';
import { tex, texBox } from '../core/manim.js';
import { Stage, angleMark, rate01, C } from '../core/annot.js';

const stage = new Stage();   // regia: frecce che crescono, passaggio morbido tra i punti di vista, corpi che nascono

const Y_HAND = 2;     // treno: quota del punto di lancio (m)
const Y_DECK = 1;     // treno: quota del pianale (m)
const CAR = 6;        // treno: semilunghezza del carro pianale (m)
const T_FREE = 20;    // fiume: durata massima se la barca non punta verso l'altra riva
const KV_TRAIN = 0.2; // treno: metri di disegno per (m/s)

// Lunghezza della barca in px: della scala dei vettori, così il triangolo delle velocità resta leggibile.
const boatLen = (p, scale) => Math.max(p.L * 0.065 * scale, 28);
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

/* ---------------- Ambientazioni essenziali ---------------- */
// Alla 3Blue1Brown: forme piatte, contorni sottili, veli appena accennati. Le ambientazioni fanno da sfondo;
// in primo piano restano il corpo, le traiettorie e i vettori.

// Fiume: un velo d'acqua tra le due rive (linee) e poche increspature tenui, ferme rispetto all'acqua (S′).
function riverFlat(P, L, phase) {
  const b = P.cam.bounds(), dark = P.M.dark, col = palette().waterEdge;
  P.poly([[b.x0, 0], [b.x1, 0], [b.x1, L], [b.x0, L]], { fill: col, alpha: dark ? 0.08 : 0.1 });
  P.line([[b.x0, 0], [b.x1, 0]], { color: col, width: 1.5, alpha: 0.7 });
  P.line([[b.x0, L], [b.x1, L]], { color: col, width: 1.5, alpha: 0.7 });
  const dx = Math.max(L * 0.55, 150 / P.cam.scale), w = Math.min(L * 0.06, 22 / P.cam.scale), a = w * 0.25;
  for (const [i, yy] of [[0, L * 0.3], [1, L * 0.7]]) {
    const sh = phase + i * dx / 2;
    for (let u = Math.floor((b.x0 - sh) / dx) * dx; u <= b.x1 - sh + dx; u += dx) {
      const x = u + sh, pts = [];
      for (let j = 0; j <= 12; j++) { const t = j / 12; pts.push([x - w + 2 * w * t, yy + a * Math.sin(t * 2 * Math.PI)]); }
      P.line(pts, { color: col, width: 1.2, alpha: dark ? 0.3 : 0.4 });
    }
  }
}

// Barca vista dall'alto come forma piatta: scafo con la prua a punta e il bordo acceso. len in px.
function boatFlat(P, x, y, angle, len) {
  const pal = palette(), ctx = P.ctx, [a, b] = P.S(x, y), k = len / 3;
  ctx.save();
  ctx.translate(a, b); ctx.rotate(-angle); ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(-1.5 * k, -0.5 * k); ctx.lineTo(0.2 * k, -0.55 * k);
  ctx.quadraticCurveTo(1.1 * k, -0.45 * k, 1.5 * k, 0);
  ctx.quadraticCurveTo(1.1 * k, 0.45 * k, 0.2 * k, 0.55 * k);
  ctx.lineTo(-1.5 * k, 0.5 * k); ctx.closePath();
  ctx.fillStyle = pal.red; ctx.fill();
  ctx.strokeStyle = pal.redEdge; ctx.lineWidth = 1.5; ctx.stroke();
  ctx.restore();
}

// Suolo del treno: una linea netta con tacche rade e tenui, ferme in S (si vedono scorrere da S′).
function trackFlat(P, offset) {
  const b = P.cam.bounds(), step = 2;
  P.line([[b.x0, 0], [b.x1, 0]], { color: 'muted', width: 1.5, alpha: 0.8 });
  for (let u = Math.floor((b.x0 - offset) / step) * step; u <= b.x1 - offset; u += step) {
    const x = u + offset;
    P.line([[x, 0], [x - 0.25, -0.3]], { color: 'muted', width: 1, alpha: 0.35 });
  }
}

// Carro pianale come forma piatta: cassone velato con il bordo acceso e quattro ruote a contorno.
// rot fa girare un raggio di ogni ruota, così si vede che rotola.
function flatcarFlat(P, cx, len, deck, rot) {
  const pal = palette(), r = 0.32;
  const box = [[cx - len / 2, deck - 0.36], [cx + len / 2, deck - 0.36], [cx + len / 2, deck], [cx - len / 2, deck]];
  P.poly(box, { fill: pal.blue, alpha: 0.5 });
  P.poly(box, { stroke: pal.blueEdge, width: 1.5 });
  for (const s of [-1, 1]) for (const d of [-0.5, 0.5]) {
    const wx = cx + s * len * 0.35 + d, rp = r * P.cam.scale;
    P.circle(wx, r, rp, { fill: P.M.bg, stroke: pal.metalEdge, width: 1.5 });
    P.line([[wx, r], [wx + r * Math.cos(rot), r + r * Math.sin(rot)]], { color: pal.metalEdge, width: 1.2, alpha: 0.7 });
  }
}

// Persona stilizzata (linee sottili) con i piedi in (x, y); il braccio arriva alla mano in hand.
function personFlat(P, x, y, hand) {
  const o = { color: 'muted', width: 2.2, alpha: 0.9 }, hip = y + 0.85, sh = y + 1.38;
  P.line([[x - 0.14, y], [x, hip], [x + 0.14, y]], o);
  P.line([[x, hip], [x, sh + 0.05]], o);
  P.line([[x, sh], hand], o);
  const [a, b] = P.S(x, y + 1.6), rp = Math.max(0.17 * P.cam.scale, 5);
  P.ctx.save(); P.ctx.globalAlpha = 0.9; P.ctx.strokeStyle = P.col('muted'); P.ctx.lineWidth = 2.2;
  P.ctx.beginPath(); P.ctx.arc(a, b, rp, 0, 2 * Math.PI); P.ctx.stroke(); P.ctx.restore();
}

// Etichette dei vettori, tutte alla stessa distanza dalla punta (dal bordo della maniglia, se la freccia ne ha una)
// e mai sovrapposte: se una scritta tocca una già posata, o un ostacolo (maniglia, corpo), scivola di lato,
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
  // Ostacolo in coordinate mondo, semilato in px (maniglie, corpo, scritte fisse).
  put.blockS = (a, b, rx, ry = rx) => placed.push({ x: a, y: b, hw: rx, hh: ry });
  put.block = (wx, wy, rx, ry = rx) => { const [a, b] = P.S(wx, wy); put.blockS(a, b, rx, ry); };
  // Etichetta del lato di un triangolo di vettori: a metà lato, all'esterno del triangolo (lontano da g, in px).
  put.side = (x0, y0, x1, y1, g, src, color, key, { delay = 0 } = {}) => {
    if (S.snap) return;
    const la = rate01(S.grow('arr:' + key, 0.6, delay));
    const [a, b] = P.S(x0, y0), [c, d] = P.S(x1, y1), L = Math.hypot(c - a, d - b);
    if (la <= 0.01 || L <= 18) return;
    const mx = (a + c) / 2, my = (b + d) / 2;
    let nx = -(d - b) / L, ny = (c - a) / L;
    if (nx * (mx - g[0]) + ny * (my - g[1]) < 0) { nx = -nx; ny = -ny; }
    const B = texBox(P, src, 17), hw = B.w / 2 + 2, hh = (B.bot - B.top) / 2 + 1;
    const dd = LABEL_GAP + Math.abs(nx) * hw + Math.abs(ny) * hh;
    let x = mx + nx * dd, y = my + ny * dd;
    search: if (hits(x, y, hw, hh)) {
      for (let k = 1; k <= 4; k++) for (const sg of [1, -1]) {
        const qx = x + nx * k * 10 + (c - a) / L * sg * k * 6, qy = y + ny * k * 10 + (d - b) / L * sg * k * 6;
        if (!hits(qx, qy, hw, hh)) { x = qx; y = qy; break search; }
      }
    }
    placed.push({ x, y, hw, hh });
    tex(P, x, y, src, { size: 17, color: P.col(color), halo: S.M.bg, alpha: la });
  };
  return put;
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
    const rPx = p.scene === 'river' ? boatLen(p, scale) * k / 2 : Math.max(0.13 * scale, 10) * k;
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
    const kv = kvOf(p), sc = P.cam.scale;

    if (river) {
      // Velo d'acqua tra due rive; le increspature sono ferme in S′, quindi scorrono con la corrente.
      riverFlat(P, p.L, s.X - off);
    } else {
      // Suolo con tacche ferme in S; carro pianale e persona fermi in S′.
      trackFlat(P, -off);
      const cx = s.X - off;
      flatcarFlat(P, cx, 2 * CAR, Y_DECK, -s.X / 0.32);
      personFlat(P, cx - 0.45, Y_DECK, [cx, Y_HAND]);
    }

    // Origini dei due sistemi di riferimento: assi sottili e tenui (sono riferimenti, non vettori).
    const ax = river ? p.L * 0.08 : 1.2, oy = river ? 0 : Y_DECK;
    const axis = { width: 1.5, head: 8, alpha: 0.7 };
    const [sx0] = inS([0, 0]);
    P.arrow(sx0, 0, sx0 + ax, 0, { color: 'text', key: 'Sx', ...axis });
    P.arrow(sx0, 0, sx0, ax, { color: 'text', key: 'Sy', ...axis });
    P.text(sx0, 0, 'S', { color: 'muted', dx: -17, dy: 14 });
    const [px0] = inP([0, 0]);
    P.arrow(px0, oy, px0 + ax, oy, { color: 'applied', key: 'Spx', ...axis });
    P.arrow(px0, oy, px0, oy + ax, { color: 'applied', key: 'Spy', ...axis });
    // S′ accanto alla punta del suo asse x (sopra), dove non incontra né l'asse y, né il corpo, né v′.
    const [sa, sb] = P.S(px0 + ax, oy);
    P.textS(sa + 6, sb - 12, 'S′', { color: 'applied' });

    // Traiettorie: quella vista da S e quella «disegnata» su S′, che si muove con lui.
    const tS = s.trailS.map(inS), tP = s.trailP.map(inP);
    const showS = p.view !== 'Sp', showP = p.view !== 'S';
    P.line(tS, { color: 'vel', width: showS ? 2.5 : 1.5, alpha: showS ? 0.75 : 0.45, dash: showS ? null : [5, 5] });
    P.line(tP, { color: 'applied', width: showP ? 2.5 : 1.5, alpha: showP ? 0.75 : 0.45, dash: showP ? null : [5, 5] });

    // Corpo sotto i vettori: la barca con la prua orientata come v′ (dove punta), non come v.
    const [bx, by] = inS([s.x, s.y]);
    let bodyR;
    if (river) {
      const k = ui.size('body') * S.born('boat'), len = boatLen(p, sc) * k;
      boatFlat(P, bx, by, Math.atan2(s.vpy, s.vpx), len);
      bodyR = len * 0.3;
    } else {
      const k = ui.size('body') * S.born('ball');
      ball(P, bx, by, { r: 0.13 * k, color: 'red', minPx: 10 * k, spin: s.t * 6 });
      bodyR = Math.max(0.13 * sc, 5) * k;
    }

    const lab = labeler(S, P);
    lab.blockS(sa + 14, sb - 12, 12, 11);
    // Velocità di trascinamento V di S′, sotto la sua origine (sotto la riva o sotto il suolo).
    const yV = river ? -ax * 0.5 : -0.6;
    if (Math.abs(s.VX) > 1e-9) {
      P.arrow(px0, yV, px0 + kv * s.VX, yV, { color: 'friction', key: 'Vframe', width: 3 });
      lab(px0, yV, px0 + kv * s.VX, yV, '\\vec V', 'friction', 'Vframe');
    }

    // Vettore v′ iniziale trascinabile, con l'angolo φ.
    const [x0, y0] = start(p), m = model(p), hx = x0 + kv * m.vpx, hy = y0 + kv * m.vpy;
    lab.block(hx, hy, 13);
    if (s.t === 0) {
      lab.block(x0, y0, bodyR + 2);
      P.arrow(x0, y0, hx, hy, { color: 'applied', key: 'vp0', width: 3.5 });
      if (Math.abs(p.phi) > 0.5 && p.vp > 0) {
        // Arco oltre il corpo; l'ampiezza vive nel pannello (e nel cursore): sulla scena basta il nome.
        const rArc = Math.max(28, bodyR + 10);
        angleMark(P, x0, y0, rArc, 0, p.phi * deg, '\\varphi', { color: M.muted, alpha: 0.85, grow: S.grow('phi', 0.7) });
        const mid = p.phi * deg / 2, [ca, cb] = P.S(x0, y0), B = texBox(P, '\\varphi', 16);
        const R = rArc + 12 + Math.abs(Math.cos(mid)) * B.w / 2 + Math.abs(Math.sin(mid)) * (B.bot - B.top) / 2;
        lab.blockS(ca + Math.cos(mid) * R, cb - Math.sin(mid) * R, B.w / 2 + 2, (B.bot - B.top) / 2 + 1);
      }
      lab(x0, y0, hx, hy, "\\vec v'", 'applied', 'vp0', { clear: 13 });
    }
    P.handle(hx, hy, ui.active === 'vp');

    // Composizione delle velocità v = v′ + V: nomi dei vettori sulla scena, valori nel pannello.
    if (s.t > 0) {
      const vp = [kv * s.vpx, kv * s.vpy], V = [kv * s.VX, 0], v = [kv * s.vx, kv * s.vy];
      lab.block(bx, by, bodyR + 2);
      if (p.showTri) {
        // Triangolo delle velocità: i tre lati crescono uno dopo l'altro; ogni nome sta a metà del suo lato, all'esterno.
        P.arrow(bx, by, bx + vp[0], by + vp[1], { color: 'applied', key: 'vp', width: 3.5 });
        P.arrow(bx + vp[0], by + vp[1], bx + v[0], by + v[1], { color: 'friction', key: 'V', width: 3, dash: [6, 4], delay: 0.35 });
        P.arrow(bx, by, bx + v[0], by + v[1], { color: 'vel', key: 'v', width: 4, delay: 0.7 });
        const [g0, g1] = P.S(bx + (vp[0] + v[0]) / 3, by + (vp[1] + v[1]) / 3);
        lab.side(bx, by, bx + v[0], by + v[1], [g0, g1], '\\vec v', 'vel', 'v', { delay: 0.7 });
        lab.side(bx, by, bx + vp[0], by + vp[1], [g0, g1], "\\vec v'", 'applied', 'vp');
        lab.side(bx + vp[0], by + vp[1], bx + v[0], by + v[1], [g0, g1], '\\vec V', 'friction', 'V', { delay: 0.35 });
      } else {
        if (showS) { P.arrow(bx, by, bx + v[0], by + v[1], { color: 'vel', key: 'v', width: 4 }); lab(bx, by, bx + v[0], by + v[1], '\\vec v', 'vel', 'v'); }
        if (showP) { P.arrow(bx, by, bx + vp[0], by + vp[1], { color: 'applied', key: 'vp', width: 3.5 }); lab(bx, by, bx + vp[0], by + vp[1], "\\vec v'", 'applied', 'vp'); }
      }
      // Forza apparente per unità di massa, se S′ accelera.
      if (showP && Math.abs(p.A) > 1e-9) {
        P.arrow(bx, by, bx - kv * p.A * 1.5, by, { color: 'acc', key: 'A', width: 3 });
        lab(bx, by, bx - kv * p.A * 1.5, by, '-\\vec A\\ \\mathrm{(apparente)}', 'acc', 'A');
      }
    }
  },

  formulas(s, p) {
    const m = model(p), river = p.scene === 'river', u = x => `\\ \\mathrm{${x}}`;
    const sgn = x => (x < 0 ? '-' : '+'), abs = Math.abs;
    // Stessi colori della scena: v (in S) azzurra, v′ (in S′) rosa, V e A di S′.
    const Vs = x => C('vel', x), Vp = x => C('applied', x), VV = x => C('friction', x);
    const out = [
      { h: 'Composizione galileiana' },
      { key: true, tex: `${Vs('\\vec v')}=${Vp("\\vec{v}'")}+${VV('\\vec V')}\\qquad \\vec a=\\vec{a}'+${C('acc', '\\vec A')}` },
      { tex: `${Vp("v'_x")}=${tn(s.vpx)}\\quad ${Vp("v'_y")}=${tn(s.vpy)}\\quad ${VV('V')}=${tn(s.VX)}${u('m/s')}` },
      { key: true, tex: `${Vs('v_x')}=${Vp("v'_x")}+${VV('V')}=${tn(s.vx)}\\quad ${Vs('v_y')}=${tn(s.vy)}\\quad |${Vs('\\vec v')}|=${tn(Math.hypot(s.vx, s.vy))}${u('m/s')}` },
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
