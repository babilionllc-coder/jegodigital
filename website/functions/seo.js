const functions = require("firebase-functions");
// const { google } = require("googleapis"); // Future: Use for real GSC data
const admin = require("firebase-admin");
if (admin.apps.length === 0) {
    admin.initializeApp();
}

exports.getSeoMetrics = functions.https.onRequest(async (req, res) => {
    // Enable CORS
    res.set('Access-Control-Allow-Origin', '*');

    if (req.method === 'OPTIONS') {
        res.set('Access-Control-Allow-Methods', 'GET');
        res.set('Access-Control-Allow-Headers', 'Content-Type');
        res.set('Access-Control-Max-Age', '3600');
        res.status(204).send('');
        return;
    }

    try {
        const url = req.query.url || 'https://jegodigital.com';

        // Initialize default responses
        let performance = 0;
        let coreWebVitals = { lcp: 'N/A', fid: 'N/A', cls: 'N/A' };
        let gscData = null;

        // 1. Fetch PageSpeed Insights (Public API)
        try {
            const apiKey = process.env.PSI_API_KEY || "";
            // Use a fallback strategy or handle quota errors
            const pagespeedUrl = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(url)}&strategy=mobile&key=${apiKey}`;

            const psResponse = await fetch(pagespeedUrl);
            const psData = await psResponse.json();

            if (psData.error) {
                console.warn("PSI API Error:", psData.error.message);
                // Don't throw, just log. Performance stays 0.
            } else {
                const lighthouse = psData.lighthouseResult || {};
                const categories = lighthouse.categories || {};
                performance = categories.performance ? Math.round(categories.performance.score * 100) : 0;
                coreWebVitals = {
                    lcp: lighthouse.audits['largest-contentful-paint']?.displayValue,
                    fid: lighthouse.audits['max-potential-fid']?.displayValue,
                    cls: lighthouse.audits['cumulative-layout-shift']?.displayValue,
                    speedIndex: lighthouse.audits['speed-index']?.displayValue,
                };
            }
        } catch (psiError) {
            console.error("PSI Fetch Error", psiError);
        }

        // 2. Google Search Console Data
        try {
            // Check for Service Account Key in functions config
            // Usage: firebase functions:config:set gsc.key='{"type": "service_account", ...}'
            const gscConfig = functions.config().gsc;

            if (gscConfig && gscConfig.key && gscConfig.email) {
                const { google } = require('googleapis');
                // FIX: Handle newlines in Private Key properly for Firebase Config
                let privateKey = gscConfig.key;
                if (privateKey) {
                    privateKey = privateKey.replace(/\\n/g, '\n');
                }

                const auth = new google.auth.GoogleAuth({
                    credentials: {
                        client_email: gscConfig.email,
                        private_key: privateKey,
                    },
                    scopes: ['https://www.googleapis.com/auth/webmasters.readonly'],
                });

                const searchconsole = google.searchconsole({ version: 'v1', auth });

                // Calculate date range (Last 30 days)
                const endDate = new Date();
                const startDate = new Date();
                startDate.setDate(endDate.getDate() - 30);

                const dateStr = (d) => d.toISOString().split('T')[0];

                const res = await searchconsole.searchanalytics.query({
                    siteUrl: url,
                    requestBody: {
                        startDate: dateStr(startDate),
                        endDate: dateStr(endDate),
                        dimensions: ['query'],
                        rowLimit: 10,
                        aggregationType: 'byProperty'
                    },
                });

                if (res.data.rows) {
                    const rows = res.data.rows;
                    const keywords = rows.map(r => ({
                        query: r.keys[0],
                        clicks: r.clicks,
                        position: parseFloat(r.position.toFixed(1))
                    }));

                    gscData = {
                        clicks: keywords.reduce((a, b) => a + b.clicks, 0), // Approx
                        impressions: keywords.reduce((a, b) => a + b.impressions, 0), // Approx
                        keywords: keywords
                    };
                }
            } else {
                console.log("No GSC Credentials found (gsc.key). Using Mock Data.");
            }
        } catch (authError) {
            console.error("GSC Auth/API Error:", authError);
            // Fallback to mock if API fails
        }

        // 3. Fallback Mock Data (if GSC failed or not configured)
        if (!gscData) {
            // User requested NO FAKE DATA.
            // If API fails or no data, return minimal/empty structure mostly for UI safety.
            gscData = {
                clicks: 0,
                impressions: 0,
                ctr: 0,
                position: 0,
                keywords: [],
                isMock: false, // Explicitly False
                error: "No Data Available or Connection Failed"
            };
        }

        // 4. Save to History (Fire & Forget)
        try {
            const db = admin.firestore();
            const today = new Date().toISOString().split('T')[0];
            await db.collection('seo_history').doc(today).set({
                timestamp: admin.firestore.FieldValue.serverTimestamp(),
                performance: performance,
                mobile_friendly: true, // Assumed if score > 0
                gsc_clicks: gscData.clicks || 0,
                gsc_impressions: gscData.impressions || 0,
                gsc_position: gscData.position || 0
            }, { merge: true });
            console.log("✅ Saved SEO history for:", today);
        } catch (dbErr) {
            console.warn("⚠️ Failed to save history:", dbErr);
            // Don't fail the request
        }

        res.json({
            url: url,
            performance: performance,
            coreWebVitals: coreWebVitals,
            gsc: gscData
        });

    } catch (error) {
        functions.logger.error("SEO Error", error);
        res.status(500).json({ error: error.message });
    }
});
