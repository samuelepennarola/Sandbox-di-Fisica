// Un accenno di 3D alla Manim (ThreeDScene): la scena resta nel piano xy dello schermo, con z verso chi guarda;
// una camera ortografica ruota attorno all'asse verticale (yaw) e si inclina (pitch) per mostrare l'asse z,
// dove vivono i vettori "fuori dal piano" (momento di una forza, velocità angolare, momento angolare).
// Le coordinate proiettate sono coordinate mondo 2D, quindi si disegnano con il Painter di sempre.
import { palette, tex } from './manim.js';

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
export function camera3d(S, key, on, pitch, yaw, { tau = 0.32, swing = 0.32, period = 14 } = {}) {
  const amb = S.still ? 0 : swing * Math.sin(2 * Math.PI * (S.R?.now ?? 0) / period);
  const [a, b] = S.smooth('cam3d:' + key, on ? [pitch, yaw + amb] : [0, 0], tau);
  return new View3D().set(a, b);
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
