// Navigatore rapido in 1 tocco dal titolo in alto (#crumbBtn) + menu rapido dei casi notevoli (preset) sulla scena.
// Permette di cambiare macroarea, scegliere un esperimento dell'area e lanciare i casi notevoli senza aprire il cassetto ☰.
import { icons } from './icons.js';

export class QuickNav {
  constructor({ areas, onPickExp, onPickPreset }) {
    this.areas = areas;
    this.onPickExp = onPickExp;
    this.onPickPreset = onPickPreset;
    this.curArea = null;
    this.curExp = null;
    this.viewArea = null;

    const el = this.el = document.createElement('div');
    el.id = 'crumbPop';
    el.className = 'nav-pop hidden';
    document.body.appendChild(el);

    document.addEventListener('pointerdown', e => {
      if (!this.open) return;
      if (e.target.closest('#crumbPop, #crumbBtn')) return;
      this.close();
    }, true);
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && this.open) this.close();
    });
  }

  get open() { return !this.el.classList.contains('hidden'); }

  setCurrent(area, exp) {
    this.curArea = area;
    this.curExp = exp;
    this.viewArea = area;
    if (this.open) this.render();
  }

  toggle(anchor) {
    if (this.open) { this.close(); return; }
    this.viewArea = this.curArea ?? this.areas[0];
    this.render();
    this.el.classList.remove('hidden');
    const r = anchor.getBoundingClientRect();
    const w = Math.min(440, innerWidth - 20);
    this.el.style.width = w + 'px';
    this.el.style.left = Math.max(10, Math.min(innerWidth - w - 10, r.left)) + 'px';
    this.el.style.top = r.bottom + 8 + 'px';
  }

  close() { this.el.classList.add('hidden'); }

  render() {
    const area = this.viewArea ?? this.areas[0];
    const el = this.el;
    el.innerHTML = '';

    // 1. Macroaree: pastiglie orizzontali in cima (1 tocco per sfogliare gli esperimenti dell'area)
    const areaRow = document.createElement('div');
    areaRow.className = 'nav-areas';
    for (const a of this.areas) {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = a.title;
      b.className = a === area ? 'on' : '';
      b.onclick = () => { this.viewArea = a; this.render(); };
      areaRow.appendChild(b);
    }
    el.appendChild(areaRow);

    // 2. Esperimenti della macroarea selezionata
    const expList = document.createElement('div');
    expList.className = 'nav-exps';
    for (const e of area.experiments) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = e === this.curExp ? 'on' : '';
      b.innerHTML = `<strong>${e.title}</strong><small>${e.subtitle}</small>`;
      b.onclick = () => { this.onPickExp(e.id); this.close(); };
      expList.appendChild(b);
    }
    el.appendChild(expList);

    // 3. Casi notevoli (preset) dell'esperimento aperto (se appartiene all'area selezionata)
    const exp = area.experiments.includes(this.curExp) ? this.curExp : null;
    if (exp?.presets?.length) {
      const sec = document.createElement('div');
      sec.className = 'nav-presets';
      sec.innerHTML = `<div class="nav-sub">Casi notevoli · ${exp.title}</div><div class="nav-chips"></div>`;
      const chips = sec.querySelector('.nav-chips');
      for (const pr of [...exp.presets, ...(exp.params?.length ? [null] : [])]) {
        const b = document.createElement('button');
        b.type = 'button';
        b.textContent = pr ? pr.label : 'Valori iniziali';
        if (!pr) b.className = 'reset';
        b.onclick = () => { this.onPickPreset(pr); this.close(); };
        chips.appendChild(b);
      }
      el.appendChild(sec);
    }
  }
}

// Aggiunge la pastiglia "Casi ▾" dentro #keyParams (a destra dei parametri chiave) per lanciare un preset in 1 tocco.
let closePresetPop = null;
document.addEventListener('pointerdown', e => {
  if (closePresetPop && !e.target.closest('.kp-preset-wrap')) closePresetPop();
}, true);
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && closePresetPop) closePresetPop();
});

export function appendPresetPill(container, exp, onPickPreset) {
  closePresetPop = null;
  if (!exp?.presets?.length) return;
  const wrap = document.createElement('div');
  wrap.className = 'kp-preset-wrap';

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'kp-pill kp-preset-btn';
  btn.title = 'Scegli un caso notevole (preset)';
  btn.innerHTML = `<span class="kp-name">Casi</span>${icons.chevron}`;

  const pop = document.createElement('div');
  pop.className = 'kp-preset-pop hidden';
  for (const pr of [...exp.presets, ...(exp.params?.length ? [null] : [])]) {
    const item = document.createElement('button');
    item.type = 'button';
    item.textContent = pr ? pr.label : 'Valori iniziali';
    if (!pr) item.className = 'reset';
    item.onclick = () => { onPickPreset(pr); pop.classList.add('hidden'); btn.classList.remove('open'); };
    pop.appendChild(item);
  }

  btn.onclick = () => {
    const open = pop.classList.contains('hidden');
    pop.classList.toggle('hidden', !open);
    btn.classList.toggle('open', open);
  };
  closePresetPop = () => { pop.classList.add('hidden'); btn.classList.remove('open'); };

  wrap.append(btn, pop);
  container.appendChild(wrap);
  container.classList.remove('hidden');
}
