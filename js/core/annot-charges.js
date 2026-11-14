// Annotazioni alla Manim per le coppie di cariche (Cariche e Costruttore): parentesi graffa con la distanza r
// e, accanto, la legge di Coulomb con i valori dal vivo. Tutto in coordinate schermo, sopra la scena.
import { tex, texBox } from './manim.js';

// Parentesi graffa (Brace di Manim) tra i punti schermo (a, b) e (c, d), sul lato (nx, ny), a distanza off px.
// grow (0..1) la fa aprire dal centro. Restituisce la punta { x, y }.
export function braceS(ctx, a, b, c, d, nx, ny, { off = 18, depth = 10, color = '#fff', width = 2, grow = 1, alpha = 1, halo = null } = {}) {
  const L0 = Math.hypot(c - a, d - b);
  const ux = (c - a) / L0, uy = (d - b) / L0, mx = (a + c) / 2 + nx * off, my = (b + d) / 2 + ny * off;
  const tip = { x: mx + nx * depth, y: my + ny * depth };
  const L = L0 * grow;
  if (L < 6) return tip;
  // Coordinate locali: s lungo il segmento (da −L/2 a L/2), h verso l'esterno (0 = base, depth = punta).
  const P = (s, h) => [mx + ux * s + nx * h, my + uy * s + ny * h];
  const half = L / 2, q = Math.min(depth, half * 0.35), hm = depth * 0.5;
  const path = () => {
    ctx.beginPath();
    ctx.moveTo(...P(-half, 0));
    ctx.quadraticCurveTo(...P(-half, hm), ...P(-half + q, hm));
    ctx.lineTo(...P(-q, hm));
    ctx.quadraticCurveTo(...P(0, hm), ...P(0, depth));
    ctx.quadraticCurveTo(...P(0, hm), ...P(q, hm));
    ctx.lineTo(...P(half - q, hm));
    ctx.quadraticCurveTo(...P(half, hm), ...P(half, 0));
  };
  ctx.save();
  ctx.lineCap = ctx.lineJoin = 'round';
  if (halo) { ctx.globalAlpha = alpha * 0.7; ctx.strokeStyle = halo; ctx.lineWidth = width + 4; path(); ctx.stroke(); }
  ctx.globalAlpha = alpha; ctx.strokeStyle = color; ctx.lineWidth = width; path(); ctx.stroke();
  ctx.restore();
  return tip;
}

// Distanza e forza di Coulomb tra due cariche (centri p1, p2 in px, raggi r1, r2 in px).
// rTeX: etichetta della distanza; lawTeX: la formula (può contenere \textcolor); avoid: punto schermo da cui
// stare lontani (per esempio il baricentro delle altre cariche) per scegliere il lato. g: avanzamento 0..1.
// keepOut: rettangoli schermo [x0, y0, x1, y1] da non coprire con le scritte (le etichette delle cariche).
export function coulombNote(P, M, { p1, p2, r1, r2, rTeX, lawTeX, avoid = null, g = 1, keepOut = [] }) {
  const [a, b] = p1, [c, d] = p2, L = Math.hypot(c - a, d - b);
  if (L < 40 || g <= 0) return;
  const ux = (c - a) / L, uy = (d - b) / L;
  // Normale verso il basso dello schermo, se possibile: sopra la carica selezionata c'è la barra dei comandi.
  let nx = uy, ny = -ux;
  if (ny < 0) { nx = -nx; ny = -ny; }
  if (Math.abs(ny) < 0.35 && avoid) {
    const mx = (a + c) / 2, my = (b + d) / 2;
    if ((avoid[0] - mx) * nx + (avoid[1] - my) * ny > 0) { nx = -nx; ny = -ny; }
  }
  // La graffa sta tra i bordi delle cariche, appena fuori dagli aloni.
  const e1 = Math.min(r1 + 4, L * 0.3), e2 = Math.min(r2 + 4, L * 0.3);
  const A = [a + ux * e1, b + uy * e1], Cc = [c - ux * e2, d - uy * e2];
  // Abbastanza lontana da non toccare le scritte delle cariche (q = … sotto ogni disco).
  const off = Math.max(r1, r2) + (Math.abs(ny) > 0.5 ? 30 : 14);
  const ease = g * g * (3 - 2 * g);
  const tip = braceS(P.ctx, A[0], A[1], Cc[0], Cc[1], nx, ny, { off, color: M.text, width: 1.8, grow: ease, alpha: 0.9, halo: M.bg });
  const alpha = Math.min(1, Math.max(0, (g - 0.35) / 0.65));
  if (alpha <= 0) return;
  // Etichetta r e formula, impilate lungo la normale (o accanto, se la normale è quasi orizzontale).
  // Se toccano le scritte delle cariche (keepOut) si allontanano un po' alla volta lungo la normale.
  const size = 16, rb = texBox(P, rTeX, size), fb = texBox(P, lawTeX, size);
  const vertical = Math.abs(ny) >= 0.5;
  const place = k => {
    if (vertical) {
      const s = Math.sign(ny), y1 = tip.y + s * (6 + k + (s < 0 ? rb.bot : -rb.top));
      const y2 = y1 + s * ((s < 0 ? -rb.top : rb.bot) + 8 + (s < 0 ? fb.bot : -fb.top));
      return [{ src: rTeX, x: tip.x, y: y1, B: rb, align: 'center' }, { src: lawTeX, x: tip.x, y: y2, B: fb, align: 'center' }];
    }
    const align = nx > 0 ? 'left' : 'right', x = tip.x + nx * (12 + k);
    return [{ src: rTeX, x, y: tip.y - (fb.bot - fb.top) / 2 - 2, B: rb, align }, { src: lawTeX, x, y: tip.y + (rb.bot - rb.top) / 2 + 4 - fb.top, B: fb, align }];
  };
  const rect = it => { const x0 = it.align === 'center' ? it.x - it.B.w / 2 : it.align === 'right' ? it.x - it.B.w : it.x; return [x0 - 3, it.y + it.B.top - 2, x0 + it.B.w + 3, it.y + it.B.bot + 2]; };
  const hits = items => items.some(it => { const r = rect(it); return keepOut.some(k => r[0] < k[2] && r[2] > k[0] && r[1] < k[3] && r[3] > k[1]); });
  let items = place(0);
  for (let k = 6; k <= 96 && hits(items); k += 6) items = place(k);
  for (const it of items) tex(P, it.x, it.y, it.src, { size, color: M.text, halo: M.bg, alpha, align: it.align });
}
