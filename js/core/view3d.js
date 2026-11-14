// Un accenno di 3D alla Manim (ThreeDScene): la scena resta nel piano xy dello schermo, con z verso chi guarda;
// una camera ortografica ruota attorno all'asse verticale (yaw) e si inclina (pitch) per mostrare l'asse z,
// dove vivono i vettori "fuori dal piano" (momento di una forza, velocità angolare, momento angolare).
// Le coordinate proiettate sono coordinate mondo 2D, quindi si disegnano con il Painter di sempre.
import { palette, tex } from './manim.js';
import { niceStep } from './math.js';
import { drawGrid } from './render.js';

export class View3D {
  constructor() { this.pitch = 0; this.yaw = 0; }

  // Angoli in radianti. pitch > 0: camera sollevata che guarda in giù (z verso chi guarda scende sullo schermo);
  // pitch < 0: camera abbassata (z sale sullo schermo, come l'asse verticale di una piattaforma vista di sbieco).
  set(pitch, yaw) { this.pitch = pitch; this.yaw = yaw; this.cp = Math.cos(pitch); this.sp = Math.sin(pitch); this.cy = Math.cos(yaw); this.sy = Math.sin(yaw); return this; }

  // Quanto la camera è inclinata (0 = vista piana, 1 = vista 3D piena), per sfumare ciò che esiste solo in 3D.
  tilt(full = 0.5) { return Math.min(1, Math.hypot(this.pitch, this.yaw) / full); }

  p(x, y, z = 0) {
    const x1 = x * this.cy + z * this.sy, z1 = -x * this.sy + z * this.cy;
    // Camera sollevata (pitch > 0) che guarda in giù: ciò che è più vicino (z grande) appare più in basso.
    return [x1, y * this.cp - z1 * this.sp];
  }
  // Profondità verso chi guarda (più grande = più vicino): per disegnare prima ciò che sta dietro.
  depth(x, y, z = 0) {
    const z1 = -x * this.sy + z * this.cy;
    return y * this.sp + z1 * this.cp;
  }

  line(P, pts, opts) { P.line(pts.map(q => this.p(q[0], q[1], q[2] ?? 0)), opts); }
  poly(P, pts, opts) { P.poly(pts.map(q => this.p(q[0], q[1], q[2] ?? 0)), opts); }
  arrow(P, a, b, opts) { const [x0, y0] = this.p(...a), [x1, y1] = this.p(...b); P.arrow(x0, y0, x1, y1, opts); }
  S(P, x, y, z = 0) { const [a, b] = this.p(x, y, z); return P.S(a, b); }

  // Circonferenza di centro c e raggio r nel piano perpendicolare all'asse ('x', 'y' o 'z'), come punti 3D.
  ring(c, r, axis = 'z', n = 64, a0 = 0, a1 = 2 * Math.PI) {
    const pts = [];
    for (let i = 0; i <= n; i++) {
      const t = a0 + (a1 - a0) * i / n, u = r * Math.cos(t), v = r * Math.sin(t);
      pts.push(axis === 'z' ? [c[0] + u, c[1] + v, c[2]] : axis === 'y' ? [c[0] + u, c[1], c[2] + v] : [c[0], c[1] + u, c[2] + v]);
    }
    return pts;
  }

  // Asse z tratteggiato per il punto o, che compare man mano che la camera si inclina, con il nome in punta.
  zAxis(P, o, len, { label = 'z', alpha = 1 } = {}) {
    const k = this.tilt() * alpha;
    if (k < 0.02) return;
    const M = P.M ?? palette(P.c);
    this.line(P, [[o[0], o[1], o[2] - len * 0.4], [o[0], o[1], o[2] + len]], { color: 'muted', width: 1, dash: [4, 5], alpha: 0.7 * k });
    const [a, b] = this.S(P, o[0], o[1], o[2] + len);
    tex(P, a + 10, b - 8, label, { size: 16, color: M.muted, halo: M.bg, alpha: k });
  }
}

