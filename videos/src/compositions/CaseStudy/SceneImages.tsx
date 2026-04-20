import { AbsoluteFill, useVideoConfig, spring, interpolate, Sequence, Img, staticFile, useCurrentFrame } from "remotion";
import React from "react";

export const SceneImages: React.FC = () => {
    const { fps } = useVideoConfig();
    const frame = useCurrentFrame();

    const textProgress = spring({
        frame,
        fps,
        config: { damping: 14, stiffness: 90 },
    });

    const textTranslateY = interpolate(textProgress, [0, 1], [50, 0]);
    const textOpacity = interpolate(textProgress, [0, 1], [0, 1]);

    // Image zoom effect
    const imageScale = interpolate(frame, [0, 150], [1, 1.1], {
        extrapolateRight: "clamp",
    });

    return (
        <AbsoluteFill style={{ backgroundColor: "#000" }}>
            {/* Background Images fading in and out */}
            <Sequence from={0} durationInFrames={60}>
                <AbsoluteFill>
                    <Img
                        src={staticFile("assets/casestudy/image1.png")}
                        style={{ width: "100%", height: "100%", objectFit: "cover", transform: `scale(${imageScale})`, opacity: interpolate(frame, [0, 15, 45, 60], [0, 0.4, 0.4, 0]) }}
                    />
                </AbsoluteFill>
            </Sequence>
            <Sequence from={60} durationInFrames={60}>
                <AbsoluteFill>
                    <Img
                        src={staticFile("assets/casestudy/image2.png")}
                        style={{ width: "100%", height: "100%", objectFit: "cover", transform: `scale(${imageScale})`, opacity: interpolate(frame, [60, 75, 105, 120], [0, 0.4, 0.4, 0]) }}
                    />
                </AbsoluteFill>
            </Sequence>
            <Sequence from={120} durationInFrames={60}>
                <AbsoluteFill>
                    <Img
                        src={staticFile("assets/casestudy/image3.png")}
                        style={{ width: "100%", height: "100%", objectFit: "cover", transform: `scale(${imageScale})`, opacity: interpolate(frame, [120, 135, 165, 180], [0, 0.4, 0.4, 0]) }}
                    />
                </AbsoluteFill>
            </Sequence>

            <div
                style={{
                    position: "absolute",
                    top: "40%",
                    width: "100%",
                    textAlign: "center",
                    opacity: textOpacity,
                    transform: `translateY(${textTranslateY}px)`,
                }}
            >
                <div style={{
                    display: "inline-block",
                    background: "rgba(15, 23, 42, 0.8)",
                    padding: "40px 80px",
                    borderRadius: "30px",
                    border: "2px solid rgba(255,255,255,0.1)",
                    backdropFilter: "blur(10px)",
                }}>
                    <h2
                        style={{
                            fontFamily: "Inter, sans-serif",
                            fontSize: "80px",
                            fontWeight: "bold",
                            color: "#fff",
                            margin: 0,
                        }}
                    >
                        AI Branding Images
                    </h2>
                    <p
                        style={{
                            fontFamily: "Inter, sans-serif",
                            fontSize: "40px",
                            color: "#94a3b8",
                            margin: "20px 0 0 0",
                        }}
                    >
                        Premium visual assets customized for your brand in seconds.
                    </p>
                </div>
            </div>
        </AbsoluteFill>
    );
};
