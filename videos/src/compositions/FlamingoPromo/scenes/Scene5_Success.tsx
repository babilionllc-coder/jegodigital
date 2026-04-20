import React from 'react';
import { AbsoluteFill, useCurrentFrame, interpolate, spring, useVideoConfig } from 'remotion';
import { AIAvatar, UserAvatar } from '../components/Avatars';
import { Captions } from '../components/Captions';

export const Scene5_Success: React.FC<{ startDavid: number, endDavid: number, duration: number }> = ({ startDavid, endDavid, duration }) => {
    const frame = useCurrentFrame();
    const { fps } = useVideoConfig();

    // Checkmark pop (happens right when Sofia starts talking to confirm)
    const checkmarkScale = spring({ frame: frame - endDavid, fps, config: { damping: 10, mass: 1 } });
    const checkmarkDraw = spring({ frame: frame - endDavid - 10, fps, config: { damping: 20 }, durationInFrames: 20 });

    // Text bounce
    const textY = interpolate(spring({ frame: frame - endDavid - 20, fps, config: { damping: 12 } }), [0, 1], [100, 0]);
    const textOpacity = interpolate(frame, [endDavid + 20, endDavid + 30], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

    const isDavid = frame >= startDavid && frame < endDavid;
    const isSofia = frame >= endDavid && frame < (duration - 15);

    return (
        <AbsoluteFill>
            {isDavid ? (
                <Captions text="10 AM works perfectly. Thanks Sofia." />
            ) : (
                <Captions text="You're confirmed, David. I've sent the Maya Riviera data packet to your WhatsApp. Talk tomorrow." color="#10b981" />
            )}

            {/* Confetti (Simple CSS Particles trigger when Sofia confirms) */}
            {frame >= endDavid && (
                Array.from({ length: 40 }).map((_, i) => {
                    const startX = 10 + Math.random() * 80;
                    const delay = endDavid + Math.random() * 20;
                    const fallProgress = Math.max(0, frame - delay) / 60;

                    return (
                        <div key={i} style={{
                            position: 'absolute', left: `${startX}%`, top: `${-10 + fallProgress * 120}%`,
                            width: 20, height: 40,
                            backgroundColor: ['#10b981', '#C5A059', '#3b82f6', '#f59e0b', '#fff'][i % 5],
                            transform: `rotate(${fallProgress * 1000}deg)`,
                            opacity: fallProgress > 0.8 ? 1 - (fallProgress - 0.8) * 5 : 1,
                            boxShadow: '0 0 20px rgba(16,185,129,0.5)', zIndex: 50
                        }} />
                    );
                })
            )}

            <div style={{
                position: 'absolute', top: 350, left: 0, right: 0, display: 'flex', flexDirection: 'column', alignItems: 'center'
            }}>
                {/* Huge Green Checkmark */}
                <div style={{
                    transform: `scale(${checkmarkScale})`,
                    width: 300, height: 300, borderRadius: 150, background: 'rgba(16,185,129,0.2)',
                    border: '10px solid #10b981', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    boxShadow: '0 0 100px rgba(16,185,129,0.6)', marginBottom: 60, backdropFilter: 'blur(10px)'
                }}>
                    <svg width="150" height="150" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M20 6L9 17l-5-5" strokeDasharray="30" strokeDashoffset={30 - (checkmarkDraw * 30)} />
                    </svg>
                </div>

                {/* Bouncing Text */}
                <div style={{
                    transform: `translateY(${textY}px)`, opacity: textOpacity,
                    background: 'rgba(26,29,36,0.9)', padding: '30px 60px', borderRadius: 40, border: '4px solid #C5A059',
                    backdropFilter: 'blur(20px)', boxShadow: '0 20px 40px rgba(0,0,0,0.5)'
                }}>
                    <h1 style={{ color: '#fff', fontSize: 64, fontWeight: 900, textTransform: 'uppercase', letterSpacing: 2 }}>
                        AI Closing Deals <span style={{ color: '#10b981' }}>24/7</span>
                    </h1>
                </div>
            </div>

            {/* Avatar Container */}
            <div style={{
                position: 'absolute', bottom: 150, left: 0, right: 0, display: 'flex', justifyContent: 'center', gap: 100
            }}>
                <AIAvatar isActive={isSofia} />
                <UserAvatar isActive={isDavid} />
            </div>
        </AbsoluteFill>
    );
};
