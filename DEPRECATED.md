# JegoDigital — Deprecated Tools & Dead-End Approaches

> **Purpose:** Permanent record of tools, platforms, campaigns, and integration approaches that have been deprecated, killed, or proven to fail. Grep this file BEFORE trying something that looks similar to an old approach.
> **Last updated:** 2026-05-05 (added ManyChat funnel deprecation)
> **Owner:** Claude + Alex — append new deprecations as they happen; never delete entries.

---

## 🛑 HARD RULE — do not use anything listed here without written approval from Alex

Every entry below was tried and failed or was intentionally retired. Re-trying any of them without reviewing the "why it failed" note is a HARD RULE #10 violation. If a new need makes one of these feel attractive again — write a justification for Alex first, get his approval, then maybe.

---

## ❌ DEPRECATED TOOLS

### ManyChat funnel (Sofia WhatsApp + IG)
- **Deprecated:** 2026-05-05
- **Why:** Architecture moved to direct webhooks. Sofia now runs on TWO live Cloud Function paths — Twilio (`whatsappAIResponder.js` for Twilio WA inbound, multi-tenant client routing via `wa_clients/{toNumber}`) and Meta WhatsApp Cloud API (`whatsappCloudInbound.js` for `+1 978 396 7234`, PNID `1044375245434120`, WABA `1520533496454283`). Both call Gemini 2.5 Flash with Firestore-backed multi-tenant prompts. ManyChat became a redundant flow-builder layer.
- **Trigger event:** Lead Supply Recovery agent (2026-05-05) caught Claude proposing to "build the missing ManyChat webhook mirror" because CLAUDE.md still described a ManyChat funnel. Architecture had drifted from docs for weeks; this cleanup pass aligned them.
- **Replaced by:**
  - Twilio path → `website/functions/whatsappAIResponder.js` writes `wa_conversations/{toNumber}_{leadPhone}`
  - Meta WA Cloud path → `website/functions/whatsappCloudInbound.js` writes `wa_cloud_conversations/{from}`
  - Audit cron → `website/functions/sofiaConversationAudit.js` UNIONs both collections nightly 23:00 CDMX (commit `dcd68b73`)
- **Dormant artifacts (do NOT resurrect or call):**
  - `MANYCHAT_API_KEY` GH Secret (ACCESS.md row 26 — kept for now, remove at next rotation)
  - `tools/manychat-mcp/` folder (kept on disk, not invoked)
  - `manychat-sofia` skill description in `/var/folders/.../skills/manychat-sofia/SKILL.md` (skill is read-only at the OS level — see `skills_patches/manychat-sofia_v2.md` for the live deprecation patch)
  - ManyChat blocks inside `calendlyWebhook.js`, `calendly.js`, `eveningOpsReport.js`, `sofiaConversationAudit.js` (legacy code paths — Lead Supply Recovery agent already corrected `sofiaConversationAudit.js` per the comment block at line 53; remaining files have dead branches that never fire)
- **Rule:** when ANY future agent proposes "ManyChat webhook mirror", "ManyChat flow update", "ManyChat custom field", or any new code that imports the ManyChat API, BLOCK and point them here. Real Sofia architecture = Twilio + Meta WA Cloud API only.

### Postiz (social media scheduler)
- **Deprecated:** 2026-04-12
- **Why:** Subscription expired, not renewing
- **Replaced by:** Instagram Graph API directly (see `instagram-publisher` skill + CLAUDE.md §Instagram Publishing)
- **Dead scripts (do not resurrect):** `schedule_postiz_*.cjs` in `/website/tools/`
- **Rule:** NEVER reference Postiz in any workflow, script, or automation

### n8n Public API
- **Deprecated:** 2026-04-07
- **Why:** Free trial blocks API access. `/settings/api` page says "Upgrade to use API"
- **Attempted workaround:** Chrome MCP to read token from node UI — security layer returns `[BLOCKED: Base64 encoded data]`
- **Replaced by:** Direct Graph API calls for IG publishing, Cloud Functions for everything else

