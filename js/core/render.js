import { niceStep } from './math.js';
import { drawGround } from './look.js';

const COLOR_KEYS = ['bg', 'grid', 'gridMajor', 'axis', 'text', 'muted', 'ink', 'inkRed', 'inkBlue', 'inkGreen',
  'vel', 'acc', 'weight', 'normal', 'friction', 'ground', 'groundEdge', 'body', 'bodyEdge', 'ideal', 'handle',
  'tension', 'spring', 'applied', 'skyTop', 'skyBottom', 'soil', 'soilDark', 'dust', 'brick'];

export function readColors() {
  const cs = getComputedStyle(document.documentElement);
  const out = {};
  for (const k of COLOR_KEYS) out[k] = cs.getPropertyValue('--c-' + k.replace(/[A-Z]/g, m => '-' + m.toLowerCase())).trim();
  return out;
}

// Disegno in coordinate mondo: le dimensioni grafiche (spessori, font, raggi) sono in px.
export class Painter {
  constructor(ctx, cam, colors) { this.ctx = ctx; this.cam = cam; this.c = colors; }

  col(k) { return this.c[k] ?? k; }
  S(x, y) { return this.cam.toScreen(x, y); }

  line(pts, { color = 'text', width = 2, dash = null, alpha = 1 } = {}) {
    if (pts.length < 2) return;
    const ctx = this.ctx;
    ctx.save();
    ctx.globalAlpha = alpha; ctx.strokeStyle = this.col(color); ctx.lineWidth = width;
    ctx.lineJoin = ctx.lineCap = 'round';
    if (dash) ctx.setLineDash(dash);
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
    const ctx = this.ctx;
    const [a, b] = this.S(x0, y0), [c, d] = this.S(x1, y1);
    const len = Math.hypot(c - a, d - b);
    if (len < 1.5) return;
    const ux = (c - a) / len, uy = (d - b) / len, h = Math.min(head, len * 0.6);
    const col = this.col(color);
    const headPath = () => {
      ctx.beginPath();
      ctx.moveTo(c, d);
      ctx.lineTo(c - ux * h - uy * h * 0.42, d - uy * h + ux * h * 0.42);
      ctx.lineTo(c - ux * h + uy * h * 0.42, d - uy * h - ux * h * 0.42);
      ctx.closePath();
    };
    ctx.save();
    ctx.globalAlpha = alpha; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    // Alone chiaro/scuro sotto la freccia: la stacca dagli oggetti colorati della scena.
    ctx.strokeStyle = this.c.bg; ctx.globalAlpha = alpha * 0.75;
    ctx.lineWidth = width + 4;
    ctx.beginPath(); ctx.moveTo(a, b); ctx.lineTo(c - ux * h * 0.7, d - uy * h * 0.7); ctx.stroke();
    headPath(); ctx.lineWidth = 4; ctx.stroke();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = ctx.fillStyle = col; ctx.lineWidth = width;
    if (dash) ctx.setLineDash(dash);
    ctx.beginPath(); ctx.moveTo(a, b); ctx.lineTo(c - ux * h * 0.7, d - uy * h * 0.7); ctx.stroke();
    ctx.setLineDash([]);
    headPath(); ctx.fill();
    ctx.restore();
    if (label && len > 18) this.textS(c + ux * 16, d + uy * 16, label, { color, align: 'center', weight: 700 });
  }

  text(x, y, str, opts) { const [a, b] = this.S(x, y); this.textS(a, b, str, opts); }

  textS(a, b, str, { color = 'text', size = 14, align = 'left', baseline = 'middle', weight = 600, dx = 0, dy = 0, italic = false } = {}) {
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

  // Maniglia trascinabile (anello).
  handle(x, y, active = false) {
    this.circle(x, y, active ? 13 : 10, { fill: this.c.bg, stroke: 'handle', width: 2.5, alpha: 0.95 });
    this.circle(x, y, 3.5, { fill: 'handle' });
  }

  // Suolo: tutto ciò che sta sotto y = y0 (prato e terra del kit grafico).
  ground(y0 = 0) { drawGround(this, y0); }
}

export function drawGrid(ctx, cam, c) {
  const step = niceStep(44 / cam.scale);
  const major = step * 5;
  const { x0, y0, x1, y1 } = cam.bounds();
  const lines = (s, color, width) => {
    ctx.strokeStyle = color; ctx.lineWidth = width;
    ctx.beginPath();
    for (let x = Math.ceil(x0 / s) * s; x <= x1; x += s) { const [a] = cam.toScreen(x, 0); ctx.moveTo(Math.round(a) + .5, 0); ctx.lineTo(Math.round(a) + .5, cam.h); }
    for (let y = Math.ceil(y0 / s) * s; y <= y1; y += s) { const [, b] = cam.toScreen(0, y); ctx.moveTo(0, Math.round(b) + .5); ctx.lineTo(cam.w, Math.round(b) + .5); }
    ctx.stroke();
  };
  ctx.save();
  lines(step, c.grid, 1);
  lines(major, c.gridMajor, 1);

  // Etichette delle linee principali, lungo i bordi sinistro e inferiore.
  ctx.font = '500 11px -apple-system, BlinkMacSystemFont, sans-serif';
  ctx.fillStyle = c.muted;
  const dec = Math.max(0, -Math.floor(Math.log10(major) + 1e-9));
  const lab = v => (Math.abs(v) < 1e-9 ? 0 : v).toFixed(dec).replace('.', ',');
  ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
  for (let x = Math.ceil(x0 / major) * major; x <= x1; x += major) {
    const [a] = cam.toScreen(x, 0);
    ctx.fillText(lab(x) + ' m', a, cam.h - 6);
  }
  ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  for (let y = Math.ceil(y0 / major) * major; y <= y1; y += major) {
    const [, b] = cam.toScreen(0, y);
    if (b < 70 || b > cam.h - 24) continue;
    ctx.fillText(lab(y) + ' m', 6, b - 8);
  }
  ctx.restore();
}
