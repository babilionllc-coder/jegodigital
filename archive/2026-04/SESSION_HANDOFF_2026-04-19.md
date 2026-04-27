# Session Handoff — April 19, 2026

**Session window:** April 18 evening → April 19 afternoon CST
**Prepared for:** Alex Jego
**Purpose:** Full context transfer so the next Claude session starts at full speed, not zero

---

## TL;DR — What Happened In One Paragraph

Purged 202 enterprise-polluted leads from live campaigns. Shipped `lead_finder_v4_lean.py` (single-file, survives filesystem resyncs). Built & enriched two new draft campaigns — `Audit_Trojan_MX_v1` (11 leads) and `Audit_Trojan_MX_Supersearch_v1` (80 leads) — both with 100% personalization-var coverage and Spanish 5-step sequences approved. Wrote the 2026 cold-email stack audit (overall grade: **C+ / 60 / 100** — data layer is the choke point, not copy). Delivered a 30-day / 90-day playbook with North Star metrics. **Two campaigns are sitting in DRAFT waiting for you to flip them live. Zero numbers have been measured yet — that's the #1 priority next session.**

---

## 1. WHAT SHIPPED (Completed This Session)

### 1.1 Enterprise Blocklist Purge (202 leads deleted)

**Problem:** Active campaigns had 15-18% enterprise pollution — CBRE, JLL, Colliers, Newmark, KW-corporate, Sotheby's-HQ emails that auto-reply and corrupt the AI reply agent.

**Fix:** Built `CORP_DOMAINS_V2` (41 domains including MX master-franchise HQs: `kwmexico.mx`, `cbcmexico.mx`, `am.jll.com`, `mexicosir.com`). Deleted with `delete_with_retry()` (Iron Rule 11 — no `Content-Type` header on DELETE).

| Campaign | Before | After | Purged |
|---|---|---|---|
| Trojan Horse | 835 | 834 | 1 |
| Auditoría Gratis | 1,340 | 1,169 | 171 (12.8%) |
| Campaign F | 167 | 137 | 30 (18%) |
| **Total** | **2,342** | **2,140** | **202** |

**Top domains purged:** cbre.com (42), colliers.com (38), jll.com (29), nmrk.com (24), kwmexico.mx (17), cbcmexico.mx (15), cushwake.com (11), exprealty.com (5), kw.com (5).

### 1.2 Lead Finder v4 (lean, single-file)

**File:** `/mnt/jegodigital/lead_finder_v4_lean.py` — 493 lines, zero external module deps. Survives sandbox resyncs.

**Pipeline flow:**
1. SerpAPI Maps discovery (DataForSEO fallback)
2. Blocklist filter (41 enterprise domains + portals + social/link-in-bio + hotel chains)
3. Hunter domain search → email verify
4. **Owner-title hard gate** (Iron Rule 7 bilingual: dueño, director, CEO, owner, principal, broker of record, etc.)
5. PageSpeed Insights audit (mobile)
6. Score 0-100 with **60-point cutoff**
7. Stream to Google Sheet (`Audit_Trojan_MX_2026-04-18` tab)
8. Upload to Instantly with `skip_if_in_workspace` dedup

**What makes it v4 vs v3.1:**
- Pre-verify hard gates (saves ~30% Hunter verifier credits)
- PageSpeed data feeds `{{pageSpeed}}` and `{{mainIssue}}` merge tags directly
- Google Sheets live stream (not batch dump)
- Supports both SerpAPI and DataForSEO as discovery source

### 1.3 Campaign #1 — `Audit_Trojan_MX_v1`

- **ID:** `e526d5db-ee92-4b0d-9944-49ba47b587af`
- **Status:** 🟡 **DRAFT** (you need to flip to Active)
- **Enrolled:** 11 leads (23 processed; 12 deduped against other campaigns — correct behavior)
- **Cities:** Cancun × Playa del Carmen × Tulum × CDMX × Guadalajara × Monterrey
- **Avg PageSpeed of enrolled:** 45.5 / 100 (strong pain signal for hook)
- **Schedule:** Mon–Fri 09:00–17:00 CST, 60 emails/day
- **Sending pool:** 8 inboxes (aichatsy × 2, jegoaeo × 3, jegoleads × 3)

**Strongest hooks in this batch:**

| PS | Company | Contact | City |
|---:|---|---|---|
| 21 | Misión Obispado | Julio | Monterrey |
| 23 | GDL Propiedades | Omar | Guadalajara |
| 35 | Century 21 Caribbean | Albane | Playa del Carmen |
| 37 | Eproperties Luxury | Adriana | Tulum |
| 54 | Love Tulum Eco Developments | David | Tulum |

### 1.4 Campaign #2 — `Audit_Trojan_MX_Supersearch_v1`