// Vista 3D animata: con on = true la camera va verso (pitch, yaw), altrimenti torna di fronte. S è lo Stage della
// regia (valori che inseguono con morbidezza, come move_camera di Manim).
// In vista 3D la camera non sta mai ferma: oscilla piano attorno alla posizione scelta (ambient camera rotation di
// Manim), ±swing rad in un periodo di `period` secondi. Nelle istantanee e con "riduci movimento" resta ferma.
const tilts = {};   // inclinazione dell'ultima camera di ogni esperimento (per lo sfondo, disegnato prima della scena)
const orbits = {};  // rotazione scelta con il dito: { dp, dy } in radianti, per esperimento

// In vista 3D la camera non sta mai ferma: oscilla piano attorno alla posizione scelta (ambient camera rotation di
// Manim), ±swing rad in un periodo di `period` secondi, finché non la si gira con il dito. Nelle istantanee e con
// "riduci movimento" resta ferma.
export function camera3d(S, key, on, pitch, yaw, { tau = 0.32, swing = 0.32, period = 14 } = {}) {
  const o = orbits[key] ??= { dp: 0, dy: 0, user: false };
  if (!on) Object.assign(o, { dp: 0, dy: 0, user: false });
  const amb = S.still || o.user ? 0 : swing * Math.sin(2 * Math.PI * (S.R?.now ?? 0) / period);
  const tp = Math.max(-1.45, Math.min(1.45, pitch + o.dp));
  const [a, b] = S.smooth('cam3d:' + key, on ? [tp, yaw + o.dy + amb] : [0, 0], o.user ? 0.06 : tau);
  const V = new View3D().set(a, b);
  if (!S.snap) tilts[key] = Math.hypot(a, b);
  return V;
}

// Rotazione della camera con il dito (exp.orbit): dx, dy in px. Restituisce true se la vista 3D è attiva
// (allora il trascinamento non sposta la scena ma la fa girare).
export function orbit3d(key, on, dx, dy, sign = 1) {
  if (!on || (tilts[key] ?? 0) < 0.05) return false;
  const o = orbits[key] ??= { dp: 0, dy: 0, user: false };
  o.user = true; o.dy -= dx * 0.004; o.dp += sign * dy * 0.003;
  return true;
}

// Sfondo per gli esperimenti con la vista 3D (exp.drawBackground): finché la camera è di fronte è il solito
// NumberPlane piatto; appena si inclina resta solo il colore di fondo e la griglia la disegna la scena (grid3d),
// nel piano dell'esperimento, così ruota insieme a tutto il resto.
export const background3d = key => (ctx, cam, colors) => {
  // Mentre la camera si inclina la griglia piatta sfuma e lascia il posto alla stanza a quadretti (room3d).
  const k = Math.min(1, (tilts[key] ?? 0) / 0.5), M = palette(colors);
  ctx.fillStyle = M.bg; ctx.fillRect(0, 0, cam.w, cam.h);
  if (k >= 1) return;
  ctx.save(); ctx.globalAlpha = 1 - k; drawGrid(ctx, cam, colors, k < 0.05); ctx.restore();
};

// Griglia del NumberPlane vista dalla camera, con le stesse linee e gli stessi colori di quella piatta.
//   plane 'xy': il piano dell'esperimento (z = 0); a camera di fronte coincide con lo sfondo piatto.
//   plane 'xz': il pavimento (y = 0), che in 3D fa da appoggio agli oggetti; zr è la sua profondità (±zr).
// È estesa e finita come un piano di Manim; alpha la sfuma (per incrociare muro e pavimento mentre la camera gira).
export function grid3d(P, V, { plane = 'xy', extend = 1.8, alpha = 1, zr = 6 } = {}) {
  if (alpha <= 0.01) return null;
  const M = P.M ?? palette(P.c), cam = P.cam, step = niceStep(80 / cam.scale), minor = step / 2;
  const { x0, y0, x1, y1 } = cam.bounds(), cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  const hx = (x1 - x0) / 2 * extend, hy = plane === 'xz' ? zr : (y1 - y0) / 2 * extend, cv = plane === 'xz' ? 0 : cy;
  const X0 = Math.floor((cx - hx) / step) * step, X1 = Math.ceil((cx + hx) / step) * step;
  const Y0 = Math.floor((cv - hy) / step) * step, Y1 = Math.ceil((cv + hy) / step) * step;
  const pt = (u, v) => (plane === 'xz' ? [u, 0, v] : [u, v, 0]);
  const ctx = P.ctx;
  ctx.save();
  ctx.strokeStyle = M.plane;
  for (const [s, a] of [[minor, M.planeA[1]], [step, M.planeA[0]]]) {
    ctx.globalAlpha = a * alpha; ctx.lineWidth = s === minor ? 1 : 1.25;
    ctx.beginPath();
    const seg = (p, q) => { const [a1, b1] = P.S(...V.p(...p)), [a2, b2] = P.S(...V.p(...q)); ctx.moveTo(a1, b1); ctx.lineTo(a2, b2); };
    for (let x = X0; x <= X1 + 1e-9; x += s) {
      if (s === minor && Math.abs(x / step - Math.round(x / step)) < 1e-6) continue;
      seg(pt(x, Y0), pt(x, Y1));
    }
    for (let y = Y0; y <= Y1 + 1e-9; y += s) {
      if (s === minor && Math.abs(y / step - Math.round(y / step)) < 1e-6) continue;
      seg(pt(X0, y), pt(X1, y));
    }
    ctx.stroke();
  }
  ctx.restore();
  return { X0, X1, Y0, Y1 };
}

