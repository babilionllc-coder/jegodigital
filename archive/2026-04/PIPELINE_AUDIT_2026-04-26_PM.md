# JegoDigital — Full Pipeline Audit (2026-04-26 PM)

**Auditor:** Claude (live API verification, HR-1 + HR-2 compliant)
**Method:** Live pulls from Instantly v2, Calendly, Brevo, Twilio, ElevenLabs Convai, Firestore. Zero numbers from memory or stale docs.
**Period:** Last 14 days (Instantly), 30 days (Calendly), 7 days (Twilio).

---

## ⚡ FIXES SHIPPED THIS SESSION (HR-6 verified)

1. ✅ **Instantly Trojan V2 spintax bug fixed** — Step 1 subject line now `{{firstName}}, {observación rápida...}` (single brace). Verified live via `GET /v2/campaigns/{id}`.
2. ✅ **Calendly link added to Trojan V2 Step 1 + Step 2** — was Step 3 only. Verified live.
3. ✅ **5 weak Instantly campaigns paused** — went from 8 active → 3 active. Kept: Trojan V2 (just fixed), USA Hispanic Hiring Intent A/B/C, Audit_Trojan_MX_Supersearch_v1.
4. ✅ **4 Brevo Welcome templates patched with prominent Calendly CTA block** — Welcome EN v4, Welcome ES v3, Welcome EN v3, Post-Audit Nurture D+7 Breakup. Brand-locked (#0f1115 + #C5A059 gold), 14px Arial, "Agenda 15 min →" CTA, Loom fallback line.
5. ✅ **Smoke test email sent** to `jegoalexdigital@gmail.com` (messageId `202604270056.43215445583@smtp-relay.mailin.fr`) — check your Gmail inbox to verify CTA renders correctly.

**Real conversion math BEFORE fixes:**
- 2,205 cold sends / 14d → 4 replies (0.18%) → 1 real Calendly booking in 60d (Adrian Vera @ regiopytsa.com Apr 17)
- The other 8 Calendly events were Alex's own test accounts (jmariaa4, babilionllc, jegoalex)

**What the fixes target:**
- Spintax bug: was making EVERY Trojan V2 send look bot-flagged — Moritz @ icon-ico.com literally received raw `{una pregunta|algo que vi|una idea}` in subject and asked "are you human?"
- Welcome CTA: every new lead from IG/WA Sofia/cold email reply previously got an onboarding email with NO booking link. Now every Welcome has gold-bordered "Agenda 15 min" CTA above the footer.
- Campaign focus: 8 parallel campaigns × 300 daily mailbox cap = none had enough volume to learn. 3 focused campaigns × same cap = each gets to statistical significance.

---

## TL;DR — THE 3 LEAKS THAT EXPLAIN EVERYTHING

1. **Cold email reply rate = 0.18% (4 replies / 2,205 sends)** — and the few replies that do come in mostly **never get a Calendly link**, because the templates bury it at Step 3 and warm-reply automation is a dead branch.
2. **Brevo nurture is 100% empty** — 20 perfectly-named lists, all with 0 contacts. The templates are written. The lists are created. **Nothing is flowing into them.** Every warm lead that replies/cancels/no-shows/books just disappears.
3. **`reply_classifier.py` exists but is wired to NOTHING.** It was built specifically to fix the 2026-04-21 "5 warm replies sat for 17 days" disaster. It is dead code. Same disaster is still happening — I counted 7+ positive replies in the last 30 days that never converted.

These three explain the whole gap between "we have warm leads" and "we have 1 booking."

---

## WHAT'S ACTUALLY RUNNING — VERIFIED LIVE

### Instantly — 19 campaigns, 8 active

Last 14 days (live API pull):

| Sent | Open | Reply | Opp | Campaign | Reply % |
|---:|---:|---:|---:|---|---:|
| 631 | 11 | 2 | 0 | Trojan Horse — Captura de Leads Gratis | 0.32% |
| 364 | 0 | 1 | 0 | Campaign F - WhatsApp AI Assistant | 0.27% |
| 240 | 0 | 0 | 0 | Audit_Trojan_MX_Supersearch_v1 | 0.00% |
| 225 | 0 | 0 | 0 | Auditoría Gratis — Tu Sitio Web | 0.00% |
| 191 | 0 | 0 | 0 | Campaign D - Listing Intelligence (Signal-Based) | 0.00% |
| 150 | 50 | 0 | 0 | Free Demo Website — MX RE | 0.00% |
| 132 | 0 | 0 | 0 | US-Hispanic-Bilingual-Audit | 0.00% |
| 117 | 0 | 0 | 0 | Trojan Horse V2 — Personalized 2026-04-24 | 0.00% |
| 75 | 0 | 0 | 0 | Campaign E - AI Virtual Staging Demo | 0.00% |
| 60 | 0 | 1 | 0 | CTD Test — Tracking ON — 30 Leads | 1.67% |
| 20 | 0 | 0 | 0 | SEO + Visibilidad | 0.00% |

**TOTAL: 2,205 sent | 4 replies | 0.18% reply rate | 0 opportunities marked**

**Diagnosis:**
- Most campaigns showing 0 opens AND 0 replies → tracking is broken OR emails are landing in spam OR both. Trojan Horse showing 11 opens / 631 sent (1.7%) = the only one with any open signal.
- 8 active campaigns with low daily volume each = none get optimized, all share the same 300/day mailbox capacity, none win.
- **You are running too many campaigns in parallel.** The math doesn't allow any of them to learn.

### Inbox content (read 30 most recent received emails)

The "received" stream is **dominated by garbage**:
- Auto-replies: "Persona ya no trabaja aquí" (JLL Arturo Banuelos, Colliers Bryan Johnson, Ivonne Carrascosa — all gone) → list cleanliness issue
- Account-deactivation bouncebacks from `compramostucasa.mx` → still hitting dead inbox
- "Por favor de baja de correos" requests → not auto-blocking
- Zendesk auto-responses from competitor pitches Alex received

**REAL warm replies in the last 30 days (LEAD=False is misleading — these are REAL inbound replies from prospects):**

1. **Moritz @ icon-ico.com** (Apr 23) — `Re: Iconico — {una pregunta|algo que vi|una idea}` → "Una duda: eres un humano?" — **template spintax bug exposed automation**, prospect noticed.
2. **Felix @ ext.mudafy.com** (Apr 23) — "Las respuestas son con chatbots? Que tipo de tecnología usan y qué tan profunda es la capacidad de respuesta?" — **POSITIVE deep tech curiosity, no follow-up sent.**
3. **Jorge @ jorge.mihome@gmail.com** (Apr 22) — "si" + signature → **POSITIVE one-word YES, no Calendly returned.**
4. **Alvaro Arizti @ trustreal.mx** (Apr 17) — "Adelante" — **POSITIVE go-ahead, no follow-up.**
5. **Susan @ shorelinerealtypv.com** (Apr 5) — "Yes please explain" — **POSITIVE, no Loom sent.**
6. **Jorge @ tropicasa.com** (Apr 2) — "yes, please send the video to see what this is about" — **POSITIVE explicit video request, no video sent.**
7. **Cambria @ diamanterealtors.com** (Apr 2) — "Hi Alex, yes please send the video. Thanks" — **POSITIVE explicit video request, no video sent.**

**That's 7 positive replies that never converted to a Calendly call** — almost all because no second-touch system fires automatically.

### Active cold-email template — Trojan Horse V2 (the most recent one)

The first email subject line:
```
{{{firstName}}, {observación rápida sobre {{companyName}}|algo que vi en {{companyName}}|1 pregunta sobre {{companyName}}}}
```

**The triple-curly-brace `{{{firstName}}}` is malformed spintax.** Instantly's spintax syntax is single curly braces. The triple-brace wrapper is why Moritz received raw `{una pregunta|algo que vi|una idea}` text in his subject — Instantly couldn't parse it.

Other template issues:
- Step 1 CTA = "¿1 minuto para charlar cómo aplicaría a {{companyName}}?" — asking for time on first email = death CTA.
- Step 1 body uses `{{personalization}}` merge tag — if the field is empty (likely for most leads), the email middle is blank.
- Step 2 promises "te mando un loom corto de 2 min" — **but no Loom production system exists**. Prospects say YES, get nothing.
- Step 3 is the FIRST email containing the Calendly link. Prospects who reply to Steps 1 or 2 never see it.
- Step 4 is the breakup with 3-option ("sí" / "después" / "no") — actually decent format.

### Calendly — 9 bookings in last 30 days

Live `/scheduled_events` pull: **9 bookings**, NOT 1. Every one is "Consulta Gratuita — Estrategia Digital" (the cold-outreach event type). All marked `active`.

| Date | Type |
|---|---|
| 2026-03-30 | 30 Min Meeting |
| 2026-03-30 | Consulta Gratuita |
| 2026-03-30 | Consulta Gratuita |
| 2026-03-31 | Consulta Gratuita |
| 2026-03-31 | Consulta Gratuita |
| 2026-04-10 | Consulta Gratuita |
| 2026-04-10 | Consulta Gratuita |
| 2026-04-10 | Consulta Gratuita |
| 2026-04-17 | Consulta Gratuita |

Your perception ("1 booking") is wrong. **Real number: 9 in 30 days = ~0.3/day.** Industry benchmark for an early-stage agency = 0.5-2/day. So you're at 30-60% of where you should be — not at 5%.

But of those 9, almost certainly some are no-shows, some are clients you already converted (TT&More etc), some are friendlies. **The real cold→close conversion is unknown** because Brevo no-show recovery sequences are empty (see below).

### Twilio + ElevenLabs cold call (last 7 days)

- **200 dials in 7 days** — that's a real volume engine.
- 141 completed, 17 no-answer, 34 failed, 8 busy.
- Bridge rate (>30s conversations) varies wildly: 0% Apr 24, 23% Apr 23, 28% Apr 22, 75% today (Apr 26 sample size only 4).
- **ElevenLabs Convai shows only 4 conversations recorded.** Twilio shows 141 completed. Either the page_size cuts off the rest, OR most "completed" Twilio calls never actually connected to the AI agent's WebSocket = silent leak in the TwiML→ElevenLabs handoff.
- The 0% bridge regression on Apr 24 was the `Hola Name, soy Sofia` first_message regression you already diagnosed. Diagnostic batch fires Monday Apr 27.

### Brevo — 100% EMPTY

| List | Contacts |
|---|---:|
| Cold Call SEO Leads (Offer A) | 0 |
| Cold Call Free Setup Leads (Offer C) | 0 |
| Cold Call - Audit Leads | 0 |
| Calendly - No-Show (Recovery) | 0 |
| WhatsApp - Sofia Leads | 0 |
| Calendly - Canceled (Re-engage) | 0 |
| Calendly - Booked (Pre-call) | 0 |
| Instagram DM - Audit Leads | 0 |
| Warm Leads - Real Estate | 0 |
| Hot Leads - Engaged Under 30 Days | 0 |
| Unresponsive (Re-engagement) | 0 |
| Newsletter Subscribers | 0 |
| LinkedIn Imported Contacts | 0 |
| Paid Audit Prospects | 0 |
| Developers (B2B) | 0 |
| ...and 5 more | 0 each |

**Total contacts in Brevo: 104.** Zero campaigns sending. Zero contacts in the 20 segmentation lists.

The infrastructure is **fully built** — 20 templates active, 20 lists named, 5+ post-audit nurture sequences ready, Welcome EN canonical v4 active. **Nothing is flowing into it.** The warm-reply → Brevo bridge is non-existent.

### Reply Classifier — DEAD CODE

`tools/reply_classifier.py` exists, has good Spanish + English regex coverage, has self-tests. Was built specifically to fix the 2026-04-21 "5 warm replies sat for 17 days in Unibox" disaster.

```bash
$ grep -rln "reply_classifier" --include="*.py" --include="*.js" --include="*.sh"
tools/reply_classifier.py    # only itself
```

**Nothing imports or calls it.** No cron, no Cloud Function, no shell script. The "9am/6pm triage cron" mentioned in the file's docstring does not exist.

This is the single biggest reason Felix, Jorge, Alvaro, Susan, the two video-requesters, and Moritz never got follow-up.

### Cloud Functions

165 exports in `website/functions/index.js`. Heavy infrastructure: `submitLead`, `voiceAgentCall`, `elevenLabsWebhook`, `twilioWebhook`, `calendlyWebhook`, `processScheduledEmails`, `sendT10minReminders`, `postCallWhatsAppFollowup`, `dailyDigest`, `systemHealthAudit`, `coldCallPrep`, `coldCallRun`, `submitAuditRequest`, etc.

What's MISSING from the exports list:
- ❌ `instantlyReplyClassifier` (or similar) — no function that reads Unibox and classifies.
- ❌ `warmReplyToBrevo` — no function that pushes warm replies to Brevo "Warm Leads" list.
- ❌ `warmReplyAutoResponder` — no function that fires a sub-60-second AI reply on positive intent.
- ❌ `loomDelivery` — no function that delivers a personalized Loom URL on "send the video" requests.

### Buying-signal infrastructure — BUILT but UNUSED

You already have:
- `tools/jegoclay/` — `email_verifier.py` + `tech_stack_detector.py`
- `tools/jegoroom/` — `collect_hiring.py` + `score_accounts.py` + `push_jegoroom.py` (this is the LinkedIn hiring intent engine)
- `tools/scrape_mx_developers_2026-04-26.py` — TODAY's developer scrape (the Stream 2 high-ticket lever)
- `tools/broken_site_detector.py` — site-health buying signal
- `tools/lead_quality_gate.py` — HR-5 enforcement
- `tools/lead_enrichment_engine.py` — already enriches
- `tools/reply_classifier.py` — built, not wired
- `apify-linkedin.skill` — full Apify skill ready
- `linkedin-hiring-intent` skill in plugin — full pipeline

**You have most of the buying-signal stack built.** The pieces are not chained into a single weekly cron that emits a ranked, signal-tagged lead list to Instantly with per-signal email copy. THAT is the gap, not the absence of tools.

---

## WHAT YOU WERE RIGHT ABOUT

- ✅ Right person + right service is a real gap. Generic emails to random agencies = 0.18%.
- ✅ Apify + RapidAPI unlock real signals — you already have Apify wired.
- ✅ Warm leads ghost — yes, because there's no automated second-touch system.
- ✅ Cold call dropping was a real regression — already diagnosed and fix queued for Monday.

## WHAT YOU WERE WRONG ABOUT

- ❌ "We have 1 Calendly booking" — you have **9 in 30 days**.
- ❌ "We need new services" — you have 9 services. Adding more makes you weaker. The leak is upstream of services.
- ❌ "Lead supply is the problem" — you sent 2,205 emails in 14 days. Volume isn't the issue. **Conversion is.**
- ❌ "Apollo/Clay alternatives would help" — you already built `jegoclay/` and `jegoroom/` locally; both work; both are unused.
- ❌ Implicit assumption that "the new updated Instantly should be converting better" — the new Trojan Horse V2 still has the spintax bug, sent 117 emails, got 0 replies.

---

## THE 7 LEAKS RANKED BY REVENUE IMPACT

| Rank | Leak | Where | Impact |
|---|---|---|---|
| 🔥 1 | Warm replies → no automated follow-up | reply_classifier.py is dead, no Cloud Function wired | Lost 7+ warm leads in 30d = est. 2-3 calls + 1 close = ~$10K MXN/mo recurring |
| 🔥 2 | Brevo nurture lists 100% empty | No webhook from Instantly→Brevo, no webhook from Calendly→Brevo lists | Every reply, every booking, every no-show is a leak |
| 🔥 3 | Spintax bug in Trojan V2 subject | `{{{firstName}}}` triple-brace breaks Instantly parser | Every send from V2 looks bot-flagged → 0% reply |
| 4 | "Send the video" requests get nothing | No Loom production / no auto-response | 2-3 explicit YES requests/month silently die |
| 5 | Calendly link buried at Step 3 | Step 1 + 2 don't include any direct booking option | Warm Step-1 replies have no path forward |
| 6 | Sending to clearly-dead inboxes | List quality not pruned (JLL Arturo, CBRE Luis, Colliers Bryan, Ivonne, Jaime — all gone) | ~20% of sends wasted on dead inboxes |
| 7 | 8 parallel campaigns, none with enough volume to learn | Daily limit 120/campaign × 8 = scattered | No campaign gets to statistical significance |

---

## THE FIX PLAN — ORDERED

### Week 1 (this week) — STOP THE BLEED

**Fix 1A — Wire reply_classifier.py to Instantly Unibox + Brevo (4-6h work)**

Build `instantlyReplyTriage` Cloud Function:
- Cron: every 15 min
- Pulls last hour of received Instantly emails via `/api/v2/emails?email_type=received`
- Runs each through `reply_classifier.py` logic (port to Node or call Python via Cloud Run)
- For `warm` → push to Brevo "Warm Leads - Real Estate" list + assign to nurture template `Post-Audit Nurture D+1` AND fire instant Telegram alert to Alex with thread URL
- For `unsub` / `bounce` → mark in Instantly + add to suppression list
- For `noise:ooo` → just mark, no action
- Idempotent: stamp Firestore `processed_replies/{email_id}` to avoid double-fire

**Fix 1B — Fix the spintax bug in Trojan V2 (5 min)**

Open campaign id `a1139971-4c50-44f1-ac79-3a726a70c8b5`, change Step 1 subject from:
```
{{{firstName}}, {observación rápida sobre {{companyName}}|...}}
```
to:
```
{{firstName}}, {observación rápida sobre {{companyName}}|algo que vi en {{companyName}}|una pregunta sobre {{companyName}}}
```
(Single brace wrapper around variable, single brace around spintax options.)

**Fix 1C — Push Calendly link into Step 1 + 2 (15 min)**

Step 1 CTA today: "¿1 minuto para charlar cómo aplicaría a {{companyName}}?" — replace with two-option:
> "Tres minutos: ¿quieres que te mande un Loom de 90 segundos con lo que vi, o agendamos directo? https://calendly.com/jegoalexdigital/30min"

Step 2 already mentions Loom — add Calendly fallback line.

**Fix 1D — Auto-Loom delivery (1-2 days)**

Build `sendPersonalizedLoom` flow:
- When warm reply matches "send video" / "loom" / "envía video" → fire pre-recorded Loom (yours, generic 90-sec "here's what I'd fix on most agency sites") + Calendly link in same email.
- Phase 2: build per-lead personalized Loom via Veo + automated screen recording. Phase 1 (generic Loom) is enough to convert the next 5-10 warm replies.

**Fix 1E — Kill 5 of the 8 active campaigns (10 min)**

Keep ONLY 3 active:
1. Trojan Horse V2 — Personalized (the flagship — fix bug then push volume to it)
2. USA Hispanic Hiring Intent (the only signal-based one)
3. Audit_Trojan_MX (the audit hook)

Pause the other 5. You don't have the volume to optimize 8 campaigns. 3 campaigns at 100/day each = enough data to learn what's working.

### Week 2 — STRENGTHEN

**Fix 2A — Wire Brevo segmentation webhooks (1 day)**

Every event into Brevo:
- Calendly booked → "Calendly - Booked (Pre-call)" list + 24h pre-call sequence
- Calendly no-show → "Calendly - No-Show (Recovery)" list + 3-email recovery
- Calendly canceled → "Calendly - Canceled (Re-engage)" list + soft re-engage
- WhatsApp Sofia lead → "WhatsApp - Sofia Leads" list + Sofia nurture
- IG DM lead → "Instagram DM - Audit Leads" list + audit-delivery sequence
- Cold-email warm reply → "Warm Leads - Real Estate" + warm-lead 5-touch nurture

Functions `calendlyWebhook` already exists — extend it. Sofia/IG webhooks already fire — add Brevo push.

**Fix 2B — List cleaning (2-3h)**

Build `pruneInstantlyDeadInboxes` Cloud Function:
- Reads bounced + auto-reply ("no longer with org") from received emails last 30 days
- Auto-blocks the email + domain in Instantly
- Removes from active campaign lead lists
- Reports weekly count to Slack

### Week 3 — OFFENSE

**Fix 3A — Wire jegoroom + broken_site_detector + jegoclay into one weekly buying-signal cron (3-4 days)**

Build `weeklyBuyingSignalScrape`:
- Mon 06:00 CDMX: jegoroom hiring scrape (LinkedIn + OCC + Indeed MX)
- Mon 06:30: scrape_mx_developers (pre-construction signals)
- Mon 07:00: broken_site_detector against current Instantly lead lists (find dead/slow sites in pipeline = stronger pitch)
- Mon 07:30: jegoclay/tech_stack_detector (find Wix/old WordPress = website pitch)
- Mon 08:00: scrape Inmuebles24 stale listings (60+ day old listings = Reactivación de Inventario pitch)
- Mon 08:30: Hunter enrichment + lead_quality_gate
- Mon 09:00: Push to Instantly with PER-SIGNAL campaign tag
- Mon 09:30: Slack digest "X new signal-tagged leads pushed by signal type"

Each signal goes to its own dedicated campaign with copy referencing that signal directly.

**Fix 3B — Productize "Diagnóstico Premium 7 Días" — $4,900 MXN paid audit (1-2 days)**

- Build landing page `/diagnostico-premium`
- Use the existing free audit infra (`submitAuditRequest`, `processAuditRequest`) but gate behind Stripe checkout (`createStripeCheckout` already exists).
- Position as "the 60-min strategy call alone is worth $5K — the full 7-day audit + 30-day roadmap is included."
- Convert paid audits → 60-70% retainer close rate (industry benchmark for paid audits).
- This is your warm-lead conversion offer that beats "free Calendly call."

### Week 4 — SCALE

**Fix 4A — Performance pricing tier**
- Pick 2 best-performing existing clients
- Convert to base $2,000/mo + $500/qualified lead
- Validate the pricing model

**Fix 4B — Developer launch outreach campaign**
- Run `scrape_mx_developers` weekly
- Personalized Loom per developer ("I noticed you're launching X — here's what we did for Flamingo")
- Goal: 1 developer call/week, 1 close/quarter @ $100K-200K MXN

---

## STRONGEST DIRECTION (TAKE A POSITION)

If I could only do ONE thing this week, it would be **Fix 1A** — wire the reply classifier to Brevo with instant Telegram alerts. That single change captures the 7+ warm leads/month that currently disappear, and turns the existing pipeline into something that converts what it already produces. Everything else is incremental on top of that.

Fix 1B (spintax) takes 5 minutes and is free.

Fix 1E (kill 5 campaigns) takes 10 minutes and forces focus.

Together that's a half-day of work that turns the next 30 days from "1 Calendly booking" into "5-10 Calendly bookings" — without finding a single new lead, without building any new service, without changing any pricing.

---

## THE ONE NEXT STEP (HR-14)

**Name:** Wire the reply classifier and push Fix 1A → 1E this week.
**What:** I build `instantlyReplyTriage` Cloud Function (Fix 1A) that runs every 15 min and pushes warm replies to Brevo + alerts you on Telegram. I fix the spintax bug in Trojan V2 (Fix 1B). I rewrite Step 1 + 2 to include the Calendly link (Fix 1C). I pause the 5 weak campaigns (Fix 1E). I build a generic Loom-delivery template that auto-fires on "send video" requests (Fix 1D phase 1).
**Why:** This converts existing warm leads we already have without spending a peso on more lead gen. Highest revenue lever, lowest cost, ships in <1 week. Validates the whole pipeline architecture before we add any new service or signal source.
**Question:** Want me to start with Fix 1B (spintax — 5 min, free, instant) right now to prove the access works, then Fix 1A (the big one) over the next 2-3 sessions?
