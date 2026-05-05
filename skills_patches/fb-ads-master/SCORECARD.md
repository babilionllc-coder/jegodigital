# SCORECARD.md — The 7-axis 10/10-floor scoring rubric

> **Why this exists:** every paid-ad creative must score 10/10 on EVERY axis (HR-14). Floor scoring (lowest axis = the verdict). The total is informational only. A 9/9/9/9/9/9/9 = 63/70 is NOT ship-ready — it's 7 axes that each need 1 point of work.

> **Who scores:** the INDEPENDENT scorer agent (HR-14.1). The same agent that built the creative cannot honestly score it. Phase 5 of `BUILD_CHECKLIST.md` is the gate.

> **Source rubric:** this file consolidates `skills_patches/ad-creative-scorer/scoring_rubric.md` + `skills_patches/fb-ad-creative-builder/scorecard_template.md` into ONE expert reference for `fb-ads-master`.

---

## 🎯 The 7 axes at a glance

| # | Axis | Question | Hardest violation |
|---|---|---|---|
| 1 | Rule compliance | Does the artifact honor Rules 17, 18, 19 + JEGODIGITAL_LOCKS.md? | Banned phrase visible |
| 2 | Specificity | Is it research-grounded with a sourced stat? | Could be lifted to any industry |
| 3 | Empathy | Their pain + our help, no pitch? | Generic human-pain (sleep, time, stress) |
| 4 | Tone authenticity | Would Alex actually say this on his iPhone? | ChatGPT-y corporate jargon |
| 5 | CTA clarity | One ask, low friction, visible button? | Multiple CTAs / pill button / no button |
| 6 | Engagement potential | Stop-scroll factor at 11pm thumb? | Wall of text / decorative imagery |
| 7 | Audience clarity | 2-second test passes? | Wrong-industry visual code |

---

## 🛑 Ship gate (Rule 14 + Rule 23)

| Use case | Floor required | If floor < required |
|---|---|---|
| **Paid Meta/FB ad** | **floor = 10** (every axis) | REBUILD that axis. NO 9s allowed. |
| Organic IG / TikTok / YouTube | floor ≥ 9 | Minor fix on the 9-axis |
| Landing page / case study | floor ≥ 8 | Minor fix |

**Floor = min(all 7 axes).** Total = informational only. 7 axes at 9 = REBUILD all 7 (each is 1 point short).

---

## Axis 1 — Rule compliance (10-point anchored examples)

| Score | What it looks like |
|---|---|
| **10** | Header includes `JegoDigital — Agencia de Marketing con IA para Inmobiliarias, Desarrolladores y Brokers`. Body uses ≥3 collaboration words. Zero banned sales phrases. Zero em-dashes (except brand mark). Zero AI tells. All stats traceable to verified source. |
| **8** | All of above except header is buried (small footer instead of top banner) OR collaboration vocab present but only 1-2 instances. |
| **5** | Mandatory header missing OR banned sales phrase visible OR em-dash in body OR stat without source. |
| **2** | Multiple rule violations: missing header AND banned phrases AND unsourced stats. |

### Verbatim disqualifiers (any one drops to 5 or below)
- "100% money back" / "money-back guarantee"
- "limited time" / "spots filling fast" / "last chance"
- "Cash buyer" claims without source
- "Trojan Horse" or "Free Setup" client-facing
- Em-dash anywhere visible (except brand mark "JegoDigital — Agencia...")
- AI tells: "game changer", "level up", "unlock", "leverage", "synergy"
- Stat shown but unverifiable from `docs/case-studies/`

---

## Axis 2 — Specificity (research-grounded?)

