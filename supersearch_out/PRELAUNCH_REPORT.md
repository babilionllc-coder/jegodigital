# Audit_Trojan_MX_Supersearch_v1 — Pre-Launch Report

**Report generated:** Sunday, April 19, 2026 — 18:09 UTC (12:09 CST / Mexico City)
**Session window:** April 19, 2026 — 17:57 UTC → 18:06 UTC (11:57 → 12:06 CST)
**Campaign ID:** `51074dc9-fce9-4a20-b8a0-4f283ac52177`
**Status:** DRAFT — awaiting Alex's "flip to active" approval
**Final lead count:** 80 unique, audited, enriched

---

## Execution timeline (April 19, 2026 — all times UTC / CST)

| UTC | CST | Event |
|---|---|---|
| earlier | earlier | Supersearch enrichment runs (test 50 + pull 150) → 155 leads land in list `a26e3dab...` |
| earlier | earlier | PSI audit on 124 unique domains, `custom_variables` PATCHed onto list copies |
| 17:57:43 | 11:57 | `POST /leads/move` job created (`69e51797dbeda018256eda80`), source=list → dest=campaign |
| 17:57:44 | 11:57 | Move job completed: **136 leads moved**, 19 stuck in list (no email — un-emailable) |
| 18:00:50 | 12:00 | Re-PATCH of `custom_variables` on 136 campaign leads (later discovered the data was already in `payload.*`) |
| 18:02:05 | 12:02 | Live render test: confirmed Instantly's `{{var}}` template reads from `payload.*` |
| 18:03:xx | 12:03 | Overlap audit vs. 4 active campaigns → **56 dupes found** with Trojan Horse + Auditoría Gratis |
| 18:04:xx | 12:04 | `DELETE /leads/{id}` × 56 → all 56 dupes purged |
| 18:05:xx | 12:05 | Final verification: 80 unique leads, 100% var coverage, 0% overlap |
| 18:09 | 12:09 | This report generated |

---

## Scope Reality Check — 155 requested → 80 shippable

