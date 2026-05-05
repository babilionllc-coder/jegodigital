# VALIDATORS.md — Hard validators that must pass before send

> **Why this exists:** human review misses things. Validators don't. Phase 6 of `BUILD_CHECKLIST.md` runs ALL of these. Any FAIL = ship blocked.

---

## 🛑 The 5 mandatory validators

| # | Validator | Path | What it blocks |
|---|---|---|---|
| 1 | em_dash_audit.sh | `skills_patches/fb-ad-creative-builder/validator_scripts/em_dash_audit.sh` | Em-dash (—) or en-dash (–) anywhere in HTML body (Rule 5 / HR-17 AI tell) |
| 2 | ai_tells_lint.sh | `skills_patches/fb-ad-creative-builder/validator_scripts/ai_tells_lint.sh` | Banned phrases (game changer, leverage, synergy, unlock, etc.) |
| 3 | ocr_audience_check.sh | `skills_patches/fb-ad-creative-builder/validator_scripts/ocr_audience_check.sh` | "Inmobiliaria" / "real estate" not visible in OCR pass on PNG (HR-13 / Axis 7) |
| 4 | check_collaboration_tone.sh | `tools/check_collaboration_tone.sh` | First 200 chars don't contain `JegoDigital` AND a niche keyword (HR-19) |
| 5 | Independent vision scorer | `skills_patches/ad-creative-scorer/SKILL.md` (spawn separate agent) | Floor < 10 on any axis (HR-14 / HR-14.1) |

---

## Validator 1 — em_dash_audit.sh

**What it does:** greps for `—` (U+2014) and `–` (U+2013) in any file. Both are banned in ad copy.

**Why:** em-dash is the canonical AI-tell. Even one in body copy = tone authenticity drops to 7. The brand-mark "JegoDigital — Agencia..." is the ONLY allowed em-dash and is hard-coded as an exception.

**Usage:**
```bash
bash skills_patches/fb-ad-creative-builder/validator_scripts/em_dash_audit.sh _html/<creative_slug>.html
# Exit 0 = clean (PASS)
# Exit 1 = found em-dashes (BLOCK)
```

**Common failure: CSS-comment em-dashes.** Pattern 9 of `FAILURES_TO_AVOID.md`. Fix: use `/* - banner - */` instead of `/* — banner — */`.

---

## Validator 2 — ai_tells_lint.sh

**What it does:** greps for the banned-phrase list defined in `JEGODIGITAL_LOCKS.md` (game changer · level up · leverage · synergy · unlock · elevate · 100% money back · risk-free · limited time · spots filling fast · last chance · cash buyer · etc.).

**Why:** these phrases trigger HR-17 collaboration-tone violation immediately. The 2026-05-04 dormir disaster shipped 4 banned phrases visible in the body — this validator catches that before send.

**Usage:**
```bash
bash skills_patches/fb-ad-creative-builder/validator_scripts/ai_tells_lint.sh _html/<creative_slug>.html
# Exit 0 = clean (PASS)
# Exit 1 = banned phrase found (BLOCK)
```

---

## Validator 3 — ocr_audience_check.sh

**What it does:** runs tesseract OCR on the rendered PNG and greps the OCR output for `Inmobiliaria` / `real estate` / `agencia` / `desarrollador` / `broker`. Confirms HR-13 (audience clarity) is satisfied at the visual level, not just the source HTML.

**Why:** the source HTML can have the niche text — but if the rendered PNG has it in a font/size that fails OCR, real users won't see it either. This catches the "buried in chat bubble" failure mode (Pattern 11).

**Usage:**
```bash
bash skills_patches/fb-ad-creative-builder/validator_scripts/ocr_audience_check.sh website/img/sofia-collaboration-v4/<creative>.png
# Exit 0 = niche keyword found in OCR (PASS)
# Exit 1 = NOT found (BLOCK or manual review)
```

**Known issue:** OCR fails on small banner text (Pattern 11). If validator FAILS but visual review confirms text IS visible, manual override is allowed BUT the orchestrator must log the override in the work-receipt.

