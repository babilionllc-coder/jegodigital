const admin = require('firebase-admin');
admin.initializeApp({
  credential: admin.credential.cert(require('/sessions/great-determined-allen/mnt/jegodigital/jegodigital-e02fb-a05ae4cb7645.json')),
  projectId: 'jegodigital-e02fb',
});

// 5 diagnostic leads (yesterday's working bridges) + look up their phone_leads IDs
const DIAGNOSTIC = [
  {phone:'+529994866941', company:'Senda Bienes Raíces', city:'Mérida'},
  {phone:'+529841536628', company:'Encanto de Playa', city:'Playa del Carmen'},
  {phone:'+525578358858', company:'Vive Polanco', city:'CDMX'},
  {phone:'+529981434656', company:'Cancun Broker Inmobiliario', city:'Cancún'},
  {phone:'+528110366660', company:'AVALUOS PERICIALES INMOBILIARIOS', city:'Monterrey'},
];

const AGENT_C = 'agent_2701kq0drbt9f738pxjem3zc3fnb';

(async () => {
  const db = admin.firestore();
  const monday = '2026-04-27'; // next weekday cron fires
  
  await db.collection('call_queue').doc(monday).set({
    prepped_at: admin.firestore.FieldValue.serverTimestamp(),
    source: 'manual_diagnostic_2026-04-24',
    batch_size: 10,
    diagnostic: true,
    note: 'A/B: 5 yesterday-working + 5 fresh HOT, both using yesterday-proven first_message format',
  }, { merge: true });
  
  // Stage DIAGNOSTIC half — remove cooldown by clearing last_called_at on these 5
  for (const d of DIAGNOSTIC) {
    const phoneId = d.phone.replace(/[^\d]/g, '');
    // Upsert master phone_leads (clear last_called_at so next prep picks them)
    await db.collection('phone_leads').doc(phoneId).set({
      phone: d.phone, company: d.company, city: d.city,
      phone_verified: true, do_not_call: false, name: d.company,
      priority: '🔥 HOT', score: 99,
      source: 'diagnostic_yesterday_working',
      last_called_at: admin.firestore.FieldValue.delete(), // reset cooldown
      updated_at: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
    // Stage into Monday queue
    await db.collection('call_queue').doc(monday).collection('leads').doc(phoneId).set({
      phone: d.phone, name: d.company, company: d.company, city: d.city,
      offer: 'C', agent_id: AGENT_C,
      status: 'queued', priority: '🔥 HOT', score: 99,
      diagnostic: true, diagnostic_group: 'A_yesterday_working',
      first_message_override: `Buen día, hablo de JegoDigital, ¿es la oficina de ${d.company}?`,
      queued_at: admin.firestore.FieldValue.serverTimestamp(),
    });
    console.log(`Staged DIAGNOSTIC-A: ${d.phone} ${d.company}`);
  }
  
  // Stage fresh HOT half (Group B) — top 5 HOT not in diagnostic list
  const diagnosticPhones = new Set(DIAGNOSTIC.map(d => d.phone.replace(/[^\d]/g,'')));
  const pl = await db.collection('phone_leads').get();
  const freshHot = [];
  pl.forEach(doc => {
    const x = doc.data();
    if (diagnosticPhones.has(doc.id)) return;
    if (!(x.priority||'').includes('HOT')) return;
    // Already dialed today? Skip
    const lc = x.last_called_at?.toDate?.()?.getTime() || 0;
    if (lc > Date.now() - 86400000) return; // skip anyone called in last 24h
    freshHot.push({ id: doc.id, ...x });
  });
  freshHot.sort((a, b) => (b.score||0) - (a.score||0));
  const freshTop5 = freshHot.slice(0, 5);
  
  for (const lead of freshTop5) {
    await db.collection('call_queue').doc(monday).collection('leads').doc(lead.id).set({
      phone: lead.phone, name: lead.company, company: lead.company, city: lead.city || '',
      website: lead.website || '', email: lead.email || '',
      offer: 'C', agent_id: AGENT_C,
      status: 'queued', priority: lead.priority, score: lead.score,
      diagnostic: true, diagnostic_group: 'B_fresh_hot',
      first_message_override: `Buen día, hablo de JegoDigital, ¿es la oficina de ${lead.company}?`,
      queued_at: admin.firestore.FieldValue.serverTimestamp(),
    });
    console.log(`Staged DIAGNOSTIC-B: ${lead.phone} ${lead.company}`);
  }
  
  console.log(`\n✅ Monday ${monday} queue staged: ${DIAGNOSTIC.length + freshTop5.length} leads`);
  console.log(`Group A (yesterday-working): ${DIAGNOSTIC.length}`);
  console.log(`Group B (fresh HOT): ${freshTop5.length}`);
  console.log(`All using yesterday-proven first_message pattern`);
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
