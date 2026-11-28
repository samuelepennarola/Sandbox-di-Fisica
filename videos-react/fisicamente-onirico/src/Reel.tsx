import React from 'react';
import { AbsoluteFill, Audio, Sequence, staticFile } from 'remotion';
import { Sfondo, Velo } from './components/Sfondo';
import { Inquadratura, Transizione } from './components/Inquadratura';
import { Didascalia, Velatura, w } from './components/Didascalia';
import { Finale, Griglia, ParolaGrande, Rivelazione, Sospeso } from './components/Finale';
import { BAR, BEAT, C, OUT, TOTAL, b, inE, outE } from './ritmo';

const K = (s: string) => `clips/${s}.mp4`;
const N = (s: string) => `clips/nuove/${s}.mp4`;
const BAR2 = BAR * 2;

// Film di lancio: ogni taglio cade su un battito della musica (100 BPM, 36 fotogrammi).
// Capitoli pensati anche per essere tagliati come reel singoli.
export const Reel: React.FC = () => {
  // Drop B: un'inquadratura ogni due battiti, parole giganti una per battuta
  const finale8: { src: string; inizio: number; fx?: number; fy?: number; light?: boolean }[] = [
    { src: N('11_threebody'), inizio: 120, fx: 0.42, fy: 0.3 },
    { src: N('12_sources'), inizio: 100, fx: 0.42, fy: 0.45 },
    { src: K('02_cannon_orbit'), inizio: 150, fx: 0.4, fy: 0.45 },
    { src: N('15_charges'), inizio: 60, fx: 0.42, fy: 0.5 },
    { src: N('21_circular'), inizio: 40, fx: 0.37, fy: 0.5 },
    { src: N('18_string'), inizio: 150 },
    { src: K('08_lorentz_derive'), inizio: 200, fx: 0.5, fy: 0.42 },
    { src: N('19_bernoulli'), inizio: 120 },
  ];
  const trans: Transizione[] = ['whipL', 'cut', 'whipR', 'cut', 'whipUp', 'cut', 'zoom', 'cut'];
  const parole = [
    { t: 'Toccala.', c: C.blue },
    { t: 'Muovila.', c: C.teal },
    { t: 'Esplorala.', c: C.gold },
    { t: 'Capiscila.', c: C.yellow },
  ];

  return (
    <AbsoluteFill style={{ background: C.bg }}>
      <Audio src={staticFile('audio/onirica.wav')} />
      <Sfondo />

      {/* 0-1 · APERTURA: macro sul vettore, messa a fuoco, poi la camera si allontana */}
      <Inquadratura
        da={0} dur={b(2)} src={K('01_projectile_ui')} velocita={0.79} entra="fade" esce="zoom"
        fuoco={[22, 0, 80]}
        cam={[
          { f: 0, s: 2.3, fx: 0.16, fy: 0.6, rx: 16, ry: -14 },
          { f: 206, s: 1.95, fx: 0.2, fy: 0.56, rx: 12, ry: -10, e: (t) => t },
          { f: 280, s: 1, fx: 0.5, fy: 0.5, rx: 5, ry: -4 },
        ]}
      />
      {/* 2 · RIVELAZIONE DEL NOME */}
      <Sequence from={b(2)} durationInFrames={BAR} layout="none">
        <Rivelazione dur={BAR} />
      </Sequence>

      {/* 3-7 · MECCANICA E GRAVITAZIONE */}
      <Inquadratura
        da={b(3)} dur={BAR} src={K('02_cannon_orbit')} inizio={108} entra="zoom" esce="whipL"
        cam={[{ f: 0, s: 1.5, fx: 0.32, fy: 0.28, rx: 8, ry: 10 }, { f: 134, s: 1, fx: 0.5, fy: 0.5, rx: 4, ry: -6 }]}
      />
      <Inquadratura
        da={b(4)} dur={BAR} src={K('04_incline_rewind')} inizio={40} entra="whipL" esce="zoom"
        cam={[
          { f: 0, s: 1, ry: 8 },
          { f: 30, s: 1.05 },
          { f: 46, s: 2.0, fx: 0.22, fy: 0.28, ry: 0, rx: 3, e: outE },
          { f: 144, s: 2.2, fx: 0.24, fy: 0.3 },
        ]}
      />
      <Inquadratura
        da={b(5)} dur={BAR} src={N('11_threebody')} inizio={30} entra="zoom" esce="whipR"
        cam={[{ f: 0, s: 1.35, fx: 0.42, fy: 0.3, rx: 10, ry: -12 }, { f: 144, s: 1.75, fx: 0.42, fy: 0.3, rx: 4, ry: 10 }]}
      />
      <Inquadratura
        da={b(6)} dur={BAR} src={N('16_collision2d')} inizio={60} entra="whipR" esce="whipUp"
        cam={[{ f: 0, s: 1, ry: 8 }, { f: 144, s: 1.3, fx: 0.42, fy: 0.52, ry: -4 }]}
      />
      <Inquadratura
        da={b(7)} dur={BAR} src={K('09_orbits_3d')} inizio={20} entra="whipUp" esce="cut"
        cam={[{ f: 0, s: 1.5, fx: 0.4, fy: 0.5, rz: -3 }, { f: 144, s: 1.1, fx: 0.45, fy: 0.5, rz: 2 }]}
      />

      {/* 8-9 · OSCILLAZIONI E ONDE: i tagli si fanno più fitti, poi il silenzio */}
      <Inquadratura
        da={b(8)} dur={BEAT * 2} src={N('13_pendulum')} inizio={40}
        cam={[{ f: 0, s: 1.3, fx: 0.43, fy: 0.6 }, { f: 72, s: 1.45, fx: 0.43, fy: 0.65 }]}
      />
      <Inquadratura
        da={b(8, 2)} dur={BEAT * 2} src={N('18_string')} inizio={60}
        cam={[{ f: 0, s: 1.35, fx: 0.4, fy: 0.42, rz: -2 }, { f: 72, s: 1.55, rz: 1 }]}
      />
      <Inquadratura
        da={b(9)} dur={54} src={N('12_sources')} inizio={40} scuoti={(lf) => lf / 54}
        cam={[{ f: 0, s: 1.6, fx: 0.42, fy: 0.45 }, { f: 54, s: 1.15, fx: 0.45, fy: 0.45, e: inE }]}
      />
      <Inquadratura
        da={b(9) + 54} dur={27} src={N('14_gfield')} inizio={100} scuoti={() => 1}
        cam={[{ f: 0, s: 1.3, fx: 0.45, fy: 0.48 }, { f: 27, s: 1.55 }]}
      />
      <Inquadratura
        da={b(9) + 81} dur={27} src={K('03_rolling_3d')} inizio={150} scuoti={() => 1.3} esce="zoom"
        cam={[{ f: 0, s: 1.2, fx: 0.4, fy: 0.45 }, { f: 27, s: 1.6 }]}
      />
      <Sequence from={b(9, 3)} durationInFrames={BEAT} layout="none">
        <Sospeso dur={BEAT} parole={['E', 'adesso,', 'il', 'bello.']} />
      </Sequence>

      {/* 10-17 · DROP A */}
      <Inquadratura
        da={b(10)} dur={BAR2} src={K('08_lorentz_derive')} inizio={6} entra="cut" esce="whipL"
        cam={[
          { f: 0, s: 1.15, rx: 6, ry: 6 },
          { f: 60, s: 1, rx: 0, ry: 0 },
          { f: 250, s: 1.8, fx: 0.5, fy: 0.42 },
          { f: 288, s: 1.9 },
        ]}
      />
      <Inquadratura
        da={b(12)} dur={BAR} src={N('15_charges')} inizio={0} entra="whipL" esce="whipR"
        cam={[{ f: 0, s: 1.7, fx: 0.4, fy: 0.52, rx: 6 }, { f: 144, s: 1, fx: 0.5, fy: 0.5, rx: 0, ry: -6 }]}
      />
      <Inquadratura
        da={b(13)} dur={BEAT * 2} src={K('05_stevin_jets')} inizio={110} entra="whipR"
        cam={[{ f: 0, s: 1.25, fx: 0.45, fy: 0.5, rz: -2 }, { f: 72, s: 1.45, rz: 1 }]}
      />
      <Inquadratura
        da={b(13, 2)} dur={BEAT * 2} src={N('19_bernoulli')} inizio={60} esce="zoom"
        cam={[{ f: 0, s: 1.4, fx: 0.42, fy: 0.45 }, { f: 72, s: 1.15, fx: 0.45, fy: 0.5 }]}
      />
      <Inquadratura
        da={b(14)} dur={BAR} src={N('20_spring')} inizio={0} entra="zoom" esce="whipR"
        cam={[{ f: 0, s: 1.15, fx: 0.42, fy: 0.4, ry: 8 }, { f: 144, s: 1.45, fx: 0.43, fy: 0.45, ry: -4 }]}
      />
      <Inquadratura
        da={b(15)} dur={BAR} src={N('21_circular')} inizio={0} entra="whipR" esce="whipL"
        cam={[{ f: 0, s: 1.6, fx: 0.37, fy: 0.5, rz: -4 }, { f: 144, s: 1.2, fx: 0.4, fy: 0.5, rz: 2 }]}
      />
      <Inquadratura
        da={b(16)} dur={BAR} src={N('17_angmom')} inizio={60} entra="whipL" esce="whipUp"
        cam={[{ f: 0, s: 1.2, fx: 0.35, fy: 0.55, ry: -10 }, { f: 144, s: 1.5, fx: 0.33, fy: 0.55, ry: 8 }]}
      />
      <Inquadratura
        da={b(17)} dur={BAR} src={K('06_builder_pulley')} inizio={60} entra="whipUp" esce="fade"
        cam={[{ f: 0, s: 1.0, rx: 6 }, { f: 72, s: 1.2, fx: 0.55, fy: 0.4 }, { f: 144, s: 1.55, fx: 0.6, fy: 0.35, e: inE }]}
      />

      {/* 18-19 · RESPIRO */}
      <Inquadratura
        da={b(18)} dur={BAR} src={N('12_sources')} inizio={60} velocita={0.5} entra="fade" esce="fade"
        fuoco={[14, 0, 60]}
        cam={[{ f: 0, s: 1.75, fx: 0.42, fy: 0.45, rz: -4 }, { f: 144, s: 1.3, fx: 0.43, fy: 0.45, rz: 3, e: (t) => t }]}
      />
      <Sequence from={b(19)} durationInFrames={BEAT * 3} layout="none">
        <Griglia
          da={b(19)} dur={BEAT * 3}
          celle={[
            { src: N('11_threebody'), inizio: 60 },
            { src: K('10_archimedes_light'), inizio: 40, light: true },
            { src: N('13_pendulum'), inizio: 150 },
            { src: N('17_angmom'), inizio: 100 },
          ]}
        />
      </Sequence>
      <Sequence from={b(19, 3)} durationInFrames={BEAT} layout="none">
        <Sospeso dur={BEAT} parole={['Ora', 'tocca', 'a', 'te.']} />
      </Sequence>

      {/* 20-23 · DROP B */}
      {finale8.map((c, i) => (
        <Inquadratura
          key={i}
          da={b(20) + i * BEAT * 2} dur={BEAT * 2} src={c.src} inizio={c.inizio} tema={c.light ? 'light' : 'dark'}
          entra={trans[i]} esce={i === 7 ? 'zoom' : trans[i + 1]}
          cam={[
            { f: 0, s: 1.35, fx: c.fx ?? 0.45, fy: c.fy ?? 0.45, rz: i % 2 ? 2 : -2, ry: i % 2 ? -6 : 6 },
            { f: 72, s: 1.12, rz: 0, ry: 0, e: outE },
          ]}
        />
      ))}

      {/* 24-26 · CHIUSURA */}
      <Sequence from={b(OUT)} durationInFrames={TOTAL - b(OUT)} layout="none">
        <Finale dur={TOTAL - b(OUT)} />
      </Sequence>

      {/* DIDASCALIE */}
      <Sequence from={0} durationInFrames={b(OUT)} layout="none">
        <Velatura />
      </Sequence>
      <Didascalia da={0} dur={276} righe={[{ at: 30, parole: w('C’è un modo nuovo') }, { at: 130, parole: w('di *guardare* la fisica.') }]} />
      <Didascalia da={b(3)} dur={138} kicker="GRAVITAZIONE" righe={[{ at: 8, parole: w('Spara più forte:') }, { at: 72, parole: w('la caduta diventa *un’orbita.*') }]} />
      <Didascalia da={b(4)} dur={138} kicker="FORZE E MOVIOLA" righe={[{ at: 8, parole: w('Tocca un corpo:') }, { at: 44, parole: w('ecco le sue *forze.*', C.yellow) }]} />
      <Didascalia da={b(5)} dur={138} kicker="IL PROBLEMA DEI TRE CORPI" righe={[{ at: 8, parole: w('Tre masse,') }, { at: 72, parole: w('*una coreografia.*', C.gold) }]} />
      <Didascalia da={b(6)} dur={138} kicker="URTI NEL PIANO" righe={[{ at: 8, parole: w('Quantità di moto') }, { at: 72, parole: w('*conservata.*', C.red) }]} />
      <Didascalia da={b(7)} dur={138} kicker="KEPLERO IN 3D" righe={[{ at: 8, parole: w('Ruota lo spazio,') }, { at: 72, parole: w('guarda *le aree.*', C.yellow) }]} />
      <Didascalia da={b(8)} dur={140} kicker="OSCILLAZIONI E ONDE" righe={[{ at: 6, parole: w('Guarda il moto') }, { at: 72, parole: w('diventare *grafico.*', C.teal) }]} />
      <Didascalia da={b(9)} dur={104} kicker="E ANCORA" righe={[{ at: 4, parole: w('Interferenza, campi,') }, { at: 54, parole: w('*rotolamento.*') }]} />
      <Didascalia da={b(10)} dur={282} kicker="DERIVAZIONI ANIMATE" righe={[{ at: 14, parole: w('Ogni formula') }, { at: 100, parole: w('ti mostra *da dove nasce.*') }]} />
      <Didascalia da={b(12)} dur={138} kicker="CARICHE E CAMPO" righe={[{ at: 8, parole: w('Sposta una carica:') }, { at: 72, parole: w('il *campo* si ridisegna.') }]} />
      <Didascalia da={b(13)} dur={138} kicker="FLUIDI" righe={[{ at: 8, parole: w('Stevino, Torricelli,') }, { at: 72, parole: w('*Bernoulli.*', C.teal) }]} />
      <Didascalia da={b(14)} dur={138} kicker="MASSA E MOLLA" righe={[{ at: 8, parole: w('Il moto armonico') }, { at: 72, parole: w('*si scrive da solo.*', C.teal) }]} />
      <Didascalia da={b(15)} dur={138} kicker="MOTO CIRCOLARE" righe={[{ at: 8, parole: w('Velocità tangente,') }, { at: 72, parole: w('accelerazione *centripeta.*', C.yellow) }]} />
      <Didascalia da={b(16)} dur={138} kicker="CORPO RIGIDO IN 3D" righe={[{ at: 8, parole: w('Momento angolare,') }, { at: 72, parole: w('*in tre dimensioni.*', C.gold) }]} />
      <Didascalia da={b(17)} dur={138} kicker="COSTRUTTORE LIBERO" righe={[{ at: 8, parole: w('Oppure costruisci') }, { at: 72, parole: w('il tuo esperimento *da zero.*') }]} />
      <Didascalia da={b(18)} dur={140} righe={[{ at: 20, parole: w('Pensata per *iPad*') }, { at: 80, parole: w('e per il Mac.') }]} />
      <Didascalia da={b(19)} dur={104} kicker="TUTTO IN UNA SOLA APP" righe={[{ at: 6, parole: w('26 laboratori.') }, { at: 40, parole: w('*100% offline.*') }]} />
      {parole.map((p, i) => (
        <Sequence key={i} from={b(20 + i)} durationInFrames={BAR} layout="none">
          <ParolaGrande testo={p.t} colore={p.c} dur={BAR} />
        </Sequence>
      ))}

      <Velo
        lampi={[
          { f: b(2), forza: 0.7, dur: 30 },
          { f: b(3), forza: 0.14 },
          { f: b(8), forza: 0.12 },
          { f: b(9), forza: 0.14 },
          { f: b(10), forza: 0.95, dur: 34 },
          { f: b(12), forza: 0.16 },
          { f: b(13), forza: 0.16 },
          { f: b(14), forza: 0.16 },
          { f: b(15), forza: 0.16 },
          { f: b(16), forza: 0.16 },
          { f: b(17), forza: 0.16 },
          { f: b(20), forza: 0.95, dur: 34 },
          { f: b(21), forza: 0.25 },
          { f: b(22), forza: 0.3 },
          { f: b(23), forza: 0.3 },
          { f: b(OUT), forza: 0.9, dur: 40 },
        ]}
      />
    </AbsoluteFill>
  );
};
