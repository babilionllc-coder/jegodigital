---
name: fb-ads-master
description: THE definitive expert skill for every Facebook/Instagram paid-ad task at JegoDigital — research, brief, build, score, validate, ship, audit. Consolidates fb-ad-creative-builder + ad-creative-scorer + meta-ads-jegodigital + 2026 research into ONE source of truth. Use EVERY TIME Alex (or any spawned agent) touches FB ads — campaigns, ad sets, creatives, lead forms, retargeting, custom audiences, lookalikes, CAPI, scaling, pausing, post-mortems, reply-rate diagnostics, audience-clarity audits. Triggers — jegodigital fb ads, meta ads, paid ads, paid spend, retargeting, custom audience, lookalike, advantage+, lead form, instant form, capi, conversion api, fb ad creative, ig paid ad, ad image, ad video, ad copy, headline, fb thumbnail, ad creative scoring, score creative, audit ad, rebuild ad, redesign ad, ad fails, paused campaign rebuild, ad account 968739288838315, page 766570479879044, sofia engagement campaign, dormir disaster, v3 0/18, v4 paid ready, build adset, scale ads, kill campaign, fb ad audit. DIFFERENT from canva-jegodigital (organic IG visuals only) — this is the PAID-AD MASTER skill. fb-ad-creative-builder + ad-creative-scorer + meta-ads-jegodigital are SUB-MODULES of this skill.
type: master-skill
author: JegoDigital + Claude (Alex Jego founder)
last-updated: 2026-05-05
boot_sequence:
  - SKILL.md            # this file — read first
  - JEGODIGITAL_LOCKS.md # brand-and-rule locks for the org (read before any creative work)
  - FAILURES_TO_AVOID.md # disaster patterns — read before designing
  - RESEARCH.md          # 2026 cited research — read before briefing
  - SCORECARD.md         # 7-axis 10/10 floor rubric — read before scoring
  - BUILD_CHECKLIST.md   # phase gates — read before producing
  - VALIDATORS.md        # hard validators — run before send
  - PROMPT_TEMPLATES.md  # spawn-agent templates — use when delegating
---

# fb-ads-master — JegoDigital's Master FB/IG Paid-Ad Skill

> **Born from the 2026-05-05 v3 disaster:** the builder agent claimed 70/70 across 17 v3 creatives. Independent vision-based re-score found 0/18 hit floor 10. Average inflation gap 2.3 floor levels. Fragmentation across 4 sibling skills (fb-ad-creative-builder, ad-creative-scorer, meta-ads-jegodigital, separate research dossiers) made it possible for any spawned agent to skip critical context. **This skill consolidates everything so no future agent flies blind.**

> **Alex's directive (2026-05-05):** "Build a master `fb-ads-master` skill that knows EVERYTHING about creating 10/10 FB ads, BEFORE we touch creative work again."

---

## 🎯 Identity

**This is the master expert skill for every JegoDigital FB/IG paid-ad decision.** Any spawned agent that touches paid Meta spend reads this skill (in the `boot_sequence` order above) BEFORE doing any work. No exceptions.

**The 8-file expert layout:**

| # | File | Purpose | When to read |
|---|---|---|---|
| 1 | `SKILL.md` | Identity, boot sequence, workflow map | Always — first |
| 2 | `JEGODIGITAL_LOCKS.md` | Brand colors, logo, social URLs, anchor proofs, hard rules cross-ref | Before any creative |
| 3 | `FAILURES_TO_AVOID.md` | dormir / Sofia engagement / v3 0/18 patterns | Before designing |
| 4 | `RESEARCH.md` | 2026 cited research — Reels CPL, retargeting CVR, hook rule, CAPI lift, color, headlines | Before briefing |
| 5 | `SCORECARD.md` | 7-axis 10/10 floor rubric — paid ship gate | Before scoring |
| 6 | `BUILD_CHECKLIST.md` | 8-phase gate workflow with stop conditions | Before producing |
| 7 | `VALIDATORS.md` | em-dash audit, AI-tells lint, OCR audience check, independent scorer | Before send |
| 8 | `PROMPT_TEMPLATES.md` | Copy-paste templates for spawning future agents | When delegating |

---

## 🔁 The 8-phase master workflow

Every paid creative goes through these 8 phases. Skipping any phase = ship blocked. Each phase has a hard gate.

```
  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
  │ 1. Research │ -> │ 2. Brief    │ -> │ 3. Render   │ -> │ 4. Self     │
  │ (RESEARCH   │    │ (LOCKS +    │    │ (HTML+PW or │    │ score       │
  │  + Ad       │    │  CHECKLIST) │    │  ffmpeg)    │    │ (SCORECARD) │
  │  Library)   │    │             │    │             │    │             │
  └─────────────┘    └─────────────┘    └─────────────┘    └─────────────┘
                                                                  │
                                                                  v
  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
  │ 8. Activate │ <- │ 7. Preview  │ <- │ 6. Validate │ <- │ 5. INDEPEND │
  │ (paid spend │    │ to Alex 👍  │    │ (em-dash,   │    │ score       │
  │  via meta-  │    │             │    │  AI-tells,  │    │ (separate   │
  │  ads-jego)  │    │             │    │  OCR)       │    │  agent)     │
  └─────────────┘    └─────────────┘    └─────────────┘    └─────────────┘

       ❌ floor < 10 at Phase 5 -> back to Phase 3 (rebuild prompts emitted by scorer)
       ❌ Alex 👎 at Phase 7 -> back to Phase 2 (brief mismatch) or Phase 3 (execution)
```

