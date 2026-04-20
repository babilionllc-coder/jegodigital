import React from "react";
import {
    useCurrentFrame,
    useVideoConfig,
    interpolate,
    spring,
    AbsoluteFill,
} from "remotion";

const DATA_POINTS = [
    { month: "Jan", score: 32 },
    { month: "Feb", score: 38 },
    { month: "Mar", score: 45 },
    { month: "Apr", score: 52 },
    { month: "May", score: 68 },
    { month: "Jun", score: 85 },
];

export const TrustVelocityScene: React.FC = () => {
    const frame = useCurrentFrame();
    const { fps } = useVideoConfig();

    const lineProgress = spring({
        frame,
        fps,
        config: { damping: 100 },
    });

    const currentScore = Math.round(
        interpolate(frame, [0, fps * 2], [0, 85], { extrapolateRight: "clamp" })
    );

    const chartWidth = 800; // Scaled up for main video
    const chartHeight = 300;
    const maxScore = 100;

    const points = DATA_POINTS.map((d, i) => {
        const x = (i / (DATA_POINTS.length - 1)) * chartWidth;
        const y = chartHeight - (d.score / maxScore) * chartHeight;
        return `${x},${y}`;
    }).join(" L ");

    const pathD = `M ${points}`;

    const pulseOpacity = interpolate(
        Math.sin(frame * 0.15),
        [-1, 1],
        [0.4, 1]
    );

    return (
        <AbsoluteFill
            style={{
                backgroundColor: "#0f1115", // Void Black
                fontFamily: "Jost, sans-serif",
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
            }}
        >
            <div
                style={{
                    position: "absolute",
                    inset: 0,
                    backgroundImage: `
            linear-gradient(rgba(197, 160, 89, 0.05) 1px, transparent 1px),
            linear-gradient(90deg, rgba(197, 160, 89, 0.05) 1px, transparent 1px)
          `,
                    backgroundSize: "60px 60px",
                }}
            />

            <div
                style={{
                    background: "linear-gradient(135deg, rgba(20, 20, 25, 0.95), rgba(10, 10, 15, 0.98))",
                    border: "1px solid rgba(197, 160, 89, 0.3)", // Gold Border
                    borderRadius: 30,
                    padding: 60,
                    boxShadow: "0 0 100px rgba(197, 160, 89, 0.1)", // Gold Glow
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: 30,
                    opacity: interpolate(frame, [0, 15], [0, 1], { extrapolateRight: "clamp" }),
                    transform: `translateY(${interpolate(frame, [0, 15], [50, 0], { extrapolateRight: "clamp" })}px)`,
                }}
            >
                <div style={{ display: "flex", alignItems: "center", gap: 15 }}>
                    <div
                        style={{
                            width: 15,
                            height: 15,
                            borderRadius: "50%",
                            backgroundColor: "#C5A059", // Gold
                            boxShadow: "0 0 20px #C5A059",
                            opacity: pulseOpacity,
                        }}
                    />
                    <span
                        style={{
                            fontSize: 20,
                            fontWeight: 600,
                            color: "#C5A059",
                            textTransform: "uppercase",
                            letterSpacing: 4,
                            fontFamily: 'Jost'
                        }}
                    >
                        Trust Velocity™
                    </span>
                </div>

                <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
                    <span
                        style={{
                            fontSize: 100,
                            fontWeight: 800,
                            color: "#fff",
                            textShadow: "0 0 40px rgba(197, 160, 89, 0.5)",
                        }}
                    >
                        {currentScore}
                    </span>
                    <span style={{ fontSize: 30, color: "rgba(255,255,255,0.5)" }}>/100</span>
                </div>

                <svg
                    width={chartWidth}
                    height={chartHeight}
                    viewBox={`0 0 ${chartWidth} ${chartHeight}`}
                    style={{ marginTop: 20 }}
                >
                    <defs>
                        <linearGradient id="lineGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                            <stop offset="0%" stopColor="#C5A059" /> {/* Gold */}
                            <stop offset="100%" stopColor="#ffffff" />
                        </linearGradient>
                        <linearGradient id="areaGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                            <stop offset="0%" stopColor="rgba(197, 160, 89, 0.3)" />
                            <stop offset="100%" stopColor="rgba(197, 160, 89, 0)" />
                        </linearGradient>
                    </defs>

                    <path
                        d={`${pathD} L ${chartWidth},${chartHeight} L 0,${chartHeight} Z`}
                        fill="url(#areaGradient)"
                        style={{
                            opacity: lineProgress,
                        }}
                    />

                    <path
                        d={pathD}
                        fill="none"
                        stroke="url(#lineGradient)"
                        strokeWidth={5}
                        strokeLinecap="round"
                        style={{
                            strokeDasharray: 2000,
                            strokeDashoffset: interpolate(lineProgress, [0, 1], [2000, 0]),
                        }}
                    />

                    <circle
                        cx={chartWidth}
                        cy={chartHeight - (85 / maxScore) * chartHeight}
                        r={12}
                        fill="#C5A059"
                        style={{
                            opacity: lineProgress,
                            filter: "drop-shadow(0 0 15px #C5A059)",
                        }}
                    />
                </svg>
            </div>
        </AbsoluteFill>
    );
};
