---
name: cold-call-lead-finder
description: JegoDigital cold-CALL lead sourcing + quality pipeline (v1, 2026-04-21). Use for ANY phone outreach work — sourcing leads for ElevenLabs + Twilio cold calls, auditing phone_leads Firestore collection, running coldCallPrep + coldCallAutopilot, filtering out portals/enterprises/gatekeepers/VoIP/Instantly-overlap, or diagnosing why dial rate is low. DIFFERENT from lead-finder (that's COLD EMAIL for Instantly.ai — different blocklist, different enrichment, different write target, different cadence). HARD RULES — (1) NEVER fabricate call stats, conversation rates, or "warm leads" (see CLAUDE.md HARD RULE #0); (2) NEVER write a phone_lead without decision-maker title match (TITLE_WHITELIST) — gatekeepers get rejected not ranked; (3) Pre-dispatch coverage gate ≥70% real names + ≥60% emails or BLOCK the batch; (4) 3 no-answers in 30d → auto-DNC. Triggers — cold call leads, phone leads, phone_leads, coldCallPrep, coldCallAutopilot, lead topup, leadFinderAutoTopUp, DataForSEO Maps, Hunter decision-maker, Twilio Lookup, VoIP filter, cold-call quality audit, batch won't dispatch, dial rate low, ring but hang up, gatekeeper wall, auto-DNC, 3 strikes, Instantly cross-channel dedup, ENTERPRISE_DOMAINS, TITLE_WHITELIST, FAKE_FIRST_NAMES, phone lead sourcing, real estate phone leads Mexico.
---

# Cold-Call Lead Finder (v1 — 2026-04-21)

Sources **phone leads** from DataForSEO Google Maps → enriches with Hunter.io owner-title hard-gate → writes to Firestore `phone_leads` → dispatched by `coldCallPrep` to ElevenLabs + Twilio.

## Canonical doc

Full design + disaster log + tuning knobs: `/Users/mac/Desktop/Websites/jegodigital/COLD_CALL_LEAD_FINDER_2026-04-21.md`. Read that first for the version history. This SKILL.md is the operator quick-ref.

## HARD RULES (read before touching this pipeline)

1. **NEVER fabricate** call stats, dial counts, connection rates, conversation rates, "warm leads", "hot leads", or bookings. Every number in every report MUST come from a live Firestore/API call executed in THIS session. See `/CLAUDE.md` HARD RULE #0 and `feedback_never_fabricate_numbers.md`. Gatekeepers, receptionists, and "hold on / permanece en la línea" moments are **NOT** warm leads.
2. **Decision-maker gate is HARD, not a score.** If Hunter.io returns a position that doesn't match the TITLE_WHITELIST, the email is **rejected** — not ranked lower. `info@`, `ventas@`, `soporte@`, and similar role-based emails get dropped via FAKE_FIRST_NAMES.
3. **Pre-dispatch coverage gate.** Before `coldCallPrep` writes today's call_queue, verify: `real_names ≥ 70%` AND `has_email ≥ 60%` of the planned batch. If either fails, **do not dispatch** — log an alert and top-up more leads instead.
4. **3-strikes auto-DNC.** Any phone number with 3 no-answer / failed-handshake calls in 30 days gets marked `do_not_call=true` in Firestore by `coldCallPostRunSweep`.
5. **No Instantly overlap.** Before writing a candidate to `phone_leads`, check if its domain already has an active Instantly lead in the workspace. If yes, skip — we don't want the same prospect hit by email + phone in the same week (the Brevo nurture path handles the follow-up).
6. **No enterprise / portal / marketplace domains.** Use the full `ENTERPRISE_DOMAINS` set (41 entries). Remax/Century21/Coldwell/CBRE/Colliers/JLL are owned by corporate marketing teams, not single-agent decision makers. Portals (Inmuebles24, Vivanuncios, Lamudi, Propiedades) list thousands of agencies — scraping one phone gets us a call center.
7. **VoIP filter.** Any phone where Twilio Lookup v2 returns `line_type_intelligence.type = "voip"` → mark `channel=voip` and skip dialing (they never answer, they burn minutes).
8. **Spanish-first owner titles.** TITLE_WHITELIST MUST include both English (founder/ceo/director/owner/broker) AND Spanish (dueño/propietario/socio/gerente/presidente) — half our leads are Spanish-only landing pages.

## Pipeline stages

1. **Source** — DataForSEO `/v3/business_data/google/my_business_info/live` per Mexican city target (Cancún, CDMX, GDL, MTY, Playa del Carmen, Tulum, Monterrey, Puebla, Querétaro, Mérida). Query: `"inmobiliaria <city>"` + `"agencia inmobiliaria <city>"` + `"real estate <city>"`.
2. **Portal/enterprise blocklist** — reject if domain ∈ `ENTERPRISE_DOMAINS` (41-entry set below).
3. **Social-only reject** — if domain is `facebook.com / instagram.com / linktr.ee / bio.link / wixsite.com / squarespace.com / wordpress.com / blogspot.com / tumblr.com` → reject (no scrapeable email, no owner signal).
4. **Phone normalize** — E.164 + strip duplicates + reject non-MX numbers unless campaign explicitly targets US-Hispanic.
5. **Twilio Lookup** — `line_type_intelligence`. Drop `voip` + `nonFixedVoip` (they bounce on outbound). Keep `mobile` + `landline` + `fixedVoip`.
6. **Hunter.io domain-search** — pull emails + positions. Apply TITLE_WHITELIST as HARD filter (reject, don't rank). Apply FAKE_FIRST_NAMES filter (drop `info@`, `ventas@`, etc.).
7. **Firecrawl enrichment (TODO — scaffold now, extractors later)** — scrape owner site for: `active_listings` count, `last_blog_post_date`, `instagram_handle + follower_count`, `whatsapp_link`, `has_chat_widget`, `pagespeed_mobile_score`, `google_maps_rating`, `google_maps_review_count`, `site_stack` (WordPress/Wix/custom). These signals will drive offer assignment (B=audit vs C=setup vs A=SEO) in v2.
8. **Instantly cross-channel dedup** — `GET api.instantly.ai/api/v2/leads?workspace_id=<id>&domain=<d>&limit=1`. If a lead already exists and is in `delivered / active / interested` status, skip writing phone_lead for this domain.
9. **Firestore write** — `phone_leads/{phone}` with: `companyName, domain, phone, email, firstName, lastName, position, city, source=dfs_maps, createdAt, fc_active_listings, fc_last_blog_post_date, fc_instagram_handle, fc_instagram_followers, fc_whatsapp_link, fc_has_chat_widget, fc_pagespeed_mobile, fc_maps_rating, fc_maps_review_count, fc_site_stack, do_not_call=false, call_attempts=[], last_call_at=null`.
10. **Dispatch via coldCallPrep** — pulls from `phone_leads` where `do_not_call=false AND last_call_at<30d AND length(call_attempts)<3`, orders by `createdAt desc`, slices to `BATCH_SIZE=120`, runs pre-dispatch coverage gate, assigns offer (A/B/C) per domain signal, writes to `call_queue/{date}/leads`, fires dispatch job.
11. **Post-run sweep via coldCallPostRunSweep** — daily at 14:00 CDMX. Reads yesterday's `call_analysis` docs, increments `call_attempts` on each `phone_leads` doc, marks `do_not_call=true` where `length(call_attempts)≥3 AND no_connection_in_all`.

## ENTERPRISE_DOMAINS (41 — full list, pulled from lead_finder_v4_lean.py)

Franchises + brokerages (14): cbre.com, colliers.com, jll.com, nmrk.com, kwmexico.mx, cbcmexico.mx, cushwake.com, remax.net, remax.com, century21.com, century21global.com, coldwellbanker.com

Portals + marketplaces (9): inmuebles24.com, vivanuncios.com.mx, propiedades.com, metroscubicos.com, casasyterrenos.com, lamudi.com.mx, trovit.com.mx, mercadolibre.com.mx

Travel/rental (7): airbnb.com, booking.com, expedia.com, vrbo.com, trivago.com, hotels.com, tripadvisor.com

US portals (3): zillow.com, realtor.com, redfin.com

Social / linkhouses (11): facebook.com, instagram.com, linktr.ee, bio.link, wixsite.com, squarespace.com, godaddysites.com, blogspot.com, wordpress.com, tumblr.com, linkedin.com

## TITLE_WHITELIST (Hunter position → keep)

`founder, co-founder, cofounder, ceo, owner, dueño, propietario, socio, partner, director, directora, director general, gerente, gerente general, manager, presidente, president, lead, head, brokerage, broker, agente principal, principal`

Regex (case-insensitive): `/owner|ceo|director|founder|cofound|presiden|broker|principal|dueñ|propietari|socio|partner|gerente|head|lead/i`

## FAKE_FIRST_NAMES (drop Hunter result if firstName ∈ set)

`info, contact, admin, sales, marketing, hello, hola, ventas, ventas1, support, soporte, noreply, no-reply, mail, email, webmaster, team, office, gerencia, recepcion, rh, reception, test, user, account, billing, contacto`

## Pre-dispatch coverage gate (pseudocode)

```javascript
// inside coldCallPrep, after `let batch = candidates.slice(0, BATCH_SIZE)`
const totalPlanned = batch.length;
const realNameCount = batch.filter(l => l.firstName && !FAKE_FIRST_NAMES.has(l.firstName.toLowerCase())).length;
const hasEmailCount = batch.filter(l => l.email && l.email.includes('@')).length;
const namePct  = realNameCount / totalPlanned;
const emailPct = hasEmailCount / totalPlanned;

if (namePct < 0.70 || emailPct < 0.60) {
  await db.collection('cold_call_alerts').add({
    type: 'coverage_gate_block',
    date: today,
    planned: totalPlanned,
    realNamePct: namePct,
    hasEmailPct: emailPct,
    reason: namePct < 0.70 ? 'name_pct_too_low' : 'email_pct_too_low',
    createdAt: FieldValue.serverTimestamp(),
  });
  console.error(`[coldCallPrep] BLOCKED — name=${(namePct*100).toFixed(0)}% email=${(emailPct*100).toFixed(0)}% (need 70/60)`);
  return { blocked: true, reason: 'coverage_gate', namePct, emailPct };
}
```

## Auto-DNC (coldCallPostRunSweep cron — 14:00 CDMX)

```javascript
exports.coldCallPostRunSweep = onSchedule({
  schedule: '0 14 * * *',
  timeZone: 'America/Mexico_City',
  region: 'us-central1',
  memory: '256MiB',
}, async () => {
  const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const snap = await db.collection('phone_leads')
    .where('call_attempts_count', '>=', 3)
    .where('last_call_at', '>=', new Date(cutoff))
    .get();
  let marked = 0;
  for (const doc of snap.docs) {
    const data = doc.data();
    const allNoAnswer = (data.call_attempts || []).every(a => a.outcome === 'no_answer' || a.outcome === 'failed');
    if (allNoAnswer) {
      await doc.ref.update({ do_not_call: true, dnc_reason: '3_no_answers_in_30d', dnc_at: FieldValue.serverTimestamp() });
      marked++;
    }
  }
  console.log(`[coldCallPostRunSweep] marked ${marked} leads as do_not_call`);
});
```

## Instantly cross-channel dedup (pseudo)

```javascript
// inside enrichEmailViaHunter, before writing phone_lead
async function isInInstantly(domain) {
  const apiKey = process.env.INSTANTLY_API_KEY;
  if (!apiKey) return false; // fail open — don't block writes on missing key
  try {
    const resp = await fetch(`https://api.instantly.ai/api/v2/leads?limit=1&search=${encodeURIComponent(domain)}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!resp.ok) return false;
    const json = await resp.json();
    return Array.isArray(json.items) && json.items.length > 0;
  } catch { return false; }
}
```

## Firecrawl signals schema (v1 scaffold — extractors land in v2)

Every `phone_leads` doc includes these fields, initialized to `null`. A separate `firecrawlEnrichPhoneLeads` cron fills them later (not shipped in v1).

| Field | Type | Drives |
|---|---|---|
| `fc_active_listings` | number \| null | Offer routing (≥50 = enterprise → skip; 5-50 = Offer C install; <5 = Offer B audit) |
| `fc_last_blog_post_date` | ISO string \| null | Offer A (SEO) strength — dormant blog = high pain |
| `fc_instagram_handle` | string \| null | Social proof during call |
| `fc_instagram_followers` | number \| null | Tier (>10k = warm, <1k = cold) |
| `fc_whatsapp_link` | string \| null | Already has WhatsApp → Offer C install easier |
| `fc_has_chat_widget` | boolean \| null | If true → Offer C (upgrade existing chat) vs new install |
| `fc_pagespeed_mobile` | number \| null | Offer A (SEO) + Offer B (audit) hook |
| `fc_maps_rating` | number \| null | Trust signal during pitch |
| `fc_maps_review_count` | number \| null | Established biz filter |
| `fc_site_stack` | string \| null | WordPress = easy audit, Wix = locked-in, custom = high budget |

## Quality audit CLI

```bash
node website/tools/phone_leads_quality.cjs
```

Outputs (all from live Firestore queries — no fabrication):
- Total phone_leads count
- do_not_call=true count
- Real-name % (firstName ∉ FAKE_FIRST_NAMES)
- Has-email %
- Portal/enterprise domain % (should be 0 after blocklist)
- VoIP % (should be 0 after Twilio Lookup)
- Call-attempt distribution (0 / 1 / 2 / 3+)
- Coverage gate pass/fail for next dispatch

## Disaster log

- **2026-04-21 PM** — Claude called Jose Fernandez (Aloja Cancún) a "warm lead" based on him saying "permanece en la línea" (gatekeeper hold message). No warm status applied; he was a receptionist, Sofia ignored him, nothing was promised. Rule enshrined in CLAUDE.md HARD RULE #0. This skill's TITLE_WHITELIST + FAKE_FIRST_NAMES gate prevents the same gatekeeper from appearing in future batches.
- **2026-04-21 PM** — 120 phone leads dispatched, 0 connected conversations. Root causes: (a) 14-entry PORTAL_DOMAINS missed all the Lamudi/Propiedades/KW/Century21 scrapes; (b) no VoIP filter — half the pool was voip; (c) Hunter returned `info@` and `ventas@` as top picks; (d) no coverage gate, so a batch with 20% real names was still dispatched. This skill fixes all 4.

## Quick start — re-running after the fix

```bash
# 1. Trigger a manual top-up (pulls 150, writes new phone_leads)
gcloud scheduler jobs run firebase-schedule-leadFinderAutoTopUp-us-central1 --location=us-central1

# 2. Audit the pool
node website/tools/phone_leads_quality.cjs

# 3. If coverage ≥70/60, dispatch tomorrow's batch
# (coldCallPrep runs automatically at 09:30 CDMX)

# 4. Watch the morning run
# Slack #cold-call-morning should fire at 12:30 CDMX with yesterday's digest
```
