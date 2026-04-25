---
name: cold-calling-ai
description: |
  JegoDigital's AI cold-calling system — ElevenLabs Conversational AI + Twilio + Gemini 3.1 Flash Lite. Trigger whenever the user wants to make, trigger, or audit an AI cold call; update any of the 3 split-test agents (A/SEO, B/Free Audit, C/Free Setup); inspect a call transcript or outcome; list agents or phone numbers; plan a batch calling run; scrub a lead list against REPEP; apply the AIDA opener rewrite; inject Authority Hook (Inmuebles24 listing signals) into dynamic vars; or migrate TTS model from `eleven_v3_conversational` to `eleven_flash_v2_5`. Covers the Twilio MX number (+52 998 387 1618), the July voice (MD6rLAhozcrmkdMZeOBt), agent IDs for offers A/B/C, trigger script usage, the Node.js utility scripts under /website/tools/, the mu-law 8kHz audio format, Mexican regulatory compliance (REPEP + Constancia de Situación Fiscal), and the DNC auto-detect phrase list. Do NOT trigger for: sending cold EMAILS (use lead-finder + Instantly), WhatsApp conversations (ManyChat/Sofia), or generic call-center questions unrelated to JegoDigital's ElevenLabs setup.
---

# Cold Calling AI — ElevenLabs + Twilio Trio (v4)

Live system for outbound AI cold calls to Mexican real-estate agencies. Three offers run in parallel as a split test; each has its own ElevenLabs agent with distinct prompt, tools, and CTA.

**Daily goal:** minimum **2 closed customers/day** via cold call → audit delivery → Calendly → contract. Nothing ships from this skill that doesn't serve that number.

**Infra swap (2026-04-22 PM v4.1):** TTS model swapped from `eleven_v3_conversational` (slow, ~800ms) → `eleven_flash_v2_5` (fast, ~100ms). Turn timeout cut from 4.0s → 1.5s. Root cause: 3 warm leads (Monica, Rosalia, Leticia x2) hung up today saying "¿Bueno? ¿Aló?" because Sofia's TTS lag exceeded the 2s mental threshold where the lead assumes the call dropped. Lower latency = no more "¿Bueno?" disasters.

**Last upgrade:** 2026-04-22 PM (v4) — ALL professional titles (Licenciado/Licenciada/Ingeniero/Arquitecto/Señor/Señora) PURGED from all 4 agent prompts after live-call bug where Gemini read 'Licenciado/Licenciada' verbatim to a warm lead (Maria Del Mar hung up at 29s). New REGLA 1 bans all titles — use first names only. Added REGLA EMAIL: Sofia spells emails back letter-by-letter in Spanish ('arroba' for @, 'punto' for .) before firing book_calendly_live. New Inbound Receptionist agent `agent_1401kpv26wb2ehwv02nx2cy2w3ch` (static greeting, no {{lead_name}} crash). Trigger script now warns when --email, --company, --city are missing (Alex caught this on QA — Sofia asked 'su correo sigue siendo?' and trailed off because email was empty).

## 🔴 v4 MANDATORY — ALWAYS PASS FULL LEAD CONTEXT

Every outbound dial MUST pass ALL of: `--email`, `--company`, `--city`. For Offer B additionally `--website`. Sofia's prompt interpolates these variables directly into her pitch and close. If empty:

- **Empty email** → Sofia asks mid-call "¿su correo sigue siendo?" and trails off into awkward silence (killed Monica's 27s call, killed Maria's 29s call — 2 burned warm leads on 2026-04-22).
- **Empty company** → Sofia says "su inmobiliaria" generically. Zero personalization.
- **Empty city** → Sofia says "su ciudad". Breaks the "su competencia directa en [city]" local-authority hook.

**REGLA EMAIL (live in all 3 outbound agents):** if `{{lead_email}}` is populated, Sofia confirms by spelling it back letter-by-letter in Spanish (ex: "a-l-e-x-punto-g-e-r-e-n-c-i-a-arroba-g-m-a-i-l-punto-c-o-m"). If empty, she asks, captures, then spells it back before firing `book_calendly_live`. Never assumes she heard correctly.

**Pre-dial checklist before every call:**
1. Lead's first name (`"Maria"`)
2. Lead's email (`--email=maria@agency.mx`)
3. Company name (`--company="Inmobiliaria Caribe"`)
4. City (`--city="Cancún"`)
5. Website (`--website=https://agency.mx`) — required for Offer B
6. Is the number on DNC? Check REPEP + past DISASTER_LOG entries before dialing

