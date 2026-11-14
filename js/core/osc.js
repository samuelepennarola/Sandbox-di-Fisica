// Strumenti comuni del modulo "Oscillazioni e onde", nello stile di 3Blue1Brown:
//   penTrace: la traccia x(t) scritta dal vivo sotto l'oscillatore, come un pennino su un rotolo di carta
//             che scorre verso il basso (il tempo scende);
//   phasor:   il vettore che ruota su una circonferenza e la cui proiezione orizzontale è il moto armonico;
//   coilSpring: molla a spire con un numero fisso di spire (si stringe e si allunga davvero).
import { palette, tex } from './manim.js';
import { rate } from './anim.js';

const free = cam => cam.padFn?.() ?? { top: 70, right: 20, bottom: 20, left: 20 };

// Pixel al secondo della carta: quanto basta perché nell'altezza disponibile stiano circa `periods` periodi.
export function paperSpeed(avail, T, periods = 3) {
  if (!(T > 0) || !isFinite(T)) return 60;
  return Math.min(420, Math.max(18, avail / (periods * T)));
}

// Traccia del pennino. pts: [[t, xMondo], ...] in ordine di tempo; tNow: istante attuale; top: y schermo del pennino.
// L'asse verticale tratteggiato passa per x = 0 (equilibrio); la scritta t con la freccia indica lo scorrere del tempo.
// Restituisce i px al secondo usati (per eventuali tacche).
export function penTrace(P, pts, tNow, { top, pxs, color, grow = 1, label = 'x(t)', alpha = 1, nowX = null } = {}) {
  const M = P.M ?? palette(P.c), ctx = P.ctx, pad = free(P.cam), bottom = P.cam.h - pad.bottom - 8;
  if (bottom - top < 30 || grow <= 0.01) return;
  const [ox] = P.S(0, 0), col = color ?? M.vec.vel, H = (bottom - top) * grow;
  ctx.save();
  ctx.globalAlpha = alpha;
  // Asse del tempo (equilibrio) e tacche ogni secondo, sottili.
  ctx.strokeStyle = M.muted; ctx.lineWidth = 1; ctx.setLineDash([3, 5]); ctx.globalAlpha = 0.5 * alpha;
  ctx.beginPath(); ctx.moveTo(ox, top); ctx.lineTo(ox, top + H); ctx.stroke();
  ctx.setLineDash([]);
  const t0 = Math.ceil(tNow - H / pxs);
  ctx.beginPath();
  for (let k = Math.max(0, t0); k <= tNow; k++) {
    const y = top + (tNow - k) * pxs;
    if (y > top + H) continue;
    ctx.moveTo(ox - 4, y); ctx.lineTo(ox + 4, y);
  }
  ctx.stroke();
  // La curva: dal pennino (adesso) verso il basso (il passato).
  ctx.globalAlpha = alpha; ctx.strokeStyle = col; ctx.lineWidth = 2.6; ctx.lineJoin = ctx.lineCap = 'round';
  ctx.beginPath();
  let started = false, prev = null, reach = 0;
  // Il pennino sta sempre sotto l'oggetto (nowX): la curva parte da lì e prosegue con i campioni registrati.
  if (nowX != null) { const [a] = P.S(nowX, 0); ctx.moveTo(a, top); started = true; prev = [a, top]; reach = Math.abs(a - ox); }
  for (let i = pts.length - 1; i >= 0; i--) {
    const [t, x] = pts[i], y = top + (tNow - t) * pxs;
    const [a] = P.S(x, 0);
    if (y > top + H) {
      // Ultimo tratto tagliato esattamente sul fondo della carta.
      if (prev) { const u = (top + H - prev[1]) / (y - prev[1]); ctx.lineTo(prev[0] + (a - prev[0]) * u, top + H); }
      break;
    }
    started ? ctx.lineTo(a, y) : ctx.moveTo(a, y);
    started = true; prev = [a, y]; reach = Math.max(reach, Math.abs(a - ox));
  }
  ctx.stroke();
  ctx.restore();
  if (pts.length || nowX != null) {
    const [a] = P.S(nowX ?? pts[pts.length - 1][1], 0);
    P.ctx.save(); P.ctx.globalAlpha = alpha;
    P.ctx.fillStyle = col; P.ctx.beginPath(); P.ctx.arc(a, top, 4, 0, Math.PI * 2); P.ctx.fill();
    P.ctx.restore();
  }
  // Nomi: x(t) accanto al pennino, t in fondo all'asse con una freccia verso il basso.
  const la = alpha * rate.smooth(Math.min(1, Math.max(0, (grow - 0.6) / 0.4)));
  if (la > 0.01) {
    tex(P, ox + 26, top + H - 12, 't', { size: 17, color: M.muted, halo: M.bg, alpha: la });
    ctx.save(); ctx.globalAlpha = la * 0.8; ctx.fillStyle = M.muted;
    const yb = top + H;
    ctx.beginPath(); ctx.moveTo(ox, yb + 2); ctx.lineTo(ox - 4.5, yb - 7); ctx.lineTo(ox + 4.5, yb - 7); ctx.closePath(); ctx.fill();
    ctx.restore();
    if (label) tex(P, ox - reach - 32, top + 14, label, { size: 17, color: col, halo: M.bg, alpha: la });
  }
}

