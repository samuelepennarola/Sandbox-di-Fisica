import { Camera } from './core/camera.js';
import { Painter, readColors, drawGrid } from './core/render.js';
import { Ink } from './core/ink.js';
import { Panel } from './core/panels.js';
import { Inspector } from './core/inspector.js';
import { drawPlot, seriesColor } from './core/plot.js';
import { palette as manimPalette } from './core/manim.js';
import { icons, applyIcons } from './core/icons.js';
import { store } from './core/store.js';
import { fmt } from './core/math.js';
import { paramControl } from './core/ui.js';
import { look, updateLook, drawParticles } from './core/look.js';
import './core/pwa.js';
import { Lasso } from './core/lasso.js';
import { AREAS, findExperiment } from './experiments/registry.js';

const H = 1 / 480;            // passo di integrazione predefinito (s); un esperimento può dichiarare il suo (exp.dt)
const SAMPLE_DT = 1 / 60;     // intervallo di campionamento per grafici e moviola (s)
const MAX_T = 300;            // oltre questo tempo la simulazione si ferma
const SWEEP_PERIOD = 6;       // durata di un'andata e ritorno dell'animazione di un parametro (s)
const HIT_PX = 26;            // tolleranza per afferrare una maniglia

const canvas = document.getElementById('stage');
const ctx = canvas.getContext('2d');
const cam = new Camera();
// Margini dell'inquadratura: barra in alto, ispettore a destra (se occupa spazio), moviola in basso.
cam.padFn = () => ({ top: 76, right: 24 + (insp?.reserved ?? 0), bottom: document.body.classList.contains('no-sim') ? 24 : 72, left: 24 + (document.body.classList.contains('has-rail') && !document.body.classList.contains('lesson') ? 76 : 0) });
const ink = new Ink();
const lasso = new Lasso(ink);
let colors = readColors();
const $ = id => document.getElementById(id);

const app = {
  exp: null, area: null, params: {}, sim: null,
  running: false, speed: 1, acc: 0,
  samples: [], history: [], lastSampleT: -Infinity,
  view: null, viewCache: null,      // moviola: indice del campione mostrato (null = istante corrente)
  sweep: null,                      // animazione di un parametro in corso
  syncs: [],                        // funzioni che riallineano i controlli ai valori
  tool: store.get('tool', 'hand'), inkColor: store.get('inkColor', 'ink'), penSeen: store.get('penSeen', false),
  eraserMode: store.get('eraserMode', 'stroke'),
  penType: store.get('penType', 'pen'),                                       // 'pen' (penna) o 'brush' (pennello)
  penSizes: { pen: 2.6, brush: 7, ...store.get('penSizes', {}) },             // spessore base in px allo zoom corrente   // 'stroke' = tratti interi, 'part' = gomma precisa
  graphIdx: 0, formulasDirty: true, activeHandle: null,
  sizes: {}, sizeSel: null,         // scala solo estetica degli oggetti disegnati negli esperimenti pronti
};

/* ---------------- Pannelli ---------------- */

// Ispettore a destra: controlli dell'esperimento in alto, schede Formule · Grafici · Teoria sotto.
const insp = new Inspector();
const graphBody = insp.pages.graphs, formulaBody = insp.pages.formulas, theoryBody = insp.pages.theory;
graphBody.innerHTML = '<div class="tabs"></div><canvas class="plot"></canvas><div class="legend"></div>';
const plotCanvas = graphBody.querySelector('.plot');
formulaBody.innerHTML = '<div class="formulas"></div>';
theoryBody.innerHTML = '<div class="theory"></div>';
// Aprendo o chiudendo l'ispettore la scena scorre di metà della sua larghezza: resta centrata nello spazio libero.
insp.onChange = (before, after) => cam.panBy((before - after) / 2, 0);

/* ---------------- Annulla e ripeti ---------------- */
// Un'unica cronologia per l'inchiostro e la scena dell'esperimento, nell'ordine in cui sono avvenute le modifiche.
// L'inchiostro si salva a istantanee; la scena la gestisce l'esperimento (exp.history, vedi core/history.js).
const undoLog = [], redoLog = [];
let inkSnap = [];
const cloneStrokes = list => list.map(st => ({ ...st, pts: st.pts.map(p => p.slice()) }));
function resetHistory() { undoLog.length = 0; redoLog.length = 0; inkSnap = cloneStrokes(ink.strokes); syncUndoBtns(); }
// Confronto rapido: gli stessi tratti con le stesse estremità (il lazo che sposta solo immagini non li tocca).
const sameInk = (a, b) => a.length === b.length && a.every((st, i) => {
  const o = b[i], p = st.pts, q = o.pts;
  return p.length === q.length && p[0]?.[0] === q[0]?.[0] && p[0]?.[1] === q[0]?.[1] && p.at(-1)?.[0] === q.at(-1)?.[0] && p.at(-1)?.[1] === q.at(-1)?.[1];
});
function recordInk() {
  if (sameInk(ink.strokes, inkSnap)) return;
  undoLog.push({ kind: 'ink', strokes: inkSnap });
  if (undoLog.length > 100) undoLog.shift();
  inkSnap = cloneStrokes(ink.strokes);
  redoLog.length = 0;
  syncUndoBtns();
}
function recordExp() { undoLog.push({ kind: 'exp' }); redoLog.length = 0; syncUndoBtns(); }
function stepHistory(from, to) {
  const e = from.pop();
  if (!e) return;
  lasso.clear();
  if (e.kind === 'ink') {
    to.push({ kind: 'ink', strokes: cloneStrokes(ink.strokes) });
    ink.strokes = e.strokes; ink.save();
    inkSnap = cloneStrokes(e.strokes);
  } else {
    const h = app.exp.history;
    if (h && (from === undoLog ? h.undo() : h.redo())) to.push(e);
  }
  syncUndoBtns();
}
const undo = () => stepHistory(undoLog, redoLog);
const redo = () => stepHistory(redoLog, undoLog);
function syncUndoBtns() { $('undoBtn').disabled = !undoLog.length; $('redoBtn').disabled = !redoLog.length; }

/* ---------------- Barra degli strumenti a sinistra ---------------- */
// Gli strumenti per creare oggetti (costruttore, cariche) stanno in una colonna a sinistra, separati
// dalle proprietà nel pannello di destra. groups: [{ title, items: [[id, icona, etichetta]] }].
const rail = document.getElementById('rail');
function setRail(groups, active, onPick) {
  rail.dataset.used = '1';
  rail.innerHTML = '';
  groups.forEach((g, i) => {
    if (i) rail.appendChild(Object.assign(document.createElement('div'), { className: 'rail-sep', title: g.title }));
    for (const [id, ic, label] of g.items) {
      const b = document.createElement('button');
      b.className = id === active ? 'on' : '';
      b.title = label;
      b.innerHTML = `${icons[ic]}<span>${label}</span>`;
      // Scegliere un oggetto da creare riporta il mouse e il dito alla Mano (con la Penna attiva il clic disegnerebbe).
      b.onclick = () => { if (app.tool !== 'hand') setTool('hand'); onPick(id); };
      // Si può anche trascinare lo strumento sulla scena: l'oggetto nasce dove lo si lascia.
      if (id !== 'select') b.addEventListener('pointerdown', e => startRailDrag(e, b, id, onPick, ic));
      rail.appendChild(b);
    }
  });
  showRail(groups.length > 0);
}
function showRail(v) {
  const was = !rail.classList.contains('hidden');
  rail.classList.toggle('hidden', !v);
  document.body.classList.toggle('has-rail', v);
  if (was !== v) cam.panBy((v ? 1 : -1) * RAIL_W / 2, 0);
}
const RAIL_W = 76;

