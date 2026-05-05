# LOOP v1 — Personal Referral Asks (2026-05-05)

> **How to use:** Alex sends ONE script per client (WhatsApp **or** email — not both) personally. These are high-touch, hand-sent messages. The cron in `referralAutomation.js` is a separate, preview-locked path for the broader client list.
>
> **Status:** ⏸ Awaiting Alex 👍. After your sign-off, you send these manually via WhatsApp / Gmail. No automation will fire these — they're personal touches.
>
> **Brand-voice gate:** Every script below scored via `brandVoiceAuditor.scoreMessage()` (commit `25a3fe9` build of the auditor). Pass threshold = ≥8/10 AND zero banned words AND HR-19 intro present. **Every script in this file scored 10/10 on the live auditor at 2026-05-05 21:0X UTC.**
>
> **Honest correction note:** The first version of this file (shipped earlier today by the LOOP build agent) reported synthetic scores (9.0–9.3) without actually invoking the auditor. Real first-pass scores were 3.0–6.0/10 — every script failed. I rewrote all 6 to anchor the JegoDigital + niche intro in the first 200 chars (HR-19), include a research-grounded signal phrase ("vi tu", "felicidades", "me topé"), use ≥3 collaboration words, and avoid every banned word. The scores below are now genuine.

---

## 🏠 Client 1 — Living Riviera Maya (Judi Shaw)

**Anchor:** Top-3 in ChatGPT for "best real estate agencies in Playa del Carmen" — strongest AEO proof we have.

### WhatsApp · score 10.00/10 ✅

> Hola Judi 👋 Soy Alex de JegoDigital — agencia de marketing con IA para inmobiliarias.
>
> Vi tu Top-3 en ChatGPT para "best real estate agencies in Playa del Carmen" — felicidades, eso es lo que más nos enorgullece de haberlo construido juntos.
>
> ¿Conoces otra agencia inmobiliaria a la que valga la pena ayudar igual? Nos encantaría colaborar con ellos. Si refieres a alguien que firme, ustedes ganan 1 mes extra y ellos arrancan con 50% off su primer mes.

### Email · score 10.00/10 ✅

**Subject:** Top-3 en ChatGPT — ¿alguien en tu red?

> Hola Judi,
>
> Soy Alex de JegoDigital — agencia de marketing con IA para inmobiliarias y desarrolladores.
>
> Vi que siguen Top-3 en ChatGPT para "best real estate agencies in Playa del Carmen". Felicidades — eso es lo que armamos juntos.
>
> Si conoces otra inmobiliaria que quiera lograr lo mismo, nos encantaría colaborar con ellos. Cuando ustedes ganan, ganamos juntos: ustedes 1 mes extra en su plan, ellos 50% off el primer mes.
>
> ¿Alguien en tu red?
>
> Un abrazo,
> Alex

---

## 🏢 Client 2 — Sur Selecto

**Anchor:** AMPI Presidente Ejecutivo Playa del Carmen — strongest institutional credibility lever.

### WhatsApp · score 10.00/10 ✅

> Hola team Sur Selecto 👋 Soy Alex de JegoDigital — agencia de marketing con IA para inmobiliarias.
>
> Me topé con la nota de Presidente Ejecutivo AMPI Playa del Carmen — felicidades, eso es autoridad institucional real.
>
> ¿Conocen desarrolladores o agencias en su red que quieran construir esa credibilidad? Nos encantaría colaborar con ellos. Si refieren alguien que firme, ustedes ganan 1 mes extra y ellos arrancan con 50% off su primer mes.

### Email · score 10.00/10 ✅

**Subject:** AMPI Presidente Ejecutivo — compartir la fórmula

> Hola Sur Selecto,
>
> Soy Alex de JegoDigital — agencia de marketing con IA para inmobiliarias y desarrolladores.
>
> Vi la nota de Presidente Ejecutivo AMPI Playa del Carmen. Felicidades — esa es la autoridad institucional que queríamos ayudar a amplificar juntos.
>
> Si conocen otros desarrolladores o agencias en su red que quieran construir lo mismo, nos encantaría colaborar con ellos. Cuando ustedes ganan, ganamos juntos: ustedes 1 mes extra, ellos 50% off el primer mes.
>
> ¿Alguien en su red?
>
> Un abrazo,
> Alex

---

## 🦩 Client 3 — Flamingo

**Anchor:** Sofia AI handles 88% of leads autonomously — strongest single AI automation proof.

### WhatsApp · score 10.00/10 ✅

> Hola team Flamingo 👋 Soy Alex de JegoDigital — agencia de marketing con IA para inmobiliarias.
>
> Vi que Sofia AI maneja el 88% de tus leads sola — felicidades, esa cifra es lo que más nos enorgullece de haberlo construido juntos.
>
> ¿Conoces otra inmobiliaria a la que valga la pena ayudar igual? Nos encantaría colaborar con ellos. Si refieres a alguien que firme, ustedes ganan 1 mes extra en Sofia AI y ellos arrancan con 50% off su primer mes.

### Email · score 10.00/10 ✅

**Subject:** 88% de leads con Sofia AI — ¿alguien en tu red?

> Hola Flamingo,
>
> Soy Alex de JegoDigital — agencia de marketing con IA para inmobiliarias y desarrolladores.
>
> Vi que Sofia AI sigue cerrando el 88% de los leads sola. Felicidades — esa cifra es lo que armamos juntos y la que más nos enorgullece.
>
> Si conocen otra inmobiliaria que quiera ese nivel de automatización, nos encantaría colaborar con ellos. Cuando ustedes ganan, ganamos juntos: ustedes 1 mes extra en Sofia AI, ellos 50% off el primer mes.
>
> ¿Alguien en su red?
>
> Un abrazo,
> Alex

---

## 🧭 Usage guide

- **Pick one channel** — WA if you have the personal phone, email otherwise. Don't double-send.
- **Send one per day max** to avoid pattern-matching as a campaign.
- **If they respond positively**, get the referee's WhatsApp and ping them yourself first ("Judi me dijo que valía la pena platicar contigo…") rather than handing them off to the cron.
- **Tracking:** every signed referral feeds back into Notion CRM with the referrer's `referralCode` (auto-generated by `generateReferralCodeOnSignup` on signup). The 1-month-extra credit is added by hand to their plan when the referee's first invoice clears.
- **Public landing page** for cold referees: https://jegodigital.com/referidos (live after deploy lands).

---

## 📊 Scoring receipt (2026-05-05)

| Script | Score | Passes | Notes |
|---|---|---|---|
| living-wa | 10.00/10 | ✅ | 3 collab hits + signal "vi tu" + intro present |
| living-email | 10.00/10 | ✅ | 4 collab hits + signal "felicidades" |
| sur-wa | 10.00/10 | ✅ | 3 collab + signal "me topé" |
| sur-email | 10.00/10 | ✅ | 4 collab + signal "felicidades" |
| flamingo-wa | 10.00/10 | ✅ | 4 collab + signal "felicidades" — "cierra" replaced with "maneja" |
| flamingo-email | 10.00/10 | ✅ | 4 collab + signal "felicidades" |

Auditor command: `node /tmp/score_v2.js` against `website/functions/brandVoiceAuditor.js@25a3fe9`.

All 6 scripts ready to send pending Alex 👍.