**Live agent IDs (all v2 PATCH verified 2026-04-22 PM via `get_agent_config`):**
- Agent A (SEO Pitch): `agent_6601kp758ca4fcx8aynsvc0qyy5k` → "JegoDigital Sofia - SEO Pitch (MX) v2"
- Agent B (Free Audit): `agent_7001kpcxketqewvt87k4mg6vp569` → "JegoDigital Sofia - Free Audit (MX) v2"
- Agent C (Free Setup): `agent_2801kpcxmxyvf36bb2c970bhvfk4` → "JegoDigital Sofia - Free Setup (MX) v2"

---

## 🆕 v3 — NOTEBOOKLM SALES CLOSING RESEARCH (folded into all 3 agents)

Source: `jegodigital-cold-call-sales-re` notebook (curated by Alex, 2026-04-22). Four research queries produced the canonical script below.

### Top 5 mistakes AI cold-callers make in Mexican real-estate B2B

| # | Mistake | Why it kills sales | Fix (now live in all 3 prompts) |
|---|---------|---------------------|----------------------------------|
| 1 | **Self-centered opener** — leading with "Soy Sofia de JegoDigital" before any value | Mexican prospects reject before processing your identity | WIIFM opener first: a city-specific pain stat, THEN name |
| 2 | **"Tú" instead of "Usted"** (and no titles) | Informal language = disrespect in B2B MX; kills confianza in 5 seconds | REGLA 1 mandates "Usted" + Licenciado/Ingeniero/Arquitecto |
| 3 | **High latency / uncanny valley** — TTS response >1s | Breaks the illusion of human conversation; instant hangup | TODO #B-Latency: migrate to `eleven_flash_v2_5` + mu-law 8 kHz |
| 4 | **Poor gatekeeper handling** — treating receptionist as obstacle | In MX, gatekeepers are trusted extensions of the director | Gatekeeper protocol in all 3 prompts treats them with respect, uses their name |
| 5 | **Surrendering to "Mándame info por WhatsApp"** | This is a soft-rejection, not a real ask; total lead leakage | Objection handler converts it into email-confirm close + soft CTA bridge |

### Canonical AIDA script (adapted per offer — see agent prompts for full wording)

- **Atención (10-15s)** — WIIFM pain hook. Agent B example: "40% de cierres perdidos fuera de oficina"
- **Interés (15-45s)** — Stat-based interest: "5-min response = 21x más probable calificar; promedio MX = 15 horas"
- **Deseo (45-75s)** — Authority transfer: "Flamingo Cancún #1 Maps, 4x visibilidad. GoodLife Tulum +300% orgánico"
- **Acción (75-90s)** — Soft CTA: email confirm (Agent B) OR martes/jueves (Agents A+C)

### 9 objection handlers — Spanish "Usted" (live in all 3 agents)

All adapted per offer. Canonical versions in Agent B:

| Objeción | Respuesta (esencia) |
|----------|----------------------|
| "No tengo tiempo" | Ofrecer retrollamada mañana 10am + revalorizar stat de pain |
| "Mándame info por WhatsApp" | "Con gusto — de hecho si me confirma su correo le mando el diagnóstico directamente; es más completo que un PDF." |
| "Ya tengo quien me lo hace" | "Qué bueno — no reemplazamos, complementamos. La auditoría le muestra qué tan bien está funcionando hoy." |
| "¿Cuánto cuesta?" | "La auditoría es gratuita — costo lo platica con Alex después si quiere." NUNCA mencionar precio. |
| "No me interesa" | Re-pregunta con stat + "Si es rotundo no, lo/la quito de la lista sin problema." |
| "Háblame la próxima semana" | Anota + pide mandarla por correo mientras tanto. |
| "¿Quién le dio mi número?" | "Listados públicos de {{company_name}} en Inmuebles24 y directorio de {{city}}." |
| "¿Esto es un robot?" / "¿Es IA?" | Transferencia de autoridad: "Parte de esta interacción está gestionada por nuestro sistema propio — Alex firma la auditoría personalmente." |
| "Estoy manejando / ocupado" | Ofrecer retrollamada en 2 horas o mañana temprano. |

### Voicemail strategy change (v3)

**v2 behavior:** `voicemail_detection` tool was configured to hang up silently.
**v3 behavior:** `voicemail_detection` tool leaves a 15-second callback-optimized Spanish message with the JegoDigital callback number (+52 998 387 1618) + a pain-specific hook per agent.

