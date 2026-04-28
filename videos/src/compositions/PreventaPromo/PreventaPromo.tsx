import React from 'react';
import {
  AbsoluteFill,
  Audio,
  Sequence,
  staticFile,
  useCurrentFrame,
  interpolate,
  spring,
  useVideoConfig,
} from 'remotion';
// Audio durations measured from rendered MP3s (ffprobe). Re-run generate_preventa_audio.mjs to refresh.
const durations = {
  es: {
    '01_hook': 3.996735,
    '02_problem': 7.758367,
    '03_phase1': 16.901224,
    '04_phase2': 11.937959,
    '05_phase3': 10.762449,
    '06_proof': 16.300408,
    '07_guarantee': 10.893061,
    '08_cta': 10.44898,
  },
  en: {
    '01_hook': 4.728163,
    '02_problem': 8.019592,
    '03_phase1': 15.229388,
    '04_phase2': 11.467755,
    '05_phase3': 11.128163,
    '06_proof': 13.87102,
    '07_guarantee': 10.684082,
    '08_cta': 9.430204,
  },
} as const;

// === DESIGN TOKENS (locked to JegoDigital brand) ===
const C = {
  bg: '#0f1115',
  bgDeep: '#05070a',
  gold: '#C5A059',
  goldLight: '#d4b072',
  goldDeep: '#8e6f30',
  white: '#ffffff',
  white60: 'rgba(255,255,255,0.6)',
  white40: 'rgba(255,255,255,0.4)',
  glassBg: 'rgba(26,29,36,0.55)',
  glassBorder: 'rgba(255,255,255,0.08)',
  goldGlow: 'rgba(197,160,89,0.35)',
};
const FONT = "'Plus Jakarta Sans', 'Inter', system-ui, sans-serif";
const FPS = 30;
const PAUSE = 12; // 0.4s between scenes

// === COPY DECK (ES + EN parallel) ===
type Lang = 'es' | 'en';
type Copy = {
  hookBig: string;
  hookSmall: string;
  problemTitle: string;
  problemBody: string;
  problemTag: string;
  phase1Range: string;
  phase1Title: string;
  phase1Items: string[];
  phase2Range: string;
  phase2Title: string;
  phase2Items: string[];
  phase3Range: string;
  phase3Title: string;
  phase3Items: string[];
  proofTitle: string;
  proofClient: string;
  guaranteeTitle: string;
  guarantee1Title: string;
  guarantee1Body: string;
  guarantee2Title: string;
  guarantee2Body: string;
  ctaSmall: string;
  ctaBig: string;
  ctaButton: string;
  ctaUrl: string;
  watermark: string;
  forDevelopers: string;
};

