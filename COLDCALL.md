# COLDCALL.md — JegoDigital AI Cold-Calling System

**Last updated:** 2026-04-21 12:00 CDMX | **Owner:** Alex Jego
**Status:** LIVE — dialing 50 MX real estate leads/day, Mon-Fri

> This is the single source of truth for JegoDigital's AI cold-calling stack.
> Read this BEFORE starting any cold-call work in any new Claude session.
> Companions: `CLAUDE.md` (project rules), `SYSTEM.md` (full infra), `ACCESS.md` (secrets), `DEPLOY.md` (CI/CD).

---

## 1. 30-SECOND OVERVIEW

We run an autonomous AI cold-calling system that dials 50 MX real estate agencies each weekday at 10:00 CDMX, retries failures at 16:00, and reports outcomes to Slack at 12:30 and 18:30. The dialer (Sofia) is an ElevenLabs Conversational AI agent that speaks Spanish, connects via Twilio, and A/B/C tests three offers in parallel. Positive replies auto-fire free website audits via email. No human in the loop for dialing — Alex only intervenes when Slack shows a hot lead.

**Current health snapshot** (2026-04-21 12:00 CDMX, last 100 calls):

| Metric | Value | Target | Gap |
|---|---|---|---|
| Real conversations | 35/100 (35%) | ≥50% | Close — needs better filter |
| Zombies (0-msg / maxdur) | 31/100 (31%) | ≤10% | **HOT** — Twilio↔ElevenLabs SIP bug |
| Voicemails caught | 20/100 (20%) | n/a | Working as designed |
| Human hangups | 12/100 (12%) | n/a | Normal rejection |
| Successes (full pitch) | 3/100 (3%) | ≥10% | Needs more dials to smooth |
| Twilio balance | $31.93 USD | ≥$15 | OK |
| ElevenLabs credit | 72.6% used | ≤90% | OK — 3 weeks before reset |

---

## 2. ARCHITECTURE

```
┌────────────────┐   09:55  ┌──────────────┐  10:00   ┌───────────────┐
│leadFinderAuto- │──────────►│coldCallPrep │─────────►│ coldCallRun   │
│TopUp (08:00)   │ replenish │50 leads → qu│ queue    │ fires 50 dials│
│phone_leads     │           │ A/B/C mix   │          │ 12s throttle  │
└────────┬───────┘           └──────────────┘          └───────┬───────┘
         │                                                     │
         │                    ┌──────────────┐                 │
         ▼                    │coldCallLive- │                 ▼
    phone_leads               │Monitor       │      ┌──────────────────┐
    (57 verified)             │*/3 min       │      │ ElevenLabs Sofia │
                              │10-13 + 16-19 │      │ → Twilio → lead  │
                              │Telegram alert│      │ (Spanish, MX)    │
                              │ on failure   │      └────────┬─────────┘
                              └──────────────┘               │
                                                              ▼
┌──────────────┐  16:00   ┌────────────┐              ┌──────────────┐
│coldCallRun-  │──────────│coldCallSlack│  13:00      │elevenLabsWebhook│
│Afternoon     │ retry    │ReportMorning│  aggregate  │post-call → Firestore│
│25 retries    │ no-answer│12:30 Slack  │ outcomes    │call_analysis/{convId}│
└──────────────┘          └─────────────┘              └──────────────┘
                          coldCallSlackAfternoon 18:30
```

**Cron schedule (all CDMX / America/Mexico_City):**

| Time | Function | Days | Purpose |
|---|---|---|---|
| 08:00 | `leadFinderAutoTopUp` | Daily | Replenish `phone_leads` pool (HARD_FLOOR 100) |
| 09:55 | `coldCallPrep` | Mon-Fri | Rank leads, write 50 to `call_queue/{today}` with A/B/C mix |
| 10:00 | `coldCallRun` | Mon-Fri | Fire 50 dials, 12s throttle |
| 10:15 | `coldCallMidBatchCheck` | Mon-Fri | Verify ≥3 dials fired, alert if stall |
| */3 min | `coldCallLiveMonitor` | 10-13 + 16-19 | Failure-spike + stall + pending backlog alarms |
| 12:30 | `coldCallSlackMorning` | Mon-Fri | Block Kit Slack post-batch report |
| 13:00 | `coldCallReport` | Mon-Fri | Aggregate outcomes, auto-fire audits for positives |
| 16:00 | `coldCallRunAfternoon` | Mon-Fri | Retry up to 25 no-answer / failed |
| 18:30 | `coldCallSlackAfternoon` | Mon-Fri | Slack post-retry report |

