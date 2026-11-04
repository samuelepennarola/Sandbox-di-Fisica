// Installazione offline (service worker) e avviso di nuova versione.
// Il service worker si attiva solo in https (l'app pubblicata): in sviluppo, su http, darebbe file vecchi.
// Per provarlo in locale aggiungere ?sw all'indirizzo.

const enabled = location.protocol === 'https:' || new URLSearchParams(location.search).has('sw');

function toast(text, action, onAction) {
  document.querySelector('.toast')?.remove();
  const el = document.createElement('div');
  el.className = 'toast';
  el.innerHTML = `<span>${text}</span>`;
  if (action) {
    const b = document.createElement('button');
    b.textContent = action;
    b.onclick = () => { onAction(); el.remove(); };
    el.appendChild(b);
  } else {
    setTimeout(() => el.remove(), 4000);
  }
  document.body.appendChild(el);
}

if ('serviceWorker' in navigator) {
  if (!enabled) {
    // In sviluppo togliamo eventuali service worker rimasti da prove precedenti.
    navigator.serviceWorker.getRegistrations().then(rs => rs.forEach(r => r.unregister()));
  } else {
    const firstInstall = !navigator.serviceWorker.controller;
    navigator.serviceWorker.register('sw.js').then(reg => {
      // Dalla schermata Home iOS riprende l'app dalla memoria senza ricaricarla, quindi non cercherebbe mai
      // aggiornamenti: li cerchiamo noi all'avvio, ogni volta che l'app torna in primo piano e ogni mezz'ora.
      const check = () => { if (navigator.onLine !== false) reg.update().catch(() => {}); };
      check();
      document.addEventListener('visibilitychange', () => { if (!document.hidden) check(); });
      setInterval(check, 30 * 60 * 1000);
      const offer = w => toast('È disponibile una nuova versione.', 'Aggiorna', () => w.postMessage('aggiorna'));
      if (reg.waiting && navigator.serviceWorker.controller) offer(reg.waiting);
      reg.addEventListener('updatefound', () => {
        const w = reg.installing;
        w?.addEventListener('statechange', () => {
          if (w.state !== 'installed') return;
          if (navigator.serviceWorker.controller) offer(w);
          else if (firstInstall) toast('App salvata sul dispositivo: ora funziona anche offline.');
        });
      });
    }).catch(() => { /* nessun service worker: l'app funziona comunque online */ });

    let reloading = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (firstInstall || reloading) return;
      reloading = true;
      location.reload();
    });
  }
}