const COPY: Record<Lang, Copy> = {
  es: {
    hookBig: '90 días',
    hookSmall: 'antes de tu preventa',
    problemTitle: 'Los más caros del proyecto',
    problemBody: 'Tu comprador contacta 5–8 desarrolladores',
    problemTag: 'La ventana son SEGUNDOS',
    phase1Range: 'DÍAS 1–15',
    phase1Title: 'Cimientos técnicos',
    phase1Items: [
      'Landing dedicado al desarrollo',
      'Sofia IA bilingüe · respuesta <60s',
      'WhatsApp · Web · SMS',
      'Schema + AEO (ChatGPT · Perplexity)',
    ],
    phase2Range: 'DÍAS 16–45',
    phase2Title: 'Tráfico real',
    phase2Items: [
      'Google Search + Demand Gen',
      'Meta Lead Form',
      'Sofia activa 24/7 calificando',
      'Reporte semanal en Slack',
    ],
    phase3Range: 'DÍAS 46–90',
    phase3Title: 'Optimización + handoff',
    phase3Items: [
      'Re-targeting + lookalikes reales',
      'A/B test de creativos y landing',
      'Email nurture automatizado',
      'Caso de éxito documentado',
    ],
    proofTitle: 'Caso real · 90 días',
    proofClient: 'FLAMINGO REAL ESTATE · CANCÚN',
    guaranteeTitle: 'Riesgo cero',
    guarantee1Title: '14 días',
    guarantee1Body: 'Devolución 100% si no captura un lead real',
    guarantee2Title: '60 segundos',
    guarantee2Body: 'Si Sofia no responde a tiempo, ese mes es nuestro',
    ctaSmall: 'Tu próxima preventa decide tu siguiente proyecto',
    ctaBig: '15 minutos en Calendly',
    ctaButton: 'Agendar con Alex',
    ctaUrl: 'calendly.com/jegoalexdigital/30min',
    watermark: 'Lanzamiento Preventa 90 Días',
    forDevelopers: 'Para desarrolladores inmobiliarios',
  },
  en: {
    hookBig: '90 days',
    hookSmall: 'before your pre-sale launch',
    problemTitle: 'The most expensive of the entire project',
    problemBody: 'Your buyer is contacting 5–8 developers',
    problemTag: 'The window is SECONDS',
    phase1Range: 'DAYS 1–15',
    phase1Title: 'Technical foundation',
    phase1Items: [
      'Dedicated landing page',
      'Sofia bilingual AI · reply <60s',
      'WhatsApp · Web · SMS',
      'Schema + AEO (ChatGPT · Perplexity)',
    ],
    phase2Range: 'DAYS 16–45',
    phase2Title: 'Real traffic',
    phase2Items: [
      'Google Search + Demand Gen',
      'Meta Lead Form',
      'Sofia live 24/7 qualifying',
      'Weekly report in Slack',
    ],
    phase3Range: 'DAYS 46–90',
    phase3Title: 'Optimization + handoff',
    phase3Items: [
      'Re-targeting + real lookalikes',
      'Creative + landing A/B testing',
      'Automated email nurture',
      'Documented case study',
    ],
    proofTitle: 'Real case · 90 days',
    proofClient: 'FLAMINGO REAL ESTATE · CANCÚN',
    guaranteeTitle: 'Zero risk',
    guarantee1Title: '14 days',
    guarantee1Body: '100% refund if no real lead is captured',
    guarantee2Title: '60 seconds',
    guarantee2Body: 'If Sofia is late, that month is on us',
    ctaSmall: 'Your next pre-sale decides your next project',
    ctaBig: '15 minutes on Calendly',
    ctaButton: 'Book with Alex',
    ctaUrl: 'calendly.com/jegoalexdigital/30min',
    watermark: 'Pre-Sale Launch · 90 Days',
    forDevelopers: 'For real estate developers',
  },
};

const CAPTIONS: Record<Lang, string[]> = {
  es: [
    'Los 90 días antes de tu preventa son los más caros',
    'Tu comprador contacta 5–8 desarrolladores. La ventana son segundos.',
    'Días 1–15 · Cimientos · Landing + Sofia IA <60s',
    'Días 16–45 · Tráfico real · Reporte semanal en Slack',
    'Días 46–90 · Optimización · Caso de éxito documentado',
    'Flamingo Cancún · 4.4x · #1 Maps · +320% · 88% IA',
    '14 días · Devolución 100% · Garantía 60 segundos',
    '15 min en Calendly · calendly.com/jegoalexdigital/30min',
  ],
  en: [
    'The 90 days before your pre-sale are the most expensive',
    'Your buyer contacts 5–8 developers. The window is seconds.',
    'Days 1–15 · Foundation · Landing + Sofia AI <60s',
    'Days 16–45 · Real traffic · Weekly Slack report',
    'Days 46–90 · Optimization · Documented case study',
    'Flamingo Cancún · 4.4x · #1 Maps · +320% · 88% AI',
    '14-day refund · 60-second guarantee',
    '15 min on Calendly · calendly.com/jegoalexdigital/30min',
  ],
};

// === TIMING HELPERS ===
const beatIds = ['01_hook', '02_problem', '03_phase1', '04_phase2', '05_phase3', '06_proof', '07_guarantee', '08_cta'] as const;

export function getBeatTimings(lang: Lang) {
  const d = durations[lang];
  let cursor = 0;
  return beatIds.map((id) => {
    const sec = d[id as keyof typeof d];
    const startFrame = cursor;
    const durFrames = Math.round(sec * FPS);
    cursor = startFrame + durFrames + PAUSE;
    return { id, startFrame, durFrames };
  });
}

