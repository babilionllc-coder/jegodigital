# cold-email-copywriting-2026 — Patch v3 (Collaboration Tone + Rule 4)

**Date:** 2026-05-04
**Authority:** Alex directive 2026-05-04 PM · BLUEPRINT.md §16 Tone Bible + §17 Standard Intro · CLAUDE.md HR-17 + HR-18 + HR-19
**Apply to:** the plugin skill at `/var/folders/.../skills/cold-email-copywriting-2026/SKILL.md`
**Status:** 🟢 APPROVED 2026-05-04 PM — awaiting plugin owner sync to push to live skill

---

## §0 — Core philosophy (locked 2026-05-04 by Alex)

> *"We never sell anything. We offer help to collaboration to achieve success. If our clients are successful by getting leads and sales, we are successful."*

JegoDigital is an **AI marketing collaboration partner** for real estate businesses, agencies, and developers. Every cold email this skill writes must reflect this. We never sell — we offer help to collaborate.

### Rule 4 — JegoDigital + niche intro (HR-19 — non-negotiable)

Every Step 1 cold email body must open in the first 1-2 sentences with:

🇲🇽 *"Soy [Sofía/Alex] de **JegoDigital** — agencia de marketing con IA para inmobiliarias, agencias y desarrolladores."*
🇺🇸 *"I'm [Sofía/Alex] from **JegoDigital** — we're an AI marketing agency for real estate businesses, agencies, and developers."*

If the email is missing the JegoDigital + niche intro in first 200 chars → block send.

---

## Summary of changes

