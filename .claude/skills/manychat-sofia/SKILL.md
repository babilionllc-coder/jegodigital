---
name: manychat-sofia
description: |
  JegoDigital's ManyChat WhatsApp/Instagram funnel + Sofia AI agent. Trigger when the user wants to edit the ManyChat flow, update Sofia's prompt or goals, inspect a WA/IG conversation, change an ice breaker, debug the free-audit funnel, wire a new ManyChat API call, or ask why a lead isn't progressing through Sofia's flow. Covers the flow at app.manychat.com/fb4452446, Sofia's goals (primary — lead agrees to audit; secondary — Calendly booking), the rule that Sofia NEVER collects name/email (ManyChat has them), the 3 live ice breakers, the automated IG audit flow (→submitAuditRequest Cloud Function→email in 60 min) vs the semi-manual WA flow, Calendly link calendly.com/jegoalexdigital/30min, and Alex's WhatsApp +52 998 202 3263. Do NOT trigger for cold email (use lead-finder), IG publishing (use instagram-publisher), or voice calls (use cold-calling-ai).
---

# ManyChat + Sofia — JegoDigital's WhatsApp/Instagram Funnel

Sofia is the AI agent at the center of the WA/IG funnel. She qualifies inbound leads, pitches the free audit, and hands off to Alex for the Calendly close. The funnel runs in ManyChat; audit generation runs in a Firebase Cloud Function.

---

## When to use this skill

Trigger on:
- "Edit the ManyChat flow / update Sofia's prompt / change her goals"
- "Why isn't Sofia asking for the website URL"
- "Add a new ice breaker / swap the welcome message"
- "Debug the free audit funnel / why didn't the lead's audit arrive"
- "Wire a new ManyChat API call / add a custom field"
- "Inspect the conversation with [lead name]"
- "Fix the WhatsApp → Calendly handoff"

Do NOT use for:
- Cold email outreach → `lead-finder`
- IG post publishing → `instagram-publisher`
- Cold phone calls → `cold-calling-ai`
- Generic chatbot theory → answer directly, no skill needed

---

## Platform links (keep bookmarked)

| Resource | URL |
|---|---|
| ManyChat workspace | https://app.manychat.com/fb4452446 |
| WhatsApp default flow | https://app.manychat.com/fb4452446/cms/files/wa_default/edit |
| Calendly (Alex, 30min) | https://calendly.com/jegoalexdigital/30min |
| Alex's WhatsApp | `+52 998 202 3263` |
| Audit Cloud Function | `https://us-central1-jegodigital-e02fb.cloudfunctions.net/submitAuditRequest` |
| In-chat audit page | https://jegodigital.com/auditoria-gratis |

---

## The WhatsApp funnel

### 3 buttons → all route to AI Step (Sofia)

| Button | Routes to |
|---|---|
| Ver Servicios | AI Step ✅ |
| Quiero mas leads | AI Step ✅ |
| Hablar con Alex | AI Step ✅ |

Every button eventually hits Sofia. She qualifies, offers the audit, and pushes to Calendly. Alex steps in manually when a lead is hot.

### Sofia's end goals (updated 2026-04-17 ~00:20 CST)

1. **Primary:** Get the lead to AGREE to the free digital audit → confirm we have name/email (ManyChat already captured these) → ask ONLY for the website URL → audit delivered to their email in ~60 min.
2. **Secondary:** Book a Calendly call with Alex to review the audit results together.

**Sofia does NOT collect name or email.** ManyChat already has them. Asking again breaks the conversation flow and signals "bot." If the prompt drifts toward asking for contact info, fix the prompt.

### Live ice breakers (3 total, updated 2026-04-16)

1. `Quiero generar mas leads para mi agencia` → WhatsApp Default Reply
2. `Auditoría gratis de mi sitio web` → WhatsApp Default Reply
3. `Agendar consultoría gratuita de 30 min` → WhatsApp Default Reply

All 3 route into the same default flow → Sofia takes over from there.

---

## The free-audit funnel (IN-CHAT, LIVE as of 2026-04-17)

### Instagram DM flow (fully automated)

```
Lead sends "AUDITORIA"
  → ManyChat collects email (in-chat)
  → ManyChat collects website URL (in-chat)
  → ManyChat fires submitAuditRequest API call
  → Cloud Function generates report (~37s)
  → Report emailed to lead
  → ManyChat presents Calendly upsell
```

