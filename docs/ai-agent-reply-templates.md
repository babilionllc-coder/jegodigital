# Instantly AI Agent — Reply Templates (Video-First Funnel)

**Updated:** 2026-04-27 PM-LATE
**Why:** Live audit 2026-04-27 found 6/6 positive cold-email replies in last 30d say *"send me the video"* — NOT "let's book a call" or "run an audit". Funnel must lead with the VIDEO PAGE which has the Calendly widget embedded inline (no 7-min wait, instant booking option). Audit-first remains as a fallback for prospects asking for deeper analysis.

**Source:** [`docs/research/2026-04-27-PM-live-funnel-audit.md`](research/2026-04-27-PM-live-funnel-audit.md)

---

## Where to paste these

In Instantly:
1. Go to **AI Agents** (left sidebar)
2. Open **JegoDigital Agent** (id `019d368d-c8ad-7208-8c42-438f4cb16258`)
3. Find the **Reply Template / Persona / System Prompt** section
4. Replace the existing audit-link template with the version below
5. **Save**, then send a test positive reply to one of the sender mailboxes to verify the new link fires

---

## ⭐ PRIMARY — Spanish video template (for Mexico / LATAM Spanish prospects)

> Hola {{first_name}},
>
> Aquí tienes el video — 90 segundos, sin pitch:
>
> https://jegodigital.com/video?fn={{first_name}}&company={{company_short}}&email={{email}}&utm_source=instantly&utm_campaign={{campaign_name}}&utm_medium=cold_email&lang=es
>
> Es el caso de Flamingo Real Estate: pasaron de invisible en Google a #1 en Maps en su zona, con +320% de tráfico orgánico — sin gastar un peso en publicidad.
>
> Abajo del video puedes agendar 15 minutos directo en mi calendario si quieres ver qué se puede hacer para {{company_short}} específicamente. Sin compromiso.
>
> Alex
> JegoDigital

---

## ⭐ PRIMARY — English video template (for Miami / US Hispanic / English prospects)

> Hi {{first_name}},
>
> Here's the video — 90 seconds, no pitch:
>
> https://jegodigital.com/video?fn={{first_name}}&company={{company_short}}&email={{email}}&utm_source=instantly&utm_campaign={{campaign_name}}&utm_medium=cold_email&lang=en
>
> It's the Flamingo Real Estate case: went from invisible on Google to #1 on Maps in their zone, +320% organic traffic — without spending a peso on ads.
>
> Below the video you can book 15 min directly on my calendar if you want to see what's specifically possible for {{company_short}}. No commitment.
>
> Alex
> JegoDigital

---

## FALLBACK — Audit-first templates (use for prospects asking for tech details / deep analysis)

Trigger: prospect's reply asks "how does it work technically", "what's your AI stack", "do you do X for our city", or any question requiring a custom data analysis. Examples from real replies: Felix/Mudafy "Las respuestas son con chatbots? Que tipo de tecnología usan?".

### Spanish (audit-first fallback)

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

### English (audit-first fallback)

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

### Video page (PRIMARY — `/video?...`)

| Parameter | Why it matters |
|---|---|
| `fn={{first_name}}` | Personalizes hero ("Hola Felix · tu video de 90 segundos") + Calendly prefill name |
| `company={{company_short}}` | WhatsApp prefill ("soy Felix de Mudafy") + Calendly company field |
| `email={{email}}` | Calendly prefill (skip a form step) |
| `lang=es` or `lang=en` | Switches video source (ES vs EN Flamingo case) + page copy |
| `utm_source=instantly` | Source attribution — passes THROUGH to Calendly so booking is attributed |
| `utm_campaign={{campaign_name}}` | Per-campaign ROI — finally know which sequence converted |
| `utm_medium=cold_email` | Channel attribution |

### Audit page (FALLBACK — `/auditoria-gratis?...`)

| Parameter | Why it matters |
|---|---|
| `url={{website}}` | Pre-fills the URL field on the audit landing page |
| `email={{email}}` | Pre-fills the email field |
| `firstName={{first_name}}` | Pre-fills the name field |
| **`source=instantly_reply`** (Spanish) **or `source=cold_email_us`** (English) | **CRITICAL** — drives delay logic (7 min vs 45 min) AND language detection in the audit pipeline. Don't omit. |
| **`autosubmit=1`** | **CRITICAL** — fires the form 800ms after page load. Without this, prospect lands on a prefilled form and has to click "Solicitar" — a friction step ~30% drop off. |

---

## Smoke test (do this after pasting)

### Video-page smoke test (PRIMARY)

1. In a new browser, open `https://jegodigital.com/video?fn=Felix&company=Mudafy&utm_source=test&utm_campaign=smoke&utm_medium=cold_email&lang=es`
2. Verify: hero says "Hola Felix · tu video de 90 segundos"
3. Video plays (Spanish Flamingo case)
4. Calendly widget loads inline below the video — gold accent color
5. Pick a slot, fill the form, complete booking
6. Verify booking lands in Calendly with `utm_source=test`, `utm_campaign=smoke` populated (NOT empty)
7. Bonus: also test `&lang=en` — verify English copy + English video swap

### Agent-reply smoke test (after pasting in Instantly UI)

1. Send a positive reply manually from a personal Gmail to one of the sender mailboxes (e.g. `ariana@zennoenigmawire.com`)
2. Wait 1–3 min for the AI agent to fire
3. Check the auto-reply in your Gmail
4. Click the **video** link → should land on `/video?fn=YourName&...`
5. Calendly widget below should populate with UTM source = instantly + the campaign name
6. Bonus: confirm the audit-fallback link still works for tech-question replies

If any step misses, escalate to me.

---

## Why this matters (conversion math)

### Old funnel (audit-first)

Each link parameter is a multiplier on the funnel:

| Step | Drop without fix | Drop with fix |
|---|---|---|
| Click reply link | ~10% | ~10% |
| Submit form | ~30% (manual click) | ~5% (autosubmit) |
| Wait for email | ~40% (45-min delay) | ~10% (7-min delay) |
| Open + click Calendly | ~70% (Spanish for English speakers) | ~40% (right language) |
| **Overall yield** | **0.6%–1.5%** | **3.0%–5.5%** |

### New funnel (video-first)

Removes the wait-for-email step entirely. Calendly is on the same page as the video.

| Step | Old (audit-first) | New (video-first) |
|---|---|---|
| Click reply link | ~10% | ~10% |
| Submit form | ~5% (autosubmit) | n/a (no form) |
| Wait for email | ~10% (7 min) | n/a (instant) |
| Watch video | n/a | ~20% drop (some don't watch) |
| Open Calendly | ~40% | inline (no extra click) |
| Book a slot | ~70% | ~50% (lower friction = more curious-only) |
| **Overall yield** | **3.0%–5.5%** | **expected 8%–15%** |

**Net expected: ~2–3× lift over audit-first; ~5× over no-fix baseline.**

**Reality check:** the audit-first numbers above are MODELED, not measured — last 30d real conversion was 0% (6 positives → 0 Calendly bookings). The video-first funnel removes the breakage point (the 7-minute email delay where prospects forget). We will measure live yield in next 14 days and update.
