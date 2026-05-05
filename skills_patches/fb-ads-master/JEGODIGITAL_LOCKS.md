# JEGODIGITAL_LOCKS.md — JegoDigital-specific brand and rule locks

> **What this is:** the JegoDigital-specific values that every paid creative must honor. These are NOT negotiable. If a future agent finds itself debating any of these — read this file again.

> **Source of truth:** `/Users/mac/Desktop/Websites/jegodigital/CLAUDE.md` (canonical), this file is the FB-ads-specific extract.

---

## 🎨 Brand colors (locked)

| Use | Hex | Role |
|---|---|---|
| Background | `#0f1115` | Near-black canvas — 60% of every creative (60-30-10 rule, primary) |
| Gold | `#C5A059` | "Jego" word, accents, CTA highlights — 10% accent (60-30-10 rule, accent) |
| White | `#FFFFFF` | "Digital" word + body copy — 30% secondary (60-30-10 rule) |

Hex values are pinned by Alex's directive 2026-04-24. Any drift (e.g. `#bf9b51`, `#0a0a1a`, `#07080c`) is wrong for paid ads. The cotización PDF uses a slightly different gradient — that is NOT the paid-ad palette.

---

## 🪪 Logo (locked)

**ALWAYS use:** `/website/images/logo/jegodigitallogo.png` (2400×700 RGBA, transparent bg, gold "JEGO" + white "DIGITAL" + tagline)

**HTML reference:**
```html
<img src="images/logo/jegodigitallogo.png" alt="JegoDigital" class="h-16 w-auto">
```

**NEVER use:** `logo1.png`, `jegologo.png`, `jegologo1.png`, `jegodigital-logo.png`, `jegodigital-logo1.png` — all deprecated.

---

## 🪧 Mandatory header on every paid ad (HR-19)

The exact text, in this order, visible at the top of every static creative or in the first 3 seconds of every video:

**Spanish (default for MX):**
```
JegoDigital — Agencia de Marketing con IA
para Inmobiliarias, Desarrolladores y Brokers
```

**English (Miami / bilingual):**
```
JegoDigital — AI Marketing Agency
for Real Estate Businesses, Agencies, and Developers
```

Validator `tools/check_collaboration_tone.sh` greps the rendered creative's accompanying copy / OCR for `JegoDigital` AND a niche keyword (`inmobiliaria` / `real estate` / `agencia` / `desarrollador` / `broker`) within the first 200 characters. Fail = block send.

> **Note on the dash:** the text uses an em-dash in the brand mark itself ONLY. Em-dashes elsewhere in the copy are banned (Rule 5 / em_dash_audit.sh). The brand-mark exception is hard-coded in the validator.

---

## 🌐 Canonical social URLs (every footer + schema sameAs)

| Platform | URL | Handle |
|---|---|---|
| YouTube | `https://www.youtube.com/@JegoDigitalchannel` | @JegoDigitalchannel |
| Instagram | `https://www.instagram.com/jegodigital/` | @jegodigital |
| TikTok | `https://www.tiktok.com/@jegodigital` | @jegodigital |
| WhatsApp | `https://wa.me/529982023263` | +52 998 202 3263 |
| Facebook | `https://www.facebook.com/profile.php?id=61581425401975` | (page ID) |
| Calendly | `https://calendly.com/jegoalexdigital/30min` | — |
| Email | `jegoalexdigital@gmail.com` | — |
| Website | `https://jegodigital.com` | — |

**NEVER use:** `youtube.com/@AlexJego`, `tiktok.com/@alex.jego`, `instagram.com/jegodigital_agencia` (interim handle, retired 2026-04-30), `instagram.com/jegodigital5` (banned).

---

## 🏆 The 4 anchor proofs (use these for paid creatives)

Per `/CLAUDE.md` HR-9 + 2026-04-27 update — this is the proof hierarchy. Use in this order:

| # | Client | Anchor stat | Best for | Source of truth |
|---|---|---|---|---|
| 1 | **Living Riviera Maya** | "Top-3 in ChatGPT for 'best real estate Playa del Carmen' · 4.9★ · 100+ reviews · since 2002" | AEO-led collaboration story | `docs/case-studies/living-riviera-maya.md` + `website/img/showcase/playadelcarmen/chatgpt-rank.png` |
| 2 | **Sur Selecto** | "AMPI Presidente Ejecutivo Playa del Carmen · 5.0★ · 4 zones (Playa/Tulum/Bacalar/Cancún) · 10+ pages indexed" | Institutional credibility (closes hesitant CMOs) | `docs/case-studies/sur-selecto.md` |
| 3 | **Flamingo** | "88% leads automated · 4.4× search visibility · #1 Google Maps Cancún · +320% organic" | AI automation proof (lead with the 88%, demote the 4.4×) | `docs/case-studies/flamingo-real-estate.md` |
| 4 | **Trojan Horse offer** | "Free Audit + AI assistant setup — collaboration pilot, you pay nothing to try" | First-touch offer (collaboration framing, not "free demo") | `BUSINESS.md` Trojan Horse section |

**HR-9 freshness rule:** these stats verify monthly. If verifiers find drift >20%, anchor is killed from cold paid copy until reverified.

**Hero placement rule (Alex 2026-04-27):** Living Riviera Maya FIRST on any homepage, landing page, pitch deck, or paid hero ad where AEO is the value prop. Sur Selecto SECOND for institutional credibility. Flamingo demoted to support.

**Verified domains (cite URL ONLY for these):**
- Flamingo: `realestateflamingo.com.mx`
- Living Riviera Maya: `playadelcarmenrealestatemexico.com`
- Sur Selecto: `surselecto.com`
- RS Viajes: `rsviajesreycoliman.com` (NOT real estate — never use in RE ads)
- TT&More (NOT real estate — never use in RE ads)

