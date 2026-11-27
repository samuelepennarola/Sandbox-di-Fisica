// Regia delle derivazioni algebriche passo-passo (TexSteps di morph.js) direttamente sul canvas.
// Un esperimento dichiara `derivation(p, s)` → { title, steps: [{ tex, note?, map? } | { indicate, note? } | { circumscribe, note? } | { box, note? }] }.
// In cima appare il titolo, al centro la formula che si trasforma con Write / TransformMatchingTex / Indicate / Box,
// sotto una breve didascalia in italiano. Barra compatta in basso con Indietro · Avanti · Riproduci · Chiudi.
import { TexSteps } from './morph.js';
import { tex, texLayout, reducedMotion } from './manim.js';
import { icons } from './icons.js';

export class DerivationOverlay {
  constructor() {
    this.active = false;
    this.title = '';
    this.steps = null;   // istanza di TexSteps
    this.raw = [];       // passi originali (per le didascalie .note)
    this.alpha = 0;

    // Barra di controllo minimale in stile 3B1B (Computer Modern, target touch >= 44 px).
    const bar = this.bar = document.createElement('div');
    bar.id = 'deriveBar';
    bar.className = 'derive-bar hidden';
    bar.innerHTML = `
      <button type="button" data-act="prev" title="Passo precedente (←)">‹ Indietro</button>
      <span class="derive-count"></span>
      <button type="button" data-act="next" class="primary" title="Passo successivo (→ o spazio)">Avanti ›</button>
      <button type="button" data-act="play" title="Riproduci tutti i passi">${icons.play}</button>
      <button type="button" data-act="close" title="Chiudi derivazione (Esc)">${icons.close}</button>
    `;
    document.body.appendChild(bar);
    this.countEl = bar.querySelector('.derive-count');
    this.prevBtn = bar.querySelector('[data-act=prev]');
    this.nextBtn = bar.querySelector('[data-act=next]');
    this.playBtn = bar.querySelector('[data-act=play]');

    this.prevBtn.onclick = () => this.prev();
    this.nextBtn.onclick = () => this.next();
    this.playBtn.onclick = () => this.togglePlayAll();
    bar.querySelector('[data-act=close]').onclick = () => this.close();

    // Pulsante ✕ dedicato in alto a destra del riquadro della derivazione (target touch 44×44 px).
    const xBtn = this.closeBtn = document.createElement('button');
    xBtn.type = 'button';
    xBtn.id = 'deriveClose';
    xBtn.className = 'derive-close hidden';
    xBtn.title = 'Chiudi derivazione (Esc)';
    xBtn.setAttribute('aria-label', 'Chiudi derivazione');
    xBtn.innerHTML = icons.close;
    xBtn.onclick = () => this.close();
    document.body.appendChild(xBtn);
  }

  open(spec) {
    if (!spec?.steps?.length) return;
    this.title = spec.title || 'Derivazione';
    this.raw = spec.steps;
    this.steps = new TexSteps(spec.steps);
    this.active = true;
    this.alpha = reducedMotion() ? 1 : 0;
    this.steps.next(); // parte subito con il primo passo (Write)
    this.bar.classList.remove('hidden');
    this.closeBtn.classList.remove('hidden');
    document.body.classList.add('deriving');
    this.syncBar();
  }

  close() {
    if (!this.active) return;
    this.active = false;
    this.steps?.stop();
    this.steps = null;
    this.bar.classList.add('hidden');
    this.closeBtn.classList.add('hidden');
    document.body.classList.remove('deriving');
  }

  next() {
    if (!this.steps) return;
    if (this.steps.done) { this.close(); return; }
    this.steps.stop();
    this.steps.next();
    this.syncBar();
  }

  prev() {
    if (!this.steps) return;
    this.steps.stop();
    if (this.steps.i > 0) this.steps.prev();
    this.syncBar();
  }

  togglePlayAll() {
    if (!this.steps) return;
    if (this.steps.queue > 0) { this.steps.stop(); }
    else { this.steps.playAll(0.95); }
    this.syncBar();
  }

  // Gestisce tastiera quando la derivazione è aperta. Restituisce true se ha consumato il tasto.
  onKey(e) {
    if (!this.active) return false;
    if (e.key === 'Escape') { this.close(); return true; }
    if (e.key === 'ArrowRight' || e.key === ' ') { e.preventDefault(); this.next(); return true; }
    if (e.key === 'ArrowLeft') { e.preventDefault(); this.prev(); return true; }
    return false;
  }

