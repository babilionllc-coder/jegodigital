#!/usr/bin/env node
/**
 * phone_leads_quality.cjs — live Firestore audit of the cold-call lead pool.
 *
 * Outputs (all from live queries — no fabrication, per HARD RULE #0):
 *   - Total phone_leads count
 *   - do_not_call=true count
 *   - Eligible-for-dispatch count (phone_verified=true, do_not_call=false,
 *     last_called_at null OR > 14d)
 *   - Real-name % (firstName ∉ FAKE_FIRST_NAMES)
 *   - Has-email %
 *   - Decision-maker % (is_decision_maker=true)
 *   - Portal/enterprise domain % (should be 0 after blocklist — if >0 = bug)
 *   - City distribution
 *   - Call-attempt distribution (0 / 1 / 2 / 3+)
 *   - Coverage gate prediction for next dispatch (≥70% names + ≥60% emails?)
 *
 * Run with:
 *   GOOGLE_APPLICATION_CREDENTIALS=./jegodigital-e02fb-a05ae4cb7645.json \
 *     node website/tools/phone_leads_quality.cjs
 *
 * Or from the repo root:
 *   node website/tools/phone_leads_quality.cjs
 */
const fs = require("fs");
const path = require("path");
const admin = require("firebase-admin");

const ROOT = path.resolve(__dirname, "..", "..");
const SA_PATH = process.env.GOOGLE_APPLICATION_CREDENTIALS
    || path.join(ROOT, "jegodigital-e02fb-a05ae4cb7645.json");

if (!fs.existsSync(SA_PATH)) {
    console.error(`❌ service account not found at ${SA_PATH}`);
    console.error("   Set GOOGLE_APPLICATION_CREDENTIALS or put the SA JSON at the repo root.");
    process.exit(1);
}

admin.initializeApp({
    credential: admin.credential.cert(require(SA_PATH)),
    projectId: "jegodigital-e02fb",
});
const db = admin.firestore();

// Must match the set in coldCallAutopilot.js + leadFinderAutoTopUp.js
const FAKE_FIRST_NAMES = new Set([
    "info", "contact", "contacto", "admin", "sales", "marketing", "hello", "hola",
    "ventas", "ventas1", "support", "soporte", "noreply", "no-reply", "mail", "email",
    "webmaster", "team", "office", "gerencia", "recepcion", "rh", "reception",
    "test", "user", "account", "billing", "allá",
]);

// Must match ENTERPRISE_DOMAINS in leadFinderAutoTopUp.js
const ENTERPRISE_DOMAINS = [
    "cbre.com", "colliers.com", "jll.com", "nmrk.com",
    "kwmexico.mx", "cbcmexico.mx", "cushwake.com",
    "remax.net", "remax.com", "remax.com.mx",
    "century21.com", "century21global.com", "century21.com.mx",
    "coldwellbanker.com",
    "inmuebles24.com", "vivanuncios.com.mx", "propiedades.com",
    "metroscubicos.com", "casasyterrenos.com", "lamudi.com.mx",
    "trovit.com.mx", "mercadolibre.com.mx", "mitula.com.mx",
    "airbnb.com", "booking.com", "expedia.com", "vrbo.com",
    "trivago.com", "hotels.com", "tripadvisor.com",
    "zillow.com", "realtor.com", "redfin.com",
    "facebook.com", "instagram.com", "linktr.ee", "linkin.bio",
    "beacons.ai", "instabio.cc", "bio.link",
    "wixsite.com", "squarespace.com", "godaddysites.com",
    "blogspot.com", "wordpress.com", "tumblr.com", "linkedin.com",
];
function isPortal(domain) {
    const d = (domain || "").toLowerCase();
    return ENTERPRISE_DOMAINS.some((p) => d.endsWith(p) || d.includes(`.${p}`));
}

function isFakeName(name) {
    if (!name) return true;
    const first = name.toLowerCase().trim().split(/\s+/)[0];
    return !first || FAKE_FIRST_NAMES.has(first);
}

function pct(n, d) { return d === 0 ? 0 : (n / d) * 100; }
function bar(p) {
    const filled = Math.round(p / 5);
    return "█".repeat(filled) + "░".repeat(20 - filled);
}

