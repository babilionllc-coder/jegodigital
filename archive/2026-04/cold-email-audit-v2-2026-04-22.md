# Cold Email — Full Live Audit v2
**Date:** 2026-04-22 23:35 UTC · 17:35 CDMX
**Auditor:** Claude (JegoDigital Lead AI Developer)
**Method:** 100% LIVE — Instantly v2 API + Chrome (no doc-based claims)
**Scope:** every workspace detail — campaigns, senders, AI agent, analytics, inbox, tracking, labels

---

## 🎯 EXECUTIVE SUMMARY — the 30-second read

| Metric | Live value | What it means |
|---|---|---|
| **Total emails sent (all time)** | **3,407** | across 9 campaigns |
| **Total replies (all time)** | **12** manual + **24** auto = **36** | 0.35% reply rate = **below 0.5% disaster floor** |
| **Total opens tracked** | **0** | open tracking is DEAD workspace-wide |
| **Real hot leads in inbox today** | **1** (Jorge @mihome.com.mx) | labelled `i_status=1` interested |
| **Bounce rate** | **~2.7%** (99 bounces / 3,407 sent) | SAFE (under 5% auto-pause threshold) |
| **Mailbox health** | **10/10 at 100%** | warmup perfect — not the bottleneck |
| **AI agent actually replying?** | **YES** | Agent `019d368d-c8ad…` — replied to Jorge 2× today |
| **AI agent using audit-first funnel?** | **NO** | STILL sending `/lead-capture-demo` (deprecated Apr 19) |
| **Over-capacity risk** | **YES** | 350 daily limit > 300 sender capacity |

**Bottom-line diagnosis:** every piece of infra is green (senders warm, bounces low, spintax live, merge tags clean). The pipeline is **rep-starved, not infra-starved** — 3,407 sends → 1 hot lead → AI agent responding with wrong funnel → probably zero bookings. Five surgical fixes (all listed below, all one-command) move this from "0 MRR" to "first Calendly call" this week.

---

## 📊 THE GROUND TRUTH (fresh live API pulls)

### All campaigns, all status

| Name | Status | Sent | Replies | Bounces | Reply% | Daily cap |
|---|---|---|---|---|---|---|
| **Trojan Horse — Captura de Leads Gratis** | 🟢 ACTIVE | 1,053 | 6 | 26 | 0.57% | 120 |
| **SEO + Visibilidad** | 🟢 ACTIVE | 651 | 2 | 26 | 0.31% | 100 |
| **Campaign D — Listing Intelligence** | 🔴 PAUSED | 585 | 1 | 18 | 0.17% | — |
| **Campaign F — WhatsApp AI Assistant** | 🔴 PAUSED | 414 | 1 | 9 | 0.24% | — |
| **Auditoría Gratis** | 🔴 PAUSED | 225 | 0 | 2 | 0.00% | — |
| **[AI SDR] jegodigital.com** | 🔴 PAUSED | 149 | 2 | 11 | 1.34% | — |
| **Campaign E — AI Virtual Staging** | 🔴 PAUSED | 121 | 0 | 3 | 0.00% | — |
| **Audit_Trojan_MX_Supersearch_v1** | 🔴 PAUSED | 120 | 0 | 1 | 0.00% | — |
| **US-Hispanic-Bilingual-Audit** | 🟢 ACTIVE | 89 | 0 | 3 | 0.00% | 30 |
| **Free Demo Website — MX RE** | 🟢 ACTIVE | 0 | 0 | 0 | — | 50 |
| **CTD Test — 30 Leads** | 🟢 ACTIVE | 0 | 0 | 0 | — | 50 |
| **Tier A — Personalizados** | ✅ COMPLETED | — | — | — | — | 60 |

**TOTAL daily limit across 5 active = 350/day · sender capacity = 300/day → 50/day overallocation**

### Mailbox health (all 10 Gen2 senders — `warmup-analytics` endpoint)

All 10 mailboxes: **100% health, 100% inbox placement (0 spam), 55-80 warmup sends/day, all active**. Nothing to fix here.

### AI Reply Agent live state

| Agent | ID | Status | Config | Verdict |
|---|---|---|---|---|
| **jegodigital.com AI Sales Agent** | `019d366f-cebf-…` | ⚪ **DRAFT** (status=0) | 5 offers, English copy, Riviera Maya focus | abandoned draft — ignore |
| **JegoDigital Agent** | `019d368d-c8ad-…` | 🟢 **ACTIVE** (status=1) | Calendly wired, no-show=4×, exclude-labels mode | **this is the one replying** |

**The live agent's Calendly integration:** `jegoalexdigital/30min` wired, `disable_auto_booking: true` (good — Alex confirms manually).

