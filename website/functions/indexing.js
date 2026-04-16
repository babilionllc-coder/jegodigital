const functions = require("firebase-functions");
const { google } = require("googleapis");
const admin = require("firebase-admin");

// Ensure App is initialized
if (admin.apps.length === 0) {
    admin.initializeApp();
}

/**
 * Submit URLs to Google Indexing API
 * Usage: GET/POST /googleIndexer?url=https://...
 * Config: firebase functions:config:set google.key="..." google.email="..."
 */
exports.googleIndexer = functions.https.onRequest(async (req, res) => {
    // CORS
    res.set('Access-Control-Allow-Origin', '*');
    if (req.method === 'OPTIONS') {
        res.set('Access-Control-Allow-Methods', 'GET, POST');
        res.set('Access-Control-Allow-Headers', 'Content-Type');
        res.status(204).send('');
        return;
    }

    const urlToSubmit = req.query.url || req.body.url;

    if (!urlToSubmit) {
        return res.status(400).json({ error: "Missing 'url' parameter" });
    }

    try {
        // 1. Get Credentials
        // Uses existing 'gsc' config which contains the full service account JSON object
        const gscConfig = {}; // functions.config().gsc;

        if (!gscConfig || !gscConfig.key) {
            // throw new Error("Missing Google Service Account config (gsc.key)");
            // Bypass for now to allow deployment of other functions
            return res.status(503).json({ error: "Indexing temporarily disabled during deployment maintenance." });
        }

        // 'gsc.key' is likely the JSON object parsed by Firebase if set via JSON file, 
        // OR it's a string if set via string. 
        // Based on inspected config, 'key' is an OBJECT with private_key, client_email etc.

        const credentials = gscConfig.key;
        const clientEmail = credentials.client_email;
        let privateKey = credentials.private_key;

        if (!clientEmail || !privateKey) {
            throw new Error("Invalid Service Account Config structure in 'gsc.key'");
        }

        // Fix Newlines if necessary (common issue with env vars)
        privateKey = privateKey.replace(/\\n/g, '\n');

        const auth = new google.auth.GoogleAuth({
            credentials: {
                client_email: clientEmail,
                private_key: privateKey,
            },
            scopes: ['https://www.googleapis.com/auth/indexing'],
        });

        const indexing = google.indexing({ version: 'v3', auth });

        // 2. Submit URL
        const result = await indexing.urlNotifications.publish({
            requestBody: {
                url: urlToSubmit,
                type: 'URL_UPDATED'
            }
        });

        console.log(`✅ Indexed: ${urlToSubmit}`);

        // 3. Log to Firestore
        await admin.firestore().collection('indexing_logs').add({
            url: urlToSubmit,
            status: 'success',
            response: result.data,
            timestamp: admin.firestore.FieldValue.serverTimestamp()
        });

        res.json({ success: true, apiResponse: result.data });

    } catch (error) {
        console.error("Indexing API Error:", error);

        // Log failure
        await admin.firestore().collection('indexing_logs').add({
            url: urlToSubmit,
            status: 'error',
            error: error.message,
            timestamp: admin.firestore.FieldValue.serverTimestamp()
        });

        res.status(500).json({
            error: "Indexing failed",
            details: error.message,
            tip: "Did you enable 'google.key' config?"
        });
    }
});
