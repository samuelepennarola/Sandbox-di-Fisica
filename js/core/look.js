// Ambiente e meccanismi disegnati in codice (cielo, terreno, piani, molle, funi, carrucole),
// più le animazioni leggere (polvere, scie). Stesso stile piatto con contorno e stessa palette di shapes.js,
// che resta il kit delle sagome degli oggetti (casse, palle, ruote, persone, veicoli).
import { palette } from './shapes.js';

export const look = { t: 0, live: false, particles: [] };

// Colori dei corpi del costruttore, in ordine di creazione (nomi della palette di shapes.js).
// Niente "wood" in testa: i piani sono di legno e una cassa di legno ci sparirebbe sopra.
export const BODY_COLORS = ['blue', 'red', 'green', 'yellow', 'wood'];

const hash = i => { const s = Math.sin(i * 12.9898) * 43758.5453; return s - Math.floor(s); };

/* ---------------- Animazioni ---------------- */

export function updateLook(dt) {
  look.t += dt;
  if (!look.particles.length) return;
  for (const p of look.particles) {
    p.x += p.vx * dt; p.y += p.vy * dt;
    p.vy -= 0.8 * dt; p.vx *= 1 - 2 * dt;
    p.life -= dt;
  }
  look.particles = look.particles.filter(p => p.life > 0);
}

// Polvere sollevata da un corpo che striscia: (ux, uy) è il verso del moto, amount ~ particelle per fotogramma.
export function dust(x, y, ux, uy, amount) {
  if (!look.live || look.particles.length > 260) return;
  let n = Math.floor(amount) + (Math.random() < amount % 1 ? 1 : 0);
  while (n-- > 0) {
    const k = 0.25 + Math.random() * 0.5;
    look.particles.push({
      x, y, vx: -ux * k + (Math.random() - 0.5) * 0.3, vy: -uy * k + 0.15 + Math.random() * 0.35,
      life: 0.5 + Math.random() * 0.6, max: 1.1, r: 1.8 + Math.random() * 2.6,
    });
  }
}

export function drawParticles(P) {
  for (const p of look.particles) P.circle(p.x, p.y, p.r * (1.4 - p.life / p.max * 0.4), { fill: 'dust', alpha: 0.55 * p.life / p.max });
}

// Scia che sfuma verso il passato.
export function trail(P, pts, color = 'vel', width = 3) {
  const n = pts.length;
  if (n < 2) return;
  const chunk = Math.max(2, Math.ceil(n / 36));
  for (let i = 0; i < n - 1; i += chunk) P.line(pts.slice(i, i + chunk + 1), { color, width, alpha: 0.12 + 0.55 * (i / n) });
}

/* ---------------- Utilità ---------------- */

function rr(ctx, x, y, w, h, r) {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

/* ---------------- Ambiente ---------------- */

export function drawSky(ctx, cam, c) {
  const g = ctx.createLinearGradient(0, 0, 0, cam.h);
  g.addColorStop(0, c.skyTop); g.addColorStop(1, c.skyBottom);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, cam.w, cam.h);
}