**HTTPS endpoints:**
- `coldCallSlackOnDemand` — manual fire: `?date=YYYY-MM-DD&window=morning|afternoon|all`
- `voiceAgentCall` — one-off dial: `{ phone, name, offer, ... }`
- `elevenLabsWebhook` — post-call ingest from ElevenLabs workspace webhook
- `seedPhoneLeadsOnce` — one-shot seeder (protected by `X-Seed-Secret`)

---

## 3. ELEVENLABS SETUP (the 3 Sofia agents)

**Account:** Creator plan, 95,041/131,000 chars used (72.6%)

**Master voice:** July — Warm, Youthful | Voice ID `MD6rLAhozcrmkdMZeOBt`

**Phone number:** `+52 998 387 1618` | ElevenLabs PN ID `phnum_8801kp77en3ee56t0t291zyv40ne` | Provider: Twilio | Assigned agent: A (SEO Pitch)

### Agent config — SHARED settings (post 2026-04-21 patch)

All 3 agents now have IDENTICAL timeout/turn config to prevent zombie calls:

```json
{
  "conversation_config": {
    "turn": {
      "initial_wait_time": 1.0,                    // agent speaks first_message after 1s (was null — caused zombies)
      "silence_end_call_timeout": 15.0,            // end call after 15s silence between turns
      "turn_timeout": 4.0,                         // how long to wait for user response
      "soft_timeout_config": {
        "timeout_seconds": 8.0,                    // nudge after 8s silence
        "use_llm_generated_message": false,
        "message": "¿Hola? ¿Me escuchas?"
      },
      "mode": "turn",
      "turn_eagerness": "normal",
      "turn_model": "turn_v2"
    },
    "conversation": {
      "max_duration_seconds": 90                   // HARD CAP backstop (was 300-600)
    },
    "tts": {
      "model_id": "eleven_v3_conversational",
      "voice_id": "MD6rLAhozcrmkdMZeOBt",
      "agent_output_audio_format": "ulaw_8000",    // ulaw required for Twilio
      "stability": 0.6,
      "speed": 1.0,
      "similarity_boost": 0.75
    },
    "asr": { "provider": "scribe_realtime", "quality": "high", "user_input_audio_format": "pcm_16000" },
    "agent": { "language": "es", "disable_first_message_interruptions": true },
    "vad": { "background_voice_detection": false }
  }
}
```

### The 3 offers (A/B/C split test)

| Offer | Agent ID | Pitch | CTA | First message |
|---|---|---|---|---|
| **A — SEO Pitch** | `agent_6601kp758ca4fcx8aynsvc0qyy5k` | "Your agency doesn't show up on Google/ChatGPT" | Book Calendly with Alex | "Hola, ¿hablo con {{lead_name}}?" |
| **B — Free Audit** (Trojan Horse) | `agent_7001kpcxketqewvt87k4mg6vp569` | "Free 7-area business audit scored 0-100, emailed in 60 min" | Lead says "yes" + confirms email → fires `submit_audit_request` tool → `submitAuditRequest` Cloud Function → audit delivered | "Hola, ¿hablo con {{lead_name}}?" |
| **C — Free Setup** | `agent_2801kpcxmxyvf36bb2c970bhvfk4` | "Free AI lead capture install, speed-to-lead hook (21× more closes in <5 min)" | Book Calendly install call | "Hola, ¿hablo con {{lead_name}}?" |

**Offer mix is UNIFORM RANDOM** (switched from round-robin 2026-04-20). This lets `autopilotReviewer` read A/B/C performance without positional bias across days.

### Tools wired to agents

- **Offer B only:** `submit_audit_request` → POST to `https://us-central1-jegodigital-e02fb.cloudfunctions.net/submitAuditRequest` with `{ name, email, website, source: "cold_call_elevenlabs" }`. Triggered when lead agrees to audit.
- **All 3:** `voicemail_detection` → built-in ElevenLabs tool, ends call with `termination_reason: "voicemail_detection tool was called"` when it detects a voicemail greeting. Avg detection time: 23-28s.