// Fasore: circonferenza di centro (cx, cy) e raggio R (mondo), vettore fino alla punta (tx, ty), proiezione
// tratteggiata dalla punta fino a dropY. grow ∈ [0, 1]: la circonferenza si disegna (Create), poi cresce il vettore.
export function phasor(P, cx, cy, R, tx, ty, dropY, { grow = 1, color, label = null, alpha = 1 } = {}) {
  const M = P.M ?? palette(P.c), ctx = P.ctx, col = color ?? M.vec.vel;
  if (grow <= 0.01 || R * P.cam.scale < 2) return;
  const [a, b] = P.S(cx, cy), r = R * P.cam.scale;
  const gc = Math.min(1, grow / 0.6), gv = Math.max(0, (grow - 0.45) / 0.55);
  ctx.save();
  ctx.globalAlpha = 0.75 * alpha; ctx.strokeStyle = M.text; ctx.lineWidth = 1.6;
  ctx.beginPath(); ctx.arc(a, b, r, 0, -2 * Math.PI * rate.smooth(gc), true); ctx.stroke();
  // Diametro orizzontale: il segmento su cui si muove la proiezione.
  ctx.globalAlpha = 0.35 * alpha * gc; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(a - r, b); ctx.lineTo(a + r, b); ctx.stroke();
  ctx.restore();
  if (gv <= 0) return;
  const g = rate.smooth(gv), ex = cx + (tx - cx) * g, ey = cy + (ty - cy) * g;
  P.line([[cx, cy], [ex, ey]], { color: col, width: 2.2, alpha });
  P.circle(cx, cy, 2.5, { fill: M.text, alpha });
  if (g < 0.98) return;
  P.circle(tx, ty, 4.5, { fill: col, alpha });
  P.line([[tx, ty], [tx, dropY]], { color: col, width: 1, dash: [3, 5], alpha: 0.7 * alpha });
  P.line([[tx, ty], [tx, cy]], { color: col, width: 1.6, alpha: 0.5 * alpha });
  P.circle(tx, cy, 3.5, { fill: col, alpha: 0.9 * alpha });
  if (label) {
    const [c, d] = P.S(tx, ty), L = Math.hypot(c - a, d - b) || 1;
    tex(P, c + (c - a) / L * 20, d + (d - b) / L * 20, label, { size: 17, color: col, halo: M.bg, alpha });
  }
}

// Molla a spire tra due punti mondo, con un numero fisso di spire: compressa si infittisce, tesa si dirada.
export function coilSpring(P, p0, p1, { coils = 12, amp = 9, color, width = 2, alpha = 1 } = {}) {
  const M = P.M ?? palette(P.c), ctx = P.ctx, [x0, y0] = P.S(p0[0], p0[1]), [x1, y1] = P.S(p1[0], p1[1]);
  const L = Math.hypot(x1 - x0, y1 - y0);
  if (L < 3) return;
  const ux = (x1 - x0) / L, uy = (y1 - y0) / L, end = Math.min(14, L * 0.12), body = L - 2 * end, n = coils * 2;
  ctx.save();
  ctx.globalAlpha = alpha; ctx.strokeStyle = color ?? M.springC; ctx.lineWidth = width; ctx.lineJoin = ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x0 + ux * end, y0 + uy * end);
  for (let i = 0; i < n; i++) {
    const t = end + body * (i + 0.5) / n, s = i % 2 ? -1 : 1;
    ctx.lineTo(x0 + ux * t - uy * amp * s, y0 + uy * t + ux * amp * s);
  }
  ctx.lineTo(x1 - ux * end, y1 - uy * end); ctx.lineTo(x1, y1);
  ctx.stroke();
  ctx.restore();
}

