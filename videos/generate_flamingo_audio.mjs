import fs from 'fs';
import path from 'path';

const API_KEY = "1c4c9aa9e515b8ef30190e2800944b3cdc5b5c9ec228dce6a1517142f3c5c61a";
const OUT_DIR = "/Users/mac/Desktop/Websites/jegodigital/videos/public/flamingo-audio";

// Rachel (Professional Female)
const SOFIA_VOICE = "21m00Tcm4TlvDq8ikWAM";
// David (User specific voice)
const DAVID_VOICE = "Rn9Yq7uum9irZ6RwppDN";
// Adam (Fast Promo Voiceover) -> Changed to Callum (Standard)
const VOICEOVER_VOICE = "N2lVS1w4EtoT3dr4eOWO";

const lines = [
    {
        filename: '01_sofia_hook.mp3',
        voice: SOFIA_VOICE,
        text: "Hola David! I see you're looking at ROI in Tulum, but my data shows Cancún's District 11 is outperforming it by 4% this quarter. Interested?"
    },
    {
        filename: '02_david_hesitation.mp3',
        voice: DAVID_VOICE,
        text: "I don't know, Sofia. Mexico City is stable. The Maya Riviera feels like a bubble. Is the long-term profit actually there?"
    },
    {
        filename: '03_sofia_value.mp3',
        voice: SOFIA_VOICE,
        text: "I understand. But look at this. The new Maya Train station is 5 minutes from this Flamingo property. Occupancy rates are projected at 82%. You aren't just buying bricks; you're buying a 24/7 cash-flow machine."
    },
    {
        filename: '04_david_impressed.mp3',
        voice: DAVID_VOICE,
        text: "Okay, that's impressive. But I need to see the numbers in person before I commit."
    },
    {
        filename: '05_sofia_closer.mp3',
        voice: SOFIA_VOICE,
        text: "Exactly why I've already cleared my broker's schedule for you. I have a VIP tour slot tomorrow at 10 AM or Thursday at 4 PM. Which one secures your future, David?"
    },
    {
        filename: '06_david_success.mp3',
        voice: DAVID_VOICE,
        text: "Let's do tomorrow. You're good, Sofia."
    },
    {
        filename: '07_sofia_success.mp3',
        voice: SOFIA_VOICE,
        text: "I'm not just good, David. I'm Flamingo's best. Appointment confirmed."
    },
    {
        filename: '08_voiceover.mp3',
        voice: VOICEOVER_VOICE,
        text: "Want this AI assistant for your agency? Comment 'AI' below and I'll send it to you for free. Powered by JegoDigital."
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
                        style: line.voice === VOICEOVER_VOICE ? 0.2 : 0.0 // Give Voiceover slightly more style
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

            // Small delay to respect rate limits
            await new Promise(r => setTimeout(r, 1000));
        } catch (error) {
            console.error(`Failed to generate ${line.filename}:`, error);
        }
    }
    console.log("Audio generation complete!");
}

generateAudio();
