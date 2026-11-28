import { rk4, tn, clamp } from '../core/math.js';
import { mixHex, tex } from '../core/manim.js';
import { uq } from '../core/units.js';
import { Stage, C, arrowPx, brace, symVal, rate01 } from '../core/annot.js';
import { chartRight } from '../core/osc.js';

const stage = new Stage();
const TRACE_DT = 1 / 60;

// Vasca a sezione quadrata (lato W_t = 1,40 m → area A_t = 1,96 m²), centrata in x = 0 con fondo interno a y = 0.
const WT = 1.4;
const AT = WT * WT;
const WALL_T = 0.045;

// Altezza delle pareti della vasca: lascia sempre un margine sopra il livello massimo del liquido.
const tankHeight = p => Math.max(2.1, p.H0 + (p.L ** 3) / AT + 0.28);

// Calcolo esatto accoppiato tra quota della base del cubo y >= 0, livello del liquido y_liq e altezza immersa h_imm.
// Il volume di liquido V_f0 = A_t * H0 resta rigorosamente costante; le tre regioni si raccordano con continuità.
function fluidState(y, p) {
  const L = p.L;
  const Ab = L * L;
  const V = Ab * L;
  const yFull = p.H0 + V / AT;
  let yLiq, hImm;
  if (y >= p.H0) {
    yLiq = p.H0;
    hImm = 0;
  } else if (y + L <= yFull) {
    yLiq = yFull;
    hImm = L;
  } else {
    yLiq = (AT * p.H0 - Ab * y) / (AT - Ab);
    hImm = clamp(yLiq - y, 0, L);
  }
  const Vimm = Ab * hImm;
  return { yLiq, hImm, Vimm, V, Ab, frac: Vimm / V };
}

// Forze e stato dinamico del cubo alla quota y (con y >= 0) e velocità verticale vy.
// In dinamica si include la massa aggiunta idrodinamica (0.5 * ρ_f * V_imm) per evitare accelerazioni
// irrealistiche quando ρ_c << ρ_f; all'equilibrio statico contano solo P = m g e S_A = ρ_f V_imm g.
function evalForces(y, vy, p) {
  const yC = Math.max(0, y);
  const fs = fluidState(yC, p);
  const m = p.rhoc * fs.V;
  const mEff = m + 0.5 * p.rhof * fs.Vimm;
  const P = m * p.g;
  const SA = p.rhof * fs.Vimm * p.g;

  let Fv = 0;
  if (fs.hImm > 0) {
    const cLin = 0.35 * Math.sqrt(p.g * p.L) * p.rhof * fs.Ab * (0.15 + 0.85 * fs.frac);
    const cQuad = 0.55 * p.rhof * fs.Ab * (0.2 + 0.8 * fs.frac);
    Fv = -cLin * vy - cQuad * vy * Math.abs(vy);
  } else {
    Fv = -0.02 * m * vy;
  }

  const resting = yC <= 1e-6 && Math.abs(vy) < 0.02 && SA <= P;
  const N = resting ? Math.max(0, P - SA) : 0;
  const ay = resting ? 0 : (-P + SA + Fv) / mEff;

  return { fs, m, mEff, P, SA, Fv: resting ? 0 : Fv, N, ay, resting };
}

// Colore del cubo in base alla densità ρ_c (legno, ghiaccio, plastica/acqua, metallo).
function blockColors(M, rhoc) {
  const dark = M.dark;
  let base;
  if (rhoc < 820) {
    base = M.body.wood;
  } else if (rhoc <= 960) {
    base = mixHex(M.body.blue, dark ? '#d8eef8' : '#b7e2f5', 0.45);
  } else if (rhoc < 2000) {
    base = M.body.green;
  } else {
    base = dark ? '#7e8694' : '#7b828e';
  }
  const top = mixHex(base, '#ffffff', dark ? 0.24 : 0.2);
  const bot = mixHex(base, dark ? '#08090c' : '#1c1914', dark ? 0.4 : 0.22);
  const edge = mixHex(base, dark ? '#ffffff' : '#1c1914', dark ? 0.42 : 0.3);
  return { base, top, bot, edge };
}

