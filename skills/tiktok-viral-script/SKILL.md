---
name: tiktok-viral-script
description: Daily viral TikTok script generation for Alex Jego's personal/agency content. Use EVERY TIME Alex needs a viral script for TikTok, IG Reels, or YT Shorts. Format is VALUE-FIRST (no sales pitch, no DM CTA), 15-17 seconds long, phone-native POV style. Researches breaking AI/real-estate news daily via Perplexity, picks today's rotation format (Mon Hidden News, Tue Future Coming, Wed How-To Reveal, Thu Industry Shift, Fri Search Evolution), generates script via Gemini 2.5 Flash, posts to Slack #content at 09:00 AM CDMX. Triggers — viral script, viral video, daily script, tiktok script, what should I record, give me a script, content idea, viral content, video idea. DIFFERENT from `alex-founder-video` skill — that skill handles 45-60s educational content with sales CTA. This skill handles 15-17s pure-value viral content with NO sales.
---

# TikTok Viral Script — Daily Delivery

**Owner:** Alex Jego (records on iPhone, hand-held, walking)
**Goal:** Go viral. Provide value. NEVER sell on the video.
**Output:** 1 script per day, Mon-Fri, posted to Slack `#content` at 09:00 AM CDMX
**Length:** 15-17 seconds (TikTok 2026 viral sweet spot per Perplexity research = 9-21s)

---

## ⚠️ HARD RULES (do not violate)

1. **NO sales CTA in the video.** No "DM AUDIT". No "schedule a call". No "visit my site". Pure value.
2. **NO corporate intro.** Never "Soy Alex, fundador de JegoDigital, trabajamos con inmobiliarias en México que..." — viewer swipes in 1.5 seconds.
3. **First-person, conversational.** Like texting a friend. NOT like a pitch.
4. **Length 15-17 seconds max.** Anything longer = algorithm punishes for non-followers.
5. **Real news only — HR-0 compliant.** Every script anchored to a verifiable news event/launch from the last 30 days. NO fabricated trends.
6. **Pattern interrupt at 0-2s.** Big visual reveal, dramatic statement, or curiosity gap.
7. **End on insight, not CTA.** A provocative statement, question, or implication. NOT a pitch.
8. **Soft "follow" only if needed.** Maximum 3 words: "Síguenos para más" or "Te dejo el link" — NEVER a sales hook.

---

## 📅 Weekly Rotation (5 formats, Mon-Fri)

| Day | Format | Hook pattern | Example anchor news |
|---|---|---|---|
| **Lunes** | **Hidden News** — something major most agents don't know | "X hace Y semanas. Nadie está hablando de esto." | Sora 2 shutdown by OpenAI (Mar 24 2026) |
| **Martes** | **Future Coming** — what just launched in US that will hit Mexico | "Esto pasó hace X semanas en EU. Va a llegar a México." | Realtor.com ChatGPT app (Mar 30 2026) |
| **Miércoles** | **How-To Reveal** — a tool that exists today most don't know about | "Acabo de [hacer algo imposible]. Solo necesité [X]." | Veo 3 photo→video for property tours |
| **Jueves** | **Industry Shift** — consolidation, regulation, or market change | "[Big event] pasó. ¿Por qué importa esto en México?" | Compass + Redfin merger (Feb 2026) |
| **Viernes** | **Search Evolution** — how people are searching/buying differently | "Google/ChatGPT lanzó algo que cambia cómo la gente busca." | Google AI Mode for real estate (Mar 2026) |

---

## 🎬 Script Structure (3 beats, NOT 6)

```
HOOK (0-2s) ───── Pattern interrupt — dramatic statement OR shocking visual OR curiosity gap
   ↓
PUNCH (3-13s) ─── The juice — real news, what it means, with a screen recording or visual
   ↓
END (14-17s) ──── Provocative implication, NOT a sales pitch
```

### Hook templates (proven viral in Mexican RE niche per research)

- *"¿Sabías que [shocking statistic]?"*
- *"[Major company] cerró [product] hace 3 semanas. Nadie está hablando de esto."*
- *"Esto pasó en [country] hace [time]. Va a llegar a México."*
- *"Acabo de [do something impossible]. Solo necesité [tool]."*
- *"Una agencia [perdió/ganó] $[amount] por esta razón..."*
- *"Le pregunté a ChatGPT [unexpected question] y mira lo que me dijo..."*

### Forbidden hook openers

- ❌ "Soy [name], fundador de [company]..."
- ❌ "En [agency name] ayudamos a..."
- ❌ "¿Quieres más leads?..." (sales-y)
- ❌ "Los inmobiliarios necesitan..." (lecture)
- ❌ "Hace tiempo que..." (boring)

