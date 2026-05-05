/**
 * Unit tests for complianceGate.js — 7 gates, one test each, plus overall.
 * Run: node website/functions/test_complianceGate.js
 *
 * No Firestore network — uses an in-memory mock DB. No Telegram/Slack — uses
 * `suppressAlerts: true` opt. No real Instantly/Twilio — health gate uses
 * soft-pass paths or injected `instantlyApiKey: ""`.
 *
 * Per HR-7 (proof): each test prints actual + expected side-by-side. PASS only
 * on match. Exit 1 on any FAIL.
 */
process.env.COMPLIANCE_GATE_ENFORCE = "true";
// Don't let node treat missing keys as missing — test paths use fakes.
process.env.INSTANTLY_API_KEY = process.env.INSTANTLY_API_KEY || "";

// Stub firebase-admin BEFORE require — we never want real network in tests.
const Module = require("module");
const origResolve = Module._resolveFilename;
const fakeAdmin = {
    apps: [{}],
    initializeApp() {},
    firestore: () => makeMockDb(),
};
fakeAdmin.firestore.FieldValue = { serverTimestamp: () => "SERVER_TS" };
fakeAdmin.firestore.Timestamp = {
    fromDate: (d) => ({ _d: d, toMillis: () => d.getTime() }),
};

// Expose mockDb so tests can mutate it
let MOCK_DB_STATE = null;
function makeMockDb() {
    if (MOCK_DB_STATE) return MOCK_DB_STATE.api;
    const optouts = new Map();        // key → {reason, at}
    const sendLog = [];               // {leadKey, ts:Date, channel}
    const blocksLog = [];             // {channel, reason, ...}

    const api = {
        _optouts: optouts,
        _sendLog: sendLog,
        _blocksLog: blocksLog,
        collection(name) {
            return new Coll(name, api);
        },
    };
    MOCK_DB_STATE = { api };
    return api;
}
class Coll {
    constructor(name, db) { this.name = name; this.db = db; this._where = []; this._limit = 999; }
    doc(id) { return new Doc(id, this.name, this.db); }
    where(field, op, val) { const c = new Coll(this.name, this.db); c._where = [...this._where, [field, op, val]]; return c; }
    limit(n) { this._limit = n; return this; }
    async add(data) { /* track for log inspection */
        if (this.name === "compliance_blocks") this.db._blocksLog.push(data);
        if (this.name === "compliance_send_log") {
            this.db._sendLog.push({ ...data, ts: new Date() }); // turn server-ts into now
        }
        return { id: "mock-" + Math.random().toString(36).slice(2) };
    }
    async get() {
        // Used by frequency gate
        if (this.name === "compliance_send_log") {
            const wLeadKey = this._where.find(([f]) => f === "leadKey")?.[2];
            const wSinceTs = this._where.find(([f]) => f === "ts")?.[2];
            const since = wSinceTs?._d ? wSinceTs._d.getTime() : 0;
            const matches = this.db._sendLog.filter((row) => {
                const tsMs = (row.ts instanceof Date) ? row.ts.getTime() : 0;
                return row.leadKey === wLeadKey && tsMs >= since;
            });
            return {
                size: matches.length,
                forEach: (fn) => matches.forEach((m) => fn({
                    data: () => ({ ...m, ts: { toMillis: () => (m.ts instanceof Date ? m.ts.getTime() : 0) } }),
                })),
            };
        }
        return { size: 0, forEach: () => {} };
    }
}
class Doc {
    constructor(id, parentName, db) { this.id = id; this.parentName = parentName; this.db = db; }
    async get() {
        if (this.parentName === "optouts") {
            const v = this.db._optouts.get(this.id);
            return { exists: !!v, data: () => v || {} };
        }
        return { exists: false, data: () => ({}) };
    }
    async set(data) { /* no-op */ return; }
}

Module._resolveFilename = function (request, parent, ...rest) {
    if (request === "firebase-admin") return "firebase-admin-FAKE";
    return origResolve.call(this, request, parent, ...rest);
};
require.cache["firebase-admin-FAKE"] = { exports: fakeAdmin };

