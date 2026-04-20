import { AbsoluteFill, interpolate, Sequence, useCurrentFrame } from 'remotion';
import React from 'react';

const C = {
    bg: '#0f1115',
    gold: '#C5A059',
    white: '#ffffff',
    blue: '#3b82f6',
    surface: '#1a1d24'
};

const ChatBubble = ({ text, isAgent, delay }: { text: string; isAgent: boolean; delay: number }) => {
    const frame = useCurrentFrame();
    const opacity = interpolate(frame, [delay, delay + 10], [0, 1]);
    const y = interpolate(frame, [delay, delay + 10], [20, 0]);

    return (
        <div style={{
            opacity,
            transform: `translateY(${y}px)`,
            alignSelf: isAgent ? 'flex-start' : 'flex-end',
            maxWidth: '70%',
            backgroundColor: isAgent ? C.gold : C.surface,
            color: isAgent ? '#000' : '#fff',
            padding: '20px 30px',
            borderRadius: 20,
            borderBottomLeftRadius: isAgent ? 0 : 20,
            borderBottomRightRadius: isAgent ? 20 : 0,
            fontSize: 24,
            marginBottom: 20,
            fontFamily: 'Roboto Mono, monospace', // Data font
            boxShadow: '0 4px 10px rgba(0,0,0,0.2)'
        }}>
            {text}
        </div>
    );
};

export const AgentDemoScene: React.FC = () => {
    return (
        <AbsoluteFill style={{ backgroundColor: C.bg, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
            {/* Background Nodes (Static representation) */}
            <AbsoluteFill style={{ opacity: 0.1 }}>
                {/* Imagine SVG nodes here, keeping specific simple for now */}
                <div style={{ width: '100%', height: '100%', background: `radial-gradient(circle, ${C.gold} 1%, transparent 10%)`, backgroundSize: '100px 100px' }} />
            </AbsoluteFill>

            {/* Chat Interface */}
            <div style={{
                width: 800,
                // height: 800, // Let it grow
                display: 'flex',
                flexDirection: 'column',
                gap: 20
            }}>
                <ChatBubble text="How much does the setup cost?" isAgent={false} delay={10} />
                <ChatBubble text="Our Enterprise Plan starts at $5k. Would you like to check availability?" isAgent={true} delay={40} />
                <ChatBubble text="Yes, I'm free Tuesday." isAgent={false} delay={80} />

                {/* Automation Event */}
                <Sequence from={110}>
                    <div style={{
                        alignSelf: 'center',
                        backgroundColor: '#10b981', // Success Green
                        color: 'white',
                        padding: '10px 20px',
                        borderRadius: 50,
                        fontSize: 20,
                        fontFamily: 'Jost, sans-serif',
                        marginTop: 20,
                        boxShadow: '0 0 20px #10b981'
                    }}>
                        ✓ Meeting Booked to CRM
                    </div>
                </Sequence>
            </div>

            {/* Text Overlay */}
            <Sequence from={130}>
                <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center' }}>
                    <h2 style={{
                        color: C.white,
                        fontFamily: 'Jost, sans-serif',
                        fontSize: 90,
                        fontWeight: 'bold',
                        textShadow: `0 0 30px ${C.gold}`
                    }}>
                        ZERO HEADCOUNT SCALE.
                    </h2>
                </AbsoluteFill>
            </Sequence>
        </AbsoluteFill>
    );
};