// Trascinamento dalla barra: un'icona fantasma segue il dito; rilasciandola sulla scena l'oggetto viene creato lì,
// come se si fosse scelto lo strumento e toccato quel punto (stesse regole: griglia, appoggio sui piani).
let railDrag = null;
function startRailDrag(e, btn, id, onPick, ic) {
  railDrag = { id: e.pointerId, tool: id, onPick, ic, x0: e.clientX, y0: e.clientY, ghost: null };
}
addEventListener('pointermove', e => {
  const d = railDrag;
  if (!d || e.pointerId !== d.id) return;
  if (!d.ghost) {
    if (Math.hypot(e.clientX - d.x0, e.clientY - d.y0) < 12) return;
    d.ghost = document.createElement('div');
    d.ghost.className = 'rail-ghost';
    d.ghost.innerHTML = icons[d.ic];
    document.body.appendChild(d.ghost);
    tapStart = null;   // non è più un tocco sul pulsante
  }
  d.ghost.style.left = e.clientX + 'px';
  d.ghost.style.top = e.clientY + 'px';
  d.ghost.classList.toggle('over', document.elementFromPoint(e.clientX, e.clientY) === canvas);
}, true);
const endRailDrag = e => {
  const d = railDrag;
  if (!d || e.pointerId !== d.id) return;
  railDrag = null;
  if (!d.ghost) return;
  d.ghost.remove();
  if (e.type !== 'pointerup' || document.elementFromPoint(e.clientX, e.clientY) !== canvas) return;
  if (app.tool !== 'hand') setTool('hand');
  d.onPick(d.tool, true);                          // sceglie lo strumento (true: anche se era già attivo)
  const [x, y] = pos(e), [wx, wy] = cam.toWorld(x, y);
  const g = app.exp.pointerDown?.({ wx, wy, sx: x, sy: y, api });
  g?.up?.({ wx, wy, sx: x, sy: y });
};
addEventListener('pointerup', endRailDrag, true);
addEventListener('pointercancel', endRailDrag, true);

// Sezione richiudibile del pannello: si mostra solo l'essenziale, il resto si apre a richiesta.
function section(parent, title, key, open = true) {
  const box = document.createElement('div');
  box.className = 'sec';
  const state = store.get('sec.' + key, null);
  if (!(state ?? open)) box.classList.add('closed');
  const head = document.createElement('button');
  head.className = 'sec-head';
  head.innerHTML = `<span>${title}</span>${icons.chevron}`;
  head.onclick = () => { box.classList.toggle('closed'); store.set('sec.' + key, !box.classList.contains('closed')); };
  const body = document.createElement('div');
  body.className = 'sec-body';
  box.append(head, body);
  parent.appendChild(box);
  return body;
}

/* ---------------- Valori fissati sulla scena ---------------- */
// Ogni controllo numerico ha una puntina: il suo valore resta visibile in alto a sinistra,
// anche in modalità Spiega quando i pannelli sono nascosti.
const pinGetters = new Map();   // chiave → { get, def }
const pinsBox = document.getElementById('pins');
const pinKey = key => app.exp.id + ':' + key;
function pinList() { return store.get('pins.' + app.exp.id, []); }
function isPinned(key) { return pinList().some(p => p.key === key); }
function togglePin(key, def) {
  const list = pinList(), i = list.findIndex(p => p.key === key);
  if (i >= 0) list.splice(i, 1);
  else list.push({ key, label: def.pinLabel ?? def.label, unit: def.unit ?? '', step: def.step });
  store.set('pins.' + app.exp.id, list);
  buildPins(); syncParams();
}
// Valore attuale di una puntina, o null se l'oggetto a cui si riferisce non c'è più.
// L'esperimento può risolverlo dalla scena corrente (exp.pinInfo): così resta giusto dopo annulla/ripeti
// e dopo una ricarica, anche se il pannello di quell'oggetto non è mai stato aperto.
// pinInfo restituisce undefined (chiave non sua), null (oggetto sparito) o { value, name }: se il nome
// non è più quello salvato nell'etichetta, l'id è stato riusato da un altro oggetto e la puntina si nasconde.
function pinValue(p) {
  const info = app.exp.pinInfo?.(p.key);
  if (info !== undefined) return info && (!info.name || p.label.startsWith(info.name + ' · ')) ? info.value : null;
  const g = pinGetters.get(pinKey(p.key));
  return g ? g.get() : null;
}
let pinsShown = '';
function buildPins() {
  const list = pinList().filter(p => pinValue(p) != null);
  pinsShown = list.map(p => p.key).join('|');
  pinsBox.innerHTML = '';
  pinsBox.classList.toggle('hidden', !list.length);
  for (const p of list) {
    const row = document.createElement('div');
    row.className = 'pin';
    row.dataset.key = p.key;
    row.innerHTML = `<span class="pin-label"></span><strong class="pin-val"></strong><button class="pin-x" title="Togli dalla scena">${icons.close}</button>`;
    row.querySelector('.pin-label').textContent = p.label;
    row.querySelector('.pin-x').onclick = () => togglePin(p.key, p);
    pinsBox.appendChild(row);
  }
  updatePins(false);
}
function updatePins(check = true) {
  // Se sono comparsi o spariti degli oggetti (annulla, elimina, svuota) l'elenco va ricostruito.
  if (check && pinList().filter(p => pinValue(p) != null).map(p => p.key).join('|') !== pinsShown) { buildPins(); return; }
  for (const row of pinsBox.children) {
    const p = pinList().find(q => q.key === row.dataset.key), v = p && pinValue(p);
    if (v == null) continue;
    const d = Math.max(0, -Math.floor(Math.log10(p.step || 1) + 1e-9));
    row.querySelector('.pin-val').textContent = `${fmt(v, d)}${p.unit ? ' ' + p.unit : ''}`;
  }
}

// Controllo di un parametro collegato al motore (valore digitabile + animazione).
function control(def, get, set, key = def.key) {
  if (!def.type) pinGetters.set(pinKey(key), { get, def });
  const c = paramControl(def, {
    get, set,
    pin: def.type ? null : { isOn: () => isPinned(key), toggle: () => togglePin(key, def) },
    onUser: () => { if (app.sweep?.key === key) stopSweep(); },
    animate: def.type ? null : () => toggleSweep({ key, def, get, set }),
    isAnimating: () => app.sweep?.key === key,
  });
  app.syncs.push(c.sync);
  return c.el;
}

function buildParams() {
  const { exp } = app;
  const body = insp.paramsBody;
  body.innerHTML = '';
  app.syncs = [];
  insp.setTitle(exp.panelTitle ?? 'Parametri');
  if (exp.buildPanel) {
    rail.dataset.used = '';
    exp.buildPanel(body, api);
    if (rail.dataset.used !== '1') showRail(false);
    buildPins(); return;
  }
  showRail(false);

  for (const def of exp.params) {
    body.appendChild(control(def, () => app.params[def.key], v => setParam(def, v)));
  }

  if (exp.presets?.length) {
    const h = document.createElement('div');
    h.className = 'sub'; h.textContent = 'Situazioni tipiche';
    const chips = document.createElement('div');
    chips.className = 'chips';
    for (const pr of exp.presets) {
      const b = document.createElement('button');
      b.textContent = pr.label;
      b.onclick = () => { stopSweep(); Object.assign(app.params, pr.values); syncParams(); resetSim(); fitView(); };
      chips.appendChild(b);
    }
    const reset = document.createElement('button');
    reset.textContent = 'Valori iniziali';
    reset.onclick = () => { stopSweep(); app.params = defaults(exp); syncParams(); resetSim(); fitView(); };
    chips.appendChild(reset);
    body.append(h, chips);
  }
  buildPins();
}

function defaults(exp) { return Object.fromEntries((exp.params ?? []).map(p => [p.key, p.value])); }
function syncParams() { app.syncs.forEach(s => s()); }

function setParam(def, value) {
  app.params[def.key] = value;
  if (!def.live) resetSim();
  // Le scelte (select) e i parametri marcati "refit" cambiano la scena: va reinquadrata.
  if (def.refit || def.type === 'select') fitView();
  app.formulasDirty = true;
}

function graphs() {
  const g = app.exp.graphs;
  return typeof g === 'function' ? g(app.sim, app.params) : g;
}

function buildGraphTabs() {
  const list = graphs();
  if (app.graphIdx >= list.length) app.graphIdx = 0;
  const tabs = graphBody.querySelector('.tabs');
  tabs.innerHTML = '';
  list.forEach((g, i) => {
    const b = document.createElement('button');
    b.textContent = g.title;
    b.className = i === app.graphIdx ? 'on' : '';
    b.onclick = () => { app.graphIdx = i; buildGraphTabs(); };
    tabs.appendChild(b);
  });
  const g = list[app.graphIdx];
  graphBody.querySelector('.legend').innerHTML = g
    ? g.series.map(s => `<span style="--lc:${seriesColor(manimPalette(colors), colors, s.color)}">${s.label}</span>`).join('')
    : '';
}

function renderFormulas() {
  const out = app.exp.formulas(viewSim(), app.params);
  const box = formulaBody.firstChild;
  if (typeof out === 'string') { box.innerHTML = out; return; }
  const k = window.katex;
  box.innerHTML = out.filter(Boolean).map(f => {
    if (f.h) return `<div class="fh">${f.h}</div>`;
    if (f.html) return f.html;
    const html = k ? k.renderToString(f.tex, { throwOnError: false }) : f.tex;
    return `<div class="f ${f.cls || ''}">${html}</div>`;
  }).join('');
}

