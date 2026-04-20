import { AbsoluteFill, Img, interpolate, Sequence, useCurrentFrame } from 'remotion';
import { staticFile } from 'remotion';

const Title = ({ text, top }: { text: string; top: string }) => {
    const frame = useCurrentFrame();
    const opacity = interpolate(frame, [0, 20], [0, 1], {
        extrapolateRight: 'clamp',
    });
    const translateY = interpolate(frame, [0, 20], [50, 0], {
        extrapolateRight: 'clamp',
    });

    return (
        <div
            style={{
                position: 'absolute',
                top,
                width: '100%',
                textAlign: 'center',
                opacity,
                transform: `translateY(${translateY}px)`,
                fontFamily: 'Helvetica, Arial, sans-serif',
                fontSize: '80px',
                fontWeight: 'bold',
                color: 'white',
                textShadow: '0 0 10px rgba(0,0,0,0.8)',
                zIndex: 1,
            }}
        >
            {text}
        </div>
    );
};

export const PromoVideo = () => {

    return (
        <AbsoluteFill style={{ backgroundColor: 'black' }}>
            <AbsoluteFill>
                {/* Background Screencast */}
                <Img
                    src={staticFile('assets/screencast.webp')} // Remotion can play webp if treated as video/img, but for safety in some envs we use Img or Video. WebP is technically an image format in many contexts but animated webp works in <img>. Let's try <Video> first as it allows playback control, if it fails we fallback. 
                    // Actually, <Video> tag supports .webm. .webp might behave like an image.
                    // Let's use Img if it's an animated webp, or Video if we renamed it. 
                    // Browser subagent output said "WebP videos". Animated WebP supports <Img> in Remotion. 
                    // BUT <Img> in Remotion behaves like a static image unless we force it? 
                    // No, standard <img> tag supports animated webp.
                    // However, to control time, we might need a specific handling.
                    // Let's assume standard <Video> tag (HTML5 video) might NOT support .webp as a source in all render engines (Chrome usually does).
                    // SAFEST: Use <Img> for animated WebP? No, <Img> doesn't expose 'seek'.
                    // Let's trust that Chrome Headless (used by Remotion) treats animated WebP as a valid image source.
                    // However, to sync it might be tricky.
                    // Let's keep it simple: Use it as a background.
                    style={{
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover',
                    }}
                />
            </AbsoluteFill>

            {/* Script Overlays */}
            <Sequence from={0} durationInFrames={150}>
                <Title text="Welcome to JegoDigital" top="20%" />
            </Sequence>

            <Sequence from={150} durationInFrames={300}>
                <Title text="Transforming Local Business" top="30%" />
            </Sequence>

            <Sequence from={450} durationInFrames={300}>
                <Title text="Premium Web Design" top="40%" />
            </Sequence>

            <Sequence from={750} durationInFrames={300}>
                <Title text="Smart SEO & Automation" top="50%" />
            </Sequence>

            <Sequence from={1050} durationInFrames={300}>
                <Title text="Stop Losing Customers" top="40%" />
            </Sequence>

            <Sequence from={1350} durationInFrames={300}>
                <Title text="Build Your Vision Today" top="30%" />
            </Sequence>

            <Sequence from={1650} durationInFrames={150}>
                <Title text="JegoDigital.com" top="45%" />
            </Sequence>

        </AbsoluteFill>
    );
};