// Colore del fluido in base alla densità ρ_f (dall'acqua azzurra al mercurio argenteo).
function fluidColors(M, rhof) {
  const dark = M.dark;
  const water = dark ? '#29ABCA' : '#238bb5';
  const mercury = dark ? '#98a3b3' : '#758294';
  const k = clamp((rhof - 1600) / 3000, 0, 1);
  const fill = mixHex(water, mercury, k);
  const surface = mixHex(fill, dark ? '#ffffff' : '#113a4f', dark ? 0.38 : 0.22);
  const alpha = k > 0.3 ? (dark ? 0.34 : 0.38) : (dark ? 0.22 : 0.24);
  return { fill, surface, alpha };
}

const ARCHIMEDES = {
  id: 'archimedes',
  title: 'Spinta di Archimede',
  subtitle: 'Galleggiamento, equilibrio e affondamento',

  params: [
    { key: 'rhoc', label: 'Densità del corpo ρc', short: 'ρc', unit: 'kg/m³', min: 100, max: 15000, step: 25, value: 600, quick: true },
    { key: 'rhof', label: 'Densità del fluido ρf', short: 'ρf', unit: 'kg/m³', min: 500, max: 13600, step: 25, value: 1000, quick: true },
    { key: 'L', label: 'Lato del cubo L', short: 'L', unit: 'm', min: 0.15, max: 0.70, step: 0.05, value: 0.40, quick: true },
    { key: 'H0', label: 'Livello iniziale fluido H₀', unit: 'm', min: 0.50, max: 1.80, step: 0.05, value: 1.00 },
    { key: 'y0', label: 'Quota iniziale base y₀', unit: 'm', min: 0.00, max: 2.00, step: 0.02, value: 0.85 },
    { key: 'g', label: 'Gravità g', unit: 'm/s²', min: 1, max: 25, step: 0.01, value: 9.81 },
    { key: 'tMax', label: 'Durata della simulazione', unit: 's', min: 5, max: 60, step: 5, value: 15 },
    { key: 'showForces', type: 'toggle', label: 'Forze sul corpo', value: true, live: true },
    { key: 'showDisplaced', type: 'toggle', label: 'Livello a riposo H₀ e volume immerso', value: true, live: true },
    { key: 'showTrace', type: 'toggle', label: 'Grafico quota y(t)', value: false, live: true, refit: true },
  ],

  presets: [
    { label: 'Legno in acqua (ρc = 600)', values: { rhoc: 600, rhof: 1000, L: 0.40, H0: 1.00, y0: 0.85, g: 9.81 } },
    { label: 'Iceberg in mare (917 vs 1025)', values: { rhoc: 917, rhof: 1025, L: 0.45, H0: 1.15, y0: 0.80, g: 9.81 } },
    { label: 'Equilibrio indifferente (ρc = ρf)', values: { rhoc: 1000, rhof: 1000, L: 0.40, H0: 1.15, y0: 0.25, g: 9.81 } },
    { label: 'Ferro in acqua (affonda)', values: { rhoc: 7800, rhof: 1000, L: 0.35, H0: 1.10, y0: 0.90, g: 9.81 } },
    { label: 'Ferro nel mercurio (galleggia!)', values: { rhoc: 7800, rhof: 13600, L: 0.35, H0: 1.00, y0: 0.85, g: 9.81 } },
  ],

  view(p) {
    const ymax = Math.max(tankHeight(p) + 0.22, p.y0 + p.L + 0.35);
    if (p.showTrace) return { xmin: -1.15, xmax: 2.85, ymin: -0.28, ymax };
    return { xmin: -1.35, xmax: 1.35, ymin: -0.28, ymax };
  },

  init(p) {
    const y0 = Math.max(0, p.y0);
    return { t: 0, y: y0, vy: 0, tEnd: p.tMax, trace: [[0, y0]] };
  },

  step(s, dt, p) {
    const ev0 = evalForces(s.y, s.vy, p);
    let y = s.y;
    let vy = s.vy;

    if (!ev0.resting) {
      const f = ([yy, vv]) => [vv, evalForces(yy, vv, p).ay];
      [y, vy] = rk4([s.y, s.vy], dt, f);

      if (y <= 0) {
        y = 0;
        const fs0 = fluidState(0, p);
        if (vy < 0) {
          vy = fs0.hImm > 0 ? -0.12 * vy : -0.25 * vy;
        }
        if (Math.abs(vy) < 0.02 && p.rhof * fs0.Vimm * p.g <= p.rhoc * fs0.V * p.g) {
          vy = 0;
        }
      }
    } else {
      y = 0;
      vy = 0;
    }

    s.y = y;
    s.vy = vy;
    s.t += dt;
    if (s.t - s.trace[s.trace.length - 1][0] >= TRACE_DT - 1e-9) {
      s.trace.push([s.t, s.y]);
    }
  },

  done: s => s.t >= s.tEnd,

  sample(s, p) {
    const ev = evalForces(s.y, s.vy, p);
    return {
      t: s.t,
      y: s.y,
      yLiq: ev.fs.yLiq,
      SA: ev.SA,
      P: ev.P,
      frac: ev.fs.frac * 100,
    };
  },

  graphs: [
    {
      title: 'Quote',
      series: [
        { key: 'y', label: 'base cubo y (m)', color: 'vel' },
        { key: 'yLiq', label: 'livello liquido y_liq (m)', color: 'normal', dash: [5, 4] },
      ],
    },
    {
      title: 'Forze',
      series: [
        { key: 'SA', label: 'spinta S_A (N)', color: 'normal' },
        { key: 'P', label: 'peso P (N)', color: 'weight' },
      ],
    },
    {
      title: 'Volume immerso',
      series: [{ key: 'frac', label: 'frazione immersa (%)', color: 'acc' }],
    },
  ],

  // Il blocco per il diagramma di corpo libero: peso, spinta di Archimede, eventuale normale dal fondo e attrito viscoso.
  bodies(s, p, { scale }) {
    const fresh = s.t === 0;
    const y = fresh ? p.y0 : s.y;
    const vy = fresh ? 0 : s.vy;
    const ev = evalForces(y, vy, p);
    const forces = [{ name: 'P', fx: 0, fy: -ev.P, color: 'weight' }];
    if (ev.SA > 1e-6) forces.push({ name: 'SA', fx: 0, fy: ev.SA, color: 'normal' });
    if (ev.N > 1e-6) forces.push({ name: 'N', fx: 0, fy: ev.N, color: 'tension' });
    if (Math.abs(ev.Fv) > 1e-3 * ev.P) forces.push({ name: 'Fv', fx: 0, fy: ev.Fv, color: 'friction' });

    return [{
      key: 'block',
      title: 'il cubo',
      x: 0,
      y: y + p.L / 2,
      rPx: Math.max(p.L * Math.SQRT1_2 * scale, 14),
      m: ev.m,
      color: 'weight',
      v: [0, vy],
      a: [0, ev.ay],
      forces,
      noResize: true,
      params: ['rhoc', 'L', 'y0'],
    }];
  },

  handles(s, p) {
    const fs = fluidState(p.y0, p);
    return [
      { id: 'block', x: 0, y: p.y0 + p.L / 2, r: 30 },
      { id: 'level', x: WT * 0.4, y: fs.yLiq, r: 26 },
    ];
  },

  drag(id, _wx, wy, p) {
    if (id === 'block') {
      p.y0 = clamp(Math.round((wy - p.L / 2) * 50) / 50, 0, 2.0);
    } else if (id === 'level') {
      const L = p.L;
      const Ab = L * L;
      const V = Ab * L;
      let H0;
      if (wy <= p.y0) H0 = wy;
      else if (wy >= p.y0 + L) H0 = wy - V / AT;
      else H0 = wy - (Ab / AT) * (wy - p.y0);
      p.H0 = clamp(Math.round(H0 * 20) / 20, 0.50, 1.80);
    }
  },

  mount() { stage.reset(); },

  draw(P, s, p, ui) {
    const S = stage.begin(P, ui);
    const M = S.M;
    const ctx = P.ctx;
    const sc = P.cam.scale;
    const fresh = s.t === 0;
    const live = !!ui.active || !!ui.api?.running;
    const yTrue = fresh ? p.y0 : s.y;
    const vyTrue = fresh ? 0 : s.vy;
    const [y, L] = S.smooth('geom', [yTrue, p.L], 0.1, live);
    const ev = evalForces(y, vyTrue, { ...p, L });
    const { fs } = ev;
    const hT = tankHeight(p);
    const halfT = WT / 2;
    const halfB = L / 2;

    // Piano d'appoggio sotto il fondo esterno della vasca.
    P.ground(-WALL_T);

    // Fluido nella vasca (da y = 0 a y = y_liq).
    const fc = fluidColors(M, p.rhof);
    const [tx0, tyTop] = P.S(-halfT, fs.yLiq);
    const [tx1, tyBot] = P.S(halfT, 0);
    const tankWpx = tx1 - tx0;
    const liqHpx = tyBot - tyTop;
    if (liqHpx > 0.5) {
      ctx.save();
      const grad = ctx.createLinearGradient(0, tyTop, 0, tyBot);
      grad.addColorStop(0, fc.fill);
      grad.addColorStop(1, mixHex(fc.fill, M.bg, M.dark ? 0.35 : 0.15));
      ctx.globalAlpha = fc.alpha;
      ctx.fillStyle = grad;
      ctx.fillRect(tx0, tyTop, tankWpx, liqHpx);
      ctx.restore();
    }

    // Fascia dell'acqua spostata Δh = y_liq − H₀ e linea tratteggiata del livello a riposo H₀.
    if (p.showDisplaced) {
      const aH0 = S.grow('h0', 0.6);
      const dh = fs.yLiq - p.H0;
      if (dh > 0.004) {
        const [, yH0px] = P.S(0, p.H0);
        ctx.save();
        ctx.globalAlpha = (M.dark ? 0.16 : 0.18) * aH0;
        ctx.fillStyle = fc.surface;
        ctx.fillRect(tx0, tyTop, tankWpx, yH0px - tyTop);
        ctx.restore();
      }
      P.line([[-halfT, p.H0], [halfT, p.H0]], { color: M.muted, width: 1.4, dash: [5, 5], alpha: 0.78 * aH0 });
      const [hx, hy] = P.S(-halfT, p.H0);
      tex(P, hx - 10, hy, symVal(P, 'H_0', uq('m', p.H0)), {
        size: 15, color: M.muted, align: 'right', halo: M.bg, alpha: 0.9 * aH0,
      });
    }

    // Cubo 2.5D con spigolo reale L, sfumato per densità e con selezione del diagramma di corpo libero.
    const kb = S.born('block');
    const bc = blockColors(M, p.rhoc);
    const [bx0, byTop] = P.S(-halfB * kb, y + L * (0.5 + 0.5 * kb));
    const [bx1, byBot] = P.S(halfB * kb, y + L * (0.5 - 0.5 * kb));
    const bw = bx1 - bx0;
    const bh = byBot - byTop;
    const rad = Math.min(bw, bh) * 0.06;

    if (bw > 1 && bh > 1) {
      ctx.save();
      const roundRect = (pad = 0) => {
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(bx0 - pad, byTop - pad, bw + 2 * pad, bh + 2 * pad, rad + pad);
        else ctx.rect(bx0 - pad, byTop - pad, bw + 2 * pad, bh + 2 * pad);
      };
      if (ui.sel === 'block') {
        roundRect(5);
        ctx.strokeStyle = M.sel;
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 4]);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      roundRect();
      const gBlock = ctx.createLinearGradient(0, byTop, 0, byBot);
      gBlock.addColorStop(0, bc.top);
      gBlock.addColorStop(0.55, bc.base);
      gBlock.addColorStop(1, bc.bot);
      ctx.globalAlpha = M.dark ? 0.9 : 0.94;
      ctx.fillStyle = gBlock;
      ctx.fill();

      // Velatura e tratteggio sottile sulla porzione effettivamente immersa del cubo.
      if (fs.hImm > 0.002) {
        const [, yImmTopPx] = P.S(0, y + fs.hImm);
        ctx.save();
        roundRect();
        ctx.clip();
        ctx.globalAlpha = M.dark ? 0.28 : 0.22;
        ctx.fillStyle = fc.fill;
        ctx.fillRect(bx0, yImmTopPx, bw, byBot - yImmTopPx);
        ctx.globalAlpha = M.dark ? 0.25 : 0.22;
        ctx.strokeStyle = fc.surface;
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let d = -bh; d < bw + bh; d += 10) {
          ctx.moveTo(bx0 + d, byBot);
          ctx.lineTo(bx0 + d + (byBot - yImmTopPx) * 0.65, yImmTopPx);
        }
        ctx.stroke();
        if (fs.hImm < L - 0.002) {
          ctx.globalAlpha = 0.85;
          ctx.strokeStyle = fc.surface;
          ctx.lineWidth = 1.6;
          ctx.beginPath();
          ctx.moveTo(bx0, yImmTopPx);
          ctx.lineTo(bx1, yImmTopPx);
          ctx.stroke();
        }
        ctx.restore();
      }

      ctx.globalAlpha = 1;
      roundRect();
      ctx.strokeStyle = bc.edge;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.restore();
    }

    // Superficie libera del liquido ai lati del cubo (o continua se il cubo non interseca il pelo libero).
    if (y < fs.yLiq && y + L > fs.yLiq) {
      P.line([[-halfT, fs.yLiq], [-halfB, fs.yLiq]], { color: fc.surface, width: 2.2, alpha: 0.95 });
      P.line([[halfB, fs.yLiq], [halfT, fs.yLiq]], { color: fc.surface, width: 2.2, alpha: 0.95 });
    } else {
      P.line([[-halfT, fs.yLiq], [halfT, fs.yLiq]], { color: fc.surface, width: 2.2, alpha: 0.95 });
    }

    // Pareti e fondo della vasca (vetro a U con fondo interno esattamente a y = 0).
    const [wxOut0, wyTop] = P.S(-halfT - WALL_T, hT);
    const [wxOut1, wyOutBot] = P.S(halfT + WALL_T, -WALL_T);
    ctx.save();
    ctx.fillStyle = M.solid;
    ctx.globalAlpha = M.dark ? 0.62 : 0.72;
    ctx.beginPath();
    ctx.rect(wxOut0, wyTop, tx0 - wxOut0, wyOutBot - wyTop);
    ctx.rect(tx1, wyTop, wxOut1 - tx1, wyOutBot - wyTop);
    ctx.rect(wxOut0, tyBot, wxOut1 - wxOut0, wyOutBot - tyBot);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = M.solidEdge;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(wxOut0, wyTop); ctx.lineTo(wxOut0, wyOutBot); ctx.lineTo(wxOut1, wyOutBot); ctx.lineTo(wxOut1, wyTop);
    ctx.moveTo(tx0, wyTop); ctx.lineTo(tx0, tyBot); ctx.lineTo(tx1, tyBot); ctx.lineTo(tx1, wyTop);
    ctx.stroke();
    ctx.restore();

    // Graffa dell'altezza immersa h_imm e percentuale immersa (impilate accanto alla graffa, lasciando libero il centro del cubo).
    if (p.showDisplaced && fs.hImm * sc > 22) {
      const gb = S.grow('braceH', 0.7);
      const pct = Math.round(fs.frac * 100);
      brace(
        P,
        [halfB, y + fs.hImm],
        [halfB, y],
        null,
        { side: 1, gap: 8, grow: gb, color: fc.surface, alpha: 0.95 },
      );
      if (gb > 0.5) {
        const lenPx = fs.hImm * sc * gb;
        const wBrace = Math.min(11, Math.max(5, lenPx * 0.12));
        const [bxEdge] = P.S(halfB, y);
        const [, ymPx] = P.S(0, y + fs.hImm * 0.5);
        const tipX = bxEdge + 8 + wBrace + 6;
        const la = 0.95 * rate01(gb);
        tex(P, tipX, ymPx - 9, symVal(P, 'h_{\\mathrm{imm}}', uq('m', fs.hImm)), {
          size: 15, color: fc.surface, align: 'left', halo: M.bg, alpha: la,
        });
        tex(P, tipX, ymPx + 10, `${pct}\\%\\ \\text{immerso}`, {
          size: 13, color: M.muted, align: 'left', halo: M.bg, alpha: la,
        });
      }
    }

    // Frecce delle forze sul corpo (quando il blocco non è selezionato per il diagramma di corpo libero).
    if (p.showForces && ui.sel !== 'block') {
      const cy = y + L / 2;
      const ref = Math.max(ev.P, p.rhof * fs.V * p.g, 1);
      const sep = ev.N > 1e-4 ? Math.min(0.08 * L, 11 / sc) : 0;

      // Peso P dal baricentro verso il basso.
      const lP = arrowPx(ev.P, ref, { min: 32, max: 96 }) / sc;
      if (lP * sc > 6) {
        P.arrow(0, cy, 0, cy - lP, { color: 'weight', key: 'P', width: 3.4, label: 'P' });
      }

      // Spinta di Archimede S_A verso l'alto (leggermente a sinistra se coesiste con N).
      const lS = arrowPx(ev.SA, ref, { min: 32, max: 96 }) / sc;
      if (lS * sc > 6) {
        const yS0 = fs.hImm > 0 ? y + fs.hImm * 0.5 : cy;
        P.arrow(-sep, yS0, -sep, yS0 + lS, { color: 'normal', key: 'SA', width: 3.4, label: 'SA' });
      }

      // Reazione normale N del fondo quando il cubo poggia a y = 0.
      const lN = arrowPx(ev.N, ref, { min: 30, max: 96 }) / sc;
      if (lN * sc > 6) {
        P.arrow(sep, 0, sep, lN, { color: 'tension', key: 'N', width: 3.2, label: 'N' });
      }

      // Resistenza viscosa F_v durante il moto in fluido.
      const lFv = arrowPx(Math.abs(ev.Fv), ref, { min: 26, max: 70 }) / sc;
      if (Math.abs(ev.Fv) > 0.02 * ev.P && lFv * sc > 10) {
        const xFv = -halfB * 0.55;
        P.arrow(xFv, cy, xFv, cy + Math.sign(ev.Fv) * lFv, { color: 'friction', key: 'Fv', width: 2.6, label: 'Fv' });
      }
    }

    // Punto baricentro del cubo.
    P.circle(0, y + L / 2, 2.5, { fill: M.text, alpha: 0.85 });

    // Grafico quota y(t) a destra della vasca, alla stessa scala verticale della scena.
    if (p.showTrace) {
      const [left] = P.S(halfT + 0.25, 0);
      const [bxS, byS] = P.S(halfB, y);
      const yMax = Math.max(hT, p.y0 + L + 0.1);
      chartRight(P, fresh || !s.trace ? [] : s.trace, fresh ? 0 : s.t, {
        left,
        vmin: 0,
        vmax: yMax,
        tSpan: p.tMax,
        color: M.vec.vel,
        grow: S.grow('trace', 0.9),
        nowV: y,
        link: [bxS + 6, byS],
      });
    }

    if (fresh) {
      P.handle(0, p.y0 + p.L / 2, ui.active === 'block');
      P.handle(WT * 0.4, fs.yLiq, ui.active === 'level');
    }
  },

  formulas(s, p) {
    const fresh = s.t === 0;
    const y = fresh ? p.y0 : s.y;
    const vy = fresh ? 0 : s.vy;
    const ev = evalForces(y, vy, p);
    const { fs, P, SA, N } = ev;
    const Sc = x => C('normal', x);
    const Pc = x => C('weight', x);
    const Nc = x => C('tension', x);
    const ratio = p.rhoc / p.rhof;
    const floats = p.rhoc < p.rhof;
    const neutral = p.rhoc === p.rhof;
    const PApp = P - p.rhof * fs.V * p.g;

    return [
      { h: 'Spinta di Archimede e peso' },
      { key: true, tex: `${Sc('S_A')}=\\rho_f V_{\\mathrm{imm}} g=${uq('N', SA)}` },
      { key: true, tex: `${Pc('P')}=\\rho_c V g=${uq('N', P)}` },
      { tex: `V=L^3=${uq('m³', fs.V, 3)}\\qquad V_{\\mathrm{imm}}=${uq('m³', fs.Vimm, 3)}\\ (${tn(fs.frac * 100, 1)}\\%)` },
      { tex: `y_{\\mathrm{liq}}=${uq('m', fs.yLiq)}\\qquad \\Delta h=${uq('m', fs.yLiq - p.H0, 3)}` },
      { h: 'Condizione di galleggiamento' },
      {
        tex: `\\dfrac{\\rho_c}{\\rho_f}=\\dfrac{${tn(p.rhoc, 0)}}{${tn(p.rhof, 0)}}=${tn(ratio, 3)}\\ ${floats ? '< 1' : neutral ? '= 1' : '> 1'}`,
        cls: floats || neutral ? 'ok' : 'warn',
      },
      floats && { tex: `\\text{Galleggia: }\\dfrac{V_{\\mathrm{imm}}}{V}=\\dfrac{\\rho_c}{\\rho_f}=${tn(ratio * 100, 1)}\\%`, cls: 'ok' },
      neutral && { tex: `\\text{Equilibrio indifferente: }${Sc('S_A')}=${Pc('P')}\\text{ ovunque sott’acqua}`, cls: 'ok' },
      !floats && !neutral && { tex: `\\text{Affonda: peso apparente }P_{\\mathrm{app}}=${Pc('P')}-S_{A,\\max}=${uq('N', PApp)}`, cls: 'warn' },
      { h: 'Istante attuale' },
      { tex: `t=${uq('s', s.t)}\\qquad y=${uq('m', y)}\\qquad ${C('vel', 'v_y')}=${uq('m/s', vy)}` },
      N > 1e-4 && { tex: `\\text{Sul fondo: }${Nc('N')}=${Pc('P')}-${Sc('S_A')}=${uq('N', N)}` },
    ].filter(Boolean);
  },

  derivation() {
    return {
      title: 'Spinta di Archimede dalla legge di Stevino',
      steps: [
        { tex: 'p(h) = p_0 + \\rho_f g h', note: 'Legge di Stevino: la pressione nel fluido cresce con la profondità h' },
        { tex: 'S_A = (p_2 - p_1) A = \\rho_f g (h_2 - h_1) A', note: 'Differenza di spinta tra faccia inferiore e superiore di area A' },
        { tex: 'S_A = \\rho_f g h_{\\mathrm{imm}} A = \\rho_f V_{\\mathrm{imm}} g', note: 'La spinta uguaglia il peso del volume di fluido spostato' },
        { tex: '\\rho_f V_{\\mathrm{imm}} g = \\rho_c V g', note: 'All’equilibrio di galleggiamento vale S_A = P' },
        { indicate: 'g', note: 'La gravità g si semplifica: la frazione immersa non dipende dal pianeta' },
        { tex: '\\frac{V_{\\mathrm{imm}}}{V} = \\frac{\\rho_c}{\\rho_f}', note: 'Rapporto tra volume immerso e volume totale del corpo' },
        { box: 'S_A = \\rho_f V_{\\mathrm{imm}} g \\qquad \\frac{V_{\\mathrm{imm}}}{V} = \\frac{\\rho_c}{\\rho_f}', note: 'Principio di Archimede e legge del galleggiamento' },
      ],
    };
  },

  theory: `
<h2>Spinta di Archimede</h2>
<p>Un corpo immerso in un fluido di densità $\\rho_f$ riceve una spinta verticale verso l'alto, detta <b>spinta di Archimede</b>, pari al peso del volume di fluido spostato:</p>
$$S_A = \\rho_f\\, V_{\\mathrm{imm}}\\, g$$
<p>dove $V_{\\mathrm{imm}}$ è il <b>volume immerso</b> (non necessariamente tutto il volume $V$ del corpo).</p>

<h3>Perché nasce: legge di Stevino</h3>
<p>In un fluido in quiete la pressione cresce con la profondità: $p(h) = p_0 + \\rho_f g h$. Sulla faccia inferiore di un cubo immerso (più profonda) il fluido spinge verso l'alto con una pressione maggiore rispetto alla faccia superiore (meno profonda). Le spinte sulle facce laterali si compensano a due a due, mentre la differenza verticale vale:</p>
$$S_A = (p_{\\mathrm{inf}} - p_{\\mathrm{sup}})\\, A = \\rho_f g h_{\\mathrm{imm}} A = \\rho_f V_{\\mathrm{imm}} g$$

<h3>Galleggiamento, equilibrio indifferente, affondamento</h3>
<p>Confrontando la densità media del corpo $\\rho_c$ con quella del fluido $\\rho_f$ si hanno tre regimi (supponendo che la vasca sia abbastanza profonda):</p>
<ul>
  <li><b>$\\rho_c &lt; \\rho_f$ (galleggia):</b> all'equilibrio $S_A = P$, cioè $\\rho_f V_{\\mathrm{imm}} g = \\rho_c V g$. La <b>frazione di volume immersa</b> dipende solo dal rapporto delle densità:
  $$\\frac{V_{\\mathrm{imm}}}{V} = \\frac{\\rho_c}{\\rho_f}$$
  È il caso del legno in acqua ($60\\%$), del ferro nel mercurio ($57{,}4\\%$) e dell'<b>iceberg in mare</b> ($917/1025 \\approx 89{,}5\\%$ sott'acqua!).</li>
  <li><b>$\\rho_c = \\rho_f$ (equilibrio indifferente):</b> quando il corpo è tutto immerso ($V_{\\mathrm{imm}} = V$), vale esattamente $S_A = P$ a qualunque profondità: resta sospeso dov'è.</li>
  <li><b>$\\rho_c &gt; \\rho_f$ (affonda):</b> anche tutto immerso, il peso supera la spinta massima ($P &gt; S_{A,\\max} = \\rho_f V g$). Il corpo scende fino al fondo della vasca, che esercita la reazione vincolare normale $N = P - S_{A,\\max}$ (pari al <b>peso apparente</b> in acqua).</li>
</ul>

<div class="box">Quando il corpo si immerge sposta liquido e il livello nella vasca sale da $H_0$ a $y_{\\mathrm{liq}} = H_0 + V_{\\mathrm{imm}}/A_{\\mathrm{vasca}}$: finché è immerso parzialmente, ogni millimetro in più di immersione fa salire anche il pelo libero.</div>

<h3>Prova con la simulazione</h3>
<ol>
  <li>Con il preset <i>Legno in acqua</i>, trascina il cubo fuori dall'acqua ($y_0 = 1{,}20\\ \\text{m}$) e avvia: osserva le oscillazioni smorzate e la frazione immersa finale ($60\\%$).</li>
  <li>Scegli <i>Iceberg in mare</i>: quanta parte del ghiaccio resta fuori dall'acqua?</li>
  <li>Con <i>Equilibrio indifferente</i>, sposta il cubo a diverse quote sott'acqua e verifica che resta fermo.</li>
  <li>Confronta <i>Ferro in acqua</i> e <i>Ferro nel mercurio</i>: perché lo stesso cubo affonda in un liquido e galleggia nell'altro?</li>
  <li>Cambia la gravità $g$ (per esempio $1{,}62\\ \\text{m/s}^2$ sulla Luna): cambiano le forze $P$ e $S_A$, ma cambia la frazione immersa?</li>
</ol>

<h3>Esercizi</h3>
<details><summary>1. Un cubo di legno di lato $40\\ \\text{cm}$ e densità $600\\ \\text{kg/m}^3$ galleggia in acqua ($\\rho_f = 1000\\ \\text{kg/m}^3$). Quanto vale la spinta di Archimede all'equilibrio e quanto è immerso?</summary>
<p>$V = (0{,}40)^3 = 0{,}064\\ \\text{m}^3$, $m = 600 \\cdot 0{,}064 = 38{,}4\\ \\text{kg}$. All'equilibrio $S_A = P = 38{,}4 \\cdot 9{,}81 \\approx 377\\ \\text{N}$. La frazione immersa è $\\rho_c/\\rho_f = 0{,}60$, quindi $h_{\\mathrm{imm}} = 0{,}60 \\cdot 40 = 24\\ \\text{cm}$.</p></details>
<details><summary>2. Un blocco di ferro ($\\rho_c = 7800\\ \\text{kg/m}^3$) di volume $V = 0{,}040\\ \\text{m}^3$ è fermo sul fondo di una vasca piena d'acqua. Quanto vale la reazione del fondo?</summary>
<p>$P = 7800 \\cdot 0{,}040 \\cdot 9{,}81 \\approx 3061\\ \\text{N}$; $S_A = 1000 \\cdot 0{,}040 \\cdot 9{,}81 \\approx 392\\ \\text{N}$. La reazione normale del fondo è $N = P - S_A \\approx 2668\\ \\text{N}$.</p></details>
<details><summary>3. Un iceberg di densità $917\\ \\text{kg/m}^3$ galleggia in acqua di mare ($1025\\ \\text{kg/m}^3$). Quale percentuale del suo volume emerge?</summary>
<p>La frazione immersa è $917/1025 \\approx 89{,}5\\%$, quindi la parte emersa è $1 - 0{,}895 = 10{,}5\\%$.</p></details>
<details><summary>4. Lo stesso cubo di lato $0{,}40\\ \\text{m}$ immerso in una vasca quadrata di lato $1{,}40\\ \\text{m}$ fa salire il livello dell'acqua di quanto, quando è sommerso per metà?</summary>
<p>$V_{\\mathrm{imm}} = 0{,}5 \\cdot (0{,}40)^3 = 0{,}032\\ \\text{m}^3$ e $A_{\\mathrm{vasca}} = 1{,}40^2 = 1{,}96\\ \\text{m}^2$, quindi $\\Delta h = V_{\\mathrm{imm}}/A_{\\mathrm{vasca}} = 0{,}032/1{,}96 \\approx 0{,}016\\ \\text{m} = 1{,}6\\ \\text{cm}$.</p></details>
`,
};

export default ARCHIMEDES;
