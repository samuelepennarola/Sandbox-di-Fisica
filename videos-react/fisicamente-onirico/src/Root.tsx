import React from 'react';
import { Composition } from 'remotion';
import { Reel } from './Reel';
import { FPS, H, TOTAL, W } from './ritmo';

export const RemotionRoot: React.FC = () => (
  <Composition id="FisicamenteOnirico" component={Reel} durationInFrames={TOTAL} fps={FPS} width={W} height={H} />
);