// Stub firebase-functions logger noise (don't need full mock)
require.cache[require.resolve("firebase-functions")] = require.cache[require.resolve("firebase-functions")] || {
    exports: { logger: { warn: () => {}, error: () => {}, info: () => {} },
               https: { onRequest: () => () => {} },
               pubsub: { schedule: () => ({ timeZone: () => ({ onRun: () => () => {} }) }) },
               runWith: () => ({ pubsub: { schedule: () => ({ timeZone: () => ({ onRun: () => () => {} }) }) } }) },
};

// Now require the module under test
const cg = require("./complianceGate");

// ---------- Test infra ----------
let pass = 0, fail = 0;
const results = [];
function test(name, actual, expected) {
    const ok = JSON.stringify(actual) === JSON.stringify(expected) ||
        (typeof expected === "function" && expected(actual));
    if (ok) {
        pass++;
        console.log(`✅ PASS  ${name}`);
        if (typeof actual === "object") console.log(`        got: ${JSON.stringify(actual).slice(0, 200)}`);
    } else {
        fail++;
        console.log(`❌ FAIL  ${name}`);
        console.log(`        expected: ${JSON.stringify(expected)}`);
        console.log(`        actual:   ${JSON.stringify(actual)}`);
    }
    results.push({ name, ok });
}

// Helpers to build deterministic times in TZ "America/Mexico_City"
// MX City is UTC-6 normally. Pick 14:00 UTC = 08:00 CDMX (window CLOSED) and
// 16:00 UTC = 10:00 CDMX (window OPEN).
function utcMs(hourUtc) {
    const d = new Date(Date.UTC(2026, 4, 5, hourUtc, 0, 0)); // 2026-05-05
    return d.getTime();
}

