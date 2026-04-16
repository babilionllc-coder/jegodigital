const functions = require("firebase-functions");

const VAPI_BASE_URL = "https://api.vapi.ai";

// Helper to get tokens
const getConfig = () => {
    // const config = functions.config().vapi || {};
    const config = {}; // Override for build safety
    // Fallback to process.env for local testing
    return {
        privateKey: config.private_key || process.env.VAPI_PRIVATE_KEY,
        publicKey: config.public_key || process.env.VAPI_PUBLIC_KEY,
        phoneNumberId: config.phone_number_id || process.env.VAPI_PHONE_NUMBER_ID,
        assistantId: config.assistant_id || process.env.VAPI_ASSISTANT_ID
    };
};

/**
 * Make an outbound call using Vapi.ai
 * Uses "Transient Assistant" (inline config) if no specific Assistant ID is provided.
 */
const makeOutboundCall = async (customerNumber, customerName, specificGoal = "General Check-in", metadata = {}) => {
    const { privateKey, phoneNumberId, assistantId } = getConfig();

    if (!privateKey) {
        throw new Error("Vapi Private Key not configured.");
    }

    const payload = {
        phoneNumberId: phoneNumberId,
        customer: {
            number: customerNumber,
            name: customerName,
            // Attach metadata for context (Dashboard visibility)
            extensionData: {
                leadId: metadata.leadId || null,
                sourcePage: metadata.sourcePage || "Unknown",
                email: metadata.email || "N/A"
            }
        },
    };

    // OPTION A: Use pre-defined Assistant ID (Preferred)
    if (assistantId) {
        payload.assistantId = assistantId;
        payload.assistantOverrides = {
            variableValues: {
                customer_name: customerName,
                call_goal: specificGoal,
                ...metadata // Pass flatten metadata to prompt variables too
            }
        };
    }
    // OPTION B: Transient Assistant (Define inline)
    else {
        const isEnglish = (metadata.language || "es").toLowerCase().startsWith("en");
        console.log(`ℹ️ No Assistant ID found. Using Inline Assistant (${isEnglish ? 'English' : 'Spanish'}).`);

        const systemPrompt = isEnglish
            ? `You are Sarah, a senior strategist at JegoDigital. You are calling ${customerName} regarding their inquiry about "${specificGoal}". 
               Goal: Book a discovery call. Be casual, friendly, and professional. 
               Use short sentences. Use natural fillers like "um" or "uh" occasionally to sound human.
               If they are busy, ask when is a good time to call back.`
            : `Eres Sarah, estratega senior en JegoDigital. Llamas a ${customerName} sobre su interés en "${specificGoal}".
               Objetivo: Agendar una videollamada de descubrimiento.
               Tono: Profesional pero muy casual y amigable. Usa español neutro (Latinoamérica).
               Instrucciones clave:
               - Usa frases cortas (máximo 2 oraciones).
               - Usa muletillas naturales como "este...", "eh...", o "mira..." para sonar humana.
               - Si están ocupados, pregunta amablemente cuándo podrías volver a llamar.
               - NUNCA suenes robótica.`;

        const firstMessage = isEnglish
            ? `Hi ${customerName}, this is Sarah from Jay-Go Digital. Do you have a quick minute?`
            : `Hola ${customerName}, soy Sarah de Je-go Digital. ¿Tienes un minustito?`;

        payload.assistant = {
            firstMessage: firstMessage,
            model: {
                provider: "openai",
                model: "gpt-4o",
                messages: [
                    {
                        role: "system",
                        content: systemPrompt
                    }
                ]
            },
            voice: {
                provider: "openai",
                // "shimmer" is great for serious/sales, "alloy" is generic. 
                // "nova" is efficient. Let's use Shimmer for distinct presence.
                voiceId: isEnglish ? "shimmer" : "shimmer"
            }
        };
    }

    try {
        const response = await fetch(`${VAPI_BASE_URL}/call/phone`, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${privateKey}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Vapi API Error (${response.status}): ${errorText}`);
        }

        const data = await response.json();
        return data; // Contains call details (id, etc.)

    } catch (error) {
        console.error("Vapi Call Failed:", error);
        throw error;
    }
};

/**
 * Fetch list of calls (for dashboard)
 */
const getCallHistory = async (limit = 10) => {
    const { privateKey } = getConfig();
    if (!privateKey) return [];

    try {
        const response = await fetch(`${VAPI_BASE_URL}/call?limit=${limit}`, {
            method: "GET",
            headers: {
                "Authorization": `Bearer ${privateKey}`
            }
        });

        if (!response.ok) return [];
        const rawData = await response.json();

        // Map raw Vapi data to our dashboard format
        return rawData.map(call => ({
            id: call.id,
            status: call.status,
            cost: call.cost,
            startedAt: call.startedAt,
            customer: {
                name: call.customer?.name || "Unknown",
                number: call.customer?.number,
                metadata: call.customer?.extensionData || {} // Retrieve our custom data
            },
            summary: call.analysis?.summary || "No summary available."
        }));
    } catch (error) {
        console.error("Failed to fetch call history:", error);
        return [];
    }
};

module.exports = {
    makeOutboundCall,
    getCallHistory
};
