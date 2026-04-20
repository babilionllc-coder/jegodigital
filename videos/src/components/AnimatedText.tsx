import React from "react";
import { spring, useCurrentFrame, useVideoConfig } from "remotion";

export const AnimatedText: React.FC<{
    text: string;
    style?: React.CSSProperties;
    delay?: number;
}> = ({ text, style, delay = 0 }) => {
    const frame = useCurrentFrame();
    const { fps } = useVideoConfig();

    // A premium fade & slide up using spring
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
                fontFamily: "'Inter', sans-serif",
                fontWeight: 600,
                textAlign: "center",
                lineHeight: 1.2,
                margin: 0,
                transform: `translateY(${100 - progress * 100}px)`,
                opacity: progress,
                ...style,
            }}
        >
            {text}
        </h2>
    );
};