**NO verified domain:** Goza, GoodLife, Solik. Stats may be cited (sourced from `docs/case-studies/`), URLs may NOT.

---

## 🚫 Banned phrases (HR-17 collaboration tone — hard fail)

The following words/phrases trigger an immediate ship block in `validator_scripts/ai_tells_lint.sh`:

**Sales pitch phrases:**
sell · pitch · buy · deal · offer · package · price · upgrade · discount · risk-free · 100% guarantee · money-back · limited time · spots left · last chance · urgent · don't miss · close · purchase · sign · contract

**AI tells / corporate jargon:**
game changer · level up · leverage · synergy · unlock · elevate · in today's fast-paced world · delve into · comprehensive · robust · revolutionize · seamless · cutting-edge · best-in-class

**Banned trademarks (client-facing — internal jargon only):**
Trojan Horse · Free Setup (use "collaboration pilot" or "audit gratuito" client-facing) · Sofia (when describing the agent to non-clients — internal codename)

**Numeric specifics without source tag:** any `$X` / `MXN X` / `X%` without a ✓ tag in the brief = banned.

---

## ✅ Required collaboration vocabulary (HR-17 — every paid ad)

Every paid creative body must include ≥3 words from this list:

colaboramos · colaboración · colabora · partner · partnership · juntos · platicamos · armar · armamos · construimos · co-creamos · cuando ustedes ganan, nosotros ganamos · cuando tú ganas, nosotros ganamos · learn · aprender · explorar · curious · open · genuine · share · happy to · we'd love to · alongside · feedback · co-build · honest

For Spanish-language ads (default for MX), prefer the Spanish forms above. English equivalents OK for Miami/Caribbean luxury.

---

## 📐 Mandatory copy structure (3-line collaboration body)

Every paid creative body opens with these 3 lines, in this order:

1. **Acknowledge their world** (specific, observational, present tense): _"Inmobiliarias en Cancún están automatizando WhatsApp 24/7."_
2. **Mention partnership + specific case** (small cohort, learning posture): _"Estamos colaborando con Flamingo — 88% inbound automatizado en 90 días."_
3. **Soft CTA** (no urgency, no pitch): _"Si te interesa entender qué armamos, platicamos por WhatsApp."_

The 2-line variant (for Reels overlays / 10-char headline placements):
1. Acknowledge: _"WhatsApp lleno, equipo cansado."_
2. Soft CTA: _"Platicamos."_

---

## 🏢 Real-estate visual codes (mandatory in every creative — HR-13 / Axis 7)

The 2-second test only passes if the visual contains ≥1 of these codes:

- Building silhouette / city skyline / condo tower (Cancún, Playa, Tulum profiles preferred)
- Property listing card with MXN/USD price + sq m
- Real estate agent on phone (face is OK if from real client photo)
- For-sale sign / "Vendido" sign
- Property keys
- Architectural blueprint
- Map pin on a property (Google Maps screenshot OK if from showcase library)
- Dashboard with property listings (CRM-style)
- Open-house calendar
- WhatsApp conversation with property inquiry visible

**Bias:** prefer real client screenshots from `website/img/showcase/<client>/` over stock illustrations. Per Alex's two-path policy (2026-04-24):
- **Path A** (named client): real screenshot ONLY (never fabricate a mockup with a client's name)
- **Path B** (capability-only, no client named): branded template OK, framed as "Tu próximo CRM"

**Banned visuals:** abstract gradients · "AI brain" art · particle systems · stock laptop on desk · generic dashboard · moon (sleep code, see FAILURES_TO_AVOID.md) · clock · hourglass.

---

## 🆔 Meta account IDs (live, verified 2026-04-27 via `meta-ads-jegodigital` skill)

| Asset | ID | Notes |
|---|---|---|
| Ad Account | `act_968739288838315` | USD currency, ACTIVE, business `jegodigital` (1837835950184415) |
| Business Manager | `1837835950184415` | "jegodigital" |
| Page | `766570479879044` | "JegoDigital", Marketing Agency |
| Pixel | `2356041791557638` | Installed on jegodigital.com — **CAPI NOT yet wired (HR-FB-2 blocker)** |
| App | `1158470596156733` | "Jegodigital new" — needed for OAuth re-auth |
| Lead Form | `942858358503290` | Auditoría JegoDigital — Inmobiliarias 2026-04 |
| Brevo list | `41` | "FB Lead Form — Hiring Intent 2026-04" |
| Webhook | `https://us-central1-jegodigital-e02fb.cloudfunctions.net/metaLeadFormWebhook` | Verify token: `jegodigital_meta_lead_verify_2026_x9k` |

For audit/build/scale work, ALWAYS verify these are still live via Meta Graph API before touching anything (HR-2 universal verify-live).

---

## 🔗 Cross-references

- **Source of truth (slim):** `/CLAUDE.md`
- **Full rule bodies:** `/CLAUDE_RULES.md`
- **Disaster log (grep before risky moves):** `/DISASTER_LOG.md`
- **Memory index:** `/agent/memory/MEMORY.md`
- **Tone bible:** `/BLUEPRINT.md §16`
- **Collaboration playbook:** `/docs/playbooks/collaboration_outreach_playbook_2026.md`
- **Validators:** `/skills_patches/fb-ad-creative-builder/validator_scripts/` + `/tools/check_collaboration_tone.sh`

---

**End of JEGODIGITAL_LOCKS.md.** Continue to `FAILURES_TO_AVOID.md` per `boot_sequence`.
