import { Easing, continueRender, delayRender, interpolate, staticFile } from 'remotion';

// Griglia ritmica della musica (tools/musica_onirica.py): 100 BPM a 60 fps
export const FPS = 60;
export const BEAT = 36;
export const BAR = 144;
export const OUT = 24; // prima battuta della coda
export const TOTAL = 27 * BAR; // 3888 fotogrammi = 64,8 s
export const b = (bar: number, beat = 0) => Math.round(bar * BAR + beat * BEAT);

export const W = 1080;
export const H = 1920;

export const C = {
  bg: '#0B0B0D',
  blue: '#58C4DD',
  teal: '#5CD0B3',
  yellow: '#F4D345',
  gold: '#F0AC5F',
  red: '#FC6255',
  purple: '#9A72AC',
  text: '#ECEBE6',
  paper: '#F6F3EA',
};

export const CM = "'CMU', Georgia, serif";
export const SANS = "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Helvetica Neue', sans-serif";

export const smooth = Easing.bezier(0.65, 0, 0.35, 1);
export const outE = Easing.bezier(0.16, 1, 0.3, 1);
export const inE = Easing.bezier(0.7, 0, 0.84, 0);
export const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;

export const lerp = (f: number, a: number, z: number, from: number, to: number, easing = smooth) =>
  interpolate(f, [a, z], [from, to], { ...clamp, easing });

// Colpi di cassa: gli stessi istanti della musica
export const DROPS = [10, 11, 12, 13, 14, 15, 16, 17, 20, 21, 22, 23];
export const KICKS: number[] = [];
for (let bar = 2; bar < 8; bar++) for (const bt of bar < 4 ? [0, 2] : [0, 1.5, 2]) KICKS.push(b(bar, bt));
for (let bt = 0; bt < 4; bt++) KICKS.push(b(8, bt));
for (const bar of DROPS) for (let bt = 0; bt < 4; bt++) KICKS.push(b(bar, bt));
KICKS.push(b(OUT));

// Inviluppo 0..1 che batte con la cassa (più forte nei drop)
export const pulse = (f: number) => {
  let p = 0;
  for (const k of KICKS) {
    const d = f - k;
    if (d >= 0 && d < 45) p = Math.max(p, Math.exp(-d / 8) * (k >= b(10) ? 1 : 0.5));
  }
  return p;
};

// Pseudo-casuale deterministico
export const rand = (seed: number) => {
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};

// Font Computer Modern (KaTeX) per le scritte di scena.
// Il blocco si rilascia sempre, anche se un file non arriva: meglio un fallback che un render fermo.
const fontHandle = delayRender('Font Computer Modern', { timeoutInMilliseconds: 120000, retries: 2 });
const carica = (file: string, style: string, weight: string, tentativi = 3): Promise<void> =>
  new FontFace('CMU', `url(${staticFile('fonts/' + file)})`, { style, weight })
    .load()
    .then((ff) => {
      document.fonts.add(ff);
    })
    .catch(() => (tentativi > 1 ? carica(file, style, weight, tentativi - 1) : undefined));
Promise.all([
  carica('KaTeX_Main-Regular.woff2', 'normal', '400'),
  carica('KaTeX_Main-Italic.woff2', 'italic', '400'),
  carica('KaTeX_Main-Bold.woff2', 'normal', '700'),
]).finally(() => continueRender(fontHandle));

// Camera a fotogrammi chiave
export type Key = {
  f: number;
  s?: number; // zoom
  fx?: number; // punto di fuoco sul foglio, 0..1
  fy?: number;
  rx?: number;
  ry?: number;
  rz?: number;
  x?: number;
  y?: number;
  e?: (t: number) => number; // curva del tratto che arriva a questa chiave
};
export type Cam = { s: number; fx: number; fy: number; rx: number; ry: number; rz: number; x: number; y: number };
const DEF: Cam = { s: 1, fx: 0.5, fy: 0.5, rx: 0, ry: 0, rz: 0, x: 0, y: 0 };
const PROPS = Object.keys(DEF) as (keyof Cam)[];

export const camAt = (f: number, keys: Key[]): Cam => {
  const full: (Cam & { f: number; e?: (t: number) => number })[] = [];
  let prev: Cam = { ...DEF };
  for (const k of keys) {
    const next = { ...prev };
    PROPS.forEach((n) => {
      if (k[n] !== undefined) next[n] = k[n] as number;
    });
    prev = next;
    full.push({ ...next, f: k.f, e: k.e });
  }
  if (f <= full[0].f) return full[0];
  for (let i = 1; i < full.length; i++) {
    const a = full[i - 1];
    const z = full[i];
    if (f <= z.f) {
      const t = (z.e ?? smooth)((f - a.f) / Math.max(1, z.f - a.f));
      const out = { ...DEF };
      PROPS.forEach((n) => {
        out[n] = a[n] + (z[n] - a[n]) * t;
      });
      return out;
    }
  }
  return full[full.length - 1];
};
