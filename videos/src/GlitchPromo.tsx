import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig, Sequence, spring, Audio, staticFile, Easing, random } from "remotion";
import React from "react";

// --- CONFIG ---
const FONT_FAMILY = "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";

// --- COMPONENTS ---

// 1. TYPING TEXT
const TypingText: React.FC<{ text: string; delay: number; fontSize: number; color?: string }> = ({ text, delay, fontSize, color = "#202124" }) => {
    const frame = useCurrentFrame();
    const chars = text.split("");

    return (
        <div style={{ fontFamily: FONT_FAMILY, fontSize, color, display: "flex", gap: "2px", justifyContent: "center" }}>
            {chars.map((char, i) => {
                const charDelay = delay + i * 2;
                const opacity = frame > charDelay ? 1 : 0;
                return <span key={i} style={{ opacity }}>{char}</span>;
            })}
            <span style={{
                opacity: frame % 20 < 10 ? 1 : 0,
                color: "#4285F4",
                marginLeft: "5px",
                display: frame > delay + chars.length * 2 + 30 ? "none" : "block"
            }}>|</span>
        </div>
    );
};

// 2. RESULT CARD (WHITE ON BLACK)
const WhiteCard: React.FC<{ title: string; url: string; delay: number }> = ({ title, url, delay }) => {
    const frame = useCurrentFrame();
    const { fps } = useVideoConfig();

    const t = spring({
        frame: frame - delay,
        fps,
        config: { damping: 10, stiffness: 100 }
    });

    const scale = interpolate(t, [0, 1], [0.8, 1]);
    const opacity = t;

    return (
        <div style={{
            width: "850px",
            backgroundColor: "white", // PURE WHITE
            borderRadius: "40px",
            padding: "40px 50px", // MASSIVE PADDING
            transform: `scale(${scale})`,
            opacity,
            display: "flex",
            flexDirection: "column",
            gap: "10px",
            alignItems: "center",
            boxShadow: "0 20px 60px rgba(0,0,0,0.5)"
        }}>
            <div style={{ fontSize: "24px", color: "#5f6368", fontFamily: FONT_FAMILY }}>{url}</div>
            <div style={{ fontSize: "40px", color: "#1a73e8", fontFamily: FONT_FAMILY, fontWeight: 700, textAlign: "center", lineHeight: 1.2 }}>{title}</div>
        </div>
    );
};

// --- MAIN COMPOSITION ---

