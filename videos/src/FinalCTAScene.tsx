import { AbsoluteFill, Img, interpolate, useCurrentFrame } from 'remotion';
import React from 'react';
import { staticFile } from 'remotion';

const C = {
    bg: '#0f1115',
    gold: '#C5A059',
    white: '#ffffff'
};

export const FinalCTAScene: React.FC = () => {
    const frame = useCurrentFrame();
    // const { fps } = useVideoConfig(); // Unused

    const opacity = interpolate(frame, [0, 30], [0, 1]);
    const scale = interpolate(frame, [0, 60], [0.9, 1], { extrapolateRight: 'clamp' });
    const glow = interpolate(frame, [0, 60], [0, 50]);

    return (
        <AbsoluteFill style={{ backgroundColor: C.bg, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>

            {/* Logo */}
            <div style={{
                opacity,
                transform: `scale(${scale})`,
                marginBottom: 60,
                filter: `drop-shadow(0 0 ${glow}px ${C.gold}40)`
            }}>
                <Img
                    src={staticFile('assets/JEGODIGITAL.png')}
                    style={{ width: 800 }}
                    onError={(e) => {
                        // Fallback just in case, though we expect the file to exist based on previous tasks
                        console.error("Logo not found");
                    }}
                />
            </div>

            {/* CTA Button */}
            <div style={{
                backgroundColor: C.gold,
                color: '#000',
                padding: '20px 60px',
                fontSize: 40,
                fontFamily: 'Jost, sans-serif',
                fontWeight: 'bold',
                borderRadius: 5,
                opacity: interpolate(frame, [30, 45], [0, 1]),
                transform: `translateY(${interpolate(frame, [30, 45], [20, 0], { extrapolateRight: 'clamp' })}px)`,
                boxShadow: `0 0 30px ${C.gold}`
            }}>
                INSTALL THE STACK
            </div>

            <div style={{
                color: C.white,
                fontFamily: 'Roboto Mono, monospace',
                marginTop: 30,
                fontSize: 24,
                letterSpacing: 5,
                opacity: interpolate(frame, [45, 60], [0, 1]),
            }}>
                JEGODIGITAL.COM
            </div>

        </AbsoluteFill>
    );
};
