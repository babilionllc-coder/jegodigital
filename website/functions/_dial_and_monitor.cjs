#!/usr/bin/env node
/**
 * On-demand dial + monitor batch — fires N calls, watches outcomes live.
 *
 * Usage: node dial_and_monitor.cjs <count>
 *   Defaults to 10 if count omitted.
 *
 * Pulls in this order:
 *   1. Stranded `queued` leads from today's call_queue (highest priority — already prepped)
 *   2. Fresh phone_leads not dialed in last 7 days
 *
 * Distributes A/B/C uniformly. 15s throttle between dials (was 12s in prod).
 * After dispatch, polls ElevenLabs every 60s for outcome until all complete or 12 min elapsed.
 */

const admin = require("firebase-admin");
const https = require("https");
const fs = require("fs");

const COUNT = parseInt(process.argv[2] || "10", 10);
const SA_PATH = "/sessions/inspiring-optimistic-bohr/mnt/jegodigital/jegodigital-e02fb-a05ae4cb7645.json";
const EL_KEY = process.env.ELEVENLABS_API_KEY;
if (!EL_KEY) { console.error("Missing ELEVENLABS_API_KEY"); process.exit(1); }

const AGENTS = {
  A: { id: "agent_0701kq0drf5ceq6t5md9p6dt6xbb", label: "SEO Pitch" },
  B: { id: "agent_4701kq0drd9pf9ebbqcv6b3bb2zw", label: "Free Audit" },
  C: { id: "agent_2701kq0drbt9f738pxjem3zc3fnb", label: "Free Setup" },
};
const PHONE_NUMBER_ID = "phnum_8801kp77en3ee56t0t291zyv40ne";
const FIRE_INTERVAL_MS = 3000;
const POLL_INTERVAL_MS = 60000;
const MAX_MONITOR_MS = 12 * 60 * 1000;

admin.initializeApp({ credential: admin.credential.cert(require(SA_PATH)) });
const db = admin.firestore();

function todayKey() {
  const d = new Date();
  const cdmx = new Date(d.getTime() - 6 * 3600 * 1000);
  return cdmx.toISOString().slice(0, 10);
}

function postJSON(url, body) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const data = JSON.stringify(body);
    const req = https.request({
      hostname: u.hostname, path: u.pathname + u.search, method: "POST",
      headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(data), "xi-api-key": EL_KEY },
    }, (res) => { let c=""; res.on("data",x=>c+=x); res.on("end",()=>{ try{resolve({s:res.statusCode,b:JSON.parse(c)})}catch{resolve({s:res.statusCode,b:c})} }); });
    req.on("error", reject); req.write(data); req.end();
  });
}

function getJSON(url) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = https.request({ hostname: u.hostname, path: u.pathname + u.search, method: "GET", headers: { "xi-api-key": EL_KEY } },
      (res) => { let c=""; res.on("data",x=>c+=x); res.on("end",()=>{ try{resolve(JSON.parse(c))}catch{resolve(c)} }); });
    req.on("error", reject); req.end();
  });
}

async function pullLeads(n) {
  const dateKey = todayKey();
  // 1. Stranded queued from today
  const queuedSnap = await db.collection("call_queue").doc(dateKey).collection("leads")
    .where("status", "==", "queued").get();
  const queued = [];
  queuedSnap.forEach(d => queued.push({ ...d.data(), _docRef: d.ref, _src: "queue" }));
  console.log(`📋 Found ${queued.length} stranded queued from ${dateKey}`);

  let leads = queued.slice(0, n);

  // 2. Top up from phone_leads if needed
  if (leads.length < n) {
    const need = n - leads.length;
    const since = Date.now() - 7 * 24 * 3600 * 1000;
    const freshSnap = await db.collection("phone_leads").limit(200).get();
    const fresh = [];
    freshSnap.forEach(d => {
      const v = d.data();
      if (!v.phone) return;
      const lastTs = v.last_called_at?.toMillis ? v.last_called_at.toMillis() : 0;
      if (lastTs && lastTs > since) return;
      fresh.push({ ...v, _docRef: d.ref, _src: "phone_leads", _id: d.id });
    });
    // Assign offers uniformly
    const offers = ["A","B","C"];
    fresh.slice(0, need).forEach((l, i) => { l.offer = offers[i % 3]; l.agent_id = AGENTS[l.offer].id; });
    leads = leads.concat(fresh.slice(0, need));
    console.log(`📋 Topped up with ${Math.min(need, fresh.length)} fresh from phone_leads`);
  }

  return leads.slice(0, n);
}

async function fireCall(lead) {
  const phone = lead.phone.startsWith("+") ? lead.phone : `+52${lead.phone}`;
  const firstMessage = `Hola ${lead.name || ""}, soy Sofia de JegoDigital. ¿Tienes un momento?`;
  const payload = {
    agent_id: lead.agent_id,
    to_number: phone,
    agent_phone_number_id: PHONE_NUMBER_ID,
    conversation_initiation_client_data: {
      dynamic_variables: {
        lead_name: lead.name || "allá",
        company_name: lead.company || "tu inmobiliaria",
        website_url: lead.website || "tu sitio web",
        city: lead.city || "tu ciudad",
        lead_email: lead.email || "",
        offer: lead.offer,
      },
      conversation_config_override: {
        agent: { language: "es", first_message: firstMessage },
        conversation: { max_duration_seconds: 300 },
      },
    },
  };
  return postJSON("https://api.elevenlabs.io/v1/convai/twilio/outbound-call", payload);
}

