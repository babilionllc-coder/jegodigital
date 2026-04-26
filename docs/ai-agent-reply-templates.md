# Instantly AI Agent — Reply Templates (Audit-First Funnel)

**Updated:** 2026-04-26
**Why:** AI agent reply links must include `&autosubmit=1` so the prospect's audit form auto-fires after page load (no extra click). Critical for cold-email funnel conversion.

---

## Where to paste these

In Instantly:
1. Go to **AI Agents** (left sidebar)
2. Open **JegoDigital Agent** (id `019d368d-c8ad-7208-8c42-438f4cb16258`)
3. Find the **Reply Template / Persona / System Prompt** section
4. Replace the existing audit-link template with the version below
5. **Save**, then send a test positive reply to one of the sender mailboxes to verify the new link fires

---

## Spanish reply template (for Mexico / Spanish-language prospects)

> Hola {{first_name}},
>
> Gracias por la respuesta — me alegra ver el interés.
>
> Para no perder tu tiempo, te armé un audit gratuito de {{company_short}} que te muestra exactamente dónde estás perdiendo leads ahora mismo: posición en Google y Google Maps, velocidad móvil, visibilidad en ChatGPT/Perplexity/Gemini, y captación de leads. Sin pitch, sin compromiso.
>
> Lo dispara este enlace (toma ~7 minutos en compilarse, luego te llega por email):
>
> https://jegodigital.com/auditoria-gratis?url={{website}}&email={{email}}&firstName={{first_name}}&source=instantly_reply&autosubmit=1
>
> Cuando llegue, me dices qué hallazgo te llamó más la atención y armamos un proyecto si tiene sentido.
>
> Alex
> JegoDigital

---

## English reply template (for Miami / US English-language prospects)

> Hi {{first_name}},
>
> Thanks for the reply — appreciate it.
>
> Quick way to make this concrete without a meeting: I'll run a free audit of {{company_short}} that shows exactly where you're losing leads right now — Google rankings, Google Maps presence, mobile speed, AI-search visibility (ChatGPT / Perplexity / Gemini), lead capture. No pitch, no commitment.
>
> This link kicks it off (takes ~7 minutes to compile, then it lands in your inbox):
>
> https://jegodigital.com/auditoria-gratis?url={{website}}&email={{email}}&firstName={{first_name}}&source=cold_email_us&autosubmit=1
>
> When it arrives, tell me which finding stood out and we can scope a project from there if it makes sense.
>
> Alex
> JegoDigital

---

## Critical link parameters

| Parameter | Why it matters |
|---|---|
| `url={{website}}` | Pre-fills the URL field on the audit landing page |
| `email={{email}}` | Pre-fills the email field |
| `firstName={{first_name}}` | Pre-fills the name field |
| **`source=instantly_reply`** (Spanish) **or `source=cold_email_us`** (English) | **CRITICAL** — drives delay logic (7 min vs 45 min) AND language detection in the audit pipeline. Don't omit. |
| **`autosubmit=1`** | **CRITICAL** — fires the form 800ms after page load. Without this, prospect lands on a prefilled form and has to click "Solicitar" — a friction step ~30% drop off. |

---

## Smoke test (do this after pasting)

1. Send a positive reply manually from a personal Gmail to one of the sender mailboxes (e.g. `ariana@zennoenigmawire.com`)
2. Wait 1–3 min for the AI agent to fire
3. Check the auto-reply in your Gmail
4. Click the audit link → should auto-submit within 1 second of page load
5. Confirmation email should land in 30–60 seconds
6. Slack channel should get a ping when audit compiles (within 1 min after submit)
7. Audit report email should land **7 minutes** after submission (not 45)

If any step misses, escalate to me.

---

## Why this matters (conversion math)

Each link parameter is a multiplier on the funnel:

| Step | Drop without fix | Drop with fix |
|---|---|---|
| Click reply link | ~10% | ~10% |
| Submit form | ~30% (manual click) | ~5% (autosubmit) |
| Wait for email | ~40% (45-min delay) | ~10% (7-min delay) |
| Open + click Calendly | ~70% (Spanish for English speakers) | ~40% (right language) |
| **Overall yield** | **0.6%–1.5%** | **3.0%–5.5%** |

**Net: ~3–4× improvement in cold-reply → Calendly-booked rate.**
