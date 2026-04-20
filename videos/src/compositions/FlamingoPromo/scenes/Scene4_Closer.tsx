import React from 'react';
import { AbsoluteFill, useCurrentFrame, interpolate, spring, useVideoConfig } from 'remotion';
import { AIAvatar, UserAvatar } from '../components/Avatars';
import { Captions } from '../components/Captions';

export const Scene4_Closer: React.FC<{ startDavid: number, endDavid: number, duration: number }> = ({ startDavid, endDavid, duration }) => {
    const frame = useCurrentFrame();
    const { fps } = useVideoConfig();

    // Button pop-ins (delayed to frame 150 which is around when Sofia offers the times)
    const btn1Pop = spring({ frame: frame - 150, fps, config: { damping: 12 } });
    const btn2Pop = spring({ frame: frame - 160, fps, config: { damping: 12 } });

    const cursorX = interpolate(frame, [250, 300], [800, 300], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
    const cursorY = interpolate(frame, [250, 300], [1500, 600], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

    const cursorClickScale = interpolate(frame, [300, 310, 320], [1, 0.8, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
    const btn1ClickScale = interpolate(frame, [300, 310, 320], [1, 0.95, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

    const btn1Clicked = frame >= 310;

    const isDavid = frame >= startDavid && frame < endDavid;
    const isSofia = frame >= endDavid && frame < (duration - 15);

    return (
        <AbsoluteFill>
            {isDavid ? (
                <Captions text="Okay, that's impressive. But I need to see the numbers in person before I commit." />
            ) : (
                <Captions text="Exactly why I've already cleared my broker's schedule for you. I have a VIP tour slot tomorrow at 10 AM or Thursday at 4 PM. Which one secures your future, David?" color="#C5A059" />
            )}

            <div style={{
                position: 'absolute', top: 200, left: 0, right: 0, display: 'flex', flexDirection: 'column', alignItems: 'center'
            }}>
                <h2 style={{ color: '#fff', fontSize: 60, fontWeight: 900, marginBottom: 20 }}>VIP Tour Slot</h2>
                <p style={{ color: '#8b9bb4', fontSize: 36 }}>Which one secures your future?</p>
            </div>

            {/* Buttons */}
            <div style={{
                position: 'absolute', top: 400, left: 0, right: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 40
            }}>
                {/* Button 1 */}
                <div style={{
                    transform: `scale(${btn1Pop * btn1ClickScale})`,
                    background: btn1Clicked ? 'rgba(16,185,129,0.9)' : 'rgba(26,29,36,0.9)',
                    border: `4px solid ${btn1Clicked ? '#10b981' : '#C5A059'}`,
                    padding: '40px 80px', borderRadius: 40, display: 'flex', alignItems: 'center', gap: 30,
                    boxShadow: btn1Clicked ? '0 0 50px rgba(16,185,129,0.5)' : 'none',
                    transition: 'background 0.2s, box-shadow 0.2s', backdropFilter: 'blur(10px)'
                }}>
                    <div style={{ width: 60, height: 60, borderRadius: 30, background: btn1Clicked ? '#fff' : '#C5A059', color: btn1Clicked ? '#10b981' : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 30 }}>1</div>
                    <span style={{ fontSize: 50, fontWeight: 'bold', color: '#fff' }}>Tomorrow 10:00 AM</span>
                </div>

                {/* Button 2 */}
                <div style={{
                    transform: `scale(${btn2Pop})`,
                    background: 'rgba(26,29,36,0.9)', border: '4px solid #334155',
                    padding: '40px 80px', borderRadius: 40, display: 'flex', alignItems: 'center', gap: 30,
                    opacity: btn1Clicked ? 0.3 : 1, transition: 'opacity 0.5s', backdropFilter: 'blur(10px)'
                }}>
                    <div style={{ width: 60, height: 60, borderRadius: 30, background: '#334155', color: '#8b9bb4', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 30 }}>2</div>
                    <span style={{ fontSize: 50, fontWeight: 'bold', color: '#8b9bb4' }}>Thursday 4:00 PM</span>
                </div>
            </div>

            {/* Animated Mouse Cursor */}
            <div style={{
                position: 'absolute', left: `${cursorX}px`, top: `${cursorY}px`,
                transform: `scale(${cursorClickScale})`, zIndex: 100
            }}>
                <svg width="80" height="80" viewBox="0 0 24 24" fill="white" stroke="#000" strokeWidth="1" style={{ dropShadow: '0 10px 10px rgba(0,0,0,0.5)' }}>
                    <path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z" />
                </svg>
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
