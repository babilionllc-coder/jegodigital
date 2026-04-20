import { AbsoluteFill, Audio, Img, interpolate, Sequence, spring, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';

const KenBurns = ({ src, from, to, duration }: { src: string, from: [number, number], to: [number, number], duration: number }) => {
    const frame = useCurrentFrame();

    // Scale and Pan calculation
    // "from" and "to" are [scale, centerY] roughly.
    // Actually, let's just do a simple Zoom In.

    // Smooth ease-in-out
    const progress = interpolate(frame, [0, duration], [0, 1], {
        extrapolateRight: 'clamp',
        easing: (t) => t * t * (3 - 2 * t) // smoothstep
    });

    const scale = interpolate(progress, [0, 1], [from[0], to[0]]);
    const translateY = interpolate(progress, [0, 1], [from[1], to[1]]); // Move Y to scroll

    return (
        <AbsoluteFill style={{
            transform: `scale(${scale}) translateY(${translateY}px)`,
            transformOrigin: 'center center' // Zoom into center
        }}>
            <Img src={src} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        </AbsoluteFill>
    );
};

const KineticText = ({ text, top, delay }: { text: string, top: number, delay: number }) => {
    const frame = useCurrentFrame();
    const { fps } = useVideoConfig();

    const entrance = spring({
        fps,
        frame: frame - delay,
        config: { damping: 200 }
    });

    const opacity = interpolate(frame - delay, [0, 10], [0, 1], { extrapolateRight: 'clamp' });

    return (
        <h1 style={{
            fontFamily: 'Helevetica, Arial, sans-serif',
            fontWeight: 900,
            fontSize: '80px',
            color: 'white',
            textAlign: 'center',
            position: 'absolute',
            width: '100%',
            top: top,
            opacity: opacity,
            transform: `scale(${entrance})`,
            textShadow: '0 4px 10px rgba(0,0,0,0.5)'
        }}>
            {text}
        </h1>
    );
};

export const StyleVideo = () => {

    // Assets
    const vo = staticFile('assets/style_vo.mp3');
    const screencast = staticFile('assets/screencast.webp');

    return (
        <AbsoluteFill style={{ backgroundColor: '#111' }}>

            <Audio src={vo} />

            {/* Scene 1: Intro (0-5s) - Full view, slight zoom in */}
            <Sequence from={0} durationInFrames={150}>
                <KenBurns src={screencast} from={[1, 0]} to={[1.1, 50]} duration={150} />
                <KineticText text="STOP." top={200} delay={10} />
                <KineticText text="Is it selling?" top={400} delay={60} />
            </Sequence>

            {/* Scene 2: Problem (5-15s) - Scroll Down */}
            <Sequence from={150} durationInFrames={300}>
                <KenBurns src={screencast} from={[1.1, 50]} to={[1.2, -400]} duration={300} />
                <KineticText text="Static Sites = DEAD" top={300} delay={10} />
            </Sequence>

            {/* Scene 3: Solution (15-25s) - Zoom to Services */}
            <Sequence from={450} durationInFrames={300}>
                <KenBurns src={screencast} from={[1.2, -400]} to={[1.5, -800]} duration={300} />
                <KineticText text="Premium Design" top={200} delay={10} />
                <KineticText text="+ Smart AI" top={400} delay={40} />
            </Sequence>

            {/* Scene 4: Detail (25-35s) - Highlighting Button */}
            <Sequence from={750} durationInFrames={300}>
                <KenBurns src={screencast} from={[1.5, -800]} to={[2.0, -100]} duration={300} />
                <KineticText text="Conversion Trap?" top={300} delay={10} />
            </Sequence>

            {/* Scene 5: Outro (35-60s) */}
            <Sequence from={1050} durationInFrames={750}>
                <KenBurns src={screencast} from={[2.0, -100]} to={[1, 0]} duration={60} />
                <KineticText text="Build Your Empire." top={300} delay={20} />
                <KineticText text="JegoDigital.com" top={500} delay={100} />
            </Sequence>

        </AbsoluteFill>
    );
};
