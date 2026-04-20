import {
    AbsoluteFill,
    Audio,
    Sequence,
    staticFile,
    Video,
} from "remotion";
import { GozaTextOverlay } from "./GozaTextOverlay";

/**
 * SPANISH VERSION: Scene definitions with accurate timings.
 * Each scene = [fromFrame, durationFrames, title, subtitle, audioFile]
 */
const SCENES_ES: [number, number, string, string, string][] = [
    // Scene 1: Premium Goza Real Estate website (0-7s)
    [0, 210, "Diseño Web Premium", "gozarealestate.com", "narration_goza_es/scene_1.mp3"],
    // Scene 2: Organized property listings (7-10s)
    [210, 90, "Listados de Propiedades", "Estructura Profesional", "narration_goza_es/scene_2.mp3"],
    // Scene 3: 24/7 Chatbot booking (10-13s)
    [300, 90, "Asistente Virtual 24/7", "Captura de Leads Automática", "narration_goza_es/scene_3.mp3"],
    // Scene 4: Admin panel full overview (13-14.5s)
    [390, 45, "Panel Administrativo", "Control Total", "narration_goza_es/scene_4.mp3"],
    // Scene 5: Listing management (14.5-17s)
    [435, 75, "Gestión de Propiedades", "Fácil y Rápido", "narration_goza_es/scene_5.mp3"],
    // Scene 6: Client pipeline / CRM (17-21s)
    [510, 120, "CRM Integrado", "Gestión de Prospectos", "narration_goza_es/scene_6.mp3"],
    // Scene 7: Professional property video listing (21-31s)
    [630, 300, "Videos Cinematográficos", "Fortalece Tu Marca", "narration_goza_es/scene_7.mp3"],
    // Scene 8: JegoDigital CTA (31-36.5s)
    [930, 165, "Siguiente Nivel", "jegodigital.com", "narration_goza_es/scene_8.mp3"],
];

export const GozaShowcaseES: React.FC = () => {
    return (
        <AbsoluteFill style={{ backgroundColor: "#000" }}>
            {/* Background video — the original showcase recording */}
            <Video
                src={staticFile("gozashowcasecorrect.mp4")}
                style={{
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                }}
                muted
            />

            {/* Background Music - Concrete Dreams (From Flamingo Showcase) */}
            <Audio
                src={staticFile("assets/Concrete_Dreams.mp3")}
                volume={0.15}
            />

            {/* Per-scene SPANISH narration audio clips + translated text overlays */}
            {SCENES_ES.map(([from, duration, title, subtitle, audioFile], i) => (
                <Sequence
                    key={`scene-es-${i}`}
                    from={from}
                    durationInFrames={duration}
                    premountFor={10}
                >
                    {/* Spanish ElevenLabs narration clip */}
                    <Audio
                        src={staticFile(audioFile)}
                        volume={0.95}
                    />
                    {/* TextOverlay with entrance & fade-out */}
                    <GozaTextOverlay
                        title={title}
                        subtitle={subtitle}
                        durationInFrames={duration}
                    />
                </Sequence>
            ))}
        </AbsoluteFill>
    );
};
