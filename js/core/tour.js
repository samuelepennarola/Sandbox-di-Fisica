import { icons } from './icons.js';
import { store } from './store.js';

// Passi pratici del mini-tour interattivo: si completano solo con azioni reali dell'utente.
const STEPS = [
  {
    key: 'param',
    title: 'Modifica un parametro dal vivo',
    desc: 'Scorri col dito una pastiglia in alto a sinistra o trascina una maniglia sulla scena: vedrai il simbolo illuminarsi nelle formule.',
  },
  {
    key: 'time',
    title: 'Avvia e riavvolgi il tempo',
    desc: 'Premi ▶ Play e poi trascina il cursore della moviola in basso per tornare indietro nel tempo.',
    hint: 'Ora prova a trascinare la moviola in basso!',
  },
  {
    key: 'scene',
    title: 'Forze, 3D o Apple Pencil',
    desc: 'Tocca un corpo sulla scena per il diagramma delle forze, ruota uno spazio 3D o scrivi un appunto con Pencil / Penna.',
  },
];

const GUIDE_ITEMS = [
  ['Apple Pencil e dito:', 'Col dito sposti, pizzichi per lo zoom o ruoti il 3D; l’Apple Pencil scrive subito (e con Mano sposta gli oggetti).'],
  ['Penna, Gomma e Lazo:', 'Tocca due volte Penna per spessore/pennello, due volte Gomma per la gomma precisa; usa Lazo per spostare o scalare gli appunti.'],
  ['Corpi e Puntine:', 'Tocca un corpo per vedere forze, velocità e scia; usa la puntina nei Parametri per fissare un valore sulla scena.'],
  ['Vista 3D e Reticolo:', 'Negli esperimenti 3D trascina lo sfondo per orbitare e attiva «Reticolo 3D» in basso per immergerti nella griglia spaziale.'],
  ['Modalità Spiega e Derivazioni:', '«Spiega» nasconde i pannelli per fare lezione; «Deriva ▶» mostra i passaggi matematici animati.'],
];

const emptySteps = () => ({ param: false, played: false, scrubbed: false, time: false, scene: false });

export class Tour {
  constructor({ onOpenDrawer, onToggle } = {}) {
    this.onOpenDrawer = onOpenDrawer;
    this.onToggle = onToggle;
    const saved = store.get('tour.steps', {});
    this.steps = {
      param: !!saved?.param,
      played: !!saved?.played,
      scrubbed: !!saved?.scrubbed,
      time: !!(saved?.time || saved?.scrubbed),
      scene: !!saved?.scene,
    };

    this._buildNudge();
    this._buildCard();
    this._render();
  }

  get isOpen() {
    return !this.card.classList.contains('hidden');
  }

  _buildNudge() {
    const el = document.createElement('div');
    el.className = 'tour-nudge';
    const hideNudge = store.get('tour.dismissed', false) || store.get('tour.completed', false);
    if (hideNudge) el.classList.add('hidden');

    const go = document.createElement('button');
    go.type = 'button';
    go.className = 'tour-nudge-go';
    go.textContent = 'Nuovo qui? Prova in 60 s →';
    go.onclick = () => this.open();

    const dismiss = document.createElement('button');
    dismiss.type = 'button';
    dismiss.className = 'tour-nudge-close';
    dismiss.setAttribute('aria-label', 'Nascondi suggerimento');
    dismiss.title = 'Nascondi';
    dismiss.innerHTML = icons.close;
    dismiss.onclick = () => this.dismissNudge();

    el.append(go, dismiss);
    document.body.appendChild(el);
    this.nudge = el;
  }

