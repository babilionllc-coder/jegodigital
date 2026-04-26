# Skill Learnings — 2026-04-26 Miami Hiring Campaign Run

**Context:** Built the Miami RE Hiring + Audit Personalization campaign (Instantly UUID `acffe5c9-9a74-4b3f-8a95-37882a11f96b`). 80 buyer-tier leads, 8 Apify queries, full Playwright site-audit personalization for the first time. These lessons should be merged into the `linkedin-hiring-intent` skill on next edit and a new `playwright-prospect-audit` skill should be considered.

---

## 🚨 Lesson 1 — Step 1 templates failed Rule 5 (Lead with prospect)

**The skill's existing 3-angle templates open with `"I run an AI marketing agency..."` which violates Rule 5 of `cold-email-copywriting` (never start with "I" or "We help…"). On the 2026-04-25 run AND the 2026-04-26 run, this produced sub-70 scorecard scores.**

### Bad opener (current skill output)

> Hi {{first_name}},
> I run an AI marketing agency for real-estate firms — saw {{company_short}} just posted a {{open_role_short}} role.

You/I ratio: 1:3 (talks about us, not them). Score: ~50/100.

### Good opener (rewrite, scored 100/100)

> Hi {{first_name}},
> You posted a {{open_role_short}} role at {{company_short}} a few days ago — bilingual real-estate marketing hires typically take 60–90 days to land.
>
> While looking through {{company_short}}'s site, here's what stood out: {{personalization_hook}}
>
> We've handled the bridge for teams in your spot before. GoodLife Tulum saw 300% organic growth in their 6-month gap.
>
> Worth a quick look at how it works?

You/I ratio: 2:1. 64 words. 3-word subject (`your {{open_role_short}} search`). Lead with THEM.

**Action:** rewrite the 3 Step-1 templates in `linkedin-hiring-intent` skill `templates/sequences_v2.json`. The 3 angles (A_bridge, B_replacement, C_audit) are still the right framing, but each must lead with `"You posted..."` / `"You're hiring..."` / `"Saw the {{open_role_short}} role at {{company_short}}..."`. The agency mention should appear AFTER the prospect-focused first line and the personalization hook.

The rewrites I shipped to the live Miami campaign (`acffe5c9-...`) on 2026-04-26 are saved in `leads/miami_hiring_2026-04-26/patch_campaign_templates.py` and pass the scorecard at 90+/100. Use those as the new template baseline.

---

## 🚨 Lesson 2 — Add WRONG_DEPT filter (6th gate)

**The HR#5 5-gate quality gate lets HR/CISO/Internal Audit/Recruiter directors through because their titles match `DM_TITLE` regex. They are NOT buyers for marketing services.**

On the 2026-04-26 Miami run: 47 enriched DMs → 19 buyer-tier (60% drop rate from wrong-dept slip-throughs).

Add this regex AFTER Hunter enrichment and BEFORE BUYER_TITLE check. If WRONG_DEPT matches, drop unconditionally:

```python
WRONG_DEPT = re.compile(
    r'\b(talent acquisition|recruit(er|ment|ing)|human resources|hr business|hris|payroll|'
    r'accountant|accounting|tax|internal audit|compliance|legal|paralegal|attorney|'
    r'graphic design|cybersecurity|information security|infosec|chief information security|ciso|'
    r'engineering|chief engineer|software engineer|developer|devops|cloud services|'
    r'platform services|client success|business development|land development|procurement|'
    r'asset management|asset manager|project manager|senior accountant|workplace strategy|'
    r'brand partnerships|franchise owner|knowledge management|community director|leasing director|'
    r'leasing consultant|leasing manager|tenant services|service director|construction director|'
    r'finance director|training director|facilities director|property manager|property operation|'
    r'property administrator|legal counsel|paid relocation|editor[- ]in[- ]chief|editor)\b',
    re.I,
)
```

The buyer pool we DO want: CEO, CMO, COO, CFO, President, Owner, Founder, Principal, Partner, Managing Director, Broker, VP/Head/Director of Marketing/Sales/Growth/Operations/Brand/Acquisitions.

---

## 🚨 Lesson 3 — 8-bucket geo strategy (not single query)

**A SINGLE Miami real-estate Apify query yielded 19 buyer-tier leads. Running 8 query buckets across the metro yielded 80.**

Template for any new geo:

| # | Query | Location | Keywords |
|---|---|---|---|
| 1 | Core city | Miami, FL | real estate |
| 2 | Adjacent geo | Fort Lauderdale, FL | real estate |
| 3 | Adjacent geo | Boca Raton, FL | real estate |
| 4 | Adjacent geo | West Palm Beach, FL | real estate |
| 5 | Wider radius | Tampa, FL | real estate |
| 6 | Wider radius | Orlando, FL | real estate |
| 7 | Different keyword | Miami, FL | property management |
| 8 | Buyer keyword | Miami, FL | marketing director |

