// 90-second promo scripts for Lanzamiento Preventa landing page
// Tone: authoritative executive-to-executive. Premium B2B for real estate developers.
// Target word count: ~210 words ES, ~220 words EN at ~140-145 wpm = 88-92s
// Each script is broken into "beats" — discrete narration chunks tied to specific scenes.

export type Beat = {
  id: string;
  durationSec: number; // measured from the rendered MP3
  text: string;        // raw narration text
  caption: string;     // burned caption text (can be slightly punchier than narration)
  scene: 'hook' | 'problem' | 'phase1' | 'phase2' | 'phase3' | 'phase4' | 'proof' | 'guarantee' | 'cta';
};

export const ES_BEATS: Beat[] = [
  {
    id: '01_hook',
    durationSec: 0,
    scene: 'hook',
    text: 'Los noventa días antes de tu preventa son los más caros del proyecto.',
    caption: 'Los 90 días antes de tu preventa son los más caros',
  },
  {
    id: '02_problem',
    durationSec: 0,
    scene: 'problem',
    text: 'Tu comprador contacta cinco u ocho desarrolladores al mismo tiempo. La ventana para captarlo no son horas — son segundos.',
    caption: 'Tu comprador contacta 5–8 desarrolladores. La ventana son segundos.',
  },
  {
    id: '03_phase1',
    durationSec: 0,
    scene: 'phase1',
    text: 'En JegoDigital operamos el lanzamiento completo de tu preventa en noventa días. Quince días de cimientos: landing dedicado, Sofia — nuestra IA bilingüe — calificando leads en menos de sesenta segundos por WhatsApp, web y SMS.',
    caption: 'Días 1–15 · Cimientos · Landing + Sofia IA <60s',
  },
  {
    id: '04_phase2',
    durationSec: 0,
    scene: 'phase2',
    text: 'Treinta días de tráfico real: Google, Meta, Demand Gen. Sofia activa veinticuatro siete. Reporte semanal en Slack — sin jerga, solo leads y costo por lead.',
    caption: 'Días 16–45 · Tráfico real · Reporte semanal en Slack',
  },
  {
    id: '05_phase3',
    durationSec: 0,
    scene: 'phase3',
    text: 'Treinta días de optimización con datos reales: re-targeting, lookalikes, A B test, email nurture, y caso de éxito documentado para tu próximo lanzamiento.',
    caption: 'Días 46–90 · Optimización · Caso de éxito documentado',
  },
  {
    id: '06_proof',
    durationSec: 0,
    scene: 'proof',
    text: 'Caso Flamingo, Cancún: cuatro punto cuatro veces más visibilidad orgánica. Posición uno en Google Maps. Más trescientos veinte por ciento de tráfico. Ochenta y ocho por ciento de leads atendidos por inteligencia artificial. Todo en noventa días.',
    caption: 'Flamingo Cancún · 4.4x · #1 Maps · +320% · 88% IA',
  },
  {
    id: '07_guarantee',
    durationSec: 0,
    scene: 'guarantee',
    text: 'Riesgo cero. Si el sistema no captura un lead real en catorce días, devolvemos el cien por ciento. Si Sofia no responde en menos de sesenta segundos, ese mes va por nuestra cuenta.',
    caption: '14 días · Devolución 100% · Garantía 60 segundos',
  },
  {
    id: '08_cta',
    durationSec: 0,
    scene: 'cta',
    text: 'Tu próxima preventa decide tu siguiente proyecto. Quince minutos en Calendly. Sin presentación corporativa. Solo el sistema, los números, y si encajamos.',
    caption: '15 min en Calendly · calendly.com/jegoalexdigital/30min',
  },
];

export const EN_BEATS: Beat[] = [
  {
    id: '01_hook',
    durationSec: 0,
    scene: 'hook',
    text: 'The ninety days before your pre-sale launch are the most expensive of the entire project.',
    caption: 'The 90 days before your pre-sale are the most expensive',
  },
  {
    id: '02_problem',
    durationSec: 0,
    scene: 'problem',
    text: 'Your buyer is contacting five, even eight developers at the same time. The window to capture them isn’t hours — it’s seconds.',
    caption: 'Your buyer contacts 5–8 developers. The window is seconds.',
  },
  {
    id: '03_phase1',
    durationSec: 0,
    scene: 'phase1',
    text: 'At JegoDigital, we operate your full pre-sale launch in ninety days. Fifteen days of foundation: a dedicated landing page, and Sofia — our bilingual AI — qualifying leads in under sixty seconds across WhatsApp, web and SMS.',
    caption: 'Days 1–15 · Foundation · Landing + Sofia AI <60s',
  },
  {
    id: '04_phase2',
    durationSec: 0,
    scene: 'phase2',
    text: 'Thirty days of real traffic: Google, Meta, Demand Gen. Sofia live twenty-four seven. A weekly report in Slack — no jargon, just leads and cost per lead.',
    caption: 'Days 16–45 · Real traffic · Weekly Slack report',
  },
  {
    id: '05_phase3',
    durationSec: 0,
    scene: 'phase3',
    text: 'Thirty days of optimization on real data: re-targeting, lookalikes from real buyers, A B testing, email nurture, and a documented case study for your next launch.',
    caption: 'Days 46–90 · Optimization · Documented case study',
  },
  {
    id: '06_proof',
    durationSec: 0,
    scene: 'proof',
    text: 'Flamingo, Cancún: four point four times more organic visibility. Number one on Google Maps. Plus three hundred twenty percent organic traffic. Eighty-eight percent of leads handled by AI. All in ninety days.',
    caption: 'Flamingo Cancún · 4.4x · #1 Maps · +320% · 88% AI',
  },
  {
    id: '07_guarantee',
    durationSec: 0,
    scene: 'guarantee',
    text: 'Zero risk. If the system doesn’t capture a real lead in fourteen days, we refund one hundred percent. If Sofia doesn’t reply in under sixty seconds, that month is on us.',
    caption: '14-day refund · 60-second guarantee',
  },
  {
    id: '08_cta',
    durationSec: 0,
    scene: 'cta',
    text: 'Your next pre-sale decides your next project. Fifteen minutes on Calendly. No corporate pitch. Just the system, the numbers, and whether we fit.',
    caption: '15 min on Calendly · calendly.com/jegoalexdigital/30min',
  },
];
