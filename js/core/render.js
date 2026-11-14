import { niceStep } from './math.js';
import { palette, drawPlaneGrid, manimColors, arrowS, arrowLabel, vecLabel, tex, textToTeX, groundM } from './manim.js';

const STROKE = 1.35;
const COLOR_KEYS = ['bg', 'grid', 'gridMajor', 'axis', 'text', 'muted', 'ink', 'inkRed', 'inkBlue', 'inkGreen', 'inkYellow',
  'vel', 'acc', 'weight', 'normal', 'friction', 'ground', 'groundEdge', 'body', 'bodyEdge', 'ideal', 'handle',
  'tension', 'spring', 'applied', 'skyTop', 'skyBottom', 'soil', 'soilDark', 'dust', 'brick', 'paper', 'paperLine'];

export function readColors() {
  const cs = getComputedStyle(document.documentElement);
  const out = {};
  for (const k of COLOR_KEYS) out[k] = cs.getPropertyValue('--c-' + k.replace(/[A-Z]/g, m => '-' + m.toLowerCase())).trim();
  return out;
}

// Disegno in coordinate mondo: le dimensioni grafiche (spessori, font, raggi) sono in px.
// Stile alla 3Blue1Brown per tutta l'app: palette di Manim, frecce con punta piena, scritte in LaTeX classico.
export class Painter {
  constructor(ctx, cam, colors) { this.ctx = ctx; this.cam = cam; this.M = palette(colors); this.c = manimColors(colors, this.M); }

  col(k) { return this.c[k] ?? k; }
  S(x, y) { return this.cam.toScreen(x, y); }

  line(pts, { color = 'text', width = 2, dash = null, alpha = 1 } = {}) {
    if (pts.length < 2) return;
    const ctx = this.ctx;
    ctx.save();
    // Tratti un po' più decisi di quanto chiesto (STROKE): le linee della scena devono reggere il confronto con la griglia.
    ctx.globalAlpha = alpha; ctx.strokeStyle = this.col(color); ctx.lineWidth = width * STROKE;
    ctx.lineJoin = ctx.lineCap = 'round';
    if (dash) ctx.setLineDash(dash.map(d => d * STROKE));
    ctx.beginPath();
    pts.forEach(([x, y], i) => { const [a, b] = this.S(x, y); i ? ctx.lineTo(a, b) : ctx.moveTo(a, b); });
    ctx.stroke();
    ctx.restore();
  }

  poly(pts, { fill, stroke, width = 1.5, alpha = 1 } = {}) {
    const ctx = this.ctx;
    ctx.save();
    ctx.globalAlpha = alpha; ctx.lineJoin = 'round';
    ctx.beginPath();
    pts.forEach(([x, y], i) => { const [a, b] = this.S(x, y); i ? ctx.lineTo(a, b) : ctx.moveTo(a, b); });
    ctx.closePath();
    if (fill) { ctx.fillStyle = this.col(fill); ctx.fill(); }
    if (stroke) { ctx.strokeStyle = this.col(stroke); ctx.lineWidth = width; ctx.stroke(); }
    ctx.restore();
  }

  circle(x, y, r, { fill, stroke, width = 1.5, alpha = 1 } = {}) {
    const ctx = this.ctx, [a, b] = this.S(x, y);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.beginPath(); ctx.arc(a, b, r, 0, Math.PI * 2);
    if (fill) { ctx.fillStyle = this.col(fill); ctx.fill(); }
    if (stroke) { ctx.strokeStyle = this.col(stroke); ctx.lineWidth = width; ctx.stroke(); }
    ctx.restore();
  }