- **ID:** `51074dc9-fce9-4a20-b8a0-4f283ac52177`
- **Status:** 🟡 **DRAFT** (you need to flip to Active)
- **Enrolled:** 80 unique leads (155 enriched → 19 no-email → 136 moved → 56 deduped → 80 final)
- **Variable coverage:** 100% across all 6 vars (firstName, companyName, website, pageSpeed, mainIssue, city)
- **PageSpeed distribution:** 76% of leads below 70/100 — the audit hook lands hard
- **Fake-name rate:** 0/80 (Supersearch LinkedIn data beats Hunter on name quality)

**Key discovery:** Instantly stores custom vars under `payload.*` not `custom_variables.*`. Template renderer reads `{{pageSpeed}}` from `payload.pageSpeed`. First PATCH worked; audit script was looking in the wrong field.

### 1.5 Spanish 5-Step Sequence (approved, loaded in both campaigns)

| # | Day | Subject | Words | Hook |
|---|----|---------|------|-----|
| 1 | 0 | `Auditamos {{website}}` | 48–62 | Personalized audit with their PSI + mainIssue |
| 2 | +4 | `Recordatorio` | 67 | "1/20 agencies pass 85/100" stat |
| 3 | +9 | `Caso real` | 71 | Flamingo 90-day case study |
| 4 | +16 | `¿Error mío?` | 38 | Pattern interrupt / referral ask |
| 5 | +23 | `Último mensaje` | 42 | Breakup — "responde audit" |

**Rules compliance:** No Calendly links in cold emails ✓ · No bracket placeholders ✓ · No URLs in body ✓ · Greeting `Hola {{firstName}},` safe on both lists (Iron Rule 7 verified) ✓ · Subject lines ≤3 words ✓

### 1.6 Google Sheets Live Tracker (live)

