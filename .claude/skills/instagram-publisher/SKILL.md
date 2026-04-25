---
name: instagram-publisher
description: |
  Publish content to the @jegodigital Instagram account via the Meta Graph API v22.0. Trigger whenever the user wants to post, publish, schedule, upload, or share anything to JegoDigital's Instagram — single images, carousels (2–10 slides), Reels, or Stories. Also trigger for tasks like "put this on IG", "post the Flamingo slides", "share the carousel", or when the user references a built carousel PNG set (e.g. the 2026-04-06 Flamingo deck) and wants it live. This is the ONLY working path for IG publishing — covers the Graph API recipe, catbox.moe hosting, error 9004 fix, caption rules (Spanish default, no pricing, no AI tool names, one CTA, 5-8 hashtags), and the dead-end list of things NOT to try (n8n public API, Meta Business Suite via Chrome, instagram.com web login, Firebase Storage). Do NOT trigger for: posting to other JegoDigital platforms (WhatsApp/ManyChat, email/Brevo, TikTok, Facebook), scheduling (use `schedule` skill), or content creation (use `pptx`/carousels templates first, then publish).
---

# Instagram Publisher — @jegodigital Graph API Pipeline

**The only path that works:** finished asset → public HTTPS URL → Graph API → published. Everything else on this list has been tried and failed.

---

## When to use this skill

Trigger on any of:
- "Post / publish / upload / schedule / share to Instagram"
- "Put this on IG / push this to the @jegodigital account"
- "Post the [carousel|Reel|Story|image]"
- References to built carousel PNGs (e.g. `/mnt/jegodigital/flamingo/social_exports/*`)
- Questions about why an IG post didn't land ("error 9004", "media failed")

Do NOT use for:
- Creating the content itself → use `pptx`/canva/carousels builders first
- Other platforms (TikTok/Facebook/WhatsApp/email) → different tools
- Scheduling (batch a post for later) → use `schedule` skill + this one

---

## Account config

- **IG Business User ID:** `17841424426942739`
- **Graph API version:** `v22.0`
- **Account handle:** @jegodigital

**Long-lived access token (embedded for immediate use):**
```
EAAQdn3Rd3T0BRNX1ZBVkyzACZChW3Bffm09VIEZBDjWOtosJ5S6Ou3vBkdXGv5Lak9Jn0TM225GCwUPsGfXeqMtzLrOS6hRvGAC0w5VgeygfkrewgNYddVZBb0kh6wdR3dtsP7URUcWyhNLVBU9ESoD8Ty6sjKLM2ced3YSZARiZAmf5DDnmNDxSBGNPcDIOZBL
```
*(Source: CLAUDE.md. If the old auto-memory backup is needed — it was at `/sessions/epic-gracious-bohr/mnt/.auto-memory/meta_tokens.md`, which is gone with the old session.)*

**Always verify before publishing:**
```bash
TOKEN='<token>'; IG=17841424426942739
curl -s "https://graph.facebook.com/v22.0/$IG?fields=username&access_token=$TOKEN"
# Expect: {"username":"jegodigital",...}
```

If verification fails → token likely expired. Regenerate at https://developers.facebook.com/ → Graph API Explorer → Page access token → extend to long-lived (60 days).

---

## ⛔ NEVER ATTEMPT THESE — all confirmed dead ends (2026-04-07)

1. **n8n public API** → free trial blocks it (`/settings/api` says "Upgrade to use API"). Don't try to automate via n8n REST.
2. **Meta Business Suite via Chrome MCP** → opens the native OS file picker, unreachable from browser automation.
3. **instagram.com web login** → password rules block it.
4. **Reading token via Chrome MCP from n8n node UI** → security layer returns `[BLOCKED: Base64 encoded data]`.
5. **Firebase Storage as image host** → bucket 404s (signed URL + token don't resolve through Graph API's fetcher).

