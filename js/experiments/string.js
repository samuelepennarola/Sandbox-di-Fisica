import { tn, clamp } from '../core/math.js';
import { uq } from '../core/units.js';
import { Stage, brace, C, symVal } from '../core/annot.js';
import { wallM, scopeTrace } from '../core/osc.js';

const stage = new Stage();
const TWO_PI = 2 * Math.PI;
const N = 320;   // punti della corda disegnata

// Segnale imposto all'estremo sinistro (la "mano" o il vibratore) all'istante tau.
function source(p, tau) {
  if (tau < 0) return 0;
  if (p.mode === 'pulse') return tau < p.tp ? p.A * Math.sin(Math.PI * tau / p.tp) ** 2 : 0;
  return p.A * Math.sin(TWO_PI * p.f * tau);
}

// Spostamento della corda nel punto x all'istante t (soluzione di d'Alembert con le immagini):
// l'onda parte da x = 0, si riflette in L (r = −1 estremo fisso, +1 libero) e poi sul vibratore (che si comporta
// come un estremo fisso), e così via. A ogni metro l'onda perde una frazione dell'ampiezza (smorzamento).
function disp(p, x, t) {
  const L = p.L, v = p.v, r = p.end === 'fixed' ? -1 : 1, a = 1 - p.loss / 100;
  const k = Math.log(Math.max(a, 1e-6)) / L;   // attenuazione per metro (logaritmica)
  let y = 0, sg = 1;
  for (let n = 0; n < 400; n++) {
    const d1 = 2 * n * L + x, d2 = 2 * n * L + 2 * L - x;
    if (d1 > v * t) break;
    const e = Math.exp(k * d1);
    if (e < 1e-4) break;
    y += sg * (e * source(p, t - d1 / v) + r * Math.exp(k * d2) * source(p, t - d2 / v));
    sg *= -r;
  }
  return y;
}

// Ampiezza a regime dell'onda continua nel punto x (somma geometrica di tutte le riflessioni): l'inviluppo.
function envelope(p, x) {
  const L = p.L, kw = TWO_PI * p.f / p.v, r = p.end === 'fixed' ? -1 : 1, a = 1 - p.loss / 100;
  const at = d => a ** (d / L);
  // Z = A [a^{x/L} e^{-ikx} + r a^{(2L-x)/L} e^{-ik(2L-x)}] / (1 - q),  q = -r a² e^{-2ikL}
  const re1 = at(x) * Math.cos(kw * x), im1 = -at(x) * Math.sin(kw * x);
  const d2 = 2 * L - x, re2 = r * at(d2) * Math.cos(kw * d2), im2 = -r * at(d2) * Math.sin(kw * d2);
  const qre = -r * a * a * Math.cos(2 * kw * L), qim = r * a * a * Math.sin(2 * kw * L);
  const dre = 1 - qre, dim = -qim, den = Math.hypot(dre, dim);
  return p.A * Math.hypot(re1 + re2, im1 + im2) / den;
}

function maxEnv(p) {
  if (p.mode === 'pulse') return p.A * 2;
  let m = 0;
  for (let i = 0; i <= 80; i++) m = Math.max(m, envelope(p, p.L * i / 80));
  return Math.max(m, p.A);
}

