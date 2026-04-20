import { AbsoluteFill, useCurrentFrame } from 'remotion';
import React from 'react';

// Luxury/Hospitality focus
const companies = [
    { name: 'XCARET', color: '#ffffff' },
    { name: 'KEMPINSKI', color: '#ffffff' },
    { name: 'VIDANTA', color: '#ffffff' },
    { name: 'WALDORF ASTORIA', color: '#ffffff' },
    { name: 'ROSANEGRA', color: '#ffffff' },
    { name: 'ANDERSON\'S', color: '#ffffff' },
    { name: 'BAGATELLE', color: '#ffffff' },
    { name: 'AZIMUT', color: '#ffffff' },
    { name: 'FRASER YACHTS', color: '#ffffff' },
    { name: 'MARRIOTT', color: '#ffffff' },
    { name: 'HILTON', color: '#ffffff' },
];

// Fixed width for calculation: 500px
export const ITEM_WIDTH = 500;
export const TOTAL_ITEMS = companies.length;

const Logo = ({ name, color }: { name: string; color: string }) => (
    <div
        style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: `${ITEM_WIDTH}px`, // FIXED WIDTH
            height: '100%',
        }}
    >
        <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '15px'
        }}>
            {/* Decorative dot for premium feel */}
            <div style={{ width: '4px', height: '4px', borderRadius: '50%', background: 'rgba(255,255,255,0.3)' }}></div>

            <h1
                style={{
                    fontFamily: 'Outfit, sans-serif',
                    fontSize: '42px',
                    fontWeight: '300',
                    color: color,
                    whiteSpace: 'nowrap',
                    letterSpacing: '0.15em', // Wide spacing
                    textShadow: '0 0 10px rgba(255,255,255,0.1)',
                }}
            >
                {name}
            </h1>
        </div>
    </div>
);

export const LogoMarquee: React.FC = () => {
    const frame = useCurrentFrame();

    // Speed must align with frame rate and total width
    // Total width of one set = 11 * 500 = 5500px
    // We want to traverse 5500px in N frames.
    // Speed = 2.5 pixels/frame
    const speed = 2.5;
    const offset = frame * speed;

    // Triplicate is enough if the screen isn't 10,000px wide
    const duplicatedCompanies = [...companies, ...companies, ...companies];

    return (
        <div style={{ flex: 1, backgroundColor: 'black' }}> {/* BLACK for blend mode */}
            <AbsoluteFill
                style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    transform: `translateX(-${offset}px)`,
                }}
            >
                {duplicatedCompanies.map((company, index) => (
                    <Logo key={index} name={company.name} color={company.color} />
                ))}
            </AbsoluteFill>
        </div>
    );
};
