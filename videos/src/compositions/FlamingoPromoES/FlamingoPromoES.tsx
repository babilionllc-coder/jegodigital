import React from 'react';
import { AbsoluteFill, Audio, Sequence, staticFile } from 'remotion';

// Import all scenes (we will re-use them but pass Spanish text via props or just create a Spanish scene folder, actually let's just create Spanish scenes to hardcode the exact text since it's a completely different language with different timing).
import { Scene1_HookES } from './scenes/Scene1_HookES';
import { Scene2_HesitationES } from './scenes/Scene2_HesitationES';
import { Scene3_ValueBombES } from './scenes/Scene3_ValueBombES';
import { Scene4_CloserES } from './scenes/Scene4_CloserES';
import { Scene5_SuccessES } from './scenes/Scene5_SuccessES';
import { Scene6_VoiceoverES } from './scenes/Scene6_VoiceoverES';

// Constants
const PAUSE = 15; // 0.5s pause between speakers

// Logo and Watermark
const Watermark = () => (
    <AbsoluteFill style={{ padding: '60px', pointerEvents: 'none', zIndex: 1000 }}>
        <div style={{ position: 'absolute', top: 60, left: 60, display: 'flex', alignItems: 'center', gap: 15 }}>
            <div style={{ width: 50, height: 50, borderRadius: 10, background: '#C5A059', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 10px 30px rgba(197,160,89,0.3)' }}>
                <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#0f1115" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 21h18" />
                    <path d="M5 21V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16" />
                    <path d="M9 21v-4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v4" />
                </svg>
            </div>
            <div style={{ color: 'white', fontFamily: 'Outfit, sans-serif', fontSize: 32, fontWeight: 800, letterSpacing: '0.05em', textShadow: '0 4px 20px rgba(0,0,0,0.8)' }}>
                FLAMINGO <span style={{ color: '#C5A059' }}>REAL ESTATE</span>
            </div>
        </div>

        <div style={{ position: 'absolute', bottom: 60, right: 60, display: 'flex', alignItems: 'center', gap: 10, opacity: 0.9, background: 'rgba(15,17,21,0.6)', padding: '10px 25px', borderRadius: 30, backdropFilter: 'blur(10px)', border: '1px solid rgba(197,160,89,0.3)' }}>
            <span style={{ color: '#8b9bb4', fontFamily: 'Roboto Mono, monospace', fontSize: 24 }}>Powered by</span>
            <span style={{ color: '#C5A059', fontFamily: 'Outfit, sans-serif', fontSize: 28, fontWeight: 'bold' }}>JegoDigital</span>
        </div>
    </AbsoluteFill>
);

export const FlamingoPromoES: React.FC = () => {
    // Exact timings from generate_durations_es.js + 15 frame natural pauses
    /*
      '01_sofia_hook.mp3': 11.494,
      '02_jorge_hesitation.mp3': 10.292,
      '03_sofia_value.mp3': 17.189,
      '04_jorge_impressed.mp3': 6.296,
      '05_sofia_closer.mp3': 11.86,
      '06_jorge_success.mp3': 3.213,
      '07_sofia_success.mp3': 4.284,
      '08_voiceover.mp3': 11.912
    */
    const d1 = Math.round(11.494 * 30); // 345
    const s1 = 0;

    const d2 = Math.round(10.292 * 30); // 309
    const s2 = s1 + d1 + PAUSE;

    const d3 = Math.round(17.189 * 30); // 516
    const s3 = s2 + d2 + PAUSE;

    const d4 = Math.round(6.296 * 30);  // 189
    const s4 = s3 + d3 + PAUSE;

    const d5 = Math.round(11.86 * 30);  // 356
    const s5 = s4 + d4 + PAUSE;

    const d6 = Math.round(3.213 * 30);  // 96
    const s6 = s5 + d5 + PAUSE;

    const d7 = Math.round(4.284 * 30);  // 129
    const s7 = s6 + d6 + PAUSE;

    const d8 = Math.round(11.912 * 30); // 357
    const s8 = s7 + d7 + PAUSE;

    return (
        <AbsoluteFill style={{ backgroundColor: '#0f1115', fontFamily: 'Outfit, sans-serif' }}>

            {/* DYNAMIC ANIMATED BACKGROUND (10/10 QUALITY) */}
            <AbsoluteFill style={{ overflow: 'hidden' }}>
                {/* Dark atmospheric base */}
                <div style={{ position: 'absolute', inset: 0, backgroundColor: '#05070a' }} />

                {/* Slow moving glowing orbs */}
                <div style={{
                    position: 'absolute', top: '-50%', left: '-50%', width: '200%', height: '200%',
                    background: 'radial-gradient(circle at 30% 30%, rgba(197,160,89,0.12) 0%, transparent 50%), radial-gradient(circle at 70% 70%, rgba(16,185,129,0.08) 0%, transparent 50%)',
                    filter: 'blur(80px)',
                    animation: 'spin 25s linear infinite'
                }} />

                {/* Moving Tech Grid */}
                <div style={{
                    position: 'absolute', inset: -400,
                    backgroundImage: 'linear-gradient(rgba(197,160,89,0.04) 2px, transparent 2px), linear-gradient(90deg, rgba(197,160,89,0.04) 2px, transparent 2px)',
                    backgroundSize: '120px 120px',
                    transform: 'perspective(1500px) rotateX(60deg) translateY(-20%)',
                    maskImage: 'linear-gradient(to bottom, transparent, black 15%, black 85%, transparent)'
                }} />

                {/* Light sweeping overlay */}
                <div style={{
                    position: 'absolute', inset: 0,
                    background: 'linear-gradient(45deg, transparent 40%, rgba(255,255,255,0.03) 50%, transparent 60%)',
                    backgroundSize: '200% 200%',
                    animation: 'sweep 10s infinite linear'
                }} />
            </AbsoluteFill>

            {/* Ensure keyframes exist in a global style for the animation */}
            <style>{`
                @keyframes spin { 100% { transform: rotate(360deg); } }
                @keyframes sweep { 0% { background-position: -100% -100%; } 100% { background-position: 200% 200%; } }
            `}</style>

            {/* AUDIO MIXTRACK */}
            <Sequence from={s1} durationInFrames={d1}><Audio src={staticFile('flamingo-audio-es/01_sofia_hook.mp3')} /></Sequence>
            <Sequence from={s2} durationInFrames={d2}><Audio src={staticFile('flamingo-audio-es/02_jorge_hesitation.mp3')} /></Sequence>
            <Sequence from={s3} durationInFrames={d3}><Audio src={staticFile('flamingo-audio-es/03_sofia_value.mp3')} /></Sequence>
            <Sequence from={s4} durationInFrames={d4}><Audio src={staticFile('flamingo-audio-es/04_jorge_impressed.mp3')} /></Sequence>
            <Sequence from={s5} durationInFrames={d5}><Audio src={staticFile('flamingo-audio-es/05_sofia_closer.mp3')} /></Sequence>
            <Sequence from={s6} durationInFrames={d6}><Audio src={staticFile('flamingo-audio-es/06_jorge_success.mp3')} /></Sequence>
            <Sequence from={s7} durationInFrames={d7}><Audio src={staticFile('flamingo-audio-es/07_sofia_success.mp3')} /></Sequence>
            <Sequence from={s8} durationInFrames={d8}><Audio src={staticFile('flamingo-audio-es/08_voiceover.mp3')} /></Sequence>

            {/* VISUAL SCENES */}
            <Sequence from={0} durationInFrames={s2}>
                <Scene1_HookES duration={s2} />
            </Sequence>

            <Sequence from={s2} durationInFrames={s3 - s2}>
                <Scene2_HesitationES duration={s3 - s2} />
            </Sequence>

            <Sequence from={s3} durationInFrames={s4 - s3}>
                <Scene3_ValueBombES duration={s4 - s3} />
            </Sequence>

            <Sequence from={s4} durationInFrames={s6 - s4}>
                <Scene4_CloserES startJorge={0} endJorge={d4 + PAUSE} duration={s6 - s4} />
            </Sequence>

            <Sequence from={s6} durationInFrames={s8 - s6}>
                <Scene5_SuccessES startJorge={0} endJorge={d6 + PAUSE} duration={s8 - s6} />
            </Sequence>

            <Sequence from={s8}>
                <Scene6_VoiceoverES />
            </Sequence>

            {/* GLOBAL WATERMARK (Always on top) */}
            <Watermark />
        </AbsoluteFill>
    );
};
