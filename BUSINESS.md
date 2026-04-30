# JegoDigital — Business Context (services, pricing, outreach, sales)

> **Purpose:** The **business brain** of JegoDigital — the 9 services we sell, the clients we target, the proof we cite, the sales motion, the exact outreach copy, and the revenue math that drives everything.
> **Read this file when:** You're writing outreach copy, editing cold email templates, tweaking Sofia's WhatsApp funnel, building a proposal, or answering "how does JegoDigital actually make money?"
> **Sister files:** `CLAUDE.md` (the rules) · `BLUEPRINT.md` (master strategy + §2.5 Acceleration Layer) · `PLAYBOOKS.md` (how we ship: IG, cold calls, mockups) · `AI_AGENT_PERSONA.md` (the strategic brain).
> **Last updated:** 2026-04-27 PM (added Competitive Counter-Positioning + Accelerator Products + revenue acceleration math — sync with BLUEPRINT.md §2.5)

---

## 📑 TABLE OF CONTENTS

1. [The 9 Services](#the-9-services)
2. [Target Client (ICP)](#target-client)
3. [Verified Results (social proof)](#verified-results)
4. [Competitive Counter-Positioning (Trichter + Digital Piloto)](#competitive-counter-positioning)
5. [Sales Strategy — Validated Offer](#sales-strategy--validated-offer-2026-04-27)
6. [Accelerator Products (2026-04-27 PM)](#accelerator-products-2026-04-27-pm)
7. [Outreach Pipeline — Instantly.ai](#outreach-pipeline--instantlyai)
8. [WhatsApp + Instagram Funnel — ManyChat + Sofia](#whatsapp--instagram-funnel)
9. [Key Constraints](#key-constraints)
10. [Revenue Goal & 5 Revenue Streams](#revenue-goal--5-revenue-streams)

---

## THE 9 SERVICES

### CRITICAL PRICING RULE
**NEVER reveal pricing in any automated channel** — not WhatsApp, not email, not cold outreach, not in writing. Pricing is ONLY discussed live on a Calendly call with Alex.

### Entry "Trojan Horse" — Always lead with this

**Current default hook (as of 2026-04-23):** **"3 Videos Gratis de Propiedades en 24 horas."** Listing Video Factory — prospect submits 3-10 photos at `jegodigital.com/trojan-setup/videos` → we deliver 3 cinematic property videos (Cinemático / Lifestyle / Luxury styles) within 24h, no pitch, no price mentioned. Converts warmer than the free-install offer because (a) no software install friction, (b) videos are visibly valuable, (c) 24h turnaround is a proof demo of our AI pipeline. Delivery is automated via `trojanVideoInit` + `trojanVideoFinalize` Cloud Functions (signed-URL upload → Veo + ElevenLabs + Remotion render → email delivery). Campaign template lives at `cold-email-sequences/TROJAN_VIDEOS_2026-04-23.md` — 5-step Spanish sequence with `{{firstName}}` + `{{companyName}}` personalization.

**Real product behind the hook:** **Service 1: Captura de Leads 24/7 con IA** — offered with FREE setup. The videos are the lead magnet; Service 1 is what we upsell during the 2-week follow-up after delivery. For clients who prefer a non-video entry, the original "free WhatsApp AI install" framing of Service 1 is still a valid Trojan Horse offer.

| # | Service | Description |
|---|---|---|
| 1 | **Captura de Leads 24/7 con IA** | AI responds via WhatsApp, SMS, web chat in seconds. Qualifies leads, books appointments, alerts broker on hot prospects. Setup: GRATIS. |
| 2 | **Posicionamiento SEO Local** | #1 Google Maps ranking. Technical SEO, schema markup, 4 blog articles/month, Google Business Profile optimization, monthly rankings report. |
| 3 | **Presencia en Buscadores Inteligentes (AEO)** | Get ChatGPT, Gemini, Perplexity to recommend the agency. AEO audit, answer-first content, 2 AEO articles/month, monthly visibility report. |
| 4 | **Gestion de Redes Sociales** | 12 posts/month across Instagram, Facebook & TikTok. Content strategy, editorial calendar, optimal scheduling, hashtag strategy, monthly report. |
| 5 | **Sitio Web de Alto Rendimiento** | Custom mobile-first website, <2s load time, SEO structure, lead capture forms, WhatsApp integration, 98+ PageSpeed. One-time project. |
| 6 | **Videos de Propiedades** | Cinematic videos from just photos. Motion, transitions, professional music. 6 videos/month, delivered in 48 hours. Optimized for Reels, TikTok, Shorts. |
| 7 | **CRM + Panel Admin** | Custom dashboard for leads, sales pipeline, agent performance, WhatsApp + email integration. |
| 8 | **Asistente de Ventas 24/7** | AI voice agent that handles outbound/inbound calls, qualifies prospects, books appointments 24/7. |
| 9 | **Email Marketing y Seguimiento** | Automated nurture sequences, monthly newsletters, re-engagement campaigns, lead segmentation, open/click analytics. |

**Bundles (validated pricing 2026-04-27):**
- **Pack Crecimiento** (1+2+4) — **$18,900 MXN/mo** (raised from $10,900 per validated dossier)
- **Pack Dominación** (1+2+3+4+6) — **$28,900 MXN/mo** (raised from $16,900 per validated dossier)
- **Miami USD tier:** Pack Crecimiento USD $1,099/mo · Pack Dominación USD $1,699/mo

---

## TARGET CLIENT

- Real estate agency or developer **anywhere in Mexico** (CDMX, Cancún, GDL, MTY, Playa del Carmen, Tulum, and all other cities)
- Has WhatsApp but loses leads to missed calls
- Website exists but invisible on Google/AI search
- Decision maker: Owner, Director, or Marketing Manager
- Monthly budget: $3,000–$20,000 MXN
- Pain: Not enough qualified leads, wasting time on cold leads

**CRITICAL:** Default to "inmobiliarias en México" in ALL outreach. **NEVER say "Riviera Maya" in mass templates.** Only use if running a geo-targeted campaign for that specific region.

**Secondary market:** Miami luxury real estate (bilingual need)

---

## VERIFIED RESULTS

| Client | Results |
|---|---|
| **Flamingo Real Estate** (Cancún) — ACTIVE, ✅ verified | 4.4× visibility, #1 Google Maps Cancún, +320% organic, 88% leads automated, **<30s WA response, 3× citas booked, all in 90 days** |
| **GoodLife Tulum** — 🚨 NO public domain on file | 5× leads, +300% organic, 42% email open, 100+ properties — **primary investor / ROI social proof** |
| **Goza Real Estate** — 🚨 NO public domain on file | 98 PageSpeed, 3× leads, 24/7 AI, 50+ properties |
| **Solik Real Estate** — 🚨 NO public domain on file | 95% qualify, #1 Maps, bilingual EN/ES, 6-service ecosystem (escrow + automation + CRM + email + AI center) |
| **RS Viajes Rey Colimán** (Colima) — ACTIVE, ✅ verified | 33-yr brand · 10 destinations · 4.9★ · 4 services — **non-RE proof point** (travel agency) |
| **TT&More** (Cancún) — ACTIVE, ✅ verified | 98 PageSpeed · 13-destination quote calc · 24/7 bilingual AI · WhatsApp booking — **non-RE proof point** (transportation) + best before/after visuals |
| **Sur Selecto** (Playa del Carmen / Tulum / Bacalar / Cancún) — ACTIVE, ✅ verified | 5.0★ · ChatGPT-listed · 64 keywords · 5 videos/mo — **AEO showcase + AMPI authority** |
| **Living Riviera Maya** (Playa del Carmen) — ACTIVE, ✅ verified | 4.9★ · Top 3 Maps · 100+ properties · 5 videos/mo · ChatGPT-recommended (Judi Shaw, since 2002) — **legacy broker proof** |

🛑 **Single source of truth:** [`docs/case-studies/INDEX.md`](docs/case-studies/INDEX.md) — read this BEFORE citing ANY client number anywhere. Per-client deep files at `docs/case-studies/{slug}.md`. Per-channel cite playbook included.

All results displayed publicly: jegodigital.com/showcase · instagram.com/jegodigital

⚠️ **Per HARD RULE #9 (CLAUDE.md):** these numbers must be re-verified on the 1st of every month. If any moved down >20%, pull it from cold-email copy until reverified. Per CLIENT DOMAIN RULE: **Goza, GoodLife, Solik have NO verified domain on file** — use NAME and STATS in copy but never link to a URL. Alex action: confirm public domain status for each (or document why none exists).

---

## COMPETITIVE COUNTER-POSITIONING

> **Added 2026-04-27 PM** — direct intel on the closest competitors to JegoDigital and the positioning frame we use to win against them. Sister doc: `BLUEPRINT.md §2.5 Move 2`.

### The two real competitors (everything else is noise)

| Competitor | What they sell | Estimated price | Positioning weakness we exploit |
|---|---|---|---|
| **Trichter Consulting** (Mexico) | Consulting + intelligent funnels + AI lead scoring + WhatsApp automation + chatbots that handle objections | No public pricing — estimated **$30-80K MXN/mo retainer**. Cite project: $120M MXN sales generated for a Mazatlán developer. | Pure **consultancy** model — they advise, they don't operate. Brokers must still hire executors. They cannot guarantee outcomes. |
| **Digital Piloto** (India, 9 yrs) | AI-driven digital marketing for Mexican real estate, "measurable ROI" framing | Likely $1-3K USD/mo retainer (offshore pricing) | Foreign agency, no on-the-ground Mexican RE relationships, no AMPI presence, no local case studies. Cultural + language gap on premium luxury accounts. |

### The frame we own (and they cannot)

> *"Trichter te dice qué hacer. JegoDigital lo hace por ti — pagas por leads calificados, no por horas."*

JegoDigital is positioned as the **operator**, not the consultant. The differentiation is structural: their business model requires billable hours; ours scales on AI marginal cost. We can guarantee outcomes (Garantía 60s, 14-day money-back, performance pricing) because the AI stack actually delivers them — they cannot make those guarantees without burning their own margin.

### Where to deploy the counter-position

- **`/vs-consultoria` page** — comparison table targeting "trichter consulting alternativa" + "consultoría inmobiliaria IA México alternativa" + "marketing inmobiliario IA México"
- **Cold-call rebuttals** — when prospect says "ya tenemos un consultor" → Sofia/Alex script: "*Perfecto. Un consultor te dice qué hacer; nosotros lo hacemos por ti. Si en 14 días no captura un lead real, devolvemos el 100%. ¿Cuándo te conviene una llamada de 15 min?*"
- **Calendly close talk track** — anchor frame BEFORE pricing: "*La diferencia con Trichter o cualquier consultor es que nosotros operamos el sistema. Tú no contratas horas, contratas resultados.*"
- **Cold-email copy angle** — `cold-email-copywriting` skill should add 2 templates explicitly using the consultant-vs-operator frame.

### Anti-frame (what we never say)

- ❌ Never name Trichter or Digital Piloto in cold email or paid ad copy (legal risk + signals defensiveness)
- ❌ Never claim "we're the only AI agency in Mexico" — Trichter exists, brokers will Google
- ❌ Never compete on consulting depth — that's their lane, we'd lose the comparison

---

## SALES STRATEGY — VALIDATED OFFER (2026-04-27)

> ⚠️ **STRATEGY UPDATED 2026-04-27 — old "FREE setup Trojan Horse" model is DEPRECATED.**
> Authoritative source-of-truth: [`docs/strategy/jegodigital-validated-offer-2026-04-27.md`](docs/strategy/jegodigital-validated-offer-2026-04-27.md)
> Backed by: [`docs/research/jegodigital-offer-strategy-validation-2026-04-27.md`](docs/research/jegodigital-offer-strategy-validation-2026-04-27.md) (~640 lines, every claim cited)
>
> **Why deprecated:** Atlanta Ventures + 7 other sources confirm paid pilots out-convert free pilots **4-6×** in B2B services. Pack Crecimiento at $10,900 MXN/mo is 22% of Hiweb mid-size Mexican agency benchmark — pricing must rise to hit $1M USD ARR.

**The new validated pitch (replaces "free setup"):**

> **"Pague el primer mes de Pack Crecimiento ($18,900 MXN). Si en 14 días no captura un lead real, devolvemos el 100% — y le dejamos el sistema instalado para siempre."**

The 4 Hormozi Grand Slam pillars:
- **Skin in the game** (paid upfront — auto-filters tire-kickers)
- **Concrete deliverable** (a real lead in 14 days)
- **Zero downside** (full refund if it fails)
- **Free system if it fails** ("feel stupid saying no" element)

Expected close rate: **35-55%** of cold-email positive replies (vs 8-12% for old free-setup Trojan Horse).

**Updated pricing:**

| Tier | OLD price | **NEW price (2026-04-27)** |
|---|---|---|
| Pack Lead Capture (Service 1) | $8,000 MXN/mo | $8,000 MXN/mo (paid pilot offer) |
| **Pack Crecimiento** (1+2+4) | $10,900 MXN/mo | **$18,900 MXN/mo** ← raised |
| **Pack Dominación** (1+2+3+4+6) | $16,900 MXN/mo | **$28,900 MXN/mo** ← raised |
| Sitio Web Premium (one-shot) | $14,900 MXN | **$24,900 MXN** ← raised |
| Developer contracts | $80K-200K MXN | **$150K-300K MXN** ← raised |
| Miami Hispanic Pack Crecimiento | — | **$1,099 USD/mo** (USD market) |

**The 5-step flow:**
1. Lead in → Sofia qualifies on WhatsApp
2. Push to Calendly call (NEVER quote price in chat)
3. On Calendly call: anchor with **Flamingo 4.4x / GoodLife 300%**, then offer Pack Crecimiento at $18,900 MXN with 14-day money-back guarantee
4. If they hesitate at $18,900 → fallback to Pack Lead Capture solo at $8,000 MXN with same money-back terms
5. After month 1 lands a real lead → upsell to Pack Dominación at $28,900 MXN at end-of-month-1 close call

**Objection responses (updated):**
- "No tengo presupuesto" → "Por eso ofrezco devolución total a 14 días. Si no funciona, recupera todo y se queda con el sistema instalado. Riesgo cero."
- "¿Cuánto cuesta?" → "Depende del paquete. La inversión arranca en $8,000 MXN/mes con devolución garantizada. ¿15 min esta semana? calendly.com/jegoalexdigital/30min"
- "Mándame información" → 3 bullet points: (1) Flamingo 4.4x visibilidad / #1 Maps, (2) Pilot $8K-$18K MXN con devolución 100% en 14 días, (3) calendly.com/jegoalexdigital/30min. **NEVER a PDF.**

### 30-day A/B/C controlled experiment (start within 7 days)

Per the validated dossier, run 3 cells in parallel to confirm Cell B (paid pilot at raised price) beats Cell A (current Trojan Horse) by ≥2× cost-per-paid-customer:

- **Cell A — Control:** keep current "free setup" copy on 5 existing Instantly campaigns
- **Cell B — Paid pilot + raised price:** "$18,900 MXN, 14-day money-back" copy on 5 swapped campaigns (THE EXPECTED WINNER)
- **Cell C — High-ticket developer outbound:** $150-300K MXN per project pitch to 50 hand-picked Mexican RE developers

**3 KPIs to track:** cost-per-paid-customer · day-30 cumulative revenue per cell · reply-to-paid conversion rate.

Full experimental spec + decision rules + implementation checklist in [`docs/strategy/jegodigital-validated-offer-2026-04-27.md`](docs/strategy/jegodigital-validated-offer-2026-04-27.md).

**Cold-call → Brevo nurture capture (LIVE 2026-04-22 evening):** every positive cold call on Offer A (SEO Pitch) or Offer C (Free Setup Trojan Horse) → ElevenLabs agent fires `save_lead_to_brevo_seo` / `save_lead_to_brevo_setup` → `saveColdCallLead` Cloud Function → Brevo list 35/36 + 5 Spanish email touches (0/1/3/5/7 for A, 0/1/3/5/10 for C). Offer B (Free Audit) uses the separate `submitAuditRequest` audit-delivery pipeline. All 10 templates audited against HR-0, compliant with CAN-SPAM unsubscribe, and attributed via `utm_campaign=coldcall_a|coldcall_c` on a single `/30min` Calendly link. Full spec: `SYSTEM.md §1.3 saveColdCallLead` + `PLAYBOOKS.md §AI Cold Calling`.

---

## ACCELERATOR PRODUCTS (2026-04-27 PM)

> **Why this section exists:** the validated paid-pilot offer (above) closes the agency-retainer ladder, but mathematically caps at ~$226K USD/yr with one operator. To compress the 24-month roadmap to 12-15 months we ship 4 productized accelerators that attack high-ticket developer contracts, the AEO citation moat, the conversion-speed guarantee lever, and transparent performance pricing. Sister doc: `BLUEPRINT.md §2.5`.

### Accelerator 1 — Lanzamiento Preventa 90 Días (high-ticket developer SKU)

**Pitch (in person, never in cold email):** *"Lanzamos tu preventa en 90 días con un sistema completo: landing dedicado, Sofia bilingüe ES/EN/FR, ads en Google y Meta contra el nombre del desarrollo, sitio AEO con schema Article + RealEstateAgent + FAQPage, reporte semanal en Slack. $150-300K MXN por proyecto, dependiendo del tamaño del lanzamiento."*

**Pipeline targets (publicly announced 2026 preventas, all ungrabbed by competitors):**
- Ritz-Carlton Residences Riviera Maya · Villa Capri (Xpu-Ha) · NALÚ Sanctuary · Distrito Zen (Puerto Cancún) · Nickelodeon Hotel Riviera Maya preventa · the broader $300M new-Cancún-hotel construction wave

**Outreach:** Apify-scrape preventa news mentions → enrich marketing directors via `linkedin-hiring-intent` skill → personalized 3-email Instantly sequence + LinkedIn DM. Skill update: `lead-finder` add `--mode=developer-preventa`.

**Math:** 6 contracts × $200K MXN avg = $1.2M MXN annual contribution (~$100K MXN/mo) — by itself accelerates Phase 2 of the roadmap by ~6 months. Templated delivery means marginal effort drops after contract #2.

**Where to land prospects:** new dedicated landing page `jegodigital.com/lanzamiento-preventa` (build in `website-builder` skill, brand-locked #0f1115 + #C5A059, Flamingo + GoodLife as social proof anchors).

### Accelerator 2 — Garantía 60 Segundos (productized response-time guarantee)

**Public guarantee:** *"Si Sofia no responde en 60 segundos, este mes va por nuestra cuenta."*

**Why this is a closing lever no competitor can copy:** sub-1-min response = 7× more likely to convert; sub-30-min = 21× higher than slower competitors. Sofia already does this with current ManyChat + ElevenLabs setup. Putting it in writing as a public guarantee is structural — Trichter (consultancy with humans) literally cannot match it.

**Where to deploy:**
- Homepage hero (Spanish + English)
- Every Pack Crecimiento + Pack Dominación deliverables list (signed contracts include the guarantee clause)
- Calendly call closing line — Alex must say it verbatim
- Cold email step 4 social-proof slot
- Sofia ManyChat ice-breaker copy

**Measurement Cloud Function:** `sofiaResponseTimeMonitor` logs every Sofia first-touch (WA + IG + web chat) → Firestore `response_times` collection → monthly client report includes "Tiempo promedio de respuesta: Xs" as proof of guarantee fulfillment. If a single client month shows >60s avg, that month's invoice is auto-credited.

### Accelerator 3 — Reporte AEO 2026 (audit funnel rebrand)

**Old:** `/auditoria-gratis` — generic SEO audit, gets confused with PageSpeed audits.
**New:** `/reporte-aeo-2026` — leads with the 2026 AEO trend, lands as a category-defining product.

**Hero copy:** *"Descubre por qué ChatGPT, Gemini y Perplexity no te están recomendando."*

**Public LLM citation score (0-100):** computed live by firing 5 buyer-intent prompts in parallel across Perplexity + ChatGPT + Gemini:
1. "¿Cuál es la mejor inmobiliaria en {city}?"
2. "¿Qué desarrollador de propiedades recomiendas en {region}?"
3. "Mejor agencia de bienes raíces en {city} 2026"
4. "Inmobiliarias confiables en {city}"
5. "Best real estate agency in {city} Mexico" (English variant)

Each prompt scored on (a) appears in answer (yes/no), (b) appears in cited sources (yes/no), (c) sentiment if mentioned. Score normalized 0-100. Score is shareable on LinkedIn → creates inbound that retainer pitches don't.

**Pipeline updates:**
- Rename URL with 301 redirect (preserve all backlinks)
- Extend `submitAuditRequest` Cloud Function with `citationScoreModule`
- Update `audit-funnel` skill SKILL.md to document new module
- Update Brevo audit-delivery email template to lead with the citation score
- Update Sofia ManyChat audit-offer copy to say "Reporte AEO 2026" instead of "auditoría gratis"

### Accelerator 4 — Public Performance Tier SKUs (`/precios`)

**Three tiers, publicly priced** (anchored below industry CPL benchmark of $416-480 USD ≈ $7,500 MXN — fair pricing, but still 9-10× retainer ceiling per high-volume account):

| Tier | Price | Definition |
|---|---|---|
| **Form Fill** | $300 MXN | Lead submits name + email + URL via web form |
| **Qualified WhatsApp** | $750 MXN | ≥3 WA conversation turns + Sofia confirms decision-maker |
| **Booked Calendly Show** | $1,500 MXN | Calendly booked AND lead actually shows up to the call |

**Math example:** one client doing 30 booked appointments/mo = $45,000 MXN — 9× the Pack Lead Capture ceiling on a single account. Top 3 retainer clients (Flamingo + 2 others) have the volume to justify the conversion.

**Side benefit:** publicly priced performance tier acts as a tire-kicker filter — anyone balking at $1,500 MXN per booked showing was never going to pay $28,900 MXN/mo for Pack Dominación.

**Billing infrastructure:** Stripe metered billing reading from Firestore `qualified_leads` collection nightly. Update `client-onboarding` skill with Performance Tier SKU schema + monthly invoice template.

### Accelerator 5 — `jegodigital.com/observatorio` (transparency-as-moat dashboard)

**Public anonymized dashboard, refresh every 60s:**
- Sofia conversations handled today (count)
- Average response time across all clients (seconds — proof of Garantía 60s)
- Leads qualified this week (count)
- Audits delivered this week (count)
- Live LLM citation count for client portfolio (aggregate across 5 prompts × all clients)
- Current Google Maps positions (anonymized to "Cliente A / B / C")

**HR-0 compliance:** all numbers come from live Firestore + DataForSEO + ElevenLabs API reads. Zero estimates, zero "industry averages." If an API is down, the dashboard says "Recargando…" — never falls back to cached numbers.

**Why it's a moat:** Trichter and Digital Piloto cannot ship this because their consultancy model has nothing to display in real time. Brokers in 2026 trust transparent AI more than opaque "agency magic" — and `/observatorio` makes the AI stack the brand promise instead of the hidden liability it currently is.

**Build:** single Cloud Function `observatorioMetrics` + static HTML page on `jegodigital.com/observatorio` (Firebase Hosting). No login, no auth — fully public. Brand-locked #0f1115 + #C5A059.

### How the 5 accelerators stack with the validated offer

| Channel/touchpoint | Validated offer (§ Sales Strategy) | + Accelerator overlay |
|---|---|---|
| Homepage hero | Pack Crecimiento + 14-day money-back | + Garantía 60 Segundos badge + `/observatorio` link |
| Cold email reply | Free audit + Calendly + WhatsApp | + Reporte AEO 2026 link replaces auditoria-gratis |
| Calendly close | Anchor Flamingo 4.4× → Pack Crecimiento $18,900 + 14-day money-back | + Garantía 60s as additional risk reversal + Performance Tier as upsell after month 1 |
| Cold call positive | ElevenLabs Sofia → Brevo nurture + Calendly | + counter-position vs Trichter ("operador, no consultor") |
| Outbound to developers | Generic Trojan Horse | **NEW: Lanzamiento Preventa 90 Días** $150-300K MXN — primary high-ticket motion |
| `/precios` page | Hidden pricing (Calendly only) | + Public Performance Tier SKUs visible (form fill / WhatsApp / Calendly show) |

---

## OUTREACH PIPELINE — INSTANTLY.AI

**Sending domains (live state 2026-04-24):** `zennoenigmawire.com` + `zeniaaqua.org` — 10 Google Workspace mailboxes total (5 per domain), all warmup ON, `stat_warmup_score: 100/100`, 30 sends/day each = **300/day capacity**. Separate from jegodigital.com to protect main domain reputation.

**Mailbox roster (verified live via `/api/v2/accounts`):**
- `zennoenigmawire.com`: ariana, emily, russell, william, peter
- `zeniaaqua.org`: kevin, michael, roger, ryan, henry

**DEPRECATED senders — NEVER re-add:** `@aichatsy.com`, `@jegoaeo.com`, `@jegoleads.*`, `@alexiuzz83.gmail.com`. All killed pre-April 2026 for poor Gmail deliverability. Any doc that still mentions `aichatsy.com` as the sending domain is stale.

### AI Reply Agent Guidance (UPDATED April 19, 2026 — AUDIT-FIRST funnel replaces demo-video-first)

> Always reply in the same language as the lead. Spanish if they write in Spanish, English if they write in English.
>
> If the reply is positive or shows interest, do the following in ONE reply:
>
> 1. **Offer the free audit FIRST — it's the strongest hook.** It arrives in 45 minutes and covers PageSpeed, Google Maps presence, ChatGPT/Perplexity visibility, and the 3 biggest gaps costing them leads. Send them this personalized one-click link (Instantly auto-merges the variables):
>    - Spanish: `https://jegodigital.com/auditoria-gratis?url={{website}}&email={{email}}&firstName={{firstName}}&source=instantly_reply`
>    - English: `https://jegodigital.com/auditoria-gratis?url={{website}}&email={{email}}&firstName={{firstName}}&source=instantly_reply`
>    - Say exactly: "Dale click al link de abajo y te llega a tu correo en 45 minutos — sin costo." / "Click the link below and the full audit arrives in your inbox in 45 minutes — free."
>
> 2. **Drop the social proof in one line.** Spanish: "Flamingo Real Estate: 4.4x visibilidad y #1 en Google Maps. GoodLife Tulum: +300% tráfico orgánico." English: "Flamingo Real Estate: 4.4x visibility and #1 on Google Maps. GoodLife Tulum: +300% organic traffic."
>
> 3. **Propose a Calendly call AFTER the audit lands.** Spanish: "Cuando te llegue el audit, ¿te parece que lo revisemos juntos 15 minutos el martes o jueves? calendly.com/jegoalexdigital/30min" English: "Once the audit arrives, want to walk through it together — 15 minutes Tuesday or Thursday? calendly.com/jegoalexdigital/30min"
>
> 4. **Include WhatsApp as backup:** +52 998 202 3263.
>
> 5. **If the lead specifically asks for a demo video instead of an audit**, send the matching demo URL (see Demo Video URL Map) AND still offer the audit as a follow-up ("también te puedo mandar una auditoría gratis de {{website}} en 45 minutos, te muestra exactamente dónde perder leads").
>
> Keep the full reply to 6-8 lines. Never mention pricing. Never reveal any automation tools or software names (no "Claude", no "ManyChat", no "Firecrawl", no "DataForSEO").
>
> If the reply is negative, respond briefly and professionally, thank them for their time, and remove them from the sequence.

**⚠️ WHY THIS CHANGED (April 19, 2026):** The old guidance sent demo videos first. Video demos convert ~0.3% to booked calls. The free audit is a much stronger lead magnet — it delivers tangible value (PageSpeed score, Google Maps position, ChatGPT visibility, 3 concrete fixes) within 45 minutes. The one-click pre-filled URL closes the friction gap that was forcing Alex to manually trigger audits for every positive reply. Now the lead clicks once, the audit fires, and Calendly becomes the natural next step AFTER they've seen the deliverable. Reference Apr 19 memory: `audit_pipeline_dual_fetch.md`.

**Short version for Instantly UI (paste this verbatim into the AI agent prompt):**
```
Always match the lead's language (ES or EN).

POSITIVE REPLY → do all in ONE reply:
1. Offer free audit. Send this personalized link (vars auto-merge):
   https://jegodigital.com/auditoria-gratis?url={{website}}&email={{email}}&firstName={{firstName}}&source=instantly_reply
   Say: "Dale click y te llega en 45 minutos, sin costo." / "Click it, audit arrives in 45 min, free."
2. Social proof: "Flamingo Real Estate: 4.4x visibility, #1 Google Maps. GoodLife Tulum: +300% organic traffic."
3. Propose Calendly AFTER audit: "Cuando te llegue, ¿15 min el martes/jueves? calendly.com/jegoalexdigital/30min"
4. WhatsApp backup: +52 998 202 3263.
5. If they specifically ask for a demo video (not audit), send matching demo URL AND offer audit as add-on.

NEVER mention pricing. NEVER reveal tool names. 6-8 lines max.

NEGATIVE REPLY → thanks + remove from sequence. Brief, professional.
```

### Demo Video URL Map
| Service | URL |
|---|---|
| AI Lead Capture / WhatsApp | jegodigital.com/lead-capture-demo |
| SEO / Google / AEO | jegodigital.com/seo-aeo-demo |
| Social Media | jegodigital.com/social-media-demo |
| Property Videos | jegodigital.com/property-videos-demo |
| AI Voice Agent | jegodigital.com/ai-voice-agent-demo |
| CRM / Admin | jegodigital.com/admin-crm-demo |
| Fallback | jegodigital.com/lead-capture-demo |

**RULE:** Demo videos only sent AFTER positive reply. NEVER in Step 1 cold emails.

### Cold Email Rules (Updated April 19, 2026)
1. No pricing ever in any email — not even a hint
2. **No Calendly links in Step 1 cold emails.** CTA depends on campaign type:
   - **Demo campaigns** (Trojan, SEO, WhatsApp, Staging): "¿Te mando un video demo de 1 minuto?"
   - **Audit campaigns** (Auditoría Gratis, Supersearch, Hispanic-Bilingual): "¿Te mando la auditoría en 45 minutos?" — NO link in Step 1, but Steps 2-5 MUST include the pre-filled one-click URL: `https://jegodigital.com/auditoria-gratis?url={{website}}&email={{email}}&firstName={{firstName}}&source=cold_email_mx`
3. **Calendly IS required in positive reply responses** — but AFTER offering the audit first (see AI agent guidance above). For audit-offer campaigns, the audit link IS the primary CTA, Calendly is the follow-up after delivery.
4. Sign as "Alex" only, then "JegoDigital" — never full name
5. Language matching — Spanish default, English if they write in English
6. Always use "inmobiliarias en México" — never "Riviera Maya" in mass templates
7. **Subject lines: 1–3 words maximum** (research: 2 words = best open rates)
8. **Greeting: default `Hola,` for scraped/unverified lists.** Exception: `Hola {{firstName}},` is allowed ONLY when the campaign's lead list has been audited and firstName is ≥99% populated with real names (e.g. post-April-15 Trojan 100%, Campaign F 100%, US-Hispanic-Bilingual 100%). Verify with `is_fake_name` filter before enabling. On any non-verified list the variable renders blank and destroys trust — see April 15 disaster.
9. **Body: 60–80 words maximum** for Step 1 (research: 50–75 words = 12% reply rate)
10. **Build Steps 2–5 for every campaign** — 42% of all replies come from follow-ups
11. **NEVER use `[bracket placeholders]`** — `[your city]`, `[your company]`, `[your name]` etc. Instantly does NOT interpret square brackets, they send literally. Use a valid `{{instantlyVariable}}` (`{{firstName}}`, `{{companyName}}`, `{{website}}`) or rewrite the sentence generically ("your area", "your market"). **Disaster:** April 18, 2026 — US-Hispanic-Bilingual-Audit Steps 1 & 4 shipped with `[your city]` hardcoded. Caught before activation by Alex. Pre-ship grep `grep -oE '\[[a-z ]+\]' <bodies>` must return zero. See `cold-email-sequences-2026.md` Disaster Log.
12. **Match personalization depth to list quality.** Level 2 (`{{firstName}}` + `{{companyName}}`) is the MINIMUM for Explorium/Hunter-verified lists where every row has verified first name + company. Shipping "Hi," on a verified list is wasted personalization potential — every field in the upload CSV should be used.

**Full 5-step sequences for all campaigns:** see `cold-email-sequences-2026.md` (root of jegodigital folder).
This is the single source of truth for all campaign copy, timing, and Instantly build instructions.

### Active Campaign Templates — Step 1 Only (Quick Reference)

**Trojan Horse** — Subject: `¿Pierdes leads?`
```
Hola,

Ayudamos a inmobiliarias en México a capturar más leads y cerrar más ventas con sistemas de IA que responden en segundos.

GoodLife Tulum logró un 300% más de tráfico orgánico trabajando con nosotros. Puedes ver más casos en nuestra página.

Te instalamos el sistema sin costo de configuración.

¿Te mando un video demo de 1 minuto para que veas cómo funciona?

Alex
JegoDigital
```

**SEO + Visibilidad** — Subject: `Tu competencia`
```
Hola,

Ayudamos a inmobiliarias en México a generar más leads y ventas con posicionamiento orgánico en Google, Google Maps y buscadores con IA como ChatGPT y Perplexity.

GoodLife Tulum logró un 300% más de tráfico orgánico trabajando con nosotros. Puedes ver más casos de éxito en nuestra página.

Te posicionamos por encima de tu competencia en búsquedas orgánicas, sin pagar publicidad.

¿Te mando un video demo de 1 minuto para que veas cómo funciona?

Alex
JegoDigital
```

**World Cup 2026** — Subject: `Mundial 2026`
```
Hola,

En junio, México recibirá más turistas extranjeros que en cualquier otro mes del año por el Mundial 2026.

Muchos de ellos buscan propiedades. La pregunta no es si habrá demanda — es si tu inmobiliaria aparecerá cuando la busquen.

GoodLife Tulum logró 300% más tráfico orgánico trabajando con nosotros. Tu ventana para posicionarte antes del Mundial se cierra pronto.

¿Te mando un video demo de 1 minuto?

Alex
JegoDigital
```
⚠️ Kill this campaign July 1, 2026.

**ChatGPT Angle (replaces Campaign A)** — Subject: `ChatGPT y tú`
```
Hola,

Haz esta prueba: abre ChatGPT y escribe "¿cuál es la mejor inmobiliaria en [tu ciudad]?"

Si tu agencia no aparece, tienes un problema que va a crecer. El 34% de búsquedas inmobiliarias ya pasan por ChatGPT, Gemini o Perplexity — y ese número sube cada mes.

Ayudamos a inmobiliarias en México a aparecer en esas respuestas.

¿Te mando un video demo de 1 minuto?

Alex
JegoDigital
```

**Speed-to-Lead (fix Campaign B)** — Subject: `5 minutos`
```
Hola,

¿Sabes cuánto tarda tu inmobiliaria en responder a un lead nuevo?

Los leads contactados en menos de 5 minutos tienen 21 veces más probabilidad de cerrar. La mayoría de inmobiliarias responde en 12 horas o más.

GoodLife Tulum logró 300% más tráfico orgánico y automatizó el 88% de su seguimiento trabajando con nosotros.

¿Te mando un video de 1 minuto para que veas cómo funciona?

Alex
JegoDigital
```

**⛔ Redes Sociales** — CAMPAIGN DELETED April 2026. Do not recreate. Do not reference.

---

## WHATSAPP + INSTAGRAM FUNNEL

**ManyChat flow:** https://app.manychat.com/fb4452446/cms/files/wa_default/edit

**3 buttons → all route to AI Step (Sofia):**
- Ver Servicios → AI Step ✅
- Quiero mas leads → AI Step ✅
- Hablar con Alex → AI Step ✅

**Sofia handles:** qualification, audit offer, Calendly push. Alex steps in manually when lead is hot.

**Sofia's End Goals (Updated April 17, 2026 ~00:20 CST):**
- **Primary:** Get lead to AGREE to free digital audit → confirm we have name/email → ask ONLY for website URL → audit delivered to email in 60 min
- **Secondary:** Book Calendly call to review audit results with Alex
- Sofia does NOT collect name or email — ManyChat already has them

**Ice Breakers (live, published — 3 total, updated April 16, 2026):**
1. Quiero generar mas leads para mi agencia → WhatsApp Default Reply
2. Auditoría gratis de mi sitio web → WhatsApp Default Reply
3. Agendar consultoría gratuita de 30 min → WhatsApp Default Reply

**Calendly:** calendly.com/jegoalexdigital/30min
**Alex WhatsApp:** +52 998 202 3263

### Audit Funnel — In-Chat (LIVE — April 17, 2026 ~00:20 CST)

**IG flow (fully automated):** Lead says "AUDITORIA" → collects email → collects website URL → fires `submitAuditRequest` API → audit report generated (~37s) → emailed to lead → Calendly upsell
**WA flow:** Sofia offers audit → confirms info → asks for URL → sends to jegodigital.com/auditoria-gratis (Phase 2: direct API call TODO)
**Cloud Function:** `https://us-central1-jegodigital-e02fb.cloudfunctions.net/submitAuditRequest`

**DEPLOY NEEDED:** Run `firebase deploy --only functions:submitAuditRequest` to enable `source` tracking (manychat_instagram vs auditoria-gratis).

---

## PAID RETARGETING SIEGE — Google Demand Gen + Meta Lead Form (LIVE 2026-04-28)

> 🚀 **Live operations doc:** [`docs/operations/MARKETING_OPS_HUB.md`](docs/operations/MARKETING_OPS_HUB.md) — single source of truth for what's running NOW (Meta Lead Form, audiences, Brevo nurture, CAPI events, KPI targets).
>
> 📚 **Skill:** [`docs/skills/meta-ads-jegodigital/SKILL.md`](docs/skills/meta-ads-jegodigital/SKILL.md) — full playbook (19 sections, 11 cited research sources). Use this skill EVERY TIME for Meta Ads work.

**The play:** Cold-email-engaged + LinkedIn hiring-intent + DIAL_READY leads (2,238 verified, deduped from 9 active Instantly campaigns + Apify hiring scrape) get paid retargeting on Meta + Google while cold email + AI cold call cadence runs on the same list. Multi-channel siege: by week 2, JegoDigital is inescapable.

**Reality check vs. original plan:** the "1,767 LinkedIn hiring-intent" referenced in the original 2026-04-27 plan was aspirational — the actual scrape only produced ~46 LinkedIn hiring-intent leads with verified emails. The 2,238 audience is built from the broader Instantly + LinkedIn + cold-call pool, all verification_status=1 only. Quality over the imagined number.

### Why hiring-intent leads are the highest-quality paid audience we can buy
- **Budget signal** — they're hiring marketing roles → they have budget
- **Pain signal** — they're hiring → they have a marketing problem they can't solve internally
- **Decision-maker** — Hunter.io verified CMO/CFO/Director, not gatekeepers
- **Already in our funnel** — Instantly cold-emailing them + ElevenLabs Sofia calling them

### Channel #1 — Google Demand Gen retargeting

| Setting | Value |
|---|---|
| Account | `471-527-2770` (under MCC `799-799-5839`) |
| Type | Demand Gen |
| Audience | Customer Match `1767_hiring_intent_2026-04-27` (the hashed CSV) |
| Optimized targeting | OFF (no lookalikes — pure 1,767 focus) |
| Surfaces | YouTube + YouTube Shorts + Gmail + Discover + Display |
| Budget | MX$150/day |
| Frequency cap | 8/week per person |
| Geo | Mexico + Miami-Dade |
| Languages | Spanish + English |
| Bid | Maximize Clicks |
| Creative | 5 case-study images (Flamingo, GoodLife, Solik, Goza, offer card) + 27s Spanish video |
| Landing | jegodigital.com/auditoria-gratis (full audit pipeline) |

**Master prompt:** `docs/campaigns/MASTER_PROMPT_google_ads_demand_gen.md`
**Creative kit:** `creatives/demand-gen-2026-04-27/{1x1,4x5,9x16,16x9,videos}/`

### Channel #2 — Meta/Facebook Lead Form retargeting

| Setting | Value |
|---|---|
| Account | Meta Ad Account `968739288838315` |
| Objective | **Leads (Meta Instant Lead Form, NOT website)** — see strategy dossier for why |
| Audience | TWO ad sets — AS-1: same 1,767 Customer Match · AS-2: Pixel-based site visitors who didn't convert |
| Placements | **FB Feed only** (skip IG/Marketplace/Audience Network/Reels for v1; add IG Feed week 2 if FB saturates) |
| Budget | MX$50/day total — 60% AS-1, 40% AS-2 |
| Frequency cap | 4/week per ad set |
| Geo | Mexico + Miami-Dade |
| Languages | Spanish + English |
| Creative | Same as Google Demand Gen (4:5 case studies + 27s video) |
| Lead form | Email (pre-filled) · URL del sitio · WhatsApp |
| Webhook | `metaLeadFormWebhook` → Brevo (Hiring Intent FB list) + `submitAuditRequest` → automatic audit delivery in <5 min |

**Why Lead Form (not website landing page):** Meta Instant Lead Form converts 5-10% (vs 1-3% landing page) for warm pre-qualified audiences. Our 1,767 list is hand-verified — quality is filtered upstream, friction = lost leads. Backstopped with webhook → Brevo → automatic /auditoria-gratis pipeline → email delivery, so they still get the full audit experience.

**Why FB Feed only for v1:** Simpler delivery, faster signal. Skip IG/Marketplace/Audience Network/Messenger Inbox/Reels initially. Add IG Feed in week 2 only if FB saturates the 1,767 list.

**Strategy dossier:** `docs/research/facebook-ads-strategy-2026-04-27.md` (Perplexity-validated)
**Campaign blueprint:** `docs/campaigns/facebook-custom-audience-retargeting-2026-04-27.md`

### Combined cross-channel touch budget per lead per week

| Touchpoint | Frequency |
|---|---|
| Cold email (Instantly) | 5 emails over 12 days |
| AI cold call (ElevenLabs Sofia, MX or US bilingual) | 1-2 attempts |
| **Google Demand Gen** — YouTube/Gmail/Discover/Display | 8/week |
| **Meta FB Feed** — Lead Form ad | 4/week (per ad set, so up to 8 across both ad sets) |
| **Total paid touches** | **12-16/week** + email/call drip |

That's ~2 paid impressions per lead per day, every day, across YouTube + Gmail + FB + Display, while we email + call them. The brand becomes inescapable in 14-30 days.

### Anti-goals (what we NEVER do)
- ❌ Run paid ads to broad keyword searches (we tried it — paused 2026-04-27)
- ❌ Add lookalike audiences (would dilute 1,767 focus until we have ROI proof)
- ❌ Quote price in any ad copy (HR-0 — Calendly call only)
- ❌ Run Meta on Marketplace, Audience Network, or Messenger Inbox (consumer/intrusive)
- ❌ Skip the webhook plumbing for Meta Lead Form (without it, leads die in Meta's UI)

---

## KEY CONSTRAINTS

- **Focus on OUTCOMES:** more showings, more deals, less time chasing leads
- **Client-facing language:** always Spanish, premium tone, zero AI/tech jargon
- **No PDFs to prospects** — max 3 bullet points + Calendly link
- **Never reveal AI stack** to clients
- **Prioritize executable tasks** over theory

---

## REVENUE GOAL & 5 REVENUE STREAMS

**Goal:** $1,000,000 USD/year ($1,670,000 MXN/month)
**Baseline runway:** 24 months · **Accelerated runway (with §2.5 Acceleration Layer firing):** 12-15 months

**5 Revenue Streams:**

| # | Stream | Monthly target | Vehicle |
|---|---|---|---|
| 1 | Recurring agency clients (35 on retainer) | $420,000 MXN | Pack Crecimiento $18,900 + Pack Dominación $28,900 (validated 2026-04-27) |
| 2 | Real estate developer contracts ($150-300K MXN/project) | $350,000 MXN | **Lanzamiento Preventa 90 Días** SKU (Accelerator 1) — 6 contracts/yr at $200K avg |
| 3 | Performance-based deals (base + per qualified lead) | $400,000 MXN | **Public Performance Tier SKUs** (Accelerator 4) — $300/$750/$1,500 per outcome |
| 4 | White-label / agency partners (license AI stack) | $250,000 MXN | $40-60K MXN/mo per partner × 5 partners (Phase 4 lever) |
| 5 | High-ticket projects (premium sites, AI installs, consulting) | $250,000 MXN | Sitio Web Premium $24,900 + bespoke AI installations |

**Acceleration math (with §2.5 firing on all 7 moves):**

| Phase | Baseline (24-mo plan) | Accelerated (§2.5 plan) | Source of compression |
|---|---|---|---|
| $700K MXN/mo MRR | Month 12 | **Month 6** | 1-2 Lanzamiento Preventa contracts ($300-400K MXN) + Performance Tier conversion of top 3 retainer clients |
| $1.1M MXN/mo MRR | Month 18 | **Month 9-12** | 4-5 Lanzamiento Preventa contracts cycling + AEO citation moat compounding inbound |
| $1.67M MXN/mo MRR ($1M ARR) | Month 24 | **Month 12-15** | All 5 streams firing + 2-3 white-label partners signed |

**Weekly KPIs (updated 2026-04-27 PM with Accelerator overlay):**
- Outbound messages (Instantly cold email): 500/week
- Discovery calls (Calendly): 10/week
- **NEW: Developer marketing-director outreach** (Lanzamiento Preventa pipeline): 25/week, target 1 closed Lanzamiento contract per month
- **NEW: LLM citation score deltas** (Reporte AEO 2026): track Flamingo + Solik + GoodLife monthly, target +10 points/mo
- **NEW: Sofia avg response time** (Garantía 60s monitoring): <60s avg, no client month >60s
- New recurring revenue: $50,000 MXN/week (existing) + $25,000 MXN/week from Lanzamiento + Performance Tier (NEW)
- Churn: < 5%/month

---

---

## VERSION CONTROL

| Date | Major changes |
|---|---|
| 2026-04-21 | Initial extraction from CLAUDE.md (Phase 2 refactor) |
| 2026-04-27 AM | Validated Offer 2026-04-27 — paid pilot replaces free Trojan Horse, raised pricing tiers ($18,900 / $28,900 MXN) |
| 2026-04-27 PM | **Acceleration overlay** — added Competitive Counter-Positioning (Trichter + Digital Piloto), Accelerator Products (Lanzamiento Preventa, Garantía 60s, Reporte AEO 2026, Performance Tier SKUs, /observatorio dashboard), revenue acceleration math (24-mo → 12-15-mo compressed runway), updated weekly KPIs with developer outreach + citation score + response time targets. Sister: `BLUEPRINT.md §2.5`. |

*End of BUSINESS.md — keep copy fresh, update weekly when campaigns/templates change.*