| # | Change | Why |
|---|---|---|
| 1 | Replace AIDA / Pain-Agitate-Solve framework with **5-element collaboration first-touch** | Selling → collaboration shift |
| 2 | Update 5-step sequence templates (Step 1 + Step 4 hardest hit) | Embed new tone |
| 3 | New "Banned phrases" list (overrides existing don't-do list) | Hard guardrails |
| 4 | New "Required elements" list — every Step 1 must have research-grounded specific | HR-18 enforcement |
| 5 | Update quality scorecard: 30/100 of total score now goes to collaboration tone (was: AIDA strength) | Score what matters |
| 6 | Update copy audit workflow: tone audit pass mandatory before reply-rate audit | Diagnose before treating |
| 7 | Add 3 example full sequences in collaboration tone (MX Spanish · Miami English · MX Bilingual) | Concrete reference |

---

## §1 — REPLACE the framework section

**OLD (delete):**
> ## Framework: AIDA + Pain-Agitate-Solve
> Every cold email follows: Attention → Interest → Desire → Action. Or pain probe → agitate consequences → present solution → CTA.

**NEW (insert):**
```markdown
## Framework: 5-element collaboration first-touch

Every Step 1 email follows these 5 elements in order. Skip any element = the email is blocked.

1. **Acknowledge them** — reference 1 specific thing about their company (a listing, a region, a recent hire, a value they preach publicly). Source: Firecrawl scrape + Apify LinkedIn enrichment + DataForSEO recent ranking change. NO "Hi {firstName}, hope you're doing well" generics.

2. **Express interest** — say WHY their business is interesting to us in 1 honest line. NOT flattery — observation. Example: "Noticed your team works the Tulum + Bacalar corridor — tough luxury market to crack."

3. **Mention partnership** — explicit phrase: "we collaborate with X teams each quarter" or "we partner with Y inmobiliarias in {city}." Establishes scarcity through deliberate small-cohort positioning, NOT through fake "5 spots left" urgency.

4. **Offer value** — explicit, small, no-strings: a 60-second audit, a Sofia walkthrough, a market scan PDF, a Loom we recorded for THEM. The value must be deliverable in <10 min of our time. NO "free 14-day pilot" — that reads as sales mechanic.

5. **Soft CTA** — "open to chatting?" "curious to see if there's a fit?" "happy to show you what we built with Flamingo if useful?" NOT "book a call" / "reply YES". WhatsApp first; Calendly fallback only when geo doesn't favor WA.

Total length cap: 80 words for Step 1. Belkins 2026 benchmark: top-quartile cold emails average 50-70 words.
```

---

## §2 — REPLACE the 5-step sequence template

**OLD (delete):** the existing AIDA-based 5-step template

**NEW (insert):**
```markdown
## 5-step sequence (collaboration tone)

### Step 1 — Day 1: Collaboration introduction (cold opener)

**Subject (4 words max):** `collab on {city} real estate` OR `{firstName}, idea for {company}`

**Body — Spanish MX:**
> Hola {firstName} —
>
> {1-line specific observation about {company}: their listing, their region, their recent post, their AMPI status, etc.}
>
> Soy Alex, fundador de JegoDigital. Estamos colaborando con 5 inmobiliarias en {region} este trimestre — lo que aprendimos con Flamingo en Cancún (automatizamos 88% de su inbound) es el tipo de cosa que podríamos armar contigo.
>
> Te mando un Loom de 60 segundos mostrándote qué cambiaría en tu pipeline, sin compromiso. ¿Te late?
>
> Alex / JegoDigital

**Body — Miami English:**
> Hi {firstName} —
>
> {specific observation about {company} — their listing, their bilingual angle, their referral track record, etc.}
>
> I run JegoDigital — we collaborate with 5 bilingual brokers each quarter. We worked alongside Solik in Brickell on EN+ES auto-capture (3 ready-to-buy referrals their first month) and the playbook would translate to your team.
>
> Happy to record a 60-second Loom on what would change in your pipeline — no obligation. Open to it?
>
> Alex / JegoDigital

### Step 2 — Day 4: Reframe (no opener follow-up)

> Hi {firstName} — quick add-on to my last note.
>
> The reason we keep cohorts to 5 a quarter is selfish: we get to learn your specific market alongside you. Cancún taught us 88% inbound automation works. Tulum taught us bilingual cash buyers reply to voice notes more than text. Your market would teach us the next thing.
>
> If now's not the right time, totally fine — when would make more sense?
>
> Alex / JegoDigital

### Step 3 — Day 8: Specific value drop (no ask)

> {firstName} — no ask, just thought you'd find this useful.
>
> [Send a real Loom or 1-page market scan you actually built for them — name a specific listing of theirs, a specific competitor's site, a specific keyword they should rank for.]
>
> If anything in there is useful, lmk. If not, no worries.
>
> Alex / JegoDigital

### Step 4 — Day 13: Honest check-in (collaboration soft CTA)

> {firstName} — last one from me unless you say otherwise.
>
> A few brokers in {city} this quarter said "yes, fit" and a few said "not now, maybe Q3" — both fine answers.
>
> Where are you on it? Happy to either start collaborating or to circle back later in the year.
>
> Alex / JegoDigital

### Step 5 — Day 19: Honest break-up (NOT salesy "last chance")

> {firstName} — closing the loop on my end.
>
> If we never end up working together, that's totally OK. The reason I write directly to founders/owners is because I'd rather have an honest "no" than a polite ghost.
>
> If anything changes — listings, team, market — my WhatsApp is +52 998 202 3263. I'd love to learn what you build, even if we never collaborate.
>
> Alex / JegoDigital
```

---

## §3 — INSERT new "Banned phrases" section

```markdown
## Banned phrases (auto-block on send)

If any cold-email body contains any of these phrases, the send is BLOCKED until rewritten:

- "100% money back" / "100% refund" / "money-back guarantee" / "risk-free"
- "limited time" / "this week only" / "spots filling fast" / "only 5 spots left"
- "cash buyer" / "$X price" / "$X package" / any specific dollar/MXN figure in body
- "buy now" / "purchase" / "sign up" / "secure your spot"
- "last chance" / "don't miss out" / "act now"
- "we sell" / "we offer" (use "we collaborate" / "we partner with")
- "our service" / "our product" (use "what we build with clients")
- "trojan horse" (deprecated frame entirely)
- "feel stupid saying no" (Hormozi reference, deprecated)
- "free setup" (deprecated 2026-04-27)

Validator: `bash tools/check_collaboration_tone.sh <campaign_id>`. Must print `✅ 0 banned phrases`. Block activation if any found.
```

---

## §4 — INSERT new "Required elements" section

```markdown
## Required elements (auto-block on send if missing)

Every Step 1 email body MUST contain ALL of:

1. **Research-grounded specific** — a fact about THIS recipient that requires we looked at their site/listings/LinkedIn. Generic industry-stat or city-stat does not count.
2. **Collaboration framing word** — at least one of: collaborate, partner, work alongside, build with, fit, together, learn from
3. **WhatsApp CTA** — one of: "open to a WhatsApp chat?" / "platicamos?" / "happy to chat on WA"
4. **Founder sign-off** — "Alex / JegoDigital" exactly
5. **No banned phrase** (see §3)

Validator: `bash tools/check_required_collab_elements.sh <campaign_id>`. Must print `✅ 5/5 elements present in 100% of leads`.
```

---

## §5 — UPDATE the quality scorecard

**OLD (delete):**
- Hook strength (AIDA): /20
- Pain-agitate sharpness: /20
- Solution clarity: /15
- Personalization: /15
- CTA strength: /10
- Subject curiosity: /10
- Length discipline: /10

**NEW:**
- Research specificity (the recipient signal): **/30**
- Collaboration tone (banned-phrase scan + use of collab vocabulary): **/30**
- Founder voice (sounds like Alex personally typed it): /15
- Soft CTA (WhatsApp invitation, no urgency): /10
- Length discipline (≤80 words): /10
- Subject curiosity (≤4 words, lowercase, signal-grounded): /5

**Pass threshold:** ≥80/100 to ship.

---

## §6 — UPDATE the copy audit workflow

**INSERT at top of "When reply rate drops" workflow:**

> Step 0 — TONE AUDIT FIRST.
> Run `bash tools/check_collaboration_tone.sh <campaign_id>` and `bash tools/check_required_collab_elements.sh <campaign_id>` BEFORE diagnosing reply-rate problems. If either fails, fix tone first — reply rate diagnosis on a salesy-tone campaign is wasted time. Only after tone passes, move to deliverability + open rate + subject lines.

---

## §7 — INSERT 3 example full sequences

(See §2 above — the 5-step Spanish MX + Miami English templates serve as the canonical examples. Add a 3rd: bilingual Caribbean variant)

```markdown
### Bilingual Caribbean (DR / Aruba / Bahamas / Punta Cana)

**Step 1 subject:** `collab on {city} luxury real estate`

**Step 1 body:**
> Hi {firstName} — vi tu propiedad en {specific listing}, premium spot.
>
> I run JegoDigital, we collaborate with 5 luxury bilingual brokers each quarter. The agencies we partner with in the region automate 88%+ of inbound EN+ES — and we'd love to learn what works in your specific market.
>
> Happy to record a 60-second Loom showing what we'd build for you. ¿Te late chatear por WhatsApp?
>
> Alex / JegoDigital
```

---

## What stays unchanged

- Subject-line bank (`herothemes 29 best subject lines`) — keep as inspiration but apply collaboration filter
- Deliverability pre-flight (`tools/verify_no_tracking.sh` HR-16) — unchanged
- Sender-rotation rule (10 mailboxes, 30/day each) — unchanged
- Compliance footer — unchanged

---

🟡 Awaiting Alex green light before plugin push.

**Sources cited:**
- 2026 Salesmotion B2B outreach benchmarks
- 2026 Belkins blueprint (top-quartile 15-25% reply rate driven by relevance + signal-based personalization)
- 2026 MarketingProfs cold-email AI/deliverability piece
- BLUEPRINT.md §16 Tone Bible (locked 2026-05-04)
