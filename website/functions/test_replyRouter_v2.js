/**
 * Regression test for instantlyReplyRouter v2.3 (WhatsApp-first universal).
 * Run: node website/functions/test_replyRouter_v2.js
 *
 * v2.3 (2026-05-01) — universal WA-ask + Calendly fallback close per Alex
 * directive. End goal of every reply = WhatsApp conversation with Alex.
 *
 * Tests the PURE functions only (classifyIntent, geoFromLead, detectLang,
 * composeReply, nextTwoSlots, countWords). Network side
 * (sendInstantlyReply, Slack, Telegram, Firestore) is skipped.
 *
 * Per Alex 2026-04-29: NO fake test results. Each test prints actual output
 * + expected check side-by-side. PASS only if actual matches expected.
 *
 * v2.3 final matrix (2 paths):
 *   A. phone known, any geo/intent → "Alex will WhatsApp you in 30 min" only
 *      (no Calendly, no WA-ask, no slots — 0 links)
 *   B. phone unknown, any geo, BUY/EXPLORE/TECH_Q → WA-ask + Calendly fallback
 *      (2 links — wa.me + calendly)
 *   C. OOO/UNSUB/BOUNCE → null (no reply)
 *
 * Universal invariants:
 *   - sign-off "Alex / JegoDigital" (one line, no full name, no title)
 *   - no demo URL ever
 *   - no deprecated 998 787 5321 number ever
 *   - reply ≤ 90 words
 *   - new copy: ES "¿cuál es tu WhatsApp?" / EN "What's your best mobile to chat?"
 */
const router = require("./instantlyReplyRouter");

let passed = 0;
let failed = 0;
const failures = [];

function assertEq(label, actual, expected) {
    const ok = actual === expected;
    if (ok) {
        passed++;
        console.log(`  ✅ ${label}: ${JSON.stringify(actual)}`);
    } else {
        failed++;
        failures.push({ label, actual, expected });
        console.log(`  ❌ ${label}: got ${JSON.stringify(actual)} expected ${JSON.stringify(expected)}`);
    }
}

function assertTrue(label, actual) {
    return assertEq(label, !!actual, true);
}

function section(name) {
    console.log(`\n=== ${name} ===`);
}

/** Strip HTML to plain text for human-readable preview. */
function htmlToText(html) {
    return String(html || "")
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<\/?div>/gi, "\n")
        .replace(/<\/?[a-z][^>]*>/gi, "")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
}

/** Universal v2.3 invariants — no demo URL, no deprecated WA, signed correctly. */
function assertUniversalInvariants(label, html) {
    const text = htmlToText(html);
    assertEq(`${label} — NO demo URL present`, /jegodigital\.com\/(lead-capture-demo|seo-aeo-demo|demo)/i.test(html), false);
    assertEq(`${label} — NO deprecated 998 787 5321`, /998[\s\-]?787[\s\-]?5321/.test(html), false);
    assertTrue(`${label} — "Alex / JegoDigital" sign-off`, /Alex \/ JegoDigital/.test(text));
    assertEq(`${label} — no "Alex Jego" full name`, /Alex Jego/.test(text), false);
    assertEq(`${label} — no "Founder" / "CEO" title`, /\b(founder|ceo|cofounder|director general)\b/i.test(text), false);
    const wc = router.countWords(html);
    console.log(`  📏 ${label} — word count: ${wc} (limit ${router.WORD_LIMIT})`);
    assertTrue(`${label} — word count ≤ ${router.WORD_LIMIT}`, wc <= router.WORD_LIMIT);
}

// Fixed "now" date for deterministic slot tests — Wed 2026-04-29 09:00 CDT.
const FIXED_NOW = new Date("2026-04-29T15:00:00Z");

// ========================================
// SCENARIO 1 — Andrea (CARIBBEAN/EN/BUY, no phone)
// ========================================
section("SCENARIO 1 — Andrea (DR/EN/BUY, no phone)");

