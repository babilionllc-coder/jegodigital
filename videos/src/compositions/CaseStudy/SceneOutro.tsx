import { AbsoluteFill, useVideoConfig, spring, interpolate, Sequence, Img, staticFile, useCurrentFrame } from "remotion";
import React from "react";

export const SceneOutro: React.FC = () => {
    const { fps } = useVideoConfig();
    const frame = useCurrentFrame();

    const ctaProgress = spring({
        frame: frame - 15,
        fps,
        config: { damping: 12, stiffness: 100 },
    });

    const ctaScale = interpolate(ctaProgress, [0, 1], [0.8, 1]);
    const ctaOpacity = interpolate(ctaProgress, [0, 1], [0, 1]);

    return (
        <AbsoluteFill style={{ backgroundColor: "#0f172a", justifyContent: "center", alignItems: "center" }}>
            {/* Background Gradient */}
            <div
                style={{
                    position: "absolute",
                    width: "150%",
                    height: "150%",
                    background: "radial-gradient(circle, rgba(168,85,247,0.2) 0%, rgba(15,23,42,1) 70%)",
                }}
            />

            {/* Logo */}
            <Sequence from={0}>
                <div style={{ position: "absolute", top: "35%", width: "100%", display: "flex", justifyContent: "center" }}>
                    <Img src={staticFile("assets/jegodigital_logo.png")} style={{ height: "150px", objectFit: "contain", opacity: ctaOpacity, transform: `scale(${ctaScale})` }} />
                </div>
            </Sequence>

            {/* Main Title */}
            <Sequence from={15}>
                <div
                    style={{
                        position: "absolute",
                        top: "55%",
                        width: "100%",
                        transform: `scale(${ctaScale})`,
                        opacity: ctaOpacity,
                        textAlign: "center",
                    }}
                >
                    <h1
                        style={{
                            fontFamily: "Inter, sans-serif",
                            fontSize: "70px",
                            fontWeight: "900",
                            color: "#ffffff",
                            margin: 0,
                        }}
                    >
                        Scale Your Brand Today.
                    </h1>
                    <p style={{ fontFamily: "Inter, sans-serif", fontSize: "40px", color: "#94a3b8", marginTop: "20px" }}>
                        jegodigital.com
                    </p>
                </div>
            </Sequence>
        </AbsoluteFill>
    );
};
