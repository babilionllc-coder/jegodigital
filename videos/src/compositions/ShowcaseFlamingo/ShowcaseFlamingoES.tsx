import {
    AbsoluteFill,
    Audio,
    Sequence,
    staticFile,
    Video,
} from "remotion";
import { TextOverlay } from "./TextOverlay";

/**
 * SPANISH VERSION: Scene definitions with 100% accurate timings from v2.
 * Each scene = [fromFrame, durationFrames, title, subtitle, audioFile]
 */
const SCENES_ES: [number, number, string, string, string][] = [
    // Scene 1: Homepage with palm trees, premium dark design (0-3s)
    [0, 90, "Diseño Web Premium", "realestateflamingo.com.mx", "narration_es/scene_01.mp3"],
    // Scene 2: Admin Panel sidebar visible (3-5s)
    [90, 60, "Panel de Administración", "Control Total", "narration_es/scene_02.mp3"],
    // Scene 3: Google Analytics charts & pie chart (5-7s)
    [150, 60, "Analíticas en Tiempo Real", "Integración con Google", "narration_es/scene_03.mp3"],
    // Scene 4: CRM Kanban pipeline with lead cards (7-10s)
    [210, 90, "Pipeline CRM", "Gestiona Cada Prospecto", "narration_es/scene_04.mp3"],
    // Scene 5: Lead detail - Llamar/Email/WhatsApp buttons (10-13s)
    [300, 90, "Seguimiento Instantáneo", "WhatsApp · Email · Llamada", "narration_es/scene_05.mp3"],
    // Scene 6: Calendar Febrero 2026 (13-16s)
    [390, 90, "Calendario Inteligente", "Agenda y Organiza", "narration_es/scene_06.mp3"],
    // Scene 7: Email drip campaign timeline (16-19s)
    [480, 90, "Campañas Automáticas", "Nutrición de Leads", "narration_es/scene_07.mp3"],
    // Scene 8: Template dropdown + Flamingo branded email preview (19-24s)
    [570, 150, "Plantillas Personalizadas", "Diseño de Marca", "narration_es/scene_08.mp3"],
    // Scene 9: Projects listing starts at ~25s (25-29s)
    [750, 120, "Proyectos y Desarrollos", "Catálogo de Propiedades", "narration_es/scene_09.mp3"],
    // Scene 10: Property detail - Aldea Zama, photos, pricing (29-35s)
    [870, 180, "Listados Detallados", "Imágenes · Videos · Precios", "narration_es/scene_10.mp3"],
    // Scene 11: AI Chatbot appears at ~37s (37-40s)
    [1110, 90, "Chatbot de IA 24/7", "Asistente Flamingo IA", "narration_es/scene_11.mp3"],
    // Scene 12: CTA - jegodigital.com (40-41s)
    [1200, 30, "Creado por JegoDigital", "jegodigital.com", "narration_es/scene_12.mp3"],
];

export const ShowcaseFlamingoES: React.FC = () => {
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
                    {/* Polish v2 TextOverlay with entrance & fade-out */}
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
