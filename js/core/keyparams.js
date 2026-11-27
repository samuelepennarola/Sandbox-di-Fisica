// Parametri principali subito accessibili sulla scena (in alto a sinistra) + popover slider al volo
// riutilizzabile anche quando si tocca direttamente un oggetto sulla scena (piano, blocco, proiettile, pendolo...).
// Ogni pastiglia supporta:
//   - trascinamento orizzontale diretto (scrub) per variare il valore al volo;
//   - tocco / clic per aprire lo slider Manim con valore digitabile.
import { fmt, decimalsOf } from './math.js';
import { unitView, unitDec } from './units.js';
import { touchSlider, parseNum } from './ui.js';

// Etichetta breve per una pastiglia (es. "Inclinazione α" → "α", "Lunghezza del piano L" → "L", "Attrito statico μs" → "μs").
export function shortParamName(def) {
  if (def.short) return def.short;
  const m = /(?:^|\s)([A-Za-zα-ωΑ-Ω][₀-₉0-9a-z]?)\s*(?:\([^)]*\))?$/.exec(def.label.trim());
  if (m) return m[1];
  return def.label.split(/[:(]/)[0].trim().slice(0, 12);
}

// Sceglie i 2–3 parametri più importanti di un esperimento: quelli marcati `quick: true`,
// altrimenti i primi 3 parametri numerici visibili.
export function pickKeyParams(exp) {
  const nums = (exp?.params ?? []).filter(d => !d.hidden && !d.type);
  const flagged = nums.filter(d => d.quick);
  return (flagged.length ? flagged : nums.slice(0, 3)).slice(0, 4);
}

// Popover slider singolo riutilizzabile (sia dalle pastiglie in alto a sinistra sia dal clic sugli oggetti).
let activePop = null;

export function closeParamPopover() {
  if (!activePop) return;
  activePop.el.remove();
  activePop.anchor?.classList.remove('open');
  activePop = null;
}

document.addEventListener('pointerdown', e => {
  if (!activePop) return;
  if (e.target.closest('.kp-pop') || (activePop.anchor && activePop.anchor.contains(e.target))) return;
  closeParamPopover();
}, true);
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && activePop) closeParamPopover();
});

export function openParamPopover(anchor, def, get, set, { onAfter } = {}) {
  if (activePop && activePop.anchor === anchor && activePop.key === def.key) {
    closeParamPopover();
    return;
  }
  closeParamPopover();

  const U = unitView(def.unit), d = unitDec(decimalsOf(def.step), U.f);
  const show = v => `${fmt(v * U.f, d)}${U.name ? ' ' + U.name : ''}`;

  const pop = document.createElement('div');
  pop.className = 'kp-pop';
  pop.innerHTML = `
    <div class="kp-pop-head">
      <span class="kp-pop-title">${def.label}</span>
      <button type="button" class="param-value" title="Tocca per scrivere il valore"></button>
    </div>
    <div class="slider">
      <input type="range" min="${def.min}" max="${def.max}" step="${def.step}">
      <div class="slider-ends"><span>${fmt(def.min * U.f, d)}</span><span>${fmt(def.max * U.f, d)}</span></div>
    </div>`;
  document.body.appendChild(pop);

  const range = pop.querySelector('input[type=range]');
  const valBtn = pop.querySelector('.param-value');

  const sync = () => {
    const v = get();
    range.value = v;
    range.style.setProperty('--f', Math.min(1, Math.max(0, (v - def.min) / ((def.max - def.min) || 1))).toFixed(4));
    if (!valBtn.querySelector('input')) valBtn.textContent = show(v);
  };

  range.oninput = () => { set(parseFloat(range.value)); sync(); onAfter?.(); };
  touchSlider(pop.querySelector('.slider'), range);

  valBtn.onclick = () => {
    if (valBtn.querySelector('input')) return;
    const inp = document.createElement('input');
    inp.type = 'text'; inp.inputMode = 'decimal'; inp.className = 'num-edit';
    inp.value = fmt(get() * U.f, d);
    valBtn.textContent = '';
    valBtn.appendChild(inp);
    inp.focus(); inp.select();
    let done = false;
    const commit = ok => {
      if (done) return;
      done = true;
      const typed = parseNum(inp.value), v = typed == null ? null : typed / U.f;
      inp.remove();
      if (ok && v != null) {
        const lo = def.hardMin ?? (def.min > 0 ? def.min * 1e-3 : def.min < 0 ? -Infinity : 0);
        const hi = def.hardMax ?? Infinity;
        set(Math.min(hi, Math.max(lo, v)));
        onAfter?.();
      }
      sync();
    };
    inp.onkeydown = e => { if (e.key === 'Enter') commit(true); if (e.key === 'Escape') commit(false); e.stopPropagation(); };
    inp.onblur = () => commit(true);
  };

  sync();

  // Posiziona vicino al pulsante che l'ha aperto, sempre dentro lo schermo.
  const r = anchor.getBoundingClientRect();
  const pw = 256, ph = pop.offsetHeight || 102;
  let left = Math.max(10, Math.min(innerWidth - pw - 10, r.left + r.width / 2 - pw / 2));
  let top = r.bottom + 8;
  if (top + ph > innerHeight - 14) top = Math.max(64, r.top - ph - 8);
  pop.style.left = left + 'px';
  pop.style.top = top + 'px';

  anchor.classList.add('open');
  activePop = { el: pop, anchor, key: def.key, sync };
}

