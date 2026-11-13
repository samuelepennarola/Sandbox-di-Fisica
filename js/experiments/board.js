import { store } from '../core/store.js';
import { el } from '../core/ui.js';
import { putBlob, getBlob, delBlob } from '../core/blobs.js';
import { SceneHistory } from '../core/history.js';

// Lavagna: foglio infinito (a quadretti o bianco) per scrivere con la Pencil.
// Si possono inserire istantanee fisse degli esperimenti, scelte da un elenco con anteprima, da annotare.
// Unità del mondo: 1 = 2 quadretti; allo zoom iniziale un quadretto misura circa 5 mm sullo schermo dell'iPad.

const Q = 0.5;            // lato del quadretto
const START_SCALE = 52;   // px per unità allo zoom iniziale (quadretto ≈ 26 px)
const SNAP_RATIO = 0.625;   // proporzioni delle istantanee (16:10)

const B = {
  bg: store.get('board.bg', 'grid'),
  items: store.get('board.items', []),   // [{ id, blob, x, y, w, h, title }] — (x, y) è l'angolo in basso a sinistra
  images: new Map(),                     // blob → { img, ready }
  api: null, picker: null,
};

const saveItems = () => { store.set('board.items', B.items); B.hist?.record(); };

function imageOf(blobId) {
  let e = B.images.get(blobId);
  if (e) return e;
  e = { img: new Image(), ready: false };
  B.images.set(blobId, e);
  e.img.onload = () => { e.ready = true; };
  getBlob(blobId).then(b => { if (b) e.img.src = URL.createObjectURL(b); }).catch(() => {});
  return e;
}

// Immagini che nessun oggetto usa più: non si cancellano subito, perché Annulla può riportarle sul foglio.
// Si eliminano dall'archivio alla prossima apertura della Lavagna, quando la cronologia riparte da zero.
function dropUnused(blobIds) {
  const orphans = new Set(store.get('board.orphans', []));
  for (const id of blobIds) orphans.add(id);
  store.set('board.orphans', [...orphans]);
}
function pruneOrphans() {
  const orphans = store.get('board.orphans', []);
  for (const id of orphans) if (!B.items.some(it => it.blob === id)) { delBlob(id).catch(() => {}); B.images.delete(id); }
  store.set('board.orphans', []);
}

function contentBox(api) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const it of B.items) { x0 = Math.min(x0, it.x); y0 = Math.min(y0, it.y); x1 = Math.max(x1, it.x + it.w); y1 = Math.max(y1, it.y + it.h); }
  for (const s of api.ink.strokes) for (const [x, y] of s.pts) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  return x0 === Infinity ? null : { xmin: x0, xmax: x1, ymin: y0, ymax: y1 };
}

/* ---------------- Inserimento di un esperimento ---------------- */

function openPicker(api) {
  if (!B.picker) {
    // Centrata nello spazio libero a sinistra dell'ispettore, che altrimenti ne coprirebbe i pulsanti.
    const insp = document.getElementById('inspector'), iw = insp && document.body.classList.contains('insp-open') && !document.body.classList.contains('insp-overlay') ? insp.offsetWidth : 0;
    const w = Math.min(780, innerWidth - iw - 24);
    B.picker = new api.Panel({ id: 'picker', title: 'Inserisci un esperimento', x: (innerWidth - iw - w) / 2, y: 76, width: w, closable: true });
    B.picker.el.querySelector('.panel-body').style.maxHeight = '74vh';
  }
  const body = B.picker.body;
  body.innerHTML = '<div class="hint">Viene inserita un\'istantanea dell\'esperimento con i parametri che hai impostato l\'ultima volta. Per cambiarla, prepara prima l\'esperimento e poi inseriscilo.</div>';
  for (const area of api.areas) {
    const exps = area.experiments.filter(e => e.id !== 'board');
    if (!exps.length) continue;
    body.appendChild(el('div', 'sub', area.title));
    const grid = el('div', 'cards');
    for (const exp of exps) {
      const card = el('button', 'card');
      const img = new Image();
      img.alt = exp.title;
      img.src = api.snapshot(exp, 320, 200).toDataURL('image/jpeg', 0.8);
      card.append(img, el('strong', '', exp.title), el('small', '', exp.subtitle));
      card.onclick = () => { insert(api, exp); B.picker.hide(); };
      grid.appendChild(card);
    }
    body.appendChild(grid);
  }
  B.picker.show();
}