// Terreno sotto y0: prato con ciuffi e terra con sassolini, fissati al mondo (scorrono con la scena).
export function drawGround(P, y0 = 0) {
  const { ctx, cam, c } = P, pal = palette(), [, sy] = P.S(0, y0);
  if (sy > cam.h) return;
  const top = Math.max(sy, -10);
  ctx.save();
  const g = ctx.createLinearGradient(0, top, 0, Math.min(cam.h, top + 320));
  g.addColorStop(0, c.soil); g.addColorStop(1, c.soilDark);
  ctx.fillStyle = g;
  ctx.fillRect(0, top, cam.w, cam.h - top);

  const { x0, x1 } = cam.bounds();
  const sp = 0.35;
  if (sp * cam.scale >= 7) {
    ctx.fillStyle = c.soilDark; ctx.globalAlpha = 0.4;
    for (let i = Math.floor(x0 / sp); i * sp <= x1; i++) {
      const [px, py] = P.S(i * sp + hash(i + 7) * sp, y0 - 0.15 - hash(i) * 1.4);
      if (py > cam.h) continue;
      ctx.beginPath(); ctx.ellipse(px, py, 2 + hash(i + 3) * 3, 1.5 + hash(i + 5) * 2, 0, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  const band = 8;
  ctx.fillStyle = pal.grass;
  ctx.fillRect(0, sy, cam.w, band);
  const blade = 0.12;
  if (blade * cam.scale >= 5) {
    ctx.fillStyle = pal.grassEdge;
    ctx.beginPath();
    for (let i = Math.floor(x0 / blade); i * blade <= x1; i++) {
      const [px] = P.S(i * blade + hash(i) * blade * 0.6, 0), hgt = 3 + hash(i + 11) * 5;
      ctx.moveTo(px - 2, sy + 1); ctx.lineTo(px, sy - hgt); ctx.lineTo(px + 2, sy + 1);
    }
    ctx.fill();
  }
  ctx.strokeStyle = pal.grassEdge; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(0, sy + band); ctx.lineTo(cam.w, sy + band); ctx.stroke();
  ctx.restore();
}

/* ---------------- Strutture fisse ---------------- */

// Lastra di legno (piano inclinato, superficie): venature diagonali e bordo d'appoggio evidenziato.
export function slab(P, pts, { topEdge, selected = false } = {}) {
  const { ctx, c } = P, pal = palette(), sp = pts.map(p => P.S(p[0], p[1]));
  const path = () => { ctx.beginPath(); sp.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath(); };
  const xs = sp.map(p => p[0]), ys = sp.map(p => p[1]);
  ctx.save();
  ctx.lineJoin = 'round';
  path(); ctx.fillStyle = pal.wood; ctx.fill();
  ctx.save();
  path(); ctx.clip();
  ctx.strokeStyle = pal.woodDark; ctx.globalAlpha = 0.35; ctx.lineWidth = 1.5;
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  ctx.beginPath();
  for (let x = x0 - (y1 - y0); x < x1; x += 12) { ctx.moveTo(x, y1); ctx.lineTo(x + (y1 - y0) * 0.35, y0); }
  ctx.stroke();
  ctx.restore();
  path(); ctx.strokeStyle = selected ? c.handle : pal.outline; ctx.lineWidth = selected ? 3 : 1.5; ctx.stroke();
  if (topEdge) {
    const [a, b] = topEdge.map(p => P.S(p[0], p[1]));
    ctx.strokeStyle = pal.woodDark; ctx.lineWidth = 3.5; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
    ctx.strokeStyle = pal.highlight; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(a[0], a[1] + 2.5); ctx.lineTo(b[0], b[1] + 2.5); ctx.stroke();
  }
  ctx.restore();
}

// Torre di mattoni tra x0 e x1, da y0 a y1 (coordinate mondo).
export function bricks(P, x0, x1, y0, y1) {
  const { ctx, c } = P, pal = palette(), [a, b] = P.S(x0, y1), [cc, d] = P.S(x1, y0);
  const W = cc - a, H = d - b;
  if (W < 2 || H < 2) return;
  ctx.save();
  ctx.fillStyle = c.brick; ctx.fillRect(a, b, W, H);
  ctx.beginPath(); ctx.rect(a, b, W, H); ctx.clip();
  ctx.strokeStyle = pal.highlight; ctx.globalAlpha = 0.6; ctx.lineWidth = 1;
  const rh = 9, bw = 20;
  ctx.beginPath();
  for (let y = d, row = 0; y > b; y -= rh, row++) {
    ctx.moveTo(a, y); ctx.lineTo(cc, y);
    for (let x = a + (row % 2 ? bw / 2 : 0); x < cc; x += bw) { ctx.moveTo(x, y); ctx.lineTo(x, y - rh); }
  }
  ctx.stroke();
  ctx.restore();
  ctx.save();
  ctx.strokeStyle = pal.outline; ctx.lineWidth = 1.5; ctx.strokeRect(a, b, W, H);
  ctx.restore();
}

// Piastra di ancoraggio con bulloni e anello di aggancio in (x, y).
export function anchorPlate(P, x, y, { selected = false } = {}) {
  const { ctx, c } = P, pal = palette(), [cx, cy] = P.S(x, y);
  ctx.save();
  rr(ctx, cx - 14, cy - 14, 28, 8, 2.5);
  ctx.fillStyle = pal.metal; ctx.fill(); ctx.strokeStyle = pal.outline; ctx.lineWidth = 1.5; ctx.stroke();
  ctx.fillStyle = pal.metalDark;
  for (const dx of [-8, 8]) { ctx.beginPath(); ctx.arc(cx + dx, cy - 10, 1.7, 0, Math.PI * 2); ctx.fill(); }
  ctx.strokeStyle = pal.metalDark; ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.moveTo(cx, cy - 6); ctx.lineTo(cx, cy - 3); ctx.stroke();
  ctx.strokeStyle = selected ? c.handle : pal.metalDark; ctx.lineWidth = selected ? 3 : 2.2;
  ctx.beginPath(); ctx.arc(cx, cy, 3.5, 0, Math.PI * 2); ctx.stroke();
  ctx.restore();
}

// Carrucola: staffa al soffitto e ruota metallica con gola e raggi; angle = rotazione (rad, antioraria).
export function pulley(P, x, y, rWorld, angle = 0, { selected = false } = {}) {
  const { ctx, c } = P, pal = palette(), [cx, cy] = P.S(x, y), r = Math.max(6, rWorld * P.cam.scale);
  ctx.save();
  ctx.lineCap = 'round';
  ctx.strokeStyle = pal.metalDark; ctx.lineWidth = 4;
  ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx, cy - r - 18); ctx.stroke();
  rr(ctx, cx - 16, cy - r - 25, 32, 8, 2.5);
  ctx.fillStyle = pal.metal; ctx.fill(); ctx.strokeStyle = pal.outline; ctx.lineWidth = 1.5; ctx.stroke();

  ctx.translate(cx, cy);
  ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fillStyle = pal.metal; ctx.fill();
  ctx.strokeStyle = selected ? c.handle : pal.outline; ctx.lineWidth = selected ? 3 : 1.5; ctx.stroke();
  ctx.strokeStyle = pal.metalDark; ctx.lineWidth = Math.max(1.5, r * 0.12);
  ctx.beginPath(); ctx.arc(0, 0, r * 0.82, 0, Math.PI * 2); ctx.stroke();
  ctx.rotate(-angle);
  ctx.lineWidth = Math.max(1.5, r * 0.1);
  ctx.beginPath();
  for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2; ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a) * r * 0.76, Math.sin(a) * r * 0.76); }
  ctx.stroke();
  // Segno colorato sul bordo: rende visibile la rotazione.
  ctx.fillStyle = pal.yellow;
  ctx.beginPath(); ctx.arc(r * 0.6, 0, Math.max(1.5, r * 0.1), 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = pal.metalDark;
  ctx.beginPath(); ctx.arc(0, 0, Math.max(2.5, r * 0.18), 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

/* ---------------- Collegamenti ---------------- */

// Molla metallica a elica: spire posteriori più scure; diventa rossa se allungata, blu se compressa.
export function spring(P, a, b, strain = 0, { selected = false } = {}) {
  const { ctx, c } = P, [x0, y0] = P.S(a[0], a[1]), [x1, y1] = P.S(b[0], b[1]);
  const L = Math.hypot(x1 - x0, y1 - y0);
  if (L < 3) return;
  const ux = (x1 - x0) / L, uy = (y1 - y0) / L, nx = -uy, ny = ux;
  const k = Math.min(1, Math.abs(strain) * 2), hue = strain >= 0 ? 4 : 214;
  const D = document.documentElement.dataset.theme === 'dark' ? 8 : 0;
  const front = `hsl(${hue} ${12 + 68 * k}% ${62 + D}%)`, back = `hsl(${hue} ${10 + 52 * k}% ${38 + D}%)`;
  // Raggio delle spire ~9 cm nel mondo (cresce con lo zoom), con limiti per restare leggibile.
  const coils = 10, lead = Math.min(14, L * 0.12), amp = Math.max(5, Math.min(18, 0.09 * P.cam.scale, L * 0.12));
  const N = coils * 16, pts = [];
  for (let i = 0; i <= N; i++) {
    const t = lead + (L - 2 * lead) * i / N, ph = (i / N) * coils * Math.PI * 2;
    pts.push([x0 + ux * t + nx * amp * Math.sin(ph), y0 + uy * t + ny * amp * Math.sin(ph), Math.cos(ph)]);
  }
  ctx.save();
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  if (selected) {
    ctx.strokeStyle = c.handle; ctx.lineWidth = 8; ctx.globalAlpha = 0.45;
    ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke();
    ctx.globalAlpha = 1;
  }
  const seg = (cond, color, w) => {
    ctx.strokeStyle = color; ctx.lineWidth = w; ctx.beginPath();
    for (let i = 1; i < pts.length; i++) if (cond(pts[i][2])) { ctx.moveTo(pts[i - 1][0], pts[i - 1][1]); ctx.lineTo(pts[i][0], pts[i][1]); }
    ctx.stroke();
  };
  ctx.strokeStyle = back; ctx.lineWidth = 2.8;
  ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x0 + ux * lead, y0 + uy * lead);
  ctx.moveTo(x1, y1); ctx.lineTo(x1 - ux * lead, y1 - uy * lead); ctx.stroke();
  const lw = Math.max(2.6, amp * 0.3);
  seg(z => z < 0, back, lw * 0.9);
  seg(z => z >= 0, front, lw);
  for (const [x, y] of [[x0, y0], [x1, y1]]) { ctx.fillStyle = back; ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2); ctx.fill(); }
  ctx.restore();
}

// Fune intrecciata lungo una polilinea (coordinate mondo).
export function rope(P, pts, { slack = false, selected = false } = {}) {
  if (pts.length < 2) return;
  const pal = palette();
  if (selected) P.line(pts, { color: 'handle', width: 9, alpha: 0.45 });
  P.line(pts, { color: pal.outline, width: 5.5, alpha: slack ? 0.6 : 0.9 });
  P.line(pts, { color: 'tension', width: 3.5, alpha: slack ? 0.75 : 1 });
  P.line(pts, { color: pal.highlight, width: 1.4, dash: [2, 5] });
}
