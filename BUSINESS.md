# JegoDigital — Business Context (services, pricing, outreach, sales)

> **Purpose:** The **business brain** of JegoDigital — the 9 services we sell, the clients we target, the proof we cite, the sales motion, the exact outreach copy, and the revenue math that drives everything.
> **Read this file when:** You're writing outreach copy, editing cold email templates, tweaking Sofia's WhatsApp funnel, building a proposal, or answering "how does JegoDigital actually make money?"
> **Sister files:** `CLAUDE.md` (the rules) · `PLAYBOOKS.md` (how we ship: IG, cold calls, mockups) · `AI_AGENT_PERSONA.md` (the strategic brain).
> **Last updated:** 2026-04-21 (extracted from CLAUDE.md during Phase 2 refactor)

---

## 📑 TABLE OF CONTENTS

1. [The 9 Services](#the-9-services)
2. [Target Client (ICP)](#target-client)
3. [Verified Results (social proof)](#verified-results)
4. [Sales Strategy — Trojan Horse](#sales-strategy--the-trojan-horse)
5. [Outreach Pipeline — Instantly.ai](#outreach-pipeline--instantlyai)
6. [WhatsApp + Instagram Funnel — ManyChat + Sofia](#whatsapp--instagram-funnel)
7. [Key Constraints](#key-constraints)
8. [Revenue Goal & 5 Revenue Streams](#revenue-goal--5-revenue-streams)

---

## THE 9 SERVICES

### CRITICAL PRICING RULE
**NEVER reveal pricing in any automated channel** — not WhatsApp, not email, not cold outreach, not in writing. Pricing is ONLY discussed live on a Calendly call with Alex.

### Entry "Trojan Horse" — Always lead with this
**Service 1: Captura de Leads 24/7 con IA** — offered with FREE setup to get foot in the door.

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

**Bundles:**
- **Pack Crecimiento** (1+2+4) — bundled discount
- **Pack Dominacion** (1+2+3+4+6) — bundled discount

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
| **Flamingo Real Estate** (Cancún) — ACTIVE | 4.4x search visibility, #1 Google Maps, +320% organic traffic, 88% leads automated |
| **GoodLife Tulum** | +300% organic traffic ← **Primary cold email social proof** |
| **Goza Real Estate** | 3x lead volume, 98 PageSpeed, 24/7 AI coverage |
| **Solik Real Estate** | 95% lead qualify rate, #1 Maps, bilingual AI |

All results: jegodigital.com/showcase · instagram.com/jegodigital

⚠️ **Per HARD RULE #9 (CLAUDE.md):** these numbers must be re-verified on the 1st of every month. If any moved down >20%, pull it from cold-email copy until reverified. Only Flamingo has a verified domain (`realestateflamingo.com.mx`); the other 3 clients must be kept in copy only, not used in URL tests — see CLIENT DOMAIN RULE in CLAUDE.md.

---

## SALES STRATEGY — THE TROJAN HORSE

1. Lead in → Sofia qualifies on WhatsApp
2. Offer free setup for Service 1 (Captura de Leads 24/7) — remove all friction
3. They see immediate ROI (captured a lead they would have lost)
4. Follow up in 2 weeks → "You captured X leads you would have lost"
5. Upsell to SEO Local (Service 2) or Pack Crecimiento bundle
6. **Never quote full price on WhatsApp** — push to Calendly call
7. **Anchor with results** (Flamingo 4.4x, GoodLife 300%) before any price discussion

**Objection responses:**
- "No tengo presupuesto" → "Empezamos gratis — sin costo de instalación"
- "¿Cuánto cuesta?" → "Depende de tu zona. ¿15 minutos esta semana? calendly.com/jegoalexdigital/30min"
- "Mándame información" → 3 bullet points max + Calendly link. **NEVER a PDF. NEVER pricing.**

**Cold-call → Brevo nurture capture (LIVE 2026-04-22 evening):** every positive cold call on Offer A (SEO Pitch) or Offer C (Free Setup Trojan Horse) → ElevenLabs agent fires `save_lead_to_brevo_seo` / `save_lead_to_brevo_setup` → `saveColdCallLead` Cloud Function → Brevo list 35/36 + 5 Spanish email touches (0/1/3/5/7 for A, 0/1/3/5/10 for C). Offer B (Free Audit) uses the separate `submitAuditRequest` audit-delivery pipeline. All 10 templates audited against HR-0, compliant with CAN-SPAM unsubscribe, and attributed via `utm_campaign=coldcall_a|coldcall_c` on a single `/30min` Calendly link. Full spec: `SYSTEM.md §1.3 saveColdCallLead` + `PLAYBOOKS.md §AI Cold Calling`.

---

## OUTREACH PIPELINE — INSTANTLY.AI

**Sending domain:** aichatsy.com (separate from jegodigital.com to protect main domain)

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
> 4. **Include WhatsApp as backup:** +52 998 787 5321.
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
4. WhatsApp backup: +52 998 787 5321.
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
**Alex WhatsApp:** +52 998 787 5321

### Audit Funnel — In-Chat (LIVE — April 17, 2026 ~00:20 CST)

**IG flow (fully automated):** Lead says "AUDITORIA" → collects email → collects website URL → fires `submitAuditRequest` API → audit report generated (~37s) → emailed to lead → Calendly upsell
**WA flow:** Sofia offers audit → confirms info → asks for URL → sends to jegodigital.com/auditoria-gratis (Phase 2: direct API call TODO)
**Cloud Function:** `https://us-central1-jegodigital-e02fb.cloudfunctions.net/submitAuditRequest`

**DEPLOY NEEDED:** Run `firebase deploy --only functions:submitAuditRequest` to enable `source` tracking (manychat_instagram vs auditoria-gratis).

---

## KEY CONSTRAINTS

- **Focus on OUTCOMES:** more showings, more deals, less time chasing leads
- **Client-facing language:** always Spanish, premium tone, zero AI/tech jargon
- **No PDFs to prospects** — max 3 bullet points + Calendly link
- **Never reveal AI stack** to clients
- **Prioritize executable tasks** over theory

---

## REVENUE GOAL & 5 REVENUE STREAMS

**Goal:** $1,000,000 USD/year ($1,670,000 MXN/month) — 24-month runway

**5 Revenue Streams:**
1. Recurring agency clients (35 clients on retainer) → $420,000 MXN/mo
2. Real estate developer contracts ($80K–$200K MXN per project) → $350,000 MXN/mo
3. Performance-based deals (base + per qualified lead) → $400,000 MXN/mo
4. White-label / agency partners (license AI stack) → $250,000 MXN/mo
5. High-ticket projects (premium sites, AI installs, consulting) → $250,000 MXN/mo

**Weekly KPIs:**
- Outbound messages (OpenClaw): 500/week
- Discovery calls (Calendly): 10/week
- Free Trojan Horse installs: 3/week
- New recurring revenue: $50,000 MXN/week
- Churn: < 5%/month

---

*End of BUSINESS.md — keep copy fresh, update weekly when campaigns/templates change.*
