# IG Batch Pipeline — GCP-Fired Instagram + TikTok Publishing

**Last updated:** 2026-04-28 PM (Apr 29-May 3 batch, post-IG_BUSINESS_ACCOUNT_ID fix)
**Owner:** Alex Jego + Claude
**Status:** ✅ Live on production. First 2 posts published 2026-04-28 16:50 UTC. Cron picks up Apr 29 onwards.

---

## TL;DR

JegoDigital's Instagram + TikTok publishing for @jegodigital_agencia + @jegodigital runs entirely on Google Cloud Platform — **no laptop required at fire time**. A Cloud Function reads a Firestore queue every 15 minutes, finds posts whose `fireAt <= now AND status == 'ready'`, fetches the asset from `raw.githubusercontent.com`, and publishes via the IG Graph API. Reels with `tiktokDraft: true` also push the same MP4 to the @jegodigital TikTok drafts inbox.

This replaced the prior Cowork-side `scheduled-tasks` MCP plumbing, which required Alex's Mac to be awake at fire time.

---

## Posting cadence

| Window | Posts/day | Source | Mac required? |
|---|---|---|---|
| Apr 28 (today) | 2 (manually fired #1 + #4 to fill gap) | GCP Cloud Function | No |
| Apr 29 → May 3 | 4/day at 9am/12pm/3pm/6pm ET | GCP `processIgBatchQueue` cron | No |
| May 4 onwards | 2-3/day at 1pm + 7pm | GCP recurring (`instagram-ai-post` + `daily-instagram-carousel`) once re-enabled | No |

The 4-per-day window is a 5-day campaign. After May 3, the recurring jobs come back online and the cadence drops to 2-3/day.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  ASSET PRODUCTION (one-time per post, in Claude session)         │
│                                                                   │
│   PIL or Veo+ElevenLabs+Remotion                                 │
│            │                                                      │
│            ▼                                                      │
│   PNG / MP4 file                                                 │
│            │                                                      │
│            ▼                                                      │
│   Push to GitHub repo via Git Data API                           │
│            │                                                      │
│            ▼                                                      │
│   raw.githubusercontent.com URL (HTTPS, persistent)              │
└────────────┬────────────────────────────────────────────────────┘
             │
             ▼
┌─────────────────────────────────────────────────────────────────┐
│  QUEUE FLIP (one-time per post)                                  │
│                                                                   │
│   POST flipIgBatchReady                                          │
│   {token, updates:[{docId, assetUrls, caption, status:'ready'}]} │
│            │                                                      │
│            ▼                                                      │
│   Firestore ig_batch_queue/<docId>                               │
│   { status: 'ready', assetUrls, caption, fireAt }                │
└────────────┬────────────────────────────────────────────────────┘
             │
             ▼
┌─────────────────────────────────────────────────────────────────┐
│  AUTONOMOUS PUBLISHING (every 15 min, GCP server-side)           │
│                                                                   │
│   processIgBatchQueue cron (Pub/Sub schedule)                    │
│            │                                                      │
│            ▼                                                      │
│   Query: status=='ready' AND fireAt <= now (limit 5)             │
│            │                                                      │
│            ▼                                                      │
│   IG Graph API publish (carousel/single/reel)                    │
│            │                                                      │
│            ▼ (Reels with tiktokDraft:true)                       │
│   TikTok Content Posting API v2 inbox.share                      │
│            │                                                      │
│            ▼                                                      │
│   Update doc: status='published', mediaId, permalink             │
│   Slack #jegodigital-ops ping                                    │
└─────────────────────────────────────────────────────────────────┘
```

---

## Cloud Function endpoints

All deployed to `us-central1-jegodigital-e02fb.cloudfunctions.net`. Source: `website/functions/igBatchQueue.js`. Wired in `website/functions/index.js`.

### `processIgBatchQueue` — cron (no HTTP)

Runs every 15 minutes via Pub/Sub schedule (`every 15 minutes`, timezone `America/Mexico_City`). Reads up to 5 due docs per run from `ig_batch_queue` and publishes each. Marks doc `status='published'` on success or `status='ready'` (re-queue) up to 3 attempts on failure, then `status='failed'`.

### `processIgBatchQueueOnDemand` — HTTP POST

Manually fire one or more docs immediately, regardless of `fireAt`. Useful for testing and gap-filling.

```bash
TOKEN=$(cat .secrets/ig_batch_seed_token | tr -d '\n\r ')
# Fire one specific doc
curl -X POST "https://us-central1-jegodigital-e02fb.cloudfunctions.net/processIgBatchQueueOnDemand?docId=ig-batch-01-s1-leads-carousel" \
  -H "x-seed-token: $TOKEN"
# Fire next 5 due docs
curl -X POST "https://us-central1-jegodigital-e02fb.cloudfunctions.net/processIgBatchQueueOnDemand?limit=5" \
  -H "x-seed-token: $TOKEN"
```

Response on success:
```json
{
  "ok": true,
  "count": 1,
  "results": [{
    "ok": true,
    "id": "ig-batch-01-s1-leads-carousel",
    "mediaId": "18101882672482350",
    "permalink": "https://www.instagram.com/p/DXrtpohmu2j/",
    "tiktokResult": null
  }]
}
```

### `seedIgBatchQueue` — HTTP POST

Idempotent seed of the 20-post Apr 29-May 3 batch. Already run, but safe to re-run.

```bash
curl -X POST "https://us-central1-jegodigital-e02fb.cloudfunctions.net/seedIgBatchQueue?token=$TOKEN"
# Returns: {"ok":true, "seeded":20, "inFirestore":20, "next":"..."}
```

### `flipIgBatchReady` — HTTP POST

Bulk-update queue docs — typically used after building assets to flip from `pending_assets` to `ready`.

```bash
curl -X POST "https://us-central1-jegodigital-e02fb.cloudfunctions.net/flipIgBatchReady" \
  -H "Content-Type: application/json" \
  -d '{
    "token": "'$TOKEN'",
    "updates": [
      {
        "docId": "ig-batch-05-s2-seo-local-carousel",
        "status": "ready",
        "assetUrls": {"images": ["https://raw.githubusercontent.com/...slide_1.png", ...]},
        "caption": "Spanish caption text here..."
      }
    ]
  }'
