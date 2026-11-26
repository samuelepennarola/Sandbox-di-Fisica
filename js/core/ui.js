import { fmt, decimalsOf } from './math.js';
import { icons } from './icons.js';
import { unitView, unitDec } from './units.js';

// Limiti "duri" per i valori digitati: si può uscire dall'intervallo dello slider,
// ma non dare valori senza senso (masse negative, g nulla…).
function hardLimits(def) {
  const lo = def.hardMin ?? (def.min > 0 ? def.min * 1e-3 : def.min < 0 ? -Infinity : 0);
  const hi = def.hardMax ?? Infinity;
  return [lo, hi];
}

export function parseNum(str) {
  const v = parseFloat(String(str).trim().replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(v) ? v : null;
}

// Riga parametro: etichetta, valore toccabile (si digita il valore esatto), slider, pulsante "anima".
// opts: { get(), set(v), animate?(), isAnimating?(), onUser?() }
export function paramControl(def, opts) {
  if (def.type === 'toggle') {
    const row = document.createElement('label');
    row.className = 'toggle';
    row.innerHTML = `<input type="checkbox"><span class="sw"></span><span>${def.label}</span>`;
    const input = row.querySelector('input');
    input.onchange = () => opts.set(input.checked);
    const sync = () => { input.checked = !!opts.get(); };
    sync();
    return { el: row, sync };
  }

  if (def.type === 'select') {
    const row = document.createElement('div');
    row.className = 'param';
    row.innerHTML = `<div class="param-head"><span class="param-label">${def.label}</span></div><div class="seg wide"></div>`;
    const seg = row.querySelector('.seg');
    for (const o of def.options) {
      const b = document.createElement('button');
      b.textContent = o.label; b.dataset.v = o.value;
      b.onclick = () => { opts.set(o.value); sync(); };
      seg.appendChild(b);
    }
    const sync = () => seg.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.v === String(opts.get())));
    sync();
    return { el: row, sync };
  }

  const row = document.createElement('div');
  row.className = 'param';
  row.innerHTML = `
    <div class="param-head">
      <span class="param-label">${def.label}</span>
      <span class="param-tools">
        <button class="param-value" title="Tocca per scrivere il valore"></button>
        ${opts.pin ? `<button class="param-pin" title="Mostra il valore sulla scena">${icons.pin}</button>` : ''}
        ${opts.animate ? `<button class="param-anim" title="Anima il parametro">${icons.play}</button>` : ''}
      </span>
    </div>
    <div class="slider">
      <input type="range" min="${def.min}" max="${def.max}" step="${def.step}">
      <div class="slider-ends"><span></span><span></span></div>
    </div>`;
  const range = row.querySelector('input[type=range]');
  const valBtn = row.querySelector('.param-value');
  const animBtn = row.querySelector('.param-anim');
  const pinBtn = row.querySelector('.param-pin');
  // Il cursore lavora nell'unità del parametro; il valore si mostra (e si digita) nell'unità scelta nel menu Unità.
  const U = unitView(def.unit), d = unitDec(decimalsOf(def.step), U.f);
  const show = v => `${fmt(v * U.f, d)}${U.name ? ' ' + U.name : ''}`;
  const ends = row.querySelectorAll('.slider-ends span');
  ends[0].textContent = fmt(def.min * U.f, d); ends[1].textContent = fmt(def.max * U.f, d);

  const sync = () => {
    const v = opts.get();
    range.value = v;
    // Tratto percorso del binario (css: .slider), da 0 a 1.
    range.style.setProperty('--f', Math.min(1, Math.max(0, (v - def.min) / ((def.max - def.min) || 1))).toFixed(4));
    if (!valBtn.querySelector('input')) valBtn.textContent = show(v);
    pinBtn?.classList.toggle('on', !!opts.pin.isOn());
    if (animBtn) {
      const on = !!opts.isAnimating?.();
      animBtn.classList.toggle('on', on);
      animBtn.innerHTML = on ? icons.stop : icons.play;
    }
  };

  range.oninput = () => { opts.onUser?.(); opts.set(parseFloat(range.value)); sync(); };
  touchSlider(row.querySelector('.slider'), range);
  animBtn && (animBtn.onclick = () => { opts.animate(); sync(); });
  pinBtn && (pinBtn.onclick = () => { opts.pin.toggle(); sync(); });

  valBtn.onclick = () => {
    if (valBtn.querySelector('input')) return;
    const inp = document.createElement('input');
    inp.type = 'text'; inp.inputMode = 'decimal'; inp.className = 'num-edit';
    inp.value = fmt(opts.get() * U.f, d);
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
        const [lo, hi] = hardLimits(def);
        opts.onUser?.();
        opts.set(Math.min(hi, Math.max(lo, v)));
      }
      sync();
    };
    inp.onkeydown = e => {
      if (e.key === 'Enter') commit(true);
      if (e.key === 'Escape') commit(false);
      e.stopPropagation();
    };
    inp.onblur = () => commit(true);
  };

  sync();
  return { el: row, sync };
}

