# "3 Videos Gratis" — Listing Video Factory Trojan Horse
**Campaign:** `trojan_videos_mx_v1`
**Goal:** Trojan Horse — deliver 3 free cinematic listing videos → prove value → upsell to Service 4 (Social Media Management) or Service 6 (Property Videos 6/month package).
**Audience:** Mexican real estate agencies + developers + brokers.
**Sending domain:** aichatsy.com
**Sending speed:** 30-50/day (warmup-safe), scale to 100/day once reply rate >2%.
**CTA:** `https://jegodigital.com/trojan-setup/videos?email={{email}}&company={{companyName}}&source=instantly_trojan_videos`
**Delivery promise:** 3 videos in 24 hours, 3-10 photos per video.

---

## ⚠️ Pre-launch checklist (HR-5 + HR-6 + HR-11)

- [ ] Delivery system tested end-to-end with 3 test leads — ALL 3 delivered in <24h
- [ ] Onboarding form `/trojan-setup/videos` live, mobile-responsive
- [ ] HR-5 lead quality gate passed on target list
- [ ] HR-6 baseline pulled before activation
- [ ] AI reply agent configured with video-specific reply rules
- [ ] First 10 renders manually QA'd before autonomous mode

---

## 📧 Sequence (5 steps, Spanish)

### STEP 1 — Day 0 (APPROVED 2026-04-23 by Alex)
**Subject:** `3 videos gratis`
**Preview text:** Cinematográficos, en 24 horas.

```
Hola {{firstName}},

Le genero 3 videos cinematográficos de las propiedades de
{{companyName}} — gratis, esta semana.

Solo suba fotos, yo le entrego los MP4 listos para Reels y TikTok.

Sin contrato. Sin costo. Si le funcionan, hablamos. Si no,
se queda con los 3 videos.

¿Le mando el link para subir fotos? (60 segundos)

Alex
JegoDigital
```

**Word count:** 58. **No Calendly, no price, no tool names.** Single CTA = yes/no reply.
**Personalization:** Level 2 (`{{firstName}}` + `{{companyName}}`). Required both ≥99% populated on list per Cold Email Rule #8. Pre-ship grep check: `grep -oE '\{\{[a-zA-Z]+\}\}' <step1>` must return ONLY `{{firstName}}` and `{{companyName}}`.

---

### STEP 2 — Day +3 (if no reply)
**Subject:** `Ejemplo real`
**Preview text:** Así se ven los videos.

```
Hola {{firstName}},

Adjunto ejemplo real de un video que le hicimos a una inmobiliaria
en Cancún: https://jegodigital.com/trojan-setup/videos/ejemplo

Flamingo Real Estate 4.4x visibilidad, #1 en Google Maps —
los videos son parte del secreto.

¿Quiere 3 videos así, gratis, para las propiedades de
{{companyName}} esta semana?

Alex
JegoDigital
```

**Word count:** 53. **Adds social proof + live demo link.** Drops a single casual CTA.

---

### STEP 3 — Day +7
**Subject:** `1 video en 24h`
**Preview text:** Elegí uno rápido por si anda ocupado.

```
Hola {{firstName}},

Entiendo que está ocupado. Le simplifico:

Suba 3 fotos de UNA sola propiedad — yo le entrego 1 video en 24 horas.

Un solo video, sin compromiso, gratis. Si le gusta, hablamos de
los otros dos.

Link: jegodigital.com/trojan-setup/videos

Alex
JegoDigital
```

**Word count:** 51. **Reduces commitment (1 video, 3 fotos)** — micro-commitment framing.

---

### STEP 4 — Day +12
**Subject:** `Cierro la oferta`
**Preview text:** Última vez que se lo menciono.

```
Hola {{firstName}},

Esta es la última vez que le menciono los 3 videos gratis. Tengo
cupo para 5 inmobiliarias esta semana y ya van 3.

Si no los quiere está bien — no le vuelvo a escribir.

Si sí: jegodigital.com/trojan-setup/videos (60 segundos)

Alex
JegoDigital
```

**Word count:** 53. **Scarcity + respectful out.** Triggers loss-aversion without being pushy.

---

### STEP 5 — Day +18 (breakup email)
**Subject:** `Último`
**Preview text:** Le dejo tranquilo.

```
Hola {{firstName}},

Le dejo tranquilo. Cierro su fila en mi lista.

Si algún día quiere probar los videos gratis, el link sigue
activo: jegodigital.com/trojan-setup/videos

Éxito con {{companyName}}.

Alex
JegoDigital
```

**Word count:** 34. **Classic breakup — often the highest reply-rate step** because it releases pressure.

---

## 🤖 AI Reply Agent Rules (Instantly)

### Positive reply → fires this response:
```
Claro, aquí está el link para subir las fotos (60 segundos):

https://jegodigital.com/trojan-setup/videos?email={{email}}&company={{companyName}}

📸 3 a 10 fotos por propiedad
🎬 3 videos cinematográficos (30-45 segundos cada uno)
⏱ Entrega en 24 horas a su email

Si tiene alguna pregunta, me escribe por acá o al WhatsApp
+52 998 787 5321.

Alex
JegoDigital
```

### "¿Cuánto cuesta después?" reply:
```
Los 3 primeros son gratis, sin compromiso.

Si le funcionan y quiere seguir, tenemos paquete de 6 videos/mes
por menos de lo que le costaría un fotógrafo por 1 día.

Pero eso lo vemos después que reciba los 3 gratis y vea el
resultado. Primero confirmemos que le funcionan.

¿Le mando el link de subida?
```
**Still never quotes actual price. Pushes to delivery first.**

### "¿Cómo funciona?" reply:
```
Simple:
1. Click al link → sube 3-10 fotos por propiedad
2. Escoge estilo (cinemático, lifestyle, luxury)
3. En menos de 24h le llegan los 3 videos MP4 al email

No pedimos tarjeta. No pedimos contrato. Solo fotos.

Link: jegodigital.com/trojan-setup/videos
```

### Negative reply → thank + remove:
```
Entendido, gracias por responder. Éxito con su inmobiliaria.

Alex
```

---

## 📊 Expected KPIs (based on verified past campaigns)

| Metric | Target | Floor |
|--------|--------|-------|
| Open rate | ≥55% | 40% |
| Reply rate | ≥3% | 1.5% |
| Positive reply rate | ≥40% of replies | 25% |
| Form completion (reply→upload) | ≥30% | 15% |
| Delivered videos | 100% of completions | N/A |
| 2-week upsell reply | ≥10% of delivered | 5% |

## 🚨 Quality gate before activation (HARD BLOCK)

**Cannot activate campaign until ALL are true:**
- [ ] 3 test leads walked the full flow (form → upload → render → email delivery)
- [ ] All 3 received videos within 24h
- [ ] Videos pass `video-qa.py` automated QA (no black frames, audio present, duration 30-60s)
- [ ] Onboarding form mobile-tested on iPhone Safari + Android Chrome
- [ ] AI reply agent tested on 5 manual positive replies + 3 manual negative replies
- [ ] HR-6 baseline count captured (campaign leads before first send)

## 🔁 Daily monitoring (once live)

- Open rate drop below 40% → pause campaign, audit deliverability
- Reply rate below 1.5% after 200 sends → A/B test Subject line variants
- Form submissions: target ≥1 per 20 replies, alert Alex if zero for 48h
- Render queue: alert if any video delayed >22h from upload timestamp
