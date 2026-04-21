# COLDCALL.md — MOVED

> **This file has been folded into `SYSTEM.md` §10 on 2026-04-21.**
>
> The cold-call pipeline is now documented as part of the unified infrastructure doc to reduce bootstrap-file sprawl and keep a single source of truth for infra.

## Where to find what used to be here

| Old COLDCALL.md section | New location |
|---|---|
| 30-second overview | `SYSTEM.md` §10.1 |
| Architecture + cron table | `SYSTEM.md` §10.2 |
| ElevenLabs setup (3 Sofia agents, shared JSON config) | `SYSTEM.md` §10.3 |
| Twilio integration + zombie bug | `SYSTEM.md` §10.4 |
| Firestore schema (cold-call collections) | `SYSTEM.md` §10.5 |
| Reporting pipeline (Slack + Telegram) | `SYSTEM.md` §10.6 |
| Known issues — open + resolved | `SYSTEM.md` §10.7 |
| Diagnostic bash procedures | `SYSTEM.md` §10.8 |
| Key files reference table | `SYSTEM.md` §10.9 |
| Always-recommended next steps (ROI-ordered) | `SYSTEM.md` §10.10 |
| Sample successful conversation | `SYSTEM.md` §10.11 |

## Bootstrap order (updated)

Session bootstrap now reads 4 files (was 5):

1. `CLAUDE.md` — behavior rules + business context
2. `SYSTEM.md` — infrastructure + cold-call pipeline (this now includes COLDCALL.md content)
3. `ACCESS.md` — credentials registry
4. `DEPLOY.md` — deploy procedures

---

**Delete me** once you've verified nothing external references this path. For now, the stub stays as a pointer.
