# 🚀 JegoDigital Slack Command Center — Install Guide (Phase 1)

> **Last updated:** 2026-04-29 · Phase 1 ship · maintained by Claude
> **What this gets you:** 8am Cancun daily brief in `#daily-ops`, three slash
> commands (`/daily`, `/lead`, `/status`), and three auto-channels (`#deploys`,
> `#hot-leads`, `#errors`).

---

## 1️⃣ Install the Slack app (one click — 2 min) 🎯

Open this magic URL — it pre-fills the manifest and creates the app in your workspace:

**👉 [https://api.slack.com/apps?new_app=1](https://api.slack.com/apps?new_app=1)**

1. Click **Create New App** → **From a manifest**
2. Pick the **JegoDigital** workspace
3. Paste the contents of [`slack/jegodigital-app-manifest.yaml`](./jegodigital-app-manifest.yaml) into the YAML pane
4. Click **Next** → **Create**
5. On the app page, click **Install to Workspace** → **Allow**

You now have:
- A bot user **JegoBot**
- Three slash commands wired to `slackSlashCommand` Cloud Function
- All bot scopes needed for `chat.postMessage`

---

## 2️⃣ Copy 5 values into GitHub Secrets 🔐

Go to **github.com/babilionllc-coder/jegodigital → Settings → Secrets and variables → Actions** and add:

| Secret name | Where to find it | Notes |
|---|---|---|
| `SLACK_SIGNING_SECRET` | Slack app → **Basic Information** → "Signing Secret" → Show | Used to verify slash command requests (HMAC v0) |
| `SLACK_CHANNEL_DEPLOYS` | Slack: right-click `#deploys` → View channel details → Channel ID | Format: `C09XXXXXXX` — create the channel first if it doesn't exist |
| `SLACK_CHANNEL_ERRORS` | Slack: right-click `#errors` → channel ID | Used by `onDisasterLogged` Firestore trigger |
| `SLACK_CHANNEL_LEADS_HOT` | Slack: right-click `#hot-leads` → channel ID | (Already exists if you set it earlier — confirm.) |
| `SLACK_BOT_TOKEN` | Slack app → **OAuth & Permissions** → "Bot User OAuth Token" (`xoxb-…`) | (Already exists if you set it earlier — confirm.) |

✅ **Already in GH Secrets** (verified in `deploy.yml`): `SLACK_BOT_TOKEN`,
`SLACK_CHANNEL_DAILY_OPS`, `SLACK_CHANNEL_ALERTS`, `SLACK_CHANNEL_LEADS_HOT`,
`NOTION_API_KEY`, `NOTION_LEADS_CRM_ID`, `GH_PAT`, `INSTANTLY_API_KEY`,
`CALENDLY_PAT`, `BREVO_API_KEY`, `ELEVENLABS_API_KEY`, `IG_GRAPH_TOKEN`.

🟡 **Only thing genuinely new:** `SLACK_SIGNING_SECRET`, `SLACK_CHANNEL_DEPLOYS`, `SLACK_CHANNEL_ERRORS`.

---

## 3️⃣ Create the 3 channels (if they don't exist) 📂

In Slack, create:
- `#deploys` — every GitHub Actions workflow_run posts here ✅❌
- `#hot-leads` — every routed Instantly reply + manual `/lead` posts here 🔥
- `#errors` — every `disaster_log` Firestore write posts here 🚨

Then **invite JegoBot** into each channel (`/invite @JegoBot`) — the manifest
includes `chat:write.public` so this isn't strictly required, but it's
cleaner.

---

## 4️⃣ Smoke test ✅

After GitHub Secrets are saved and the next push to `main` deploys the
functions, try these:

```
/status              → one-liner pipeline health
/daily               → reposts the morning brief in current channel
/lead Ana Lopez ana@inmoplaya.mx Replied to TJ V2
```

Each should respond within 3 seconds.

---

## 5️⃣ Confirmation timeline ⏰

| When | What happens |
|---|---|
| **Now** | Functions deployed to Firebase via `git push origin main` |
| **Next workflow_run** | `notify-slack.yml` posts to `#deploys` |
| **Next Instantly reply** | `instantlyReplyRouter` cross-posts to `#hot-leads` |
| **Next disaster_log write** | `onDisasterLogged` posts to `#errors` |
| **Tomorrow 8:00 AM Cancún** | `dailyBriefing` cron fires → Block Kit card to `#daily-ops` |

If the 8am brief doesn't land, check Cloud Logging: `gcloud functions logs read dailyBriefing --limit=50`.

---

## 🛠 Troubleshooting

| Symptom | Fix |
|---|---|
| Slash command returns 401 | `SLACK_SIGNING_SECRET` missing or wrong — re-copy from app's Basic Information page |
| Bot can't post to channel | Run `/invite @JegoBot` in that channel |
| `/lead` says "Notion CRM not configured" | `NOTION_LEADS_CRM_ID` GH Secret missing or empty |
| `#deploys` silent on green workflows | Check `notify-slack.yml` ran — Actions tab → Notify Slack on workflow_run |
| Daily brief shows "❓ data unavailable" everywhere | API key missing or expired — check `envAudit` daily report (06:00 UTC) |

---

## 🧠 Architecture (reference)

```
Slack workspace
   ├─ /daily, /lead, /status  ──► slackSlashCommand (Cloud Function)
   │                                ├─ /daily  → buildBriefing() → chat.postMessage
   │                                ├─ /lead   → Notion API + Firestore mirror
   │                                └─ /status → Firestore + Instantly count
   │
   ├─ #daily-ops  ◄── dailyBriefing cron (0 13 * * *  America/Cancun)
   │                   └─ pulls live: Instantly · Calendly · Brevo · ElevenLabs
   │                                  · IG · Firestore · GitHub · Cloud Billing
   │
   ├─ #hot-leads  ◄── instantlyReplyRouter.routeReply() cross-post
   │                   └─ also: /lead command writes here
   │
   ├─ #errors     ◄── onDisasterLogged Firestore trigger (disaster_log/{id})
   │
   └─ #deploys    ◄── notify-slack.yml (GH Actions workflow_run)
```

All Slack posts route through `slackPost.js` which has graceful 3-tier
fallback: `chat.postMessage` → channel-ID env → `SLACK_WEBHOOK_URL`.
