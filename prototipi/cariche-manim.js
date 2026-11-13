// Prototipo del redesign "alla 3Blue1Brown" applicato alle cariche.
// Usa il motore dell'app (Camera, campo di Coulomb) e la micro-libreria js/core/anim.js;
// la scena è costruita a passi, come una lezione: piano → cariche → linee → forze → componenti → sonda.
import { Camera } from '../js/core/camera.js';
import { K, MU, pointField } from '../js/core/electric.js';
import { Timeline, tween, custom, group, lagged, seq, wait, rate, cumulate, partial, mix, MANIM as M } from '../js/core/anim.js';

const canvas = document.getElementById('c'), ctx = canvas.getContext('2d');
const labelsBox = document.getElementById('labels'), formulaBox = document.getElementById('formula');
const cam = new Camera(), tl = new Timeline();

const opt = { bg: '#0b0b0d', grid: 'plane', lines: 'magnitude', labels: 'tex' };
try { Object.assign(opt, JSON.parse(localStorage.getItem('proto.manim') || '{}')); } catch {}

/* ---------------- Stato della scena (ogni grandezza animabile va da 0 a 1) ---------------- */

const FPX = 400;          // px per newton delle frecce delle forze (scala fissa: avvicinando le cariche le frecce crescono)
const E_PX = 78;          // lunghezza fissa della freccia di E sulla sonda (px): ne mostra solo il verso
const charges = [
  { x: -0.16, y: -0.05, q: 2, grow: 0, label: 0, hue: 0 },
  { x: 0.13, y: 0.11, q: -1.5, grow: 0, label: 0, hue: 1 },
];
const probe = { x: 0.07, y: -0.17, grow: 0, label: 0, shown: 0 };
const S = { grid: 0, axes: 0, numbers: 0, lines: 0, linesOn: 0, force: 0, forceLab: 0, coul: 0,
  proj: 0, slide: 0, compLab: 0, Edisp: 0 };
let lines = [];
charges.forEach(c => { c.hue = c.q > 0 ? 1 : 0; });

/* ---------------- Fisica ---------------- */

const fieldAt = (x, y, skip) => charges.reduce((E, c) => {
  if (c === skip) return E;
  const [ex, ey] = pointField(c.x, c.y, c.q * MU, x, y);
  return [E[0] + ex, E[1] + ey];
}, [0, 0]);
const rad = c => 0.017 + 0.005 * Math.sqrt(Math.abs(c.q));
// Forza sulla carica c dovuta all'altra.
const forceOn = c => { const [ex, ey] = fieldAt(c.x, c.y, c); return [c.q * MU * ex, c.q * MU * ey]; };

function traceLines() {
  const pos = charges.filter(c => c.q > 0), neg = charges.filter(c => c.q < 0);
  const sumP = pos.reduce((s, c) => s + c.q, 0), sumN = -neg.reduce((s, c) => s + c.q, 0);
  const from = sumP >= sumN ? 1 : -1, srcs = from > 0 ? pos : neg, out = [];
  for (const c of srcs) {
    const n = Math.round(7 * Math.abs(c.q)), r = rad(c) * 1.1;
    for (let i = 0; i < n; i++) {
      const a = (i + 0.5) / n * 2 * Math.PI + 0.2;
      let x = c.x + r * Math.cos(a), y = c.y + r * Math.sin(a);
      const pts = [[x, y]], mags = [];
      for (let k = 0; k < 900; k++) {
        const near = Math.min(...charges.map(o => Math.hypot(x - o.x, y - o.y)));
        const h = Math.min(0.012, Math.max(0.002, near * 0.2));
        let [ex, ey] = fieldAt(x, y); let m = Math.hypot(ex, ey); if (m < 1e-9) break;
        const mx = x + from * ex / m * h / 2, my = y + from * ey / m * h / 2;
        [ex, ey] = fieldAt(mx, my); m = Math.hypot(ex, ey); if (m < 1e-9) break;
        x += from * ex / m * h; y += from * ey / m * h;
        pts.push([x, y]); mags.push(m);
        if (Math.abs(x) > 1.1 || Math.abs(y) > 0.8) break;
        if (k > 3 && charges.some(o => o !== c && Math.hypot(x - o.x, y - o.y) < rad(o) * 0.9)) break;
      }
      out.push({ pts, mags, acc: cumulate(pts), dir: from, drawn: 1 });
    }
  }
  return out;
}