### End templates (anti-CTA)

- *"En 6 meses esto va a cambiar todo."*
- *"El que se prepare ahora, sobrevive."*
- *"Cuando esto llegue a México, va a barrer."*
- *"Está GRATIS. Y casi nadie lo está usando."*
- *"Te dejo el link en mi perfil."* (max acceptable)
- *"Síguenos si te sirvió."* (max acceptable)

---

## 🔎 Daily Research Pipeline

The Cloud Function `dailyTiktokViralScript` runs every weekday 09:00 CDMX and:

### Step 1 — Pull breaking news (Perplexity)

Query template:
```
Find news from the last 30 days that would WOW a Mexican real estate agent. Focus on:
- AI tool launches/shutdowns (Sora, Veo, Gemini, ChatGPT, Claude)
- Real estate platform changes (Compass, Redfin, Realtor.com, Zillow)
- Google/Apple/Meta search/maps updates
- Mexican real estate law/regulation changes
- New AI tools that work for property listings
- TikTok/Instagram new features for businesses
- Mortgage tech / fintech in Mexico
- New AI video/image tools

For each item: WHAT, WHEN, WHY it WOWs, source URL.
```

Use `search_recency_filter: "month"` and Perplexity `sonar-pro` model.

### Step 2 — Pick today's format

Based on weekday (Mon-Fri), use the rotation table above.

### Step 3 — Pick the best news anchor

From Perplexity results, pick the news item that best fits TODAY's format. Use the format's hook pattern.

### Step 4 — Generate script (Gemini 2.5 Flash)

Prompt template (see `scripts/generateScript.js` for the actual implementation):
```
You are writing a 15-17 second viral TikTok script for Alex Jego, a digital marketing
agency owner in Mexico who works with real estate agents.

TODAY'S FORMAT: {format_name}
HOOK PATTERN: {hook_pattern}
NEWS ANCHOR: {news_item}

HARD RULES:
- 15-17 seconds total (~45-55 spoken words)
- 3 beats: HOOK (0-2s) → PUNCH (3-13s) → END (14-17s)
- NO sales CTA, NO "DM me", NO "schedule a call"
- First-person, conversational Mexican Spanish
- Pattern interrupt at 0-2s
- End on a provocative implication or "follow for more"

CASE STUDIES Alex can mention if relevant: Flamingo Real Estate (Cancún, +320% organic),
GoodLife Tulum, Goza, Solik. ONLY mention if it makes the script stronger — never force.

OUTPUT FORMAT (JSON):
{
  "format": "...",
  "news_anchor": {...},
  "hook": "...",
  "punch": "...",
  "end": "...",
  "broll_suggestions": [...],
  "hashtags": [...],
  "posting_time_recommendation": "...",
  "estimated_seconds": 16
}
```

### Step 5 — Post to Slack #content

Use Slack Bot Token (`SLACK_BOT_TOKEN` GH Secret) → channel `SLACK_CHANNEL_CONTENT` (`C0AV1EEDC3F`) → `chat.postMessage` API.

Format the Slack message with:
- 🎬 Today's format (header)
- 📰 News anchor with citation link
- 📝 The 3-beat script (hook/punch/end blocks)
- 🎨 B-roll suggestions
- 🏷️ Hashtags
- ⏰ Posting time recommendation

---

## 🎨 Production Notes (always include with every script)

### Recording style (Alex)

- iPhone hand-held, selfie style
- Walking outside or in office
- Lavalier mic (Rode smartLav+)
- Window light or outdoor light
- Solid dark top (black, navy, gray)
- 3 takes, pick best in edit

### Editing (CapCut)

- 9:16 vertical (1080×1920), 30fps
- Burned captions word-by-word, Montserrat Bold 56pt, white w/ 4px black stroke, **yellow on power words** (e.g. "SORA", "VEO 3", "FUSIONARON", "GRATIS", "320%")
- Jump-cut every 2-3 seconds
- B-roll overlay 30-50% of runtime (screen recordings, news headlines, charts)
- Music: corporate-upbeat / lofi-tech under 90 BPM, 10-20% volume
- SFX: whoosh on cuts, ding on reveals, bass drop on hook

### B-roll guidelines per format

| Format | B-roll types |
|---|---|
| Hidden News | News headline screenshots, dramatic typography |
| Future Coming | Screen recording of US tool, animated map of US→MX |
| How-To Reveal | Screen recording of YOU using the tool, before/after |
| Industry Shift | Animated logo morphs (e.g., Compass + Redfin), org chart |
| Search Evolution | Side-by-side: old keyword search vs new AI conversational search |

