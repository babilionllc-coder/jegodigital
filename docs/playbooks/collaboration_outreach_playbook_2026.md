# Collaboration Outreach Playbook 2026

**Status:** 🟢 LIVE — single source of truth for outbound tone across the JegoDigital stack. Promoted to canonical 2026-05-04 PM.
**Locked:** 2026-05-04 by Alex directive
**Authority:** BLUEPRINT.md §16 Tone Bible + §17 Standard Intro · CLAUDE.md HR-17 + HR-18 + HR-19
**Read this if:** you are about to write any outbound message — cold email, Sofia opener, FB ad copy, ManyChat WA reply, ElevenLabs cold-call script, LinkedIn DM, Brevo nurture.

---

## §0 — Core philosophy (Alex verbatim)

> *"We never sell anything. We offer help to collaboration to achieve success. If our clients are successful by getting leads and sales, we are successful."*

JegoDigital is an **AI marketing collaboration partner** for real estate businesses, agencies, and developers. Our success is TIED to client success — when they get more leads and sales, we win. We NEVER SELL — we offer help to collaborate.

---

## §1 — The shift in one sentence

JegoDigital is repositioning from "AI marketing service vendor with a guarantee" to "strategic AI marketing partner that collaborates with a small cohort each quarter and learns alongside them." Every message must reflect this. Channel copy that still pitches is broken — pause and rewrite.

---

## §1.5 — The 5-line rule (Rule 4 / HR-19) — non-negotiable

Every JegoDigital first-touch must answer these 5 in the first 5 lines (cold email, Sofia opener, FB ad body, ManyChat welcome, Calendly description, Lead Form Thank You, ElevenLabs cold-call opener):

| # | Question | Standard answer (Spanish) | Standard answer (English) |
|---|---|---|---|
| 1 | **Who are we?** | "JegoDigital — agencia de marketing con IA" | "JegoDigital — AI marketing agency" |
| 2 | **Who do we help?** | "para inmobiliarias, agencias y desarrolladores" | "for real estate businesses, agencies, and developers" |
| 3 | **Why writing?** | (specific Firecrawl/Apify/DataForSEO signal about THEM) | (specific signal-grounded reference) |
| 4 | **What we offer?** | "Colaboración para ayudarte a ganar más leads y ventas" | "Collaboration to help you win more leads and sales" |
| 5 | **Why it works?** | "Cuando tú ganas, nosotros ganamos" | "When you succeed, we succeed" |

### Standard intro line (mandatory in first 1-2 sentences)

🇲🇽 **Spanish:** *"Soy [Sofía/Alex] de **JegoDigital** — agencia de marketing con IA para inmobiliarias, agencias y desarrolladores."*

🇺🇸 **English:** *"I'm [Sofía/Alex] from **JegoDigital** — we're an AI marketing agency for real estate businesses, agencies, and developers."*

**Verification:** `tools/check_collaboration_tone.sh` greps for `JegoDigital` + niche keyword (`inmobiliaria` / `real estate` / `agencia` / `desarrollador` / `developer` / `broker`) in first 200 characters. Fail = block send.

---

## §2 — The 5-element collaboration first-touch

Every outbound first-touch message follows these 5 elements in order. Skip any element = the message is blocked. Applies to: cold email Step 1, Sofia WA opener, FB ad body, LinkedIn DM, ElevenLabs cold-call opening line.

| # | Element | What it does | Example |
|---|---|---|---|
| 1 | **Acknowledge them** | Reference 1 specific thing about THIS recipient — listing, region, recent post, hire, AMPI status, etc. Source: Firecrawl + Apify + DataForSEO in last 7d. | "Vi que ustedes manejan Tulum y Bacalar — corredor luxury difícil." |
| 2 | **Express interest** | Honest 1-line observation about why their business is interesting. NOT flattery. | "El cuidado en cómo presentan las propiedades en su feed se nota — pocos lo hacen así en la zona." |
| 3 | **Mention partnership** | "We collaborate with X teams each quarter." Establishes scarcity through deliberate cohort, NOT through fake urgency. | "Estamos colaborando con 5 inmobiliarias en {region} este trimestre." |
| 4 | **Offer value** | Explicit, small, no-strings — a 60s Loom, a market scan PDF, an AEO score, a Sofia walkthrough recorded for THEM. Deliverable in <10 min of our time. | "Te puedo grabar un Loom de 60s mostrándote qué cambiaría en tu pipeline, sin compromiso." |
| 5 | **Soft CTA** | "open to chatting?" "platicamos por WhatsApp?" "happy to walk through it if useful?" NO booking pressure. WhatsApp first; Calendly fallback. | "¿Te late platicar 5 min por WhatsApp? +52 998 202 3263." |

Total length cap: 80 words for cold email Step 1. Belkins 2026 benchmark: top-quartile cold emails average 50-70 words.

---

## §3 — Tone words

