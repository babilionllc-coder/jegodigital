const { GoogleGenerativeAI } = require("@google/generative-ai");
const functions = require('firebase-functions');
require('dotenv').config();

// Import Tools
const { runSiteAudit } = require('./audit');
const { getSeoMetrics } = require('./seo');

// Initialize Gemini API
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_GENAI_API_KEY);

// --- TOOL DEFINITIONS ---
// Note: SDK converts this automatically to the correct format
const toolDefinitions = [
    {
        name: "runSiteAudit",
        description: "Performs a comprehensive technical, SEO, and content audit of a website. Returns scores, issues, and a roadmap.",
        parameters: {
            type: "OBJECT", // String "OBJECT" for this SDK
            properties: {
                url: {
                    type: "STRING",
                    description: "The full URL of the website to audit (e.g., https://example.com)."
                }
            },
            required: ["url"]
        }
    },
    {
        name: "getSeoMetrics",
        description: "Get checking current SEO performance metrics (PageSpeed, Core Web Vitals) for a URL.",
        parameters: {
            type: "OBJECT",
            properties: {
                url: {
                    type: "STRING",
                    description: "The URL to check."
                }
            },
            required: ["url"]
        }
    }
];

// --- HELPER: WRAP HTTP FUNCTION ---
async function callHttpFunction(func, queryParams = {}, bodyParams = {}) {
    return new Promise((resolve, reject) => {
        const req = {
            method: 'GET',
            query: queryParams,
            body: bodyParams,
            headers: {}
        };
        const res = {
            set: () => { },
            status: (code) => {
                if (code >= 400) console.warn(`Tool returned status ${code}`);
                return res;
            },
            json: (data) => resolve(data),
            send: (data) => resolve(data)
        };
        try {
            func(req, res);
        } catch (e) {
            reject(e);
        }
    });
}

// --- AGENT LOGIC ---
const modelIds = ["gemini-1.5-flash", "gemini-1.0-pro"];

exports.agent = functions.https.onRequest(async (req, res) => {
    // CORS
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.status(204).send('');
        return;
    }

    try {
        const { message, history } = req.body;
        if (!message) throw new Error("Message is required.");

        // Use standard Flash model
        const model = genAI.getGenerativeModel({
            model: "gemini-2.0-flash",
            tools: [{ functionDeclarations: toolDefinitions }]
        });

        const chat = model.startChat({
            history: history || [],
        });

        // Send Message
        const result = await chat.sendMessage(message);
        const response = await result.response;
        const functionCalls = response.functionCalls();

        if (functionCalls && functionCalls.length > 0) {
            // EXECUTE TOOLS
            const toolResponses = [];

            for (const call of functionCalls) {
                console.log(`🛠️ Agent calling tool: ${call.name}`);

                let toolResult = {};
                if (call.name === "runSiteAudit") {
                    const url = call.args.url;
                    toolResult = await callHttpFunction(runSiteAudit, { url: url });
                } else if (call.name === "getSeoMetrics") {
                    const url = call.args.url;
                    toolResult = await callHttpFunction(getSeoMetrics, { url: url });
                } else {
                    toolResult = { error: `Unknown tool: ${call.name}` };
                }

                toolResponses.push({
                    functionResponse: {
                        name: call.name,
                        response: toolResult // SDK handles structure
                    }
                });
            }

            // Send Tool Output back to Model
            const finalResult = await chat.sendMessage(toolResponses);
            const finalResponse = await finalResult.response;
            const finalText = finalResponse.text();

            res.json({
                text: finalText,
                tool_calls: functionCalls.map(c => c.name)
            });

        } else {
            res.json({ text: response.text() });
        }

    } catch (error) {
        console.error("Agent Error:", error);
        res.status(500).json({ error: error.message });
    }
});
