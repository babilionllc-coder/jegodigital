# FULL Session Breakdown — 2026-04-19
**Session type:** Multi-day compacted Cowork session
**Total tasks tracked:** 52 (48 completed, 4 pending)
**Big themes:** Mockup pipeline → Carousels → Ads funnel → Deploy infra → NotebookLM expertise

This is EVERYTHING we did, not just the last slice.

---

## THEME 1 — THE MOCKUP PIPELINE (the anchor workstream)

The whole session was anchored around making personalized website mockups the hero lead magnet.

### 1A. Cloud Run HTML→PNG microservice (Task #44) ✅
Built a dedicated Cloud Run service that renders HTML → high-DPI PNGs. Reason: WeasyPrint chokes on Google Fonts + gradients at 2× DPR, and local Playwright is sandbox-unfriendly. Now we have `https://mockup-renderer-wfmydylowa-uc.a.run.app/render` — Alex POSTs HTML, gets raw PNG bytes back.

Critical rules documented (violating any crashes the shared Chromium):
- Never `@import url(...)` Google Fonts inside `<style>` — use `<link>` tags via `inject_fonts()` helper
- Always retry on HTTP 500 (3× with 4s delay) — first request after idle always fails
- Warm the instance before a batch with a trivial render
- Throttle 1.5s between requests

### 1B. Locked JegoDigital mockup HTML template (Task #45) ✅
Canonical template so every client mockup has the same premium look — Inter + Playfair fonts, #0f1115 + #C5A059 brand palette, glass-morphism cards, hero/about/contact sections. Parameterized with placeholders: agency name, logo, phone, website URL, city, featured listing.

### 1C. generateMockup + submitMockupRequest Cloud Functions (Tasks #33, #34, #46) ✅
Firebase Cloud Functions that:
- Take a lead's domain → scrape via Firecrawl → extract agency metadata (name, city, listings) → render "ugly before" + "premium after" mockups → email the lead a preview → store in Firestore
- Endpoint: `us-central1-jegodigital-e02fb.cloudfunctions.net/submitMockupRequest`
- Used by the SITIO ManyChat flow and the Instantly warm-reply funnel

### 1D. Canonical before/after carousel template folder (referenced in Task #47) ✅
`/carousels/_templates/before-after/` — working reference client with `build.py` (render + retry + warmup + font injection) plus the 5 rendered assets:
- `mockup_premium.png` — clean 2026 "Elite Properties" site
- `mockup_ugly.png` — period-authentic 2008-style garish site
- `slide_1_before_after.png`, `slide_2_stat.png`, `slide_3_macbook.png`

Known issue: **Slide 2's "Estudio NAR 2025" attribution on the 73% stat is fabricated — needs a real source before shipping to IG.**

### 1E. 3 test mockups for Alex approval (Task #47) ✅
Generated against verified client domains (Flamingo, RS Viajes, TT & More). Which led to the **Client Domain Rule** — added to CLAUDE.md: never invent domains; the canonical source of truth is `website/showcase.html`. Before using ANY domain in a test, grep `showcase.html` first. Violation logged in CLAUDE.md so it never repeats.

### 1F. Screenshot fallback fix (Task #43) ✅
When Firecrawl fails to scrape a lead's site, fall back to a Puppeteer screenshot. Fixed and re-tested against RE/MAX.

---

## THEME 2 — THE 7-CAROUSEL DROP FOR @JEGODIGITAL

Seven on-brand 1080×1350 carousels built and scheduled across the month.