/* ---------------- Numeri all'italiana ---------------- */

function sci(v, d = 2) {
  if (v === 0) return '0';
  const e = Math.floor(Math.log10(Math.abs(v)));
  if (e >= -2 && e <= 3) return v.toFixed(Math.max(0, d - Math.max(0, e))).replace('.', '{,}');
  const m = v / 10 ** e;
  return `${m.toFixed(d).replace('.', '{,}')} \\cdot 10^{${e}}`;
}

/* ---------------- Etichette TeX sulla scena (KaTeX in sovrimpressione) ---------------- */

const labels = new Map();
// Etichetta ancorata a un punto del mondo con uno scostamento in px; reveal = 0..1 (effetto "Write").
function label(id, tex, x, y, { dx = 0, dy = 0, reveal = 1, color = M.white, size = 19 } = {}) {
  let L = labels.get(id);
  if (!L) { L = { el: document.createElement('div'), tex: null }; L.el.className = 'lab'; labelsBox.appendChild(L.el); labels.set(id, L); }
  L.used = true;
  if (L.tex !== tex + opt.labels) {
    L.tex = tex + opt.labels;
    if (opt.labels === 'tex' && window.katex) katex.render(tex, L.el, { throwOnError: false });
    else L.el.textContent = tex.replace(/\\vec|\\left|\\right|\\,|\\!|[{}\\]/g, '').replace(/cdot/g, '·').replace(/mathrm/g, '').replace(/\|/g, '|');
    L.el.style.fontFamily = opt.labels === 'tex' ? '' : '-apple-system, sans-serif';
    L.el.style.fontWeight = opt.labels === 'tex' ? '' : '600';
  }
  const [a, b] = cam.toScreen(x, y);
  L.el.style.color = color; L.el.style.fontSize = size + 'px';
  L.el.style.transform = `translate(${a + dx}px, ${b + dy}px) translate(-50%, -50%)`;
  L.el.style.opacity = Math.min(1, reveal * 1.6);
  L.el.style.clipPath = reveal >= 1 ? 'none' : `inset(-20% ${(1 - reveal) * 100}% -20% -5%)`;
  L.el.style.display = reveal <= 0 ? 'none' : '';
}

let formulaTex = '';
function formula(rows, reveal) {
  const tex = rows.join('|');
  if (tex !== formulaTex) {
    formulaTex = tex;
    formulaBox.innerHTML = rows.map(r => `<div class="row">${window.katex ? katex.renderToString(r, { throwOnError: false }) : r}</div>`).join('');
  }
  formulaBox.style.display = reveal > 0 ? '' : 'none';
  formulaBox.style.opacity = Math.min(1, reveal * 1.5);
  formulaBox.style.clipPath = reveal >= 1 ? 'none' : `inset(0 ${(1 - reveal) * 100}% 0 0)`;
}

/* ---------------- Disegno ---------------- */

function S2(x, y) { return cam.toScreen(x, y); }

function polyline(pts, color, width, alpha = 1, dash = null) {
  if (pts.length < 2) return;
  ctx.save(); ctx.globalAlpha = alpha; ctx.strokeStyle = color; ctx.lineWidth = width; ctx.lineCap = ctx.lineJoin = 'round';
  if (dash) ctx.setLineDash(dash);
  ctx.beginPath(); pts.forEach(([x, y], i) => { const [a, b] = S2(x, y); i ? ctx.lineTo(a, b) : ctx.moveTo(a, b); }); ctx.stroke();
  ctx.restore();
}

