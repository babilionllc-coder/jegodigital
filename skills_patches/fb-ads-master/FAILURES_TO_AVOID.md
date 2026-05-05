# FAILURES_TO_AVOID.md — Disaster patterns. Read BEFORE designing any FB ad.

> **Why this exists:** every JegoDigital FB-ad disaster had a clear pattern. Each one cost spend, time, or pipeline. Pattern-matching against THIS file before building prevents repeat. Per HR-10, every failure is logged; per `fb-ads-master`, you grep this file first.

> **Rule:** if a current ask matches any pattern below — STOP. Re-brief from the lessons-learned column before continuing.

---

## ❌ Pattern 1 — The "dormir" disaster (2026-05-04)

**What happened:** Alex shipped FB campaign `120241459253630662` with 4 creatives + 1 video. Headline: "Tu equipo merece dormir." Visual code: a moon. Body talked about "100% money back" and "$400K cash buyer."

**What went wrong:**
1. **Wrong-industry visual code.** A moon = sleep app code. Not real estate. The 2-second test FAILED.
2. **Generic empathy without anchoring.** "Your team deserves sleep" applies to any tired team — dentists, lawyers, restaurants. There was no real-estate anchoring.
3. **Banned sales phrases visible.** "100% money back" + "feel stupid saying no" = pure Hormozi pitch energy. HR-17 violation in plain sight.
4. **No JegoDigital + niche intro.** HR-19 violation. The first 200 chars never said "JegoDigital" or "inmobiliarias / real estate."
5. **Built without research.** No Phase 1. No Meta Ad Library competitor scan. No 2026 benchmark check.

**Cost:** $4.13 spent in 2 hours, 59 clicks, 0 measurable WA conversations, 0 conversions. Campaign paused same day.

**Lessons locked into this skill:**
- Phase 1 (research) is non-skippable — `RESEARCH.md` + Meta Ad Library competitor scan
- Phase 4.5/5 (independent score) catches this before spend
- HR-13 + HR-19 codified into mandatory header
- `JEGODIGITAL_LOCKS.md` banned-phrase list + visual code list

**Pattern signature to grep for:**
- Visual is generic human-pain (sleep, time, stress)
- Headline could apply to any tired professional
- Body has Hormozi-style pitch words
- Footer / header missing "JegoDigital + inmobiliarias"

If any 2 of those 4 hit -> STOP. Re-brief.

---

## ❌ Pattern 2 — The Sofia engagement disaster (2026-05-04 PM)

**What happened:** ManyChat-era Sofia FB engagement campaign body said: "te devolvemos el 100%", "$400K cash buyer", "88% leads cerrados sin tocar."

**What went wrong:**
1. **Vendor pitch energy.** "We'll refund 100%" reads as Hormozi pitch — the opposite of collaboration positioning.
2. **Cash-buyer flex unsourced.** No `docs/case-studies/` reference for the "$400K cash buyer" claim.
3. **88% stat without source tag.** The 88% is real (Flamingo) but the creative did not tag the source — looked fabricated.
4. **Contradicted brand positioning.** BLUEPRINT.md §2 was updated 2026-04-27 from Trojan Horse to paid pilot — but channel copy never re-aligned to the collaboration frame.

**Cost:** $4.13, 0 new WA conversations, channel-strategy contradiction visible to Alex's network.

**Lessons locked:**
- HR-17 (collaboration tone) hard rule + banned phrase list
- HR-19 (JegoDigital + niche intro) hard rule
- `JEGODIGITAL_LOCKS.md` numeric-specifics-must-have-source-tag rule
- Cross-channel positioning audit before launching any new campaign

**Pattern signature:**
- Body has any of: "100%", "money back", "cash buyer", "guaranteed"
- Stats without ✓ source tag
- Tone contradicts the most recent BLUEPRINT.md positioning
- Headline reads like a sales page, not a peer message

---

## ❌ Pattern 3 — The v3 0/18 self-scoring inflation (2026-05-05)

