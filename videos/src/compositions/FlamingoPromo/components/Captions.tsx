import React from 'react';
import { useCurrentFrame, interpolate, spring, useVideoConfig } from 'remotion';

// A high-retention TikTok caption component
export const Captions: React.FC<{ text: string, color?: string }> = ({ text, color = '#ffffff' }) => {
    const frame = useCurrentFrame();
    const { fps } = useVideoConfig();

    const words = text.split(' ');

    return (
        <div style={{
            position: 'absolute', top: 500, left: 60, right: 60,
            display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '15px 10px',
            textShadow: '0 4px 20px rgba(0,0,0,0.8)'
        }}>
            {words.map((word, i) => {
                // Typewriter style reveal: 3 frames per word
                const delay = i * 4;
                const scale = spring({
                    frame: frame - delay,
                    fps,
                    config: { damping: 12, mass: 0.8 },
                });
                const opacity = interpolate(frame, [delay, delay + 5], [0, 1], { extrapolateRight: 'clamp' });

                return (
                    <span key={i} style={{
                        fontFamily: 'Outfit, sans-serif', fontSize: 48, fontWeight: 900,
                        transform: `scale(${scale})`, opacity, color: color,
                    }}>
                        {word}
                    </span>
                );
            })}
        </div>
    );
};
