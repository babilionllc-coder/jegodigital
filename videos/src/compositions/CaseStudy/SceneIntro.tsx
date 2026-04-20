import { AbsoluteFill, useVideoConfig, spring, interpolate, Sequence, Img, staticFile, useCurrentFrame } from "remotion";
import React from "react";

export const SceneIntro: React.FC = () => {
    const { fps } = useVideoConfig();
    const frame = useCurrentFrame();

    // Entrance animation for text
    const titleProgress = spring({
        frame,
        fps,
        config: {
            damping: 12,
            stiffness: 100,
        },
    });

    const titleScale = interpolate(titleProgress, [0, 1], [0.8, 1]);
    const titleOpacity = interpolate(titleProgress, [0, 1], [0, 1]);

    return (
        <AbsoluteFill style={{ backgroundColor: "#0f172a", justifyContent: "center", alignItems: "center" }}>
            {/* Background Gradient */}
            <div
                style={{
                    position: "absolute",
                    width: "150%",
                    height: "150%",
                    background: "radial-gradient(circle, rgba(99,102,241,0.2) 0%, rgba(15,23,42,1) 70%)",
                }}
            />

            {/* Logo */}
            <Sequence from={0}>
                <div style={{ position: "absolute", top: "15%", width: "100%", display: "flex", justifyContent: "center" }}>
                    <Img src={staticFile("assets/jegodigital_logo.png")} style={{ height: "120px", objectFit: "contain", opacity: titleOpacity, transform: `scale(${titleScale})` }} />
                </div>
            </Sequence>

            {/* Main Title */}
            <Sequence from={15}>
                <div
                    style={{
                        transform: `scale(${titleScale})`,
                        opacity: titleOpacity,
                        textAlign: "center",
                    }}
                >
                    <h1
                        style={{
                            fontFamily: "Inter, sans-serif",
                            fontSize: "100px",
                            fontWeight: "900",
                            color: "#ffffff",
                            margin: 0,
                            textShadow: "0 10px 30px rgba(0,0,0,0.5)",
                        }}
                    >
                        The Ultimate
                    </h1>
                    <h1
                        style={{
                            fontFamily: "Inter, sans-serif",
                            fontSize: "120px",
                            fontWeight: "900",
                            background: "linear-gradient(to right, #38bdf8, #818cf8, #c084fc)",
                            WebkitBackgroundClip: "text",
                            WebkitTextFillColor: "transparent",
                            margin: "-20px 0 0 0",
                        }}
                    >
                        Content Machine
                    </h1>
                </div>
            </Sequence>
        </AbsoluteFill>
    );
};