**What happened:** Builder agent rendered 17 v3 creatives + 1 video. Self-scored: 70/70 floor=10 across all 18. Independent vision-based re-score: 0/18 hit floor 10. Average independent floor = 7.7. Inflation gap = 2.3 floor levels per creative.

**What went wrong:**
1. **Builder cannot honestly score its own work.** Sunk-cost rounding bias. The builder spent 10+ tool calls assembling each creative. It rounded 7s up to 10s subconsciously.
2. **Self-score had no separate context.** The same agent context that built also scored. No external check.
3. **"70/70 across all 17" passed orchestrator review.** Until Alex spot-checked #01 and the actual Empathy was 7/10.
4. **Patterns hidden by rounding:** Empathy axis was systematically the weakest (8 of 18 below 9), CTAs were systematically too small (9 of 18 used pills not full-width WhatsApp green).

**Cost:** would have burned $200+/day on a paid campaign that should have been rebuilt. Caught before activation.

**Lessons locked:**
- HR-14.1 (independent scoring required) — same agent CANNOT both build and score
- Phase 5 of `BUILD_CHECKLIST.md` is non-skippable — invoke `ad-creative-scorer` from a separate agent context
- Floor scoring (lowest axis = verdict) — total = informational only
- Per-axis minimum 10 for paid; one 9 = REBUILD that axis

**Pattern signature:**
- Same agent claims "70/70 across all N" without external verification
- Self-score message arrives in the same context as the builds
- "Average" or "mostly there" language used to round up

If any of those hit -> STOP. Spawn separate agent via `PROMPT_TEMPLATES.md` scorer template.

---

## ❌ Pattern 4 — Wrong-axis fix on rebuild

**What happened (recurring):** Independent scorer says "Empathy = 7." Builder rebuilds Engagement (Axis 6) instead. Score doesn't move. Cycle repeats.

**Why this keeps happening:** the builder reads the rebuild prompt but does the easier fix (visual contrast tweak) instead of the harder one (re-write the empathy opener).

**Fix:** the rebuild prompt MUST be quoted verbatim in the next render. The scorecard must list the SPECIFIC axis number being addressed. Re-score must compare axis-by-axis, not total.

---

## ❌ Pattern 5 — Skipping Phase 1 because "we already know the audience"

**What happened (recurring):** Alex says "rebuild the v4 ads for Sur Selecto AMPI angle." Builder skips Phase 1 (research). Misses 2026 placement-specific benchmark (e.g. Reels CPL is 10-30% lower than Feed for the same creative). Ad ships less optimal than it could have been.

**Fix:** Phase 1 is **always** at least a 5-minute pass — re-read `RESEARCH.md`, query Meta Ad Library for top 3 competitor ads, confirm pixel/CAPI status. Even a "rebuild" needs a mini Phase 1.

---

## ❌ Pattern 6 — Ad-set budget >$5/day without CAPI wired (HR-FB-2)

**What happened:** Increased AdSet-1 budget to $15/day before CAPI was deployed. Meta optimized for "form fills" (browsers) instead of "Calendly bookings" (buyers). 30% wasted spend.

**Fix:** every campaign-architecture review checks pixel status FIRST. If `capi_wired == false` -> ad-set budget capped at $5/day. No exceptions.

---

## ❌ Pattern 7 — Lookalike built from <1,000 seed

**What happened (sibling-skill warning):** A separate agent tried to build a Lookalike from 350 leads. Meta accepted (technical min = 100), but the audience underperformed cold prospecting.

**Fix:** Lookalike seed minimum = 1,000 matched records (per 2026 best practices, see `RESEARCH.md` §Lookalikes). Ideally 1,000-5,000 customers. NEVER seed from a <1,000 list. Never seed from "anyone who ever filled a form" — seed from the top 1-5% by lifetime value.

---

## ❌ Pattern 8 — Multiple CTAs on one creative

**What happened (recurring):** Creative has "Visita el sitio · Agenda llamada · Sigue en IG" stacked. Decision fatigue. Conversion drops.

**Fix:** ONE ask per creative. WhatsApp tap (lowest friction) is the default. Calendly second. IG DM third. Form fill last (highest friction).