// "Stanza" a quadretti fissa nel mondo, come stare dentro la griglia: il pavimento e le due pareti più lontane
// dalla camera (si scelgono a ogni fotogramma, così si guarda sempre dentro la stanza). box: { x: [a, b], y: [a, b],
// z: [a, b] } in metri; up: l'asse verticale ('y' per gli esperimenti nel piano verticale, 'z' per la piattaforma).
// I quadretti hanno un passo fisso (step), quindi spostando o ruotando la camera la griglia non si ricalcola.
// A camera di fronte resta lo sfondo piatto di sempre (background3d); compare man mano che la camera si inclina.
export function room3d(P, V, box, { up = 'y', step = 1, alpha = 1 } = {}) {
  const k = V.tilt() * alpha;
  if (k <= 0.001) return;
  const M = P.M ?? palette(P.c), ctx = P.ctx, axes = ['x', 'y', 'z'];
  const at = (q, ax, v) => { const r = { ...q }; r[ax] = v; return [r.x, r.y, r.z]; };
  const mid = { x: (box.x[0] + box.x[1]) / 2, y: (box.y[0] + box.y[1]) / 2, z: (box.z[0] + box.z[1]) / 2 };
  const faces = [{ ax: up, v: box[up][0], floor: true }];
  for (const ax of axes.filter(a => a !== up)) {
    // Delle due pareti perpendicolari a questo asse, quella più lontana dalla camera.
    const [d0, d1] = box[ax].map(v => V.depth(...at(mid, ax, v)));
    faces.push({ ax, v: d0 < d1 ? box[ax][0] : box[ax][1] });
  }
  ctx.save();
  ctx.strokeStyle = M.plane;
  for (const f of faces) {
    const [u, w] = axes.filter(a => a !== f.ax);
    for (const [st, a0] of [[step / 2, M.planeA[1]], [step, M.planeA[0]]]) {
      ctx.globalAlpha = a0 * k * (f.floor ? 1 : 0.7); ctx.lineWidth = st < step ? 1 : 1.25;
      ctx.beginPath();
      const seg = (p, q) => { const [a1, b1] = P.S(...V.p(...p)), [a2, b2] = P.S(...V.p(...q)); ctx.moveTo(a1, b1); ctx.lineTo(a2, b2); };
      for (const [along, other] of [[u, w], [w, u]]) {
        for (let t = Math.ceil(box[along][0] / st - 1e-9) * st; t <= box[along][1] + 1e-9; t += st) {
          if (st < step && Math.abs(t / step - Math.round(t / step)) < 1e-6) continue;
          const base = { x: 0, y: 0, z: 0 }; base[f.ax] = f.v; base[along] = t;
          seg(at(base, other, box[other][0]), at(base, other, box[other][1]));
        }
      }
      ctx.stroke();
    }
    // Bordo della faccia, appena più marcato.
    ctx.globalAlpha = 0.5 * k; ctx.lineWidth = 1.4; ctx.beginPath();
    const c = { x: 0, y: 0, z: 0 }; c[f.ax] = f.v;
    const corners = [[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]].map(([i, j]) => { const q = { ...c }; q[u] = box[u][i]; q[w] = box[w][j]; return P.S(...V.p(q.x, q.y, q.z)); });
    corners.forEach(([a1, b1], i) => (i ? ctx.lineTo(a1, b1) : ctx.moveTo(a1, b1)));
    ctx.stroke();
  }
  ctx.restore();
}