function renderTheory() {
  const el = theoryBody.firstChild;
  el.innerHTML = app.exp.theory;
  window.renderMathInElement?.(el, {
    delimiters: [{ left: '$$', right: '$$', display: true }, { left: '$', right: '$', display: false }],
    throwOnError: false,
  });
}

/* ---------------- Cassetto esperimenti ---------------- */

function buildDrawer() {
  const dr = $('drawer');
  dr.innerHTML = '<h1>Sandbox di Fisica</h1>';
  const theme = document.createElement('button');
  theme.className = 'drawer-theme';
  theme.innerHTML = `${icons.theme}<span>Tema chiaro / scuro</span>`;
  theme.onclick = toggleTheme;
  dr.appendChild(theme);
  for (const a of AREAS) {
    const h = document.createElement('h2');
    h.textContent = a.title;
    dr.appendChild(h);
    for (const e of a.experiments) {
      const b = document.createElement('button');
      b.innerHTML = `${e.title}<small>${e.subtitle}</small>`;
      b.className = app.exp === e ? 'on' : '';
      b.onclick = () => { loadExperiment(e.id); toggleDrawer(false); };
      dr.appendChild(b);
    }
    for (const s of a.soon) {
      const d = document.createElement('div');
      d.className = 'soon'; d.innerHTML = `${s}<em>in arrivo</em>`;
      dr.appendChild(d);
    }
  }
}

function toggleDrawer(open) {
  $('drawer').classList.toggle('open', open);
  $('scrim').classList.toggle('open', open);
}

/* ---------------- Simulazione ---------------- */

// API offerta agli esperimenti "ricchi" (il costruttore libero).
const api = {
  cam, Panel,
  control: (def, get, set, key) => control(def, get, set, key),
  reset: () => resetSim(),
  refresh: () => { app.formulasDirty = true; buildGraphTabs(); syncParams(); },
  rebuildPanel: () => buildParams(),
  fit: () => fitView(),
  stopSweep: () => stopSweep(),
  view: () => viewSim(),
  isFresh: () => app.sim.t === 0 && app.view == null,
  get running() { return app.running; },
  ink, areas: AREAS,
  snapshot: (exp, w, h) => expSnapshot(exp, w, h),
  setRail: (groups, active, onPick) => setRail(groups, active, onPick),
  recordChange: () => recordExp(),
  section: (parent, title, key, open) => section(parent, title, key, open),
  lassoClear: () => lasso.clear(),
};

// Istantanea di un esperimento (stato iniziale con i parametri salvati) su un canvas w × h px.
function expSnapshot(exp, w, h) {
  const cv = document.createElement('canvas'), k = 2;
  cv.width = w * k; cv.height = h * k;
  const c2 = cv.getContext('2d');
  c2.scale(k, k);
  const cm = new Camera();
  cm.setViewport(w, h);
  if (exp !== app.exp) exp.mount?.(api);
  const params = { ...defaults(exp), ...store.get('params.' + exp.id, {}) };
  const sim = exp.init(params);
  cm.fit(exp.view(params, sim), { top: 16, right: 16, bottom: 16, left: 16 });
  if (exp.drawBackground) exp.drawBackground(c2, cm, colors);
  else drawGrid(c2, cm, colors, false);
  const sizes = store.get('sizes.' + exp.id, {});
  const P = new Painter(c2, cm, colors);
  // Nelle istantanee niente maniglie né vettori (frecce con le loro etichette): i vettori li disegnano i ragazzi.
  P.handle = P.sizeHandle = P.arrow = () => {};
  exp.draw(P, sim, params, { active: null, api: { ...api, running: false }, size: key => sizes[key] ?? 1, snapshot: true });
  return cv;
}

// Dissolvenza della scena (cambio di esperimento o di tema), come una transizione di regia di Manim:
// una copia dell'ultimo fotogramma sopra la tela sfuma in 0,35 s con la curva "smooth". La copia non riceve
// tocchi, quindi la nuova scena è subito utilizzabile. Rispetta "riduci movimento".
const fadeCv = document.createElement('canvas');
fadeCv.id = 'sceneFade';
canvas.after(fadeCv);
let fadeTimer = 0;
function sceneFade(ms = 350) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches || !canvas.width) return;
  fadeCv.width = canvas.width; fadeCv.height = canvas.height;
  fadeCv.style.width = canvas.style.width; fadeCv.style.height = canvas.style.height;
  fadeCv.getContext('2d').drawImage(canvas, 0, 0);
  fadeCv.style.transition = 'none'; fadeCv.style.opacity = '1';
  fadeCv.classList.add('on');
  fadeCv.getBoundingClientRect();   // applica l'opacità piena prima di avviare la transizione
  fadeCv.style.transition = `opacity ${ms}ms cubic-bezier(.6, 0, .4, 1)`;
  fadeCv.style.opacity = '0';
  clearTimeout(fadeTimer);
  fadeTimer = setTimeout(() => fadeCv.classList.remove('on'), ms + 50);
}
// I controlli del nuovo esperimento entrano con un breve fade (CSS: #inspector.swap).
function inspectorSwap() {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  insp.el.classList.remove('swap');
  void insp.el.offsetWidth;
  insp.el.classList.add('swap');
}

function loadExperiment(id) {
  if (app.exp) { sceneFade(); inspectorSwap(); }
  ink.end();
  stopSweep();
  app.exp?.unmount?.(api);
  const { exp, area } = findExperiment(id);
  app.exp = exp; app.area = area;
  app.params = { ...defaults(exp), ...store.get('params.' + exp.id, {}) };
  app.sizes = store.get('sizes.' + exp.id, {});
  app.sizeSel = null;
  app.graphIdx = 0;
  store.set('lastExp', exp.id);
  $('crumbArea').textContent = area.title;
  $('crumbExp').textContent = exp.title;
  ink.load(exp.id);
  lasso.clear();
  exp.mount?.(api);
  exp.history?.reset();
  resetHistory();
  // La Lavagna non ha simulazione: niente comandi di play, moviola, grafici e formule.
  document.body.classList.toggle('no-sim', !!exp.noSim);
  // Un esperimento senza tempo può comunque tenere alcuni pannelli (exp.keepPanels).
  insp.setTabs([...['formulas', 'graphs'].filter(k => !exp.noSim || exp.keepPanels?.includes(k)), 'theory']);
  resetSim();
  buildParams(); buildGraphTabs(); buildDrawer(); renderTheory();
  fitView();
}

function resetSim() {
  app.sim = app.exp.init(app.params);
  app.running = false; app.acc = 0;
  app.samples = []; app.history = []; app.lastSampleT = -Infinity;
  app.view = null; app.viewCache = null;
  recordSample();
  app.formulasDirty = true;
  store.set('params.' + app.exp.id, app.params);
  updatePlayBtn();
}

/* --- Moviola: istantanee dello stato a ogni campione --- */

// Istantanea generica: copia superficiale; gli array (scie) crescono solo in coda, quindi basta la lunghezza.
function snapshot(s) {
  if (app.exp.snapshot) return app.exp.snapshot(s);
  const o = {};
  for (const k in s) o[k] = Array.isArray(s[k]) ? { __len: s[k].length } : s[k];
  return o;
}
function stateAt(snap) {
  if (app.exp.stateAt) return app.exp.stateAt(app.sim, snap);
  const o = {};
  for (const k in snap) o[k] = snap[k]?.__len != null ? app.sim[k].slice(0, snap[k].__len) : snap[k];
  return o;
}
function resumeFrom(snap) {
  if (app.exp.resumeFrom) return app.exp.resumeFrom(app.sim, snap);
  for (const k in snap) {
    if (snap[k]?.__len != null) app.sim[k].length = snap[k].__len;
    else app.sim[k] = snap[k];
  }
}

function viewSim() {
  if (app.view == null) return app.sim;
  if (app.viewCache?.idx !== app.view) app.viewCache = { idx: app.view, state: stateAt(app.history[app.view]) };
  return app.viewCache.state;
}

function recordSample() {
  app.samples.push(app.exp.sample(app.sim, app.params));
  app.history.push(snapshot(app.sim));
  app.lastSampleT = app.sim.t;
}

// Riprende la simulazione dall'istante mostrato in moviola, scartando il "futuro" già calcolato.
function commitView() {
  if (app.view == null) return;
  if (app.view < app.history.length - 1) {
    resumeFrom(app.history[app.view]);
    app.samples.length = app.history.length = app.view + 1;
    app.lastSampleT = app.sim.t;
  }
  app.view = null; app.viewCache = null;
}

