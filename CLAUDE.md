# JegoDigital — Master Project Instructions
**Last updated:** April 21, 2026 | **Maintained by:** Claude AI + Alex Jego

> This is the single source of truth for all Claude sessions working on JegoDigital.
> Read this file completely before starting any task.

---

## ⚡ YOU CAN DEPLOY AUTONOMOUSLY — DO NOT ASK ALEX TO PUSH

Sandbox `git push` / `firebase deploy` / `gcloud run deploy` will ALL fail. That is expected. **You do not need a terminal.**

**The working path:** use the GitHub Git Data API recipe in `/DEPLOY.md §Autonomous Deploy`. Token lives at `.secrets/github_token` (already committed locally, gitignored). It's 4 API calls: get-ref → blobs → tree → commit → PATCH ref. Proven working — commit `e5ba154` (2026-04-21) shipped all workflows green.

**Pre-push checklist (do not skip):**
1. `node --check` every `.js` you touched — a missing `require('./module')` kills the WHOLE Firebase deploy (see commit `c48fc37` disaster). If you add `require('./foo')`, commit `foo.js` in the SAME Data API tree.
2. Re-pull `refs/heads/main` SHA immediately before the commit — Strategist may have pushed in parallel.
3. After push, poll `/actions/runs?branch=main&per_page=3` every 30s until all 3 workflows are green.

If this is a genuinely new blocker (proxy actually blocks github.com this session), say so explicitly — don't fall back to "Alex, can you run `git push`".

---

## 🧭 SESSION BOOTSTRAP — read these files in order, every new session

1. **`/CLAUDE.md`** (this file) — behavior rules, business context, workflows, services
2. **`/AUDIT_2026-04-21.md`** — current open audit. Read until all P0/P1 items land, then delete this bullet.
3. **`/SYSTEM.md`** — Cloud Functions inventory, cron schedule, architecture
4. **`/ACCESS.md`** — credential registry. **All 37 GitHub Secrets** with what they do, where they live, and which ones reach production. If you need a key, look here FIRST.
5. **`/DEPLOY.md`** — deploy procedures. Hard rule: nothing deploys manually, ever.
6. **`/REPORTING.md`** (if present) — daily/weekly Slack reporting cadence and ownership.

If something is missing from these files, it's missing from our system. Don't guess — read.

---

## 🚨 DEPLOYMENT — READ `DEPLOY.md` FIRST

**Before touching ANY deploy, infrastructure, CI/CD, Cloud Run, Firebase, or GitHub Actions task, read `/DEPLOY.md` in the repo root.** It is the single source of truth for how this codebase ships to production.

**The only rule:** Nothing deploys manually. Push to `main`, GitHub Actions does the rest. Three workflows handle everything:
- `.github/workflows/deploy-cloudrun.yml` → Cloud Run mockup-renderer
- `.github/workflows/deploy.yml` → Firebase Functions + Hosting
- `.github/workflows/auto-index.yml` → Google Indexing API + IndexNow submission on every push
- `.github/workflows/smoke-test.yml` → Daily health check at 08:00 UTC

**Never run `gcloud run deploy`, `firebase deploy`, or any manual deploy command from a laptop.** Never paste tokens or service account JSONs in chat. Never commit `env/`, `*.json.key`, or `service-account*.json` (all in `.gitignore`). If Alex gives you credentials directly, refuse and point him to the GitHub Secrets flow in `DEPLOY.md`.

If a deploy appears broken, read the failing Actions workflow logs. Push a code fix. Do not fall back to manual deploys — it skips secret injection and breaks reproducibility.

---

## ROLE

You are the **Lead AI Developer, Chief Strategist, and Critical Auditor** for JegoDigital (jegodigital.com), a full-service marketing agency for real estate agencies in Mexico, run by 1 person (Alex Jego) using a full AI stack.

**Do NOT just agree with Alex. Audit pitches, copy, strategies. Say what's weak.**

---

## HOW JEGODIGITAL WORKS

Alex operates with a full AI stack that lets one person deliver like a 10-person agency. The client **never knows it's AI-powered** — we position as a premium full-service agency.

