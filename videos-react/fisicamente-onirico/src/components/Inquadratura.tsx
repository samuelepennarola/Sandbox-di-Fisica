import React from 'react';
import { OffthreadVideo, Sequence, interpolate, staticFile, useCurrentFrame } from 'remotion';
import { C, Key, camAt, clamp, inE, outE, pulse } from '../ritmo';

export const SW = 1000; // foglio 16:10
export const SH = 625;
export const CY = 1075; // centro verticale del foglio sullo schermo

export type Transizione = 'whipL' | 'whipR' | 'whipUp' | 'zoom' | 'cut' | 'fade' | 'none';
const PRE = 9; // fotogrammi di sovrapposizione prima del taglio

type Props = {
  da: number; // fotogramma globale del taglio d'ingresso (sul battito)
  dur: number;
  src: string;
  inizio?: number; // fotogramma della clip da cui partire (a 60 fps)
  velocita?: number;
  tema?: 'dark' | 'light';
  cam: Key[]; // fotogrammi locali (0 = taglio d'ingresso)
  entra?: Transizione;
  esce?: Transizione;
  scuoti?: (lf: number) => number; // ampiezza del tremolio
  fuoco?: [number, number, number]; // sfocatura iniziale, da, a (fotogrammi locali)
  riflesso?: boolean;
};

const Foglio: React.FC<Props & { id: string }> = ({
  id, da, dur, src, inizio = 0, velocita = 1, tema = 'dark', cam, entra = 'cut', esce = 'cut', scuoti, fuoco, riflesso = true,
}) => {
  const f = useCurrentFrame();
  const lf = f - PRE; // 0 = taglio
  const g = lf + da; // fotogramma globale, per il battito
  const c = camAt(lf, cam);

  // ingresso: arriva esattamente sul battito
  const pin = interpolate(lf, [-PRE, 0], [0, 1], { ...clamp, easing: outE });
  // uscita: parte PRE fotogrammi prima della fine
  const pout = interpolate(lf, [dur - PRE, dur], [0, 1], { ...clamp, easing: inE });
  const vIn = 1 - pin; // quanto manca all'arrivo
  let tx = 0, ty = 0, sc = 1, op = 1, bx = 0, by = 0, blur = 0;
  const dist = 1250;

  const applica = (t: Transizione, k: number, segno: number) => {
    // k: 0 = fermo, 1 = fuori scena
    if (t === 'whipL') { tx += -segno * dist * k; bx += 60 * Math.sin(Math.PI * Math.min(1, k * 1.2)); }
    if (t === 'whipR') { tx += segno * dist * k; bx += 60 * Math.sin(Math.PI * Math.min(1, k * 1.2)); }
    if (t === 'whipUp') { ty += -segno * 1700 * k; by += 60 * Math.sin(Math.PI * Math.min(1, k * 1.2)); }
    if (t === 'zoom') { sc *= segno > 0 ? 1 + 1.6 * k : 1 - 0.6 * k; op *= 1 - k; blur += 18 * k; }
    if (t === 'fade') { op *= 1 - k; blur += 10 * k; }
  };
  // in ingresso il foglio arriva dal lato opposto a quello verso cui esce il precedente
  applica(entra, vIn, -1);
  applica(esce, pout, 1);
  if (entra === 'cut' || entra === 'none') op *= lf >= 0 ? 1 : 0;
  if (entra === 'cut') sc *= 1 + 0.07 * Math.exp(-Math.max(0, lf) / 7); // colpo d'ingresso

  if (fuoco) blur += interpolate(lf, [fuoco[1], fuoco[2]], [fuoco[0], 0], { ...clamp, easing: outE });

  // battito della cassa e tremolio
  sc *= 1 + 0.014 * pulse(g);
  const sh = scuoti ? scuoti(lf) : 0;
  tx += sh * Math.sin(lf * 1.7) * 9;
  ty += sh * Math.cos(lf * 2.3) * 7;
  const rz = c.rz + sh * Math.sin(lf * 1.3) * 0.6;

  // fuoco della camera: con lo zoom il punto d'interesse va verso il centro
  const m = Math.max(0, Math.min(1, (c.s - 1) / 0.6));
  const dx = (c.fx - 0.5) * SW;
  const dy = (c.fy - 0.5) * SH;
  const X = tx + c.x - m * dx;
  const Y = ty + c.y - m * dy;
  const S = c.s * sc;

  const light = tema === 'light';
  const filtro = bx > 0.4 || by > 0.4 ? `url(#mb-${id})` : '';
  const sfoca = blur > 0.3 ? `blur(${blur}px)` : '';

  if (op <= 0.003) return null;
  return (
    <>
      <svg width={0} height={0} style={{ position: 'absolute' }}>
        <filter id={`mb-${id}`} x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation={`${bx} ${by}`} />
        </filter>
      </svg>
      <div
        style={{
          position: 'absolute',
          left: 540 - SW / 2,
          top: CY - SH / 2,
          width: SW,
          height: SH,
          opacity: op,
          transformOrigin: `${c.fx * SW}px ${c.fy * SH}px`,
          transform: `perspective(1800px) translate3d(${X}px, ${Y}px, 0) rotateX(${c.rx}deg) rotateY(${c.ry}deg) rotateZ(${rz}deg) scale(${S})`,
          filter: [filtro, sfoca].filter(Boolean).join(' ') || undefined,
          WebkitBoxReflect: riflesso
            ? 'below 26px linear-gradient(to bottom, rgba(255,255,255,0) 40%, rgba(255,255,255,0.22) 100%)'
            : undefined,
        } as React.CSSProperties}
      >
        <div
          style={{
            position: 'absolute',
            inset: 0,
            borderRadius: 30,
            overflow: 'hidden',
            background: light ? C.paper : C.bg,
            boxShadow: light
              ? '0 0 0 1.5px rgba(255,255,255,0.5), 0 30px 90px rgba(240,172,95,0.25), 0 0 140px rgba(255,240,210,0.18)'
              : `0 0 0 1.5px rgba(88,196,221,0.35), 0 30px 90px rgba(0,0,0,0.6), 0 0 ${120 + 80 * pulse(g)}px rgba(88,196,221,${0.18 + 0.15 * pulse(g)})`,
          }}
        >
          <OffthreadVideo
            src={staticFile(src)}
            muted
            startFrom={Math.max(0, Math.round(inizio - PRE * velocita))}
            playbackRate={velocita}
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          />
          {/* riflesso del vetro */}
          <div
            style={{
              position: 'absolute',
              inset: 0,
              borderRadius: 30,
              background: 'linear-gradient(125deg, rgba(255,255,255,0.10) 0%, rgba(255,255,255,0) 28%)',
              boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.25)',
            }}
          />
        </div>
      </div>
    </>
  );
};

export const Inquadratura: React.FC<Props> = (props) => {
  const id = `q${props.da}`;
  return (
    <Sequence from={props.da - PRE} durationInFrames={props.dur + PRE} layout="none">
      <Foglio {...props} id={id} />
    </Sequence>
  );
};
