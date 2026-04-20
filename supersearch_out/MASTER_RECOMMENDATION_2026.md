# Master Recommendation — Cold Email & Prospecting Overhaul

**Date:** April 19, 2026
**For:** Alex Jego / JegoDigital
**Companion files:** `COLD_EMAIL_SOURCE_PACK_2026.md` · `JEGODIGITAL_STACK_AUDIT_2026.md` · `PRELAUNCH_REPORT.md`

---

## TL;DR — The Three Things That Matter

1. **You don't have a copy problem. You have a data problem.** Your Spanish sequences are fine. What's capping your reply rate is personalizing off 6 variables when the 2026 ceiling is 15-25 signals. Fix the data layer and the same copy converts 2-3x better.

2. **You've never measured a baseline reply rate per campaign.** Until you do, every "improvement" is theater. First action this week = build the dashboard.

3. **Your deliverability is a silent risk.** DMARC/SPF/DKIM status on aichatsy.com, jegoaeo, jegoleads is not audited. Gmail 2026 rules are strict — one bad week of bounces and 8 inboxes die together.

---

## North Star — 5 Metrics You Didn't Have Before

Track these weekly. If any goes red, stop shipping new campaigns until it's green.

| Metric | Target | Red flag | Source |
|---|---|---|---|
| Reply rate per campaign | ≥5% | <3% | Instantly analytics |
| Positive reply rate (real interest) | ≥1.5% | <0.5% | Unibox tag |
| Bounce rate (30-day) | <2% | ≥2% | Instantly accounts tab |
| Spam complaint rate | <0.1% | ≥0.3% | Instantly accounts tab |
| Calendly bookings from cold email | ≥3/week | <1/week | UTM tag `utm_source=cold` |

**Deliverable next session:** wire these 5 metrics into a single Telegram weekly summary (Monday 09:00 CST). Instantly API + Cloud Function, ~2 hours to build.

---

## 30-Day Quick-Win Punch List (in priority order)

Do these in order. Each unlocks the next.

### Week 1 — Measure & De-risk

- [ ] **Run `mxtoolbox.com/dmarc.aspx` on aichatsy.com, jegoaeo.com, jegoleads.com.** Paste output into `deliverability_baseline.md`. If any domain is on `p=none`, escalate to `p=quarantine` within 48h.
- [ ] **Baseline current reply rate per campaign.** Pull Instantly `/analytics` for last 30d × all 4 active campaigns. Paste into `reply_rate_baseline.md`. This is the number we beat.
- [ ] **Flip Supersearch campaign to Active** (already pre-launch-cleared in `PRELAUNCH_REPORT.md`). 80 leads, zero overlap, 100% vars. Ship it.
- [ ] **Add UTM to the Calendly link** in AI-agent replies: `?utm_source=cold&utm_campaign={{campaignName}}`. Without this, we can't attribute bookings to cold email.

### Week 2 — Dedup + Infrastructure

- [ ] **Rewrite the Supersearch pull script to pre-filter against ALL 4 active campaigns' emails** before enrichment (not after move). This kills the 41% overlap problem at source. Script already exists — just invert the flow.
- [ ] **Build the weekly reply-rate dashboard** (Cloud Function → Telegram). 5 metrics above.
- [ ] **Configure Instantly bounce alert at 1.5% threshold** → Telegram webhook.
- [ ] **Audit one-click unsubscribe header** on a test send. Open Gmail → show original → verify `List-Unsubscribe-Post: List-Unsubscribe=One-Click` is present.

### Week 3 — Enrichment Layer v1

- [ ] **Build `supersearch_deep_enrich.py`** — takes Supersearch output, adds 4 more signals per lead via our existing tools:
  1. Instagram follower count (IG Graph API public endpoint)
  2. Active listings count (Firecrawl their site → count listing cards)
  3. Days since last blog post (Firecrawl sitemap)
  4. Google Business rating (DataForSEO Maps endpoint we already have)
- [ ] **Add 4 new variables to campaign templates:** `{{followerCount}}`, `{{activeListings}}`, `{{lastBlogDays}}`, `{{googleRating}}`.
- [ ] **Rewrite Step 3 "Caso real"** to reference one of the new signals. Generic → specific.

### Week 4 — A/B Framework

- [ ] **Split every active campaign into v1 / v2** at the subject line. Run 50/50 for 2 weeks, kill the loser.
- [ ] **First official A/B:** `Auditamos {{website}}` vs `{{city}} + PageSpeed` on the Supersearch campaign.
- [ ] **Weekly reply-rate retro** — 15 min every Friday. Winner stays, loser rewrites.

**End of month 1:** baseline metric, 4 new signals in production, bounce alarm armed, first winning A/B banked.

---

## 90-Day Strategic Roadmap

