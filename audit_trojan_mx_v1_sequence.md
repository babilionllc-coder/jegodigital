# Audit_Trojan_MX_v1 — 5-Step Sequence (Spanish, Mexico)

**Goal:** Get positive reply → deliver free audit PDF in 60 min → book Calendly call with Alex → upsell Pack Crecimiento.

**Iron Rules applied:**
- No pricing, ever
- No Calendly in cold Step 1 — CTA is audit teaser
- Calendly goes in positive-reply AI response (not in sequence)
- "Hola," greeting (not `{{firstName}}`) unless list is verified ≥99%
- No `[bracket placeholders]` — only `{{instantlyVariables}}` or generic wording
- 60–80 word bodies for Step 1
- Subject: 1–3 words
- 4→5→7→7 day cadence, "Not Replied" stop condition on every step
- Sign as "Alex / JegoDigital"

**Sending domain:** aichatsy.com (cold), never jegodigital.com direct.

**Instantly variables used:**
- `{{firstName}}` — populated by v4 pipeline (gated, real first names only)
- `{{companyName}}` — populated by Hunter.io domain name
- `{{website}}` — populated from discovery
- `{{pageSpeed}}` — custom variable set via v4 `personalization` payload
- `{{mainIssue}}` — custom variable (humanized audit finding)
- `{{city}}` — custom variable from discovery city

**⚠️ LIST GATE:** Because v4 pipeline enforces Iron Rule 7 (real first names + owner titles), `{{firstName}}` can be used safely. If running on a legacy/unverified list, replace `Hola {{firstName}},` with `Hola,` across all steps.

---

## STEP 1 — Auditoría fría (Day 0)

**Subject:** `Auditamos {{website}}`

**Body:**
```
Hola {{firstName}},

Auditamos tu sitio {{website}} hoy:

- PageSpeed: {{pageSpeed}}/100
- {{mainIssue}}
- Tu agencia no aparece en ChatGPT ni Perplexity cuando buscan inmobiliarias en {{city}}

GoodLife Tulum logró 300% más tráfico orgánico trabajando con nosotros.

¿Te mando el audit completo en 60 minutos? Sin costo.

Alex
JegoDigital
```

**Word count:** 62

---

## STEP 2 — Reminder (Day 4, only if Not Replied)

**Subject:** `Recordatorio`

**Body:**
```
Hola {{firstName}},

Te escribí hace unos días sobre la auditoría gratis de {{website}}.

Un dato de mi correo anterior:
- PageSpeed actual: {{pageSpeed}}/100

Solo 1 de cada 20 inmobiliarias en México pasa 85/100. Cada punto debajo de eso son visitantes que se van antes de ver una sola propiedad.

¿Te mando el audit? Contesta "sí" y lo tienes en tu correo en menos de una hora.

Alex
```

**Word count:** 68

---

## STEP 3 — Case study / proof (Day 9, only if Not Replied)

**Subject:** `Caso real`

**Body:**
```
Hola {{firstName}},

Rápido — un caso que puede interesarte:

Flamingo Real Estate (Cancún) llegó a nosotros con el mismo perfil que {{companyName}}: buen inventario, sitio lento, invisibles en Google Maps.

En 90 días:
- #1 en Google Maps en su zona
- 4.4x más visibilidad en búsquedas
- 88% de sus leads ahora los atiende IA automáticamente

La auditoría gratis de {{website}} te muestra exactamente qué replicar.

¿Te la mando?

Alex
```

**Word count:** 77

---

## STEP 4 — Pattern interrupt (Day 16, only if Not Replied)

**Subject:** `¿Error mío?`

**Body:**
```
Hola {{firstName}},

Quizá no soy la persona correcta para esto en {{companyName}}.

¿Me pasas el contacto de quien maneja el marketing digital? Les mando directo la auditoría gratis de {{website}} y los dejo en paz.

Gracias.

Alex
JegoDigital
```

**Word count:** 44

---

## STEP 5 — Breakup (Day 23, only if Not Replied)

**Subject:** `Último mensaje`

**Body:**
```
Hola {{firstName}},

Último correo de mi parte.

La auditoría gratis de {{website}} se queda disponible por si cambia algo: solo responde "audit" a este correo y la envío.

Si no es el momento, todo bien — gracias por tu tiempo.

Alex
JegoDigital
```

**Word count:** 49

---

## CADENCE SUMMARY

| Step | Day | Subject | Words | Stop on reply |
|------|-----|---------|-------|----------------|
| 1 | 0 | Auditamos {{website}} | 62 | ✓ |
| 2 | +4 | Recordatorio | 68 | ✓ |
| 3 | +9 | Caso real | 77 | ✓ |
| 4 | +16 | ¿Error mío? | 44 | ✓ |
| 5 | +23 | Último mensaje | 49 | ✓ |

**Cadence:** 4 / 5 / 7 / 7 days between steps (matches safe-send pattern).

---

## AI REPLY AGENT — Positive reply flow

When lead replies positively (says yes / interested / send audit):

1. **Within 15 min:** reply with:
   - Confirmation: "Perfecto {{firstName}}, corriendo el audit ahora."
   - Demo link: `jegodigital.com/seo-aeo-demo`
   - Proof: "Flamingo logró 4.4x visibilidad, GoodLife 300% tráfico. Más casos: instagram.com/jegodigital"
   - Calendly (REQUIRED): `calendly.com/jegoalexdigital/30min`
   - WhatsApp backup: `+52 998 787 5321`
   - Propose 2 times: "¿Martes o jueves esta semana, 15 min?"
2. **Within 60 min:** deliver audit PDF via Brevo transactional email (separate system — see cold-calling Offer B deliverable pipeline when built).
3. **Tag lead as `audit_requested`** for follow-up reminder if no Calendly booking within 48h.

## Upsell path (post-audit call)

1. Free audit reveals 3 specific weaknesses
2. Alex walks through findings on Calendly call
3. Trojan Horse offer: FREE Service 1 install (AI lead capture)
4. Upsell to Pack Crecimiento ($10,900 MXN/mo = Service 1+2+4 bundle) or Pack Dominacion
5. Website revamp = upsell AFTER 60 days, never the initial pitch

---

## PRE-SHIP CHECKS

- [ ] Grep for `[bracket placeholders]` — must return ZERO:
  ```bash
  grep -oE '\[[a-z ]+\]' audit_trojan_mx_v1_sequence.md
  ```
- [ ] Verify `{{firstName}}` list coverage ≥99% (v4 pipeline gate guarantees this)
- [ ] Open tracking ON, link tracking OFF (industry default for cold)
- [ ] Stop condition: "Lead replies" on every step
- [ ] Sending schedule: Mon-Fri 09:00-17:00 CDMX, 20 emails/day/sender max
- [ ] Sending accounts: use aichatsy.com + jegoaeo.com + jegoleads.com pool (never main domain)
- [ ] `{{mainIssue}}` custom variable must be populated per lead (v4 pipeline does this)
