/**
 * Regression test for instantlyReplyRouter v2.2.
 * Run: node website/functions/test_replyRouter_v2.js
 *
 * Tests the PURE functions only (classifyIntent, geoFromLead, detectLang,
 * composeReply, nextTwoSlots, countWords). Network-side
 * (sendInstantlyReply, Slack, Firestore) is skipped — those are
 * integration-tested by the deploy + smoke test.
 *
 * Per Alex 2026-04-29: NO fake test results. Each test prints actual output
 * + expected check side-by-side. PASS only if actual matches expected.
 *
 * v2.2 — verifies the SIMPLIFIED close package on every BUY / TECH_Q / EXPLORE:
 *   1. Acknowledgment (1 line)
 *   2. Geo-matched proof (1 line)
 *   3. 2 specific time slots (next 2 business days, 3pm + 11am, geo TZ)
 *   4. Calendly link (single CTA — NO demo URL)
 *   5. WhatsApp ONLY for MX (omit for CARIBBEAN / MIAMI / FALLBACK)
 *   6. "Alex / JegoDigital" sign-off (no full name, no title)
 *   7. Reply length ≤ 90 words (Instantly 2026 benchmark)
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

/**
 * Standard close-package assertion — verifies all 7 v2.2 elements.
 */
function assertClosePackage(label, html, expectations) {
    const {
        expectGreeting,
        expectProofWords,
        expectIncludesWA,
        expectTzLabel,
    } = expectations;
    const text = htmlToText(html);

    // 1. Greeting / acknowledgment
    assertTrue(`${label} — greeting present (${expectGreeting})`, text.includes(expectGreeting));

    // 2. Geo proof
    assertTrue(`${label} — geo proof matches`, expectProofWords.test(text));

    // 3. NO demo URL (v2.2 hard rule — single Calendly CTA only)
    assertEq(`${label} — NO demo URL present`, /jegodigital\.com\/(lead-capture-demo|seo-aeo-demo|demo)/i.test(html), false);

    // 4. 2 time slots: must contain "3pm" + "11am" + geo TZ label + bullet
    assertTrue(`${label} — slot 1 (3pm) present`, /3pm/i.test(text));
    assertTrue(`${label} — slot 2 (11am) present`, /11am/i.test(text));
    assertTrue(`${label} — TZ label (${expectTzLabel}) present`, text.includes(expectTzLabel));
    assertTrue(`${label} — bullet list rendered`, /•/.test(text));

    // 5. Calendly URL — exactly one (no other URLs)
    assertTrue(`${label} — Calendly URL present`, html.includes("calendly.com/jegoalexdigital/30min"));
    const linkCount = (html.match(/<a\s/gi) || []).length;
    assertEq(`${label} — exactly 1 link in reply`, linkCount, 1);

    // 6. WhatsApp inclusion (MX only)
    if (expectIncludesWA) {
        assertTrue(`${label} — WhatsApp line present (MX)`, html.includes("+52 998 202 3263"));
    } else {
        assertEq(`${label} — WhatsApp line OMITTED (international)`, html.includes("+52 998 202 3263"), false);
    }
    // Old number must NEVER appear
    assertEq(`${label} — deprecated 998 787 5321 not present`, /998[\s\-]?787[\s\-]?5321/.test(html), false);

    // 7. Sign-off "Alex / JegoDigital" on one line
    assertTrue(`${label} — "Alex / JegoDigital" sign-off`, /Alex \/ JegoDigital/.test(text));
    assertEq(`${label} — no "Alex Jego" full name`, /Alex Jego/.test(text), false);
    assertEq(`${label} — no "Founder" / "CEO" title`, /\b(founder|ceo|cofounder|director general)\b/i.test(text), false);

    // 8. Word count ≤ 90 (soft cap, but Alex's reference outputs are ~46-55 words)
    const wc = router.countWords(html);
    console.log(`  📏 ${label} — word count: ${wc} (limit ${router.WORD_LIMIT})`);
    assertTrue(`${label} — word count ≤ ${router.WORD_LIMIT}`, wc <= router.WORD_LIMIT);
}

// Fixed "now" date for deterministic slot tests — Wed 2026-04-29 09:00 CDT.
// Next business day = Thursday 2026-04-30, day after = Friday 2026-05-01.
const FIXED_NOW = new Date("2026-04-29T15:00:00Z");

// ========================================
// TEST 1 — Andrea (DR / English / BUY) — must NOT include WhatsApp
// ========================================
section("TEST 1 — Andrea Bieganowska (DR, English, BUY)");

