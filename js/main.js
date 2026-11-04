import { Camera } from './core/camera.js';
import { Painter, readColors, drawGrid } from './core/render.js';
import { Ink } from './core/ink.js';
import { Panel } from './core/panels.js';
import { drawPlot } from './core/plot.js';
import { icons, applyIcons } from './core/icons.js';
import { store } from './core/store.js';
import { fmt } from './core/math.js';
import { paramControl } from './core/ui.js';
import { look, updateLook, drawSky, drawParticles } from './core/look.js';
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

const paramsPanel = new Panel({ id: 'params', title: 'Parametri', x: 12, y: 72, width: 268 });
const graphPanel = new Panel({ id: 'graph', title: 'Grafici', x: innerWidth - 362, y: 72, width: 350 });
const formulaPanel = new Panel({ id: 'formulas', title: 'Formule', x: innerWidth - 362, y: 372, width: 350 });
const theoryPanel = new Panel({ id: 'theory', title: 'Teoria', x: Math.max(12, innerWidth / 2 - 300), y: 80, width: Math.min(600, innerWidth - 24), closable: true, hidden: true });

graphPanel.body.innerHTML = '<div class="tabs"></div><canvas class="plot"></canvas><div class="legend"></div>';
const plotCanvas = graphPanel.body.querySelector('.plot');
formulaPanel.body.innerHTML = '<div class="formulas"></div>';
theoryPanel.body.innerHTML = '<div class="theory"></div>';
theoryPanel.el.querySelector('.panel-body').style.maxHeight = '72vh';

// Controllo di un parametro collegato al motore (valore digitabile + animazione).
function control(def, get, set, key = def.key) {
  const c = paramControl(def, {
    get, set,
    onUser: () => { if (app.sweep?.key === key) stopSweep(); },
    animate: def.type ? null : () => toggleSweep({ key, def, get, set }),
    isAnimating: () => app.sweep?.key === key,
  });
  app.syncs.push(c.sync);
  return c.el;
}

function buildParams() {
  const { exp } = app;
  const body = paramsPanel.body;
  body.innerHTML = '';
  app.syncs = [];
  paramsPanel.setTitle(exp.panelTitle ?? 'Parametri');
  if (exp.buildPanel) { exp.buildPanel(body, api); return; }

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
  const tabs = graphPanel.body.querySelector('.tabs');
  tabs.innerHTML = '';
  list.forEach((g, i) => {
    const b = document.createElement('button');
    b.textContent = g.title;
    b.className = i === app.graphIdx ? 'on' : '';
    b.onclick = () => { app.graphIdx = i; buildGraphTabs(); };
    tabs.appendChild(b);
  });
  const g = list[app.graphIdx];
  graphPanel.body.querySelector('.legend').innerHTML = g
    ? g.series.map(s => `<span style="--lc:${colors[s.color] || s.color}">${s.label}</span>`).join('')
    : '';
}

function renderFormulas() {
  const out = app.exp.formulas(viewSim(), app.params);
  const box = formulaPanel.body.firstChild;
  if (typeof out === 'string') { box.innerHTML = out; return; }
  const k = window.katex;
  box.innerHTML = out.map(f => {
    if (f.h) return `<div class="fh">${f.h}</div>`;
    if (f.html) return f.html;
    const html = k ? k.renderToString(f.tex, { throwOnError: false }) : f.tex;
    return `<div class="f ${f.cls || ''}">${html}</div>`;
  }).join('');
}

function renderTheory() {
  const el = theoryPanel.body.firstChild;
  el.innerHTML = app.exp.theory;
  theoryPanel.setTitle('Teoria · ' + app.exp.title);
  window.renderMathInElement?.(el, {
    delimiters: [{ left: '$$', right: '$$', display: true }, { left: '$', right: '$', display: false }],
    throwOnError: false,
  });
}

/* ---------------- Cassetto esperimenti ---------------- */

