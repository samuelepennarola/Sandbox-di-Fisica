import React from 'react';
import { OffthreadVideo, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import { BEAT, C, CM, SANS, clamp, inE, outE, pulse } from '../ritmo';

// Griglia 2x2 di laboratori che entrano uno per battito
export const Griglia: React.FC<{ celle: { src: string; inizio: number; light?: boolean }[]; da: number; dur: number }> = ({
  celle, da, dur,
}) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const cw = 470, ch = 294, gap = 26;
  const out = interpolate(f, [dur - 12, dur], [0, 1], { ...clamp, easing: inE });
  // la camera si allontana piano e ruota appena
  const camS = interpolate(f, [0, dur], [1.08, 0.98], clamp) * (1 + 0.6 * out);
  const camR = interpolate(f, [0, dur], [-2, 1.5], clamp);
  return (
    <div
      style={{
        position: 'absolute',
        left: 540 - cw - gap / 2,
        top: 1075 - ch - gap / 2,
        width: cw * 2 + gap,
        height: ch * 2 + gap,
        transform: `perspective(1800px) rotateX(${8 - 4 * out}deg) rotateZ(${camR}deg) scale(${camS})`,
        opacity: 1 - out,
        filter: out > 0.02 ? `blur(${out * 16}px)` : undefined,
      }}
    >
      {celle.map((c, i) => {
        const s = spring({ frame: f - i * BEAT, fps, config: { damping: 16, stiffness: 170, mass: 0.8 } });
        const k = Math.max(0, Math.min(1, s));
        const x = (i % 2) * (cw + gap);
        const y = Math.floor(i / 2) * (ch + gap);
        const p = pulse(da + f);
        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: x,
              top: y,
              width: cw,
              height: ch,
              borderRadius: 22,
              overflow: 'hidden',
              opacity: k,
              transform: `translateY(${(1 - s) * 140}px) scale(${0.7 + 0.3 * s})`,
              background: c.light ? C.paper : C.bg,
              boxShadow: `0 0 0 1.5px rgba(88,196,221,0.35), 0 0 ${60 + 50 * p}px rgba(88,196,221,${0.16 + 0.14 * p})`,
            }}
          >
            {f >= i * BEAT - 2 && (
              <OffthreadVideo
                src={staticFile(c.src)}
                muted
                startFrom={c.inizio}
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
};

// Chiusura: logo, nome scritto lettera per lettera, frase e piattaforme
export const Finale: React.FC<{ dur: number }> = ({ dur }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const nome = 'Fisicamente';
  const logo = spring({ frame: f, fps, config: { damping: 14, stiffness: 120 } });
  const alone = 0.5 + 0.5 * Math.sin(f / 30);
  const frase = interpolate(f, [BEAT * 4, BEAT * 4 + 30], [0, 1], { ...clamp, easing: outE });
  const pill = interpolate(f, [BEAT * 6, BEAT * 6 + 26], [0, 1], { ...clamp, easing: outE });
  const linea = interpolate(f, [BEAT * 2.5, BEAT * 4], [0, 1], { ...clamp, easing: outE });
  const nero = interpolate(f, [dur - 40, dur], [0, 1], { ...clamp, easing: inE });
  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          paddingBottom: 120,
        }}
      >
        <div
          style={{
            width: 168,
            height: 168,
            borderRadius: 44,
            background: 'linear-gradient(160deg, #15161B, #0B0B0D)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontFamily: CM,
            fontStyle: 'italic',
            fontSize: 112,
            color: C.blue,
            transform: `scale(${0.4 + 0.6 * logo}) rotate(${(1 - logo) * -25}deg)`,
            opacity: Math.min(1, logo * 1.4),
            boxShadow: `0 0 0 1.5px rgba(88,196,221,0.5), 0 0 ${80 + 60 * alone}px rgba(88,196,221,${0.35 + 0.2 * alone})`,
            textShadow: `0 0 30px ${C.blue}`,
          }}
        >
          Φ
        </div>
        <div style={{ marginTop: 56, fontFamily: CM, fontSize: 150, color: C.text, letterSpacing: '-0.02em', lineHeight: 1 }}>
          {nome.split('').map((ch, i) => {
            const k = interpolate(f, [14 + i * 3, 14 + i * 3 + 22], [0, 1], { ...clamp, easing: outE });
            return (
              <span
                key={i}
                style={{
                  display: 'inline-block',
                  opacity: k,
                  transform: `translateY(${(1 - k) * 40}px)`,
                  filter: `blur(${(1 - k) * 14}px)`,
                  textShadow: '0 0 40px rgba(88,196,221,0.35)',
                }}
              >
                {ch}
              </span>
            );
          })}
        </div>
        <div
          style={{
            marginTop: 34,
            height: 2,
            width: 420 * linea,
            background: `linear-gradient(90deg, rgba(88,196,221,0), ${C.blue}, rgba(88,196,221,0))`,
          }}
        />
        <div
          style={{
            marginTop: 34,
            fontFamily: CM,
            fontStyle: 'italic',
            fontSize: 58,
            color: '#CFE9F1',
            opacity: frase,
            transform: `translateY(${(1 - frase) * 20}px)`,
            filter: `blur(${(1 - frase) * 8}px)`,
          }}
        >
          La fisica da toccare dal vivo.
        </div>
        <div
          style={{
            marginTop: 54,
            fontFamily: SANS,
            fontSize: 26,
            fontWeight: 600,
            letterSpacing: '0.22em',
            color: C.text,
            padding: '20px 40px',
            borderRadius: 999,
            border: '1.5px solid rgba(88,196,221,0.45)',
            background: 'rgba(88,196,221,0.08)',
            boxShadow: '0 0 40px rgba(88,196,221,0.18)',
            opacity: pill,
            transform: `translateY(${(1 - pill) * 20}px)`,
          }}
        >
          IPAD · MAC
        </div>
      </div>
      <div style={{ position: 'absolute', inset: 0, background: '#000', opacity: nero }} />
    </div>
  );
};

// Silenzio prima del drop: una frase sola, al centro
export const Sospeso: React.FC<{ dur: number; parole: string[] }> = ({ dur, parole }) => {
  const f = useCurrentFrame();
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: CM,
        fontStyle: 'italic',
        fontSize: 96,
        color: C.text,
      }}
    >
      {parole.map((p, i) => {
        const k = interpolate(f, [i * 5, i * 5 + 12], [0, 1], { ...clamp, easing: outE });
        const sc = interpolate(f, [0, dur], [1, 1.08]);
        return (
          <span
            key={i}
            style={{
              display: 'inline-block',
              marginRight: 26,
              opacity: k,
              transform: `scale(${sc}) translateY(${(1 - k) * 24}px)`,
              filter: `blur(${(1 - k) * 10}px)`,
              color: i === parole.length - 1 ? C.gold : C.text,
              textShadow: i === parole.length - 1 ? `0 0 40px ${C.gold}` : '0 0 30px rgba(255,255,255,0.25)',
            }}
          >
            {p}
          </span>
        );
      })}
    </div>
  );
};

