import {
    AbsoluteFill,
    interpolate,
    useCurrentFrame,
    useVideoConfig,
    Sequence,
    spring,
    Audio,
    staticFile,
    Img,
    Easing,
} from "remotion";
import React from "react";

// --- DESIGN TOKENS ---
const GOLD = "#C5A059";
const LIGHT_GOLD = "#E5C585";
const BG_DARK = "#0f1115";
const TEXT_PRIMARY = "#E2E8F0";
const TEXT_SECONDARY = "#94A3B8";
const FONT = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";

// --- HELPER: Animated Gold Text ---
const GoldText: React.FC<{
    children: React.ReactNode;
    fontSize: number;
    delay: number;
    bold?: boolean;
}> = ({ children, fontSize, delay, bold = true }) => {
    const frame = useCurrentFrame();
    const { fps } = useVideoConfig();

    const scale = spring({
        frame: frame - delay,
        fps,
        config: { damping: 12, stiffness: 120 },
    });

    const opacity = interpolate(frame - delay, [0, 8], [0, 1], {
        extrapolateRight: "clamp",
    });

    return (
        <div
            style={{
                fontSize,
                fontFamily: FONT,
                fontWeight: bold ? 900 : 600,
                background: `linear-gradient(135deg, ${GOLD}, ${LIGHT_GOLD}, ${GOLD})`,
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                textAlign: "center",
                transform: `scale(${scale})`,
                opacity,
                lineHeight: 1.1,
                filter: `drop-shadow(0 0 30px ${GOLD}44)`,
            }}
        >
            {children}
        </div>
    );
};

// --- HELPER: Service Card ---
const ServiceCard: React.FC<{
    icon: string;
    text: string;
    delay: number;
    index: number;
}> = ({ icon, text, delay, index }) => {
    const frame = useCurrentFrame();
    const { fps } = useVideoConfig();

    const slideIn = spring({
        frame: frame - delay,
        fps,
        config: { damping: 14, stiffness: 100 },
    });

    const translateX = interpolate(slideIn, [0, 1], [600, 0]);
    const opacity = slideIn;

    return (
        <div
            style={{
                display: "flex",
                alignItems: "center",
                gap: "30px",
                padding: "35px 45px",
                borderRadius: "24px",
                background: `rgba(30, 41, 59, 0.7)`,
                backdropFilter: "blur(20px)",
                border: `1px solid ${GOLD}44`,
                transform: `translateX(${translateX}px)`,
                opacity,
                width: "850px",
                boxShadow: `0 10px 40px rgba(0,0,0,0.4), inset 0 1px 0 ${GOLD}22`,
            }}
        >
            <span style={{ fontSize: "55px", flexShrink: 0 }}>{icon}</span>
            <span
                style={{
                    fontSize: "38px",
                    fontFamily: FONT,
                    fontWeight: 700,
                    color: TEXT_PRIMARY,
                    lineHeight: 1.2,
                }}
            >
                {text}
            </span>
        </div>
    );
};

// --- HELPER: Stat Counter ---
const StatCounter: React.FC<{ target: number; suffix: string; delay: number }> = ({
    target,
    suffix,
    delay,
}) => {
    const frame = useCurrentFrame();
    const progress = interpolate(frame - delay, [0, 30], [0, 1], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
        easing: Easing.out(Easing.cubic),
    });
    const value = Math.round(target * progress);

    return (
        <span
            style={{
                fontSize: "120px",
                fontFamily: FONT,
                fontWeight: 900,
                color: GOLD,
                textShadow: `0 0 40px ${GOLD}66`,
            }}
        >
            {value}
            {suffix}
        </span>
    );
};