| Score | What it looks like |
|---|---|
| **10** | Names a specific client (Flamingo / Sur Selecto / Living Riviera Maya / GoodLife / Goza / Solik). Cites a city/zone. Shows a real stat (88% leads automated · 4.4× search visibility · 5.0★ Google · #1 Maps). Uses a real screenshot (Path A) or branded template clearly framed as "Tu próximo CRM" (Path B). |
| **8** | Specific client + stat + city, but stat is rounded ("around 90 days" vs. "90 days") OR visual is stock RE photo instead of client screenshot. |
| **5** | Mentions "real estate clients" generally. No client named. Stat is industry-average ("most clients see 3× more leads") instead of case-specific. |
| **2** | "Inmobiliarias gain advantage with AI" — no client, no city, no stat. Could apply to any agency. |

**Anti-pattern flag:** if the creative could be lifted (swap "real estate" → "dentists") and still work — Specificity ≤ 4. Real specificity means the creative would NOT work for any other industry.

---

## Axis 3 — Empathy (their pain + our help, no pitch)

| Score | What it looks like |
|---|---|
| **10** | Observational opener about their reality ("Inmobiliarias en Cancún están automatizando WhatsApp 24/7 — y los que no, pierden leads en findes"). Mentions collaboration ≥1 time. Reads like Alex talking to a friend at coffee, not a vendor pitching. Soft ask. |
| **8** | Observational opener present but slightly tilted toward us ("We help inmobiliarias..."). Collaboration vocab present but lighter. |
| **7** | Observation correct but phrased as problem statement ("Inmobiliarias pierden leads de noche"). Borders on pain-prodding. Reads more "we have the answer" than "we collaborate to figure it out." |
| **5** | Pitch-energy headline ("Increase your leads 3× with AI"). Empathy implied at best. Reads like a sales page. |
| **2** | Aggressive sales copy ("Don't lose another lead — start now!"). Pain-prodding. Banned-phrase territory. |

**The dormir disaster:** Axis 3 = 7 because the empathy was aimed at generic human pain (sleep) without anchoring to real-estate reality (lost weekend leads, slow WhatsApp response, manual follow-up burnout).

**Anchoring rule:** if the empathy is aimed at a generic human pain (sleep, time, stress) without anchoring to specific real-estate reality — Axis 3 = 7 max.

---

## Axis 4 — Tone authenticity (Alex on phone)

| Score | What it looks like |
|---|---|
| **10** | Casual mexa Spanish. Spanglish OK if natural ("está chido", "es muy premium ¿verdad?"). Sentences 2-15 words, not 30+. No "usted". No corporate jargon. No em-dashes. Sounds like a phone message, not an email. |
| **8** | Mostly there but 1-2 phrases trend formal ("permítame compartir", "le invitamos"). |
| **5** | Reads like corporate brochure. "Synergy / leverage / elevate / unlock". Long compound sentences. |
| **2** | Sounds like ChatGPT. AI tells everywhere. "In today's fast-paced real estate market..." |

**Read-aloud test:** mentally voice the copy. If you hesitate or stumble — Tone ≤ 7.

---

## Axis 5 — CTA clarity + low friction

| Score | What it looks like |
|---|---|
| **10** | One ask. WhatsApp tap (lowest friction). Visible CTA button at bottom in WhatsApp green or JegoDigital gold. Full-width (80-100% canvas). Opt-in tone ("Si te interesa..." / "Cuando quieras..."). No urgency. |
| **8** | One ask but slightly buried (small button or below-fold). |
| **7** | Positioning line presented as CTA ("Cuando ustedes ganan, nosotros ganamos") — that's brand, not CTA. OR no CTA button visible (text-only ask). OR pill button (Pattern 13 of `FAILURES_TO_AVOID.md`). |
| **5** | Multiple CTAs ("Visita el sitio · Agenda llamada · Sigue en IG"). Decision fatigue. |
| **2** | No CTA at all. Or urgency ("limited time"). |

### Friction tier reference (lowest = best)
1. WhatsApp tap (phone-to-phone, instant) -- prefer this
2. IG DM
3. Calendly book (medium — requires desktop or 2-step mobile)
4. Form fill (highest)

The WhatsApp number `+52 998 202 3263` or `wa.me/529982023263` link is the strongest CTA for Mexican RE prospects.

---

## Axis 6 — Engagement potential (stop-scroll factor)

| Score | What it looks like |
|---|---|
| **10** | First 0.5 sec answers "why stop?" — a number ("88%"), a face, a phone with real conversation, a high-contrast headline. Curiosity hook ("Cómo Flamingo logró cerrar 88% sin tocar"). Mobile-readable at 375px. WCAG AA contrast. |
| **8** | Stops most thumbs but hook is announcement-y ("Servicios de marketing inmobiliario"). |
| **5** | No clear hook. Decorative imagery. Headline = brand-positioning, not curiosity. |
| **2** | Wall of text. Stock RE photo with no text overlay. |

**Mobile test:** view at 375px width (iPhone 12 mini). Is the headline readable? Is the audience text legible? If you have to squint — Engagement ≤ 7.

---

## Axis 7 — Audience clarity (Rule 22 — 2-second test)

| Score | What it looks like |
|---|---|
| **10** | Top header reads `JegoDigital — Agencia de Marketing con IA para Inmobiliarias, Desarrolladores y Brokers`. Visual includes a real-estate code (building, Maps with RE pin, listing card with sq m + MXN, agent on phone, dashboard showing properties, blueprint, key, Vendido sign). Stranger answers "real estate" in <2 sec, confidently. |
| **8** | Audience text present but in 14-16px footer instead of top banner. Visual is RE but small or secondary. Stranger gets there in 3-4 sec. |
| **7** | Audience text exists but BURIED inside chat bubble, paragraph, or small caption. RE visual present but mixed with non-RE imagery. Stranger says "marketing? AI?" but not "real estate". |
| **5** | Audience text missing or not visible without zooming. Visual generic (abstract gradient, generic dashboard, stock laptop). Could be for any industry. |
| **2** | No audience signal. No RE visual. Generic consultancy / "business" framing. |

### Disqualifiers (any one drops Axis 7 to 5)
- Wrong-industry visual code (the dormir moon = sleep app code)
- "Inmobiliarias" / "real estate" text only inside body paragraph
- Header says "JegoDigital" but doesn't say "para inmobiliarias / desarrolladores / brokers"
- Visual is purely abstract (gradients, particles, "AI brain" art)

### The 2-second test, formalized
1. Cover body copy with hand.
2. Look at header + visual + tagline only for ~2 sec.
3. Question: "What is this ad for?"
4. Acceptable: "real estate", "real estate marketing", "inmobiliarias", "agentes inmobiliarios", "brokers", "developers".
5. Unacceptable: "AI", "marketing agency", "tech", "sleep app", "dating", "consulting".
6. Unacceptable answer → Axis 7 ≤ 5.

---

## How to compute the verdict

```
floor = min(all 7 axes)
total = sum(all 7 axes)

For paid Meta/FB ads (Rule 23 / HR-14):
  floor == 10 → ✅ SHIP
  floor == 9  → ❌ REBUILD that axis (NO 9s for paid — Alex's directive)
  floor ≤ 8   → ❌ REBUILD that axis (or multiple)

For organic IG/TikTok/YouTube (Rule 21):
  floor ≥ 9 → ✅ SHIP
  floor == 8 → ⚠️ Minor fix
  floor ≤ 7 → ❌ REBUILD

For landing pages / case studies (Rule 21 relaxed):
  floor ≥ 8 → ✅ SHIP
  floor ≤ 7 → ❌ REBUILD
```

**Total is informational only. Floor is the verdict.**

---

## Common scoring traps (do NOT fall into these)

1. **"The rest is great, this axis is fine."** No. Lowest = floor.
2. **"It's mostly there."** Score what's actually there, not what was almost there.
3. **"The brief was solid, so the creative must be solid."** Brief and execution are separate. Score the execution.
4. **"The previous self-score was 10, mine is 9 — close enough."** No. Score from scratch. Anchor-bias kills this skill.
5. **"It's better than v1, so it's a 10."** Better than failure ≠ ship-ready.
6. **"The CTA is implied."** Implied CTA = 7 max. Visible button = 9-10.
7. **"The audience text is in the chat bubble."** Buried in a chat bubble = Axis 7 max 7.
8. **"This stat is industry-standard."** Unsourced = Specificity max 5.

---

## Output template (independent scorer must produce this exact format)

```markdown
# Independent score — <creative_slug>

**Use case:** paid Meta Lead Form ad
**Scorer:** Claude (independent — separate agent from builder per HR-14.1)
**Method:** vision via Read tool on PNG (or ffmpeg keyframe extraction for MP4)
**Date:** <YYYY-MM-DD>

| Axis | Score | Rationale (verbatim observation) |
|---|---|---|
| 1. Rule compliance | _/10 | ... |
| 2. Specificity | _/10 | ... |
| 3. Empathy | _/10 | ... |
| 4. Tone authenticity | _/10 | ... |
| 5. CTA clarity | _/10 | ... |
| 6. Engagement potential | _/10 | ... |
| 7. Audience clarity | _/10 | ... |

**Floor:** _/10
**Total:** _/70
**Verdict:** ✅ SHIP / ❌ REBUILD axis(es) <list>

## Rebuild prompts (if any axis < 10)

### Axis <N> rebuild prompt (verbatim — to be quoted in next render)
> ...

(Repeat per failing axis.)

## 🎯 Next step / ⏳ ETA / 🤝 Need from Alex
```

---

## When to escalate (brief mismatch, not execution gap)

If a single creative needs ≥4 axes rebuilt, the BRIEF is wrong (not the execution). Escalate to Alex with: "Brief mismatch. The visual concept can't reach 10/10 on these axes without changing the concept. Recommend re-briefing with [specific direction]."

If across a batch ≥30% of creatives have inflation gaps ≥3 floor levels vs the builder's self-score, flag a process pattern. The builder workflow needs Phase 5 (this scorecard) hardened.

---

**End of SCORECARD.md.** Continue to `BUILD_CHECKLIST.md` per `boot_sequence`.
