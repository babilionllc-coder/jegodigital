import React from 'react';
import { Composition } from 'remotion';
import { YoutubeShort, ShortProps } from './YoutubeShort';

// 57s @ 30fps
const TOTAL = 1710;

const SHORTS: Array<{ id: string } & ShortProps> = [
  {
    id: 'YTShort-V1-WhatsApp',
    hookStat: '21x',
    hookStatLabel: 'MÁS PROBABILIDAD',
    hookText: 'de cerrar si respondes en 5 minutos',
    hookPillar: 'WHATSAPP & LEADS',
    clip1: 'shorts/v1_clip1.mp4',
    clip2: 'shorts/v1_clip2.mp4',
    voiceover: 'shorts/vo/v1_whatsapp_speed.mp3',
    ctaLine1: '¿Tu inmobiliaria pierde leads por respuesta lenta?',
    captions: [
      { text: '¿Sabías que responder',        startSec: 3.0,  endSec: 5.0  },
      { text: 'a un lead en 5 minutos...',    startSec: 5.0,  endSec: 7.5  },
      { text: 'te da 21 veces',               startSec: 7.5,  endSec: 9.5  },
      { text: 'más probabilidad de cerrar?',  startSec: 9.5,  endSec: 11.5 },
      { text: 'La mayoría responde en horas', startSec: 12.0, endSec: 14.5 },
      { text: 'Nosotros: segundos. 24/7.',    startSec: 14.5, endSec: 16.5 },
      { text: '¿Cuántos leads perdiste?',     startSec: 16.8, endSec: 18.5 },
    ],
  },
  {
    id: 'YTShort-V2-Property',
    hookStat: '48H',
    hookStatLabel: 'DE ENTREGA',
    hookText: 'videos cinématicos de tus propiedades — solo con fotos',
    hookPillar: 'VIDEOS DE PROPIEDADES',
    clip1: 'shorts/v2_clip1.mp4',
    clip2: 'shorts/v2_clip2.mp4',
    voiceover: 'shorts/vo/v2_property_videos.mp3',
    ctaLine1: 'Convierte tus fotos en videos que venden en 48 horas.',
    captions: [
      { text: 'Tus fotos de propiedades',     startSec: 3.0,  endSec: 5.0  },
      { text: 'valen más de lo que crees.',   startSec: 5.0,  endSec: 7.0  },
      { text: 'Videos cinematográficos',      startSec: 7.5,  endSec: 9.5  },
      { text: 'en 48 horas.',                 startSec: 9.5,  endSec: 11.0 },
      { text: 'Motion. Transiciones.',        startSec: 11.5, endSec: 13.5 },
      { text: 'Música profesional.',          startSec: 13.5, endSec: 15.0 },
      { text: 'Sin cámara. Sin edición.',     startSec: 15.5, endSec: 17.5 },
      { text: '¿Qué propiedad conviertes?',   startSec: 18.0, endSec: 20.0 },
    ],
  },
  {
    id: 'YTShort-V3-Google',
    hookStat: '#1',
    hookStatLabel: 'EN GOOGLE MAPS',
    hookText: 'eso es lo que logra una inmobiliaria con SEO bien hecho',
    hookPillar: 'VISIBILIDAD LOCAL',
    clip1: 'shorts/v3_clip1.mp4',
    clip2: 'shorts/v3_clip2.mp4',
    voiceover: 'shorts/vo/v3_google_visibility.mp3',
    ctaLine1: '¿Cuándo fue la última vez que apareciste en Google Maps?',
    captions: [
      { text: '¿Tu inmobiliaria en Google Maps?', startSec: 3.0,  endSec: 6.0  },
      { text: 'Si no eres de los primeros 3',     startSec: 6.0,  endSec: 8.5  },
      { text: 'ese lead fue a tu competencia.',   startSec: 8.5,  endSec: 11.0 },
      { text: 'Flamingo: invisible → #1 Cancún', startSec: 11.5, endSec: 14.5 },
      { text: 'En 90 días. Sin pagar ads.',       startSec: 14.5, endSec: 17.5 },
    ],
  },
  {
    id: 'YTShort-V4-ChatGPT',
    hookStat: '34%',
    hookStatLabel: 'BUSCAN VÍA IA',
    hookText: 'de búsquedas inmobiliarias ya pasan por ChatGPT o Perplexity',
    hookPillar: 'IA & BÚSQUEDAS',
    clip1: 'shorts/v4_clip1.mp4',
    clip2: 'shorts/v4_clip2.mp4',
    voiceover: 'shorts/vo/v4_chatgpt_search.mp3',
    ctaLine1: '¿Aparece tu inmobiliaria cuando ChatGPT responde?',
    captions: [
      { text: 'Haz esta prueba:',             startSec: 3.0,  endSec: 4.5  },
      { text: 'busca en ChatGPT tu agencia',  startSec: 4.5,  endSec: 7.0  },
      { text: '¿Apareces?',                   startSec: 7.5,  endSec: 9.0  },
      { text: 'Si no: problema que crece.',   startSec: 9.5,  endSec: 12.5 },
      { text: '34% ya busca con IA.',         startSec: 13.0, endSec: 15.5 },
      { text: 'Y ese número sube.',           startSec: 15.5, endSec: 17.5 },
    ],
  },
  {
    id: 'YTShort-V6-Traffic',
    hookStat: '300%',
    hookStatLabel: 'MÁS TRÁFICO ORGÁNICO',
    hookText: 'sin pagar un solo peso en publicidad',
    hookPillar: 'SEO & VISIBILIDAD',
    clip1: 'shorts/v6_clip1.mp4',
    clip2: 'shorts/v6_clip2.mp4',
    voiceover: 'shorts/vo/v6_traffic_300.mp3',
    ctaLine1: '¿Quieres más leads sin depender de publicidad pagada?',
    captions: [
      { text: 'GoodLife Tulum logró',             startSec: 3.0,  endSec: 5.5  },
      { text: '300% más tráfico orgánico',         startSec: 5.5,  endSec: 8.5  },
      { text: 'en solo 3 meses',                   startSec: 8.5,  endSec: 11.0 },
      { text: 'Google, ChatGPT, Perplexity',       startSec: 11.5, endSec: 14.5 },
      { text: 'antes que la competencia',          startSec: 14.5, endSec: 17.0 },
      { text: 'Sin pagar publicidad.',             startSec: 17.5, endSec: 20.0 },
      { text: 'Auditoría gratis → jegodigital.com', startSec: 20.5, endSec: 24.7 },
    ],
  },
  // ─── EDUCATIONAL SERIES — zero selling, pure value ───
  {
    id: 'YTShort-E1-5minutos',
    hookStat: '21X',
    hookStatLabel: 'MÁS PROBABILIDAD',
    hookText: 'de cerrar si respondes en menos de 5 minutos — la mayoría no lo hace',
    hookPillar: 'TIP DE VENTAS',
    clip1: 'shorts/v6_clip1.mp4',
    clip2: 'shorts/v6_clip2.mp4',
    voiceover: 'shorts/vo/e1_5minutos.mp3',
    ctaLine1: 'Un nuevo tip cada semana — dale 🔔 para no perderte ninguno',
    educational: true,
    captions: [],
  },
  {
    id: 'YTShort-V5-Market',
    hookStat: '2026',
    hookStatLabel: 'MUNDIAL EN MÉXICO',
    hookText: 'millones de turistas buscando propiedades — ¿aparece tu inmobiliaria?',
    hookPillar: 'OPORTUNIDAD DE MERCADO',
    clip1: 'shorts/v5_clip1.mp4',
    clip2: 'shorts/v5_clip2.mp4',
    voiceover: 'shorts/vo/v5_market_opportunity.mp3',
    ctaLine1: '¿Tu inmobiliaria está lista para el Mundial 2026?',
    captions: [
      { text: 'En 2026 México: el Mundial.',    startSec: 3.0,  endSec: 5.5  },
      { text: 'Millones buscando propiedades', startSec: 5.5,  endSec: 8.0  },
      { text: '¿Habrá demanda? Sí.',            startSec: 8.5,  endSec: 10.5 },
      { text: '¿Aparecerá TU inmobiliaria?',   startSec: 11.0, endSec: 14.0 },
      { text: 'La ventana se está cerrando.',  startSec: 14.5, endSec: 18.0 },
    ],
  },
];

export const AllYTShorts: React.FC = () => (
  <>
    {SHORTS.map(({ id, ...props }) => (
      <Composition
        key={id}
        id={id}
        component={YoutubeShort}
        durationInFrames={TOTAL}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={props}
      />
    ))}
  </>
);