export function getTotalFrames(lang: Lang) {
  const t = getBeatTimings(lang);
  const last = t[t.length - 1];
  return last.startFrame + last.durFrames + 30; // +1s tail
}

// === BACKGROUND ===
const Background: React.FC = () => {
  const frame = useCurrentFrame();
  const orbX = interpolate(frame, [0, 2700], [0, 60]);
  const orbY = interpolate(frame, [0, 2700], [0, -40]);
  return (
    <AbsoluteFill style={{ background: C.bgDeep, overflow: 'hidden' }}>
      <div style={{
        position: 'absolute', inset: 0,
        background: `radial-gradient(circle at 30% 30%, rgba(197,160,89,0.10) 0%, transparent 55%), radial-gradient(circle at ${70 + orbX/4}% ${70 + orbY/4}%, rgba(197,160,89,0.06) 0%, transparent 55%)`,
        filter: 'blur(60px)',
      }} />
      <div style={{
        position: 'absolute', inset: -200,
        backgroundImage:
          'linear-gradient(rgba(197,160,89,0.045) 1px, transparent 1px), linear-gradient(90deg, rgba(197,160,89,0.045) 1px, transparent 1px)',
        backgroundSize: '90px 90px',
        backgroundPosition: `${orbX}px ${orbY}px`,
        maskImage: 'radial-gradient(circle at 50% 50%, black 30%, transparent 75%)',
      }} />
      <div style={{
        position: 'absolute', inset: 0,
        background: `linear-gradient(to bottom, ${C.bg}cc 0%, transparent 25%, transparent 75%, ${C.bg}ee 100%)`,
      }} />
    </AbsoluteFill>
  );
};

// === WATERMARK / CHROME (always visible) ===
const Chrome: React.FC<{ copy: Copy; lang: Lang }> = ({ copy, lang }) => {
  return (
    <AbsoluteFill style={{ pointerEvents: 'none', zIndex: 1000 }}>
      {/* Top-left logo */}
      <div style={{ position: 'absolute', top: 36, left: 48, display: 'flex', alignItems: 'center', gap: 14 }}>
        <div style={{
          width: 44, height: 44, borderRadius: 10,
          background: `linear-gradient(135deg, ${C.gold}, ${C.goldDeep})`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: `0 8px 24px ${C.goldGlow}`,
        }}>
          <span style={{ color: C.bg, fontWeight: 900, fontSize: 22, fontFamily: FONT }}>J</span>
        </div>
        <div style={{ color: C.white, fontFamily: FONT, fontSize: 22, fontWeight: 800, letterSpacing: '0.02em' }}>
          <span style={{ color: C.gold }}>Jego</span>Digital
        </div>
      </div>
      {/* Top-right language pill */}
      <div style={{
        position: 'absolute', top: 40, right: 48,
        background: C.glassBg, border: `1px solid ${C.glassBorder}`,
        padding: '8px 18px', borderRadius: 999,
        color: C.gold, fontFamily: FONT, fontSize: 14, fontWeight: 700, letterSpacing: '0.18em',
        backdropFilter: 'blur(12px)',
      }}>
        {lang.toUpperCase()} · {copy.forDevelopers.toUpperCase()}
      </div>
    </AbsoluteFill>
  );
};

// === 90-DAY PROGRESS BAR (always visible) ===
const ProgressBar: React.FC<{ totalFrames: number }> = ({ totalFrames }) => {
  const frame = useCurrentFrame();
  const pct = Math.min(1, frame / totalFrames);
  const day = Math.round(90 * pct);
  return (
    <div style={{
      position: 'absolute', left: 48, right: 48, bottom: 36,
      zIndex: 1000, pointerEvents: 'none',
    }}>
      <div style={{
        display: 'flex', justifyContent: 'space-between',
        color: C.white60, fontFamily: FONT, fontSize: 12,
        letterSpacing: '0.18em', marginBottom: 8, fontWeight: 600,
      }}>
        <span>DÍA / DAY {String(day).padStart(2, '0')} / 90</span>
        <span>{Math.round(pct * 100)}%</span>
      </div>
      <div style={{
        width: '100%', height: 4, background: 'rgba(255,255,255,0.06)',
        borderRadius: 999, overflow: 'hidden',
      }}>
        <div style={{
          width: `${pct * 100}%`, height: '100%',
          background: `linear-gradient(90deg, ${C.goldDeep}, ${C.gold}, ${C.goldLight})`,
          boxShadow: `0 0 12px ${C.goldGlow}`,
        }} />
      </div>
    </div>
  );
};