### WhatsApp flow (semi-manual, Phase 2 TODO)

```
Lead triggers audit path
  → Sofia offers audit
  → Sofia confirms we have name/email (ManyChat has them)
  → Sofia asks for website URL
  → Sofia sends lead to https://jegodigital.com/auditoria-gratis
  → User fills form → audit arrives in email
  → (TODO Phase 2: direct API call from WhatsApp, same as IG)
```

### Cloud Function endpoint

```
POST https://us-central1-jegodigital-e02fb.cloudfunctions.net/submitAuditRequest
Content-Type: application/json

{
  "email": "lead@agency.com",
  "website_url": "inmobiliaria.com",
  "name": "Julia",
  "source": "manychat_instagram"  // or "auditoria-gratis" for web form
}
```

Response: `{"success":true,"id":"..."}`

**DEPLOY NEEDED (as of handoff):** Run `firebase deploy --only functions:submitAuditRequest` to enable `source` tracking — the field is in the code but not yet in prod. **Never manually** — push the code change to `main` and let `deploy.yml` ship it (see `deploy-jegodigital` skill).

---

## Sofia's prompt — the rules that matter

When editing Sofia's system prompt, hold these constant:

1. **Language match.** Spanish by default. Switch to English only if the lead writes in English first.
2. **Never reveal tool names.** No "Claude", "ChatGPT", "ManyChat", "n8n", "Firecrawl". The positioning is "premium full-service agency".
3. **No pricing, ever.** If the lead asks price, answer: "Depende de tu zona. ¿15 minutos esta semana? calendly.com/jegoalexdigital/30min"
4. **No PDFs.** If they ask for info, max 3 bullet points + Calendly link.
5. **Anchor with results.** Flamingo 4.4x visibility, GoodLife 300% traffic — cite these before ever discussing scope.
6. **Do not ask for name/email.** ManyChat has them. Only ask for the website URL during the audit flow.
7. **One CTA per message.** Either the audit URL or the Calendly link — never both in the same message.

---

## Objection handlers

| Objection | Response |
|---|---|
| "No tengo presupuesto" | "Empezamos gratis — sin costo de instalación." |
| "¿Cuánto cuesta?" | "Depende de tu zona. ¿15 minutos esta semana? calendly.com/jegoalexdigital/30min" |
| "Mándame información" | 3 bullets max + Calendly link. **NEVER** a PDF. **NEVER** pricing. |
| "Prefiero hablar con Alex" | "Claro, su WhatsApp es +52 998 202 3263. También puedes agendar una llamada: calendly.com/jegoalexdigital/30min" |

---

## Quick-start recipes

**"The audit isn't being emailed to leads from Instagram"**
1. Test the Cloud Function directly:
   ```bash
   curl -s https://us-central1-jegodigital-e02fb.cloudfunctions.net/submitAuditRequest \
     -X POST -H "Content-Type: application/json" \
     -d '{"email":"alex@example.com","website_url":"realestateflamingo.com.mx","name":"Test","source":"manychat_instagram"}'
   ```
2. If `{"success":true}` → ManyChat isn't calling the function. Check the ManyChat External Request action's URL + payload.
3. If the function returns an error → read Firebase Functions logs. Probably a Brevo API issue.
4. If success but no email arrives → Brevo sending domain issue. Check Brevo dashboard for bounces/spam.

**"Update Sofia's opening message"**
1. Open https://app.manychat.com/fb4452446/cms/files/wa_default/edit
2. Locate the AI Step node → edit the system prompt
3. Test with an ice breaker from a real WA number (not your own — ManyChat throttles test messages)
4. Verify the rules above still hold (no pricing, no tool names, no asking for name/email)

**"Add a 4th ice breaker for the World Cup campaign"**
1. ManyChat → Settings → Ice Breakers → Add
2. Text: e.g. `Mundial 2026 — más turistas buscando propiedades`
3. Route: WhatsApp Default Reply (same as the other 3)
4. Test end-to-end before broadcasting

---

## Source truth

- CLAUDE.md § WHATSAPP FUNNEL (ManyChat) + § Audit Funnel
- Live flow: app.manychat.com/fb4452446/cms/files/wa_default/edit
- Cloud Function source: `website/functions/` (look for `submitAuditRequest` export)
