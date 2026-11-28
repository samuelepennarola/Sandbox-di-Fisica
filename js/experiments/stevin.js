import { clamp, rk4, tn } from '../core/math.js';
import { tex, texBox, glowStroke, mixHex } from '../core/manim.js';
import { uq, un } from '../core/units.js';
import { Stage, brace, createPts, rate01, C as Ccol, arrowPx, symVal } from '../core/annot.js';

const stage = new Stage();

const TANK_W = 1.8;          // larghezza interna del serbatoio (m); parete destra in x = 0
const RATIO_A = 0.025;       // rapporto tra area del foro e area del serbatoio (a / A)
const EMIT_DT = 0.032;       // intervallo di emissione delle gocce nel getto (s)
const VREF = 12;             // velocità di riferimento (m/s) per scalare la freccia di efflusso
const PREF = 250000;         // pressione di riferimento (Pa) per scalare il profilo di Stevino
const GAP = 8;

// Quota del foro misurata dal suolo y = 0, con clamp di sicurezza rispetto al pelo libero iniziale H.
function holeY(p) {
  const h0 = clamp(p.h, 0.05, Math.max(0.05, p.H - 0.05));
  return clamp(p.H - h0, 0.05, Math.max(0.05, p.H - 0.05));
}

// Grandezze istantanee al foro o alla sonda rispetto al livello attuale curH.
function hydro(p, curH = p.H) {
  const yH = holeY(p);
  const hEff = p.openHole
    ? Math.max(0, curH - yH)
    : clamp(p.h, 0.05, Math.max(0.05, curH - 0.05));
  const yProbe = p.openHole ? yH : curH - hEff;
  const dp = p.rho * p.g * hEff;                 // Pa
  const pTot = p.p0 * 1000 + dp;                 // Pa
  const v = p.openHole ? Math.sqrt(2 * p.g * hEff) : 0;
  const tFlight = p.openHole ? Math.sqrt(2 * yH / p.g) : 0;
  const xG = p.openHole ? v * tFlight : 0;       // = 2 * sqrt(hEff * yH)
  return { yH, yProbe, hEff, dp, pTot, v, tFlight, xG };
}

// Etichetta TeX di una freccia (estremi a, b in metri), a distanza GAP px dal riquadro del testo.
function tag(P, S, key, a, b, src, color, { side = null, at = 0.6, alpha = 1, size = 16, minX = null } = {}) {
  if (S.snap) return;
  const g = S.grow('arr:' + key), [x0, y0] = P.S(a[0], a[1]);
  const [x1, y1] = P.S(a[0] + (b[0] - a[0]) * g, a[1] + (b[1] - a[1]) * g);
  const len = Math.hypot(x1 - x0, y1 - y0);
  if (len <= 18) return;
  const ux = (x1 - x0) / len, uy = (y1 - y0) / len;
  const B = texBox(P, src, size), hw = B.w / 2 + 2, hh = (B.bot - B.top) / 2;
  const reach = (dx, dy) => GAP + Math.min(Math.abs(dx) > 1e-6 ? hw / Math.abs(dx) : 1e9, Math.abs(dy) > 1e-6 ? hh / Math.abs(dy) : 1e9);
  let cx, cy;
  if (!side) {
    const k = reach(ux, uy);
    cx = x1 + ux * k; cy = y1 + uy * k;
  } else {
    if (len < 44) at = 1;
    let nx = -uy, ny = ux;
    if (nx * side[0] + ny * side[1] < 0) { nx = -nx; ny = -ny; }
    const k = reach(nx, ny);
    cx = x0 + (x1 - x0) * at + nx * k;
    cy = y0 + (y1 - y0) * at + ny * k;
  }
  if (minX != null && cx - hw < minX) cx = minX + hw;
  tex(P, cx, cy - (B.top + B.bot) / 2, src, { size, color, halo: S.M.bg, alpha: alpha * rate01(g) });
}

