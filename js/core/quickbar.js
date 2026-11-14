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
  eye: SVG('<path d="M2 10s3-6 8-6 8 6 8 6-3 6-8 6-8-6-8-6z"/><circle cx="10" cy="10" r="2.5"/>'),
};

// Chiave del parametro → [etichetta breve, icona].
const BY_KEY = {
  show3d: ['Vista 3D', 'cube'], showProj: ['Proiezioni', 'axesProj'], strobe: ['Stroboscopio', 'dots'],
  showAcc: ['Accelerazione', 'accel'], showVel: ['Velocità', 'vel'], showComp: ['Componenti', 'comp'],
  showIdeal: ['Traiettoria ideale', 'ideal'], slowmo: ['Rallentatore', 'slowmo'], showBal: ['Bilancio', 'balance'],
  showForce: ['Forze', 'force'], showArm: ['Bracci', 'arm'], showPhasor: ['Fasore', 'phasor'], showTrace: ['Traccia', 'trace'],
  showEnergy: ['Energie', 'energy'], on2: ['Seconda sorgente', 'twoSources'], showLines: ['Linee nodali', 'nodal'],
  showEnv: ['Inviluppo', 'envelope'], showHarm: ['Moto armonico', 'harmonic'], showTri: ['Triangolo', 'triangle'],
  auto: ['Automatico', 'loop'], b_sphere: ['Sfera', 'sphere'], b_cyl: ['Cilindro', 'cylinder'], b_ring: ['Anello', 'ring'],
  b_block: ['Blocco', 'block'],
};

export function quickLabel(def) { return def.short ?? BY_KEY[def.key]?.[0] ?? def.label.split(/[:(]/)[0].trim(); }
export function quickIcon(def) { return ICONS[def.icon ?? BY_KEY[def.key]?.[1]] ?? ICONS.eye; }

// Costruisce la barra: un pulsante per ogni interruttore. get/set leggono e scrivono il parametro; restituisce le
// funzioni di sincronizzazione (per aggiornare lo stato quando cambiano i parametri da fuori, per esempio un preset).
export function buildQuickbar(el, defs, get, set) {
  el.innerHTML = '';
  const syncs = [];
  for (const def of defs) {
    const b = document.createElement('button');
    b.type = 'button';
    b.title = def.label;
    b.innerHTML = `${quickIcon(def)}<span>${quickLabel(def)}</span>`;
    const sync = () => { const on = !!get(def); b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); };
    b.onclick = () => { set(def, !get(def)); sync(); };
    sync();
    syncs.push(sync);
    el.appendChild(b);
  }
  el.classList.toggle('hidden', !defs.length);
  return syncs;
}
