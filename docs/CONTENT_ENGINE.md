# Content Engine — Autonomous Daily Publishing

**Last updated:** 2026-04-28 PM
**Status:** Phase 1 + 2 + 3 shipping; Phase 4 (auto-carousels) + 5 (auto-Reels) follow-up
**Goal:** Mac off, content never stops. 5 stories/day + 1 carousel/day + research-driven ideas, all from GCP.

---

## TL;DR

A daily-cron Cloud Function pipeline that:

1. **Researches** what's viral in Mexican real estate via Perplexity Sonar (every morning 6am CDMX)
2. **Generates** 5 IG stories/day from those ideas via Gemini HTML + mockup-renderer (every morning 7am CDMX), staggered fireAt across the day
3. **Publishes** stories autonomously via the existing `processIgBatchQueue` cron (every 15 min)

All on GCP — laptop fully off. The same `ig_batch_queue` collection used for carousels/singles/Reels also holds stories with `format: 'story'`.

---

## Architecture (4 layers)

```
┌──────────────────────────────────────────────────────────────────────┐
│  LAYER 1 — IDEAS (research, daily 6am CDMX)                          │
│                                                                        │
│   generateContentIdeas (cron)                                         │
│     ↓ Perplexity Sonar query: "viral real-estate IG content this week"│
│     ↓ Parse 10 ideas (hook, angle, format hint, hashtag suggestions)  │
│     ↓ Score (recency × ICP fit × format fit)                          │
│     ↓ Firestore content_ideas/{auto-id}                                │
└─────────────────────┬─────────────────────────────────────────────────┘
                      │
                      ▼
┌──────────────────────────────────────────────────────────────────────┐
│  LAYER 2 — PRODUCTION (daily 7am CDMX)                                │
│                                                                        │
│   generateDailyStories (cron)                                         │
│     ↓ Read top 5 unused ideas                                         │
│     ↓ For each: Gemini → HTML template fill → mockup-renderer (1080×1920)│
│     ↓ Upload PNG to Firebase Storage (public bucket)                   │
│     ↓ Write Firestore ig_batch_queue/{id} with format='story',        │
│       status='ready', fireAt=staggered today (9/12/15/18/21 ET)       │
│     ↓ Mark idea as used                                                │
│                                                                        │
│   [Future] generateDailyCarousels (cron, 1/day) — Phase 4              │
│   [Future] generateDailyReels (cron, 0-1/day) — Phase 5                │
└─────────────────────┬─────────────────────────────────────────────────┘
                      │
                      ▼
┌──────────────────────────────────────────────────────────────────────┐
│  LAYER 3 — QUEUE (already live)                                        │
│   Firestore ig_batch_queue collection                                  │
│   docs at status='ready' AND fireAt<=now picked up by cron            │
└─────────────────────┬─────────────────────────────────────────────────┘
                      │
                      ▼
┌──────────────────────────────────────────────────────────────────────┐
│  LAYER 4 — PUBLISH (already live, extended for stories)               │
│   processIgBatchQueue cron (every 15 min)                             │
│     ↓ format dispatch: carousel | single | reel | story (NEW)         │
│     ↓ IG Graph API media + media_publish                              │
│     ↓ For Reels with tiktokDraft: TikTok inbox.share                   │
│     ↓ Mark status='published', mediaId, permalink                     │
│     ↓ Slack #jegodigital-ops ping                                      │
└──────────────────────────────────────────────────────────────────────┘
```

---

## Daily output (when fully ramped)

| Format | Count/day | Generator | Status |
|---|---|---|---|
| IG Stories | **5/day** at 9/12/15/18/21 ET | `generateDailyStories` (Phase 3, **shipping**) | ✅ Live |
| Single posts | 1/day from `instagram-ai-post` recurring | Already deployed | ✅ Live (paused for batch, resumes May 4) |
| Carousels | 1/day | `generateDailyCarousels` (Phase 4) | ⏳ Next session |
| Reels | 0-1/day | `generateDailyReels` (Phase 5) | ⏳ Blocked on Veo public API or paid alternative |

**Total at full ramp:** 7-8 pieces of content per day, fully autonomous, Mac off.

---

## Why stories first

- Highest-frequency format (5/day vs 1/day for posts)
- Simplest format (single 1080×1920 image, no slide chaining)
- Cheapest production (HTML→PNG via mockup-renderer, ~5s/story)
- Gemini already excellent at structured HTML generation
- Daily presence creates the "always on" feel Alex wants

Carousels are 5-10 slides, each with consistent design — much harder to template autonomously without quality drift. Reels need video gen (Veo3 no public API yet).

---

## Phase 1 — IDEAS engine (research)

**Cloud Function:** `generateContentIdeas` (Pub/Sub schedule, 6:00 AM America/Mexico_City daily)

**Inputs:**
- Hardcoded research prompts (real estate Mexico, Miami luxury Hispanic, AEO/SEO trends)
- Last 7 days of `content_ideas` to dedupe

**Process:**
1. Call Perplexity Sonar with prompts asking for "10 viral content angles for Mexican real estate inmobiliarias this week — hook, format suggestion, hashtags, why it'll engage"
2. Parse JSON response (Perplexity supports response_format: json_schema)
3. Score each idea: `recency × ICP_fit × format_fit`
4. Write to `content_ideas` collection: `{idea, hook, angle, formatHint, hashtags, score, source: 'perplexity', createdAt, used: false}`