### ✅ Use freely
collaborate · partner · partnership · fit · together · learn · build with you · explore · curious · open · genuine · share · happy to · we'd love to · alongside · when you succeed we succeed · feedback · co-build · honest

### ❌ Banned in cold outbound (allowed only on explicit Calendly call)
sell · pitch · buy · deal · offer · package · price · upgrade · discount · risk-free · 100% guarantee · money-back · limited time · spots left · last chance · urgent · don't miss · close · purchase · sign · contract

---

## §4 — Sentence templates (before / after)

| Old (sales) | New (collaboration) |
|---|---|
| "Buy our service" | "Partner with us this quarter" |
| "We close 88% of leads" | "Last quarter we collaborated with Flamingo and they automated 88% of inbound" |
| "Limited time — 5 spots left" | "We work with 5 companies per quarter; this is one of them" |
| "Risk-free 100% money back" | "If it's not a fit, no contract holds you" |
| "Sales demo" | "15-min collaboration chat" |
| "Get a quote" | "Let's see if there's a fit" |
| "Convert leads into closings" | "Help your team focus on the leads that matter" |
| "Tu información está con Alex — te escribirá" | "Alex revisó tu info — te escribe en 60 min para conocerte y ver si hay fit" |
| "100% money back if no lead in 14 days" | "We work with you for 14 days to see if there's a fit — no contract holds you" |
| "Te conecto con el cierre directo" | "Te conecto con Alex; él decide contigo si hay fit" |

---

## §5 — Three example full sequences

### 5.1 Cold Email Step 1 — MX Spanish (includes Rule 4 intro)

**Subject:** `collab on Cancún real estate`

**Body:**
> Hola {firstName} —
>
> Soy Alex de **JegoDigital** — agencia de marketing con IA para inmobiliarias, agencias y desarrolladores. Vi que su equipo trabaja Tulum y la Riviera — corredor luxury difícil de manejar bien.
>
> Estamos colaborando con 5 inmobiliarias en QR este trimestre. Lo que armamos con Flamingo (Cancún) — automatizaron 88% de su inbound — es el tipo de cosa que podríamos construir contigo. Cuando tú ganas, nosotros ganamos.
>
> Te grabo un Loom de 60s sin compromiso si te interesa. ¿Te late?
>
> Alex / JegoDigital

**Score check:** 80 words ✓ · 4 collaboration words ✓ · 0 banned words ✓ · 1 specific signal ("Tulum y la Riviera — corredor luxury difícil de manejar bien") ✓ · JegoDigital + niche intro in line 1 (Rule 4) ✓ · "cuando tú ganas, nosotros ganamos" ✓ · soft CTA ✓ · founder sign-off ✓

### 5.2 Sofia WA opener — IG ice breaker selected "¿Cómo trabajan con clientes?"

> "¡Hola! 🌴 Soy Sofía de **JegoDigital** — agencia de marketing con IA para inmobiliarias, agencias y desarrolladores.
>
> Trabajamos en colaboración, no vendemos paquetes fijos. Cada trimestre elegimos 5 equipos para colaborar de cerca y aprender de su mercado. Cuando tú ganas, nosotros ganamos.
>
> ¿Qué área te interesa explorar más — captura de leads 24/7, SEO local, presencia en ChatGPT, o algo distinto? Si me cuentas, te paso lo que sí podríamos armar juntos."

**Score check:** Rule 4 intro ✓ · "cuando tú ganas, nosotros ganamos" ✓ · 0 banned words ✓ · soft CTA ✓

### 5.3 FB ad body — Sofia retargeting (replaces the May 4 salesy version)

**Headline:** `Cuando tú creces, nosotros crecemos`

**Body:**
> "**JegoDigital** — agencia de marketing con IA para inmobiliarias, agencias y desarrolladores en {city}.
>
> Estamos colaborando con 5 equipos este trimestre — uno fue Flamingo, automatizaron 88% de su inbound trabajando con nuestro equipo. Cuando ellos ganan, nosotros ganamos.
>
> Si te interesa entender qué armaríamos contigo, platicamos por WhatsApp. Sin pitch."

**CTA button:** Send Message (WhatsApp)

**Tone score:** 5/5 elements present · Rule 4 intro ✓ · 0 banned words · grounded in Flamingo (real client) · 60 words ✓

### 5.4 ManyChat welcome flow first message (Rule 4 baked in)

> "¡Hola! 👋 Soy Sofía de **JegoDigital** — agencia de marketing con IA para inmobiliarias, agencias y desarrolladores.
>
> Estamos colaborando con un grupo pequeño de equipos este trimestre. La idea no es venderte nada — es ver si lo que armamos puede ayudar a tu negocio a ganar más leads y ventas. Cuando tú ganas, nosotros ganamos.
>
> ¿Te platico cómo lo hacemos?"

### 5.5 Calendly event description (first paragraph)

