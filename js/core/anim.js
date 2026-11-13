// Micro-libreria di animazione in stile Manim, per il canvas 2D del Painter.
// Non disegna nulla da sé: fa avanzare dei parametri (0 → 1) con le curve di Manim,
// e gli esperimenti li usano per disegnare frecce che crescono, linee che si tracciano, numeri che scorrono.
//
//   const tl = new Timeline();
//   await tl.play(tween(o, 'grow', 1, { run: 0.8 }));                 // un'animazione
//   await tl.play(lagged([...linee.map(L => tween(L, 'drawn', 1))], 0.1)); // LaggedStart
//   tl.update(dt) va chiamato a ogni fotogramma; tl.busy dice se qualcosa si sta muovendo.

/* ---------------- Curve di velocità (rate functions di Manim) ---------------- */

const sigmoid = x => 1 / (1 + Math.exp(-x));
export const rate = {
  linear: t => t,
  // smooth di Manim: parte e arriva piano, con una sigmoide riscalata (inflection = 10).
  smooth: (t, k = 10) => {
    const e = sigmoid(-k / 2);
    return Math.min(1, Math.max(0, (sigmoid(k * (t - 0.5)) - e) / (1 - 2 * e)));
  },
  rushInto: t => 2 * rate.smooth(t / 2),               // accelera fino alla fine
  rushFrom: t => 2 * rate.smooth(t / 2 + 0.5) - 1,     // parte veloce e frena
  thereAndBack: t => rate.smooth(t < 0.5 ? 2 * t : 2 * (1 - t)),
  doubleSmooth: t => (t < 0.5 ? 0.5 * rate.smooth(2 * t) : 0.5 * (1 + rate.smooth(2 * t - 1))),
  // Leggero rimbalzo all'arrivo: utile per le cariche che "compaiono".
  backOut: t => { const c = 1.70158; return 1 + (c + 1) * (t - 1) ** 3 + c * (t - 1) ** 2; },
};

/* ---------------- Animazioni ---------------- */

// Porta obj[key] da from (valore attuale se omesso) a to in run secondi.
export function tween(obj, key, to, { run = 1, ease = rate.smooth, from } = {}) {
  let a = null;
  return {
    run,
    start() { a = from ?? obj[key] ?? 0; obj[key] = a; },
    step(t) { obj[key] = a + (to - a) * ease(t); },
  };
}

// Animazione generica: f(alpha) ricevuto a ogni fotogramma, già passato per la curva.
export function custom(f, { run = 1, ease = rate.smooth, start } = {}) {
  return { run, start: start ?? (() => {}), step: t => f(ease(t)) };
}

// Pausa (Manim: self.wait).
export const wait = run => ({ run, start() {}, step() {} });

// Più animazioni insieme (Manim: AnimationGroup).
export function group(list) {
  const run = Math.max(0, ...list.map(a => a.run));
  return {
    run,
    start() { list.forEach(a => a.start()); },
    step(t) { for (const a of list) a.step(Math.min(1, (t * run) / (a.run || 1e-9))); },
  };
}

// Avvio sfalsato (Manim: LaggedStart): ognuna parte dopo lag × la durata della precedente.
export function lagged(list, lag = 0.2) {
  if (!list.length) return wait(0);
  const offs = list.map((a, i) => i * lag * a.run);
  const run = Math.max(...list.map((a, i) => offs[i] + a.run));
  const started = new Set();
  return {
    run,
    start() { started.clear(); },
    step(t) {
      const now = t * run;
      list.forEach((a, i) => {
        if (now < offs[i]) return;
        if (!started.has(i)) { started.add(i); a.start(); }
        a.step(Math.min(1, (now - offs[i]) / (a.run || 1e-9)));
      });
    },
  };
}

// Una dopo l'altra (Manim: Succession).
export function seq(list) {
  const run = list.reduce((s, a) => s + a.run, 0);
  let cur = -1;
  return {
    run,
    start() { cur = -1; },
    step(t) {
      let now = t * run, i = 0;
      while (i < list.length - 1 && now > list[i].run) { now -= list[i].run; i++; }
      while (cur < i) { if (cur >= 0) list[cur].step(1); cur++; list[cur].start(); }
      list[i].step(Math.min(1, now / (list[i].run || 1e-9)));
    },
  };
}

/* ---------------- Linea del tempo ---------------- */

export class Timeline {
  constructor() { this.active = []; this.speed = 1; }
  get busy() { return this.active.length > 0; }

  // Avvia un'animazione e restituisce una promessa che si risolve alla fine (await tl.play(...)).
  play(anim) {
    return new Promise(resolve => {
      anim.start();
      if (anim.run <= 0) { anim.step(1); resolve(); return; }
      this.active.push({ anim, t: 0, resolve });
    });
  }

  update(dt) {
    if (!this.active.length) return;
    for (const a of this.active) {
      a.t += dt * this.speed;
      a.anim.step(Math.min(1, a.t / a.anim.run));
    }
    const done = this.active.filter(a => a.t >= a.anim.run);
    this.active = this.active.filter(a => a.t < a.anim.run);
    done.forEach(a => a.resolve());
  }

  // Salta alla fine di tutto ciò che è in corso (per esempio quando l'utente tocca la scena).
  finish() {
    const all = this.active;
    this.active = [];
    for (const a of all) { a.anim.step(1); a.resolve(); }
  }
}

/* ---------------- Aiuti di disegno ---------------- */

// Lunghezza cumulata di una polilinea (per disegnarne solo una parte: Create di Manim).
export function cumulate(pts) {
  const acc = [0];
  for (let i = 1; i < pts.length; i++) acc.push(acc[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  return acc;
}

// Primo tratto di una polilinea, fino alla frazione f della lunghezza totale.
export function partial(pts, f, acc = cumulate(pts)) {
  if (f >= 1) return pts;
  const L = acc[acc.length - 1] * Math.max(0, f), out = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    if (acc[i] <= L) { out.push(pts[i]); continue; }
    const k = (L - acc[i - 1]) / ((acc[i] - acc[i - 1]) || 1);
    out.push([pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * k, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * k]);
    break;
  }
  return out;
}

// Interpolazione di colori esadecimali (#rrggbb).
export function mix(c1, c2, t) {
  const p = c => [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16));
  const a = p(c1), b = p(c2);
  return '#' + a.map((v, i) => Math.round(v + (b[i] - v) * t).toString(16).padStart(2, '0')).join('');
}

// Palette di Manim (costanti di manim/utils/color).
export const MANIM = {
  blue: '#58C4DD', blueD: '#29ABCA', blueE: '#236B8E', yellow: '#FFFF00', yellowC: '#FFFF00', gold: '#F0AC5F',
  teal: '#5CD0B3', green: '#83C167', red: '#FC6255', maroon: '#C55F73', purple: '#9A72AC', pink: '#D147BD',
  white: '#FFFFFF', greyA: '#DDDDDD', greyB: '#BBBBBB', greyC: '#888888', greyD: '#444444', greyE: '#222222',
};