If the user asks "can we use n8n / Business Suite / web to post?" — the answer is no, confirmed dead. Use this skill's Graph API path.

---

## Hosting — catbox.moe

Graph API needs a public HTTPS URL for every image/video. Catbox.moe is the tested host.

```bash
URL=$(curl -s -F "reqtype=fileupload" -F "fileToUpload=@slide.png" https://catbox.moe/user/api.php)
echo "$URL"
```

**Verify with GET, not HEAD.** Catbox HEAD responses return `Content-Length: 0` even for real files — don't rely on HEAD:
```bash
curl -s "$URL" -o /tmp/check && file /tmp/check  # expect "PNG image data"
```

### Error 9004 fix: "Only photo or video can be accepted"

Means Graph API couldn't fetch the URL. Usual cause: Catbox dedupes by hash, and if a previous upload of the same PNG is in a stuck state, reuse of the URL 9004s. Re-encode the PNG to change its hash:

```python
from PIL import Image
Image.open('original.png').save('new.png', 'PNG', optimize=False)
```

Re-upload `new.png` → fresh URL → retry.

---

## Recipe — Carousel (2–10 slides, all same aspect ratio)

All slides must share one aspect ratio. Standard for IG feed: 1080×1350 (4:5) or 1080×1080 (1:1).

```bash
TOKEN='<token>'; IG=17841424426942739
URLS=("https://files.catbox.moe/aaa.png" "https://files.catbox.moe/bbb.png" "https://files.catbox.moe/ccc.png")
CAPTION="Tu inmobiliaria merece aparecer primero. 📲 +52 998 202 3263 #InmobiliariaCancún #JegoDigital"

# 1. Create child containers
IDS=()
for u in "${URLS[@]}"; do
  r=$(curl -s -X POST "https://graph.facebook.com/v22.0/$IG/media" \
    --data-urlencode "image_url=$u" \
    --data-urlencode "is_carousel_item=true" \
    --data-urlencode "access_token=$TOKEN")
  IDS+=($(echo "$r" | python3 -c "import sys,json;print(json.load(sys.stdin)['id'])"))
done
CHILDREN=$(IFS=,; echo "${IDS[*]}")

# 2. Create parent carousel container
PARENT=$(curl -s -X POST "https://graph.facebook.com/v22.0/$IG/media" \
  --data-urlencode "media_type=CAROUSEL" \
  --data-urlencode "children=$CHILDREN" \
  --data-urlencode "caption=$CAPTION" \
  --data-urlencode "access_token=$TOKEN" \
  | python3 -c "import sys,json;print(json.load(sys.stdin)['id'])")

# 3. Wait for Meta to process
sleep 10

# 4. Publish
MEDIA=$(curl -s -X POST "https://graph.facebook.com/v22.0/$IG/media_publish" \
  --data-urlencode "creation_id=$PARENT" \
  --data-urlencode "access_token=$TOKEN" \
  | python3 -c "import sys,json;print(json.load(sys.stdin)['id'])")

# 5. Report permalink
curl -s "https://graph.facebook.com/v22.0/$MEDIA?fields=permalink&access_token=$TOKEN"
```

---

## Recipe — Single image

Skip `is_carousel_item`, skip the parent/children step. Create container with `image_url` + `caption`, then `media_publish`.

```bash
CID=$(curl -s -X POST "https://graph.facebook.com/v22.0/$IG/media" \
  --data-urlencode "image_url=$URL" \
  --data-urlencode "caption=$CAPTION" \
  --data-urlencode "access_token=$TOKEN" \
  | python3 -c "import sys,json;print(json.load(sys.stdin)['id'])")
sleep 5
curl -s -X POST "https://graph.facebook.com/v22.0/$IG/media_publish" \
  --data-urlencode "creation_id=$CID" \
  --data-urlencode "access_token=$TOKEN"
```

---

## Recipe — Reels

**Specs:** MP4, 9:16 (1080×1920), 3–90s, ≤100MB, H.264 + AAC audio, public HTTPS URL.

