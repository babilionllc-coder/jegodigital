# Audit_Trojan_MX_v1 — Deployment Report

**Date:** 2026-04-18 22:54 CST
**Status:** ✅ Campaign built, 11 leads enrolled, awaiting your activation

---

## WHAT SHIPPED

### 1. Campaign in Instantly
- **Name:** `Audit_Trojan_MX_v1`
- **ID:** `e526d5db-ee92-4b0d-9944-49ba47b587af`
- **Status:** Draft (status=0) — **you need to flip it to Active when ready**
- **Schedule:** Mon–Fri, 09:00–17:00 (America/Chicago = Mexico CST)
- **Daily limit:** 60 emails/day
- **Sending pool:** 8 accounts (aichatsy.com × 2, jegoaeo.com × 3, jegoleads.com × 3)
- **Open tracking:** ON | **Link tracking:** OFF | **Stop on reply:** ON

### 2. 5-Step Spanish Sequence (copy approved, loaded into Instantly)
| # | Day | Subject | Words | Hook |
|---|----|---------|------|-----|
| 1 | 0 | Auditamos {{website}} | 62 | Personalized audit with their PSI + mainIssue |
| 2 | +4 | Recordatorio | 68 | "1/20 agencies pass 85/100" stat |
| 3 | +9 | Caso real | 77 | Flamingo 90-day case study |
| 4 | +16 | ¿Error mío? | 44 | Pattern interrupt / referral ask |
| 5 | +23 | Último mensaje | 49 | Breakup — "responde audit" |

**Variables used:** `{{firstName}}`, `{{companyName}}`, `{{website}}`, `{{city}}`, `{{pageSpeed}}`, `{{mainIssue}}` — all populated from the v4 pipeline per-lead audit data.

### 3. v4 Pipeline (lean single-file: `lead_finder_v4_lean.py`)
Rebuilt to survive filesystem resyncs. Flow per lead:
1. SerpAPI Maps discovery (fallback: DataForSEO)
2. Domain blocklist (41 enterprise domains: CBRE, Colliers, JLL, Remax, portals, socials…)
3. Hunter domain search (no seniority filter; gate in code)
4. Owner-title / real-name gate (Iron Rule 7)
5. Hunter email verify → skip undeliverable
6. PageSpeed Insights audit (mobile) → score + LCP + main issue
7. Lead scoring 0–100 with 60-point gate
8. Stream to Google Sheet (`Audit_Trojan_MX_2026-04-18` tab)
9. Upload to Instantly with `skip_if_in_workspace` dedup

### 4. 100-Lead Pipeline Run
Cities: Cancun × Playa del Carmen × Tulum × CDMX × Guadalajara × Monterrey

| Metric | Value |
|---|---|
| Raw discovery candidates | 105 |
| Passed all gates | 23 (21.9%) |
| Uploaded to Instantly | 23 (API 200) |
| Actually enrolled in campaign | 11 |
| Deduplicated (already in other campaigns) | 12 ✓ correct behavior |
| Avg PageSpeed (enrolled) | 45.5 / 100 |
| PageSpeed range | 0–75 |

### 5. Google Sheet
[JegoDigital Lead Pipeline 2026 → tab `Audit_Trojan_MX_2026-04-18`](https://docs.google.com/spreadsheets/d/1uBRDCqz43l0ZI3k5U-msB1-x11kYiQ1FYMmiyVdC6P8)

All 23 processed leads streamed live with audit data, score, gate result, and personalization JSON.

---

## TOP 5 STRONGEST HOOKS (lowest PageSpeed = most urgent pain)

| PS | Company | Contact | Hook |
|---:|---|---|---|
| 21 | Misión Obispado (MTY) | Julio | PageSpeed crítico — pierdes ~60% de visitantes |
| 23 | GDL Propiedades | Omar | PageSpeed crítico — pierdes ~60% de visitantes |
| 35 | Century 21 Caribbean (Playa) | Albane | Tiempo de carga 8.0s — 40% abandonan |
| 37 | Eproperties Luxury (Tulum) | Adriana | Tiempo de carga 27.8s — 40% abandonan |
| 54 | Love Tulum Eco Developments | David | Tiempo de carga 18.2s — 40% abandonan |

---

## WHAT YOU NEED TO DO

### Before activating (required)
1. **Review the sequence copy** — `audit_trojan_mx_v1_sequence.md` or open the campaign in Instantly UI
2. **Verify sending accounts are warm** — Instantly → Accounts → confirm all 8 are green
3. **Flip status to Active** — UI: campaign → Launch. Or let me do it via API if you want.

### Before you can deliver on the audit promise
The AI reply agent is configured to say "audit in 60 min" on positive reply. That audit-delivery pipeline is NOT yet automated for this campaign. Options:
- **Manual for first 2 weeks:** when a lead replies positively, you/Claude run seo-engine + email the PDF manually
- **Automate:** build the auto-audit → Brevo transactional email delivery pipeline (already scoped for Offer B in cold-calling; same system can serve here)

### Scaling past 11
To get to 100 enrolled, the dedup filter means we need to source fresh domains not already in the workspace. Options:
- Expand to more cities (Mérida, Puebla, Querétaro, San Luis Potosí, Chihuahua, Tijuana)
- Expand niche (`corredor inmobiliario`, `bienes raíces`, `desarrolladora inmobiliaria`)
- Run again tomorrow — SerpAPI returns slightly different results each day

I can kick off another batch targeting 5 new cities when you're ready.

---

## FILES CREATED THIS SESSION

| File | Purpose |
|---|---|
| `lead_finder_v4_lean.py` | Single-file pipeline (survives resyncs) |
| `create_audit_trojan_campaign.py` | Reproducible campaign creation |
| `run_audit_trojan_mx_batch.py` | 6-city batch runner |
| `audit_trojan_mx_v1_sequence.md` | Approved copy reference |
| `audit_trojan_mx_v1.json` | Campaign ID store |
| `audit_trojan_mx_run_report.json` | Machine-readable run data |

---

## CREDITS USED (approximate)

- SerpAPI Maps: ~6 searches (one per city)
- Hunter.io domain search: ~80 calls
- Hunter.io verifier: ~35 calls
- PageSpeed Insights: ~25 audits
- Instantly API: 1 campaign + 23 lead uploads

Plenty of budget left for the next batch.