// Freccia alla Manim: asta sottile e punta triangolare piena, che cresce dalla coda (GrowArrow).
function arrowPx(a, b, c, d, color, { width = 3.2, tip = 15, grow = 1, alpha = 1 } = {}) {
  c = a + (c - a) * grow; d = b + (d - b) * grow;
  const len = Math.hypot(c - a, d - b); if (len < 1) return;
  const ux = (c - a) / len, uy = (d - b) / len, h = Math.min(tip, len * 0.45), w = h * 0.5;
  ctx.save(); ctx.globalAlpha = alpha; ctx.strokeStyle = ctx.fillStyle = color; ctx.lineWidth = width; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(a, b); ctx.lineTo(c - ux * h * 0.9, d - uy * h * 0.9); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(c, d); ctx.lineTo(c - ux * h - uy * w, d - uy * h + ux * w); ctx.lineTo(c - ux * h + uy * w, d - uy * h - ux * w); ctx.closePath(); ctx.fill();
  ctx.restore();
}

function drawPlane() {
  if (opt.grid === 'none' && S.axes <= 0) return;
  const { x0, y0, x1, y1 } = cam.bounds(), step = 0.05;
  const [ox, oy] = S2(0, 0), g = S.grid;
  if (opt.grid !== 'none' && g > 0) {
    ctx.save(); ctx.lineWidth = 1;
    // Le linee crescono dal centro verso i bordi, sfalsate in base alla distanza dall'origine (LaggedStart).
    const maxI = Math.ceil(Math.max(Math.abs(x0), Math.abs(x1), Math.abs(y0), Math.abs(y1)) / step);
    for (const vertical of [true, false]) {
      const lo = Math.ceil((vertical ? x0 : y0) / step), hi = Math.floor((vertical ? x1 : y1) / step);
      for (let i = lo; i <= hi; i++) {
        if (i === 0) continue;
        const delay = Math.abs(i) / maxI * 0.5, f = rate.smooth(Math.min(1, Math.max(0, (g - delay) / 0.5)));
        if (f <= 0) continue;
        const major = i % 2 === 0;
        ctx.strokeStyle = opt.grid === 'plane' ? M.blueD : '#ffffff';
        ctx.globalAlpha = opt.grid === 'plane' ? (major ? 0.5 : 0.16) : (major ? 0.09 : 0.04);
        ctx.beginPath();
        if (vertical) { const [a] = S2(i * step, 0); ctx.moveTo(a, oy - (oy + 10) * f); ctx.lineTo(a, oy + (cam.h - oy + 10) * f); }
        else { const [, b] = S2(0, i * step); ctx.moveTo(ox - (ox + 10) * f, b); ctx.lineTo(ox + (cam.w - ox + 10) * f, b); }
        ctx.stroke();
      }
    }
    ctx.restore();
  }
  const A = S.axes;
  if (A > 0) {
    ctx.save(); ctx.strokeStyle = M.white; ctx.globalAlpha = 0.85; ctx.lineWidth = 1.6;
    const e = rate.smooth(A);
    ctx.beginPath(); ctx.moveTo(ox - ox * e, oy); ctx.lineTo(ox + (cam.w - ox) * e, oy); ctx.moveTo(ox, oy + (cam.h - oy) * e); ctx.lineTo(ox, oy - oy * e); ctx.stroke();
    ctx.restore();
    // Tacche numerate (cm), che compaiono dopo gli assi.
    if (S.numbers > 0) {
      ctx.save(); ctx.globalAlpha = S.numbers; ctx.fillStyle = M.greyB; ctx.strokeStyle = M.white; ctx.lineWidth = 1.2;
      ctx.font = opt.labels === 'tex' ? '15px KaTeX_Main, serif' : '500 11px -apple-system, sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      for (let i = Math.ceil(x0 / 0.1); i <= Math.floor(x1 / 0.1); i++) {
        if (!i) continue; const [a] = S2(i * 0.1, 0);
        ctx.beginPath(); ctx.moveTo(a, oy - 5); ctx.lineTo(a, oy + 5); ctx.stroke(); ctx.fillText(String(i * 10), a, oy + 9);
      }
      ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
      for (let i = Math.ceil(y0 / 0.1); i <= Math.floor(y1 / 0.1); i++) {
        if (!i) continue; const [, b] = S2(0, i * 0.1);
        ctx.beginPath(); ctx.moveTo(ox - 5, b); ctx.lineTo(ox + 5, b); ctx.stroke(); ctx.fillText(String(i * 10), ox - 10, b);
      }
      ctx.font = opt.labels === 'tex' ? 'italic 19px KaTeX_Math, serif' : 'italic 600 14px -apple-system, sans-serif';
      ctx.fillStyle = M.white; ctx.textAlign = 'right'; ctx.textBaseline = 'bottom';
      const unitFont = opt.labels === 'tex' ? '15px KaTeX_Main, serif' : '500 12px -apple-system, sans-serif', xFont = ctx.font;
      ctx.font = unitFont; const uw = ctx.measureText('(cm)').width; ctx.fillText('(cm)', cam.w - 24, oy - 8);
      ctx.font = xFont; ctx.fillText('x', cam.w - 30 - uw, oy - 8);
      ctx.restore();
    }
  }
}

