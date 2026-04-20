import {
    AbsoluteFill,
    Audio,
    Sequence,
    staticFile,
    Video,
} from "remotion";
import { TextOverlay } from "./TextOverlay";

/**
 * Scene definitions with CORRECTED timings based on frame-by-frame analysis:
 * Each scene = [fromFrame, durationFrames, title, subtitle, audioFile]
 * 
 * Timing corrections vs v1:
 * - Scenes 9-11 shifted later to match actual video content
 * - Scene 11 (AI Chatbot) now starts at frame 1140 (38s) where chatbot actually appears
 * - Each scene has its own ElevenLabs narration clip for perfect sync
 */
const SCENES: [number, number, string, string, string][] = [
    // Scene 1: Homepage with palm trees, premium dark design (0-3s)
    [0, 90, "Premium Website Design", "realestateflamingo.com.mx", "narration/scene_01.mp3"],
    // Scene 2: Admin Panel sidebar visible (3-5s)
    [90, 60, "Powerful Admin Panel", "Full Control Dashboard", "narration/scene_02.mp3"],
    // Scene 3: Google Analytics charts & pie chart (5-7s)
    [150, 60, "Real-Time Analytics", "Google Analytics Integration", "narration/scene_03.mp3"],
    // Scene 4: CRM Kanban pipeline with lead cards (7-10s)
    [210, 90, "CRM Pipeline", "Manage Every Lead", "narration/scene_04.mp3"],
    // Scene 5: Lead detail - Llamar/Email/WhatsApp buttons (10-13s)
    [300, 90, "Instant Follow-Up", "WhatsApp · Email · Call", "narration/scene_05.mp3"],
    // Scene 6: Calendar Febrero 2026 (13-16s)
    [390, 90, "Smart Calendar", "Schedule & Organize", "narration/scene_06.mp3"],
    // Scene 7: Email drip campaign timeline (16-19s)
    [480, 90, "Email Drip Campaigns", "Automated Lead Nurturing", "narration/scene_07.mp3"],
    // Scene 8: Template dropdown + Flamingo branded email preview (19-24s)
    [570, 150, "Custom Templates", "Branded Email Design", "narration/scene_08.mp3"],
    // Scene 9: CORRECTED - Projects listing starts at ~25s (25-29s)
    [750, 120, "Project Showcase", "Rich Property Listings", "narration/scene_09.mp3"],
    // Scene 10: Property detail - Aldea Zama, photos, pricing (29-35s)
    [870, 180, "Detailed Listings", "Images · Videos · Pricing", "narration/scene_10.mp3"],
    // Scene 11: CORRECTED - AI Chatbot appears at ~37s (37-40s)
    [1110, 90, "24/7 AI Chatbot", "Flamingo AI Assistant", "narration/scene_11.mp3"],
    // Scene 12: CTA - jegodigital.com (40-41s)
    [1200, 30, "Built by JegoDigital", "jegodigital.com", "narration/scene_12.mp3"],
];

export const ShowcaseFlamingo: React.FC = () => {
    return (
        <AbsoluteFill style={{ backgroundColor: "#000" }}>
            {/* Background video — the original showcase recording (muted) */}
            <Video
                src={staticFile("showcaseflamingo.mp4")}
                style={{
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                }}
                muted
            />

            {/* Per-scene narration audio clips + text overlays */}
            {SCENES.map(([from, duration, title, subtitle, audioFile], i) => (
                <Sequence
                    key={`scene-${i}`}
                    from={from}
                    durationInFrames={duration}
                    premountFor={10}
                >
                    {/* Individual narration clip for this scene */}
                    <Audio
                        src={staticFile(audioFile)}
                        volume={0.95}
                    />
                    {/* Text overlay with fade-in and fade-out */}
                    <TextOverlay
                        title={title}
                        subtitle={subtitle}
                        durationInFrames={duration}
                    />
                </Sequence>
            ))}
        </AbsoluteFill>
    );
};
