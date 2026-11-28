// Barra degli interruttori della scena (scelta dell'utente, 2026-11-14): tutti i sì/no di un esperimento stanno in
// una fila di pastiglie con icona e testo, in basso a sinistra sopra la moviola, invece che tra i Parametri.
// Si attenua con il resto dell'interfaccia e sparisce in modalità Spiega (css: .quickbar).
// Etichetta breve e icona si ricavano dalla chiave del parametro; un parametro può dichiarare short e icon.

const SVG = body => `<svg viewBox="0 0 20 20" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
const ARROW = (x1, y1, x2, y2) => {
  const a = Math.atan2(y2 - y1, x2 - x1), h = 4.5, w = 0.5;
  const p1 = [x2 - h * Math.cos(a - w), y2 - h * Math.sin(a - w)], p2 = [x2 - h * Math.cos(a + w), y2 - h * Math.sin(a + w)];
  return `<path d="M${x1} ${y1}L${x2} ${y2}"/><path d="M${p1[0].toFixed(1)} ${p1[1].toFixed(1)}L${x2} ${y2}L${p2[0].toFixed(1)} ${p2[1].toFixed(1)}" fill="currentColor"/>`;
};

const ICONS = {
  cube: SVG('<path d="M4 7l6-3 6 3v7l-6 3-6-3z"/><path d="M4 7l6 3 6-3M10 10v7"/>'),
  axesProj: SVG('<path d="M3 17h14M3 17V3"/><circle cx="12" cy="8" r="1.8" fill="currentColor"/><path d="M12 8v9M12 8H3" stroke-dasharray="1.5 2"/>'),
  dots: SVG('<circle cx="4" cy="14" r="1.4" fill="currentColor"/><circle cx="8" cy="9" r="1.4" fill="currentColor"/><circle cx="12" cy="6.5" r="1.4" fill="currentColor"/><circle cx="16" cy="6" r="1.4" fill="currentColor"/>'),
  accel: SVG(ARROW(4, 4, 14, 15) + '<circle cx="4" cy="4" r="1.6" fill="currentColor"/>'),
  vel: SVG(ARROW(3, 15, 16, 6) + '<circle cx="3" cy="15" r="1.6" fill="currentColor"/>'),
  comp: SVG(ARROW(4, 16, 15, 16) + ARROW(4, 16, 4, 5) + '<path d="M4 16L14 7" stroke-dasharray="1.5 2"/>'),
  ideal: SVG('<path d="M2 17Q10 -3 18 17" stroke-dasharray="2 2.5"/>'),
  slowmo: SVG('<circle cx="10" cy="10" r="7"/><path d="M10 5v5l3 2"/>'),
  balance: SVG('<path d="M3 16h14"/><rect x="5" y="8" width="3" height="8" rx="0.5"/><rect x="12" y="5" width="3" height="11" rx="0.5"/>'),
  force: SVG('<rect x="3" y="7" width="6" height="6" rx="1"/>' + ARROW(9, 10, 18, 10)),
  arm: SVG('<path d="M5 15A8 8 0 0 1 15 5"/><path d="M12 4l3 1-1 3" /><circle cx="5" cy="15" r="1.5" fill="currentColor"/>'),
  phasor: SVG('<circle cx="10" cy="10" r="7"/><path d="M10 10l5-5"/><circle cx="15" cy="5" r="1.4" fill="currentColor"/>'),
  trace: SVG('<path d="M2 10c2.5-7 5-7 7.5 0s5 7 8.5 0"/>'),
  energy: SVG('<path d="M3 17h14"/><rect x="4" y="9" width="2.6" height="8"/><rect x="8.7" y="5" width="2.6" height="12"/><rect x="13.4" y="11" width="2.6" height="6"/>'),
  twoSources: SVG('<circle cx="6" cy="10" r="1.8" fill="currentColor"/><circle cx="14" cy="10" r="1.8" fill="currentColor"/><path d="M6 5a5 5 0 0 1 0 10M14 5a5 5 0 0 0 0 10" stroke-dasharray="1.5 2"/>'),
  nodal: SVG('<path d="M4 3q6 7 0 14M16 3q-6 7 0 14M10 3v14" stroke-dasharray="2 2"/>'),
  envelope: SVG('<path d="M2 10q4-8 8 0t8 0M2 10q4 8 8 0t8 0" stroke-dasharray="2 2"/>'),
  harmonic: SVG('<path d="M10 2v7"/><circle cx="10" cy="13" r="3"/><circle cx="15" cy="12" r="3" stroke-dasharray="1.5 1.5"/>'),
  triangle: SVG('<path d="M3 16L17 16L13 5Z"/>'),
  loop: SVG('<path d="M15 7a6 6 0 1 0 1 5"/><path d="M15 3v4h-4"/>'),
  sphere: SVG('<circle cx="10" cy="10" r="7"/><ellipse cx="10" cy="10" rx="7" ry="2.5"/>'),
  cylinder: SVG('<ellipse cx="7" cy="10" rx="3" ry="6"/><path d="M7 4h7M7 16h7"/><ellipse cx="14" cy="10" rx="3" ry="6"/>'),
  ring: SVG('<circle cx="10" cy="10" r="7"/><circle cx="10" cy="10" r="5"/>'),
  block: SVG('<rect x="4" y="5" width="12" height="10" rx="1"/>'),
  probe: SVG('<circle cx="5" cy="10" r="2" fill="currentColor"/><path d="M8 10c1.5-5 3-5 4.5 0s3 5 4.5 0"/>'),
  wedge: SVG('<circle cx="5" cy="10" r="1.8" fill="currentColor"/><path d="M5 10L16 4A9 9 0 0 1 17 13Z" fill="currentColor" fill-opacity=".25"/>'),
  orbit: SVG('<ellipse cx="10" cy="10" rx="8" ry="5" stroke-dasharray="2 2"/><circle cx="6" cy="10" r="1.8" fill="currentColor"/>'),
  field: SVG(ARROW(3, 4, 7, 8) + ARROW(17, 4, 13, 8) + ARROW(3, 16, 7, 12) + ARROW(17, 16, 13, 12) + '<circle cx="10" cy="10" r="1.8" fill="currentColor"/>'),
  contours: SVG('<circle cx="10" cy="10" r="2.5"/><circle cx="10" cy="10" r="5.5" stroke-dasharray="2 1.5"/><circle cx="10" cy="10" r="8.5" stroke-dasharray="2 2"/>'),
  cm: SVG('<circle cx="10" cy="10" r="5"/><path d="M10 5v10M5 10h10"/>'),
  cannon: SVG('<path d="M3 16h14"/><path d="M5 15l6-5" stroke-width="3"/><path d="M11 10q4-4 7 0" stroke-dasharray="1.5 2"/>'),
  flines: SVG('<circle cx="6" cy="10" r="2" fill="currentColor"/><path d="M8 10h9M8 8.5q5-6 9-5M8 11.5q5 6 9 5"/>'),
  lattice3d: SVG('<path d="M3.5 6.5L10 3l6.5 3.5v7L10 17l-6.5-3.5z"/><path d="M3.5 6.5L10 10l6.5-3.5M10 10v7"/><path d="M6.8 4.8L13.2 8.2M13.2 4.8L6.8 8.2" stroke-opacity=".55"/>'),
  eye: SVG('<path d="M2 10s3-6 8-6 8 6 8 6-3 6-8 6-8-6-8-6z"/><circle cx="10" cy="10" r="2.5"/>'),
};

// Chiave del parametro → [etichetta breve, icona].
const BY_KEY = {
  show3d: ['Vista 3D', 'cube'], lattice3d: ['Reticolo 3D', 'lattice3d'], showProj: ['Proiezioni', 'axesProj'], strobe: ['Stroboscopio', 'dots'],
  showAcc: ['Accelerazione', 'accel'], showVel: ['Velocità', 'vel'], showComp: ['Componenti', 'comp'],
  showIdeal: ['Traiettoria ideale', 'ideal'], slowmo: ['Rallentatore', 'slowmo'], showBal: ['Bilancio', 'balance'],
  showForce: ['Forze', 'force'], showArm: ['Bracci', 'arm'], showPhasor: ['Fasore', 'phasor'], showTrace: ['Traccia', 'trace'],
  showEnergy: ['Energie', 'energy'], on2: ['Seconda sorgente', 'twoSources'], showLines: ['Linee nodali', 'nodal'],
  showEnv: ['Inviluppo', 'envelope'], showHarm: ['Moto armonico', 'harmonic'], showTri: ['Triangolo', 'triangle'],
  auto: ['Automatico', 'loop'], b_sphere: ['Sfera', 'sphere'], b_cyl: ['Cilindro', 'cylinder'], b_ring: ['Anello', 'ring'],
  b_block: ['Blocco', 'block'],
  showAreas: ['Aree uguali', 'wedge'], showConic: ['Orbita prevista', 'orbit'], keepShots: ['Colpi precedenti', 'cannon'],
  showVec: ['Vettori del campo', 'field'], showEquip: ['Equipotenziali', 'contours'], showCM: ['Centro di massa', 'cm'],
  showTrails: ['Scie', 'trace'],
};

export function quickLabel(def) { return def.short ?? BY_KEY[def.key]?.[0] ?? def.label.split(/[:(]/)[0].trim(); }
export function quickIcon(def) { return ICONS[def.icon ?? BY_KEY[def.key]?.[1]] ?? ICONS.eye; }

const MORE_ICON = SVG('<circle cx="4.5" cy="10" r="1.5" fill="currentColor"/><circle cx="10" cy="10" r="1.5" fill="currentColor"/><circle cx="15.5" cy="10" r="1.5" fill="currentColor"/>');
const MAX_INLINE = 5;   // oltre 5 interruttori, i meno usati vanno nel menu "⋯"

// Chiude l'eventuale menu "⋯" aperto al tocco fuori dalla quickbar.
let closeMore = null;
document.addEventListener('pointerdown', e => {
  if (closeMore && !e.target.closest('.quickbar')) closeMore();
}, true);
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && closeMore) closeMore();
});

// Costruisce la barra compatta su una sola riga: pastiglie solo icona (etichetta al passaggio/pressione)
// e, se gli interruttori sono più di MAX_INLINE, un pulsante "⋯" con menu per i restanti.
export function buildQuickbar(el, defs, get, set) {
  el.innerHTML = '';
  closeMore = null;
  const syncs = [];
  const inline = defs.length > MAX_INLINE ? defs.slice(0, MAX_INLINE - 1) : defs;
  const extra = defs.length > MAX_INLINE ? defs.slice(MAX_INLINE - 1) : [];

  for (const def of inline) {
    const b = document.createElement('button');
    b.type = 'button';
    const lab = quickLabel(def);
    b.title = def.label;
    b.setAttribute('aria-label', def.label);
    b.dataset.tip = lab;
    b.innerHTML = `${quickIcon(def)}<span class="qb-tip">${lab}</span>`;
    const sync = () => { const on = !!get(def); b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); };
    b.onclick = () => { set(def, !get(def)); sync(); };
    sync();
    syncs.push(sync);
    el.appendChild(b);
  }

  if (extra.length) {
    const wrap = document.createElement('div');
    wrap.className = 'qb-more-wrap';
    const moreBtn = document.createElement('button');
    moreBtn.type = 'button';
    moreBtn.className = 'qb-more';
    moreBtn.title = 'Altre opzioni della scena';
    moreBtn.setAttribute('aria-label', 'Altre opzioni della scena');
    moreBtn.innerHTML = `${MORE_ICON}<span class="qb-tip">Altro</span>`;

    const pop = document.createElement('div');
    pop.className = 'qb-more-pop hidden';
    const syncMore = () => moreBtn.classList.toggle('on', extra.some(d => !!get(d)));
    for (const def of extra) {
      const item = document.createElement('button');
      item.type = 'button';
      item.innerHTML = `${quickIcon(def)}<span>${quickLabel(def)}</span>`;
      item.title = def.label;
      const sync = () => {
        const on = !!get(def);
        item.classList.toggle('on', on);
        item.setAttribute('aria-pressed', on);
        syncMore();
      };
      item.onclick = () => { set(def, !get(def)); sync(); };
      sync();
      syncs.push(sync);
      pop.appendChild(item);
    }
    syncMore();
    moreBtn.onclick = () => {
      const open = pop.classList.contains('hidden');
      pop.classList.toggle('hidden', !open);
      moreBtn.setAttribute('aria-expanded', open);
    };
    closeMore = () => { pop.classList.add('hidden'); moreBtn.setAttribute('aria-expanded', 'false'); };
    wrap.append(moreBtn, pop);
    el.appendChild(wrap);
  }

  el.classList.toggle('hidden', !defs.length);
  return syncs;
}
