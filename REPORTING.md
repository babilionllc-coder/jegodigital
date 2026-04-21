# JegoDigital — Daily Reporting Pipeline
**Last updated:** 2026-04-21 · **Owner:** Claude (auto-shipped crons)

> Single source of truth for every automated report that lands in Alex's Slack. When this doc and the deployed crons disagree, this doc wins — update the crons to match.

---

## Philosophy

Alex gets **5 Slack DMs per day** on weekdays, **1 on Sundays**. Each is actionable in under 60 seconds. Each arrives at the natural completion time for its data stream.

- **Morning Brief (08:00 CDMX)** — "what to focus on today"
- **Cold Email (13:30 CDMX)** — after Instantly finishes the day's sends
- **Cold Call (17:30 CDMX)** — after coldCallRunAfternoon finishes
- **End of Day Rollup (19:30 CDMX)** — SEO + social + system health
- **Weekly Scorecard (Sunday 09:00 CDMX)** — revenue progression

**No Telegram.** Alex's primary channel is Slack. If a Telegram cron still exists, migrate its content to Slack and delete.

**No live-monitor flood.** Kill `coldCallLiveMonitor` after `coldCallSlack*` runs clean for 3 days. Replace with a single mid-batch ping at 11:15 and 17:15 CDMX.

---

## The 5 Reports

### 1. 🌅 Morning Brief — 08:00 CDMX daily (Mon-Fri)

**Function:** `morningBriefSlack` (NEW — to be built)
**Cron:** `0 8 * * 1-5` timezone `America/Mexico_City`
**Source collections:** `call_queue`, `leads`, `call_analysis`, `audit_requests`, `daily_digests`, Instantly API (sends_today)
**Channel:** Slack DM to Alex

```
🌅 Morning Brief — Tue Apr 22

Yesterday recap:
• 3 Calendly bookings · 12 positive email replies · 2 cold-call "yes"
• $0 new recurring closed · $0 one-time closed
• 1 red flag: <short description or "none">

Today scheduled:
• 50 cold calls queued (A: 20, B: 20, C: 10)
• ~305 cold emails across 6 campaigns
• 3 Calendly calls on your calendar (10:00, 14:00, 17:00)
• 2 pending audit deliveries (should fire by 09:30)

Your first 3 actions (in order):
1. Review 3 positive replies from yesterday (Slack thread link)
2. Prep for 10:00 Calendly: <prospect name> - <short context>
3. <third priority from audit doc P0 queue or ops backlog>
```

### 2. 📧 Cold Email Report — 13:30 CDMX daily (Mon-Fri)

**Function:** `coldEmailDailyReport` (LIVE since commit e5ba154, 2026-04-21)
**Cron:** `30 13 * * 1-5` timezone `America/Mexico_City`
**Source:** Instantly API (`/api/v2/campaigns`, `/api/v2/accounts`, unibox replies)
**Channel:** Slack DM

```
📧 Cold Email — Tue Apr 22

Last 24 hours:
• Sent: 287 · Delivered: 279 (97%) · Bounced: 8 (2.8%)
• Opens: 94 (33%) · Replies: 4 (1.4%) · Unsubscribes: 1

By campaign:
• Trojan Horse     · sent 50 · open 38% · reply 2.0% · bounce 1.2%
• SEO+Visibilidad  · sent 50 · open 32% · reply 1.0% · bounce 2.0%
• Audit-First      · sent 50 · open 41% · reply 2.4% · bounce 0.8% ⭐
• ChatGPT Angle    · sent 50 · open 29% · reply 0.4% · bounce 3.2% ⚠️
• Speed-to-Lead    · sent 50 · open 28% · reply 0.8% · bounce 2.4%
• World Cup 2026   · sent 37 · open 30% · reply 1.3% · bounce 0.0%

🚨 ChatGPT Angle bounce 3.2% > 2.5% threshold — pause + clean list
⭐ Audit-First leads campaigns on reply rate — double down

Top 3 replies today (reply first):
1. marco@inmobiliariaX.com — "interesado, mándame info"
2. sofia@agenciaY.mx — "¿cuándo pueden instalar?"
3. juan@brokerZ.com.mx — "sí, envía la auditoría"

Sender health:
• 10 senders green (warmup 85+)
• 0 senders flagged
```

### 3. 📞 Cold Call Report — 17:30 CDMX daily (Mon-Fri)

**Function:** `coldCallSlackAfternoon` (LIVE since 2026-04-21, commit 7f277049)
**Cron:** `30 17 * * 1-5` timezone `America/Mexico_City`
**Source:** `call_queue_summaries`, `call_analysis`, ElevenLabs history API
**Channel:** Slack DM

```
📞 Cold Call — Tue Apr 22

Today's batch:
• Dialed: 50 · Connected: 22 (44%) · Positive: 3 (6%) · Negative: 7 · Voicemail: 14 · Zombies: 4

By offer:
• A (SEO Pitch)    · dialed 20 · connected 10 · positive 1 · avg duration 85s
• B (Free Audit)   · dialed 20 · connected 8  · positive 2 · avg duration 110s ⭐
• C (Free Setup)   · dialed 10 · connected 4  · positive 0 · avg duration 65s

3 positive outcomes (listen first):
1. +52 55 XXXX-XXXX (Agent B) — "sí manden la auditoría" — audit fired ✅
2. +52 998 XXXX-XXXX (Agent B) — "llámenme mañana 10am" — calendly sent ✅
3. +52 81 XXXX-XXXX (Agent A) — "qué precio tienen?" — escalated to Alex

⚠️ 4 zombies today — Twilio StatusCallback still missing (ticket CC-5)
⚠️ 14 voicemails = 28% — acceptable, but check TTS volume on opener

Win rate vs. goal:
• Today: 3 positive / 50 dialed = 6%
• Target: 2-3 positive/day — ✅ HIT
• Weekly: 12 positive / 180 dialed = 6.7%
```

