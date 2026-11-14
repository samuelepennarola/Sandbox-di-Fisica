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
    this.cx = 0; this.cy = 0; this.scale = 40; // px per metro
    this.w = 1; this.h = 1;
    this.fly = null;       // scorrimento in corso { from, to, t0 }
    this.fitted = false;   // la prima inquadratura è sempre immediata
  }

  setViewport(w, h) { this.w = w; this.h = h; }

  toScreen(x, y) {
    return [(x - this.cx) * this.scale + this.w / 2, this.h / 2 - (y - this.cy) * this.scale];
  }

  toWorld(sx, sy) {
    return [(sx - this.w / 2) / this.scale + this.cx, (this.h / 2 - sy) / this.scale + this.cy];
  }

  // Inquadra un rettangolo del mondo lasciando spazio per la barra in alto e i pannelli.
  fit({ xmin, xmax, ymin, ymax }, pad) {
    // Margini predefiniti: quelli del layout (barra, ispettore, moviola) se l'app li fornisce.
    pad ??= this.padFn?.() ?? { top: 80, right: 20, bottom: 20, left: 20 };
    const aw = Math.max(100, this.w - pad.left - pad.right);
    const ah = Math.max(100, this.h - pad.top - pad.bottom);
    const scale = Math.min(aw / (xmax - xmin), ah / (ymax - ymin));
    // Centro del rettangolo disponibile, convertito in coordinate mondo.
    const sx = pad.left + aw / 2, sy = pad.top + ah / 2;
    const to = { scale, cx: (xmin + xmax) / 2 - (sx - this.w / 2) / scale, cy: (ymin + ymax) / 2 + (sy - this.h / 2) / scale };
    // Scorre solo la camera della scena (quella con i margini del layout), non quelle delle istantanee,
    // e solo tra inquadrature confrontabili: un salto di scala enorme (cambio di esperimento) è immediato.
    const ratio = to.scale / this.scale;
    if (this.padFn && this.fitted && !reducedMotion() && ratio > 1 / 6 && ratio < 6) this.flyTo(to);
    else { this.stop(); Object.assign(this, to); }
    this.fitted = true;
  }

  // Scorrimento verso un'inquadratura: la scala varia in modo geometrico (lo zoom appare uniforme) e il centro
  // segue in modo che il punto fisso dello zoom resti coerente; avanza con requestAnimationFrame.
  flyTo(to) {
    const near = Math.abs(Math.log(to.scale / this.scale)) < 1e-3 && Math.hypot(to.cx - this.cx, to.cy - this.cy) * this.scale < 0.5;
    if (near) { this.stop(); Object.assign(this, to); return; }
    this.fly = { from: { scale: this.scale, cx: this.cx, cy: this.cy }, to, t0: performance.now() };
    const step = now => {
      const f = this.fly;
      if (!f) return;
      const t = Math.min(1, (now - f.t0) / 1000 / FLY_S), k = smooth(t);
      const ls = Math.log(f.from.scale) + (Math.log(f.to.scale) - Math.log(f.from.scale)) * k;
      this.scale = Math.exp(ls);
      // Centro interpolato nello spazio "schermo per metro": evita che il soggetto sbandi durante lo zoom.
      const w0 = 1 / f.from.scale, w1 = 1 / f.to.scale, wk = 1 / this.scale, u = Math.abs(w1 - w0) > 1e-12 ? (wk - w0) / (w1 - w0) : k;
      this.cx = f.from.cx + (f.to.cx - f.from.cx) * u;
      this.cy = f.from.cy + (f.to.cy - f.from.cy) * u;
      if (t < 1) f.raf = requestAnimationFrame(step);
      else { Object.assign(this, f.to); this.fly = null; }
    };
    this.fly.raf = requestAnimationFrame(step);
  }

  stop() { if (this.fly) { cancelAnimationFrame(this.fly.raf); this.fly = null; } }

  zoomAt(sx, sy, factor) {
    this.stop();
    const [wx, wy] = this.toWorld(sx, sy);
    this.scale = Math.min(4000, Math.max(1, this.scale * factor));
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
