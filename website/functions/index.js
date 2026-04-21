const functions = require("firebase-functions");
const admin = require("firebase-admin");
const { getFirestore } = require("firebase-admin/firestore");
const nodemailer = require("nodemailer");
const axios = require("axios"); // Added for ElevenLabs

const { syncContact } = require("./services/hubspotService");
const { makeOutboundCall, getCallHistory } = require("./services/vapiService");

admin.initializeApp();


// Configuration
// Configuration
// Use optional chaining for safe access during build/deploy when config might be missing
// const rawConfig = functions.config().campaign?.senders_json;
const SENDERS = []; // (rawConfig && typeof rawConfig === 'string') ? JSON.parse(rawConfig) : [];

// Test Function to verify deployment
exports.helloWorld = functions.https.onRequest((request, response) => {
    functions.logger.info("Hello logs!", { structuredData: true });
    response.send("Hello from Jegodigital Backend v1.1!");
});

// Helper: Get Transporter
const getTransporter = (sender) => {
    return nodemailer.createTransport({
        service: "gmail",
        auth: {
            user: sender.email,
            pass: sender.pass,
        },
    });
};

/*
 * Cloud Campaign Launcher
 * Trigger: Manual HTTP or Cloud Scheduler
 * Action: Sends 10 emails from the next available sender.
 */
/*
 * Shared Campaign Logic
 */
const runCampaign = async () => {
    if (SENDERS.length === 0) {
        throw new Error("❌ No senders configured in functions:config.");
    }

    // Connect to 'data' database explicitly
    const db = getFirestore();

    // 1. Fetch Pending Leads (Limit 4 per run -> ~96/day for 10 senders -> ~9.6 per sender. Safe!)
    const leadsRef = db.collection("leads");
    const snapshot = await leadsRef
        .where("status", "==", "Pending")
        .limit(4)
        .get();

    if (snapshot.empty) {
        functions.logger.info("No pending leads found.");
        return { success: true, count: 0, message: "No pending leads." };
    }

    const leads = [];
    snapshot.forEach(doc => leads.push({ id: doc.id, ...doc.data() }));

    // 2. Pick a Sender (Simple Rotation or Random)
    const sender = SENDERS[Math.floor(Math.random() * SENDERS.length)];
    const transporter = getTransporter(sender);

    functions.logger.info(`🚀 Starting Campaign Run. Leads: ${leads.length}. Sender: ${sender.email}`);

    let sentCount = 0;
    const batch = db.batch();

    for (const lead of leads) {
        let rawEmail = lead.email || "";

        // --- STRICT SANITIZATION ---
        // 1. Decode URL entities (e.g. %20)
        try { rawEmail = decodeURIComponent(rawEmail); } catch (e) { }
        // 2. Remove whitespace
        let email = rawEmail.trim();
        // 3. Remove leading/trailing non-alphanumeric (except < and >)
        email = email.replace(/^[^a-zA-Z0-9<]+|[^a-zA-Z0-9>]+$/g, "");

        // 4. Basic Validation Regex
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!email || !emailRegex.test(email) || email.includes("%")) {
            functions.logger.warn(`⚠️ Skipping Invalid Email: '${rawEmail}' -> '${email}'`);

            // Mark as Blocked in DB so we don't fetch it again
            batch.update(leadsRef.doc(lead.id), {
                status: "Blocked",
                notes: "Invalid Email Format detected by Safety Layer"
            });
            continue;
        }

        // Personalize (Rotated Subjects & Better Body)
        const subjects = [
            "Jego Digital: Estrategia de Crecimiento 2026",
            `Propuesta para ${lead.company || "su negocio"}`,
            "Una Oportunidad de Expansión Digital",
            "Sistemas de Crecimiento para Tulum & Cancún"
        ];
        const subject = subjects[Math.floor(Math.random() * subjects.length)];

        const body = `Hola ${lead.company || "Equipo"},\n\n` +
            `Espero que estén teniendo una excelente semana.\n\n` +
            `Hemos analizado su presencia digital y detectamos una oportunidad significativa de crecimiento para este trimestre. En JegoDigital, nos especializamos en sistemas de adquisición de clientes de alto valor.\n\n` +
            `Nos gustaría compartir un breve análisis preliminar de su mercado sin ningún compromiso.\n\n` +
            `¿Tendrían disponibilidad para una breve llamada de 10 minutos esta semana?\n\n` +
            `Saludos cordiales,\n\n` +
            `${sender.name || "Alex"}\n` +
            `JegoDigital.com`;

        const mailOptions = {
            from: sender.email,
            to: email, // Use sanitized
            subject: subject,
            text: body
        };

        try {
            await transporter.sendMail(mailOptions);

            // Update Status in Firestore
            const leadDoc = leadsRef.doc(lead.id);
            batch.update(leadDoc, {
                status: "Sent",
                sent_at: new Date().toISOString(),
                sender: sender.email,
                email: email // Save sanitized version back if it changed
            });

            // Log to 'email_logs' for Dashboard
            const logId = `${new Date().toISOString()}_${email}`.replace(/[^a-zA-Z0-9]/g, "");
            const logRef = db.collection("email_logs").doc(logId);
            batch.set(logRef, {
                recipient: email,
                sender: sender.email,
                status: "Sent",
                timestamp: new Date().toISOString(),
                subject: subject
            });

            sentCount++;
        } catch (sendError) {
            functions.logger.error(`❌ Send Failed to ${email}:`, sendError);
            // Don't crash campaign, just log
        }
    }

    await batch.commit();
    functions.logger.info(`✅ Successfully sent ${sentCount} emails.`);
    return { success: true, count: sentCount, sender: sender.email };
};

/*
 * Trigger 1: HTTP (Manual / Dashboard)
 */
exports.startCampaign = functions.https.onRequest(async (req, res) => {
    try {
        const result = await runCampaign();
        res.json(result);
    } catch (error) {
        functions.logger.error("Error in startCampaign", error);
        res.status(500).json({ error: error.message });
    }
});

// --- SEO FUNCTION ---
const { getSeoMetrics } = require('./seo');
const { runSiteAudit } = require('./audit');
const { googleIndexer } = require('./indexing');

exports.getSeoMetrics = getSeoMetrics;
exports.runSiteAudit = runSiteAudit; // V2.2 Update
exports.googleIndexer = googleIndexer;
// --- SOCIAL MEDIA ---
exports.postSocial = require('./social').postSocial;
// --- VIDEO STUDIO ---
const { generateVideo, checkVideoStatus } = require('./video');
exports.generateVideo = generateVideo;
exports.checkVideoStatus = checkVideoStatus;
// --- CALENDLY IN-CHAT BOOKING (ManyChat External Request endpoint) ---
exports.getCalendlySlots = require('./calendly').getCalendlySlots;
// --- SOFIA LIVE BOOKING (ElevenLabs cold call → Calendly) ---
exports.getAvailableSlots = require('./sofiaCalendly').getAvailableSlots;
exports.bookCalendlyLive  = require('./sofiaCalendly').bookCalendlyLive;
// --- CALENDLY WEBHOOK (invitee.created / invitee.canceled / invitee.no_show → Telegram + Brevo + Firestore) ---
exports.calendlyWebhook = require('./calendlyWebhook').calendlyWebhook;
// --- Hourly dispatcher for Firestore `scheduled_emails` queue (no-show recovery sequence +3d/+7d/+14d) ---
exports.processScheduledEmails = require('./calendlyWebhook').processScheduledEmails;
// --- 5-min scan for T-10min WhatsApp reminders on WA-sourced Calendly bookings ---
exports.sendT10minReminders = require('./calendlyWebhook').sendT10minReminders;

/*
 * Trigger 2: Scheduler (Auto - Hourly)
 * Uses Cloud Scheduler under the hood.
 */
/*
exports.scheduledCampaign = functions.pubsub.schedule('every 1 hours').onRun(async (context) => {
    try {
        await runCampaign();
        return null;
    } catch (error) {
        functions.logger.error("Error in scheduledCampaign", error);
        return null;
    }
});
*/

// Sync Function (Replaces Python Script)
exports.uploadCampaignLogs = functions.https.onRequest(async (req, res) => {
    try {
        const logs = req.body.logs || [];
        if (!Array.isArray(logs)) {
            functions.logger.error("Invalid format: 'logs' is not an array", { body: req.body });
            return res.status(400).send("Invalid format: 'logs' must be an array.");
        }

        // Connect to 'data' database explicitly
        const db = getFirestore();
        const batch = db.batch();
        let count = 0;

        for (const log of logs) {
            // Validate required fields
            if (!log.recipient || !log.timestamp) {
                functions.logger.warn("Skipping invalid log entry", { log });
                continue;
            }

            // Create deterministic ID to prevent duplicates
            const rawId = `${log.timestamp}_${log.recipient}`;
            const docId = rawId.replace(/[^a-zA-Z0-9_\-@.]/g, ""); // Sanitize

            if (!docId) {
                functions.logger.warn("Skipping empty docId", { log });
                continue;
            }

            const ref = db.collection("email_logs").doc(docId);
            batch.set(ref, log, { merge: true });
            count++;

            // Firestore batch limit is 500
            if (count >= 490) break; // Simple safety cap per request
        }

        if (count > 0) {
            await batch.commit();
        }

        functions.logger.info(`Synced ${count} logs via Cloud Function.`);
        res.json({ success: true, synced: count });
    } catch (error) {
        functions.logger.error("Error in uploadCampaignLogs", error);
        res.status(500).json({ error: error.message });
    }
});

// --- CHAT FUNCTION (Restored) ---
const { GoogleGenerativeAI } = require("@google/generative-ai");

exports.chat = functions.https.onRequest(async (req, res) => {
    // CORS
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.status(204).send('');
        return;
    }

    try {
        const { message, image, config } = req.body;
        // Try config or process env
        const apiKey = functions.config().gemini?.key || process.env.GEMINI_API_KEY;

        if (!apiKey) {
            // Fallback for safety if key is missing (Mock Response)
            // functions.logger.error("Gemini API Key missing");
            // return res.json({ text: "I'm sorry, I am currently undergoing maintenance. Please try again later." });
            throw new Error("API Key not configured");
        }

        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

        let finalPrompt = message;
        if (config && config.systemPrompt) {
            finalPrompt = `${config.systemPrompt}\n\nUser Message: ${message}`;
        }

        let result;
        if (image) {
            // Basic base64 handling
            const base64Data = image.includes("base64,") ? image.split("base64,")[1] : image;
            const mimeType = image.split(";")[0].split(":")[1] || "image/jpeg";

            const imagePart = {
                inlineData: {
                    data: base64Data,
                    mimeType: mimeType
                }
            };
            result = await model.generateContent([finalPrompt, imagePart]);
        } else {
            result = await model.generateContent(finalPrompt);
        }

        const responseText = result.response.text();
        res.json({ text: responseText });

    } catch (error) {
        functions.logger.error("Chat Function Error", error);
        res.status(500).json({ error: "I cannot answer right now (" + error.message + ")" });
    }
});

/*
 * Contact Form Email Sender (Replaces FormSubmit.co)
 * Prevents spam by using authenticated Gmail account.
 */