function isDone() { return app.exp.done?.(app.sim) || app.sim.t >= MAX_T; }

function advance(simTime) {
  const h = app.exp.dt ?? H;
  app.acc += simTime;
  let n = 0;
  while (app.acc >= h && n++ < 4000) {
    app.exp.step(app.sim, h, app.params);
    app.acc -= h;
    if (app.sim.t - app.lastSampleT >= SAMPLE_DT - 1e-9) recordSample();
    if (isDone()) {
      if (app.sim.t > app.lastSampleT) recordSample();
      app.running = false; app.acc = 0;
      updatePlayBtn();
      break;
    }
  }
  app.formulasDirty = true;
}

function togglePlay() {
  stopSweep();
  if (app.running) app.running = false;
  else {
    commitView();
    if (isDone()) resetSim();
    app.running = true;
  }
  updatePlayBtn();
}

function updatePlayBtn() {
  $('playBtn').innerHTML = app.running ? icons.pause : icons.play;
}

function fitView() { app.exp.fit ? app.exp.fit(cam, api) : cam.fit(app.exp.view(app.params, app.sim)); }

/* --- Animazione di un parametro: il valore oscilla tra min e max e il moto viene ricalcolato --- */

function toggleSweep(target) {
  if (app.sweep?.key === target.key) { stopSweep(); return; }
  stopSweep();
  const { min, max } = target.def;
  const u = Math.min(1, Math.max(0, (target.get() - min) / (max - min)));
  app.sweep = { ...target, phase: Math.acos(1 - 2 * u) / (2 * Math.PI) * SWEEP_PERIOD };
  app.running = false; updatePlayBtn();
  syncParams();
}

function stopSweep() {
  if (!app.sweep) return;
  app.sweep = null;
  syncParams();
}

function stepSweep(dt) {
  const s = app.sweep, { min, max, step } = s.def;
  s.phase += dt;
  const u = 0.5 - 0.5 * Math.cos(2 * Math.PI * s.phase / SWEEP_PERIOD);
  const v = Math.round((min + (max - min) * u) / step) * step;
  if (v !== s.last) {
    s.last = v;
    s.set(v);
    // Calcola tutto il moto (fino alla fine o all'orizzonte) per mostrarne la forma.
    const horizon = app.exp.sweepHorizon ?? 20;
    const h = app.exp.dt ?? H;
    while (!isDone() && app.sim.t < horizon) {
      app.exp.step(app.sim, h, app.params);
      if (app.sim.t - app.lastSampleT >= SAMPLE_DT - 1e-9) recordSample();
    }
    if (app.sim.t > app.lastSampleT) recordSample();
    app.running = false;
    syncParams();
  }
}

/* ---------------- Rendering ---------------- */

let dpr = 1;
function resize() {
  dpr = devicePixelRatio || 1;
  const w = innerWidth, h = innerHeight;
  canvas.style.width = w + 'px';
  canvas.style.height = h + 'px';
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  cam.setViewport(w, h);
  insp.sync();
  Panel.clampAll();
}

// Coordinate del puntatore rispetto al canvas (non alla finestra).
function pos(e) {
  const r = canvas.getBoundingClientRect();
  return [(e.clientX - r.left) * cam.w / r.width, (e.clientY - r.top) * cam.h / r.height];
}

// Safari a volte segnala pressione 0 al primo contatto della Pencil: un tocco diventerebbe invisibile.
const pressureOf = e => (e.pointerType === 'pen' ? (e.pressure > 0 ? e.pressure : 0.5) : 0.5);

function render() {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (app.exp.drawBackground) app.exp.drawBackground(ctx, cam, colors);
  else drawGrid(ctx, cam, colors, !app.exp.axes);
  const P = new Painter(ctx, cam, colors);
  app.exp.draw(P, viewSim(), app.params, { active: app.activeHandle, api, size: sizeOf });
  const sel = selectedResizable();
  if (sel) {
    const [a, b] = cam.toScreen(sel.x, sel.y);
    P.ringS(a, b, sel.rPx + 7);
    P.sizeHandleS(...sizeHandlePos(sel), app.activeHandle === 'size');
  }
  drawParticles(P);
  ink.draw(ctx, cam, colors);
  lasso.draw(P, app.exp, app.activeHandle === 'lassoScale');
  updateSelbar();
  updateCtxbar();
}

// Barretta di azioni accanto all'oggetto selezionato (exp.selectionBar): le azioni frequenti stanno dove si guarda.
// L'esperimento restituisce { x, y, actions: [{ label, run, danger? }] } con (x, y) il punto sopra l'oggetto, o null.
const ctxbar = $('ctxbar');
let ctxKey = '';
function updateCtxbar() {
  const bar = !app.running && !gesture && app.mode !== 'lesson' ? app.exp.selectionBar?.(api) : null;
  ctxbar.classList.toggle('hidden', !bar);
  if (!bar) { ctxKey = ''; return; }
  const key = bar.key + '|' + bar.actions.map(a => a.label).join('|');
  if (key !== ctxKey) {
    ctxKey = key;
    ctxbar.innerHTML = '';
    for (const a of bar.actions) {
      const b = document.createElement('button');
      b.textContent = a.label;
      if (a.danger) b.className = 'danger';
      b.onclick = () => { a.run(); ctxKey = ''; };
      ctxbar.appendChild(b);
    }
  }
  const [sx, sy] = cam.toScreen(bar.x, bar.y), w = ctxbar.offsetWidth || 200;
  ctxbar.style.left = Math.min(innerWidth - insp.reserved - w - 8, Math.max(cam.padFn().left - 12, sx - w / 2)) + 'px';
  ctxbar.style.top = Math.max(64, sy - 54) + 'px';
}

// Barretta Copia / Elimina sopra la selezione del lazo.
const selbar = $('selbar');
function updateSelbar() {
  const r = lasso.screenBox(cam, app.exp);
  selbar.classList.toggle('hidden', !r || gesture?.type === 'lasso');
  if (!r) return;
  const w = selbar.offsetWidth || 160;
  selbar.style.left = Math.min(innerWidth - w - 8, Math.max(8, (r.x0 + r.x1) / 2 - w / 2)) + 'px';
  selbar.style.top = Math.max(64, r.y0 - 48) + 'px';
}

const tlRange = $('tlRange'), tlLabel = $('tlLabel');
function updateTimeline() {
  const n = app.history.length - 1;
  const idx = app.view ?? n;
  tlRange.max = Math.max(1, n);
  tlRange.value = idx;
  tlRange.disabled = n < 1;
  const t = viewSim().t;
  $('clock').textContent = `t = ${fmt(t)} s`;
  tlLabel.textContent = app.view == null ? `${fmt(t)} s` : `◀ ${fmt(t)} / ${fmt(app.sim.t)} s`;
  $('timeline').classList.toggle('past', app.view != null);
}

let lastTs = 0, lastFormulaTs = 0, lastPinTs = 0, lastViewShown = null;
function frame(ts) {
  const dt = Math.min(0.05, (ts - lastTs) / 1000 || 0);
  lastTs = ts;
  if (app.sweep) stepSweep(dt);
  else if (app.running) advance(dt * app.speed);
  // Le animazioni decorative (polvere) nascono solo mentre la simulazione scorre dal vivo.
  look.live = app.running && app.view == null;
  updateLook(dt * (app.running ? app.speed : 1));
  if (app.view !== lastViewShown) { app.formulasDirty = true; lastViewShown = app.view; }
  render();
  updateTimeline();
  const g = graphs()[app.graphIdx];
  if (insp.showing('graphs') && g) drawPlot(plotCanvas, app.samples, g, colors, app.view);
  if (app.formulasDirty && ts - lastFormulaTs > 120 && insp.showing('formulas')) {
    renderFormulas(); lastFormulaTs = ts; app.formulasDirty = false;
  }
  if (ts - lastPinTs > 150 && (pinsBox.children.length || pinList().length)) { updatePins(); lastPinTs = ts; }
  requestAnimationFrame(frame);
}

/* ---------------- Input: Pencil scrive, dito manipola ---------------- */

const touches = new Map();
let gesture = null;

/* --- Scala estetica degli oggetti (esperimenti pronti) --- */
// Un esperimento dichiara con resizables(s, p, { scale, size }) gli oggetti che si possono ingrandire:
// [{ key, x, y, rPx }] con centro in metri e raggio d'ingombro in px. La scala cambia solo il disegno.

function sizeOf(key) { return app.sizes[key] ?? 1; }

function resizables() {
  return app.exp.resizables?.(viewSim(), app.params, { scale: cam.scale, size: sizeOf }) ?? [];
}

