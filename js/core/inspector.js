import { icons } from './icons.js';
import { store } from './store.js';

// Ispettore: colonna fissa sul lato destro con i controlli dell'esperimento in alto
// e, sotto, le schede Formule · Grafici · Teoria. Si chiude per lasciare tutta la tela alla scena.
// Su schermi stretti si sovrappone alla scena invece di toglierle spazio.

const TABS = [['formulas', 'Formule'], ['graphs', 'Grafici'], ['theory', 'Teoria']];
export const INSPECTOR_W = 340;
const NARROW = 760;

export class Inspector {
  constructor() {
    const el = this.el = document.createElement('aside');
    el.id = 'inspector';
    el.innerHTML = `
      <section class="insp-sec insp-params">
        <button class="insp-head" data-sec="params"><span class="title"></span>${icons.chevron}</button>
        <div class="insp-body"></div>
      </section>
      <section class="insp-sec insp-data">
        <div class="insp-tabs">${TABS.map(([k, t]) => `<button data-tab="${k}">${t}</button>`).join('')}</div>
        ${TABS.map(([k]) => `<div class="insp-body insp-page" data-page="${k}"></div>`).join('')}
      </section>`;
    document.body.appendChild(el);
    this.paramsBody = el.querySelector('.insp-params .insp-body');
    this.titleEl = el.querySelector('.insp-params .title');
    this.pages = Object.fromEntries(TABS.map(([k]) => [k, el.querySelector(`[data-page="${k}"]`)]));

    const saved = store.get('inspector', {});
    this.open = saved.open ?? innerWidth >= NARROW;
    this.tab = saved.tab ?? 'formulas';
    this.paramsCollapsed = !!saved.paramsCollapsed;
    this.available = TABS.map(([k]) => k);
    this.lesson = false;
    this.onChange = null;   // (larghezza prima, larghezza dopo): la scena si sposta per restare centrata

    el.querySelector('.insp-head').onclick = () => { this.paramsCollapsed = !this.paramsCollapsed; this.sync(); };
    el.querySelectorAll('.insp-tabs button').forEach(b => b.onclick = () => this.select(b.dataset.tab));
    this.sync();
  }

  get narrow() { return innerWidth < NARROW; }
  // Spazio che l'ispettore toglie alla scena, in px (0 se chiuso o sovrapposto).
  get reserved() { return this.shown && !this.narrow ? INSPECTOR_W : 0; }
  get shown() { return this.open && !this.lesson; }

  setTitle(t) { this.titleEl.textContent = t; }

  // Schede disponibili per l'esperimento corrente (per esempio la Lavagna non ha né formule né grafici).
  setTabs(list) {
    this.available = TABS.map(([k]) => k).filter(k => list.includes(k));
    if (!this.available.includes(this.tab)) this.tab = this.available[0];
    // Senza formule né grafici (la Lavagna) la teoria resta chiusa finché non la si apre.
    if (!this.available.some(k => k !== 'theory')) this.dataCollapsed = true;
    this.sync();
  }

  select(tab) {
    // Toccare la scheda già aperta richiude la sezione: più spazio per i controlli.
    if (this.tab === tab && this.open && !this.dataCollapsed) this.dataCollapsed = true;
    else { this.tab = tab; this.dataCollapsed = false; }
    this.setOpen(true);
  }

  // Scheda effettivamente visibile in questo momento (per non calcolare grafici e formule nascosti).
  showing(tab) { return this.shown && this.tab === tab && !this.dataCollapsed && this.available.includes(tab); }

  setOpen(v) { this.change(() => { this.open = v; }); }
  toggle() { this.setOpen(!this.open); }
  setLesson(v) { this.change(() => { this.lesson = v; }); }

  change(fn) {
    const before = this.reserved;
    fn();
    this.sync();
    if (before !== this.reserved) this.onChange?.(before, this.reserved);
  }

  sync() {
    const b = document.body, el = this.el;
    b.classList.toggle('insp-open', this.shown);
    b.classList.toggle('insp-overlay', this.shown && this.narrow);
    b.style.setProperty('--insp-w', this.reserved + 'px');
    el.classList.toggle('params-collapsed', this.paramsCollapsed);
    el.classList.toggle('data-collapsed', !!this.dataCollapsed || !this.available.length);
    el.classList.toggle('theory-on', this.tab === 'theory' && !this.dataCollapsed);
    el.querySelector('.insp-data').classList.toggle('hidden', !this.available.length);
    el.querySelectorAll('.insp-tabs button').forEach(t => {
      t.classList.toggle('on', t.dataset.tab === this.tab && !this.dataCollapsed);
      t.classList.toggle('hidden', !this.available.includes(t.dataset.tab));
    });
    for (const [k, p] of Object.entries(this.pages)) p.classList.toggle('hidden', k !== this.tab || !!this.dataCollapsed);
    document.getElementById('inspBtn')?.classList.toggle('on', this.shown);
    store.set('inspector', { open: this.open, tab: this.tab, paramsCollapsed: this.paramsCollapsed });
  }
}
