// Strumenti comuni del modulo "Sistemi e urti".
//   contact:  contatto molla-smorzatore tarato per dare esattamente il coefficiente di restituzione e scelto;
//   momentumRows: i vettori quantità di moto messi coda-punta, "prima" e "ora", con la somma tratteggiata;
//   kBars:    barre impilate dell'energia cinetica (più l'energia elastica del contatto), "prima" e "ora";
//   slowmo:   fattore del rallentatore vicino all'urto.
import { palette, tex, arrowS } from './manim.js';

const TC = 0.06;   // durata del contatto (s): breve rispetto al moto, abbastanza lunga da vedere le forze al rallentatore

// Contatto lineare molla-smorzatore tra due corpi di masse m1, m2. La soluzione esatta della compenetrazione
// δ(t) = A e^{−ζωt} sin(ω_d t) torna a zero dopo π/ω_d con velocità relativa e volte quella iniziale.
// Per e = 0 lo smorzamento è critico: i corpi restano uniti.
export function contact(m1, m2, e) {
  const mu = m1 * m2 / (m1 + m2);
  let zeta;
  if (e >= 0.999) zeta = 0;
  else if (e <= 0.001) zeta = 1;
  else { const l = Math.log(e); zeta = -l / Math.sqrt(Math.PI * Math.PI + l * l); }
  const wd = Math.PI / TC, wn = zeta < 1 ? wd / Math.sqrt(1 - zeta * zeta) : wd;
  return { k: mu * wn * wn, c: 2 * zeta * mu * wn };
}

// Rallentatore: 1 lontano dall'urto, `slow` durante il contatto e nel breve tratto che lo precede o lo segue.
// ttc: tempo che manca al contatto (s, alla velocità attuale; Infinity se si allontanano); since: tempo trascorso
// dalla fine del contatto (Infinity se non c'è stato).
export function slowmo(inContact, ttc, since, slow = 0.08) {
  if (inContact) return slow;
  const near = Math.min(ttc, since);
  if (!(near < 0.35)) return 1;
  const u = near / 0.35, s = u * u * (3 - 2 * u);
  return slow + (1 - slow) * s;
}

// Righe di vettori coda-punta in coordinate schermo. rows: [{ label, origin: [x, y], vecs: [{ x, y, color }] }],
// componenti in px (y verso l'alto). Sotto ogni riga la somma, tratteggiata: se la quantità di moto si conserva
// è identica in tutte le righe.
export function momentumRows(P, rows, { title = '\\vec p', alpha = 1, sumColor } = {}) {
  const M = P.M ?? palette(P.c), ctx = P.ctx, sc = sumColor ?? M.text;
  for (const row of rows) {
    const [ox, oy] = row.origin;
    let x = ox, y = oy;
    for (const v of row.vecs) {
      if (Math.hypot(v.x, v.y) > 1.5) arrowS(ctx, x, y, x + v.x, y - v.y, v.color, { width: 3, tip: 11, alpha, halo: M.bg });
      x += v.x; y -= v.y;
    }
    // Somma: dalla coda del primo alla punta dell'ultimo, appena staccata (nel 1D sta sotto la riga).
    const off = row.sumOffset ?? [0, 0];
    if (Math.hypot(x - ox, y - oy) > 1.5) arrowS(ctx, ox + off[0], oy + off[1], x + off[0], y + off[1], sc, { width: 1.6, tip: 9, alpha: 0.85 * alpha, dash: [5, 4] });
    ctx.save(); ctx.globalAlpha = 0.6 * alpha; ctx.fillStyle = M.text;
    ctx.beginPath(); ctx.arc(ox, oy, 2.5, 0, 2 * Math.PI); ctx.fill(); ctx.restore();
    if (row.label) tex(P, row.labelAt?.[0] ?? ox - 12, row.labelAt?.[1] ?? oy, row.label, { size: 15, color: M.muted, halo: M.bg, align: 'right', alpha });
  }
  if (rows[0] && title) tex(P, rows[0].titleAt?.[0] ?? rows[0].origin[0], rows[0].titleAt?.[1] ?? rows[0].origin[1] - 26, title, { size: 17, color: M.text, halo: M.bg, align: 'left', alpha });
}

// Barre impilate in coordinate schermo, base in (x, yBase). groups: [{ label, parts: [{ v, color }] }]; Eref: energia
// che corrisponde all'altezza h. Una tacca tratteggiata segna l'energia del primo gruppo, per vedere cosa si perde.
export function kBars(P, groups, Eref, { x, yBase, h = 110, w = 22, gap = 26, alpha = 1, title = 'K' } = {}) {
  const M = P.M ?? palette(P.c), ctx = P.ctx;
  if (!(Eref > 0)) return;
  const H = v => Math.max(0, v) / Eref * h;
  ctx.save();
  groups.forEach((g, i) => {
    const bx = x + i * (w + gap);
    let y = yBase;
    for (const part of g.parts) {
      const hh = H(part.v);
      ctx.globalAlpha = 0.85 * alpha; ctx.fillStyle = part.color;
      ctx.fillRect(bx, y - hh, w, hh);
      y -= hh;
    }
  });
  // Livello iniziale.
  ctx.globalAlpha = 0.6 * alpha; ctx.strokeStyle = M.text; ctx.lineWidth = 1; ctx.setLineDash([4, 4]);
  const top = yBase - H(groups[0].parts.reduce((a, q) => a + q.v, 0));
  ctx.beginPath(); ctx.moveTo(x - 4, top); ctx.lineTo(x + groups.length * (w + gap) - gap + 4, top); ctx.stroke();
  ctx.setLineDash([]); ctx.globalAlpha = 0.45 * alpha; ctx.strokeStyle = M.muted;
  ctx.beginPath(); ctx.moveTo(x - 6, yBase); ctx.lineTo(x + groups.length * (w + gap) - gap + 6, yBase); ctx.stroke();
  ctx.restore();
  groups.forEach((g, i) => tex(P, x + i * (w + gap) + w / 2, yBase + 13, g.label, { size: 13, color: M.muted, halo: M.bg, alpha }));
  if (title) tex(P, x - 10, top - 4, title, { size: 17, color: M.text, halo: M.bg, align: 'right', alpha });
}

// Riquadro tenue del colore di fondo dietro al bilancio, per staccarlo dalla griglia.
export function panelBg(P, x, y, w, h, alpha = 1) {
  const M = P.M ?? palette(P.c), ctx = P.ctx;
  ctx.save(); ctx.globalAlpha = 0.7 * alpha; ctx.fillStyle = M.bg;
  ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x, y, w, h, 8) : ctx.rect(x, y, w, h); ctx.fill();
  ctx.restore();
}
