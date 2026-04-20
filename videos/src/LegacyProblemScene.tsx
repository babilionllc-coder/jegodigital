import { AbsoluteFill, Img, interpolate, Sequence, useCurrentFrame, useVideoConfig } from 'remotion';
import React from 'react';

// Brand Colors
const C = {
    bg: '#0f1115',
    gold: '#C5A059',
    white: '#ffffff',
    red: '#ff4444'
};

export const LegacyProblemScene: React.FC = () => {
    const frame = useCurrentFrame();
    const { fps } = useVideoConfig();

    // Glitch effect intensity
    const glitchOffset = Math.sin(frame * 0.5) * 10 * interpolate(frame, [0, 30], [0, 1], { extrapolateRight: 'clamp' });

    // Stamp Animation
    const stampScale = interpolate(frame, [45, 50], [2, 1], { extrapolateRight: 'clamp' });
    const stampOpacity = interpolate(frame, [45, 50], [0, 1], { extrapolateRight: 'clamp' });

    return (
        <AbsoluteFill style={{ backgroundColor: C.bg }}>
            {/* Tech Grid Background */}
            <AbsoluteFill style={{
                backgroundImage: 'linear-gradient(rgba(255, 255, 255, 0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255, 255, 255, 0.05) 1px, transparent 1px)',
                backgroundSize: '50px 50px',
                opacity: 0.1
            }} />

            {/* Legacy Website Mockup (Abstract representation) */}
            <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center' }}>
                <div style={{
                    width: 800,
                    height: 500,
                    backgroundColor: '#e0e0e0',
                    borderRadius: 10,
                    boxShadow: '0 0 50px rgba(0,0,0,0.5)',
                    transform: `translateX(${glitchOffset}px)`,
                    display: 'flex',
                    flexDirection: 'column',
                    overflow: 'hidden'
                }}>
                    {/* Fake Header */}
                    <div style={{ height: 60, backgroundColor: '#3b82f6', width: '100%' }} />
                    {/* Fake Hero */}
                    <div style={{ height: 200, backgroundColor: '#93c5fd', width: '100%', margin: '20px 0' }} />
                    {/* Fake Content */}
                    <div style={{ display: 'flex', gap: 20, padding: 20 }}>
                        <div style={{ flex: 1, height: 100, backgroundColor: '#d1d5db' }} />
                        <div style={{ flex: 1, height: 100, backgroundColor: '#d1d5db' }} />
                        <div style={{ flex: 1, height: 100, backgroundColor: '#d1d5db' }} />
                    </div>
                </div>
            </AbsoluteFill>

            {/* OBSOLETE Stamp */}
            <Sequence from={45}>
                <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center' }}>
                    <div style={{
                        border: `10px solid ${C.red}`,
                        color: C.red,
                        fontSize: 120,
                        fontWeight: 900,
                        fontFamily: 'Jost, sans-serif',
                        padding: '20px 60px',
                        transform: `scale(${stampScale}) rotate(-15deg)`,
                        opacity: stampOpacity,
                        textTransform: 'uppercase',
                        letterSpacing: 10,
                        backgroundColor: 'rgba(0,0,0,0.8)'
                    }}>
                        OBSOLETE
                    </div>
                </AbsoluteFill>
            </Sequence>

            {/* Text Overlay */}
            <Sequence from={60}>
                <AbsoluteFill style={{ justifyContent: 'flex-end', alignItems: 'center', paddingBottom: 100 }}>
                    <h2 style={{
                        color: C.white,
                        fontFamily: 'Jost, sans-serif',
                        fontSize: 60,
                        fontWeight: 'bold',
                        textShadow: '0 4px 10px rgba(0,0,0,0.8)',
                        opacity: interpolate(frame, [60, 70], [0, 1])
                    }}>
                        PRETTY WEBSITES ARE DEAD.
                    </h2>
                </AbsoluteFill>
            </Sequence>
        </AbsoluteFill>
    );
};