// Parete o soffitto: segmento netto con il tratteggio obliquo dalla parte "dentro" (nx, ny versore in px).
export function wallM(P, a, b, { nx = -1, ny = 0, alpha = 1 } = {}) {
  const M = P.M ?? palette(P.c), ctx = P.ctx, [x0, y0] = P.S(a[0], a[1]), [x1, y1] = P.S(b[0], b[1]);
  const L = Math.hypot(x1 - x0, y1 - y0);
  if (L < 2) return;
  const ux = (x1 - x0) / L, uy = (y1 - y0) / L;
  ctx.save();
  ctx.globalAlpha = alpha; ctx.strokeStyle = M.dark ? '#ffffff' : M.solidEdge; ctx.lineCap = 'round';
  ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
  ctx.lineWidth = 1.2; ctx.globalAlpha = 0.55 * alpha; ctx.beginPath();
  for (let s = 6; s < L; s += 10) {
    const px = x0 + ux * s, py = y0 + uy * s;
    ctx.moveTo(px, py); ctx.lineTo(px + nx * 9 - ux * 7, py + ny * 9 - uy * 7);
  }
  ctx.stroke();
  ctx.restore();
}

// Barre delle energie (K, U, E) in coordinate schermo: tre colonne sottili con il nome sotto, scala fissa Emax.
export function energyBars(P, x, yBase, items, Emax, { h = 110, w = 14, gap = 12, alpha = 1 } = {}) {
  const M = P.M ?? palette(P.c), ctx = P.ctx;
  if (!(Emax > 0)) return;
  ctx.save();
  ctx.globalAlpha = 0.4 * alpha; ctx.strokeStyle = M.muted; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(x - 6, yBase); ctx.lineTo(x + items.length * (w + gap) - gap + 6, yBase); ctx.stroke();
  items.forEach(({ v, color }, i) => {
    const hh = Math.max(0, Math.min(1.05, v / Emax)) * h, bx = x + i * (w + gap);
    ctx.globalAlpha = 0.85 * alpha; ctx.fillStyle = color;
    ctx.fillRect(bx, yBase - hh, w, hh);
  });
  ctx.restore();
  items.forEach(({ name, color }, i) => tex(P, x + i * (w + gap) + w / 2, yBase + 14, name, { size: 15, color, halo: M.bg, alpha }));
}

// Oscilloscopio accanto a un punto (a, b in px): il segnale fn(t) degli ultimi `win` secondi, con l'adesso sul
// punto e il passato che scorre verso destra (o verso sinistra se a destra non c'è spazio). valPx converte il
// valore in px verso l'alto. Un riquadro tenue del colore di fondo lo stacca dalla scena.
export function scopeTrace(P, a, b, fn, tNow, { win, Wpx = 260, Hpx = 34, valPx, color, grow = 1, gap = 18 } = {}) {
  const M = P.M ?? palette(P.c), ctx = P.ctx, pad = free(P.cam);
  if (grow <= 0.01) return;
  const right = a + gap + Wpx < P.cam.w - pad.right - 6, dir = right ? 1 : -1, x0 = a + dir * gap;
  const xs = k => x0 + dir * Wpx * k;
  ctx.save();
  ctx.globalAlpha = 0.72 * grow; ctx.fillStyle = M.bg;
  ctx.beginPath();
  const bx = Math.min(x0, x0 + dir * Wpx) - 6;
  ctx.roundRect ? ctx.roundRect(bx, b - Hpx - 10, Wpx + 12, 2 * Hpx + 20, 6) : ctx.rect(bx, b - Hpx - 10, Wpx + 12, 2 * Hpx + 20);
  ctx.fill();
  ctx.globalAlpha = 0.45 * grow; ctx.strokeStyle = M.muted; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(xs(0), b); ctx.lineTo(xs(1), b); ctx.stroke();
  // Collegamento tratteggiato dal punto all'inizio della traccia.
  ctx.setLineDash([2, 4]); ctx.beginPath(); ctx.moveTo(a, b); ctx.lineTo(xs(0), b); ctx.stroke(); ctx.setLineDash([]);
  ctx.globalAlpha = grow; ctx.strokeStyle = color ?? M.vec.weight; ctx.lineWidth = 2.2; ctx.lineJoin = ctx.lineCap = 'round';
  ctx.beginPath();
  const n = 240;
  for (let k = 0; k <= n * grow; k++) {
    const tt = tNow - win * k / n, z = tt < 0 ? 0 : fn(tt);
    const yy = b - Math.max(-Hpx, Math.min(Hpx, valPx(z)));
    k ? ctx.lineTo(xs(k / n), yy) : ctx.moveTo(xs(0), yy);
  }
  ctx.stroke();
  ctx.restore();
  tex(P, xs(1) + dir * 4, b + 12, 't', { size: 15, color: M.muted, halo: M.bg, alpha: grow, align: right ? 'left' : 'right' });
}
