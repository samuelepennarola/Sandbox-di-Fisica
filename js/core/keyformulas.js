// Formule chiave disegnate direttamente sul canvas in stile 3Blue1Brown / Manim:
//   - Prima comparsa (cambio esperimento): Write (DrawBorderThenFill) sfalsato riga per riga.
//   - Cambio formula / stato: TransformMatchingTex (morphTeX) fluido.
//   - Trascinamento di uno slider: Indicate (emphasize) sul simbolo corrispondente nella formula.
// Rispetta prefers-reduced-motion e le istantanee (ui.snapshot).
import { texLayout, reducedMotion } from './manim.js';
import { writeTeX, drawTeX, morphTeX, emphasize } from './morph.js';

const WRITE_S = 0.72;     // durata Write per riga
const WRITE_LAG = 0.14;   // ritardo tra una riga e la successiva
const MORPH_S = 0.42;     // durata TransformMatchingTex
const IND_S = 0.65;       // durata Indicate quando si muove uno slider

// Mappa chiave parametro → possibili simboli TeX da evidenziare con Indicate.
const PARAM_SYM = {
  m: ['m'], m1: ['m_1'], m2: ['m_2'], M: ['M'], mh: ['m'], mm: ['m'],
  v: ['v', '\\vec v'], v0: ['v_0'], v1: ['v_1'], v2: ['v_2'], vp: ["v'", 'v'], V: ['V'],
  a: ['a'], A: ['A'], g: ['g'], G: ['G'],
  theta: ['\\theta'], alpha: ['\\alpha'], phi: ['\\varphi', '\\phi'],
  x0: ['x_0'], y0: ['y_0'], h0: ['h_0'], s0: ['s_0'], L: ['L'], r: ['r'], r0: ['r_0'], R: ['R'],
  k: ['k'], mus: ['\\mu_s'], muk: ['\\mu_d', '\\mu_k'], e: ['e'],
  q: ['q'], q1: ['q_1'], q2: ['q_2'], E: ['E', '\\vec E'], B: ['B', '\\vec B'],
  f: ['f'], T: ['T'], omega: ['\\omega'], w0: ['\\omega_0'], lambda: ['\\lambda'],
  F: ['F'], d: ['d'], tMax: ['t'],
};

// Normalizza macro KaTeX non presenti nel mini-LaTeX di manim.js, mantenendo colori e struttura.
function normTeX(src) {
  return String(src || '')
    .replace(/\\displaystyle\s*/g, '')
    .replace(/\\[bB]ig[glrm]?\s*/g, '')
    .replace(/\\!/g, '')
    .replace(/\\:/g, '\\ ')
    .replace(/\\,/g, '\\ ')
    .replace(/\\;/g, '\\ ')
    .replace(/\\quad/g, '\\  ')
    .replace(/\\qquad/g, '\\   ')
    .replace(/\\sin\b/g, '\\sin')
    .replace(/\\cos\b/g, '\\cos')
    .replace(/\\tan\b/g, '\\tan')
    .replace(/\\mathrm\{([^}]*)\}/g, '\\mathrm{$1}')
    .replace(/\s+/g, ' ')
    .trim();
}

// Estrae le righe chiave da un array di formule (split su \qquad e, se troppo lunghe, su \quad).
export function extractKeyLines(list) {
  let keys = list.filter(f => f && f.key && f.tex);
  if (!keys.length) keys = list.filter(f => f && f.tex).slice(0, 2);
  const out = [];
  for (const f of keys) {
    for (const part of f.tex.split('\\qquad')) {
      const t = part.trim();
      if (!t) continue;
      if (t.length > 48 && t.includes('\\quad')) {
        for (const sub of t.split('\\quad')) {
          const s = sub.trim();
          if (s) out.push({ tex: normTeX(s), cls: f.cls || '' });
        }
      } else {
        out.push({ tex: normTeX(t), cls: f.cls || '' });
      }
    }
  }
  return out;
}

export class KeyFormulas {
  constructor() {
    this.lines = [];         // [{ tex, cls, prev, t0, mode: 'write'|'morph'|'idle' }]
    this.indTerm = null;     // termini da evidenziare con Indicate
    this.indT0 = -1e9;
    this.lastHeight = 0;
  }

  clear() {
    this.lines = [];
    this.indTerm = null;
    this.lastHeight = 0;
  }