exports.sendContactEmail = functions.https.onRequest(async (req, res) => {
    // CORS
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.status(204).send('');
        return;
    }

    try {
        const { name, email, phone, company, message, service } = req.body;

        if (!email || !message) {
            return res.status(400).json({ error: "Missing required fields." });
        }

        // --- HUBSPOT SYNC (Refactored) ---
        await syncContact({
            email: email,
            firstname: name.split(' ')[0],
            lastname: name.split(' ').slice(1).join(' ') || "",
            phone: phone,
            company: company,
            message: message,
            source: "Contact Form", // Explicit Source
            // Service passed as custom field or just appended to message
            message: `Service Interest: ${service || "General"}\n\n${message}`
        });

        // 1. Pick a Sender (Authenticated)
        if (SENDERS.length === 0) throw new Error("No configured senders.");
        const sender = SENDERS[0]; // Use the first one (Primary)
        const transporter = getTransporter(sender);

        // 2. Formatting
        const subject = `🚀 New Lead: ${name} - ${service || "General"}`;
        const htmlBody = `
            <h2>New Contact Form Submission</h2>
            <p><strong>Name:</strong> ${name}</p>
            <p><strong>Email:</strong> ${email}</p>
            <p><strong>Phone:</strong> ${phone || "N/A"}</p>
            <p><strong>Company:</strong> ${company || "N/A"}</p>
            <p><strong>Service:</strong> ${service || "General"}</p>
            <hr>
            <p><strong>Message:</strong></p>
            <p>${message.replace(/\n/g, '<br>')}</p>
        `;

        // 3. Send Email
        // TO: jegoalexdigital@gmail.com (User Request)
        // FROM: sender.email (Authenticated)
        // REPLY-TO: email (The Lead)
        await transporter.sendMail({
            from: `"JegoDigital Website" <${sender.email}>`,
            to: "jegoalexdigital@gmail.com",
            replyTo: email,
            subject: subject,
            html: htmlBody
        });

        functions.logger.info(`✅ Contact email sent from ${sender.email} to jegoalexdigital@gmail.com regarding ${email}`);
        res.json({ success: true, message: "Email sent successfully." });

    } catch (error) {
        functions.logger.error("Contact Email Error", error);
        res.status(500).json({ error: error.message });
    }
});

/*
 * Trigger 3: New Lead Automation
 * Listens for new docs in 'leads' collection
 * Sends Welcome Email + Admin Alert
 */
exports.onLeadCreated = functions.firestore.document('leads/{leadId}').onCreate(async (snap, context) => {
    const lead = snap.data();
    const email = lead.email;
    const name = lead.name || "Business Owner";

    // Validation (Relaxed: Email optional for phone calls, but required for emailing)
    if (!email && !lead.phone) {
        functions.logger.warn('New lead missing both email and phone, skipping automation.');
        return null;
    }

    // SKIP if sent via HTTP function (to avoid double sending)
    if (lead.via_function) {
        functions.logger.info("Skipping onLeadCreated because lead was processed via submitLead function.");
        return null;
    }

    // 1. Config Check
    if (SENDERS.length === 0) {
        functions.logger.warn("No senders configured via functions:config. Using dummy to prevent crash.");
        SENDERS.push({ email: "no-reply@jegodigital.com", pass: "dummy" });
    }
    const sender = SENDERS[0]; // Use primary sender
    const transporter = getTransporter(sender);

    // 2. User Notification (The Lead)
    const userMailOptions = {
        from: `"JegoDigital Strategy" <${sender.email}>`,
        to: email,
        subject: "Confirmado: Tu Roadmap 2026 está en proceso 🚀",
        html: `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Bienvenido a JegoDigital</title>
</head>
<body style="margin: 0; padding: 0; background-color: #0f172a; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;">
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #0f172a;">
        <tr>
            <td align="center" style="padding: 40px 10px;">
                <!-- Main Container -->
                <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" style="background-color: #1e293b; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06); border: 1px solid #334155;">
                    
                    <!-- Header with Logo -->
                    <tr>
                        <td align="center" style="padding: 40px 0; background: linear-gradient(to right, #1e293b, #0f172a);">
                            <!-- Text Logo -->
                            <h1 style="margin: 0; font-family: 'Segoe UI', sans-serif; font-size: 32px; font-weight: 800; letter-spacing: -1px; color: #ffffff;">
                                Jego<span style="color: #3b82f6;">Digital</span>
                            </h1>
                        </td>
                    </tr>

                    <!-- Content -->
                    <tr>
                        <td style="padding: 40px 40px 20px 40px;">
                            <h1 style="color: #ffffff; font-size: 24px; margin: 0 0 20px 0; font-weight: 600;">¡Solicitud Recibida, ${name}! 🚀</h1>
                            
                            <p style="color: #cbd5e1; font-size: 16px; line-height: 1.6; margin: 0 0 20px 0;">
                                Hemos recibido tu solicitud para el <strong>Plan de Crecimiento & Dominación de Mercado 2026</strong> en ${lead.location || "tu zona"}.
                            </p>
                            
                            <div style="background-color: #334155; border-left: 4px solid #3b82f6; padding: 15px; margin: 0 0 25px 0; border-radius: 4px;">
                                <p style="color: #e2e8f0; font-size: 14px; margin: 0;">
                                    <strong>Objetivo Detectado:</strong> ${lead.goal || "Crecimiento General"}
                                </p>
                            </div>

                            <p style="color: #cbd5e1; font-size: 16px; line-height: 1.6; margin: 0 0 30px 0;">
                                Uno de nuestros estrategas senior está analizando tu sitio web (${lead.website || "tu proyecto"}) ahora mismo. Te contactaremos en breve con tu Roadmap de Acción.
                            </p>
                            
                            <!-- Button -->
                            <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                                <tr>
                                    <td align="center">
                                        <a href="https://wa.me/529982023263" style="display: inline-block; padding: 14px 32px; background-color: #3b82f6; color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px; transition: background-color 0.3s ease;">Acelerar por WhatsApp &rarr;</a>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>

                    <!-- Footer -->
                    <tr>
                        <td style="padding: 30px 40px; background-color: #0f172a; border-top: 1px solid #334155;">
                            <p style="color: #64748b; font-size: 12px; text-align: center; margin: 0;">
                                &copy; 2026 JegoDigital. Premium Growth Systems.<br>
                                <a href="https://jegodigital.com" style="color: #3b82f6; text-decoration: none;">jegodigital.com</a>
                            </p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>
        `
    };

    // 3. Admin Notification (Alex)
    const adminMailOptions = {
        from: `"Jego System" <${sender.email}>`,
        to: "jegoalexdigital@gmail.com",
        subject: `🔥 NUEVO LEAD (${lead.location}): ${name}`,
        html: `
            <h2>Nuevo Lead de Accelerator Page</h2>
            <ul>
                <li><strong>Nombre:</strong> ${name}</li>
                <li><strong>Email:</strong> ${email}</li>
                <li><strong>WhatsApp:</strong> ${lead.phone || "N/A"}</li>
                <li><strong>Web:</strong> ${lead.website || "N/A"}</li>
                <li><strong>Ciudad:</strong> ${lead.location || "N/A"}</li>
                <li><strong>Objetivo:</strong> ${lead.goal}</li>
                <li><strong>Detalles:</strong> ${lead.other_details || "N/A"}</li>
            </ul>
            <p>El correo de confirmación ya fue enviado al usuario.</p>
        `
    };

    try {
        if (email) {
            functions.logger.info(`Attempting to send User Email to: ${email}`);
            await transporter.sendMail(userMailOptions);
            functions.logger.info(`✅ User confirmation sent to ${email}`);
        } else {
            functions.logger.info(`ℹ️ No user email provided, skipping confirmation email.`);
        }

        functions.logger.info(`Attempting to send Admin Email to: jegoalexdigital@gmail.com`);
        await transporter.sendMail(adminMailOptions);
        functions.logger.info(`✅ Admin alert sent to jegoalexdigital@gmail.com`);

        // --- VAPI.AI VOICE AGENT (AUTO-CALL) ---
        // Only auto-call if phone is provided and valid length
        if (lead.phone && lead.phone.length > 7) {
            try {
                // 0. Office Hours Check (9 AM - 8 PM Mexico City Time)
                // We use 'en-US' locale with Mexico_City timezone to parse the hour cleanly
                const nowMexico = new Date().toLocaleString("en-US", { timeZone: "America/Mexico_City" });
                const currentHour = new Date(nowMexico).getHours();
                const isWorkHours = currentHour >= 9 && currentHour < 20; // 9:00 to 19:59

                if (!isWorkHours) {
                    functions.logger.info(`🌙 Night Time Detected (${currentHour}:00). Queuing call for morning.`);
                    // Mark as queued in Firestore so Cron/Human can pick it up later
                    // (We can't easily schedule a future function purely from here without Tasks, 
                    // so we mark it 'PENDING_CALL_MORNING')
                    await snap.ref.update({
                        voice_status: "QUEUED_NIGHT",
                        voice_notes: `Skipped at ${currentHour}:00 (Office Hours 9-20)`
                    });
                    return { success: true, status: "queued_night" };
                }

                functions.logger.info(`📞 Initiating AI Voice Call to ${lead.phone}...`);

                // --- DUPLICATE CHECK (Safety Layer) ---
                // Prevent calling the same number twice within 24 hours
                const phoneClean = (lead.phone || "").replace(/\D/g, ""); // "52998..."
                // Strategy: Fetch ALL leads with this phone (cheap, usually <5) and filter in memory to avoid Index Errors.

                // Strategy: Fetch ALL leads with this phone (cheap, usually <5) and filter in memory to avoid Index Errors.
                const candidatesSnapshot = await admin.firestore().collection("leads")
                    .where("phone", "==", lead.phone)
                    .get();

                const cutoffTime = Date.now() - 86400000; // 24h ago
                let duplicateFound = false;

                candidatesSnapshot.forEach(doc => {
                    const data = doc.data();
                    if (data.voice_status === "CALLED" && doc.id !== snap.id) { // Don't block self
                        const leadTime = data.timestamp ? data.timestamp.toMillis() : 0;
                        if (leadTime > cutoffTime) {
                            duplicateFound = true;
                            functions.logger.warn(`   Found Recent Call Log: ${doc.id} (${new Date(leadTime).toISOString()})`);
                        }
                    }
                });

                if (duplicateFound) {
                    functions.logger.warn(`🛑 DUPLICATE BLOCKED: ${lead.phone} was already called in the last 24h.`);
                    await snap.ref.update({
                        voice_status: "BLOCKED_DUPLICATE",
                        voice_notes: "Already called in last 24h"
                    });
                    return { success: false, status: "duplicate_blocked" };
                }

                // 1. Language Detection
                let lang = lead.language || "es";
                if (lead.source && lead.source.toLowerCase().includes("english")) lang = "en";

                // 2. Natural Strategy Delay (8 Minutes) to simulate "Analysis Time"
                // Max timeout for Cloud Function is 540s (9 mins), so 480s (8 mins) is safe.
                // Filter: Only call leads from the Premium Web Design LP
                const validSources = ["Web Design Premium LP", "website_contact_form", "Swipe File 2025"];
                const currentSource = lead.source || "";

                if (validSources.some(s => currentSource.includes(s)) || lead.force_call) {

                    if (currentSource === "Web Design Premium LP") {
                        functions.logger.info(`⏳ Queuing AI Agent Call for 8 minutes (Analysis Simulation)...`);
                        await new Promise(resolve => setTimeout(resolve, 480000));
                    }

                    functions.logger.info(`📞 Initiating ElevenLabs Agent Call to ${lead.phone}...`);

                    // Sanitize phone (Standard E.164)
                    const phoneToCall = lead.phone.startsWith('+') ? lead.phone : `+52${lead.phone}`;

                    // ELEVENLABS API CALL
                    // const EL_API_KEY = functions.config().elevenlabs?.key || process.env.ELEVENLABS_API_KEY || "335ed6b73e0b9281175a6b360eab9cbc0765bae4d55a9d8b95010d8642b8d673";
                    const EL_API_KEY = process.env.ELEVENLABS_API_KEY || "335ed6b73e0b9281175a6b360eab9cbc0765bae4d55a9d8b95010d8642b8d673";
                    const AGENT_ID = "agent_8601kfa5gbxpefrrg73pnqzwf8s6";

                    // SMART NUMBER SELECTION
                    // Default to Mexico, but use US number if lead is +1
                    const US_NUMBER_ID = "phnum_2501kfa9jwrffpftyfrfaeag7fpf";
                    const MX_NUMBER_ID = "phnum_8701kfbrk0ksft1r0fx2fv79w5y9";

                    let PHONE_NUMBER_ID = MX_NUMBER_ID; // Default to Mexico
                    if (phoneToCall.startsWith('+1')) {
                        console.log("🇺🇸 US Lead detected. Switching to US Number.");
                        PHONE_NUMBER_ID = US_NUMBER_ID;
                    } else {
                        console.log("🇲🇽 Mexico/Intl Lead detected. Using MX Number.");
                    }

                    // --- OPTIMIZED SALES PERSONAS (PIPELINE 2.0) ---

                    // 1. THE SCHEDULER (For Direct Contact Inquiries)
                    // Source: 'website_contact_form' (contacto.html)
                    const PERSONA_SCHEDULER = `
                    You are Sarah, the Client Success Manager at JegoDigital.
                    Your Goal: Confirm the user's inquiry and book a 15-min discovery call.
                    CONTEXT: The user just filled out the "Contact Us" form on our website.
                    KEY SCRIPT:
                    1. Greeting: "Hi [Name], I received your message about [Service] on our site."
                    2. Verification: "I just want to confirm I have the right number. Is this [Name]?"
                    3. The Ask: "Perfect. I want to schedule your Strategy Session with our Director, Alex. Are you available tomorrow morning?"
                    4. Objection Handling: If they ask about price, say: "It depends on the scope, that's exactly what Alex will discuss with you."
                    TONE: Professional, efficient, helpful.
                    `;

                    // 2. THE CONSULTANT (For Lead Magnets / Swipe Files)
                    // Source: 'Swipe File 2025' (ejemplos-campanas-publicitarias.html)
                    const PERSONA_CONSULTANT = `
                    You are Sarah, a Strategist at JegoDigital.
                    Your Goal: Upgrade the user from "Freebie" to "Booked Call".
                    CONTEXT: The user downloaded our "2025 Ads Swipe File". They are likely a business owner or marketer.
                    KEY SCRIPT:
                    1. Greeting: "Hi [Name], I saw you downloaded our 2025 Ad Templates. Did you receive the PDF?"
                    2. The Pivot: "Great. I was checking your industry... are you looking to run these ads yourself, or were you looking for an agency to handle it?"
                    3. The Close: "We have a 'Done-For-You' program that installs these ads for you. I can show you how it works in 10 minutes. Can we chat tomorrow?"
                    TONE: Curious, helpful, authoritative.
                    `;

                    let systemPrompt = PERSONA_SCHEDULER; // Default safety
                    let language = "es";
                    let firstMessage = `Hola ${name || ""}, soy Sarah de JegoDigital. Recibí tu mensaje. ¿Tienes un minuto?`;

                    // --- SELECT PERSONA BASED ON SOURCE ---
                    // Note: 'lead.source' comes from the frontend logic we audited.
                    const source = (lead.source || "").toLowerCase();

                    if (source.includes("swipe") || source.includes("magnet") || source.includes("guide")) {
                        // LEAD MAGNET -> CONSULTANT
                        systemPrompt = PERSONA_CONSULTANT;
                        language = "es"; // Default to Spanish for Cancun market
                        firstMessage = `Hola ${name || ""}, soy Sarah de JegoDigital. Vi que descargaste nuestra Guía de Anuncios. ¿Te llegó bien al correo?`;

                        // English Override if source implies english
                        if (source.includes("english") || lead.language === "en") {
                            language = "en";
                            firstMessage = `Hi ${name || "there"}, this is Sarah from JegoDigital. I saw you grabbed our Ads Guide. Did you get the email?`;
                        }

                    } else if (source.includes("contact") || source.includes("contacto")) {
                        // CONTACT FORM -> SCHEDULER
                        systemPrompt = PERSONA_SCHEDULER;
                        language = "es";
                        firstMessage = `Hola ${name || ""}, soy Sarah de JegoDigital. Recibí tu mensaje sobre "${lead.service || "tus servicios"}". ¿Tienes un momento para agendar?`;

                        if (lead.language === "en") {
                            language = "en";
                            firstMessage = `Hi ${name || "there"}, this is Sarah from JegoDigital. I got your message about "${lead.service || "services"}". Do you have a minute?`;
                        }
                    }

                    // --- DYNAMIC INJECTION (The Fix) ---
                    // Replace placeholders [Name] and [Service] with actual data
                    const serviceName = lead.service || "tus servicios";
                    const userName = name || "Hola";

                    systemPrompt = systemPrompt
                        .replace(/\[Name\]/g, userName)
                        .replace(/\[Service\]/g, serviceName);

                    try {
                        const elResponse = await axios.post("https://api.elevenlabs.io/v1/convai/twilio/outbound-call", {
                            agent_id: AGENT_ID,
                            to_number: phoneToCall,
                            agent_phone_number_id: PHONE_NUMBER_ID,
                            conversation_config_override: {
                                agent: {
                                    language: language,
                                    first_message: firstMessage,
                                    prompt: { prompt: systemPrompt } // <--- INJECTED
                                },
                                conversation: {
                                    max_duration_seconds: 180,
                                    client_inactivity_timeout_seconds: 30,
                                    analysis: {
                                        post_call_webhook_url: "https://us-central1-jegodigital-e02fb.cloudfunctions.net/handleCallAnalysis",
                                        post_call_webhook_data: { "source": "firebase_auto" }
                                    }
                                }
                            }
                        }, {
                            headers: {
                                "xi-api-key": EL_API_KEY,
                                "Content-Type": "application/json"
                            }
                        });

                        functions.logger.info(`✅ ElevenLabs Call Initiated! ID: ${elResponse.data.conversation_id} (Lang: ${language})`);

                        // Update Firestore status
                        await snap.ref.update({
                            voice_status: "CALLED",
                            voice_provider: "ElevenLabs",
                            call_id: elResponse.data.conversation_id || "N/A",
                            language: language
                        });

                    } catch (elError) {
                        functions.logger.error("❌ ElevenLabs Call Failed:", elError.response?.data || elError.message);
                    }
                } else {
                    functions.logger.info(`ℹ️ Skipping Voice Call: Source '${lead.source}' not eligible.`);
                }

            } catch (err) {
                functions.logger.error("Error in Call Logic:", err);
            }
        } else {
            functions.logger.info("ℹ️ Skipping Voice Call: No valid phone number.");
        }

        return { success: true };
    } catch (error) {
        functions.logger.error("Error sending confirmation email:", error);
        return null;
    }
});

