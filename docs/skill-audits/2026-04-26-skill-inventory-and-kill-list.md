# Skill Inventory & Kill/Merge/Keep Audit — 2026-04-26

**Per Alex's revenue-first instruction.** Every active skill mapped to one of:
- **Bucket A** = Close clients this week
- **Bucket B** = Generate leads this week
- **Bucket C** = Improve funnel
- **Bucket D** = Unblock future revenue (infra)
- **ORPHANED** = doesn't map to any of the above

Cross-referenced against CLAUDE.md (16 hard rules + deprecated tools), DISASTER_LOG.md, and the 9 services. **No deletion executed yet — Step 4 awaits Alex's approval.**

---

## Step 1 — Full Inventory (JegoDigital plugin skills, 35)

| # | Skill | Bucket | Hard rule / playbook | Notes |
|---|---|---|---|---|
| 1 | `alex-founder-video` | C | — | Daily script delivery, founder-led handheld pipeline |
| 2 | `audit-funnel` 🆕 | C | HR-0, HR-6 | NEW 2026-04-26 — owns `/auditoria-gratis` end-to-end |
| 3 | `brevo-email-marketing` | C | HR-9 | Nurture existing leads — feeds audit-funnel D+1/D+3/D+5/D+7 |
| 4 | `calendly-follow-up` | A | — | No-show recovery, SMS reminders, T-10min ping |
| 5 | `canva-jegodigital` | C | — | Generic visual asset system (IG posts/carousels/stories/showcase) |
| 6 | `client-onboarding` | A | — | Trojan Horse activation under 2h |
| 7 | `client-reporting` | A | HR-7 | Monthly client performance reports = retention |
| 8 | `client-site-ops` | A | HR-1 | Weekly client SEO cadence (audit→fix→ship→measure) |
| 9 | `cold-calling-ai` | B | HR-1 | ElevenLabs + Twilio outbound calls |
| 10 | `cold-email-copywriting` | B | — | Step 1 copy quality scoring (cold-email-sequences-2026.md) |
| 11 | `elevenlabs-voiceover` | C | — | Audio for video pipeline (THE only voice tool) |
| 12 | `flamingo-tiktok-publisher` | C | — | **Client-specific** TikTok publish pipeline for Flamingo |
| 13 | `hyperframes` | C | — | HTML-based video composition (GSAP, audio-reactive) |
| 14 | `instagram-publisher` | C | — | IG Graph API publish stage (only working path) |
| 15 | `instantly-cold-outreach` | B | HR-1 | Cold email campaign ops + AI reply agent config |
| 16 | `jegodigital-carousels` | C | — | **Specific** HTML+WeasyPrint pipeline for IG carousels |
| 17 | `jegodigital-cotizaciones` | A | — | Premium PDF client proposals |
| 18 | `jegodigital-instagram-stories` | C | — | **Specific** 1080×1920 IG story pipeline |
| 19 | `lead-finder` | B | HR-5 | DataForSEO Maps lead source (general agencies) |
| 20 | `linkedin-hiring-intent` | B | HR-5 | LinkedIn Jobs lead source (hiring intent) |
| 21 | `manychat-jegodigital` | C | — | WhatsApp + IG Sofia automation |
| 22 | `playwright-prospect-audit` 🆕 | B | HR-0 | NEW 2026-04-26 — per-prospect site rendering for personalization |
| 23 | `remotion-shorts` | C | — | YouTube Shorts render (9:16, Tony voice, Veo clips) |
| 24 | `saas-product-tour` | C | — | Demo videos for jegodigital.com pages |
| 25 | `seo-aeo-audit` ⚠️ | — | DEPRECATED | Marked DEPRECATED in CLAUDE.md — replaced by seo-engine |
| 26 | `seo-engine` | D | HR-2 | Master SEO/AEO orchestrator (8 modules) |
| 27 | `tiktok-viral` | C | — | Founder-led short-form video strategy |
| 28 | `veo-flow` | C | — | Google Veo 3.1 AI video generation |
| 29 | `video-editing-studio` | C | — | Master orchestrator: video-use + hyperframes + veo-flow |
| 30 | `video-factory` | C | — | Master orchestrator: property video pipeline |
| 31 | `video-use` | C | — | Conversational video edit (transcript-driven, ASR, ffmpeg) |
| 32 | `website-builder` | A | — | Service 5 — high-performance client websites on Firebase |
| 33 | `youtube-long-form` | C | — | 5–10 min faceless YouTube videos |
| 34 | `youtube-talking-tutorial` | C | — | PiP avatar tutorials (Sync Labs lipsync) |
| 35 | `youtube-thumbnail` | C | — | 1280×720 YouTube thumbnails |

