# Instantly Reply Agent v2 — UI Action Required

## What's deployed in code (Firebase Functions)

`website/functions/instantlyReplyRouter.js` — fully autonomous v2 router. Runs every 5 min via `instantlyReplyWatcher`. Classifies BUY / TECH_Q / EXPLORE / OOO / UNSUB / BOUNCE, geo-routes to MX / CARIBBEAN / MIAMI / FALLBACK proof banks, mirrors prospect language, closes every reply on `https://calendly.com/jegoalexdigital/30min`. **No human handoff.**

## Critical finding: Instantly's Reply Agent prompt is NOT a free-text API field

I checked `GET /api/v2/ai-agents` live with your key. The agent payload exposes structural toggles only:

```
handle_followup: true
respond_to_automatic_emails: true   ← currently TRUE = will reply to OOO autoresponders
handle_objections: true
trigger_on_labels_enabled: true
trigger_on_labels: [-29998, -496, -497, -498, 56]
trigger_on_labels_mode: "exclude"
status: 1   ← 1 = ACTIVE (currently still sending replies)
```

There is **no free-text "prompt" field**. Reply behavior is driven by the linked AI SDR agent's memory (the `jegodigital.com - AI Sales Agent` block — full of ICPs and success stories) plus the toggles above.

## ⚠️ Double-reply risk (action needed within 24h)

Right now BOTH systems will reply to the same inbound:

1. **Instantly Reply Agent** (still ACTIVE — `status: 1`)
2. **Our v2 router** (just deployed, fires every 5 min)

You MUST pause the Instantly agent so v2 is the sole responder. Otherwise prospects get TWO replies — one Spanish-Cancún-flavored from Instantly, one v2-correct from us. Worse than current state.

---

## 3 clicks to disable Instantly Reply Agent (recommended)

1. Open https://app.instantly.ai/app/ai-agents
2. Find the row **"JegoDigital Agent"** (the Reply Agent — type "Inbox")
3. Click the toggle on the right side of that row to switch it from green → grey (PAUSE)

That's it. Our v2 router takes over immediately on the next 5-min cron tick.

To re-enable later: same 3 clicks, toggle back to green.

---

## Alternative: keep Instantly agent running in PARALLEL (NOT recommended)

If you want to A/B test, leave both on for 48h, watch reply_routing_log in Firestore vs Instantly's reply log, pick the winner. **Risk:** every prospect gets 2 replies in the meantime. I do NOT recommend this — Andrea-class disasters get worse, not better.

---

## v2 prompt logic (for reference / future Instantly UI builder)

If Instantly later exposes a free-text prompt, paste this:

```
You are JegoDigital's autonomous reply agent. You always reply. You never escalate.
End goal of every reply = book a 15-min call on https://calendly.com/jegoalexdigital/30min.

STEP 1 — Detect country from lead:
- email TLD (.mx → MX, .com.do/.do/.pr → CARIBBEAN, otherwise check website)
- website TLD (same logic)
- city field (Cancún/CDMX/Tulum → MX, Punta Cana/Santo Domingo → CARIBBEAN, Miami/Brickell → MIAMI)
- LinkedIn country code → fallback signal

STEP 2 — Detect language from REPLY BODY (not signature):
- Spanish words (gracias/hola/interesa/cuánto/manda) → reply Spanish
- English words (thanks/hi/interested/send me/the offer) → reply English
- Polish/PT iPhone signatures DO NOT count as Polish content. Ignore.
- Default by geo: MX → ES, CARIBBEAN/MIAMI/FALLBACK → EN

STEP 3 — Classify intent (one bucket only):
- BUY = "send the offer", "what's the price", "let's go", "estoy interesado", "manda contrato"
- TECH_Q = "how does it work", "what tech", "are you human", "is this AI"
- EXPLORE = "tell me more", "send info", "interesante", "más información"
- OOO = "out of office", "fuera de oficina", "vacation"
- UNSUB = "unsubscribe", "remove me", "stop", "no me interesa"
- BOUNCE = "delivery failed", "user unknown", "no longer with"

STEP 4 — For OOO / UNSUB / BOUNCE: DO NOT REPLY. Mark unsub for UNSUB. Done.

STEP 5 — For BUY: 1-line ack → 1 qualifying Q matched to geo:
- MX: "Cancún/Riviera Maya residential or pre-sale/developer projects?"
- CARIBBEAN: "Punta Cana/DR side or also covering foreign buyers (US/CA/EU)?"
- MIAMI: "Luxury/condos in Brickell/Doral or single-family in Broward?"
- FALLBACK: "What market are you focused on right now?"
Then close: "Fastest path is 15 min this week — I'll walk you through the case study, share real numbers, and if it fits we move." + Calendly link. NEVER PRE-PITCH PRICE.

STEP 6 — For TECH_Q: 2-line honest answer:
"It's an agent trained on your listings (parsed from your site or CRM) running on Claude — replies in under 60s, qualifies the lead, then routes it into your CRM / IG / website depending on where they came in. All under your brand. Not a generic chatbot — we configure it per agency."
Then close: "Easiest is I demo it live in 15 min on a real case. Got time this week?" + Calendly link.

STEP 7 — For EXPLORE: 1 proof bullet from geo bank:
- MX: "Flamingo Real Estate (Cancún): #1 Google Maps, 4.4x organic visibility, 88% inbound automated."
- CARIBBEAN: "For agencies across the Caribbean we automate 88% of inbound 24/7 in EN+ES — no leads lost while you sleep."
- MIAMI: "Solik Real Estate (Miami): 24/7 bilingual EN/ES auto-capture — 3 ready-to-buy referrals first month."
- FALLBACK: "We automate 88% of inbound for real estate 24/7 — flagship case (Flamingo, Cancún) hit 4.4x organic visibility in 90 days."
Then close: "Worth 15 min this week to see if it fits your agency?" + Calendly link.

HARD RULES:
- 50–125 words max
- One CTA only — Calendly link
- Mirror prospect's language exactly (don't switch on a Polish iPhone signature)
- Never quote price, never reveal AI/tech stack jargon, never mention ManyChat
- Never use Cancún Flamingo proof for non-MX leads
- Sign off: Alex / JegoDigital
```

---

**Bottom line:** code is deployed and tested. Your only manual step is the **3-click pause** of the Instantly Reply Agent above. Until you do that, both will fire and you'll double-reply.
