---
name: playwright-prospect-audit
description: Render any prospect website in headless Chromium to extract observable cold-email personalization signals — page weight, mobile load time, WhatsApp button, schema.org JSON-LD, copyright year, meta description, request count, mobile screenshot. Picks the meanest defensible hook per prospect and produces a one-line personalization string that drops into Instantly cold-email templates as `{{personalization}}`. Works on any domain — Mexican real estate, Miami luxury, NYC, LA. Use EVERY TIME Alex wants to personalize cold email at scale by pre-rendering each prospect's site, batch-audit a CSV of leads, push enriched leads to Instantly with audit fields, or improve per-prospect hook quality. Triggers — playwright audit, site audit for cold email, batch audit prospects, render prospect site, personalization hook, audit_prospect.mjs, batch_audit.mjs, rerank_for_miami, audit_and_upload, observable hook, cold email personalization at scale.
---

# Playwright Prospect Audit

**Created:** 2026-04-26 during the Miami RE Hiring + Audit Personalization campaign.
**Repo path:** `tools/playwright/`
**First production use:** 80-lead Miami campaign (Instantly UUID `acffe5c9-9a74-4b3f-8a95-37882a11f96b`), 2026-04-26.

> **NOTE:** This skill currently lives at `docs/proposed-skills/playwright-prospect-audit/SKILL.md` because writes to `.claude/skills/` are blocked in Cowork mode. Manually copy the directory to `.claude/skills/playwright-prospect-audit/` to activate.

---

## What it does

For every cold-email prospect, render their homepage in headless Chromium (mobile viewport, real iPhone UA), measure observable problems, and produce **one specific personalization line** that proves we actually looked at their site. Drops in as `{{personalization}}` on Instantly campaigns.

Replaces generic cold email — industry-baseline 1–3% reply rate on generic templates jumps to 6–12% when first line names a specific observable problem on the prospect's site (Lavender data; matches our prior hyper-personalized angles).

**This is DIFFERENT from `audit-funnel`.** That skill owns the post-reply audit (`/auditoria-gratis`). This skill is the PRE-EMPTIVE audit at cold-email-send time — different problem, different tool.

## Files

| File | Purpose |
|---|---|
| `tools/playwright/lib/launcher.mjs` | Shared chromium launcher (executablePath + sandbox flags + iPhone viewport) |
| `tools/playwright/audit_prospect.mjs` | Single-domain audit. Returns JSON with load_ms, total_bytes, has_visible_whatsapp_button, has_schema_jsonld, copyright_year, meta_description, request_count, screenshot path |
| `tools/playwright/rank_hook.mjs` | Universal hook ranker. 9 hook types, severity tiers (high/medium/low). Returns one personalization line in Spanish |
| `tools/playwright/rerank_for_miami.mjs` | US-Hispanic Miami variant. Prioritizes deterministic hooks (HEAVY_PAGE, STALE_COPYRIGHT, NO_WHATSAPP, NO_SCHEMA) over network-dependent timing hooks. English copy. |
| `tools/playwright/batch_audit.mjs` | Reads input CSV, audits each domain in parallel, writes enriched.csv with personalization_hook column |
| `tools/playwright/audit_and_upload.mjs` | Pushes enriched CSV to Instantly v2 campaign with audit fields stashed as custom variables |

## Hook priority (Miami variant, deterministic first)

Observation-based hooks fire first because they're network-independent (won't false-positive at higher concurrency):

1. **SITE_BROKEN** — didn't render in 20s headless Chrome (highest severity)
2. **HEAVY_PAGE** — homepage > 5 MB on first paint
3. **STALE_COPYRIGHT** — footer year ≥ 2 years old
4. **NO_WHATSAPP_BUTTON** — no visible tap-to-WhatsApp on mobile
5. **NO_SCHEMA_JSONLD** — invisible to ChatGPT / Perplexity AI search
6. **NO_META_DESCRIPTION** — Google snippet uncontrolled
7. **MOBILE_LOAD_VERY_SLOW** — fallback only (timing is noisy at concurrency > 2)

## How to run

```bash
cd tools/playwright

# 1. Install (one-time per sandbox session — binary lives in /tmp due to /sessions space limits)
[ ! -d /tmp/ms-playwright/chromium-1217 ] && \
  PLAYWRIGHT_BROWSERS_PATH=/tmp/ms-playwright npx playwright install chromium

# 2. Audit a CSV of leads (input must have a `domain` column)
PLAYWRIGHT_BROWSERS_PATH=/tmp/ms-playwright \
  node batch_audit.mjs --in ../../leads/foo.csv --out ./enriched/foo.csv --concurrency 2

# 3. Re-rank with Miami priorities (or write rerank_for_<market>.mjs for new geos)
node rerank_for_miami.mjs --in ./enriched/foo.csv --out ./enriched/foo_v2.csv

# 4. Push to Instantly campaign (paused)
node audit_and_upload.mjs --in ./enriched/foo_v2.csv --campaign <UUID>
```

## Critical caveats

### Concurrency cap at 2

`load_ms` measurements are inflated at concurrency > 2 from network contention. Production rule: cap at 2 for clean measurements. 200 leads at concurrency=2 ≈ 10–15 min.

The Miami-rerank script (`rerank_for_miami.mjs`) prioritizes deterministic hooks (HEAVY_PAGE, NO_WHATSAPP, schema, copyright) over network-dependent hooks specifically because of this — works correctly even at concurrency=4.

### Browser binary at `/tmp/ms-playwright/`