async function main() {
    console.log("🔍 phone_leads quality audit — live Firestore pull");
    console.log(`   Project: jegodigital-e02fb`);
    console.log(`   Time: ${new Date().toISOString()}`);
    console.log("");

    const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);

    // Pull ALL phone_leads (up to 1000 — should be ~150-300 in practice)
    const snap = await db.collection("phone_leads").limit(1000).get();
    const leads = [];
    snap.forEach((doc) => leads.push({ id: doc.id, ...doc.data() }));
    const total = leads.length;

    if (total === 0) {
        console.log("⚠️  phone_leads collection is EMPTY. Run seedPhoneLeadsOnce or leadFinderAutoTopUp first.");
        process.exit(0);
    }

    const dnc = leads.filter((l) => l.do_not_call === true).length;
    const verified = leads.filter((l) => l.phone_verified === true).length;

    const eligible = leads.filter((l) => {
        if (l.phone_verified !== true) return false;
        if (l.do_not_call === true) return false;
        const lastCalled = l.last_called_at?.toDate?.() || null;
        return !lastCalled || lastCalled < fourteenDaysAgo;
    });
    const eligibleCount = eligible.length;

    const realNames = eligible.filter((l) => !isFakeName(l.name || l.first_name)).length;
    const hasEmail = eligible.filter((l) => l.email && l.email.includes("@")).length;
    const decisionMakers = eligible.filter((l) => l.is_decision_maker === true).length;
    const portalLeaks = eligible.filter((l) => isPortal(l.domain || "")).length;

    // Call attempts distribution
    const attempts = { 0: 0, 1: 0, 2: 0, "3+": 0 };
    eligible.forEach((l) => {
        const n = (l.call_attempts && l.call_attempts.length) || l.call_attempts_count || 0;
        if (n === 0) attempts[0]++;
        else if (n === 1) attempts[1]++;
        else if (n === 2) attempts[2]++;
        else attempts["3+"]++;
    });

    // City distribution
    const cities = {};
    eligible.forEach((l) => {
        const c = l.city || "unknown";
        cities[c] = (cities[c] || 0) + 1;
    });
    const topCities = Object.entries(cities).sort((a, b) => b[1] - a[1]).slice(0, 10);

    // Report
    console.log("📊 Pool overview");
    console.log(`   Total phone_leads:         ${total}`);
    console.log(`   phone_verified=true:       ${verified}`);
    console.log(`   do_not_call=true:          ${dnc}`);
    console.log(`   Eligible for dispatch:     ${eligibleCount}   (fresh ≤14d + verified + not DNC)`);
    console.log("");

    if (eligibleCount === 0) {
        console.log("⚠️  Zero eligible leads. Pool needs a top-up.");
        process.exit(0);
    }

    console.log("🎯 Eligible-pool quality (what coldCallPrep will dial from)");
    const namePct = pct(realNames, eligibleCount);
    const emailPct = pct(hasEmail, eligibleCount);
    const dmPct = pct(decisionMakers, eligibleCount);
    const portalPct = pct(portalLeaks, eligibleCount);
    console.log(`   Real first name:           ${namePct.toFixed(1).padStart(5)}%  ${bar(namePct)}  (${realNames}/${eligibleCount})`);
    console.log(`   Has email:                 ${emailPct.toFixed(1).padStart(5)}%  ${bar(emailPct)}  (${hasEmail}/${eligibleCount})`);
    console.log(`   Decision-maker (Hunter):   ${dmPct.toFixed(1).padStart(5)}%  ${bar(dmPct)}  (${decisionMakers}/${eligibleCount})`);
    console.log(`   Portal/enterprise LEAK:    ${portalPct.toFixed(1).padStart(5)}%  (${portalLeaks}/${eligibleCount})  [target: 0%]`);
    console.log("");

    console.log("📞 Call-attempts distribution");
    console.log(`   0 attempts:  ${attempts[0]}`);
    console.log(`   1 attempt:   ${attempts[1]}`);
    console.log(`   2 attempts:  ${attempts[2]}`);
    console.log(`   3+ attempts: ${attempts["3+"]}  (candidates for auto-DNC)`);
    console.log("");

    console.log("🗺️  Top cities (top 10)");
    topCities.forEach(([city, n]) => {
        console.log(`   ${n.toString().padStart(4)}  ${city}`);
    });
    console.log("");

    console.log("🚦 Pre-dispatch coverage gate prediction (next coldCallPrep run)");
    const NAME_GATE = 70;
    const EMAIL_GATE = 60;
    const namePass = namePct >= NAME_GATE;
    const emailPass = emailPct >= EMAIL_GATE;
    console.log(`   Name gate (≥${NAME_GATE}%):  ${namePass ? "✅ PASS" : "❌ FAIL"}  (${namePct.toFixed(1)}%)`);
    console.log(`   Email gate (≥${EMAIL_GATE}%): ${emailPass ? "✅ PASS" : "❌ FAIL"}  (${emailPct.toFixed(1)}%)`);
    console.log("");

    if (!namePass || !emailPass) {
        console.log("🚨 Next coldCallPrep run will BLOCK — pool needs better enrichment.");
        console.log("   Remediation:");
        console.log("   1. Trigger leadFinderAutoTopUp manually:");
        console.log("      gcloud scheduler jobs run firebase-schedule-leadFinderAutoTopUp-us-central1 --location=us-central1");
        console.log("   2. Confirm Hunter.io returns decision-maker titles for your city rotation.");
        console.log("   3. Re-run this audit in 2h.");
    } else {
        console.log("✅ Next coldCallPrep run will PASS coverage gate.");
    }

    process.exit(0);
}

main().catch((err) => {
    console.error("💥 phone_leads_quality failed:", err.message);
    console.error(err.stack);
    process.exit(1);
});