### Meta Business Suite via Chrome MCP
- **Deprecated:** 2026-04-07
- **Why:** Upload flow opens native macOS file picker, unreachable from browser automation
- **Replaced by:** Graph API carousel/Reels recipe in CLAUDE.md §Instagram Publishing

### instagram.com web login
- **Deprecated:** 2026-04-07
- **Why:** Password rules block programmatic login (2FA + bot detection)
- **Replaced by:** Long-lived `IG_GRAPH_TOKEN` in GitHub Secrets (see ACCESS.md row 25)

### Firebase Storage as image host for IG Graph API
- **Deprecated:** 2026-04-07
- **Why:** Bucket serves 404 for uploaded images when fetched by graph.facebook.com
- **Replaced by:** catbox.moe public hosting (see IG Publishing recipe)

### Apollo.io + Clay.com (lead prospecting)
- **Deprecated:** never enabled
- **Why:** JegoDigital is 100% DIY stack policy — we do not pay for middleware that wraps free data
- **Replaced by:** SerpAPI + Hunter.io + Firecrawl + DataForSEO + PSI (see `lead-finder` skill)

### OpenClaw for cold outreach
- **Deprecated:** April 2026
- **Why:** Deliverability + compliance concerns, switched to Instantly.ai for everything outbound
- **Current role:** OpenClaw still handles social media automation, Instagram bot, Calendly webhook, Telegram notifications — does NOT do outreach

---

## ❌ DEPRECATED CAMPAIGNS

### Redes Sociales cold-email campaign
- **Deleted:** April 2026
- **Why:** Conversion was zero after 500+ sends, copy hook too soft for real-estate decision-makers
- **Rule:** Do not recreate. Do not reference. If a new social-media-focused campaign is needed, use the "Gestión de Redes Sociales (Service 4)" angle from a different hook entirely.

### World Cup 2026 campaign
- **Kill date:** 2026-07-01 (scheduled)
- **Why:** Topical — only relevant before/during the June 2026 World Cup in Mexico
- **Action:** Delete on July 1, 2026. Reuse the list for Trojan Horse retargeting.

---

## ❌ DEAD SYNTAX PATTERNS

### `[bracket placeholders]` in Instantly
- **Banned:** 2026-04-18
- **Why:** Instantly does NOT interpret square brackets. They send literally — `[your city]`, `[your name]`, `[your company]` all render verbatim, destroying trust.
- **Rule:** Only use `{{instantlyVariable}}` syntax OR rewrite generically ("your area", "your market")
- **Disaster:** 2026-04-18 US-Hispanic-Bilingual-Audit Steps 1 & 4 caught with `[your city]` before activation by Alex.

### `Hola {{firstName}}` on unverified lists
- **Banned:** 2026-04-15
- **Why:** If list hasn't been firstName-audited, the variable renders blank → "Hola ," → looks spam-tier
- **Rule:** Default is `Hola,` for any scraped/unverified list. Only use `Hola {{firstName}},` on lists with ≥99% verified firstName population (e.g. Explorium/Hunter-enriched lists)
- **Disaster:** 2026-04-15 "Hola allá" incident — 31 leads shipped with fake firstName "allá", 419 stranded in wrong campaign. Reply rate dropped to 0.46%.

### AI-generated graphics in blog posts
- **Banned:** 2026-04-21
- **Why:** 3D neon renders, fake dashboard mockups, luxury-condo AI art → amateur tell, zero trust
- **Rule:** Only real screenshots from whitelist (client SERPs, PageSpeed, WhatsApp/ManyChat, portfolio, jegodigital.com itself). See CLAUDE.md §NO-AI-IMAGES HARD RULE.

### Unsplash / Pexels stock photos in blog posts
- **Banned:** 2026-04-11
- **Why:** Generic stock = generic post = amateur. Real estate buyers can spot it.
- **Replaced by:** Real screenshots only (same whitelist as above)

---

## ❌ DEAD DEPLOY PATHS

### Manual `gcloud run deploy`
- **Banned:** 2026-04-01
- **Why:** Skips secret injection, breaks reproducibility
- **Replaced by:** GitHub Actions `.github/workflows/deploy-cloudrun.yml` auto-deploys on push to main