function selectedResizable() {
  return app.sizeSel ? resizables().find(r => r.key === app.sizeSel) ?? null : null;
}

// La maniglia sta in basso a destra dell'oggetto, a 45°.
function sizeHandlePos(r) {
  const [a, b] = cam.toScreen(r.x, r.y), d = (r.rPx + 7) * Math.SQRT1_2;
  return [a + d, b + d];
}

function hitResizable(sx, sy) {
  let best = null, bestD = Infinity;
  for (const r of resizables()) {
    const [a, b] = cam.toScreen(r.x, r.y), d = Math.hypot(a - sx, b - sy);
    if (d < r.rPx + 10 && d < bestD) { best = r; bestD = d; }
  }
  return best;
}

function hitHandle(sx, sy) {
  let best = null, bestD = Infinity;
  for (const h of app.exp.handles?.(viewSim(), app.params) ?? []) {
    const [a, b] = cam.toScreen(h.x, h.y);
    const d = Math.hypot(a - sx, b - sy);
    if (d < (h.r ?? HIT_PX) && d < bestD) { best = h; bestD = d; }
  }
  return best;
}

function erase(wx, wy) {
  if (app.eraserMode === 'part') ink.erasePartAt(wx, wy, 9 / cam.scale);
  else ink.eraseAt(wx, wy, 12 / cam.scale);
}

function inkTool(e) {
  if (e.pointerType === 'pen') return app.tool === 'eraser' || app.tool === 'lasso' ? app.tool : 'pen';
  if (e.pointerType === 'touch' && app.penSeen) return null; // con la Pencil il dito non scrive mai
  return app.tool === 'hand' ? null : app.tool;
}

function startPinch() {
  const [p1, p2] = [...touches.values()];
  gesture = { type: 'pinch', cx: (p1.x + p2.x) / 2, cy: (p1.y + p2.y) / 2, d: Math.hypot(p1.x - p2.x, p1.y - p2.y) };
}

/* --- Esclusione del palmo (attiva da quando su questo dispositivo è stata usata la Pencil) --- */
const PALM_AFTER_PEN_MS = 500;   // dopo aver alzato la Pencil il polso resta spesso appoggiato
const PALM_REVERT_MS = 800;      // un tocco iniziato poco prima della Pencil era quasi certamente il polso
const PALM_SIZE_PX = 38;         // contatti più larghi di così sono un palmo, non un dito
const PEN_STALE_MS = 1500;       // Pencil "appoggiata" ma muta da così tanto: il suo rilascio è andato perso
const palm = { penDown: false, penUpAt: -Infinity, lastPen: -Infinity, ignored: new Set(), why: '' };
// Il rilascio della Pencil va registrato anche se avviene fuori dalla scena (sopra una barra o il pannello):
// altrimenti l'app la crederebbe ancora appoggiata e ignorerebbe il dito per sempre.
// Lo stesso vale per il gesto in corso (un tratto della Pencil, un trascinamento): se il rilascio cade fuori
// dalla scena, il gesto si chiude comunque, come se fosse avvenuto sopra.
for (const type of ['pointerup', 'pointercancel']) document.addEventListener(type, e => {
  if (e.target !== canvas) endPointer(e);
}, true);
document.addEventListener('pointermove', e => { if (e.pointerType === 'pen' && e.buttons) palm.lastPen = performance.now(); }, true);

// La Pencil è arrivata mentre un tocco del dito era in corso: era il polso. Annulla quello che ha fatto.
function revertTouchGesture() {
  const g = gesture;
  if (performance.now() - g.t0 < PALM_REVERT_MS) {
    Object.assign(cam, g.cam0);
    if (g.type === 'lassoMove' && g.total) lasso.move(app.exp, -g.total[0], -g.total[1]);
    if (g.type === 'lassoScale' && g.k !== 1) lasso.scale(app.exp, 1 / g.k, g.ax, g.ay);
    if (g.type === 'drag' && g.moved && g.params0) { Object.assign(app.params, g.params0); syncParams(); resetSim(); }
  }
  if (g.type === 'ink') ink.cancel();
  g.custom?.cancel?.();
  if (g.scene0 && performance.now() - g.t0 < PALM_REVERT_MS) app.exp.history?.restore(g.scene0);
  app.activeHandle = null;
  gesture = null;
}

// Selezione attiva (lazo o immagine): la maniglia la ridimensiona, un trascinamento dentro la sposta.
function selectionGesture(x, y, wx, wy, id) {
  const r = lasso.screenBox(cam, app.exp);
  if (!r) return null;
  if (Math.hypot(x - r.x1, y - r.y1) < HIT_PX) {
    // Ingrandisce attorno all'angolo opposto (in alto a sinistra) del riquadro.
    const [ax, ay] = cam.toWorld(r.x0, r.y0);
    app.activeHandle = 'lassoScale';
    return { type: 'lassoScale', id, ax, ay, d0: Math.max(10, Math.hypot(x - r.x0, y - r.y0)), k: 1 };
  }
  if (x > r.x0 && x < r.x1 && y > r.y0 && y < r.y1) return { type: 'lassoMove', id, lx: wx, ly: wy, total: [0, 0] };
  return null;
}

canvas.addEventListener('pointerdown', e => {
  const before = gesture;
  onPointerDown(e);
  // Ricorda come era la vista quando è iniziato un gesto col dito, per poterlo annullare se era il polso.
  if (e.pointerType === 'touch' && gesture && gesture !== before) {
    const prev = before?.touch ? before : null;
    Object.assign(gesture, {
      touch: true, t0: prev?.t0 ?? performance.now(), cam0: prev?.cam0 ?? { cx: cam.cx, cy: cam.cy, scale: cam.scale },
      // Anche parametri e scena, perché il polso può aver trascinato una maniglia o un oggetto.
      params0: prev?.params0 ?? { ...app.params },
      scene0: prev ? prev.scene0 : (app.exp.history ? JSON.stringify(app.exp.history.get()) : null),
    });
  }
});

function onPointerDown(e) {
  // Se l'evento arriva in ritardo (Pencil già sollevata), la cattura fallisce: il tocco va comunque gestito.
  try { canvas.setPointerCapture(e.pointerId); } catch { /* puntatore già rilasciato */ }
  // I touch della scena sono annullati, quindi un tocco qui non toglie più il fuoco a un campo in modifica:
  // confermiamo noi il valore che si stava scrivendo (come premere Invio) e chiudiamo la tastiera.
  document.querySelector('.num-edit')?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
  if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
  const [x, y] = pos(e);
  if (e.pointerType === 'pen') {
    if (!app.penSeen) { app.penSeen = true; store.set('penSeen', true); }
    palm.penDown = true; palm.lastPen = performance.now();
    if (gesture?.touch) revertTouchGesture();
    for (const id of touches.keys()) palm.ignored.add(id);
    touches.clear();
  }
  if (e.pointerType === 'touch') {
    // Primo dito sullo schermo: non ci sono altri contatti, quindi quelli rimasti in memoria sono fantasmi
    // (rilasci persi) e non devono bloccare i gesti. Lo stesso per una Pencil "appoggiata" ma muta da tempo.
    if (palm.penDown && performance.now() - palm.lastPen > PEN_STALE_MS) palm.penDown = false;
    if (e.isPrimary) {
      touches.clear(); palm.ignored.clear();
      // Un gesto rimasto aperto (dito o Pencil ormai sollevati) va chiuso: altrimenti blocca il dito per sempre.
      if (gesture && (gesture.touch || !palm.penDown)) {
        if (gesture.type === 'ink') { ink.end(); recordInk(); }
        gesture.custom?.up?.({ ...(() => { const [sx, sy] = pos(e), [wx, wy] = cam.toWorld(sx, sy); return { sx, sy, wx, wy }; })(), cancelled: true });
        app.activeHandle = null;
        gesture = null;
      }
    }
  }
  if (e.pointerType === 'touch' && app.penSeen) {
    const recent = performance.now() - palm.penUpAt < PALM_AFTER_PEN_MS;
    const big = Math.max(e.width || 0, e.height || 0) > PALM_SIZE_PX;
    if (palm.penDown || recent || big) {
      palm.why = palm.penDown ? 'Pencil appoggiata' : recent ? 'subito dopo la Pencil' : `contatto largo ${Math.round(Math.max(e.width, e.height))} px`;
      palm.ignored.add(e.pointerId); return;
    }
    palm.why = '';
  }

  if (e.pointerType === 'touch') {
    touches.set(e.pointerId, { x, y });
    if (gesture?.type === 'ink' && gesture.pen) return;          // palmo appoggiato mentre si scrive
    if (touches.size === 2) {
      if (gesture?.type === 'ink') ink.cancel();
      gesture?.custom?.cancel?.();
      app.activeHandle = null;
      startPinch();
      return;
    }
    if (touches.size > 2) return;
  }

  const [wx, wy] = cam.toWorld(x, y);
  // Con lo strumento Mano la Pencil sposta gli oggetti su cui parte (cariche, corpi, maniglie);
  // altrove, o con lo strumento Penna, scrive.
  if (e.pointerType === 'pen' && app.tool === 'hand') {
    const g = objectGesture(x, y, wx, wy, e.pointerId, true);
    if (g) { gesture = g; return; }
  }
  const tool = inkTool(e);
  if (tool === 'pen') {
    ink.begin(wx, wy, pressureOf(e), app.penSizes[app.penType] / cam.scale, app.inkColor, app.penType);
    gesture = { type: 'ink', id: e.pointerId, pen: e.pointerType === 'pen' };
    return;
  }
  if (tool === 'eraser') {
    erase(wx, wy);
    gesture = { type: 'erase', id: e.pointerId };
    return;
  }
  if (tool === 'lasso') {
    const g = selectionGesture(x, y, wx, wy, e.pointerId);
    if (g) { gesture = g; return; }
    lasso.start(wx, wy);
    gesture = { type: 'lasso', id: e.pointerId };
    return;
  }

  // Con la mano: una selezione già fatta si sposta e si ridimensiona; toccare un'immagine la seleziona e la trascina.
  if (lasso.active) {
    const g = selectionGesture(x, y, wx, wy, e.pointerId);
    if (g) { gesture = g; return; }
    lasso.clear();
  }
  const item = app.exp.lasso?.hit?.(wx, wy);
  if (item) {
    lasso.select([], [item]);
    gesture = { type: 'lassoMove', id: e.pointerId, lx: wx, ly: wy, total: [0, 0] };
    return;
  }

  const g = objectGesture(x, y, wx, wy, e.pointerId, false);
  if (g) { gesture = g; return; }
  // Un tocco su un oggetto ridimensionabile lo seleziona (compare la maniglia); altrove deseleziona.
  app.sizeSel = hitResizable(x, y)?.key ?? null;
  gesture = { type: 'pan', id: e.pointerId, lx: x, ly: y };
}


