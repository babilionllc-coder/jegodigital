# BUILD_CHECKLIST.md — 8-phase gate workflow with stop conditions

> **Why this exists:** every phase has a hard gate. Skipping any gate = ship blocked. This checklist is what the building agent works through — and what the orchestrator audits to catch shortcuts.

---

## Phase 1 — Research (HR-18)

**Owner:** the building agent (or orchestrator delegating).
**Time budget:** 15-30 min for new campaigns; 5-10 min mini-pass for refreshes.

### Hard gates (all must pass)
- [ ] `RESEARCH.md` re-read for any benchmark referenced in the brief
- [ ] Meta Ad Library scan completed for top 3 competitors (https://www.facebook.com/ads/library)
- [ ] Pixel + CAPI status verified (HR-FB-2 — if CAPI not wired, ad-set budget capped at $5/day)
- [ ] Lead Form fill-rate checked if reusing form `942858358503290` (HR-FB-4)
- [ ] Placement decision made (Feed / Reels / Stories / Lead Form / Click-to-WA) with citation

### Output
1-page brief at `docs/campaigns/meta-research-brief-<YYYY-MM-DD>-<slug>.md` containing:
- 2026 benchmark cite (CPL, CPM expected for placement)
- Competitor visual hooks (top 3, screenshots)
- Audience decision (Custom Match / Pixel CA / interests / exclusions) with citation to §3 of `RESEARCH.md`
- Objective decision (`OUTCOME_LEADS` vs `OUTCOME_MESSAGES` vs `OUTCOME_ENGAGEMENT`) with rationale
- Budget tier (locked to HR-FB-2 — confirm CAPI status)

### Stop condition
If any gate fails → halt. Brief Alex with the missing piece. No proceed without explicit go-ahead.

---

## Phase 2 — Brief (HR-7 + HR-9)

**Owner:** building agent.
**Time budget:** 10-20 min per creative.

### Hard gates
- [ ] Audience explicitly named ("real estate brokers in Cancún + Riviera Maya, owner/director, agency 2-50 employees")
- [ ] Hook chosen from approved 4 anchor proofs (`JEGODIGITAL_LOCKS.md` §The 4 anchor proofs)
- [ ] Visual decision: Path A (real client screenshot, named client) OR Path B (branded template, no client name)
- [ ] Header text matches HR-19 verbatim
- [ ] Every stat has ✓ source tag
- [ ] CTA chosen: WhatsApp tap (default) / Calendly / IG DM (one only)
- [ ] Banned-phrase check: 0 hits
- [ ] Collaboration vocab: ≥3 words
- [ ] Format declared (1080×1080 / 1080×1350 / 1080×1920 / 9:16 video)

### Brief template (per creative)

| Field | Required content |
|---|---|
| Slug | `<client>_<angle>_<variant>` (e.g. `flamingo_pain_88pct`) |
| Audience | Explicit ICP (city, role, agency size) |
| Anchor proof | 1 of 4 from `JEGODIGITAL_LOCKS.md` |
| Visual path | Path A (client screenshot) or Path B (template) |
| Header | "JegoDigital — Agencia de Marketing con IA / para Inmobiliarias, Desarrolladores y Brokers" |
| Body line 1 | Acknowledge their world (observational) |
| Body line 2 | Mention partnership + specific case |
| Body line 3 | Soft CTA (WhatsApp tap default) |
| Stats (with ✓) | Every number tagged with source |
| CTA button | Full-width WhatsApp green or gold (NOT pill) |
| Format | 1080×1350 / 1080×1080 / 1080×1920 / 9:16 video |

### Stop condition
If any gate fails → fix the brief. Don't proceed to render with a partial brief.

---

## Phase 3 — Render (HTML + Playwright or ffmpeg)

**Owner:** building agent.
**Time budget:** 10-20 min per creative.

### Hard gates
- [ ] HTML at `_html/<creative_slug>.html` using brand-locked template
- [ ] Real client screenshots embedded via `<img>` from `website/img/showcase/<client>/` (Path A only)
- [ ] Glyphs use ✓ (NOT ✅) — Pattern 10 of `FAILURES_TO_AVOID.md`
- [ ] CSS comments use `-` (NOT `—`) — Pattern 9
- [ ] Render via Playwright Chromium headless, exact viewport, `device_scale_factor: 2`
- [ ] PNG saved to `website/img/sofia-collaboration-v<N>/<creative_slug>.png`

### Static template skeleton

```python
from playwright.sync_api import sync_playwright
import os

with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page(
        viewport={"width": 1080, "height": 1350},
        device_scale_factor=2
    )
    page.goto(f"file://{os.path.abspath('_html/creative_01.html')}")
    page.wait_for_load_state("networkidle")
    page.screenshot(
        path="../sofia-collaboration-v4/01_creative.png",
        omit_background=False
    )
    browser.close()
```

### Video pipeline
1. Storyboard frames (each at 1080×1920 for Reels)
2. ElevenLabs Sofia MX VO via `elevenlabs-voiceover` skill
3. ffmpeg composition with stills + voiceover + audience-text intro frame
4. First frame MUST contain RE visual + JegoDigital + niche text overlay (Pattern 12)
5. First 3 seconds = the entire pitch (RESEARCH.md §2)

### Stop condition
Render fails (Chromium crash, missing screenshot, broken glyphs) → fix and re-render. Don't proceed to scoring with broken assets.

---

## Phase 4 — Self-score (optional confidence pass)

**Owner:** building agent.
**Time budget:** 5 min per creative.

This is a SOFT gate — the builder runs through the 7-axis scorecard for confidence, but their self-score is NOT the verdict. Phase 5 is.

### Why optional
The builder has sunk-cost rounding bias (the 2026-05-05 disaster). Their self-score will inflate. We keep this phase to expose *obvious* problems (missing header, wrong visual) before wasting Phase 5 cycles, but the score is non-binding.

### Output
Quick self-rating per axis with notes. Marked clearly as `SELF-SCORE — NOT THE VERDICT`.

---

## Phase 5 — INDEPENDENT score (HR-14.1, mandatory)

**Owner:** SEPARATE agent context (orchestrator OR Task subagent — NEVER the builder).
**Time budget:** 5-10 min per creative.

### Hard gates
- [ ] Scorer agent invoked from a different context than builder (use `PROMPT_TEMPLATES.md` scorer template)
- [ ] Scorer reads each PNG with vision (Read tool returns the image)
- [ ] Scorer scores all 7 axes per `SCORECARD.md` rubric
- [ ] Scorer computes floor = min(axes), NOT average
- [ ] Scorer outputs in the exact `SCORECARD.md` template format
- [ ] Verdict logged in `outputs/<batch_slug>_independent_score_<date>.md`

### Block condition
- Floor < 10 for paid → REBUILD that axis (back to Phase 3 with verbatim rebuild prompt from scorer)
- Floor ≥ 10 for paid → proceed to Phase 6
- Phase 5 → Phase 7 short-circuit is BANNED. Phase 6 (validators) must run.

### How to spawn the scorer
Use `PROMPT_TEMPLATES.md` `scorer-agent` template. Pass:
- Absolute file path to PNG/MP4
- Use case (paid / organic / landing)
- Previous self-score claim (so scorer can flag inflation gap)

---

## Phase 6 — Validate (auto-lint)

**Owner:** building agent (after Phase 5 passes).
**Time budget:** 1-2 min per creative.

### Hard gates (all 4 must pass)

```bash
bash skills_patches/fb-ad-creative-builder/validator_scripts/em_dash_audit.sh <creative.html>
bash skills_patches/fb-ad-creative-builder/validator_scripts/ai_tells_lint.sh <creative.html>
bash skills_patches/fb-ad-creative-builder/validator_scripts/ocr_audience_check.sh <creative.png>
bash tools/check_collaboration_tone.sh <creative_copy.txt>
```

- [ ] em_dash_audit.sh PASSED
- [ ] ai_tells_lint.sh PASSED
- [ ] ocr_audience_check.sh PASSED (if FAIL, manual visual review per Pattern 11)
- [ ] check_collaboration_tone.sh PASSED (HR-19 — JegoDigital + niche keyword in first 200 chars)

### Stop condition
Any validator fails → fix the source HTML (or copy), re-render, re-validate. Don't proceed with a flagged creative.

---

## Phase 7 — Preview to Alex (HR-14)

**Owner:** orchestrator.
**Time budget:** 1 message to Alex with full preview pack.

### Required preview pack
1. All renders side-by-side (or grid)
2. 7-axis scorecard per creative (independent score, not self-score)
3. Iteration count per axis (how many rebuilds per axis)
4. Recommended ad copy (headline / primary / description) per asset
5. Estimated CPL / reply-rate lift based on Phase 1 research
6. Validator results (em_dash + ai_tells + OCR + collaboration_tone all PASSED)

### Block condition
Wait for explicit Alex 👍. Do NOT activate campaign without it. "Looks good" or assumed approval = blocked send (per Pattern 6 of mistakes_ledger).

### Output channel
Telegram + Slack with PREVIEW_PACK markdown + image grid.

---

## Phase 8 — Activate (delegate to `meta-ads-jegodigital` skill)

**Owner:** orchestrator (delegating to `meta-ads-jegodigital`).
**Time budget:** 5-10 min.

### Hard gates
- [ ] Alex's 👍 captured with timestamp
- [ ] AdSet structure follows §3 of `meta-ads-jegodigital` (1 campaign, 3-4 ad sets max)
- [ ] Budget per HR-FB-2 ($5/day cap until CAPI wired)
- [ ] CAPI status confirmed (if scaling beyond $5/day)
- [ ] Audience built (Custom Match / Pixel CA / Form Openers per `RESEARCH.md` §3)
- [ ] Status flipped to ACTIVE via Meta Graph API (`POST /act_X/campaigns` with `status: ACTIVE`)

### Post-activate checks (HR-7 — never mark complete without proof)
```bash
# Verify campaign live
curl -s "https://graph.facebook.com/v22.0/<campaign_id>?access_token=$FB_USER_TOKEN&fields=status,daily_budget,name"
# → must return "status": "ACTIVE"
```

- [ ] Campaign API returns `status: ACTIVE`
- [ ] Ad Account spend cap respected
- [ ] First impression logged within 30 min
- [ ] Receipt posted to Telegram + Slack

### Stop condition
Activation fails → diagnose via Meta Graph API debug, do NOT retry blindly. Per HR-12, find a way (8-rung autonomy ladder), don't bounce back to Alex.

---

## 📋 The 8-phase gate summary table

| Phase | Owner | Hard gate | Stop condition |
|---|---|---|---|
| 1. Research | Builder | RESEARCH.md re-read + Ad Library scan | Missing benchmark / no competitor scan |
| 2. Brief | Builder | All 9 brief fields filled, banned-phrase = 0 | Brief partial |
| 3. Render | Builder | PNG/MP4 saved, glyphs ✓, CSS comments `-` | Render crash / broken glyph |
| 4. Self-score | Builder | Soft pass (informational only) | n/a |
| 5. Independent score | SEPARATE agent | floor=10 for paid | floor<10 → back to Phase 3 |
| 6. Validate | Builder | 4 validators PASSED | Any validator fail → fix + re-validate |
| 7. Preview | Orchestrator | Alex 👍 captured | No 👍 → wait |
| 8. Activate | Orchestrator | Campaign status=ACTIVE confirmed via API | Activation fail → diagnose, don't retry blindly |

---

## 🎯 Master mantra (read aloud before starting)

```
1. Research before brief.
2. Brief before render.
3. Render before self-score.
4. Self-score is informational ONLY — independent score is the verdict.
5. Independent score before validate.
6. Validate before preview.
7. Preview before activate.
8. Alex 👍 before any paid spend.
```

If any of those flips order — STOP. Re-orient. The order matters because each phase's gate depends on the prior phase being complete.

---

## 🔗 Cross-references

- `SKILL.md` — boot_sequence + workflow map
- `JEGODIGITAL_LOCKS.md` — brand + rule locks
- `FAILURES_TO_AVOID.md` — disaster pattern grep before designing
- `RESEARCH.md` — 2026 cited benchmarks
- `SCORECARD.md` — 7-axis rubric (Phase 5 reference)
- `VALIDATORS.md` — Phase 6 hard validators
- `PROMPT_TEMPLATES.md` — Phase 5 scorer-agent spawn template
- `meta-ads-jegodigital` (plugin skill) — Phase 8 activation runbook
- `fb-ad-creative-builder` (sub-skill) — Phase 3 render mechanics

---

**End of BUILD_CHECKLIST.md.** Continue to `VALIDATORS.md` per `boot_sequence`.