```

---

## Firestore schema — `ig_batch_queue` collection

| Field | Type | Notes |
|---|---|---|
| `format` | string | `"carousel"` / `"single"` / `"reel"` |
| `fireAt` | Timestamp | When the post should publish |
| `status` | string | `"pending_assets"` → `"ready"` → `"in_progress"` → `"published"` (or `"failed"`) |
| `topic` | string | Human-readable topic for ops/Slack |
| `angle` | string | Strategy angle from CALENDAR.md |
| `path` | string | `"A"` (Path A real screenshots) or `"B"` (Path B mockups) |
| `assetUrls.images` | array | For carousels — 2-10 HTTPS URLs |
| `assetUrls.image` | string | For single — 1 HTTPS URL |
| `assetUrls.video` | string | For reels — 1 HTTPS URL to MP4 |
| `caption` | string | Spanish caption with hashtags, ≤2200 chars |
| `tiktokDraft` | boolean | Reels only — also push to @jegodigital TikTok drafts |
| `verifyRequired` | array | HR#9 verification list — must validate before flip to `ready` |
| `client` | string | For Path A only — name of named client |
| `mediaId` | string | Set after publish — IG media id |
| `permalink` | string | Set after publish — IG post URL |
| `retryCount` | number | Auto-incremented on failure, max 3 |
| `tiktokResult` | object | TikTok push response or `null` |

---

## Secrets and env vars

All loaded from `functions/.env`, rendered at deploy time from GH Secrets via `.github/workflows/deploy.yml`.

| Secret | Purpose |
|---|---|
| `IG_GRAPH_TOKEN` | IGAAT-prefix long-lived token (auto-refreshed every 50d by `igTokenAutoRefresh`) |
| `IG_BUSINESS_ACCOUNT_ID` | `27504937085774839` — passed as `<igUserId>` in Graph API URLs |
| `IG_USER_ID` | `17841425126865530` — fallback if `IG_BUSINESS_ACCOUNT_ID` missing |
| `IG_BATCH_SEED_TOKEN` | Token gate for `seedIgBatchQueue` + `flipIgBatchReady` HTTP endpoints |
| `TIKTOK_ACCESS_TOKEN` | (optional) For `tiktokDraft:true` Reels — if missing, TikTok push is skipped |
| `SLACK_BOT_TOKEN` | For #jegodigital-ops fire notifications |

Local cache of `IG_BATCH_SEED_TOKEN` for sandbox use: `.secrets/ig_batch_seed_token` (gitignored).

---

## Asset hosting — GitHub raw URLs

Why not Firebase Storage / catbox / tmpfiles?
- **Firebase Storage** requires auth. IG Graph API doesn't pass auth headers when fetching the image — would 401.
- **catbox.moe** — blocked by Meta as of 2026-04-24 (per `CLAUDE.md` IG Publishing section, OAuthException code 1).
- **tmpfiles.org** — HTTP-only, 60-min retention. IG Graph API requires HTTPS.
- **GitHub raw** — HTTPS, persistent, free, public. Repo `babilionllc-coder/jegodigital` is public.

Pattern:
```
https://raw.githubusercontent.com/babilionllc-coder/jegodigital/main/instagram/batch-2026-04-29-may-03/01-s1-leads-carousel/slide_1.png
```

**One catch:** raw URLs follow the current `main` HEAD. If a post is mid-publish when we force-push or revert, the asset could disappear. Mitigation: never force-push main; always commit additively.

---

## Asset production playbook

### Static carousels (5 slides) and single images

Use PIL via `instagram/batch-{date}/build_day{N}_assets.py`:

1. Compose 1080×1350 PNGs with brand-locked colors (`#0f1115` bg + `#C5A059` gold + `#FFFFFF` white)
2. Logo top-left at 100px height
3. Footer with Calendly URL + handle
4. Save to `instagram/batch-{date}/{post-id}/slide_{N}.png`
5. Write `caption.txt` (Spanish, with hashtag groups)
6. Write `meta.json` with `docId`, `format`, `fireAt`, `path`