`/sessions/` is space-constrained (~600MB free vs 2GB+ needed for full + headless variants). We install only the full chromium variant (`chromium-1217`) and skip `chromium-headless-shell`. This means:

- `executablePath: '/tmp/ms-playwright/chromium-1217/chrome-linux/chrome'`
- `args: ['--no-sandbox', '--disable-dev-shm-usage']`

See `tools/playwright/lib/launcher.mjs` for the canonical config.

### `/tmp` is wiped between sandbox sessions

Re-install on first call each session:
```bash
PLAYWRIGHT_BROWSERS_PATH=/tmp/ms-playwright npx playwright install chromium
```
Takes ~1 minute over the bash 45s timeout — runs in background under bwrap, completes before next call.

### Bash 45s timeout

Long-running operations need checkpoint/resume:
- Background install: `nohup ... &`
- Foreground commands: explicit retry loops (Apify polling)
- Hunter enrichment: 18 lookups per call max with `/tmp/foo_offset.txt`
- Big batch audits: split CSV into halves, audit each half separately

### Instantly v2 API gotchas

- `/leads/list` requires POST not GET
- `User-Agent: Mozilla/5.0 Chrome/120.0.0.0` required (Cloudflare blocks Python urllib UA)
- Campaign timezone only accepts: `America/Chicago`, `America/Detroit`, `America/Los_Angeles`, `America/Denver`. `America/New_York` is REJECTED — use `America/Detroit` for ET
- `PATCH /campaigns/{id}` with `{sequences: [...]}` works to fix templates without re-creating
- `campaigns?limit=20` returns 5 most recent only — paginate with `next_starting_after`

## Output JSON shape (single-domain audit)

```json
{
  "domain": "example.com",
  "url_audited": "https://example.com",
  "audited_at": "2026-04-26T...",
  "ok": true,
  "http_status": 200,
  "dom_content_loaded_ms": 565,
  "load_ms": 2919,
  "timing": { "ttfb_ms": 43, "first_paint_ms": 548, "first_contentful_paint_ms": 548 },
  "title": "...",
  "meta_description": "...",
  "meta_description_length": 242,
  "has_meta_description": true,
  "has_og_image": true,
  "has_og_title": true,
  "has_viewport_meta": true,
  "has_whatsapp_href": true,
  "has_whatsapp_text": true,
  "has_visible_whatsapp_button": true,
  "has_phone_link": false,
  "has_schema_jsonld": false,
  "copyright_year": 2025,
  "link_count": 17,
  "total_bytes": 1187503,
  "image_bytes": 0,
  "request_count": 123,
  "console_errors": 0,
  "https_only": true,
  "screenshot_mobile": "/tmp/.../audits/example.com-mobile.png"
}
```

## Output (after rank_hook + rerank_for_miami)

```json
{
  "hook_id": "HEAVY_PAGE",
  "severity": "high",
  "personalization_hook": "Your homepage weighs 9.6 MB on a single visit. For a mobile buyer on a casual scroll that's instant churn — and Lighthouse counts the weight straight against your mobile rank.",
  "evidence": { "total_bytes": 10073600, "threshold_bytes": 5242880 }
}
```

## Custom fields stored on the Instantly lead

When `audit_and_upload.mjs` POSTs each lead:
- `personalization` (built-in) — the hook line, ready for `{{personalization}}` template variable
- `payload.hook_id` — stable hook identifier (NO_WHATSAPP_BUTTON / HEAVY_PAGE / etc.)
- `payload.hook_severity` — high/medium/low
- `payload.audit_load_ms` — real measurement
- `payload.audit_has_whatsapp` — 0/1
- `payload.audit_has_schema` — 0/1
- `payload.audit_copyright_year` — year integer
- `payload.linkedin` — preserved from source CSV
- `payload.open_role`, `payload.company_short`, `payload.open_role_link` (if hiring-intent CSV)

## Verified test (2026-04-26 first run)

5 real Mexican real-estate prospects produced 4 distinct hook types:
- Caroline @ La Plataforma → NO_WHATSAPP_BUTTON
- Andrés @ Door.mx → NO_SCHEMA_JSONLD
- Francisco @ Homie.mx → HEAVY_PAGE (9.6 MB)
- Reinier @ Link Inmobiliario GDL → MOBILE_LOAD_SLOW (5.6s + ©2016)
- Karen @ URP Propiedades → NO_SCHEMA_JSONLD

## Hard rules satisfied

- **HR#0:** Every number in the personalization line traces to a real measurement in the audit JSON. No estimates.
- **HR#1:** `audit_and_upload.mjs` calls `GET /campaigns?limit=1` before any writes.
- **HR#13:** Pipeline fully automated — Alex doesn't run individual commands.

## When to use this skill

- Personalize a fresh batch of cold-email leads before activating a campaign
- Re-audit existing campaign leads to refresh stale personalization
- Add a new market geography — write `rerank_for_<market>.mjs` with appropriate copy + priority
- Debug why a prospect isn't getting a hook (run `audit_prospect.mjs` directly)
- Verify Playwright install in `/tmp/ms-playwright/`
- Add new hook types to `rank_hook.mjs`

## Related skills

- `linkedin-hiring-intent` — DEPENDS ON this skill for personalization
- `lead-finder` — DataForSEO Maps lead source (alternative to LinkedIn)
- `instantly-cold-outreach` — campaign ops + AI reply agent
- `cold-email-copywriting` — Step 1 copy quality scoring (uses the personalization hook in body)
- `audit-funnel` — DIFFERENT skill — owns the post-reply `/auditoria-gratis` audit. This skill is upstream (cold-email-send-time)