// Gesto su un oggetto della scena: quello dell'esperimento (pointerDown), una maniglia di ridimensionamento
// o una maniglia dei parametri. Con la Pencil (pen = true) lo spazio vuoto non conta: lì si scrive.
function objectGesture(x, y, wx, wy, id, pen) {
  const custom = app.exp.pointerDown?.({ wx, wy, sx: x, sy: y, api, pen });
  if (custom && !(pen && custom.pan)) {
    stopSweep();
    return { type: 'custom', id, custom, lx: x, ly: y };
  }
  if (custom) return null;

  const sel = selectedResizable();
  if (sel) {
    const [hx, hy] = sizeHandlePos(sel);
    if (Math.hypot(hx - x, hy - y) < HIT_PX) {
      const [cx, cy] = cam.toScreen(sel.x, sel.y);
      app.activeHandle = 'size';
      return { type: 'size', id, key: sel.key, k0: sizeOf(sel.key), d0: Math.max(8, Math.hypot(x - cx, y - cy)) };
    }
  }

  const h = hitHandle(x, y);
  if (h) {
    stopSweep();
    app.activeHandle = h.id;
    return { type: 'drag', id, handle: h.id, sx: x, sy: y, moved: false };
  }
  return null;
}

canvas.addEventListener('pointermove', e => {
  if (palm.ignored.has(e.pointerId)) return;
  const [x, y] = pos(e);
  if (e.pointerType === 'touch' && touches.has(e.pointerId)) touches.set(e.pointerId, { x, y });

  if (!gesture) {
    if (e.pointerType === 'mouse') {
      const [wx, wy] = cam.toWorld(x, y);
      app.exp.pointerHover?.({ wx, wy, sx: x, sy: y, api });
      canvas.style.cursor = app.tool !== 'hand' ? 'crosshair'
        : (app.exp.cursorAt?.({ wx, wy, sx: x, sy: y, api }) ?? (hitHandle(x, y) ? 'grab' : 'default'));
    }
    return;
  }

  if (gesture.type === 'pinch') {
    if (touches.size < 2) return;
    const [p1, p2] = [...touches.values()];
    const cx = (p1.x + p2.x) / 2, cy = (p1.y + p2.y) / 2, d = Math.hypot(p1.x - p2.x, p1.y - p2.y);
    cam.panBy(cx - gesture.cx, cy - gesture.cy);
    if (gesture.d > 0) cam.zoomAt(cx, cy, d / gesture.d);
    Object.assign(gesture, { cx, cy, d });
    return;
  }
  if (e.pointerId !== gesture.id) return;
  const [wx, wy] = cam.toWorld(x, y);

  if (gesture.type === 'ink') {
    const evs = e.getCoalescedEvents?.() ?? [e];
    for (const ev of evs.length ? evs : [e]) {
      const [px, py] = cam.toWorld(...pos(ev));
      ink.add(px, py, pressureOf(ev));
    }
  } else if (gesture.type === 'erase') {
    erase(wx, wy);
  } else if (gesture.type === 'lasso') {
    lasso.add(wx, wy, 3 / cam.scale);
  } else if (gesture.type === 'lassoMove') {
    lasso.move(app.exp, wx - gesture.lx, wy - gesture.ly);
    if (gesture.total) { gesture.total[0] += wx - gesture.lx; gesture.total[1] += wy - gesture.ly; }
    gesture.lx = wx; gesture.ly = wy;
  } else if (gesture.type === 'lassoScale') {
    const [ax, ay] = cam.toScreen(gesture.ax, gesture.ay);
    const k = Math.max(0.1, Math.hypot(x - ax, y - ay) / gesture.d0);
    lasso.scale(app.exp, k / gesture.k, gesture.ax, gesture.ay);
    gesture.k = k;
  } else if (gesture.type === 'custom') {
    if (gesture.custom.pan) { cam.panBy(x - gesture.lx, y - gesture.ly); gesture.lx = x; gesture.ly = y; }
    gesture.custom.move?.({ wx, wy, sx: x, sy: y });
  } else if (gesture.type === 'size') {
    const r = resizables().find(o => o.key === gesture.key);
    if (r) {
      const [cx, cy] = cam.toScreen(r.x, r.y);
      const k = gesture.k0 * Math.hypot(x - cx, y - cy) / gesture.d0;
      app.sizes[gesture.key] = Math.round(Math.min(5, Math.max(0.3, k)) * 20) / 20;
    }
  } else if (gesture.type === 'drag') {
    if (!gesture.moved && Math.hypot(x - gesture.sx, y - gesture.sy) < 6) return;
    gesture.moved = true;
    app.exp.drag(gesture.handle, wx, wy, app.params);
    syncParams();
    resetSim();
  } else if (gesture.type === 'pan') {
    cam.panBy(x - gesture.lx, y - gesture.ly);
    gesture.lx = x; gesture.ly = y;
  }
});

function endPointer(e) {
  if (e.pointerType === 'pen') { palm.penDown = false; palm.penUpAt = performance.now(); }
  if (palm.ignored.delete(e.pointerId)) return;
  touches.delete(e.pointerId);
  if (!gesture) return;
  if (gesture.type === 'pinch') { if (touches.size < 2) gesture = null; return; }
  if (e.pointerId !== gesture.id) return;
  if (gesture.type === 'ink') { ink.end(); recordInk(); }
  if (gesture.type === 'erase') recordInk();
  if (gesture.type === 'lasso') lasso.finish(app.exp);
  if (gesture.type === 'lassoMove' || gesture.type === 'lassoScale') { lasso.save(app.exp); recordInk(); }
  if (gesture.type === 'size') store.set('sizes.' + app.exp.id, app.sizes);
  // Tocco senza trascinare su una maniglia che coincide con un oggetto: lo seleziona per ridimensionarlo.
  if (gesture.type === 'drag' && !gesture.moved) app.sizeSel = hitResizable(gesture.sx, gesture.sy)?.key ?? null;
  if (gesture.type === 'custom') {
    const [sx, sy] = pos(e), [wx, wy] = cam.toWorld(sx, sy);
    gesture.custom.up?.({ wx, wy, sx, sy, cancelled: e.type === 'pointercancel' });
  }
  app.activeHandle = null;
  gesture = null;
}
canvas.addEventListener('pointerup', endPointer);
canvas.addEventListener('pointercancel', endPointer);