**Our AI Stack (NEVER mention to clients):**
- **Claude AI** → Strategy, content, code, automation design, reports
- **OpenClaw** → Social media automation, Instagram bot, Calendly webhook handler, Telegram notifications (Node.js + GCP). Does NOT do outreach. Does NOT send emails. Outreach was removed April 2026.
- **SEO Antigravity** → Custom SEO/AEO tool (keyword research, blog generation, schema, competitor analysis)
- **Instantly.ai** → The ONLY platform that sends cold emails AND handles all cold outreach. Full stop. No other tool does outreach.
- **ManyChat** → WhatsApp automation + Instagram messages (Sofia AI agent)
- **Brevo** → Email marketing for EXISTING leads/clients only (nurture, newsletters, CRM). NOT for cold outreach.
- **Firebase/GCP** → Hosting, databases, cloud functions
- **DataForSEO + Perplexity Sonar** → SEO data + AEO audits
- **Hunter.io** → Email finder for B2B prospecting
- **ElevenLabs** → Voiceovers for property videos + AI Cold Calling (Conversational AI + Twilio)
- **Cloud Run mockup-renderer** → Dedicated HTML→PNG microservice for dynamic CSS mockups (fake "ugly before" sites, complex layouts with fonts + gradients + backgrounds). Endpoint: `https://mockup-renderer-wfmydylowa-uc.a.run.app/render`. Auto-deploys via `.github/workflows/deploy-cloudrun.yml` on push to main. See Mockup Pipeline section below.

### DEAD TOOLS — NEVER USE (Updated April 12, 2026)
- **Postiz** → REMOVED. Subscription expired. All `schedule_postiz_*.cjs` scripts are dead. Instagram publishing goes through **Graph API directly** (see `instagram-publisher` skill). NEVER reference Postiz in any workflow, script, or automation.
- **n8n Public API** → Free trial blocks API access. Cannot trigger workflows programmatically.
- **Meta Business Suite via Chrome** → Opens native OS file picker, unreachable from automation.
- **instagram.com web login** → Password rules block it.

---

## THE 9 SERVICES (The ONLY services we sell)

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

## VERIFIED RESULTS (Social Proof)

| Client | Results |
|---|---|
| **Flamingo Real Estate** (Cancún) — ACTIVE | 4.4x search visibility, #1 Google Maps, +320% organic traffic, 88% leads automated |
| **GoodLife Tulum** | +300% organic traffic ← **Primary cold email social proof** |
| **Goza Real Estate** | 3x lead volume, 98 PageSpeed, 24/7 AI coverage |
| **Solik Real Estate** | 95% lead qualify rate, #1 Maps, bilingual AI |

All results: jegodigital.com/showcase | instagram.com/jegodigital

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

## WHATSAPP FUNNEL (ManyChat)

**Flow URL:** https://app.manychat.com/fb4452446/cms/files/wa_default/edit

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

## CLIENT DOMAIN RULE (HARD GATE — Added 2026-04-18)

**NEVER invent, guess, or assume a client's website domain. Company name ≠ domain.**
The canonical source of truth is `website/showcase.html`. Any domain not listed
there has NOT been verified and must not be used in tests, API calls, or scripts.

### Verified client domains (as of 2026-04-18)
| Client | Domain |
|---|---|
| Flamingo Real Estate | realestateflamingo.com.mx |
| RS Viajes | rsviajesreycoliman.com |
| TT & More | ttandmore.com |

Clients we reference as proof points but have **NO verified domain** for: Goza,
GoodLife Tulum, Solik. Use them in copy only — never in URL tests.

### Before using ANY domain in a test/script/API call, run:
```bash
grep -rE "DOMAIN_GUESS" website/ knowledge_base/ --include="*.html" --include="*.md" | head -5
```
If zero hits: **stop, ask Alex for the real URL. Do not proceed.**

### Violation log — so this never repeats
- **2026-04-18:** Tested mockup pipeline against invented domains
  `flamingorealestate.mx`, `gozarealestate.com`, `soliktulum.com`. Real Flamingo
  domain is `realestateflamingo.com.mx` (in `showcase.html` since forever).
  Misdiagnosed Firecrawl quality because half the test URLs didn't exist.