**Patch in flight:** preprocessing (crop top 300px + 200% upscale before tesseract) — until shipped, manual spot-check on FAIL is the workaround.

---

## Validator 4 — check_collaboration_tone.sh

**What it does:** reads the ad's accompanying copy text file (or extracts copy from HTML) and confirms the first 200 characters contain BOTH `JegoDigital` AND a niche keyword (`inmobiliaria` / `real estate` / `agencia` / `desarrollador` / `developer` / `broker`).

**Why:** HR-19 (always introduce JegoDigital + RE niche). The "5-line rule" requires the first 5 lines to answer who-we-are + who-we-help. This validator enforces the first-200-char floor.

**Usage:**
```bash
bash tools/check_collaboration_tone.sh _html/<creative_slug>_copy.txt
# Exit 0 = both tokens found in first 200 chars (PASS)
# Exit 1 = missing one or both (BLOCK)
```

---

## Validator 5 — Independent vision scorer (spawn-agent)

**What it does:** spawns a SEPARATE agent context, passes it the rendered PNG/MP4 path + use case (paid/organic/landing), and gets back a structured scorecard per `SCORECARD.md` rubric.

**Why:** the most important validator. Catches the inflation pattern that all auto-validators miss (Empathy at 7 looks fine to a regex but fails the rubric).

**Usage:** see `PROMPT_TEMPLATES.md` `scorer-agent` template. Pass:
- Absolute file path
- Use case
- Previous self-score (so scorer can flag inflation gap)

**Block condition:** floor < 10 for paid → back to Phase 3 with verbatim rebuild prompts from scorer.

**Critical rule:** the same agent that built the creative MUST NOT score it. Run the scorer in a fresh agent context (Task subagent OR delegated to orchestrator). HR-14.1 makes this a hard rule, not a guideline.

---

## 📋 Validator run order (Phase 6)

```bash
# 1. Em-dash audit (HTML source)
bash skills_patches/fb-ad-creative-builder/validator_scripts/em_dash_audit.sh _html/$SLUG.html

# 2. AI-tells lint (HTML source)
bash skills_patches/fb-ad-creative-builder/validator_scripts/ai_tells_lint.sh _html/$SLUG.html

# 3. OCR audience check (rendered PNG)
bash skills_patches/fb-ad-creative-builder/validator_scripts/ocr_audience_check.sh website/img/sofia-collaboration-v4/$SLUG.png

# 4. Collaboration tone check (copy text)
bash tools/check_collaboration_tone.sh _html/${SLUG}_copy.txt

# (Phase 5 — independent scorer — already ran before Phase 6 in 8-phase order; if it didn't, FAIL — ship blocked)
```

**Aggregate gate:** all 4 above must exit 0 + Phase 5 floor=10 = PASS to Phase 7. Anything else = BLOCK + log to outputs/.

---

## 🚨 Validator failure escalation

| Failure mode | First fix | Second fix | Escalate to Alex |
|---|---|---|---|
| em_dash | replace with comma/period; check CSS comments | re-render PNG | If brand-mark exception trips the script |
| ai_tells | rewrite the offending sentence | re-validate | If client-mandated phrase needs to be allowlisted |
| ocr | crop+upscale preprocess; bigger banner font | re-render PNG | If preprocessing patch needed |
| collaboration_tone | rewrite first 200 chars | re-validate | If brief mismatch (intro buried in body) |
| independent score floor<10 | quote the rebuild prompt verbatim, re-render | re-score | If brief mismatch (≥4 axes need rebuild) |

---

## 🔗 Cross-references

- `SCORECARD.md` — independent scorer rubric (Validator 5 reference)
- `PROMPT_TEMPLATES.md` — scorer-agent spawn template (Validator 5 invocation)
- `BUILD_CHECKLIST.md` — Phase 6 in-context
- `JEGODIGITAL_LOCKS.md` — banned phrase list (Validator 2 source)

---

**End of VALIDATORS.md.** Continue to `PROMPT_TEMPLATES.md` per `boot_sequence`.
