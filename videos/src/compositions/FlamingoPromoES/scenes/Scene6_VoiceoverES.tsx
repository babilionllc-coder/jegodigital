import React from 'react';
import { AbsoluteFill, useCurrentFrame, interpolate, spring, useVideoConfig } from 'remotion';
import { Captions } from '../../FlamingoPromo/components/Captions';

export const Scene6_VoiceoverES: React.FC = () => {
    const frame = useCurrentFrame();
    const { fps } = useVideoConfig();

    // Fast zoom in effect
    const textZoom = spring({ frame, fps, config: { damping: 10, mass: 1 } });

    // Pulsing effect after zoom
    const pulse = Math.sin(frame / 5) * 0.05;

    return (
        <AbsoluteFill>
            <Captions text="¿Quieres este asistente de Inteligencia Artificial para tu agencia? Comenta A I aquí abajo y te daremos acceso gratuito. Desarrollado por JegoDigital." color="#fff" />

            <div style={{
                position: 'absolute', top: 400, left: 0, right: 0, display: 'flex', flexDirection: 'column', alignItems: 'center'
            }}>
                <div style={{
                    transform: `scale(${textZoom + pulse})`,
                    background: '#C5A059', padding: '60px 100px', borderRadius: 60,
                    boxShadow: '0 0 150px rgba(197,160,89,0.8)', border: '10px solid #fff'
                }}>
                    <h1 style={{ color: '#0f1115', fontSize: 100, fontWeight: 900, textTransform: 'uppercase', textAlign: 'center', lineHeight: 1.1 }}>
                        Comenta<br />
                        <span style={{ color: '#fff', fontSize: 150, textShadow: '0 5px 20px rgba(0,0,0,0.5)' }}>"AI"</span>
                    </h1>
                </div>

                <div style={{
                    marginTop: 100, opacity: textZoom, color: '#fff', fontSize: 48, fontWeight: 'bold',
                    background: 'rgba(0,0,0,0.5)', padding: '20px 40px', borderRadius: 30, backdropFilter: 'blur(10px)'
                }}>
                    Obtén el sistema exacto.
                </div>
            </div>
        </AbsoluteFill>
    );
};