### Manual `firebase deploy`
- **Banned:** 2026-04-01
- **Why:** Same — skips secret injection, uses local creds that break in CI
- **Replaced by:** GitHub Actions `.github/workflows/deploy.yml`

### Pasting service account JSON in chat
- **Banned:** forever
- **Why:** Secret exposure + stored in conversation logs
- **Replaced by:** GitHub Secrets only (see DEPLOY.md + ACCESS.md)

### 6-function Firebase deploy with untracked require()
- **Banned:** 2026-04-21
- **Why:** Missing `require('./module')` kills the WHOLE Firebase deploy silently
- **Rule:** Always `node --check` every `.js` before push, commit the required module file in the SAME Data API tree (HARD RULE #6)
- **Disaster:** Commit `c48fc37` silently broke 6 functions; fixed by `e5ba154`

---

## ❌ DEAD LEAD-LIST INVENTIONS

### Invented client domains
- **Banned:** 2026-04-18
- **Why:** Company name ≠ domain. Tested against `flamingorealestate.mx` (wrong), real is `realestateflamingo.com.mx`.
- **Rule:** Canonical source = `website/showcase.html`. Grep before any URL test. See CLAUDE.md §CLIENT DOMAIN RULE.

---

## ❌ DEAD WORKFLOWS

### Demo-video-first cold email
- **Deprecated:** 2026-04-19
- **Why:** Video demos converted ~0.3% to booked calls. Generic, not actionable.
- **Replaced by:** Free audit first (45-min delivery, tangible value, one-click pre-filled URL)
- **Current:** AI reply agent always offers `/auditoria-gratis?url={{website}}&...` link first; demo videos only if lead specifically asks

---

## 🔄 HOW TO ADD A NEW DEPRECATION

When a tool/campaign/pattern fails or is killed, append here with this shape:

```markdown
### <Name>
- **Deprecated:** <YYYY-MM-DD>
- **Why:** <root cause, 1-2 sentences>
- **Replaced by:** <the working alternative>
- **Rule:** <what future sessions must NOT do>
- **Disaster (if applicable):** <reference to DISASTER_LOG.md entry or commit>
```

Then remove any lingering references to it from CLAUDE.md, skills, and scripts.

---

*end of DEPRECATED.md — always append, never delete entries*

---

## 2026-04-26 PM — Revenue-First Skill Audit kill list

Killed ~52 skills that don't directly serve the $1M/yr revenue goal. ~60% reduction in context-loaded skill descriptions = faster Claude, fewer tokens burned per request.

### KILLED — uninstall these plugins entirely (5 plugins, ~33 skills total)

| Plugin | Skills killed | Why dead weight |
|---|---|---|
| `product-management` | brainstorm, sprint-planning, roadmap-update, write-spec, competitive-brief, metrics-review, stakeholder-update, synthesize-research, product-brainstorming (8) | 1-person agency, no PM workflow |
| `finance` | financial-statements, journal-entry, journal-entry-prep, reconciliation, variance-analysis, sox-testing, audit-support, close-management (8) | Cash-basis 1-person ops, no SOX/GAAP |
| `data` | analyze, write-query, sql-queries, build-dashboard, create-viz, data-visualization, explore-data, statistical-analysis, validate-data, data-context-extractor (9) | `client-reporting` + `seo-engine` cover all real data work |
| `design` | design-critique, design-handoff, design-system, accessibility-review, user-research, research-synthesis, ux-copy (7) | `canva-jegodigital` + `cotizaciones` are the JegoDigital-locked design path |
| `marketing` | brand-review, campaign-plan, competitive-brief, content-creation, draft-content, email-sequence, performance-report, seo-audit (8) | Every flow has a JegoDigital-specific replacement (instantly, brevo, instagram-publisher, etc.) |
| `cowork-plugin-management` | create-cowork-plugin, cowork-plugin-customizer (2) | One-time setup, already done |

### KILLED selectively from kept plugins

**`engineering` plugin — keep 3, ignore 7:**
- KEEP: `debug`, `code-review`, `deploy-checklist`
- IGNORE: architecture, standup, tech-debt, testing-strategy, incident-response, documentation, system-design

**`sales` plugin — keep 2, ignore 7:**
- KEEP: `account-research`, `call-prep` (used before Calendly calls — direct Bucket A close-rate impact)
- IGNORE: pipeline-review, forecast, daily-briefing, call-summary, draft-outreach, competitive-intelligence, create-an-asset

### KILLED from anthropic-skills bundle (orphan generics — 8 skills)

DO NOT INVOKE these even though they're still loaded — listed here so any Claude session greps DEPRECATED before using them:
- `algorithmic-art` — p5.js generative art, never tied to a JegoDigital deliverable
- `canvas-design` — generic PIL/PDF poster art, covered by canva-jegodigital + cotizaciones
- `web-artifacts-builder` — Claude.ai HTML artifacts, internal Claude tool
- `mcp-builder` — building MCPs not on the $1M roadmap
- `setup-cowork` — one-time onboarding, already done
- `doc-coauthoring` — generic, covered by skill-creator + manual writing
- `theme-factory` — generic theme styling, never used
- `pptx` — JegoDigital uses PDF cotizaciones, not PowerPoint

### MERGED (refactor into the parent skill)

| From | Into | Notes |
|---|---|---|
| `seo-aeo-audit` | `seo-engine` | Already DEPRECATED per `docs/gates/seo-skills-routing.md`. seo-engine delegates to it as a sub-routine |
| `jegodigital-carousels` | `canva-jegodigital` | Subset of canva. Already noted in canva description |
| `video-use` | `video-editing-studio` | Already orchestrated by video-editing-studio per its description |

### 2026-04-26 PM EVENING — Addendum (post-audit-funnel session)

After the 80-lead Miami campaign + audit-funnel fixes shipped, Alex confirmed two more changes to the kill list (commit `67d29576`+ context):

**Additional KILL:**
- `flamingo-tiktok-publisher` — Alex confirmed unused. Was in earlier KEPT list (Bucket B). The Flamingo Real Estate TikTok publishing pipeline is no longer active. If a generic `tiktok-publisher` is needed in future, build one new (don't resurrect the Flamingo-specific one).

**Additional KEPT (new skills shipped today):**
- `audit-funnel` (Bucket C) — owns `/auditoria-gratis` end-to-end. Today's biggest revenue-lever fix (4.3× cold-reply → Calendly conversion estimated). See `docs/proposed-skills/audit-funnel/SKILL.md`.
- `playwright-prospect-audit` (Bucket B) — per-prospect site rendering for cold-email personalization at scale. Used by Miami campaign. See `docs/proposed-skills/playwright-prospect-audit/SKILL.md`.

**Additional KEPT (Alex saved from chopping block):**
- `hyperframes` — Alex confirmed planned upcoming use (HTML+GSAP audio-reactive video composition). Was on my proposed kill list earlier in the day before he flagged it.

After this addendum, the lean stack drops from 27 → 26 (flamingo gone, audit-funnel + playwright-prospect-audit added, net +1).

### KEPT — the lean revenue-first stack (27 skills)

**Bucket A (close paying clients THIS WEEK):**
client-onboarding · client-reporting · client-site-ops · jegodigital-cotizaciones · video-editing-studio · veo-flow · video-factory · saas-product-tour · sales:account-research · sales:call-prep · calendly-follow-up · manychat-jegodigital

**Bucket B (generate qualified leads):**
instantly-cold-outreach · cold-email-copywriting · lead-finder · linkedin-hiring-intent · cold-calling-ai · instagram-publisher · canva-jegodigital · jegodigital-instagram-stories · flamingo-tiktok-publisher · tiktok-viral · alex-founder-video · youtube-talking-tutorial · youtube-long-form · youtube-thumbnail · remotion-shorts

**Bucket C (raise conversion rate):**
brevo-email-marketing · seo-engine · website-builder

**Cross-cutting infra (always-on):**
elevenlabs-voiceover · hyperframes · pdf · docx · xlsx · skill-creator · consolidate-memory · schedule · engineering:debug · engineering:code-review · engineering:deploy-checklist · productivity:start · productivity:update · productivity:task-management · productivity:memory-management
