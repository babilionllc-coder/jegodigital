#!/usr/bin/env node
/**
 * ElevenLabs Outbound Call Trigger — Offer A/B/C/D/MIA
 *
 * Usage:
 *   node elevenlabs_trigger_call.cjs +52998XXXXXXX "Lead Name" \
 *     --offer=B \
 *     --company="Agency Name" \
 *     --email="lead@domain.com" \
 *     --city="Cancún" \
 *     --website="https://agencyname.com"
 *
 *   # Miami Hispanic bilingual (Sofia v3 — agent_1401kq8c8jtvew9r6m05g83eyg60):
 *   node elevenlabs_trigger_call.cjs +1305XXXXXXX "Maria Garcia" --offer=MIA \
 *     --company="Coral Gables Realty" --email="maria@cgr.com" --city="Miami"
 *
 *   # Same agent via E alias OR auto-routed by phone-prefix:
 *   node elevenlabs_trigger_call.cjs +1786XXXXXXX "Carlos Diaz" --offer=E --lang=en
 *
 * Offer B is the ONLY offer that requires --website (for the audit tool).
 * Offer B agent fires the `submit_audit_request` webhook tool at cierre,
 * which POSTs to submitAuditRequest Cloud Function → audit emailed in ~60min.
 *
 * ⚠️ AUTO-ROUTING RULES (2026-04-27):
 *   - If --offer is omitted AND phone starts with "+1" → defaults to MIA (Miami Bilingual)
 *   - If --offer is omitted AND phone starts with "+52" → defaults to B (MX audit)
 *   - --lang=en forces US pool + Miami agent regardless of phone prefix
 *
 * ⚠️ PHONE POOL POLICY:
 *   - MX offers (A/B/C/D) use MX_POOL — 3-number round-robin (MX caller ID)
 *   - MIA/E offers use US_POOL — US +1 caller ID (Miami brokers expect US numbers)
 *   - NEVER mix MX + US numbers in the same pool — caller-ID mismatch kills answer rate
 *
 * ⚠️ BEST-PRACTICE CHECKLIST (2026-04-22 — Alex QA feedback):
 *   - ALWAYS pass --email so Sofia can confirm it back letter-by-letter
 *     instead of asking ("¿su correo sigue siendo?") and trailing off.
 *   - ALWAYS pass --company and --city — Sofia interpolates them in the pitch.
 *   - For Offer B (audit), --website is hard-required (tool needs a URL to audit).
 *   - If --email is missing, the script prints a WARNING so you notice
 *     before the call burns a warm lead.
 *
 * Last updated: 2026-04-27 — added Offer MIA/E (Sofia Miami Bilingual v3) +
 *   US phone pool + auto-routing by phone prefix.
 */

const https = require("https");

// Offer → agent mapping. `pool` selects which Twilio caller-ID rotation to use.
const OFFERS = {
  A:   { agentId: "agent_0701kq0drf5ceq6t5md9p6dt6xbb", name: "Sofia SEO Pitch (MX) v2",          pool: "MX" },
  B:   { agentId: "agent_4701kq0drd9pf9ebbqcv6b3bb2zw", name: "Sofia Free Audit (MX) v2",         pool: "MX" },
  C:   { agentId: "agent_2701kq0drbt9f738pxjem3zc3fnb", name: "Sofia Free Setup (MX) v2",         pool: "MX" },
  D:   { agentId: "agent_7301kq5jxe0gf3vbmp92c974stzc", name: "Sofia FB Brokers (MX)",            pool: "MX" },
  MIA: { agentId: "agent_1401kq8c8jtvew9r6m05g83eyg60", name: "Sofia Pilot 14 Days (Miami Bilingual) v3", pool: "US" },
  E:   { agentId: "agent_1401kq8c8jtvew9r6m05g83eyg60", name: "Sofia Pilot 14 Days (Miami Bilingual) v3", pool: "US" },
};

// MX 3-number round-robin (added 2026-04-26). Spreads carrier flagging risk.
const MX_POOL = [
  { id: "phnum_8201kq0efkq6esttrdm916g8n3r0", number: "+529983871618", label: "MX#1 Cancún" },
  { id: "phnum_0401kq692pspfgkafmvmpr6e7mhn", number: "+529983871354", label: "MX#2 Cancún" },
  { id: "phnum_8901kq692r32e5y89de42wp9xghs", number: "+528121887124", label: "MX#3 MTY"    },
];

// US +1 pool for Miami / US-Hispanic outbound (added 2026-04-27).
// NOTE: +19783967234 is a Massachusetts (978) area code — works for outbound but
// not Miami-area-code-specific. To improve Miami answer rate, Alex should buy a
// +1 305 (Miami) or +1 786 (Miami Lakes) number from Twilio:
//   https://console.twilio.com/us1/develop/phone-numbers/manage/search
//   Search filter: Country=US, Locality=Miami, Capabilities=Voice — ~$1.15/mo + $0.013/min
// The +1 855 toll-free (+18556090422) exists in Twilio but is NOT yet imported
// into ElevenLabs and SHOULD NOT be used for outbound to brokers — toll-free
// caller IDs get answer rates 30-40% lower than local. Toll-free is for inbound only.
const US_POOL = [
  { id: "phnum_6001kq692sc6enxtjnqzcpcwdd01", number: "+19783967234", label: "US#1 Massachusetts (978)" },
];

