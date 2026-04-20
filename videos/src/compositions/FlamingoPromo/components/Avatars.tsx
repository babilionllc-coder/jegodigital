import React from 'react';
import { useCurrentFrame, interpolate, spring, useVideoConfig } from 'remotion';

export const UserAvatar: React.FC<{ isActive: boolean }> = ({ isActive }) => {
    const frame = useCurrentFrame();
    const scale = spring({ fps: 30, frame: isActive ? frame % 30 : 0, config: { damping: 10 }, durationInFrames: 15 });

    return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 15 }}>
            <div style={{
                width: 140, height: 140, borderRadius: 70, background: '#1a1d24',
                border: `4px solid ${isActive ? '#8b9bb4' : '#334155'}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
                transform: `scale(${isActive ? 1 + (scale * 0.05) : 1})`,
                transition: 'all 0.2s', boxShadow: isActive ? '0 0 40px rgba(139,155,180,0.2)' : 'none'
            }}>
                <svg width="60" height="60" viewBox="0 0 24 24" fill="none" stroke={isActive ? '#8b9bb4' : '#475569'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
                    <circle cx="12" cy="7" r="4" />
                </svg>
            </div>
            <div style={{ color: isActive ? '#fff' : '#8b9bb4', fontSize: 24, fontWeight: 'bold' }}>David (Buyer)</div>
            {isActive && <ActiveWaveform color="#8b9bb4" />}
        </div>
    );
};

export const AIAvatar: React.FC<{ isActive: boolean }> = ({ isActive }) => {
    const frame = useCurrentFrame();
    const pulse = Math.sin(frame / 5) * 0.1;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 15 }}>
            <div style={{
                width: 140, height: 140, borderRadius: 70, background: '#1a1d24',
                border: `4px solid ${isActive ? '#C5A059' : '#334155'}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
                transform: `scale(${isActive ? 1 + pulse : 1})`,
                transition: 'all 0.2s', boxShadow: isActive ? '0 0 50px rgba(197,160,89,0.4)' : 'none'
            }}>
                <div style={{
                    width: 80, height: 80, borderRadius: 40, background: 'linear-gradient(135deg, #C5A059, #E5C585)',
                    filter: isActive ? 'blur(8px)' : 'none', opacity: isActive ? 0.9 : 0.5
                }} />
                <svg style={{ position: 'absolute' }} width="50" height="50" viewBox="0 0 24 24" fill="none" stroke="#0f1115" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
                </svg>
            </div>
            <div style={{ color: isActive ? '#fff' : '#8b9bb4', fontSize: 24, fontWeight: 'bold' }}>Sofia (Flamingo AI)</div>
            {isActive && <ActiveWaveform color="#C5A059" />}
        </div>
    );
};

const ActiveWaveform: React.FC<{ color: string }> = ({ color }) => {
    const frame = useCurrentFrame();
    return (
        <div style={{ display: 'flex', gap: 6, height: 40, alignItems: 'center' }}>
            {[...Array(7)].map((_, i) => {
                const height = 10 + Math.abs(Math.sin(frame / (3 + i)) * 30);
                return (
                    <div key={i} style={{
                        width: 8, height: `${height}px`, background: color, borderRadius: 4, transition: 'height 0.1s'
                    }} />
                );
            })}
        </div>
    );
};