const RAMP = [M.blueE, M.blueD, M.blue, M.teal, M.green];
function lineColor(m) {
  if (opt.lines === 'white') return M.greyA;
  // Scala logaritmica: 10⁴ N/C → blu scuro, 10⁶·⁵ N/C → verde.
  const t = Math.min(1, Math.max(0, (Math.log10(m) - 4.2) / 2.3)) * (RAMP.length - 1);
  const i = Math.min(RAMP.length - 2, Math.floor(t));
  return mix(RAMP[i], RAMP[i + 1], t - i);
}

function drawLines() {
  if (S.linesOn <= 0) return;
  ctx.save(); ctx.lineCap = ctx.lineJoin = 'round';
  for (const L of lines) {
    const f = L.drawn;
    if (f <= 0) continue;
    const pts = partial(L.pts, f, L.acc), n = pts.length;
    ctx.globalAlpha = S.linesOn * (opt.lines === 'white' ? 0.55 : 0.95); ctx.lineWidth = 2;
    // Tratti di pochi punti, ciascuno col colore dell'intensità del campo in quel punto.
    for (let i = 0; i < n - 1; i += 3) {
      ctx.strokeStyle = lineColor(L.mags[Math.min(i, L.mags.length - 1)] || 1e4);
      ctx.beginPath();
      for (let j = i; j <= Math.min(i + 3, n - 1); j++) { const [a, b] = S2(...pts[j]); j === i ? ctx.moveTo(a, b) : ctx.lineTo(a, b); }
      ctx.stroke();
    }
    // Punta del verso a metà della linea, quando la linea è stata tracciata oltre la metà.
    const m = Math.floor(L.pts.length / 2);
    if (f > 0.55 && m > 0) {
      const p0 = S2(...L.pts[m - 1]), p1 = S2(...L.pts[m]);
      let dx = (p1[0] - p0[0]) * L.dir, dy = (p1[1] - p0[1]) * L.dir; const d = Math.hypot(dx, dy) || 1; dx /= d; dy /= d;
      const h = 9, w = 4.5;
      ctx.fillStyle = lineColor(L.mags[m] || 1e4); ctx.globalAlpha *= Math.min(1, (f - 0.55) * 6);
      ctx.beginPath(); ctx.moveTo(p1[0] + dx * h / 2, p1[1] + dy * h / 2);
      ctx.lineTo(p1[0] - dx * h / 2 - dy * w, p1[1] - dy * h / 2 + dx * w); ctx.lineTo(p1[0] - dx * h / 2 + dy * w, p1[1] - dy * h / 2 - dx * w);
      ctx.closePath(); ctx.fill();
    }
  }
  ctx.restore();
}