### Month 2 — Intent Signal Layer

**Goal:** stop targeting "agencies in Mexico" and start targeting "agencies in Mexico WHO JUST DID [TRIGGER]."

Events to detect (rank by ease):
1. **Posted a new listing in last 7 days** (Firecrawl their site weekly, diff the listing count) — easiest, $0
2. **Hired a marketing/digital role in last 30 days** (LinkedIn Sales Nav via Clay) — ~$100/mo
3. **Slow PageSpeed NOW vs 90 days ago** (PSI history from archive.org + current) — free, custom script
4. **New Instagram follower milestone** (crossed 1K / 5K / 10K — hiring/scale signal) — IG Graph API, free
5. **Competitor outranks them for their city keyword** (DataForSEO SERP) — we already have this

**Deliverable:** `signal_triggered_campaigns.md` — 5 campaigns, each tied to one event, auto-firing when Firecrawl/API detects the trigger.

### Month 3 — Data Layer Decision

See decision tree below. By end of month 2 you'll have enough data (baseline reply rate × cost per reply) to pick the right path.

---

## Decision Tree — Data Layer Upgrade

```
Current: Instantly Supersearch pid_free
Cost: ~$0 (included in plan)
Reply rate: UNKNOWN (baseline Week 1)

       ┌─ If baseline reply rate ≥ 5% →  STAY on Supersearch. Scale volume.
       │                                  Fix dedup + add 4 Firecrawl signals.
       │                                  Cost: $0 net.
       │
If baseline────┼─ If 3-5% →  UPGRADE enrichment, not source.
is ...         │             Add Clay ($149/mo starter) as a layer ON TOP
               │             of Supersearch. Keeps source cost low,
               │             adds 10-15 signals per row.
               │             Target: 5-7% reply rate.
               │
               └─ If < 3% →  SOURCE is broken. Switch database.
                             Test Apollo ($59-99/mo) for 1 month on a
                             parallel campaign. Compare replies/$.
                             If Apollo wins → migrate. If not →
                             stay Supersearch but add Clay ($149/mo).
```

**Key financial lens:** the metric is NOT cost-per-lead, it's **cost-per-qualified-reply**. A $0.50 Supersearch lead that replies 2% of the time costs $25/reply. A $2.00 Clay+Apollo lead that replies 8% of the time costs $25/reply. Same cost, 4x more volume of conversations. **The lead cost is noise — the reply rate is the signal.**

---

## What NOT To Do (Avoid These Traps)

- **Don't buy Clay, Apollo, and Ocean at once.** Pick one based on baseline data. Multi-tool stacking without measurement = $600/mo of data you don't use.
- **Don't increase daily sending limits** past 7.5/inbox/day until bounce + spam metrics are green for 4 consecutive weeks. Your warmup is healthy — don't break it.
- **Don't rewrite all 5 active campaigns.** Pick the weakest (lowest reply rate after baseline) and rebuild ONLY that one. Others run as control.
- **Don't add Calendly to Step 1 cold emails.** The `¿Te mando un video demo?` CTA is doing heavy lifting. Keep Calendly in positive replies ONLY (as per CLAUDE.md rule).
- **Don't chase ChatGPT / Gemini / Perplexity angles in cold email.** The "ChatGPT y tú" campaign is fine as 1 of 5, but most real estate agency owners in MX don't feel the pain yet. Save that angle for AEO-specific outreach.

---

## The One Thing To Do Tomorrow Morning

Before any new campaign, before any tool purchase, before any enrichment script:

**Run the DMARC check on all 3 sending domains and pull 30-day reply rates for all 4 active campaigns.**

Two commands, 15 minutes. Without these two numbers, every decision that follows is a guess.

```bash
# 1. DMARC audit
for d in aichatsy.com jegoaeo.com jegoleads.com; do
  dig TXT _dmarc.$d +short
done

# 2. Reply rate baseline (need to confirm Instantly v2 analytics endpoint shape)
# Campaign IDs in src_campaign_config.json
```

When those numbers land, ping Claude. We build the dashboard off them.

---

## Filed in `/supersearch_out/`

| File | What |
|---|---|
| `COLD_EMAIL_SOURCE_PACK_2026.md` | 36 curated URLs + 5 Deep Research prompts for your new NotebookLM |
| `JEGODIGITAL_STACK_AUDIT_2026.md` | Adversarial scorecard — 5 axes, top gaps, specific fixes |
| `MASTER_RECOMMENDATION_2026.md` | This file — North Star metrics, 30d punch list, 90d roadmap, decision tree |
| `PRELAUNCH_REPORT.md` | Supersearch campaign (80 leads) ready to flip active |

**Next session priority:** Week 1 punch list above. Start with DMARC + baseline numbers.
