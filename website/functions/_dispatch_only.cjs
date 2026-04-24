const admin = require("firebase-admin");
const https = require("https");
const SA_PATH = "/sessions/inspiring-optimistic-bohr/mnt/jegodigital/jegodigital-e02fb-a05ae4cb7645.json";
const EL_KEY = process.env.ELEVENLABS_API_KEY;
const COUNT = parseInt(process.argv[2] || "10", 10);
const AGENTS = { A: "agent_0701kq0drf5ceq6t5md9p6dt6xbb", B: "agent_4701kq0drd9pf9ebbqcv6b3bb2zw", C: "agent_2701kq0drbt9f738pxjem3zc3fnb" };
const PHONE_NUMBER_ID = "phnum_8801kp77en3ee56t0t291zyv40ne";
const THROTTLE = 2500;
admin.initializeApp({ credential: admin.credential.cert(require(SA_PATH)) });
const db = admin.firestore();
function todayKey(){ const d=new Date(); const c=new Date(d.getTime()-6*3600*1000); return c.toISOString().slice(0,10); }
function postJSON(url, body) { return new Promise((res,rej)=>{ const u=new URL(url); const data=JSON.stringify(body); const req=https.request({hostname:u.hostname,path:u.pathname+u.search,method:"POST",headers:{"Content-Type":"application/json","Content-Length":Buffer.byteLength(data),"xi-api-key":EL_KEY}},(r)=>{let c="";r.on("data",x=>c+=x);r.on("end",()=>{try{res({s:r.statusCode,b:JSON.parse(c)})}catch{res({s:r.statusCode,b:c})}})}); req.on("error",rej); req.write(data); req.end(); }); }
(async()=>{
  const dateKey = todayKey();
  const queuedSnap = await db.collection("call_queue").doc(dateKey).collection("leads").where("status","==","queued").get();
  const queued = []; queuedSnap.forEach(d => queued.push({ ...d.data(), _docRef: d.ref, _src: "queue" }));
  let leads = queued.slice(0, COUNT);
  if (leads.length < COUNT) {
    const need = COUNT - leads.length;
    const since = Date.now() - 7*24*3600*1000;
    const freshSnap = await db.collection("phone_leads").limit(200).get();
    const fresh = []; freshSnap.forEach(d => { const v=d.data(); if(!v.phone) return; const lastTs = v.last_called_at?.toMillis ? v.last_called_at.toMillis() : 0; if (lastTs && lastTs > since) return; fresh.push({...v,_docRef:d.ref,_src:"phone_leads",_id:d.id}); });
    const offers = ["A","B","C"];
    fresh.slice(0,need).forEach((l,i)=>{ l.offer = offers[i%3]; l.agent_id = AGENTS[l.offer]; });
    leads = leads.concat(fresh.slice(0,need));
  }
  console.log(`📋 ${leads.length} leads (${queued.length} stranded + ${leads.length-queued.length} fresh)`);
  console.log(`🔢 Mix: A=${leads.filter(l=>l.offer==="A").length} B=${leads.filter(l=>l.offer==="B").length} C=${leads.filter(l=>l.offer==="C").length}`);
  const ids = [];
  for (const lead of leads) {
    const phone = lead.phone.startsWith("+") ? lead.phone : `+52${lead.phone}`;
    const payload = { agent_id: lead.agent_id, to_number: phone, agent_phone_number_id: PHONE_NUMBER_ID,
      conversation_initiation_client_data: { dynamic_variables: { lead_name: lead.name||"allá", company_name: lead.company||"tu inmobiliaria", website_url: lead.website||"tu sitio web", city: lead.city||"tu ciudad", lead_email: lead.email||"", offer: lead.offer },
        conversation_config_override: { agent: { language: "es", first_message: `Hola ${lead.name||""}, soy Sofia de JegoDigital. ¿Tienes un momento?` }, conversation: { max_duration_seconds: 300 } } } };
    try {
      const r = await postJSON("https://api.elevenlabs.io/v1/convai/twilio/outbound-call", payload);
      if (r.s===200 && r.b.conversation_id) {
        ids.push(r.b.conversation_id);
        const callSid = r.b.callSid || r.b.call_sid || null;
        console.log(`  ✓ ${lead.name||"?"} (${lead.offer}) → ${r.b.conversation_id.slice(-12)} [sid ${callSid ? callSid.slice(-8) : "?"}]`);
        if (lead._src==="queue") await lead._docRef.update({ status:"dialed", dialed_at: admin.firestore.FieldValue.serverTimestamp(), conversation_id: r.b.conversation_id, callSid });
        await db.collection("call_analysis").doc(r.b.conversation_id).set({ lead_id: lead._id||lead._docRef.id, phone, offer: lead.offer, agent_id: lead.agent_id, date_key: dateKey, callSid, outcome: "pending", on_demand: true, fired_at: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
      } else { console.log(`  ✗ ${lead.name}: ${JSON.stringify(r.b).slice(0,150)}`); }
    } catch(e) { console.log(`  ✗ ${lead.name}: ${e.message}`); }
    await new Promise(r=>setTimeout(r,THROTTLE));
  }
  console.log(`\n📊 Dispatched ${ids.length}/${COUNT} — IDs: ${ids.map(i=>i.slice(-12)).join(",")}`);
  // Save IDs for poll script
  require('fs').writeFileSync('/tmp/dispatched_ids.txt', ids.join('\n'));
  process.exit(0);
})().catch(e=>{ console.error(e); process.exit(1); });