function drawCharge(c, i) {
  if (c.grow <= 0) return;
  const [a, b] = S2(c.x, c.y), r = Math.max(14, rad(c) * cam.scale) * rate.backOut(Math.min(1, c.grow));
  if (r <= 0) return;
  const col = mix(M.blue, M.red, c.hue);
  ctx.save();
  // Alone morbido (come i "glow dot" dei video), poi disco pieno con bordo più chiaro.
  const g = ctx.createRadialGradient(a, b, r * 0.6, a, b, r * 2.6);
  g.addColorStop(0, col + '55'); g.addColorStop(1, col + '00');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(a, b, r * 2.6, 0, 7); ctx.fill();
  ctx.fillStyle = col; ctx.globalAlpha = 0.92; ctx.beginPath(); ctx.arc(a, b, r, 0, 7); ctx.fill();
  ctx.globalAlpha = 1; ctx.strokeStyle = mix(col, '#ffffff', 0.45); ctx.lineWidth = 1.5; ctx.stroke();
  ctx.strokeStyle = '#ffffff'; ctx.lineWidth = Math.max(2.2, r * 0.13); ctx.lineCap = 'round';
  const h = r * 0.45, plus = c.hue;   // durante l'inversione il tratto verticale si accorcia o si allunga
  ctx.beginPath(); ctx.moveTo(a - h, b); ctx.lineTo(a + h, b);
  if (plus > 0.02) { ctx.moveTo(a, b - h * plus); ctx.lineTo(a, b + h * plus); }
  ctx.stroke();
  ctx.restore();
  label('q' + i, `q_${i + 1} = ${sci(c.q, 1)}\\ \\mu\\mathrm{C}`, c.x, c.y, { dy: r + 22, reveal: c.label, color: M.greyA, size: 17 });
}

function drawForces() {
  if (S.force <= 0) { charges.forEach((_, i) => label('F' + i, '', 0, 0, { reveal: 0 })); return; }
  charges.forEach((c, i) => {
    const [fx, fy] = forceOn(c), [a, b] = S2(c.x, c.y);
    let ex = a + fx * FPX, ey = b - fy * FPX;
    const len = Math.hypot(ex - a, ey - b), cap = 260;
    if (len > cap) { ex = a + (ex - a) * cap / len; ey = b + (ey - b) * cap / len; }
    const r = Math.max(14, rad(c) * cam.scale), ux = (ex - a) / (len || 1), uy = (ey - b) / (len || 1);
    // La freccia parte dal bordo della carica, non dal centro.
    arrowPx(a + ux * r, b + uy * r, ex + ux * r, ey + uy * r, M.yellow, { grow: S.force });
    const [lx, ly] = cam.toWorld(ex + ux * (r + 26), ey + uy * (r + 26));
    label('F' + i, `\\vec F_{${i + 1}}`, lx, ly, { reveal: S.forceLab, color: M.yellow, size: 21 });
  });
}

