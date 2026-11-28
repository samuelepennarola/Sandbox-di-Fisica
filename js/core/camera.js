// Trasformazione mondo (metri, y verso l'alto) <-> schermo (px CSS, y verso il basso).
// Le inquadrature automatiche (fit) scorrono morbide come la camera di Manim; i gesti dell'utente
// (panBy, zoomAt) restano immediati e interrompono lo scorrimento.

const FLY_S = 0.8;   // durata di uno scorrimento (s)
// Curva "smooth" di Manim: sigmoide riscalata su [0, 1], partenza e arrivo dolci.
const sig = x => 1 / (1 + Math.exp(-x));
const smooth = (t, k = 10) => { const e = sig(-k / 2); return Math.min(1, Math.max(0, (sig(k * (t - 0.5)) - e) / (1 - 2 * e))); };
const reducedMotion = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } };

export class Camera {
  constructor() {
    this.cx = 0; this.cy = 0; this.cz = 0; this.scale = 40; // px per metro
    this.w = 1; this.h = 1;
    this.fly = null;       // scorrimento in corso { from, to, t0 }
    this.fitted = false;   // la prima inquadratura è sempre immediata
    this.baseScale = null; // scala di riferimento dell'inquadratura base (usata da follow)
  }

  setViewport(w, h) { this.w = w; this.h = h; }

  toScreen(x, y) {
    return [(x - this.cx) * this.scale + this.w / 2, this.h / 2 - (y - this.cy) * this.scale];
  }

  toWorld(sx, sy) {
    return [(sx - this.w / 2) / this.scale + this.cx, (this.h / 2 - sy) / this.scale + this.cy];
  }

  // Inquadra un rettangolo del mondo lasciando spazio per la barra in alto e i pannelli.
  // Inquadratura che contiene il rettangolo, senza applicarla.
  target({ xmin, xmax, ymin, ymax, cz = 0 }, pad) {
    // Margini predefiniti: quelli del layout (barra, ispettore, moviola) se l'app li fornisce.
    pad ??= this.padFn?.() ?? { top: 80, right: 20, bottom: 20, left: 20 };
    const aw = Math.max(100, this.w - pad.left - pad.right);
    const ah = Math.max(100, this.h - pad.top - pad.bottom);
    const scale = Math.min(aw / (xmax - xmin), ah / (ymax - ymin));
    // Centro del rettangolo disponibile, convertito in coordinate mondo.
    const sx = pad.left + aw / 2, sy = pad.top + ah / 2;
    return { scale, cx: (xmin + xmax) / 2 - (sx - this.w / 2) / scale, cy: (ymin + ymax) / 2 + (sy - this.h / 2) / scale, cz };
  }

  // Rettangolo sicuro sullo schermo (al netto dei pannelli e di una fascia cuscinetto interna, ~18% totale = 9% per lato).
  _safeRect(margin = 0.09, padPx = 0) {
    const pad = this.padFn?.() ?? { top: 80, right: 20, bottom: 20, left: 20 };
    const aw = Math.max(100, this.w - pad.left - pad.right);
    const ah = Math.max(100, this.h - pad.top - pad.bottom);
    const mx = aw * margin, my = ah * margin;
    const sL = pad.left + mx, sR = pad.left + aw - mx;
    const sT = pad.top + my, sB = pad.top + ah - my;
    const pL = typeof padPx === 'number' ? padPx : (padPx?.left ?? 0);
    const pR = typeof padPx === 'number' ? padPx : (padPx?.right ?? 0);
    const pT = typeof padPx === 'number' ? padPx : (padPx?.top ?? 0);
    const pB = typeof padPx === 'number' ? padPx : (padPx?.bottom ?? 0);
    const maxX = Math.max(0, (sR - sL) - 30), sumX = pL + pR;
    const kx = sumX > maxX && sumX > 0 ? maxX / sumX : 1;
    const maxY = Math.max(0, (sB - sT) - 30), sumY = pT + pB;
    const ky = sumY > maxY && sumY > 0 ? maxY / sumY : 1;
    const sLe = sL + pL * kx, sRe = sR - pR * kx;
    const sTe = sT + pT * ky, sBe = sB - pB * ky;
    return { sL: sLe, sR: sRe, sT: sTe, sB: sBe, sw: sRe - sLe, sh: sBe - sTe, bufX: Math.max(20, mx), bufY: Math.max(20, my) };
  }