All with `f_I=44` (Real Estate industry filter) and `f_TPR=r2592000` (last 30 days). Cost: ~$1.50 in Apify for 1,500–1,800 raw jobs → 80–100 buyer-tier leads.

For NYC/NJ/CT cluster: NYC, Brooklyn, Long Island, Newark, Jersey City, Stamford. For LA cluster: LA, Santa Monica, Beverly Hills, Pasadena, Long Beach, Orange County. For Texas Hispanic: Houston, San Antonio, Dallas, Austin.

---

## 🚨 Lesson 4 — Geo regex must include adjacent metro variations

LinkedIn returns Tampa/Orlando jobs even when querying Miami. Without expanded geo regex, those get filtered as "not Miami" wrongly. Always update `MIAMI_OK` (or per-cluster `*_OK`) to include adjacent metros from the Apify queries you ran.

---

## Lesson 5 — Blocklist additions (2026-04-26)

Add to BLOCKLIST regex:
- `bisnow|the real deal|connect cre|globe[ ]?st|inman` (RE media)
- `crew greater|crew network|nicsa` (RE-adjacent associations)
- `mortgage corp|federal credit|nrl mortgage` (banks/lenders, not RE)
- `university|college|hospital|clinic|department of|county|government` (institutional)
- `luxury presence|placester|boomtown|chime tech` (competitor RE marketing SaaS)
- `jet set pilates|crexi|jobot|pursuit sales|total quality logistics|tql|blinds to go|hedge fund|connectme capital|plona partners|paralegal|legal assistant|staffing|recruiter|recruiting agency|career group|mortgage banker|loan officer` (false positives)

---

## Lesson 6 — `linkedin-hiring-intent` skill should also INTEGRATE Playwright audit

The 2026-04-26 run added a NEW step to the pipeline that wasn't in the skill: **Playwright site audit** for each enriched lead, producing a `personalization_hook` custom field. This dramatically increased email specificity (no two emails carry the same opening line).

### Recommendation: extend the skill to call the Playwright pipeline natively

Add this step between HR#5 final filter and Instantly upload:

```bash
# 5b. Playwright audit each domain (concurrency=2 max for clean timing)
PLAYWRIGHT_BROWSERS_PATH=/tmp/ms-playwright \
  node tools/playwright/batch_audit.mjs \
  --in leads_final.csv \
  --out leads_audited.csv \
  --concurrency 2

# 5c. Re-rank hooks for the target market (Miami uses rerank_for_miami.mjs)
node tools/playwright/rerank_for_miami.mjs \
  --in leads_audited.csv \
  --out leads_audited_v2.csv

# 5d. Upload with audit fields
node tools/playwright/audit_and_upload.mjs \
  --in leads_audited_v2.csv \
  --campaign $CAMPAIGN_ID
```

**Critical caveat:** concurrency must be ≤2 for clean `load_ms` measurements. Concurrency=4 inflates timings ~2× from network contention, making MOBILE_LOAD hooks unreliable. The Miami-rerank script (`rerank_for_miami.mjs`) prioritizes deterministic hooks (HEAVY_PAGE, NO_WHATSAPP, STALE_COPYRIGHT, NO_SCHEMA) over network-dependent hooks specifically because of this.

### Critical Playwright sandbox notes

- **Browser binary at `/tmp/ms-playwright/chromium-1217/chrome-linux/chrome`** (not in `~/.cache/`) because `/sessions/` is space-constrained (~600MB free vs 2GB+ needed for full + headless variants).
- **`/tmp` gets wiped between sessions** — re-install on first call: `PLAYWRIGHT_BROWSERS_PATH=/tmp/ms-playwright npx playwright install chromium`. Takes ~1 minute over the bash timeout, runs in background under bwrap.
- **Use `executablePath` + `--no-sandbox --disable-dev-shm-usage`** because we install only the full chromium variant, not the `chromium_headless_shell` Playwright reaches for by default.
- See `tools/playwright/lib/launcher.mjs` for the canonical config.

---

## Lesson 7 — Cold email funnel is correct as-is (audit-first, NOT direct Calendly)

Direct Calendly link in Step 1 has historically tanked reply rates ~50% (per cold-email-copywriting Rule 4). Keep the funnel:

```
Cold email Step 1 (no link, no Calendly)
  → prospect replies "yes interested"
  → Instantly auto-labels positive
  → AI Agent (JegoDigital Agent id 019d368d-c8ad-7208-8c42-438f4cb16258) fires
  → Auto-reply with personalized /auditoria-gratis link
  → Audit page renders prospect's site findings + GoodLife/Flamingo proof
  → Audit page CTA: Calendly
  → Calendly call → Sofia/Slack notify → Brevo welcome → close
```