Then push to GitHub via Git Data API and call `flipIgBatchReady` with the manifest.

### Reels (9:16 video, ≤30s)

1. Generate b-roll via Veo 3.1 (`veo-flow` skill) OR use Alex's recorded footage from `/instagram/raw/`
2. Generate Tony Spanish voiceover via ElevenLabs (`elevenlabs-voiceover` skill)
3. Render burned captions via Remotion (`remotion-shorts` skill)
4. Output MP4 ≤8MB, 1080×1920, 30fps, h264
5. Push to GitHub raw → flip Firestore doc to `status='ready'`

For Reels with `tiktokDraft: true`, the same MP4 also lands on @jegodigital TikTok drafts inbox at fire time.

---

## Path A vs Path B (visual policy from CLAUDE.md)

- **Path A** = real screenshot + named client (e.g. Flamingo, RS Viajes, TT&More). Numbers must be verified live at fire time per HR#9. Use real screenshots from `/website/img/showcase/{client}/` only — never fabricate a mockup attributed to a real client.
- **Path B** = branded template + NO client name. CRM dashboards, Maps rank panels, WhatsApp Sofia flows, Lighthouse scores. Frame as "Tu próximo CRM" / "Ejemplo de dashboard". Realistic stat *ranges*, not specific fabricated numbers.

Quick test: names a client → A. Generic capability demo → B.

---

## Operational runbook

### "Why hasn't anything posted?"

Check in this order:
1. `curl /seedIgBatchQueue?token=$TOKEN` returns `{seeded:20, inFirestore:20}`. If less, queue isn't seeded — re-seed.
2. `curl /processIgBatchQueueOnDemand?docId=<id>` for the most recent due doc. Read the `error` field.
   - `"no IG_BUSINESS_ACCOUNT_ID / IG_USER_ID"` → secret not in env. Check deploy.yml allowlist + GH Secrets.
   - `"no IG_GRAPH_TOKEN"` → token expired. Run `igTokenAutoRefreshOnDemand`.
   - `"missing assetUrls.image"` / `"images"` → doc still at `pending_assets`, asset producer hasn't run.
