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
import { AREAS, findExperiment } from './experiments/registry.js';

const H = 1 / 480;            // passo di integrazione predefinito (s); un esperimento può dichiarare il suo (exp.dt)
const SAMPLE_DT = 1 / 60;     // intervallo di campionamento per grafici e moviola (s)
const MAX_T = 300;            // oltre questo tempo la simulazione si ferma
const SWEEP_PERIOD = 6;       // durata di un'andata e ritorno dell'animazione di un parametro (s)
const INK_WIDTH_PX = 2.6;     // spessore base del tratto, in px allo zoom corrente
const HIT_PX = 26;            // tolleranza per afferrare una maniglia

const canvas = document.getElementById('stage');
const ctx = canvas.getContext('2d');
const cam = new Camera();
const ink = new Ink();
let colors = readColors();
const $ = id => document.getElementById(id);

const app = {
  exp: null, area: null, params: {}, sim: null,
  running: false, speed: 1, acc: 0,
  samples: [], history: [], lastSampleT: -Infinity,
  view: null, viewCache: null,      // moviola: indice del campione mostrato (null = istante corrente)
  sweep: null,                      // animazione di un parametro in corso
  syncs: [],                        // funzioni che riallineano i controlli ai valori
  tool: store.get('tool', 'hand'), inkColor: store.get('inkColor', 'ink'), penSeen: false,
  graphIdx: 0, formulasDirty: true, activeHandle: null,
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
};

function loadExperiment(id) {
  ink.end();
  stopSweep();
  app.exp?.unmount?.(api);
  const { exp, area } = findExperiment(id);
  app.exp = exp; app.area = area;
  app.params = { ...defaults(exp), ...store.get('params.' + exp.id, {}) };
  app.graphIdx = 0;
  store.set('lastExp', exp.id);
  $('crumbArea').textContent = area.title;
  $('crumbExp').textContent = exp.title;
  ink.load(exp.id);
  exp.mount?.(api);
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

function fitView() { cam.fit(app.exp.view(app.params, app.sim)); }

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
  drawSky(ctx, cam, colors);
  drawGrid(ctx, cam, colors);
  const P = new Painter(ctx, cam, colors);
  app.exp.draw(P, viewSim(), app.params, { active: app.activeHandle, api });
  drawParticles(P);
  ink.draw(ctx, cam, colors);
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

function hitHandle(sx, sy) {
  let best = null, bestD = Infinity;
  for (const h of app.exp.handles?.(viewSim(), app.params) ?? []) {
    const [a, b] = cam.toScreen(h.x, h.y);
    const d = Math.hypot(a - sx, b - sy);
    if (d < (h.r ?? HIT_PX) && d < bestD) { best = h; bestD = d; }
  }
  return best;
}

function inkTool(e) {
  if (e.pointerType === 'pen') return app.tool === 'eraser' ? 'eraser' : 'pen';
  if (e.pointerType === 'touch' && app.penSeen) return null; // con la Pencil il dito non scrive mai
  return app.tool === 'hand' ? null : app.tool;
}

function startPinch() {
  const [p1, p2] = [...touches.values()];
  gesture = { type: 'pinch', cx: (p1.x + p2.x) / 2, cy: (p1.y + p2.y) / 2, d: Math.hypot(p1.x - p2.x, p1.y - p2.y) };
}

canvas.addEventListener('pointerdown', e => {
  // Se l'evento arriva in ritardo (Pencil già sollevata), la cattura fallisce: il tocco va comunque gestito.
  try { canvas.setPointerCapture(e.pointerId); } catch { /* puntatore già rilasciato */ }
  // I touch della scena sono annullati, quindi un tocco qui non toglie più il fuoco a un campo in modifica:
  // confermiamo noi il valore che si stava scrivendo (come premere Invio) e chiudiamo la tastiera.
  document.querySelector('.num-edit')?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
  if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
  const [x, y] = pos(e);
  if (e.pointerType === 'pen') app.penSeen = true;

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
    ink.begin(wx, wy, pressureOf(e), INK_WIDTH_PX / cam.scale, app.inkColor);
    gesture = { type: 'ink', id: e.pointerId, pen: e.pointerType === 'pen' };
    return;
  }
  if (tool === 'eraser') {
    ink.eraseAt(wx, wy, 12 / cam.scale);
    gesture = { type: 'erase', id: e.pointerId };
    return;
  }

  const custom = app.exp.pointerDown?.({ wx, wy, sx: x, sy: y, api });
  if (custom) {
    stopSweep();
    gesture = { type: 'custom', id: e.pointerId, custom, lx: x, ly: y };
    return;
  }

  const h = hitHandle(x, y);
  if (h) {
    stopSweep();
    app.activeHandle = h.id;
    gesture = { type: 'drag', id: e.pointerId, handle: h.id };
  } else {
    gesture = { type: 'pan', id: e.pointerId, lx: x, ly: y };
  }
});

canvas.addEventListener('pointermove', e => {
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
    ink.eraseAt(wx, wy, 12 / cam.scale);
  } else if (gesture.type === 'custom') {
    if (gesture.custom.pan) { cam.panBy(x - gesture.lx, y - gesture.ly); gesture.lx = x; gesture.ly = y; }
    gesture.custom.move?.({ wx, wy, sx: x, sy: y });
  } else if (gesture.type === 'drag') {
    app.exp.drag(gesture.handle, wx, wy, app.params);
    syncParams();
    resetSim();
  } else if (gesture.type === 'pan') {
    cam.panBy(x - gesture.lx, y - gesture.ly);
    gesture.lx = x; gesture.ly = y;
  }
});

function endPointer(e) {
  touches.delete(e.pointerId);
  if (!gesture) return;
  if (gesture.type === 'pinch') { if (touches.size < 2) gesture = null; return; }
  if (e.pointerId !== gesture.id) return;
  if (gesture.type === 'ink') ink.end();
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

function setTool(t) {
  app.tool = t; store.set('tool', t);
  document.querySelectorAll('#toolSeg button').forEach(b => b.classList.toggle('on', b.dataset.tool === t));
}
function setInkColor(c) {
  app.inkColor = c; store.set('inkColor', c);
  document.querySelectorAll('#swatches button').forEach(b => b.classList.toggle('on', b.dataset.color === c));
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
$('undoBtn').onclick = () => ink.undo();
$('clearBtn').onclick = () => { if (ink.strokes.length && confirm('Cancellare tutti gli appunti di questo esperimento?')) ink.clear(); };
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
setTool(app.tool);
setInkColor(app.inkColor);
resize();
loadExperiment(store.get('lastExp', 'projectile'));
// KaTeX arriva con script "defer": se non era pronto al primo giro, ridisegna le formule.
addEventListener('load', () => { renderTheory(); app.formulasDirty = true; });
requestAnimationFrame(frame);