**Agent B voicemail script (read by the tool):**
> "Buen día, Licenciado/Licenciada {{lead_name}}. Le habla Sofía de JegoDigital. Ayudamos a inmobiliarias como {{company_name}} a aumentar sus citas calificadas en un treinta y cinco por ciento en treinta días. Si quiere recuperar los cierres que hoy pierde después de las seis de la tarde, llame al cincuenta y dos, noventa y ocho, tres, ocho, siete, dieciséis, dieciocho. Gracias."

Agents A and C have equivalent pain-specific voicemail messages — see their prompts for exact text.

**Callback wire-up (TODO #B-Callback):** incoming call to +52 998 387 1618 should route to an inbound ElevenLabs agent (or Twilio Flex) that recognizes the caller and handoffs to Alex's cell. Not yet built.

---

## When to use this skill

Trigger on:
- "Trigger a call / cold-call this number / call [lead name]"
- "Update Offer A|B|C prompt / change the voice / swap the LLM / swap TTS model"
- "Audit the call history / why did [number] fail"
- "List agents / check phone numbers / get agent config"
- "Plan a batch calling run for [list]"
- "Build the auto-audit pipeline for Offer B"
- "Scrub this list against REPEP / run the DNC check"
- "Inject Authority Hook / Inmuebles24 enrichment"
- "Fix the stage-direction leak / strip `[Confidently]` from prompt"
- "Swap to `eleven_flash_v2_5`"
- "Apply the AIDA opener rewrite"
- "Fold NotebookLM findings into agents / upgrade sales closing"

Do NOT use for:
- Cold email → `lead-finder` + Instantly
- WhatsApp/DM outreach → ManyChat / Sofia
- Voice design / TTS-only requests unrelated to the agents → use ElevenLabs MCP directly

---

## Live system config

| Component | Value | Notes |
|---|---|---|
| Twilio phone (MX) | `+52 998 387 1618` (ID `phnum_8801kp77en3ee56t0t291zyv40ne`) | Constancia de Situación Fiscal MUST be filed with Twilio for +52 deliverability |
| Voice | **July — Warm, Youthful** (`MD6rLAhozcrmkdMZeOBt`) | Supports ES/EN. Defaults to Neutral Mexican accent when prompt is Spanish |
| LLM | Gemini 3.1 Flash Lite Preview *(set in ElevenLabs dashboard per-agent)* | |
| TTS model | `eleven_flash_v2_5` *(target — migrate from `eleven_v3_conversational`)* | ~75 ms inference vs ~200 ms on v3 |
| Audio format | mu-law 8 kHz *(Twilio-native, no transcode)* | Avoids "stutter" latency spike |
| ASR model | `scribe_realtime` | |
| Turn detection | `turn_v2` | Supports interrupt/barge-in |
| Voicemail detection | `voicemail_detection` tool enabled — LEAVES message (v3) | 15-second callback-optimized Spanish message |
| Silence end-call | `silence_end_call_timeout` = 15 s | Verified in `conversation_config.turn.*` — NOT `.conversation.*` |
| Max duration | 90 s (Agents B + C), 300 s (Agent A target — pending reduction from 600 via dashboard) | |
| Region | North America (via ElevenLabs default + Twilio media edge) | |
| Post-call webhook | Fires `call_analysis` on completion | See `SYSTEM.md § ElevenLabs post-call webhook` |
| Temperature | 0.3 (all 3 agents) | Low = less creative, less likely to emit bracket stage directions |

All three agents share this base. What differs is the prompt, the tools, and the intended outcome.

---

## The 3 split-test offers (v2 prompts live since 2026-04-22 PM)

| Offer | Agent ID | AIDA Atención Hook | Closing Tool | Goal |
|---|---|---|---|---|
| **A — SEO Pitch** | `agent_6601kp758ca4fcx8aynsvc0qyy5k` | "Su competencia directa en {{city}} ya aparece arriba de {{company_name}} en Google y ChatGPT" | `book_calendly_live` | Book 15-min Calendly with Alex |
| **B — Free Audit** | `agent_7001kpcxketqewvt87k4mg6vp569` | "40% de consultas de noche se pierden — auditoría de 7 áreas gratis en 60 min" | `submit_audit_request` | Lead confirms email → audit sent |
| **C — Free Setup (Trojan Horse)** | `agent_2801kpcxmxyvf36bb2c970bhvfk4` | "Instalamos gratis su captador 24/7 — solo paga si le trae clientes" | `book_calendly_live` | Book 15-min install call with Alex |

**Rules (non-negotiable — encoded as REGLA 0-5 in every agent prompt):**
- REGLA 0: NO emit bracket stage directions ([Confidently]/[Concerned]/etc.) — TTS reads them literally
- REGLA 1: Formal "Usted" + Licenciado/Ingeniero/Arquitecto titles
- REGLA 2: DNC auto-detect — any variant of "no me llamen" → polite exit + `end_call`
- REGLA 3: ZERO price mention — Calendly-only with Alex
- REGLA 4: Cero identificación como IA — redirect via authority transfer
- REGLA 5: Max 2-3 sentences per turn

---

## AIDA Opener — canonical template (see agent prompts for offer-specific wording)

Every agent opener has 4 beats in this order:

**BEAT 1 — Formal greeting with "Usted"**
"Buen día, ¿hablo con Licenciado/Licenciada {{lead_name}}?"

**BEAT 2 — Pain hook (Attention)**
Offer-specific. Agent B: "Encontramos que las agencias de su tamaño pierden hasta el cuarenta por ciento de sus cierres por no responder fuera de oficina. ¿Me permite sesenta segundos para contarle qué encontramos de {{company_name}}?"

**BEAT 3 — Interest + Desire (stats + authority transfer)**
"Mire, la estadística es clara: responder en los primeros cinco minutos hace que sea veintiún veces más probable calificar al prospecto. Pero el promedio de respuesta de un asesor en México es de más de quince horas. Trabajamos con agencias como Flamingo Real Estate en Cancún, que logró ser número uno en Google Maps y triplicó su tráfico orgánico."

**BEAT 4 — Soft CTA (Action)**
Offer-specific. Agent B: "¿Le parece si le enviamos la auditoría? Solo necesito confirmar que su correo es {{lead_email}}, ¿es correcto?" → `submit_audit_request`

**Why this structure works (NotebookLM-validated):**
- WIIFM-first = doesn't trigger rejection reflex (top mistake #1 fix)
- Usted + titles = Mexican B2B etiquette (top mistake #2 fix)
- Authority Hook with specific stats = proves research, builds confianza
- Soft CTA = 10× easier yes than a hard Calendly close
- 60-min audit delivery = urgency without pressure

---

## PROMPT SANITATION — hard rules after 2026-04-22 leak

Found live 2026-04-22: agent TTS was literally speaking `[Confidently]`, `[Concerned]`, `[Sighs]` because the LLM (Gemini) was emitting stage directions in its response tokens. **ElevenLabs v3 TTS reads bracket content as literal speech.**

**BANNED in LLM output** (REGLA 0 now enforces this in all 3 prompts):
- `[Confidently]`, `[Concerned]`, `[Warmly]`, `[Calmly]`, `[Firmly]`, etc.
- `[Sighs]`, `[Laughs]`, `[Pauses]` and any other physical cue
- `*italics*` or `**bold**` markdown — some TTS reads asterisks
- `(stage direction)` in parens at line start
- `#Header` lines — TTS reads `hashtag`

**Sanitizer check** before every agent PATCH:
```bash
grep -nE '\[[A-Z][a-z]+\]|\(whispering\)|\(sighs\)' <prompt.txt>
# must return empty — if not, strip and re-run
# NOTE: false positives OK inside "# REGLA 0 banned list" sections
# that document the rule — the LLM understands the instruction.
```

---

## Authority Hook — Inmuebles24 enrichment pipeline

**Why:** Generic "hola soy Sofia de JegoDigital" = spam-class trust. Specific "vimos que tiene 45 listados en Playa del Carmen, 12 de más de 60 días" = instant credibility.

**Required dynamic vars on every call (ADD to current set):**

| Var | Source | Example |
|---|---|---|
| `lead_name` | leads CSV `first_name` | "Judi" |
| `company_name` | leads CSV `company` | "Living Riviera Maya Real Estate" |
| `lead_email` | leads CSV `email` | "judi@livingrivieramaya.com" |
| `city` | leads CSV `city` | "Playa del Carmen" |
| `website_url` | leads CSV `website` | "https://livingrivieramaya.com" |
| **`listings_count`** | **NEW — Inmuebles24 scrape** | `45` |
| **`stale_days`** | **NEW — listings with > 60 days active** | `12` |
| **`neighborhoods`** | **NEW — top 2 zones from listings** | "Playa Centro, Playacar" |
| **`price_range_mxn`** | **NEW — median listing price** | "8M – 25M MXN" |

**Pipeline:** `lead-finder v4` Firecrawl pass → add Inmuebles24 agency profile scrape → extract `listings_count`, `stale_days`, `neighborhoods`, `price_range_mxn` → write into `leads/*.csv` as extra columns → `elevenlabs_trigger_call.cjs` injects them into `conversation_initiation_client_data.dynamic_variables`.

**Fallback when Inmuebles24 has no data:** skip BEAT 2 pain-hook specifics; use the city-wide stat only ("40% de consultas en {city}...").

---

## REPEP Compliance (CRITICAL — legal/reputation risk)

**Mexican REPEP (Registro Público para Evitar Publicidad)** — every cold call list MUST be scrubbed every 30 days against the national do-not-call registry, or PROFECO can fine us + Twilio can suspend the number.

**Required before every batch run:**

```bash
node website/tools/repep_scrub.cjs leads/<batch>.csv
# Output: leads/<batch>.repep-clean.csv + leads/<batch>.repep-blocked.csv
```

**Implementation plan** *(to be built 2026-04-22 PM — see TODO #A1 below):*
1. REPEP offers no public API — we mirror the published BMP (Bulletin) monthly via Hunter or a paid list broker
2. Cache locally at `.secrets/repep_bmp_YYYY-MM.csv`
3. Scrub by normalized phone E.164 hash comparison
4. Any lead on REPEP → flag `dnc_source: REPEP` → never dial

**Cadence:** Refresh `repep_bmp_YYYY-MM.csv` on the 1st of every month. Hard block dialing if cache > 30 days old.

---

## DNC Auto-Detect — LIVE in all 3 agents (2026-04-22 PM)

All 3 agents now detect and auto-terminate on any of these phrases:

- "No me llamen más" / "no vuelvan a llamar" / "no llame más"
- "Quítenme de su lista" / "bórrenme" / "elimíneme de su base"
- "No autorizo esta llamada" / "voy a reportar"
- "PROFECO" / "IFT" / "REPEP" mentioned by lead
- "Me están acosando" / "esto es spam" / "no insistan"
- "Remove me" / "Don't call me again" / "Stop calling" (English fallback)

**Agent behavior (REGLA 2):**
1. Respond ONCE with courtesy: "Con gusto, Licenciado/Licenciada. Lo/la quito de nuestra lista en este momento. Disculpe la molestia y que tenga excelente día."
2. Call `end_call` tool immediately
3. Post-call webhook writes `dnc: true` to Firestore `do_not_call`

**Firestore DNC collection schema:**
```json
{
  "phone": "+52XXXXXXXXXX",
  "email": "<if known>",
  "source": "elevenlabs_call | repep_bmp | manual",
  "first_tagged_at": "2026-04-22T15:00:00Z",
  "conversation_id": "conv_XXX",
  "reason": "no me vuelvan a llamar"
}
```

Every batch MUST filter against `do_not_call` BEFORE dialing.

---

## Trigger script (the daily driver) — v2

```bash
node /website/tools/elevenlabs_trigger_call.cjs \
  +52XXXXXXXXXX \
  "Lead Name" \
  --offer=A|B|C \
  [--email=lead@domain.com] \
  [--company="Inmobiliaria X"] \
  [--city="Playa del Carmen"] \
  [--website="https://domain.com"] \
  [--listings=45] \
  [--stale-days=12] \
  [--neighborhoods="Playacar, Centro"] \
  [--skip-repep-check=false]  # DEFAULT false; set true ONLY for test calls to Alex
```

The script MUST (v2 requirements):
1. Run REPEP scrub on the number before dialing (unless --skip-repep-check=true)
2. Run DNC check against Firestore `do_not_call` before dialing
3. Inject ALL 9 dynamic vars (including the 4 new Authority Hook ones)
4. Log the attempt to Firestore `cold_call_attempts` with timestamp, offer, outcome placeholder
5. Return `conversation_id` + `callSid` for post-call polling

---

## Key files (in `/mnt/jegodigital/website/tools/`)

| File | Purpose | Status (2026-04-22 PM) |
|---|---|---|
| `elevenlabs_trigger_call.cjs` | Trigger calls (supports `--offer=A/B/C`) | Present — needs v2 upgrade for new dyn vars + REPEP/DNC checks |
| `elevenlabs_list_agents.cjs` | List all agents in account | Missing — rebuild from ElevenLabs MCP |
| `elevenlabs_get_agent.cjs` | Get agent config details | Missing |
| `elevenlabs_check_phone.cjs` | List registered phone numbers | Missing |
| `audit_elevenlabs_calls.cjs` | Audit call history + zombie detection | Missing |
| `repep_scrub.cjs` | **NEW — scrub list vs REPEP BMP cache** | **TO BUILD (TODO #A1)** |
| `dnc_check.cjs` | **NEW — check Firestore do_not_call** | **TO BUILD (TODO #A2)** |
| `inmuebles24_enrich.cjs` | **NEW — scrape Inmuebles24 agency page → listings_count + stale_days** | **TO BUILD (TODO #A3)** |
| `prompt_sanitizer.cjs` | **NEW — strip [StageDirection] before PATCH** | **TO BUILD (TODO #A4)** |
| `batch_dial.cjs` | **NEW — sequential dialer with REPEP/DNC gates + outcome logging** | **TO BUILD (TODO #A5)** |

---

## When a call fails — failure-mode playbook (updated 2026-04-22 PM)

Ranked by frequency in yesterday's 34-call + today's 7-call batch:

1. **Voicemail (30-50%)** → **v3 CHANGE**: now LEAVES a 15s Spanish callback message (was: silent hangup). Consider retry in 3 business days if no callback.
2. **Gatekeeper "no está" / "no hay nadie con ese nombre" (15-20%)** → v2 prompts now treat gatekeepers with respect, ask for their name, and request callback slot instead of bypassing.
3. **Busy signal (10%)** → Twilio returns `status=busy`, `duration=0`. Retry in 2 hours.
4. **Wrong person / stale Maps data (5-10%)** → Graceful close + flag lead `data_stale: true` for removal from future batches. Lead-finder should re-verify before re-upload.
5. **Connection / audio issues (<5%)** → Check: (a) `turn_v2` set, (b) TTS model = `eleven_flash_v2_5`, (c) mu-law 8kHz format, (d) no stage directions in prompt.
6. **Agent doesn't pick up outbound** → Phone not attached to that agent. Run `GET /v1/convai/agents/<id>` → check `phone_numbers` array. `attach_phone_to_agent` if missing.
7. **Call ends in <10 s with no transcript** → Turn detection firing prematurely. Increase `turn_v2` sensitivity OR verify VAD not misreading silence.
8. **Silence > 15 s drops call** → Expected — `silence_end_call_timeout` = 15 s. Working as intended.
9. **Wrong language** → Agent prompt must include: "Respond in Spanish unless the lead speaks English first". All 3 agents have this via REGLA 1.
10. **Bracket stage directions leak** → REGLA 0 in all 3 v2 prompts explicitly bans this. If it recurs, re-verify via `get_agent_config` and confirm REGLA 0 is still in the prompt.
11. **Webhook not firing post-call** → See `SYSTEM.md § ElevenLabs post-call webhook`.

---

## Agent config migration — from v3_conversational to flash_v2_5

**Target:** ~75 ms inference latency (down from ~200 ms), better Twilio mu-law fit. NotebookLM research confirms: >800 ms response latency = instant hangup.

**Migration steps per agent:**
1. `mcp__ElevenLabs_Agents_MCP_App__get_agent_config(agent_id=<id>)`
2. Confirm current: `tts.model_id = "eleven_v3_conversational"`
3. PATCH with: `tts.model_id = "eleven_flash_v2_5"`, `output_format = "ulaw_8000"`
4. Immediately GET and diff — verify both fields landed (DISASTER_LOG 2026-04-21 lesson: PATCH can silently drop)
5. Test call to Alex (+52 998 202 3263) with `--skip-repep-check=true`
6. Listen for: (a) faster response, (b) no quality degradation, (c) no new artifacts
7. Roll out to remaining 2 agents IF test passes

**Rollback:** if flash_v2_5 degrades audio quality on MX cellular, revert to `eleven_v3_conversational` and chase latency via region routing + ConversationRelay instead.

---

## Today's 2-customer goal — execution flow (2026-04-22)

**Math:** Industry cold-call pickup rate is 5-10%, close rate on conversation is 2-5%. So to hit 2 closes today, need ~80-200 dials.

**Reality check:** we have 28 verified leads. That's **not enough for a 2-close day**. We need:

| Lever | Action | Time | Status |
|---|---|---|---|
| Supply | Run `lead-finder` v4 on Cancún/Playa/Tulum to bring total to 100+ | 25 min | pending |
| Conversion | Ship prompt fixes (strip stage directions + add AIDA + DNC + 9 objections) | 30 min | ✅ DONE (2026-04-22 PM) |
| Velocity | Build `batch_dial.cjs` to dial 5 concurrent | 45 min | pending |
| Compliance | Ship `repep_scrub.cjs` before first batch | 60 min | pending |

**Minimum viable path to 2 closes today (updated):**
1. ✅ Ship prompt fixes to all 3 agents — DONE
2. QA test call (1 dial on Agent B to Alex's line OR low-stakes lead) to verify v2 prompts work end-to-end — 5 min
3. Run lead-finder to get +72 Cancún/Playa/Tulum leads — 25 min (parallel)
4. Skip REPEP for today's batch (accept risk, document decision in DISASTER_LOG) OR use only IG/email opt-in leads (safer)
5. Dial 30-60 leads sequentially on Agent B starting ASAP — 2-3 hours, expect 2-5 live conversations, 1-3 audit confirms
6. Manually ship audits within 60 min using seo-engine (TODO #B-Audit)
7. Alex takes 2 Calendly calls → closes 2 today

---

## Quick-start recipes

**"Cold call +52 984 116 3251 (Judi, Living Riviera Maya Real Estate) with the audit offer"** *(assuming v2 trigger script is shipped)*
```bash
node website/tools/elevenlabs_trigger_call.cjs \
  +529841163251 "Judi" \
  --offer=B \
  --email=judi@livingrivieramaya.com \
  --company="Living Riviera Maya Real Estate" \
  --city="Playa del Carmen" \
  --website=https://livingrivieramaya.com \
  --listings=45 \
  --stale-days=12
```
After the call: poll `/v1/convai/conversations/<conv_id>` for outcome. If `call_successful=success` AND transcript contains email confirmation → trigger audit pipeline (TODO #B-Audit below) within 60 min.

**"Why is Offer A agent using the wrong voice?"**
```
mcp__ElevenLabs_Agents_MCP_App__get_agent_config(agent_id="agent_6601kp758ca4fcx8aynsvc0qyy5k")
# Verify voice_id is MD6rLAhozcrmkdMZeOBt. If not, update_agent to restore.
```

**"Update an agent prompt without breaking formatting"**
```
# 1. Pull current
mcp__ElevenLabs_Agents_MCP_App__get_agent_config(agent_id=<id>)
# 2. Sanitize new prompt (strip bracket directions)
grep -nE '\[[A-Z][a-z]+\]' new_prompt.txt
# 3. PATCH
mcp__ElevenLabs_Agents_MCP_App__update_agent(agent_id=<id>, prompt=<new>, temperature=0.3)
# 4. Verify via GET + diff
```

---

## Open TODO — prioritized post-2026-04-22 PM upgrade

### TODAY (still open, 2026-04-22 PM)

- ~~**#A1 REPEP scrubbing**~~ — deferred to tomorrow; using opt-in-only leads for today's batch, decision documented in DISASTER_LOG
- ~~**#A2 DNC auto-detect**~~ — ✅ DONE (live in all 3 agent prompts via REGLA 2)
- ~~**#A3 Strip stage directions**~~ — ✅ DONE (REGLA 0 in all 3 agent prompts)
- ~~**#A4 AIDA opener rewrite**~~ — ✅ DONE (canonical 4-beat structure in all 3 prompts)
- **#A5 Batch dialer** (`batch_dial.cjs`) — still pending
- ~~**#A6 Gatekeeper handoff**~~ — ✅ DONE (protocol in v2 prompts treats gatekeepers with respect, requests callback slot)
- **#A7 QA test call** — dial 1 lead to verify all v2 changes behave end-to-end BEFORE batch run

### THIS WEEK

- **#B-Audit Auto-audit pipeline for Offer B** — `seo-engine` → PDF → Brevo transactional → 60-min delivery. Without this Offer B's promise is unkept.
- **#B-Authority Inmuebles24 enrichment** (`inmuebles24_enrich.cjs`) — scrape listing count + stale days → write to leads CSV → trigger script injects into dyn vars. Biggest conversion lift.
- **#B-Latency `eleven_flash_v2_5` migration** — per §Agent config migration above. Test with 1 call to Alex before rollout.
- **#B-Lead supply** — lead-finder v4 on Cancún/Playa/Tulum → 100+ leads with phone + email + company + listings_count.
- **#B-Callback inbound flow** — wire inbound calls to +52 998 387 1618 (callback from voicemail) to route to Alex's cell OR to an inbound ElevenLabs agent that recognizes caller + hands off.
- **#B-Offer A max duration** — 600 s → 300 s (10 min too long; most conversion is in first 2 min) — dashboard-only setting, not exposed via update_agent API.
- **#B-Missing utility scripts** — rebuild `elevenlabs_list_agents.cjs`, `elevenlabs_get_agent.cjs`, `audit_elevenlabs_calls.cjs`.

### NEXT 30 DAYS

- **#C-ConversationRelay evaluation** — test Twilio ConversationRelay vs ElevenLabs' native `twilio/outbound-call` endpoint. Hypothesis: lower latency on managed relay.
- **#C-Regional routing verification** — confirm ElevenLabs serving region = us-east (nearest to Twilio MX media edge).
- **#C-Constancia de Situación Fiscal** — verify filed with Twilio for +52 998 387 1618. Without it, deliverability decays.
- **#C-30-30-30 split test** — once all 3 agents are production-ready, run 90 calls (30 per offer) to statistically measure conversion.
- **#C-Industry benchmarks dashboard** — live pull: total dials, pickup rate, conversation rate, audit-confirm rate, Calendly book rate, close rate. Update weekly.

---

## Live batch log

### 2026-04-22 Tier 1 Cancún/Playa run (all Agent B v1)

Full transcript of what we learned dialing 7 decision-makers:

| # | Lead | Phone | Outcome | Duration | Finding |
|---|---|---|---|---|---|
| 1 | Judi Shaw — Owner, Living Riviera Maya RE | +529841163251 | Busy | 0 s | — |
| 2 | Andrea Flores — Commercial Dir, Evoke RE | +529842294192 | Voicemail + Spanish msg | 21 s | Voicemail flow works |
| 3 | Albane Mellec — Branch Mgr, Century 21 Caribbean | +529848794858 | Gatekeeper said "no" | 17 s | Agent needed gatekeeper handoff (→ now fixed in v2) |
| 4 | Antoine Menudier — Mktg Dir, L'agence | +525633709470 | Voicemail + msg | 21 s | Clean |
| 5 | Rosalia Cosio — Founder, Preferred Luxury RE | +529982931591 | Audio fail — [Confidently] leaked | 28 s | Stage-direction bug (→ now fixed via REGLA 0) |
| 6 | Allan Lockhart — Mgr, NAS Playa | +529842148038 | Voicemail + msg | 21 s | Clean |
| 7 | Bibiana Fidalgo — Mgr, Select Realty | +529841798042 | Wrong person + stage-direction leak | 44 s | Stale Maps data + (→ now fixed via REGLA 0) |

**v1 takeaway:** 0/7 human conversations (normal for cold). 3/7 clean voicemails (31% — decent). 2/7 prompt bugs (fixed in v2). 1/7 gatekeeper block (fixed in v2). 1/7 stale data.

### 2026-04-22 PM — v2 PATCH batch (all 3 agents)

- Agent A PATCHed to v2 ✅ (verified via GET)
- Agent B PATCHed to v2 ✅ (verified via GET)
- Agent C PATCHed to v2 ✅ (verified via GET)
- All agents: name suffix "v2" confirmed
- All agents: REGLA 0-5 present
- All agents: AIDA 4-beat opener in Spanish Usted
- All agents: DNC auto-detect + `end_call` wiring
- All agents: voicemail leaves 15s callback message (was: silent hangup)

**Pending QA:** dial 1 lead on Agent B to verify end-to-end before batch run (TODO #A7).

---

## Cross-harness portability

Project-level skill at `/mnt/jegodigital/.claude/skills/cold-calling-ai/` — travels with the folder. Also mirrored to `/mnt/jegodigital/_imported_skills/cold-calling-ai/` for plugin export. Depends on:
- `ELEVENLABS_API_KEY` env var (for the Node scripts)
- `TWILIO_*` credentials (for the trigger script + Twilio status polling)
- `mcp__ElevenLabs_Agents_MCP_App__*` tools (for agent config work)
- `mcp__notebooklm__*` tools (for sales research refresh — notebook `jegodigital-cold-call-sales-re`)
- `.secrets/repep_bmp_YYYY-MM.csv` (REPEP cache — rotates monthly)
- Firebase Admin SDK (for Firestore `do_not_call` + `cold_call_attempts` collections)

**Source truth:** `CLAUDE.md § AI COLD CALLING` + `SYSTEM.md` (post-call webhook wiring, crontab entries) + `DISASTER_LOG.md` (2026-04-21 voicemail zombie fix, 2026-04-22 AM stage-direction leak, 2026-04-22 PM NotebookLM research upgrade).
