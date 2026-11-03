import { icons } from './icons.js';
import { store } from './store.js';

const all = new Set();

// Pannello flottante: trascinabile dall'intestazione, richiudibile, posizione ricordata.
export class Panel {
  constructor({ id, title, x, y, width, closable = false, hidden = false }) {
    this.id = id;
    const el = this.el = document.createElement('section');
    el.className = 'panel';
    el.style.width = width + 'px';
    el.innerHTML = `
      <div class="panel-head">
        <span class="title"></span>
        <button class="collapse" title="Riduci">${icons.chevron}</button>
        ${closable ? `<button class="close" title="Chiudi">${icons.close}</button>` : ''}
      </div>
      <div class="panel-body"></div>`;
    this.titleEl = el.querySelector('.title');
    this.body = el.querySelector('.panel-body');
    this.setTitle(title);
    document.getElementById('panels').appendChild(el);

    const saved = store.get('panel.' + id, null);
    // Finché l'utente non lo sposta, un pannello nato a destra resta ancorato al bordo destro.
    this.rightGap = saved?.x == null && x > innerWidth / 2 ? innerWidth - x : null;
    this.setPos(saved?.x ?? x, saved?.y ?? y);
    if (saved?.collapsed) el.classList.add('collapsed');
    if (hidden) el.classList.add('hidden');

    el.querySelector('.collapse').onclick = () => { el.classList.toggle('collapsed'); this.persist(); this.onToggle?.(); };
    el.querySelector('.close')?.addEventListener('click', () => this.hide());
    this.enableDrag(el.querySelector('.panel-head'));
    all.add(this);
  }

  setTitle(t) { this.titleEl.textContent = t; }
  get collapsed() { return this.el.classList.contains('collapsed'); }
  get visible() { return !this.el.classList.contains('hidden'); }
  show() { this.el.classList.remove('hidden'); this.clamp(); }
  hide() { this.el.classList.add('hidden'); }
  toggle() { this.visible ? this.hide() : this.show(); }

  setPos(x, y) { this.x = x; this.y = y; this.clamp(); }

  clamp() {
    const w = this.el.offsetWidth || parseFloat(this.el.style.width) || 300;
    if (this.rightGap != null) this.x = innerWidth - this.rightGap;
    this.x = Math.min(Math.max(this.x, 4 - w + 80), innerWidth - 80);
    this.y = Math.min(Math.max(this.y, 4), innerHeight - 44);
    this.el.style.left = this.x + 'px';
    this.el.style.top = this.y + 'px';
    // Lascia libero il fondo dello schermo per la moviola.
    this.el.style.maxHeight = Math.max(160, innerHeight - this.y - 76) + 'px';
  }

  persist() { store.set('panel.' + this.id, { x: this.x, y: this.y, collapsed: this.collapsed }); }

  enableDrag(head) {
    let start = null;
    head.addEventListener('pointerdown', e => {
      if (e.target.closest('button')) return;
      start = { px: e.clientX, py: e.clientY, x: this.x, y: this.y, id: e.pointerId };
      this.rightGap = null;
      try { head.setPointerCapture(e.pointerId); } catch { /* puntatore già rilasciato */ }
      this.el.style.zIndex = 11;
    });
    head.addEventListener('pointermove', e => {
      if (!start || e.pointerId !== start.id) return;
      this.setPos(start.x + e.clientX - start.px, start.y + e.clientY - start.py);
    });
    const end = e => {
      if (!start || e.pointerId !== start.id) return;
      start = null; this.el.style.zIndex = ''; this.persist();
    };
    head.addEventListener('pointerup', end);
    head.addEventListener('pointercancel', end);
  }

  static clampAll() { all.forEach(p => p.clamp()); }
}