### 4. 🌙 End of Day Rollup — 19:30 CDMX daily

**Function:** `dailyRollupSlack` (LIVE — cron updated from 18:00 UTC to 19:30 CDMX)
**Cron:** `30 19 * * *` timezone `America/Mexico_City`
**Source:** `audit_requests`, DataForSEO rank tracker, IG Graph API, YT Data API, envAudit
**Channel:** Slack DM

```
🌙 End of Day — Tue Apr 22

SEO (jegodigital.com + clients):
• jegodigital.com      · PSI mobile 91 (▲ 2) · indexed 32 pages (=)
• realestateflamingo.mx · PSI mobile 43 (▲ 2) · rank "inmobiliaria Cancún" #1 (=)
• rsviajesreycoliman.com · PSI mobile 78 (=) · rank "tours Colima" #8 (▲ 1)
• ttandmore.com        · PSI mobile 82 (=) · no rank tracking yet

Rank deltas (top 20 target keywords):
• ▲ 3: "captura de leads inmobiliaria", "SEO inmobiliario México", "AI inmobiliaria"
• ▼ 1: "ChatGPT inmobiliaria"
• New in top 10: "auditoría SEO gratis"

Social (last 24h):
• IG @jegodigital: 0 posts · 1.2k followers (=)
• YT @JegoDigitalchannel: 0 uploads · 340 views
• TikTok @realestateflamingo (client): 2 new drafts pending approval

Audits delivered today: 7 (avg delivery time 42 min)

System health:
• envAudit: 37/37 secrets present ✅
• systemHealthAudit: 17/17 checks green ✅
• autopilotReviewer: 2 weekly flags outstanding

🚩 Red flags: <specific issue, or "none">
```

### 5. 📊 Weekly Scorecard — Sunday 09:00 CDMX

**Function:** `weeklyScorecardSlack` (NEW — to be built)
**Cron:** `0 9 * * 0` timezone `America/Mexico_City`
**Source:** aggregates of all above + bank/invoicing records (manual entry until CRM lands)
**Channel:** Slack DM + Email copy to `babilionllc@gmail.com`

```
📊 Week of Apr 15-21 — Scorecard

Revenue toward $1M/year goal:
• This week MRR closed: $X,XXX MXN
• Total MRR: $XX,XXX MXN (goal: $1,670,000/mo — at X.X%)
• Projects closed: 0 · Developer contracts: 0 · Performance deals: 0

Weekly KPIs:
• Outbound messages sent: 1,435 / target 500 ✅
• Discovery calls booked: 7 / target 10 ⚠️
• Free Trojan Horse installs: 2 / target 3 ⚠️
• Proposals sent: 3 / target 5 ⚠️
• New recurring revenue: $0 / target $50,000 MXN 🚨
• Churn: 0% / target <5% ✅

What worked:
1. <specific campaign / channel / offer that outperformed>
2. <specific optimization or fix>
3. <specific client win or case study>

What didn't:
1. <specific channel / offer / campaign that underperformed>
2. <blocker or missed opportunity>

Next week's 3 priorities:
1. <P0 from AUDIT + open queue>
2. <revenue move — developer contract outreach, white-label pitch, etc>
3. <infra / ops fix>
```

---

## Eliminate (crons to kill after this ships)

| Cron | Current schedule | Why kill | Replacement |
|---|---|---|---|
| `coldCallLiveMonitor` | Every 3 min during windows | Slack flood, signal < noise | Single `coldCallMidBatchCheck` at 11:15 + 17:15 CDMX |
| `dailyDigest` (Telegram) | 07:00 UTC | Duplicate of Slack reports, Alex uses Slack only | None — migrate anomaly-detection into `morningBriefSlack` |

---

## Implementation plan

1. **Phase 1 (this week):** `morningBriefSlack` + `weeklyScorecardSlack` new crons. Verify `coldEmailDailyReport` + `coldCallSlackAfternoon` match the formats above.
2. **Phase 2 (next week):** Migrate `dailyDigest` content into `morningBriefSlack`. Remove Telegram cron. Update SYSTEM.md crons table.
3. **Phase 3 (when stable):** Kill `coldCallLiveMonitor`. Add `coldCallMidBatchCheck` (single ping).

---

## Why Slack only, not Slack + Telegram

Alex confirmed (2026-04-21): "Slack DM every morning 8am... cold call and cold email i want to be reported separately." Telegram adds friction (two apps to check) and is redundant. Consolidate.

---

## Anti-patterns (do NOT do)

- 🚫 Don't post reports to channels — always DM Alex. Channels invite noise from other team members (there are none).
- 🚫 Don't send PDF attachments. Reports are inline text with tables.
- 🚫 Don't send links without context — "listen: [URL]" is fine, but "listen" on its own is useless.
- 🚫 Don't post multiple messages per report — one message per cron, threaded replies for deep dives.
- 🚫 Don't quote pricing in reports — just "MRR" totals. Keeps Alex's screenshare-safe.
- 🚫 Don't ship any new report without a matching entry in this file. Update on every cron change.
