// Diagramma di corpo libero per gli esperimenti pronti, come nel costruttore.
// Un esperimento dichiara i suoi corpi con exp.bodies(s, p, { scale, size }):
//   [{ key, name, x, y, rPx, m, forces: [{ name, fx, fy, color }], a: [ax, ay], v: [vx, vy],
//      proj?: (x, y, z) → [X, Y], z?, noResize?, note? }]
// (x, y) è il centro disegnato (in 3D già proiettato), rPx il raggio d'ingombro per il tocco. proj, se c'è,
// proietta le direzioni delle forze (vista 3D): le componenti restano nel piano dell'esperimento.
// Toccando un corpo, main.js lo seleziona e qui si disegnano le sue forze, la velocità e la scia a richiesta.
import { palette, tex, arrowS } from './manim.js';
import { arrowPx } from './annot.js';
import { tn } from './math.js';
import { uq } from './units.js';
import { fc } from './annot.js';

// Punta di un vettore lungo L px nella direzione (ux, uy) del piano, tenendo conto dell'eventuale proiezione 3D.
function tipPx(P, b, ux, uy, L) {
  const [a, c] = P.S(b.x, b.y);
  if (!b.proj) return [a + ux * L, c - uy * L];
  // Direzione proiettata: si proietta un piccolo passo e si normalizza sullo schermo.
  const z = b.z ?? 0, [x0, y0] = b.proj(b.wx ?? 0, b.wy ?? 0, z), [x1, y1] = b.proj((b.wx ?? 0) + ux * 0.01, (b.wy ?? 0) + uy * 0.01, z);
  const dx = (x1 - x0) * P.cam.scale, dy = -(y1 - y0) * P.cam.scale, n = Math.hypot(dx, dy) || 1;
  return [a + dx / n * L, c + dy / n * L];
}

// Le forze sul corpo selezionato: frecce dal centro, scala compressa comune (la più intensa è la più lunga).
export function drawFBD(P, b, { alpha = 1 } = {}) {
  const M = P.M ?? palette(P.c), ctx = P.ctx;
  const fs = (b.forces ?? []).filter(f => Math.hypot(f.fx, f.fy) > 1e-9);
  if (!fs.length) return;
  const Fmax = Math.max(...fs.map(f => Math.hypot(f.fx, f.fy)));
  const [a, c] = P.S(b.x, b.y), placed = [];
  for (const f of fs) {
    const F = Math.hypot(f.fx, f.fy), L = Math.max(30, arrowPx(F, Fmax, { min: 30, max: 110 })) + b.rPx * 0.2;
    const [ex, ey] = tipPx(P, b, f.fx / F, f.fy / F, L), col = P.col(f.color);
    arrowS(ctx, a, c, ex, ey, col, { width: 3, tip: 12, alpha, halo: M.bg });
    // Nome oltre la punta; se si sovrappone a uno già scritto scivola di lato.
    const ux = (ex - a) / L, uy = (ey - c) / L;
    let lx = ex + ux * 16, ly = ey + uy * 16;
    for (let k = 0; k < 4 && placed.some(([px, py]) => Math.hypot(px - lx, py - ly) < 22); k++) { lx += -uy * 14; ly += ux * 14; }
    placed.push([lx, ly]);
    tex(P, lx, ly, `\\vec ${f.name.length > 1 && !f.name.startsWith('\\') ? `{${f.name}}` : f.name}`, { size: 17, color: col, halo: M.bg, alpha });
  }
}

// Velocità di un corpo (a richiesta), tratteggiata per distinguerla dalle forze.
export function drawVel(P, b, vref = 5) {
  const v = Math.hypot(b.v?.[0] ?? 0, b.v?.[1] ?? 0);
  if (v < 1e-3) return;
  const M = P.M ?? palette(P.c), L = arrowPx(v, vref, { min: 30, max: 110 }) + b.rPx * 0.2;
  const [a, c] = P.S(b.x, b.y), [ex, ey] = tipPx(P, b, b.v[0] / v, b.v[1] / v, L);
  arrowS(P.ctx, a, c, ex, ey, M.vec.vel, { width: 2.4, tip: 11, dash: [6, 4], halo: M.bg });
  tex(P, ex + (ex - a) / L * 14, ey + (ey - c) / L * 14, '\\vec v', { size: 16, color: M.vec.vel, halo: M.bg });
}

// Scia: le posizioni passate (in coordinate disegnate), che sfumano verso il passato.
export function drawTrail(P, pts, color) {
  if (pts.length < 2) return;
  const n = pts.length, chunk = Math.max(2, Math.ceil(n / 30));
  for (let i = 0; i < n - 1; i += chunk) P.line(pts.slice(i, i + chunk + 1), { color, width: 2, alpha: 0.12 + 0.55 * (i / n) });
}

// Righe per le formule: forze in componenti, risultante e confronto con m·a.
export function fbdFormulas(b) {
  const fs = (b.forces ?? []).filter(f => Math.hypot(f.fx, f.fy) > 1e-9);
  const sx = fs.reduce((s, f) => s + f.fx, 0), sy = fs.reduce((s, f) => s + f.fy, 0);
  const col = f => fc(f.color) ?? f.color;
  const comp = (x, y) => `(${tn(x, 2)};\\ ${tn(y, 2)})\\ \\mathrm{N}`;
  // Il titolo è testo dell'interfaccia: via l'eventuale \text{...} usato per la scena.
  const title = (b.title ?? 'corpo selezionato').replace(/\\text\{([^}]*)\}/g, '$1');
  const rows = [{ h: `Corpo libero: ${title}` }];
  for (const f of fs) rows.push({ tex: `\\textcolor{${col(f)}}{\\vec ${f.name.length > 1 && !f.name.startsWith('\\') ? `{${f.name}}` : f.name}}=${comp(f.fx, f.fy)}` });
  rows.push({ tex: `\\sum\\vec F=${comp(sx, sy)}` });
  if (b.a && b.m) rows.push({ tex: `m\\vec a=${uq('kg', b.m)}\\cdot(${tn(b.a[0], 2)};\\ ${tn(b.a[1], 2)})\\ \\mathrm{m/s^2}=${comp(b.m * b.a[0], b.m * b.a[1])}` });
  if (b.note) rows.push({ tex: b.note, cls: 'warn' });
  return rows;
}