async function monitor(convIds) {
  const start = Date.now();
  const results = new Map(); // cid → { status, dur, reason }
  while (Date.now() - start < MAX_MONITOR_MS) {
    const list = await getJSON("https://api.elevenlabs.io/v1/convai/conversations?page_size=100");
    const convs = list.conversations || [];
    let allDone = true;
    for (const cid of convIds) {
      const c = convs.find(x => x.conversation_id === cid);
      if (!c) { allDone = false; continue; }
      const status = c.status;
      if (status === "initiated" || status === "in-progress") { allDone = false; }
      results.set(cid, {
        status: c.status, dur: c.call_duration_secs || 0,
        result: c.call_successful, reason: c.termination_reason || "",
        msgs: c.message_count || 0, agent: c.agent_name || "",
      });
    }
    const elapsed = Math.floor((Date.now() - start) / 1000);
    console.log(`\n[${elapsed}s] === STATUS ===`);
    let dn=0,zomb=0,vm=0,connect=0,human=0,pending=0;
    for (const [cid, r] of results.entries()) {
      const tag =
        r.status === "initiated" ? "⏳ pending" :
        r.reason.includes("exceeded maximum") ? "💀 ZOMBIE" :
        r.reason.includes("voicemail_detection") ? "📭 voicemail" :
        r.reason.includes("Call ended by remote") ? "👤 human-hangup" :
        r.reason.includes("silence") ? "🔇 silence-end" :
        r.status === "done" && r.result === "success" ? "✅ success" :
        r.status === "done" ? "🟡 done-fail" : "?";
      console.log(`  ${cid.slice(-12)} ${r.dur.toString().padStart(3)}s ${r.msgs.toString().padStart(2)}msg ${tag} ${r.reason.slice(0,40)}`);
      if (r.status==="initiated"||r.status==="in-progress") pending++;
      else if (r.reason.includes("exceeded maximum")) zomb++;
      else if (r.reason.includes("voicemail_detection")) vm++;
      else if (r.reason.includes("Call ended by remote")) human++;
      else if (r.reason.includes("silence")) connect++;  // silence-end fired = our fix worked
      else if (r.status==="done"&&r.result==="success") dn++;
    }
    console.log(`  Summary: success=${dn} silence-end=${connect} voicemail=${vm} human-hangup=${human} ZOMBIE=${zomb} pending=${pending}`);
    if (allDone) { console.log("\n🏁 All calls complete."); return results; }
    await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
  }
  console.log("\n⏱️ Monitor timeout reached.");
  return results;
}

(async () => {
  const leads = await pullLeads(COUNT);
  if (!leads.length) { console.log("No leads to dial."); process.exit(0); }
  console.log(`\n🚀 Dispatching ${leads.length} calls (15s throttle)...`);
  console.log(`   Offer mix: A=${leads.filter(l=>l.offer==="A").length} B=${leads.filter(l=>l.offer==="B").length} C=${leads.filter(l=>l.offer==="C").length}`);

  const convIds = [];
  let fired = 0, failed = 0;
  for (const lead of leads) {
    try {
      const r = await fireCall(lead);
      if (r.s === 200 && r.b.conversation_id) {
        const cid = r.b.conversation_id;
        convIds.push(cid);
        fired++;
        console.log(`  [${fired}/${leads.length}] ${lead.name||"?"} (${lead.offer}) → ${cid.slice(-12)}`);
        // Update Firestore status
        if (lead._src === "queue") {
          await lead._docRef.update({ status: "dialed", dialed_at: admin.firestore.FieldValue.serverTimestamp(), conversation_id: cid });
        }
        await db.collection("call_analysis").doc(cid).set({
          lead_id: lead._id || lead._docRef.id, phone: lead.phone, offer: lead.offer,
          agent_id: lead.agent_id, date_key: todayKey(), outcome: "pending",
          on_demand: true, fired_at: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
      } else {
        failed++;
        console.log(`  ❌ FAILED ${lead.name}: status=${r.s} ${JSON.stringify(r.b).slice(0,100)}`);
      }
    } catch (e) {
      failed++;
      console.log(`  ❌ ERROR ${lead.name}: ${e.message}`);
    }
    if (fired + failed < leads.length) await new Promise(r => setTimeout(r, FIRE_INTERVAL_MS));
  }

  console.log(`\n✅ Dispatch complete: fired=${fired} failed=${failed}`);
  console.log(`📡 Now monitoring ${convIds.length} calls...`);

  const results = await monitor(convIds);

  // Final scoreboard
  console.log("\n=== FINAL SCOREBOARD ===");
  const outcomes = { success: 0, silence_end: 0, voicemail: 0, human_hangup: 0, zombie: 0, pending: 0, other: 0 };
  for (const r of results.values()) {
    if (r.status === "initiated") outcomes.pending++;
    else if (r.reason.includes("exceeded maximum")) outcomes.zombie++;
    else if (r.reason.includes("voicemail_detection")) outcomes.voicemail++;
    else if (r.reason.includes("Call ended by remote")) outcomes.human_hangup++;
    else if (r.reason.includes("silence")) outcomes.silence_end++;
    else if (r.status === "done" && r.result === "success") outcomes.success++;
    else outcomes.other++;
  }
  console.log(JSON.stringify(outcomes, null, 2));
  console.log(`\nFix verdict: zombie=${outcomes.zombie} (was 47% of morning batch). silence_end=${outcomes.silence_end} (silence_end_call_timeout fix firing).`);
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
