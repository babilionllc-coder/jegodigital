import React from 'react';
import { AbsoluteFill, Audio, Sequence, staticFile, Video } from 'remotion';

// Import all scenes
import { Scene1_Hook } from './scenes/Scene1_Hook';
import { Scene2_Hesitation } from './scenes/Scene2_Hesitation';
import { Scene3_ValueBomb } from './scenes/Scene3_ValueBomb';
import { Scene4_Closer } from './scenes/Scene4_Closer';
import { Scene5_Success } from './scenes/Scene5_Success';
import { Scene6_Voiceover } from './scenes/Scene6_Voiceover';

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

export const FlamingoPromo: React.FC = () => {
    // Exact timings + 15 frame natural pauses
    const d1 = 277;
    const s1 = 0;

    // Updated David Voice Duration (8.15s)
    const d2 = 245;
    const s2 = s1 + d1 + PAUSE;

    const d3 = 379;
    const s3 = s2 + d2 + PAUSE;

    // Updated David Voice Duration (4.859s)
    const d4 = 146;
    const s4 = s3 + d3 + PAUSE;

    const d5 = 299;
    const s5 = s4 + d4 + PAUSE;

    // Updated David Voice Duration (2.299s)
    const d6 = 69;
    const s6 = s5 + d5 + PAUSE;

    const d7 = 116;
    const s7 = s6 + d6 + PAUSE;

    const d8 = 272;
    const s8 = s7 + d7 + PAUSE;

    return (
        <AbsoluteFill style={{ backgroundColor: '#0f1115', fontFamily: 'Outfit, sans-serif' }}>

            {/* DYNAMIC ANIMATED BACKGROUND */}
            <AbsoluteFill style={{ overflow: 'hidden' }}>
                {/* Slow moving glowing orbs */}
                <div style={{
                    position: 'absolute', top: '-20%', left: '-20%', width: '140%', height: '140%',
                    background: 'radial-gradient(circle at 30% 30%, rgba(197,160,89,0.15) 0%, transparent 40%), radial-gradient(circle at 70% 70%, rgba(16,185,129,0.1) 0%, transparent 40%)',
                    filter: 'blur(60px)',
                    animation: 'spin 20s linear infinite' // Simple CSS animation since it's just a background
                }} />

                {/* Moving Tech Grid */}
                <div style={{
                    position: 'absolute', inset: -200,
                    backgroundImage: 'linear-gradient(rgba(197,160,89,0.03) 2px, transparent 2px), linear-gradient(90deg, rgba(197,160,89,0.03) 2px, transparent 2px)',
                    backgroundSize: '100px 100px',
                    transform: 'perspective(1000px) rotateX(45deg) translateY(-20%)',
                    maskImage: 'linear-gradient(to bottom, transparent, black 10%, black 90%, transparent)'
                }} />
            </AbsoluteFill>

            {/* AUDIO MIXTRACK */}
            <Sequence from={s1} durationInFrames={d1}><Audio src={staticFile('flamingo-audio/01_sofia_hook.mp3')} /></Sequence>
            <Sequence from={s2} durationInFrames={d2}><Audio src={staticFile('flamingo-audio/02_david_hesitation.mp3')} /></Sequence>
            <Sequence from={s3} durationInFrames={d3}><Audio src={staticFile('flamingo-audio/03_sofia_value.mp3')} /></Sequence>
            <Sequence from={s4} durationInFrames={d4}><Audio src={staticFile('flamingo-audio/04_david_impressed.mp3')} /></Sequence>
            <Sequence from={s5} durationInFrames={d5}><Audio src={staticFile('flamingo-audio/05_sofia_closer.mp3')} /></Sequence>
            <Sequence from={s6} durationInFrames={d6}><Audio src={staticFile('flamingo-audio/06_david_success.mp3')} /></Sequence>
            <Sequence from={s7} durationInFrames={d7}><Audio src={staticFile('flamingo-audio/07_sofia_success.mp3')} /></Sequence>
            <Sequence from={s8} durationInFrames={d8}><Audio src={staticFile('flamingo-audio/08_voiceover.mp3')} /></Sequence>

            {/* VISUAL SCENES 
                Pass the start frames to the scenes so they can manage their internal avatar talking states based on exact timing.
            */}
            <Sequence from={0} durationInFrames={s2}>
                <Scene1_Hook duration={s2} />
            </Sequence>

            <Sequence from={s2} durationInFrames={s3 - s2}>
                <Scene2_Hesitation duration={s3 - s2} />
            </Sequence>

            <Sequence from={s3} durationInFrames={s4 - s3}>
                <Scene3_ValueBomb duration={s4 - s3} />
            </Sequence>

            <Sequence from={s4} durationInFrames={s6 - s4}>
                <Scene4_Closer startDavid={0} endDavid={d4 + PAUSE} duration={s6 - s4} />
            </Sequence>

            <Sequence from={s6} durationInFrames={s8 - s6}>
                <Scene5_Success startDavid={0} endDavid={d6 + PAUSE} duration={s8 - s6} />
            </Sequence>

            <Sequence from={s8}>
                <Scene6_Voiceover />
            </Sequence>

            {/* GLOBAL WATERMARK (Always on top) */}
            <Watermark />
        </AbsoluteFill>
    );
};