| Step | Count | Reason |
|---|---|---|
| Supersearch enriched into list | 155 | ran on `pid_free` tier |
| Missing email (can't contact) | −19 | Supersearch couldn't verify work email |
| Moved to campaign | 136 | via `/leads/move` with `list_id` source |
| Duplicate of Trojan Horse / Auditoría Gratis (active) | −56 | would have double-emailed same person |
| **Final unique, emailable, non-dup** | **80** | |

The 41% overlap with existing active campaigns is the main finding. Supersearch's `skip_owned_leads` dedups at COMPANY level, not email — that's why the conflict slipped through. We'll need to be tighter on this next pull.

---

## Variable coverage (what actually matters)

Sequence uses: `firstName`, `companyName`, `website`, `pageSpeed`, `mainIssue`, `city`

| Variable | Coverage | Status |
|---|---|---|
| `{{firstName}}` | 80/80 (100%) | ✓ |
| `{{companyName}}` | 80/80 (100%) | ✓ |
| `{{website}}` | 80/80 (100%) | ✓ |
| `{{pageSpeed}}` | 80/80 (100%) | ✓ |
| `{{mainIssue}}` | 80/80 (100%) | ✓ |
| `{{city}}` | 80/80 (100%) | ✓ |

**Discovery:** Instantly stores custom vars under `payload.*`, not `custom_variables`. The template renderer reads `{{pageSpeed}}` from `payload.pageSpeed`. First PATCH worked; my audit was looking in the wrong field. Documented in the scripts.

---

## Name quality — Iron Rule 7 exception engaged

- **Fake/generic first names: 0/80 (0.0%)**
- Sample: Manu, Jerónimo, Gerardo, Susan, Miguel Angel, Ross Edward, Antonio, Ricardo, Héctor, Roman
- **`Hola {{firstName}},` greeting is SAFE on this list** (verified, not scraped-generic)

This is the Supersearch data-quality dividend — Hunter lists need `Hola,` because ~15% are admin/info/sales addresses, but Supersearch LinkedIn enrichment has real human names.

---

## PSI score distribution — pitch hook quality

| Bucket | Count | % |
|---|---|---|
| <30 (critical) | 6 | 7.5% |
| 30–49 (bad) | 28 | 35.0% |
| 50–69 (mediocre) | 27 | 33.8% |
| 70–89 (decent) | 6 | 7.5% |
| 90+ (great) | 3 | 3.8% |
| 0 (no site / blocked) | 10 | 12.5% |

**76% (61 of 80) have PageSpeed <70** → the `{{pageSpeed}}/100 - {{mainIssue}}` hook lands hard. This is why the Trojan Horse audit angle works better on this cohort than a generic SEO pitch.

---

## Sequence config (cloned from Audit_Trojan_MX_v1)

| Step | Subject | Delay | Words | Vars used |
|---|---|---|---|---|
| 1 | `Auditamos {{website}}` | 0d | 48 | city, firstName, mainIssue, pageSpeed, website |
| 2 | `Recordatorio` | +4d | 67 | firstName, pageSpeed, website |
| 3 | `Caso real` | +5d | 71 | companyName, firstName, website |
| 4 | `¿Error mío?` | +7d | 38 | companyName, firstName, website |
| 5 | `Último mensaje` | +7d | 42 | firstName, website |

**Rules compliance:**
- No Calendly link in any step ✓
- No bracket placeholders ✓
- No URLs in body ✓
- Greeting `Hola {{firstName}},` safe (Iron Rule 7 exception) ✓
- Subject ≤3 words ✓ (except Step 1's personalized subject)
- All 5 steps built ✓ (42% of replies come from 2–5)

---

## Sending config

| Setting | Value | Notes |
|---|---|---|
| Accounts | 8 (aichatsy × 2, jegoaeo × 3, jegoleads × 3) | mix of domains — no lookalike overlap |
| Daily limit | 60 | ~7.5/account/day — well inside warmup-safe limits |
| Stop on reply | True | |
| Stop on auto-reply | True | |
| Open tracking | True | |
| Link tracking | null | (no links anyway) |
| Schedule | Weekdays 9:00–17:00 America/Chicago | |
| Bounce protect | default (ON) | `allow_risky_contacts` unset |

**Gap:** `stop_for_company` is unset. If two leads from the same agency exist in the list, both get sequenced. Only 1-per-company via Supersearch's `show_one_lead_per_company=True`, so this is mostly moot here.

---

## Overlap audit (dedup check)

Checked against all 4 other active campaigns:
- US-Hispanic-Bilingual-Audit (46 leads) — **0 overlap** ✓
- Trojan Horse — Captura de Leads Gratis (834 leads) — **53 overlap** → **PURGED**
- Auditoría Gratis — Tu Sitio Web (1169 leads) — **56 overlap** → **PURGED**
- Campaign F - WhatsApp AI (137 leads) — **0 overlap** ✓

56 unique duplicates removed. Campaign is now zero-overlap with all active outbound.

---

## What's left for you

1. **Log into Instantly → Audit_Trojan_MX_Supersearch_v1 → Review sequence in UI** (sanity check that Step 1 renders right on the first lead preview)
2. **Flip to Active** when ready

Estimated daily throughput: 60/day ÷ 80 leads × 5 steps = full sequence delivery over ~7 weekdays = entire list completes in ~2 weeks.

**Attribution setup:** when replies come in, the campaign name `Audit_Trojan_MX_Supersearch_v1` vs `Audit_Trojan_MX_v1` is the A/B label — compare reply rate delta to answer "does Supersearch-level personalization (city + pageSpeed) beat Hunter-level (name + company only)?"

---

## Artifacts produced in this session

All saved under `/supersearch_out/` on April 19, 2026:

| File | What it is |
|---|---|
| `PRELAUNCH_REPORT.md` | This report |
| `psi_results.json` | Raw PSI data for 124 unique domains |
| `psi_summary.json` | PSI enrichment summary stats |
| `move_lead_ids.json` | The 155 lead IDs queued for move |
| `move_result.json` | Move operation result |
| `src_campaign_config.json` | Original `Audit_Trojan_MX_v1` config (clone source) |
| `new_campaign_id.txt` | `51074dc9-fce9-4a20-b8a0-4f283ac52177` |

Scripts (reproducible):
- `/supersearch_test_enrich.py` — Supersearch 50-lead test
- `/supersearch_psi_enrich.py` — PSI audit + PATCH pipeline
- `/supersearch_move_leads.py` — List → campaign move
- `/supersearch_repatch_vars.py` — Re-PATCH custom vars post-move
