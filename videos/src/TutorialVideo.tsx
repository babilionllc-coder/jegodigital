import { AbsoluteFill, Audio, Img, interpolate, Sequence, staticFile, useCurrentFrame, useVideoConfig, Video } from 'remotion';

export const TutorialVideo = () => {
    const frame = useCurrentFrame();
    const { fps } = useVideoConfig(); // 30fps

    // Timing
    const introDuration = 10 * fps;
    const demoDuration = 25 * fps;

    // Assets
    const bg = staticFile('assets/purple_studio.png');
    const avatar = staticFile('assets/avatar_tutorial.mp4');
    const screencast = staticFile('assets/screencast.webp');
    const whoosh = staticFile('assets/whoosh.mp3');
    const pop = staticFile('assets/pop.mp3');

    // Intro & Outro: Avatar Full Screen
    // Demo: Avatar PIP (Bottom Left)

    // We calculate "PIP" state based on frame
    const isPip = frame > introDuration && frame < (introDuration + demoDuration);

    // Interpolate Avatar Position/Scale
    const scale = interpolate(frame,
        [introDuration - 10, introDuration],
        [1, 0.4],
        { extrapolateRight: 'clamp', extrapolateLeft: 'clamp' }
    );

    const transX = interpolate(frame,
        [introDuration - 10, introDuration],
        [0, -500], // Move left
        { extrapolateRight: 'clamp', extrapolateLeft: 'clamp' }
    );

    const transY = interpolate(frame,
        [introDuration - 10, introDuration],
        [0, 300], // Move down
        { extrapolateRight: 'clamp', extrapolateLeft: 'clamp' }
    );

    return (
        <AbsoluteFill style={{ backgroundColor: '#1a1a1a' }}>

            {/* Background Layer - Always Studio, but covered by Screencast during demo */}
            <AbsoluteFill>
                <Img src={bg} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            </AbsoluteFill>

            {/* Screencast Layer - Only visible during demo */}
            <Sequence from={introDuration} durationInFrames={demoDuration}>
                <AbsoluteFill>
                    <Img src={screencast} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                </AbsoluteFill>
                <Audio src={whoosh} />
            </Sequence>

            {/* Avatar Layer - Transitions from Full to PIP */}
            <AbsoluteFill style={{
                transform: `translateX(${isPip ? transX : 0}px) translateY(${isPip ? transY : 0}px) scale(${isPip ? scale : 1})`,
                transformOrigin: 'bottom center',
                zIndex: 10
            }}>
                {/* 
                   Ideally we would key out the green here. 
                   For now, valid "Tutorial Style" often uses a circular crop for the head.
                   Let's add a circular mask if in PIP mode? 
                   Actually, let's keep it simple: Just the video.
                */}
                <Video src={avatar} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            </AbsoluteFill>

            {/* Text Overlays */}
            <Sequence from={fps * 2} durationInFrames={fps * 5}>
                <h1 style={{ color: 'white', position: 'absolute', top: 100, left: 100, fontSize: 80, textShadow: '0 0 20px purple' }}>
                    Future of Digital
                </h1>
                <Audio src={pop} />
            </Sequence>

            <Sequence from={introDuration + fps} durationInFrames={fps * 5}>
                <h1 style={{ color: 'white', position: 'absolute', top: 100, right: 100, fontSize: 80, textShadow: '0 0 20px purple' }}>
                    Conversion Engine
                </h1>
                <Audio src={pop} />
            </Sequence>

        </AbsoluteFill>
    );
};
