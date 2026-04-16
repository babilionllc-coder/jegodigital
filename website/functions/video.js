const functions = require('firebase-functions');
const axios = require('axios');
const admin = require('firebase-admin');

// CONFIG
// CONFIG
// const HEYGEN_KEY = functions.config().heygen?.key || process.env.HEYGEN_API_KEY;
const HEYGEN_KEY = process.env.HEYGEN_API_KEY || "";

// DEFAULTS
const DEFAULT_AVATAR = 'Amelia_sitting_business_training_front';
const DEFAULT_VOICE = '7bf3a42a7a3847a586017bcbab105734'; // Poised Pilar (Spanish) - Matches user's script preference

/**
 * Generate Video (HeyGen v2)
 * @param {Object} data - { script: string, avatar_id: string (opt), voice_id: string (opt) }
 */
exports.generateVideo = functions.https.onCall(async (data, context) => {
    // 1. Auth Check
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Login required.');
    }

    const { script, avatar_id, voice_id } = data;

    if (!script || script.length < 5) {
        throw new functions.https.HttpsError('invalid-argument', 'Script is too short.');
    }

    functions.logger.info(`🎬 Generating Video for user ${context.auth.uid}...`);

    try {
        const payload = {
            video_inputs: [
                {
                    character: {
                        type: "avatar",
                        avatar_id: avatar_id || DEFAULT_AVATAR,
                        scale: 1.0
                    },
                    voice: {
                        type: "text",
                        voice_id: voice_id || DEFAULT_VOICE,
                        input_text: script
                    }
                }
            ],
            dimension: { width: 720, height: 1280 } // Vertical 720p
        };

        const res = await axios.post('https://api.heygen.com/v2/video/generate', payload, {
            headers: {
                'X-Api-Key': HEYGEN_KEY,
                'Content-Type': 'application/json'
            }
        });

        const videoId = res.data?.data?.video_id;
        if (!videoId) throw new Error("No Video ID returned from HeyGen.");

        return { success: true, video_id: videoId };

    } catch (error) {
        functions.logger.error("❌ HeyGen Error:", error.response?.data || error.message);
        throw new functions.https.HttpsError('internal', 'Video Generation Failed: ' + (error.response?.data?.error?.message || error.message));
    }
});

/**
 * Check Video Status
 * @param {Object} data - { video_id: string }
 */
exports.checkVideoStatus = functions.https.onCall(async (data, context) => {
    // 1. Auth Check
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Login required.');
    }

    const { video_id } = data;
    if (!video_id) {
        throw new functions.https.HttpsError('invalid-argument', 'Video ID required.');
    }

    try {
        const res = await axios.get(`https://api.heygen.com/v1/video_status.get?video_id=${video_id}`, {
            headers: { 'X-Api-Key': HEYGEN_KEY }
        });

        const status = res.data?.data?.status;
        const videoUrl = res.data?.data?.video_url;
        const error = res.data?.data?.error;

        return {
            success: true,
            status: status,
            video_url: videoUrl,
            error: error
        };

    } catch (error) {
        functions.logger.error("❌ HeyGen Status Error:", error.response?.data || error.message);
        throw new functions.https.HttpsError('internal', 'Status Check Failed: ' + error.message);
    }
});