export default {
  id: 'string',
  title: 'Onde su una corda',
  subtitle: 'Impulsi, riflessione, onde stazionarie',
  dt: 1 / 240,
  sweepHorizon: 30,

  params: [
    { key: 'mode', type: 'select', label: 'Sorgente', value: 'wave',
      options: [{ label: 'Onda continua', value: 'wave' }, { label: 'Impulso singolo', value: 'pulse' }] },
    { key: 'end', type: 'select', label: 'Estremo destro', value: 'fixed',
      options: [{ label: 'Fisso', value: 'fixed' }, { label: 'Libero', value: 'free' }] },
    { key: 'v', label: 'Velocità dell\'onda v', unit: 'm/s', min: 1, max: 20, step: 0.1, value: 5, refit: true },
    { key: 'f', label: 'Frequenza f', unit: 'Hz', min: 0.1, max: 5, step: 0.01, value: 0.75, refit: true },
    { key: 'A', label: 'Ampiezza della sorgente A', unit: 'm', min: 0.02, max: 0.5, step: 0.01, value: 0.1, refit: true },
    { key: 'tp', label: 'Durata dell\'impulso', unit: 's', min: 0.1, max: 2, step: 0.05, value: 0.4 },
    { key: 'L', label: 'Lunghezza della corda L', unit: 'm', min: 2, max: 20, step: 0.5, value: 10, refit: true },
    { key: 'loss', label: 'Smorzamento (per lunghezza)', unit: '%', min: 0, max: 50, step: 1, value: 8, refit: true },
    { key: 'xp', label: 'Punto segnato', unit: 'm', min: 0, max: 20, step: 0.1, value: 6, live: true },
    { key: 'tMax', label: 'Durata della simulazione', unit: 's', min: 5, max: 300, step: 5, value: 60 },
    { key: 'showEnv', type: 'toggle', label: 'Inviluppo (nodi e ventri)', value: false, live: true },
    { key: 'showTrace', type: 'toggle', label: 'Traccia del punto segnato', value: true, live: true, refit: true },
  ],

  presets: [
    { label: 'Impulso su estremo fisso', values: { mode: 'pulse', end: 'fixed', v: 5, A: 0.3, tp: 0.4, L: 10, loss: 3 } },
    { label: 'Impulso su estremo libero', values: { mode: 'pulse', end: 'free', v: 5, A: 0.3, tp: 0.4, L: 10, loss: 3 } },
    { label: 'Stazionaria, 2ª armonica', values: { mode: 'wave', end: 'fixed', v: 5, f: 0.5, A: 0.05, L: 10, loss: 8, showEnv: true } },
    { label: 'Stazionaria, 3ª armonica', values: { mode: 'wave', end: 'fixed', v: 5, f: 0.75, A: 0.05, L: 10, loss: 8, showEnv: true } },
    { label: 'Estremo libero, 2ª armonica', values: { mode: 'wave', end: 'free', v: 5, f: 0.375, A: 0.05, L: 10, loss: 8, showEnv: true } },
  ],

  view(p) {
    // Sotto la corda, se accesa, la traccia del punto segnato (alta quanto l'oscillazione più ampia).
    const h = Math.max(1.35 * maxEnv(p), 0.08 * p.L);
    return { xmin: -0.08 * p.L, xmax: 1.06 * p.L, ymin: p.showTrace ? -3.6 * h : -h, ymax: h * 1.25 };
  },

  init(p) { return { t: 0, tEnd: p.tMax }; },
  step(s, dt) { s.t += dt; },
  done: s => s.t >= s.tEnd,

  sample(s, p) {
    const xp = Math.min(p.xp, p.L);
    return { t: s.t, yp: disp(p, xp, s.t), y0: source(p, s.t) };
  },

  graphs: [
    { title: 'Punto segnato', series: [{ key: 'yp', label: 'y (m)', color: 'weight' }] },
    { title: 'Sorgente', series: [{ key: 'y0', label: 'y sorgente (m)', color: 'vel' }] },
  ],

  handles(s, p) { const xp = Math.min(p.xp, p.L); return [{ id: 'xp', x: xp, y: disp(p, xp, s.t) }]; },

  drag(id, wx, wy, p) {
    if (id !== 'xp') return;
    p.xp = clamp(Math.round(wx * 10) / 10, 0, p.L);
    return 'live';   // spostare il punto segnato non cambia il moto della corda
  },

  mount() { stage.reset(); },

  draw(P, s, p, ui) {
    const S = stage.begin(P, ui), M = S.M, sc = P.cam.scale, t = s.t;
    const L = p.L, yAt = x => disp(p, x, t);

    // Corda a riposo (tenue) e inviluppo dell'onda stazionaria.
    P.line([[0, 0], [L, 0]], { color: 'muted', width: 1, dash: [3, 5], alpha: 0.45 });
    if (p.showEnv && p.mode === 'wave') {
      const g = S.grow('env', 0.8), up = [], dn = [];
      for (let i = 0; i <= 200; i++) { const x = L * i / 200, e = envelope(p, x) * g; up.push([x, e]); dn.push([x, -e]); }
      P.line(up, { color: 'acc', width: 1.2, dash: [5, 5], alpha: 0.7 });
      P.line(dn, { color: 'acc', width: 1.2, dash: [5, 5], alpha: 0.7 });
    }

    // Estremo destro: parete (fisso) o anello su un'asta (libero).
    const hh = Math.max(maxEnv(p) * 1.2, 30 / sc);
    if (p.end === 'fixed') wallM(P, [L, -hh], [L, hh], { nx: 1, ny: 0 });
    else {
      P.line([[L, -hh], [L, hh]], { color: 'muted', width: 1.6, alpha: 0.8 });
      P.circle(L, yAt(L), 6, { stroke: 'text', width: 1.8 });
    }

    // La corda.
    const pts = [];
    for (let i = 0; i <= N; i++) { const x = L * i / N; pts.push([x, yAt(x)]); }
    P.line(pts, { color: 'text', width: 2.2 });

    // Vibratore: un piccolo blocco su una guida verticale.
    const y0 = source(p, t), bw = 14 / sc, bh = 22 / sc;
    P.line([[-bw * 1.2, -hh], [-bw * 1.2, hh]], { color: 'muted', width: 1, alpha: 0.5 });
    P.poly([[-bw * 2, y0 - bh / 2], [0, y0 - bh / 2], [0, y0 + bh / 2], [-bw * 2, y0 + bh / 2]], { fill: M.body.blue, stroke: M.text, width: 1.4, alpha: 0.85 });

    // Lunghezza d'onda: graffa sopra la corda, dal vibratore, quando l'onda ha già percorso almeno λ.
    if (p.mode === 'wave') {
      const lam = p.v / p.f;
      if (lam < L * 0.98 && p.v * t > lam) {
        const yb = hh * 0.95;
        brace(P, [0, yb], [lam, yb], symVal(P, '\\lambda', uq('m', lam)), { side: 1, gap: 4, grow: S.grow('lam', 0.8), color: M.text, alpha: 0.85 });
      }
    }
    // Lunghezza della corda, sotto.
    brace(P, [L, -hh], [0, -hh], symVal(P, 'L', uq('m', L)), { side: 1, gap: 6, grow: S.grow('L', 0.8), color: M.text, alpha: 0.55 });

    // Punto segnato: si muove solo in su e in giù.
    const xp = Math.min(p.xp, L), yp = yAt(xp);
    P.line([[xp, -hh * 0.9], [xp, hh * 0.9]], { color: 'weight', width: 1, dash: [2, 5], alpha: 0.35 });
    if (p.showTrace) {
      // Traccia y(t) del punto segnato sotto la corda, alla stessa scala verticale: il pennino è sotto il punto.
      const Hpx = Math.max(18, maxEnv(p) * sc * 1.05), [a, yb] = P.S(xp, -hh), b = yb + 46 + Hpx;
      const g = S.grow('trace', 0.8);
      P.ctx.save(); P.ctx.globalAlpha = 0.4 * g; P.ctx.strokeStyle = M.vec.weight; P.ctx.setLineDash([2, 4]); P.ctx.lineWidth = 1;
      P.ctx.beginPath(); P.ctx.moveTo(a, yb + 4); P.ctx.lineTo(a, b - Hpx - 12); P.ctx.stroke(); P.ctx.restore();
      const win = p.mode === 'pulse' ? Math.max(4, 3 * p.L / p.v) : Math.min(20, 4 / p.f);
      scopeTrace(P, a, b, tt => disp(p, xp, tt), t, { win, Hpx, valPx: z => z * sc, color: M.vec.weight, grow: g, gap: 0 });
    }
    P.circle(xp, yp, 6, { fill: 'weight' });
    P.handle(xp, yp, ui.active === 'xp');
  },

  formulas(s, p) {
    const lam = p.v / p.f, T = 1 / p.f, fixed = p.end === 'fixed';
    const f1 = fixed ? p.v / (2 * p.L) : p.v / (4 * p.L);
    const nf = fixed ? p.f / f1 : (p.f / f1 + 1) / 2;   // armonica corrispondente (n-esima)
    const onRes = p.mode === 'wave' && Math.abs(nf - Math.round(nf)) < 0.04 && Math.round(nf) >= 1;
    const W = t => C('vel', t);
    return [
      { h: 'Onda' },
      { tex: `v=${uq('m/s', p.v)}\\qquad f=${uq('Hz', p.f)}\\qquad T=\\dfrac1f=${uq('s', T)}` },
      { key: true, tex: `\\lambda=\\dfrac{v}{f}=${uq('m', lam)}` },
      p.mode === 'pulse' && { key: true, tex: `t_{\\text{andata e ritorno}}=\\dfrac{2L}{v}=${uq('s', 2 * p.L / p.v)}` },
      { h: fixed ? 'Onde stazionarie (estremi fissi)' : 'Onde stazionarie (un estremo libero)' },
      fixed
        ? { key: p.mode === 'wave', tex: `f_n=n\\,\\dfrac{v}{2L}=n\\cdot${uq('Hz', f1, 3)}\\qquad L=n\\,\\dfrac{\\lambda}{2}` }
        : { key: p.mode === 'wave', tex: `f_n=(2n-1)\\,\\dfrac{v}{4L}=(2n-1)\\cdot${uq('Hz', f1, 3)}` },
      p.mode === 'wave' && { tex: onRes ? `f=f_{${Math.round(nf)}}:\\ \\text{risonanza, onda stazionaria}` : `f\\neq f_n:\\ \\text{nessuna onda stazionaria}`, cls: onRes ? 'warn' : '' },
      { h: 'Istante attuale' },
      { tex: `t=${uq('s', s.t)}\\qquad ${C('weight', 'y')}(${tn(Math.min(p.xp, p.L), 1)})=${uq('m', disp(p, Math.min(p.xp, p.L), s.t))}` },
      p.mode === 'pulse' && { tex: fixed ? `\\text{estremo fisso: l'impulso torna capovolto}` : `\\text{estremo libero: l'impulso torna dritto}` },
    ].filter(Boolean);
  },

  theory: `
<h2>Onde su una corda</h2>
<p>Se scuoti l'estremo di una corda tesa, la perturbazione si propaga lungo la corda con velocità $v$: ogni punto si muove solo <b>su e giù</b>, mentre la forma viaggia in orizzontale. È un'onda <b>trasversale</b>. Segui il punto rosso: non avanza mai.</p>
<p>La velocità dipende solo dalla corda: dalla tensione $T$ e dalla massa per unità di lunghezza $\\mu$,</p>
$$v = \\sqrt{\\frac{T}{\\mu}}$$

<h3>Onde periodiche</h3>
<p>Se la sorgente oscilla di moto armonico con frequenza $f$, sulla corda compare un'onda sinusoidale. La distanza tra due creste è la <b>lunghezza d'onda</b> $\\lambda$: in un periodo $T = 1/f$ l'onda avanza proprio di $\\lambda$, quindi</p>
$$v = \\lambda f \\qquad \\lambda = \\frac{v}{f}$$

<h3>Riflessione</h3>
<p>Quando un impulso arriva in fondo alla corda torna indietro:</p>
<ul>
  <li>su un <b>estremo fisso</b> torna <b>capovolto</b> (la parete tira la corda in verso opposto);</li>
  <li>su un <b>estremo libero</b> torna <b>dritto</b>, e nell'istante della riflessione l'estremo si alza il doppio.</li>
</ul>

<h3>Sovrapposizione e onde stazionarie</h3>
<p>Due onde che si incontrano si <b>sommano</b> punto per punto (principio di sovrapposizione), poi proseguono come se nulla fosse. L'onda che va e quella riflessa che torna si sovrappongono: per frequenze particolari il risultato è un'<b>onda stazionaria</b>, con punti sempre fermi (<b>nodi</b>) e punti che oscillano al massimo (<b>ventri</b>). Accendi «Inviluppo».</p>
<p>Con due estremi fissi in ciascun estremo c'è un nodo, e nella corda devono stare un numero intero di mezze lunghezze d'onda:</p>
$$L = n\\,\\frac{\\lambda}{2} \\qquad f_n = n\\,\\frac{v}{2L} \\qquad n = 1, 2, 3, \\dots$$
<p>Con un estremo libero (un ventre) ci stanno un numero dispari di quarti d'onda: $f_n = (2n - 1)\\,v/(4L)$.</p>
<div class="box">Le frequenze $f_n$ sono le <b>armoniche</b> della corda: sono quelle che suona una corda di chitarra. Due nodi consecutivi distano $\\lambda/2$.</div>

<h3>Prova con la simulazione</h3>
<ol>
  <li>Manda un impulso su un estremo fisso e poi su uno libero: come torna?</li>
  <li>Raddoppia la frequenza: cosa succede a $\\lambda$? E alla velocità?</li>
  <li>Con $v = 5$ m/s e $L = 10$ m, quali frequenze danno un'onda stazionaria? Verifica con l'inviluppo.</li>
  <li>Metti il punto segnato su un nodo: cosa mostra il grafico?</li>
</ol>

<h3>Esercizi</h3>
<details><summary>1. Un'onda ha frequenza 4 Hz e lunghezza d'onda 0,5 m. Quanto è veloce?</summary>
<p>$v = \\lambda f = 2$ m/s.</p></details>
<details><summary>2. Una corda di chitarra lunga 65 cm vibra in fondamentale a 110 Hz. Quanto vale $v$?</summary>
<p>$\\lambda_1 = 2L = 1{,}3$ m; $v = \\lambda_1 f_1 = 143$ m/s.</p></details>
<details><summary>3. Nella corda dell'esercizio 2, a che frequenza vibra la terza armonica? Quanti nodi ha?</summary>
<p>$f_3 = 330$ Hz; 4 nodi (i due estremi più due interni).</p></details>
`,
};