// Terna levogira (x, y, z antioraria, regola della mano destra) nell'origine della scena: gli assi x e y stanno sul
// piano della griglia, z ne esce. Ruota con la camera insieme alla griglia; compare man mano che la camera si inclina.
export function axes3d(P, V, { origin = [0, 0, 0], lx = 3, ly = 3, lz = 2.5, alpha = 1 } = {}) {
  const k = V.tilt() * alpha;
  if (k < 0.02) return;
  const M = P.M ?? palette(P.c), [ox, oy, oz] = origin;
  const ax = [['x', [ox + lx, oy, oz]], ['y', [ox, oy + ly, oz]], ['z', [ox, oy, oz + lz]]];
  for (const [n, e] of ax) {
    V.arrow(P, [ox, oy, oz], e, { color: M.axis, key: 'ax' + n, width: 2, alpha: 0.85 * k, head: 10 });
    const [a, b] = V.S(P, ...e), [c, d] = V.S(P, ox, oy, oz), L = Math.hypot(a - c, b - d) || 1;
    tex(P, a + (a - c) / L * 16, b + (b - d) / L * 16, n, { size: 18, color: M.text, halo: M.bg, alpha: k });
  }
}

// Terna levogira (x, y, z antioraria, regola della mano destra) nell'angolo in basso a sinistra della scena:
// gira con la camera, così si vede sempre come è orientato lo spazio. Compare man mano che la camera si inclina.
export function triad(P, V, { size = 44, alpha = 1 } = {}) {
  const k = V.tilt() * alpha;
  if (k < 0.02) return;
  const M = P.M ?? palette(P.c), ctx = P.ctx, pad = P.cam.padFn?.() ?? { left: 20, bottom: 20 };
  const ox = pad.left + 70, oy = P.cam.h - pad.bottom - 120;
  const axes = [['x', [1, 0, 0], M.vec.weight], ['y', [0, 1, 0], M.vec.normal], ['z', [0, 0, 1], M.vec.vel]]
    .map(([n, e, c]) => { const [u, v] = V.p(...e); return { n, c, u, v, d: V.depth(...e) }; })
    .sort((a, b) => a.d - b.d);
  ctx.save();
  ctx.globalAlpha = 0.85 * k; ctx.fillStyle = M.text; ctx.beginPath(); ctx.arc(ox, oy, 2.5, 0, 7); ctx.fill();
  for (const a of axes) {
    const ex = ox + a.u * size, ey = oy - a.v * size, L = Math.hypot(ex - ox, ey - oy);
    if (L < 3) continue;
    const ux = (ex - ox) / L, uy = (ey - oy) / L;
    ctx.globalAlpha = k * (0.55 + 0.45 * Math.max(0, Math.min(1, 0.5 + a.d)));   // gli assi che vanno indietro sono più tenui
    ctx.strokeStyle = ctx.fillStyle = a.c; ctx.lineWidth = 2.4; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(ex - ux * 7, ey - uy * 7); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(ex, ey); ctx.lineTo(ex - ux * 9 - uy * 4.5, ey - uy * 9 + ux * 4.5); ctx.lineTo(ex - ux * 9 + uy * 4.5, ey - uy * 9 - ux * 4.5); ctx.closePath(); ctx.fill();
    ctx.restore(); ctx.save();
    tex(P, ex + ux * 12, ey + uy * 12, a.n, { size: 16, color: a.c, halo: M.bg, alpha: k });
  }
  ctx.restore();
}

