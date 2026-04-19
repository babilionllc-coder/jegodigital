# JegoDigital — Master Project Instructions
**Last updated:** April 18, 2026 | **Maintained by:** Claude AI + Alex Jego

> This is the single source of truth for all Claude sessions working on JegoDigital.
> Read this file completely before starting any task.

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

### AI Reply Agent Guidance (UPDATED April 4, 2026 — Calendly now REQUIRED in positive replies)

> Always reply in the same language as the lead. Spanish if they write in Spanish, English if they write in English.
>
> If the reply is positive or shows interest, do the following in one reply:
>
> 1. Send them the demo video based on what was pitched in the original email. For AI lead capture or WhatsApp automation use jegodigital.com/lead-capture-demo. For SEO or Google visibility use jegodigital.com/seo-aeo-demo. For social media use jegodigital.com/social-media-demo. For property videos use jegodigital.com/property-videos-demo. For AI voice agent use jegodigital.com/ai-voice-agent-demo. For CRM or pipeline use jegodigital.com/admin-crm-demo. If unsure use jegodigital.com/lead-capture-demo.
>
> 2. Mention the results: Flamingo Real Estate got 4.4x search visibility and 320% organic traffic. Goza Real Estate tripled their lead volume. GoodLife Tulum achieved 300% organic traffic growth. Invite them to see more at instagram.com/jegodigital.
>
> 3. Propose two specific times to talk: "¿Tienes 15 minutos el martes o el jueves esta semana?" (Spanish) or "Do you have 15 minutes Tuesday or Thursday this week?" (English).
>
> 4. Include the booking link as a backup: calendly.com/jegoalexdigital/30min.
>
> 5. Include the WhatsApp number: +52 998 787 5321.
>
> Keep the full reply to 6-8 lines. Never mention pricing. Never reveal any automation tools or software names.
>
> If the reply is negative, respond briefly and professionally, thank them for their time, and remove them from the sequence.

**⚠️ WHY THIS CHANGED:** The old guidance said "Never include Calendly links." That rule applies to Step 1 cold emails ONLY. Applied to warm replies, it was blocking all bookings. Now Calendly is REQUIRED in positive replies. See `skills/instantly-ai-agent-2026.skill` for full context.

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

### Cold Email Rules (Updated April 18, 2026)
1. No pricing ever in any email — not even a hint
2. **No Calendly links in Step 1 cold emails** — CTA is always "¿Te mando un video demo de 1 minuto?"
3. **Calendly IS required in positive reply responses** (step 2+) — see AI agent guidance above
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

## BLOG POST QUALITY GATE (MANDATORY — Added 2026-04-11)

**EVERY blog post for ANY site (JegoDigital, Flamingo, RS Viajes, any client) MUST follow the seo-engine content-engine 5-step pipeline. NO EXCEPTIONS.**

This rule exists because on 2026-04-11, 8 blog posts were deployed without any API research, competitive analysis, real images, or optimization scoring. They were written from general knowledge and looked amateur on jegodigital.com.

### The 5 Mandatory Steps:

**Step 1 — RESEARCH (API calls required):**
- DataForSEO: keyword volume + difficulty for target keyword
- SerpAPI: live SERP top 10 + People Also Ask questions
- Firecrawl: scrape top 3-5 competitor pages (word count, headings, topics, schema)
- Save as Research Brief JSON — if no JSON exists, the post CANNOT proceed

**Step 2 — BRIEF (must show to Alex):**
- Content Brief MD: target keyword, secondary keywords, H2 structure, answer-first paragraph, FAQ from PAA
- PRESENT BRIEF TO ALEX and wait for approval before writing

**Step 3 — WRITE (following the brief):**
- Minimum 4 real images (Unsplash/Pexels hero + supporting visuals + data viz)
- Styled stat cards, comparison tables, answer boxes
- Match existing site design template exactly
- E-E-A-T: author byline, date, source citations
- Internal links to existing pages

**Step 4 — OPTIMIZE (score must be ≥80/100):**
- Keyword placement (H1, first 100 words, H2, meta) = 20pts
- Answer-first format = 20pts
- Readability (<4 sentences/paragraph) = 15pts
- Fact density (>5 claims/100 words) = 15pts
- Schema validity (Article + FAQPage JSON-LD) = 15pts
- Competitive coverage (beat top 3 on topics) = 15pts
- Report actual score to Alex — if <80, fix before proceeding

**Step 5 — PUBLISH (only after Alex approves):**
- Deploy to correct hosting (Firebase for JegoDigital, client-specific for others)
- Submit to Google Indexing API if available

### HARD RULES:
- NEVER write a blog post from general knowledge without running API research
- NEVER use AI-generated graphics as the only images — real photos are required
- NEVER mark a post as "completed" without reporting the optimization score
- NEVER skip showing Alex the brief before writing
- NEVER report "verification passed" based on file sizes — verify actual content quality
- If APIs are down, TELL ALEX instead of proceeding without data

---

## 📸 INSTAGRAM PUBLISHING (use this, never n8n / Business Suite / IG web)

**Trigger:** any request to post / publish / schedule / upload anything to @jegodigital Instagram (single image, carousel, Reel, Story).

**IG Business User ID:** `17841424426942739` | **Graph API:** v22.0 | **Account:** @jegodigital

### Access Token (long-lived, embedded for instant use)
```
EAAQdn3Rd3T0BRNX1ZBVkyzACZChW3Bffm09VIEZBDjWOtosJ5S6Ou3vBkdXGv5Lak9Jn0TM225GCwUPsGfXeqMtzLrOS6hRvGAC0w5VgeygfkrewgNYddVZBb0kh6wdR3dtsP7URUcWyhNLVBU9ESoD8Ty6sjKLM2ced3YSZARiZAmf5DDnmNDxSBGNPcDIOZBL
```
Backup at `/sessions/epic-gracious-bohr/mnt/.auto-memory/meta_tokens.md`. Verify before publishing:
```bash
curl -s "https://graph.facebook.com/v22.0/17841424426942739?fields=username&access_token=$TOKEN"
# expect: {"username":"jegodigital",...}
```

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

## KEY TECHNICAL REFERENCES

| Resource | Location |
|---|---|
| Website | jegodigital.com → Firebase Hosting (jegodigital-e02fb) |
| Website files | /website/ folder (static HTML + Tailwind) |
| Services page | /website/servicios.html (ES) + /website/services.html (EN) |
| SEO tool | /SEO antigravity/ folder |
| Outreach | /OpenClaw/ folder |
| Cold Calling Scripts | /website/tools/elevenlabs_*.cjs |
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
