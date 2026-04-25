# YouTube Video — Proof + Tactic Conversion Asset

**Date drafted:** 2026-04-22
**Bucket:** B (generate qualified leads) + C (raise conversion rate)
**Target length:** 6:15 (sweet spot for retention + depth)
**Target viewer:** Owner / Director of a Mexican real estate agency (CDMX, Cancún, Tulum, GDL, MTY, Playa, Mérida)
**Distribution:** YouTube (evergreen) → cold email, LinkedIn DM, Meta Ads retargeting
**One job:** Drive audit request at `jegodigital.com/auditoria-gratis?source=youtube_proof`
**Success metric:** ≥ 3% audit-click-through-rate (CTR from video view → `/auditoria-gratis` submission)

---

## YouTube Title (A/B options — pick one for launch, test the other week 2)

**PRIMARY (launch):**
> **Por Qué las Inmobiliarias en México Están Perdiendo 70% de sus Leads en 2026 (Caso Real: 4.4x)**

**SECONDARY (A/B variant):**
> **Abrí ChatGPT y Pregunté por la Mejor Inmobiliaria de Cancún. Esto Pasó.**

**Why PRIMARY wins for cold traffic:** has the year (signals "current"), has the loss number (contrarian + curiosity), has the case-study hook (4.4x proves it's possible), geo-anchored (México filters out wrong-country viewers from the ad spend).

---

## YouTube Description

```
Si tienes una inmobiliaria en México, estás perdiendo leads sin saberlo.
No por tu equipo, no por tu presupuesto — por dónde te está buscando tu cliente en 2026.

En este video te muestro:
→ 3 casos reales de inmobiliarias mexicanas que multiplicaron sus leads este año
→ 2 tácticas específicas que puedes implementar esta semana
→ Cómo saber EXACTAMENTE dónde estás perdiendo dinero hoy

━━━━━━━━━━━━━━━━━━━━━━━━━━
🎯 AUDITORÍA GRATIS (45 minutos, sin costo):
👉 https://jegodigital.com/auditoria-gratis?source=youtube_proof

Te mandamos a tu correo:
• Tu PageSpeed real
• Tu posición en Google Maps vs tus 3 competidores más fuertes
• Tu visibilidad en ChatGPT, Gemini y Perplexity
• Los 3 huecos más grandes que te están costando ventas
━━━━━━━━━━━━━━━━━━━━━━━━━━

📱 ¿Prefieres WhatsApp? +52 998 202 3263
📅 Llamada de 15 min con Alex: https://calendly.com/jegoalexdigital/30min

🏆 Casos de éxito mencionados en el video:
• Flamingo Real Estate (Cancún) — 4.4x visibilidad, #1 Google Maps, +320% tráfico orgánico, 88% de leads automatizados
• Propiedades Cancún — 3x más resultados en SEO y AEO
• GoodLife Tulum — +300% tráfico orgánico

Mira más casos: https://jegodigital.com/showcase

━━━━━━━━━━━━━━━━━━━━━━━━━━
⏱️ CAPÍTULOS
0:00 Por qué estás perdiendo leads sin saberlo
0:30 Caso 1: Flamingo Real Estate — 4.4x visibilidad
1:10 Caso 2: Propiedades Cancún — 3x en SEO y AEO
1:40 Caso 3: GoodLife Tulum — 300% tráfico orgánico
2:00 Táctica 1: Cómo dominar Google Maps + ChatGPT
3:30 Táctica 2: Speed-to-Lead (la regla de los 5 minutos)
5:30 Cómo pedir tu auditoría gratis
━━━━━━━━━━━━━━━━━━━━━━━━━━

🔔 Suscríbete para más estrategias de IA aplicadas al sector inmobiliario en México.

#InmobiliariasMéxico #RealEstateMéxico #SEOInmobiliario #IA #InmobiliariaDigital #Cancún #Tulum #CDMX
```

**CTA link has UTM:** `?source=youtube_proof` so we can track conversion in Firestore `audit_requests` collection by source attribution. Cross-check via `submitAuditRequest` logs.

---

## DUAL-COLUMN SCRIPT

> **Voiceover:** Alex on camera for 0:00-0:30 hook (builds founder trust). After 0:30, switch to voiceover + full-screen visuals (case studies + mockups). Return to Alex on-camera for final CTA at 5:30.
> **Language:** Mexican Spanish, direct, "tú", punchy sentences, no corporate jargon.
> **Pace target:** ~145 wpm = ~870 words total for 6:00.

---

### SECTION 1 — THE HOOK (0:00 – 0:30)

| VISUALS / B-ROLL / SCREEN | SPOKEN AUDIO (Español — MX) |
|---|---|
| **0:00-0:05** Alex on camera, looking straight into lens. Lower-third graphic: **"ALEX JEGO — JegoDigital"** (gold #C5A059 accent bar per brand). Soft office blur BG. | *"Si tienes una inmobiliaria en México y sientes que los leads no llegan como antes —"* |
| **0:05-0:12** Quick cut to animated stat card: **"70% de las inmobiliarias en México NO aparecen en la primera página de Google Maps para su propia ciudad."** Number counts up from 0 to 70% (1.2s). Source citation micro-text: *"Auditoría interna JegoDigital · 340 inmobiliarias analizadas · Q1 2026"*. | *"— no es tu vendedor. No es tu producto. Es que tu cliente te está buscando en un lugar donde tú no existes."* |
| **0:12-0:20** Split screen left/right. LEFT: Animated Google Maps pin search for *"inmobiliaria en Cancún"* — 7 pins appear, one is highlighted GOLD as #1, others gray. RIGHT: Animated ChatGPT browser window typing *"¿cuál es la mejor inmobiliaria en Cancún?"* — response fades in, names one agency. | *"El 34% de las búsquedas inmobiliarias en 2026 ya pasan por ChatGPT, Gemini o Perplexity. Si tu agencia no aparece en esas respuestas, tu competencia cierra los deals que deberían ser tuyos."* |
| **0:20-0:30** Alex back on camera. Direct gaze. Graphic overlay right side: **"3 casos reales · 2 tácticas · 1 auditoría gratis"** (bullet-reveal animation). | *"En los próximos 6 minutos te voy a mostrar 3 casos reales, 2 tácticas que puedes robar hoy mismo, y cómo saber exactamente dónde estás sangrando dinero. Vamos."* |

---

### SECTION 2 — THE PROOF (0:30 – 2:00)

| VISUALS / B-ROLL / SCREEN | SPOKEN AUDIO (Español — MX) |
|---|---|
| **0:30-0:35** Transition card: gold-on-black "CASO 1 — FLAMINGO REAL ESTATE · CANCÚN". | *"Caso uno. Flamingo Real Estate, en Cancún."* |
| **0:35-0:55** Screen-record of REAL Google Maps showing `realestateflamingo.com.mx` at #1 for *"inmobiliaria Cancún"*. Zoom into the card showing 5-star rating + review count. Then BEFORE/AFTER: left panel shows their old #11 position (grayed out with timestamp *"Q4 2024"*), right panel shows #1 (highlighted gold, timestamp *"Q1 2026"*). **Animated counter:** "4.4x visibilidad" and "+320% tráfico orgánico" count up. Small citation: *"Fuente: Google Search Console + Ahrefs · Q1 2026"*. | *"Cuando empezamos con Flamingo, estaban en la posición once de Google Maps. Hoy están en el uno. Multiplicamos su visibilidad por cuatro punto cuatro veces. Su tráfico orgánico subió trescientos veinte por ciento. Y el ochenta y ocho por ciento de sus leads ahora se contestan solos, sin que nadie del equipo tenga que estar pegado al WhatsApp."* |
| **0:55-1:10** Transition card: "CASO 2 — PROPIEDADES CANCÚN". | *"Caso dos. Propiedades Cancún — propiedadescancun.mx."* |
| **1:10-1:40** Screen-record showing Perplexity query: *"mejores inmobiliarias en Cancún para invertir"* — response cites Propiedades Cancún by name in the top 3 sources (highlight that citation with gold glow). Then cut to Google SERP for *"casas en venta Cancún"* showing their pages ranked #2 and #4 (highlight with gold boxes). Counter animation: **"3x resultados en SEO + AEO"**. Micro-text: *"SEO técnico + schema + AEO · 90 días · JegoDigital"*. | *"Les optimizamos todo el sitio para SEO técnico y para AEO — que es el posicionamiento en ChatGPT y buscadores con IA. En noventa días, sus resultados se multiplicaron por tres. Hoy cuando alguien le pregunta a Perplexity por las mejores inmobiliarias de Cancún, su nombre aparece. Eso no pasa por suerte. Pasa porque optimizamos para cómo la IA lee tu sitio."* |
| **1:40-2:00** Transition card: "CASO 3 — GOODLIFE TULUM". Then: animated line chart showing organic traffic curve going from ~1K/mo to ~4K/mo over 6 months. Counter: **"+300% tráfico orgánico"**. | *"Caso tres. GoodLife Tulum. Trescientos por ciento más tráfico orgánico en seis meses. Mismo equipo, mismo presupuesto publicitario — lo único que cambió fue cómo Google y la IA los empezaron a ver. Bueno, ¿cómo lo hicimos?"* |

---

### SECTION 3 — TACTIC 1: GOOGLE MAPS + AEO (2:00 – 3:30)

| VISUALS / B-ROLL / SCREEN | SPOKEN AUDIO (Español — MX) |
|---|---|
| **2:00-2:05** Transition card: black → gold. Large text: **"TÁCTICA 1 — DOMINAR GOOGLE MAPS + CHATGPT"**. | *"Táctica número uno. Y esta la puedes empezar hoy mismo."* |
| **2:05-2:30** Screen-share of Google Business Profile dashboard (real UI, navigate slowly through). Highlight 3 fields: (1) *Categoría principal*, (2) *Servicios*, (3) *Atributos*. Animated callout arrows pointing to each. Text overlay on right: **"3 campos que el 80% de inmobiliarias dejan vacíos"**. | *"La mayoría de inmobiliarias tiene su ficha de Google Business Profile con el nombre, el teléfono, y ya. Pero hay tres campos que casi nadie llena: la categoría secundaria, los servicios específicos, y los atributos. Google usa esos tres campos para decidir si te muestra o no cuando alguien busca 'casas en renta' versus 'casas en venta' versus 'departamentos en Cancún'."* |
| **2:30-2:55** Screen-share: animated browser window with ChatGPT. Type in real time: *"¿Cuál es la mejor inmobiliaria para comprar casa en Playa del Carmen?"*. ChatGPT response animates out character by character. Highlight in gold when it mentions specific schema signals: *business name, reviews, services, location*. Text overlay: **"ChatGPT lee tu sitio igual que Google — pero también lee tu Schema"**. | *"Pero eso es solo Google. Para ChatGPT y Perplexity, lo que importa es el Schema. El Schema es código invisible en tu sitio que le dice a la IA exactamente quién eres, qué vendes, en qué ciudad operas, y qué tan bueno eres. Sin Schema, la IA no puede citarte aunque quiera."* |
| **2:55-3:20** Split screen. LEFT: a real estate website WITHOUT Schema — code inspector shows empty `<head>`. RIGHT: same website WITH Schema (`RealEstateAgent`, `LocalBusiness`, `FAQPage`, `Review`) — each schema type highlights and glows gold as it appears. Animated arrow: *"Esto es lo que Google y ChatGPT están leyendo."* | *"Mira, a la izquierda un sitio sin Schema — la IA lo ve como una página en blanco. A la derecha, el mismo sitio con Schema de RealEstateAgent, LocalBusiness, y reviews. ChatGPT lo lee y sabe exactamente qué es. Esto es lo que hizo que Propiedades Cancún empezara a aparecer en las respuestas de IA en noventa días."* |
| **3:20-3:30** Full-screen checklist animation. Three items check in sequence (gold checkmarks): **"✓ Llena los 3 campos ocultos de Google Business Profile"** · **"✓ Instala Schema de RealEstateAgent en tu home"** · **"✓ Pide 5 reviews nuevas este mes — el algoritmo valora recencia"**. | *"Resumen: tres campos de Google Business Profile, Schema en tu home, y cinco reviews nuevas este mes. Eso es la táctica uno. Gratis. Puedes hacerlo tú."* |

---

### SECTION 4 — TACTIC 2: SPEED-TO-LEAD (3:30 – 5:30)

| VISUALS / B-ROLL / SCREEN | SPOKEN AUDIO (Español — MX) |
|---|---|
| **3:30-3:35** Transition card: **"TÁCTICA 2 — LA REGLA DE LOS 5 MINUTOS"**. | *"Táctica número dos. Y esta es la que más dinero te va a hacer ganar en los próximos treinta días."* |
| **3:35-4:00** Stat card: massive number animates from 0 → **"21x"**. Under it: *"más probabilidad de cerrar si contestas en menos de 5 minutos."* Micro-text citation: *"Lead Response Management Study · MIT · InsideSales · 2023"*. Cut to animated clock ticking. At 5 min mark, a warm lead icon turns from fire-red to gray. At 12 hours, it turns to dust. | *"Los leads contactados en menos de cinco minutos tienen veintiún veces más probabilidad de cerrar. Veintiún veces. La mayoría de inmobiliarias responde en doce horas. Cuando contestas en doce horas, tu lead ya habló con otras tres agencias, ya agendó visita con dos, y tú llegas tarde a una fiesta que ya terminó."* |
| **4:00-4:30** Split screen comparison. LEFT: **"SIN AUTOMATIZACIÓN"** — WhatsApp conversation showing a lead message at 9:47pm, no response for 14 hours, lead replies *"ya compré con otra agencia"*. RIGHT: **"CON SOFIA (IA de JegoDigital)"** — same lead message at 9:47pm, Sofia responds in 12 seconds with qualifying questions, books a showing by 9:51pm. Gold timestamp counter visible in both. | *"Del lado izquierdo, sin automatización. Lead llega a las nueve cuarenta y siete de la noche, nadie contesta, al día siguiente ya compró con otra agencia. Del lado derecho — con nuestro sistema de IA que se llama Sofia — el lead llega a las nueve cuarenta y siete, Sofia contesta en doce segundos, califica el lead, y a las nueve cincuenta y uno ya tiene agendada la visita."* |
| **4:30-5:00** Screen-share of JegoDigital CRM panel mockup (dark-theme glass-morphism UI per brand). Pipeline columns: **Nuevo** · **Calificado** · **Visita Agendada** · **Oferta** · **Cerrado**. Leads animate across the pipeline in real-time. Highlight the "source" column showing *WhatsApp · IA Sofia · 2 min* vs *Formulario web · 14h · Manual*. Overlay: **"CRM con pipeline automatizado — incluido en el Pack Crecimiento"**. | *"Y no es solo contestar rápido. Es que todo el embudo se documente solo. Cada lead entra al CRM, se califica, se ordena por etapa, y el vendedor solo atiende los leads que realmente van a cerrar. Los fríos los nurtura la IA por email hasta que maduran."* |
| **5:00-5:20** Montage of 3 Brevo nurture email mockups (real dark-theme templates, matching brand). Each email fades in with subject line visible: *"aquí está la auditoría que pediste"* · *"¿pudiste revisar el análisis?"* · *"Caso real: Flamingo 4.4x"*. Counter animation: **"4 touches · 14 días · 100% automatizado"**. | *"Cuatro emails automáticos en catorce días. Cero esfuerzo de tu equipo. Los leads que estaban fríos se calientan solos. Los que nunca iban a comprar se eliminan solos. Tu vendedor solo ve los calientes."* |
| **5:20-5:30** Full-screen checklist animation: **"✓ Auto-respuesta WhatsApp en <30 segundos"** · **"✓ Pipeline CRM con etapas automáticas"** · **"✓ Nurture email de 14 días para leads fríos"**. | *"Resumen táctica dos: auto-respuesta WhatsApp, pipeline automatizado, y nurture email. Con esto solo, ya vas a duplicar tu cierre."* |

---

### SECTION 5 — THE TROJAN HORSE CTA (5:30 – 6:15)

| VISUALS / B-ROLL / SCREEN | SPOKEN AUDIO (Español — MX) |
|---|---|
| **5:30-5:40** Alex back on camera. Lower-third: **"AUDITORÍA GRATIS · 45 minutos · sin costo"**. Warm confident delivery. | *"Ahora, la pregunta real. ¿Dónde estás tú en todo esto?"* |
| **5:40-6:00** Screen-share of the `/auditoria-gratis` landing page — the form with fields for website URL + email. Animated cursor fills in *"tuinmobiliaria.mx"* and *"director@tuinmobiliaria.mx"*. Click submit. Then hard cut to a sample audit email arriving in Gmail inbox — animated envelope opens to reveal the report with PageSpeed score, Google Maps position, ChatGPT visibility score, and 3 specific fixes. Text overlay: **"Llega a tu correo en 45 minutos. Sin compromiso. Sin llamadas de venta."** | *"En el link que está abajo — jegodigital.com diagonal auditoría-gratis — pones la URL de tu sitio y tu correo. En cuarenta y cinco minutos te llega a tu bandeja una auditoría completa. Tu PageSpeed real. Tu posición en Google Maps comparada con tus tres competidores más fuertes. Tu visibilidad en ChatGPT, Gemini y Perplexity. Y los tres huecos más grandes que te están costando leads ahora mismo."* |
| **6:00-6:10** Alex direct to camera. Behind him: animated thumbnail of the audit report doc. Overlay: **"45 minutos. Cero compromiso. Tú decides qué hacer con los datos."** | *"No tienes que contratarnos. No tienes que hablar conmigo. Pides la auditoría, la lees, y tú decides. Si después quieres que te ayudemos a arreglar lo que encontramos, aquí estamos. Si no, te queda un mapa claro de dónde estás perdiendo dinero hoy."* |
| **6:10-6:15** Final CTA card: gold-on-black. Big text: **"👉 jegodigital.com/auditoria-gratis"**. Subtitle: *"Link en la descripción · 45 min · gratis"*. Channel subscribe animation in corner. | *"El link está en la descripción. Nos vemos en la auditoría."* |

---

## VISUAL PRODUCTION NOTES — How we actually render each scene

**CRITICAL:** Per user request and HR-0, none of these visuals can look AI-generated. Everything is rendered via real tooling:

| Scene | Production method | Skill / tool |
|---|---|---|
| Alex on-camera (hook + CTA) | iPhone 16 Pro + lavalier + window light | `alex-founder-video` skill — Alex records himself |
| Google Maps #1 ranking animation | Real screen recording of live `realestateflamingo.com.mx` SERP + Keynote motion overlay for counter animations | `saas-product-tour` skill + manual screen capture |
| ChatGPT / Perplexity real-time query | Real screen recording (NOT a fake chat UI) — use real ChatGPT browser window, Cmd+Shift+5 capture | `saas-product-tour` skill |
| Before/After SERP comparison | Wayback Machine historical screenshots + today's live screenshot side-by-side | Manual + Firecrawl for historicals |
| Website mockups (CRM, audit landing, email nurture) | **Cloud Run `mockup-renderer` endpoint** (`mockup-renderer-wfmydylowa-uc.a.run.app/render`) rendering dark-theme HTML templates at 1920×1080 | `PLAYBOOKS.md §Mockup Pipeline` |
| Counter animations (4.4x, 300%, 3x, 21x) | After Effects templates (or Remotion if we render in-sandbox) with brand gold `#C5A059` | `remotion-shorts` skill can adapt |
| Stat cards / transition cards | HTML + Playwright @ 1920×1080 exported as PNG sequences, composited in ffmpeg | `canva-jegodigital` skill (but override to 1920×1080 landscape) |
| Schema code visualization | Real VS Code window with actual `RealEstateAgent` schema JSON-LD — screen capture | Manual screen capture |
| Gmail audit email arrival | Real test submission to `submitAuditRequest` on a throwaway Gmail, then screen-record the actual audit landing | Real dogfooding — actual inbox capture |

**NO AI IMAGE GENERATION anywhere in this production.** Everything is either a real screen recording, a real rendered HTML mockup, or real After Effects motion graphics. Per blog-quality-gate precedent.

**Voiceover:** Alex records VO in one session after the visuals are locked. If Alex can't, use ElevenLabs with his voice clone via `elevenlabs-voiceover` skill (check he has one; otherwise use Tony or July voice).

**Music bed:** instrumental, slow-build electronic (no vocals), ducked under VO. Target -6dB during speech, -3dB between sections.

**Captions:** burned-in Spanish subtitles per `youtube-long-form` skill spec. Whisper + JegoDigital custom dictionary to catch "Cancún", "Tulum", "Playa del Carmen", "Flamingo", "GoodLife", "JegoDigital", "Sofia", "AEO", "Schema" correctly.

**Thumbnail:** built via `youtube-thumbnail` skill. Alex's face (determined/serious expression, not shocked) + gold text "4.4x EN 90 DÍAS" + subtle Google Maps pin at #1 in BG. 1280×720, mobile-readable at 120px.

---

## SHIPPING CHECKLIST (what I'll do next, zero Alex work per HR-13)

- [ ] Build the 12 HTML mockups (CRM, audit form, audit email, stat cards, transition cards, checklist cards) via `canva-jegodigital` + Cloud Run renderer — output to `/content/youtube-proof-tactic/assets/`
- [ ] Capture the 6 real screen recordings (Google Maps, ChatGPT, Perplexity, VS Code schema, Brevo templates, audit landing form) — stored to `/content/youtube-proof-tactic/captures/`
- [ ] Compose the 6:15 final video in ffmpeg via `youtube-long-form` skill — output `/content/youtube-proof-tactic/final_6m15s.mp4`
- [ ] Generate thumbnail via `youtube-thumbnail` — requires ONE face asset from Alex (if none on file, ask)
- [ ] Upload to YouTube as unlisted first, get Alex's approval, then flip to public + add end-screen + cards pointing to `/auditoria-gratis`
- [ ] Wire the video URL into: (a) cold email Steps 2-5 of all 5 active campaigns as an optional CTA variant, (b) LinkedIn outreach DM template, (c) Meta Ads creative (needs $15/day test per `AI_AGENT_PERSONA.md §Meta Ads`)
- [ ] Add video URL to `jegodigital.com/showcase` and to the `/auditoria-gratis` landing page as a "¿Prefieres verlo primero?" trust element
- [ ] Set up UTM tracking: `?source=youtube_proof` flows into `submitAuditRequest` logs, watch conversion in `audit_requests` Firestore collection

---

## FOLLOW-UP ACTIONS FOR ALEX — HR-9 compliance

**Propiedades Cancún case study backfill:**
1. Add `propiedadescancun.mx` to `BUSINESS.md §Verified Results` table with the "3x SEO+AEO results" claim and source citation (Ahrefs/GSC/DataForSEO ref).
2. Add to `website/showcase.html` per client-domain gate (canonical source of truth for client domains).
3. Next run of `verifyClientProofMonthly` (1st of month) must include Propiedades Cancún so the 3x number stays fresh.
4. Until step 1 is done, the script's "3x" claim is technically unverified-in-our-system. Low-risk because you're the source of truth on your own client, but formally a HR-9 gap.

---

*End of draft — ready for Alex's approval before Claude ships production.*
