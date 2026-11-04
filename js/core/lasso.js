import { strokeBox } from './ink.js';

// Lazo: si traccia un contorno attorno a tratti d'inchiostro (e agli oggetti della lavagna),
// poi la selezione si sposta, si ingrandisce, si copia o si elimina.
// Un esperimento può esporre i propri oggetti con `lasso`: { items(), transform(refs, f, k), clone(refs, dx, dy), remove(refs) }.

function inside(x, y, poly) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c;
  }
  return c;
}

export class Lasso {
  constructor(ink) { this.ink = ink; this.path = null; this.sel = null; }

  get active() { return !!this.sel; }
  clear() { this.sel = null; this.path = null; }

  start(x, y) { this.sel = null; this.path = [[x, y]]; }

  // Selezione diretta (per esempio toccando un'immagine della lavagna).
  select(strokes, items) { this.path = null; this.sel = { strokes, items }; }

  add(x, y, minStep) {
    const last = this.path?.[this.path.length - 1];
    if (last && Math.hypot(x - last[0], y - last[1]) >= minStep) this.path.push([x, y]);
  }

  // Chiude il contorno: un tratto è selezionato se almeno metà dei suoi punti cade dentro.
  finish(exp) {
    const poly = this.path;
    this.path = null;
    if (!poly || poly.length < 3) return;
    const strokes = this.ink.strokes.filter(s => s.pts.filter(([x, y]) => inside(x, y, poly)).length >= s.pts.length / 2);
    const items = (exp?.lasso?.items() ?? []).filter(it => {
      const [x0, y0, x1, y1] = it.bbox;
      return inside((x0 + x1) / 2, (y0 + y1) / 2, poly);
    }).map(it => it.ref);
    this.sel = strokes.length || items.length ? { strokes, items } : null;
  }

  bbox(exp) {
    if (!this.sel) return null;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    const grow = b => { x0 = Math.min(x0, b[0]); y0 = Math.min(y0, b[1]); x1 = Math.max(x1, b[2]); y1 = Math.max(y1, b[3]); };
    for (const s of this.sel.strokes) { const b = strokeBox(s); grow([b[0] - s.w, b[1] - s.w, b[2] + s.w, b[3] + s.w]); }
    const all = exp?.lasso?.items() ?? [];
    for (const it of all) if (this.sel.items.includes(it.ref)) grow(it.bbox);
    return x0 === Infinity ? null : [x0, y0, x1, y1];
  }

  // Applica f(x, y) → [x, y] a tutta la selezione; k è il fattore di scala (per lo spessore dei tratti).
  transform(exp, f, k = 1) {
    if (!this.sel) return;
    for (const s of this.sel.strokes) {
      for (const p of s.pts) { const [x, y] = f(p[0], p[1]); p[0] = x; p[1] = y; }
      s.w *= k;
      this.ink.touch(s);
    }
    if (this.sel.items.length) exp?.lasso?.transform(this.sel.items, f, k);
  }

  move(exp, dx, dy) { this.transform(exp, (x, y) => [x + dx, y + dy]); }

  scale(exp, k, ax, ay) { this.transform(exp, (x, y) => [ax + (x - ax) * k, ay + (y - ay) * k], k); }

  // Duplica la selezione spostata di (dx, dy); la copia diventa la nuova selezione.
  copy(exp, dx, dy) {
    if (!this.sel) return;
    const strokes = this.sel.strokes.map(s => ({ ...s, pts: s.pts.map(([x, y, p]) => [x + dx, y + dy, p]) }));
    this.ink.strokes.push(...strokes);
    const items = this.sel.items.length ? exp?.lasso?.clone(this.sel.items, dx, dy) ?? [] : [];
    this.sel = { strokes, items };
    this.save(exp);
  }

  remove(exp) {
    if (!this.sel) return;
    const gone = new Set(this.sel.strokes);
    this.ink.strokes = this.ink.strokes.filter(s => !gone.has(s));
    if (this.sel.items.length) exp?.lasso?.remove(this.sel.items);
    this.sel = null;
    this.ink.save();
  }

  save(exp) { this.ink.save(); exp?.lasso?.save?.(); }

  // Disegno: contorno in costruzione oppure riquadro della selezione con la maniglia di scala.
  draw(P, exp, activeHandle) {
    const ctx = P.ctx;
    if (this.path?.length > 1) {
      ctx.save();
      ctx.strokeStyle = P.c.handle; ctx.lineWidth = 2; ctx.setLineDash([6, 5]);
      ctx.beginPath();
      this.path.forEach(([x, y], i) => { const [a, b] = P.S(x, y); i ? ctx.lineTo(a, b) : ctx.moveTo(a, b); });
      ctx.stroke();
      ctx.restore();
    }
    const r = this.screenBox(P.cam, exp);
    if (!r) return;
    ctx.save();
    ctx.fillStyle = P.c.handle; ctx.globalAlpha = 0.06; ctx.fillRect(r.x0, r.y0, r.x1 - r.x0, r.y1 - r.y0);
    ctx.globalAlpha = 1; ctx.strokeStyle = P.c.handle; ctx.lineWidth = 2; ctx.setLineDash([6, 5]);
    ctx.strokeRect(r.x0, r.y0, r.x1 - r.x0, r.y1 - r.y0);
    ctx.restore();
    P.sizeHandleS(r.x1, r.y1, activeHandle);
  }

  // Riquadro della selezione in px (con un margine), oppure null.
  screenBox(cam, exp, pad = 8) {
    const b = this.bbox(exp);
    if (!b) return null;
    const [a, d] = cam.toScreen(b[0], b[1]), [c, e] = cam.toScreen(b[2], b[3]);
    return { x0: a - pad, y0: e - pad, x1: c + pad, y1: d + pad };
  }
}
