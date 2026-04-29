/**
 * Regression test for instantlyReplyRouter v2.1.
 * Run: node website/functions/test_replyRouter_v2.js
 *
 * Tests the PURE functions only (classifyIntent, geoFromLead, detectLang,
 * composeReply, nextTwoSlots, resolveDemoUrl). Network-side
 * (sendInstantlyReply, Slack, Firestore) is skipped — those are
 * integration-tested by the deploy + smoke test.
 *
 * Per Alex 2026-04-29: NO fake test results. Each test prints actual output
 * + expected check side-by-side. PASS only if actual matches expected.
 *
 * v2.1 — verifies the FULL close package on every BUY / TECH_Q / EXPLORE:
 *   1. Acknowledgment
 *   2. Geo-matched proof
 *   3. Demo link (campaign-routed)
 *   4. 2 specific time slots (next 2 business days, 3pm + 11am, geo TZ)
 *   5. Calendly link
 *   6. WhatsApp ONLY for MX (omit for CARIBBEAN / MIAMI / FALLBACK)
 *   7. "Alex / JegoDigital" sign-off (no full name, no title)
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

function section(name) {
    console.log(`\n=== ${name} ===`);
}

/**
 * Strip HTML to plain text for human-readable preview only.
 * Tests assert against the raw HTML body where possible.
 */
function htmlToText(html) {
    return String(html || "")
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<\/?div>/gi, "\n")
        .replace(/<\/?[a-z][^>]*>/gi, "")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
}

/**
 * Standard close-package assertion — used by all 3 BUY/TECH_Q/EXPLORE tests.
 * Verifies all 5 elements + sign-off + WhatsApp inclusion logic.
 */
function assertClosePackage(label, html, expectations) {
    const {
        expectLang,        // "en" | "es"
        expectGreeting,    // exact greeting text e.g. "Hi Andrea"
        expectProofWords,  // RegExp — proof must match
        expectDemoUrl,     // exact URL substring
        expectIncludesWA,  // true → must include +52 998 202 3263; false → must NOT
        expectTzLabel,     // "CDT" | "EDT" — slot timezone label
    } = expectations;
    const text = htmlToText(html);

    // 1. Greeting / acknowledgment
    assertEq(`${label} — greeting present (${expectGreeting})`, text.includes(expectGreeting), true);

    // 2. Geo proof (regex)
    assertEq(`${label} — geo proof matches`, expectProofWords.test(text), true);

    // 3. Demo URL
    assertEq(`${label} — demo URL present (${expectDemoUrl})`, html.includes(expectDemoUrl), true);

    // 4. 2 time slots: must contain "3pm" + "11am" + geo TZ label
    assertEq(`${label} — slot 1 (3pm) present`, /3pm/i.test(text), true);
    assertEq(`${label} — slot 2 (11am) present`, /11am/i.test(text), true);
    assertEq(`${label} — TZ label (${expectTzLabel}) present`, text.includes(expectTzLabel), true);
    assertEq(`${label} — bullet list rendered`, /•/.test(text), true);

    // 5. Calendly URL
    assertEq(`${label} — Calendly URL present`, html.includes("calendly.com/jegoalexdigital/30min"), true);

    // 6. WhatsApp inclusion (MX only)
    if (expectIncludesWA) {
        assertEq(`${label} — WhatsApp line present (MX)`, html.includes("+52 998 202 3263"), true);
    } else {
        assertEq(`${label} — WhatsApp line OMITTED (international)`, html.includes("+52 998 202 3263"), false);
    }

    // 7. Sign-off "Alex / JegoDigital" (split across 2 div lines)
    assertEq(`${label} — Alex sign-off present`, /Alex/.test(text), true);
    assertEq(`${label} — JegoDigital sign-off present`, /JegoDigital/.test(text), true);
    // Negative: no full name, no title (Iron Rule #5)
    assertEq(`${label} — no "Alex Jego" full name`, /Alex Jego/.test(text), false);
    assertEq(`${label} — no "Founder" / "CEO" title`, /\b(founder|ceo|cofounder|director general)\b/i.test(text), false);
}

// Fixed "now" date for deterministic slot tests — Wed 2026-04-29 09:00 CDT.
// Next business day = Thursday 2026-04-30, day after = Friday 2026-05-01.
const FIXED_NOW = new Date("2026-04-29T15:00:00Z");

// ========================================
// TEST 1 — Andrea (DR / English / BUY / Trojan Horse)
// ========================================
section("TEST 1 — Andrea Bieganowska (DR, English, BUY, Trojan Horse)");

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
    leadCompanyName: "Blue Caribbean Properties",
    demoUrl: router.resolveDemoUrl({ campaignId: "cd9f1abf-3ad5-460c-88e9-29c48bc058b3" }), // Trojan Horse
    slots: router.nextTwoSlots("CARIBBEAN", "en", FIXED_NOW),
});

assertClosePackage("Andrea", andreaReply, {
    expectLang: "en",
    expectGreeting: "Hi Andrea",
    expectProofWords: /88% of inbound for similar agencies in the region/i,
    expectDemoUrl: "jegodigital.com/lead-capture-demo",
    expectIncludesWA: false, // CARIBBEAN — no WhatsApp
    expectTzLabel: "CDT",
});
// Andrea-specific guards (the original disaster)
assertEq("Andrea — does NOT include Cancún Flamingo proof", /Flamingo|Cancún|Cancun/.test(htmlToText(andreaReply)), false);
assertEq("Andrea — personalized demo line uses company name", /Blue Caribbean Properties/.test(andreaReply), true);