  // Aggiorna le righe chiave. fresh = true (nuovo esperimento) lancia Write; altrimenti TransformMatchingTex.
  // Durante il Play continuo, se cambia solo un numero (stessa struttura simbolica), aggiorna subito senza riavviare il morph ogni 120 ms.
  set(rawLines, { fresh = false, playing = false } = {}) {
    const now = performance.now() / 1000;
    const still = reducedMotion();
    if (!rawLines?.length) { this.lines = []; return; }
    if (fresh || !this.lines.length) {
      this.lines = rawLines.map((l, i) => ({
        tex: l.tex, cls: l.cls || '', prev: null,
        t0: now + (still ? 0 : i * WRITE_LAG),
        mode: still ? 'idle' : 'write',
      }));
      return;
    }
    const skel = s => s.replace(/[−-]?\d+(?:[.,]\d+)?/g, '#');
    const next = [];
    for (let i = 0; i < rawLines.length; i++) {
      const r = rawLines[i], cur = this.lines[i];
      if (!cur) {
        next.push({ tex: r.tex, cls: r.cls || '', prev: null, t0: now, mode: still ? 'idle' : 'write' });
      } else if (cur.tex === r.tex) {
        next.push({ ...cur, cls: r.cls || '' });
      } else if (playing && skel(cur.tex) === skel(r.tex)) {
        next.push({ tex: r.tex, cls: r.cls || '', prev: null, t0: now, mode: 'idle' });
      } else {
        next.push({
          tex: r.tex, cls: r.cls || '', prev: cur.tex,
          t0: now, mode: still ? 'idle' : 'morph',
        });
      }
    }
    this.lines = next;
  }

  // Evidenzia il simbolo legato a un parametro appena modificato (Indicate di Manim).
  indicate(paramKey) {
    if (!paramKey || reducedMotion()) return;
    const syms = PARAM_SYM[paramKey] ?? (paramKey.length <= 2 ? [paramKey] : null);
    if (!syms) return;
    this.indTerm = syms;
    this.indT0 = performance.now() / 1000;
  }

  // Disegna le formule chiave sul canvas dentro rect = { left, top, width } (in px schermo).
  // Restituisce l'altezza totale occupata (px) così lo spacer DOM nell'ispettore resta allineato.
  draw(P, rect, M, { alpha = 1 } = {}) {
    if (!this.lines.length || !rect || rect.width < 40 || alpha <= 0.01) return 0;
    const now = performance.now() / 1000;
    const still = reducedMotion();
    const baseSize = 15.5;
    const maxW = rect.width - 8;
    const indT = this.indTerm ? (now - this.indT0) / IND_S : 2;
    if (indT >= 1) this.indTerm = null;

    let y = rect.top + 8;
    for (const l of this.lines) {
      let sz = baseSize;
      let L = texLayout(P, l.tex, sz);
      if (L.w > maxW && L.w > 1) {
        sz = Math.max(10.5, sz * (maxW / L.w));
        L = texLayout(P, l.tex, sz);
      }
      const lineH = Math.max(26, L.bot - L.top + 10);
      const cy = y - L.top + 3;
      const col = l.cls === 'ok' ? M.vec.normal : l.cls === 'warn' ? M.vec.weight : M.text;
      const opts = { x: rect.left + 2, y: cy, size: sz, color: col, align: 'left', alpha, halo: M.bg };

      if (l.mode === 'write' && !still) {
        const t = (now - l.t0) / WRITE_S;
        if (t >= 1) { l.mode = 'idle'; drawTeX(P, l.tex, opts); }
        else if (t > 0) writeTeX(P, l.tex, t, opts);
      } else if (l.mode === 'morph' && l.prev && !still) {
        const t = (now - l.t0) / MORPH_S;
        if (t >= 1) { l.mode = 'idle'; l.prev = null; drawTeX(P, l.tex, opts); }
        else morphTeX(P, l.prev, l.tex, Math.max(0, t), opts);
      } else if (this.indTerm && indT >= 0 && indT < 1 && !still) {
        emphasize(P, l.tex, indT, { ...opts, term: this.indTerm, kind: 'indicate', dark: M.dark });
      } else {
        drawTeX(P, l.tex, opts);
      }
      y += lineH;
    }
    this.lastHeight = Math.ceil(y - rect.top + 4);
    return this.lastHeight;
  }
}
