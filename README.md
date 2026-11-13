# Sandbox di Fisica

App interattiva per le ripetizioni di fisica classica, pensata per iPad con Apple Pencil (funziona anche su Mac).

- **Esperimenti pronti**: moto parabolico, piano inclinato, moto circolare, moti relativi, con formule live, grafici e schede di teoria.
- **Elettrostatica**: cariche puntiformi, barre e lastre cariche (condensatore piano), con linee di campo, vettori del campo, forze tra le cariche (legge di Coulomb e sovrapposizione, con le componenti x e y), posizioni scelte con distanza e angolo, e sonda che misura E e V.
- **Costruttore libero**: blocchi, piani, molle, funi, carrucole e forze da collegare a piacere, più cariche elettriche e campo uniforme; diagramma di corpo libero e bilancio energetico.
- **Lavagna**: foglio infinito a quadretti o bianco; la Pencil scrive, il dito sposta e fa zoom. Lazo per spostare, ingrandire, copiare ed eliminare; gomma a tratti interi o precisa; istantanee degli esperimenti da annotare.
- **Appunti sugli esperimenti**: la Pencil scrive anche sopra ogni scena, e gli appunti restano ancorati agli oggetti.
- **Due modalità**: *Esplora*, con il pannello a destra (controlli, formule, grafici, teoria), e *Spiega*, con la sola scena, gli appunti e i valori fissati con la puntina.
- **Offline**: una volta aperta, l'app resta salvata sul dispositivo.

## Usarla

Apri l'indirizzo dell'app pubblicata in Safari e aggiungila:

- **iPad**: Condividi → *Aggiungi alla schermata Home*
- **Mac**: Safari → *File → Aggiungi al Dock*

## Pubblicare una nuova versione

1. Rigenera l'elenco dei file per il funzionamento offline:
   ```bash
   python3 tools/genera-sw.py
   ```
2. In GitHub Desktop scrivi un messaggio che descrive la modifica, premi **Commit to main** e poi **Push origin**.
3. Dopo un paio di minuti GitHub Pages pubblica la versione nuova; sui dispositivi comparirà l'avviso *«È disponibile una nuova versione»*.

## Sviluppo sul Mac

```bash
python3 .claude/devserver.py 5173
```

Poi apri http://localhost:5173. Per provarla sull'iPad dalla rete di casa: `python3 .claude/devserver.py 5180 0.0.0.0` e apri `http://<indirizzo-del-Mac>:5180`. Aggiungendo `?debug` all'indirizzo compare il pannello diagnostico dei tocchi.

## Struttura

| Cartella | Contenuto |
|---|---|
| `js/experiments/` | un file per esperimento, registrati in `registry.js` |
| `js/core/` | motore comune: camera, pannelli, grafici, inchiostro, kit grafici (`shapes.js`, `look.js`) |
| `vendor/` | librerie incluse per l'uso offline: KaTeX (formule) e Planck.js (motore fisico del costruttore) |
| `tools/` | `genera-sw.py` e il modello del service worker |

Librerie di terze parti: [KaTeX](https://katex.org) e [Planck.js](https://github.com/piqnt/planck.js), entrambe con licenza MIT.