// === BURNED CAPTION ===
const Caption: React.FC<{ text: string }> = ({ text }) => {
  const frame = useCurrentFrame();
  const fadeIn = interpolate(frame, [0, 8], [0, 1], { extrapolateRight: 'clamp' });
  return (
    <div style={{
      position: 'absolute', left: '50%', bottom: 88,
      transform: 'translateX(-50%)',
      maxWidth: 1500, opacity: fadeIn, zIndex: 999,
      background: 'rgba(15,17,21,0.78)',
      border: `1px solid ${C.glassBorder}`,
      backdropFilter: 'blur(16px)',
      padding: '14px 28px', borderRadius: 14,
      color: C.white, fontFamily: FONT, fontSize: 22, fontWeight: 600,
      letterSpacing: '0.005em', textAlign: 'center',
      boxShadow: '0 12px 40px rgba(0,0,0,0.4)',
    }}>
      {text}
    </div>
  );
};

// === SCENE 1: HOOK ===
const SceneHook: React.FC<{ copy: Copy }> = ({ copy }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const sBig = spring({ frame, fps, config: { damping: 14 } });
  const sSmall = spring({ frame: frame - 14, fps, config: { damping: 16 } });
  const yBig = interpolate(sBig, [0, 1], [40, 0]);
  const oBig = interpolate(sBig, [0, 1], [0, 1]);
  const ySmall = interpolate(sSmall, [0, 1], [30, 0]);
  const oSmall = interpolate(sSmall, [0, 1], [0, 1]);

  return (
    <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center' }}>
      <div style={{
        opacity: oSmall, transform: `translateY(${ySmall}px)`,
        color: C.gold, fontFamily: FONT, fontWeight: 700,
        fontSize: 28, letterSpacing: '0.32em', marginBottom: 22, textTransform: 'uppercase',
      }}>
        Lanzamos tu preventa
      </div>
      <div style={{
        opacity: oBig, transform: `translateY(${yBig}px)`,
        fontFamily: FONT, fontWeight: 900,
        fontSize: 320, lineHeight: 0.92, letterSpacing: '-0.04em',
        background: `linear-gradient(135deg, ${C.gold} 0%, ${C.goldLight} 50%, ${C.gold} 100%)`,
        WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
        textShadow: `0 0 60px ${C.goldGlow}`,
      }}>
        {copy.hookBig}
      </div>
      <div style={{
        opacity: oSmall, transform: `translateY(${ySmall}px)`,
        color: C.white, fontFamily: FONT, fontSize: 38, fontWeight: 600, marginTop: 18,
      }}>
        {copy.hookSmall}
      </div>
    </AbsoluteFill>
  );
};