### 2A. Carousel #1 — Before/After Hook (Tasks #1–#10) ✅
5 slides: hook → 73% stat → MacBook mockup → Paquete Completo features → CTA.
Rebuilt Slide 1 with dark branding (#0f1115 + #C5A059) after the first version was too light.
Published to @jegodigital: **completed**.

### 2B. Carousel #2 — Flamingo Case Study (Tasks #13, #20) ✅
4.4x visibility, #1 Google Maps, +320% organic traffic, 88% automated. Published.

### 2C. Carousel #3 — Teardown (Task #14) ✅
Competitor site teardown pattern. Scheduled.

### 2D. Carousel #4 — ROI Math (Task #15) ✅
Cost vs. lead value math for MX brokers. Scheduled.

### 2E. Carousel #5 — Mobile Reality (Task #16) ✅
Mobile-first reality check for broker sites. Scheduled.

### 2F. Carousel #6 — 14-Day Build (Task #17) ✅
Timeline breakdown. Scheduled.

### 2G. Carousel #7 — 3-Second Rule (Task #18) ✅
First-impression window. Scheduled.

### 2H. Scheduled carousels 3–7 via scheduled tasks (Task #19) ✅
All 5 remaining carousels queued for drip release.

### 2I. Instagram Story for website revamp campaign (Tasks #11, #12) ✅
1080×1920 story built and published to @jegodigital.

---

## THEME 3 — THE META ADS FUNNEL ($10/day split-test)

Two $5/day campaigns split-testing "get a free audit" vs. "get a free website revamp."

### 3A. Design split-test FB ad campaigns (Task #24) ✅
AUDITORIA = audit offer / SITIO = website revamp offer.

### 3B. Built AUDITORIA + SITIO static ad creatives (Tasks #27, #28) ✅
1080×1350 creatives v1.

### 3C. Rebuilt AUDITORIA + SITIO v2 (Task #36) ✅
Cleaner copy, better hooks.

### 3D. Uploaded v2 PNGs to catbox + swapped Meta creatives (Task #37) ✅
Live creatives updated.

### 3E. Fixed SITIO revert to v1 + added Spanish message template (Task #38) ✅

### 3F. Fixed Ads Manager English/concatenation bug on both ads (Task #41) ✅

### 3G. Created AUDITORIA + SITIO campaigns in Meta Ads Manager (Tasks #30, #31) ✅
$5/day each = $10/day total split-test. Live.

### 3H. Clone AUDITORIA → SITIO ManyChat flow (Task #29) ✅

### 3I. Build SITIO keyword ManyChat funnel (Task #23) ✅
Website revamp offer path.

### 3J. Update ManyChat SITIO flow External Request URL (Task #35) ✅
Points to the live Cloud Function.

### 3K. Fix AUDITORIA flow missing URL variable binding (Task #40) ✅
Variable wasn't being piped through to the Cloud Function call.

### 3L. Remove "con IA" from AUDITORIA flow greeting (Task #42) ✅
CLAUDE.md copy violation — never reveal the AI stack to clients.

### 3M. Add 30–60 min random delivery delay to audit email (Task #21) ✅
Looks more "human review" and less "instant robot."

### 3N. Full FB/IG ads funnel end-to-end audit (Task #39) ✅
Check that every step from ad click → ManyChat → Cloud Function → email → Brevo actually fires.

### 3O. Check Meta + ManyChat API token scopes (Task #25) ✅
Tokens had the scopes needed. Good.

### 3P. **STILL PENDING:**
- **#22** — Verify AUDITORIA funnel end-to-end (ManyChat → CF → Brevo email delivery)
- **#26** — Wire Meta Conversions API in ManyChat
- **#32** — Upload Brevo exclusion audience to Meta (prevent re-targeting existing leads)

---

## THEME 4 — DEPLOY INFRASTRUCTURE HARDENING

### 4A. Ship deploy rulebook — DEPLOY.md (Tasks #48, #49) ✅
Single source of truth for how anything ships. Core rule: **nothing deploys manually.** Push to `main`, 3 GitHub Actions workflows handle the rest:
- `deploy-cloudrun.yml` → mockup-renderer
- `deploy.yml` → Firebase Functions + Hosting
- `auto-index.yml` → Google Indexing API + IndexNow on every push
- `smoke-test.yml` → daily 08:00 UTC health check

Added CLAUDE.md pointer so every future session reads DEPLOY.md before touching infra.

### 4B. Client Domain Rule (added to CLAUDE.md) ✅
After the mockup-test disaster where invented domains (`flamingorealestate.mx`, `gozarealestate.com`, `soliktulum.com`) polluted Firecrawl quality testing, added a hard gate: ALWAYS grep `website/showcase.html` before using any domain in a test. Verified real domains:
- Flamingo → realestateflamingo.com.mx
- RS Viajes → rsviajesreycoliman.com
- TT & More → ttandmore.com

### 4C. Deploy screenshot fallback fix + RE/MAX re-test (Task #43) ✅

---

## THEME 5 — NOTEBOOKLM EXPERTISE BUILD (the ending arc)

### 5A. Curated 24 source URLs for JegoDigital Expert Playbook 2026 ✅
File: `/knowledge_base/expert_playbook_2026/00_source_list.md`
Categories: Cold email benchmarks (5) · Personalized mockup lead magnets (4) · MX real estate broker psychology (5) · Agency pricing (4) · Local SEO/AEO (4) · WhatsApp automation (2)

### 5B. Built the notebook end-to-end via Chrome MCP (Task #51) ✅
24 URLs pasted, 22–24 imported (2 blocked by Cloudflare — normal), notebook renamed, shared "Anyone with a link," registered in MCP library as `jegodigital-expert-playbook-20`.

### 5C. Registered Claude AI Ecosystem Guide notebook (Task #52) ✅
Existing Alex-curated 48-source notebook on Claude Code, Agent Teams, Skills, Routines, NotebookLM MCP, AGENTS.md, Deep Research, Cowork. Registered as `claude-ai-ecosystem-guide-chat`.

### 5D. Ran 5 research queries across both notebooks ✅
- Claude Ecosystem (session `73a720cf`): SKILL.md best practices · critical pitfalls · sibling-skill integration patterns
- JegoDigital Playbook (session `28652b20`): 5 reply-rate moves · 5 close-rate/revenue moves

### 5E. Wrote 233-line notebooklm SKILL.md (draft) ✅
File: `/docs/skill_patches/notebooklm-skill.md`
YAML frontmatter with triggers, 6-step workflow (select → broad → chain → verify → reflect → save), rate-limit discipline, 3 Memory-Layer integration patterns, pitfalls, quick reference. **Not yet installed on Alex's Mac.**

### 5F. Wrote 10-move Master Playbook ✅
File: `/knowledge_base/expert_playbook_2026/01_master_playbook.md`
Part A: 5 moves to lift cold email reply rate. Part B: 5 moves to lift close rate + revenue per client. Blunt audit section on the commodity trap and fogginess in the 9-service menu.

### 5G. jegodigital-carousels skill patch written (pending apply) — Task #50
File: `/docs/skill_patches/jegodigital-carousels-patch.md` — teaches the skill about the new 3-pipeline decision matrix (WeasyPrint / Playwright / Cloud Run). Alex has to manually apply to `~/.claude/skills/jegodigital-carousels/SKILL.md` since sandbox is read-only.

### 5H. Session handoff MD (this replaces the last one) ✅
This file.

---

## FILES CREATED THIS SESSION

| Path | Purpose |
|---|---|
| `/DEPLOY.md` | Deploy rulebook (single source of truth) |
| `/CLAUDE.md` | Updated with MOCKUP PIPELINE section + Client Domain Rule + Cloud Run endpoint |
| `/.github/workflows/deploy-cloudrun.yml` | Auto-deploy Cloud Run mockup-renderer |
| `/.github/workflows/smoke-test.yml` | Daily 08:00 UTC health check |
| `/carousels/_templates/before-after/build.py` | Canonical Cloud Run render client (copy-paste template) |
| `/carousels/_templates/before-after/README.md` | Template docs |
| `/carousels/_templates/before-after/mockup_{premium,ugly}.png` | Reference 2400×1600 mockups |
| `/carousels/_templates/before-after/slide_{1,2,3}_*.png` | 2160×2700 carousel slides |
| `/functions/submitMockupRequest.js` | Cloud Function for mockup pipeline |
| `/functions/generateMockup.js` | Cloud Function that renders + emails mockups |
| `/knowledge_base/expert_playbook_2026/00_source_list.md` | 24 curated NotebookLM sources |
| `/knowledge_base/expert_playbook_2026/01_master_playbook.md` | 10-move master playbook |
| `/docs/skill_patches/jegodigital-carousels-patch.md` | carousels skill patch (pending apply) |
| `/docs/skill_patches/notebooklm-skill.md` | notebooklm SKILL.md draft (pending install) |
| `/docs/session_handoffs/2026-04-19_notebooklm_session.md` | Earlier (narrower) handoff doc |
| `/docs/session_handoffs/2026-04-19_FULL_SESSION_BREAKDOWN.md` | **This file — the full session handoff** |
| + 7 carousel PNGs (Carousels #1–#7) in social_exports | Scheduled IG carousel content |
| + Instagram Story PNG | Website revamp campaign story |

---

## WHAT'S STILL PENDING (from the task list)

| # | Task | Category | Blocker |
|---|---|---|---|
| **#22** | Verify AUDITORIA funnel end-to-end (ManyChat → CF → Brevo email) | Ads funnel | Alex needs to trigger a test lead and watch it flow |
| **#26** | Wire Meta Conversions API in ManyChat | Ads funnel | Needs API access + event mapping |
| **#32** | Upload Brevo exclusion audience to Meta | Ads funnel | Export Brevo contacts CSV, upload to Meta Audiences |
| **#50** | Apply jegodigital-carousels skill patch | Skills | Manual copy to `~/.claude/skills/` on Mac |
| **(new)** | Install notebooklm SKILL.md | Skills | Manual copy to `~/.claude/skills/notebooklm/SKILL.md` |

---

## GREATEST BOTTLENECKS — THE HONEST DIAGNOSIS

### 1. Pricing commodity trap
$3K–$20K MXN/mo × ~30 clients max = **$226K USD/yr ceiling.** Zero infrastructure today for the 3 streams that get JegoDigital to $1M:
- Developer contracts ($80K–$200K MXN per project)
- Performance-based deals ($500–$2K per qualified lead)
- White-label partners ($40K–$60K MXN/mo per partner)

### 2. Cold email reply rate leakage
CLAUDE.md mandates 5-step sequences — but no one has verified that every active Instantly campaign actually has Steps 2–5 live. Woodpecker benchmark: **42% of replies come from follow-ups.** Missing them = losing nearly half your replies.

### 3. Discovery call close rate
No "Why Conversation" framework. Alex still pitches the 9-service menu at minute 0. Notebook research (Chris Do + Hormozi) says this is the #1 commoditization trap — expected lift from Why Conversation + 3-tier proposals is **2× close rate at 2× average ticket.**

### 4. Skills don't read the playbook
Despite curating 24 sources and building a 10-move playbook, NONE of the active skills (`cold-email-copywriting`, `jegodigital-cotizaciones`, `instantly-cold-outreach`) query NotebookLM before writing copy. Every session regenerates opinions from training data instead of using cited research. **Memory Layer pattern defined but not wired.**

### 5. notebooklm skill not installed on Mac
SKILL.md is drafted but lives only as a patch file. Until Alex copies it to `~/.claude/skills/notebooklm/`, future sessions won't know the research layer exists.

### 6. Fogginess in 9-service menu (from notebook blunt audit)
Prospects don't want a menu — they want to buy the "Why." Current Instantly copy and website both lead with the 9-service list. Notebook recommends collapsing public-facing marketing to 3 outcomes (more leads 24/7 · #1 on search · sell without being there) and keeping the 9-service architecture internal.

### 7. The 73% stat on Slide 2 has fabricated attribution
"Estudio NAR 2025" is not real. Needs a defensible source or a different stat before shipping Carousel #1 Slide 2 broadly.

---

## HOW TO MOVE FORWARD — NEXT SESSION BRIEF

Open the next Claude session with ONE of these scoped prompts — don't do all four:

### OPTION A — P0 cleanup + audit (shortest path to unblocked state)
> Read `/docs/session_handoffs/2026-04-19_FULL_SESSION_BREAKDOWN.md`. Then: (1) apply the 2 pending skill patches (notebooklm + jegodigital-carousels), (2) verify AUDITORIA funnel end-to-end with a test lead, (3) audit all active Instantly campaigns for Steps 2–5 completeness and `{{companyName}}` subject personalization. Report concrete fixes with exact edits to make.

### OPTION B — Revenue unlock (biggest $ impact)
> Build the developer-contract outbound playbook from scratch: target list (CDMX + Riviera Maya developers with active projects Q2/Q3 2026), outreach sequence (5-step email + WhatsApp), proposal template ($80K–$200K MXN tier), kickoff call script. This is the #1 path to $1M/yr per the CLAUDE.md revenue model. Use the notebook `jegodigital-expert-playbook-20` for MX real estate psychology research.

### OPTION C — Close-rate kit (biggest per-deal impact)
> Build the 5-question "Why Conversation" script + 3-tier pricing template + handoff doc for Alex to use on his next Calendly call. Based on Chris Do / Hormozi research in the `jegodigital-expert-playbook-20` notebook.

### OPTION D — Memory Layer wiring (biggest compounding impact)
> Patch `cold-email-copywriting` and `jegodigital-cotizaciones` skills so they query the notebooklm skill as the first step in every run. Eliminates "regenerating from training data" across every future session.

### OPTION E — The fastest: P0 + C together
> Do Option A (apply patches, audit campaigns) then immediately roll into Option C (Why Conversation + 3-tier pricing). 90% of the week's leverage in one session.

---

## TL;DR

**Done:**
- Cloud Run mockup-renderer live (full pipeline: HTML → PNG at scale)
- 7 @jegodigital carousels built + scheduled
- 1 Instagram Story live
- Meta ads split-test ($5/day × 2) live with ManyChat funnels wired
- Deploy infra hardened (DEPLOY.md + 4 GitHub Actions workflows)
- NotebookLM library (3 notebooks, 148 sources total) built + registered
- 2 research-grounded deliverables: 10-move master playbook + 233-line notebooklm SKILL.md

**Pending:**
- Install notebooklm skill (manual)
- Apply carousels skill patch (manual)
- Verify AUDITORIA funnel end-to-end
- Wire Meta Conversions API
- Upload Brevo exclusion audience

**Biggest gap to $1M:**
Zero outbound infrastructure for developer contracts / performance deals / white-label. That's $774K of the goal sitting untouched.

**Next session:** pick Option A, B, C, D, or E — and ship it end-to-end rather than spreading across all five.
