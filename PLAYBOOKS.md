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

**IG Business User ID:** `17841424426942739` | **Graph API:** v22.0 | **Account:** @jegodigital

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
- One CTA: WhatsApp `+52 998 787 5321` OR `calendly.com/jegoalexdigital/30min`
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