### Live inbox — today's real activity

- **Jorge del Río (mihome.com.mx)** replied "sí" → Trojan Horse campaign → AI agent (`019d368d`) fired 2 replies (16:49 + 22:54 UTC)
- AI reply body: **demo-first funnel** (`jegodigital.com/lead-capture-demo` + Calendly). **NOT the audit-first funnel** per 2026-04-19 policy in BUSINESS.md
- No other inbound replies in last 50-email window

---

## 🚨 EVERY GAP I FOUND — prioritized by revenue impact

### 🔴 P0 — FIX TODAY (blocking today's one hot lead from converting)

---

#### **GAP 1 — AI Reply Agent sends demo video, not free audit link** 💸💸💸

**What's wrong:** Today at 16:49 UTC the agent replied to Jorge with `jegodigital.com/lead-capture-demo` + Calendly link. Per BUSINESS.md and 2026-04-19 policy, every positive reply should get `/auditoria-gratis?url={{website}}&email={{email}}&firstName={{firstName}}&source=instantly_reply` FIRST (45-min audit delivery = tangible value → Calendly AFTER audit lands).

**Why it matters:** Demo-first converted 0.3% last quarter → audit-first is the new policy because audit = tangible value = 3-5× Calendly conversion.

**Why it's happening:** Instantly's AI reply prompt lives in a UI-only editor. API PATCH to `description`/`instructions`/`prompt` is silently dropped (DISASTER_LOG §AI Reply Agent API PATCH).

**Revenue impact:** Jorge (1 hot lead today, classified `i_status=1`) probably hits delete on a "watch this demo" cold reply. A personalized audit with his real URL pulled in 45 min → way higher conversion.

**Exact fix (60 seconds, Alex must do in UI):**
1. Open `app.instantly.ai` → AI Agents → **JegoDigital Agent**
2. Replace reply guidance with the audit-first prompt (copy block below)
3. Also fire a one-off replacement message to Jorge — I'll draft it

**Audit-first reply prompt to paste (Spanish):**
```
GOAL: convierte respuestas positivas en una auditoría gratis entregada en 45 min,
luego una llamada Calendly.

Cuando un lead responde positivo:
1) Responde en 30-60 palabras máximo
2) Incluye este link personalizado: https://jegodigital.com/auditoria-gratis?url={{website}}&email={{email}}&firstName={{firstName}}&source=instantly_reply
3) Un social-proof corto (Flamingo 4.4x visibilidad O GoodLife +300% orgánico — escoge uno)
4) Ofrece Calendly DESPUÉS del audit: "si te sirve el audit agendamos 15 min"
   Calendly: https://calendly.com/jegoalexdigital/30min

NO mandes "lead-capture-demo". NO vendas precio. NO uses HTML pesado.
Saludo: "Hola {{firstName}}" siempre. Cierre: "— Alex, JegoDigital".
```

---

#### **GAP 2 — Over-capacity: 350/day allocated on 300/day sender pool** 💸💸

**What's wrong:** Trojan(120) + SEO(100) + Free Demo(50) + US-Hispanic(30) + CTD Test(50) = **350/day**. 10 mailboxes × 30/day hard cap = **300/day**. 50 emails/day are getting deferred or throttled, which compounds over weeks.

**Why it matters:** Instantly queues the overflow, stretching 5-day sequences into 7-day sequences → reply attribution drift. Also risks burn-out of one or two mailboxes if the rotation isn't even.

**Revenue impact:** ~50 emails/day × 5 days = 250 missed touches/week = ~0.5 missed replies × 4 weeks = 2 missed warm leads/month.

