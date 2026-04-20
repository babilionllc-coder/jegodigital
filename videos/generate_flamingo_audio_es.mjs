import fs from 'fs';
import path from 'path';

const API_KEY = "1c4c9aa9e515b8ef30190e2800944b3cdc5b5c9ec228dce6a1517142f3c5c61a";
const OUT_DIR = "/Users/mac/Desktop/Websites/jegodigital/videos/public/flamingo-audio-es";

// Spanish Sofia
const SOFIA_VOICE = "spPXlKT5a4JMfbhPRAzA";
// Spanish Jorge (CDMX Investor)
const JORGE_VOICE = "Rt1JHkPO27QCUX6Nd5bV";
// Voiceover (Universal/Standard)
const VOICEOVER_VOICE = "N2lVS1w4EtoT3dr4eOWO";

const lines = [
    {
        filename: '01_sofia_hook.mp3',
        voice: SOFIA_VOICE,
        text: "¡Hola Jorge! Veo que estás analizando el R. O. I. en Tulum, pero mis datos muestran que el Distrito 11 de Cancún lo está superando por un 4% este trimestre. ¿Te interesa?"
    },
    {
        filename: '02_jorge_hesitation.mp3',
        voice: JORGE_VOICE,
        text: "No lo sé, Sofía. Aquí en Ciudad de México el mercado es estable. La Riviera Maya se siente como una burbuja. ¿Realmente hay ganancia a largo plazo?"
    },
    {
        filename: '03_sofia_value.mp3',
        voice: SOFIA_VOICE,
        text: "Te entiendo perfecto. Pero mira estos números. La nueva estación del Tren Maya está a 5 minutos de esta propiedad de Flamingo. La ocupación proyectada es del 82%. No estás comprando ladrillos, Jorge; estás comprando una máquina de flujo de efectivo 24/7."
    },
    {
        filename: '04_jorge_impressed.mp3',
        voice: JORGE_VOICE,
        text: "Ok, eso es impresionante. Pero necesito ver esos números en persona antes de comprometerme."
    },
    {
        filename: '05_sofia_closer.mp3',
        voice: SOFIA_VOICE,
        text: "Exactamente por eso ya despejé la agenda de mi bróker para ti. Tengo un espacio VIP para un recorrido mañana a las 10 AM, o el jueves a las 4 PM. ¿Cuál horario asegura tu futuro, Jorge?"
    },
    {
        filename: '06_jorge_success.mp3',
        voice: JORGE_VOICE,
        text: "Hagámoslo mañana a las 10. Eres muy buena, Sofía."
    },
    {
        filename: '07_sofia_success.mp3',
        voice: SOFIA_VOICE,
        text: "No solo soy buena, Jorge. Soy la mejor de Flamingo. Cita confirmada."
    },
    {
        filename: '08_voiceover.mp3',
        voice: VOICEOVER_VOICE,
        text: "¿Quieres este asistente de Inteligencia Artificial para tu agencia? Comenta A I aquí abajo y te daremos acceso gratuito. Desarrollado por JegoDigital."
    }
];

if (!fs.existsSync(OUT_DIR)) {
    fs.mkdirSync(OUT_DIR, { recursive: true });
}

async function generateAudio() {
    for (const line of lines) {
        const outPath = path.join(OUT_DIR, line.filename);
        if (fs.existsSync(outPath)) {
            console.log(`Skipping ${line.filename}, already exists.`);
            continue;
        }

        console.log(`Generating ${line.filename}...`);

        try {
            const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${line.voice}`, {
                method: 'POST',
                headers: {
                    'Accept': 'audio/mpeg',
                    'xi-api-key': API_KEY,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    text: line.text,
                    model_id: "eleven_multilingual_v2",
                    voice_settings: {
                        stability: 0.5,
                        similarity_boost: 0.75,
                        style: line.voice === VOICEOVER_VOICE ? 0.2 : 0.0
                    }
                })
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`API Error: ${response.status} ${response.statusText} - ${errorText}`);
            }

            const arrayBuffer = await response.arrayBuffer();
            const buffer = Buffer.from(arrayBuffer);
            fs.writeFileSync(outPath, buffer);
            console.log(`Saved ${line.filename}`);

            await new Promise(r => setTimeout(r, 1000));
        } catch (error) {
            console.error(`Failed to generate ${line.filename}:`, error);
        }
    }
    console.log("Audio generation complete!");
}

generateAudio();
