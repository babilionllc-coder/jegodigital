import React from "react";
import { spring, useCurrentFrame, useVideoConfig } from "remotion";

export const AnimatedText: React.FC<{
    text: string;
    style?: React.CSSProperties;
    delay?: number;
    isHeading?: boolean;
}> = ({ text, style, delay = 0, isHeading = true }) => {
    const frame = useCurrentFrame();
    const { fps } = useVideoConfig();

    // A premium slide up using spring
    const progress = spring({
        fps,
        frame: frame - delay,
        config: {
            damping: 200,
        },
        durationInFrames: 30, // 1 second animation
    });

    return (
        <h2
            style={{
                fontFamily: isHeading ? "'Cinzel', serif" : "'Josefin Sans', sans-serif",
                fontWeight: isHeading ? 400 : 300,
                textAlign: "center",
                lineHeight: 1.15,
                letterSpacing: isHeading ? "0.03em" : "4px",
                margin: 0,
                textTransform: "uppercase",
                transform: `translateY(${50 - progress * 50}px)`,
                opacity: progress,
                ...style,
            }}
        >
            {text}
        </h2>
    );
};