// === SCENE 2: PROBLEM ===
const SceneProblem: React.FC<{ copy: Copy }> = ({ copy }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const sIn = spring({ frame, fps, config: { damping: 16 } });
  const opacity = sIn;

  return (
    <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ opacity, textAlign: 'center', maxWidth: 1500 }}>
        <div style={{
          color: C.gold, fontFamily: FONT, fontSize: 22, fontWeight: 700,
          letterSpacing: '0.32em', marginBottom: 24, textTransform: 'uppercase',
        }}>
          {copy.problemTitle}
        </div>
        <div style={{
          color: C.white, fontFamily: FONT, fontSize: 76, fontWeight: 800,
          lineHeight: 1.1, marginBottom: 56,
        }}>
          {copy.problemBody}
        </div>

        {/* 8 dev avatars in a row */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: 16, marginBottom: 56 }}>
          {Array.from({ length: 8 }).map((_, i) => {
            const appear = spring({ frame: frame - 18 - i * 4, fps, config: { damping: 12 } });
            const isYou = i === 3;
            return (
              <div key={i} style={{
                width: 92, height: 92, borderRadius: '50%',
                background: isYou
                  ? `linear-gradient(135deg, ${C.gold}, ${C.goldDeep})`
                  : 'rgba(255,255,255,0.06)',
                border: `2px solid ${isYou ? C.gold : 'rgba(255,255,255,0.1)'}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontFamily: FONT, fontSize: 36, fontWeight: 900,
                color: isYou ? C.bg : C.white60,
                transform: `scale(${appear})`, opacity: appear,
                boxShadow: isYou ? `0 12px 40px ${C.goldGlow}` : 'none',
              }}>
                {isYou ? '✓' : '·'}
              </div>
            );
          })}
        </div>

        <div style={{
          display: 'inline-block',
          background: `linear-gradient(135deg, rgba(197,160,89,0.18), rgba(197,160,89,0.06))`,
          border: `1px solid ${C.gold}`,
          padding: '18px 40px', borderRadius: 999,
          color: C.gold, fontFamily: FONT, fontSize: 32, fontWeight: 800,
          letterSpacing: '0.06em',
          opacity: spring({ frame: frame - 60, fps, config: { damping: 12 } }),
        }}>
          ⏱  {copy.problemTag}
        </div>
      </div>
    </AbsoluteFill>
  );
};

// === SCENE PHASE (reused for phase1/2/3) ===
const ScenePhase: React.FC<{
  range: string; title: string; items: string[]; phaseNum: number;
}> = ({ range, title, items, phaseNum }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  return (
    <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', padding: '0 120px' }}>
      <div style={{ maxWidth: 1600, width: '100%' }}>
        {/* Phase chip + title row */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 24, marginBottom: 28,
          opacity: spring({ frame, fps, config: { damping: 14 } }),
        }}>
          <div style={{
            width: 80, height: 80, borderRadius: '50%',
            background: `linear-gradient(135deg, ${C.gold}, ${C.goldDeep})`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: C.bg, fontFamily: FONT, fontSize: 40, fontWeight: 900,
            boxShadow: `0 10px 30px ${C.goldGlow}`,
          }}>
            {phaseNum}
          </div>
          <div>
            <div style={{
              color: C.gold, fontFamily: FONT, fontSize: 22, fontWeight: 800,
              letterSpacing: '0.28em',
            }}>
              {range}
            </div>
            <div style={{
              color: C.white, fontFamily: FONT, fontSize: 64, fontWeight: 800,
              lineHeight: 1.05, marginTop: 4,
            }}>
              {title}
            </div>
          </div>
        </div>

        {/* Item grid 2x2 */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 22, marginTop: 28 }}>
          {items.map((item, i) => {
            const sIn = spring({ frame: frame - 18 - i * 8, fps, config: { damping: 14 } });
            const opacity = sIn;
            const tx = interpolate(sIn, [0, 1], [-30, 0]);
            return (
              <div key={i} style={{
                opacity, transform: `translateX(${tx}px)`,
                background: C.glassBg,
                border: `1px solid ${C.glassBorder}`,
                backdropFilter: 'blur(14px)',
                padding: '24px 28px', borderRadius: 18,
                display: 'flex', alignItems: 'center', gap: 18,
                color: C.white, fontFamily: FONT, fontSize: 28, fontWeight: 600,
              }}>
                <div style={{
                  width: 14, height: 14, borderRadius: '50%',
                  background: C.gold, boxShadow: `0 0 16px ${C.goldGlow}`,
                  flexShrink: 0,
                }} />
                <span>{item}</span>
              </div>
            );
          })}
        </div>
      </div>
    </AbsoluteFill>
  );
};

// === SCENE 6: PROOF (Flamingo case study) ===
const SceneProof: React.FC<{ copy: Copy }> = ({ copy }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Animated number counters
  const counter = (target: number, startFrame: number, decimals = 0) => {
    const t = Math.min(1, Math.max(0, (frame - startFrame) / 30));
    const eased = 1 - Math.pow(1 - t, 3);
    const v = target * eased;
    return decimals === 0 ? Math.round(v).toString() : v.toFixed(decimals);
  };

  const stats = [
    { big: counter(4.4, 18, 1) + 'x', label: 'visibilidad orgánica' },
    { big: '#' + counter(1, 26), label: 'Google Maps Cancún' },
    { big: '+' + counter(320, 32) + '%', label: 'tráfico orgánico' },
    { big: counter(88, 40) + '%', label: 'leads atendidos por IA' },
  ];

  return (
    <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', padding: '0 100px' }}>
      <div style={{
        opacity: spring({ frame, fps, config: { damping: 16 } }),
        color: C.gold, fontFamily: FONT, fontSize: 22, fontWeight: 800,
        letterSpacing: '0.28em', marginBottom: 14,
      }}>
        {copy.proofTitle.toUpperCase()}
      </div>
      <div style={{
        opacity: spring({ frame: frame - 6, fps, config: { damping: 16 } }),
        color: C.white, fontFamily: FONT, fontSize: 36, fontWeight: 800,
        letterSpacing: '0.06em', marginBottom: 60,
      }}>
        {copy.proofClient}
      </div>

      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)',
        gap: 28, width: '100%', maxWidth: 1700,
      }}>
        {stats.map((s, i) => {
          const sIn = spring({ frame: frame - 14 - i * 8, fps, config: { damping: 14 } });
          const ty = interpolate(sIn, [0, 1], [40, 0]);
          return (
            <div key={i} style={{
              opacity: sIn, transform: `translateY(${ty}px)`,
              background: `linear-gradient(135deg, rgba(197,160,89,0.14), rgba(197,160,89,0.02))`,
              border: `1px solid ${C.gold}`,
              padding: '40px 22px', borderRadius: 22,
              textAlign: 'center',
              boxShadow: `0 16px 50px ${C.goldGlow}`,
            }}>
              <div style={{
                fontFamily: FONT, fontWeight: 900, fontSize: 110,
                lineHeight: 0.95, letterSpacing: '-0.03em',
                background: `linear-gradient(135deg, ${C.gold}, ${C.goldLight})`,
                WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
                textShadow: `0 0 40px ${C.goldGlow}`,
              }}>
                {s.big}
              </div>
              <div style={{
                color: C.white60, fontFamily: FONT, fontSize: 18,
                fontWeight: 600, marginTop: 12, letterSpacing: '0.03em',
              }}>
                {s.label}
              </div>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

// === SCENE 7: GUARANTEE ===
const SceneGuarantee: React.FC<{ copy: Copy }> = ({ copy }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (
    <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', padding: '0 120px' }}>
      <div style={{
        color: C.gold, fontFamily: FONT, fontSize: 22, fontWeight: 800,
        letterSpacing: '0.32em', marginBottom: 16,
        opacity: spring({ frame, fps, config: { damping: 14 } }),
      }}>
        {copy.guaranteeTitle.toUpperCase()}
      </div>
      <div style={{
        color: C.white, fontFamily: FONT, fontSize: 88, fontWeight: 900,
        marginBottom: 70, letterSpacing: '-0.02em',
        opacity: spring({ frame: frame - 6, fps, config: { damping: 14 } }),
      }}>
        100% <span style={{ color: C.gold }}>garantizado</span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 32, width: '100%', maxWidth: 1500 }}>
        {[
          { title: copy.guarantee1Title, body: copy.guarantee1Body, icon: '⟲' },
          { title: copy.guarantee2Title, body: copy.guarantee2Body, icon: '⏱' },
        ].map((g, i) => {
          const sIn = spring({ frame: frame - 18 - i * 12, fps, config: { damping: 14 } });
          const ty = interpolate(sIn, [0, 1], [40, 0]);
          return (
            <div key={i} style={{
              opacity: sIn, transform: `translateY(${ty}px)`,
              background: `linear-gradient(135deg, rgba(197,160,89,0.15), rgba(197,160,89,0.02))`,
              border: `1.5px solid ${C.gold}`,
              padding: '44px 38px', borderRadius: 22,
              boxShadow: `0 16px 40px ${C.goldGlow}`,
            }}>
              <div style={{ fontSize: 60, color: C.gold, marginBottom: 16 }}>{g.icon}</div>
              <div style={{
                color: C.white, fontFamily: FONT, fontSize: 56, fontWeight: 900,
                marginBottom: 12,
              }}>
                {g.title}
              </div>
              <div style={{
                color: C.white60, fontFamily: FONT, fontSize: 24, fontWeight: 500,
                lineHeight: 1.4,
              }}>
                {g.body}
              </div>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

// === SCENE 8: CTA ===
const SceneCTA: React.FC<{ copy: Copy }> = ({ copy }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const pulse = 1 + Math.sin(frame * 0.12) * 0.025;

  return (
    <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center' }}>
      <div style={{
        opacity: spring({ frame, fps, config: { damping: 16 } }),
        color: C.white60, fontFamily: FONT, fontSize: 32, fontWeight: 600,
        marginBottom: 30, letterSpacing: '0.02em', textAlign: 'center',
        maxWidth: 1400,
      }}>
        {copy.ctaSmall}
      </div>
      <div style={{
        opacity: spring({ frame: frame - 8, fps, config: { damping: 14 } }),
        fontFamily: FONT, fontWeight: 900, fontSize: 130, lineHeight: 0.95,
        letterSpacing: '-0.03em', textAlign: 'center',
        background: `linear-gradient(135deg, ${C.gold}, ${C.goldLight})`,
        WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
        marginBottom: 50,
      }}>
        {copy.ctaBig}
      </div>

      <div style={{
        opacity: spring({ frame: frame - 16, fps, config: { damping: 14 } }),
        transform: `scale(${pulse})`,
        background: `linear-gradient(135deg, ${C.gold}, ${C.goldLight})`,
        color: C.bg,
        fontFamily: FONT, fontSize: 36, fontWeight: 900,
        padding: '28px 70px', borderRadius: 999,
        boxShadow: `0 18px 50px ${C.goldGlow}`,
        letterSpacing: '0.03em',
      }}>
        📅  {copy.ctaButton}
      </div>

      <div style={{
        opacity: spring({ frame: frame - 24, fps, config: { damping: 14 } }),
        marginTop: 28,
        color: C.white, fontFamily: 'JetBrains Mono, ui-monospace, monospace',
        fontSize: 22, fontWeight: 600, letterSpacing: '0.04em',
      }}>
        {copy.ctaUrl}
      </div>
    </AbsoluteFill>
  );
};

// === SCENE TRANSITION WRAPPER (subtle fade between scenes) ===
const SceneWrap: React.FC<{ children: React.ReactNode; durFrames: number }> = ({ children, durFrames }) => {
  const frame = useCurrentFrame();
  const fadeOut = interpolate(frame, [durFrames - 10, durFrames], [1, 0], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
  });
  return <AbsoluteFill style={{ opacity: fadeOut }}>{children}</AbsoluteFill>;
};

// === MAIN COMPOSITION ===
export type PreventaPromoProps = { lang: Lang };

export const PreventaPromo: React.FC<PreventaPromoProps> = ({ lang }) => {
  const copy = COPY[lang];
  const captions = CAPTIONS[lang];
  const timings = getBeatTimings(lang);
  const totalFrames = getTotalFrames(lang);

  const scenes = [
    <SceneHook copy={copy} />,
    <SceneProblem copy={copy} />,
    <ScenePhase range={copy.phase1Range} title={copy.phase1Title} items={copy.phase1Items} phaseNum={1} />,
    <ScenePhase range={copy.phase2Range} title={copy.phase2Title} items={copy.phase2Items} phaseNum={2} />,
    <ScenePhase range={copy.phase3Range} title={copy.phase3Title} items={copy.phase3Items} phaseNum={3} />,
    <SceneProof copy={copy} />,
    <SceneGuarantee copy={copy} />,
    <SceneCTA copy={copy} />,
  ];

  return (
    <AbsoluteFill style={{ background: C.bg, fontFamily: FONT }}>
      <Background />

      {/* Audio + scene per beat */}
      {timings.map((t, i) => (
        <Sequence key={t.id} from={t.startFrame} durationInFrames={t.durFrames}>
          <Audio src={staticFile(`preventa/${lang}_${t.id}.mp3`)} />
          <SceneWrap durFrames={t.durFrames}>{scenes[i]}</SceneWrap>
          <AbsoluteFill>
            <Caption text={captions[i]} />
          </AbsoluteFill>
        </Sequence>
      ))}

      <Chrome copy={copy} lang={lang} />
      <ProgressBar totalFrames={totalFrames} />
    </AbsoluteFill>
  );
};
