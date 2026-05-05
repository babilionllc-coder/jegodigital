/**
 * generateReferralCode — LOOP v1 Referral Code Generator
 *
 * Trigger 1: Firestore onDocumentCreated('clients/{clientId}')
 *   - Auto-generates code on new client signup
 *
 * Trigger 2: HTTP onRequest (backfill)
 *   - Iterates existing clients, generates codes for missing ones
 *
 * Code format: JD-{first3_uppercase}{random4_digits}
 * Example: JD-FLA1234
 *
 * HR Compliance:
 *   - HR-1: Firestore writes are real API calls
 *   - Idempotent: skips if referralCode already set
 */

const functions = require("firebase-functions/v2");
const admin = require("firebase-admin");
const { getFirestore } = require("firebase-admin/firestore");

// Initialize Firebase
if (!admin.apps.length) {
  admin.initializeApp();
}

const db = getFirestore();
const logger = functions.logger;

// ========== HELPERS ==========

function generateReferralCode(clientName) {
  /**
   * Format: JD-{first3_uppercase}{4_random_digits}
   * E.g., "Living Riviera Maya" → JD-LIV[0000-9999]
   */
  const prefix = clientName.substring(0, 3).toUpperCase();
  const suffix = String(Math.floor(Math.random() * 10000)).padStart(4, "0");
  return `JD-${prefix}${suffix}`;
}

// ========== TRIGGER 1: Firestore onDocumentCreated ==========

exports.generateReferralCodeOnSignup = functions.firestore.onDocumentCreated(
  "clients/{clientId}",
  async (event) => {
    const clientId = event.params.clientId;
    const clientData = event.data.data();

    logger.info(`generateReferralCodeOnSignup fired for client ${clientId}`);

    // Check if code already exists (idempotent)
    if (clientData.referralCode) {
      logger.info(`Client ${clientId} already has referralCode: ${clientData.referralCode}`);
      return;
    }

    const clientName = clientData.name || clientData.company_name || "Client";
    const code = generateReferralCode(clientName);

    // Write back to Firestore
    try {
      await db.collection("clients").doc(clientId).update({
        referralCode: code,
        referralCodeGeneratedAt: new Date().toISOString(),
      });

      logger.info(`Generated referralCode for ${clientId}: ${code}`);
    } catch (error) {
      logger.error(`Failed to write referralCode for ${clientId}:`, error.message);
    }
  }
);

// ========== TRIGGER 2: HTTP Backfill Endpoint ==========

exports.generateReferralCodeBackfill = functions.https.onRequest(async (req, res) => {
  /**
   * Backfill: iterate all clients, generate codes for missing ones.
   * Usage: curl -X POST "https://us-central1-jegodigital-e02fb.cloudfunctions.net/generateReferralCodeBackfill"
   */

  try {
    const clientsRef = db.collection("clients");
    const snapshot = await clientsRef.get();

    let generated = 0;
    let skipped = 0;

    for (const doc of snapshot.docs) {
      const clientId = doc.id;
      const clientData = doc.data();

      if (clientData.referralCode) {
        logger.info(`Skipping ${clientId}: already has code ${clientData.referralCode}`);
        skipped++;
        continue;
      }

      const clientName = clientData.name || clientData.company_name || "Client";
      const code = generateReferralCode(clientName);

      await db.collection("clients").doc(clientId).update({
        referralCode: code,
        referralCodeGeneratedAt: new Date().toISOString(),
      });

      logger.info(`Backfill: generated ${code} for ${clientId}`);
      generated++;
    }

    res.status(200).json({
      success: true,
      generated,
      skipped,
      total: snapshot.size,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error("Backfill error:", error.message);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString(),
    });
  }
});