### Dynamic variables passed per call

From `_dispatch_only.cjs` / `elevenlabs_trigger_call.cjs`:

```json
{
  "lead_name": "Rosalia Cosio",
  "company_name": "GoodLife Tulum",
  "website_url": "https://goodlifetulum.com",
  "city": "Tulum",
  "lead_email": "rosalia@goodlifetulum.com",
  "offer": "B"
}
```

**Bug:** if `lead_name` is missing, ElevenLabs returns `failed` immediately with `Missing required dynamic variables in first message`. Always pass `lead.name || "allá"` as fallback. Verified 9/100 test calls had this bug pre-fallback.

---

## 4. TWILIO INTEGRATION

**Account SID prefix:** `AC72ce14...` | **Balance:** $31.93 USD | **Cost per minute (MX mobile):** ~$0.024/min

**Number:** `+52 998 387 1618` | Friendly name: "529983871618" | SID: `PN62b3ad78ab3c268cccf7a9230cb7fc46` | Capabilities: voice=true, sms=**false** | Voice URL: `https://api.elevenlabs.io/twilio/inbound_call`

### CRITICAL: SMS capability disabled on Twilio number

The voice-only number cannot send SMS. Any code using `TWILIO_FROM` for SMS reminders will silently fail. The `TWILIO_SMS_FROM` alias bug in `telegramHelper.js` was fixed 2026-04-20 (task #12) but the number itself still lacks SMS. **To add SMS later:** buy an A2P 10DLC-compliant US long code or a separate MX SMS-enabled number.

### Twilio call log snapshot (today, 2026-04-21)

```
Total: 50 calls outbound
  completed: 33 (avg 5s, max 53s)
  failed:    12 (avg 0s — never connected, no error_code returned)
  no-answer:  5 (rang out)
Cost today: $0.30
```

### ⚠️ THE ZOMBIE BUG — Twilio vs ElevenLabs duration divergence

**Observed discrepancy** (same call `+529982931591`):
- Twilio duration: **0-1 seconds**
- ElevenLabs duration: **300 seconds**, 0 messages, terminated by max_duration

**Root cause:** When a MX mobile carrier returns silent dead-air (disconnected number, voicemail with no greeting), Twilio ends its leg in <1s but ElevenLabs doesn't detect the SIP disconnect and keeps the Sofia session alive until `max_duration_seconds` expires. This is a real ElevenLabs↔Twilio edge case, not a config bug.

**Mitigations shipped:**
1. `max_duration_seconds: 90` on all agents (was 300-600) → zombie waste capped at 90s
2. `initial_wait_time: 1` → agent speaks immediately instead of waiting for user voice
3. `silence_end_call_timeout: 15` + `soft_timeout: 8` → faster close on silence (only helps AFTER first turn)

**Still-unsolved:** 0-message zombies still hit the 90s cap. Real fix requires one of:
- **Option A (recommended):** Wire Twilio `StatusCallback` webhook (currently unset on the number) to ping a Cloud Function when Twilio detects hangup. Function then calls ElevenLabs `DELETE /v1/convai/conversations/{id}` to force-close the orphaned session. Latency: ~1-2s vs current 90s.
- **Option B:** Maintain a `bad_phones` blocklist. After 2 consecutive zombies on the same number, flag `phone_leads.{id}.do_not_call = true`. Preserves future $ but doesn't solve new-number discovery.
- **Option C:** Pre-validate numbers via Twilio Lookup API (`$0.005/number`) before dialing. Would filter disconnected/invalid numbers but won't catch voicemail-with-no-greeting.

---

## 5. FIRESTORE SCHEMA

### `phone_leads/{digits-only-phone}` — 57 docs (all phone_verified)

```js
{
  phone: "+529988859022",              // E.164 format
  name: "Rosalia Cosio",
  first_name: "Rosalia",
  last_name: "Cosio",
  company: "GoodLife Tulum",           // alias of company_name
  company_name: "GoodLife Tulum",
  email: "rosalia@goodlifetulum.com",
  website: "https://goodlifetulum.com",
  city: "Tulum",
  position: "Broker Owner",
  source: "dataforseo_maps_2026-04-19",
  seeded_at: Timestamp,
  phone_verified: true,                // HARD FILTER for dialer
  do_not_call: false,                  // HARD FILTER for dialer
  google_rating: 4.8,
  score: 87,                           // lead_finder v4 score 0-100
  last_called_at: Timestamp,           // coldCallRun updates
  last_conversation_id: "conv_8201...",// coldCallRun updates
  last_offer: "B"                      // coldCallRun updates
}
```

**Sources:** `leadFinderAutoTopUp` (daily DataForSEO Maps + Hunter enrichment), `seedPhoneLeadsOnce` (one-shot hardcoded list).

### `call_queue/{YYYY-MM-DD}/leads/{leadId}` — 50/day

```js
{
  lead_id, phone, name, company, email, website, city,
  offer: "A" | "B" | "C",              // uniform-random
  agent_id: "agent_6601...",
  status: "queued" | "dialed" | "failed",
  dialed_at: Timestamp,
  conversation_id: "conv_8201..."      // after dial
}
```

### `call_queue_summaries/{YYYY-MM-DD}` — 1/day

```js
{
  date: "2026-04-21",
  source_pool: 57,                     // eligible phone_leads
  total: 50,                           // prepped
  prep_at: Timestamp,
  run_at: Timestamp,
  fired: 50, failed: 0,
  offer_counts: { A: 16, B: 19, C: 15 },
  // after 13:00 report:
  positive: 3, negative: 12, neutral: 15, pending: 20,
  audits_queued: 3
}
```

### `call_analysis/{conversation_id}` — one per dial

```js
{
  lead_id, phone, offer, agent_id, date_key: "2026-04-21",
  outcome: "pending" | "positive" | "negative" | "neutral" | "unconnected",
  fired_at: Timestamp,
  on_demand: true,                     // if fired outside scheduled cron
  // after elevenLabsWebhook fires:
  duration_secs, message_count, termination_reason,
  transcript: [...], classifier_reasoning: "..."
}
```

**Outcome classifier (in `elevenLabsWebhook`):**
- `positive`: lead said yes to CTA (book call / agree to audit / confirm interest)
- `negative`: lead actively declined or asked to stop calling
- `neutral`: short conversation with no clear signal
- `unconnected`: 0 messages (zombie) or voicemail_detection fired
- `pending`: seeded at dial time but webhook hasn't fired yet (should resolve within 30s post-call)

---

## 6. REPORTING PIPELINE

### Slack reports (Block Kit, `#all-jegodigital`)

`coldCallSlackMorning` (12:30) + `coldCallSlackAfternoon` (18:30) both render identical Block Kit:

```
🟢 Cold Call Report — Morning (2026-04-21)
┌─────────────────────────────────────┐
│ Total dialed: 50    Zombies: 31    │
│ Positives:     3    Voicemails: 20 │
│ Negatives:    12    Success rate:3%│
│ Neutrals:     15                    │
├─────────────────────────────────────┤
│ Verdict: 🟡 1-2 positives           │
│ By offer: A=1pos B=2pos C=0pos     │
├─────────────────────────────────────┤
│ Top 5 positives:                    │
│   Rosalia (B) — conv_8201kpreky0...│
│   Jose (A)    — conv_8401kqf5h1x...│
│   ...                               │
├─────────────────────────────────────┤
│ First 3 failures:                   │
│   +529842705274 — Missing lead_name│
│   ...                               │
└─────────────────────────────────────┘
```

**Slack webhook env var:** `SLACK_WEBHOOK_URL` (in `website/functions/.env` + GH Secrets). Fallback: Telegram if missing.

### Telegram alerts (`coldCallLiveMonitor`, every 3 min during call windows)

Three alarm types, anti-spammed via `cold_call_monitor_alarms/{30-min-slot}`:

1. **Failure spike:** `failed/(dialed+failed) > 30%` with ≥10 attempts → "🚨 Cold call failure rate at 47% — X/Y failed"
2. **Stall:** Last `dialed_at` older than 8 min mid-window with queue non-empty → "⏸️ Dialer stalled — no dials in 8 min, 23 queued"
3. **Pending backlog:** `call_analysis.outcome=pending` count > 25 → "⚠️ elevenLabsWebhook lagging — 27 pending analyses"

### On-demand report

```bash
curl "https://us-central1-jegodigital-e02fb.cloudfunctions.net/coldCallSlackOnDemand?date=2026-04-21&window=morning"
```

Response: `{ ok: true, slack: {...}, date, window, totals }`

---

## 7. KNOWN ISSUES + FIXES

### 🔴 OPEN — Zombie calls (31% of today's batch)

**Symptom:** Call shows on ElevenLabs as 90s with 0 messages, termination `exceeded maximum duration`. Twilio side shows 0-1s duration. Real cost per zombie: ~$0.02 Twilio + 0 ElevenLabs chars (agent never spoke).

**Current mitigation:** Hard 90s cap (was 300-600s). Waste reduced 70%.

**Next fix to ship:**
1. **Wire Twilio `StatusCallback`** on `+529983871618` → new Cloud Function `twilioCallStatusCallback` → when Twilio reports `completed/failed/no-answer`, immediately call `DELETE /v1/convai/conversations/{conversation_id}` (need to pass convId via Twilio call params or cross-reference by phone+timestamp).
2. **Add `bad_phones` auto-blocklist** — after 2 zombies on same number, flip `phone_leads.{id}.do_not_call = true` automatically in `coldCallReport`.
3. **Pre-validate via Twilio Lookup API** ($0.005/number × 50/day = $0.25/day) in `leadFinderAutoTopUp` before adding to pool.

### 🟡 OPEN — `call_analysis.outcome=pending` lingers after call ends

**Symptom:** 61 docs today still `pending` at 12:00. `elevenLabsWebhook` signed but may not be firing reliably.

**Root cause candidates:** Webhook HMAC validation not yet wired (task #45). Possible ElevenLabs webhook retries failing silently.

**Next fix:** Read last 10 webhook payloads from `webhook_events` collection. Check if payloads are landing but classifier is crashing.

### 🟡 OPEN — 3% success rate is low

**Context:** Of 100 calls, only 3 ran to the CTA successfully. Most "completed" calls are human hangups (12%) or voicemails (20%).

**Next fixes to consider:**
1. **Sharper opener hook** — current "Hola, ¿hablo con {{lead_name}}?" is polite but forgettable. Try variant: "Hola {{lead_name}}, soy Sofia. Le hablo por su inmobiliaria {{company_name}}. ¿Tiene 20 segundos?" (name-drops them, disarms with time box).
2. **Call lists quality** — 43/57 leads called in last 7 days means we're cycling the same pool. Need `leadFinderAutoTopUp` to target fresher cities (Mérida, Cozumel, Puerto Vallarta) — check `CITY_ROTATION`.
3. **Time-of-day split** — 10:00 CDMX may catch too many at morning meetings. Test 14:00 or 17:00 with one offer (B) for A/B against morning slot.
4. **Offer C (Free Setup)** hook needs shortening — current pitch leans on "speed to lead" stats that land flat on cold calls. Try: "Le instalo gratis un sistema que contesta sus leads de WhatsApp en 30 segundos, sin compromiso." (concrete, fast, reciprocity trigger).

### ✅ RESOLVED — `silence_end_call_timeout: -1` default

Fixed 2026-04-21. All 3 agents now at `silence_end_call_timeout: 15`. Note: this only helps AFTER first turn, so doesn't solve dead-air zombies.

### ✅ RESOLVED — `initial_wait_time: null` caused agent to never speak

Fixed 2026-04-21. Set to `1` on all 3 agents. Agent now speaks first_message at t=1s on connect. **Validation gotcha:** ElevenLabs rejects `0`; valid range is `-1 | 1-300`.

### ✅ RESOLVED — ElevenLabs PATCH silently drops invalid bodies

Fixed by ALWAYS GET'ing the agent after PATCH to verify. Never trust the PATCH response body (returns `null` for fields in diffs, which looks like success).

### ✅ RESOLVED — `coldCallRunAfternoon` query missed stranded `queued`

Fixed 2026-04-20 — afternoon retry now includes `status in ["no_answer","failed","dialed","queued"]`.

### ✅ RESOLVED — `BATCH_SIZE=50 × FIRE_INTERVAL=12s = 600s > timeoutSeconds=540`

Known risk but historically only fires 43-47 before Firebase v1 timeout kills the function. Acceptable loss — remaining 3-7 leads get picked up by afternoon retry.

### ✅ RESOLVED — `TWILIO_SMS_FROM` alias bug

Fixed 2026-04-20 — `telegramHelper.js` was reading an env var that was never set. Real var is `TWILIO_FROM`.

### ✅ RESOLVED — Dynamic variable `lead_name` missing crashes call

Fixed — all dispatch scripts now use `lead.name || "allá"` fallback. Still seeing 9/100 historical calls with this error from earlier runs.

---

## 8. DIAGNOSTIC PROCEDURES

### Before every new session — 30-second health check

```bash
cd /Users/mac/Desktop/Websites/jegodigital/website/functions
KEY=$(grep ELEVENLABS_API_KEY .env | cut -d= -f2 | tr -d '"')
SID=$(grep TWILIO_ACCOUNT_SID .env | cut -d= -f2 | tr -d '"')
TOK=$(grep TWILIO_AUTH_TOKEN .env | cut -d= -f2 | tr -d '"')

# 1. ElevenLabs credit
curl -s "https://api.elevenlabs.io/v1/user/subscription" -H "xi-api-key: $KEY" | jq '{tier, used:.character_count, limit:.character_limit, pct:(.character_count/.character_limit*100)}'

# 2. Twilio balance
curl -s "https://api.twilio.com/2010-04-01/Accounts/$SID/Balance.json" -u "$SID:$TOK" | jq '{balance, currency}'

# 3. All 3 agent timeouts (should be initial_wait_time=1, silence=15, max=90)
for AID in agent_6601kp758ca4fcx8aynsvc0qyy5k agent_7001kpcxketqewvt87k4mg6vp569 agent_2801kpcxmxyvf36bb2c970bhvfk4; do
  curl -s "https://api.elevenlabs.io/v1/convai/agents/$AID" -H "xi-api-key: $KEY" | \
    jq "{agent: \"${AID: -12}\", initial_wait: .conversation_config.turn.initial_wait_time, silence_end: .conversation_config.turn.silence_end_call_timeout, soft_to: .conversation_config.turn.soft_timeout_config.timeout_seconds, max_dur: .conversation_config.conversation.max_duration_seconds}"
done

# 4. Last 10 calls outcome
curl -s "https://api.elevenlabs.io/v1/convai/conversations?page_size=10" -H "xi-api-key: $KEY" | \
  jq -r '.conversations[] | "\(.conversation_id[-12:]) \(.status) \(.call_duration_secs)s \(.message_count)msg \(.termination_reason)"'
```

### Fire a test batch of N calls

```bash
cd /Users/mac/Desktop/Websites/jegodigital/website/functions
export ELEVENLABS_API_KEY=$(grep ELEVENLABS_API_KEY .env | cut -d= -f2 | tr -d '"')
node _dispatch_only.cjs 5      # 5-call test batch
# Wait ~2 min for all to complete (max 90s each + buffer)
```

### Monitor a live batch

```bash
# Replace IDS with the conversation IDs from the dispatch output
KEY=$(grep ELEVENLABS_API_KEY .env | cut -d= -f2 | tr -d '"')
watch -n 15 "curl -s 'https://api.elevenlabs.io/v1/convai/conversations?page_size=10' -H 'xi-api-key: $KEY' | \
  jq -r '.conversations[] | select(.conversation_id | test(\"fqgbq|jvpb3|wwt7e\")) | \"\(.conversation_id[-12:]) \(.status) \(.call_duration_secs)s \(.message_count)msg \(.termination_reason // \"...\")\"'"
```

### Pull a single conversation in detail (when debugging a specific zombie)

```bash
CID=conv_8201kpreky0veex8xdsx0aqjd7jf
curl -s "https://api.elevenlabs.io/v1/convai/conversations/$CID" -H "xi-api-key: $KEY" | \
  jq '{status, duration: .metadata.call_duration_secs, reason: .metadata.termination_reason, direction: .metadata.phone_call.direction, number: .metadata.phone_call.external_number, transcript_len: (.transcript | length), first_3: .transcript[0:3]}'
```

### Correlate ElevenLabs convo to Twilio call (for the zombie SIP bug)

```bash
# Twilio call log for today, same phone
PHONE_URL="%2B52998..."  # URL-encoded phone
TODAY=$(date -u +%Y-%m-%d)
curl -s "https://api.twilio.com/2010-04-01/Accounts/$SID/Calls.json?To=$PHONE_URL&StartTime%3E=$TODAY" -u "$SID:$TOK" | \
  jq -r '.calls[] | "\(.sid[-10:]) \(.status) dur=\(.duration)s err=\(.error_code // "-")"'
```

### PATCH agent config (with verification)

```bash
AID=agent_7001kpcxketqewvt87k4mg6vp569
curl -X PATCH "https://api.elevenlabs.io/v1/convai/agents/$AID" \
  -H "xi-api-key: $KEY" -H "Content-Type: application/json" \
  -d '{"conversation_config":{"turn":{"initial_wait_time":1,"silence_end_call_timeout":15},"conversation":{"max_duration_seconds":90}}}'
sleep 1
# ALWAYS GET TO VERIFY — PATCH returns 200 with all-null body even on invalid input
curl -s "https://api.elevenlabs.io/v1/convai/agents/$AID" -H "xi-api-key: $KEY" | \
  jq '.conversation_config.turn, .conversation_config.conversation'
```

### Emergency stop — pause the dialer

```bash
# Disable the cron temporarily
gcloud scheduler jobs pause firebase-schedule-coldCallRun-us-central1 --location=us-central1 --project=jegodigital-e02fb
# Re-enable:
gcloud scheduler jobs resume firebase-schedule-coldCallRun-us-central1 --location=us-central1 --project=jegodigital-e02fb
```

---

## 9. KEY FILES

| File | Purpose |
|---|---|
| `website/functions/coldCallAutopilot.js` | 3 cron fns: `coldCallPrep`, `coldCallRun`, `coldCallReport` + afternoon variants |
| `website/functions/coldCallLiveMonitor.js` | Every-3-min watchdog (failure spike, stall, backlog) |
| `website/functions/coldCallSlackReport.js` | `coldCallSlackMorning`, `coldCallSlackAfternoon`, `coldCallSlackOnDemand` |
| `website/functions/seedPhoneLeadsOnce.js` | One-shot phone_leads seeder |
| `website/functions/leadFinderAutoTopUp.js` | Daily 08:00 phone_leads replenishment |
| `website/functions/index.js` (L1983-2000) | Exports all cold-call fns |
| `website/functions/index.js` (L894-1000) | `elevenLabsWebhook` post-call ingest |
| `website/tools/elevenlabs_trigger_call.cjs` | Manual 1-off dial with `--offer=A|B|C` |
| `website/tools/elevenlabs_list_agents.cjs` | List all agents in account |
| `website/tools/elevenlabs_get_agent.cjs` | Pull full config for one agent |
| `website/tools/elevenlabs_check_phone.cjs` | List registered phone numbers |
| `website/tools/audit_elevenlabs_calls.cjs` | Audit call history + zombie detection |
| `website/functions/_dispatch_only.cjs` | Ad-hoc N-call test dispatcher (NOT in git — rebuild each session) |
| `_phone_leads_seed_data.js` | Hardcoded DIAL_READY list |

---

## 10. ALWAYS-RECOMMENDED NEXT STEPS

Ordered by ROI. Ship these in order unless Alex redirects.

### HIGH ROI (ship this week)
1. **Wire Twilio `StatusCallback`** → new `twilioCallStatusCallback` Cloud Function → force-close orphaned ElevenLabs conversations on Twilio hangup. Expected: cut zombie waste by 80% (from 90s cap to ~3s actual).
2. **Ship `bad_phones` auto-blocklist** in `coldCallReport`: any number with 2 consecutive zombies → `do_not_call=true`. Preserves pool quality over time.
3. **Fix `call_analysis.outcome=pending` backlog** — 61 pending today means webhook isn't classifying. Pull webhook logs, verify HMAC, check classifier errors.
4. **A/B test sharper opener** on Offer A — deploy variant: "Hola {{lead_name}}, le hablo por {{company_name}}. ¿Tiene 20 segundos?" vs current. Let `autopilotReviewer` pick the winner after 40 dials.

### MEDIUM ROI (ship in 2 weeks)
5. **Twilio Lookup API pre-validation** in `leadFinderAutoTopUp` — filter disconnected numbers before adding to pool. Cost: $0.25/day. Saves: ~15 zombies/day.
6. **Add a 2nd Twilio number** — current 1 number bottlenecks concurrent calls at ~4 (Creator plan) and wastes wait time. Second number doubles throughput.
7. **SMS follow-up after voicemail** — when `termination_reason: voicemail_detection`, send auto-SMS "Hola, le llamé hace un momento. ¿Tiene 2 minutos para hablar? — Alex JegoDigital". Needs SMS-enabled number (see §4).

### LOW ROI (ship only when high-ROI is done)
8. **Time-of-day split test** — dial 25 at 10:00, 25 at 17:00 with same offer. Currently all at 10:00.
9. **Per-city opener variants** — "Miami real estate" opener differs from "Cancún turístico" opener. Requires prompt-per-city wiring.
10. **Callback-scheduling tool** — if lead says "llámame mañana", agent writes to `callback_schedule` → `coldCallPrep` honors these next day.

### WATCH — don't touch unless flagged
- **ElevenLabs Creator plan** — 131K chars/month ≈ 150 calls/day at 95K used now. **Will need Pro upgrade** by mid-May if we scale to 100+/day.
- **Twilio balance** — $31.93 currently, burns ~$0.60/day at 50 calls. **Auto-refill trigger at $15.**
- **phone_leads pool** — 57 verified, 43 called in last 7d. `leadFinderAutoTopUp` HARD_FLOOR=100 is BELOW current pool — something's wrong with the top-up. Investigate if pool drops below 50.

---

## 11. SAMPLE CONVERSATION (for reference — what good looks like)

**Offer A success, conv_8401kqf5h1x... (54s, 7 messages):**

```
[agent] Hola, ¿hablo con Jose Fernandez?
[user]  Sí, ¿quién habla?
[agent] Soy Sofia de JegoDigital. Le hablo porque noté que su inmobiliaria no aparece cuando busco "inmobiliarias en Cancún" en ChatGPT. ¿Tiene 30 segundos?
[user]  Eh, dime rápido.
[agent] Perfecto. Hacemos que su sitio aparezca en Google, ChatGPT y Perplexity sin pagar publicidad. GoodLife Tulum logró 300% más tráfico. ¿Le agendo 15 minutos con Alex el jueves?
[user]  Mándame info por correo primero.
[agent] Claro. Le envío la información al correo que tenemos. Si le interesa, agende en calendly.com/jegoalexdigital/30min. Gracias Jose, que tenga buen día.
[user]  Gracias, bye.
[termination_reason] Call ended by remote party
```

---

## 12. OPEN TASKS REFERENCE

See `TaskList` in session context for live status. Currently pending from cold-call work:
- #7 Consolidate duplicate env var aliases (low priority cleanup)
- #8 Remove dead env var references (low priority cleanup)
- #9 Extend dailyDigest to write STATUS.md daily at 07:30 CDMX
- #13 Decide on 4 optional secrets
- #35 Rewrite Brevo Automation #8 + route cold-call leads correctly

New tasks discovered this session (create before next run):
- Wire Twilio StatusCallback → twilioCallStatusCallback function
- Ship bad_phones auto-blocklist in coldCallReport
- Diagnose elevenLabsWebhook pending backlog (61 pending today)
- A/B test sharper Offer A opener

---

## APPENDIX — Critical credentials (full list in `ACCESS.md`)

| Var | Where |
|---|---|
| `ELEVENLABS_API_KEY` | `website/functions/.env`, GH Secrets |
| `TWILIO_ACCOUNT_SID` | `website/functions/.env`, GH Secrets |
| `TWILIO_AUTH_TOKEN` | `website/functions/.env`, GH Secrets |
| `TWILIO_FROM` | `+529983871618` (voice only) |
| `SLACK_WEBHOOK_URL` | `website/functions/.env`, GH Secrets |
| `TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID` | `website/functions/.env`, GH Secrets |
| Firebase service account | `/Users/mac/Desktop/Websites/jegodigital/jegodigital-e02fb-a05ae4cb7645.json` (gitignored) |

---

**End of COLDCALL.md.** When in doubt, read the memory file `elevenlabs_silence_timeout_fix.md` for the latest zombie-fix details, then run the 30-second health check in §8.