function buildDrawer() {
  const dr = $('drawer');
  dr.innerHTML = '<h1>Sandbox di Fisica</h1>';
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
  drawSky(c2, cm, colors);
  drawGrid(c2, cm, colors);
  const sizes = store.get('sizes.' + exp.id, {});
  const P = new Painter(c2, cm, colors);
  // Nelle istantanee niente maniglie né vettori (frecce con le loro etichette): i vettori li disegnano i ragazzi.
  P.handle = P.sizeHandle = P.arrow = () => {};
  exp.draw(P, sim, params, { active: null, api: { ...api, running: false }, size: key => sizes[key] ?? 1 });
  return cv;
}

function loadExperiment(id) {
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
  // La Lavagna non ha simulazione: niente comandi di play, moviola, grafici e formule.
  document.body.classList.toggle('no-sim', !!exp.noSim);
  for (const p of [graphPanel, formulaPanel]) exp.noSim ? p.hide() : p.show();
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
  else { drawSky(ctx, cam, colors); drawGrid(ctx, cam, colors); }
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

let lastTs = 0, lastFormulaTs = 0, lastViewShown = null;
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
  if (!graphPanel.collapsed && g) drawPlot(plotCanvas, app.samples, g, colors, app.view);
  if (app.formulasDirty && ts - lastFormulaTs > 120 && !formulaPanel.collapsed) {
    renderFormulas(); lastFormulaTs = ts; app.formulasDirty = false;
  }
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
const palm = { penDown: false, penUpAt: -Infinity, ignored: new Set() };

// La Pencil è arrivata mentre un tocco del dito era in corso: era il polso. Annulla quello che ha fatto.
function revertTouchGesture() {
  const g = gesture;
  if (performance.now() - g.t0 < PALM_REVERT_MS) {
    Object.assign(cam, g.cam0);
    if (g.type === 'lassoMove' && g.total) lasso.move(app.exp, -g.total[0], -g.total[1]);
    if (g.type === 'lassoScale' && g.k !== 1) lasso.scale(app.exp, 1 / g.k, g.ax, g.ay);
  }
  if (g.type === 'ink') ink.cancel();
  g.custom?.cancel?.();
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
    Object.assign(gesture, { touch: true, t0: prev?.t0 ?? performance.now(), cam0: prev?.cam0 ?? { cx: cam.cx, cy: cam.cy, scale: cam.scale } });
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
    palm.penDown = true;
    if (gesture?.touch) revertTouchGesture();
    for (const id of touches.keys()) palm.ignored.add(id);
    touches.clear();
  }
  if (e.pointerType === 'touch' && app.penSeen) {
    const recent = performance.now() - palm.penUpAt < PALM_AFTER_PEN_MS;
    const big = Math.max(e.width || 0, e.height || 0) > PALM_SIZE_PX;
    if (palm.penDown || recent || big) { palm.ignored.add(e.pointerId); return; }
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

  const tool = inkTool(e);
  const [wx, wy] = cam.toWorld(x, y);
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

  const custom = app.exp.pointerDown?.({ wx, wy, sx: x, sy: y, api });
  if (custom) {
    stopSweep();
    gesture = { type: 'custom', id: e.pointerId, custom, lx: x, ly: y };
    return;
  }

  const sel = selectedResizable();
  if (sel) {
    const [hx, hy] = sizeHandlePos(sel);
    if (Math.hypot(hx - x, hy - y) < HIT_PX) {
      const [cx, cy] = cam.toScreen(sel.x, sel.y);
      app.activeHandle = 'size';
      gesture = { type: 'size', id: e.pointerId, key: sel.key, k0: sizeOf(sel.key), d0: Math.max(8, Math.hypot(x - cx, y - cy)) };
      return;
    }
  }

  const h = hitHandle(x, y);
  if (h) {
    stopSweep();
    app.activeHandle = h.id;
    gesture = { type: 'drag', id: e.pointerId, handle: h.id, sx: x, sy: y, moved: false };
    return;
  }
  // Un tocco su un oggetto ridimensionabile lo seleziona (compare la maniglia); altrove deseleziona.
  app.sizeSel = hitResizable(x, y)?.key ?? null;
  gesture = { type: 'pan', id: e.pointerId, lx: x, ly: y };
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
  if (gesture.type === 'ink') ink.end();
  if (gesture.type === 'lasso') lasso.finish(app.exp);
  if (gesture.type === 'lassoMove' || gesture.type === 'lassoScale') lasso.save(app.exp);
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

canvas.addEventListener('wheel', e => {
  e.preventDefault();
  if (e.ctrlKey || !e.deltaX) cam.zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015)));
  else cam.panBy(-e.deltaX, -e.deltaY);
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
  if (performance.now() - tapFired < 800 && e.target.closest?.(TAPPABLE)) { e.preventDefault(); e.stopPropagation(); }
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
function setSpeed(s) {
  app.speed = s;
  document.querySelectorAll('#speedSeg button').forEach(b => b.classList.toggle('on', +b.dataset.speed === s));
}
function toggleTheme() {
  const t = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = t;
  store.set('theme', t);
  colors = readColors();
  document.querySelector('meta[name=theme-color]').content = colors.bg;
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
$('scrim').onclick = () => toggleDrawer(false);
$('playBtn').onclick = togglePlay;
$('resetBtn').onclick = () => { stopSweep(); resetSim(); };
$('stepBtn').onclick = stepFrame;
$('fitBtn').onclick = fitView;
$('themeBtn').onclick = toggleTheme;
$('theoryBtn').onclick = () => theoryPanel.toggle();
$('undoBtn').onclick = () => { lasso.clear(); ink.undo(); };
$('clearBtn').onclick = () => { if (ink.strokes.length && confirm('Cancellare tutti gli appunti di questo esperimento?')) { lasso.clear(); ink.clear(); } };
$('selCopy').onclick = () => lasso.copy(app.exp, 24 / cam.scale, -24 / cam.scale);
$('selDelete').onclick = () => lasso.remove(app.exp);
tlRange.oninput = () => scrubTo(+tlRange.value);
$('tlStart').onclick = () => scrubTo(0);
$('tlEnd').onclick = () => { stopSweep(); app.view = null; app.viewCache = null; };
document.querySelectorAll('#toolSeg button').forEach(b => b.onclick = () => setTool(b.dataset.tool));
document.querySelectorAll('#swatches button').forEach(b => b.onclick = () => setInkColor(b.dataset.color));
document.querySelectorAll('#speedSeg button').forEach(b => b.onclick = () => setSpeed(+b.dataset.speed));

addEventListener('keydown', e => {
  if (e.target.closest?.('input')) return;
  if (e.key === ' ') { e.preventDefault(); togglePlay(); }
  else if (e.key === 'r') { stopSweep(); resetSim(); }
  else if (e.key === 'h') setTool('hand');
  else if (e.key === 'p') setTool('pen');
  else if (e.key === 'e') setTool('eraser');
  else if (e.key === 'l') setTool('lasso');
  else if ((e.key === 'Backspace' || e.key === 'Delete') && lasso.active) lasso.remove(app.exp);
  else if (e.key === 'ArrowLeft') scrubTo((app.view ?? app.history.length - 1) - 1);
  else if (e.key === 'ArrowRight') stepFrame();
  else if (e.key === 'z' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); ink.undo(); }
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
    box.textContent = `vista ${innerWidth}×${innerHeight}  canvas ${Math.round(r.width)}×${Math.round(r.height)}  dpr ${devicePixelRatio}\n` + log.join('\n');
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
setTool(app.tool, true);
syncPenPop();
setInkColor(app.inkColor);
resize();
loadExperiment(store.get('lastExp', 'projectile'));
// KaTeX arriva con script "defer": se non era pronto al primo giro, ridisegna le formule.
addEventListener('load', () => { renderTheory(); app.formulasDirty = true; });
requestAnimationFrame(frame);