// Componenti della forza sulla carica 2: proiezioni tratteggiate, poi le componenti scivolano sugli assi.
function drawComponents() {
  const c = charges[1];
  if (S.proj <= 0) { label('Fx', '', 0, 0, { reveal: 0 }); label('Fy', '', 0, 0, { reveal: 0 }); return; }
  const [fx, fy] = forceOn(c), [a, b] = S2(c.x, c.y), r = Math.max(14, rad(c) * cam.scale);
  const len = Math.hypot(fx, fy) * FPX, k = len > 260 ? 260 / len : 1, ux = fx / (Math.hypot(fx, fy) || 1), uy = -fy / (Math.hypot(fx, fy) || 1);
  const sx = a + ux * r, sy = b + uy * r, tx = sx + fx * FPX * k, ty = sy - fy * FPX * k;
  // Proiezioni tratteggiate dalla punta.
  const p = S.proj;
  ctx.save(); ctx.setLineDash([5, 5]); ctx.strokeStyle = M.greyB; ctx.globalAlpha = 0.8 * (1 - S.slide * 0.6); ctx.lineWidth = 1.3;
  ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(tx, ty + (sy - ty) * p); ctx.moveTo(tx, ty); ctx.lineTo(tx + (sx - tx) * p, ty); ctx.stroke();
  ctx.restore();
  // Componenti: nascono sulla carica e poi scorrono fino agli assi (x → asse x, y → asse y).
  const [ox, oy] = S2(0, 0), s = rate.smooth(S.slide);
  const yx = sy + (oy - sy) * s, xy = sx + (ox - sx) * s;
  arrowPx(sx, yx, tx, yx, M.teal, { grow: p, width: 3 });
  arrowPx(xy, sy, xy, ty, M.green, { grow: p, width: 3 });
  const [wx1, wy1] = cam.toWorld((sx + tx) / 2, yx + 24);
  const [wx2, wy2] = cam.toWorld(xy + (S.slide > 0.5 ? -74 : (fx > 0 ? -74 : 74)), (sy + ty) / 2);
  label('Fx', `F_{2x} = ${sci(fx, 2)}\\ \\mathrm{N}`, wx1, wy1, { reveal: S.compLab, color: M.teal, size: 17 });
  label('Fy', `F_{2y} = ${sci(fy, 2)}\\ \\mathrm{N}`, wx2, wy2, { reveal: S.compLab, color: M.green, size: 17 });
}

function drawProbe() {
  if (probe.grow <= 0) { label('E', '', 0, 0, { reveal: 0 }); return; }
  const [a, b] = S2(probe.x, probe.y), [ex, ey] = fieldAt(probe.x, probe.y), m = Math.hypot(ex, ey) || 1;
  ctx.save(); ctx.strokeStyle = M.gold; ctx.lineWidth = 1.6; ctx.globalAlpha = Math.min(1, probe.grow * 2);
  ctx.beginPath(); ctx.arc(a, b, 7, 0, 7); ctx.moveTo(a - 12, b); ctx.lineTo(a - 4, b); ctx.moveTo(a + 4, b); ctx.lineTo(a + 12, b);
  ctx.moveTo(a, b - 12); ctx.lineTo(a, b - 4); ctx.moveTo(a, b + 4); ctx.lineTo(a, b + 12); ctx.stroke(); ctx.restore();
  arrowPx(a, b, a + ex / m * E_PX, b - ey / m * E_PX, M.gold, { grow: probe.grow, width: 3 });
  // Il valore "scorre" fino a quello vero (DecimalNumber + ValueTracker di Manim).
  const shown = m * S.Edisp;
  label('E', `|\\vec E| = ${sci(shown, 2)}\\ \\mathrm{N/C}`, probe.x, probe.y, { dx: -ex / m * 128, dy: ey / m * 30, reveal: probe.label, color: M.gold, size: 17 });
}

function drawFormula() {
  const [c1, c2] = charges, r = Math.hypot(c1.x - c2.x, c1.y - c2.y), F = K * Math.abs(c1.q * c2.q) * MU * MU / (r * r);
  formula([
    `F = k\\,\\dfrac{|q_1\\,q_2|}{r^2}`,
    `\\phantom{F} = ${sci(K, 2)}\\cdot\\dfrac{${sci(Math.abs(c1.q * c2.q), 2)}\\cdot 10^{-12}}{(${sci(r, 3)})^2} = \\textcolor{${M.yellow}}{${sci(F, 3)}\\ \\mathrm{N}}`,
  ], S.coul);
}

function render() {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = opt.bg; ctx.fillRect(0, 0, cam.w, cam.h);
  for (const L of labels.values()) L.used = false;
  drawPlane();
  drawLines();
  drawComponents();
  drawForces();
  charges.forEach(drawCharge);
  drawProbe();
  drawFormula();
  for (const L of labels.values()) if (!L.used) L.el.style.display = 'none';
}

/* ---------------- Passi della lezione ---------------- */

