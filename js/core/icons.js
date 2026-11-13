const svg = (body, fill = false) =>
  `<svg class="i" viewBox="0 0 24 24" fill="${fill ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;

export const icons = {
  menu: svg('<path d="M4 6h16M4 12h16M4 18h16"/>'),
  play: svg('<path d="M7 4.5v15l12.5-7.5z"/>', true),
  pause: svg('<rect x="6" y="4.5" width="4" height="15" rx="1"/><rect x="14" y="4.5" width="4" height="15" rx="1"/>', true),
  reset: svg('<path d="M3 12a9 9 0 1 0 2.6-6.4L3 8"/><path d="M3 3v5h5"/>'),
  step: svg('<path d="M5 5l10 7-10 7z"/><path d="M19 5v14"/>'),
  hand: svg('<path d="M18 11V6a2 2 0 0 0-4 0v5"/><path d="M14 10V4a2 2 0 0 0-4 0v6"/><path d="M10 10.5V6a2 2 0 0 0-4 0v8"/><path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.9-6-2.3l-3.6-3.6a2 2 0 0 1 2.8-2.8L7 15"/>'),
  pen: svg('<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>'),
  eraser: svg('<path d="M7 21l-4.3-4.3a1 1 0 0 1 0-1.4l10-10a1 1 0 0 1 1.4 0l5.6 5.6a1 1 0 0 1 0 1.4L13 21"/><path d="M22 21H7"/><path d="M5 11l9 9"/>'),
  undo: svg('<path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-15-6.7L3 13"/>'),
  trash: svg('<path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/>'),
  book: svg('<path d="M2 4h6a4 4 0 0 1 4 4v13a3 3 0 0 0-3-3H2z"/><path d="M22 4h-6a4 4 0 0 0-4 4v13a3 3 0 0 1 3-3h7z"/>'),
  target: svg('<circle cx="12" cy="12" r="7"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/>'),
  theme: svg('<circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 0 0 18z" fill="currentColor"/>'),
  chevron: svg('<path d="M6 9l6 6 6-6"/>'),
  stop: svg('<rect x="6" y="6" width="12" height="12" rx="1.5"/>', true),
  skipBack: svg('<path d="M19 5L9 12l10 7z"/><path d="M5 5v14"/>'),
  skipFwd: svg('<path d="M5 5l10 7-10 7z"/><path d="M19 5v14"/>'),
  select: svg('<path d="M5 3l14 8-6 2-2 6z"/>'),
  block: svg('<rect x="4" y="8" width="16" height="10" rx="1.5"/>'),
  ball: svg('<circle cx="12" cy="12" r="7"/><path d="M12 12l5-3"/>'),
  incline: svg('<path d="M3 19h18V6z"/>'),
  surface: svg('<path d="M3 15h18"/><path d="M6 15l-2 3M10 15l-2 3M14 15l-2 3M18 15l-2 3"/>'),
  anchor: svg('<path d="M7 5h10"/><path d="M8 5L6 2M12 5l-2-3M16 5l-2-3"/><circle cx="12" cy="11" r="2.5"/><path d="M12 5v3.5"/>'),
  pulley: svg('<circle cx="12" cy="9" r="5"/><circle cx="12" cy="9" r="1" fill="currentColor"/><path d="M7 9v11M17 9v8"/><rect x="15" y="17" width="4" height="4"/>'),
  spring: svg('<path d="M12 2v3l-5 2 10 3-10 3 10 3-5 2v4"/>'),
  rope: svg('<path d="M12 3v18"/><circle cx="12" cy="3" r="1.5" fill="currentColor"/>'),
  force: svg('<path d="M3 12h16"/><path d="M14 7l5 5-5 5"/>'),
  plus: svg('<path d="M12 5v14M5 12h14"/>'),
  chargePlus: svg('<circle cx="12" cy="12" r="8"/><path d="M12 8.5v7M8.5 12h7"/>'),
  chargeMinus: svg('<circle cx="12" cy="12" r="8"/><path d="M8.5 12h7"/>'),
  rodCharge: svg('<rect x="3" y="10" width="18" height="4" rx="2"/><path d="M7 12h0M12 12h0M17 12h0" stroke-width="3"/>'),
  plateCharge: svg('<path d="M4 7h16M4 17h16"/><path d="M8 7v10M12 7v10M16 7v10" stroke-dasharray="1.5 2.5" stroke-width="1.5"/>'),
  brush: svg('<path d="M9.1 11.9l8-8.1a2.9 2.9 0 1 1 4.1 4.1l-8.1 8"/><path d="M7.1 14.9c-1.7 0-3 1.4-3 3 0 1.3-2.5 1.5-2 2 1.1 1.1 2.5 2 4 2 2.2 0 4-1.8 4-4a3 3 0 0 0-3-3z"/>'),
  lasso: svg('<path d="M7 22a5 5 0 0 1-2-4"/><path d="M3.3 14A6.8 6.8 0 0 1 2 10c0-4.4 4.5-8 10-8s10 3.6 10 8-4.5 8-10 8c-1.1 0-2.2-.1-3.2-.4"/><circle cx="5" cy="16" r="2"/>'),
  eraserPart: svg('<path d="M7 21l-4.3-4.3a1 1 0 0 1 0-1.4l10-10a1 1 0 0 1 1.4 0l5.6 5.6a1 1 0 0 1 0 1.4L13 21"/><path d="M22 21H7"/><circle cx="20" cy="4" r="2.2" fill="currentColor"/>'),
  sidebar: svg('<rect x="3" y="4" width="18" height="16" rx="2.5"/><path d="M15 4v16"/>'),
  pin: svg('<path d="M9 4h6l-1 6 3 3H7l3-3z"/><path d="M12 13v7"/>'),
  close: svg('<path d="M6 6l12 12M18 6L6 18"/>'),
};

export function applyIcons(root = document) {
  root.querySelectorAll('[data-icon]').forEach(el => { el.innerHTML = icons[el.dataset.icon] || ''; });
}
