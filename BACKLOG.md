# JegoDigital — BACKLOG (P4 parking lot)

> **What goes here:** any task / idea / experiment that is **not** in Bucket A (close clients this week) or Bucket B (generate leads this week) or even Bucket C (raise conversion).
> **Rule:** do NOT work on anything in this file until `NEXT_STEP.md` P0-P3 queue is empty (HARD RULE #3).
> **Updated:** when Alex drops a cool idea that doesn't fit today's priorities, it lands here, not in NEXT_STEP.md.

---

## 🧪 Experiments to try (once revenue exists)

- White-label pitch to 3 non-competing agencies (full stack licensing at $40K-$60K MXN/mo)
- Developer contracts for new Cancún/Tulum condo launches ($80K-$200K MXN one-time)
- Performance-based pricing ($2K base + $500/qualified lead)
- Expand to Miami luxury market (bilingual already a fit)
- TikTok organic funnel for Alex's founder brand (@alexjegodigital)
- Long-form YouTube channel (@JegoDigitalchannel) — case study + process videos
- Podcast appearances — "one-person AI agency" angle

## 🛠️ Tooling ideas (nice to have)

- Unified weekly dashboard (React + Firestore) showing all 8 platform metrics on one page
- Auto-generated Monday Slack digest (replaces manual HR#7 execution)
- Slackbot for triaging Instantly replies (/triage command)
- CRM Firestore collection with unified lead state across Instantly + ElevenLabs + ManyChat
- Automated proposal generator (triggered on positive Calendly show-up)
- Visual regression test for jegodigital.com (Playwright snapshots on main push)

## 📚 Content ideas (queue for `seo-content-engine`)

- "ChatGPT vs. Google Search para inmobiliarias en México" (AEO-flavored)
- "Cómo automatizar el seguimiento de leads con IA" (Service 1 evergreen)
- "El verdadero costo de un lead perdido en WhatsApp"
- "Posicionamiento local: por qué Google Maps es más importante que Google en 2026"
- "Guía 2026 de IA generativa para agentes inmobiliarios"

## 🧹 Tech debt (fix when P3 is empty)

- Consolidate `_imported_skills/` + `.claude/skills/` into single location
- Migrate Firestore audit_requests to dedicated `audits` collection (schema cleanup)
- Add JSON schema validation to Cloud Function payloads
- Add structured logging (pino) to all Cloud Functions — replace console.log
- Add error budget dashboard in Grafana (or simpler alternative)
- Automated test suite for cold-email pre-ship gates (lead quality script)

## 💡 Random ideas (not prioritized)

- Chrome extension: "Am I losing leads on this page?" overlay for brokers
- WhatsApp group for closed clients only — community + referrals
- Monthly "State of AI in Mexican Real Estate" newsletter (Brevo)
- Referral program: 1 month free for each client a client refers
- Partnership with Canva / Notion for real estate templates

---

## 🚫 Rejected / no-go (here so we don't re-propose)

- Apollo.io / Clay.com for lead sourcing — banned per HARD RULE (Lead Finder v4 is 100% DIY stack)
- Postiz for publishing — expired subscription, dead
- n8n public API — free trial blocks it
- Meta Business Suite Chrome automation — unreachable from MCP
- instagram.com web login — password rules block it
- Generic stock photos (Unsplash/Pexels) in blog posts — NO-AI-IMAGES rule
- Pricing on WhatsApp/email/cold outreach — Calendly-only
- Asking Alex to run `git push` or `firebase deploy` — autonomous Git Data API path only
