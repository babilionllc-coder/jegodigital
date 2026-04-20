#!/usr/bin/env node
/**
 * seed_phone_leads.cjs — one-shot Firestore seeder for phone_leads.
 *
 * Reads leads/DIAL_READY_2026-04-19_consolidated.csv + all
 * leads/cold_call_*_2026-04-19.csv, dedups by phone, upserts into
 * Firestore phone_leads collection with:
 *   - phone_verified: true
 *   - do_not_call: false
 *   - last_called_at: null     (coldCallPrep wants oldest-first)
 *   - source: "dial_ready_2026-04-19"
 *
 * Run with:
 *   GOOGLE_APPLICATION_CREDENTIALS=./jegodigital-e02fb-a05ae4cb7645.json \
 *     node tools/seed_phone_leads.cjs
 *
 * Idempotent — re-run safely. Doc ID is normalized phone (+52... without spaces).
 */
const fs = require("fs");
const path = require("path");
const admin = require("firebase-admin");

const ROOT = path.resolve(__dirname, "..");
const SA_PATH = process.env.GOOGLE_APPLICATION_CREDENTIALS
    || path.join(ROOT, "jegodigital-e02fb-a05ae4cb7645.json");

if (!fs.existsSync(SA_PATH)) {
    console.error(`❌ service account not found at ${SA_PATH}`);
    process.exit(1);
}

admin.initializeApp({
    credential: admin.credential.cert(require(SA_PATH)),
    projectId: "jegodigital-e02fb",
});
const db = admin.firestore();

// --- CSV parser (minimal — no quoted-comma support needed, our CSVs are clean) ---
function parseCsv(filePath) {
    const raw = fs.readFileSync(filePath, "utf8").trim();
    if (!raw) return [];
    const lines = raw.split(/\r?\n/);
    const headers = lines[0].split(",").map((h) => h.trim());
    return lines.slice(1).map((line) => {
        const cells = line.split(",");
        const row = {};
        headers.forEach((h, i) => { row[h] = (cells[i] || "").trim(); });
        return row;
    });
}

function normalizePhone(phone) {
    if (!phone) return null;
    const digits = phone.replace(/[^\d+]/g, "");
    if (digits.length < 10) return null;
    return digits.startsWith("+") ? digits : `+${digits}`;
}

// --- Gather all CSVs ---
const CSV_FILES = [
    path.join(ROOT, "leads", "DIAL_READY_2026-04-19_consolidated.csv"),
    ...fs.readdirSync(path.join(ROOT, "leads"))
        .filter((f) => f.startsWith("cold_call_") && f.endsWith("_2026-04-19.csv"))
        .map((f) => path.join(ROOT, "leads", f)),
];

const byPhone = new Map();
for (const f of CSV_FILES) {
    if (!fs.existsSync(f)) continue;
    const rows = parseCsv(f);
    for (const r of rows) {
        const phone = normalizePhone(r.phone);
        if (!phone) continue;
        // Keep the row with highest score if duplicate
        const existing = byPhone.get(phone);
        const score = parseInt(r.score || "0", 10);
        if (!existing || score > parseInt(existing.score || "0", 10)) {
            byPhone.set(phone, { ...r, phone });
        }
    }
}

console.log(`📊 Parsed ${CSV_FILES.length} CSV files → ${byPhone.size} unique phones.`);

async function main() {
    // Pre-flight: current phone_leads count
    const preSnap = await db.collection("phone_leads")
        .where("phone_verified", "==", true)
        .where("do_not_call", "==", false)
        .get();
    console.log(`📥 Pre-seed phone_leads (eligible) count: ${preSnap.size}`);

    let upserts = 0;
    let skipped = 0;
    const batch = db.batch();
    let pending = 0;

    for (const [phone, r] of byPhone) {
        const docId = phone.replace(/[^\d]/g, ""); // digits-only as doc ID
        if (!docId) { skipped++; continue; }
        const ref = db.collection("phone_leads").doc(docId);
        batch.set(ref, {
            phone,
            first_name: r.first_name || "",
            last_name: r.last_name || "",
            name: `${r.first_name || ""} ${r.last_name || ""}`.trim() || "allá",
            email: r.email || "",
            company: r.company || "",
            company_name: r.company || "",
            website: r.website || "",
            city: r.city || "",
            position: r.position || "",
            google_rating: parseFloat(r.google_rating || "0") || null,
            score: parseInt(r.score || "0", 10) || 0,
            phone_verified: true,
            do_not_call: false,
            last_called_at: null,
            last_offer: null,
            last_conversation_id: null,
            source: "dial_ready_2026-04-19",
            seeded_at: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
        upserts++;
        pending++;
        if (pending >= 400) {
            await batch.commit();
            console.log(`  ↳ committed ${pending} writes`);
            pending = 0;
        }
    }
    if (pending > 0) {
        await batch.commit();
        console.log(`  ↳ committed ${pending} writes`);
    }

    // Post-flight: eligible count
    const postSnap = await db.collection("phone_leads")
        .where("phone_verified", "==", true)
        .where("do_not_call", "==", false)
        .get();
    console.log(`✅ Upserts: ${upserts}, skipped: ${skipped}`);
    console.log(`📤 Post-seed phone_leads (eligible) count: ${postSnap.size}`);
    console.log(`   Delta: +${postSnap.size - preSnap.size}`);
}

main()
    .then(() => process.exit(0))
    .catch((err) => { console.error("❌ seed failed:", err); process.exit(1); });