3. Check Firestore directly via Firebase Console or any function with admin SDK. If many docs at `status='failed'` with retry count 3, look at `error` field.
4. Check GH Actions deploy.yml — last run conclusion=success. If cancelled or failed, redeploy.

### "I want to fire a post NOW (not wait for fireAt)"

```bash
TOKEN=$(cat .secrets/ig_batch_seed_token | tr -d '\n\r ')
curl -X POST "https://us-central1-jegodigital-e02fb.cloudfunctions.net/processIgBatchQueueOnDemand?docId=<doc-id>" \
  -H "x-seed-token: $TOKEN"
```

### "I want to push back the entire schedule by N days"

Bulk update via `flipIgBatchReady` is the simplest path. Or extend the function with a `shiftSchedule` endpoint. Currently no helper for this — file an issue if needed.

### "I want to add a new post mid-batch"

1. Build asset (PIL or Reel pipeline)
2. Push asset PNG/MP4 to GitHub raw
3. Add a new doc to Firestore via a small custom call to `flipIgBatchReady` with all fields including `fireAt` and `format`. (Or extend `seedIgBatchQueue` to accept arbitrary new posts.)

### "I want to skip a post"

Set `status='skipped'` via `flipIgBatchReady`. The cron query only picks up `status='ready'`.

---

## Known gaps and TODO

1. **Reel production not automated** — currently each of 6 Reels needs a focused production session (Veo + ElevenLabs + Remotion). Goal: automate via a Cloud Function that orchestrates Veo+ElevenLabs APIs, but Veo is Google AI Studio only (no public API yet) so this is partly manual.
2. **Path A verification not enforced at fire time** — `verifyRequired` field is set but `processIgBatchQueue` doesn't actually check live data before publishing. HR#9 enforcement must happen during the asset producer flip-to-ready step, not at fire.
3. **Schedule shift helper missing** — no clean way to push the whole schedule back N days if assets aren't ready. Currently requires manual flipIgBatchReady calls per doc.
4. **TikTok push tested** — but until `TIKTOK_ACCESS_TOKEN` is in env, all `tiktokDraft:true` Reels will skip the TikTok step. Not blocking IG publish.
5. **May 4 re-enable** — `instagram-ai-post` + `daily-instagram-carousel` were paused for the Apr 29-May 3 batch. They need to be flipped back on May 4 morning. Currently no GCP-side scheduled task for this — needs to be added.

---

## Source files

- `/website/functions/igBatchQueue.js` — Cloud Function module (cron + 3 HTTP endpoints)
- `/website/functions/index.js` — exports wiring (4 lines added)
- `/website/functions/.env` — runtime secrets (rendered from GH Secrets at deploy time)
- `/.github/workflows/deploy.yml` — secrets allowlist + Firebase deploy
- `/tools/seed_ig_batch_queue.cjs` — one-shot Node seed script (alternative to seedIgBatchQueue HTTP endpoint, requires admin creds)
- `/instagram/batch-2026-04-29-may-03/CALENDAR.md` — 20-post calendar
- `/instagram/batch-2026-04-29-may-03/build_day1_assets.py` — PIL asset builder for Day 1
- `/instagram/batch-2026-04-29-may-03/upload_manifest.json` — asset URL manifest

---

## First successful publishes

Verified live 2026-04-28 16:50 UTC (Mac off):

- Post #1: Carousel S1 Leads — https://www.instagram.com/p/DXrtpohmu2j/ (HTTP 200)
- Post #4: Carousel CRM Mockup — https://www.instagram.com/p/DXrt0hOGsJR/ (HTTP 200)

Both fired via `processIgBatchQueueOnDemand`, ~60 seconds apart. Confirms the full pipeline works end-to-end with no laptop involvement.
