import React from 'react';
import { AbsoluteFill, useCurrentFrame, interpolate, spring, useVideoConfig } from 'remotion';
import { AIAvatar, UserAvatar } from '../../FlamingoPromo/components/Avatars';
import { Captions } from '../../FlamingoPromo/components/Captions';

export const Scene3_ValueBombES: React.FC<{ duration: number }> = ({ duration }) => {
    const frame = useCurrentFrame();
    const { fps } = useVideoConfig();

    // Number counter animation (starts spinning after 1 second / 30 frames)
    const revenueProgress = spring({
        frame: Math.max(0, frame - 30),
        fps,
        config: { damping: 100, mass: 3 },
        durationInFrames: 60
    });

    const currentRevenue = Math.round(interpolate(revenueProgress, [0, 1], [0, 45000]));
    const displayRevenue = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(currentRevenue);

    // Image UI pop inward
    const uiScale = spring({ frame, fps, config: { damping: 15 } });

    const active = frame < (duration - 15);

    return (
        <AbsoluteFill>
            <Captions text="Te entiendo perfecto. Pero mira estos números. La nueva estación del Tren Maya está a 5 minutos de esta propiedad de Flamingo. La ocupación proyectada es del 82%. No estás comprando ladrillos, Jorge; estás comprando una máquina de flujo de efectivo 24/7." color="#C5A059" />

            {/* Center Value Prop UI */}
            <div style={{
                position: 'absolute', top: 380, left: '50%', transform: `translate(-50%, 0) scale(${uiScale})`,
                display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%'
            }}>
                <div style={{
                    background: 'rgba(15,17,21,0.7)', padding: '60px 100px', borderRadius: 60,
                    border: '2px solid rgba(197,160,89,0.5)', backdropFilter: 'blur(40px)',
                    boxShadow: '0 40px 80px rgba(0,0,0,0.8), inset 0 0 50px rgba(197,160,89,0.1)', display: 'flex', flexDirection: 'column', alignItems: 'center'
                }}>
                    <h3 style={{ color: '#8b9bb4', fontSize: 40, textTransform: 'uppercase', letterSpacing: 4, marginBottom: 20 }}>
                        Ingresos Proyectados
                    </h3>

                    {/* Slot Machine Number */}
                    <div style={{
                        fontSize: 120, fontWeight: 900, color: '#10b981', fontFamily: 'Roboto Mono',
                        textShadow: '0 0 40px rgba(16,185,129,0.5)'
                    }}>
                        {displayRevenue}<span style={{ fontSize: 50, color: '#8b9bb4' }}>/año</span>
                    </div>

                    <div style={{
                        marginTop: 30, background: 'rgba(197,160,89,0.2)', border: '2px solid #C5A059', color: '#C5A059',
                        padding: '15px 30px', borderRadius: 30, fontSize: 36, fontWeight: 'bold',
                        boxShadow: '0 0 30px rgba(197,160,89,0.3)'
                    }}>
                        82% Ocupación Asegurada
                    </div>
                </div>
            </div>

            {/* Avatar Container */}
            <div style={{
                position: 'absolute', bottom: 150, left: 0, right: 0, display: 'flex', justifyContent: 'center', gap: 100
            }}>
                <AIAvatar isActive={active} />
                <UserAvatar isActive={false} />
            </div>
        </AbsoluteFill>
    );
};