// --- LIVE AUTOMATION (Phase 10) ---
const { getCompetitorData, getRankData, getBacklinkData } = require('./services/seoService');
const { sendEmail } = require('./services/emailService');

exports.getCompetitorSpy = functions.https.onCall(async (data, context) => {
    // Auth Check
    if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'Login required');
    return await getCompetitorData(data.domain || "jegodigital.com");
});

exports.getRankRadar = functions.https.onCall(async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'Login required');
    return await getRankData(data.domain || "jegodigital.com");
});

exports.getBacklinkHunter = functions.https.onCall(async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'Login required');
    return await getBacklinkData(data.domain || "jegodigital.com");
});

exports.sendLiveEmail = functions.https.onCall(async (data, context) => {
    // Auth Check
    if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'Login required');
    return await sendEmail(data.to, data.subject, data.body);
});

// --- VOICE AGENT API (Dashboard Hook) ---
exports.voiceAgentCall = functions.https.onRequest(async (req, res) => {
    // CORS
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
        res.status(204).send('');
        return;
    }

    // GET = History (Deprecated in favor of real-time leads, but kept for legacy compat)
    if (req.method === 'GET') {
        res.json([]); // Return empty to force usage of leads collection
        return;
    }

    const { phone, name, goal } = req.body;
    if (!phone) return res.status(400).json({ error: "Phone required" });

    try {
        const db = admin.firestore();

        // 1. Create a Lead Doc to track this call (so Webhook can update it)
        const leadRef = db.collection('leads').doc(); // Auto-ID
        const leadData = {
            name: name || "Manual Dial",
            phone: phone, // e.g. +52...
            goal: goal || "Manual Conversation",
            source: "Dashboard Manual Trigger",
            voice_status: "INITIATING",
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
            createdAt: admin.firestore.FieldValue.serverTimestamp()
        };
        await leadRef.set(leadData);

        // 2. Prepare ElevenLabs Call
        // Re-using config from onLeadCreated
        const EL_API_KEY = functions.config().elevenlabs?.key || process.env.ELEVENLABS_API_KEY || "335ed6b73e0b9281175a6b360eab9cbc0765bae4d55a9d8b95010d8642b8d673";
        const AGENT_ID = "agent_8601kfa5gbxpefrrg73pnqzwf8s6";

        // Smart Number Logic
        const US_NUMBER_ID = "phnum_2501kfa9jwrffpftyfrfaeag7fpf";
        const MX_NUMBER_ID = "phnum_8701kfbrk0ksft1r0fx2fv79w5y9";

        const phoneToCall = phone.startsWith('+') ? phone : `+52${phone}`; // Assume MX if no code, or handled by UI

        let PHONE_NUMBER_ID = MX_NUMBER_ID;
        let language = "es";
        let firstMessage = `Hola ${name || ""}, soy Sarah de JegoDigital. Te llamo sobre "${goal || "tu proyecto digital"}". ¿Tienes un momento?`;

        if (phoneToCall.startsWith('+1') || req.body.country === 'US') {
            PHONE_NUMBER_ID = US_NUMBER_ID;
            language = "en";
            firstMessage = `Hi ${name || "there"}, this is Sarah from the JegoDigital engineering team. I have your application for the Growth Infrastructure audit here. Just need to verify a few technical details before I pass this to the senior architect. Do you have a moment?`;
        }

        // 3. Call ElevenLabs API
        const elResponse = await axios.post("https://api.elevenlabs.io/v1/convai/twilio/outbound-call", {
            agent_id: AGENT_ID,
            to_number: phoneToCall,
            agent_phone_number_id: PHONE_NUMBER_ID,
            conversation_config_override: {
                agent: {
                    language: language,
                    first_message: firstMessage
                },
                conversation: {
                    max_duration_seconds: 180, // 3 Minutes Hard Limit (Prevent Zombie Calls)
                    client_inactivity_timeout_seconds: 30 // Hangup if user silent for 30s
                }
            }
        }, {
            headers: {
                "xi-api-key": EL_API_KEY,
                "Content-Type": "application/json"
            }
        });

        const conversationId = elResponse.data.conversation_id;
        functions.logger.info(`✅ Manual ElevenLabs Call Initiated: ${conversationId}`);

        // 4. Update Lead with Call ID
        await leadRef.update({
            voice_status: "CALLED", // This will show green in dashboard
            call_id: conversationId,
            voice_provider: "ElevenLabs"
        });

        res.json({ success: true, conversation_id: conversationId, lead_id: leadRef.id });

    } catch (error) {
        functions.logger.error("Manual Voice Call Error", error.response?.data || error.message);
        res.status(500).json({ error: error.message });
    }
});