**Output:** ~10 ideas/day in Firestore. ~70 ideas/week. Story generator picks 5/day from this pool.

---

## Phase 2 — STORIES generator

**Cloud Function:** `generateDailyStories` (Pub/Sub schedule, 7:00 AM America/Mexico_City daily)

**Process:**
1. Query `content_ideas` where `used=false` and `formatHint IN ('story', 'tip', 'quote', 'stat')`, order by score desc, limit 5
2. For each idea, call Gemini with a brand-locked HTML template prompt:
   ```
   Fill this HTML template with the given idea content. Keep the structure exact.
   Brand: #0f1115 bg + #C5A059 gold + #FFFFFF white. 1080×1920 9:16.
   <html template here>
   Idea: {idea content}
   ```
3. POST HTML to mockup-renderer (`mockup-renderer-wfmydylowa-uc.a.run.app/render`) → returns PNG bytes
4. Upload PNG to Firebase Storage at `ig_stories/{date}/{idea_id}.png`, set public read
5. Write Firestore `ig_batch_queue/story-{date}-{idea_id}`:
   ```
   {
     format: 'story',
     status: 'ready',
     fireAt: <staggered today 9/12/15/18/21 ET>,
     assetUrls: { image: 'https://storage.googleapis.com/...' },
     caption: <empty, IG stories don't take captions in API>,
     ideaId: <ref to content_ideas doc>
   }
   ```
6. Mark each used idea `used=true`
7. Slack #jegodigital-ops: "✅ 5 stories queued for today: <topics>"

---

## Phase 3 — STORY PUBLISH branch (extension to existing)

**File:** `igBatchQueue.js`

Add `publishStory(doc, igUserId, token)`:
- POST `<IG_USER_ID>/media?image_url=...&media_type=STORIES&access_token=...`
- POST `<IG_USER_ID>/media_publish?creation_id=...`
- Get permalink (note: Stories don't have public permalinks; verify via mediaId existence in `<id>?fields=id`)

Add `format === 'story'` dispatch in `processOne`.

---

## Phase 4 — CAROUSEL auto-gen (next session)

Same pattern as stories but:
- 5 slides per carousel
- Gemini generates 5 slide HTMLs from 1 carousel-friendly idea
- Each slide → mockup-renderer → 5 PNGs
- 5 PNGs uploaded to GH raw OR Firebase Storage
- 1 doc to ig_batch_queue with format='carousel', assetUrls.images=[...5]

Cadence: 1 carousel/day at 1pm ET (matches the existing `daily-instagram-carousel` slot).

**Why deferred:** carousel design quality requires more template variation logic. Risk of all carousels looking identical → ugly. Need 3-5 distinct templates and rotation.

---

## Phase 5 — REELS auto-gen (deferred, blocked)

**Blocker:** Veo 3.1 has no public API as of 2026-04. Google AI Studio requires browser interaction.

**Workaround paths:**
1. **Stock-loop generator** — combine a still image + Ken Burns zoom + ElevenLabs Tony VO + Remotion render → 30s MP4. Lower quality but autonomous. ~3-5 min/Reel.
2. **Paid API** — Sora ($), Runway ($), Pika ($). 1-3 USD per Reel. Highest quality, fully API.
3. **Manual fallback** — Alex records 1 Reel/day on phone, drops in `/instagram/raw/`, separate Cloud Function picks it up + adds captions + uploads.

**Decision pending.** Stock-loop is the cheapest autonomous option. Will revisit when Phase 1-4 are stable.

---

## Cost & rate limits

| Service | Daily cost (estimate) | Rate limit |
|---|---|---|
| Perplexity Sonar | ~$0.05/day (1-2 calls × ~5K tokens) | 60 req/min |
| Gemini 2.0 Flash | ~$0.10/day (5-10 calls × ~3K tokens) | 1000 RPM, 4M TPM |
| Cloud Functions | ~$0.02/day (cron + execution) | Free tier covers it |
| mockup-renderer (Cloud Run) | ~$0.05/day (5-10 renders/day) | scales to 0 |
| Firebase Storage | ~$0.01/day (5 stories × 200KB × 30 days) | n/a |
| IG Graph API | $0 | 100 calls/hour per user |
| **Total** | **~$0.25/day** | well within limits |

Monthly: ~$8. Effectively free.

---

## Observability

Every cron run posts to Slack #jegodigital-ops:
- Ideas generator: "✅ 10 fresh ideas | top 3: <hooks>"
- Stories generator: "✅ 5 stories queued | <topics> | first fires 9am"
- Story publisher: per-fire "✅ Story <topic> published"
- Failure: `⚠️` warnings, `🚨` criticals

Firestore queries to investigate:
- `content_ideas` ordered by createdAt desc — see what's been ideated
- `ig_batch_queue` filter format='story' — see scheduled + published stories
- `ig_batch_queue` filter status='failed' — see broken posts

---

## What's shipping in this session vs deferred

**Shipping now:**
- This doc + Notion mirror
- `generateContentIdeas` Cloud Function
- `generateDailyStories` Cloud Function
- `processIgBatchQueue` extended with `format='story'` support
- 2 new Pub/Sub crons wired

**Deferred (next session):**
- Phase 4 — auto-carousel generator (1/day)
- Phase 5 — Reel generator (blocked on Veo public API decision)
- Story HTML template variations (currently 1 template — quote card style)
- A/B test loop on engagement (track which ideas got most reach via IG Insights, feed back into scoring)
