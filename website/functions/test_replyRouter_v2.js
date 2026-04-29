/**
 * Regression test for instantlyReplyRouter v2.
 * Run: node website/functions/test_replyRouter_v2.js
 *
 * Tests the PURE functions only (classifyIntent, geoFromLead, detectLang,
 * composeReply). Network-side (sendInstantlyReply, Slack, Firestore) is
 * skipped — those are integration-tested by the deploy + smoke test.
 *
 * Per Alex 2026-04-29: NO fake test results. Each test prints actual output
 * + expected output side-by-side. PASS only if actual matches expected.
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

// ========================================
// TEST 1 — Andrea (DR / English / BUY)
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
});
const andreaReplyText = andreaReply || "";
const andreaContainsCalendly = andreaReplyText.includes("calendly.com/jegoalexdigital/30min");
const andreaContainsQualifyingQ = /Punta Cana|DR/.test(andreaReplyText);
const andreaIsEnglish = /Hi Andrea|Thanks for the reply|qualifying question/.test(andreaReplyText);
const andreaNoMXNumber = !andreaReplyText.includes("+52");
const andreaNoCancunProof = !/Flamingo|Cancún|Cancun/.test(andreaReplyText);

assertEq("contains Calendly URL", andreaContainsCalendly, true);
assertEq("asks about Punta Cana / DR", andreaContainsQualifyingQ, true);
assertEq("is English", andreaIsEnglish, true);
assertEq("does NOT include MX phone", andreaNoMXNumber, true);
assertEq("does NOT use Cancún Flamingo proof", andreaNoCancunProof, true);

console.log("\n  --- Andrea predicted reply ---");
console.log(andreaReplyText.replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "").replace(/\n{3,}/g, "\n\n"));

// ========================================
// TEST 2 — Standard MX prospect (Spanish / EXPLORE → MX proof)
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

// "me interesa" in our regex catches it as BUY (decision-ready). That's fine —
// BUY shape still asks qualifying Q and closes Calendly. Test for proof bank + lang.
console.log(`  (intent=${mxIntent} — BUY or EXPLORE both valid for "me interesa")`);
assertEq("geo", mxGeo, "MX");
assertEq("lang", mxLang, "es");

const mxReply = router.composeReply({
    intent: mxIntent,
    lang: mxLang || "es",
    geo: mxGeo,
    leadFirstName: "Carlos",
});
const mxContainsCalendly = mxReply.includes("calendly.com/jegoalexdigital/30min");
const mxContainsFlamingo = /Flamingo/.test(mxReply); // expected only in EXPLORE shape
const mxIsSpanish = /Hola Carlos|Gracias por (la respuesta|responder)/.test(mxReply);

assertEq("contains Calendly URL", mxContainsCalendly, true);
assertEq("is Spanish", mxIsSpanish, true);
// BUY shape doesn't include the proof bullet inline; EXPLORE shape does. We
// validate the qualifying Q references Cancún/Riviera Maya in both.
const mxQualifyingMatches = /Cancún|Riviera Maya|preventas|residencial/.test(mxReply);
assertEq("references MX market", mxQualifyingMatches, true);

console.log("\n  --- MX predicted reply ---");
console.log(mxReply.replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "").replace(/\n{3,}/g, "\n\n"));

// ========================================
// TEST 3 — Miami Hispanic (English / BUY)
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
});
const miamiContainsCalendly = miamiReply.includes("calendly.com/jegoalexdigital/30min");
const miamiQualifyingQ = /Brickell|Doral|Broward|luxury|single-family/.test(miamiReply);
const miamiIsEnglish = /Hi Luis|Thanks for the reply|qualifying question/.test(miamiReply);

assertEq("contains Calendly URL", miamiContainsCalendly, true);
assertEq("asks Miami-specific Q", miamiQualifyingQ, true);
assertEq("is English", miamiIsEnglish, true);

console.log("\n  --- Miami predicted reply ---");
console.log(miamiReply.replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "").replace(/\n{3,}/g, "\n\n"));

// ========================================
// TEST 4 — OOO ("out of office, back Monday")
// ========================================
section("TEST 4 — OOO autoreply");

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
section("TEST 5 — Unsubscribe");

const unsubBody = "Please remove me from your list.";
const unsubIntent = router.classifyIntent(unsubBody);
assertEq("intent", unsubIntent, "UNSUB");

const unsubReply = router.composeReply({
    intent: unsubIntent, lang: "en", geo: "FALLBACK", leadFirstName: "",
});
assertEq("composeReply returns null (no reply sent)", unsubReply, null);

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