// Rotella del mouse e trackpad (Mac e PC), come in GeoGebra o nelle mappe:
// rotella o scorrimento a due dita = zoom attorno al puntatore; pinch del trackpad = zoom (arriva con ctrlKey);
// Maiuscole + rotella = spostamento della vista.
canvas.addEventListener('wheel', e => {
  e.preventDefault();
  const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1;   // righe o pagine (Firefox) → pixel
  const dx = e.deltaX * unit, dy = e.deltaY * unit;
  const [x, y] = pos(e);
  if (e.shiftKey && !e.ctrlKey) { cam.panBy(-(dx || dy), 0); return; }
  const d = Math.max(-120, Math.min(120, dy));
  cam.zoomAt(x, y, Math.exp(-d * (e.ctrlKey ? 0.01 : 0.002)));
}, { passive: false });

// Pulsanti affidabili su iPad: Safari a volte non genera il "click" (per esempio se due tocchi sono
// ravvicinati li tratta come doppio tocco). Con dito e Pencil il pulsante scatta quindi al rilascio,
// se il contatto è iniziato e finito sullo stesso pulsante; il click nativo che eventualmente segue viene ignorato
// anche se nel frattempo il pulsante è stato ricreato (molti pannelli si ridisegnano al tocco).
const TAPPABLE = 'button, label.toggle';
let tapStart = null, tapFired = 0;
document.addEventListener('pointerdown', e => {
  tapStart = e.pointerType === 'mouse' ? null : e.target.closest?.(TAPPABLE) ?? null;
}, true);
document.addEventListener('pointerup', e => {
  const el = tapStart;
  tapStart = null;
  if (!el || e.pointerType === 'mouse' || el.disabled) return;
  if (document.elementFromPoint(e.clientX, e.clientY)?.closest(TAPPABLE) !== el) return;
  tapFired = performance.now();
  el.click();
}, true);
document.addEventListener('pointercancel', () => { tapStart = null; }, true);
document.addEventListener('click', e => {
  if (!e.isTrusted || !tapFired) return;
  // Il click nativo che segue un tocco già gestito va scartato ovunque cada: se il tocco ha aperto il menu,
  // quel click finirebbe sullo scrim appena comparso e lo richiuderebbe subito.
  if (performance.now() - tapFired < 800) { e.preventDefault(); e.stopPropagation(); }
  tapFired = 0;
}, true);

// Blocca lo zoom della pagina di Safari iOS (gestiamo noi il pinch sulla scena).
document.addEventListener('gesturestart', e => e.preventDefault());
// Niente ascoltatori di "dblclick": su iPad la loro sola presenza fa attivare a Safari un riconoscitore
// del doppio tocco che si trattiene il secondo tocco rapido (della Pencil o del dito). Lo zoom con doppio
// tocco è già disattivato da touch-action: none.
// I tocchi sulla scena li gestiamo noi con i pointer event: lo diciamo a Safari annullando il comportamento
// predefinito dei touch, così non prova a interpretarli come gesti (doppio tocco, selezione, lente).
for (const type of ['touchstart', 'touchend']) canvas.addEventListener(type, e => e.preventDefault(), { passive: false });

/* ---------------- Barra superiore e moviola ---------------- */

/* --- Pannello della penna: tipo di tratto e spessore (si apre toccando di nuovo la penna) --- */
const PEN = {
  pen: { label: 'Penna', min: 0.8, max: 10, presets: [1.6, 2.6, 4.5] },
  brush: { label: 'Pennello', min: 2, max: 28, presets: [3.5, 7, 14] },
};
const penPop = $('penPop'), penRange = $('penSizeRange'), penPreview = $('penPreview');

function syncPenPop() {
  const type = app.penType, cfg = PEN[type], size = app.penSizes[type];
  penPop.querySelectorAll('[data-type]').forEach(b => b.classList.toggle('on', b.dataset.type === type));
  const row = $('penPresets');
  row.innerHTML = '';
  for (const v of cfg.presets) {
    const b = document.createElement('button');
    b.className = Math.abs(v - size) < 0.05 ? 'on' : '';
    b.title = `${fmt(v, 1)} px`;
    b.innerHTML = `<span style="width:${Math.min(26, v * (type === 'brush' ? 1.4 : 2.4))}px;height:${Math.min(26, v * (type === 'brush' ? 1.4 : 2.4))}px"></span>`;
    b.onclick = () => setPenSize(v);
    row.appendChild(b);
  }
  penRange.min = cfg.min; penRange.max = cfg.max; penRange.value = size;
  $('penSizeLabel').textContent = `${fmt(size, 1)} px`;
  drawPenPreview();
  const pb = document.querySelector('#toolSeg [data-tool=pen]');
  pb.innerHTML = icons[type === 'brush' ? 'brush' : 'pen'];
  pb.title = `${cfg.label} (P; tocca di nuovo per tipo e spessore)`;
}

// Anteprima: una S scritta con pressione crescente e poi calante, con il tipo, lo spessore e il colore scelti.
function drawPenPreview() {
  const w = penPreview.clientWidth || 240, h = penPreview.clientHeight || 64, k = devicePixelRatio || 1;
  penPreview.width = Math.round(w * k); penPreview.height = Math.round(h * k);
  const c2 = penPreview.getContext('2d');
  c2.setTransform(k, 0, 0, k, 0, 0);
  c2.clearRect(0, 0, w, h);
  const pc = new Camera(); pc.setViewport(w, h); pc.scale = 1;
  const pts = [];
  for (let i = 0; i <= 60; i++) {
    const t = i / 60;
    pts.push([(t - 0.5) * (w - 40), Math.sin(t * Math.PI * 2) * (h / 2 - 16), 0.15 + 0.8 * Math.sin(t * Math.PI)]);
  }
  const demo = new Ink();
  demo.strokes = [{ c: app.inkColor, w: app.penSizes[app.penType], k: app.penType, pts }];
  demo.draw(c2, pc, colors);
}

function setPenSize(v) {
  app.penSizes[app.penType] = Math.round(v * 10) / 10;
  store.set('penSizes', app.penSizes);
  syncPenPop();
}

function togglePenPop(open = penPop.classList.contains('hidden')) {
  penPop.classList.toggle('hidden', !open);
  if (!open) return;
  const r = document.querySelector('#toolSeg [data-tool=pen]').getBoundingClientRect(), pw = penPop.offsetWidth || 270;
  penPop.style.left = Math.max(8, Math.min(innerWidth - pw - 8, r.left + r.width / 2 - pw / 2)) + 'px';
  penPop.style.top = r.bottom + 10 + 'px';
  syncPenPop();
}

penPop.querySelectorAll('[data-type]').forEach(b => b.onclick = () => { app.penType = b.dataset.type; store.set('penType', app.penType); syncPenPop(); });
penRange.oninput = () => setPenSize(parseFloat(penRange.value));
// Un tocco fuori dal pannello (e fuori dal pulsante della penna) lo chiude.
document.addEventListener('pointerdown', e => {
  if (!penPop.classList.contains('hidden') && !e.target.closest('#penPop, #toolSeg [data-tool=pen]')) togglePenPop(false);
}, true);

function setTool(t, startup = false) {
  // Un secondo tocco sulla penna apre il pannello di tipo e spessore.
  if (!startup && t === 'pen' && app.tool === 'pen') togglePenPop();
  else if (t !== 'pen') togglePenPop(false);
  // Un secondo tocco sulla gomma passa da "tratti interi" a "precisa" e viceversa.
  if (!startup && t === 'eraser' && app.tool === 'eraser') {
    app.eraserMode = app.eraserMode === 'part' ? 'stroke' : 'part';
    store.set('eraserMode', app.eraserMode);
  }
  if (t !== 'lasso') lasso.clear();
  const eb = document.querySelector('#toolSeg [data-tool=eraser]');
  eb.innerHTML = icons[app.eraserMode === 'part' ? 'eraserPart' : 'eraser'];
  eb.title = app.eraserMode === 'part' ? 'Gomma precisa: cancella solo la parte toccata (E; tocca di nuovo per i tratti interi)' : 'Gomma: cancella tratti interi (E; tocca di nuovo per la gomma precisa)';
  app.tool = t; store.set('tool', t);
  document.querySelectorAll('#toolSeg button').forEach(b => b.classList.toggle('on', b.dataset.tool === t));
}
function setInkColor(c) {
  app.inkColor = c; store.set('inkColor', c);
  document.querySelectorAll('#swatches button').forEach(b => b.classList.toggle('on', b.dataset.color === c));
  if (!penPop.classList.contains('hidden')) drawPenPreview();
  if (app.tool === 'eraser') setTool('pen');
}
const SPEEDS = [1, 0.5, 0.25, 2];
const SPEED_LABEL = { 1: '1×', 0.5: '½×', 0.25: '¼×', 2: '2×' };
function setSpeed(s) {
  app.speed = s;
  $('speedBtn').textContent = SPEED_LABEL[s];
  $('speedBtn').classList.toggle('on', s !== 1);
}