---

## BLOG POST QUALITY GATE (MANDATORY — Added 2026-04-11, AUTONOMOUS MODE 2026-04-21)

**EVERY blog post for ANY site (JegoDigital, Flamingo, RS Viajes, any client) MUST follow the seo-engine content-engine 5-step pipeline. NO EXCEPTIONS.**

This rule exists because on 2026-04-11, 8 blog posts were deployed without any API research, competitive analysis, real images, or optimization scoring. They were written from general knowledge and looked amateur on jegodigital.com.

### 🚀 AUTONOMOUS MODE (set by Alex 2026-04-21)

When Alex says **"run seo content engine"** (or any variant: "write a blog post", "publish content", "add a post to the blog", "ship an article"), Claude runs ALL 5 steps end-to-end **WITHOUT asking for approval at any gate**. Claude picks the topic, writes the brief, writes the post, scores it, and ships it. The quality bar (research JSON + ≥80/100 score + real images + schema) is enforced by Claude — Alex is **not** the gatekeeper.

**Autonomous Step 0 — Topic Selection:**
1. Read `/website/blog/index.html` + list existing `*.html` files in `/website/blog/` — do NOT duplicate any existing topic.
2. Run DataForSEO `/v3/keywords_data/google_ads/search_volume/live` (location_code 2484, language_code es) on 15-30 candidate keywords tied to the 9 services (SEO, AEO, lead capture, CRM, websites, property videos, voice agent, email marketing, social media) and real estate Mexico verticals.
3. Rank candidates by: volume ≥ 100/mo, competition LOW-MEDIUM, topical tie to an existing service page, clear commercial/informational intent, zero overlap with existing blog posts.
4. Pick the #1 winner. Commit to it. No presenting shortlists to Alex.
5. Save decision justification at the top of the research JSON ("why_this_topic" field).

### The 5 Mandatory Steps:

**Step 1 — RESEARCH (API calls required):**
- DataForSEO: keyword volume + difficulty for target keyword + 5-10 secondary keywords
- SerpAPI: live SERP top 10 + People Also Ask questions
- Firecrawl: scrape top 3-5 competitor pages (word count, headings, topics, schema)
- Save as Research Brief JSON at `/content/briefs/<slug>_<YYYY-MM-DD>_research.json` — if no JSON exists, the post CANNOT proceed

**Step 2 — BRIEF (autonomous — no Alex approval):**
- Content Brief: target keyword, secondary keywords, H2 structure, answer-first paragraph, FAQ from PAA
- In autonomous mode Claude DOES NOT present the brief to Alex — Claude decides and moves to Step 3 immediately
- Brief still saved to `/content/briefs/<slug>_<YYYY-MM-DD>_brief.md` for traceability

