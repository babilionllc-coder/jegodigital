const { genkit } = require("genkit");
const { firebase } = require("@genkit-ai/firebase");
const { googleAI } = require("@genkit-ai/googleai");

// Initialize Genkit
// Note: GOOGLE_GENAI_API_KEY must be set in Firebase Config or Environment
const ai = genkit({
    plugins: [
        // firebase(), // Temporarily disabled due to import issue
        googleAI()
    ]
});

module.exports = { ai };