  // Arco attorno a (x, y) con raggio in px; angoli matematici (antiorari da +x) in radianti.
  arc(x, y, r, a0, a1, { color = 'muted', width = 1.5, label, labelR } = {}) {
    const ctx = this.ctx, [a, b] = this.S(x, y);
    ctx.save();
    ctx.strokeStyle = this.col(color); ctx.lineWidth = width;
    ctx.beginPath(); ctx.arc(a, b, r, -a0, -a1, true); ctx.stroke();
    ctx.restore();
    if (label) {
      const m = (a0 + a1) / 2, R = labelR ?? r + 12;
      this.textS(a + Math.cos(m) * R, b - Math.sin(m) * R, label, { color, align: 'center' });
    }
  }

  arrow(x0, y0, x1, y1, { color = 'vel', width = 3.5, label, dash = null, alpha = 1, head = 13 } = {}) {
    const [a, b] = this.S(x0, y0), [c, d] = this.S(x1, y1), col = this.col(color);
    const tip = arrowS(this.ctx, a, b, c, d, col, { width: Math.max(2.5, width), tip: Math.max(12, head + 3), alpha, halo: this.M.bg, dash });
    if (tip && label && tip.len > 18) arrowLabel(this, tip, vecLabel(label), col, this.M, alpha);
  }

  text(x, y, str, opts) { const [a, b] = this.S(x, y); this.textS(a, b, str, opts); }

