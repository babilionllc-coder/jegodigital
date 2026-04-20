import React from 'react';
import { Composition } from 'remotion';
import { FlamingoPromo } from './compositions/FlamingoPromo/FlamingoPromo';
import { FlamingoPromoES } from './compositions/FlamingoPromoES/FlamingoPromoES';
import { AllYTShorts } from './compositions/YoutubeShorts/AllShorts';

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="FlamingoPromo"
        component={FlamingoPromo}
        durationInFrames={1908}
        fps={30}
        width={1080}
        height={1920}
      />
      <Composition
        id="FlamingoPromoES"
        component={FlamingoPromoES}
        durationInFrames={Math.round((11.494 + 10.292 + 17.189 + 6.296 + 11.86 + 3.213 + 4.284 + 11.912) * 30) + (15 * 8)}
        fps={30}
        width={1080}
        height={1920}
      />
      <AllYTShorts />
    </>
  );
};
