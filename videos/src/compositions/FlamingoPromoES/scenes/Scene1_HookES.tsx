import React from 'react';
import { AbsoluteFill, useCurrentFrame, interpolate, spring, useVideoConfig } from 'remotion';
import { AIAvatar, UserAvatar } from '../../FlamingoPromo/components/Avatars';
import { Captions } from '../../FlamingoPromo/components/Captions';

export const Scene1_HookES: React.FC<{ duration: number }> = ({ duration }) => {
    const frame = useCurrentFrame();
    const { fps } = useVideoConfig();

    // Elements animate in
    const hotSpotScale = spring({ frame: frame - 20, fps, config: { damping: 12 } });
    const hotSpotOpacity = interpolate(frame, [20, 30], [0, 1], { extrapolateRight: 'clamp' });

    // Pulsing radar effect
    const radarPulse = (frame % 30) / 30; // 0 to 1 loop

    // Sofia speaks until duration - 15 (which is the pause)
    const active = frame < (duration - 15);

    return (
        <AbsoluteFill>
            <Captions text="¡Hola Jorge! Veo que estás analizando el R. O. I. en Tulum, pero mis datos muestran que el Distrito 11 de Cancún lo está superando por un 4% este trimestre. ¿Te interesa?" color="#C5A059" />

            {/* Cancun Hotspot */}
            <div style={{
                position: 'absolute', top: '35%', left: '50%', transform: `translate(-50%, -50%) scale(${hotSpotScale})`,
                opacity: hotSpotOpacity, display: 'flex', flexDirection: 'column', alignItems: 'center'
            }}>
                <div style={{
                    width: 150, height: 150, borderRadius: 75, border: '6px solid #C5A059',
                    boxShadow: '0 0 60px rgba(197,160,89,0.8)', background: 'rgba(197,160,89,0.2)',
                    position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}>
                    {/* Radar pulse rings */}
                    <div style={{ position: 'absolute', inset: 0, borderRadius: 75, border: '3px solid #C5A059', transform: `scale(${1 + radarPulse * 2})`, opacity: 1 - radarPulse }} />
                    <div style={{ width: 40, height: 40, borderRadius: 20, background: '#C5A059', boxShadow: '0 0 30px #C5A059' }} />
                </div>
                <div style={{
                    marginTop: 40, background: 'rgba(15,17,21,0.8)', border: '2px solid #C5A059', color: '#fff', padding: '20px 40px',
                    borderRadius: 40, fontSize: 40, fontWeight: 900, textTransform: 'uppercase', letterSpacing: 2,
                    backdropFilter: 'blur(20px)'
                }}>
                    Distrito 11 • Cancún
                </div>
                <div style={{ color: '#10b981', fontSize: 36, fontWeight: 'bold', marginTop: 15, textShadow: '0 0 20px rgba(16,185,129,0.5)' }}>+4% R.O.I. INCREMENTO</div>
            </div>

            {/* Avatar Container (SaaS Call Interface) */}
            <div style={{
                position: 'absolute', bottom: 150, left: 0, right: 0, display: 'flex', justifyContent: 'center', gap: 100
            }}>
                <AIAvatar isActive={active} />
                <UserAvatar isActive={false} />
            </div>
        </AbsoluteFill>
    );
};
