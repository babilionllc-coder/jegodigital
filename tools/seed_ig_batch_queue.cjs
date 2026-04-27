#!/usr/bin/env node
/**
 * seed_ig_batch_queue.cjs — seed Firestore ig_batch_queue with the 20-post
 * Apr 29-May 3 batch defined in /instagram/batch-2026-04-29-may-03/CALENDAR.md
 *
 * Each doc starts with status='pending_assets'. Asset producers fill in
 * assetUrls + caption later then flip status='ready'. The cron Cloud
 * Function processIgBatchQueue only picks up status='ready' docs.
 *
 * Run once:
 *   node tools/seed_ig_batch_queue.cjs
 *
 * Idempotent — uses doc.set with merge:true.
 *
 * Requires: GOOGLE_APPLICATION_CREDENTIALS pointing to a service account
 * with Firestore write access on jegodigital-e02fb. Same plumbing as
 * other tools/* scripts.
 */
const admin = require("firebase-admin");

// Match the existing tools/* convention: load via firebase-admin default
// credentials (GOOGLE_APPLICATION_CREDENTIALS env var) OR the
// .secrets/firebase-admin.json fallback if running locally.
if (!admin.apps.length) {
    try {
        admin.initializeApp({
            projectId: "jegodigital-e02fb",
        });
    } catch (e) {
        console.error("firebase init failed", e.message);
        process.exit(1);
    }
}

const db = admin.firestore();