// ---------- Run tests ----------
(async function run() {
    console.log("==== complianceGate.js unit tests ====\n");

    // GATE 1 — WINDOW
    {
        const blocked = cg._gateWindow(
            { to: "+529982023263", timezone: "America/Mexico_City" },
            "sofia_wa",
            { nowMs: utcMs(14) } // 08:00 CDMX = closed
        );
        test("Gate 1 WINDOW: 08:00 CDMX is BLOCKED", blocked.pass, false);

        const open = cg._gateWindow(
            { to: "+529982023263", timezone: "America/Mexico_City" },
            "sofia_wa",
            { nowMs: utcMs(16) } // 10:00 CDMX = open
        );
        test("Gate 1 WINDOW: 10:00 CDMX is OPEN", open.pass, true);
    }

    // GATE 2 — OPT-OUT
    {
        const db = makeMockDb();
        db._optouts.set("529982023263", { reason: "user_stop", at: "2026-04-01" });
        const blocked = await cg._gateOptOut(
            { to: "+52 998 202 3263" }, "sofia_wa", { db }
        );
        test("Gate 2 OPT-OUT: phone in optouts table is BLOCKED", blocked.pass, false);

        const ok = await cg._gateOptOut(
            { to: "+1 555 111 2222" }, "sofia_wa", { db }
        );
        test("Gate 2 OPT-OUT: phone NOT in optouts is PASS", ok.pass, true);
    }

    // GATE 3 — FREQUENCY
    {
        const db = makeMockDb();
        // Empty log — pass
        db._sendLog.length = 0; // reset
        const ok = await cg._gateFrequency(
            { to: "alex@example.com" }, "cold_email", { db, nowMs: Date.now() }
        );
        test("Gate 3 FREQ: empty log is PASS", ok.pass, true);

        // Inject 1 send today → at cap → block (FREQ_CAP_DAY=1)
        db._sendLog.push({ leadKey: "alex@example.com", ts: new Date(), channel: "cold_email" });
        const blocked = await cg._gateFrequency(
            { to: "alex@example.com" }, "cold_email", { db, nowMs: Date.now() }
        );
        test("Gate 3 FREQ: 1 send today hits cap (1/day) — BLOCK", blocked.pass, false);
    }

    // GATE 4 — COUNTRY
    {
        const blocked = cg._gateCountry({ to: "+33612345678", country: "FR" }, "sofia_wa");
        test("Gate 4 COUNTRY: FR is not in [MX,US] — BLOCK", blocked.pass, false);

        const ok = cg._gateCountry({ to: "+529982023263" }, "sofia_wa"); // infer MX from +52
        test("Gate 4 COUNTRY: +52 infers MX — PASS", ok.pass, true);
    }

    // GATE 5 — HEALTH (soft-pass paths exercised — no real Instantly call)
    {
        const ok = await cg._gateHealth(
            { sender: "ariana@zennoenigmawire.com" },
            "cold_email",
            { instantlyApiKey: "" } // missing key → softpass
        );
        test("Gate 5 HEALTH: missing Instantly key softpasses", ok.pass, true);

        const okWa = await cg._gateHealth({ sender: "+19783967234" }, "sofia_wa");
        test("Gate 5 HEALTH: sofia_wa always softpass (BSP trust)", okWa.pass, true);
    }

    // GATE 6 — CONTENT
    {
        const banned = cg._gateContent(
            { body: "Última oportunidad de comprar este paquete con garantía 100%!" },
            "cold_email"
        );
        test("Gate 6 CONTENT: banned phrase 'última oportunidad' BLOCKS", banned.pass, false);

        const okClean = cg._gateContent(
            { body: "Hola Alex, soy Sofia de JegoDigital — agencia de marketing con IA para inmobiliarias. ¿Cómo te va?", firstTouch: true },
            "cold_email"
        );
        test("Gate 6 CONTENT: clean body w/ HR19 intro PASSES first-touch", okClean.pass, true);

        const blockedHr19 = cg._gateContent(
            { body: "Hola Alex, qué tal? Quería preguntarte algo sobre tu negocio.", firstTouch: true },
            "cold_email"
        );
        test("Gate 6 CONTENT: missing JegoDigital+niche on first-touch BLOCKS", blockedHr19.pass, false);

        const blockedTracking = cg._gateContent(
            { body: "Hola, mira mi sitio: https://inst.zennoenigmawire.com/abc" },
            "cold_email"
        );
        test("Gate 6 CONTENT: tracking domain inst.zennoenigmawire.com BLOCKS (HR16)", blockedTracking.pass, false);
    }

    // GATE 7 — SENDER
    {
        const ok = cg._gateSender(
            { sender: "ariana@zennoenigmawire.com" }, "cold_email"
        );
        test("Gate 7 SENDER: approved cold_email mailbox PASSES", ok.pass, true);

        const blocked = cg._gateSender(
            { sender: "alex@randomdomain.com" }, "cold_email"
        );
        test("Gate 7 SENDER: unapproved mailbox BLOCKS", blocked.pass, false);

        const okWa = cg._gateSender({ sender: "+19783967234" }, "sofia_wa");
        test("Gate 7 SENDER: Sofia number PASSES", okWa.pass, true);
    }

    // INTEGRATION — full pass
    {
        const db = makeMockDb();
        db._sendLog.length = 0;
        db._optouts.clear();
        const result = await cg.complianceGate(
            {
                to: "+529982023263",
                body: "Hola — soy Sofia de JegoDigital, agencia de marketing con IA para inmobiliarias.",
                sender: "+19783967234",
                timezone: "America/Mexico_City",
                country: "MX",
                leadId: "test_integration_pass",
                userInitiated: true, // bypass window since test runs at any hour
            },
            "sofia_wa",
            { db, nowMs: utcMs(16), suppressAlerts: true }
        );
        test("INTEGRATION: full clean payload — pass=true", result.pass, true);
    }

    // INTEGRATION — block on opt-out
    {
        const db = makeMockDb();
        db._optouts.clear();
        db._sendLog.length = 0;
        db._optouts.set("529982023263", { reason: "user_stop", at: "2026-04-01" });
        const result = await cg.complianceGate(
            {
                to: "+529982023263",
                body: "Hola — soy Sofia de JegoDigital para inmobiliarias.",
                sender: "+19783967234",
                country: "MX",
                userInitiated: true,
            },
            "sofia_wa",
            { db, nowMs: utcMs(16), suppressAlerts: true }
        );
        test("INTEGRATION: opt-out present — pass=false", result.pass, false);
        test("INTEGRATION: opt-out reason includes 'optout'", result.reason.includes("optout"), true);
    }

    console.log(`\n==== Results: ${pass} passed, ${fail} failed ====`);
    process.exit(fail === 0 ? 0 : 1);
})();
