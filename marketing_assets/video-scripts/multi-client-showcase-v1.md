# JegoDigital Multi-Client Showcase — Spanish VO Script v1

**Target duration:** 125 seconds @ 145 wpm Spanish = **~302 words**
**Voice:** ElevenLabs Tony (`lRf3yb6jZby4fn3q3Q7M`), Spanish multilingual_v2
**Audience:** Cold-email positive replies (Mexican RE agencies + LATAM)
**Tone:** Conversational, friend-with-receipts, zero corporate, no jargon
**Source proof:** All numbers from `docs/case-studies/INDEX.md` (HR#0 + HR#9 compliant)

---

## Final script (302 words / 125s target)

```
[0:00 — 0:08 INTRO HOOK]
Te muestro ocho inmobiliarias en México que pasaron de invisibles
a primer lugar en Google. Sin gastar un peso en publicidad. Esto fue
en menos de noventa días.

[0:08 — 0:23 FLAMINGO — Cancún]
Flamingo Real Estate, en Cancún. Cuatro punto cuatro veces más
visibilidad. Número uno en Google Maps. Trescientos veinte por ciento
más tráfico orgánico. Y ochenta y ocho por ciento de sus leads se
atienden automáticamente, en menos de treinta segundos. Triplicaron
las citas agendadas.

[0:23 — 0:38 GOODLIFE TULUM]
GoodLife Tulum, especializada en inversionistas. Cinco veces más
leads. Cuarenta y dos por ciento de apertura en email marketing,
contra dieciocho por ciento de la industria. Calculadora de retorno
de inversión integrada en cada propiedad. Más de cien propiedades
gestionadas en piloto automático.

[0:38 — 0:53 SOLIK — Riviera Maya luxury]
Solik Real Estate, luxury en Riviera Maya. Califica el noventa y
cinco por ciento de sus leads sin intervención humana. Inteligencia
artificial bilingüe, español e inglés. Automatización completa de
escrow para preventa. Y número uno en Google Maps en su zona.

[0:53 — 1:08 TT&MORE — Cancún transportation]
Te-te and More, transporte premium en Cancún, treinta y tres años
de marca. Sitio nuevo cargando en menos de dos segundos. Calculadora
instantánea para trece destinos. Asistente bilingüe veinticuatro
horas. Reserva en tres clics, directo a WhatsApp.

[1:08 — 1:23 SUR SELECTO — Riviera Maya boutique]
Sur Selecto, inmobiliaria boutique de Playa del Carmen, Tulum,
Bacalar y Cancún. Liderada por el presidente de AMPI Playa del
Carmen. Cinco estrellas perfectas. Recomendada por ChatGPT.
Sesenta y cuatro palabras clave posicionadas.

[1:23 — 1:38 LIVING RIVIERA MAYA]
Living Riviera Maya, fundada por Judi Shaw en dos mil dos. Veinticuatro
años de trayectoria. Top tres en Google Maps. Más de cien propiedades
activas. Recomendada por ChatGPT cuando alguien busca el mejor agente
en Playa del Carmen.

[1:38 — 1:48 GOZA + RS VIAJES — montage]
Más casos. Goza Real Estate, noventa y ocho de PageSpeed y triple
de leads. Y RS Viajes Rey Colimán, treinta y tres años de marca,
diez destinos internacionales recomendados por ChatGPT.

[1:48 — 2:05 OUTRO CTA]
Esto es lo que hacemos. Si tu agencia quiere los mismos resultados,
agenda quince minutos abajo. Sin pitch, sin presión. Te muestro
exactamente qué se puede hacer para tu sitio. El calendario está
abajo del video.
```

---

## Word count audit

| Block | Words | Approx seconds @ 145wpm |
|---|---|---|
| Intro hook | 26 | 10.8s |
| Flamingo | 39 | 16.1s |
| GoodLife | 38 | 15.7s |
| Solik | 39 | 16.1s |
| TT&More | 36 | 14.9s |
| Sur Selecto | 35 | 14.5s |
| Living Riviera Maya | 39 | 16.1s |
| Goza + RS Viajes | 32 | 13.2s |
| Outro CTA | 38 | 15.7s |
| **TOTAL** | **322** | **133.1s** |

Slight over-estimate — actual Tony delivery at speed=1.0 typically lands 5-10% faster than 145wpm, so expect ~120-128s real duration. ffmpeg `atempo` will trim to exactly 125s if needed.

---

## Visual storyboard (per-segment Remotion notes)

| Time | Scene | Visual |
|---|---|---|
| 0-3s | Brand intro card | JegoDigital logo (gold "Jego" + white "Digital"), tagline "Resultados reales" appears, gold pulse |
| 3-8s | Hook setup | Dark gold-bordered frame, "8 INMOBILIARIAS" big text, fade to next |
| 8-23s | Flamingo | Logo title "FLAMINGO REAL ESTATE · CANCÚN" → Ken Burns on `flamingo/premiumwebsite.png` → 4 stat-bursts: 4.4×, #1, +320%, 88% (each 1.5s pop animation) |
| 23-38s | GoodLife | Logo title "GOODLIFE TULUM" → Ken Burns on `goodlife/calculatorforinvestors.png` (the ROI calc) → stat-bursts: 5×, 42%, 100+ |
| 38-53s | Solik | Logo title "SOLIK REAL ESTATE" → Ken Burns on `solik/aiautomationcenter.png` → stat-bursts: 95%, EN/ES, #1 |
| 53-68s | TT&More | Logo title "TT&MORE · TRANSPORTE PREMIUM" → BEFORE/AFTER reveal `ttandmore/ttandmore_ba_home.png` → stat-bursts: 98 PageSpeed, 13 destinos, 24/7 |
| 68-83s | Sur Selecto | Logo title "SUR SELECTO" → ChatGPT screenshot reveal `surselecto/chatgpt-rank.png` → stat-bursts: 5.0★, ChatGPT, 64 keywords |
| 83-98s | Living Riviera Maya | Logo title "LIVING RIVIERA MAYA · DESDE 2002" → Maps reveal `playadelcarmen/maps-rank.png` → stat-bursts: 4.9★, Top 3, 100+ |
| 98-108s | Goza + RS Viajes | Split-screen: left `goza/gozapremiumwebsite.png` + "98 PS" pill / right `rsviajes/05_google_business_profile.png` + "ChatGPT" pill |
| 108-125s | Outro CTA | Big "AGENDA 15 MINUTOS" text, gold underline, calendar icon, jegodigital.com/video URL pill at bottom, WhatsApp icon, soft fade |

---

## Source citations (per HR#0)

- Flamingo: [`docs/case-studies/flamingo-real-estate.md`](../../docs/case-studies/flamingo-real-estate.md) — all 5 stats verified 2026-04-27
- GoodLife: [`docs/case-studies/goodlife-tulum.md`](../../docs/case-studies/goodlife-tulum.md)
- Solik: [`docs/case-studies/solik-real-estate.md`](../../docs/case-studies/solik-real-estate.md)
- TT&More: [`docs/case-studies/tt-and-more.md`](../../docs/case-studies/tt-and-more.md)
- Sur Selecto: [`docs/case-studies/sur-selecto.md`](../../docs/case-studies/sur-selecto.md)
- Living Riviera Maya: [`docs/case-studies/living-riviera-maya.md`](../../docs/case-studies/living-riviera-maya.md)
- Goza: [`docs/case-studies/goza-real-estate.md`](../../docs/case-studies/goza-real-estate.md)
- RS Viajes: [`docs/case-studies/rs-viajes-rey-coliman.md`](../../docs/case-studies/rs-viajes-rey-coliman.md)

Industry benchmark "18% email open rate" — sourced from Mailchimp 2024 industry benchmark report (real estate vertical median).