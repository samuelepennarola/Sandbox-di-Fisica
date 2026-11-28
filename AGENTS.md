# Istruzioni per gli agenti (Claude, Gemini, Codex…)

**Fisicamente** (repository e URL hanno ancora il vecchio nome `Sandbox-di-Fisica`) è una sandbox interattiva di fisica classica per ripetizioni: livello liceo e primi anni di università. Si usa soprattutto su **iPad con Apple Pencil**, ma anche su Mac. Obiettivo a lungo termine: renderla vendibile, con un piano Pro.

## Come si lavora

- **Vibe coding guidato.** L'utente decide struttura e stile; l'agente scrive, esegue e verifica il codice. Prima di ogni modulo nuovo o scelta di design proponi le opzioni come **domande a scelta multipla**. Non scegliere tu e non chiedere ciò che è già deciso qui.
- **Lingua.** Rispondi in italiano, in modo conciso. Anche testi dell'interfaccia e commenti nel codice sono in italiano.
- **Commit e push (autorizzati dall'utente il 2026-11-28).** Alla fine di un lavoro verificato fai commit (messaggio breve in italiano) e `git push` su `main`: le credenziali sono già nel Portachiavi del Mac. Prima del commit lancia `python3 tools/genera-sw.py`. Non pubblicare lavoro rotto o non verificato e non fare force push.
- **Dopo ogni modifica** lancia `python3 tools/genera-sw.py`: rigenera `sw.js`, il service worker versionato. Senza, l'app installata non si aggiorna.
- **Verifica sempre nel browser** prima di consegnare: tema chiaro e tema scuro, 1280×800 e 1024×768 (iPad), console senza errori. Dev server: `python3 .claude/devserver.py 5173` (senza cache); con `?debug` nell'URL c'è `window.fisica = { app, cam, api, ink }`. In localStorage `fs.lastExp` e `fs.theme` scelgono esperimento e tema.
- **Altre sessioni lavorano sulla stessa cartella.** Rileggi un file prima di modificarlo e tocca solo ciò che serve.

## Stack (vincoli)

- **Codice:** JavaScript vanilla con moduli ES, **senza build, senza Node, senza npm**. È una PWA offline pubblicata su GitHub Pages.
- **Librerie:** Planck.js (costruttore libero) e KaTeX, già copiate in `vendor/`. Non aggiungere CDN: tutto deve funzionare offline.
- **Disegno:** Canvas 2D con coordinate in metri. `Painter` è in `js/core/render.js`, `Camera` (`toScreen`/`toWorld`/`fit`) in `js/core/camera.js`.
- **Esperimenti:** in `js/experiments/*.js`, registrati in `js/experiments/registry.js`. Ogni esperimento espone `params`, `init`, `step`, `draw`, `formulas`, la teoria e gli hook opzionali (`pinInfo`, `drawBackground`, `history`…). Prendi come modello un esperimento esistente.
- **Layout:** barra unica in alto; ispettore a destra (`js/core/inspector.js`) con i parametri e le schede Formule · Grafici · Teoria; rail degli strumenti a sinistra; interruttore Esplora/Spiega.

## Stile grafico: 3Blue1Brown / Manim (deciso)

- **Kit grafico:** `js/core/manim.js` (palette, NumberPlane, frecce, mini-LaTeX su canvas con `\frac` e `\sqrt`, `Regia`), `js/core/anim.js` (curve e timeline di Manim), `js/core/annot.js` (graffe, archi d'angolo, formule dal vivo), `js/core/morph.js` (formule che si trasformano).
- **Colori:** tema scuro con fondo quasi nero `#0B0B0D`; tema chiaro su carta `#f6f3ea` con palette Manim adattata. Ogni grandezza ha lo stesso colore sulla scena e nelle formule.
- **Scritte:** quelle sulla scena e i titoli di teoria sono in Computer Modern (font KaTeX); i controlli dell'interfaccia restano nel font di sistema.
- **Animazioni:** solo di "regia" (frecce che crescono, Create, dissolvenze, camera morbida), e devono essere **perfette**: curve di Manim, 60 fps, nessuno sfarfallio. La simulazione fisica non cambia per lo stile. Rispetta `prefers-reduced-motion`; nelle istantanee (`ui.snapshot`) tutto va allo stato finale.

## iPad: regole imparate

- **Input:** Pointer Events; la Pencil scrive, il dito manipola. Con lo strumento Mano la Pencil sposta l'oggetto su cui parte. C'è l'esclusione del palmo.
- **Niente `dblclick`:** Safari si trattiene il secondo tocco.
- **`setPointerCapture`** sempre dentro `try/catch`.
- **Canvas** dimensionato su `innerWidth`/`innerHeight`, non su `100vh`.
- **Bersagli di tocco** di almeno 44 px.

## Da non fare

- Non scrivere nel Compendio LaTeX dell'utente: lo scrive solo lui.
- Non iniziare il modulo esercizi con soluzioni animate (il futuro piano Pro) né la "rete del sapere" dal Compendio finché l'utente non lo chiede esplicitamente.
