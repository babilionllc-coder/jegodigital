import React from 'react';
import { AbsoluteFill, useCurrentFrame, interpolate, spring, useVideoConfig } from 'remotion';
import { AIAvatar, UserAvatar } from '../../FlamingoPromo/components/Avatars';
import { Captions } from '../../FlamingoPromo/components/Captions';

export const Scene2_HesitationES: React.FC<{ duration: number }> = ({ duration }) => {
    const frame = useCurrentFrame();
    const { fps } = useVideoConfig();

    // Split screen glassmorphism panels animating in
    const slideIn = spring({ frame, fps, config: { damping: 15 } });

    // Risk meter (Red) - goes high
    const riskValue = interpolate(frame, [15, 60], [30, 85], { extrapolateRight: 'clamp' }); // 85% risk

    // Jorge speaks until duration - 15
    const active = frame < (duration - 15);

    return (
        <AbsoluteFill>
            <Captions text="No lo sé, Sofía. Aquí en Ciudad de México el mercado es estable. La Riviera Maya se siente como una burbuja. ¿Realmente hay ganancia a largo plazo?" />

            <div style={{
                position: 'absolute', top: 200, left: 60, right: 60, height: 600, display: 'flex', gap: 40
            }}>
                {/* Left Side: CDMX Risk */}
                <div style={{
                    flex: 1, position: 'relative',
                    background: 'rgba(15,17,21,0.7)', backdropFilter: 'blur(30px)', border: '2px solid rgba(244,63,94,0.4)',
                    borderRadius: 40, padding: 40,
                    display: 'flex', flexDirection: 'column', alignItems: 'center',
                    transform: `translateX(${(1 - slideIn) * -100}px)`, opacity: slideIn,
                    boxShadow: '0 0 50px rgba(244,63,94,0.1)'
                }}>
                    <h2 style={{ color: '#f43f5e', fontSize: 48, fontWeight: 'bold', marginBottom: 10 }}>Riesgo CDMX</h2>
                    <h3 style={{ color: '#8b9bb4', fontSize: 32, marginBottom: 40 }}>¿Burbuja Riviera?</h3>

                    {/* Risk Meter UI */}
                    <div style={{ width: 280, height: 280, position: 'relative' }}>
                        <svg viewBox="0 0 100 50" style={{ width: '100%', overflow: 'visible' }}>
                            <path d="M 10 50 A 40 40 0 0 1 90 50" fill="none" stroke="#1a1d24" strokeWidth="15" strokeLinecap="round" />
                            <path d="M 10 50 A 40 40 0 0 1 90 50" fill="none" stroke="#f43f5e" strokeWidth="15" strokeLinecap="round"
                                strokeDasharray="125.6" strokeDashoffset={125.6 - (125.6 * (riskValue / 100))}
                                style={{ transition: 'stroke-dashoffset 0.1s linear' }} />
                        </svg>
                        <div style={{ position: 'absolute', bottom: 10, left: 0, right: 0, textAlign: 'center', fontSize: 72, fontWeight: 900, color: '#f43f5e' }}>
                            {Math.round(riskValue)}%
                        </div>
                    </div>
                </div>

                {/* Right Side: Cancun Growth */}
                <div style={{
                    flex: 1, position: 'relative',
                    background: 'rgba(15,17,21,0.7)', backdropFilter: 'blur(30px)', border: '2px solid rgba(16,185,129,0.4)',
                    borderRadius: 40, padding: 40,
                    display: 'flex', flexDirection: 'column', alignItems: 'center',
                    transform: `translateX(${(1 - slideIn) * 100}px)`, opacity: slideIn,
                    boxShadow: '0 0 50px rgba(16,185,129,0.1)'
                }}>
                    <h2 style={{ color: '#10b981', fontSize: 48, fontWeight: 'bold', marginBottom: 10 }}>Crecimiento Real</h2>
                    <h3 style={{ color: '#8b9bb4', fontSize: 32, marginBottom: 40 }}>ROI a Largo Plazo</h3>

                    {/* Green Check UI element */}
                    <div style={{ width: 180, height: 180, borderRadius: 90, background: 'rgba(16,185,129,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '5px solid #10b981', boxShadow: 'inset 0 0 40px rgba(16,185,129,0.5)' }}>
                        <svg width="100" height="100" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
                            <polyline points="16 7 22 7 22 13" />
                        </svg>
                    </div>
                </div>
            </div>

            {/* Avatar Container */}
            <div style={{
                position: 'absolute', bottom: 150, left: 0, right: 0, display: 'flex', justifyContent: 'center', gap: 100
            }}>
                <AIAvatar isActive={false} />
                <UserAvatar isActive={active} />
            </div>
        </AbsoluteFill>
    );
};
