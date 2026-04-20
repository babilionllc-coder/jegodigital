# Lead Finder v4 — Enrichment-First Prospecting (2026-04-19)

> Canonical doc — SKILL.md at `/mnt/.claude/skills/lead-finder/` is read-only and still on v3.1. Treat THIS file as the v4 source of truth until the skill is rewritten next session.

---

## What Changed From v3.1 → v4.0

After 1,500+ leads uploaded across 5 campaigns (Trojan, Supersearch, Auditoría Gratis, Campaign F, US-Hispanic-Bilingual), reply rates of 0.3–0.6% exposed that basic `{{firstName}}` + `{{companyName}}` personalization is NOT enough to stand out. v4 adds a Firecrawl-driven enrichment layer to unlock 2–5% reply rates through hyper-personalized Step 1 copy.

**Hard rule:** JegoDigital NEVER uses Apollo.io or Clay.com. Our enrichment stack is 100% DIY — Firecrawl + DataForSEO + Hunter + SerpAPI + PageSpeed Insights. Any skill suggesting Apollo/Clay violates Alex's policy.

---

## New Enrichment Signals (Stage 3.5 — runs AFTER Hunter, BEFORE upload)

For every domain that passes the owner-gate, scrape the homepage + `/blog` + Instagram bio. Extract and attach to the lead as `custom_variables`:

| Signal | Source | Extraction | Example Copy Use |
|---|---|---|---|
| `activeListings` | Firecrawl homepage | Regex `property\|listing\|propiedad` card count | "Vi tus 47 propiedades activas…" |
| `daysSinceLastBlog` | Firecrawl `/blog` | First `<article>` date vs today | "Tu último blog fue hace 180 días…" |
| `instagramHandle` | Firecrawl homepage | Regex `instagram.com/([a-z0-9_.]+)` | "Vi tu IG @flamingo_re…" |
| `instagramFollowers` | Firecrawl scrape of IG public page | With `actions=[{type:'wait', ms:2000}]` | "Con 3.2K seguidores en IG…" |
| `googleRating` + `googleReviewCount` | DataForSEO Maps (stage 1) | Already returned by Maps API | "Con 4.8★ en Google (87 reseñas)…" |
| `mainStack` | Firecrawl HTML | Grep `<meta name="generator">` | (internal — informs audit) |
| `hasWhatsAppWidget` | Firecrawl HTML | Grep `wa.me` or `api.whatsapp.com/send` | "Vi que tienes WhatsApp — lo respondes 24/7?" |
| `pageSpeedMobile` | Google PSI | Cached from stage 1 if possible | "Tu sitio carga en 5.2s en móvil…" |
| `primaryCity` | Footer/contact page | Regex MX cities | Lets copy use real city, not search city |

---

## v4 Pre-Launch Checklist (MANDATORY — NEW IN v4)

Before activating any campaign that uses `{{customVar}}` in ANY step, run:

```python
def verify_var_coverage(campaign_id: str, threshold: float = 0.95) -> dict:
    """Return coverage % for every custom variable referenced in the sequence.
    BLOCKS activation if any var is below threshold."""
    import re, requests
    API = "https://api.instantly.ai/api/v2"
    KEY = "<instantly_api_key>"
    H = {"Authorization": f"Bearer {KEY}", "Content-Type": "application/json"}

    # 1. Fetch sequence, extract all {{vars}} used
    camp = requests.get(f"{API}/campaigns/{campaign_id}", headers=H, timeout=30).json()
    used_vars = set()
    for seq in camp.get("sequences", []):
        for step in seq.get("steps", []):
            for v in step.get("variants", []):
                for match in re.finditer(r"\{\{([a-zA-Z_][a-zA-Z0-9_]*)\}\}", v.get("body", "") + " " + v.get("subject", "")):
                    used_vars.add(match.group(1))
    # Built-ins don't need verification
    BUILTIN = {"firstName", "lastName", "email", "companyName", "website", "personalization"}
    custom_vars = used_vars - BUILTIN
    if not custom_vars:
        return {"status": "no_custom_vars", "coverage": {}}

    # 2. Fetch all leads, check population
    leads = []
    cursor = None
    for _ in range(100):
        body = {"campaign": campaign_id, "limit": 100}
        if cursor: body["starting_after"] = cursor
        r = requests.post(f"{API}/leads/list", headers=H, json=body, timeout=30).json()
        leads.extend(r.get("items", []))
        cursor = r.get("next_starting_after")
        if not cursor: break

    coverage = {}
    for var in custom_vars:
        filled = sum(1 for l in leads if (l.get("custom_variables") or {}).get(var))
        coverage[var] = filled / len(leads) if leads else 0

    blocked = [v for v, c in coverage.items() if c < threshold]
    return {
        "status": "OK" if not blocked else "BLOCKED",
        "coverage": coverage,
        "blocked_vars": blocked,
        "lead_count": len(leads),
    }
```