  _specBox(spec, key = 'pts') {
    if (key === 'pts' && spec.box) {
      const { xmin, xmax, ymin, ymax } = spec.box;
      if ([xmin, xmax, ymin, ymax].every(Number.isFinite)) return { x0: xmin, x1: xmax, y0: ymin, y1: ymax };
    }
    const pts = spec[key];
    if (!pts?.length) return null;
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const q of pts) {
      const x = q[0], y = q[1];
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
    return x0 <= x1 ? { x0, x1, y0, y1 } : null;
  }

  // Calcola la posa obiettivo della camera per una specifica di follow ('pan', 'pan3d', 'contain' o rettangolo).
  followTarget(spec, from = this, { refit = false } = {}) {
    if (!spec) return null;
    if (!spec.mode && 'xmin' in spec) {
      const to = this.target(spec);
      return { ...to, overRatio: 0, moved: true };
    }
    if (spec.mode === 'pan3d') {
      const pt = spec.point, V = spec.V;
      if (!pt || !V) return null;
      const baseScale = this.baseScale ?? from.scale;
      const sc0 = refit ? baseScale : from.scale;
      const pad = this.padFn?.() ?? { top: 76, right: 24, bottom: 72, left: 24 };
      const sx0 = pad.left + Math.max(100, this.w - pad.left - pad.right) / 2;
      const sy0 = pad.top + Math.max(100, this.h - pad.top - pad.bottom) / 2;
      const px0 = (sx0 - this.w / 2) / sc0 + from.cx;
      const py0 = (this.h / 2 - sy0) / sc0 + from.cy;
      const pz0 = from.cz ?? 0;
      const D = V.fov ? (this.h / (2 * sc0 * Math.tan(V.fov / 2))) : V.dist0();
      const r = V.r, u = V.u, f = V.f;
      const dx = pt[0] - px0, dy = pt[1] - py0, dz = (pt[2] ?? 0) - pz0;
      const vx = dx * r[0] + dy * r[1] + dz * r[2];
      const vy = dx * u[0] + dy * u[1] + dz * u[2];
      const vz = dx * f[0] + dy * f[1] + dz * f[2];
      const d = Math.max(0.08 * D, D - vz), persp = D / d;
      const sx = sx0 + sc0 * vx * persp, sy = sy0 - sc0 * vy * persp;
      const { sL, sR, sT, sB, bufX, bufY } = this._safeRect(spec.margin ?? 0.09, spec.padPx ?? 24);
      const vzMin = -0.35 * D, vzMax = 0.28 * D;
      const inSafe = sx >= sL && sx <= sR && sy >= sT && sy <= sB && vz >= vzMin && vz <= vzMax;
      let toCx = from.cx, toCy = from.cy, toCz = pz0;
      if (!inSafe) {
        const vzTarget = Math.min(vzMax, Math.max(vzMin, vz));
        const sxTarget = Math.min(sR, Math.max(sL, sx));
        const syTarget = Math.min(sB, Math.max(sT, sy));
        const dvz = vz - vzTarget;
        const perspTarget = D / Math.max(0.08 * D, D - vzTarget);
        const vxTarget = (sxTarget - sx0) / (sc0 * perspTarget);
        const vyTarget = (sy0 - syTarget) / (sc0 * perspTarget);
        const dvx = vx - vxTarget, dvy = vy - vyTarget;
        toCx += dvx * r[0] + dvy * u[0] + dvz * f[0];
        toCy += dvx * r[1] + dvy * u[1] + dvz * f[1];
        toCz += dvx * r[2] + dvy * u[2] + dvz * f[2];
      }
      const overX = Math.max(0, sL - sx, sx - sR);
      const overY = Math.max(0, sT - sy, sy - sB);
      const overZ = Math.max(0, vzMin - vz, vz - vzMax) * sc0;
      const overRatio = Math.max(overX / bufX, overY / bufY, overZ / Math.min(bufX, bufY));
      const moved = Math.abs(Math.log(sc0 / this.scale)) >= 1e-5 || Math.hypot(toCx - this.cx, toCy - this.cy, toCz - (this.cz ?? 0)) * this.scale >= 0.05;
      return { scale: sc0, cx: toCx, cy: toCy, cz: toCz, overRatio, moved };
    }
    const box = this._specBox(spec, 'pts');
    if (!box) return null;
    const { sL, sR, sT, sB, sw, sh, bufX, bufY } = this._safeRect(spec.margin ?? 0.09, spec.padPx ?? 0);
    const baseScale = this.baseScale ?? from.scale;
    const cx0 = from.cx, cy0 = from.cy, sc0 = from.scale;
    const bw = Math.max(0, box.x1 - box.x0), bh = Math.max(0, box.y1 - box.y0);

    let toScale = sc0;
    if (spec.mode === 'pan') {
      toScale = refit ? baseScale : sc0;
    } else {
      const minScale = baseScale / (spec.maxOut ?? 5);
      const startScale = refit ? baseScale : Math.min(sc0, baseScale);
      toScale = startScale;
      if (bw * toScale > sw) toScale = Math.min(toScale, sw / bw);
      if (bh * toScale > sh) toScale = Math.min(toScale, sh / bh);
      toScale = Math.min(4000, Math.max(1e-5, Math.max(minScale, Math.min(baseScale, toScale))));
    }

    const fBox = spec.focus ? this._specBox(spec, 'focus') : null;
    const cxMin = box.x1 - (sR - this.w / 2) / toScale;
    const cxMax = box.x0 - (sL - this.w / 2) / toScale;
    const fxMin = fBox ? fBox.x1 - (sR - this.w / 2) / toScale : cxMin;
    const fxMax = fBox ? fBox.x0 - (sL - this.w / 2) / toScale : cxMax;

    const cyMin = box.y1 + (sT - this.h / 2) / toScale;
    const cyMax = box.y0 + (sB - this.h / 2) / toScale;
    const fyMin = fBox ? fBox.y1 + (sT - this.h / 2) / toScale : cyMin;
    const fyMax = fBox ? fBox.y0 + (sB - this.h / 2) / toScale : cyMax;

    const clampAxis = (cur, lo, hi, fLo, fHi) => {
      if (lo <= hi + 1e-6) return Math.min(Math.max(cur, lo), hi);
      if (spec.panOnMaxOut && fBox) {
        if (fLo <= fHi + 1e-6) return Math.min(Math.max(cur, fLo), fHi);
        return (fLo + fHi) / 2;
      }
      if (spec.mode === 'pan') return (lo + hi) / 2;
      return Math.min(Math.max(cur, hi), lo);
    };

    const toCx = clampAxis(cx0, cxMin, cxMax, fxMin, fxMax);
    const toCy = clampAxis(cy0, cyMin, cyMax, fyMin, fyMax);

    // Sforamento rispetto alla zona sicura nella posa corrente (usando il focus se siamo oltre maxOut con panOnMaxOut).
    const activeX = (cxMin > cxMax + 1e-6 && spec.panOnMaxOut && fBox) ? fBox : box;
    const activeY = (cyMin > cyMax + 1e-6 && spec.panOnMaxOut && fBox) ? fBox : box;
    const overX = Math.max(0, sL - ((activeX.x0 - cx0) * sc0 + this.w / 2), ((activeX.x1 - cx0) * sc0 + this.w / 2) - sR);
    const overY = Math.max(0, sT - (this.h / 2 - (activeY.y1 - cy0) * sc0), (this.h / 2 - (activeY.y0 - cy0) * sc0) - sB);
    const overRatio = Math.max(overX / bufX, overY / bufY);

    const moved = Math.abs(Math.log(toScale / sc0)) >= 1e-5 || Math.hypot(toCx - cx0, toCy - cy0) * sc0 >= 0.05;
    return { scale: toScale, cx: toCx, cy: toCy, overRatio, moved };
  }

