// Unità di misura per tutta l'app. I calcoli restano sempre in SI: qui si decide solo come si scrivono i numeri.
// Per ogni grandezza (lunghezze, masse, cariche) l'unità può essere "auto" (quella naturale di ogni esperimento:
// metri nella meccanica, centimetri e microcoulomb nell'elettrostatica) oppure una scelta valida ovunque.
// Con una scelta fissa cambiano anche le unità composte che iniziano con quella grandezza (m/s → cm/s);
// le altre (N, J, N/C, rad/s...) restano come sono.
import { store } from './store.js';
import { tn, fmt } from './math.js';

export const UNITS = {
  length: [['auto', null], ['mm', 1e-3], ['cm', 1e-2], ['m', 1], ['km', 1e3]],
  mass: [['auto', null], ['g', 1e-3], ['kg', 1]],
  charge: [['auto', null], ['nC', 1e-9], ['μC', 1e-6], ['C', 1]],
};
// Unità che possono comparire in testa a un'etichetta: grandezza e valore in SI.
const HEAD = { mm: ['length', 1e-3], cm: ['length', 1e-2], km: ['length', 1e3], m: ['length', 1], kg: ['mass', 1], g: ['mass', 1e-3],
  nC: ['charge', 1e-9], 'μC': ['charge', 1e-6], 'µC': ['charge', 1e-6], C: ['charge', 1] };
const HEAD_RE = /^(mm|cm|km|kg|nC|μC|µC|m|g|C)(?![A-Za-zμµ])/;

const state = { length: 'auto', mass: 'auto', charge: 'auto', ...store.get('units', {}) };
const listeners = [];
export const unit = kind => state[kind];
export function setUnit(kind, name) {
  if (state[kind] === name) return;
  state[kind] = name; store.set('units', state);
  cache.clear();
  listeners.forEach(f => f(kind, name));
}
export const onUnitsChange = f => { listeners.push(f); };

// Come mostrare una grandezza scritta nell'unità u ("m", "m/s²", "µC", "cm"): il valore va moltiplicato per f
// e l'unità diventa name. Senza una scelta fissa, o per unità che non dipendono dalle tre grandezze, f = 1.
const cache = new Map();
export function unitView(u) {
  if (!u) return { f: 1, name: u ?? '' };
  let V = cache.get(u);
  if (V) return V;
  V = { f: 1, name: u };
  const m = HEAD_RE.exec(u);
  if (m) {
    const [kind, si] = HEAD[m[1]], to = state[kind];
    if (to !== 'auto') {
      const target = UNITS[kind].find(([n]) => n === to);
      if (target) V = { f: si / target[1], name: to + u.slice(m[1].length) };
    }
  }
  cache.set(u, V);
  return V;
}

// Decimali da mostrare dopo la conversione: le cifre significative restano le stesse (3,25 m → 325 cm).
export const unitDec = (d, f) => Math.max(0, Math.min(6, d + Math.round(-Math.log10(f))));
const texUnit = name => `\\mathrm{${name.replace(/²/g, '^2').replace(/³/g, '^3').replace(/[μµ]/g, '\\mu ')}}`;

// Per le formule (KaTeX e mini-TeX della scena): numero convertito, con o senza unità.
//   uq('m', 3.25)  → "3{,}25\ \mathrm{m}"  oppure "325\ \mathrm{cm}";   un('m/s', v) → solo il numero;   uname('m') → l'unità.
export function uq(u, v, d = 2) { const U = unitView(u); return `${tn(v * U.f, unitDec(d, U.f))}\\ ${texUnit(U.name)}`; }
export function un(u, v, d = 2) { const U = unitView(u); return tn(v * U.f, unitDec(d, U.f)); }
export const uname = u => texUnit(unitView(u).name);
// Per il testo semplice (puntine, intestazioni, guide di trascinamento): "325 cm".
export function ut(u, v, d = 2) { const U = unitView(u); return `${fmt(v * U.f, unitDec(d, U.f))}${U.name ? ' ' + U.name : ''}`; }
// Etichetta con l'unità tra parentesi in fondo ("x (m)" → "x (cm)") e fattore da applicare ai valori.
export function unitLabel(label) {
  const m = /\(([^)]+)\)\s*$/.exec(label ?? '');
  if (!m) return { label, f: 1 };
  const U = unitView(m[1]);
  return { label: label.slice(0, m.index) + `(${U.name})`, f: U.f };
}
// Solo il numero, in testo semplice, e solo il nome dell'unità.
export function uf(u, v, d = 2) { const U = unitView(u); return fmt(v * U.f, unitDec(d, U.f)); }
export const utn = u => unitView(u).name;
