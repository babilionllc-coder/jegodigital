# meta-ads-jegodigital — Patch v2 (Collaboration Ad Framework + Rule 4)

**Date:** 2026-05-04
**Authority:** Alex directive 2026-05-04 PM · CLAUDE.md HR-17 + HR-18 + HR-19
**Status:** 🟢 APPROVED 2026-05-04 PM — awaiting plugin owner sync + Alex UI update for Lead Form Thank You screen

---

## §0 — Core philosophy (locked 2026-05-04 by Alex)

> *"We never sell anything. We offer help to collaboration to achieve success. If our clients are successful by getting leads and sales, we are successful."*

Every Meta ad this skill ships positions JegoDigital as the **AI marketing collaboration partner** for real estate businesses, agencies, and developers. We never sell — we offer help to collaborate.

### Rule 4 — JegoDigital + niche intro in every ad body (HR-19)

Every ad body line 1 (NOT headline — saves headline for hook) must include:

🇲🇽 *"**JegoDigital** — agencia de marketing con IA para inmobiliarias, agencias y desarrolladores."*
🇺🇸 *"**JegoDigital** — AI marketing agency for real estate businesses, agencies, and developers."*

Lead Form Thank You screen (mandatory copy):

🇲🇽 *"¡Gracias! 🙌 Soy Alex de **JegoDigital** — agencia de marketing con IA para inmobiliarias, agencias y desarrolladores. Te escribo por WhatsApp en menos de 60 minutos para conocerte y explorar si hay fit. Cuando tú ganas, nosotros ganamos."*

Pre-activation: `tools/check_meta_collaboration_tone.sh <campaign_id>` checks ad body line 1 contains `JegoDigital` + niche keyword. Fail = block activate.

---

## Summary of changes

| # | Change |
|---|---|
| 1 | NEW Pre-launch hard gate — research brief required |
| 2 | NEW Ad copy framework — 3-line collaboration template (replaces AIDA + pain hook) |
| 3 | UPDATE Lead Form survey questions — discovery-focused, not pre-sales |
| 4 | UPDATE Lead Form Thank You screen — collaboration tone |
| 5 | NEW Tone Audit checklist — mandatory before campaign activation |

---

## §1 — INSERT new "Pre-launch research brief" gate (before any campaign goes live)

```markdown
## 🔴 Pre-launch Research Brief (HR-18 Rule 1 enforcement)

Before launching ANY new Meta/Facebook campaign or ad set, generate a 1-page research brief covering:

1. **Placement-specific 2026 best practices** — pull current Meta documentation + 2-3 case studies from Salesmotion / MarketingProfs / Belkins on the placement (Feed / Reels / Stories / Lead Form / Click-to-WA)
2. **Benchmark CPL / CTR / CPM for B2B real estate in MX or Miami** — pull Meta Ads Library + competitive scan
3. **Top-3 competitor ads** — Trichter Consulting, Digital Piloto, plus 1 local MX/Miami competitor — copy + creative format + CTA + likely targeting
4. **Pixel/CAPI events that need to fire** — explicit list: PageView, Lead, Schedule, MessagingConversationStarted, plus what's optional
5. **Decision: which objective + why** — explicit pick: OUTCOME_LEADS · OUTCOME_MESSAGES · OUTCOME_ENGAGEMENT (rare). Justify why this objective beats the other 2 for THIS goal
6. **Decision: which audience + why** — explicit: which Customer Match list, which Pixel CA, which interests, which exclusions

Save to `/docs/campaigns/meta-research-brief-<YYYY-MM-DD>-<campaign-slug>.md`. Then build the campaign.

NO BLIND LAUNCHES. Disaster reference: Sofia Engagement Campaign 2026-05-04 spent $4.13 in 2hrs with 0 measurable conversation starts because the objective (OUTCOME_ENGAGEMENT) didn't match the goal (start WA conversations) — would have been caught by the brief's objective-decision step.
```

---

## §2 — REPLACE ad copy framework

**OLD (delete):** AIDA + Pain-Hook framework (e.g. "Pierdes leads durmiendo? Sofía AI los captura 24/7. 100% money back.")

