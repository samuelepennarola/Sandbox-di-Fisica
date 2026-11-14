import { niceStep } from './math.js';
import { unitLabel } from './units.js';
import { palette, tex, mixHex } from './manim.js';

// Grafici della scheda "Grafici" alla 3Blue1Brown: piano con la griglia tenue del NumberPlane, assi con le punte,
// numeri e titoli in LaTeX classico, curve nel colore della grandezza sulla scena e un punto luminoso che scorre
// in sincronia con il tempo della simulazione (anche nella moviola).
// Regia: al cambio di grafico la curva si traccia da sinistra (Create) e gli assi si riscalano con morbidezza.

const reduced = () => matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const smoothstep = t => t * t * (3 - 2 * t);
const CREATE_S = 0.8;     // durata del tracciamento al cambio di grafico
const TAU = 0.16;         // tempo di risposta degli assi che si riscalano (s)

// Stato della regia per ogni canvas.
const states = new WeakMap();

// Numero sull'asse con la virgola: −2,5
const num = (v, step) => {
  const d = Math.max(0, -Math.floor(Math.log10(step) + 1e-9));
  const u = Math.abs(v) < step * 1e-6 ? 0 : v;
  return (u < 0 ? '−' : '') + Math.abs(u).toFixed(d).replace('.', ',');
};

// Unità comune alle serie, presa dalle etichette "x (m)", "K cinetica (J)": null se sono diverse.
function unitOf(series) {
  const us = series.map(s => /\(([^)]+)\)\s*$/.exec(s.label ?? '')?.[1]);
  return us.every(u => u && u === us[0]) ? us[0] : null;
}
const unitTeX = u => `\\mathrm{${u.replace(/²/g, '^2').replace(/³/g, '^3')}}`.replace(/\^(\d)/g, '}^{$1}\\mathrm{');

// Colore di una serie: quello del vettore corrispondente sulla scena (palette di Manim), altrimenti quello dell'app.
export function seriesColor(M, colors, c) { return M.vec[c] ?? colors[c] ?? c; }