const STEPS = [
  ['Piano cartesiano', () => group([tween(S, 'grid', 1, { run: 1.6, ease: rate.linear }), tween(S, 'axes', 1, { run: 1.2 }),
    seq([wait(0.8), tween(S, 'numbers', 1, { run: 0.6 })])])],
  ['Le cariche', () => lagged(charges.map(c => group([tween(c, 'grow', 1, { run: 0.7, ease: rate.linear }),
    seq([wait(0.35), tween(c, 'label', 1, { run: 0.8, ease: rate.linear })])])), 0.6)],
  ['Linee di campo', () => { lines = traceLines(); lines.forEach(L => (L.drawn = 0)); S.linesOn = 1;
    return lagged(lines.map(L => tween(L, 'drawn', 1, { run: 1.4, ease: rate.linear })), 0.08); }],
  ['Forze di Coulomb', () => group([tween(S, 'force', 1, { run: 1 }), seq([wait(0.6), tween(S, 'forceLab', 1, { run: 0.7, ease: rate.linear })]),
    seq([wait(0.9), tween(S, 'coul', 1, { run: 1.4, ease: rate.linear })])])],
  ['Componenti di F₂', () => seq([tween(S, 'proj', 1, { run: 0.9 }), wait(0.3), tween(S, 'slide', 1, { run: 1.3 }),
    tween(S, 'compLab', 1, { run: 0.8, ease: rate.linear })])],
  ['Sonda: campo E', () => { probe.shown = 1; return group([tween(probe, 'grow', 1, { run: 0.9 }),
    seq([wait(0.4), tween(probe, 'label', 1, { run: 0.6, ease: rate.linear })]), seq([wait(0.4), tween(S, 'Edisp', 1, { run: 1.4, ease: rate.rushFrom })])]); }],
];
let stepIdx = 0, playingAll = false;
const stepLbl = document.getElementById('step'), nextBtn = document.getElementById('next');
function syncBar() {
  stepLbl.textContent = stepIdx ? `${stepIdx}/${STEPS.length} · ${STEPS[stepIdx - 1][0]}` : `0/${STEPS.length} · scena vuota`;
  nextBtn.disabled = stepIdx >= STEPS.length;
}
async function next() {
  if (tl.busy) tl.finish();
  if (stepIdx >= STEPS.length) return;
  const [, make] = STEPS[stepIdx++]; syncBar();
  await tl.play(make());
}
async function playAll() {
  playingAll = true;
  while (playingAll && stepIdx < STEPS.length) { await next(); await tl.play(wait(0.5)); }
  playingAll = false;
}
function restart() {
  playingAll = false; tl.finish();
  Object.keys(S).forEach(k => (S[k] = 0));
  charges.forEach(c => { c.grow = 0; c.label = 0; });
  Object.assign(probe, { grow: 0, label: 0, shown: 0 });
  lines = []; stepIdx = 0; syncBar();
}
nextBtn.onclick = () => { playingAll = false; next(); };
document.getElementById('all').onclick = () => { if (!playingAll) { if (stepIdx >= STEPS.length) restart(); playAll(); } };
document.getElementById('restart').onclick = restart;

/* ---------------- Interazione: trascinare e invertire il segno ---------------- */

let drag = null;
function hit(sx, sy) {
  for (const c of charges) { if (c.grow <= 0) continue; const [a, b] = S2(c.x, c.y); if (Math.hypot(sx - a, sy - b) < Math.max(14, rad(c) * cam.scale) + 16) return c; }
  if (probe.grow > 0) { const [a, b] = S2(probe.x, probe.y); if (Math.hypot(sx - a, sy - b) < 26) return probe; }
  return null;
}
canvas.addEventListener('pointerdown', e => {
  const o = hit(e.clientX, e.clientY);
  if (!o) return;
  if (tl.busy && !playingAll) tl.finish();
  try { canvas.setPointerCapture(e.pointerId); } catch {}
  const [wx, wy] = cam.toWorld(e.clientX, e.clientY);
  drag = { o, id: e.pointerId, ox: o.x - wx, oy: o.y - wy, sx: e.clientX, sy: e.clientY, t: performance.now(), moved: false };
});
canvas.addEventListener('pointermove', e => {
  if (!drag || e.pointerId !== drag.id) return;
  if (Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) > 6) drag.moved = true;
  if (!drag.moved) return;
  const [wx, wy] = cam.toWorld(e.clientX, e.clientY);
  drag.o.x = Math.round((wx + drag.ox) * 200) / 200; drag.o.y = Math.round((wy + drag.oy) * 200) / 200;
  if (S.linesOn > 0 && drag.o !== probe) { lines = traceLines(); }
});
const up = e => {
  if (!drag || e.pointerId !== drag.id) return;
  const { o, moved, t } = drag; drag = null;
  if (!moved && o !== probe && performance.now() - t < 500) flip(o);
};
canvas.addEventListener('pointerup', up);
canvas.addEventListener('pointercancel', e => { if (drag && e.pointerId === drag.id) drag = null; });