export const GlitchPromo: React.FC = () => {
    const frame = useCurrentFrame();

    // TIMELINE
    const SCENE_SCAN = 120; // 4s
    const SCENE_REVEAL = 220; // 7.3s
    const SCENE_CTA = 340; // 11.3s

    return (
        <AbsoluteFill style={{ background: "#000000", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>

            {/* SCENE 1: THE SEARCH (0s - 4s) */}
            <Sequence durationInFrames={SCENE_SCAN + 10}>
                <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>

                    {/* GOOGLE LOGO */}
                    <div style={{ marginBottom: "80px" }}>
                        <span style={{ fontSize: "90px", fontWeight: "bold", fontFamily: FONT_FAMILY }}>
                            <span style={{ color: "#4285F4" }}>G</span><span style={{ color: "#EA4335" }}>o</span><span style={{ color: "#FBBC05" }}>o</span><span style={{ color: "#4285F4" }}>g</span><span style={{ color: "#34A853" }}>l</span><span style={{ color: "#EA4335" }}>e</span>
                        </span>
                    </div>

                    {/* SEARCH INPUT (WHITE) */}
                    <div style={{
                        width: "850px",
                        background: "white", borderRadius: "50px", padding: "35px 50px",
                        marginBottom: "100px", // MASSIVE GAP
                        display: "flex", alignItems: "center", justifyContent: "center", gap: "25px",
                        boxShadow: "0 10px 40px rgba(255,255,255,0.1)"
                    }}>
                        <span style={{ fontSize: "50px" }}>🔍</span>
                        {/* Dark text inside white bar */}
                        <TypingText text="Agencia Marketing Cancun" delay={20} fontSize={40} color="#202124" />
                    </div>

                    {/* RESULT (SINGLE CARD) */}
                    <Sequence from={80}>
                        <Audio src={staticFile("assets/pop.mp3")} volume={0.6} />
                        <WhiteCard title="Futurité - Marketing Digital" url="futurite.com" delay={0} />
                    </Sequence>

                </AbsoluteFill>
            </Sequence>

            {/* SCENE 2: THE GLITCH (4s - 7.3s) */}
            <Sequence from={SCENE_SCAN} durationInFrames={SCENE_REVEAL - SCENE_SCAN}>
                <Audio src={staticFile("assets/whoosh.mp3")} volume={1.0} />

                <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
                    <h1 style={{ fontFamily: FONT_FAMILY, fontSize: "110px", fontWeight: 900, color: "white", textAlign: "center" }}>
                        WHO IS<br />RANK #1?
                    </h1>

                    <div style={{
                        background: "#ef4444", color: "white", padding: "15px 40px",
                        borderRadius: "15px", marginTop: "30px", fontSize: "50px", fontWeight: "bold",
                        fontFamily: FONT_FAMILY, transform: "rotate(-5deg)"
                    }}>
                        NOT YOU
                    </div>
                </AbsoluteFill>
            </Sequence>

            {/* SCENE 3: THE REVEAL (7.3s - 11.3s) */}
            <Sequence from={SCENE_REVEAL} durationInFrames={SCENE_CTA - SCENE_REVEAL + 50}>
                <Audio src={staticFile("assets/pop.mp3")} volume={1.0} />

                <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", background: "black" }}>
                    <h2 style={{ fontFamily: FONT_FAMILY, color: "#94a3b8", fontSize: "30px", letterSpacing: "5px" }}>POWERED BY</h2>

                    <div style={{ height: "40px" }} />

                    <h1 style={{
                        fontFamily: FONT_FAMILY, fontSize: "150px", fontWeight: 900, color: "white",
                        lineHeight: 0.9, textAlign: "center",
                        textShadow: "0 0 40px rgba(255,255,255,0.4)",
                        transform: `scale(${spring({ frame: frame - SCENE_REVEAL - 10, fps: 30, config: { damping: 10 } })})`
                    }}>
                        JEGO<br /><span style={{ color: "#38bdf8" }}>DIGITAL</span>
                    </h1>
                </AbsoluteFill>
            </Sequence>

            {/* SCENE 4: CTA (11.3s - End) */}
            <Sequence from={SCENE_CTA}>
                <AbsoluteFill style={{ backgroundColor: "black", alignItems: "center", justifyContent: "center" }}>
                    <h1 style={{ fontFamily: FONT_FAMILY, fontSize: "70px", color: "white", margin: 0 }}>GET YOUR</h1>
                    <h1 style={{ fontFamily: FONT_FAMILY, fontSize: "120px", color: "#38bdf8", margin: 0, fontWeight: 900 }}>SCORE</h1>

                    <div style={{ marginTop: "80px", transform: `scale(${spring({ frame: frame - SCENE_CTA - 20, fps: 30 })})` }}>
                        <div style={{
                            padding: "30px 50px", // Adjusted padding for longer text
                            borderRadius: "70px",
                            background: "white",
                            color: "black",
                            fontFamily: FONT_FAMILY,
                            fontWeight: 900,
                            fontSize: "40px" // Slightly smaller font for URL
                        }}>
                            JEGODIGITAL.COM
                        </div>
                    </div>
                </AbsoluteFill>
                <Sequence from={20}>
                    <Audio src={staticFile("assets/pop.mp3")} volume={0.5} />
                </Sequence>
            </Sequence>

        </AbsoluteFill>
    );
};