  // Camera che segue il soggetto alla Manim: resta ferma dentro la zona cuscinetto (~18%) e quando il soggetto
  // esce dal quadro (o entra nella fascia di bordo) si muove in modo continuo. Restituisce true finché inseguimento attivo.
  follow(spec, dt, tau, opts) {
    if (!spec) return false;
    this.stop();
    const isRect = !spec.mode && 'xmin' in spec;
    const baseTau = tau ?? (isRect ? 0.6 : 0.36);
    const to = this.followTarget(spec, this, opts);
    if (!to || !to.moved) return false;
    let tauEff = baseTau;
    if (!isRect && to.overRatio > 0.25) {
      const u = Math.min(1, (to.overRatio - 0.25) / 0.75);
      const sm = u * u * (3 - 2 * u);
      tauEff = baseTau + (0.09 - baseTau) * sm;
    }
    const k = reducedMotion() ? 1 : (dt > 0 ? 1 - Math.exp(-dt / tauEff) : 0);
    if (k <= 0) return true;
    const s0 = this.scale, s1 = to.scale;
    const newScale = Math.exp(Math.log(s0) + (Math.log(s1) - Math.log(s0)) * k);
    const w0 = 1 / s0, w1 = 1 / s1, wk = 1 / newScale;
    const u = Math.abs(w1 - w0) > 1e-12 ? (wk - w0) / (w1 - w0) : k;
    this.scale = newScale;
    this.cx += (to.cx - this.cx) * u;
    this.cy += (to.cy - this.cy) * u;
    this.cz = (this.cz ?? 0) + ((to.cz ?? 0) - (this.cz ?? 0)) * u;
    return !reducedMotion() && (Math.abs(Math.log(s1 / this.scale)) >= 1e-4 || Math.hypot(to.cx - this.cx, to.cy - this.cy, (to.cz ?? 0) - this.cz) * this.scale >= 0.25);
  }

