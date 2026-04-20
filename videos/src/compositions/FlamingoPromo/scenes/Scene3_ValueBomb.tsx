import React from 'react';
import { AbsoluteFill, useCurrentFrame, interpolate, spring, useVideoConfig } from 'remotion';
import { AIAvatar, UserAvatar } from '../components/Avatars';
import { Captions } from '../components/Captions';

export const Scene3_ValueBomb: React.FC<{ duration: number }> = ({ duration }) => {
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
            <Captions text="I understand. But look at this. The new Maya Train station is 5 minutes from this Flamingo property. Occupancy rates are projected at 82%. You aren't just buying bricks; you're buying a 24/7 cash-flow machine." color="#C5A059" />

            {/* Center Value Prop UI */}
            <div style={{
                position: 'absolute', top: 300, left: '50%', transform: `translate(-50%, 0) scale(${uiScale})`,
                display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%'
            }}>
                <div style={{
                    background: 'rgba(15,17,21,0.7)', padding: '50px 80px', borderRadius: 50,
                    border: '2px solid rgba(197,160,89,0.5)', backdropFilter: 'blur(30px)',
                    boxShadow: '0 30px 60px rgba(0,0,0,0.8)', display: 'flex', flexDirection: 'column', alignItems: 'center'
                }}>
                    <h3 style={{ color: '#8b9bb4', fontSize: 36, textTransform: 'uppercase', letterSpacing: 4, marginBottom: 20 }}>
                        Projected Revenue
                    </h3>

                    {/* Slot Machine Number */}
                    <div style={{
                        fontSize: 100, fontWeight: 900, color: '#10b981', fontFamily: 'Roboto Mono',
                        textShadow: '0 0 30px rgba(16,185,129,0.4)'
                    }}>
                        {displayRevenue}<span style={{ fontSize: 40, color: '#8b9bb4' }}>/yr</span>
                    </div>

                    <div style={{
                        marginTop: 30, background: 'rgba(197,160,89,0.2)', border: '1px solid #C5A059', color: '#C5A059',
                        padding: '10px 20px', borderRadius: 20, fontSize: 30, fontWeight: 'bold'
                    }}>
                        82% Projected Occupancy
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
