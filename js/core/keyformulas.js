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
const IND_S = 0.75;       // durata Indicate quando si muove uno slider o una maniglia

// Mappa chiave parametro / maniglia → possibili simboli TeX da evidenziare con Indicate.
const PARAM_SYM = {
  m: ['m'], m1: ['m_1', '\\tau_1'], m2: ['m_2', '\\tau_2'], m3: ['m_3'], M: ['M'], Mp: ['M', 'I', '\\omega'],
  mh: ['m', 'a'], mm: ['m_r', 'I'], mb: ['I', '\\tau_a'],
  v: ['v', '\\vec v'], v0: ['v_0', 'v'], v1: ['v_1'], v2: ['v_2'], vp: ["v'", 'v'], vs: ['v_s'], V: ['V'],
  a: ['a'], A: ['A'], g: ['g'], G: ['G'],
  theta: ['\\theta'], th0: ['\\theta_0', '\\theta'], alpha: ['\\alpha', 'a'], phi: ['\\varphi', '\\phi'],
  x0: ['x_0'], y0: ['y_0'], h0: ['h_0'], s0: ['s_0'], L: ['L', 'T', '\\omega'], r: ['r', 'I', '\\omega'], r0: ['r_0', 'r'], R: ['R'],
  k: ['k', '\\omega'], b: ['b'], gam: ['\\gamma'], mus: ['\\mu_s'], muk: ['\\mu_d', '\\mu_k'], e: ['e'],
  q: ['q'], q1: ['q_1'], q2: ['q_2'], Q: ['Q'], sigma: ['\\sigma'], E: ['E', '\\vec E'], B: ['B', 'B_z', '\\vec B'],
  f: ['f'], f1: ['f_1'], f2: ['f_2'], ff: ['f_F'], F0: ['F_0'],
  T: ['T'], omega: ['\\omega'], w0: ['\\omega_0', '\\omega', 'L'], lambda: ['\\lambda'],
  F: ['F', '\\tau_F'], d: ['d'], dF: ['\\tau_F', 'b'], xf: ['\\tau', 'I'], tMax: ['t'],
  rho: ['\\rho'], rhoc: ['\\rho_c'], rhof: ['\\rho_f'],
  H: ['H'], h: ['h'], H0: ['H_0'], h1: ['h_1'], h2: ['h_2'],
  d1: ['d_1', 'A_1', '\\tau_1', 'b'], d2: ['d_2', 'A_2', '\\tau_2', 'b'], p0: ['p_0'], p1: ['p_1'],
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
        let clean = normTeX(t);
        // Se una riga chiave ha sviluppo numerico intermedio (A = B = conto = risultato) troppo lungo per la scena,
        // sulla scena mostriamo A = B = risultato lasciando il passaggio intermedio in "Tutte le formule".
        const eqParts = clean.split('=');
        if (clean.length > 54 && eqParts.length >= 4) {
          clean = `${eqParts[0].trim()} = ${eqParts[1].trim()} = ${eqParts[eqParts.length - 1].trim()}`;
        }
        out.push({ tex: clean, cls: f.cls || '' });
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
      } else if (skel(cur.tex) === skel(r.tex)) {
        // Stessa struttura simbolica (cambiano solo le cifre, in Play o trascinando uno slider): aggiorna subito così Indicate si vede subito
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
    const maxW = Math.min(rect.width - 8, (P.cam?.w ?? 9999) - rect.left - 16);
    const indT = this.indTerm ? (now - this.indT0) / IND_S : 2;
    if (indT >= 1) this.indTerm = null;

    let y = rect.top + 8;
    for (const l of this.lines) {
      let sz = baseSize;
      let L = texLayout(P, l.tex, sz);
      if (L.w > maxW && L.w > 1) {
        sz = Math.max(9.2, sz * (maxW / L.w));
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