**The 5-key gate:** Phase 5 (independent scoring by a SEPARATE agent context) is the central anti-inflation check. The builder cannot self-score — that's the lesson of the 2026-05-05 disaster. Phase 5 is non-negotiable for any creative that will see paid spend.

---

## 🛑 Hard rules cross-reference (read JEGODIGITAL_LOCKS.md for full bodies)

Every paid ad must honor:

- **HR-7** — never mark complete without proof (workflow green + same-session re-score)
- **HR-13** — paid ads need audience clarity in 2 seconds (real-estate visual + niche text visible)
- **HR-14** — paid ads must hit 10/10 on every axis (floor scoring, no 9s allowed)
- **HR-14.1** — independent scoring required (the same agent that builds cannot honestly score)
- **HR-17** — collaboration tone (banned phrase list in `JEGODIGITAL_LOCKS.md`)
- **HR-18** — research before send (3-rule gate, Phase 1 cannot be skipped)
- **HR-19** — JegoDigital + real-estate niche intro (first 1-2 sentences / first 200 chars)
- **HR-FB-1** — creative is 80% of performance, targeting is 20%
- **HR-FB-2** — CAPI before scale (no ad-set budget >$5/day until CAPI is wired)
- **HR-FB-3** — speed-to-lead under 5 min
- **HR-FB-4** — 3-5 form fields max
- **HR-FB-5** — never quote price in ad copy

---

## 🔗 Sub-module relationships (this skill is the master)

| Sub-module | Path | Role under fb-ads-master |
|---|---|---|
| `fb-ad-creative-builder` | `skills_patches/fb-ad-creative-builder/` | Lower-level production runbook for HTML+Playwright renders. fb-ads-master OWNS the workflow; this sub-module owns the render mechanics. |
| `ad-creative-scorer` | `skills_patches/ad-creative-scorer/` | Phase 5 invocation target. Called from a SEPARATE agent context. Returns structured scorecard. |
| `meta-ads-jegodigital` | (plugin skill) | Phase 8 activation. Owns campaign IDs, audience builds, CAPI, ad-set creation, budget rules. fb-ads-master tells it WHEN to ship; it owns HOW. |
| `jegodigital-strategist` | `skills_patches/jegodigital-strategist/` | Audit + scoring orchestrator. Routes to fb-ads-master for FB-ad-specific work. |

---

## 📋 Quick-start: 6 most common asks Alex makes

| Ask | Phase to start at | First file to open |
|---|---|---|
| "Build me 5 new FB ads for the new campaign" | Phase 1 | `RESEARCH.md` then `BUILD_CHECKLIST.md` |
| "Score these 18 v4 creatives" | Phase 5 | `SCORECARD.md` (and spawn separate agent per HR-14.1) |
| "Why is this campaign not converting?" | Phase 4 of THE LIVE CAMPAIGN | `FAILURES_TO_AVOID.md` (pattern match) + `SCORECARD.md` (re-score live creatives) |
| "Refresh the creative on AdSet X" | Phase 1 (mini) | `RESEARCH.md` (placement-specific) + `JEGODIGITAL_LOCKS.md` |
| "Audit our last 5 paid campaigns" | Phase 4 retroactive | `SCORECARD.md` against pulled creatives via `meta-ads-jegodigital` |
| "Spawn an agent to score X" | Phase 5 | `PROMPT_TEMPLATES.md` (use the scorer template — never the builder template) |

---

## 🎬 Success criteria

A paid ad is **ship-ready** when ALL of the following hold:

1. Brief cites ≥1 specific signal-grounded fact about the audience (HR-18)
2. Visual passes the 2-second test (HR-13 / Axis 7)
3. Header includes "JegoDigital - Agencia de Marketing con IA para Inmobiliarias, Desarrolladores y Brokers" (HR-19 / Axis 1)
4. Body uses ≥3 collaboration words, 0 banned sales phrases (HR-17 / Axis 1)
5. Em-dash audit, AI-tells lint, OCR audience check ALL pass (Phase 6)
6. Independent scorer (separate agent) returns floor=10 on all 7 axes (HR-14 / HR-14.1 / Phase 5)
7. CAPI is wired (HR-FB-2) before any ad-set budget exceeds $5/day
8. Alex has explicitly 👍'd the preview (Phase 7)

If any one of those 8 fails -> ship blocked.

---

## 📋 Mandatory close (Rule 15)

Every Claude response that uses this skill closes with:

```
🎯 Next step: <one sentence>
⏳ ETA: <realistic timeframe>
🤝 Need from Alex: <one specific ask, or "nothing - Claude continues">
```

---

**End of SKILL.md.** Continue to `JEGODIGITAL_LOCKS.md` per `boot_sequence`.
