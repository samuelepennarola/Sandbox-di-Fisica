// Spazio 3D essenziale in stile ThreeDScene di 3Blue1Brown:
// con Reticolo 3D disattivo restano i soli ThreeDAxes ortogonali; se attivo aggiunge una griglia volumetrica 3D (x, y, z).
import { palette } from './manim.js';
import { floor as floor3d, lattice3d, is3dActive } from './manim3d.js';
import { store } from './store.js';

let lattice = !!store.get('space3d.lattice', false);
export const isLattice3d = () => lattice;
export function setLattice3d(v) {
  lattice = !!v;
  store.set('space3d.lattice', lattice);
}

export function space3d(P, V, { origin = [0, 0, 0], up = 'y', step = 1, n = 24, alpha = 1 } = {}) {
  const k = V.tilt(0.1) * alpha;
  if (k <= 0.001) return;
  if (is3dActive()) {
    floor3d({ up, step });
    if (lattice) lattice3d({ origin, step, alpha });
    return;
  }
  if (!lattice) return;
  const M = P.M ?? palette(P.c), ctx = P.ctx, R = n * step, [ox, oy, oz] = origin;
  const fade = d => { const u = Math.max(0, 1 - d / R); return u * u; };
  const at = (q, ax, v) => { q[ax === 'x' ? 0 : ax === 'y' ? 1 : 2] = v; return q; };
  const seg = 2 * step;
  ctx.save();
  ctx.strokeStyle = M.axis; ctx.lineWidth = 1.4; ctx.lineCap = 'round';
  for (const ax of ['x', 'y', 'z']) {
    for (let t0 = -R; t0 < R; t0 += seg) {
      const t1 = Math.min(R, t0 + seg), a0 = fade(Math.abs((t0 + t1) / 2)) * (t0 >= 0 ? 0.75 : 0.4);
      if (a0 < 0.02) continue;
      const q0 = at([ox, oy, oz], ax, (ax === 'x' ? ox : ax === 'y' ? oy : oz) + t0);
      const q1 = at([ox, oy, oz], ax, (ax === 'x' ? ox : ax === 'y' ? oy : oz) + t1);
      ctx.globalAlpha = k * a0;
      ctx.beginPath(); ctx.moveTo(...P.S(...V.p(...q0))); ctx.lineTo(...P.S(...V.p(...q1))); ctx.stroke();
    }
  }
  ctx.restore();
}
