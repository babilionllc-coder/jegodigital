
// Test script to run the Vision Auditor Agent directly in the terminal
require('dotenv').config();
const { visionAuditor } = require('./genkit_agents/vision_auditor');

async function runTest() {
    console.log("🧪 Starting Vision Auditor Test...");
    try {
        const input = { url: "https://example.com" };
        console.log("Input:", input);

        // Genkit flows are callables. In local dev without the dev server, 
        // we might need to invoke the wrapped function or the underlying logic.
        // Since we exported the result of ai.defineFlow, it should be callable.

        const result = await visionAuditor(input);

        console.log("✅ Test PASSED!");
        console.log("Result:", JSON.stringify(result, null, 2));
    } catch (error) {
        console.error("❌ Test FAILED");
        console.error(error);
    }
}

runTest();