// Rivelazione del nome sul primo colpo del groove
export const Rivelazione: React.FC<{ dur: number }> = ({ dur }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const nome = 'Fisicamente';
  const logo = spring({ frame: f, fps, config: { damping: 13, stiffness: 140 } });
  const kick = interpolate(f, [0, 14], [0, 1], { ...clamp, easing: outE });
  const sotto = interpolate(f, [BEAT * 2, BEAT * 2 + 24], [0, 1], { ...clamp, easing: outE });
  const esci = interpolate(f, [dur - 16, dur], [0, 1], { ...clamp, easing: inE });
  const zoom = interpolate(f, [0, dur], [1, 1.06]) * (1 + 0.5 * esci);
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        paddingBottom: 60,
        opacity: 1 - esci,
        transform: `scale(${zoom})`,
        filter: esci > 0.02 ? `blur(${esci * 18}px)` : undefined,
      }}
    >
      <div style={{ fontFamily: SANS, fontSize: 24, fontWeight: 600, letterSpacing: '0.42em', color: C.blue, opacity: kick, textShadow: '0 0 18px rgba(88,196,221,0.7)' }}>
        PRESENTIAMO
      </div>
      <div
        style={{
          marginTop: 60,
          width: 150,
          height: 150,
          borderRadius: 40,
          background: 'linear-gradient(160deg, #15161B, #0B0B0D)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: CM,
          fontStyle: 'italic',
          fontSize: 100,
          color: C.blue,
          transform: `scale(${0.3 + 0.7 * logo})`,
          opacity: Math.min(1, logo * 1.5),
          boxShadow: `0 0 0 1.5px rgba(88,196,221,0.55), 0 0 ${110 + 60 * pulse(f + 288)}px rgba(88,196,221,0.5)`,
          textShadow: `0 0 30px ${C.blue}`,
        }}
      >
        Φ
      </div>
      <div style={{ marginTop: 50, fontFamily: CM, fontSize: 164, color: C.text, letterSpacing: '-0.02em', lineHeight: 1 }}>
        {nome.split('').map((ch, i) => {
          const k = interpolate(f, [6 + i * 2.5, 6 + i * 2.5 + 20], [0, 1], { ...clamp, easing: outE });
          return (
            <span key={i} style={{ display: 'inline-block', opacity: k, transform: `translateY(${(1 - k) * 50}px) scale(${0.8 + 0.2 * k})`, filter: `blur(${(1 - k) * 16}px)`, textShadow: '0 0 50px rgba(88,196,221,0.45)' }}>
              {ch}
            </span>
          );
        })}
      </div>
      <div style={{ marginTop: 40, fontFamily: CM, fontStyle: 'italic', fontSize: 52, color: '#CFE9F1', opacity: sotto, transform: `translateY(${(1 - sotto) * 18}px)`, filter: `blur(${(1 - sotto) * 8}px)` }}>
        La fisica, finalmente da toccare.
      </div>
    </div>
  );
};

// Parola gigante del drop B, entra sul primo battito della battuta
export const ParolaGrande: React.FC<{ testo: string; colore: string; dur: number }> = ({ testo, colore, dur }) => {
  const f = useCurrentFrame();
  const k = interpolate(f, [0, 12], [0, 1], { ...clamp, easing: outE });
  const u = interpolate(f, [dur - 10, dur], [0, 1], { ...clamp, easing: inE });
  const sc = interpolate(f, [0, dur], [1.12, 1.0], { ...clamp, easing: outE });
  return (
    <div style={{ position: 'absolute', top: 250, left: 0, right: 0, textAlign: 'center' }}>
      <span
        style={{
          display: 'inline-block',
          fontFamily: CM,
          fontStyle: 'italic',
          fontSize: 170,
          color: colore,
          opacity: k * (1 - u),
          transform: `scale(${sc * (0.85 + 0.15 * k)})`,
          filter: `blur(${(1 - k) * 14 + u * 12}px)`,
          textShadow: `0 0 60px ${colore}88`,
          letterSpacing: '-0.02em',
        }}
      >
        {testo}
      </span>
    </div>
  );
};
