# Skill Patch — `instantly-cold-outreach` Reply Playbook v2.2

**Patch date:** 2026-04-29
**Apply to:** `skills/instantly-cold-outreach/SKILL.md` — Reply Mechanics section
**Source of truth:** `docs/playbooks/cold_email_reply_playbook_2026.md`
**Router:** `website/functions/instantlyReplyRouter.js` v2.2
**Replaces:** v2.1 reply guidance (the "demo video + Calendly" close)

---

## What changed

v2.1 wrapped every positive reply with **6 close elements**: ack + geo proof + demo URL + 2 anchor times + Calendly + WhatsApp. Research (Tarvent / Sendspark / Instantly 2026 benchmarks) shows that adding a second link dilutes the Calendly CTA by ~371%. v2.2 strips the demo URL and tightens to a **single CTA = Calendly** with 2 anchor times stacked on top.

| | v2.1 (old) | v2.2 (current) |
|---|---|---|
| Close elements | 6 | 5 |
| Demo video URL | ✅ injected per campaign | ❌ removed entirely |
| Anchor times | 2 (3pm + 11am next biz days) | 2 (3pm + 11am next biz days) |
| Calendly link | ✅ | ✅ (single CTA) |
| WhatsApp number | MX only — `+52 998 202 3263` | MX only — `+52 998 202 3263` |
| Word target | 80–120 | 60–80 (hard ceiling 90) |
| Sign-off | `Alex` / `JegoDigital` (2 lines) | `Alex / JegoDigital` (1 line) |

---

## The v2.2 reply structure (research-backed)

For BUY / TECH_Q / EXPLORE intent, compose:

1. **1-line acknowledgment** ("Thanks for the reply." / "Gracias por la respuesta.")
2. **1-line geo-matched proof** (PROOF_BANKS table below)
3. **2 anchor times** — next 2 business days, 3pm + 11am, prospect's timezone
4. **Calendly link** — `https://calendly.com/jegoalexdigital/30min`
5. **WhatsApp** — `+52 998 202 3263` (**MX only** — omit for Caribbean/Miami/US/EN markets)
6. **Sign-off** — `Alex / JegoDigital` (one line, no full name, no title)

**Hard ceiling:** ≤ 90 words. Target 60–80. Single CTA principle. NO demo video link.

---

## PROOF_BANKS (verified, HR-0 compliant)

| Geo | Language | Proof string |
|---|---|---|
| MX | es | `Flamingo Real Estate (Cancún) automatizó 88% de leads inbound y subió 4.4x su visibilidad.` |
| MX | en | `Flamingo Real Estate (Cancún) automated 88% of inbound leads and lifted visibility 4.4x.` |
| CARIBBEAN | en | `We've automated 88% of inbound for similar agencies in the region.` |
| CARIBBEAN | es | `Automatizamos el 88% del inbound para agencias similares en la región.` |
| MIAMI | en | `Solik (Miami bilingual real estate) gets 24/7 EN+ES auto-capture and pulled 3 ready-to-buy referrals their first month.` |
| MIAMI | es | `Solik (real estate bilingüe en Miami) tiene captura EN+ES 24/7 — 3 referidos listos-para-comprar en su primer mes.` |
| FALLBACK | en | `We've automated 88% of inbound for real estate agencies + 4.4x search visibility for our flagship case.` |
| FALLBACK | es | `Automatizamos el 88% del inbound para inmobiliarias + 4.4x visibilidad orgánica en nuestro caso insignia.` |

Re-verify monthly per HR#9. If any client metric drops >20%, alert + remove from copy until reverified.

---

## Reference outputs (paste-ready, verbatim from regression tests)

### Andrea / DR / English / BUY (Caribbean — NO WhatsApp)

```
Hi Andrea,

Thanks for the reply. We've automated 88% of inbound for similar agencies in the region.

Fastest path is 15 min this week:
• Thursday April 30 at 3pm CDT, or
• Friday May 1 at 11am CDT

If neither works, grab any slot: calendly.com/jegoalexdigital/30min

Alex / JegoDigital
```
49 words.

### Carlos / MX / Spanish / BUY (MX — WhatsApp included)

```
Hola Carlos,

Gracias por la respuesta. Flamingo Real Estate (Cancún) automatizó 88% de leads inbound y subió 4.4x su visibilidad.

15 min esta semana:
• Jueves 30 abril a las 3pm CDT, o
• Viernes 1 mayo a las 11am CDT

Si no, agarra slot: calendly.com/jegoalexdigital/30min
WhatsApp: +52 998 202 3263

Alex / JegoDigital
```
54 words.

### Luis / Miami / English / BUY (Miami — NO WhatsApp)

```
Hi Luis,

Thanks for the reply. Solik (Miami bilingual real estate) gets 24/7 EN+ES auto-capture and pulled 3 ready-to-buy referrals their first month.

Fastest path is 15 min this week:
• Thursday April 30 at 3pm EDT, or
• Friday May 1 at 11am EDT

If neither works, grab any slot: calendly.com/jegoalexdigital/30min

Alex / JegoDigital
```
55 words.

---

## Hard rules baked into v2.2

- ✅ NO Instantly tracking pixel
- ✅ NO ManyChat references
- ✅ NO demo URL in reply (Sendspark research: dilutes Calendly CTA)
- ✅ NO pricing in writing — Calendly only
- ✅ NO `[brackets]` placeholder leaks
- ✅ Single CTA = Calendly
- ✅ Plain-feel HTML wrapped in `<div>` (renders as plain text in Instantly)
- ✅ Same `Re:` thread on positive replies
- ✅ Sign-off `Alex / JegoDigital` — never `Alex Jego` or `Founder` / `CEO`
- ✅ WhatsApp = `+52 998 202 3263` (NEVER the deprecated `998 787 5321`)

---

## Research citations (top 5)

1. [Tarvent — Single CTA vs Multiple CTAs](https://www.tarvent.com/blog/single-cta-vs-multiple-ctas-does-choice-overwhelm-readers) — single CTA gets ~371% more clicks
2. [Instantly 2026 Benchmark](https://instantly.ai/blog/meeting-scheduling-email-length-ideal-word-count-guide/) — 50–125 words wins 2.4× over 200+
3. [Warmforge — Plain Text vs HTML](https://www.warmforge.ai/blog/plain-text-vs-html-in-cold-emails) — plain 42% open vs HTML 23%
4. [Outreaches.ai Benchmarks](https://outreaches.ai/blog/cold-outreach-benchmarks) — WA helps MX/LatAm, hurts US
5. [Sendspark — Video Outreach 2026](https://blog.sendspark.com/sales-outreach-video-essential-2026) — generic library video links: skip

Full source list: `docs/playbooks/cold_email_reply_playbook_2026.md` §"Top 10 source URLs".

---

## Migration checklist (already shipped)

- [x] `website/functions/instantlyReplyRouter.js` → v2.2 (demo URL stripped, WhatsApp MX-only)
- [x] `website/functions/test_replyRouter_v2.js` → 86/86 assertions PASS
- [x] `website/functions/postCallWhatsAppFollowup.js` → old `998 787 5321` replaced
- [x] `SYSTEM.md` cold-call template footer → `wa.me/529982023263`
- [x] `outputs/RSViajes-Reporte-Cotizacion-Abril-Mayo-2026.html` footer scrubbed
- [ ] `skills/instantly-cold-outreach/SKILL.md` reply mechanics section — apply this patch

When applying the patch to the live skill file, replace the v2.1 "Reply Mechanics" section verbatim with the **v2.2 reply structure** + **PROOF_BANKS table** + **Reference outputs** above.
