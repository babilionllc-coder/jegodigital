# Memory — Schedule Architect ship (2026-05-05 PM)

## Receipt

| Phase | Outcome |
|---|---|
| Inventory | 75 live cron schedules already exist; 174 exported functions. 3 of 11 spec'd "gaps" already shipped (`dailyBriefing`, `verifyClientProofMonthly`, `slackWorkflows.logDisaster`). |
| Build | 8 new Cloud Functions written. `node --check` clean. Wired into `index.js` with `OnDemand` HTTPS twin per HR-6. |
| Deploy | Single commit `ca3074899440e29250c2f918e1a385db2f3e8b38` pushed to `main` via Git Data API (PAT). Parallel-push race occurred twice; retried each time per DEPLOY.md recipe. Deploy run `25394862913` completed `success` after Wave 2/4 commits superseded mine. All 8 file paths return HTTP 200 from GitHub contents API. |
| Verify | 2 of 8 OnDemand endpoints HTTP 200 (`cleanupWatcherOnDemand`, `duplicateLeadGuardOnDemand`). 6 returned 404 — known DEPLOY.md disaster #3 (BATCH 2 GCF rate-quota silent throttle). Resolution: empty-content NEXT_STEP push retriggers `deploy.yml` and re-deploys stragglers. |

## Files

- 8 NEW: `monthlyRulebookReview.js`, `mistakesLedgerReview.js`, `midMonthRevenueGoalReview.js`, `cleanupWatcher.js`, `weeklyDocConsolidator.js`, `quarterlyToolStackAudit.js`, `duplicateLeadGuard.js`, `toneAuditDailyDigest.js`
- 1 NEW DOC: `SCHEDULES.md` (later supplemented by Wave 4 contributor)
- 1 MOD: `website/functions/index.js` (+56 lines, wiring)

## Rule 17 lesson — structural-discipline fixes

The 6 G-1..G-6 critical gaps each replaced a rule that previously depended on someone remembering. The pattern that closed them was identical:

1. Identify HR rule with no enforcing cron (e.g. HR-9 "client proof must stay fresh")
2. Convert the rule body into a cron that pulls live data and posts Telegram + Slack
3. Add an `OnDemand` HTTPS endpoint for HR-6 verification
4. Map the cron in `SCHEDULES.md §3` so a future audit catches if the cron stops firing

The lesson:

> **Every recurring-discipline failure should become a structural cron, not a written rule.**

Tag this as `structural-discipline` next time a similar reliance-on-memory pattern shows up in DISASTER_LOG.

## Feature flags shipped (Rule 8)

Two new flags, both default-OFF:

- `CLEANUP_WATCHER_AUTO_ARCHIVE` — when "true", `cleanupWatcher` would auto-delete stale outputs / patches. Default OFF, propose-only.
- `DUP_GUARD_AUTOREMOVE` — when "true", `duplicateLeadGuard` would auto-remove duplicate Instantly leads. Default OFF, surface-only.

Both flags read from `process.env` at function cold-start. To enable, set in `website/functions/.env` + GitHub Secret of same name, redeploy.

## Open follow-up

- 🔁 Curl verification on 6 BATCH-2 stragglers after the next deploy lands.
- 📋 Update `SCHEDULES.md §0` "Total scheduled functions" count from 75 → 83 once the curl verification hits 8/8.
- 📚 Consider promoting the deploy.yml split from 2 batches to 3 if function count grows past ~200 — current quota window keeps tripping disaster #3.
