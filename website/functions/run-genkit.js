
// This script is used to run the Genkit environment locally for the Dev UI.
// It imports the main agents (registering them) and keeps the process alive.

require('dotenv').config(); // Load .env
const { ai } = require('./genkit_init');

// Import the agents directly to ensure they are registered
// (Note: requiring index.js would also work, but this is cleaner for just Genkit)
require('./genkit_agents/vision_auditor');

console.log("🚀 Genkit Agents Loaded.");
console.log("Waiting for Genkit UI to connect...");

// Keep the process alive so the Genkit Reflection Server can run
setInterval(() => { }, 10000);
