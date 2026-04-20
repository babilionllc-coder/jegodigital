import React from 'react';
import { AbsoluteFill, useCurrentFrame, interpolate, spring, useVideoConfig } from 'remotion';
import { AIAvatar, UserAvatar } from '../../FlamingoPromo/components/Avatars';
import { Captions } from '../../FlamingoPromo/components/Captions';

export const Scene4_CloserES: React.FC<{ startJorge: number, endJorge: number, duration: number }> = ({ startJorge, endJorge, duration }) => {
    const frame = useCurrentFrame();
    const { fps } = useVideoConfig();

    // Button pop-ins (delayed to when Sofia speaks around frame 189 + 15 pause = 204)
    const btn1Pop = spring({ frame: frame - 220, fps, config: { damping: 12 } });
    const btn2Pop = spring({ frame: frame - 230, fps, config: { damping: 12 } });

    const cursorX = interpolate(frame, [350, 400], [800, 300], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
    const cursorY = interpolate(frame, [350, 400], [1500, 600], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

    const cursorClickScale = interpolate(frame, [400, 410, 420], [1, 0.8, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
    const btn1ClickScale = interpolate(frame, [400, 410, 420], [1, 0.95, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

    const btn1Clicked = frame >= 410;

    const isJorge = frame >= startJorge && frame < endJorge;
    const isSofia = frame >= endJorge && frame < (duration - 15);

    return (
        <AbsoluteFill>
            {isJorge ? (
                <Captions text="Ok, eso es impresionante. Pero necesito ver esos números en persona antes de comprometerme." />
            ) : (
                <Captions text="Exactamente por eso ya despejé la agenda de mi bróker para ti. Tengo un espacio VIP para un recorrido mañana a las 10 AM, o el jueves a las 4 PM. ¿Cuál horario asegura tu futuro, Jorge?" color="#C5A059" />
            )}

            <div style={{
                position: 'absolute', top: 200, left: 0, right: 0, display: 'flex', flexDirection: 'column', alignItems: 'center'
            }}>
                <h2 style={{ color: '#fff', fontSize: 60, fontWeight: 900, marginBottom: 20, letterSpacing: 2 }}>Recorrido VIP</h2>
                <p style={{ color: '#8b9bb4', fontSize: 36 }}>Asegura tu futuro hoy</p>
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
                    boxShadow: btn1Clicked ? '0 0 50px rgba(16,185,129,0.5)' : '0 0 40px rgba(197,160,89,0.2)',
                    transition: 'background 0.2s, box-shadow 0.2s', backdropFilter: 'blur(20px)'
                }}>
                    <div style={{ width: 60, height: 60, borderRadius: 30, background: btn1Clicked ? '#fff' : '#C5A059', color: btn1Clicked ? '#10b981' : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 30 }}>1</div>
                    <span style={{ fontSize: 46, fontWeight: 'bold', color: '#fff' }}>Mañana a las 10 AM</span>
                </div>

                {/* Button 2 */}
                <div style={{
                    transform: `scale(${btn2Pop})`,
                    background: 'rgba(26,29,36,0.9)', border: '4px solid #334155',
                    padding: '40px 80px', borderRadius: 40, display: 'flex', alignItems: 'center', gap: 30,
                    opacity: btn1Clicked ? 0.3 : 1, transition: 'opacity 0.5s', backdropFilter: 'blur(20px)'
                }}>
                    <div style={{ width: 60, height: 60, borderRadius: 30, background: '#334155', color: '#8b9bb4', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 30 }}>2</div>
                    <span style={{ fontSize: 46, fontWeight: 'bold', color: '#8b9bb4' }}>El Jueves 4 PM</span>
                </div>
            </div>

            {/* Animated Mouse Cursor */}
            <div style={{
                position: 'absolute', left: `${cursorX}px`, top: `${cursorY}px`,
                transform: `scale(${cursorClickScale})`, zIndex: 100
            }}>
                <svg width="80" height="80" viewBox="0 0 24 24" fill="white" stroke="#000" strokeWidth="1" style={{ filter: 'drop-shadow(0 10px 10px rgba(0,0,0,0.5))' }}>
                    <path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z" />
                </svg>
            </div>

            {/* Avatar Container */}
            <div style={{
                position: 'absolute', bottom: 150, left: 0, right: 0, display: 'flex', justifyContent: 'center', gap: 100
            }}>
                <AIAvatar isActive={isSofia} />
                <UserAvatar isActive={isJorge} />
            </div>
        </AbsoluteFill>
    );
};