// --- MAIN COMPOSITION ---
export const RealEstatePromo: React.FC = () => {
    const frame = useCurrentFrame();
    const { fps } = useVideoConfig();

    // TIMELINE (30fps, 30 seconds = 900 frames)
    const SCENE_2_STAT = 120; // 4-8s (120-240)
    const SCENE_3_REVEAL = 240; // 8-13s (240-390)
    const SCENE_4_SVC1 = 390; // 13-17s (390-510)
    const SCENE_5_SVC2 = 510; // 17-21s (510-630)
    const SCENE_6_SVC3 = 630; // 21-25s (630-750)
    const SCENE_7_CTA = 750; // 25-30s (750-900)

    // Global background gradient animation
    const bgHue = interpolate(frame, [0, 900], [220, 260]);

    return (
        <AbsoluteFill
            style={{
                background: `radial-gradient(ellipse at 50% 30%, hsl(${bgHue}, 15%, 12%) 0%, ${BG_DARK} 70%)`,
                overflow: "hidden",
                fontFamily: FONT,
            }}
        >
            {/* Subtle grid pattern overlay */}
            <AbsoluteFill
                style={{
                    backgroundImage: `linear-gradient(${GOLD}06 1px, transparent 1px), linear-gradient(90deg, ${GOLD}06 1px, transparent 1px)`,
                    backgroundSize: "60px 60px",
                }}
            />

            {/* ========== SCENE 1: HOOK (0-4s) ========== */}
            <Sequence durationInFrames={130}>
                <Audio src={staticFile("assets/whoosh.mp3")} volume={0.5} />
                <AbsoluteFill
                    style={{
                        alignItems: "center",
                        justifyContent: "center",
                        padding: "60px",
                    }}
                >
                    {/* Question mark floating */}
                    <div
                        style={{
                            position: "absolute",
                            top: "250px",
                            fontSize: "200px",
                            opacity: interpolate(frame, [0, 15], [0, 0.15], {
                                extrapolateRight: "clamp",
                            }),
                            transform: `translateY(${interpolate(frame, [0, 120], [0, -30])}px)`,
                        }}
                    >
                        ❓
                    </div>

                    <div
                        style={{
                            fontSize: "68px",
                            fontWeight: 900,
                            color: TEXT_PRIMARY,
                            textAlign: "center",
                            lineHeight: 1.2,
                            opacity: interpolate(frame, [5, 15], [0, 1], {
                                extrapolateLeft: "clamp",
                                extrapolateRight: "clamp",
                            }),
                            transform: `translateY(${interpolate(frame, [5, 20], [60, 0], { extrapolateRight: "clamp" })}px)`,
                        }}
                    >
                        ¿Tu Inmobiliaria
                        <br />
                        Está{" "}
                        <span
                            style={{
                                color: "#EF4444",
                                textDecoration: "line-through",
                                textDecorationThickness: "4px",
                            }}
                        >
                            Invisible
                        </span>
                        <br />
                        en Internet?
                    </div>

                    {/* Red X mark */}
                    <Sequence from={40}>
                        <div
                            style={{
                                position: "absolute",
                                bottom: "350px",
                                fontSize: "100px",
                                transform: `scale(${spring({ frame: frame - 40, fps, config: { damping: 8 } })})`,
                            }}
                        >
                            ❌
                        </div>
                    </Sequence>
                </AbsoluteFill>
            </Sequence>

            {/* ========== SCENE 2: STAT (4-8s) ========== */}
            <Sequence from={SCENE_2_STAT} durationInFrames={130}>
                <Audio src={staticFile("assets/pop.mp3")} volume={0.4} />
                <AbsoluteFill
                    style={{
                        alignItems: "center",
                        justifyContent: "center",
                        padding: "60px",
                    }}
                >
                    <StatCounter target={90} suffix="%" delay={10} />

                    <div style={{ height: "20px" }} />

                    <div
                        style={{
                            fontSize: "42px",
                            fontWeight: 600,
                            color: TEXT_SECONDARY,
                            textAlign: "center",
                            lineHeight: 1.4,
                            maxWidth: "850px",
                            opacity: interpolate(frame - SCENE_2_STAT, [15, 30], [0, 1], {
                                extrapolateLeft: "clamp",
                                extrapolateRight: "clamp",
                            }),
                        }}
                    >
                        de los compradores buscan
                        <br />
                        propiedades en{" "}
                        <span style={{ color: TEXT_PRIMARY, fontWeight: 800 }}>Google</span>
                        <br />
                        antes de contactar
                    </div>
                </AbsoluteFill>
            </Sequence>

            {/* ========== SCENE 3: JEGO REVEAL (8-13s) ========== */}
            <Sequence from={SCENE_3_REVEAL} durationInFrames={160}>
                <Audio src={staticFile("assets/whoosh.mp3")} volume={0.7} />
                <AbsoluteFill
                    style={{ alignItems: "center", justifyContent: "center" }}
                >
                    {/* Logo */}
                    <Sequence from={5}>
                        <div
                            style={{
                                transform: `scale(${spring({ frame: frame - SCENE_3_REVEAL - 5, fps, config: { damping: 10 } })})`,
                            }}
                        >
                            <Img
                                src={staticFile("assets/jegodigital_logo.png")}
                                style={{
                                    width: "320px",
                                    objectFit: "contain",
                                    filter: `drop-shadow(0 0 30px ${GOLD}44)`,
                                }}
                            />
                        </div>
                    </Sequence>

                    <div style={{ height: "40px" }} />

                    {/* Tagline */}
                    <Sequence from={25}>
                        <GoldText fontSize={48} delay={SCENE_3_REVEAL + 25}>
                            Marketing con IA
                        </GoldText>
                    </Sequence>

                    <div style={{ height: "15px" }} />

                    <Sequence from={40}>
                        <div
                            style={{
                                fontSize: "40px",
                                fontWeight: 700,
                                color: TEXT_PRIMARY,
                                textAlign: "center",
                                opacity: interpolate(
                                    frame - SCENE_3_REVEAL - 40,
                                    [0, 10],
                                    [0, 1],
                                    { extrapolateRight: "clamp" }
                                ),
                            }}
                        >
                            para Inmobiliarias
                        </div>
                    </Sequence>

                    {/* Decorative line */}
                    <Sequence from={55}>
                        <div
                            style={{
                                width: interpolate(
                                    frame - SCENE_3_REVEAL - 55,
                                    [0, 20],
                                    [0, 400],
                                    { extrapolateRight: "clamp" }
                                ),
                                height: "3px",
                                background: `linear-gradient(90deg, transparent, ${GOLD}, transparent)`,
                                marginTop: "30px",
                            }}
                        />
                    </Sequence>
                </AbsoluteFill>
            </Sequence>

            {/* ========== SCENE 4: SERVICE 1 (13-17s) ========== */}
            <Sequence from={SCENE_4_SVC1} durationInFrames={130}>
                <Audio src={staticFile("assets/pop.mp3")} volume={0.3} />
                <AbsoluteFill
                    style={{
                        alignItems: "center",
                        justifyContent: "center",
                        gap: "40px",
                    }}
                >
                    <div
                        style={{
                            fontSize: "28px",
                            color: GOLD,
                            fontWeight: 600,
                            letterSpacing: "6px",
                            textTransform: "uppercase",
                            opacity: interpolate(frame - SCENE_4_SVC1, [0, 10], [0, 1], {
                                extrapolateRight: "clamp",
                            }),
                        }}
                    >
                        Lo que hacemos
                    </div>

                    <ServiceCard
                        icon="🌐"
                        text="Sitios Web Premium que Convierten Visitantes en Clientes"
                        delay={SCENE_4_SVC1 + 10}
                        index={0}
                    />
                </AbsoluteFill>
            </Sequence>

            {/* ========== SCENE 5: SERVICE 2 (17-21s) ========== */}
            <Sequence from={SCENE_5_SVC2} durationInFrames={130}>
                <Audio src={staticFile("assets/pop.mp3")} volume={0.3} />
                <AbsoluteFill
                    style={{
                        alignItems: "center",
                        justifyContent: "center",
                        gap: "40px",
                    }}
                >
                    <ServiceCard
                        icon="🤖"
                        text="Chatbot con IA 24/7 que Captura Leads Automáticamente"
                        delay={SCENE_5_SVC2 + 10}
                        index={1}
                    />
                </AbsoluteFill>
            </Sequence>

            {/* ========== SCENE 6: SERVICE 3 (21-25s) ========== */}
            <Sequence from={SCENE_6_SVC3} durationInFrames={130}>
                <Audio src={staticFile("assets/pop.mp3")} volume={0.3} />
                <AbsoluteFill
                    style={{
                        alignItems: "center",
                        justifyContent: "center",
                        gap: "40px",
                    }}
                >
                    <ServiceCard
                        icon="📈"
                        text="SEO Local + Google Ads = Más Cierres de Venta"
                        delay={SCENE_6_SVC3 + 10}
                        index={2}
                    />
                </AbsoluteFill>
            </Sequence>

            {/* ========== SCENE 7: CTA (25-30s) ========== */}
            <Sequence from={SCENE_7_CTA}>
                <Audio src={staticFile("assets/pop.mp3")} volume={0.5} />
                <AbsoluteFill
                    style={{
                        alignItems: "center",
                        justifyContent: "center",
                        background: `radial-gradient(circle at 50% 50%, ${GOLD}15 0%, transparent 70%)`,
                    }}
                >
                    {/* Logo small */}
                    <Img
                        src={staticFile("assets/jegodigital_logo.png")}
                        style={{
                            width: "200px",
                            objectFit: "contain",
                            marginBottom: "30px",
                            opacity: interpolate(frame - SCENE_7_CTA, [0, 10], [0, 1], {
                                extrapolateRight: "clamp",
                            }),
                        }}
                    />

                    <div
                        style={{
                            fontSize: "52px",
                            fontWeight: 800,
                            color: TEXT_PRIMARY,
                            textAlign: "center",
                            lineHeight: 1.3,
                            opacity: interpolate(frame - SCENE_7_CTA, [5, 18], [0, 1], {
                                extrapolateRight: "clamp",
                            }),
                            transform: `translateY(${interpolate(frame - SCENE_7_CTA, [5, 18], [40, 0], { extrapolateRight: "clamp" })}px)`,
                        }}
                    >
                        Agenda tu
                        <br />
                        Diagnóstico{" "}
                        <span style={{ color: "#22C55E", fontWeight: 900 }}>GRATIS</span>
                    </div>

                    <div style={{ height: "50px" }} />

                    {/* CTA Button with pulse */}
                    <Sequence from={25}>
                        <div
                            style={{
                                transform: `scale(${spring({ frame: frame - SCENE_7_CTA - 25, fps, config: { damping: 8 } })})`,
                            }}
                        >
                            <div
                                style={{
                                    padding: "30px 60px",
                                    borderRadius: "70px",
                                    background: `linear-gradient(135deg, ${GOLD}, ${LIGHT_GOLD})`,
                                    color: BG_DARK,
                                    fontFamily: FONT,
                                    fontWeight: 900,
                                    fontSize: "44px",
                                    boxShadow: `0 0 40px ${GOLD}66, 0 20px 60px rgba(0,0,0,0.5)`,
                                    textAlign: "center",
                                    // Pulse animation
                                    animation: "none",
                                    border: `3px solid ${LIGHT_GOLD}`,
                                }}
                            >
                                JEGODIGITAL.COM
                            </div>
                        </div>
                    </Sequence>

                    {/* Subtle bottom text */}
                    <Sequence from={40}>
                        <div
                            style={{
                                position: "absolute",
                                bottom: "180px",
                                fontSize: "26px",
                                color: TEXT_SECONDARY,
                                fontWeight: 500,
                                opacity: interpolate(
                                    frame - SCENE_7_CTA - 40,
                                    [0, 10],
                                    [0, 0.7],
                                    { extrapolateRight: "clamp" }
                                ),
                                letterSpacing: "3px",
                            }}
                        >
                            SUCCESS IS A SYSTEM.
                        </div>
                    </Sequence>
                </AbsoluteFill>
            </Sequence>
        </AbsoluteFill>
    );
};
