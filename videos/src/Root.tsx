import React from 'react';
import { Composition } from 'remotion';
import { FlamingoPromo } from './compositions/FlamingoPromo/FlamingoPromo';
import { FlamingoPromoES } from './compositions/FlamingoPromoES/FlamingoPromoES';
import { AllYTShorts } from './compositions/YoutubeShorts/AllShorts';
import { PreventaPromo, getTotalFrames } from './compositions/PreventaPromo/PreventaPromo';

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
      {/* Lanzamiento Preventa promo · 1920x1080 · 16:9 · landing-page hero */}
      <Composition
        id="PreventaPromoES"
        component={PreventaPromo}
        durationInFrames={getTotalFrames('es')}
        fps={30}
        width={1920}
        height={1080}
        defaultProps={{ lang: 'es' as const }}
      />
      <Composition
        id="PreventaPromoEN"
        component={PreventaPromo}
        durationInFrames={getTotalFrames('en')}
        fps={30}
        width={1920}
        height={1080}
        defaultProps={{ lang: 'en' as const }}
      />
      <AllYTShorts />
    </>
  );
};