const andreaLead = {
    email: "andrea@bluecaribbeanproperties.com",
    website: "bluecaribbeanproperties.com",
    city: "Punta Cana",
    first_name: "Andrea",
    company_name: "Blue Caribbean Properties",
};
const andreaBody = "Hi, please send me the offer. Wysłane z iPhone'a";

const andreaIntent = router.classifyIntent(andreaBody);
const andreaGeo = router.geoFromLead(andreaLead);
const andreaLang = router.detectLang(andreaBody);

assertEq("intent", andreaIntent, "BUY");
assertEq("geo", andreaGeo, "CARIBBEAN");
assertEq("lang", andreaLang, "en");

const andreaReply = router.composeReply({
    intent: andreaIntent,
    lang: andreaLang || "en",
    geo: andreaGeo,
    leadFirstName: "Andrea",
    slots: router.nextTwoSlots("CARIBBEAN", "en", FIXED_NOW),
});

assertClosePackage("Andrea", andreaReply, {
    expectGreeting: "Hi Andrea",
    expectProofWords: /We've automated 88% of inbound for similar agencies in the region/i,
    expectIncludesWA: false, // CARIBBEAN — no WhatsApp per Alex reference
    expectTzLabel: "CDT",
});
// Andrea-specific guards (the original disaster regression)
assertEq("Andrea — does NOT include Cancún Flamingo proof", /Flamingo|Cancún|Cancun/.test(htmlToText(andreaReply)), false);

console.log("\n  --- Andrea predicted reply ---");
console.log(htmlToText(andreaReply));

// ========================================
// TEST 2 — MX prospect (Spanish / "me interesa") — MUST include WhatsApp
// ========================================
section("TEST 2 — MX prospect (Spanish, 'me interesa')");

const mxLead = {
    email: "carlos@inmobiliariacancun.com.mx",
    website: "inmobiliariacancun.com.mx",
    city: "Cancún",
    first_name: "Carlos",
    company_name: "Inmobiliaria Cancún",
};
const mxBody = "Hola, me interesa saber más sobre lo que ofrecen.";

const mxIntent = router.classifyIntent(mxBody);
const mxGeo = router.geoFromLead(mxLead);
const mxLang = router.detectLang(mxBody);

console.log(`  (intent=${mxIntent} — BUY or EXPLORE both valid for "me interesa")`);
assertEq("geo", mxGeo, "MX");
assertEq("lang", mxLang, "es");

const mxReply = router.composeReply({
    intent: mxIntent,
    lang: mxLang || "es",
    geo: mxGeo,
    leadFirstName: "Carlos",
    slots: router.nextTwoSlots("MX", "es", FIXED_NOW),
});

assertClosePackage("MX", mxReply, {
    expectGreeting: "Hola Carlos",
    expectProofWords: /Flamingo Real Estate \(Cancún\) automatizó 88% de leads inbound y subió 4\.4x su visibilidad/i,
    expectIncludesWA: true, // MX — must include WhatsApp
    expectTzLabel: "CDT",
});
// MX-specific guards
assertTrue("MX — Spanish slot day (Jueves)", /Jueves/.test(htmlToText(mxReply)));
assertTrue("MX — Spanish month (abril)", /abril/.test(htmlToText(mxReply)));
assertTrue("MX — Spanish 'Si no, agarra slot:' line", /Si no, agarra slot:/i.test(htmlToText(mxReply)));

console.log("\n  --- MX predicted reply ---");
console.log(htmlToText(mxReply));

// ========================================
// TEST 3 — Miami Hispanic (English / BUY) — must NOT include WhatsApp
// ========================================
section("TEST 3 — Miami Hispanic (English, 'what's the price?')");

const miamiLead = {
    email: "luis@miamiluxuryhomes.com",
    website: "miamiluxuryhomes.com",
    city: "Miami",
    first_name: "Luis",
    company_name: "Miami Luxury Homes",
};
const miamiBody = "Hi, what's the price for this?";

const miamiIntent = router.classifyIntent(miamiBody);
const miamiGeo = router.geoFromLead(miamiLead);
const miamiLang = router.detectLang(miamiBody);

assertEq("intent", miamiIntent, "BUY");
assertEq("geo", miamiGeo, "MIAMI");
assertEq("lang", miamiLang, "en");

const miamiReply = router.composeReply({
    intent: miamiIntent,
    lang: miamiLang || "en",
    geo: miamiGeo,
    leadFirstName: "Luis",
    slots: router.nextTwoSlots("MIAMI", "en", FIXED_NOW),
});

