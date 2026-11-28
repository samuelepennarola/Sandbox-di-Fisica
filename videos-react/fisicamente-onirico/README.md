# Fisicamente · film di lancio onirico (Remotion)

Film verticale 1080×1920 a 60 fps, 64,8 s. Si monta partendo dalla musica: 100 BPM, un movimento = 36 fotogrammi, una battuta = 144, quindi ogni taglio cade su un battito.

## Struttura (battute → secondi)

| Battute | Tempo | Capitolo (utile come reel) |
|---|---|---|
| 0-1 | 0-4,8 s | Apertura: macro sul vettore |
| 2 | 4,8-7,2 s | Rivelazione del nome |
| 3-7 | 7,2-19,2 s | Gravitazione, forze, tre corpi, urti, Keplero |
| 8-9 | 19,2-24 s | Oscillazioni e onde, poi pausa con «E adesso, il bello.» |
| 10-17 | 24-43,2 s | Drop A: derivazioni, cariche, fluidi, molla, moto circolare, rigido 3D, costruttore |
| 18-19 | 43,2-48 s | Respiro: iPad e Mac, griglia «26 laboratori», «Ora tocca a te.» |
| 20-23 | 48-57,6 s | Drop B: «Toccala. Muovila. Esplorala. Capiscila.» |
| 24-26 | 57,6-64,8 s | Chiusura con il logo |

## Comandi

Node è in `~/.local/node/bin`; `node_modules` è un collegamento a quello di `fisicamente-launch`.

```bash
uv run --with numpy --with scipy python tools/musica_onirica.py   # musica -> public/audio/onirica.wav
python3 tools/cattura.py clip threebody 4.4 public/clips/nuove/11_threebody.mp4   # nuova ripresa (dev server su :5175)
npx remotion studio
npx remotion render FisicamenteOnirico out/onirico.mp4 --codec=h264 --crf=17
```

Per un reel: `--frames=<inizio>-<fine>` (es. drop A: `--frames=1440-2591`).

Clip, audio e render non vanno su git (vedi `.gitignore` della radice): si rigenerano con gli script in `tools/`.