  fit(rect, pad) {
    const to = this.target(rect, pad);
    if (!pad) this.baseScale = to.scale;
    // Scorre solo la camera della scena (quella con i margini del layout), non quelle delle istantanee,
    // e solo tra inquadrature confrontabili: un salto di scala enorme (cambio di esperimento) è immediato.
    const ratio = to.scale / this.scale;
    if (this.padFn && this.fitted && !reducedMotion() && ratio > 1 / 6 && ratio < 6) this.flyTo(to);
    else { this.stop(); Object.assign(this, to); }
    this.fitted = true;
  }

  // Scorrimento verso un'inquadratura: la scala varia in modo geometrico (lo zoom appare uniforme) e il centro
  // segue in modo che il punto fisso dello zoom resti coerente. Avanza sincronizzato con drawFrame tramite tick().
  flyTo(to, dur = FLY_S) {
    const toCz = to.cz ?? this.cz ?? 0;
    const near = Math.abs(Math.log(to.scale / this.scale)) < 1e-3 && Math.hypot(to.cx - this.cx, to.cy - this.cy, toCz - (this.cz ?? 0)) * this.scale < 0.5;
    if (near || reducedMotion()) { this.stop(); Object.assign(this, { ...to, cz: toCz }); return; }
    this.fly = { from: { scale: this.scale, cx: this.cx, cy: this.cy, cz: this.cz ?? 0 }, to: { ...to, cz: toCz }, t0: performance.now(), dur };
  }

  // Avanza l'eventuale volo della camera nel ciclo unico di rendering (chiamato da main.js prima di disegnare).
  tick(now = performance.now()) {
    const f = this.fly;
    if (!f) return false;
    const t = Math.min(1, (now - f.t0) / 1000 / (f.dur || FLY_S)), k = smooth(t);
    const ls = Math.log(f.from.scale) + (Math.log(f.to.scale) - Math.log(f.from.scale)) * k;
    this.scale = Math.exp(ls);
    // Centro interpolato nello spazio "schermo per metro": evita che il soggetto sbandi durante lo zoom.
    const w0 = 1 / f.from.scale, w1 = 1 / f.to.scale, wk = 1 / this.scale, u = Math.abs(w1 - w0) > 1e-12 ? (wk - w0) / (w1 - w0) : k;
    this.cx = f.from.cx + (f.to.cx - f.from.cx) * u;
    this.cy = f.from.cy + (f.to.cy - f.from.cy) * u;
    this.cz = (f.from.cz ?? 0) + ((f.to.cz ?? 0) - (f.from.cz ?? 0)) * u;
    if (t >= 1) { Object.assign(this, f.to); this.fly = null; }
    return true;
  }

  stop() { this.fly = null; }

  zoomAt(sx, sy, factor) {
    this.stop();
    const [wx, wy] = this.toWorld(sx, sy);
    this.scale = Math.min(4000, Math.max(1e-5, this.scale * factor));
    const [nx, ny] = this.toWorld(sx, sy);
    this.cx += wx - nx; this.cy += wy - ny;
  }

  panBy(dx, dy) { this.stop(); this.cx -= dx / this.scale; this.cy += dy / this.scale; }

  bounds() {
    const [x0, y0] = this.toWorld(0, this.h);
    const [x1, y1] = this.toWorld(this.w, 0);
    return { x0, y0, x1, y1 };
  }
}