  // Scritte della scena in LaTeX classico; ui: true per le didascalie nel font dell'interfaccia.
  textS(a, b, str, { color = 'text', size = 14, align = 'left', baseline = 'middle', weight = 600, dx = 0, dy = 0, italic = false, ui = false } = {}) {
    if (!ui) { tex(this, a + dx, b + dy, textToTeX(str), { size: size + 3, color: this.col(color), align, halo: this.M.bg }); return; }
    const ctx = this.ctx;
    ctx.save();
    ctx.font = `${italic ? 'italic ' : ''}${weight} ${size}px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
    ctx.textAlign = align; ctx.textBaseline = baseline;
    ctx.lineJoin = 'round'; ctx.lineWidth = 4; ctx.strokeStyle = this.c.bg;
    ctx.strokeText(str, a + dx, b + dy);
    ctx.fillStyle = this.col(color);
    ctx.fillText(str, a + dx, b + dy);
    ctx.restore();
  }

  // Contorno tratteggiato di un oggetto selezionato (coordinate schermo).
  ringS(a, b, r) {
    const ctx = this.ctx;
    ctx.save();
    ctx.strokeStyle = this.c.handle; ctx.lineWidth = 2; ctx.setLineDash([6, 5]);
    ctx.beginPath(); ctx.arc(a, b, r, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }

  // Maniglia quadrata per ingrandire/rimpicciolire, con le due frecce diagonali (coordinate schermo).
  sizeHandleS(a, b, active = false) {
    const ctx = this.ctx, h = active ? 12 : 10;
    ctx.save();
    ctx.fillStyle = this.c.bg; ctx.strokeStyle = this.c.handle; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.roundRect ? ctx.roundRect(a - h, b - h, 2 * h, 2 * h, 4) : ctx.rect(a - h, b - h, 2 * h, 2 * h);
    ctx.fill(); ctx.stroke();
    ctx.lineWidth = 1.8; ctx.lineCap = 'round';
    const q = h * 0.5;
    ctx.beginPath();
    ctx.moveTo(a - q, b - q); ctx.lineTo(a + q, b + q);
    ctx.moveTo(a - q, b - q); ctx.lineTo(a - q + 4, b - q); ctx.moveTo(a - q, b - q); ctx.lineTo(a - q, b - q + 4);
    ctx.moveTo(a + q, b + q); ctx.lineTo(a + q - 4, b + q); ctx.moveTo(a + q, b + q); ctx.lineTo(a + q, b + q - 4);
    ctx.stroke();
    ctx.restore();
  }

  // Maniglia di ridimensionamento in coordinate mondo.
  sizeHandle(x, y, active) { const [a, b] = this.S(x, y); this.sizeHandleS(a, b, active); }

  // Maniglia trascinabile (anello).
  handle(x, y, active = false) {
    this.circle(x, y, active ? 13 : 10, { fill: this.c.bg, stroke: 'handle', width: 2.5, alpha: 0.95 });
    this.circle(x, y, 3.5, { fill: 'handle' });
  }

  // Suolo: linea netta con il tratteggio obliquo sotto, come nei diagrammi.
  ground(y0 = 0) { groundM(this, this.M, y0); }
}

// Fondo della scena alla Manim: quasi nero (o carta) con la griglia del NumberPlane.
// labels: numeri delle linee principali lungo i bordi sinistro e inferiore dell'area libera.
export function drawGrid(ctx, cam, c, labels = true) {
  const M = palette(c);
  ctx.fillStyle = M.bg;
  ctx.fillRect(0, 0, cam.w, cam.h);
  drawPlaneGrid(ctx, cam, M);
  if (!labels) return;
  const pad = cam.padFn?.() ?? { top: 70, right: 20, bottom: 20, left: 20 };
  const step = niceStep(80 / cam.scale), { x0, y0, x1, y1 } = cam.bounds();
  const dec = Math.max(0, -Math.floor(Math.log10(step) + 1e-9));
  const lab = v => { const u = Math.abs(v) < 1e-9 ? 0 : v; return (u < 0 ? '−' : '') + Math.abs(u).toFixed(dec).replace('.', ',') + '\\ \\mathrm{m}'; };
  const P = { ctx };
  for (let x = Math.ceil(x0 / step) * step; x <= x1; x += step) {
    const [a] = cam.toScreen(x, 0);
    if (a < pad.left + 24 || a > cam.w - pad.right - 24) continue;
    tex(P, a, cam.h - pad.bottom - 10, lab(x), { size: 13, color: M.muted, halo: M.bg, alpha: 0.85 });
  }
  for (let y = Math.ceil(y0 / step) * step; y <= y1; y += step) {
    const [, b] = cam.toScreen(0, y);
    if (b < pad.top + 16 || b > cam.h - pad.bottom - 30) continue;
    tex(P, pad.left + 8, b - 9, lab(y), { size: 13, color: M.muted, halo: M.bg, align: 'left', alpha: 0.85 });
  }
}

// Assi cartesiani con l'origine in (0, 0), tacche numerate e frecce con il nome dell'asse.
// Se l'origine esce dall'area visibile, l'asse resta appoggiato al bordo (come nei grafici).
// k converte i metri nell'unità mostrata (100 per i centimetri).
export function drawAxes(P, { unit = 'm', k = 1 } = {}) {
  const { ctx, cam } = P, c = P.c;
  const pad = cam.padFn?.() ?? { top: 70, right: 20, bottom: 20, left: 20 };
  const L = pad.left + 8, R = cam.w - pad.right - 8, T = pad.top - 6, Bm = cam.h - pad.bottom + 6;
  let [ox, oy] = cam.toScreen(0, 0);
  const pinX = ox < L + 30 || ox > R - 30, pinY = oy < T + 30 || oy > Bm - 20;
  ox = Math.min(Math.max(ox, L + 30), R - 30);
  oy = Math.min(Math.max(oy, T + 30), Bm - 20);
  const step = niceStep(80 / cam.scale);
  const dec = Math.max(0, -Math.floor(Math.log10(step * k) + 1e-9));
  const lab = v => { const u = Math.abs(v) < 1e-9 ? 0 : v * k; return u.toFixed(dec).replace('.', ','); };
  ctx.save();
  ctx.strokeStyle = ctx.fillStyle = c.axis; ctx.lineWidth = 1.6;
  ctx.beginPath(); ctx.moveTo(L, oy); ctx.lineTo(R, oy); ctx.moveTo(ox, Bm); ctx.lineTo(ox, T); ctx.stroke();
  const head = (x, y, dx, dy) => { ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - dx * 9 - dy * 4, y - dy * 9 + dx * 4); ctx.lineTo(x - dx * 9 + dy * 4, y - dy * 9 - dx * 4); ctx.closePath(); ctx.fill(); };
  head(R, oy, 1, 0); head(ox, T, 0, -1);
  ctx.font = '500 11px -apple-system, BlinkMacSystemFont, sans-serif'; ctx.fillStyle = c.muted;
  const { x0, y0, x1, y1 } = cam.bounds();
  ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  ctx.beginPath();
  for (let x = Math.ceil(x0 / step) * step; x <= x1; x += step) {
    const [a] = cam.toScreen(x, 0);
    if (a < L + 4 || a > R - 18 || Math.abs(a - ox) < 3) continue;
    ctx.moveTo(a, oy - 4); ctx.lineTo(a, oy + 4);
    ctx.fillText(lab(x), a, oy + 7);
  }
  ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
  for (let y = Math.ceil(y0 / step) * step; y <= y1; y += step) {
    const [, b] = cam.toScreen(0, y);
    if (b < T + 18 || b > Bm - 4 || Math.abs(b - oy) < 3) continue;
    ctx.moveTo(ox - 4, b); ctx.lineTo(ox + 4, b);
    ctx.fillText(lab(y), ox - 7, b);
  }
  ctx.strokeStyle = c.axis; ctx.lineWidth = 1.2; ctx.stroke();
  ctx.font = 'italic 600 14px Georgia, "Times New Roman", serif'; ctx.fillStyle = c.text;
  ctx.textAlign = 'right'; ctx.textBaseline = 'bottom'; ctx.fillText(`x (${unit})`, R - 4, oy - 6);
  ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.fillText(`y (${unit})`, ox + 8, T + 2);
  if (!pinX && !pinY) { ctx.textAlign = 'right'; ctx.textBaseline = 'top'; ctx.font = '500 11px -apple-system, sans-serif'; ctx.fillStyle = c.muted; ctx.fillText('0', ox - 5, oy + 5); }
  ctx.restore();
}

// Durante un trascinamento: linee guida quando l'oggetto è allineato a un altro (vx: verticale, hy: orizzontale)
// e un'etichetta con le coordinate, sopra l'oggetto.
export function dragGuides(P, { x, y, vx = null, hy = null, text }) {
  const { ctx, cam } = P, c = P.c;
  ctx.save();
  ctx.strokeStyle = c.handle; ctx.lineWidth = 1.3; ctx.setLineDash([6, 5]); ctx.globalAlpha = 0.9;
  ctx.beginPath();
  if (vx != null) { const [a] = cam.toScreen(vx, 0); ctx.moveTo(a, 0); ctx.lineTo(a, cam.h); }
  if (hy != null) { const [, b] = cam.toScreen(0, hy); ctx.moveTo(0, b); ctx.lineTo(cam.w, b); }
  ctx.stroke();
  ctx.restore();
  const [a, b] = cam.toScreen(x, y);
  ctx.save();
  ctx.font = '600 13px -apple-system, BlinkMacSystemFont, sans-serif';
  const w = ctx.measureText(text).width + 18, h = 26, bx = a - w / 2, by = b - 58;
  ctx.fillStyle = c.handle; ctx.globalAlpha = 0.95;
  ctx.beginPath(); ctx.roundRect ? ctx.roundRect(bx, by, w, h, 8) : ctx.rect(bx, by, w, h); ctx.fill();
  ctx.globalAlpha = 1; ctx.fillStyle = c.bg; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(text, a, by + h / 2 + 0.5);
  ctx.restore();
}

// Allineamento magnetico: se x (o y) è entro tol da quello di un altro punto, vi si aggancia.
export function alignTo(x, y, others, tol) {
  let vx = null, hy = null, bx = tol, by = tol;
  for (const [ox, oy] of others) {
    if (Math.abs(ox - x) < bx) { bx = Math.abs(ox - x); vx = ox; }
    if (Math.abs(oy - y) < by) { by = Math.abs(oy - y); hy = oy; }
  }
  return { x: vx ?? x, y: hy ?? y, vx, hy };
}
