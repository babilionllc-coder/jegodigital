# JegoDigital — Technical Playbooks (IG, Cold Calls, Mockups, References)

> **Purpose:** The **hands-on how-to guide** for JegoDigital's technical integrations. When you need to publish to Instagram, trigger a cold call, render a mockup, or look up where something lives — this is the file.
> **Read this file when:** You're doing the actual technical work (pushing an IG carousel, launching a cold-call batch, rendering a mockup, looking up an API endpoint).
> **Sister files:** `CLAUDE.md` (the rules) · `BUSINESS.md` (services, clients, outreach copy) · `AI_AGENT_PERSONA.md` (the strategic brain).
> **Last updated:** 2026-04-21 (extracted from CLAUDE.md during Phase 2 refactor)

---

## 📑 TABLE OF CONTENTS

1. [Instagram Publishing (Graph API)](#instagram-publishing)
2. [AI Cold Calling (ElevenLabs + Twilio)](#ai-cold-calling)
3. [Mockup Pipeline (Cloud Run HTML→PNG)](#mockup-pipeline)
4. [Key Technical References](#key-technical-references)

---

## 📸 INSTAGRAM PUBLISHING

**Trigger:** any request to post / publish / schedule / upload anything to @jegodigital Instagram (single image, carousel, Reel, Story).

**Account:** @jegodigital (renamed from @jegodigital5 on 2026-04-24 — handle change transparent to API).
**IG User ID:** `17841425126865530` (Instagram Login API user_id — use this for graph.instagram.com calls)
**Business Account ID:** `27504937085774839`
**Graph API:** `graph.instagram.com/v21.0` (NOT graph.facebook.com — IGAAT token requires IG Login API base)
**Image host:** **tmpfiles.org** (verified Meta-compatible). ⚠️ **catbox.moe is DEAD** as of 2026-04-24 — Meta rejects with OAuthException code 1.

⚠️ **Deprecated IDs** (DO NOT use — banned account from pre-April 2026): `17841424426942739` (old @jegodigital user_id).

### Access Token (long-lived)

Stored as `IG_GRAPH_TOKEN` in **GitHub Secrets** (see `/ACCESS.md` row 25) and injected into Cloud Functions runtime via `deploy.yml`. Local dev reads it from `website/functions/.env` (auto-generated on each deploy). For one-off CLI use:

```bash
export TOKEN=$(grep IG_GRAPH_TOKEN website/functions/.env | cut -d= -f2)
curl -s "https://graph.facebook.com/v22.0/17841424426942739?fields=username&access_token=$TOKEN"
# expect: {"username":"jegodigital",...}
```

If `website/functions/.env` doesn't exist locally, recover via the GH Actions deploy (see `/ACCESS.md` "EMERGENCY — I LOST MY LOCAL .env" section).

### NEVER attempt these (all confirmed dead ends — see `DEPRECATED.md`):
1. n8n public API — free trial blocks it
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
- One CTA: WhatsApp `+52 998 202 3263` OR `calendly.com/jegoalexdigital/30min`
- 5–8 hashtags from: `#inmobiliaria #InmobiliariaCancún #InmobiliariasMéxico #RivieraMaya #BienesRaicesCancún #MarketingInmobiliario #SEOInmobiliario #RealEstateCancún #JegoDigital #Cancun #PlayaDelCarmen #Tulum`
- Always end by fetching `permalink` and reporting it to Alex

### Reference implementation
Flamingo 6-slide carousel published 2026-04-07: https://www.instagram.com/p/DW2JhYSjbBZ/
Source PNGs: `/mnt/jegodigital/flamingo/social_exports/2026-04-06_slide{1..6}_*.png`
Builder: `/mnt/jegodigital/flamingo/social_build/build.py` (HTML+Playwright, brand colors `#0f1115` + `#C5A059`)

---

## 📞 AI COLD CALLING

> Full details in `cold-calling-ai` skill. This is the quick-reference summary.

### Live System
- **Phone:** +52 998 387 1618 (Twilio MX number, ID: `phnum_8201kq0efkq6esttrdm916g8n3r0` — rotated 2026-04-25 from old `phnum_8801kp77en3ee56t0t291zyv40ne` which returned 404 + caused 100% bridge failure with Twilio error 31921)
- **Voice:** July — Warm, Youthful (ID: `MD6rLAhozcrmkdMZeOBt`)
- **LLM:** Gemini 3.1 Flash Lite Preview (set in ElevenLabs dashboard)
- **TTS:** `eleven_v3_conversational` | **ASR:** `scribe_realtime` | **Turn:** `turn_v2`

### Split-Test Offers (Apr 16, 2026 — extended Apr 27 with Offer E Miami Bilingual)

| Offer | Agent ID | Strategy | CTA | Market |
|---|---|---|---|---|
| **A — SEO Pitch** | `agent_0701kq0drf5ceq6t5md9p6dt6xbb` | Google/ChatGPT visibility hook | Book Calendly with Alex | MX (Spanish) |
| **B — Free Audit** | `agent_4701kq0drd9pf9ebbqcv6b3bb2zw` | Free 7-area business audit scored 0-100, emailed in 60 min | Lead says "yes" + confirms email | MX (Spanish) |
| **C — Free Setup / Pilot 14 Días v3** | `agent_2701kq0drbt9f738pxjem3zc3fnb` | Paid 14-day pilot, 100% money-back, system stays installed (replaces old free-setup Trojan Horse) | save_lead_to_brevo_setup -> book_calendly_live | MX (Spanish) |
| **D — FB Brokers** | `agent_7301kq5jxe0gf3vbmp92c974stzc` | Apr 26-27 autonomous batch | TBD | MX (Spanish) |
| **MIA / E — Pilot 14 Days (Miami Bilingual) v3** | `agent_1401kq8c8jtvew9r6m05g83eyg60` | Bilingual EN/ES Sofia, paid 14-day pilot 100% money-back, system stays installed; auto-detects language; no price in agent (Alex handles on Calendly) | save_lead_to_brevo_setup -> book_calendly_live OR warm-transfer to Alex | Miami Hispanic luxury (EN primary, ES fallback) — **wired into dialer 2026-04-27** |
| **Inbound Receptionist** | `agent_1101kq0dradtfhc8fzq96kp4hth7` | Inbound calls | — | MX (Spanish) |

### Trigger Script
```bash
# MX (Offer A/B/C/D — round-robin across 3 MX numbers)
node website/tools/elevenlabs_trigger_call.cjs +52XXXXXXXXXX "Name" --offer=B [--email=X] [--company=X] [--city=X] [--website=https://...]

# Miami Hispanic bilingual (Offer MIA or E — uses US +1 pool)
node website/tools/elevenlabs_trigger_call.cjs +1305XXXXXXX "Maria Garcia" --offer=MIA --company="Coral Gables Realty" --email="maria@cgr.com" --city="Miami"

# Auto-routing: --offer omitted + phone starts +1 → MIA agent + US pool; +52 → Offer B + MX pool
# --lang=en forces Miami agent regardless of phone prefix
```

### Phone pools (round-robin per pool)
- **MX_POOL** (3 numbers, MX caller ID): `+529983871618` (MX#1 Cancún) · `+529983871354` (MX#2 Cancún) · `+528121887124` (MX#3 MTY)
- **US_POOL** (1 number, US caller ID): `+19783967234` (US#1 Massachusetts 978) — **suboptimal for Miami answer rate; Alex should buy a +1 305 or +1 786 number from Twilio console** (`https://console.twilio.com/us1/develop/phone-numbers/manage/search` → Country=US, Locality=Miami, Capabilities=Voice → ~$1.15/mo + $0.013/min) and import via ElevenLabs UI → Conversational AI → Phone Numbers → Import. Toll-free `+18556090422` exists in Twilio but is **inbound-only** (toll-free outbound caller IDs cut answer rates 30-40%).
- **Mixing forbidden:** MX brokers expect MX caller ID, Miami brokers expect US caller ID. Never wire a US number into MX_POOL or vice-versa.

### Tools wired to agents (Brevo nurture capture — LIVE 2026-04-22 evening)
| Offer | Tool | Target | Outcome |
|---|---|---|---|
| A (SEO) | `save_lead_to_brevo_seo` | `POST saveColdCallLead` with `offer:"A"` | Brevo list **35**, templates **53-57**, cadence **0/1/3/5/7 days** |
| B (Audit) | `submit_audit_request` | `POST submitAuditRequest` | Audit delivered + own 4-email post-audit nurture |
| C (Free Setup) | `save_lead_to_brevo_setup` | `POST saveColdCallLead` with `offer:"C"` | Brevo list **36**, templates **58-62**, cadence **0/1/3/5/10 days** |

All 10 Spanish templates audited against HR-0 (no fabricated numbers), ship with `{{ unsubscribe }}` footer, WhatsApp `wa.me/529982023263`, and single Calendly `/30min` with `utm_campaign=coldcall_a|coldcall_c` for A-vs-C attribution. Template 60 (C-D3) is intentionally time-agnostic so `saveColdCallLead` doesn't need to branch on install date. Full function details: `SYSTEM.md §1.3 saveColdCallLead`.

### Key Files
| File | Purpose |
|---|---|
| `/website/tools/elevenlabs_trigger_call.cjs` | Trigger calls (supports --offer=A/B/C/D/MIA/E with MX + US pool round-robin, auto-routes by phone prefix) |
| `/website/tools/elevenlabs_list_agents.cjs` | List all agents in account |
| `/website/tools/elevenlabs_get_agent.cjs` | Get agent config details |
| `/website/tools/elevenlabs_check_phone.cjs` | List registered phone numbers |
| `/website/tools/audit_elevenlabs_calls.cjs` | Audit call history + zombie detection |
| `/website/tools/create_offer_b.cjs` | Creation script for Offer B agent |
| `/website/tools/create_offer_c.cjs` | Creation script for Offer C agent |

### TODO (Cold Calling)
1. Build auto-audit pipeline for Offer B (seo-engine → PDF report → Brevo transactional email → 60 min delivery)
2. ~~Add `get_available_slots` + `book_calendly_live` tools to Offer C agent~~ — **superseded 2026-04-22 evening**: shipped `save_lead_to_brevo_setup` + single Calendly `/30min` with `utm_campaign` attribution instead (see "Tools wired to agents" above)
3. Prepare phone-specific lead lists (current `/leads/` CSVs are for Instantly email, NOT phone)
4. Reduce Offer A max duration from 600s to 300s
5. Build batch calling script with DNC checking + result logging
6. Slim agent prompts from 13.5k → 4k chars (task #53, P0 tomorrow AM) — faster Gemini turns, cheaper token bill

---

## 🖼️ MOCKUP PIPELINE

Dedicated Cloud Run microservice for rendering HTML pages (especially complex CSS mockups — fake "ugly before" sites, MacBook frames, gradient backgrounds, Google Fonts) into high-resolution PNGs. Built because the in-sandbox Playwright/WeasyPrint pipelines choke on complex fonts + gradients at 2x DPR.

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

*End of PLAYBOOKS.md — update whenever an integration recipe changes.*
