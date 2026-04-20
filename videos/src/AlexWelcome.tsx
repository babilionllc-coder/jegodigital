import React from 'react';
import { AbsoluteFill, interpolate, Sequence, useCurrentFrame, useVideoConfig, staticFile } from 'remotion';

// Ensure to add google font link in index.html or we'll just rely on the system font fallback for now since it's an MP4 render.
const getFontFamily = () => '"Plus Jakarta Sans", sans-serif';

export const AlexWelcome: React.FC = () => {
    const frame = useCurrentFrame();
    const { fps, durationInFrames } = useVideoConfig();

    return (
        <AbsoluteFill style={{ backgroundColor: '#0f1115' }}>
            {/* The Main Video */}
            <AbsoluteFill>
                {/* Remotion <Video> tag might not be available if not installed so we use a standard HTML video tag. 
                    Actually, it's safer to use Remotion's Img for animated webp, or just standard <video> for mp4.
                    But Remotion provides a hook to sync raw <video> or we can use <Img> / <iframe > / etc.
                    Actually, we can use <video> directly if we sync the currentTime.
                    But the standard way without @remotion/media is an <video> tag where we set currentTime based on frame. */}
                <video
                    src={staticFile('alexvideo_h264.mp4')}
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    autoPlay
                    muted={false} // keeping audio
                    ref={(ref) => {
                        if (ref) {
                            const expectedTime = frame / fps;
                            if (Math.abs(ref.currentTime - expectedTime) > 0.05) {
                                ref.currentTime = expectedTime;
                            }
                        }
                    }}
                />
            </AbsoluteFill>

            {/* Sub-components overlaid */}
            {/* 1. Intro Title Card (0-90 frames = 3 seconds) */}
            <Sequence from={0} durationInFrames={90}>
                <IntroCard />
            </Sequence>

            {/* 2. Lower Third Name Banner (60-270 frames = 7 seconds) */}
            <Sequence from={60} durationInFrames={210}>
                <LowerThird />
            </Sequence>

            {/* 3. Outro (last 150 frames = 5 seconds) */}
            <Sequence from={durationInFrames - 150} durationInFrames={150}>
                <Outro />
            </Sequence>
        </AbsoluteFill>
    );
};

// ------------------------------------------------------------------------------------------------ //

const IntroCard: React.FC = () => {
    const frame = useCurrentFrame();

    // Fade in text over first 15 frames, fade out over last 15 frames
    const opacity = interpolate(
        frame,
        [0, 15, 75, 90],
        [0, 1, 1, 0],
        { extrapolateRight: 'clamp', extrapolateLeft: 'clamp' }
    );

    // Typewriter effect for subtitle
    const text = "AI-Powered Growth for Real Estate Pros";
    const charsShown = Math.floor(interpolate(frame, [15, 60], [0, text.length], { extrapolateRight: 'clamp', extrapolateLeft: 'clamp' }));
    const subtitle = text.slice(0, charsShown);

    return (
        <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', backgroundColor: `rgba(15, 17, 21, ${interpolate(frame, [0, 15, 75, 90], [0, 0.5, 0.5, 0], { extrapolateRight: 'clamp' })})` }}>
            <div style={{ opacity, textAlign: 'center', fontFamily: getFontFamily() }}>
                <h1 style={{ fontSize: '120px', fontWeight: 'bold', margin: '0 0 20px 0', letterSpacing: '4px', background: 'linear-gradient(135deg, #C5A059 0%, #FFFFFF 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                    JEGODIGITAL
                </h1>
                <h2 style={{ fontSize: '48px', color: '#8b9bb4', margin: 0, fontWeight: 300, minHeight: '60px' }}>
                    {subtitle}
                </h2>
            </div>
        </AbsoluteFill>
    );
};

const LowerThird: React.FC = () => {
    const frame = useCurrentFrame();

    // Slide in from left
    const translateX = interpolate(
        frame,
        [0, 20, 190, 210],
        [-1000, 0, 0, -1000],
        { extrapolateRight: 'clamp', extrapolateLeft: 'clamp' }
    );

    return (
        <AbsoluteFill style={{ justifyContent: 'flex-end', alignItems: 'flex-start', padding: '100px' }}>
            <div
                style={{
                    transform: `translateX(${translateX}px)`,
                    background: 'rgba(26, 29, 36, 0.8)',
                    backdropFilter: 'blur(20px)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    borderLeft: '8px solid #C5A059',
                    padding: '30px 50px',
                    borderRadius: '16px',
                    fontFamily: getFontFamily(),
                    boxShadow: '0 20px 40px -10px rgba(0, 0, 0, 0.6)',
                }}
            >
                <div style={{ fontSize: '64px', fontWeight: 'bold', color: 'white', marginBottom: '10px' }}>
                    Alex
                </div>
                <div style={{ fontSize: '32px', color: '#C5A059', textTransform: 'uppercase', letterSpacing: '2px', fontWeight: 500 }}>
                    Founder, JegoDigital
                </div>
            </div>
        </AbsoluteFill>
    );
};

const Outro: React.FC = () => {
    const frame = useCurrentFrame();

    // Fade in dark background
    const bgOpacity = interpolate(frame, [0, 30], [0, 1], { extrapolateRight: 'clamp', extrapolateLeft: 'clamp' });

    // Scale up logo slightly
    const scale = interpolate(frame, [0, 150], [0.9, 1.1], { extrapolateRight: 'clamp', extrapolateLeft: 'clamp' });

    // Fade in CTA
    const ctaOpacity = interpolate(frame, [60, 90], [0, 1], { extrapolateRight: 'clamp', extrapolateLeft: 'clamp' });

    return (
        <AbsoluteFill style={{ backgroundColor: `rgba(15, 17, 21, ${bgOpacity})`, justifyContent: 'center', alignItems: 'center', fontFamily: getFontFamily() }}>
            <div style={{ transform: `scale(${scale})`, textAlign: 'center' }}>
                <h1 style={{ fontSize: '150px', fontWeight: 'bold', margin: '0 0 60px 0', letterSpacing: '6px', background: 'linear-gradient(135deg, #C5A059 0%, #FFFFFF 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                    JEGODIGITAL
                </h1>
                <div style={{ opacity: ctaOpacity }}>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '20px', background: '#C5A059', color: 'black', padding: '30px 60px', borderRadius: '100px', fontSize: '48px', fontWeight: 'bold', boxShadow: '0 0 50px rgba(197, 160, 89, 0.3)' }}>
                        Book a Call &rarr;
                    </div>
                </div>
            </div>
        </AbsoluteFill>
    );
};