const andreaLead = {
    email: "andrea@bluecaribbeanproperties.com",
    website: "bluecaribbeanproperties.com",
    city: "Punta Cana",
    first_name: "Andrea",
};
const andreaIntent = router.classifyIntent("Hi, please send me the offer.");
const andreaGeo = router.geoFromLead(andreaLead);
const andreaLang = router.detectLang("Hi, please send me the offer.");
assertEq("Andrea intent", andreaIntent, "BUY");
assertEq("Andrea geo", andreaGeo, "CARIBBEAN");
assertEq("Andrea lang", andreaLang, "en");

const andreaReply = router.composeReply({
    intent: andreaIntent, lang: "en", geo: andreaGeo,
    leadFirstName: "Andrea",
    slots: router.nextTwoSlots(andreaGeo, "en", FIXED_NOW),
});
console.log("\n  --- Andrea reply ---");
console.log(htmlToText(andreaReply));

assertTrue("Andrea — 'Hi Andrea' greeting", htmlToText(andreaReply).includes("Hi Andrea"));
assertTrue("Andrea — Caribbean proof line present (88% inbound)", /88%/.test(htmlToText(andreaReply)));
assertTrue("Andrea — '+52 998 202 3263 (WhatsApp)' present", /\+52 998 202 3263.*\(WhatsApp\)/.test(htmlToText(andreaReply)));
assertTrue("Andrea — 'What's your best mobile to chat' present", /What's your best mobile to chat/.test(htmlToText(andreaReply)));
assertTrue("Andrea — Calendly fallback present", /Or if you prefer scheduling/.test(htmlToText(andreaReply)));
assertTrue("Andrea — Calendly link present", /calendly\.com\/jegoalexdigital\/30min/.test(andreaReply));
assertTrue("Andrea — wa.me link present", /wa\.me\/529982023263/.test(andreaReply));
assertEq("Andrea — does NOT include Flamingo proof (Caribbean bank)", /Flamingo|Cancún/.test(htmlToText(andreaReply)), false);
const linkCountAndrea = (andreaReply.match(/<a\s/gi) || []).length;
assertEq("Andrea — exactly 2 links (wa.me + Calendly)", linkCountAndrea, 2);
assertUniversalInvariants("Andrea", andreaReply);

// ========================================
// SCENARIO 2 — Carlos (MX/ES/BUY, no phone)
// ========================================
section("SCENARIO 2 — Carlos (MX/ES/BUY, no phone)");

const carlosLead = { email: "carlos@inmobiliariacancun.mx", website: "inmobiliariacancun.mx", city: "Cancún" };
const carlosBody = "Hola, me interesa. ¿Cuánto cuesta?";
const carlosIntent = router.classifyIntent(carlosBody);
const carlosGeo = router.geoFromLead(carlosLead);
const carlosLang = router.detectLang(carlosBody);
assertEq("Carlos intent", carlosIntent, "BUY");
assertEq("Carlos geo", carlosGeo, "MX");
assertEq("Carlos lang", carlosLang, "es");

const carlosReply = router.composeReply({
    intent: carlosIntent, lang: "es", geo: carlosGeo,
    leadFirstName: "Carlos",
    slots: router.nextTwoSlots(carlosGeo, "es", FIXED_NOW),
});
console.log("\n  --- Carlos reply ---");
console.log(htmlToText(carlosReply));

assertTrue("Carlos — 'Hola Carlos' greeting", htmlToText(carlosReply).includes("Hola Carlos"));
assertTrue("Carlos — Flamingo MX proof line", /Flamingo Real Estate \(Cancún\)/.test(htmlToText(carlosReply)));
assertTrue("Carlos — '¿cuál es tu WhatsApp?' present", /¿cuál es tu WhatsApp\?/.test(htmlToText(carlosReply)));
assertTrue("Carlos — '+52 998 202 3263' present", /\+52 998 202 3263/.test(htmlToText(carlosReply)));
assertTrue("Carlos — 'WhatsApp' literal present", /WhatsApp/.test(htmlToText(carlosReply)));
assertTrue("Carlos — Spanish Calendly fallback present", /O si prefieres agendar/.test(htmlToText(carlosReply)));
assertTrue("Carlos — Calendly link", /calendly\.com\/jegoalexdigital\/30min/.test(carlosReply));
assertTrue("Carlos — wa.me link", /wa\.me\/529982023263/.test(carlosReply));
const linkCountCarlos = (carlosReply.match(/<a\s/gi) || []).length;
assertEq("Carlos — exactly 2 links (wa.me + Calendly)", linkCountCarlos, 2);
assertUniversalInvariants("Carlos", carlosReply);

// ========================================
// SCENARIO 3 — Luis (Miami/EN/BUY, no phone)
// ========================================
section("SCENARIO 3 — Luis (Miami/EN/BUY, no phone)");

const luisLead = { email: "luis@miamiluxuryhomes.com", website: "miamiluxuryhomes.com", city: "Miami" };
const luisBody = "Hi, I'm interested. Send me the offer.";
const luisIntent = router.classifyIntent(luisBody);
const luisGeo = router.geoFromLead(luisLead);
const luisLang = router.detectLang(luisBody);
assertEq("Luis intent", luisIntent, "BUY");
assertEq("Luis geo", luisGeo, "MIAMI");
assertEq("Luis lang", luisLang, "en");

const luisReply = router.composeReply({
    intent: luisIntent, lang: "en", geo: luisGeo,
    leadFirstName: "Luis",
    slots: router.nextTwoSlots(luisGeo, "en", FIXED_NOW),
});
console.log("\n  --- Luis reply ---");
console.log(htmlToText(luisReply));

assertTrue("Luis — 'Hi Luis' greeting", htmlToText(luisReply).includes("Hi Luis"));
assertTrue("Luis — Solik (Miami) proof line", /Solik \(Miami bilingual real estate\)/.test(htmlToText(luisReply)));
assertTrue("Luis — 'What's your best mobile to chat' present", /What's your best mobile to chat/.test(htmlToText(luisReply)));
assertTrue("Luis — '+52 998 202 3263 (WhatsApp)' present", /\+52 998 202 3263.*\(WhatsApp\)/.test(htmlToText(luisReply)));
assertTrue("Luis — Calendly fallback present", /Or if you prefer scheduling/.test(htmlToText(luisReply)));
assertTrue("Luis — Calendly link", /calendly\.com\/jegoalexdigital\/30min/.test(luisReply));
assertTrue("Luis — wa.me link", /wa\.me\/529982023263/.test(luisReply));
const linkCountLuis = (luisReply.match(/<a\s/gi) || []).length;
assertEq("Luis — exactly 2 links (wa.me + Calendly)", linkCountLuis, 2);
assertUniversalInvariants("Luis", luisReply);

// ========================================
// SCENARIO 4 — OOO must NOT reply
// ========================================
section("SCENARIO 4 — OOO (must NOT reply)");

const oooBody = "I am out of office until Monday. I will reply when I return.";
assertEq("OOO intent", router.classifyIntent(oooBody), "OOO");
assertEq("OOO composeReply returns null", router.composeReply({
    intent: "OOO", lang: "en", geo: "FALLBACK",
}), null);

// ========================================
// SCENARIO 5 — UNSUB must NOT reply
// ========================================
section("SCENARIO 5 — UNSUB (must NOT reply)");

const unsubBody = "Please remove me from your list.";
assertEq("UNSUB intent", router.classifyIntent(unsubBody), "UNSUB");
assertEq("UNSUB composeReply returns null", router.composeReply({
    intent: "UNSUB", lang: "en", geo: "FALLBACK",
}), null);

// ========================================
// SCENARIO 6 — Phone-known still routes to Alex-will-ping (no other CTAs)
// ========================================
section("SCENARIO 6 — phone-KNOWN MX EXPLORE (Alex-will-ping path)");

const phoneKnownReply = router.composeReply({
    intent: "EXPLORE",
    lang: "es",
    geo: "MX",
    leadFirstName: "Carlos",
    leadPhone: "+529995551234",
    slots: router.nextTwoSlots("MX", "es", FIXED_NOW),
});
console.log("\n  --- Phone-KNOWN reply ---");
console.log(htmlToText(phoneKnownReply));

assertTrue("phone-KNOWN — 'WhatsApp en los próximos 30 min' present", /WhatsApp en los próximos 30 min/.test(phoneKnownReply));
assertTrue("phone-KNOWN — masked phone displayed (last 4 = 1234)", /1234/.test(phoneKnownReply));
assertEq("phone-KNOWN — NO Calendly link", /calendly\.com/i.test(phoneKnownReply), false);
assertEq("phone-KNOWN — NO 'WhatsApp ask' line", /¿cuál es tu WhatsApp\?|What's your best mobile to chat/.test(phoneKnownReply), false);
const linkCountPK = (phoneKnownReply.match(/<a\s/gi) || []).length;
assertEq("phone-KNOWN — 0 links in reply", linkCountPK, 0);
assertUniversalInvariants("phone-KNOWN", phoneKnownReply);

// ========================================
// SCENARIO 7 — TECH_Q (universal close: WA-ask + Calendly fallback)
// ========================================
section("SCENARIO 7 — TECH_Q MX no phone (universal close)");

const techReply = router.composeReply({
    intent: "TECH_Q", lang: "en", geo: "MX",
    leadFirstName: "Roberto",
    slots: router.nextTwoSlots("MX", "en", FIXED_NOW),
});
console.log("\n  --- TECH_Q reply ---");
console.log(htmlToText(techReply));

assertTrue("TECH_Q MX — tech answer present", /agent trained on your listings/.test(techReply));
assertTrue("TECH_Q MX — WA-ask line present", /What's your best mobile to chat/.test(htmlToText(techReply)));
assertTrue("TECH_Q MX — Calendly fallback present", /Or if you prefer scheduling/.test(htmlToText(techReply)));
assertTrue("TECH_Q MX — wa.me link", /wa\.me\/529982023263/.test(techReply));
assertTrue("TECH_Q MX — Calendly link", /calendly\.com\/jegoalexdigital\/30min/.test(techReply));
const linkCountTech = (techReply.match(/<a\s/gi) || []).length;
assertEq("TECH_Q MX — exactly 2 links (wa.me + Calendly)", linkCountTech, 2);
assertUniversalInvariants("TECH_Q MX", techReply);

// ========================================
// SCENARIO 8 — geo regression: ceo@fastoffice.mx must detect MX
// ========================================
section("SCENARIO 8 — geo regression: .mx domain must detect MX");

assertEq("ceo@fastoffice.mx + website fastoffice.mx → MX",
    router.geoFromLead({ email: "ceo@fastoffice.mx", website: "fastoffice.mx" }),
    "MX");
assertEq("just email .mx → MX",
    router.geoFromLead({ email: "lead@example.mx" }),
    "MX");
assertEq(".com.mx domain → MX",
    router.geoFromLead({ email: "ceo@firma.com.mx" }),
    "MX");

// ========================================
// SUMMARY
// ========================================
console.log("\n========================================");
console.log(`PASSED: ${passed}`);
console.log(`FAILED: ${failed}`);
console.log(`SCENARIOS: 8/8 (Andrea, Carlos, Luis, OOO, UNSUB, phone-KNOWN, TECH_Q, geo-regression)`);
console.log("========================================");
if (failed > 0) {
    console.log("\nFailures:");
    failures.forEach(f => {
        console.log(`  - ${f.label}: got ${JSON.stringify(f.actual)} expected ${JSON.stringify(f.expected)}`);
    });
    process.exit(1);
}
process.exit(0);
