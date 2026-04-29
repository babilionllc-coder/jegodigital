/**
 * Regression test for instantlyReplyRouter v2.3 (WhatsApp-first).
 * Run: node website/functions/test_replyRouter_v2.js
 *
 * Tests the PURE functions only (classifyIntent, geoFromLead, detectLang,
 * composeReply, nextTwoSlots, countWords). Network-side
 * (sendInstantlyReply, Slack, Telegram, Firestore) is skipped.
 *
 * Per Alex 2026-04-29: NO fake test results. Each test prints actual output
 * + expected check side-by-side. PASS only if actual matches expected.
 *
 * v2.3 — WhatsApp-first matrix (5 paths):
 *   A. phone known, any geo/intent → "Alex will WhatsApp you in 30 min" only
 *      (no Calendly, no WA-add-me, no slots — 0 links)
 *   B. phone unknown, MX, EXPLORE/TECH_Q → WA-add-me ONLY (1 link, no slots)
 *   C. phone unknown, MX, BUY → WA-add-me + slots + Calendly (2 links)
 *   D. phone unknown, MIAMI/CARIBBEAN/FALLBACK, any → slots + Calendly +
 *      WA-add-me (2 links)
 *   E. OOO/UNSUB/BOUNCE → null (no reply)
 *
 * Universal invariants:
 *   - sign-off "Alex / JegoDigital" (one line, no full name, no title)
 *   - no demo URL ever
 *   - no deprecated 998 787 5321 number ever
 *   - reply ≤ 90 words
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
// TEST A — phone-known, MX, EXPLORE → "Alex will WhatsApp you" ONLY (0 links)
// ========================================
section("TEST A — phone-KNOWN MX EXPLORE (Alex-will-ping path)");

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
assertEq("phone-KNOWN — NO time slots ('11am' absent)", /11am/i.test(phoneKnownReply), false);
assertEq("phone-KNOWN — NO 'add me' WA-add-me line", /Mejor por WhatsApp|Easier by WhatsApp/.test(phoneKnownReply), false);
const linkCountA = (phoneKnownReply.match(/<a\s/gi) || []).length;
assertEq("phone-KNOWN — 0 links in reply", linkCountA, 0);
assertUniversalInvariants("phone-KNOWN", phoneKnownReply);

// ========================================
// TEST B — phone-unknown, MX, EXPLORE → WA-add-me ONLY (1 link)
// ========================================
section("TEST B — phone-UNKNOWN MX EXPLORE (WA-add-me only)");

const mxExploreReply = router.composeReply({
    intent: "EXPLORE",
    lang: "es",
    geo: "MX",
    leadFirstName: "Carlos",
    slots: router.nextTwoSlots("MX", "es", FIXED_NOW),
});
console.log("\n  --- MX EXPLORE reply ---");
console.log(htmlToText(mxExploreReply));

assertTrue("MX EXPLORE — 'Mejor por WhatsApp' line present", /Mejor por WhatsApp/.test(mxExploreReply));
assertTrue("MX EXPLORE — wa.me/529982023263 link present", /wa\.me\/529982023263/.test(mxExploreReply));
assertEq("MX EXPLORE — NO Calendly link", /calendly\.com/i.test(mxExploreReply), false);
assertEq("MX EXPLORE — NO time slots", /11am/i.test(mxExploreReply), false);
const linkCountB = (mxExploreReply.match(/<a\s/gi) || []).length;
assertEq("MX EXPLORE — exactly 1 link (wa.me)", linkCountB, 1);
assertTrue("MX EXPLORE — 'Hola Carlos' greeting", htmlToText(mxExploreReply).includes("Hola Carlos"));
assertTrue("MX EXPLORE — proof line present (Flamingo Cancún)", /Flamingo Real Estate \(Cancún\)/.test(mxExploreReply));
assertUniversalInvariants("MX EXPLORE", mxExploreReply);

// ========================================
// TEST C — phone-unknown, MX, BUY → WA-add-me + slots + Calendly (2 links)
// ========================================
section("TEST C — phone-UNKNOWN MX BUY (WA-add-me + Calendly fallback)");

const mxBuyReply = router.composeReply({
    intent: "BUY",
    lang: "es",
    geo: "MX",
    leadFirstName: "Carlos",
    slots: router.nextTwoSlots("MX", "es", FIXED_NOW),
});
console.log("\n  --- MX BUY reply ---");
console.log(htmlToText(mxBuyReply));

assertTrue("MX BUY — 'Mejor por WhatsApp' line present", /Mejor por WhatsApp/.test(mxBuyReply));
assertTrue("MX BUY — wa.me/529982023263 link present", /wa\.me\/529982023263/.test(mxBuyReply));
assertTrue("MX BUY — Calendly link present", /calendly\.com\/jegoalexdigital\/30min/.test(mxBuyReply));
assertTrue("MX BUY — slot 1 (3pm)", /3pm/i.test(mxBuyReply));
assertTrue("MX BUY — slot 2 (11am)", /11am/i.test(mxBuyReply));
assertTrue("MX BUY — Spanish 'Jueves'", /Jueves/.test(htmlToText(mxBuyReply)));
const linkCountC = (mxBuyReply.match(/<a\s/gi) || []).length;
assertEq("MX BUY — exactly 2 links (wa.me + Calendly)", linkCountC, 2);
assertUniversalInvariants("MX BUY", mxBuyReply);

// ========================================
// TEST D1 — Andrea (CARIBBEAN, EN, BUY, no phone) → slots + Calendly + WA-add-me
// ========================================
section("TEST D1 — Andrea (CARIBBEAN/EN/BUY, no phone)");

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
assertTrue("Andrea — Calendly link present", /calendly\.com\/jegoalexdigital\/30min/.test(andreaReply));
assertTrue("Andrea — wa.me link present", /wa\.me\/529982023263/.test(andreaReply));
assertTrue("Andrea — 3pm slot present", /3pm/.test(andreaReply));
assertTrue("Andrea — TZ CDT label", /CDT/.test(andreaReply));
assertEq("Andrea — does NOT include Flamingo proof (Caribbean bank)", /Flamingo|Cancún/.test(htmlToText(andreaReply)), false);
const linkCountD1 = (andreaReply.match(/<a\s/gi) || []).length;
assertEq("Andrea — exactly 2 links", linkCountD1, 2);
assertUniversalInvariants("Andrea", andreaReply);

// ========================================
// TEST D2 — Miami Luis (MIAMI, EN, BUY, no phone) → same shape
// ========================================
section("TEST D2 — Miami Luis (MIAMI/EN/BUY, no phone)");

const miamiReply = router.composeReply({
    intent: "BUY", lang: "en", geo: "MIAMI",
    leadFirstName: "Luis",
    slots: router.nextTwoSlots("MIAMI", "en", FIXED_NOW),
});
console.log("\n  --- Miami reply ---");
console.log(htmlToText(miamiReply));

assertTrue("Miami — 'Hi Luis' greeting", htmlToText(miamiReply).includes("Hi Luis"));
assertTrue("Miami — Calendly link present", /calendly\.com\/jegoalexdigital\/30min/.test(miamiReply));
assertTrue("Miami — wa.me link present", /wa\.me\/529982023263/.test(miamiReply));
assertTrue("Miami — Solik proof line", /Solik \(Miami bilingual real estate\)/.test(miamiReply));
assertTrue("Miami — TZ EDT label", /EDT/.test(miamiReply));
const linkCountD2 = (miamiReply.match(/<a\s/gi) || []).length;
assertEq("Miami — exactly 2 links", linkCountD2, 2);
assertUniversalInvariants("Miami", miamiReply);

// ========================================
// TEST E1 — OOO ("out of office")
// ========================================
section("TEST E1 — OOO (must NOT reply)");

const oooBody = "I am out of office until Monday. I will reply when I return.";
assertEq("OOO intent", router.classifyIntent(oooBody), "OOO");
assertEq("OOO composeReply returns null", router.composeReply({
    intent: "OOO", lang: "en", geo: "FALLBACK",
}), null);

// ========================================
// TEST E2 — UNSUB ("please remove me")
// ========================================
section("TEST E2 — UNSUB (must NOT reply)");

const unsubBody = "Please remove me from your list.";
assertEq("UNSUB intent", router.classifyIntent(unsubBody), "UNSUB");
assertEq("UNSUB composeReply returns null", router.composeReply({
    intent: "UNSUB", lang: "en", geo: "FALLBACK",
}), null);

// ========================================
// TEST F — TECH_Q on MX, no phone → WA-add-me only
// ========================================
section("TEST F — TECH_Q MX, no phone (WA-add-me only)");

const techReply = router.composeReply({
    intent: "TECH_Q", lang: "en", geo: "MX",
    leadFirstName: "Roberto",
    slots: router.nextTwoSlots("MX", "en", FIXED_NOW),
});
console.log("\n  --- TECH_Q reply ---");
console.log(htmlToText(techReply));

assertTrue("TECH_Q MX — tech answer present", /agent trained on your listings/.test(techReply));
assertTrue("TECH_Q MX — wa.me link present", /wa\.me\/529982023263/.test(techReply));
assertEq("TECH_Q MX — NO Calendly link", /calendly\.com/i.test(techReply), false);
const linkCountF = (techReply.match(/<a\s/gi) || []).length;
assertEq("TECH_Q MX — exactly 1 link (wa.me)", linkCountF, 1);
assertUniversalInvariants("TECH_Q MX", techReply);

// ========================================
// TEST G — geo bug regression: ceo@fastoffice.mx must detect MX
// ========================================
section("TEST G — geo regression: .mx domain must detect MX");

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
// TEST H — nextTwoSlots determinism (unchanged from v2.2)
// ========================================
section("TEST H — nextTwoSlots() weekend skip + format");

const wedSlots = router.nextTwoSlots("MX", "en", new Date("2026-04-29T15:00:00Z"));
assertEq("Wed → slot 1", wedSlots[0], "Thursday April 30 at 3pm CDT");
assertEq("Wed → slot 2", wedSlots[1], "Friday May 1 at 11am CDT");

const friSlots = router.nextTwoSlots("MIAMI", "en", new Date("2026-05-01T15:00:00Z"));
assertEq("Fri → slot 1 skips weekend", friSlots[0], "Monday May 4 at 3pm EDT");
assertEq("Fri → slot 2", friSlots[1], "Tuesday May 5 at 11am EDT");

// ========================================
// SUMMARY
// ========================================
console.log("\n========================================");
console.log(`PASSED: ${passed}`);
console.log(`FAILED: ${failed}`);
console.log("========================================");
if (failed > 0) {
    console.log("\nFailures:");
    failures.forEach(f => {
        console.log(`  - ${f.label}: got ${JSON.stringify(f.actual)} expected ${JSON.stringify(f.expected)}`);
    });
    process.exit(1);
}
process.exit(0);