console.log("\n  --- Andrea predicted reply ---");
console.log(htmlToText(andreaReply));

// ========================================
// TEST 2 — MX prospect (Spanish / BUY / Trojan Horse / WhatsApp)
// ========================================
section("TEST 2 — MX prospect (Spanish, 'me interesa', Trojan Horse)");

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
    leadCompanyName: "Inmobiliaria Cancún",
    demoUrl: router.resolveDemoUrl({ campaignId: "cd9f1abf-3ad5-460c-88e9-29c48bc058b3" }), // Trojan Horse
    slots: router.nextTwoSlots("MX", "es", FIXED_NOW),
});

assertClosePackage("MX", mxReply, {
    expectLang: "es",
    expectGreeting: "Hola Carlos",
    expectProofWords: /Flamingo Real Estate \(Cancún\) automatizó 88% de los leads inbound/i,
    expectDemoUrl: "jegodigital.com/lead-capture-demo",
    expectIncludesWA: true, // MX — must include WhatsApp
    expectTzLabel: "CDT",
});
// MX-specific guards
assertEq("MX — Spanish slot day name (Jueves)", /Jueves/.test(htmlToText(mxReply)), true);
assertEq("MX — Spanish month name (abril)", /abril/.test(htmlToText(mxReply)), true);

console.log("\n  --- MX predicted reply ---");
console.log(htmlToText(mxReply));

// ========================================
// TEST 3 — Miami Hispanic (English / BUY / Trojan Horse)
// ========================================
section("TEST 3 — Miami Hispanic (English, 'what's the price?', Trojan Horse)");

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
    leadCompanyName: "Miami Luxury Homes",
    demoUrl: router.resolveDemoUrl({ campaignId: "cd9f1abf-3ad5-460c-88e9-29c48bc058b3" }), // Trojan Horse
    slots: router.nextTwoSlots("MIAMI", "en", FIXED_NOW),
});

assertClosePackage("Miami", miamiReply, {
    expectLang: "en",
    expectGreeting: "Hi Luis",
    expectProofWords: /Solik \(Miami bilingual real estate\) gets 24\/7 EN\+ES auto-capture/i,
    expectDemoUrl: "jegodigital.com/lead-capture-demo",
    expectIncludesWA: false, // MIAMI — no WhatsApp
    expectTzLabel: "EDT",
});

console.log("\n  --- Miami predicted reply ---");
console.log(htmlToText(miamiReply));

// ========================================
// TEST 4 — OOO ("out of office, back Monday")
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
// TEST 6 — TECH_Q ("are you AI?") — full close package
// ========================================
section("TEST 6 — TECH_Q (English, 'are you human?', Trojan Horse)");

const techBody = "Are you human or is this an AI?";
const techIntent = router.classifyIntent(techBody);
assertEq("intent", techIntent, "TECH_Q");

const techReply = router.composeReply({
    intent: techIntent,
    lang: "en",
    geo: "MX",
    leadFirstName: "Roberto",
    leadCompanyName: "Inmobiliaria CDMX",
    demoUrl: router.DEMO_LEAD_CAPTURE,
    slots: router.nextTwoSlots("MX", "en", FIXED_NOW),
});

assertClosePackage("TECH_Q", techReply, {
    expectLang: "en",
    expectGreeting: "Hi Roberto",
    expectProofWords: /agent trained on your listings/i, // tech answer instead of stat
    expectDemoUrl: "jegodigital.com/lead-capture-demo",
    expectIncludesWA: true, // MX — WhatsApp included
    expectTzLabel: "CDT",
});

// ========================================
// TEST 7 — SEO/AEO campaign routes to seo-aeo-demo URL
// ========================================
section("TEST 7 — Campaign routing (SEO + Visibilidad → seo-aeo-demo)");

const seoUrl = router.resolveDemoUrl({ campaignId: "67fa7834-4dba-4ed9-97e2-0e9c53f8a6ed" });
assertEq("SEO campaign → seo-aeo-demo", seoUrl, "https://jegodigital.com/seo-aeo-demo");

const trojanUrl = router.resolveDemoUrl({ campaignId: "cd9f1abf-3ad5-460c-88e9-29c48bc058b3" });
assertEq("Trojan Horse → lead-capture-demo", trojanUrl, "https://jegodigital.com/lead-capture-demo");

const wcUrl = router.resolveDemoUrl({ campaignName: "World Cup 2026" });
assertEq("World Cup (name fallback) → lead-capture-demo", wcUrl, "https://jegodigital.com/lead-capture-demo");

const stlUrl = router.resolveDemoUrl({ campaignName: "Speed-to-Lead" });
assertEq("Speed-to-Lead (name fallback) → lead-capture-demo", stlUrl, "https://jegodigital.com/lead-capture-demo");

const chatgptUrl = router.resolveDemoUrl({ campaignName: "ChatGPT Angle" });
assertEq("ChatGPT Angle (name fallback) → seo-aeo-demo", chatgptUrl, "https://jegodigital.com/seo-aeo-demo");

const unknownUrl = router.resolveDemoUrl({});
assertEq("unknown campaign → default lead-capture-demo", unknownUrl, "https://jegodigital.com/lead-capture-demo");

// ========================================
// TEST 8 — nextTwoSlots() determinism + business-day skip
// ========================================
section("TEST 8 — nextTwoSlots() weekend skip + format");

// Wednesday 2026-04-29 → next biz days = Thursday 2026-04-30 + Friday 2026-05-01
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
