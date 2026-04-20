import React, { useMemo } from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig, spring, Easing } from 'remotion';

// A dynamic "AI Node Network" background animation
export const JegoHeroBg: React.FC<{
    primaryColor?: string;
    secondaryColor?: string;
    bgColor?: string;
}> = ({
    primaryColor = '#C5A059',
    secondaryColor = '#FFFFFF',
    bgColor = '#0f1115'
}) => {
        const frame = useCurrentFrame();
        const { fps, height, width } = useVideoConfig();

        // Draw some floating "data" nodes or particles
        const particles = useMemo(() => {
            return Array.from({ length: 40 }).map((_, i) => {
                return {
                    id: i,
                    x: Math.random() * width,
                    y: Math.random() * height,
                    size: Math.random() * 4 + 1,
                    speed: Math.random() * 0.5 + 0.1,
                    opacityBase: Math.random() * 0.5 + 0.1,
                };
            });
        }, [width, height]);

        // Make them move and pulse
        return (
            <AbsoluteFill style={{ backgroundColor: bgColor, overflow: 'hidden' }}>

                {/* Background radial gradient to give it depth */}
                <AbsoluteFill style={{
                    background: `radial-gradient(circle at center, rgba(197, 160, 89, 0.05) 0%, transparent 60%)`,
                }} />

                {/* Grid pattern moving slightly */}
                <AbsoluteFill>
                    <div style={{
                        width: '200%',
                        height: '200%',
                        position: 'absolute',
                        top: '-50%',
                        left: '-50%',
                        backgroundImage: 'radial-gradient(rgba(255,255,255,0.05) 2px, transparent 2px)',
                        backgroundSize: '80px 80px',
                        transform: `translateY(${interpolate((frame * 0.5) % 80, [0, 80], [0, 80])}px) translateX(${interpolate((frame * 0.2) % 80, [0, 80], [0, 80])}px)`
                    }} />
                </AbsoluteFill>

                {/* Particles/Nodes */}
                {particles.map((p) => {
                    // Continuous slow upward movement + slight sine wave X movement
                    const yPos = (p.y - frame * p.speed) % height;
                    // Handle wrap around smoothly 
                    const adjustedY = yPos < 0 ? height + yPos : yPos;

                    const xOffset = Math.sin((frame + p.id * 10) * 0.02) * 50;
                    const pulseOpacity = p.opacityBase + Math.sin(frame * 0.05 + p.id) * 0.2;

                    return (
                        <div
                            key={p.id}
                            style={{
                                position: 'absolute',
                                top: adjustedY,
                                left: p.x + xOffset,
                                width: p.size,
                                height: p.size,
                                borderRadius: '50%',
                                backgroundColor: p.id % 3 === 0 ? secondaryColor : primaryColor,
                                opacity: pulseOpacity,
                                boxShadow: `0 0 ${p.size * 3}px ${p.id % 3 === 0 ? secondaryColor : primaryColor}`,
                            }}
                        />
                    );
                })}

                {/* Connection Lines between close particles (simplified) */}
                <svg style={{ position: 'absolute', width: '100%', height: '100%' }}>
                    {particles.map((p1, i) => {
                        // Only connect a subset to avoid too many DOM elements
                        if (i % 2 !== 0) return null;

                        return particles.map((p2, j) => {
                            if (i >= j) return null;
                            if (j % 5 !== 0) return null; // reduce lines

                            const x1 = p1.x + Math.sin((frame + p1.id * 10) * 0.02) * 50;
                            const y1 = p1.y < 0 ? height + p1.y : (p1.y - frame * p1.speed) % height;

                            const x2 = p2.x + Math.sin((frame + p2.id * 10) * 0.02) * 50;
                            const y2 = p2.y < 0 ? height + p2.y : (p2.y - frame * p2.speed) % height;

                            // Only draw line if they are relatively close, but since y wraps, ignore wrap edge cases for simplicity by checking distance
                            const dx = x1 - x2;
                            const dy = y1 - y2;
                            const dist = Math.sqrt(dx * dx + dy * dy);

                            if (dist < 250) {
                                const lineOpacity = interpolate(dist, [50, 250], [0.15, 0]) * (p1.opacityBase + Math.sin(frame * 0.05 + p1.id) * 0.2);
                                return (
                                    <line
                                        key={`${i}-${j}`}
                                        x1={x1} y1={y1} x2={x2} y2={y2}
                                        stroke={primaryColor}
                                        strokeWidth="1"
                                        opacity={Math.max(0, lineOpacity)}
                                    />
                                )
                            }
                            return null;
                        });
                    })}
                </svg>

                {/* Light sweep representing "Scan" */}
                <AbsoluteFill>
                    <div style={{
                        position: 'absolute',
                        left: 0,
                        right: 0,
                        height: height * 0.2,
                        background: 'linear-gradient(to bottom, transparent, rgba(197, 160, 89, 0.1), transparent)',
                        top: `${(frame * 3) % (height * 1.5) - height * 0.2}px`,
                        opacity: 0.5
                    }} />
                </AbsoluteFill>

            </AbsoluteFill>
        );
    };
