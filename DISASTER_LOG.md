# JegoDigital — DISASTER LOG

> **Purpose:** every failed approach, root cause, and "what to do instead." Grep this before trying anything that could be a repeat (HARD RULE #10).
> **Usage:** `grep -i "<keyword>" /Users/mac/Desktop/Websites/jegodigital/DISASTER_LOG.md`
> **Rule:** if an entry pattern repeats, promote it to a HARD RULE in CLAUDE.md. Don't just log it twice.

---

## 2026-04-21 — Fake "warm lead" from gatekeeper answer
**What I tried:** Labeled Jose Fernandez (Aloja Cancún) a "warm lead" because a receptionist answered the phone and said "permanece en la línea" (hold on). Quoted "30% conversation rate" and "2-3 YES bookings in range" without data.
**Why it failed:** Receptionist ≠ decision-maker. Lead never verbally agreed to anything. No document was promised or sent. Numbers were fabricated.
**What to do instead:** A warm lead requires (a) decision-maker confirmed, (b) explicit "yes I want X" in the transcript, (c) document promised AND sent. See HARD RULE #0 + §Confirmed warm leads.
**Tag:** cold-call · lead-gen · data-integrity

---

## 2026-04-21 — Ran cold-email report from stale memory instead of live API
**What I tried:** Wrote cold-email status using the 0.46% reply rate snapshot from April 15 memory (`cold_email_cleanup_2026_04_15.md`) instead of verifying live access to Instantly v2 API.
**Why it failed:** Sandbox was blocked on `api.instantly.ai` because cowork-egress allowlist didn't apply mid-session. I silently fell back to stale data.
**What to do instead:** Run `bash tools/verify_access.sh` at session start (auto-heals `.env` from `.secrets/instantly_api_key` backup + live-pings API). If blocked, loudly refuse with the 60-second fix script from HARD RULE #1. See HARD RULE #1.
**Tag:** cold-email · data-integrity · infra

---

## 2026-04-21 — 6-function Firebase deploy crashed from missing `require('./module')`
**What I tried:** Added `require('./coldCallAutopilot')` to `index.js` and pushed via Git Data API without including `coldCallAutopilot.js` in the same tree.
**Why it failed:** Firebase analyzer fails the WHOLE deploy (not just the one function) when a required module is missing from the tree. Six unrelated functions broke alongside the new one.
**What to do instead:** Pre-push checklist (DEPLOY.md): `node --check` every `.js` touched. If you add `require('./foo')`, commit `foo.js` in the SAME Data API tree. Also: re-pull `refs/heads/main` SHA right before the commit to avoid Strategist race. Commit `c48fc37` is the canonical example of this disaster.
**Tag:** deploy · infra

---

## 2026-04-21 — ElevenLabs `silence_end_call_timeout` PATCH silently dropped
**What I tried:** PATCH-ed all 3 ElevenLabs agents to set `silence_end_call_timeout: 20`. PATCH returned HTTP 200.
**Why it failed:** The field came back as `null` on the next GET. PATCH accepted but silently discarded. The `client_inactivity_timeout_seconds` field in the payload is FAKE — API accepts it, never stores it.
**What to do instead:** After every agent PATCH, immediately GET the agent and diff the expected field. If dropped, try PUT or alternate nesting in the JSON. Canonical path in memory: `elevenlabs_silence_timeout_fix.md`.
**Tag:** cold-call · infra · data-integrity

---

## 2026-04-18 — `[your city]` literal placeholder shipped to Instantly
**What I tried:** Wrote US-Hispanic-Bilingual-Audit campaign with `[your city]` and `[your company]` hardcoded in Steps 1 & 4, assuming Instantly would merge them.
**Why it failed:** Instantly does NOT interpret `[brackets]` — they send literally as text. Alex caught it before activation.
**What to do instead:** Use valid `{{instantlyVariable}}` (`{{firstName}}`, `{{companyName}}`, `{{website}}`) OR rewrite generically ("your area", "your market"). Pre-ship: `grep -oE '\[[a-z ]+\]' <bodies>` must return zero. See CLAUDE.md §Cold Email Rules #11.
**Tag:** cold-email · copywriting

---

## 2026-04-18 — Tested mockup pipeline against INVENTED client domains
**What I tried:** Ran Firecrawl scrapes on `flamingorealestate.mx`, `gozarealestate.com`, `soliktulum.com` to test quality of pipeline.
**Why it failed:** Those domains don't exist. Real Flamingo is `realestateflamingo.com.mx`. Misdiagnosed Firecrawl quality because half the URLs were 404.
**What to do instead:** Canonical source for client domains is `website/showcase.html`. Before using ANY domain in a test, grep showcase.html. See CLAUDE.md §CLIENT DOMAIN RULE.
**Tag:** seo · infra · data-integrity

---

## 2026-04-15 — "Hola allá" fake firstName disaster
**What I tried:** Shipped 31 leads where scraper pulled "allá" into `firstName` field, plus 419 leads stranded in wrong campaign with fake first names.
**Why it failed:** No pre-upload quality gate. Reply rate dropped to 0.46% and campaigns looked robotic.
**What to do instead:** HARD RULE #5 5-gate lead quality check before any Instantly upload. `is_fake_name` filter mandatory. NEVER use `{{firstName|fallback}}` in greetings — default to "Hola," for scraped lists.
**Tag:** cold-email · lead-gen · data-integrity

---

## 2026-04-12 — Postiz subscription expired, all publish scripts dead
**What I tried:** Kept referencing `schedule_postiz_*.cjs` scripts in IG automation workflows.
**Why it failed:** Postiz subscription expired. All scripts silently fail — no post actually reaches Instagram.
**What to do instead:** Instagram publishing goes through **Meta Graph API directly** via `instagram-publisher` skill. NEVER reference Postiz in any workflow, script, or automation. Recipe + token flow in CLAUDE.md §INSTAGRAM PUBLISHING.
**Tag:** ig · infra · publishing

---

## 2026-04-11 — 8 blog posts deployed without any research or real images
**What I tried:** Wrote 8 blog posts for jegodigital.com from general knowledge, no API research, no competitive analysis, no real screenshots, no optimization scoring.
**Why it failed:** Posts looked amateur. Used Unsplash/Pexels stock photos, no schema, no E-E-A-T, no internal links, scores unknown. Alex flagged them as unsuitable for the site.
**What to do instead:** HARD RULE §BLOG POST QUALITY GATE (autonomous 5-step pipeline: research → brief → write with real images → score ≥80 → publish). Real screenshots only (NO-AI-IMAGES rule). Min 4 contextual in-body internal links (INTERNAL-LINKS rule).
**Tag:** seo · content · blog

---

## 2026-04-11 — AI-generated neon/3D/dashboard images in blog posts
**What I tried:** Used AI-generated images (3D neon isometric cityscapes, fake dashboard UIs with invented metrics, fake heatmap renders) as hero + section illustrations in a Google Maps blog post.
**Why it failed:** Obvious AI artifacts, fake metrics undermine trust, visuals don't match real client proof.
**What to do instead:** NO-AI-IMAGES HARD RULE in CLAUDE.md. ONLY real screenshots from whitelist: client SERPs, PageSpeed reports, WhatsApp/ManyChat flows, portfolio shots, jegodigital.com UI captures. Pre-ship image audit script in CLAUDE.md.
**Tag:** content · blog · seo

---

## 2026-04-08 — Instantly campaigns at 0.18% reply / 12% bounce rate
**What I tried:** Ran 6 Instantly campaigns simultaneously with Gmail sending accounts, unverified lead lists, bounce protection OFF.
**Why it failed:** Gmail accounts have stricter reputation gates. Unverified lists had 12% bounce → domain reputation tanked. Reply rate collapsed to 0.18%.
**What to do instead:** Permanent rules (see memory `instantly_postmortem_2026_04_08.md`): no Gmail accounts, verify lists pre-upload, bounce protect ON, delete bounced weekly, use Gen 2 managed accounts only.
**Tag:** cold-email · deliverability

---

## 2026-04-07 — n8n public API blocked on free trial
**What I tried:** Built n8n workflows for IG carousel auto-publish, expected API trigger to fire from external code.
**Why it failed:** n8n free trial explicitly says "Upgrade to use API" at `/settings/api`. Cannot trigger workflows programmatically.
**What to do instead:** NEVER route IG publishing through n8n. Use Graph API directly (`instagram-publisher` skill). Confirmed dead ends for IG: n8n API, Meta Business Suite Chrome automation, instagram.com web login, Firebase Storage as host, reading tokens via Chrome MCP.
**Tag:** ig · infra · publishing

---

## 2026-04-07 — Meta Business Suite via Chrome MCP unreachable
**What I tried:** Automated IG publishing via Meta Business Suite using Claude in Chrome MCP.
**Why it failed:** Suite opens native OS file picker for upload, which is outside the Chrome extension's reach.
**What to do instead:** Graph API direct only. See CLAUDE.md §INSTAGRAM PUBLISHING.
**Tag:** ig · chrome-mcp · publishing

---

## (older entries archived — restore on demand)

Any entry older than 90 days that no longer reflects a live risk → move to `DISASTER_LOG_ARCHIVE.md` during monthly review (OPERATING_RHYTHM.md §5 Disaster Log Review).

---

## 📝 How to add a new entry (HARD RULE #10 format)

```markdown
## <YYYY-MM-DD> — <one-line title>
**What I tried:** <specific approach, tool, API, copy>
**Why it failed:** <root cause, not symptom>
**What to do instead:** <validated approach OR "unknown, needs experiment">
**Tag:** <cold-email | cold-call | deploy | seo | content | ig | lead-gen | infra | data-integrity | chrome-mcp | publishing | copywriting>
```

**Rule:** tag ≤2 categories per entry, prefer the most specific. Keep entries under 100 words — this is not prose, it's a greppable reference.