// Cilindro (o disco spesso) con asse z, centro c, raggio r, spessore w: faccia posteriore, fianchi, faccia anteriore.
// spin: angolo di rotazione attorno all'asse, segnato da un raggio sulla faccia anteriore.
export function cylinder(P, V, c, r, w, { color, edge, alpha = 0.8, spin = 0, hollow = false, mark = true } = {}) {
  const [cx, cy, cz] = c, back = V.ring([cx, cy, cz - w / 2], r, 'z', 72), front = V.ring([cx, cy, cz + w / 2], r, 'z', 72);
  const nearFront = V.depth(cx, cy, cz + w / 2) >= V.depth(cx, cy, cz - w / 2);
  const [f, b] = nearFront ? [front, back] : [back, front];
  const fill = hollow ? null : color;
  // Fianchi: la superficie laterale vista dalla camera è l'inviluppo convesso delle due facce proiettate.
  if (V.tilt(0.15) > 0.02) {
    P.poly(hull([...b, ...f].map(q => V.p(...q))), { fill: color, alpha: (hollow ? 0.18 : 0.5) * alpha });
    V.line(P, b, { color: edge ?? color, width: hollow ? 2.4 : 1.2, alpha: 0.7 * alpha });
  }
  if (fill) V.poly(P, f, { fill, alpha: alpha * 0.85 });
  V.line(P, f, { color: edge ?? color, width: hollow ? 3 : 1.6, alpha });
  if (mark) {
    const z = nearFront ? cz + w / 2 : cz - w / 2;
    V.line(P, [[cx, cy, z], [cx + r * Math.cos(spin), cy + r * Math.sin(spin), z]], { color: edge ?? color, width: 1.6, alpha });
  }
}

// Sfera: la proiezione è un cerchio; un meridiano che ruota con spin la fa vedere girare.
export function sphere(P, V, c, r, { color, edge, alpha = 0.8, spin = 0 } = {}) {
  const [x, y] = V.p(...c), rp = r * P.cam.scale;
  P.circle(x, y, rp, { fill: color, alpha: 0.8 * alpha });
  P.circle(x, y, rp, { stroke: edge ?? color, width: 1.6, alpha });
  // Cerchio massimo nel piano xy (quello che rotola), visto dalla camera: segna la rotazione con un raggio.
  V.line(P, V.ring(c, r, 'z', 64), { color: edge ?? color, width: 1, alpha: 0.5 * alpha * V.tilt(0.3) });
  V.line(P, [c, [c[0] + r * Math.cos(spin), c[1] + r * Math.sin(spin), c[2]]], { color: edge ?? color, width: 1.6, alpha });
}

// Inviluppo convesso di punti 2D (catena monotona).
export function hull(pts) {
  const p = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (p.length < 3) return p;
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], up = [];
  for (const q of p) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  for (let i = p.length - 1; i >= 0; i--) { const q = p[i]; while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
  return lo.slice(0, -1).concat(up.slice(0, -1));
}

// Prisma: poligono 2D (nel piano xy) estruso lungo z tra z0 e z1, disegnato dalle facce lontane a quelle vicine.
export function prism(P, V, poly, z0, z1, { fill, stroke, alpha = 1, topEdge = null } = {}) {
  const faces = [];
  const back = poly.map(([x, y]) => [x, y, z0]), front = poly.map(([x, y]) => [x, y, z1]);
  for (let i = 0; i < poly.length; i++) {
    const j = (i + 1) % poly.length, q = [back[i], back[j], front[j], front[i]];
    faces.push({ pts: q, d: q.reduce((s, r) => s + V.depth(...r), 0) / 4 });
  }
  faces.push({ pts: back, d: V.depth(0, 0, z0) - 1e3 * (V.depth(0, 0, z1) > V.depth(0, 0, z0) ? 1 : -1) });
  faces.push({ pts: front, d: V.depth(0, 0, z1) + 1e3 * (V.depth(0, 0, z1) > V.depth(0, 0, z0) ? 1 : -1) });
  faces.sort((a, b) => a.d - b.d);
  for (const f of faces) {
    V.poly(P, f.pts, { fill, alpha: alpha * 0.9 });
    V.poly(P, f.pts, { stroke, width: 1.2, alpha: alpha * 0.8 });
  }
  if (topEdge) V.line(P, topEdge, { color: 'text', width: 2.2, alpha });
}