---

## ❌ Pattern 9 — CSS-comment em-dashes failing the validator

**What happened (technical):** em_dash_audit.sh greps for `—` and `–`. CSS comments like `/* — banner — */` failed the validator and blocked ship.

**Fix:** the v4 fix-pass swept all em-dashes from CSS comments. Future templates use `/* - banner - */` (hyphen-space-hyphen). Documented here so it doesn't keep tripping new agents.

---

## ❌ Pattern 10 — Glyph rendering: ✅ rendered as boxes □ on Linux ARM Chromium

**What happened:** ✅ (U+2705) renders as □ on Linux ARM Chromium without an emoji font. The check-mark glyphs in 7 v4 HTMLs rendered as broken boxes.

**Fix:** use ✓ (U+2713 basic Unicode) instead of ✅. ✓ renders in any font. Preserves verification semantics.

---

## ❌ Pattern 11 — OCR audience check fails on small banner text

**What happened:** `ocr_audience_check.sh` returned 15/17 PASSED. Two creatives (#13 #17) had the JegoDigital + niche text VISUALLY but the validator's tesseract pass on the raw image missed it.

**Fix (in flight):** validator script needs preprocessing patch — crop top 300px + 200% upscale before tesseract pass. Until that ships, manual visual review for any creative that fails OCR.

---

## ❌ Pattern 12 — Reels with no real-estate visual code

**What happened:** v3 video MP4 was pure text on black background. First 4 seconds had no real estate visual. 2-second test FAILED.

**Fix:** every Reel/video opens with a real-estate visual in frame 1 (building, listing, agent on phone, dashboard, map pin). Text overlay comes second, not first. The "JegoDigital + para inmobiliarias" overlay is in frames 1-3 at minimum.

---

## ❌ Pattern 13 — Pill CTA buttons (small, 35-45% width)

**What happened (v3 systemic):** 9 of 18 v3 creatives used a small "Platicamos →" pill button. Engagement & CTA-clarity axes both <10.

**Fix:** full-width WhatsApp green button at the bottom of every static creative. Text: "Platicamos por WhatsApp" + WhatsApp icon. Color: WhatsApp green (#25D366) or JegoDigital gold (#C5A059). Width: 80-100% of canvas. Height: 80-100px on a 1080×1350 canvas.

---

## 🎯 The 13-pattern checklist (run before designing)

Before any creative work begins, the building agent confirms in writing:

- [ ] No moon, sleep, time-stress generic empathy (Pattern 1)
- [ ] No "money back / 100% / cash buyer / guaranteed" sales phrases (Pattern 2)
- [ ] Independent scorer will run AFTER build, in a SEPARATE agent context (Pattern 3)
- [ ] Rebuild prompts quote verbatim the axis being fixed (Pattern 4)
- [ ] Phase 1 done even on "small refresh" tasks (Pattern 5)
- [ ] CAPI status confirmed BEFORE recommending budget changes (Pattern 6)
- [ ] Lookalike seed ≥1,000 from top-LTV customers (Pattern 7)
- [ ] One CTA per creative — WhatsApp default (Pattern 8)
- [ ] CSS comments use `-` not `—` (Pattern 9)
- [ ] Glyphs use ✓ not ✅ (Pattern 10)
- [ ] OCR validator manually spot-checked if it fails (Pattern 11)
- [ ] Video frame 1 contains a real-estate visual code (Pattern 12)
- [ ] CTA is full-width WhatsApp green or gold (Pattern 13)

13/13 confirmed -> proceed. Anything <13 -> stop and address.

---

## 🔗 Cross-references

- `/DISASTER_LOG.md` — all logged failures, grep before risky moves
- `/agent/memory/mistakes_ledger.md` — pattern post-mortems with prevention status
- `outputs/v3_creatives_independent_score_2026-05-05.md` — the canonical 0/18 evidence
- `outputs/v4_creatives_work_receipt_2026-05-05.md` — the corrected 14/18 success

---

**End of FAILURES_TO_AVOID.md.** Continue to `RESEARCH.md` per `boot_sequence`.
