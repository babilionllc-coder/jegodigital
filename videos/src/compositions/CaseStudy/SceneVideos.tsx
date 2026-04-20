import { AbsoluteFill, useVideoConfig, spring, interpolate, Video, staticFile, Sequence, useCurrentFrame } from "remotion";
import React from "react";

export const SceneVideos: React.FC = () => {
    const { fps } = useVideoConfig();
    const frame = useCurrentFrame();

    const textProgress = spring({
        frame,
        fps,
        config: { damping: 14, stiffness: 90 },
    });

    const textTranslateY = interpolate(textProgress, [0, 1], [50, 0]);
    const textOpacity = interpolate(textProgress, [0, 1], [0, 1]);

    return (
        <AbsoluteFill style={{ backgroundColor: "#000" }}>
            {/* Background Video */}
            <Sequence from={0}>
                <AbsoluteFill>
                    <Video
                        src={staticFile("assets/avatar_tutorial.mp4")}
                        style={{ width: "100%", height: "100%", objectFit: "cover", opacity: 0.5 }}
                        muted
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
                        Viral Videos
                    </h2>
                    <p
                        style={{
                            fontFamily: "Inter, sans-serif",
                            fontSize: "40px",
                            color: "#94a3b8",
                            margin: "20px 0 0 0",
                        }}
                    >
                        AI avatars and automated editing at scale.
                    </p>
                </div>
            </div>
        </AbsoluteFill>
    );
};
