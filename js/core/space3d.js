// Spazio a quadretti "a perdita d'occhio" per la vista 3D (richiesta dell'utente, 2026-11-14): i tre piani
// coordinati che passano per l'origine (xy, xz, yz), estesi molto oltre la scena e sfumati con la distanza,
// così sembra di stare dentro la terna con la griglia che continua fino all'orizzonte. Fissi nel mondo: ruotando
// o spostando la camera la griglia non si ricalcola, si attraversa.
// Le linee si spezzano in tratti; ogni tratto prende l'opacità della sua distanza dall'origine e i tratti si
// raggruppano per opacità, così un fotogramma costa pochi stroke anche con migliaia di segmenti.
import { palette } from './manim.js';
import { floor as floor3d, is3dActive } from './manim3d.js';

const LEVELS = 10;   // gradini di opacità

// V: la camera (View3D) con p(x, y, z) → [X, Y] mondo 2D. up: l'asse verticale della scena ('y' o 'z').
// step: lato del quadretto principale (m, UA...); n: quadretti per lato (l'estensione è n·step).
export function space3d(P, V, { origin = [0, 0, 0], up = 'y', step = 1, n = 36, alpha = 1 } = {}) {
  const k = V.tilt(0.1) * alpha;
  if (k <= 0.001) return;
  if (is3dActive()) {
    floor3d({ origin, up, step, n, alpha });
    return;
  }
  const M = P.M ?? palette(P.c), ctx = P.ctx, R = n * step, [ox, oy, oz] = origin;
  const fade = d => { const u = Math.max(0, 1 - d / R); return u * u; };   // svanisce dolcemente verso l'orizzonte
  // Piani: quello perpendicolare all'asse verticale è il pavimento (più marcato), gli altri due fanno da pareti.
  const planes = [['x', 'y', 'z'], ['x', 'z', 'y'], ['y', 'z', 'x']].map(([a, b, n0]) => ({ a, b, n: n0, floor: n0 === up }));
  const at = (q, ax, v) => { q[ax === 'x' ? 0 : ax === 'y' ? 1 : 2] = v; return q; };
  const buckets = Array.from({ length: LEVELS }, () => ({ major: [], minor: [] }));
  const seg = 2 * step;   // lunghezza dei tratti in cui si spezza ogni linea
  for (const pl of planes) {
    const w = pl.floor ? 1 : 0.6;
    for (const [along, across] of [[pl.a, pl.b], [pl.b, pl.a]]) {
      for (let i = -2 * n; i <= 2 * n; i++) {
        const minor = i % 2 !== 0, c = i * step / 2;   // le linee di mezzo passo sono le suddivisioni
        if (minor && Math.abs(c) > R * 0.35) continue;   // lontano bastano le linee principali
        for (let t0 = -R; t0 < R; t0 += seg) {
          const t1 = Math.min(R, t0 + seg), tm = (t0 + t1) / 2;
          const a0 = fade(Math.hypot(c, tm)) * w * (minor ? 0.45 : 1);
          if (a0 < 0.02) continue;
          const q0 = at(at([ox, oy, oz], across, (across === 'x' ? ox : across === 'y' ? oy : oz) + c), along, (along === 'x' ? ox : along === 'y' ? oy : oz) + t0);
          const q1 = at(at([ox, oy, oz], across, (across === 'x' ? ox : across === 'y' ? oy : oz) + c), along, (along === 'x' ? ox : along === 'y' ? oy : oz) + t1);
          const L = Math.min(LEVELS - 1, Math.floor(a0 * LEVELS));
          buckets[L][minor ? 'minor' : 'major'].push(P.S(...V.p(...q0)), P.S(...V.p(...q1)));
        }
      }
    }
  }
  ctx.save();
  ctx.strokeStyle = M.plane; ctx.lineCap = 'round';
  buckets.forEach((b, L) => {
    for (const [kind, list] of [['minor', b.minor], ['major', b.major]]) {
      if (!list.length) continue;
      ctx.globalAlpha = k * (L + 0.5) / LEVELS * (kind === 'major' ? M.planeA[0] * 1.6 : M.planeA[1] * 1.6);
      ctx.lineWidth = kind === 'major' ? 1.25 : 1;
      ctx.beginPath();
      for (let i = 0; i < list.length; i += 2) { ctx.moveTo(...list[i]); ctx.lineTo(...list[i + 1]); }
      ctx.stroke();
    }
  });
  // Gli assi coordinati prolungati in entrambi i versi, anch'essi sfumati verso l'orizzonte.
  ctx.strokeStyle = M.axis; ctx.lineWidth = 1.4;
  for (const ax of ['x', 'y', 'z']) {
    for (let t0 = -R; t0 < R; t0 += seg) {
      const t1 = Math.min(R, t0 + seg), a0 = fade(Math.abs((t0 + t1) / 2)) * (t0 >= 0 ? 0.75 : 0.4);
      if (a0 < 0.02) continue;
      const q0 = at([ox, oy, oz], ax, (ax === 'x' ? ox : ax === 'y' ? oy : oz) + t0), q1 = at([ox, oy, oz], ax, (ax === 'x' ? ox : ax === 'y' ? oy : oz) + t1);
      ctx.globalAlpha = k * a0;
      ctx.beginPath(); ctx.moveTo(...P.S(...V.p(...q0))); ctx.lineTo(...P.S(...V.p(...q1))); ctx.stroke();
    }
  }
  ctx.restore();
}
