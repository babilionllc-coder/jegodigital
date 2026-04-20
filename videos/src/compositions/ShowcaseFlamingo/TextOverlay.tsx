import {
    AbsoluteFill,
    interpolate,
    spring,
    useCurrentFrame,
    useVideoConfig,
} from "remotion";

interface TextOverlayProps {
    title: string;
    subtitle?: string;
    durationInFrames: number;
}

export const TextOverlay: React.FC<TextOverlayProps> = ({
    title,
    subtitle,
    durationInFrames,
}) => {
    const frame = useCurrentFrame();
    const { fps } = useVideoConfig();

    // Slide-up + fade-in entrance
    const entrance = spring({
        frame,
        fps,
        config: { damping: 18, stiffness: 120, mass: 0.8 },
    });

    // Fade-out in the last 10 frames
    const fadeOutStart = durationInFrames - 10;
    const exitOpacity = interpolate(
        frame,
        [fadeOutStart, durationInFrames],
        [1, 0],
        { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
    );
    const exitSlide = interpolate(
        frame,
        [fadeOutStart, durationInFrames],
        [0, 30],
        { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
    );

    const translateY = interpolate(entrance, [0, 1], [60, 0]) + exitSlide;
    const opacity = interpolate(entrance, [0, 1], [0, 1]) * exitOpacity;

    return (
        <AbsoluteFill
            style={{
                justifyContent: "flex-end",
                alignItems: "center",
            }}
        >
            {/* Gradient overlay bar at the bottom */}
            <div
                style={{
                    width: "100%",
                    padding: "40px 50px 80px",
                    background:
                        "linear-gradient(transparent, rgba(0,0,0,0.85) 40%, rgba(0,0,0,0.95))",
                    transform: `translateY(${translateY}px)`,
                    opacity,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: 12,
                }}
            >
                {/* Gold accent line */}
                <div
                    style={{
                        width: interpolate(entrance, [0, 1], [0, 80]),
                        height: 3,
                        backgroundColor: "#c9a84c",
                        borderRadius: 2,
                        marginBottom: 8,
                    }}
                />

                {/* Main title */}
                <div
                    style={{
                        fontSize: 52,
                        fontWeight: 800,
                        color: "#FFFFFF",
                        fontFamily: "Inter, system-ui, sans-serif",
                        textAlign: "center",
                        textTransform: "uppercase",
                        letterSpacing: "3px",
                        textShadow: "0 4px 20px rgba(0,0,0,0.8), 0 2px 6px rgba(0,0,0,0.6)",
                    }}
                >
                    {title}
                </div>

                {/* Subtitle — bolder for readability */}
                {subtitle && (
                    <div
                        style={{
                            fontSize: 30,
                            fontWeight: 500,
                            color: "rgba(255,255,255,0.95)",
                            fontFamily: "Inter, system-ui, sans-serif",
                            textAlign: "center",
                            letterSpacing: "1.5px",
                            textShadow: "0 2px 8px rgba(0,0,0,0.8)",
                            opacity: interpolate(frame, [8, 18], [0, 1], {
                                extrapolateLeft: "clamp",
                                extrapolateRight: "clamp",
                            }) * exitOpacity,
                        }}
                    >
                        {subtitle}
                    </div>
                )}
            </div>
        </AbsoluteFill>
    );
};