**If `status == "BLOCKED"`, DO NOT activate. Either populate the missing vars or rewrite the sequence.**

---

## Gen 2 Sender Rule (NEW — 2026-04-19)

JegoDigital's Instantly workspace has 18 accounts. Only 10 are safe for sending:

**USE THESE (10 Gen 2 managed/pre-warmed, warmup score 100):**
- `henry@zeniaaqua.org`
- `kevin@zeniaaqua.org`
- `michael@zeniaaqua.org`
- `roger@zeniaaqua.org`
- `ryan@zeniaaqua.org`
- `ariana@zennoenigmawire.com`
- `emily@zennoenigmawire.com`
- `peter@zennoenigmawire.com`
- `russell@zennoenigmawire.com`
- `william@zennoenigmawire.com`

**NEVER USE THESE (self-hosted, unsafe reputation):**
- `mail@aichatsy.com`, `contact@aichatsy.com`
- `alex@jegoaeo.com`, `info@jegoaeo.com`, `leads@jegoaeo.com`
- `alex@jegoleads.com`, `info@jegoleads.com`, `reply@jegoleads.com`

Identify them via Instantly API: `is_managed_account=true` AND `provider_code=2`. Swap enforced across all 5 active campaigns on 2026-04-19.

---

## 🔴 Disaster Log

### 2026-04-19 — Supersearch_v1 broken merge tags
- **What:** Campaign `51074dc9-fce9-4a20-b8a0-4f283ac52177` activated with 91 leads. Step 1 body referenced `{{pageSpeed}}`, `{{mainIssue}}`, `{{city}}` — 0% populated. First email rendered: `"PageSpeed: /100"` literally with blank merge tags.
- **Why:** Sequence was copy-pasted from a prior plan that assumed PSI enrichment would run before activation. It didn't.
- **Fix:** Rewrote Step 1 to use only `{{firstName}}`, `{{companyName}}`, `{{website}}` — all 100% populated. Caught before any damage.
- **Permanent rule:** v4 Pre-Launch Checklist (above) is MANDATORY. No merge tag goes into a sequence without first verifying lead coverage ≥95%.

### 2026-04-19 — Supersearch_v1 locked to killed senders
- **What:** Supersearch was configured with ONLY the 8 bad accounts (aichatsy/jegoaeo/jegoleads). Zero Gen 2 accounts. Campaign was in active state but couldn't send because all senders were unsafe.
- **Fix:** PATCHed `email_list` on all 5 active campaigns → 10 Gen 2 accounts only.
- **Permanent rule:** Every new campaign MUST be created with the 10 Gen 2 accounts as `email_list`. The 8 bad accounts must be deleted from Instantly entirely (TODO).

### 2026-04-15 — Hotel + SaaS contamination
See v3.1 note 2 in skill. 20 bad leads (Hyatt, Beacons) deleted one-by-one.

---

## TODO Before v4 Full Deploy

1. **Port the pipeline code** — `/mnt/jegodigital/lead_finder_v4_lean.py` still references `/sessions/exciting-charming-hamilton/...` paths. Rewrite with session-relative paths.
2. **Add Firecrawl enrichment signal extractors** — write Stage 3.5 functions for each signal in the table above.
3. **Delete 8 bad accounts from Instantly** (aichatsy x2, jegoaeo x3, jegoleads x3) so they can never be re-added.
4. **Run pre-launch checklist on the 4 existing live campaigns** — Trojan, Auditoría Gratis, Campaign F, US-Hispanic-Bilingual — to verify no other broken merge tags are lurking.
5. **Rewrite SKILL.md when filesystem permits** — promote this doc's content into v4.

---

## Canonical References

- v3.1 retro: `/mnt/jegodigital/LEAD_FINDER_V3_2026-04-15.md`
- v4 pipeline code (needs path fix): `/mnt/jegodigital/lead_finder_v4_lean.py`
- API keys: `/mnt/.auto-memory/api_keys_master.md`
- Gen 2 sender list: above in this doc + `/mnt/.auto-memory/instantly_gen2_accounts.md`