```bash
r=$(curl -s -X POST "https://graph.facebook.com/v22.0/$IG/media" \
  --data-urlencode "media_type=REELS" \
  --data-urlencode "video_url=$VIDEO_URL" \
  --data-urlencode "caption=$CAPTION" \
  --data-urlencode "share_to_feed=true" \
  --data-urlencode "access_token=$TOKEN")
CID=$(echo "$r" | python3 -c "import sys,json;print(json.load(sys.stdin)['id'])")

# Poll status until FINISHED (Reels process async, can take 30-90s)
while true; do
  STATUS=$(curl -s "https://graph.facebook.com/v22.0/$CID?fields=status_code&access_token=$TOKEN" \
    | python3 -c "import sys,json;print(json.load(sys.stdin)['status_code'])")
  echo "Status: $STATUS"
  [ "$STATUS" = "FINISHED" ] && break
  sleep 5
done

curl -s -X POST "https://graph.facebook.com/v22.0/$IG/media_publish" \
  --data-urlencode "creation_id=$CID" \
  --data-urlencode "access_token=$TOKEN"
```

---

## Recipe — Story

Same as single image but `media_type=STORIES` and asset must be 1080×1920 vertical.

```bash
curl -s -X POST "https://graph.facebook.com/v22.0/$IG/media" \
  --data-urlencode "media_type=STORIES" \
  --data-urlencode "image_url=$URL" \
  --data-urlencode "access_token=$TOKEN"
# Then media_publish as above. Stories don't take captions on the IG Graph API.
```

---

## Caption rules (HARD — audit every caption before publishing)

1. **Always Spanish** unless Alex explicitly overrides.
2. **NEVER** include pricing of any kind.
3. **NEVER** reveal tool names: no "Claude", "ChatGPT", "ManyChat", "n8n", "Firecrawl", "DataForSEO", "Instantly".
4. **NEVER** use "AI-powered", "automatización con IA", or any phrasing that exposes the AI stack. The client angle is "premium full-service agency".
5. **One CTA per caption.** Pick ONE:
   - WhatsApp: `+52 998 202 3263`
   - Calendly: `calendly.com/jegoalexdigital/30min`
6. **5–8 hashtags** from this approved set:
   ```
   #inmobiliaria #InmobiliariaCancún #InmobiliariasMéxico #RivieraMaya
   #BienesRaicesCancún #MarketingInmobiliario #SEOInmobiliario
   #RealEstateCancún #JegoDigital #Cancun #PlayaDelCarmen #Tulum
   ```
7. After publishing, **always fetch `permalink` and report it back to Alex**.

---

## Reference implementation

**Flamingo 6-slide carousel published 2026-04-07:** https://www.instagram.com/p/DW2JhYSjbBZ/

- Source PNGs: `/mnt/jegodigital/flamingo/social_exports/2026-04-06_slide{1..6}_*.png`
- Builder: `/mnt/jegodigital/flamingo/social_build/build.py` (HTML + Playwright, brand colors `#0f1115` + `#C5A059`)

When building new IG assets, follow the Flamingo builder pattern: HTML template → Playwright screenshot at 2×DPR → catbox upload → Graph API → permalink.

For complex CSS (fake "ugly before" mockups, device frames, Google Fonts + gradients): don't use Playwright in-sandbox — use the **Cloud Run mockup-renderer** at `https://mockup-renderer-wfmydylowa-uc.a.run.app/render`. See CLAUDE.md § Mockup Pipeline for rules (warmup, retry, no `@import` for fonts).

---

## Cross-harness portability

Project-level skill at `/mnt/jegodigital/.claude/skills/instagram-publisher/` — auto-loads in any Claude session working in the jegodigital folder. No MCP required; uses plain `curl` + `python3`.

**When the Graph API token expires (every 60 days):** regenerate at developers.facebook.com, update in CLAUDE.md. There is no fallback — this is the only working path.