/*
 * ElevenLabs Webhook
 * Captures Post-Call Analysis and Transcript
 */
exports.elevenLabsWebhook = functions.https.onRequest(async (req, res) => {
    try {
        const data = req.body;
        functions.logger.info("🎤 ElevenLabs Webhook Received:", JSON.stringify(data));

        // Essential Data
        const conversationId = data.conversation_id;
        const status = data.status || "completed"; // "completed"
        const analysis = data.analysis; // { summary, success_evaluation, structured_data }
        const transcript = data.transcript; // Array of objects

        if (!conversationId) {
            functions.logger.warn("⚠️ Webhook received without conversation_id. Returning 200 to prevent auto-disable.");
            return res.status(200).send("Event ignored (No conversation_id)");
        }

        // Find the Lead with this Call ID
        const db = admin.firestore();
        const leadsRef = db.collection('leads');
        const snapshot = await leadsRef.where('call_id', '==', conversationId).limit(1).get();

        // ---- Outcome classifier (used by both leads + call_analysis writes) ----
        //
        // coldCallReport reads call_analysis.outcome to classify positive/negative/
        // neutral/unconnected. Before 2026-04-20 the webhook only wrote to the
        // `leads` collection which meant coldCallReport saw every call as "pending".
        // This block classifies ElevenLabs's `success_evaluation` + summary into
        // the shape coldCallReport expects.
        const evalRaw = (analysis?.success_evaluation || "").toString().toLowerCase();
        const summaryRaw = (analysis?.transcript_summary || analysis?.summary || "").toString().toLowerCase();
        const statusLc = (status || "").toString().toLowerCase();

        let classifiedOutcome = "neutral";
        if (statusLc.includes("failed") || statusLc.includes("no_answer") || statusLc.includes("busy") ||
            statusLc.includes("voicemail") || statusLc.includes("disconnected")) {
            classifiedOutcome = "unconnected";
        } else if (evalRaw === "yes" || evalRaw.includes("success") || evalRaw.includes("positive") ||
            evalRaw.includes("interested") ||
            /interesad[oa]|quiere|agendar|audit|enviar|mándame|mandame|adelante|claro que sí/i.test(summaryRaw)) {
            classifiedOutcome = "positive";
        } else if (evalRaw === "no" || evalRaw.includes("fail") || evalRaw.includes("negative") ||
            evalRaw.includes("not_interested") || evalRaw.includes("rejected") ||
            /no gracias|no me interesa|no llamen|remueva|borra|quítame/i.test(summaryRaw)) {
            classifiedOutcome = "negative";
        }

        // Always mirror into call_analysis/{conversationId} — coldCallReport depends on this
        try {
            await db.collection('call_analysis').doc(conversationId).set({
                conversation_id: conversationId,
                outcome: classifiedOutcome,
                call_status: status || null,
                success_evaluation: analysis?.success_evaluation || null,
                summary: analysis?.transcript_summary || analysis?.summary || null,
                duration_seconds: data.duration_seconds || 0,
                recording_url: data.recording_url || null,
                structured_data: analysis?.structured_data || null,
                transcript: transcript ? transcript.map(t => ({
                    role: t.role, message: t.message, time: t.time_in_call_secs
                })) : null,
                updated_at: admin.firestore.FieldValue.serverTimestamp(),
            }, { merge: true });
            functions.logger.info(`✅ call_analysis/${conversationId} updated — outcome=${classifiedOutcome}`);
        } catch (err) {
            functions.logger.error(`call_analysis write failed for ${conversationId}:`, err.message);
        }

        if (snapshot.empty) {
            functions.logger.warn(`⚠️ Lead not found for Call ID: ${conversationId}. call_analysis still updated.`);
            return res.status(200).send("Lead not found, call_analysis updated");
        }

        const leadDoc = snapshot.docs[0];
        const updateData = {
            voice_status: status === 'completed' ? 'CALLED-SUCCESS' : 'CALLED-FAILED',
            call_duration: data.duration_seconds || 0,
            voice_end_at: admin.firestore.FieldValue.serverTimestamp(),
            call_outcome: classifiedOutcome,
        };

        // Add Analysis if available
        if (analysis) {
            updateData.call_summary = analysis.transcript_summary || analysis.summary || "No summary provided.";
            updateData.call_evaluation = analysis.success_evaluation || "Unknown";
        }

        // Add Transcript if available
        if (transcript) {
            updateData.call_transcript = transcript.map(t => ({
                role: t.role, // 'agent' or 'user'
                message: t.message,
                time: t.time_in_call_secs
            }));
        }

        // Add Recording URL if available
        if (data.recording_url) {
            updateData.call_recording = data.recording_url;
        }

        await leadDoc.ref.update(updateData);
        functions.logger.info(`✅ Updated Lead ${leadDoc.id} with Call Data.`);

        res.json({ success: true, outcome: classifiedOutcome });

    } catch (error) {
        functions.logger.error("ElevenLabs Webhook Error", error);
        res.status(500).json({ error: error.message });
    }
});

/*
 * Twilio Webhook
 * Tracks raw telephony status (Ringing, Busy, Failed)
 */
exports.twilioWebhook = functions.https.onRequest(async (req, res) => {
    try {
        const data = req.body;
        functions.logger.info("📞 Twilio Webhook Received:", JSON.stringify(data));

        // Twilio Data: CallSid, CallStatus, To, From
        const callSid = data.CallSid;
        const callStatus = data.CallStatus; // queued, ringing, in-progress, completed, busy, failed, no-answer

        if (!callSid) return res.status(200).send("OK"); // Respond OK to keep Twilio happy

        // We might not have the Lead by CallSid yet if ElevenLabs initiated it internally
        // But for Manual Calls via our API, we might be able to match via Phone Number if needed
        // Ideally, we'd store the CallSid, but ElevenLabs abstracts this?
        // Actually, ElevenLabs returns conversation_id, NOT CallSid immediately.

        // Strategy: Match by Phone Number (Last 2 minutes) if CallSid not found
        // This is "best effort" tracking

        res.status(200).send("Event Received");

    } catch (error) {
        functions.logger.error("Twilio Webhook Error", error);
        res.status(500).send("Error");
    }
});

/*
 * HTTP Lead Submission (Bypasses Firestore Rules)
 * Used when client-side SDK faces permission issues.
 */