assertClosePackage("Miami", miamiReply, {
    expectGreeting: "Hi Luis",
    expectProofWords: /Solik \(Miami bilingual real estate\) gets 24\/7 EN\+ES auto-capture/i,
    expectIncludesWA: false, // MIAMI — no WhatsApp
    expectTzLabel: "EDT",
});

console.log("\n  --- Miami predicted reply ---");
console.log(htmlToText(miamiReply));

// ========================================
// TEST 4 — OOO ("out of office")
// ========================================
section("TEST 4 — OOO autoreply (must NOT reply)");

const oooBody = "I am out of office until Monday. I will reply when I return.";
const oooIntent = router.classifyIntent(oooBody);
assertEq("intent", oooIntent, "OOO");

const oooReply = router.composeReply({
    intent: oooIntent, lang: "en", geo: "FALLBACK", leadFirstName: "",
});
assertEq("composeReply returns null (no reply sent)", oooReply, null);

// ========================================
// TEST 5 — Unsubscribe ("please remove me")
// ========================================
section("TEST 5 — Unsubscribe (must NOT reply)");

const unsubBody = "Please remove me from your list.";
const unsubIntent = router.classifyIntent(unsubBody);
assertEq("intent", unsubIntent, "UNSUB");

const unsubReply = router.composeReply({
    intent: unsubIntent, lang: "en", geo: "FALLBACK", leadFirstName: "",
});
assertEq("composeReply returns null (no reply sent)", unsubReply, null);

// ========================================
// TEST 6 — TECH_Q ("are you AI?") — full close package, MX with WhatsApp
// ========================================
section("TEST 6 — TECH_Q (English, 'are you human?', MX prospect)");

const techBody = "Are you human or is this an AI?";
const techIntent = router.classifyIntent(techBody);
assertEq("intent", techIntent, "TECH_Q");

const techReply = router.composeReply({
    intent: techIntent,
    lang: "en",
    geo: "MX",
    leadFirstName: "Roberto",
    slots: router.nextTwoSlots("MX", "en", FIXED_NOW),
});

assertClosePackage("TECH_Q", techReply, {
    expectGreeting: "Hi Roberto",
    expectProofWords: /agent trained on your listings/i,
    expectIncludesWA: true, // MX — WhatsApp included
    expectTzLabel: "CDT",
});

// ========================================
// TEST 7 — nextTwoSlots() determinism + business-day skip
// ========================================
section("TEST 7 — nextTwoSlots() weekend skip + format");

// Wednesday 2026-04-29 → Thursday 2026-04-30 + Friday 2026-05-01
const wedSlots = router.nextTwoSlots("MX", "en", new Date("2026-04-29T15:00:00Z"));
assertEq("Wed → slot 1 = Thursday April 30 at 3pm CDT", wedSlots[0], "Thursday April 30 at 3pm CDT");
assertEq("Wed → slot 2 = Friday May 1 at 11am CDT", wedSlots[1], "Friday May 1 at 11am CDT");

// Friday 2026-05-01 → must skip Sat+Sun, slot1 = Mon May 4, slot2 = Tue May 5
const friSlots = router.nextTwoSlots("MIAMI", "en", new Date("2026-05-01T15:00:00Z"));
assertEq("Fri → slot 1 skips weekend = Monday May 4 at 3pm EDT", friSlots[0], "Monday May 4 at 3pm EDT");
assertEq("Fri → slot 2 = Tuesday May 5 at 11am EDT", friSlots[1], "Tuesday May 5 at 11am EDT");

// Spanish formatting check
const esSlots = router.nextTwoSlots("MX", "es", new Date("2026-04-29T15:00:00Z"));
assertEq("ES → slot 1 = Jueves 30 abril a las 3pm CDT", esSlots[0], "Jueves 30 abril a las 3pm CDT");
assertEq("ES → slot 2 = Viernes 1 mayo a las 11am CDT", esSlots[1], "Viernes 1 mayo a las 11am CDT");

// ========================================
// TEST 8 — Word count guard
// ========================================
section("TEST 8 — Word count guard");

const sampleAndreaWC = router.countWords(andreaReply);
const sampleMxWC = router.countWords(mxReply);
const sampleMiamiWC = router.countWords(miamiReply);

console.log(`  Andrea: ${sampleAndreaWC} words | MX: ${sampleMxWC} words | Miami: ${sampleMiamiWC} words`);
assertTrue(`Andrea ≤ 90 words`, sampleAndreaWC <= router.WORD_LIMIT);
assertTrue(`MX ≤ 90 words`, sampleMxWC <= router.WORD_LIMIT);
assertTrue(`Miami ≤ 90 words`, sampleMiamiWC <= router.WORD_LIMIT);

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
