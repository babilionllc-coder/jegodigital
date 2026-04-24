#!/usr/bin/env node
/**
 * ElevenLabs Outbound Call Trigger — Offer A/B/C
 *
 * Usage:
 *   node elevenlabs_trigger_call.cjs +52998XXXXXXX "Lead Name" \
 *     --offer=B \
 *     --company="Agency Name" \
 *     --email="lead@domain.com" \
 *     --city="Cancún" \
 *     --website="https://agencyname.com"
 *
 * Offer B is the ONLY offer that requires --website (for the audit tool).
 * If --website is omitted for Offer B, the script bails.
 *
 * Offer B agent fires the `submit_audit_request` webhook tool at cierre,
 * which POSTs to submitAuditRequest Cloud Function → audit emailed in ~60min.
 *
 * ⚠️ BEST-PRACTICE CHECKLIST (2026-04-22 — Alex QA feedback):
 *   - ALWAYS pass --email so Sofia can confirm it back letter-by-letter
 *     instead of asking ("¿su correo sigue siendo?") and trailing off.
 *   - ALWAYS pass --company and --city — Sofia interpolates them in the pitch.
 *   - For Offer B (audit), --website is hard-required (tool needs a URL to audit).
 *   - If --email is missing, the script prints a WARNING so you notice
 *     before the call burns a warm lead.
 *
 * Last updated: 2026-04-22 — added --email soft warning + spell-back REGLA EMAIL in prompts
 */

const https = require("https");

const AGENTS = {
  A: "agent_0701kq0drf5ceq6t5md9p6dt6xbb", // SEO pitch
  B: "agent_4701kq0drd9pf9ebbqcv6b3bb2zw", // Free Audit (wired with submit_audit_request tool)
  C: "agent_2701kq0drbt9f738pxjem3zc3fnb", // Free Setup (Trojan Horse)
};

const PHONE_NUMBER_ID = "phnum_8801kp77en3ee56t0t291zyv40ne";

function parseArgs() {
  const args = process.argv.slice(2);
  if (args.length < 2) {
    console.error("Usage: node elevenlabs_trigger_call.cjs <phone> <name> --offer=A|B|C [--company=X] [--email=X] [--city=X] [--website=X]");
    process.exit(1);
  }
  const out = { phone: args[0], name: args[1], offer: "B", company: "", email: "", city: "", website: "" };
  for (const a of args.slice(2)) {
    const m = a.match(/^--([^=]+)=(.*)$/);
    if (m) out[m[1]] = m[2];
  }
  return out;
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
  const agentId = AGENTS[offer];
  if (!agentId) throw new Error(`Unknown offer: ${offer}. Use A, B, or C.`);

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

  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    console.error("❌ Set ELEVENLABS_API_KEY env var first.");
    process.exit(1);
  }

  const payload = {
    agent_id: agentId,
    agent_phone_number_id: PHONE_NUMBER_ID,
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

  console.log(`📞 Dialing ${args.phone} with Offer ${offer} (${agentId})...`);
  console.log(`   Lead: ${args.name} | Company: ${args.company || "(none)"} | City: ${args.city || "(none)"}`);
  console.log(`   Email: ${args.email || "(none - Sofia will ASK)"} | Website: ${args.website || "(none)"}`);

  const res = await postJSON("https://api.elevenlabs.io/v1/convai/twilio/outbound-call", payload, apiKey);
  console.log(`[${res.status}]`, JSON.stringify(res.body, null, 2));

  if (res.status >= 400) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