## Step 1 — Anthropic generic skills (16, plugin-loaded)

| Skill | Bucket | Notes |
|---|---|---|
| `algorithmic-art` | ORPHANED | Never used for JegoDigital revenue |
| `canvas-design` | ORPHANED | Replaced by canva-jegodigital |
| `consolidate-memory` | D | Meta-skill, used rarely |
| `data-context-extractor` | ORPHANED | Generic data warehouse setup — N/A for us |
| `doc-coauthoring` | ORPHANED | Replaced by skill-specific writing flows |
| `docx` | D | Used for Word docs (rare) |
| `mcp-builder` | ORPHANED | Only when building MCPs (haven't) |
| `pdf` | D | Used for PDFs (cotizaciones uses WeasyPrint instead) |
| `pptx` | ORPHANED | Used 0 times |
| `schedule` | D | Used today (jegodigital-campaign-pulse) |
| `setup-cowork` | ORPHANED | First-time setup only |
| `skill-creator` | D | Used today (creating new skills) |
| `theme-factory` | ORPHANED | Generic theming — replaced by JegoDigital brand kit |
| `web-artifacts-builder` | ORPHANED | Cowork artifacts — used 0 times |
| `xlsx` | D | Used for spreadsheets (rare) |

## Step 1 — Plugin bundles (massive, mostly orphaned)

| Plugin | Skills | Bucket for JegoDigital | Notes |
|---|---|---|---|
| `data:*` | 11 skills | ORPHANED | Generic data analysis — `seo-engine` covers our use cases |
| `design:*` | 7 skills | ORPHANED | Generic design — `canva-jegodigital` covers ours |
| `engineering:*` | 9 skills | ORPHANED | Generic SWE — DEPLOY.md + GitHub Actions covers ours |
| `finance:*` | 9 skills | ORPHANED | Generic accounting — N/A for us |
| `marketing:*` | 8 skills | ORPHANED | Generic marketing — JegoDigital-specific skills cover ours |
| `product-management:*` | 9 skills | ORPHANED | Generic PM — N/A for solo operator |
| `sales:*` | 9 skills | ORPHANED | Generic sales — `cold-email-copywriting` + Trojan Horse covers ours |
| `productivity:*` | 4 skills | ORPHANED | Generic productivity — TASKS.md + NEXT_STEP.md covers ours |
| `cowork-plugin-management:*` | 2 skills | ORPHANED | Meta — only when building Cowork plugins |
| `manychat-jegodigital:*` | 1 skill | C | KEEP — already counted above |

**Total plugin-bundle skills: ~70.** None map to A/B/C/D for OUR specific revenue. **Massive token-savings opportunity.**

---

## Step 2 — Kill/Merge Criteria Applied

### A. Redundancy candidates

1. **`seo-aeo-audit`** — already DEPRECATED in CLAUDE.md. Replaced by `seo-engine`.
2. **`canva-jegodigital` + `jegodigital-carousels` + `jegodigital-instagram-stories`** — three skills for the same domain (IG visuals). canva-jegodigital says it covers carousels too, but jegodigital-carousels is the specific pipeline. Real overlap.
3. **`video-editing-studio` + `video-use`** — video-editing-studio is the orchestrator that internally calls video-use. They aren't independent.
4. **`flamingo-tiktok-publisher`** — client-specific. We don't have a `goza-tiktok-publisher` or `solik-tiktok-publisher`. Inconsistent.

### B. Stale / unused candidates

1. **`hyperframes`** — never appeared in production runs of `video-factory`. video-factory uses Remotion + ffmpeg directly, not hyperframes.
2. **All Anthropic ORPHANED skills** — algorithmic-art, canvas-design, data-context-extractor, doc-coauthoring, mcp-builder, pptx, setup-cowork, theme-factory, web-artifacts-builder. Zero use in any disaster log entry or NEXT_STEP.md item.
3. **All plugin bundles** (`data:*`, `design:*`, `engineering:*`, `finance:*`, `marketing:*`, `product-management:*`, `sales:*`, `productivity:*`) — generic templates that don't map to JegoDigital revenue.

### C. Bypass / manual candidates

None identified. JegoDigital skills are all wired to Cloud Functions or APIs, not manual UI clicks.

### D. Disaster check (NEVER kill)

Cross-referenced DISASTER_LOG.md (recent entries Alex flagged). Specifically called out:
- ✅ GitHub Git Data API push fix (commit `72ed715` per Alex's instruction) → not a skill, it's a script. Safe.
- ✅ `tools/playwright/` (commit `67d29576`) → just shipped today. Safe.
- ✅ `audit-funnel` + `playwright-prospect-audit` skills → just shipped. Safe.
- ✅ `cold-email-copywriting` scorecard → critical for HR-9 quality gate. KEEP.
- ✅ `linkedin-hiring-intent` → core lead source. KEEP.
- ✅ `seo-engine` → master orchestrator for all SEO/AEO. KEEP.

---

## Step 3 — Audit Table (KILL / MERGE / KEEP)

### JegoDigital plugin skills

| Skill | Verdict | Justification |
|---|---|---|
| `alex-founder-video` | **KEEP** | Daily founder-led content production — Bucket C, drives @alexjegodigital follower growth |
| `audit-funnel` 🆕 | **KEEP** | Today's biggest revenue lever — owns post-reply funnel |
| `brevo-email-marketing` | **KEEP** | Bucket C, feeds audit-funnel nurture (D+1/D+3/D+5/D+7) |
| `calendly-follow-up` | **KEEP** | Bucket A, owns booking lifecycle (no-show recovery, SMS, T-10min) |
| `canva-jegodigital` | **MERGE** | Absorb `jegodigital-carousels` + `jegodigital-instagram-stories` into one canonical visual-asset skill |
| `client-onboarding` | **KEEP** | Bucket A, Trojan Horse activation |
| `client-reporting` | **KEEP** | Bucket A, monthly retention reports |
| `client-site-ops` | **KEEP** | Bucket A, owns weekly client SEO cadence |
| `cold-calling-ai` | **KEEP** | Bucket B, ElevenLabs + Twilio. Underutilized but architecturally sound |
| `cold-email-copywriting` | **KEEP** | Bucket B, today's scorecard saved 4 weak email rewrites |
| `elevenlabs-voiceover` | **KEEP** | Bucket C, THE only voice tool — used by 5+ video skills |
| `flamingo-tiktok-publisher` | **MERGE** | Generalize into `tiktok-publisher` (any client) — fold into `video-factory` |
| `hyperframes` | **KILL** | Stale — never invoked by `video-factory` in production. ~5K tokens of context bloat |
| `instagram-publisher` | **KEEP** | Bucket C, only working IG publish path |
| `instantly-cold-outreach` | **KEEP** | Bucket B, owns campaign ops |
| `jegodigital-carousels` | **MERGE** | → into `canva-jegodigital` (consolidate visual asset system) |
| `jegodigital-cotizaciones` | **KEEP** | Bucket A, $20K+ deal proposals |
| `jegodigital-instagram-stories` | **MERGE** | → into `canva-jegodigital` |
| `lead-finder` | **KEEP** | Bucket B, DataForSEO Maps source (different from LinkedIn) |
| `linkedin-hiring-intent` | **KEEP** | Bucket B, today's 80-lead Miami campaign source |
| `manychat-jegodigital` | **KEEP** | Bucket C, Sofia WhatsApp + IG funnel |
| `playwright-prospect-audit` 🆕 | **KEEP** | Bucket B, today's per-prospect personalization unlock |
| `remotion-shorts` | **KEEP** | Bucket C, YouTube Shorts render pipeline |
| `saas-product-tour` | **KEEP** | Bucket C, jegodigital.com demo video pages — different from real-estate property videos |
| `seo-aeo-audit` ⚠️ | **KILL** | DEPRECATED in CLAUDE.md, replaced by seo-engine. Zero risk |
| `seo-engine` | **KEEP** | Bucket D + C, master SEO/AEO orchestrator |
| `tiktok-viral` | **KEEP** | Bucket C, viral strategy/format guidance (different from production pipelines) |
| `veo-flow` | **KEEP** | Bucket C, AI video generation source |
| `video-editing-studio` | **MERGE** | Absorb `video-use` (or vice versa) — they're the same orchestrator |
| `video-factory` | **KEEP** | Bucket C, master property-video orchestrator |
| `video-use` | **MERGE** | → into `video-editing-studio` (same orchestrator) |
| `website-builder` | **KEEP** | Bucket A, Service 5 client websites |
| `youtube-long-form` | **KEEP** | Bucket C, 5–10 min YouTube essays for @JegoDigitalchannel |
| `youtube-talking-tutorial` | **KEEP** | Bucket C, PiP avatar tutorials — different from long-form |
| `youtube-thumbnail` | **KEEP** | Bucket C, dedicated thumbnail design (CTR-critical) |

### Anthropic generic skills (kill candidates)

| Skill | Verdict | Justification |
|---|---|---|
| `algorithmic-art` | **KILL** | ORPHANED — zero JegoDigital use |
| `canvas-design` | **KILL** | Replaced by `canva-jegodigital` |
| `consolidate-memory` | **KEEP** | Used for memory hygiene |
| `data-context-extractor` | **KILL** | Generic data warehouse — N/A |
| `doc-coauthoring` | **KILL** | ORPHANED — zero use |
| `docx` | **KEEP** | Word docs occasional (CV, proposal exports) |
| `mcp-builder` | **KILL** | ORPHANED — only useful when building MCPs |
| `pdf` | **KEEP** | PDFs occasional |
| `pptx` | **KILL** | ORPHANED — zero use |
| `schedule` | **KEEP** | Used today (jegodigital-campaign-pulse) |
| `setup-cowork` | **KILL** | ORPHANED — first-time setup only, done |
| `skill-creator` | **KEEP** | Used today (created 2 skills) |
| `theme-factory` | **KILL** | ORPHANED — JegoDigital brand kit handles theming |
| `web-artifacts-builder` | **KILL** | ORPHANED — zero use |
| `xlsx` | **KEEP** | Spreadsheets occasional |

### Plugin bundles (uninstall recommendation)

| Plugin | Skills | Verdict | Justification |
|---|---|---|---|
| `data:*` | 11 | **KILL (uninstall plugin)** | Generic — `seo-engine` covers our analysis needs |
| `design:*` | 7 | **KILL (uninstall plugin)** | Generic — `canva-jegodigital` covers ours |
| `engineering:*` | 9 | **KILL (uninstall plugin)** | Generic — DEPLOY.md + GitHub Actions covers ours |
| `finance:*` | 9 | **KILL (uninstall plugin)** | Generic accounting — N/A solo operator |
| `marketing:*` | 8 | **KILL (uninstall plugin)** | Generic — JegoDigital-specific skills cover ours |
| `product-management:*` | 9 | **KILL (uninstall plugin)** | Generic PM — N/A solo operator |
| `sales:*` | 9 | **KILL (uninstall plugin)** | Generic — Trojan Horse + cold-email-copywriting cover ours |
| `productivity:*` | 4 | **KILL (uninstall plugin)** | Generic — TASKS.md + NEXT_STEP.md cover ours |
| `cowork-plugin-management:*` | 2 | **KILL (uninstall plugin)** | Meta — only when building Cowork plugins |

---

## Estimated token savings

| Category | Skills affected | Estimated tokens (frontmatter + load tax) |
|---|---|---|
| JegoDigital KILL (`seo-aeo-audit`, `hyperframes`) | 2 | ~3,500 tokens |
| JegoDigital MERGE (4 → 2: video-use, jegodigital-carousels, jegodigital-instagram-stories, flamingo-tiktok-publisher) | 4 → consolidated | ~5,000 tokens |
| Anthropic generic KILL (8) | 8 | ~6,000 tokens |
| **Plugin-bundle uninstall (~70 skills)** | ~70 | **~50,000 tokens** |
| **Total estimated savings** | **~84 skills affected** | **~64,500 tokens / session** |

That's ~64K tokens of context window reclaimed every single session. Translates to faster latency (less to load) AND clearer routing (fewer false-positive skill invocations like accidentally calling `marketing:performance-report` when we want JegoDigital `client-reporting`).

---

## Step 4 — STOP. Awaiting Alex's approval.

**No skill has been deleted. No plugin uninstalled. No code changed.**

The next step (Step 5: surgical cleanup) only fires after explicit approval. Recommended response format:

- ✅ Approve all Kill/Merge as-listed
- ✏️ Save specific items from chopping block: list them
- 🛑 Halt — discuss specific items first

If you approve, Step 5 will:
1. Permanently uninstall the 9 plugin bundles (massive win)
2. Delete the 2 deprecated JegoDigital skills (`seo-aeo-audit`, `hyperframes`) by removing them from the JegoDigital plugin
3. Delete the 8 Anthropic ORPHANED skills (or uninstall the plugins they live in)
4. Refactor the 4 MERGE candidates into 2 consolidated skills
5. Update CLAUDE.md, PLAYBOOKS.md, and DEPRECATED.md
6. Log token-savings win in NEXT_STEP.md

**Open questions for you:**
1. Are any of the plugin bundles secretly used by automation I'm not aware of? (e.g., GitHub Actions calling `engineering:deploy-checklist`?)
2. Do you want `flamingo-tiktok-publisher` generalized to `tiktok-publisher` (any client) or fully killed?
3. Should we keep `setup-cowork` for when new team members join, or is it truly one-and-done?
