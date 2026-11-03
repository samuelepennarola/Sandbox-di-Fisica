import { niceStep } from './math.js';

const lab = (v, step) => {
  const d = Math.max(0, -Math.floor(Math.log10(step) + 1e-9));
  return (Math.abs(v) < step * 1e-6 ? 0 : v).toFixed(d).replace('.', ',');
};

// Grafico a linee di più serie in funzione del tempo. samples: [{t, ...}], graph: {series:[{key|get,color}]}.
// cursor: indice del campione mostrato dalla moviola (null = ultimo istante).
export function drawPlot(canvas, samples, graph, colors, cursor = null) {
  const series = graph.series.map(s => ({ ...s, get: s.get ?? (o => o[s.key]) }));
  const dpr = devicePixelRatio || 1;
  const W = canvas.clientWidth, H = canvas.clientHeight;
  if (!W || !H) return;
  if (canvas.width !== Math.round(W * dpr) || canvas.height !== Math.round(H * dpr)) {
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
  }
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);

  const L = 46, R = 8, T = 8, B = 22, pw = W - L - R, ph = H - T - B;
  const tMax = Math.max(1, samples.length ? samples[samples.length - 1].t : 0);
  let lo = 0, hi = 0;
  for (const s of samples) for (const ser of series) {
    const v = ser.get(s);
    if (!Number.isFinite(v)) continue;
    if (v < lo) lo = v; if (v > hi) hi = v;
  }
  if (hi - lo < 1e-9) { hi += 1; lo -= lo < 0 ? 1 : 0; }
  const padv = (hi - lo) * 0.08; hi += padv; if (lo < 0) lo -= padv;

  const X = t => L + t / tMax * pw;
  const Y = v => T + (hi - v) / (hi - lo) * ph;

  ctx.font = '500 10.5px -apple-system, BlinkMacSystemFont, sans-serif';
  ctx.lineWidth = 1;

  // Griglia e assi.
  const ys = niceStep((hi - lo) / 4);
  ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
  for (let v = Math.ceil(lo / ys) * ys; v <= hi; v += ys) {
    const y = Math.round(Y(v)) + .5;
    ctx.strokeStyle = Math.abs(v) < ys * 1e-6 ? colors.axis : colors.gridMajor;
    ctx.beginPath(); ctx.moveTo(L, y); ctx.lineTo(W - R, y); ctx.stroke();
    ctx.fillStyle = colors.muted; ctx.fillText(lab(v, ys), L - 5, y);
  }
  const xs = niceStep(tMax / 5);
  ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  for (let t = 0; t <= tMax + 1e-9; t += xs) {
    const x = Math.round(X(t)) + .5;
    ctx.strokeStyle = colors.grid;
    ctx.beginPath(); ctx.moveTo(x, T); ctx.lineTo(x, T + ph); ctx.stroke();
    ctx.fillStyle = colors.muted; ctx.fillText(lab(t, xs), x, T + ph + 5);
  }
  ctx.textAlign = 'right';
  ctx.fillText('t (s)', W - R, T + ph + 5);
  ctx.strokeStyle = colors.axis;
  ctx.beginPath(); ctx.moveTo(L + .5, T); ctx.lineTo(L + .5, T + ph); ctx.stroke();

  // Serie (con decimazione se ci sono molti più punti che pixel).
  const stride = Math.max(1, Math.floor(samples.length / (pw * 1.5)));
  ctx.lineWidth = 2; ctx.lineJoin = 'round';
  const cur = samples[cursor ?? samples.length - 1];
  if (cursor != null && cur) {
    ctx.strokeStyle = colors.handle; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(X(cur.t), T); ctx.lineTo(X(cur.t), T + ph); ctx.stroke();
  }
  ctx.lineWidth = 2;
  for (const ser of series) {
    ctx.strokeStyle = colors[ser.color] || ser.color;
    if (ser.dash) ctx.setLineDash(ser.dash);
    ctx.beginPath();
    let pen = false;
    const pt = s => {
      const v = ser.get(s);
      if (!Number.isFinite(v)) { pen = false; return; }
      pen ? ctx.lineTo(X(s.t), Y(v)) : ctx.moveTo(X(s.t), Y(v));
      pen = true;
    };
    for (let i = 0; i < samples.length; i += stride) pt(samples[i]);
    if (samples.length) pt(samples[samples.length - 1]);
    ctx.stroke();
    ctx.setLineDash([]);
    const v = cur && ser.get(cur);
    if (Number.isFinite(v)) {
      ctx.fillStyle = ctx.strokeStyle;
      ctx.beginPath(); ctx.arc(X(cur.t), Y(v), 3.5, 0, Math.PI * 2); ctx.fill();
    }
  }
}
