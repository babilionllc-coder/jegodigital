const functions = require('firebase-functions');
const axios = require('axios');
const admin = require('firebase-admin');

// CONFIG
// CONFIG
// const LATE_KEY = functions.config().late?.key || process.env.LATE_API_KEY;
// const LATE_URL = functions.config().late?.url || 'https://getlate.dev/api/v1';
const LATE_KEY = process.env.LATE_API_KEY || "";
const LATE_URL = 'https://getlate.dev/api/v1';

// LATE API ACCOUNTS (Hardcoded from tools/schedule_late_blast.cjs)
// Ideally this should be dynamic or fetched from /accounts endpoint.
const ACCOUNT_MAP = {
    'linkedin': { id: '6963014c4207e06f4ca84bf0', platform: 'linkedin' },
    'x': { id: '696301594207e06f4ca84bf1', platform: 'twitter' },
    'bluesky': { id: '696301394207e06f4ca84bef', platform: 'bluesky' },
    'reddit': { id: '6963017e4207e06f4ca84bf2', platform: 'reddit' },
    'gmb': { id: '696301904207e06f4ca84bf3', platform: 'google_business' },
    'mastodon': { id: '696301ab4207e06f4ca84bf4', platform: 'mastodon' }
};

/**
 * Trigger Social Post (via Late API)
 */
exports.postSocial = functions.https.onCall(async (data, context) => {
    // 1. Auth Check
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Login required.');
    }

    const { message, platforms } = data; // platforms = ['linkedin', 'x']

    if (!message || !platforms || !Array.isArray(platforms)) {
        throw new functions.https.HttpsError('invalid-argument', 'Message and platforms (array) required.');
    }

    functions.logger.info(`📢 Late API Blast to ${platforms.length} channels...`);

    // 2. Construct Payload
    const targets = [];
    platforms.forEach(p => {
        if (ACCOUNT_MAP[p]) {
            targets.push({
                platform: ACCOUNT_MAP[p].platform,
                accountId: ACCOUNT_MAP[p].id
            });
        }
    });

    if (targets.length === 0) {
        throw new functions.https.HttpsError('invalid-argument', 'No valid platforms found.');
    }

    // 3. Send to Late API
    try {
        const payload = {
            content: message,
            platforms: targets
        };

        const res = await axios.post(`${LATE_URL}/posts`, payload, {
            headers: {
                'Authorization': `Bearer ${LATE_KEY}`,
                'Content-Type': 'application/json'
            }
        });

        functions.logger.info(`✅ Late Response: ${res.data?.id || 'Success'}`);

        // 4. Log to Firestore
        const db = admin.firestore();
        await db.collection('social_logs').add({
            content: message,
            platforms: platforms,
            postId: res.data?.id || 'unknown',
            provider: 'Late API',
            status: 'Sent',
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
            user: context.auth.uid
        });

        return { success: true, id: res.data?.id, provider: 'late' };

    } catch (error) {
        functions.logger.error("❌ Late API Error:", error.response?.data || error.message);
        throw new functions.https.HttpsError('internal', 'Late API Failed: ' + (error.response?.data?.message || error.message));
    }
});