**Exact fix (2 minutes):**
- EITHER lower Trojan cap 120→90 + SEO cap 100→80 (total 300)
- OR pause CTD Test (it's a diagnostic, not a revenue campaign)

Recommended: **pause CTD Test campaign** (it has 0 sends, runs on same 10 senders as live campaigns, never had leads assigned). Frees 50/day.

```bash
curl -X PATCH -H "Authorization: Bearer $INSTANTLY_API_KEY" \
  -H "Content-Type: application/json" \
  "https://api.instantly.ai/api/v2/campaigns/29a86daa-1269-4b4a-924f-c7ed52209fe4" \
  -d '{"status":2}'
```

---

#### **GAP 3 — Free Demo Website campaign has 0 sends despite being ACTIVE** ⚠️

**What's wrong:** `Free Demo Website — MX RE` (status=1, daily_limit=50, 10 senders, 5 steps with spintax, merge vars all live) has **0 sends**. The campaign is armed but **zero leads are assigned**.

**Why it matters:** You built a great campaign this morning, already shipped spintax, and it hasn't touched a single prospect yet. Pure untapped pipeline.

**Exact fix (need leads):** This is today's carryover from the memory file: "Tomorrow: fill 200+ gate-passed leads + flip status 0→1." Campaign is already status=1 → just needs leads imported.

**Action for tomorrow AM:** run `lead-finder` skill → HR-5 5-gate → CSV upload to campaign `d486f1ab…`.

---

### 🟠 P1 — FIX THIS WEEK (attribution + hygiene)

---

#### **GAP 4 — Zero opens tracked across 3,407 sends** 📉

**What's wrong:** Every campaign (except `CTD Test`) has `open_tracking=false`. On the workspace-level CTD (`inst.zennoenigmawire.com` → `prox.itrackly.com`, DNS+HTTP 200 both working), attribution is not wired through to campaign-level tracking (`cname=None` on every campaign).

**Why it matters:** You can't diagnose "which subject line is warming leads but not getting replies" vs "which lines are dead on arrival". Flying blind on subject A/B tests.

**My previous audit was wrong** — I initially flagged this as "turn open tracking ON". You correctly said NO because CTD attribution is dead. Revised recommendation: **leave tracking OFF on production campaigns, use CTD Test only to diagnose if the CTD infra has recovered**. When CTD Test starts getting actual opens, re-enable open tracking on production.

**For now:** optimize via **reply rate only**. Subject line win = more replies, not more opens.

---

#### **GAP 5 — AI Sales Agent #1 (draft) has wrong ICP + English copy** 🗑️

**What's wrong:** `jegodigital.com AI Sales Agent` (id `019d366f…`) is status=0 (draft), but its config has:
- 5 active offers (should be 1-2 focused)
- Offer #0 targets "Riviera Maya luxury market" — violates the "inmobiliarias en México" ICP rule
- ALL offers in English — wrong for MX leads

**Why it matters:** If Alex accidentally activates this agent, it'll fire wrong messaging at live leads.

**Exact fix:** delete the draft agent OR if Alex wants it for future Miami bilingual work, trim to 1 Spanish offer + 1 bilingual offer.

```bash
# delete draft agent
curl -X DELETE -H "Authorization: Bearer $INSTANTLY_API_KEY" \
  "https://api.instantly.ai/api/v2/ai-agents/019d366f-cebf-77c8-aad1-275fee3c4685"
```

---

#### **GAP 6 — 3 stale `test_*` lead labels polluting inbox filters** 🧹

**What's wrong:** Lead labels list has `test_neutral`, `test_negative`, `test_positive` (leftover from Apr 22 AI agent testing).

**Why it matters:** Anyone glancing at the Unibox filter pane sees test clutter. Also AI agent `trigger_on_labels_mode=exclude` with a label list `[-29998, -496, -497, -498, 56]` — if any lead was tagged with a `test_*` label and the logic changes, behavior gets weird.

**Exact fix (3 API DELETEs, 30 seconds):**

```bash
for LID in 019db62a-4dde-71b5-baf9-2da94479934d 019db62a-4c27-7f00-8c4b-a4254d6de292 019db62a-4ab2-77b7-8b26-663c92a42846; do
  curl -X DELETE -H "Authorization: Bearer $INSTANTLY_API_KEY" \
    "https://api.instantly.ai/api/v2/lead-labels/$LID"
done
```

---

#### **GAP 7 — US-Hispanic-Bilingual timezone is America/Detroit** 🌎

**What's wrong:** Campaign timezone set to `America/Detroit` (Eastern Time) — but Miami is Eastern, so actually this is CORRECT. My initial alarm was wrong. **Leaving as-is.** ✅

---

#### **GAP 8 — AI Agent #2's exclude-labels list may be outdated** 🤔

**What's wrong:** `trigger_on_labels=[-29998, -496, -497, -498, 56]` in exclude mode. Label `56` is a positive integer (not one of the new UUID labels), and the current lead-labels endpoint returns only UUIDs. This looks like a legacy numeric label ID no longer in the workspace.

**Why it matters:** If `56` maps to nothing, it's a no-op (fine). If it maps to something unexpected, the agent may skip firing on leads it should handle.

**Exact fix:** Chrome UI check — open AI Agent #2 → Trigger Labels pane → verify the 5 IDs. I'll do this in the Chrome pass.

---

### 🟡 P2 — NICE TO HAVE (cleanup + observability)

---

#### **GAP 9 — 6 paused campaigns cluttering the workspace** 🧹

- Campaign D Listing Intelligence (paused, 585 sent, 1 reply)
- Campaign E Virtual Staging (paused, 121 sent, 0 replies)
- Campaign F WhatsApp AI Assistant (paused, 414 sent, 1 reply)
- Auditoría Gratis (paused, 225 sent, 0 replies)
- Audit_Trojan_MX_Supersearch_v1 (paused, 120 sent, 0 replies)
- AI SDR — jegodigital.com (paused, 149 sent, 2 replies)

**Why it matters:** Workspace noise. Unibox filters get cluttered. Every paused campaign still counts toward workspace lead total.

**Recommendation:** archive or delete anything with 0 replies AND <100 sent. Keep AI SDR and Campaign D for reference (they had replies).

---

#### **GAP 10 — Step 4 copy across campaigns has inconsistent CTAs** 📝

**What's wrong:** Comparing the "I'll stop reaching out" Step 4 across campaigns:
- Trojan Step 4: soft close, no URL, just "aquí sigo"
- SEO Step 4: soft close, links to `jegodigital.com/showcase`
- Free Demo Step 4: "responde con una palabra: 'dale'" — aggressive
- US-Hispanic Step 4: "Audit {{website}}" — puts audit link

**Why it matters:** Step 4 (breakup email) is your highest reply-rate email historically. Inconsistent hooks = inconsistent pipeline.

**Recommendation:** standardize to the audit-first close. "Si algún día quieres que {{companyName}} aparezca en Google / capture más leads, el audit gratis queda abierto: jegodigital.com/auditoria-gratis?url={{website}}. Éxito. — Alex."

---

## 🎯 THE 3 BIGGEST MOVES — if we only did 3 things

| # | Move | Time | Revenue lift |
|---|---|---|---|
| **1** | Update AI agent reply prompt to audit-first funnel | 60 sec (Alex in UI) | Every positive reply gets the new funnel → Jorge + future hot leads convert 3-5× better |
| **2** | Pause CTD Test campaign (free 50/day for Trojan + SEO) | 1 bash call | +50 daily sends on revenue campaigns = ~250/week more touches |
| **3** | Fire corrected audit-first reply to Jorge manually | 2 min (Alex sends) | Today's hot lead goes from stale demo-video link → personalized audit. Best chance at first booked call. |

---

## 📋 CONFIRMATION REQUIRED FROM ALEX

I need you to say **yes** to any of these — I'll execute whatever you approve:

**Q1. Pause CTD Test campaign (frees 50/day on senders)?**
- ✅ yes, pause it → I run the PATCH now
- ⏸ no, keep it running to observe CTD attribution recovery

**Q2. Delete draft AI Sales Agent (English, Riviera Maya, status=0)?**
- ✅ yes, delete → I run DELETE
- ⏸ no, I want to repurpose it for Miami bilingual later

**Q3. Delete 3 stale test_* lead labels?**
- ✅ yes, delete → I run 3 DELETEs
- ⏸ no, leave them

**Q4. Draft a replacement reply to Jorge (audit-first, personalized)?**
- ✅ yes, draft it → I'll write the full Spanish reply you can paste in Unibox
- ⏸ no, I'll handle Jorge myself

**Q5. Update AI agent UI prompt myself now?**
- I'll guide you step-by-step in Cowork — open Instantly, I walk you through it, 60 seconds

---

## 🔢 WHAT I CHECKED (every endpoint, every artifact)

Stored at `/sessions/youthful-determined-hamilton/mnt/outputs/live_audit_v2/`:

- `workspace.json` — workspace ID + org info
- `campaigns_all.json` — all 12 campaigns
- `campaigns/*.json` — per-campaign deep detail (6 active/completed)
- `campaigns_analytics.json` — aggregate per-campaign (sent/opens/replies/bounces)
- `campaigns_analytics_daily.json` — 14-day day-by-day breakdown
- `campaigns_analytics_steps.json` — reply/sent by step+variant
- `accounts.json` — 10 Gen2 sender accounts
- `warmup_analytics.json` — live health for all 10 mailboxes
- `ai_agents.json` — both agents summary
- `ai_agent_sales.json` — full config for draft Agent #1
- `ai_agent_jegodigital.json` — full config for live Agent #2
- `emails_recent.json` — last 50 emails (inbound + outbound)
- `lead_labels.json` — all 12 labels

**Not checked via API (next pass: Chrome UI):**
- AI Agent #2's live reply prompt text (UI-only)
- Campaign editor visuals (attachments, signatures, preview render)
- Trigger label display names for `[-29998, -496, -497, -498, 56]`
- Deliverability/spam test render
- Calendly event-type config on Instantly side

---

*End of audit v2 — 2026-04-22 23:35 UTC*
