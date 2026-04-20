import React from 'react';
import { AbsoluteFill, useCurrentFrame, interpolate, spring, useVideoConfig } from 'remotion';
import { AIAvatar, UserAvatar } from '../components/Avatars';
import { Captions } from '../components/Captions';

export const Scene1_Hook: React.FC<{ duration: number }> = ({ duration }) => {
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
            {/* Add a subtle dark blue overlay to make it look like a map */}
            <div style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(15, 23, 42, 0.4)' }} />

            <Captions text="Hola David! I see you're looking at ROI in Tulum, but my data shows Cancún's District 11 is outperforming it by 4% this quarter." color="#C5A059" />

            {/* Cancun Hotspot */}
            <div style={{
                position: 'absolute', top: '35%', left: '50%', transform: `translate(-50%, -50%) scale(${hotSpotScale})`,
                opacity: hotSpotOpacity, display: 'flex', flexDirection: 'column', alignItems: 'center'
            }}>
                <div style={{
                    width: 120, height: 120, borderRadius: 60, border: '6px solid #C5A059',
                    boxShadow: '0 0 60px rgba(197,160,89,0.8)', background: 'rgba(197,160,89,0.2)',
                    position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}>
                    {/* Radar pulse rings */}
                    <div style={{ position: 'absolute', inset: 0, borderRadius: 60, border: '3px solid #C5A059', transform: `scale(${1 + radarPulse * 2})`, opacity: 1 - radarPulse }} />
                    <div style={{ width: 30, height: 30, borderRadius: 15, background: '#C5A059' }} />
                </div>
                <div style={{
                    marginTop: 30, background: 'rgba(15,17,21,0.8)', border: '2px solid #C5A059', color: '#fff', padding: '15px 30px',
                    borderRadius: 40, fontSize: 36, fontWeight: 900, textTransform: 'uppercase', letterSpacing: 2,
                    backdropFilter: 'blur(20px)'
                }}>
                    District 11 • Cancún
                </div>
                <div style={{ color: '#10b981', fontSize: 32, fontWeight: 'bold', marginTop: 15, textShadow: '0 0 20px rgba(16,185,129,0.5)' }}>+4% ROI SURGE</div>
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