function parseArgs() {
  const args = process.argv.slice(2);
  if (args.length < 2) {
    console.error("Usage: node elevenlabs_trigger_call.cjs <phone> <name> --offer=A|B|C|D|MIA|E [--company=X] [--email=X] [--city=X] [--website=X] [--lang=en|es]");
    process.exit(1);
  }
  const out = { phone: args[0], name: args[1], offer: "", company: "", email: "", city: "", website: "", lang: "" };
  for (const a of args.slice(2)) {
    const m = a.match(/^--([^=]+)=(.*)$/);
    if (m) out[m[1]] = m[2];
  }
  // Auto-routing: phone-prefix → offer when --offer not given.
  if (!out.offer) {
    if (out.lang === "en" || out.phone.startsWith("+1")) out.offer = "MIA";
    else if (out.phone.startsWith("+52")) out.offer = "B";
    else out.offer = "B";
  }
  // --lang=en forces Miami agent + US pool.
  if (out.lang === "en" && !["MIA", "E"].includes(out.offer.toUpperCase())) {
    console.warn(`⚠️  --lang=en provided but --offer=${out.offer} is MX. Forcing offer → MIA.`);
    out.offer = "MIA";
  }
  return out;
}

let _mxIdx = 0, _usIdx = 0;
function pickPhone(poolName) {
  // Allow env override for one-off forced number.
  if (process.env.ELEVENLABS_PHONE_ID) {
    const all = [...MX_POOL, ...US_POOL];
    const found = all.find(p => p.id === process.env.ELEVENLABS_PHONE_ID);
    if (found) return found;
    return { id: process.env.ELEVENLABS_PHONE_ID, number: "(env override)", label: "env" };
  }
  if (poolName === "US") {
    if (US_POOL.length === 0) {
      throw new Error("US_POOL is empty — cannot dial Miami offer. Buy a +1 305/786 number in Twilio + import to ElevenLabs.");
    }
    const p = US_POOL[_usIdx % US_POOL.length];
    _usIdx++;
    return p;
  }
  const p = MX_POOL[_mxIdx % MX_POOL.length];
  _mxIdx++;
  return p;
}

function postJSON(url, body, apiKey) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const data = JSON.stringify(body);
    const req = https.request({
      hostname: u.hostname,
      path: u.pathname + u.search,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(data),
        "xi-api-key": apiKey,
      },
    }, (res) => {
      let chunks = "";
      res.on("data", (c) => chunks += c);
      res.on("end", () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(chunks) }); }
        catch { resolve({ status: res.statusCode, body: chunks }); }
      });
    });
    req.on("error", reject);
    req.write(data);
    req.end();
  });
}

async function main() {
  const args = parseArgs();
  const offer = (args.offer || "B").toUpperCase();
  const offerCfg = OFFERS[offer];
  if (!offerCfg) throw new Error(`Unknown offer: ${offer}. Use A, B, C, D, MIA, or E.`);
  const agentId = offerCfg.agentId;

  if (offer === "B" && !args.website) {
    console.error("❌ Offer B requires --website=https://agency-domain.com (Sofia needs it to audit).");
    process.exit(1);
  }

  // Soft warnings — these don't block, but cost us conversion if missing
  if (!args.email) {
    console.warn("⚠️  --email not provided. Sofia will have to ASK for it mid-call (weaker close).");
    console.warn("    Best practice: always pass --email so Sofia confirms by spelling it back.");
  }
  if (!args.company) {
    console.warn("⚠️  --company not provided. Sofia will say 'su inmobiliaria' generically (less personal).");
  }
  if (!args.city) {
    console.warn("⚠️  --city not provided. Sofia will say 'su ciudad' generically (less personal).");
  }

  // US pool sanity-check for Miami offers.
  if (offerCfg.pool === "US" && US_POOL.length === 0) {
    console.error("❌ Offer MIA/E requires a US +1 phone in ElevenLabs but US_POOL is empty.");
    console.error("   Action: buy a +1 305 or +1 786 number at https://console.twilio.com/us1/develop/phone-numbers/manage/search");
    console.error("   then import it via ElevenLabs UI → Conversational AI → Phone Numbers → Import.");
    process.exit(1);
  }

  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    console.error("❌ Set ELEVENLABS_API_KEY env var first.");
    process.exit(1);
  }

  const phone = pickPhone(offerCfg.pool);

  const payload = {
    agent_id: agentId,
    agent_phone_number_id: phone.id,
    to_number: args.phone,
    conversation_initiation_client_data: {
      dynamic_variables: {
        lead_name: args.name,
        company_name: args.company || "su inmobiliaria",
        lead_email: args.email || "",
        city: args.city || "su ciudad",
        website_url: args.website || "",
      },
    },
  };

  console.log(`📞 Dialing ${args.phone} with Offer ${offer} — ${offerCfg.name}`);
  console.log(`   Agent: ${agentId}`);
  console.log(`   From:  ${phone.number} (${phone.label}, pool=${offerCfg.pool})`);
  console.log(`   Lead:  ${args.name} | Company: ${args.company || "(none)"} | City: ${args.city || "(none)"}`);
  console.log(`   Email: ${args.email || "(none - Sofia will ASK)"} | Website: ${args.website || "(none)"}`);

  const res = await postJSON("https://api.elevenlabs.io/v1/convai/twilio/outbound-call", payload, apiKey);
  console.log(`[${res.status}]`, JSON.stringify(res.body, null, 2));

  if (res.status >= 400) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
