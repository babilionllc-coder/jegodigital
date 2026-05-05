# instantly-cold-outreach — Patch v4 (Collaboration Iron Rules + Rule 4)

**Date:** 2026-05-04
**Builds on:** v3 (2026-05-02 supersearch hardening)
**Authority:** Alex directive 2026-05-04 PM · CLAUDE.md HR-17 + HR-18 + HR-19
**Status:** 🟢 APPROVED 2026-05-04 PM — awaiting plugin owner sync to push to live skill

---

## §0 — Core philosophy (locked 2026-05-04 by Alex)

> *"We never sell anything. We offer help to collaboration to achieve success. If our clients are successful by getting leads and sales, we are successful."*

Every Instantly campaign this skill ships must reflect this. JegoDigital is the **AI marketing collaboration partner** for real estate businesses, agencies, and developers. We never sell — we offer help to collaborate.

### Rule 4 — JegoDigital + niche intro (HR-19 — non-negotiable)

Every Step 1 cold-email body MUST open with:

🇲🇽 *"Soy [Alex] de **JegoDigital** — agencia de marketing con IA para inmobiliarias, agencias y desarrolladores."*
🇺🇸 *"I'm [Alex] from **JegoDigital** — we're an AI marketing agency for real estate businesses, agencies, and developers."*

Pre-activation gate: `tools/check_collaboration_tone.sh <campaign_id>` greps for `JegoDigital` + niche keyword in first 200 chars of Step 1. Fail = block activate.

---

## Summary of changes

| # | Change |
|---|---|
| 1 | NEW Iron Rule #16: Never sell, always offer collaboration |
| 2 | NEW Iron Rule #17: Research before send (3-rule gate from CLAUDE.md HR-18) |
| 3 | UPDATE Iron Rule #5 (lead quality gate) — add Gate 8: collaboration tone audit |
| 4 | UPDATE reply playbook section — Sofia Reply Agent v2.5 patches embedded below |
| 5 | UPDATE social proof rotation — frame as "case studies of collaborations" not "client wins" |
| 6 | UPDATE campaign activation checklist — tone-pass mandatory before activate |

---

## §1 — INSERT Iron Rule #16

```markdown
## 🔴 IRON RULE #16 — NEVER SELL, ALWAYS OFFER COLLABORATION

Every campaign body, every reply agent response, every Sofia DM must use collaboration vocabulary (collaborate / partner / fit / together / learn / build with you) and avoid sales vocabulary (sell / pitch / buy / deal / offer / package / 100% money back / spots left).

Why: Alex 2026-05-04 directive — the JegoDigital brand is repositioning from "AI marketing service vendor" to "strategic AI marketing partner". Channel copy must reflect this OR pause until rewritten.

Hard mechanism: campaigns scoring <6/10 on collaboration tone (see scoring rubric below) cannot be activated. Activation API call returns 403 with "tone audit failed" until copy is rewritten.

Scoring rubric — auto-run on every Step 1 + reply template:
- 30 pts: research-grounded specific (was the body grounded in a fact about THIS recipient?)
- 30 pts: collaboration framing (≥3 collaboration words, 0 banned sales words)
- 15 pts: founder voice (sounds like Alex personally)
- 10 pts: soft WhatsApp CTA (no urgency, no booking pressure)
- 10 pts: length ≤80 words
- 5 pts: subject ≤4 words, lowercase, signal-grounded
Total: ≥60 to ship · ≥80 to A/B-test promote.

Cross-reference: BLUEPRINT.md §16 Tone Bible · CLAUDE.md HR-17.
```

---

## §2 — INSERT Iron Rule #17

```markdown
## 🔴 IRON RULE #17 — RESEARCH BEFORE SEND (HR-18 enforcement)

Every cold-email send is gated by a research check:
- ICP/role/decision-maker confirmed (HR-5 Gate 3)
- Domain live (HR-5 Gate 4)
- Geography + ICP match (HR-5 Gate 5)
- Email verified (HR-5 Gate 6)
- Variable coverage (HR-5 Gate 7)
- **NEW Gate 8 — Personalization is research-grounded**, NOT a generic firstName insert. The {{personalization}} field MUST contain a specific signal sourced from Firecrawl/Apify/DataForSEO in the last 7 days.
- **NEW Gate 9 — Tone audit pass** (see Iron Rule #16 scoring)

Pre-activation command:
```bash
bash tools/check_campaign_collab_readiness.sh <campaign_id>
# Must print:
#   ✅ 9/9 gates passed
#   ✅ tone score: 82/100
#   ✅ research-grounded: 100% of leads
```

If ANY gate fails, the activate_campaign API call must return error and route to Alex review.
```

---

## §3 — UPDATE Iron Rule #5 (lead quality gate)

**ADD Gate 8 + Gate 9 to existing 7-gate table:**

| Gate | Test | Threshold |
|---|---|---|
| 8. **Personalization research-grounded** (NEW) | {{personalization}} contains a recipient-specific signal sourced from Firecrawl/Apify/DataForSEO in last 7 days, NOT a generic stat or city reference | 100% — block activation if any lead has generic personalization |
| 9. **Collaboration tone audit** (NEW) | Step 1 + reply templates score ≥60/100 on Iron Rule #16 rubric | 100% — block activation if any template fails |

---

## §4 — UPDATE reply playbook (Sofia Reply Agent v2.5 patches)

The current `INSTANTLY_AGENT_PROMPT.md` (v2.4 from 2026-05-02) needs these updates per Alex 2026-05-04:

### BLOCK 1 — REPLACE communication style line 5

**OLD:**
> Conversacional, segura, con un toque de humor ligero cuando aplica.

**NEW:**
> Conversacional, segura, colaborativa. Nunca vendedora. Sounds like a partner, not a salesperson — when prospects reply, the auto-reply should feel like a peer, not a pitch.

### BLOCK 1 — REPLACE the "NEVER DO" list line 6 (the price line)

**OLD:**
> Never quote price in writing. If they ask for price, say "I share specific pricing inside the WhatsApp conversation — easier to tailor it once I see your site."

**NEW:**
> Never quote price in writing. If they ask for price, say "We don't really have packages — we collaborate with 5 teams a quarter and the structure depends on the fit. Easier to walk through on WhatsApp once I see your site."

### BLOCK 4 — REPLACE the GEO PROOF lines

**MX Spanish OLD:**
> "Flamingo Real Estate (Cancún) automatizó 88% de leads inbound y subió 4.4x su visibilidad en 90 días."

**MX Spanish NEW:**
> "Hemos colaborado con Flamingo Real Estate (Cancún) — automatizaron 88% de su inbound y la visibilidad subió 4.4x. Los números son de ellos; nosotros armamos el sistema con su equipo."

**Miami English OLD:**
> "Solik (Miami bilingual real estate) gets 24/7 EN+ES auto-capture and pulled 3 ready-to-buy referrals in their first month."

**Miami English NEW:**
> "We've been collaborating with Solik in Brickell — their team gets 24/7 EN+ES auto-capture and pulled 3 ready-to-buy referrals their first month. Happy to walk you through what we built together."

### BLOCK 4 — REPLACE GOLDEN EXAMPLES (3 of 5)

**Example 1 (MX Spanish EXPLORE) NEW:**
> "Hola Carlos,
> Gracias por la respuesta. Hemos colaborado con Flamingo Real Estate en Cancún — automatizaron 88% de su inbound y subió 4.4x su visibilidad. Los números son de ellos; armamos el sistema con su equipo.
> Para platicarlo más rápido — ¿cuál es tu WhatsApp? El mío: +52 998 202 3263
> O si prefieres agendar: calendly.com/jegoalexdigital/30min
> Alex / JegoDigital"

(Apply same pattern to Examples 2-5 — the proof line changes from "X did Y" to "we collaborated with X — they did Y; we built the system together".)

### BLOCK 4 — INSERT new "What do you offer?" handler

**NEW (add to INTENT DETECTION — EXPLORE bucket):**
> If prospect asks "what do you offer?" / "what do you sell?" / "what's the pricing?" / "qué ofrecen?" / "qué tienen?":
>
> Reply (Spanish): "No tenemos paquetes fijos — colaboramos con 5 inmobiliarias por trimestre y el setup depende del fit. Más fácil platicarlo por WhatsApp una vez que vea tu sitio. ¿Cuál es tu WhatsApp? El mío: +52 998 202 3263"
>
> Reply (English): "We don't really sell packages — we collaborate with 5 teams each quarter, and the structure depends on the fit. Easier to walk through on WhatsApp once I see your site. What's your best mobile? Mine is +52 998 202 3263 (WhatsApp)."

---

## §5 — UPDATE social proof rotation

**OLD framing:** "client wins" — "Flamingo grew 4.4x" / "GoodLife +300% organic" / "Solik 95% qualify"

**NEW framing:** "case studies of collaborations" — frame every social proof as something we built TOGETHER, with the credit going to the client.

| Old proof line | New collaboration-framed proof line |
|---|---|
| "Flamingo grew 4.4x in 90 days" | "We collaborated with Flamingo for 90 days — their team grew 4.4x. They drove the strategy; we built the system." |
| "Solik gets 95% qualification rate" | "Solik in Brickell wanted to qualify 24/7 in EN+ES — we built that with them. They now hit 95% qualification." |
| "Sur Selecto AMPI Presidente Ejecutivo" | "Sur Selecto's CEO is AMPI Presidente Ejecutivo of Playa del Carmen — we work alongside their team on AEO + Sofia." |
| "Living Riviera Maya — ChatGPT cites them Top 3" | "Living Riviera Maya partnered with us on AEO content — ChatGPT now cites them Top 3 for 'best real estate Playa del Carmen'." |

---

## §6 — UPDATE campaign activation checklist

**INSERT new step 0 to existing checklist:**

```markdown
**Step 0 — Tone audit (NEW, mandatory)**
- Run `bash tools/check_collaboration_tone.sh <campaign_id>`
- Verify Step 1 + Step 2 + Step 3 + Step 4 + Step 5 all score ≥60/100
- Verify reply templates (auto-pilot AI Reply Agent guidance) score ≥60/100
- If any fail → block activation, route to Claude for rewrite
```

---

## What stays unchanged

- Iron Rules #1-#15 (existing) — unchanged
- 10 sender mailbox rule — unchanged
- 30/day per mailbox cap — unchanged
- HR-16 no-tracking rule — unchanged (and reinforced — collaboration = trust = no surveillance)
- Existing v3 supersearch playbook — unchanged
- Reply Agent ID `019d368d-c8ad-7208-8c42-438f4cb16258` — unchanged
- Calendly fallback URL — unchanged
- WhatsApp number `+52 998 202 3263` — unchanged

---

🟡 Awaiting Alex green light before plugin push + Instantly UI re-paste.