export default {
  id: 'stevin',
  title: 'Stevino e Torricelli',
  subtitle: 'Pressione idrostatica ed efflusso',

  params: [
    { key: 'rho', label: 'Densità del fluido ρ', unit: 'kg/m³', min: 500, max: 13600, step: 50, value: 1000, quick: true, short: 'ρ' },
    { key: 'H', label: 'Altezza iniziale H', unit: 'm', min: 0.5, max: 5.0, step: 0.05, value: 2.0, quick: true, short: 'H', refit: true },
    { key: 'h', label: 'Profondità foro / sonda h', unit: 'm', min: 0.1, max: 4.9, step: 0.05, value: 1.0, quick: true, short: 'h', live: true },
    { key: 'g', label: 'Gravità g', unit: 'm/s²', min: 1, max: 25, step: 0.01, value: 9.81 },
    { key: 'p0', label: 'Pressione atmosferica p₀', unit: 'kPa', min: 0, max: 300, step: 0.1, value: 101.3, live: true },
    { key: 'tMax', label: 'Durata della simulazione', unit: 's', min: 5, max: 120, step: 5, value: 30 },
    { key: 'openHole', type: 'toggle', label: 'Foro di efflusso (Torricelli)', value: true, live: true, refit: true },
    { key: 'drain', type: 'toggle', label: 'Svuotamento del serbatoio', value: false },
    { key: 'showSym', type: 'toggle', label: 'Foro simmetrico H − h', value: false, live: true },
    { key: 'showProfile', type: 'toggle', label: 'Profilo di pressione (Stevino)', value: true, live: true, refit: true },
  ],

  presets: [
    {
      label: 'Gittata massima (h = H/2)',
      values: { rho: 1000, H: 2.0, h: 1.0, g: 9.81, p0: 101.3, openHole: true, drain: false, showSym: false, showProfile: true },
    },
    {
      label: 'Confronto fori simmetrici',
      values: { rho: 1000, H: 2.0, h: 0.5, g: 9.81, p0: 101.3, openHole: true, drain: false, showSym: true, showProfile: true },
    },
    {
      label: 'Solo idrostatica (Stevino)',
      values: { rho: 1000, H: 2.5, h: 1.5, g: 9.81, p0: 101.3, openHole: false, drain: false, showSym: false, showProfile: true },
    },
    {
      label: 'Mercurio (ρ = 13600 kg/m³)',
      values: { rho: 13600, H: 1.5, h: 0.75, g: 9.81, p0: 101.3, openHole: true, drain: false, showSym: false, showProfile: true },
    },
    {
      label: 'Svuotamento del serbatoio',
      values: { rho: 1000, H: 2.5, h: 2.0, g: 9.81, p0: 101.3, openHole: true, drain: true, showSym: false, showProfile: true },
    },
  ],

  view(p) {
    const h0 = clamp(p.h, 0.05, Math.max(0.05, p.H - 0.05));
    const xG = p.openHole ? 2 * Math.sqrt(h0 * (p.H - h0)) : 0;
    const xmin = -TANK_W - (p.showProfile ? 2.85 : 1.55);
    const xmax = p.openHole ? Math.max(p.H, xG, 1.5) + 1.25 : 1.55;
    return { xmin, xmax, ymin: -0.95, ymax: Math.max(p.H + 0.65, 1.8) };
  },

  init(p) {
    return {
      t: 0,
      curH: p.H,
      emitAcc: 0,
      dropIdx: 0,
      drops: [],
      splashes: [],
      drained: false,
      done: false,
    };
  },

  step(st, dt, p) {
    const yH = holeY(p);

    if (p.drain && p.openHole) {
      const [nextH] = rk4([st.curH], dt, ([Hcur]) => {
        const he = Math.max(0, Hcur - yH);
        return [-RATIO_A * Math.sqrt(2 * p.g * he)];
      });
      if (nextH <= yH + 1e-5) {
        st.curH = yH;
        st.drained = true;
      } else {
        st.curH = nextH;
      }
    } else {
      st.curH = p.H;
    }

    const hEff = Math.max(0, st.curH - yH);
    const vExit = p.openHole && hEff > 1e-4 ? Math.sqrt(2 * p.g * hEff) : 0;

    // Emissione periodica di particelle liquide lungo il getto parabolico.
    if (vExit > 0) {
      st.emitAcc += dt;
      while (st.emitAcc >= EMIT_DT) {
        st.emitAcc -= EMIT_DT;
        const r = 0.04 + (st.dropIdx % 3) * 0.008;
        st.dropIdx++;
        st.drops.push({ x: 0, y: yH, vx: vExit, vy: 0, r });
      }
    }

    // Avanzamento balistico esatto delle gocce in caduta libera.
    const alive = [];
    for (const d of st.drops) {
      const nextY = d.y + d.vy * dt - 0.5 * p.g * dt * dt;
      if (nextY <= 0) {
        const u = d.y > 0 ? d.y / Math.max(1e-6, d.y - nextY) : 0;
        const xHit = d.x + d.vx * dt * u;
        st.splashes.push({ x: xHit, age: 0 });
      } else {
        d.x += d.vx * dt;
        d.y = nextY;
        d.vy -= p.g * dt;
        alive.push(d);
      }
    }
    st.drops = alive;

    // Schizzi al suolo di breve durata.
    const nextSplashes = [];
    for (const sp of st.splashes) {
      sp.age += dt;
      if (sp.age < 0.32) nextSplashes.push(sp);
    }
    st.splashes = nextSplashes;

    st.t += dt;
    if (st.t >= p.tMax || (p.drain && p.openHole && st.drained && st.drops.length === 0)) {
      st.done = true;
    }
  },

  done: s => s.done,

  sample(s, p) {
    const curH = p.drain ? s.curH : p.H;
    const h = hydro(p, curH);
    return {
      t: s.t,
      dp: h.dp / 1000,
      pTot: h.pTot / 1000,
      v: h.v,
      curH,
      xG: h.xG,
    };
  },

  graphs: [
    { title: 'Pressione al foro / sonda', series: [{ key: 'dp', label: 'Δp (kPa)', color: 'friction' }] },
    { title: 'Velocità di efflusso', series: [{ key: 'v', label: 'v (m/s)', color: 'vel' }] },
    { title: 'Livello e gittata', series: [{ key: 'curH', label: 'H(t) (m)', color: 'normal' }, { key: 'xG', label: 'x_G (m)', color: 'vel' }] },
  ],

  handles(s, p) {
    const curH = p.drain && s.t > 0 ? s.curH : p.H;
    const h = hydro(p, curH);
    return [
      { id: 'H', x: -TANK_W * (p.openHole ? 0.5 : 0.28), y: curH, r: 30 },
      { id: 'h', x: p.openHole ? 0 : -TANK_W * 0.60, y: h.yProbe, r: 30 },
    ];
  },

  drag(id, wx, wy, p) {
    if (id === 'H') {
      p.H = clamp(Math.round(wy * 20) / 20, 0.5, 5.0);
      if (p.h > p.H - 0.05) p.h = clamp(Math.round((p.H - 0.05) * 20) / 20, 0.1, 4.9);
      return;
    }
    if (id === 'h') {
      const hRaw = p.H - wy;
      p.h = clamp(Math.round(hRaw * 20) / 20, 0.1, Math.max(0.1, p.H - 0.05));
      if (!p.drain) return 'live';
    }
  },

  mount() { stage.reset(); },

  draw(P, s, p, ui) {
    const S = stage.begin(P, ui), M = S.M, sc = P.cam.scale;
    const live = !!ui.active || !!ui.api?.running;
    const [Hv, hv, rhov, gv, p0v] = S.smooth('p', [p.H, p.h, p.rho, p.g, p.p0], 0.11, live);
    const curH = p.drain && s.t > 0 ? s.curH : Hv;
    const q = { ...p, H: Hv, h: hv, rho: rhov, g: gv, p0: p0v };
    const h = hydro(q, curH);

    // Tinta del fluido: azzurro per l'acqua, riflesso argenteo al crescere della densità verso il mercurio.
    const densT = clamp((rhov - 1000) / 12600, 0, 0.72);
    const fluidCol = mixHex(M.vec.vel, M.muted, densT);
    const wallCol = M.dark ? '#e8e5dc' : '#2c2923';

    P.ground(0);

    // 1. Fluido nel serbatoio: gradiente verticale morbido e pelo libero nitido.
    if (curH > 1e-3) {
      const [xL, yTop] = P.S(-TANK_W, curH);
      const [xR, yBot] = P.S(0, 0);
      const ctx = P.ctx;
      ctx.save();
      const grad = ctx.createLinearGradient(0, yTop, 0, yBot);
      grad.addColorStop(0, mixHex(fluidCol, '#ffffff', M.dark ? 0.12 : 0.22));
      grad.addColorStop(1, mixHex(fluidCol, M.bg, M.dark ? 0.28 : 0.08));
      ctx.globalAlpha = M.dark ? 0.30 : 0.25;
      ctx.fillStyle = grad;
      ctx.fillRect(xL, yTop, xR - xL, yBot - yTop);
      ctx.restore();

      // Linea del pelo libero (e leggera ondulazione durante lo svuotamento).
      P.line([[-TANK_W, curH], [0, curH]], { color: fluidCol, width: 2.4, alpha: 0.95 });
      if (p.p0 > 0.05) {
        tex(P, ...P.S(-TANK_W * 0.5, curH + 14 / sc), symVal(P, 'p_0', uq('kPa', p0v, 1)),
          { size: 13, color: M.muted, halo: M.bg, alpha: 0.85 });
      }
    }

    // 2. Profilo di pressione di Stevino lungo la parete sinistra: Δp(y) = ρ g (curH - y).
    const dpMax = rhov * gv * curH;
    const profPx = p.showProfile && curH > 1e-3 ? arrowPx(dpMax, PREF, { min: 44, max: 122 }) : 0;
    const profW = profPx / sc;

    if (p.showProfile && curH > 0.02) {
      const gp = S.grow('profile', 0.75);
      const tri = [[-TANK_W, curH], [-TANK_W, 0], [-TANK_W - profW * gp, 0]];
      P.poly(tri, { fill: M.vec.friction, alpha: M.dark ? 0.14 : 0.12 });
      P.line([[-TANK_W, curH], [-TANK_W - profW * gp, 0]], { color: M.vec.friction, width: 1.8, alpha: 0.85 * gp });
      P.line([[-TANK_W, 0], [-TANK_W - profW * gp, 0]], { color: M.vec.friction, width: 1.4, alpha: 0.55 * gp });

      // Frecce orizzontali crescenti linearmente con la profondità.
      const N = 6;
      for (let i = 1; i <= N; i++) {
        const f = i / N, yi = curH * (1 - f), len = profW * f;
        if (len * sc > 6) {
          P.arrow(-TANK_W, yi, -TANK_W - len, yi, {
            color: 'friction', width: 2, head: 9, alpha: 0.78, key: 'dp' + i, delay: i * 0.04,
          });
        }
      }

      // Isobara orizzontale alla quota della sonda / foro.
      const wProbe = curH > 1e-6 ? profW * clamp((curH - h.yProbe) / curH, 0, 1) : 0;
      const xEndIso = p.openHole ? 0 : -TANK_W * 0.60;
      P.line([[-TANK_W - wProbe, h.yProbe], [xEndIso, h.yProbe]], {
        color: M.vec.friction, width: 1.4, dash: [4, 4], alpha: 0.75 * gp,
      });
      if (wProbe * sc > 4) {
        P.circle(-TANK_W - wProbe, h.yProbe, 3.6, { fill: M.vec.friction, alpha: gp });
      }
    }

    // Sonda interna e valore live di Δp alla profondità h (sotto l'isobara per non sovrapporsi alla graffa h).
    const xSensor = -TANK_W * 0.60;
    if (!p.openHole || p.showProfile) {
      P.circle(xSensor, h.yProbe, p.openHole ? 3.2 : 5.5, {
        fill: p.openHole ? M.vec.friction : M.bg,
        stroke: M.vec.friction,
        width: 2.2,
        alpha: 0.95,
      });
      if (!p.openHole) P.circle(xSensor, h.yProbe, 2.4, { fill: M.vec.friction });
      const dpLabel = symVal(P, '\\Delta p', uq('kPa', h.dp / 1000, 2));
      const yLab = h.yProbe * sc > 32 ? h.yProbe - 20 / sc : h.yProbe + 20 / sc;
      tex(P, ...P.S(-TANK_W * 0.5, yLab), dpLabel, { size: 14, color: M.vec.friction, halo: M.bg, alpha: 0.95 });
    }

    // 3. Pareti del serbatoio (aperto in alto, eventuale ugello sulla parete destra).
    const tankTop = Math.max(Hv + 0.35, 1.0);
    const lip = 0.07;
    P.line([[-TANK_W - lip, tankTop], [-TANK_W, tankTop], [-TANK_W, 0], [0, 0]], { color: wallCol, width: 2.6 });

    if (p.openHole) {
      const gapH = Math.min(0.14, 11 / sc), nozL = 0.09;
      const yTopHole = Math.min(tankTop, h.yH + gapH / 2);
      const yBotHole = Math.max(0, h.yH - gapH / 2);
      P.line([[0, tankTop], [0, yTopHole], [nozL, yTopHole]], { color: wallCol, width: 2.6 });
      P.line([[nozL, yBotHole], [0, yBotHole], [0, 0]], { color: wallCol, width: 2.6 });
      P.line([[0, tankTop], [lip, tankTop]], { color: wallCol, width: 2.6 });
    } else {
      P.line([[0, 0], [0, tankTop], [lip, tankTop]], { color: wallCol, width: 2.6 });
    }

    // 4. Quote geometriche: altezza H(t) a sinistra e profondità h ben separata dalla sonda.
    const gb = S.grow('braces', 0.8);
    const xBraceH = -TANK_W - (p.showProfile ? profW + 0.10 : 0.08);
    if (curH * sc > 24) {
      brace(P, [xBraceH, curH], [xBraceH, 0], symVal(P, p.drain && s.t > 0 ? 'H(t)' : 'H', uq('m', curH, 2)), {
        side: -1, gap: 6, grow: gb, color: M.text, alpha: 0.88,
      });
    }
    if (h.hEff * sc > 18) {
      const xBraceh = p.openHole ? -0.10 : 0.10;
      brace(P, [xBraceh, curH], [xBraceh, h.yProbe], symVal(P, 'h', uq('m', h.hEff, 2)), {
        side: p.openHole ? -1 : 1, gap: 6, grow: gb, color: M.vec.normal, alpha: 0.95,
      });
    }

    // 5. Efflusso di Torricelli: getto parabolico, gocce animate, gittata x_G e vettore velocità.
    if (p.openHole) {
      if (h.hEff > 1e-4) {
        const pts = [];
        for (let i = 0; i <= 90; i++) {
          const ti = h.tFlight * i / 90;
          pts.push([h.v * ti, h.yH - 0.5 * gv * ti * ti]);
        }

        if (!p.drain || s.t === 0) {
          // Regime stazionario: filo continuo fluido con curva morbida.
          const gJet = S.grow('jet', 0.85);
          const sPts = createPts(pts, gJet).map(([x, y]) => P.S(x, y));
          glowStroke(P.ctx, sPts, fluidCol, { width: s.t > 0 ? 4.2 : 3.2, alpha: s.t > 0 ? 0.58 : 0.78, dark: M.dark });
        } else {
          // Svuotamento: parabola istantanea tratteggiata + scia reale delle particelle in volo.
          P.line(pts, { color: fluidCol, width: 1.3, dash: [5, 5], alpha: 0.4 });
          if (s.drops.length) {
            const streak = [[0, h.yH], ...s.drops.slice().reverse().map(d => [d.x, d.y])];
            glowStroke(P.ctx, streak.map(([x, y]) => P.S(x, y)), fluidCol, { width: 3.6, alpha: 0.55, dark: M.dark });
          }
        }

        // Gocce animate e schizzi al suolo durante la simulazione.
        for (const d of s.drops) {
          P.circle(d.x, d.y, clamp(d.r * sc, 2.8, 6.2), { fill: fluidCol, alpha: 0.92 });
        }
        for (const sp of s.splashes) {
          const u = sp.age / 0.32;
          const a = 0.75 * (1 - u);
          P.circle(sp.x - 0.08 * u, 0.08 * u * (1 - u) * 2.5, 2.2, { fill: fluidCol, alpha: a });
          P.circle(sp.x + 0.08 * u, 0.08 * u * (1 - u) * 2.5, 2.2, { fill: fluidCol, alpha: a });
        }

        // Punto d'impatto al suolo e graffa della gittata x_G.
        if (h.xG > 0.03) {
          const fG = !p.drain || s.t === 0 ? S.grow('jet', 0.85) : 1;
          const gX = Math.min(1, Math.max(0, (fG - 0.5) / 0.5));
          P.circle(h.xG, 0, 3.8, { fill: fluidCol, alpha: 0.9 * gX });
          brace(P, [0, 0], [h.xG, 0], symVal(P, 'x_G', uq('m', h.xG, 2)), {
            side: -1, gap: 18, grow: S.grow('xG', 0.8) * gX, color: M.text, alpha: 0.92,
          });
        }

        // Vettore velocità di efflusso all'ugello (etichetta sopra la freccia, lontano dal getto).
        const vLen = arrowPx(h.v, VREF, { min: 36, max: 112 }) / sc;
        const tip = [vLen, h.yH];
        P.arrow(0, h.yH, tip[0], tip[1], { color: 'vel', width: 3.2, key: 'vExit' });
        tag(P, S, 'vExit', [0, h.yH], tip, symVal(P, '\\vec v', uq('m/s', h.v, 2)), M.vec.vel, {
          side: [0, -1], at: 0.65, size: 15, minX: P.S(0, 0)[0] + 6,
        });
      }

      // 6. Foro simmetrico complementare alla profondità h' = curH - h (quota y' = h).
      if (p.showSym && h.hEff > 0.05 && h.yH > 0.05) {
        const ySym = h.hEff;
        const hSym = curH - ySym; // = h.yH
        if (Math.abs(ySym - h.yH) < 0.04) {
          tex(P, ...P.S(h.xG, 24 / sc), 'h = H/2\\ (x_G\\ \\mathrm{max})', {
            size: 13, color: M.vec.acc, halo: M.bg, alpha: 0.95,
          });
        } else {
          const vSym = Math.sqrt(2 * gv * hSym);
          const tSym = Math.sqrt(2 * ySym / gv);
          const symPts = [];
          for (let i = 0; i <= 80; i++) {
            const ti = tSym * i / 80;
            symPts.push([vSym * ti, ySym - 0.5 * gv * ti * ti]);
          }
          const gs = S.grow('sym', 0.9);
          P.circle(0, ySym, 4.5, { fill: M.bg, stroke: M.vec.acc, width: 2, alpha: 0.95 });
          P.line(createPts(symPts, gs), { color: 'acc', width: 1.8, dash: [6, 5], alpha: 0.85 });
          const vsLen = arrowPx(vSym, VREF, { min: 30, max: 96 }) / sc;
          P.arrow(0, ySym, vsLen, ySym, { color: 'acc', width: 2.2, dash: [4, 3], alpha: 0.9, key: 'vSym' });
          tag(P, S, 'vSym', [0, ySym], [vsLen, ySym], `h'=${uq('m', hSym, 2)}`, M.vec.acc, {
            side: [0, -1], at: 0.6, size: 14, alpha: 0.95,
          });
        }
      }
    }

    // 7. Maniglie interattive per H e h.
    P.handle(-TANK_W * (p.openHole ? 0.5 : 0.28), curH, ui.active === 'H');
    P.handle(p.openHole ? 0 : xSensor, h.yProbe, ui.active === 'h');
  },

  formulas(s, p) {
    const curH = p.drain ? s.curH : p.H;
    const h = hydro(p, curH);
    const dpBottomKPa = p.rho * p.g * curH / 1000;
    const Pc = x => Ccol('friction', x);
    const Hc = Ccol('normal', 'h');
    const Gc = Ccol('acc', 'g');
    const Vc = x => Ccol('vel', x);

    const rows = [
      { h: 'Legge di Stevino' },
      { key: !p.openHole, tex: `${Pc('p')} = p_0 + \\rho ${Gc} ${Hc} = ${uq('kPa', h.pTot / 1000, 1)}` },
      { key: true, tex: `${Pc('\\Delta p')} = \\rho ${Gc} ${Hc} = ${uq('kPa', h.dp / 1000, 2)}` },
      { tex: `\\Delta p_{\\text{fondo}} = \\rho ${Gc} H = ${uq('kPa', dpBottomKPa, 2)}` },
    ];

    if (p.openHole) {
      rows.push(
        { h: 'Efflusso di Torricelli' },
        { key: true, tex: `${Vc('v')} = \\sqrt{2 ${Gc} ${Hc}} = ${uq('m/s', h.v)}` },
        { tex: `t_{\\text{volo}} = \\sqrt{\\dfrac{2 y_f}{${Gc}}} = ${uq('s', h.tFlight)}` },
        { tex: p.drain
          ? `x_G = 2\\sqrt{${Hc}\\,y_f} = ${uq('m', h.xG)}`
          : `x_G = 2\\sqrt{${Hc}(H - ${Hc})} = ${uq('m', h.xG)}` },
      );
      if (p.showSym && h.hEff > 0.05 && h.yH > 0.05) {
        const hSym = h.yH;
        const vSym = Math.sqrt(2 * p.g * hSym);
        const xGSym = 2 * Math.sqrt(hSym * h.hEff);
        rows.push({
          tex: `\\text{foro } H-h: h'=${uq('m', hSym)}\\quad v'=${uq('m/s', vSym)}\\quad x'_G=${uq('m', xGSym)}`,
        });
      }
    }

    if (p.drain || s.t > 0) {
      rows.push(
        { h: 'Stato attuale' },
        { tex: `t = ${uq('s', s.t)}\\qquad H(t) = ${uq('m', curH)}\\qquad h_{\\text{eff}} = ${uq('m', h.hEff)}` },
      );
      if (s.drained) {
        rows.push({ tex: `\\text{livello raggiunto al foro } (v = 0)`, cls: 'ok' });
      }
    }

    return rows;
  },

  derivation() {
    return {
      title: 'Teorema di Torricelli',
      steps: [
        { tex: 'p_0 + \\rho g H = p_0 + \\frac{1}{2} \\rho v^2 + \\rho g (H - h)', note: 'Bernoulli tra superficie libera (v₀ ≈ 0) e foro' },
        { indicate: 'p_0', note: 'La pressione atmosferica p₀ agisce su entrambi i lati e si elide' },
        { tex: '\\rho g H = \\frac{1}{2} \\rho v^2 + \\rho g (H - h)', note: 'Sottraiamo p₀ da entrambi i membri' },
        { indicate: '\\rho', note: 'La densità ρ compare in ogni termine e si semplifica' },
        { tex: 'g h = \\frac{1}{2} v^2', note: 'Semplifichiamo ρ e gH: l’energia potenziale diventa cinetica' },
        { tex: 'v = \\sqrt{2 g h}', note: 'Ricaviamo la velocità di efflusso dal foro' },
        { box: 'v = \\sqrt{2 g h}', note: 'Teorema di Torricelli: uguale alla caduta libera da altezza h!' },
      ],
    };
  },

  theory: `
<h2>Legge di Stevino e Teorema di Torricelli</h2>
<p>In un fluido incomprimibile di densità $\\rho$ in equilibrio sotto la gravità $g$, la pressione aumenta linearmente con la profondità $h$ sotto il pelo libero.</p>

<h3>Legge di Stevino</h3>
<p>Considerando una colonna verticale di fluido di sezione $A$ e altezza $h$, il peso della colonna è $P = m g = \\rho V g = \\rho A h g$. Dividendo per l'area $A$ e sommando la pressione atmosferica $p_0$ che grava sulla superficie libera si ottiene:</p>
$$p = p_0 + \\rho g h \\qquad \\Delta p = p - p_0 = \\rho g h$$
<div class="box"><b>Paradosso idrostatico:</b> la pressione $\\Delta p = \\rho g h$ dipende soltanto da densità, gravità e profondità $h$, <b>non dalla forma né dalla larghezza</b> del recipiente. Su tutta una linea orizzontale (isobara) la pressione ha lo stesso valore.</div>

<h3>Teorema di Torricelli</h3>
<p>Apriamo un piccolo foro sulla parete del serbatoio alla profondità $h$ (quota $y_f = H - h$ dal suolo). Applicando il teorema di Bernoulli tra un punto sulla superficie libera (pressione $p_0$, quota $H$, velocità trascurabile $v_0 \\approx 0$ perché $A_{\\text{serbatoio}} \\gg A_{\\text{foro}}$) e il getto in uscita dal foro (pressione atmosferica $p_0$, quota $H - h$, velocità $v$):</p>
$$p_0 + \\rho g H = p_0 + \\frac{1}{2}\\rho v^2 + \\rho g(H - h) \\quad\\Longrightarrow\\quad v = \\sqrt{2 g h}$$
<p>La velocità di efflusso coincide con quella di un corpo che cade liberamente nel vuoto da un'altezza $h$ e <b>non dipende dalla densità del fluido</b>: acqua e mercurio, a parità di $h$, escono alla stessa velocità (mentre la pressione al foro è 13,6 volte maggiore nel mercurio!).</p>

<h3>Gittata del getto e fori simmetrici</h3>
<p>All'uscita il getto ha velocità orizzontale $v = \\sqrt{2gh}$ e cade da un'altezza $y_f = H - h$:</p>
$$t_{\\text{volo}} = \\sqrt{\\frac{2(H - h)}{g}} \\qquad x_G = v\\,t_{\\text{volo}} = 2\\sqrt{h(H - h)}$$
<p>Scambiando $h$ con $H - h$ il prodotto $h(H - h)$ non cambia: <b>due fori simmetrici rispetto a metà altezza hanno esattamente la stessa gittata</b>! Inoltre, completando il quadrato:</p>
$$h(H - h) = \\frac{H^2}{4} - \\left(h - \\frac{H}{2}\\right)^2$$
<p>la gittata è massima quando il secondo termine si annulla, cioè a <b>metà altezza</b> $h = H/2$, dove vale $x_{G,\\max} = H$.</p>

<h3>Svuotamento del serbatoio</h3>
<p>Se il serbatoio non viene rabboccato, per la conservazione della massa la portata uscente fa abbassare il livello $H(t)$ secondo:</p>
$$\\frac{\\mathrm{d}H}{\\mathrm{d}t} = -\\frac{a}{A}\\sqrt{2g\\,(H - y_f)}$$
<p>Integrando si trova che il battente $h(t) = H(t) - y_f$ decresce parabolicamente nel tempo fino ad annullarsi quando il pelo libero raggiunge il foro.</p>

<h3>Prova con la simulazione</h3>
<ol>
  <li>Con $H = 2{,}0$ m, imposta $h = 0{,}5$ m e attiva <b>Foro simmetrico</b>: verifica che il getto da $H - h = 1{,}5$ m atterra nello stesso punto $x_G$.</li>
  <li>Trascina la maniglia del foro verso metà altezza ($h = H/2$): controlla che la gittata raggiunga il massimo $x_G = H$.</li>
  <li>Seleziona il preset <b>Mercurio</b>: cosa succede alla pressione $\\Delta p$ rispetto all'acqua? E alla velocità $v$?</li>
  <li>Disattiva il foro di efflusso e trascina la sonda in profondità per leggere il profilo lineare di Stevino.</li>
  <li>Attiva <b>Svuotamento del serbatoio</b> e premi Play: osserva nei grafici il calo di $H(t)$, $v(t)$ e $\\Delta p(t)$.</li>
</ol>

<h3>Esercizi</h3>
<details><summary>1. Calcola la pressione relativa e assoluta a 3 m di profondità in una piscina d'acqua ($\\rho = 1000$ kg/m³, $p_0 = 101{,}3$ kPa).</summary>
<p>$\\Delta p = \\rho g h = 1000 \\cdot 9{,}81 \\cdot 3 \\approx 29{,}4$ kPa; $\\quad p = 101{,}3 + 29{,}4 = 130{,}7$ kPa.</p></details>
<details><summary>2. Un serbatoio è pieno fino a $H = 3{,}2$ m e ha un foro a $h = 1{,}2$ m sotto il pelo libero. Calcola velocità di uscita e gittata.</summary>
<p>$v = \\sqrt{2 \\cdot 9{,}81 \\cdot 1{,}2} \\approx 4{,}85$ m/s; $\\quad y_f = 3{,}2 - 1{,}2 = 2{,}0$ m; $\\quad x_G = 2\\sqrt{1{,}2 \\cdot 2{,}0} \\approx 3{,}10$ m.</p></details>
<details><summary>3. A quale profondità bisogna praticare il foro in un serbatoio alto $H = 4{,}0$ m per avere la gittata massima? Quanto vale?</summary>
<p>$h = H/2 = 2{,}0$ m; $\\quad x_{G,\\max} = H = 4{,}0$ m.</p></details>
<details><summary>4. A parità di profondità $h = 1{,}0$ m, qual è il rapporto tra le pressioni relative e tra le velocità di efflusso di mercurio ($13600$ kg/m³) e acqua ($1000$ kg/m³)?</summary>
<p>$\\Delta p_{\\text{Hg}} / \\Delta p_{\\text{H}_2\\text{O}} = \\rho_{\\text{Hg}} / \\rho_{\\text{H}_2\\text{O}} = 13{,}6$; invece $v_{\\text{Hg}} / v_{\\text{H}_2\\text{O}} = 1$ perché $v = \\sqrt{2gh}$ è indipendente dalla densità.</p></details>
`,
};