// Modalità Spiega: spariscono i pannelli, restano la scena, gli appunti e i valori fissati.
function setMode(m) {
  app.mode = m;
  store.set('mode', m);
  document.body.classList.toggle('lesson', m === 'lesson');
  document.querySelectorAll('#modeSeg button').forEach(b => b.classList.toggle('on', b.dataset.mode === m));
  insp.setLesson(m === 'lesson');
}
function toggleTheme() {
  const t = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  // Scena in dissolvenza e pannelli che cambiano colore insieme, senza sfarfallii.
  sceneFade(400);
  const root = document.documentElement;
  root.classList.add('theme-anim');
  root.style.background = '';   // il colore messo da index.html prima dello stile: da qui in poi decide il CSS
  clearTimeout(toggleTheme.t);
  toggleTheme.t = setTimeout(() => root.classList.remove('theme-anim'), 450);
  document.documentElement.dataset.theme = t;
  store.set('theme', t);
  colors = readColors();
  document.querySelector('meta[name=theme-color]').content = colors.bg;
  app.formulasDirty = true;   // le formule sono colorate con la palette del tema
  buildGraphTabs();
}

function scrubTo(idx) {
  stopSweep();
  app.running = false; updatePlayBtn();
  const last = app.history.length - 1;
  app.view = idx >= last ? (app.view == null ? null : last) : Math.max(0, idx);
}

function stepFrame() {
  stopSweep();
  app.running = false; updatePlayBtn();
  if (app.view != null && app.view < app.history.length - 1) { app.view++; return; }
  commitView();
  if (!isDone()) advance(1 / 30);
}

$('menuBtn').onclick = () => toggleDrawer(true);
$('crumbBtn').onclick = () => toggleDrawer(true);
$('scrim').onclick = () => toggleDrawer(false);
$('playBtn').onclick = togglePlay;
$('resetBtn').onclick = () => { stopSweep(); resetSim(); };
$('stepBtn').onclick = stepFrame;
$('fitBtn').onclick = fitView;
$('inspBtn').onclick = () => insp.toggle();
document.querySelectorAll('#modeSeg button').forEach(b => b.onclick = () => setMode(b.dataset.mode));
$('speedBtn').onclick = () => setSpeed(SPEEDS[(SPEEDS.indexOf(app.speed) + 1) % SPEEDS.length]);
$('undoBtn').onclick = undo;
$('redoBtn').onclick = redo;
$('clearBtn').onclick = () => { if (ink.strokes.length && confirm('Cancellare tutti gli appunti di questo esperimento?')) { lasso.clear(); ink.clear(); recordInk(); } };
$('selCopy').onclick = () => { lasso.copy(app.exp, 24 / cam.scale, -24 / cam.scale); recordInk(); };
$('selDelete').onclick = () => { lasso.remove(app.exp); recordInk(); };
tlRange.oninput = () => scrubTo(+tlRange.value);
$('tlStart').onclick = () => scrubTo(0);
$('tlEnd').onclick = () => { stopSweep(); app.view = null; app.viewCache = null; };
document.querySelectorAll('#toolSeg button').forEach(b => b.onclick = () => setTool(b.dataset.tool));
document.querySelectorAll('#swatches button').forEach(b => b.onclick = () => setInkColor(b.dataset.color));

addEventListener('keydown', e => {
  // Dopo aver usato la moviola il fuoco resta sul cursore: lo spazio deve comunque avviare e fermare.
  if (e.target.closest?.('input')) { if (e.key === ' ' && e.target.type === 'range') e.target.blur(); else return; }
  if (e.key === 'Escape') { toggleDrawer(false); togglePenPop(false); }
  else if (e.key === ' ') { e.preventDefault(); togglePlay(); }
  else if (e.key === 'r') { stopSweep(); resetSim(); }
  else if (e.key === 'h') setTool('hand');
  else if (e.key === 'p') setTool('pen');
  else if (e.key === 'e') setTool('eraser');
  else if (e.key === 'l') setTool('lasso');
  else if ((e.key === 'Backspace' || e.key === 'Delete') && lasso.active) { lasso.remove(app.exp); recordInk(); }
  else if (e.key === 'ArrowLeft') scrubTo((app.view ?? app.history.length - 1) - 1);
  else if (e.key === 'ArrowRight') stepFrame();
  else if (e.key.toLowerCase() === 'z' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); e.shiftKey ? redo() : undo(); }
  else if (e.key === 'y' && e.ctrlKey) { e.preventDefault(); redo(); }
  else if (e.key === '+' || e.key === '=') cam.zoomAt(cam.w / 2, cam.h / 2, 1.25);
  else if (e.key === '-') cam.zoomAt(cam.w / 2, cam.h / 2, 0.8);
  else if (e.key === '0') fitView();
  else app.exp.onKey?.(e, api);
});

addEventListener('resize', resize);
// Prima di chiudere o mandare in background l'app, salva subito gli appunti in sospeso.
addEventListener('pagehide', () => ink.flush());
document.addEventListener('visibilitychange', () => { if (document.hidden) ink.flush(); });
visualViewport?.addEventListener('resize', resize);
addEventListener('orientationchange', () => setTimeout(resize, 300));

// Diagnostica dei tocchi (aprire l'app con ?debug nell'indirizzo): mostra gli ultimi eventi ricevuti.
if (new URLSearchParams(location.search).has('debug')) {
  // Accesso allo stato dalla console del browser, per le prove.
  window.fisica = { app, cam, api, ink };
  const box = document.createElement('div');
  box.id = 'debug';
  document.body.appendChild(box);
  const log = [];
  const t0 = performance.now();
  const show = () => {
    const r = canvas.getBoundingClientRect();
    box.textContent = `vista ${innerWidth}×${innerHeight}  canvas ${Math.round(r.width)}×${Math.round(r.height)}  dpr ${devicePixelRatio}\n`
      + `strumento ${app.tool}  Pencil vista ${app.penSeen ? 'sì' : 'no'}  appoggiata ${palm.penDown ? 'SÌ' : 'no'}  dita ${touches.size}  gesto ${gesture?.type ?? '-'}`
      + (palm.why ? `  ignorato: ${palm.why}` : '') + '\n' + log.join('\n');
  };
  const push = line => { log.unshift(`${((performance.now() - t0) / 1000).toFixed(2)}s ${line}`); log.length = Math.min(log.length, 18); show(); };
  const name = t => String(t.id || t.className?.baseVal || t.className || t.tagName).slice(0, 16);
  for (const type of ['pointerdown', 'pointerup', 'pointercancel', 'click']) {
    addEventListener(type, e => {
      push(`${type.padEnd(13)} ${(e.pointerType || '-').padEnd(5)} #${e.pointerId ?? '-'} p=${(e.pressure ?? 0).toFixed(2)} (${Math.round(e.clientX)},${Math.round(e.clientY)}) ${name(e.target)}`);
    }, true);
  }
  // Eventi touch di basso livello: Safari li invia anche per la Pencil (touchType "stylus").
  // Se un tocco compare qui ma non come pointerdown, è Safari a non inoltrarlo.
  for (const type of ['touchstart', 'touchend', 'touchcancel']) {
    addEventListener(type, e => {
      const t = e.changedTouches[0];
      push(`${type.padEnd(13)} ${(t?.touchType || '-').padEnd(7)} n=${e.touches.length} (${Math.round(t?.clientX ?? 0)},${Math.round(t?.clientY ?? 0)}) ${name(e.target)}`);
    }, { capture: true, passive: true });
  }
  for (const type of ['gesturestart', 'gestureend']) addEventListener(type, () => push(type), true);
  show();
}

/* ---------------- Avvio ---------------- */

applyIcons();
setSpeed(1);
setMode(store.get('mode', 'explore'));
setTool(app.tool, true);
syncPenPop();
setInkColor(app.inkColor);
resize();
loadExperiment(store.get('lastExp', 'projectile'));
// KaTeX arriva con script "defer": se non era pronto al primo giro, ridisegna le formule.
addEventListener('load', () => { renderTheory(); app.formulasDirty = true; });
requestAnimationFrame(frame);
