// Trasformazione mondo (metri, y verso l'alto) <-> schermo (px CSS, y verso il basso).
export class Camera {
  constructor() {
    this.cx = 0; this.cy = 0; this.scale = 40; // px per metro
    this.w = 1; this.h = 1;
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
    // Margini predefiniti per barra e pannelli; su schermi stretti i pannelli si sovrappongono comunque.
    pad ??= this.w < 900 ? { top: 80, right: 20, bottom: 20, left: 20 } : { top: 80, right: 380, bottom: 30, left: 300 };
    const aw = Math.max(100, this.w - pad.left - pad.right);
    const ah = Math.max(100, this.h - pad.top - pad.bottom);
    this.scale = Math.min(aw / (xmax - xmin), ah / (ymax - ymin));
    // Centro del rettangolo disponibile, convertito in coordinate mondo.
    const sx = pad.left + aw / 2, sy = pad.top + ah / 2;
    this.cx = (xmin + xmax) / 2 - (sx - this.w / 2) / this.scale;
    this.cy = (ymin + ymax) / 2 + (sy - this.h / 2) / this.scale;
  }

  zoomAt(sx, sy, factor) {
    const [wx, wy] = this.toWorld(sx, sy);
    this.scale = Math.min(4000, Math.max(1, this.scale * factor));
    const [nx, ny] = this.toWorld(sx, sy);
    this.cx += wx - nx; this.cy += wy - ny;
  }

  panBy(dx, dy) { this.cx -= dx / this.scale; this.cy += dy / this.scale; }

  bounds() {
    const [x0, y0] = this.toWorld(0, this.h);
    const [x1, y1] = this.toWorld(this.w, 0);
    return { x0, y0, x1, y1 };
  }
}
