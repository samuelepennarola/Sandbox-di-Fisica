// Strumenti comuni del modulo "Oscillazioni e onde", nello stile di 3Blue1Brown:
//   penTrace: la traccia x(t) scritta dal vivo sotto l'oscillatore, come un pennino su un rotolo di carta
//             che scorre verso il basso (il tempo scende); la usano anche gli esperimenti di cinematica;
//   phasor:   il vettore che ruota su una circonferenza e la cui proiezione orizzontale è il moto armonico;
//   coilSpring: molla a spire con un numero fisso di spire (si stringe e si allunga davvero).
import { palette, tex } from './manim.js';
import { rate } from './anim.js';
import { niceStep, decimalsOf, tn } from './math.js';
import { unitView } from './units.js';

const free = cam => cam.padFn?.() ?? { top: 70, right: 20, bottom: 20, left: 20 };

// Pixel al secondo della carta: quanto basta perché nell'altezza disponibile stiano circa `periods` periodi.
export function paperSpeed(avail, T, periods = 3) {
  if (!(T > 0) || !isFinite(T)) return 60;
  return Math.min(420, Math.max(18, avail / (periods * T)));
}

// Traccia del pennino. pts: [[t, valore], ...] in ordine di tempo; tNow: istante attuale.
// axis 'x' (moto armonico, cinematica): il valore è una x del mondo, il pennino sta alla y schermo `top` e il tempo
//   scende fino a `end` (di norma il fondo della scena);
// axis 'y' (proiezioni verticali): il valore è una y del mondo, il pennino sta alla x schermo `top` e il tempo
//   scorre verso destra fino a `end`.
// L'asse tratteggiato passa per il valore 0 (equilibrio o origine); shift sposta in blocco valori e asse (in metri,
// per i disegni traslati come «Da S′»). link: coordinata lungo il tempo da cui parte il richiamo tratteggiato
// verso il pennino (per esempio il suolo sotto il corpo).
// forward: grafico nel verso consueto, con t = 0 all'inizio della carta (in alto, o a sinistra) e il pennino che
//   avanza con il tempo; se la carta finisce, scorre all'indietro tenendo il pennino in fondo. Senza forward
//   (moto armonico) il pennino resta fermo all'inizio della carta e il passato scorre via.
export function penTrace(P, pts, tNow, { axis = 'x', top, end = null, pxs, color, grow = 1, label, alpha = 1, nowX = null, shift = 0, link = null, forward = false } = {}) {
  const M = P.M ?? palette(P.c), ctx = P.ctx, pad = free(P.cam), hor = axis === 'y';
  const lim = end ?? (hor ? P.cam.w - pad.right - 8 : P.cam.h - pad.bottom - 8);
  if (lim - top < 30 || grow <= 0.01) return;
  label = label === undefined ? (hor ? 'y(t)' : 'x(t)') : label;
  // ac: coordinata schermo trasversale di un valore; pt: punto schermo da (lungo il tempo, trasversale).
  const ac = v => (hor ? P.S(0, v + shift)[1] : P.S(v + shift, 0)[0]);
  const pt = (al, c) => (hor ? [al, c] : [c, al]);
  const mv = (al, c) => ctx.moveTo(...pt(al, c)), ln = (al, c) => ctx.lineTo(...pt(al, c));
  const o = ac(0), col = color ?? M.vec.vel, H = (lim - top) * grow;
  // al: coordinata lungo il tempo di un istante; out: fuori dalla carta (dalla parte del passato).
  const t0w = Math.max(0, tNow - H / pxs);
  const al = t => (forward ? top + (t - t0w) * pxs : top + (tNow - t) * pxs);
  const out = y => (forward ? y < top - 1e-6 : y > top + H + 1e-6), edge = forward ? top : top + H, now = al(tNow);
  ctx.save();
  ctx.globalAlpha = alpha;
  // Asse del tempo (valore zero) e tacche ogni secondo, sottili.
  ctx.strokeStyle = M.muted; ctx.lineWidth = 1; ctx.setLineDash([3, 5]); ctx.globalAlpha = 0.5 * alpha;
  ctx.beginPath(); mv(top, o); ln(top + H, o); ctx.stroke();
  ctx.setLineDash([]);
  const t0 = Math.ceil(tNow - H / pxs);
  ctx.beginPath();
  for (let k = Math.max(0, t0); k <= tNow; k++) {
    const y = al(k);
    if (out(y)) continue;
    mv(y, o - 4); ln(y, o + 4);
  }
  ctx.stroke();
  // La curva: dal pennino (adesso) verso il passato.
  ctx.globalAlpha = alpha; ctx.strokeStyle = col; ctx.lineWidth = 2.6; ctx.lineJoin = ctx.lineCap = 'round';
  ctx.beginPath();
  // reach: quanto la curva sporge a sinistra dell'asse (sopra, per y): il nome va oltre, dove non la copre.
  let started = false, prev = null, reach = 0;
  // Il pennino sta sempre all'altezza dell'oggetto (nowX): la curva parte da lì e prosegue con i campioni registrati.
  if (nowX != null) { const a = ac(nowX); mv(now, a); started = true; prev = [a, now]; reach = Math.max(0, o - a); }
  for (let i = pts.length - 1; i >= 0; i--) {
    const [t, x] = pts[i], y = al(t), a = ac(x);
    if (out(y)) {
      // Ultimo tratto tagliato esattamente sul bordo della carta.
      if (prev) { const u = (edge - prev[1]) / (y - prev[1]); ln(edge, prev[0] + (a - prev[0]) * u); }
      break;
    }
    started ? ln(y, a) : mv(y, a);
    started = true; prev = [a, y]; reach = Math.max(reach, o - a);
  }
  ctx.stroke();
  ctx.restore();
  const pen = pts.length || nowX != null ? ac(nowX ?? pts[pts.length - 1][1]) : null;
  if (pen != null) {
    ctx.save(); ctx.globalAlpha = alpha;
    if (link != null) {
      ctx.strokeStyle = col; ctx.globalAlpha = 0.35 * alpha; ctx.setLineDash([2, 4]); ctx.lineWidth = 1;
      ctx.beginPath(); mv(link, pen); ln(now - 5, pen); ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = alpha;
    }
    ctx.fillStyle = col; ctx.beginPath(); ctx.arc(...pt(now, pen), 4, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
  // Nomi: x(t) accanto al pennino, t in fondo all'asse con una freccia nel verso del tempo.
  const la = alpha * rate.smooth(Math.min(1, Math.max(0, (grow - 0.6) / 0.4)));
  if (la > 0.01) {
    const yb = top + H;
    tex(P, ...(hor ? [yb - 12, o + 22] : [o + 26, yb - 12]), 't', { size: 17, color: M.muted, halo: M.bg, alpha: la });
    ctx.save(); ctx.globalAlpha = la * 0.8; ctx.fillStyle = M.muted;
    ctx.beginPath(); mv(yb + 2, o); ln(yb - 7, o - 4.5); ln(yb - 7, o + 4.5); ctx.closePath(); ctx.fill();
    ctx.restore();
    if (label) tex(P, ...(hor ? [top + 26, o - reach - 20] : [o - reach - 32, top + 14]), label, { size: 17, color: col, halo: M.bg, alpha: la });
  }
}

// Grafico classico tracciato dal vivo, come sul libro: t in orizzontale verso destra, il valore in verticale verso
// l'alto, assi con le frecce, i nomi e le tacche numerate. Il pennino (pallino) avanza con il tempo; se la corsa
// supera tSpan, la carta scorre e il pennino resta in fondo.
//   left, right: estremi schermo dell'asse dei tempi; vy: valore (m) → y schermo; vmin, vmax: valori rappresentati;
//   nowV: valore attuale (il pennino); link: [x, y] schermo da cui parte il richiamo tratteggiato verso il pennino.
export function chartTrace(P, pts, tNow, { left, right, vy, vmin, vmax, tSpan, color, grow = 1, name = 'x', unit = 'm', nowV = null, link = null, alpha = 1 } = {}) {
  const M = P.M ?? palette(P.c), ctx = P.ctx, W = right - left;
  if (W < 80 || grow <= 0.01 || !(tSpan > 0)) return;
  if (!(vmax - vmin > 1e-9)) { vmin -= 1; vmax += 1; }
  const col = color ?? M.vec.vel, pxs = W / tSpan, t0w = Math.max(0, tNow - tSpan), tx = t => left + (t - t0w) * pxs;
  const yTop = vy(vmax), yBot = vy(vmin), y0 = vy(Math.min(vmax, Math.max(vmin, 0)));
  const g = rate.smooth(Math.min(1, grow / 0.7)), la = alpha * rate.smooth(Math.min(1, Math.max(0, (grow - 0.6) / 0.4)));
  // Assi: si disegnano (Create), con le frecce in punta.
  const tEnd = left + (W + 16) * g, vEnd = yBot + 6 - (yBot - yTop + 22) * g;
  ctx.save();
  ctx.globalAlpha = 0.85 * alpha; ctx.strokeStyle = M.muted; ctx.fillStyle = M.muted; ctx.lineWidth = 1.3; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(left, y0); ctx.lineTo(tEnd, y0); ctx.moveTo(left, yBot + 6); ctx.lineTo(left, vEnd); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(tEnd + 2, y0); ctx.lineTo(tEnd - 7, y0 - 4.5); ctx.lineTo(tEnd - 7, y0 + 4.5); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.moveTo(left, vEnd - 2); ctx.lineTo(left - 4.5, vEnd + 7); ctx.lineTo(left + 4.5, vEnd + 7); ctx.closePath(); ctx.fill();
  // Tacche numerate: secondi sull'asse t, metri (o l'unità scelta) sull'asse del valore.
  // Passi tondi, ma mai così fitti che i numeri si tocchino.
  const U = unitView(unit);
  let ts = niceStep(tSpan / 5), vs = niceStep((vmax - vmin) * U.f / 4) / U.f;
  while (ts * pxs < 44) ts = niceStep(ts * 1.01);
  while (Math.abs(vy(vs) - vy(0)) < 22) vs = niceStep(vs * U.f * 1.01) / U.f;
  const td = decimalsOf(ts), vd = decimalsOf(vs * U.f);
  ctx.globalAlpha = 0.7 * alpha; ctx.lineWidth = 1; ctx.beginPath();
  const tTicks = [], vTicks = [];
  for (let k = Math.ceil(t0w / ts - 1e-9) * ts; k <= t0w + tSpan + 1e-9; k += ts) { const x = tx(k); if (x > left + 2) { ctx.moveTo(x, y0 - 4); ctx.lineTo(x, y0 + 4); tTicks.push([x, k]); } }
  for (let v = Math.ceil(vmin / vs - 1e-9) * vs; v <= vmax + 1e-9; v += vs) { const y = vy(v); ctx.moveTo(left - 4, y); ctx.lineTo(left + 4, y); vTicks.push([y, v]); }
  ctx.stroke();
  ctx.restore();
  if (la > 0.01) {
    const o = { size: 13, color: M.muted, halo: M.bg, alpha: 0.9 * la };
    // I numeri dell'asse t sotto l'asse (sopra, se l'asse è in fondo al grafico e sotto c'è poco spazio non serve).
    for (const [x, k] of tTicks) tex(P, x, y0 + 15, tn(k, td), o);
    for (const [y, v] of vTicks) if (Math.abs(y - y0) > 6 || Math.abs(v) > 1e-9) tex(P, left - 9, y + 4.5, tn(v * U.f, vd), { ...o, align: 'right' });
    if (t0w === 0 && vmin <= 0 && vmax >= 0) tex(P, left - 8, y0 + 15, '0', { ...o, align: 'right' });   // l'origine, una volta sola
    tex(P, left + 10, vEnd - 2, `${name}\\ (\\mathrm{${U.name}})`, { size: 16, color: col, halo: M.bg, align: 'left', alpha: la });
    tex(P, tEnd + 12, y0 - 12, 't\\ (\\mathrm{s})', { size: 16, color: M.muted, halo: M.bg, align: 'left', alpha: la });
  }
  // La curva, dall'inizio della finestra fino all'adesso.
  const vis = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const [t, v] = pts[i];
    if (t > tNow + 1e-9) continue;
    if (t < t0w) {
      const nx = vis[vis.length - 1];
      if (nx) { const u = (t0w - t) / (nx[0] - t || 1); vis.push([t0w, v + (nx[1] - v) * u]); }
      break;
    }
    vis.push([t, v]);
  }
  vis.reverse();
  if (nowV != null) vis.push([tNow, nowV]);
  ctx.save();
  ctx.globalAlpha = alpha * g; ctx.strokeStyle = col; ctx.lineWidth = 2.6; ctx.lineJoin = ctx.lineCap = 'round';
  ctx.beginPath();
  vis.forEach(([t, v], i) => (i ? ctx.lineTo(tx(t), vy(v)) : ctx.moveTo(tx(t), vy(v))));
  ctx.stroke();
  if (vis.length) {
    const [t, v] = vis[vis.length - 1], px = tx(t), py = vy(v);
    if (link) {
      ctx.globalAlpha = 0.35 * alpha * g; ctx.setLineDash([2, 4]); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(link[0], link[1]); ctx.lineTo(px, py); ctx.stroke(); ctx.setLineDash([]);
    }
    ctx.globalAlpha = alpha * g; ctx.fillStyle = col; ctx.beginPath(); ctx.arc(px, py, 4, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}

// Grafico x(t) classico sotto la scena: occupa la fascia da `top` (y schermo) al fondo, alto al più 250 px.
export function chartBelow(P, pts, tNow, { top, vmin, vmax, ...o }) {
  const pad = free(P.cam), left = pad.left + 58, right = P.cam.w - pad.right - 64;
  const bottom = P.cam.h - pad.bottom - 48, y1 = top + 26, H = Math.min(250, bottom - y1);
  if (H < 50) return;
  if (!(vmax - vmin > 1e-9)) { vmin -= 1; vmax += 1; }
  const vy = v => y1 + H - (v - vmin) / (vmax - vmin) * H;
  chartTrace(P, pts, tNow, { left, right, vy, vmin, vmax, ...o });
}

// Grafico y(t) classico a destra della scena, allineato in altezza con il corpo (stessa scala verticale della scena).
export function chartRight(P, pts, tNow, { left, ...o }) {
  const pad = free(P.cam);
  chartTrace(P, pts, tNow, { left: left + 44, right: P.cam.w - pad.right - 64, vy: v => P.S(0, v)[1], name: 'y', ...o });
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
