
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";

export const AgencyPromo: React.FC = () => {
    const frame = useCurrentFrame();
    const opacity = interpolate(frame, [0, 30], [0, 1], { extrapolateRight: "clamp" });
    const translateY = interpolate(frame, [0, 60], [50, 0], { extrapolateRight: "clamp" });

    return (
        <AbsoluteFill
            style={{
                backgroundColor: "#0a0a0a",
                justifyContent: "center",
                alignItems: "center",
                fontFamily: "'Outfit', sans-serif",
            }}
        >
            <div style={{ opacity, transform: `translateY(${translateY}px)` }}>
                <h1
                    style={{
                        color: "#ffffff",
                        fontSize: 100,
                        textAlign: "center",
                        fontWeight: "bold",
                        margin: 0,
                        textShadow: "0 4px 30px rgba(0,0,0,0.5)",
                    }}
                >
                    DOMINIO<span style={{ color: "#D4AF37" }}>DIGITAL</span>
                </h1>
                <p
                    style={{
                        color: "#10B981",
                        fontSize: 40,
                        textAlign: "center",
                        marginTop: 20,
                        letterSpacing: 4,
                        textTransform: "uppercase",
                    }}
                >
                    Cancun 2026 Strategy
                </p>
            </div>

            {/* Subtle Background Particles/Grid Effect could go here */}
            <AbsoluteFill style={{ zIndex: -1, opacity: 0.1 }}>
                <div style={{
                    background: "radial-gradient(circle, rgba(212,175,55,0.2) 0%, rgba(0,0,0,0) 70%)",
                    width: "100%",
                    height: "100%"
                }}></div>
            </AbsoluteFill>
        </AbsoluteFill>
    );
};
