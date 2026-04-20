import {
    AbsoluteFill,
    interpolate,
    spring,
    useCurrentFrame,
    useVideoConfig,
} from "remotion";

interface GozaTextOverlayProps {
    title: string;
    subtitle?: string;
    durationInFrames: number;
}

export const GozaTextOverlay: React.FC<GozaTextOverlayProps> = ({
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

    // JegoDigital Official Gold
    const BRAND_GOLD = "#C5A059";

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
                {/* Official Gold accent line with a subtle glow */}
                <div
                    style={{
                        width: interpolate(entrance, [0, 1], [0, 100]),
                        height: 4,
                        backgroundColor: BRAND_GOLD,
                        borderRadius: 2,
                        marginBottom: 10,
                        boxShadow: `0 0 12px ${BRAND_GOLD}80`, // Hex 80 for 50% opacity
                    }}
                />

                {/* Main title */}
                <div
                    style={{
                        fontSize: 54,
                        fontWeight: 800,
                        color: "#FFFFFF",
                        fontFamily: "Outfit, Inter, system-ui, sans-serif",
                        textAlign: "center",
                        textTransform: "uppercase",
                        letterSpacing: "4px",
                        textShadow: "0 4px 20px rgba(0,0,0,0.8), 0 2px 6px rgba(0,0,0,0.6)",
                    }}
                >
                    {title}
                </div>

                {/* Subtitle — bolder for readability */}
                {subtitle && (
                    <div
                        style={{
                            fontSize: 32, // slightly larger for polish
                            fontWeight: 500,
                            color: BRAND_GOLD, // Subtitle in gold helps it pop and ties branding together
                            fontFamily: "Outfit, Inter, system-ui, sans-serif",
                            textAlign: "center",
                            letterSpacing: "2px",
                            textShadow: "0 2px 8px rgba(0,0,0,0.8)",
                            opacity: interpolate(frame, [10, 20], [0, 1], {
                                extrapolateLeft: "clamp",
                                extrapolateRight: "clamp",
                            }) * exitOpacity,
                            transform: `translateY(${interpolate(frame, [10, 20], [10, 0], {
                                extrapolateLeft: "clamp",
                                extrapolateRight: "clamp",
                            })}px)`,
                        }}
                    >
                        {subtitle}
                    </div>
                )}
            </div>
        </AbsoluteFill>
    );
};