function insert(api, exp) {
  const cam = api.cam, [cx, cy] = cam.toWorld(cam.w / 2, cam.h / 2);
  // L'istantanea è disegnata alla stessa dimensione con cui compare sul foglio: scritte e frecce restano leggibili.
  const W = Math.round(Math.min(720, Math.max(420, 0.45 * cam.w))), H = Math.round(W * SNAP_RATIO);
  const w = W / cam.scale, h = H / cam.scale;
  api.snapshot(exp, W, H).toBlob(async blob => {
    if (!blob) return;
    const id = 'img-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    try { await putBlob(id, blob); } catch { alert('Non è stato possibile salvare l\'immagine su questo dispositivo.'); return; }
    B.items.push({ id, blob: id, x: cx - w / 2, y: cy - h / 2, w, h, title: exp.title });
    saveItems();
  }, 'image/jpeg', 0.88);
}

/* ---------------- Esperimento ---------------- */

export default {
  id: 'board',
  title: 'Lavagna',
  subtitle: 'Foglio infinito per scrivere e annotare',
  panelTitle: 'Lavagna',
  noSim: true,
  params: [],
  graphs: [],

  mount(api) {
    B.api = api;
    pruneOrphans();
    // Annulla/ripeti anche per le istantanee: inserite, spostate, ingrandite, copiate o eliminate.
    B.hist ??= new SceneHistory(() => B.items, items => {
      B.items = items;
      store.set('board.items', items);
      api.lassoClear?.();
    }, () => B.api.recordChange());
  },
  get history() { return B.hist; },
  unmount() { B.picker?.hide(); },

  init: () => ({ t: 0 }),
  step() {},
  done: () => true,
  sample: s => ({ t: s.t }),
  formulas: () => [],
  view: () => ({ xmin: -10, xmax: 10, ymin: -6, ymax: 6 }),

  // Zoom iniziale fisso (quadretti di circa 5 mm), centrato sul contenuto se c'è.
  fit(cam, api) {
    const b = contentBox(api);
    // Area libera tra barra in alto, ispettore e barra a sinistra (cam.padFn), come negli esperimenti.
    const pad = cam.padFn?.() ?? { top: 70, right: 20, bottom: 20, left: 20 };
    const aw = cam.w - pad.left - pad.right;
    if (b && (b.xmax - b.xmin) * START_SCALE > aw * 0.9) { cam.fit(b); return; }
    cam.scale = START_SCALE;
    const sx = pad.left + aw / 2, sy = pad.top + (cam.h - pad.top - pad.bottom) / 2;
    cam.cx = (b ? (b.xmin + b.xmax) / 2 : 0) - (sx - cam.w / 2) / cam.scale;
    cam.cy = (b ? (b.ymin + b.ymax) / 2 : 0) + (sy - cam.h / 2) / cam.scale;
  },

  drawBackground(ctx, cam, c) {
    ctx.fillStyle = c.paper;
    ctx.fillRect(0, 0, cam.w, cam.h);
    if (B.bg !== 'grid') return;
    let step = Q;
    while (step * cam.scale < 9) step *= 2;   // da lontano i quadretti si diradano invece di diventare una macchia
    const { x0, y0, x1, y1 } = cam.bounds();
    ctx.save();
    ctx.strokeStyle = c.paperLine; ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = Math.ceil(x0 / step) * step; x <= x1; x += step) { const [a] = cam.toScreen(x, 0); ctx.moveTo(Math.round(a) + .5, 0); ctx.lineTo(Math.round(a) + .5, cam.h); }
    for (let y = Math.ceil(y0 / step) * step; y <= y1; y += step) { const [, b] = cam.toScreen(0, y); ctx.moveTo(0, Math.round(b) + .5); ctx.lineTo(cam.w, Math.round(b) + .5); }
    ctx.stroke();
    ctx.restore();
  },

  draw(P) {
    const ctx = P.ctx, k = P.cam.scale;
    for (const it of B.items) {
      const [a, b] = P.S(it.x, it.y + it.h), W = it.w * k, H = it.h * k;
      if (a > P.cam.w || b > P.cam.h || a + W < 0 || b + H < 0) continue;
      const e = imageOf(it.blob);
      ctx.save();
      ctx.shadowColor = P.c.shadow || 'rgba(0,0,0,.2)'; ctx.shadowBlur = 12; ctx.shadowOffsetY = 3;
      ctx.fillStyle = P.c.bg; ctx.fillRect(a, b, W, H);
      ctx.shadowColor = 'transparent';
      if (e.ready) ctx.drawImage(e.img, a, b, W, H);
      ctx.strokeStyle = P.c.gridMajor; ctx.lineWidth = 1; ctx.strokeRect(a + .5, b + .5, W - 1, H - 1);
      ctx.restore();
      if (H > 60) P.textS(a + 6, b + H + 12, it.title, { color: 'muted', size: 12, weight: 600 });
    }
  },

  // Oggetti della lavagna per il lazo: le immagini si spostano, si ingrandiscono, si copiano, si eliminano.
  lasso: {
    items: () => B.items.map(it => ({ ref: it, bbox: [it.x, it.y, it.x + it.w, it.y + it.h] })),
    // Immagine sotto il punto (quella più in alto, cioè l'ultima inserita).
    hit: (x, y) => B.items.findLast(it => x >= it.x && x <= it.x + it.w && y >= it.y && y <= it.y + it.h) ?? null,
    transform(refs, f, k) {
      for (const it of refs) { const [x, y] = f(it.x, it.y); it.x = x; it.y = y; it.w *= k; it.h *= k; }
    },
    clone(refs, dx, dy) {
      const copies = refs.map(it => ({ ...it, id: it.id + '-' + Math.random().toString(36).slice(2, 6), x: it.x + dx, y: it.y + dy }));
      B.items.push(...copies);
      return copies;
    },
    remove(refs) {
      const gone = new Set(refs);
      B.items = B.items.filter(it => !gone.has(it));
      saveItems();
      dropUnused(refs.map(it => it.blob));
    },
    save: saveItems,
  },

  buildPanel(body, api) {
    body.innerHTML = '';
    body.appendChild(el('div', 'hint', 'La Pencil scrive, il dito sposta e fa zoom. Con il lazo (in alto) circondi tratti e immagini per spostarli, ingrandirli, copiarli o eliminarli.'));
    body.appendChild(api.control(
      { key: 'bg', type: 'select', label: 'Sfondo', options: [{ value: 'grid', label: 'Quadretti' }, { value: 'plain', label: 'Bianco' }] },
      () => B.bg, v => { B.bg = v; store.set('board.bg', v); }, 'board.bg'));
    const row = el('div', 'btn-row');
    const add = el('button', 'btn primary', 'Inserisci un esperimento…');
    add.onclick = () => openPicker(api);
    const fit = el('button', 'btn', 'Inquadra tutto');
    fit.onclick = () => api.fit();
    row.append(add, fit);
    body.appendChild(row);
    const clear = el('button', 'btn danger', 'Pulisci la lavagna');
    clear.onclick = () => {
      if (!api.ink.strokes.length && !B.items.length) return;
      if (!confirm('Cancellare tutto quello che c\'è sulla lavagna (scritte e immagini)?')) return;
      api.lassoClear();
      api.ink.clear();
      const blobs = B.items.map(it => it.blob);
      B.items = [];
      saveItems();
      dropUnused(blobs);
    };
    const r2 = el('div', 'btn-row');
    r2.appendChild(clear);
    body.appendChild(r2);
  },

  theory: `
<h2>Lavagna</h2>
<p>Un foglio senza bordi per spiegare, impostare esercizi e fare disegni veloci.</p>
<h3>Scrivere</h3>
<ul>
  <li>La <b>Pencil</b> scrive sempre; il <b>dito</b> sposta il foglio e, con due dita, fa zoom. Il palmo appoggiato non lascia segni.</li>
  <li>I colori e lo spessore seguono la penna scelta nella barra in alto; lo spessore resta legato al foglio, quindi ingrandendo puoi scrivere più fine.</li>
  <li><b>Gomma</b>: tocca il pulsante una volta per cancellare tratti interi, una seconda volta per la <i>gomma precisa</i>, che toglie solo la parte che tocchi.</li>
</ul>
<h3>Lazo</h3>
<p>Scegli il lazo nella barra in alto e circonda con la Pencil i tratti o le immagini. Poi:</p>
<ul>
  <li>trascina dentro il riquadro per <b>spostare</b>;</li>
  <li>trascina la maniglia quadrata in basso a destra per <b>ingrandire o rimpicciolire</b>;</li>
  <li>usa <b>Copia</b> ed <b>Elimina</b> nella barretta sopra la selezione.</li>
</ul>
<p>Il lazo funziona anche sugli appunti scritti sopra gli esperimenti.</p>
<h3>Esperimenti sulla lavagna</h3>
<p>Con <b>Inserisci un esperimento…</b> scegli dall'elenco, diviso per argomento, l'esperimento da annotare: ne viene inserita un'istantanea fissa con i parametri impostati l'ultima volta in quell'esperimento.</p>
`,
};