// Inversione del segno: il colore sfuma, la forza si ritira e ricresce nel verso opposto, le linee si ridisegnano.
async function flip(c) {
  const showF = S.force > 0, showL = S.linesOn > 0;
  const anims = [tween(c, 'hue', c.q > 0 ? 0 : 1, { run: 0.6 })];
  if (showF) anims.push(tween(S, 'force', 0, { run: 0.35, ease: rate.rushInto }));
  if (showL) anims.push(tween(S, 'linesOn', 0, { run: 0.35 }));
  await tl.play(group(anims));
  c.q = -c.q;
  if (showL) { lines = traceLines(); lines.forEach(L => (L.drawn = 0)); S.linesOn = 1; }
  await tl.play(group([
    ...(showF ? [tween(S, 'force', 1, { run: 0.6, ease: rate.rushFrom })] : []),
    ...(showL ? [lagged(lines.map(L => tween(L, 'drawn', 1, { run: 0.9, ease: rate.linear })), 0.05)] : []),
  ]));
}

/* ---------------- Opzioni di stile ---------------- */

const optsBox = document.getElementById('opts');
function syncOpts() {
  optsBox.querySelectorAll('.seg').forEach(seg => seg.querySelectorAll('button').forEach(b => b.classList.toggle('on', opt[seg.dataset.opt] === b.dataset.v)));
  document.documentElement.style.setProperty('--bg', opt.bg);
  try { localStorage.setItem('proto.manim', JSON.stringify(opt)); } catch {}
}
optsBox.querySelectorAll('.seg').forEach(seg => seg.addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  opt[seg.dataset.opt] = b.dataset.v; syncOpts();
}));
document.getElementById('optMin').onclick = e => { optsBox.classList.toggle('min'); e.target.textContent = optsBox.classList.contains('min') ? 'Mostra' : 'Nascondi'; };
syncOpts();

/* ---------------- Ciclo ---------------- */

let dpr = 1;
function resize() {
  dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(innerWidth * dpr); canvas.height = Math.round(innerHeight * dpr);
  canvas.style.width = innerWidth + 'px'; canvas.style.height = innerHeight + 'px';
  cam.setViewport(innerWidth, innerHeight);
  const narrow = innerWidth < 900;
  cam.fit({ xmin: -0.36, xmax: 0.36, ymin: -0.26, ymax: 0.24 }, { top: narrow ? 130 : 110, bottom: narrow ? 120 : 80, left: 20, right: narrow ? 20 : 280 });
}
addEventListener('resize', resize);
resize();

let last = performance.now();
function frame(ts) {
  const dt = Math.min(0.05, (ts - last) / 1000); last = ts;
  tl.update(dt);
  render();
  requestAnimationFrame(frame);
}
syncBar();
// Il font matematico di KaTeX serve anche alle scritte disegnate sul canvas.
Promise.all([document.fonts.load('italic 19px KaTeX_Math'), document.fonts.load('15px KaTeX_Main')]).catch(() => {}).finally(() => {
  requestAnimationFrame(frame);
  if (!location.hash.includes('fermo')) setTimeout(playAll, 400);
});
window.proto = { S, charges, probe, tl, next, restart, opt };