> "Esta es una llamada de colaboración de 30 minutos con Alex Jego, founder de **JegoDigital** — agencia de marketing con IA para inmobiliarias, agencias y desarrolladores. La idea no es venderte nada: es entender tu negocio, contarte cómo colaboramos con equipos en MX y Miami, y ver juntos si hay fit. Cuando tú ganas, nosotros ganamos."

### 5.6 Lead Form Thank You (FB ad)

> "¡Gracias! 🙌 Soy Alex de **JegoDigital** — agencia de marketing con IA para inmobiliarias, agencias y desarrolladores. Te escribo por WhatsApp en menos de 60 minutos para conocerte y explorar si hay fit. Cuando tú ganas, nosotros ganamos."

---

## §6 — Channel-by-channel map

| Channel | Skill | First-touch type | Tone gate |
|---|---|---|---|
| Cold email | `cold-email-copywriting-2026` v3 + `instantly-cold-outreach` v4 | Step 1 (5 elements) | `tools/check_collaboration_tone.sh <campaign_id>` ≥60/100 |
| Sofia WA/IG | `manychat-sofia` v2 | Reply per BLOCK 4 | `collaboration_score` field in META JSON ≥6 |
| FB ad copy | `meta-ads-jegodigital` v2 | 3-line collab template | `tools/check_meta_collaboration_tone.sh <campaign_id>` ≥6/6 |
| Brevo nurture | `brevo-email-marketing` v2 | 5-step relationship sequence | Manual tone audit before send |
| Calendly | `calendly-follow-up` v2 | Confirmation + reminders | Manual tone audit (templates locked) |
| ElevenLabs cold-call | `cold-calling-ai` (no patch yet — TODO) | Voice opener | Voice agent prompt audit |
| LinkedIn DM | `apify-linkedin` (no patch yet — TODO) | DM template | Manual tone audit |

---

## §7 — Quality gates

Before any outbound campaign or template ships:

**Gate 1: Research-grounded** — every personalization field cites a recipient-specific signal sourced in last 7 days.
**Gate 2: Tone audit** — body scores ≥60/100 on the rubric (research 30 + collab 30 + voice 15 + soft-CTA 10 + length 10 + subject 5).
**Gate 3: Banned-phrase scan** — `grep -i -f banned_phrases.txt` returns 0 matches.
**Gate 4: Required-element scan** — collaboration word ≥1 · WhatsApp CTA ≥1 · founder sign-off ✓ · no banned phrase.
**Gate 5: HR-5 + HR-18 lead checks** — already required; collaboration tone is additive.

If ANY gate fails, the activation is blocked.

---

## §8 — How to migrate existing copy (the 3-pass method)

1. **Pass 1: Identify** — pull current copy via API (Instantly, Brevo, ManyChat, Meta Lead Form). Score each on the rubric. Anything <60 → flagged for rewrite.
2. **Pass 2: Rewrite** — apply the 5-element template + tone bible. Don't add NEW claims; reframe the EXISTING claims with collaboration vocabulary.
3. **Pass 3: A/B test** — for high-volume campaigns, run old copy as Cell A and new copy as Cell B for 30 days. Don't kill old copy until Cell B beats it on POSITIVE reply rate (not raw open rate).

---

## §9 — Sources cited

- Salesmotion 2026 B2B cold outreach playbook — top-quartile teams blend volume + relevance + signal-based personalization
- Belkins 2026 sales outreach blueprint — 15-25% reply rate driven by tight ICP + collaboration framing vs 3-5% for generic templates
- MarketingProfs 2026 cold-email AI/deliverability — partnership framing beats vendor pitch on positive reply rate
- Beyond Codes 2026 cold-calling guide — strategic-partner positioning beats vendor positioning on B2B contract value
- DigitalApplied 2026 agentic AI for real estate brokerages — close 3 seams (listing-content cycle, lead-response window, AI-search visibility) via partnership, not vendor purchase
- Hormozi $100M Offers — kept as REFERENCE for offer mechanics, but the language layer is replaced by collaboration framing per Alex 2026-05-04 directive
- BLUEPRINT.md §2.5 Acceleration Layer — the 7 moves remain active; this playbook is the language overlay

---

## §10 — Disaster log entry

**2026-05-04 — Sofia FB Engagement Campaign salesy copy.** $4.13 spent in 2 hours generating 59 link_clicks but 0 measurable WhatsApp conversations. Body included "te devolvemos el 100%", "$400K cash buyer", "88% leads cerrados sin tocar". Root cause: BLUEPRINT.md offer pivot 2026-04-27 (Trojan Horse → paid pilot) updated WHAT we offer but not HOW we talk about it. Channel copy still pitched; the brand still claimed strategic-partner status. Discord burned $4 + first-impression to 6,500 reached people on day 1.

**Lesson:** copy migration must follow strategy migration within 48h. This playbook is the bridge.

---

🟢 ACTIVE. Apply across all 6 patched skills + 4 docs. Re-audit quarterly.
