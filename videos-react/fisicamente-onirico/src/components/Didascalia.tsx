import React from 'react';
import { Sequence, interpolate, useCurrentFrame } from 'remotion';
import { C, CM, SANS, clamp, inE, outE } from '../ritmo';

// Parola: testo, colore, corsivo
export type P = { t: string; c?: string; i?: boolean };
export type Riga = { at: number; parole: P[]; passo?: number }; // at: fotogramma locale

const Parola: React.FC<{ p: P; at: number; f: number; uscita: number; size: number }> = ({ p, at, f, uscita, size }) => {
  const k = interpolate(f, [at, at + 18], [0, 1], { ...clamp, easing: outE });
  const u = interpolate(f, [uscita, uscita + 12], [0, 1], { ...clamp, easing: inE });
  if (k <= 0) return null;
  return (
    <span
      style={{
        display: 'inline-block',
        marginRight: size * 0.26,
        color: p.c ?? C.text,
        fontStyle: p.i ? 'italic' : 'normal',
        opacity: k * (1 - u),
        transform: `translateY(${(1 - k) * 34 - u * 16}px)`,
        filter: `blur(${(1 - k) * 12 + u * 10}px)`,
        textShadow: p.c ? `0 0 28px ${p.c}66` : '0 0 24px rgba(255,255,255,0.18)',
      }}
    >
      {p.t}
    </span>
  );
};

const Corpo: React.FC<{ kicker?: string; righe: Riga[]; dur: number; size: number; top: number }> = ({
  kicker, righe, dur, size, top,
}) => {
  const f = useCurrentFrame();
  const uscita = dur - 14;
  const kk = interpolate(f, [0, 16], [0, 1], { ...clamp, easing: outE });
  const ku = interpolate(f, [uscita, uscita + 12], [0, 1], { ...clamp, easing: inE });
  // linea che si disegna sotto il kicker (Create di Manim)
  const linea = interpolate(f, [4, 34], [0, 1], { ...clamp, easing: outE });
  return (
    <div
      style={{
        position: 'absolute',
        top,
        left: 60,
        right: 60,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        textAlign: 'center',
      }}
    >
      {kicker && (
        <div style={{ opacity: kk * (1 - ku), display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <div
            style={{
              fontFamily: SANS,
              fontSize: 22,
              fontWeight: 600,
              letterSpacing: '0.32em',
              color: C.blue,
              textShadow: '0 0 18px rgba(88,196,221,0.6)',
              transform: `translateY(${(1 - kk) * 10}px)`,
            }}
          >
            {kicker}
          </div>
          <div
            style={{
              marginTop: 14,
              height: 2,
              width: 160 * linea,
              background: `linear-gradient(90deg, rgba(88,196,221,0), ${C.blue}, rgba(88,196,221,0))`,
            }}
          />
        </div>
      )}
      <div style={{ marginTop: 26 }}>
        {righe.map((r, i) => (
          <div key={i} style={{ fontFamily: CM, fontSize: size, lineHeight: 1.18, letterSpacing: '-0.01em' }}>
            {r.parole.map((p, j) => (
              <Parola key={j} p={p} at={r.at + j * (r.passo ?? 5)} f={f} uscita={uscita} size={size} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
};

export const Didascalia: React.FC<{
  da: number;
  dur: number;
  kicker?: string;
  righe: Riga[];
  size?: number;
  top?: number;
}> = ({ da, dur, kicker, righe, size = 70, top = 250 }) => (
  <Sequence from={da} durationInFrames={dur} layout="none">
    <Corpo kicker={kicker} righe={righe} dur={dur} size={size} top={top} />
  </Sequence>
);

// Parole semplici: "Tocca un *vettore*" -> parole, con *...* colorate in corsivo
export const w = (s: string, c: string = C.blue): P[] => {
  let dentro = false;
  return s.split(' ').map((t) => {
    if (t.startsWith('*')) dentro = true;
    const p: P = dentro ? { t: t.replace(/\*/g, ''), c, i: true } : { t };
    if (t.endsWith('*')) dentro = false;
    return p;
  });
};

// Velatura scura in alto: le didascalie restano leggibili anche con il foglio zoomato
export const Velatura: React.FC = () => (
  <div
    style={{
      position: 'absolute',
      left: 0,
      right: 0,
      top: 0,
      height: 760,
      background:
        'linear-gradient(to bottom, rgba(11,11,13,0.92) 0%, rgba(11,11,13,0.78) 38%, rgba(11,11,13,0.35) 62%, rgba(11,11,13,0) 100%)',
      pointerEvents: 'none',
    }}
  />
);