// Grafico a linee di più serie in funzione del tempo. samples: [{t, ...}], graph: {series:[{key|get,color}]}.
// cursor: indice del campione mostrato dalla moviola (null = ultimo istante).
export function drawPlot(canvas, samples, graph, colors, cursor = null) {
  // Ogni serie nell'unità scelta nel menu Unità: l'etichetta porta l'unità tra parentesi, i valori il fattore.
  const series = graph.series.map(s => {
    const U = unitLabel(s.label), g0 = s.get ?? (o => o[s.key]);
    return { ...s, label: U.label, get: U.f === 1 ? g0 : o => { const v = g0(o); return v == null ? v : v * U.f; } };
  });
  const dpr = devicePixelRatio || 1;
  const W = canvas.clientWidth, H = canvas.clientHeight;
  if (!W || !H) return;
  if (canvas.width !== Math.round(W * dpr) || canvas.height !== Math.round(H * dpr)) {
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
  }
  const ctx = canvas.getContext('2d'), M = palette(colors), P = { ctx };
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);

  // Valori da mostrare (bersaglio della regia).
  const tEnd = samples.length ? samples[samples.length - 1].t : 0;
  let lo = 0, hi = 0;
  for (const s of samples) for (const ser of series) {
    const v = ser.get(s);
    if (!Number.isFinite(v)) continue;
    if (v < lo) lo = v; if (v > hi) hi = v;
  }
  if (hi - lo < 1e-9) { hi += 1; lo -= lo < 0 ? 1 : 0; }
  const padv = (hi - lo) * 0.1; hi += padv; if (lo < 0) lo -= padv;
  const target = { tMax: Math.max(1, tEnd * 1.04), lo, hi };

  // Regia: valori mostrati che inseguono il bersaglio; tracciamento quando cambia il grafico.
  const now = performance.now() / 1000, still = reduced();
  const key = graph.title + '|' + series.map(s => s.key ?? s.label).join(',');
  let S = states.get(canvas);
  if (!S) { S = { key: null, shown: { ...target }, t0: -Infinity, last: now, samples: null }; states.set(canvas, S); }
  const dt = Math.min(0.1, Math.max(0, now - S.last)); S.last = now;
  if (S.key !== key) { S.key = key; S.t0 = now; }
  // Nuova simulazione (campioni azzerati): gli assi tornano subito all'inizio, senza rincorrere.
  const restarted = S.samples !== samples || samples.length < (S.n ?? 0);
  S.samples = samples; S.n = samples.length;
  const sh = S.shown;
  if (still || restarted && samples.length <= 1) Object.assign(sh, target);
  else {
    const k = 1 - Math.exp(-dt / TAU);
    // Il tempo che avanza dal vivo si segue subito (la curva non deve uscire dal piano); il resto si riscala morbido.
    sh.tMax = target.tMax > sh.tMax && target.tMax - sh.tMax < sh.tMax * 0.05 ? target.tMax : sh.tMax + (target.tMax - sh.tMax) * k;
    sh.lo += (target.lo - sh.lo) * k; sh.hi += (target.hi - sh.hi) * k;
  }
  const create = still ? 1 : smoothstep(Math.min(1, (now - S.t0) / CREATE_S));
  S.animating = create < 1 || Math.abs(sh.tMax - target.tMax) > 1e-3 * target.tMax || Math.abs(sh.hi - target.hi) + Math.abs(sh.lo - target.lo) > 1e-3 * (target.hi - target.lo);

  // Riquadro con lo sfondo della scena.
  ctx.save();
  ctx.fillStyle = M.bg;
  ctx.beginPath(); ctx.roundRect ? ctx.roundRect(0.5, 0.5, W - 1, H - 1, 10) : ctx.rect(0.5, 0.5, W - 1, H - 1); ctx.fill();
  ctx.strokeStyle = M.dark ? 'rgba(255,255,255,.08)' : 'rgba(0,0,0,.08)'; ctx.lineWidth = 1; ctx.stroke();
  ctx.restore();

  const unit = unitOf(series);
  const L = 50, R = 30, T = unit ? 26 : 14, B = 30, pw = W - L - R, ph = H - T - B;
  if (pw < 40 || ph < 30) return;
  const X = t => L + t / sh.tMax * pw;
  const Y = v => T + (sh.hi - v) / (sh.hi - sh.lo) * ph;
  const xAxisV = sh.lo <= 0 && sh.hi >= 0 ? 0 : sh.lo;   // l'asse dei tempi passa per lo zero se è nel piano
  const y0 = Y(xAxisV);

  // Griglia del NumberPlane: linee principali e suddivisioni tenui.
  const ys = niceStep((sh.hi - sh.lo) / 4), xs = niceStep(sh.tMax / 5);
  ctx.save();
  ctx.beginPath(); ctx.rect(L, T, pw, ph); ctx.clip();
  ctx.strokeStyle = M.plane; ctx.lineWidth = 1;
  for (const [f, a] of [[0.5, M.planeA[1]], [1, M.planeA[0]]]) {
    ctx.globalAlpha = a; ctx.beginPath();
    const sy = ys * f, sx = xs * f;
    for (let v = Math.ceil(sh.lo / sy) * sy; v <= sh.hi; v += sy) { const y = Math.round(Y(v)) + .5; ctx.moveTo(L, y); ctx.lineTo(L + pw, y); }
    for (let t = sx; t <= sh.tMax + 1e-9; t += sx) { const x = Math.round(X(t)) + .5; ctx.moveTo(x, T); ctx.lineTo(x, T + ph); }
    ctx.stroke();
  }
  ctx.restore();

  // Assi con le punte piene e le tacche.
  ctx.save();
  ctx.strokeStyle = ctx.fillStyle = M.axis; ctx.globalAlpha = M.dark ? 0.85 : 0.75; ctx.lineWidth = 1.5; ctx.lineCap = 'round';
  const xr = L + pw + 14, yt = T - 10;
  ctx.beginPath(); ctx.moveTo(L, y0); ctx.lineTo(xr - 6, y0); ctx.moveTo(L, T + ph); ctx.lineTo(L, yt + 6); ctx.stroke();
  const head = (x, y, dx, dy) => { ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - dx * 9 - dy * 4, y - dy * 9 + dx * 4); ctx.lineTo(x - dx * 9 + dy * 4, y - dy * 9 - dx * 4); ctx.closePath(); ctx.fill(); };
  head(xr, y0, 1, 0); head(L, yt, 0, -1);
  ctx.lineWidth = 1.2; ctx.beginPath();
  const xl = [], yl = [];
  for (let t = xs; t <= sh.tMax + 1e-9; t += xs) { const x = X(t); if (x > L + pw - 4) break; ctx.moveTo(x, y0 - 4); ctx.lineTo(x, y0 + 4); xl.push([x, num(t, xs)]); }
  for (let v = Math.ceil(sh.lo / ys) * ys; v <= sh.hi + 1e-9; v += ys) { const y = Y(v); if (y < T + 2 || y > T + ph - 2) continue; ctx.moveTo(L - 4, y); ctx.lineTo(L + 4, y); yl.push([y, num(v, ys)]); }
  ctx.stroke();
  ctx.restore();
  // Numeri: sotto l'asse dei tempi (sopra se l'asse è in fondo e non c'è spazio), a sinistra dell'asse verticale.
  const below = y0 + 14 < H - 4;
  for (const [x, t] of xl) tex(P, x, below ? y0 + 13 : y0 - 12, t, { size: 12, color: M.muted, halo: M.bg });
  for (const [y, t] of yl) if (!(Math.abs(y - y0) < 3 && xAxisV === 0)) tex(P, L - 8, y, t, { size: 12, color: M.muted, align: 'right', halo: M.bg });
  tex(P, xr + 2, below ? y0 + 13 : y0 - 12, 't\\ (\\mathrm{s})', { size: 13, color: M.text, align: 'right', halo: M.bg });
  if (unit) tex(P, L + 10, T - 13, `(${unitTeX(unit)})`, { size: 13, color: M.text, align: 'left', halo: M.bg });

  // Curve: si tracciano fino all'istante raggiunto dal Create (in proporzione al tempo mostrato).
  const tCut = tEnd * create;
  const cur = samples[cursor ?? samples.length - 1];
  const stride = Math.max(1, Math.floor(samples.length / (pw * 1.5)));
  ctx.save();
  ctx.beginPath(); ctx.rect(L - 2, T - 4, pw + 6, ph + 8); ctx.clip();
  if (cursor != null && cur) {
    // Moviola: linea guida tratteggiata all'istante mostrato.
    ctx.strokeStyle = M.muted; ctx.globalAlpha = 0.7; ctx.lineWidth = 1; ctx.setLineDash([3, 4]);
    ctx.beginPath(); ctx.moveTo(Math.round(X(cur.t)) + .5, T); ctx.lineTo(Math.round(X(cur.t)) + .5, T + ph); ctx.stroke();
    ctx.setLineDash([]); ctx.globalAlpha = 1;
  }
  ctx.lineJoin = ctx.lineCap = 'round';
  const tipPts = [];
  for (const ser of series) {
    const col = seriesColor(M, colors, ser.color);
    const path = () => {
      ctx.beginPath();
      let pen = false, last = null;
      const pt = s => {
        const v = ser.get(s);
        if (!Number.isFinite(v)) { pen = false; return; }
        pen ? ctx.lineTo(X(s.t), Y(v)) : ctx.moveTo(X(s.t), Y(v));
        pen = true; last = s;
      };
      for (let i = 0; i < samples.length; i += stride) { if (samples[i].t > tCut) break; pt(samples[i]); }
      // Punto finale esatto del tracciamento (interpolato), così il Create scorre senza scatti.
      if (create < 1 && last) {
        const j = samples.findIndex(s => s.t > tCut);
        if (j > 0) {
          const a = samples[j - 1], b = samples[j], va = ser.get(a), vb = ser.get(b);
          if (Number.isFinite(va) && Number.isFinite(vb)) { const f = (tCut - a.t) / ((b.t - a.t) || 1); ctx.lineTo(X(tCut), Y(va + (vb - va) * f)); }
        }
      } else if (samples.length) pt(samples[samples.length - 1]);
    };
    if (ser.dash) ctx.setLineDash(ser.dash);
    // Alone del colore di fondo sotto la curva: la stacca dalla griglia e dalle altre serie.
    path(); ctx.strokeStyle = M.bg; ctx.globalAlpha = 0.8; ctx.lineWidth = 5.5; ctx.stroke();
    path(); ctx.strokeStyle = col; ctx.globalAlpha = 1; ctx.lineWidth = 2.6; ctx.stroke();
    ctx.setLineDash([]);
    const v = cur && ser.get(cur);
    if (Number.isFinite(v) && create >= 1) tipPts.push([X(cur.t), Y(v), col]);
  }
  ctx.restore();

  // Punto luminoso che scorre sulla curva all'istante della simulazione.
  for (const [x, y, col] of tipPts) {
    ctx.save();
    if (/^#[0-9a-f]{6}$/i.test(col)) {
      const g = ctx.createRadialGradient(x, y, 0, x, y, 13);
      g.addColorStop(0, col + (M.dark ? 'aa' : '77')); g.addColorStop(1, col + '00');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, 13, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x, y, 4.2, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = M.dark && /^#[0-9a-f]{6}$/i.test(col) ? mixHex(col, '#ffffff', 0.6) : M.bg; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.restore();
  }
}

// true finché è in corso una transizione (per chi volesse ridisegnare anche a simulazione ferma).
export const plotAnimating = canvas => !!states.get(canvas)?.animating;