const POSTS = [
    // Day 1 — Tue Apr 29
    {
        id: "ig-batch-01-s1-leads-carousel",
        fireAt: "2026-04-29T13:00:00Z", // 09:00 ET
        format: "carousel",
        topic: "Service S1 — Captura de Leads 24/7 con IA",
        angle: "Service deep-dive (Path B WhatsApp Sofia mockup)",
        path: "B",
        slideCount: 5,
        tiktokDraft: false,
    },
    {
        id: "ig-batch-02-mythbuster-3errores-reel",
        fireAt: "2026-04-29T16:00:00Z", // 12:00 ET
        format: "reel",
        topic: "3 errores que te hacen perder leads",
        angle: "Myth-buster (Alex on cam OR Veo b-roll + Tony VO)",
        path: "B",
        durationSec: 30,
        tiktokDraft: true,
    },
    {
        id: "ig-batch-03-flamingo-stat-single",
        fireAt: "2026-04-29T19:00:00Z", // 15:00 ET
        format: "single",
        topic: "Flamingo 4.4x visibilidad stat card",
        angle: "Case study quote (Path A real Ahrefs screenshot) — RE-VERIFY at fire",
        path: "A",
        client: "flamingo",
        verifyRequired: ["ahrefs.organic_traffic_delta_realestateflamingo.com.mx"],
        tiktokDraft: false,
    },
    {
        id: "ig-batch-04-crm-mockup-carousel",
        fireAt: "2026-04-29T22:00:00Z", // 18:00 ET
        format: "carousel",
        topic: "CRM dashboard mockup — Tu próximo CRM",
        angle: "Capability mockup (Path B template, no client name)",
        path: "B",
        slideCount: 5,
        tiktokDraft: false,
    },

    // Day 2 — Wed Apr 30
    {
        id: "ig-batch-05-s2-seo-local-carousel",
        fireAt: "2026-04-30T13:00:00Z",
        format: "carousel",
        topic: "Service S2 — SEO Local",
        angle: "Service deep-dive (Path B Maps rank panel mockup)",
        path: "B",
        slideCount: 5,
        tiktokDraft: false,
    },
    {
        id: "ig-batch-06-mythbuster-chatgpt-reel",
        fireAt: "2026-04-30T16:00:00Z",
        format: "reel",
        topic: "Por qué ChatGPT no recomienda tu agencia",
        angle: "AEO myth-buster (Veo UI flythrough + Tony VO)",
        path: "B",
        durationSec: 30,
        tiktokDraft: true,
    },
    {
        id: "ig-batch-07-flamingo-casestudy-carousel",
        fireAt: "2026-04-30T19:00:00Z",
        format: "carousel",
        topic: "Flamingo full case study",
        angle: "Case study (Path A real screenshots) — RE-VERIFY all numbers at fire",
        path: "A",
        client: "flamingo",
        slideCount: 5,
        verifyRequired: [
            "ahrefs.organic_traffic_delta",
            "dataforseo.local_serp_rank_inmobiliaria_cancun",
            "ga4.organic_traffic_delta_realestateflamingo.com.mx",
        ],
        tiktokDraft: false,
    },
    {
        id: "ig-batch-08-pagespeed-stat-single",
        fireAt: "2026-04-30T22:00:00Z",
        format: "single",
        topic: "98+ PageSpeed garantizado",
        angle: "Service guarantee stat (Path B)",
        path: "B",
        tiktokDraft: false,
    },

    // Day 3 — Thu May 1
    {
        id: "ig-batch-09-s3-aeo-carousel",
        fireAt: "2026-05-01T13:00:00Z",
        format: "carousel",
        topic: "Service S3 — AEO ChatGPT/Perplexity/Gemini",
        angle: "Service deep-dive (Path B AI search results mockup)",
        path: "B",
        slideCount: 5,
        tiktokDraft: false,
    },
    {
        id: "ig-batch-10-mythbuster-whatsapp-reel",
        fireAt: "2026-05-01T16:00:00Z",
        format: "reel",
        topic: "Por qué tu WhatsApp pierde leads de noche",
        angle: "Founder POV myth-buster (prefer Alex on cam from /instagram/raw/)",
        path: "B",
        durationSec: 30,
        tiktokDraft: true,
    },
    {
        id: "ig-batch-11-sofia-flow-carousel",
        fireAt: "2026-05-01T19:00:00Z",
        format: "carousel",
        topic: "WhatsApp Sofia AI flow mockup",
        angle: "Capability mockup (Path B chat flow template)",
        path: "B",
        slideCount: 5,
        tiktokDraft: false,
    },
    {
        id: "ig-batch-12-mythbuster-seo2026-reel",
        fireAt: "2026-05-01T22:00:00Z",
        format: "reel",
        topic: "El SEO de 2026 ya no es lo que era",
        angle: "Myth-buster (split-screen Veo + Tony VO)",
        path: "B",
        durationSec: 30,
        tiktokDraft: true,
    },

    // Day 4 — Fri May 2
    {
        id: "ig-batch-13-s5-website-carousel",
        fireAt: "2026-05-02T13:00:00Z",
        format: "carousel",
        topic: "Service S5 — Sitio Web Alto Rendimiento",
        angle: "Service deep-dive (Path B Lighthouse mockup)",
        path: "B",
        slideCount: 5,
        tiktokDraft: false,
    },
    {
        id: "ig-batch-14-mythbuster-maps-reel",
        fireAt: "2026-05-02T16:00:00Z",
        format: "reel",
        topic: "Tu Maps no aparece — esto es por qué",
        angle: "Local SEO myth-buster",
        path: "B",
        durationSec: 30,
        tiktokDraft: true,
    },
    {
        id: "ig-batch-15-rsviajes-casestudy-carousel",
        fireAt: "2026-05-02T19:00:00Z",
        format: "carousel",
        topic: "RS Viajes case study (bilingual + multi-país)",
        angle: "Case study (Path A real screenshots) — RE-VERIFY at fire",
        path: "A",
        client: "rsviajes",
        slideCount: 5,
        verifyRequired: ["dataforseo.live_metrics_rsviajesreycoliman.com"],
        tiktokDraft: false,
    },
    {
        id: "ig-batch-16-trojan-offer-single",
        fireAt: "2026-05-02T22:00:00Z",
        format: "single",
        topic: "Trojan Horse offer card — Setup gratis Captura de Leads",
        angle: "Trojan Horse CTA (Path B)",
        path: "B",
        tiktokDraft: false,
    },

    // Day 5 — Sat May 3
    {
        id: "ig-batch-17-s6-property-videos-carousel",
        fireAt: "2026-05-03T13:00:00Z",
        format: "carousel",
        topic: "Service S6 — Property Videos",
        angle: "Service deep-dive (Path B Reel mockup)",
        path: "B",
        slideCount: 5,
        tiktokDraft: false,
    },
    {
        id: "ig-batch-18-founder-3cosas-reel",
        fireAt: "2026-05-03T16:00:00Z",
        format: "reel",
        topic: "3 cosas que cambia tener IA en tu agencia",
        angle: "Founder POV (prefer Alex on cam from /instagram/raw/)",
        path: "B",
        durationSec: 30,
        tiktokDraft: true,
    },
    {
        id: "ig-batch-19-maps-rank-mockup-carousel",
        fireAt: "2026-05-03T19:00:00Z",
        format: "carousel",
        topic: "Google Maps rank panel mockup — #1 en tu zona",
        angle: "Capability mockup (Path B template)",
        path: "B",
        slideCount: 5,
        tiktokDraft: false,
    },
    {
        id: "ig-batch-20-closing-cta-single",
        fireAt: "2026-05-03T22:00:00Z",
        format: "single",
        topic: "Closing CTA — ¿Viste todo? Ahora hablemos.",
        angle: "Batch closer (Path B)",
        path: "B",
        tiktokDraft: false,
    },
];

(async () => {
    console.log(`Seeding ig_batch_queue with ${POSTS.length} docs...`);
    const batch = db.batch();
    const now = admin.firestore.FieldValue.serverTimestamp();

    for (const p of POSTS) {
        const ref = db.collection("ig_batch_queue").doc(p.id);
        batch.set(
            ref,
            {
                ...p,
                fireAt: admin.firestore.Timestamp.fromDate(new Date(p.fireAt)),
                status: "pending_assets", // flips to "ready" when asset producer uploads URLs
                source: "2026-04-29-may-03-batch",
                calendar:
                    "/instagram/batch-2026-04-29-may-03/CALENDAR.md",
                createdAt: now,
                retryCount: 0,
            },
            { merge: true }
        );
    }

    await batch.commit();
    console.log(`✅ Seeded ${POSTS.length} docs to ig_batch_queue`);

    // Verify count
    const verify = await db
        .collection("ig_batch_queue")
        .where("source", "==", "2026-04-29-may-03-batch")
        .get();
    console.log(`✅ Verified: ${verify.size} docs in collection for this batch`);

    if (verify.size !== POSTS.length) {
        console.error(
            `❌ count mismatch — expected ${POSTS.length}, got ${verify.size}`
        );
        process.exit(1);
    }

    process.exit(0);
})().catch((e) => {
    console.error("seed failed:", e);
    process.exit(1);
});
