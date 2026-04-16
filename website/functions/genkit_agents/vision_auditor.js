const { z } = require("zod");
const { ai } = require("../genkit_init");
const axios = require("axios");

// Using ai.defineFlow is the standard Genkit 1.0 way.
// The Firebase plugin handles the Cloud Function wrapping when deployed.
const visionAuditor = ai.defineFlow(
    {
        name: "visionAuditor",
        inputSchema: z.object({
            url: z.string().url().describe("The URL of the website to audit")
        }),
        outputSchema: z.object({
            riskScore: z.number().describe("0 to 100 score. 100 means extreme risk/poor site."),
            grade: z.string().describe("Letter grade A, B, C, D, or F"),
            summary: z.string().describe("A ruthless 2-sentence summary of why the site is failing."),
            issues: z.array(z.string()).describe("List of 3 major design/conversion flaws identified visually."),
            screenshotUrl: z.string().optional()
        }),
    },
    async (input) => {
        const apiKey = process.env.FIRECRAWL_API_KEY;
        if (!apiKey) throw new Error("FIRECRAWL_API_KEY not set in environment");

        // Step 1: Eye of the Auditor (Take Screenshot)
        let scrapeResult;
        try {
            const response = await axios.post(
                'https://api.firecrawl.dev/v1/scrape',
                {
                    url: input.url,
                    formats: ['screenshot']
                },
                {
                    headers: {
                        'Authorization': `Bearer ${apiKey}`,
                        'Content-Type': 'application/json'
                    }
                }
            );
            scrapeResult = response.data;
        } catch (e) {
            throw new Error(`Firecrawl API failed: ${e.message}`);
        }

        if (!scrapeResult || !scrapeResult.success) {
            throw new Error("Failed to capture screenshot of target URL");
        }

        console.log("🔥 Firecrawl Response:", JSON.stringify(scrapeResult, null, 2));

        // Handle various Firecrawl v1 response formats
        let screenshotUrl = scrapeResult.data?.screenshot;

        if (!screenshotUrl) {
            // Fallback for debugging: use a placeholder if scrape fails, so we can verify the AI part works
            console.error("❌ No screenshot found in response. Using placeholder for debug.");
            throw new Error(`Firecrawl failed to return a screenshot. Response: ${JSON.stringify(scrapeResult)}`);
        }

        // Step 2: Brain of the Auditor (Gemini Vision Analysis)
        const prompt = `
            Act as a "Ruthless Digital Strategy Director". 
            Analyze this screenshot of a local business website.
            Your job is to identify "Conversion Killers" - reasons why this business is losing money.
            
            Look for:
            - Outdated design (looks like 2010).
            - Poor contrast or readability.
            - Missing "Call to Action" above the fold.
            - Lack of trust signals (reviews, badges).
            
            Be harsh but fair. Assign a "Risk Score" where 0 is perfect and 100 is "This business will go bankrupt".
        `;

        console.log("📸 Screenshot captured:", screenshotUrl);

        // Genkit 1.28 explicit messages format
        console.log("🚀 Sending request to Gemini with explicit messages format...");

        const result = await ai.generate({
            model: "googleai/gemini-2.0-flash",
            messages: [
                {
                    role: 'user',
                    content: [
                        { text: prompt },
                        { media: { url: screenshotUrl, contentType: "image/png" } }
                    ]
                }
            ],
            output: { format: "json" }
        });

        return {
            ...result.output,
            screenshotUrl: screenshotUrl
        };
    }
);

const { onRequest } = require("firebase-functions/v2/https");

// Export the "Flow" for Genkit UI
module.exports = { visionAuditor };

// Export the "Function" for Firebase Production
// This manually wraps the flow to be callable via HTTPS
exports.visionAuditorFunction = onRequest({ cors: true, secrets: ["FIRECRAWL_API_KEY", "GOOGLE_GENAI_API_KEY"] }, async (req, res) => {
    try {
        // Handle "data" wrapper from client SDKs or raw body
        const input = req.body.data || req.body;
        console.log("☁️ Cloud Function Triggered. Input:", JSON.stringify(input));

        // Invoke the flow directly
        const result = await visionAuditor(input);

        // Return in format compatible with Firebase Callable (data: ...)
        res.json({ data: result });
    } catch (error) {
        console.error("❌ Error in visionAuditorFunction:", error);
        res.status(500).json({ error: error.message });
    }
});
