import { icons } from './icons.js';
import { store } from './store.js';

// Ispettore: riquadro in alto a destra, quasi invisibile sopra la scena (alla 3Blue1Brown).
// In cima le 2-3 formule chiave dell'esperimento, con un alone; sotto, sezioni a tendina
// (Parametri · Tutte le formule · Grafici · Teoria): se ne apre una alla volta.
// In modalità Spiega restano solo le formule chiave.

const SECS = [['params', 'Parametri'], ['formulas', 'Tutte le formule'], ['graphs', 'Grafici'], ['theory', 'Teoria']];
export const INSPECTOR_W = 320;
const MARGIN = 12;
const NARROW = 760;

export class Inspector {
  constructor() {
    const el = this.el = document.createElement('aside');
    el.id = 'inspector';
    el.innerHTML = `
      <div class="insp-key"><div class="formulas key"></div></div>
      <div class="insp-acc">${SECS.map(([k, t]) => `
        <section class="insp-sec" data-sec="${k}">
          <button class="insp-head"><span class="title">${t}</span>${icons.chevron}</button>
          <div class="insp-body"></div>
        </section>`).join('')}
      </div>`;
    document.body.appendChild(el);
    this.keyBody = el.querySelector('.insp-key .formulas');
    const body = k => el.querySelector(`[data-sec="${k}"] .insp-body`);
    this.paramsBody = body('params');
    this.titleEl = el.querySelector('[data-sec="params"] .title');
    this.pages = { formulas: body('formulas'), graphs: body('graphs'), theory: body('theory') };

    const saved = store.get('inspector', {});
    this.open = saved.open ?? true;
    this.tab = saved.sec ?? null;          // sezione aperta (una sola) o null
    this.available = SECS.map(([k]) => k);
    this.lesson = false;
    this.onChange = null;   // (larghezza prima, larghezza dopo): la scena si sposta per restare centrata
    this.onSection = null;  // una sezione si è aperta: chi la riempie la aggiorna subito

    el.querySelectorAll('.insp-sec').forEach(s => {
      s.querySelector('.insp-head').onclick = () => this.select(s.dataset.sec);
    });
    this.sync();
  }

  get narrow() { return innerWidth < NARROW; }
  // Spazio che l'ispettore toglie all'inquadratura della scena, in px (0 se chiuso o su schermi stretti).
  get reserved() { return this.open && !this.narrow ? INSPECTOR_W + MARGIN : 0; }
  get shown() { return this.open; }

  setTitle(t) { this.titleEl.textContent = t; }

  // Sezioni disponibili per l'esperimento corrente (la Lavagna non ha né formule né grafici).
  setTabs(list) {
    this.available = ['params', ...SECS.map(([k]) => k).filter(k => list.includes(k))];
    if (this.tab && !this.available.includes(this.tab)) this.tab = null;
    this.sync();
  }

  // Toccare la sezione aperta la richiude.
  select(sec) {
    this.tab = this.tab === sec ? null : sec;
    this.sync();
    if (this.tab) this.onSection?.(this.tab);
  }

  // Sezione effettivamente visibile in questo momento (per non calcolare grafici e formule nascosti).
  showing(sec) { return this.open && !this.lesson && this.tab === sec && this.available.includes(sec); }

  setOpen(v) { this.change(() => { this.open = v; }); }
  toggle() { this.setOpen(!this.open); }
  setLesson(v) { this.lesson = v; this.sync(); }

  change(fn) {
    const before = this.reserved;
    fn();
    this.sync();
    if (before !== this.reserved) this.onChange?.(before, this.reserved);
  }

  sync() {
    const b = document.body, el = this.el;
    b.classList.toggle('insp-open', this.open);
    b.classList.toggle('insp-overlay', this.open && this.narrow);
    b.style.setProperty('--insp-w', this.reserved + 'px');
    el.classList.toggle('lesson', this.lesson);
    el.classList.toggle('sec-open', !!this.tab && !this.lesson);
    el.classList.toggle('no-key', !this.keyBody.childElementCount);
    el.querySelectorAll('.insp-sec').forEach(s => {
      const k = s.dataset.sec;
      s.classList.toggle('hidden', !this.available.includes(k));
      s.classList.toggle('open', k === this.tab);
    });
    document.getElementById('inspBtn')?.classList.toggle('on', this.open);
    store.set('inspector', { open: this.open, sec: this.tab });
  }
}