**NEW (insert):**
```markdown
## Ad Copy Framework — 3-Line Collaboration Template

Every ad body follows this 3-line structure (whether single image, carousel, video, or Lead Form):

**Line 1 — Acknowledge their world (specific, observational, NOT a pain probe)**
- ✅ "Inmobiliarias en Cancún están automatizando su WhatsApp 24/7."
- ❌ "Pierdes leads mientras duermes."

**Line 2 — Mention partnership (small cohort, learning posture)**
- ✅ "Estamos colaborando con 5 equipos este trimestre — uno fue Flamingo (88% inbound automatizado)."
- ❌ "Solo 3 spots — agéndate antes que se acaben."

**Line 3 — Soft CTA (no urgency, no pitch)**
- ✅ "Si te interesa entender qué armamos, platicamos por WhatsApp."
- ❌ "Apúntate antes que se llenen los lugares — cero riesgo, 100% money back."

### CTA button rules
- WhatsApp click-to-chat campaigns → `WHATSAPP_MESSAGE` CTA. Body must include "platicamos" or "open to a chat"
- Lead Form campaigns → `Get Quote` is BANNED, use `Learn More` or `Contact Us`
- Website traffic campaigns → `Discover More` or `Read More`, NEVER `Buy Now` / `Sign Up Now`

### Headline rules
- ≤6 words
- NO numbers/stats in headline (move to body)
- NO superlatives ("best", "#1", "fastest")
- ✅ "Colaboramos con 5 inmobiliarias" / "When you grow, we grow"
- ❌ "88% leads cerrados sin tocar"

### Banned phrases in ad body (auto-block)
- "100% money back" / "100% refund" / "risk-free"
- "limited time" / "spots filling fast" / "last chance" / "don't miss"
- "buy now" / "sign up" / "secure your spot"
- "cash buyer" / specific dollar/MXN amounts in body
- "trojan horse" / "feel stupid saying no"
- "free setup" (deprecated)
```

---

## §3 — UPDATE Lead Form survey questions (Form ID `942858358503290`)

**OLD questions (sales-funnel framing):**
1. Nombre
2. Email
3. WhatsApp
4. ¿Cuántos leads inbound recibes al mes?
5. ¿Cuál es tu presupuesto de marketing?

**NEW questions (discovery framing):**
1. Nombre
2. Email
3. WhatsApp
4. ¿Qué te trajo a JegoDigital? (open-ended, optional)
5. ¿Qué área de tu marketing sientes que más necesita ayuda hoy? (multi-select: SEO local · WhatsApp 24/7 · presencia en ChatGPT · sitio web · contenido / videos · otro)

Why: question 4 is open-ended and respects the person's narrative; question 5 is discovery-shaped and tells us what they want collaboration on, NOT how big their wallet is. We learn intent without acting like a sales filter.

---

## §4 — UPDATE Lead Form Thank You screen

**OLD:**
> "Tu información está con Alex Jego — te escribirá personalmente."

**NEW (Spanish):**
> "Gracias 🌴
>
> Alex (founder de JegoDigital) revisó tu info. Te manda WhatsApp en menos de 60 min para conocerte y ver si hay fit.
>
> Sin pitch, sin compromiso. Cuando tú creces, nosotros crecemos."

**NEW (English — for Miami Lead Form when built):**
> "Thanks 🌴
>
> Alex (JegoDigital's founder) reviewed your info. He'll WhatsApp you within 60 min — just to learn what you're working on and see if there's a fit.
>
> No pitch, no obligation. When you succeed, we succeed."

---

## §5 — INSERT mandatory Tone Audit checklist (before activation)

```markdown
## 🔴 Pre-activation Tone Audit (MANDATORY)

Before any campaign moves from PAUSED → ACTIVE, run this 6-point audit. Block activation if any fails.

- [ ] Headline ≤6 words, no stats, no superlatives
- [ ] Body uses 3-line collaboration template (acknowledge → partnership → soft CTA)
- [ ] 0 banned phrases (run grep against the banned-phrases list above)
- [ ] CTA button is collaboration-appropriate (no "Buy Now", no "Sign Up Now")
- [ ] Lead Form Thank You screen uses new collaboration copy
- [ ] At least 1 collaboration vocabulary word in body: collaborate · partner · together · fit · learn

Validator: `bash tools/check_meta_collaboration_tone.sh <campaign_id>`. Must print `✅ 6/6 audit passed`.
```

---

## §6 — UPDATE the existing meta-ads playbook section "Creative Strategy"

**INSERT at top of Creative Strategy:**

> **2026-05-04 update:** the previous creative pillars (pain hook · stat-led · offer-led · objection-killer · social proof) are deprecated as primary frames. The new primary creative pillars are:
>
> 1. **Collaboration story** — "We collaborated with [client] — here's what we built together"
> 2. **Founder voice** — Alex on camera, casual, narrating what he's learned from clients
> 3. **Co-build process** — behind-the-scenes of how Sofia is set up alongside a client team
> 4. **Client testimonial** — client speaks about working WITH us (NOT what we did FOR them)
> 5. **Honest market take** — Alex sharing a non-promotional observation about the market
>
> Old pillars (pain · stat · offer · objection · social proof) can still be used IN MODERATION, but must pass the tone audit.

---

## What stays unchanged

- Ad account `968739288838315`
- Page `766570479879044`
- Pixel + CAPI setup
- Custom audience IDs (Customer Match `1767_hiring_intent`, Pixel CAs)
- Daily budget allocation framework (§4.6 BLUEPRINT) — collaboration tone applies regardless of budget
- Token rotation procedure
- Lead Form ID `942858358503290` (just the questions + Thank You screen change)
- All existing skills mentioned in BLUEPRINT.md

---

🟡 Awaiting Alex approval before plugin push + Lead Form UI updates.