// Costruisce la fila dei parametri chiave in alto a sinistra sulla scena.
export function buildKeyParams(el, defs, get, set, { onAfter } = {}) {
  el.innerHTML = '';
  closeParamPopover();
  const syncs = [];

  for (const def of defs) {
    const U = unitView(def.unit), d = unitDec(decimalsOf(def.step), U.f);
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'kp-pill';
    btn.title = `${def.label} — tocca per lo slider o trascina orizzontalmente`;
    btn.innerHTML = `<span class="kp-name">${shortParamName(def)}</span><strong class="kp-val"></strong>`;
    const valEl = btn.querySelector('.kp-val');

    const sync = () => {
      const v = get(def);
      valEl.textContent = `${fmt(v * U.f, d)}${U.name ? ' ' + U.name : ''}`;
      if (activePop?.key === def.key) activePop.sync();
    };

    // Gesto combinato: trascinamento orizzontale = varia il valore al volo; tocco fermo = apre lo slider popover.
    let drag = null;
    btn.addEventListener('pointerdown', e => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      drag = { id: e.pointerId, x0: e.clientX, v0: get(def), moved: false };
      try { btn.setPointerCapture(e.pointerId); } catch {}
    });
    btn.addEventListener('pointermove', e => {
      if (!drag || e.pointerId !== drag.id) return;
      const dx = e.clientX - drag.x0;
      if (!drag.moved && Math.abs(dx) < 7) return;
      drag.moved = true;
      btn.classList.add('scrubbing');
      const span = def.max - def.min;
      const raw = drag.v0 + (dx / 180) * span;
      const st = def.step || 0;
      let v = st > 0 ? def.min + Math.round((raw - def.min) / st) * st : raw;
      v = Math.min(def.max, Math.max(def.min, +v.toFixed(6)));
      if (v !== get(def)) { set(def, v); sync(); onAfter?.(); }
    });
    const endDrag = e => {
      if (!drag || e.pointerId !== drag.id) return;
      const wasMoved = drag.moved;
      drag = null;
      btn.classList.remove('scrubbing');
      if (!wasMoved && e.type === 'pointerup') {
        openParamPopover(btn, def, () => get(def), v => { set(def, v); sync(); }, { onAfter });
      }
    };
    btn.addEventListener('pointerup', endDrag);
    btn.addEventListener('pointercancel', endDrag);

    sync();
    syncs.push(sync);
    el.appendChild(btn);
  }

  el.classList.toggle('hidden', !defs.length);
  return syncs;
}