**Sheet:** [JegoDigital Lead Pipeline 2026](https://docs.google.com/spreadsheets/d/1uBRDCqz43l0ZI3k5U-msB1-x11kYiQ1FYMmiyVdC6P8)
**Auth:** Firebase service account at `jegodigital-e02fb-a05ae4cb7645.json` (shared with jegoalexdigital@gmail.com)
**Schema:** 22 columns per lead — timestamp, run_id, personalization pack, audit data, score, gate result, Instantly status.

### 1.7 Strategic Research Deliverables

Three companion docs in `/mnt/jegodigital/supersearch_out/`:

- **`MASTER_RECOMMENDATION_2026.md`** — North Star metrics, 30-day punch list, 90-day roadmap, data-layer decision tree
- **`JEGODIGITAL_STACK_AUDIT_2026.md`** — Adversarial 5-axis scorecard (overall 60/100, C+)
- **`COLD_EMAIL_SOURCE_PACK_2026.md`** — 36 curated URLs + 5 Deep Research prompts for your NotebookLM

---

## 2. THE SCORECARD — WHERE WE ACTUALLY ARE (C+, 60/100)

| Axis | Score | Grade | Top gap |
|---|---|---|---|
| ICP & Targeting | 55 | C | Firmographic-only, zero intent/event signals |
| Lead Sourcing Quality | 60 | C+ | Supersearch `pid_free` = shallow; 12% no-email; 41% overlap |
| **Enrichment Depth** | **45** | **D+** | **Only 6 vars — elite uses 15-25 signals** |
| Copy & Sequence | 70 | B− | Spanish copy tight; no real A/B testing |
| Sending Infrastructure | 72 | B | Warmup healthy; **DMARC/SPF/DKIM unknown** |

**Honest read:** Your Spanish copy is fine. What's capping reply rate is personalizing off 6 variables when the 2026 ceiling is 15-25. Fix the data layer — same copy converts 2-3× better.

---

## 3. GREATEST BOTTLENECKS (ranked by blast radius)

### 🔴 Critical — blocks everything

1. **No baseline reply rate measured.** Every "improvement" from here is theater until we know the number. 30-day reply rate per campaign × all 4 active campaigns. 15-minute job with Instantly API.

2. **Deliverability audit never run.** DMARC/SPF/DKIM status on aichatsy.com, jegoaeo.com, jegoleads.com is unknown. One bad week of bounces + 8 inboxes die together. `dig TXT _dmarc.<domain> +short` × 3 domains. 15-minute job.

3. **Two campaigns sitting in DRAFT.** `Audit_Trojan_MX_v1` (11 leads) and `Supersearch_v1` (80 leads). Zero emails have been sent yet. Pre-launch checks done. Flip to Active in Instantly UI or via API.

### 🟠 High — caps ceiling

4. **41% dupe rate** at Supersearch pull time. `skip_owned_leads` dedups at COMPANY level, not EMAIL. Means every new pull burns 40% of Supersearch credits on leads we already own. Fix: pre-pull dedup script against all active-campaign emails (we already have the delete script — invert it to filter).

5. **Enrichment depth is the ceiling.** 6 vars (firstName, companyName, website, pageSpeed, mainIssue, city) vs the 2026 elite playbook's 15-25 signals. Missing: Instagram follower count, active listings count, days since last blog post, Google Business rating, tech stack, recent LinkedIn post, recent hire, competitor ranking for city keyword.

6. **Audit delivery promise is unautomated.** AI reply agent says "audit in 60 min" on positive reply. Pipeline not built. Options: (a) manual for 2 weeks while volume is low, (b) build seo-engine → PDF → Brevo transactional pipeline now.

### 🟡 Medium — should fix in 30 days

7. **Zero A/B testing across copy.** Every lead gets the same 5-step sequence. Need hold-out groups + variant tracking to know what works.

8. **No analytics dashboard.** Reply rate, positive reply rate, bounce, complaint, bookings — all exist in Instantly UI but no weekly rollup. Need Cloud Function → Telegram Monday 09:00 digest.

9. **`pid_free` Supersearch tier = shallow profiles.** Missing tenure, job changes, phone, posts. Paid tier ~$200/mo. Only upgrade if baseline reply rate < 5%.

10. **No Calendly UTM tagging in AI agent replies.** Can't attribute bookings to cold email. One-line fix: append `?utm_source=cold&utm_campaign={{campaignName}}`.

11. **No account tiering.** Every agency gets same sequence — should have Tier 1 (developers, >50 agents) vs Tier 2 (boutique, 5-15 agents) copy.

12. **No event/intent signals.** We target on firmographics only. Missing triggers: "hired marketing manager <90d", "launched new development", "PageSpeed dropped last quarter", "website redesigned".

---

## 4. THE 30-DAY WEEK-1 PUNCH LIST (ORDERED)

Do these in order. Each unlocks the next. **Start here next session.**

### Week 1 — Measure & De-risk

- [ ] **DMARC audit.** `for d in aichatsy.com jegoaeo.com jegoleads.com; do dig TXT _dmarc.$d +short; done` → paste into `deliverability_baseline.md`. Any domain on `p=none` → escalate to `p=quarantine` in 48h.
- [ ] **Baseline reply rate per campaign.** Instantly `/analytics` for 30d × 4 active campaigns → `reply_rate_baseline.md`.
- [ ] **Flip Supersearch campaign to Active.** 80 leads, zero overlap, 100% vars. Pre-launch cleared. Ship it.
- [ ] **Flip Audit_Trojan_MX_v1 to Active** OR roll its 11 leads into Supersearch first (my rec: merge, fewer campaigns = cleaner analytics).
- [ ] **Add UTM to Calendly in AI-agent replies.** One-line fix. Enables attribution.

### Week 2 — Dedup + Infrastructure

- [ ] **Pre-pull dedup script.** Filter Supersearch candidates against all active-campaign emails BEFORE enrichment. Kills the 41% overlap at source.
- [ ] **Weekly reply-rate dashboard** — Cloud Function → Telegram Monday 09:00 CST with the 5 North Star metrics.
- [ ] **Bounce alert at 1.5% threshold** → Telegram webhook.
- [ ] **One-click unsubscribe header audit.** Test send → Gmail → show original → confirm `List-Unsubscribe-Post: List-Unsubscribe=One-Click` present (Gmail 2026 requirement).

### Week 3 — Enrichment Layer v1

- [ ] **Build `supersearch_deep_enrich.py`** — adds 4 signals per lead using tools we already have:
  - Instagram follower count (IG Graph API public endpoint)
  - Active listings count (Firecrawl their site → count listing cards)
  - Days since last blog post (Firecrawl sitemap)
  - Google Business rating (DataForSEO Maps — already wired)
- [ ] **Add 4 new variables** to campaign templates: `{{followerCount}}`, `{{activeListings}}`, `{{lastBlogDays}}`, `{{googleRating}}`.
- [ ] **Build one "tier 1" sequence variant** — for agencies >20 agents or developers. Same structure, different pain angle.

### Week 4 — Data Layer Decision

Depends on baseline numbers from Week 1.

- If baseline reply rate ≥ 5% → **stay on Supersearch, scale volume.** Fix dedup + add 4 Firecrawl signals. Cost: $0.
- If 3-5% → **add Clay as enrichment layer on top of Supersearch.** $149/mo starter. 10-15 more signals per row.
- If <3% → **source is broken.** Parallel-test Apollo ($59-99/mo) for 1 month. Pick winner by cost-per-qualified-reply.

**Key financial lens:** The metric is NOT cost-per-lead, it's **cost-per-qualified-reply**. $0.50 Supersearch lead at 2% reply = $25/reply. $2.00 Clay+Supersearch lead at 8% reply = $25/reply. Same cost, 4× more conversations.

---

## 5. FILES & IDs (FOR THE NEXT CLAUDE SESSION)

### Pipeline & scripts
| Path | Purpose |
|---|---|
| `/mnt/jegodigital/lead_finder_v4_lean.py` | Single-file v4 pipeline |
| `/mnt/jegodigital/create_audit_trojan_campaign.py` | Reproducible campaign creation |
| `/mnt/jegodigital/run_audit_trojan_mx_batch.py` | 6-city batch runner |
| `/mnt/jegodigital/supersearch_test_enrich.py` | Supersearch enrich (limit=50) |
| `/mnt/jegodigital/supersearch_psi_enrich.py` | PSI audit + PATCH `custom_variables` |
| `/mnt/jegodigital/supersearch_move_leads.py` | List → Campaign move job |
| `/mnt/jegodigital/supersearch_repatch_vars.py` | Re-PATCH payload.* vars |

### Reports & sequence copy
| Path | Purpose |
|---|---|
| `/mnt/jegodigital/AUDIT_TROJAN_MX_V1_REPORT.md` | Campaign #1 deployment report |
| `/mnt/jegodigital/audit_trojan_mx_v1_sequence.md` | Approved 5-step copy |
| `/mnt/jegodigital/supersearch_out/PRELAUNCH_REPORT.md` | Campaign #2 deployment report |
| `/mnt/jegodigital/supersearch_out/MASTER_RECOMMENDATION_2026.md` | North Star + 30/90d playbook |
| `/mnt/jegodigital/supersearch_out/JEGODIGITAL_STACK_AUDIT_2026.md` | Adversarial 5-axis scorecard |
| `/mnt/jegodigital/supersearch_out/COLD_EMAIL_SOURCE_PACK_2026.md` | 36 URLs + 5 research prompts |

### Campaign IDs (Instantly)
| Campaign | ID | Status |
|---|---|---|
| Trojan Horse | `cd9f1abf-3ad5-460c-88e9-29c48bc058b3` | 🟢 Active · 834 leads |
| Auditoría Gratis | `8b5f556f-9259-4258-b74b-2df55712f520` | 🟢 Active · 1,169 leads |
| Campaign F | `733dfdd4-5813-48d6-8419-ebca3b40d783` | 🟢 Active · 137 leads |
| **Audit_Trojan_MX_v1** | `e526d5db-ee92-4b0d-9944-49ba47b587af` | 🟡 **DRAFT · 11 leads** |
| **Audit_Trojan_MX_Supersearch_v1** | `51074dc9-fce9-4a20-b8a0-4f283ac52177` | 🟡 **DRAFT · 80 leads** |

### Google Sheet
- **Master Lead Pipeline 2026:** `1uBRDCqz43l0ZI3k5U-msB1-x11kYiQ1FYMmiyVdC6P8`
- **Service account:** `jegodigital-e02fb-a05ae4cb7645.json` (at `/mnt/jegodigital/`)
- **Active tab:** `Audit_Trojan_MX_2026-04-18`

---

## 6. THE ONE THING TO DO TOMORROW MORNING

Before any new campaign, before any tool purchase, before any enrichment script:

**Run DMARC on all 3 sending domains + pull 30-day reply rates for all 4 active campaigns.**

Two commands, 15 minutes. Without these two numbers, every decision that follows is a guess.

```bash
# 1. DMARC audit
for d in aichatsy.com jegoaeo.com jegoleads.com; do
  echo "=== $d ==="
  dig TXT _dmarc.$d +short
  dig TXT $d +short | grep -E "v=spf1|google-site"
done

# 2. Reply rate baseline (Instantly v2 analytics endpoint)
# For each of the 4 campaign IDs above, call:
# GET /api/v2/campaigns/{id}/analytics?start_date=2026-03-20&end_date=2026-04-19
```

When those numbers land, ping Claude. Dashboard builds off them.

---

## 7. STILL OPEN (Next Session Agenda)

- [ ] #19 Audit JegoDigital stack vs 2026 best practices — **partial:** `JEGODIGITAL_STACK_AUDIT_2026.md` exists, needs cold-call + WhatsApp + social-media axes added
- [ ] #20 Expert recommendation + next-steps playbook — **partial:** `MASTER_RECOMMENDATION_2026.md` exists, needs conversion to scheduled-task TODO items
- [ ] #21 Absorb Claude Ecosystem NotebookLM (48 sources) — **in progress**

---

## 8. QUICK-START SCRIPT FOR NEW SESSION

Paste this as the first message to the new Claude session:

> Read `/mnt/jegodigital/SESSION_HANDOFF_2026-04-19.md` end to end. Then execute Week 1 punch list in order: DMARC audit, baseline reply rates, flip Supersearch campaign to Active, add UTM to Calendly in AI-agent replies. Don't touch any other task until those 4 are done. Report numbers before moving on.
