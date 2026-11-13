import { fmt, decimalsOf } from './math.js';
import { icons } from './icons.js';

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
    <input type="range" min="${def.min}" max="${def.max}" step="${def.step}">`;
  const range = row.querySelector('input[type=range]');
  const valBtn = row.querySelector('.param-value');
  const animBtn = row.querySelector('.param-anim');
  const pinBtn = row.querySelector('.param-pin');
  const d = decimalsOf(def.step);
  const show = v => `${fmt(v, d)}${def.unit ? ' ' + def.unit : ''}`;

  const sync = () => {
    const v = opts.get();
    range.value = v;
    if (!valBtn.querySelector('input')) valBtn.textContent = show(v);
    pinBtn?.classList.toggle('on', !!opts.pin.isOn());
    if (animBtn) {
      const on = !!opts.isAnimating?.();
      animBtn.classList.toggle('on', on);
      animBtn.innerHTML = on ? icons.stop : icons.play;
    }
  };

  range.oninput = () => { opts.onUser?.(); opts.set(parseFloat(range.value)); sync(); };
  animBtn && (animBtn.onclick = () => { opts.animate(); sync(); });
  pinBtn && (pinBtn.onclick = () => { opts.pin.toggle(); sync(); });

  valBtn.onclick = () => {
    if (valBtn.querySelector('input')) return;
    const inp = document.createElement('input');
    inp.type = 'text'; inp.inputMode = 'decimal'; inp.className = 'num-edit';
    inp.value = fmt(opts.get(), d);
    valBtn.textContent = '';
    valBtn.appendChild(inp);
    inp.focus(); inp.select();
    let done = false;
    const commit = ok => {
      if (done) return;
      done = true;
      const v = parseNum(inp.value);
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

export function el(tag, cls, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  return e;
}