exports.submitLead = functions.https.onRequest(async (req, res) => {
    // CORS
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.status(204).send('');
        return;
    }

    try {
        const leadData = req.body;

        // Basic Validation
        if (!leadData.name || (!leadData.email && !leadData.phone)) {
            return res.status(400).json({ error: "Missing required fields (name and either email or phone)" });
        }

        // Add Server-Side Metadata
        const finalData = {
            ...leadData,
            source: leadData.source || "HTTP Submission",
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            via_function: true
        };

        // Write to Firestore (Admin SDK bypasses rules)
        const db = admin.firestore();
        const docRef = await db.collection("leads").add(finalData);

        // --- HUBSPOT SYNC (Refactored) ---
        await syncContact({
            email: finalData.email,
            firstname: finalData.name.split(' ')[0],
            lastname: finalData.name.split(' ').slice(1).join(' ') || "",
            phone: finalData.phone,
            company: finalData.company || finalData.businessName,
            website: finalData.website,
            location: finalData.location,
            source: finalData.source || "HTTP Submission",
            message: `Source URL: ${finalData.source_url}\n\nDetails: ${finalData.other_details || finalData.goal}`
        });

        // --- EMAIL LOGIC (Direct Send) ---
        try {
            functions.logger.info(`📧 Debug: Entering Email Block. Senders Configured: ${SENDERS.length}`);

            if (SENDERS.length > 0) {
                const sender = SENDERS[0];
                const transporter = getTransporter(sender);
                const email = finalData.email;
                const name = finalData.name || "Business Owner";

                functions.logger.info(`📧 Debug: Processing email for ${email}. Source: ${finalData.source}`);

                if (email) {
                    // Determine Template based on Source
                    const isWebDesign = (finalData.source || "").toLowerCase().includes("web") || (finalData.source || "").toLowerCase().includes("design");

                    const subject = isWebDesign
                        ? "Confirmado: Tu Propuesta VIP está en proceso 💎"
                        : "Confirmado: Tu Roadmap 2026 está en proceso 🚀";

                    const htmlContent = isWebDesign ? `
                        <h1 style="color: #ffffff; font-size: 24px; margin: 0 0 20px 0; font-weight: 600;">¡Propuesta Solicitada, ${name}! 💎</h1>
                        <p style="color: #cbd5e1; font-size: 16px; line-height: 1.6; margin: 0 0 20px 0;">
                            Hemos recibido los detalles de tu proyecto para <strong>${finalData.company || "tu empresa"}</strong>.
                        </p>
                        <div style="background-color: #334155; border-left: 4px solid #3b82f6; padding: 15px; margin: 0 0 25px 0; border-radius: 4px;">
                            <p style="color: #e2e8f0; font-size: 14px; margin: 0;">
                                <strong>Siguiente Paso:</strong> Un Consultor Senior está preparando tu Propuesta Técnica y Visual.
                            </p>
                        </div>
                        <p style="color: #cbd5e1; font-size: 16px; line-height: 1.6; margin: 0 0 30px 0;">
                            Te la enviaremos a este correo en menos de 24 horas.
                        </p>
                        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                            <tr>
                                <td align="center">
                                    <a href="https://wa.me/529982023263" style="display: inline-block; padding: 14px 32px; background-color: #3b82f6; color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px; transition: background-color 0.3s ease;">Hablar con un Experto &rarr;</a>
                                </td>
                            </tr>
                        </table>
                    ` : `
                        <h1 style="color: #ffffff; font-size: 24px; margin: 0 0 20px 0; font-weight: 600;">¡Solicitud Recibida, ${name}! 🚀</h1>
                        <p style="color: #cbd5e1; font-size: 16px; line-height: 1.6; margin: 0 0 20px 0;">
                            Hemos recibido tu solicitud para el <strong>Plan de Crecimiento 2026</strong>.
                        </p>
                        <div style="background-color: #334155; border-left: 4px solid #3b82f6; padding: 15px; margin: 0 0 25px 0; border-radius: 4px;">
                            <p style="color: #e2e8f0; font-size: 14px; margin: 0;">
                                <strong>Estado:</strong> Analizando sitio web...
                            </p>
                        </div>
                        <p style="color: #cbd5e1; font-size: 16px; line-height: 1.6; margin: 0 0 30px 0;">
                            Uno de nuestros estrategas senior revisará tu caso y te contactará por WhatsApp en breve.
                        </p>
                        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                            <tr>
                                <td align="center">
                                    <a href="https://wa.me/529982023263" style="display: inline-block; padding: 14px 32px; background-color: #3b82f6; color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px; transition: background-color 0.3s ease;">Contactar por WhatsApp &rarr;</a>
                                </td>
                            </tr>
                        </table>
                    `;

                    // 1. User Confirmation
                    functions.logger.info(`Attempting to send User Email to: ${email}`);
                    await transporter.sendMail({
                        from: `"JegoDigital Strategy" <${sender.email}>`,
                        to: email,
                        subject: subject,
                        html: `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Bienvenido a JegoDigital</title>
</head>
<body style="margin: 0; padding: 0; background-color: #0f172a; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;">
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #0f172a;">
        <tr>
            <td align="center" style="padding: 40px 10px;">
                <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" style="background-color: #1e293b; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06); border: 1px solid #334155;">
                    <tr>
                        <td align="center" style="padding: 40px 0; background: linear-gradient(to right, #1e293b, #0f172a);">
                            <h1 style="margin: 0; font-family: 'Segoe UI', sans-serif; font-size: 32px; font-weight: 800; letter-spacing: -1px; color: #ffffff;">
                                Jego<span style="color: #3b82f6;">Digital</span>
                            </h1>
                        </td>
                    </tr>
                    <tr>
                        <td style="padding: 40px 40px 20px 40px;">
                            ${htmlContent}
                        </td>
                    </tr>
                    <tr>
                        <td style="padding: 30px 40px; background-color: #0f172a; border-top: 1px solid #334155;">
                            <p style="color: #64748b; font-size: 12px; text-align: center; margin: 0;">
                                &copy; 2026 JegoDigital. Cancun, Quintana Roo.<br>
                                Expertos en SEO Local & Marketing Digital.
                            </p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>
                        `
                    });
                    functions.logger.info(`✅ User confirmation sent to ${email}`);
                }

                // 2. Admin Alert (ALWAYS SEND)
                let adminSubject = `🔥 NUEVO LEAD (${finalData.source || "Web"}): ${name}`;
                let adminHtml = `
                        <h2>Nuevo Lead Recibido</h2>
                        <ul>
                            <li><strong>Nombre:</strong> ${name}</li>
                            <li><strong>Email:</strong> ${email || "N/A"}</li>
                            <li><strong>WhatsApp:</strong> ${finalData.phone || "N/A"}</li>
                            <li><strong>Web:</strong> ${finalData.website || "N/A"}</li>
                            <li><strong>Source:</strong> ${finalData.source}</li>
                            <li><strong>Goal:</strong> ${finalData.goal || "N/A"}</li>
                        </ul>
                    `;

                // --- REAL ESTATE SPECIALIZATION ---
                const isRealEstate = (finalData.source || "").toLowerCase().includes("estate") || (finalData.source || "").toLowerCase().includes("inmobiliario");
                // --- DENTAL SPECIALIZATION ---
                const isDental = (finalData.source || "").toLowerCase().includes("dental");

                if (isDental) {
                    adminSubject = `🦷 DENTAL LEAD: ${finalData.company || "Clínica"} (${name})`;
                    adminHtml = `
                        <div style="font-family: Arial, sans-serif; padding: 20px; border: 1px solid #ddd; background-color: #f0f9ff;">
                            <h2 style="color: #0ea5e9; margin-top: 0;">🦷 Nuevo Lead Dental</h2>
                            <p style="font-size: 16px;"><strong>Fuente:</strong> ${finalData.source}</p>
                            
                            <div style="background-color: white; padding: 15px; border-left: 5px solid #0ea5e9; margin: 20px 0;">
                                <h3 style="margin-top: 0;">Datos del Doctor/Clínica</h3>
                                <ul style="list-style: none; padding: 0;">
                                    <li style="margin-bottom: 10px;">👤 <strong>Nombre:</strong> ${name}</li>
                                    <li style="margin-bottom: 10px;">🏥 <strong>Clínica:</strong> ${finalData.company || "N/A"}</li>
                                    <li style="margin-bottom: 10px;">📱 <strong>WhatsApp:</strong> <a href="https://wa.me/${(finalData.phone || "").replace(/[^0-9]/g, '')}">${finalData.phone}</a></li>
                                    <li style="margin-bottom: 10px;">📧 <strong>Email:</strong> ${email}</li>
                                </ul>
                            </div>

                            <div style="background-color: #e0f2fe; padding: 15px; border: 1px solid #bae6fd;">
                                <h3 style="margin-top: 0; color: #0284c7;">🎯 Objetivo / Meta</h3>
                                <p style="font-size: 18px; font-weight: bold;">${finalData.goal || "N/A"}</p>
                            </div>
                            
                            <p style="font-size: 12px; color: #666; margin-top: 30px;">
                                Sistema JegoMedical v1.0
                            </p>
                        </div>
                    `;

                    // Dental User Confirmation Email
                    const dentalUserHtml = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
</head>
<body style="margin: 0; padding: 0; background-color: #0f172a; font-family: 'Segoe UI', sans-serif;">
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #0f172a;">
        <tr>
            <td align="center" style="padding: 40px 10px;">
                <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" style="background-color: #1e293b; border-radius: 16px; overflow: hidden; border: 1px solid #334155;">
                    <tr>
                        <td align="center" style="padding: 40px 0; background: linear-gradient(to right, #0c4a6e, #0e7490);">
                            <h1 style="color: #ffffff; font-size: 28px; margin: 0;">Jego<span style="color: #38bdf8;">Medical</span></h1>
                        </td>
                    </tr>
                    <tr>
                        <td style="padding: 40px;">
                            <h2 style="color: #fff; margin-top: 0;">¡Auditoría Confirmada, Dr. ${name.split(' ')[0]}!</h2>
                            <p style="color: #cbd5e1; line-height: 1.6;">Hemos recibido su solicitud para la clínica <strong>${finalData.company}</strong>.</p>
                            
                            <div style="background-color: #334155; padding: 20px; border-radius: 8px; margin: 25px 0; border-left: 4px solid #38bdf8;">
                                <p style="color: #e2e8f0; margin: 0;"><strong>Objetivo:</strong> ${finalData.goal}</p>
                                <p style="color: #94a3b8; font-size: 14px; margin-top: 5px;">Analizando mercado local...</p>
                            </div>

                            <p style="color: #cbd5e1; line-height: 1.6;">Nuestro equipo de Turismo Médico lo contactará en breve.</p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>
                    `;

                    functions.logger.info(`Sending Dental Confirmation to ${email}`);
                    await transporter.sendMail({
                        from: `"JegoMedical System" <${sender.email}>`,
                        to: email,
                        subject: "Confirmado: Análisis de Mercado Dental 🦷",
                        html: dentalUserHtml
                    });
                } else if (isRealEstate) {
                    adminSubject = `🏠 REAL ESTATE LEAD: ${finalData.development || "Nuevo Proyecto"} (${name})`;
                    adminHtml = `
                        <div style="font-family: Arial, sans-serif; padding: 20px; border: 1px solid #ddd; background-color: #f9f9f9;">
                            <h2 style="color: #d4af37; margin-top: 0;">🏠 Nuevo Lead Inmobiliario</h2>
                            <p style="font-size: 16px;"><strong>Fuente:</strong> ${finalData.source}</p>
                            
                            <div style="background-color: white; padding: 15px; border-left: 5px solid #d4af37; margin: 20px 0;">
                                <h3 style="margin-top: 0;">Datos del Desarrollador</h3>
                                <ul style="list-style: none; padding: 0;">
                                    <li style="margin-bottom: 10px;">👤 <strong>Nombre:</strong> ${name}</li>
                                    <li style="margin-bottom: 10px;">📱 <strong>WhatsApp:</strong> <a href="https://wa.me/${(finalData.phone || "").replace(/[^0-9]/g, '')}">${finalData.phone}</a></li>
                                    <li style="margin-bottom: 10px;">📧 <strong>Email:</strong> ${email}</li>
                                </ul>
                            </div>

                            <div style="background-color: #fff8e1; padding: 15px; border: 1px solid #ffe082;">
                                <h3 style="margin-top: 0; color: #b78a02;">🏢 Proyecto / Interés</h3>
                                <ul style="list-style: none; padding: 0;">
                                    <li style="margin-bottom: 10px;"><strong>Desarrollo:</strong> ${finalData.development || "N/A"}</li>
                                    <li style="margin-bottom: 10px;"><strong>Unidades / Etapa:</strong> ${finalData.units || "N/A"}</li>
                                </ul>
                            </div>
                            
                            <p style="font-size: 12px; color: #666; margin-top: 30px;">
                                Este lead fue capturado y calificado automáticamente por el sistema JegoEstate v1.0
                            </p>
                        </div>
                    `;
                }

                await transporter.sendMail({
                    from: `"Jego System" <${sender.email}>`,
                    to: "jegoalexdigital@gmail.com",
                    subject: adminSubject,
                    html: adminHtml
                });
                functions.logger.info(`✅ Admin alert sent for lead ${docRef.id}`);
            } else {
                functions.logger.warn("No senders configured, skipping email.");
            }
        } catch (emailErr) {
            functions.logger.error("Email send failed in submitLead (non-blocking)", emailErr);
        }

        functions.logger.info(`✅ Lead submitted via HTTP: ${docRef.id}`);
        res.json({ success: true, id: docRef.id });
    } catch (error) {
        functions.logger.error("submitLead Error", error);
        res.status(500).json({ error: error.message });
    }
});

// --- BILLING / STRIPE ---
const stripe = require('stripe')(functions.config().stripe?.secret || 'sk_test_placeholder');

exports.createStripeCheckout = functions.https.onCall(async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'Login required');

    const { planId, planName, amount } = data; // amount in cents

    try {
        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            line_items: [{
                price_data: {
                    currency: 'usd',
                    product_data: {
                        name: planName,
                        description: `Monthly Retainer for ${planName}`,
                    },
                    unit_amount: amount,
                },
                quantity: 1,
            }],
            mode: 'payment',
            success_url: 'https://jegodigital.com/dashboard?payment_success=true',
            cancel_url: 'https://jegodigital.com/dashboard?payment_cancel=true',
        });

        return { url: session.url, id: session.id };
    } catch (error) {
        functions.logger.error("Stripe Checkout Error:", error);
        // Mock Fallback
        console.warn("Using Mock Stripe Link (Auth Failed)");
        return { url: `https://buy.stripe.com/test_mock_${planId}`, id: 'mock_session' };
    }
});

// Helper to sync manual calls (Temporary)
exports.syncManualCall = functions.https.onRequest(async (req, res) => {
    // Enable CORS for testing
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.status(204).send('');
        return;
    }

    try {
        const { phone, conversation_id, summary, transcript } = req.body;

        if (!phone || !conversation_id) {
            res.status(400).send("Missing phone or conversation_id");
            return;
        }

        const leadsRef = admin.firestore().collection('leads');
        const snapshot = await leadsRef.where('phone', '==', phone).get();

        if (snapshot.empty) {
            await leadsRef.add({
                phone,
                voice_status: "CALLED-SUCCESS",
                call_id: conversation_id,
                call_summary: summary || "",
                call_transcript: transcript || [],
                source: "Manual Test Call",
                name: "Test User",
                status: "New",
                timestamp: new Date().toISOString(),
                createdAt: admin.firestore.FieldValue.serverTimestamp()
            });
            res.send("Created New Lead with Call Data");
        } else {
            await snapshot.docs[0].ref.update({
                voice_status: "CALLED-SUCCESS",
                call_id: conversation_id,
                call_summary: summary || "",
                call_transcript: transcript || [],
                last_call_synced: admin.firestore.FieldValue.serverTimestamp()
            });
            res.send("Updated Lead with Call Data");
        }
    } catch (e) {
        console.error(e);
        res.status(500).send(e.message);
    }
});

/**
 * ElevenLabs Post-Call Webhook
 * Triggered when calculations/analysis are done.
 * GOAL: Check if appointment was booked -> Email Alex.
 */
exports.handleCallAnalysis = functions.https.onRequest(async (req, res) => {
    // 1. Parse ElevenLabs Payload
    const data = req.body;
    // Structure: { conversation_id, analysis: { transcript_summary, evaluation: { success } } }

    const analysis = data.analysis || {};
    const summary = analysis.transcript_summary || "No summary provided.";
    const conversationId = data.conversation_id;
    // const callSuccess = analysis.success_evaluation; // Sometimes undefined

    console.log(`📡 Webhook Received for Call ${conversationId}`);

    // 2. Detect Booking Intent using basic NLP (Keyword Matching)
    const keywords = ["appointment", "booked", "scheduled", "tomorrow", "calendar", "agendada", "meeting", "cita", "lunes", "martes", "miercoles", "jueves", "viernes", "monday", "tuesday", "wednesday", "thursday", "friday"];
    const isBooked = keywords.some(k => summary.toLowerCase().includes(k));

    if (isBooked) {
        console.log("✅ Booking Detected! Sending Email Notification...");

        // 3. Send Email to Alex
        try {
            const transporter = nodemailer.createTransport({
                service: "gmail",
                auth: {
                    user: "jegoalexdigital@gmail.com",
                    pass: process.env.EMAIL_PASS || functions.config().email?.pass || "tvlq yqjx cxnw wqzh" // Fallback to assumed app password if env missing
                }
            });

            const mailOptions = {
                from: "AI Agent <no-reply@jegodigital.com>",
                to: "jegoalexdigital@gmail.com",
                subject: `📅 NEW APPOINTMENT: AI Successfully Booked a Call!`,
                html: `
                    <h2>🚀 AI Agent Success Notification</h2>
                    <p><strong>Result:</strong> Start Preparing! A call was likely scheduled.</p>
                    <hr>
                    <h3>📝 Call Summary:</h3>
                    <p style="background: #f4f4f4; padding: 15px; border-radius: 5px;">${summary}</p>
                    <hr>
                    <p><strong>Conversation ID:</strong> ${conversationId}</p>
                    <p><em>Check the ElevenLabs Dashboard for the full recording.</em></p>
                `
            };

            await transporter.sendMail(mailOptions);
            console.log("📧 Notification Email Sent.");

        } catch (emailErr) {
            console.error("❌ Failed to send booking email:", emailErr);
        }
    } else {
        console.log("ℹ️ No booking detected in summary. Skipping email.");
    }

    // 4. Update Firestore for good measure
    try {
        const snapshot = await admin.firestore().collection('leads').where('call_id', '==', conversationId).get();
        if (!snapshot.empty) {
            await snapshot.docs[0].ref.update({
                voice_status: isBooked ? "BOOKED" : "COMPLETED",
                call_summary: summary,
                call_analysis: analysis
            });
        }
    } catch (dbErr) {
        console.error("⚠️ Firestore update failed in webhook:", dbErr);
    }

    res.json({ status: "processed" });
});

/*
 * sendCalendlyLink
 * Trigger: Webhook from ElevenLabs Sofia agent during a cold call
 * Purpose: Sends the Calendly booking link to the lead via BOTH SMS (Twilio) and email (Brevo)
 *          after Sofia confirms the lead's details and they agree to schedule.
 *
 * Expected POST body (from ElevenLabs tool):
 *   {
 *     "lead_name":    "Juan Pérez",
 *     "lead_email":   "juan@inmobiliariaX.mx",
 *     "lead_phone":   "+529981234567",
 *     "company_name": "Inmobiliaria X"
 *   }
 *
 * Required environment variables (set in functions/.env):
 *   TWILIO_ACCOUNT_SID
 *   TWILIO_AUTH_TOKEN
 *   TWILIO_FROM         (the Mexican number Sofia called from, e.g. +525512345678)
 *   BREVO_API_KEY       (already present)
 *   BREVO_SENDER_EMAIL  (e.g. alex@jegodigital.com — must be a verified Brevo sender)
 *   BREVO_SENDER_NAME   (optional, defaults to "Alex Jego — JegoDigital")
 */
exports.sendCalendlyLink = functions.https.onRequest(async (req, res) => {
    // CORS (ElevenLabs doesn't need CORS, but harmless for manual curl tests)
    res.set("Access-Control-Allow-Origin", "*");
    res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.set("Access-Control-Allow-Headers", "Content-Type");
    if (req.method === "OPTIONS") return res.status(204).send("");
    if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

    const CALENDLY_URL = "https://calendly.com/jegoalexdigital/30min";

    try {
        const {
            lead_name,
            lead_email,
            lead_phone,
            company_name,
            pain_points,
            services_mentioned,
            urgency,
            notes,
        } = req.body || {};

        if (!lead_phone || !lead_email) {
            return res.status(400).json({
                error: "Missing required fields",
                need: ["lead_name", "lead_email", "lead_phone", "company_name"],
                got: req.body,
            });
        }

        const name = (lead_name || "").trim() || "estimado";
        const company = (company_name || "").trim() || "tu inmobiliaria";
        const painSummary = (pain_points || "").trim() || "(Sofía no capturó pain points — revisa el transcript)";
        const services = (services_mentioned || "").trim() || "(no identificados)";
        const urgencyTag = (urgency || "").trim().toLowerCase() || "desconocida";
        const extraNotes = (notes || "").trim() || "(sin notas adicionales)";

        // --- Credentials ---
        const TW_SID = process.env.TWILIO_ACCOUNT_SID;
        const TW_TOKEN = process.env.TWILIO_AUTH_TOKEN;
        const TW_FROM = process.env.TWILIO_FROM;
        const BREVO_KEY = process.env.BREVO_API_KEY;
        const BREVO_SENDER_EMAIL = process.env.BREVO_SENDER_EMAIL || "info@jegodigital.com";
        const BREVO_SENDER_NAME = process.env.BREVO_SENDER_NAME || "Alex Jego";

        const missing = [];
        if (!TW_SID) missing.push("TWILIO_ACCOUNT_SID");
        if (!TW_TOKEN) missing.push("TWILIO_AUTH_TOKEN");
        if (!TW_FROM) missing.push("TWILIO_FROM");
        if (!BREVO_KEY) missing.push("BREVO_API_KEY");
        if (missing.length) {
            functions.logger.error("sendCalendlyLink: missing env vars", missing);
            return res.status(500).json({ error: "Server misconfigured", missing });
        }

        const results = { sms: null, email: null, briefing: null };

        // --- 1. Twilio SMS (REST API, no SDK) ---
        // Short body, no emojis, under 160 chars → 1 SMS segment.
        const smsBody =
            `Hola ${name}, gracias por la llamada. ` +
            `Aqui esta el enlace para agendar tu cita de 15 min con Alex: ${CALENDLY_URL}`;

        const smsForm = new URLSearchParams();
        smsForm.append("To", lead_phone);
        smsForm.append("From", TW_FROM);
        smsForm.append("Body", smsBody);

        try {
            const twResp = await axios.post(
                `https://api.twilio.com/2010-04-01/Accounts/${TW_SID}/Messages.json`,
                smsForm.toString(),
                {
                    headers: { "Content-Type": "application/x-www-form-urlencoded" },
                    auth: { username: TW_SID, password: TW_TOKEN },
                    timeout: 10000,
                }
            );
            results.sms = { sid: twResp.data.sid, status: twResp.data.status };
            functions.logger.info(`✅ SMS sent to ${lead_phone}: ${twResp.data.sid}`);
        } catch (err) {
            const e = err.response?.data || err.message;
            functions.logger.error("❌ Twilio SMS failed:", e);
            results.sms = { error: e };
        }

        // --- 2. Brevo transactional email ---
        const emailHtml = `
<!DOCTYPE html>
<html>
<body style="font-family: -apple-system, Segoe UI, Roboto, sans-serif; color: #1a1a1a; max-width: 560px; margin: 0 auto; padding: 24px;">
  <h2 style="color: #0f1115; margin-bottom: 8px;">Hola ${name},</h2>
  <p>Gracias por la llamada. Como lo platicamos, aquí está el enlace para agendar tu consulta de 15 minutos con Alex:</p>
  <p style="text-align: center; margin: 32px 0;">
    <a href="${CALENDLY_URL}"
       style="background: #C5A059; color: #0f1115; padding: 14px 32px; text-decoration: none;
              border-radius: 6px; font-weight: 600; display: inline-block;">
      Agendar mi llamada
    </a>
  </p>
  <p>En esa llamada Alex te va a mostrar exactamente cómo capturar los leads que ${company} está perdiendo hoy por llamadas perdidas y WhatsApp sin responder.</p>
  <p>Si tienes cualquier duda, respóndeme directamente a este correo.</p>
  <p style="margin-top: 32px;">Saludos,<br><strong>Alex Jego</strong><br>JegoDigital — Marketing para Inmobiliarias<br>jegodigital.com · +52 998 787 5321</p>
</body>
</html>`.trim();

        try {
            const brResp = await axios.post(
                "https://api.brevo.com/v3/smtp/email",
                {
                    sender: { name: BREVO_SENDER_NAME, email: BREVO_SENDER_EMAIL },
                    to: [{ email: lead_email, name: name }],
                    replyTo: { email: "jegoalexdigital@gmail.com", name: "Alex Jego" },
                    subject: `${name}, aquí está el enlace para agendar con Alex`,
                    htmlContent: emailHtml,
                    tags: ["cold-call-follow-up", "sofia-agent"],
                },
                {
                    headers: {
                        "api-key": BREVO_KEY,
                        "Content-Type": "application/json",
                        accept: "application/json",
                    },
                    timeout: 10000,
                }
            );
            results.email = { messageId: brResp.data.messageId };
            functions.logger.info(`✅ Email sent to ${lead_email}: ${brResp.data.messageId}`);
        } catch (err) {
            const e = err.response?.data || err.message;
            functions.logger.error("❌ Brevo email failed:", e);
            results.email = { error: e };
        }

        // --- 3. Internal briefing email to Alex (so he can prep for the Calendly call) ---
        const urgencyEmoji = urgencyTag === "alta" ? "🔥" : urgencyTag === "media" ? "⚡" : "📋";
        const briefingSubject = `${urgencyEmoji} Sofia booking: ${name} — ${company} (${urgencyTag})`;
        const briefingHtml = `
<!DOCTYPE html>
<html>
<body style="font-family: -apple-system, Segoe UI, Roboto, sans-serif; color: #1a1a1a; max-width: 640px; margin: 0 auto; padding: 24px; background: #f7f7f8;">
  <div style="background: #0f1115; color: #fff; padding: 20px 24px; border-radius: 8px 8px 0 0;">
    <div style="color: #C5A059; font-size: 13px; letter-spacing: 1px; text-transform: uppercase;">Sofia Cold Call — Briefing Interno</div>
    <h2 style="margin: 4px 0 0 0; color: #fff;">${urgencyEmoji} ${name} — ${company}</h2>
    <div style="margin-top: 4px; color: #bbb; font-size: 13px;">Urgencia: <strong style="color: #C5A059;">${urgencyTag.toUpperCase()}</strong></div>
  </div>
  <div style="background: #fff; padding: 24px; border-radius: 0 0 8px 8px;">
    <h3 style="color: #0f1115; margin-top: 0;">🎯 Pain Points</h3>
    <p style="background: #fff8ec; padding: 12px; border-left: 3px solid #C5A059; margin: 0;">${painSummary}</p>

    <h3 style="color: #0f1115; margin-top: 24px;">🛠 Servicios relevantes</h3>
    <p style="margin: 0;">${services}</p>

    <h3 style="color: #0f1115; margin-top: 24px;">📝 Notas de la llamada</h3>
    <p style="margin: 0; white-space: pre-wrap;">${extraNotes}</p>

    <h3 style="color: #0f1115; margin-top: 24px;">📞 Datos del lead</h3>
    <table style="width: 100%; border-collapse: collapse;">
      <tr><td style="padding: 6px 0; color: #666; width: 100px;">Nombre:</td><td style="padding: 6px 0;"><strong>${name}</strong></td></tr>
      <tr><td style="padding: 6px 0; color: #666;">Empresa:</td><td style="padding: 6px 0;"><strong>${company}</strong></td></tr>
      <tr><td style="padding: 6px 0; color: #666;">Teléfono:</td><td style="padding: 6px 0;"><a href="tel:${lead_phone}" style="color: #0f1115;"><strong>${lead_phone}</strong></a></td></tr>
      <tr><td style="padding: 6px 0; color: #666;">Correo:</td><td style="padding: 6px 0;"><a href="mailto:${lead_email}" style="color: #0f1115;"><strong>${lead_email}</strong></a></td></tr>
    </table>

    <div style="background: #f0f4f8; padding: 16px; border-radius: 6px; margin-top: 24px; font-size: 14px;">
      <strong>✅ Ya enviado al lead:</strong><br>
      • SMS con link de Calendly → ${lead_phone}<br>
      • Email con link de Calendly → ${lead_email}<br>
      <strong>Próximo paso:</strong> Espera que agende en Calendly. Cuando veas la notificación de reserva, entra a esta llamada con los pain points arriba en mente.
    </div>

    <p style="margin-top: 24px; font-size: 12px; color: #999;">JegoDigital — Sofia Cold Calling Pipeline</p>
  </div>
</body>
</html>`.trim();

        try {
            const brResp = await axios.post(
                "https://api.brevo.com/v3/smtp/email",
                {
                    sender: { name: "Sofia Cold Call Bot", email: BREVO_SENDER_EMAIL },
                    to: [{ email: "jegoalexdigital@gmail.com", name: "Alex Jego" }],
                    subject: briefingSubject,
                    htmlContent: briefingHtml,
                    tags: ["sofia-briefing", "cold-call-internal"],
                },
                {
                    headers: {
                        "api-key": BREVO_KEY,
                        "Content-Type": "application/json",
                        accept: "application/json",
                    },
                    timeout: 10000,
                }
            );
            results.briefing = { messageId: brResp.data.messageId };
            functions.logger.info(`✅ Briefing sent to Alex: ${brResp.data.messageId}`);
        } catch (err) {
            const e = err.response?.data || err.message;
            functions.logger.error("❌ Briefing email failed:", e);
            results.briefing = { error: e };
        }

        // --- 4. Log the send to Firestore for tracking ---
        try {
            await getFirestore().collection("cold_call_sends").add({
                lead_name: name,
                lead_email,
                lead_phone,
                company_name: company,
                pain_points: painSummary,
                services_mentioned: services,
                urgency: urgencyTag,
                notes: extraNotes,
                calendly_url: CALENDLY_URL,
                sms_result: results.sms,
                email_result: results.email,
                briefing_result: results.briefing,
                source: "sofia_elevenlabs_agent",
                timestamp: admin.firestore.FieldValue.serverTimestamp(),
            });
        } catch (dbErr) {
            functions.logger.warn("Firestore log failed (non-fatal):", dbErr.message);
        }

        // Tell Sofia whether both channels worked so she can confirm verbally
        const smsOk = results.sms && !results.sms.error;
        const emailOk = results.email && !results.email.error;

        return res.status(200).json({
            success: smsOk || emailOk, // partial success is still success
            sms_sent: smsOk,
            email_sent: emailOk,
            message: smsOk && emailOk
                ? `Calendly link sent to ${lead_phone} (SMS) and ${lead_email} (email).`
                : smsOk
                ? `SMS sent to ${lead_phone}. Email failed — check Brevo logs.`
                : emailOk
                ? `Email sent to ${lead_email}. SMS failed — check Twilio logs.`
                : "Both SMS and email failed — check logs.",
            details: results,
        });
    } catch (err) {
        functions.logger.error("sendCalendlyLink unexpected error:", err);
        return res.status(500).json({ error: err.message });
    }
});

/**
 * submitAuditRequest — Receives audit form data from /auditoria-gratis page
 * 1. Saves to Firestore 'audit_requests' collection
 * 2. Adds contact to Brevo list 29 (triggers Automation #8 nurture)
 * 3. Returns success to client
 *
 * No API keys exposed to the browser.
 */
// Validate a website_url string: must contain a dot, look domain-ish, not be
// a company-name blob. Returns { ok, normalized, reason }.
function validateWebsiteUrl(raw) {
    if (!raw || typeof raw !== "string") return { ok: false, reason: "missing" };
    let s = raw.trim();
    if (s.length < 4) return { ok: false, reason: "too_short" };
    // Reject anything with spaces (e.g. "Inmobiliaria Flamingo") — domains don't have spaces
    if (/\s/.test(s)) return { ok: false, reason: "has_spaces" };
    // Must contain a dot
    if (!s.includes(".")) return { ok: false, reason: "no_dot" };
    // Strip protocol + trailing slash + path
    s = s.replace(/^https?:\/\//i, "").replace(/^www\./i, "").split("/")[0].toLowerCase();
    // Final sanity — must still have a dot + valid TLD-ish suffix (2-24 chars)
    if (!/^[a-z0-9][a-z0-9-]*(\.[a-z0-9-]+)+\.[a-z]{2,24}$/i.test(s) &&
        !/^[a-z0-9][a-z0-9-]*\.[a-z]{2,24}$/i.test(s)) {
        return { ok: false, reason: "not_domain_format" };
    }
    return { ok: true, normalized: "https://" + s };
}

exports.submitAuditRequest = functions.https.onRequest(async (req, res) => {
    res.set("Access-Control-Allow-Origin", "*");
    res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.set("Access-Control-Allow-Headers", "Content-Type");
    if (req.method === "OPTIONS") return res.status(204).send("");
    if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

    try {
        let { website_url, name, email, city, source, company } = req.body || {};
        // Source can come from JSON body OR query string (?source=cold_call_elevenlabs).
        // ElevenLabs cold-call agents don't include `source` in the tool schema,
        // so we hardcode it on their endpoint URL via query param. Fixes the routing
        // gap that was sending cold-call signups to web-form list 29 → triggering
        // wrong-context Automation #8 ("Gracias por contactar").
        if (!source && req.query?.source) source = req.query.source;
        source = (source || "auditoria-gratis").toString().slice(0, 64);

        if (!website_url || !name || !email) {
            return res.status(400).json({ error: "Missing required fields: website_url, name, email" });
        }

        // URL validation — reject obvious garbage so the ElevenLabs agent
        // retries and asks the lead for the real URL instead of generating a
        // broken audit report.
        const v = validateWebsiteUrl(website_url);
        if (!v.ok) {
            functions.logger.warn(`❌ submitAuditRequest rejected: website_url="${website_url}" reason=${v.reason} source=${source}`);
            // Best-effort Telegram alert — agent passed junk, we want Alex to see it
            try {
                const { notify } = require("./telegramHelper");
                await notify(
                    `🔴 *AUDIT REQUEST REJECTED* \n` +
                    `Source: \`${source}\`\n` +
                    `Name: ${name}\n` +
                    `Email: ${email}\n` +
                    `website_url (invalid): \`${website_url}\`\n` +
                    `Reason: \`${v.reason}\`\n\n` +
                    `_Agent probably passed company name instead of URL. Fix prompt or check agent reasoning._`,
                    { critical: false }
                );
            } catch (e) { /* notify failures shouldn't break the API */ }
            return res.status(400).json({
                error: "Invalid website_url — must be a domain like 'realestateflamingo.com.mx'",
                reason: v.reason
            });
        }
        website_url = v.normalized;

        const firstName = (name.split(" ")[0]) || "Hola";
        const lastName = name.split(" ").slice(1).join(" ") || "";
        const isColdCall = /cold_call|cold-call|elevenlabs/i.test(source);

        // 1. Save to Firestore — processAuditRequest (onCreate trigger) handles the rest
        const db = admin.firestore();
        const docRef = await db.collection("audit_requests").add({
            website_url,
            name,
            email,
            city: city || "",
            company: company || "",
            source,
            status: "pending",
            createdAt: admin.firestore.FieldValue.serverTimestamp()
        });
        functions.logger.info(`✅ Audit request saved: ${docRef.id} for ${website_url} (source=${source})`);

        // 2. Brevo contact add — route to DIFFERENT lists based on source so
        //    web-form leads and cold-call leads don't get the same generic
        //    "Gracias por contactar" email (which doesn't fit phone conversions).
        //    Web form → list 29 (existing Automation #8 "Gracias por contactar" web-form nurture)
        //    Cold call → list 34 "Cold Call - Audit Leads" (dedicated, avoids wrong-context email)
        const BREVO_KEY = process.env.BREVO_API_KEY;
        const targetListId = isColdCall ? 34 : 29;
        if (BREVO_KEY) {
            try {
                await axios.post("https://api.brevo.com/v3/contacts", {
                    email,
                    attributes: {
                        FIRSTNAME: firstName,
                        LASTNAME: lastName,
                        LEAD_SOURCE: isColdCall ? "cold_call" : "website",
                        CAMPAIGN_SOURCE: source,
                        GEO_INTEREST: city || "",
                        COMPANY: company || "",
                        LEAD_TEMPERATURE: isColdCall ? "Hot" : "Warm",
                        LANGUAGE_PREF: "es"
                    },
                    listIds: [targetListId],
                    updateEnabled: true
                }, {
                    headers: {
                        "api-key": BREVO_KEY,
                        "Content-Type": "application/json",
                        accept: "application/json"
                    },
                    timeout: 8000
                });
                functions.logger.info(`✅ Brevo: ${email} added to list ${targetListId} (${isColdCall ? "cold-call" : "web-form"})`);
            } catch (brevoErr) {
                const e = brevoErr.response?.data || brevoErr.message;
                functions.logger.warn("⚠️ Brevo add failed (lead still in Firestore):", e);
            }
        } else {
            functions.logger.warn("⚠️ BREVO_API_KEY not set — skipping Brevo add");
        }

        // 3. Telegram hot-lead alert — fire-and-forget, per-channel visibility
        try {
            const { notify } = require("./telegramHelper");
            const emoji = isColdCall ? "🔥 *COLD CALL SIGNUP*" : "🟢 *WEB FORM SIGNUP*";
            await notify(
                `${emoji}\n` +
                `Name: ${name}\n` +
                (company ? `Company: ${company}\n` : "") +
                `Email: ${email}\n` +
                `Website: ${website_url}\n` +
                (city ? `City: ${city}\n` : "") +
                `Source: \`${source}\`\n` +
                `Audit ID: \`${docRef.id}\`\n\n` +
                `_Audit report emailing in ~45-60 min. Lead is in Brevo list ${targetListId}._`,
                { critical: isColdCall } // cold-call conversions escalate via SMS if Telegram fails
            );
        } catch (e) {
            functions.logger.warn("telegramHelper failed:", e.message);
        }

        return res.status(200).json({
            success: true,
            id: docRef.id,
            message: "Audit request received. Report will be sent within 1 hour."
        });

    } catch (err) {
        functions.logger.error("submitAuditRequest error:", err);
        return res.status(500).json({ error: err.message });
    }
});

// ============================================================
// AUTOMATED AUDIT PIPELINE
// processAuditRequest: Firestore onCreate → runs audit + queues Brevo email
//   with scheduledAt (45-min delay). No separate scheduled function is needed
//   — Brevo handles the delayed send. The old `runPendingAudits` scheduled
//   function was removed; leaving the export here left an orphaned Cloud
//   Scheduler job (firebase-schedule-runPendingAudits-us-central1) that
//   broke the Functions deploy with a 404 on every push from 2026-04-17 on.
// ============================================================
const { processAuditRequest } = require("./auditPipeline");
exports.processAuditRequest = processAuditRequest;

// ============================================================
// DAILY DIGEST (added 2026-04-20)
// 07:00 CDMX Telegram morning brief. Pulls yesterday's Instantly
// + Calendly + audit + call + Brevo queue numbers, posts one card
// to Telegram, snapshots to `daily_digests/{YYYY-MM-DD}`.
// See SYSTEM.md §2 for the full cron roadmap.
// ============================================================
exports.dailyDigest = require("./dailyDigest").dailyDigest;

// ============================================================
// SYSTEM HEALTH AUDIT (added 2026-04-20)
// Every-48h watchdog. Runs 12 checks (hosting, audit endpoint,
// Cloud Run, DataForSEO/PSI/Firecrawl/Perplexity/Brevo/Telegram,
// daily_digest freshness, audit flow). Posts Telegram alert on
// any red check. Monthly alive-ping on day 1 when all green.
// NEVER auto-edits code — surface-only watchdog by design.
// See SYSTEM.md §2.
// ============================================================
exports.systemHealthAudit = require("./systemHealthAudit").systemHealthAudit;

// ============================================================
// COLD CALL AUTOPILOT (added 2026-04-20)
// 09:55/10:00/13:00 CDMX Mon-Fri trio. Preps 50 phone_leads,
// fires Sofia calls via ElevenLabs + Twilio with A/B/C offer
// rotation, then reports outcomes + auto-fires audits for
// positives with email+website. NO approve gate — logs +
// analytics surface problems after the fact (per Alex 2026-04-20).
// See SYSTEM.md §1.1.
// ============================================================
const coldCall = require("./coldCallAutopilot");
exports.coldCallPrep = coldCall.coldCallPrep;
exports.coldCallRun = coldCall.coldCallRun;
exports.coldCallReport = coldCall.coldCallReport;
exports.coldCallMidBatchCheck = coldCall.coldCallMidBatchCheck;
exports.coldCallRunAfternoon = coldCall.coldCallRunAfternoon;

// ============================================================
// COLD CALL SLACK REPORTS (added 2026-04-20)
// 12:30 CDMX (after morning batch) and 18:30 CDMX (after afternoon batch)
// Pulls conversations from ElevenLabs API for each of the 3 agents,
// categorizes outcomes (voicemail/instant_hangup/engaged/positive),
// counts audit_signups + calendly_bookings via tool_calls, posts a
// JegoDigital-branded gold #C5A059 Slack Block Kit attachment.
// Plus on-demand HTTP variant for manual debug.
// ============================================================
const coldCallSlack = require("./coldCallSlackReport");
exports.coldCallSlackMorning = coldCallSlack.coldCallSlackMorning;
exports.coldCallSlackAfternoon = coldCallSlack.coldCallSlackAfternoon;
exports.coldCallSlackOnDemand = coldCallSlack.coldCallSlackOnDemand;

// ============================================================
// TWILIO STATUS CALLBACK → ELEVENLABS ZOMBIE KILLER (2026-04-21)
// Twilio POSTs here on every call status change. On terminal
// statuses (completed/failed/no-answer/busy/canceled) we look up
// the ElevenLabs conversation by CallSid and DELETE it so the
// agent doesn't hold the SIP session to max_duration (90s).
// Expected: cut zombie waste from 90s cap → ~3s actual.
// See COLDCALL.md §10 for context + Twilio webhook config.
// ============================================================
exports.twilioCallStatusCallback =
  require("./twilioCallStatusCallback").twilioCallStatusCallback;

// ============================================================
// COLD EMAIL DAILY REPORT (added 2026-04-21)
// 07:05 CDMX daily — yesterday's Instantly performance to
// Slack + Telegram (Block Kit + Markdown). Weekly rollup every
// Monday 08:00 CDMX. On-demand HTTPS endpoint for replay /
// single-day debug (hit with ?date=YYYY-MM-DD[&notify=1]).
// Mirrors coldCallSlackReport design. Fully autonomous —
// all secrets already in runtime env via deploy.yml.
// ============================================================
const coldEmailDaily = require("./coldEmailDailyReport");
exports.coldEmailDailyReport = coldEmailDaily.coldEmailDailyReport;
exports.coldEmailWeeklyReport = coldEmailDaily.coldEmailWeeklyReport;
exports.coldEmailReportOnDemand = coldEmailDaily.coldEmailReportOnDemand;

// ============================================================
// COLD CALL LIVE MONITOR (added 2026-04-20)
// Every 3 min during 09:55-11:35 CDMX — polls ElevenLabs for
// in-flight + just-finished conversations across all 3 agents,
// flags instant hangups / tool_call failures / agent loops,
// posts diagnostic alerts to Telegram with recommended fixes.
// Lets Alex catch issues mid-batch instead of finding out next day.
// ============================================================
exports.coldCallLiveMonitor = require("./coldCallLiveMonitor").coldCallLiveMonitor;

// ============================================================
// AUTOPILOT REVIEWER (added 2026-04-20)
// Sunday 20:00 CDMX — 7-day self-improvement pass.
// Reads daily_digests, system_health, call_queue_summaries,
// call_analysis (by offer), audit_requests (by source).
// Writes autopilot_reviews/{YYYY-WW} snapshot + posts
// Telegram report with 3 concrete recommendations.
// Deterministic baseline + optional Claude enrichment when
// ANTHROPIC_API_KEY is set (additive, never blocks the report).
// This IS the self-improvement layer. See SYSTEM.md §1.2.
// ============================================================
exports.autopilotReviewer = require("./autopilotReviewer").autopilotReviewer;

// ============================================================
// INSTANTLY REPLY WATCHER (added 2026-04-20)
// Every 5 min — polls Instantly Unibox, classifies replies
// (positive/negative/neutral/question/positive_with_objection),
// auto-fires audit_requests for clean positives with email+website,
// dedups via instantly_reply_activity/{replyId}, writes daily
// rollups to instantly_reply_summaries/{YYYY-MM-DD}. Hot leads +
// objections page Alex on Telegram. Closes the active-feed gap
// where Instantly replies sat in Unibox with no downstream action.
// ============================================================
exports.instantlyReplyWatcher = require("./instantlyReplyWatcher").instantlyReplyWatcher;

// ============================================================
// CALL TRANSCRIPT REVIEWER (added 2026-04-20)
// Sunday 19:00 CDMX — programmatic 7d transcript analysis.
// Audits script adherence (greeted, offered_audit, offered_setup,
// mentioned_flamingo, pushed_calendly, leaked_price, collected_email,
// collected_website), extracts objection buckets, picks offer winner
// with min-sample gate (>=10 calls), writes call_reviews/{YYYY-WW}.
// Runs 1h BEFORE autopilotReviewer so its signal feeds the weekly.
// Price leak >5% escalates 🚨 in Telegram.
// ============================================================
exports.callTranscriptReviewer = require("./callTranscriptReviewer").callTranscriptReviewer;

// ============================================================
// LEAD FINDER AUTO TOP UP (added 2026-04-20)
// 08:00 CDMX — keeps phone_leads pool above HARD_FLOOR (100),
// targets TARGET_POOL_SIZE (150). Uses 7-day CITY_ROTATION
// (Cancún/PdC → Tulum/Cozumel → Mérida/PVR → CDMX/GDL → MTY/QRO
// → LosCabos/SMA → Puebla/Oaxaca). Hunter.io decision-maker rank
// (owner/founder/ceo=3, manager/gerente=2, sales=1). Hard cap
// 60 enrichments/day, 350ms throttle, portal-domain blocklist.
// Runs BEFORE coldCallPrep (09:55) so trio never starves.
// ============================================================
exports.leadFinderAutoTopUp = require("./leadFinderAutoTopUp").leadFinderAutoTopUp;

// ============================================================
// CONTENT PUBLISHER (added 2026-04-20)
// 10:00 CDMX — reads content_queue/{YYYY-MM-DD}, publishes queued
// Instagram posts (single, carousel, reel, story) via Graph API v22.0.
// Supports catbox.moe-hosted PNGs + MP4s, 30s spacing between posts,
// 8s carousel finalize wait, 15-attempt Reel status polling. Logs
// to content_publishes + _summary_{dateKey}. NO approve gate per
// Alex 2026-04-20 — Telegram alerts per-publish.
// ============================================================
exports.contentPublisher = require("./contentPublisher").contentPublisher;

// ============================================================
// SOFIA CONVERSATION AUDIT (added 2026-04-20)
// 23:00 CDMX — nightly ManyChat script QA. Scores up to 20 sampled
// conversations on 11-pt rubric: greeted, collected_goal, offered_audit,
// pushed_calendly, mentioned_proof, collected_website, no_pricing_leak,
// no_tool_name_leak. Pricing/tool-name leaks are hard fails. Writes
// sofia_audits/{YYYY-MM-DD}. Source: sofia_conversations mirror first,
// ManyChat API (getByTag + getInfo) fallback. LOW_SCORE_FLAG = 7.
// ============================================================
exports.sofiaConversationAudit = require("./sofiaConversationAudit").sofiaConversationAudit;

// ============================================================
// SEED PHONE LEADS — one-shot HTTPS (added 2026-04-20)
// Run ONCE after deploy to seed the 57 DIAL_READY leads into
// phone_leads so coldCallPrep (09:55 Mon–Fri CDMX) has a queue
// to draw from on day 1. Upserts by digits-only phone, safe to
// re-run. Protected by X-Seed-Secret header. Retire after fire.
// ============================================================
exports.seedPhoneLeadsOnce = require("./seedPhoneLeadsOnce").seedPhoneLeadsOnce;

// ============================================================
// DAILY ROLLUP SLACK (added 2026-04-20)
// 18:00 CDMX — close-of-business Slack brief covering cold
// calls, cold email (Instantly), audit pipeline, FB Ads spend,
// ElevenLabs credit, and estimated $$ cost-of-day. Parallel
// to dailyDigest (07:00 morning brief via Telegram), but this
// one targets Slack. Falls back to Telegram if SLACK_WEBHOOK_URL
// is not configured. Snapshots to daily_rollups/{YYYY-MM-DD}.
// ============================================================
exports.dailyRollupSlack = require("./dailyRollupSlack").dailyRollupSlack;

// envAudit — 06:00 UTC daily key-integrity check. Runs 1 hour
// before dailyDigest. Reads REQUIRED_KEYS list from envAudit.js
// envAuditNow HTTPS endpoint for manual verify.
exports.envAudit = require("./envAudit").envAudit;
exports.envAuditNow = require("./envAudit").envAuditNow;

// ============================================================
// instantlyAuditNow -- on-demand Instantly campaign audit.
// ============================================================
exports.instantlyAuditNow = require("./instantlyAudit").instantlyAuditNow;

// ============================================================
// dailyStrategist -- 08:00 CDMX AI-recommendation agent.
// Pulls audit, runs Lead Quality Audit, calls Claude strategist,
// applies whitelisted safe fixes via Instantly API, posts digest
// to #all-jegodigital + DMs Alex on critical red flags.
// ============================================================
exports.dailyStrategist = require("./dailyStrategist").dailyStrategist;
exports.dailyStrategistNow = require("./dailyStrategist").dailyStrategistNow;
