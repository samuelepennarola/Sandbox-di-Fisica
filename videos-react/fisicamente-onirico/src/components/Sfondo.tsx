import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { C, H, OUT, W, b, lerp, pulse, rand } from '../ritmo';

// Intensità della scena: buio nell'intro, sale col groove, piena nel drop
const energia = (f: number) => {
  if (f < b(2)) return lerp(f, 0, b(2), 0.25, 0.5);
  if (f < b(10)) return lerp(f, b(2), b(9, 3), 0.5, 0.75);
  if (f < b(18)) return 1;
  if (f < b(20)) return lerp(f, b(18), b(19, 3), 0.45, 0.8);
  if (f < b(OUT)) return 1;
  return lerp(f, b(OUT), b(OUT + 3), 0.8, 0.35);
};

const PARTICELLE = Array.from({ length: 64 }, (_, i) => ({
  x: rand(i * 3.1) * W,
  y: rand(i * 7.7) * H,
  r: 1 + rand(i * 1.9) ** 3 * 9,
  v: 0.15 + rand(i * 5.3) * 0.5,
  z: rand(i * 2.2),
  c: [C.blue, C.gold, '#ffffff', C.teal][Math.floor(rand(i * 9.1) * 4)],
  ph: rand(i * 4.4) * Math.PI * 2,
}));

export const Sfondo: React.FC = () => {
  const f = useCurrentFrame();
  const e = energia(f);
  const p = pulse(f);

  // Piano cartesiano che scorre verso di noi sotto al foglio
  const passo = 120;
  const scorri = (f * 0.9) % passo;
  const linee: React.ReactNode[] = [];
  for (let i = -12; i <= 12; i++) {
    linee.push(<line key={'v' + i} x1={540 + i * passo} y1={-400} x2={540 + i * passo} y2={2400} />);
  }
  for (let j = -4; j < 22; j++) {
    const y = j * passo + scorri;
    linee.push(<line key={'h' + j} x1={-1200} y1={y} x2={2280} y2={y} />);
  }

  return (
    <AbsoluteFill style={{ background: C.bg, overflow: 'hidden' }}>
      {/* bagliori di fondo */}
      <AbsoluteFill
        style={{
          background: `radial-gradient(ellipse 70% 38% at 50% 56%, rgba(88,196,221,${0.10 * e + 0.08 * p}) 0%, rgba(88,196,221,0) 70%)`,
        }}
      />
      <AbsoluteFill
        style={{
          background: `radial-gradient(circle at ${50 + 30 * Math.sin(f / 170)}% ${22 + 8 * Math.cos(f / 210)}%, rgba(154,114,172,${0.16 * e}) 0%, rgba(154,114,172,0) 42%)`,
          mixBlendMode: 'screen',
        }}
      />
      <AbsoluteFill
        style={{
          background: `radial-gradient(circle at ${40 - 28 * Math.cos(f / 190)}% ${86 + 6 * Math.sin(f / 150)}%, rgba(240,172,95,${0.10 * e}) 0%, rgba(240,172,95,0) 45%)`,
          mixBlendMode: 'screen',
        }}
      />
      {/* pavimento: NumberPlane in prospettiva */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: 1180,
          width: W,
          height: 1100,
          perspective: 900,
          perspectiveOrigin: '50% 0%',
          maskImage: 'linear-gradient(to bottom, transparent 0%, black 30%, black 70%, transparent 100%)',
          WebkitMaskImage: 'linear-gradient(to bottom, transparent 0%, black 22%, black 70%, transparent 100%)',
        }}
      >
        <svg
          width={W}
          height={2000}
          viewBox={`0 0 ${W} 2000`}
          style={{ position: 'absolute', left: 0, top: 0, transform: 'rotateX(72deg)', transformOrigin: '50% 0%' }}
        >
          <g stroke={C.blue} strokeWidth={2} opacity={0.16 + 0.12 * e + 0.15 * p}>
            {linee}
          </g>
        </svg>
      </div>
      {/* griglia verticale sottile in alto */}
      <svg width={W} height={H} style={{ position: 'absolute', inset: 0, opacity: 0.05 + 0.03 * e }}>
        <g stroke={C.blue} strokeWidth={1}>
          {Array.from({ length: 10 }, (_, i) => (
            <line key={i} x1={i * 120 + 60} y1={0} x2={i * 120 + 60} y2={1100} />
          ))}
          {Array.from({ length: 10 }, (_, i) => (
            <line key={'r' + i} x1={0} y1={i * 120 + 20} x2={W} y2={i * 120 + 20} />
          ))}
        </g>
      </svg>
      {/* particelle sognanti */}
      {PARTICELLE.map((q, i) => {
        const y = (((q.y - f * q.v * (1 + q.z)) % H) + H) % H;
        const x = q.x + 26 * Math.sin(f / 90 + q.ph);
        const tw = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(f / 40 + q.ph));
        const big = q.r > 5;
        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: x,
              top: y,
              width: q.r * 2,
              height: q.r * 2,
              borderRadius: '50%',
              background: q.c,
              opacity: (big ? 0.10 : 0.55) * tw * (0.4 + 0.6 * e) * (1 + 0.6 * p),
              filter: big ? `blur(${q.r * 0.6}px)` : undefined,
              boxShadow: big ? undefined : `0 0 ${q.r * 4}px ${q.c}`,
            }}
          />
        );
      })}
    </AbsoluteFill>
  );
};

// Vignettatura e lampi sopra a tutto
export const Velo: React.FC<{ lampi: { f: number; forza: number; dur?: number }[] }> = ({ lampi }) => {
  const f = useCurrentFrame();
  let flash = 0;
  for (const l of lampi) {
    const d = f - l.f;
    const dur = l.dur ?? 22;
    if (d >= -2 && d < dur) flash = Math.max(flash, l.forza * (d < 0 ? 0.5 : Math.exp(-d / (dur / 4))));
  }
  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      <AbsoluteFill
        style={{ background: 'radial-gradient(ellipse 85% 70% at 50% 50%, rgba(0,0,0,0) 55%, rgba(0,0,0,0.65) 100%)' }}
      />
      {flash > 0.005 && (
        <AbsoluteFill
          style={{
            background: 'radial-gradient(circle at 50% 55%, #ffffff 0%, #dff6fb 45%, #9fdcec 100%)',
            opacity: flash,
            mixBlendMode: 'screen',
          }}
        />
      )}
    </AbsoluteFill>
  );
};