  _buildCard() {
    const card = document.createElement('section');
    card.className = 'tour-card hidden';
    card.setAttribute('role', 'dialog');
    card.setAttribute('aria-label', 'Prova in 60 secondi · Guida');

    const head = document.createElement('div');
    head.className = 'tour-head';

    const titleWrap = document.createElement('div');
    titleWrap.className = 'tour-title-wrap';
    const title = document.createElement('strong');
    title.className = 'tour-title';
    title.textContent = 'Prova in 60 secondi';
    this.badge = document.createElement('span');
    this.badge.className = 'tour-badge';
    titleWrap.append(title, this.badge);

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'tour-close';
    closeBtn.setAttribute('aria-label', 'Chiudi guida');
    closeBtn.title = 'Chiudi';
    closeBtn.innerHTML = icons.close;
    closeBtn.onclick = () => this.close();

    head.append(titleWrap, closeBtn);
    card.appendChild(head);

    const list = document.createElement('div');
    list.className = 'tour-steps';
    this.stepEls = {};
    for (const st of STEPS) {
      const row = document.createElement('div');
      row.className = 'tour-step';

      const mark = document.createElement('span');
      mark.className = 'tour-check';
      mark.setAttribute('aria-hidden', 'true');
      mark.innerHTML = icons.check;

      const body = document.createElement('div');
      body.className = 'tour-step-body';
      const strong = document.createElement('strong');
      strong.textContent = st.title;
      const p = document.createElement('p');
      p.textContent = st.desc;
      body.append(strong, p);

      let hintEl = null;
      if (st.hint) {
        hintEl = document.createElement('small');
        hintEl.className = 'tour-hint hidden';
        hintEl.textContent = st.hint;
        body.appendChild(hintEl);
      }

      row.append(mark, body);
      list.appendChild(row);
      this.stepEls[st.key] = { row, hintEl };
    }
    card.appendChild(list);

    const doneBox = document.createElement('div');
    doneBox.className = 'tour-done hidden';
    const doneMsg = document.createElement('p');
    doneMsg.className = 'tour-done-msg';
    doneMsg.textContent = 'Perfetto! Hai padroneggiato i controlli principali.';
    const resetBtn = document.createElement('button');
    resetBtn.type = 'button';
    resetBtn.className = 'tour-reset';
    resetBtn.textContent = 'Ricomincia prova';
    resetBtn.onclick = () => this.reset();
    doneBox.append(doneMsg, resetBtn);
    card.appendChild(doneBox);
    this.doneBox = doneBox;

    const guide = document.createElement('details');
    guide.className = 'tour-guide';
    const summary = document.createElement('summary');
    summary.textContent = 'Guida completa e gesti iPad';
    const ul = document.createElement('ul');
    ul.className = 'tour-guide-list';
    for (const [lead, text] of GUIDE_ITEMS) {
      const li = document.createElement('li');
      const b = document.createElement('strong');
      b.textContent = lead + ' ';
      li.append(b, document.createTextNode(text));
      ul.appendChild(li);
    }
    guide.append(summary, ul);
    card.appendChild(guide);

    document.body.appendChild(card);
    this.card = card;
  }

  dismissNudge() {
    this.nudge.classList.add('hidden');
    store.set('tour.dismissed', true);
  }

  open() {
    this.dismissNudge();
    if (this.isOpen) return;
    this.card.classList.remove('hidden');
    this.onToggle?.(true);
  }

  close() {
    if (!this.isOpen) return;
    this.card.classList.add('hidden');
    this.onToggle?.(false);
  }

  toggle() {
    if (this.isOpen) this.close();
    else this.open();
  }

  reset() {
    this.steps = emptySteps();
    store.set('tour.steps', this.steps);
    store.set('tour.completed', false);
    this._render();
  }

  notify(event) {
    try {
      let changed = false;
      if (event === 'param') {
        if (!this.steps.param) { this.steps.param = true; changed = true; }
      } else if (event === 'play') {
        if (!this.steps.played) { this.steps.played = true; changed = true; }
        if (this.steps.scrubbed && !this.steps.time) { this.steps.time = true; changed = true; }
      } else if (event === 'scrub') {
        if (!this.steps.scrubbed || !this.steps.time) {
          this.steps.scrubbed = true;
          this.steps.time = true;
          changed = true;
        }
      } else if (event === 'scene') {
        if (!this.steps.scene) { this.steps.scene = true; changed = true; }
      }
      if (!changed) return;
      store.set('tour.steps', this.steps);
      if (this.steps.param && this.steps.time && this.steps.scene) {
        store.set('tour.completed', true);
        this.nudge.classList.add('hidden');
      }
      this._render();
    } catch { /* non bloccare mai la simulazione o il rendering */ }
  }

  _render() {
    const doneKeys = ['param', 'time', 'scene'];
    let count = 0;
    for (const k of doneKeys) {
      const done = !!this.steps[k];
      if (done) count++;
      const el = this.stepEls[k];
      if (!el) continue;
      el.row.classList.toggle('done', done);
      if (k === 'time' && el.hintEl) {
        const partial = this.steps.played && !done;
        el.row.classList.toggle('partial', partial);
        el.hintEl.classList.toggle('hidden', !partial);
      }
    }
    const allDone = count === 3;
    this.badge.textContent = allDone ? '3/3 ✓' : `${count}/3`;
    this.badge.classList.toggle('done', allDone);
    this.doneBox.classList.toggle('hidden', !allDone);
  }
}