### Hashtags (rotate 3-4 per video)

Trending in MX RE niche per research:
```
#CasasCDMX #InmueblesMexico #TulumInversion #RemaxMexico #ViviendaPlayas
#InmobiliariasMexico #BienesRaicesMX #Cancun #IA2026 #ChatGPT #SEOLocal
```

### Posting time

- Default: 6:00-8:00 PM CST (peak audience)
- Counterintuitive trick: 3:00-5:00 AM CST (off-peak algo boost — 3× push per Perplexity research, e.g., @inmueblesnocturnos hits 1M+ views consistently)

---

## 📡 Slack Message Format (what Alex sees at 09:00 AM)

```
🎬 *Lunes — Hidden News*

📰 *News anchor:* OpenAI cerró Sora 2 el 24 de marzo
🔗 https://theweek.com/business/openai-ending-ai-video-sora

━━━━━━━━━━━━━━━━━━━━━

📝 *SCRIPT (15s)*

*HOOK (0-2s):*
"OpenAI cerró Sora 2 hace 3 semanas. Nadie está hablando de esto."

*PUNCH (3-12s):*
"Lo cerraron el 24 de marzo. ¿La razón? Los videos eran demasiado realistas — deepfakes en año de elecciones."
"¿Y ahora qué? Veo 3 de Google es el reemplazo. Y lo puedes usar HOY para crear videos de tus propiedades en 30 segundos."

*END (13-15s):*
"Te dejo el link en mi perfil."

━━━━━━━━━━━━━━━━━━━━━

🎨 *B-roll suggestions:*
- Sora 2 logo with "DISCONTINUED" stamp
- Veo 3 generation example (10s clip)
- Side-by-side: empty Sora page vs Veo 3 working

🏷️ *Hashtags:* #IA2026 #VideoGenerativo #InmobiliariasMexico #ChatGPT

⏰ *Posting time:* 6:30 PM CST (peak) OR 4:00 AM CST (algo boost trick)

━━━━━━━━━━━━━━━━━━━━━

📋 *Next steps:*
1. Review script (1 min)
2. Set up phone + window light (5 min)
3. Record 3 takes (5 min)
4. Drop raw clip in #content thread → I'll edit
5. Post tonight 6:30 PM
```

---

## 🛑 Common mistakes to avoid (lessons from disaster)

| Mistake | Why it kills | Fix |
|---|---|---|
| 60-second script | Algo punishes >25s for non-followers | 15-17s max |
| "Soy Alex, fundador de..." | Corporate intro = swipe in 1.5s | First-person POV, no bio |
| "DM 'AUDIT' para auditoría gratis" | Sales pitch kills shareability | Remove ALL sales CTAs |
| 6-beat structure (hook+authority+problem+shift+proof+CTA+loop) | Way too much for 15s | 3 beats max (hook+punch+end) |
| Generic CTA at end | Reduces share rate | End on insight, not pitch |
| No real news | Generic "AI is changing RE" sounds like everyone else | Anchor every script in real news <30 days old |
| Studio talking-head | 38% of viral; phone-shot POV is 62% | Phone selfie, walking, hand-held |
| English mixed with Spanish | Confuses MX audience | Pure Mexican Spanish |

---

## 🔧 Implementation files

- **Cloud Function:** `website/functions/dailyTiktokViralScript.js`
- **Schedule:** `every weekday 09:00` timezone `America/Mexico_City`
- **On-demand endpoint:** `dailyTiktokViralScriptOnDemand` (X-Admin-Token required)
- **Output channel:** `#content` (`C0AV1EEDC3F`)
- **Research stack cost:** ~$0.60/month (Perplexity Sonar + Gemini 2.5 Flash + DataForSEO trends)

---

## 🎯 Success metrics (track weekly)

- Videos shipped: target 5/week
- Views per video: target 10K+ baseline, 100K+ for "hits"
- Share rate: target ≥3% (proxy for "WOW")
- Save rate: target ≥1% (proxy for "useful")
- Comment-to-view ratio: target ≥0.5%
- Followers gained per video: track but not primary KPI

Reports: weekly Sunday post to `#content` summarizing the week + recommending next week's news angles.

---

## 🔗 Related skills

- `alex-founder-video` — DIFFERENT format (45-60s educational with sales CTA). Don't confuse.
- `youtube-thumbnail` — for YouTube Shorts thumbnails (1280×720)
- `instagram-publisher` — auto-publish to @jegodigital_agencia IG Reels
- `notebooklm` — deeper research when one news item needs more context
- `tiktok-viral` — strategy/algorithm rules (when it exists)