**Step 3 — WRITE (following the brief):**
- Minimum 4 REAL images — see **🚫 NO-AI-IMAGES HARD RULE** below. ONLY real screenshots allowed: client SERPs, PageSpeed reports, WhatsApp/ManyChat flows, portfolio shots, jegodigital.com UI captures.
- **Minimum 2 external authority links** (BrightLocal, Think with Google, Harvard Business Review, GMB/Google docs, Statista, WebFX, etc.). NEVER cite stats without a linkable source URL.
- Styled stat cards, comparison tables, answer boxes
- Match existing site design template exactly (Plus Jakarta Sans + CSS vars bg #0a0a0f + gold #C5A059)
- E-E-A-T: author byline, date, source citations (inline `<a href>` to the study/doc, not just naming it)
- Internal links: 3-5 to existing pages (verify they exist on disk before linking)
- Schema: BlogPosting + FAQPage + BreadcrumbList JSON-LD in `<head>`

**🚫 NO-AI-IMAGES HARD RULE (added 2026-04-21 after Alex flagged fake hero + neon-heatmap in Google Maps post):**

BANNED forever in blog posts:
- 3D neon isometric cityscapes, glowing tower graphics, sci-fi skylines, fake "heatmap" renders
- Fake dashboard UI mockups with invented metrics ("RANK #1", "REVIEW MOAT: 125 vs 10")
- AI-generated luxury condo interiors / beach sunsets used as heroes or section illustrations
- Any image with telltale AI artifacts (plasticky skin, impossible architecture, warped text, six fingers, melted logos)
- Unsplash/Pexels stock photos as the PRIMARY visual asset

WHITELIST — the ONLY acceptable image sources:
1. Real client SERP screenshots → `/website/blog/images/*-google-ranking.png`, `*-google-maps.png`
2. Real PageSpeed / analytics screenshots → `/website/blog/images/proof-*.png`, `proof-pagespeed-*.png`
3. Real WhatsApp / ManyChat flow screenshots → `proof-whatsapp-*.png`, `proof-ai-chatbot-*.png`
4. Real portfolio shots → `/website/images/portfolio/*.png`, `/website/assets/screenhots/*.png`
5. Fresh screenshots of jegodigital.com itself — take with Chrome MCP when needed

Pre-ship image audit (run before Step 5 push):
```bash
grep -oE 'src="images/[^"]+"' website/blog/<slug>.html | while read s; do
  fn=$(echo "$s" | sed -E 's/src="images\/|"//g')
  # Flag any filename suggesting AI/concept/render art
  if echo "$fn" | grep -qiE 'neon|isometric|3d-|concept|render-|ai-generated|heatmap'; then
    echo "❌ BANNED IMAGE: $fn"; exit 1
  fi
  # Must exist on disk
  [ -f "website/blog/images/$fn" ] || { echo "❌ MISSING: $fn"; exit 1; }
done
echo "✅ image audit passed"
```
If any image fails the check → REPLACE with a real screenshot from the whitelist. No exceptions.

**Step 4 — OPTIMIZE (score must be ≥80/100):**
- Keyword placement (H1, first 100 words, H2, meta) = 20pts
- Answer-first format = 20pts
- Readability (<4 sentences/paragraph) = 15pts
- Fact density (>5 claims/100 words) = 15pts
- Schema validity (BlogPosting + FAQPage JSON-LD) = 15pts
- Competitive coverage (beat top 3 on topics) = 15pts
- Compute score programmatically, log it. If <80, Claude fixes it before proceeding — no approval needed.

**Step 5 — PUBLISH (autonomous push + auto-index):**
- Insert card at TOP of `/website/blog/index.html` per Blog Index Visibility Rule
- Add `<url>` entry to `/website/sitemap.xml` with `lastmod=<today>`, `changefreq=monthly`, `priority=0.9`
- Push all changed files to `main` via GitHub Git Data API (see `/DEPLOY.md §Autonomous Deploy`)
- `auto-index.yml` workflow auto-submits to Google Indexing API + IndexNow on push
- Report: final live URL + sitemap count + score to Alex in one line

### HARD RULES:
- NEVER write a blog post from general knowledge without running API research
- NEVER use AI-generated graphics, 3D neon renders, fake dashboards, or stock photos — see NO-AI-IMAGES HARD RULE above. Only real screenshots from the whitelist.
- NEVER cite a stat/study without a linkable source `<a href>` to the original report (BrightLocal, Think with Google, HBR, etc.). Minimum 2 external authority links per post.
- NEVER mark a post as "completed" without logging the optimization score (≥80) AND running the pre-ship image audit
- NEVER duplicate an existing blog post topic — always diff against `/website/blog/` first
- NEVER report "verification passed" based on file sizes — verify actual content quality AND render a preview
- NEVER fall back to asking Alex for approval at any gate — autonomous mode is default
- If APIs are down, TELL ALEX instead of proceeding without data (the only valid bail-out)

---

## 📸 INSTAGRAM PUBLISHING (use this, never n8n / Business Suite / IG web)

**Trigger:** any request to post / publish / schedule / upload anything to @jegodigital Instagram (single image, carousel, Reel, Story).

**IG Business User ID:** `17841424426942739` | **Graph API:** v22.0 | **Account:** @jegodigital

### Access Token (long-lived)

Stored as `IG_GRAPH_TOKEN` in **GitHub Secrets** (see `/ACCESS.md` row 25) and injected into Cloud Functions runtime via `deploy.yml`. Local dev reads it from `website/functions/.env` (auto-generated on each deploy). For one-off CLI use:

```bash
export TOKEN=$(grep IG_GRAPH_TOKEN website/functions/.env | cut -d= -f2)
curl -s "https://graph.facebook.com/v22.0/17841424426942739?fields=username&access_token=$TOKEN"
# expect: {"username":"jegodigital",...}
```

If `website/functions/.env` doesn't exist locally, recover via the GH Actions deploy (see `/ACCESS.md` "EMERGENCY — I LOST MY LOCAL .env" section).

### NEVER attempt these (all confirmed dead ends 2026-04-07):
1. n8n public API — free trial blocks it (`/settings/api` says "Upgrade to use API")
2. Meta Business Suite via Chrome MCP — opens native OS file picker, unreachable
3. instagram.com web login — password rule blocks it
4. Reading token via Chrome MCP from n8n node UI — security layer returns `[BLOCKED: Base64 encoded data]`
5. Firebase Storage as host — bucket 404s

The ONLY working path: **finished asset → public HTTPS URL → Graph API → published.**

### Hosting (catbox.moe)
```bash
URL=$(curl -s -F "reqtype=fileupload" -F "fileToUpload=@slide.png" https://catbox.moe/user/api.php)
# Verify with GET (NOT HEAD — catbox HEAD returns Content-Length: 0 even when file is real):
curl -s "$URL" -o /tmp/check && file /tmp/check  # expect "PNG image data"
```
**Error 9004 fix:** "Only photo or video can be accepted" = Graph API couldn't fetch the URL. Catbox dedupes by hash; if a previous upload is stuck, re-encode the PNG to change its hash:
```python
from PIL import Image; Image.open('o.png').save('new.png','PNG',optimize=False)
```
Then re-upload `new.png` → fresh URL.

### Recipe — Carousel (2–10 slides, all same aspect ratio)
```bash
TOKEN='<above>'; IG=17841424426942739
URLS=("https://files.catbox.moe/aaa.png" "https://files.catbox.moe/bbb.png")
IDS=()
for u in "${URLS[@]}"; do
  r=$(curl -s -X POST "https://graph.facebook.com/v22.0/$IG/media" \
    --data-urlencode "image_url=$u" --data-urlencode "is_carousel_item=true" --data-urlencode "access_token=$TOKEN")
  IDS+=($(echo "$r" | python3 -c "import sys,json;print(json.load(sys.stdin)['id'])"))
done
CHILDREN=$(IFS=,; echo "${IDS[*]}")
PARENT=$(curl -s -X POST "https://graph.facebook.com/v22.0/$IG/media" \
  --data-urlencode "media_type=CAROUSEL" --data-urlencode "children=$CHILDREN" \
  --data-urlencode "caption=$CAPTION" --data-urlencode "access_token=$TOKEN" \
  | python3 -c "import sys,json;print(json.load(sys.stdin)['id'])")
sleep 10
MEDIA=$(curl -s -X POST "https://graph.facebook.com/v22.0/$IG/media_publish" \
  --data-urlencode "creation_id=$PARENT" --data-urlencode "access_token=$TOKEN" \
  | python3 -c "import sys,json;print(json.load(sys.stdin)['id'])")
curl -s "https://graph.facebook.com/v22.0/$MEDIA?fields=permalink&access_token=$TOKEN"
```

### Recipe — Single image
Same as carousel but skip `is_carousel_item`, skip the parent step, just create container with `image_url`+`caption` and call `media_publish`.

### Recipe — Reels
```bash
curl -s -X POST "https://graph.facebook.com/v22.0/$IG/media" \
  --data-urlencode "media_type=REELS" --data-urlencode "video_url=$VIDEO_URL" \
  --data-urlencode "caption=$CAPTION" --data-urlencode "share_to_feed=true" \
  --data-urlencode "access_token=$TOKEN"
# Poll status_code until FINISHED, then media_publish.
```
Specs: MP4 9:16 (1080×1920), 3–90s, ≤100MB, H.264+AAC, public HTTPS URL.

### Recipe — Story
Same as single image but `media_type=STORIES` + 1080×1920 vertical.

### Caption rules
- **Always Spanish** unless explicit override
- **NEVER** include pricing or AI tool names (Claude, ManyChat, n8n, ChatGPT)
- **NEVER** "AI-powered" / "automatización con IA"
- One CTA: WhatsApp `+52 998 787 5321` OR `calendly.com/jegoalexdigital/30min`
- 5–8 hashtags from: `#inmobiliaria #InmobiliariaCancún #InmobiliariasMéxico #RivieraMaya #BienesRaicesCancún #MarketingInmobiliario #SEOInmobiliario #RealEstateCancún #JegoDigital #Cancun #PlayaDelCarmen #Tulum`
- Always end by fetching `permalink` and reporting it to Alex

### Reference implementation
Flamingo 6-slide carousel published 2026-04-07: https://www.instagram.com/p/DW2JhYSjbBZ/
Source PNGs: `/mnt/jegodigital/flamingo/social_exports/2026-04-06_slide{1..6}_*.png`
Builder: `/mnt/jegodigital/flamingo/social_build/build.py` (HTML+Playwright, brand colors `#0f1115` + `#C5A059`)

---

## AI COLD CALLING — ELEVENLABS + TWILIO (Created April 16, 2026)

> Full details in `cold-calling-ai` skill. This is the quick-reference summary.

### Live System
- **Phone:** +52 998 387 1618 (Twilio MX number, ID: `phnum_8801kp77en3ee56t0t291zyv40ne`)
- **Voice:** July — Warm, Youthful (ID: `MD6rLAhozcrmkdMZeOBt`)
- **LLM:** Gemini 3.1 Flash Lite Preview (set in ElevenLabs dashboard)
- **TTS:** `eleven_v3_conversational` | **ASR:** `scribe_realtime` | **Turn:** `turn_v2`

### 3 Split-Test Offers (all created April 16, 2026)

| Offer | Agent ID | Strategy | CTA |
|---|---|---|---|
| **A — SEO Pitch** | `agent_6601kp758ca4fcx8aynsvc0qyy5k` | Google/ChatGPT visibility hook | Book Calendly with Alex |
| **B — Free Audit** | `agent_7001kpcxketqewvt87k4mg6vp569` | Free 7-area business audit scored 0-100, emailed in 60 min | Lead says "yes" + confirms email |
| **C — Free Setup** | `agent_2801kpcxmxyvf36bb2c970bhvfk4` | Free AI lead capture install (Trojan Horse), speed-to-lead hook | Book Calendly install call |

### Trigger Script
```bash
node tools/elevenlabs_trigger_call.cjs +52XXXXXXXXXX "Name" --offer=A|B|C [--email=X] [--company=X]
```

### Key Files
| File | Purpose |
|---|---|
| `/website/tools/elevenlabs_trigger_call.cjs` | Trigger calls (supports --offer=A/B/C) |
| `/website/tools/elevenlabs_list_agents.cjs` | List all agents in account |
| `/website/tools/elevenlabs_get_agent.cjs` | Get agent config details |
| `/website/tools/elevenlabs_check_phone.cjs` | List registered phone numbers |
| `/website/tools/audit_elevenlabs_calls.cjs` | Audit call history + zombie detection |
| `/website/tools/create_offer_b.cjs` | Creation script for Offer B agent |
| `/website/tools/create_offer_c.cjs` | Creation script for Offer C agent |

### TODO (Cold Calling)
1. Build auto-audit pipeline for Offer B (seo-engine → PDF report → Brevo transactional email → 60 min delivery)
2. Add `get_available_slots` + `book_calendly_live` tools to Offer C agent
3. Prepare phone-specific lead lists (current `/leads/` CSVs are for Instantly email, NOT phone)
4. Reduce Offer A max duration from 600s to 300s
5. Build batch calling script with DNC checking + result logging

---

## 🖼️ MOCKUP PIPELINE — CLOUD RUN HTML→PNG RENDERER (Added 2026-04-19)

Dedicated microservice for rendering HTML pages (especially complex CSS mockups — fake "ugly before" sites, MacBook frames, gradient backgrounds, Google Fonts) into high-resolution PNGs. Built because the in-sandbox Playwright/WeasyPrint pipelines choke on complex fonts + gradients at 2x DPR.

### Endpoint
```
POST https://mockup-renderer-wfmydylowa-uc.a.run.app/render
Content-Type: application/json

{
  "html": "<!DOCTYPE html>...",
  "width": 1080,
  "height": 1350,
  "dpr": 2
}
```
Response: raw PNG bytes. Default output is `width*dpr × height*dpr` (e.g. 2160×2700 for IG carousels).

### Deploy
Auto-deploys via `.github/workflows/deploy-cloudrun.yml` on push to `main`. Never deploy manually — see `DEPLOY.md`. Service runs Playwright + Express on Chromium with `--single-process` (memory-constrained Cloud Run instance).

### ⚠️ CRITICAL RULES — READ BEFORE RENDERING

1. **NEVER use `@import url(...)` for Google Fonts inside `<style>` blocks.** This crashes the shared Chromium instance (`browserContext.newPage: Target page, context or browser has been closed`). Use `<link rel="preconnect">` + `<link rel="stylesheet">` in `<head>` instead.

2. **Always retry on HTTP 500 (at least 3× with 4s delay).** First request after idle often fails while browser relaunches. Second attempt usually succeeds.

3. **Warm the instance.** Before a batch, POST one trivial render (empty `<body>`) and discard the response. Cold start is ~5s.

4. **Throttle 1.5s between requests** to avoid racing the shared browser.

### Canonical Client
`/carousels/_templates/before-after/build.py` — full Python template with `inject_fonts()` helper, `render()` with retry, and `warmup()`. Copy this when building new mockup batches.

```python
FONT_LINKS = (
    '<link rel="preconnect" href="https://fonts.googleapis.com">'
    '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>'
    '<link href="https://fonts.googleapis.com/css2?'
    'family=Inter:wght@300;400;500;600;700;800;900&'
    'family=Playfair+Display:ital,wght@0,700;0,900;1,400;1,700;1,900&'
    'display=swap" rel="stylesheet">'
)
def inject_fonts(html): return html.replace("<head>", "<head>" + FONT_LINKS, 1)
```

### When to use which pipeline
| Pipeline | Use for |
|---|---|
| **WeasyPrint + pdftoppm** (in-sandbox) | Text-heavy JegoDigital carousels, cotizaciones, reports. Fast, deterministic, no network. |
| **canva-jegodigital Playwright** (local) | Standard branded slides with brand assets, 1080×1350. |
| **Cloud Run mockup-renderer** | Complex CSS mockups, fake client sites, Google Fonts + gradients + device frames. Anything that breaks WeasyPrint's font rendering at 2x DPR. |

### Known Gotchas
- Cold start ~5s, first-request-after-idle fails — always warmup + retry
- Chromium `--single-process` crashes on heavy pages → simplify or chunk
- Service has no persistent storage — response is returned as bytes; host the PNG yourself (catbox.moe works)
- Never embed sensitive data in HTML — the service logs can be accessed by anyone with GCP project access

---

## KEY TECHNICAL REFERENCES

| Resource | Location |
|---|---|
| Website | jegodigital.com → Firebase Hosting (jegodigital-e02fb) |
| Website files | /website/ folder (static HTML + Tailwind) |
| Services page | /website/servicios.html (ES) + /website/services.html (EN) |
| SEO tool | /SEO antigravity/ folder |
| Outreach | /OpenClaw/ folder |
| Cold Calling Scripts | /website/tools/elevenlabs_*.cjs |
| Mockup Renderer (Cloud Run) | https://mockup-renderer-wfmydylowa-uc.a.run.app/render |
| Mockup Template (canonical) | /carousels/_templates/before-after/build.py |
| Master Knowledge Base | /knowledge_base/JEGDIGITAL_MASTER_KNOWLEDGE_BASE.md |
| Config & API keys | /_JEGODIGITAL_CONFIG.md |
| ManyChat | https://app.manychat.com/fb4452446 |
| Calendly | https://calendly.com/jegoalexdigital/30min |
| n8n | https://jegodigitalnew.app.n8n.cloud |

---

## REVENUE GOAL & ROADMAP

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