  syncBar() {
    if (!this.steps) return;
    const n = this.raw.length, i = Math.max(0, this.steps.i);
    this.countEl.textContent = `${i + 1} / ${n}`;
    this.prevBtn.disabled = i <= 0;
    this.nextBtn.textContent = i >= n - 1 ? 'Fine ✓' : 'Avanti ›';
    this.playBtn.innerHTML = this.steps.queue > 0 ? icons.stop : icons.play;
    this.playBtn.classList.toggle('on', this.steps.queue > 0);
  }

  update(dt) {
    if (!this.active || !this.steps) return;
    const prevI = this.steps.i, prevQ = this.steps.queue;
    this.steps.update(dt);
    this.alpha = reducedMotion() ? 1 : Math.min(1, this.alpha + dt / 0.28);
    if (this.steps.i !== prevI || this.steps.queue !== prevQ) this.syncBar();
  }

  draw(P, M) {
    if (!this.active || !this.steps) return;
    const { ctx, cam } = P;
    const pad = cam.padFn?.() ?? { top: 76, right: 24, bottom: 72, left: 24 };
    const cx = pad.left + (cam.w - pad.left - pad.right) / 2;
    const cy = Math.max(pad.top + 110, Math.min(cam.h * 0.44, cam.h - 190));
    const maxW = Math.min(680, Math.max(260, cam.w - pad.left - pad.right - 32));
    const boxW = maxW + 44, boxH = 204;

    // Posiziona la ✕ cliccabile esattamente nell'angolo in alto a destra del riquadro.
    this.closeBtn.style.left = Math.round(cx + boxW / 2 - 46) + 'px';
    this.closeBtn.style.top = Math.round(cy - boxH / 2 + 4) + 'px';

    ctx.save();
    // Velatura morbida dietro la derivazione: lascia intravedere la scena fisica come in 3B1B ma rende il testo nitidissimo.
    ctx.globalAlpha = this.alpha * (M.dark ? 0.84 : 0.9);
    ctx.fillStyle = M.bg;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(cx - boxW / 2, cy - boxH / 2, boxW, boxH, 18);
    else ctx.rect(cx - boxW / 2, cy - boxH / 2, boxW, boxH);
    ctx.fill();
    ctx.globalAlpha = this.alpha * (M.dark ? 0.16 : 0.14);
    ctx.strokeStyle = M.text; ctx.lineWidth = 1; ctx.stroke();
    ctx.restore();

    // Helper per testo in Computer Modern (titolo e didascalia) senza passare dal parser matematico (spazi sempre intatti).
    const drawProse = (str, y, size, op = 0.95) => {
      ctx.save();
      ctx.globalAlpha = this.alpha * op;
      ctx.fillStyle = M.muted;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      let sz = size;
      ctx.font = `${sz}px KaTeX_Main, "Times New Roman", serif`;
      const w = ctx.measureText(str).width;
      if (w > maxW && w > 0) {
        sz = Math.max(12, sz * (maxW / w));
        ctx.font = `${sz}px KaTeX_Main, "Times New Roman", serif`;
      }
      ctx.fillText(str, cx, y);
      ctx.restore();
    };

    // Titolo della derivazione in alto al riquadro
    drawProse(this.title, cy - 72, 17);

    // Adatta il corpo della formula se la derivazione ha un passo largo su schermo stretto
    let sz = 23;
    const curTex = this.steps.states[this.steps.i]?.tex;
    if (curTex) {
      const w0 = texLayout(P, curTex, sz).w;
      if (w0 > maxW) sz = Math.max(13, sz * (maxW / w0));
    }

    // Disegna la formula animata con TexSteps (Write / TransformMatchingTex / Indicate / Box)
    ctx.save();
    ctx.globalAlpha = this.alpha;
    this.steps.draw(P, cx, cy - 10, { size: sz, color: M.text, dark: M.dark, align: 'center' });
    ctx.restore();

    // Didascalia del passo corrente + suggerimento frecce
    const note = this.raw[this.steps.i]?.note;
    if (note) drawProse(note, cy + 52, 16);
    drawProse('Usa ← → o Spazio per passare avanti e indietro', cy + 80, 13, 0.68);
  }
}