The AI agent is **label-triggered workspace-wide** (`trigger_on_labels_enabled: true`, `campaign_ids: []`). Don't attach it per-campaign. Verified working as of 2026-04-26.

**Smoke-test after every campaign activation:** send a positive reply to one of the 10 sender mailboxes, verify the auto-reply fires within 1–3 minutes with the audit link.

---

## Lesson 8 — Instantly v2 API gotchas (re-verified)

- `/leads/list` requires POST not GET (still in skill, re-verified)
- `User-Agent: Mozilla/5.0 Chrome/120.0.0.0` required (Cloudflare blocks Python urllib UA)
- Campaign `timezone` only accepts: `America/Chicago`, `America/Detroit`, `America/Los_Angeles`, `America/Denver`, `America/New_York` is REJECTED — use `America/Detroit` for ET
- `PATCH /campaigns/{id}` with `{sequences: [...]}` works — use this to fix templates without re-creating
- `campaigns?limit=20` returns 5 most recent only, not 20 — use `next_starting_after` for pagination

---

## Lesson 9 — Bash 45s timeout pattern

The sandbox bwrap kills long-running children when the bash call times out. Patterns that work:

- Background install with `nohup ... &` then poll separately
- Foreground commands with explicit retry loops (Apify polling)
- Hunter enrichment: 18 lookups per call max (~14s) with checkpoint to `/tmp/foo_offset.txt`

---

## Quick-start for next run (with all fixes applied)

```bash
# 1. Verify access
bash tools/verify_access.sh

# 2. Apify cap check + lift if needed (lift by exactly the budget for this run)
APIFY=$(grep ^APIFY_API_KEY= website/functions/.env | cut -d= -f2)
curl -s "https://api.apify.com/v2/users/me/limits?token=$APIFY" | jq .

# 3. Install Playwright if /tmp/ms-playwright is empty (fresh sandbox)
[ ! -d /tmp/ms-playwright/chromium-1217 ] && \
  PLAYWRIGHT_BROWSERS_PATH=/tmp/ms-playwright npx playwright install chromium

# 4. Run 8-query Apify batch (parallel, ~3 min)
# 5. ICP filter with WRONG_DEPT 6th gate
# 6. Hunter enrich (checkpoint every 18 lookups)
# 7. Playwright batch_audit at concurrency=2 (clean timing)
# 8. Rerank for target market
# 9. Push to Instantly via audit_and_upload.mjs
# 10. PATCH campaign with rewritten Step 1 templates (Rule 5 compliant)
# 11. Verify AI agent attached, audit page returns 200, Calendly returns 200
# 12. Activate campaign
```

**Cost-per-lead benchmark (2026-04-26):** $0.018 (Apify $1.40 / 80 leads).

---

## Cumulative funnel learnings

| Stage | What works | What to avoid |
|---|---|---|
| Discovery | 8-bucket geo + keyword variation | Single query — yields 1/4 the leads |
| ICP filter | Strict regex + RE_NAME in company name (not just description) | Loose desc-based matching → SaaS/staffing slip-through |
| DM enrichment | Hunter `/v2/domain-search?limit=8` | Limit=2 misses good DMs |
| Quality gate | 6 gates (5 + WRONG_DEPT) | 5-gate alone passes HR/CISO/Audit |
| Personalization | Playwright audit + observation-based hooks | Network-timing hooks at concurrency>2 |
| Step 1 copy | Lead with prospect (Rule 5), 50–80 words, 2:1 you/I | "I run an agency..." opener |
| CTA | Interest-based ("worth a look?") | Direct Calendly link |
| Reply handling | Workspace-wide AI agent with audit-first | Manual reply (loses speed-to-lead) |
| Activation | Verify ALL: copy scorecard, AI agent, audit page, Calendly | Activate before audit |

---

## Recommended new skill: `playwright-prospect-audit`

Today's `tools/playwright/` directory effectively created a new skill. Recommend extracting it into a standalone `playwright-prospect-audit` skill with:
- `audit_prospect.mjs` (single-domain audit)
- `rank_hook.mjs` (universal hook ranker)
- `rerank_for_miami.mjs` / `rerank_for_*.mjs` (per-market variants)
- `batch_audit.mjs` (parallel runner)
- `audit_and_upload.mjs` (Instantly v2 uploader with custom fields)

Triggers should include: "audit prospects", "personalize cold email by site audit", "render prospect site", "find observable issues for cold email hook".

This skill would be a dependency of `linkedin-hiring-intent`, `lead-finder`, and any future hiring-intent skills (NYC/LA/Texas).