// Slider affidabile al tocco (iPad): il cursore nativo di Safari si muove solo se il dito centra il pallino e
// contende i trascinamenti orizzontali allo scorrimento del pannello. Qui il tocco è gestito a mano su tutta
// l'area (zone): il valore salta dove si appoggia il dito e lo segue trascinando; uno scorrimento verticale
// (touch-action: pan-y) continua a far scorrere il pannello. Il valore passa per range.value e l'evento "input",
// così chi ascolta lo slider non cambia. inset: metà del pallino (px), dove inizia e finisce la corsa.
export function touchSlider(zone, range, { inset = 6 } = {}) {
  let id = null;
  const setFrom = x => {
    const r = range.getBoundingClientRect(), min = +range.min, max = +range.max, st = +range.step || 0;
    const f = Math.min(1, Math.max(0, (x - r.left - inset) / Math.max(1, r.width - 2 * inset)));
    let v = min + f * (max - min);
    if (st > 0) { v = min + Math.round((v - min) / st) * st; const d = (String(st).split('.')[1] || '').length; v = +v.toFixed(Math.min(10, d + 1)); }
    v = Math.min(max, Math.max(min, v));
    if (+range.value !== v) { range.value = v; range.dispatchEvent(new Event('input', { bubbles: true })); }
  };
  // Col dito si aspetta di capire il gesto: orizzontale = trascina, tocco fermo = salta lì, verticale = scorre
  // il pannello (il browser manda pointercancel) senza toccare il valore. Mouse e Pencil agiscono subito.
  let start = null, live = false;
  zone.addEventListener('pointerdown', e => {
    if (range.disabled || (e.pointerType === 'mouse' && e.button !== 0)) return;
    id = e.pointerId; start = [e.clientX, e.clientY]; live = e.pointerType !== 'touch';
    try { zone.setPointerCapture(id); } catch { /* Safari a volte rifiuta: si va avanti lo stesso */ }
    if (live) { range.classList.add('dragging'); setFrom(e.clientX); e.preventDefault(); }
  });
  zone.addEventListener('pointermove', e => {
    if (e.pointerId !== id) return;
    if (!live) {
      const dx = Math.abs(e.clientX - start[0]), dy = Math.abs(e.clientY - start[1]);
      if (dx < 5 && dy < 5) return;
      if (dy > dx) { try { zone.releasePointerCapture(e.pointerId); } catch {} id = null; return; }   // gesto verticale: è uno scorrimento
      live = true; range.classList.add('dragging');
    }
    setFrom(e.clientX); e.preventDefault();
  });
  const end = e => {
    if (e.pointerId !== id) return;
    if (!live && e.type === 'pointerup') setFrom(e.clientX);   // tocco senza trascinare: il valore va lì
    id = null; live = false; range.classList.remove('dragging');
    range.dispatchEvent(new Event('change', { bubbles: true }));
  };
  zone.addEventListener('pointerup', end);
  zone.addEventListener('pointercancel', end);
}

export function el(tag, cls, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  return e;
}
