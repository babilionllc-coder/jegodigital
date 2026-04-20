import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion';
import React from 'react';

const C = {
    bg: '#0f1115',
    gold: '#C5A059',
    green: '#00ff41',
    red: '#ff4444',
    code: '#1a1d24'
};

const LOG_LINES = [
    "Initializing DataForSEO Client...",
    "[SUCCESS] Connected to v3 API endpoint",
    "Target: Competitor_A.com",
    "Scanning Backlink Profile... [DONE]",
    "Analyzing Organic Traffic Sources...",
    "> Found 142 High-Intent Keywords",
    "> ALERT: Traffic Leakage Detected",
    "> Competitor capturing 40% Market Share",
    "Computing Opportunity Cost...",
    "Potential Revenue Loss: $14,200/mo",
    "System Status: CRITICAL"
];

export const LiveScanScene: React.FC = () => {
    const frame = useCurrentFrame();

    // Scroll the logs up
    const translateY = interpolate(frame, [0, 100], [0, -200]);

    return (
        <AbsoluteFill style={{ backgroundColor: C.bg, fontFamily: 'Roboto Mono, monospace' }}>
            <div style={{
                margin: 40,
                backgroundColor: C.code,
                height: 'calc(100% - 80px)',
                borderRadius: 10,
                border: `1px solid ${C.gold}`,
                boxShadow: `0 0 20px ${C.gold}20`,
                overflow: 'hidden',
                position: 'relative'
            }}>
                {/* Terminal Header */}
                <div style={{
                    height: 40,
                    backgroundColor: '#2d3342', // Slightly lighter gray
                    display: 'flex',
                    alignItems: 'center',
                    padding: '0 20px',
                    gap: 10
                }}>
                    <div style={{ width: 12, height: 12, borderRadius: '50%', backgroundColor: '#ff5f56' }} />
                    <div style={{ width: 12, height: 12, borderRadius: '50%', backgroundColor: '#ffbd2e' }} />
                    <div style={{ width: 12, height: 12, borderRadius: '50%', backgroundColor: '#27c93f' }} />
                    <span style={{ color: '#fff', fontSize: 14, marginLeft: 10, opacity: 0.7 }}>market_radar_v3.sh</span>
                </div>

                {/* Terminal Body */}
                <div style={{ padding: 40, color: C.green, fontSize: 24, lineHeight: 1.5 }}>
                    <div style={{ transform: `translateY(${translateY}px)` }}>
                        {LOG_LINES.map((line, i) => (
                            <div key={i} style={{
                                marginBottom: 10,
                                opacity: interpolate(frame, [i * 5, (i * 5) + 10], [0, 1]),
                                color: line.includes("ALERT") || line.includes("CRITICAL") ? C.red :
                                    line.includes("Revenue") ? C.gold : C.green
                            }}>
                                <span style={{ opacity: 0.5 }}>{`[${(1000 + i * 150).toString()}]`}</span> {line}
                            </div>
                        ))}
                        {/* Blinking Cursor */}
                        <div style={{
                            width: 15,
                            height: 24,
                            backgroundColor: C.green,
                            marginTop: 10,
                            opacity: Math.sin(frame * 0.5) > 0 ? 1 : 0
                        }} />
                    </div>
                </div>
            </div>

            {/* Overlay */}
            <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center' }}>
                <h2 style={{
                    color: C.gold,
                    fontFamily: 'Jost, sans-serif',
                    fontSize: 80,
                    fontWeight: 'bold',
                    textTransform: 'uppercase',
                    backgroundColor: 'rgba(15, 17, 21, 0.9)',
                    padding: '20px 40px',
                    border: `2px solid ${C.gold}`,
                    opacity: interpolate(frame, [60, 80], [0, 1])
                }}>
                    WE SEE WHAT THEY DON'T.
                </h2>
            </AbsoluteFill>
        </AbsoluteFill>
    );
};
