---
name: jegodigital-instagram-stories
description: "Create JegoDigital Instagram Stories at 1080x1920px (9:16) using HTML+Playwright with full emoji support. Stories are BOLD, visual-first, single-screen punches — not corporate infographics. Use EVERY TIME Alex asks to create Instagram Stories, IG stories, story content, daily stories, or any 1080x1920 vertical content for @jegodigital. Triggers: story, stories, IG story, Instagram story, daily story, story template, story post, post a story, new story, historia, historias, vertical content, 9:16 format, story series, story pack, batch stories. Stories are NOT resized carousel slides — they have their own design language optimized for 3-5 second attention spans."
---

# JegoDigital Instagram Stories — Bold, Visual-First, Alive

Stories disappear in 24 hours. They should feel like Alex himself posted them from his phone — bold, fun, full of emojis, with real screenshots OR premium branded template mockups. NOT corporate posters.

## TWO-PATH VISUAL POLICY (updated 2026-04-24 per Alex directive)

- **Path A — Real screenshot + named client:** For stories that name a specific client (Flamingo, GoodLife, etc.), use ONLY real screenshots from `/website/img/showcase/<client>/`. Never fabricate and misattribute to a real client.
- **Path B — Branded template mockup + NO client name:** For stories that showcase what we CAN build (generic capability), use premium aspirational mockups (CRM dashboards, Google Maps rank, WhatsApp AI flows, email automations, property listings). Must be brand-locked (#0f1115 + #C5A059), clearly framed as templates ("Tu próximo CRM" / "Ejemplo") — NEVER attributed to a specific client. Pull from `/brand-assets/01-service-illustrations/` or `/brand-assets/07-templates/`.

**Quick test:** Names a client → Path A. Generic capability demo → Path B.

## Design Philosophy (v5 — April 24 2026, post-Alex feedback)

1. **MUST FILL THE FULL CANVAS** — content occupies entire safe zone (y:270 to y:1650 = 1380px usable). Empty black space below the main content = REJECTED. Use absolute positioning OR `min-height:100vh` flex with `flex:1` spacers and bottom-anchored elements. After every render, eyeball the screenshot — if you see >150px of empty space anywhere, redo it.
2. **MIX backgrounds.** Not all dark. Alternate: white, gold, dark, colored, gradient. The pattern interrupt stops the scroll. Plan a 5-story batch to vary bg every story.
3. **BIG text fills the screen.** Headlines: 3-7 words MAX in 50-72px. One number can be 220-280px. Sub-text at 28-36px (not 18-22). If someone can't read it in 2 seconds, it's too small or too long.
4. **Screenshots DOMINATE when used.** 70%+ of the screen height when present. Not small framed thumbnails — the screenshot IS the story.
5. **Emojis are MANDATORY — 5-8 PER STORY (not 3-6).** Sprinkle them liberally: in eyebrow tags, between words in headlines, beside list items, as decorative floating elements in the corners, in the CTA. Stories should feel ALIVE. Playwright + Noto Color Emoji renders them perfectly. Forbidden: a story with fewer than 5 emojis.
6. **Decorative elements.** Add SVG arrows, dashed circles, underlines, sparkles ✨, sticker-style emoji clusters (3-4 emojis grouped as confetti), curved lines, accent shapes. These make "designed" content feel casual and authentic — like Alex made it on his phone.
7. **One idea per story** — but unpack it richly. Big stat → context → comparison → CTA is still ONE idea. NOT: stat + screenshot + tips + testimonial = four ideas (rejected).
8. **Engagement hook at bottom** — question, poll, "respond with A/B/C", "DM us QUIERO", "swipe up 👀". Always present. Always specific.
9. **PERSONALITY — have fun, don't be corporate.** Use casual Spanish: "ouch 😬", "te lo juro 🙏", "neta? 🤯", "ya párenle ✋". Stories should feel like a friend texting, not an agency posting. Brand still locked (#0f1115 + #C5A059) but tone is loose.
10. **Layout density:** every story should have 4-6 visual layers (eyebrow + headline + middle visual + supporting text + emoji decorations + bottom CTA + brand). NOT 2 layers.

## Technical Specs

- **Size:** 1080 x 1920 px (9:16 vertical)
- **Safe zone:** Top 250px and bottom 250px covered by Instagram UI
- **Critical content zone:** y:270 to y:1650
- **Text minimum:** 42px body, 52px+ headlines
- **Format:** PNG for static, MP4 for video
- **Output dir:** `/sessions/<session>/mnt/jegodigital/instagram/stories/`
- **Renderer:** Playwright (Chromium) — NOT WeasyPrint (WeasyPrint cannot render emojis)

## Brand Palette

| Element | Value | When |
|---|---|---|
| Dark bg | `#0f1115` | Default dark stories |
| White bg | `#FFFFFF` | Pattern interrupt stories (BIG STAT) |
| Gold bg | `#C5A059` | CTA stories — full gold background |
| Gold accent | `#C5A059` | Text highlights, borders, numbers |
| Red accent | `#ff6b6b` | "ANTES" sections, negative stats |
| Green accent | `#4ade80` | "DESPUÉS" sections, growth numbers |
| Card bg | `#1a1d24` | Info cards on dark backgrounds |

---

## EMOJI FONT SETUP (CRITICAL — do this FIRST every session)

Playwright's Chromium in the sandbox has NO emoji font by default. Emojis render as squares without this step.

```bash
mkdir -p ~/.local/share/fonts
curl -sL "https://github.com/googlefonts/noto-emoji/raw/main/fonts/NotoColorEmoji.ttf" \
  -o ~/.local/share/fonts/NotoColorEmoji.ttf
fc-cache -f ~/.local/share/fonts/
fc-list | grep -i emoji  # Must show "Noto Color Emoji"
```

**CSS font stack:** `font-family: 'Liberation Sans', 'DejaVu Sans', Arial, sans-serif;`
The emoji font auto-falls-back via fontconfig. Do NOT put emoji font first — text spacing breaks.

---

## CLIENT SHOWCASE ROTATION (MANDATORY)

Every story referencing a client MUST rotate. Never default to Flamingo. Use `random.choice()` or cycle.

### Client Database

| Client | Location | Top Stats | Screenshots |
|---|---|---|---|
| **Flamingo** | Cancún | 4.4x visibility, #1 Maps, +320% traffic, 88% automated | `flamingoscreenshots/`, `showcase/flamingo/` |
| **GoodLife** | Tulum | +300% traffic, 5x ROI leads, 42% email open rate | `showcase/goodlife/` |
| **Goza** | Cancún | 3x lead volume, 98 PageSpeed, 24/7 AI coverage | `showcase/goza/` |
| **Solik** | Riviera Maya | 95% qualify rate, #1 Maps, 6 AI automations, bilingual | `solik/` |
| **RS Viajes** | Colima | 4.9⭐ Google, 10 SEO articles, 98.9 on-page score | `rsviajesscreenshots/` |
| **Piedra de Mar** | — | Cinematic videos EN+ES, premium showcase | `website/img/showcase/piedra/` |

### Stat Pool (rotate for BIG STAT stories)

| Client | Number | Label |
|---|---|---|
| Flamingo | 4.4x | Más visibilidad en Google |
| Flamingo | +320% | Crecimiento de tráfico orgánico |
| Flamingo | #1 | Google Maps en Cancún |
| Flamingo | 88% | De leads automatizados |
| GoodLife | +300% | Más tráfico orgánico |
| GoodLife | 5x | Más leads con calculadora ROI |
| GoodLife | 42% | Tasa de apertura de emails |
| Goza | 3x | Volumen de leads |
| Goza | 98 | PageSpeed Score perfecto |
| Solik | 95% | Tasa de calificación de leads |
| Solik | #1 | Google Maps Riviera Maya |
| RS Viajes | 4.9⭐ | Estrellas en Google |
| RS Viajes | 98.9 | Score on-page perfecto |

---

## The 5-Story Arc (use for batches)

1. **HOOK** — White/bright bg, massive stat, pattern interrupt
2. **PROOF** — Real screenshot fills 70%+ of frame, hand-drawn arrows/circles
3. **BEFORE/AFTER** — Split screen. Red top (ANTES) → Gold divider → Green bottom (DESPUÉS)
4. **BOLD STATEMENT** — Dark bg, text-only, provocative take people screenshot
5. **CTA** — Full gold background, checklist, black CTA button

Each story uses a DIFFERENT client. Never repeat in consecutive stories.

---

## The 6 Story Types

### 1. BIG STAT (white/bright background)
Giant number (180-220px) fills screen. White bg = pattern interrupt.

**Structure:** White bg → dark pill "DATO REAL 💡" → MASSIVE number → subtext with gold underline highlight → dark card with ❌/✅ comparison → question hook

### 2. SCREENSHOT PROOF (dark background)
Real screenshot fills 70%+ of screen. Minimal text. Hand-drawn SVG overlays.

**Structure:** Dark bg → "CLIENT · CITY 🔥" eyebrow → short headline (36px) → HUGE screenshot (rounded + shadow) → SVG dashed circle + arrow on key metric → stat strip (3 mini cards)

### 3. BEFORE/AFTER (split screen)
Top = dark-red "ANTES", bottom = dark-green "DESPUÉS", gold divider.

**Structure:** Red-tint top → "ANTES 😬" pill → big red stat → ❌ tags → gold divider "⚡ 30 DÍAS DESPUÉS ⚡" → green-tint bottom → "DESPUÉS 🚀" pill → real screenshot → growth stats

### 4. BOLD STATEMENT (dark, text-only)
Provocative one-liner people screenshot and share.

**Structure:** Dark bg + subtle gold radial → "VERDAD INCÓMODA ⚠️" → massive statement with key word in gold → gold line → supporting stat → mini proof card → action prompt

### 5. CTA (full gold background)
Direct call to action. Gold bg = eye-catching break.

**Structure:** Gold bg → "@JEGODIGITAL" → big black text question → dark card with ✅ checklist → black button "Escríbenos QUIERO 💬" + WhatsApp → client trust strip

### 6. NEW POST ALERT (dark, minimal)
Drive feed traffic.

**Structure:** Dark bg → "NUEVO POST 🔔" pill → topic headline → teaser → gold arrow down → "VE AL FEED"

---

## SVG Hand-Drawn Elements

### Arrow down
```html
<svg width="60" height="80" viewBox="0 0 60 80">
  <path d="M30 5 Q25 40 30 65 M15 50 L30 70 L45 50" fill="none" stroke="#C5A059" stroke-width="4" stroke-linecap="round"/>
</svg>
```

### Dashed circle (overlay on screenshots)
```html
<svg width="200" height="120" viewBox="0 0 200 120">
  <ellipse cx="100" cy="60" rx="90" ry="50" fill="none" stroke="#C5A059" stroke-width="3" stroke-dasharray="8 4" opacity="0.8"/>
</svg>
```

### Curved arrow
```html
<svg width="80" height="60" viewBox="0 0 80 60">
  <path d="M60 5 Q40 20 20 50" fill="none" stroke="#C5A059" stroke-width="3" stroke-linecap="round"/>
  <path d="M25 35 L18 52 L35 48" fill="none" stroke="#C5A059" stroke-width="3" stroke-linecap="round"/>
</svg>
```

### Gold underline highlight
```html
<span style="background:linear-gradient(transparent 60%, #C5A059 60%);">highlighted text</span>
```

---

## Render Pipeline (Playwright)

```python
import base64, asyncio
from pathlib import Path

CSS = """
* { margin: 0; padding: 0; box-sizing: border-box; }
body { margin: 0; font-family: 'Liberation Sans', 'DejaVu Sans', Arial, sans-serif; }
.story { width: 1080px; height: 1920px; position: relative; overflow: hidden; }
b { font-weight: 800; }
"""

def img_to_b64(path):
    with open(path, "rb") as f:
        return f"data:image/png;base64,{base64.b64encode(f.read()).decode()}"

async def render_stories(stories_html, names, out_dir):
    from playwright.async_api import async_playwright
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        for i, (html, name) in enumerate(zip(stories_html, names)):
            full = f'<!doctype html><html><head><meta charset="utf-8"><style>{CSS}</style></head><body>{html}</body></html>'
            page = await browser.new_page(viewport={"width": 1080, "height": 1920}, device_scale_factor=1)
            await page.set_content(full, wait_until="networkidle")
            await page.wait_for_timeout(500)
            await page.screenshot(path=str(Path(out_dir) / f"{name}.png"))
            await page.close()
        await browser.close()

asyncio.run(render_stories(stories_html, names, OUT))
```

**Dependencies (install once per session):**
```bash
pip install playwright --break-system-packages
python3 -m playwright install chromium
```

---

## ENGAGEMENT MAXIMIZATION (2026 research-backed)

### Why this matters

Independent 2026 research across SocialPilot, Sprout Social, Buffer, OverlayText, and SocialRails confirms (sources cited inline below):

- **Interactive sticker engagement** beats static stories by **40-50%** ([SocialRails 2026 poll guide](https://socialrails.com/blog/instagram-poll-features-guide), [Insta Saver 2026](https://instasaver.io/en/blog/how-to-use-polls-quizzes-stickers-to-skyrocket-story-engagement/))
- **Animated text** boosts story **completion rate by 45%** ([OverlayText 2026](https://overlaytext.com/blog/instagram-text-effects-typography-social-media))
- **Text overlays on visuals** drive **50% more engagement** than image-only ([OverlayText 2026](https://overlaytext.com/blog/instagram-text-effects-typography-social-media))
- **Sticker stacks** (multiple interactive elements per story) outperform single-sticker stories ([Sked Social 2026](https://skedsocial.com/blog/ideas-to-boost-interactions-on-instagram-stories-in-2026))
- The IG algorithm treats sticker taps + replies as **high-value engagement signals** that move stories earlier in the tray and into suggested content ([Buffer 2026 algorithm](https://buffer.com/resources/instagram-algorithms/))

### The Graph API limitation (critical)

**The IG Content Publishing API does NOT support interactive stickers.** Polls, quizzes, emoji sliders, question stickers, countdown stickers, location/mention stickers — none are exposed via the public Graph API as of 2026-04. They can only be added by manual posting from the Instagram app.

This means autonomous Cloud Function publishing **cannot create real interactive stickers**. The ENGAGE-via-API workaround is what this section is about.

### Two-track engagement strategy

**Track A — AUTONOMOUS (Cloud Function, Mac off):**
Drive engagement via image design + copy, since real stickers aren't API-accessible:

1. **Visual sticker MOCKUPS** — render a fake-poll widget IN the image (white rounded rect with "A: ✅" / "B: ❌" options) with a hard CTA "DM 'A' o 'B'" or "Comenta tu voto". The visual signals "interactive" even though the response channel is DM/comment.
2. **Hard text CTAs** — every autonomous story includes one of: "DM 'AUDIT' para análisis gratis", "Responde con tu zona", "Compártela si concuerdas", "Captúrala antes que se vaya". The CTA is the engagement driver.
3. **Animated-feeling typography** — even on static PNGs, simulate motion via: gold underline highlights, gradient text, kerned-out uppercase eyebrows, drop shadows, dashed circles around key words. Looks animated even when not.
4. **High-contrast pattern interrupts** — alternate WHITE / GOLD / DARK backgrounds across the daily 5-story batch. Scrollers stop on the visual change, not the words.
5. **Bio link CTA** — "Link en bio" surfaced in every story as the implicit "swipe up" replacement.

**Track B — MANUAL (Alex posts from phone, full sticker arsenal):**
For weekly/event-specific stories where engagement matters most. Use:

1. **Sticker stacks** (3+ stickers per story): poll + emoji slider + question sticker layered
2. **Real polls** — binary "A vs B" or "Sí vs No". Always close the loop next day with a "results" story.
3. **Quizzes** — "¿Cuál de estas 3 inmobiliarias rankea #1 en Cancún?" + reveal in next story.
4. **Emoji sliders** — "qué tan importante es la velocidad del sitio web 🚀". Sentiment in seconds.
5. **Question stickers** — "¿Tu mayor pain con leads?" — generates DM goldmine for sales.
6. **Countdown stickers** — for Calendly slot drops, audit windows, content launches.

### The fake-poll mockup pattern (autonomous Track A workaround)

When designing an autonomous story that wants to feel interactive:

```html
<div style="position:absolute; top:1100px; left:80px; right:80px; background:rgba(255,255,255,0.96); border-radius:32px; padding:40px 50px;">
  <div style="font-size:34px; color:#0f1115; font-weight:800; text-align:center; margin-bottom:30px;">
    ¿Cuál es TU mayor pain? 🤔
  </div>
  <div style="display:flex; gap:20px;">
    <div style="flex:1; background:#0f1115; color:#fff; border-radius:24px; padding:28px; text-align:center; font-size:34px; font-weight:700;">
      🔇 Leads fríos
    </div>
    <div style="flex:1; background:#0f1115; color:#fff; border-radius:24px; padding:28px; text-align:center; font-size:34px; font-weight:700;">
      📵 No respuesta
    </div>
  </div>
  <div style="font-size:30px; color:#0f1115; text-align:center; margin-top:30px; font-weight:700;">
    👉 DM "A" o "B" para tu plan
  </div>
</div>
```

The user sees what looks like a poll. They DM the answer. We get high-intent inbound (which the algorithm rewards even more than sticker taps because it's a private conversation = "deep engagement signal").

### Updated story type catalog (research-backed additions)

In addition to the 6 existing types (BIG STAT / SCREENSHOT PROOF / BEFORE-AFTER / BOLD STATEMENT / CTA / NEW POST ALERT), add these for the autopilot:

7. **FAKE POLL (autonomous, drives DMs)**
   Bg: dark or gold pattern. Top: emoji-heavy hook (🤔 or 🔥 + text). Middle: poll mockup with 2 options. Bottom: "DM 'A' o 'B'" CTA. **Highest DM-conversion design** for autonomous mode.

8. **EMOJI HEAVY (autonomous, max approachability)**
   Bg: white or gold. 5-7 emojis distributed across the design. Reads as a "story from a friend" not a brand. Pairs well with founder POV content. Lower conversion but highest profile-tap rate.

9. **TYPOGRAPHIC EXPLOSION (autonomous, high screenshot rate)**
   Bg: dark with subtle gold radial gradient. Single sentence with 3-4 different size/color/style breaks per word. Scroll-stopper. Designed to be screenshot and re-shared.

### Mandatory requirements for ALL autonomous stories

- Min 3 emojis per story
- ONE clear CTA per story (not three competing)
- Uppercase eyebrow tag (5-14 chars) at top — orients the viewer in 1 second
- High contrast — never gold-on-white text or dark-on-dark
- Min 42px text minimum, 50pt+ headlines
- "Link en bio" or "DM '<word>'" or "Comenta '<word>'" — explicit action word, not generic CTA

---

## Publishing

Use the `instagram-publisher` skill. Stories = `media_type=STORIES`, no caption, no hashtags. Upload PNG to catbox.moe first.

---

## CRITICAL RULES

1. **Playwright, NOT WeasyPrint.** WeasyPrint cannot render emojis.
2. **Install emoji font FIRST.** Noto Color Emoji setup before rendering.
3. **Font stack: text fonts first.** `'Liberation Sans', 'DejaVu Sans', Arial, sans-serif`. Emoji font first = broken spacing.
4. **MIX backgrounds.** At least 2 different bg colors in any 5-story batch.
5. **Emojis in EVERY story.** Minimum 3 per story.
6. **Screenshots fill 70%+** when used.
7. **NEVER pricing or AI tools** in story content.
8. **ROTATE clients.** All 6 equally. Never two consecutive same client.
9. **NEVER publish without Alex's approval.** Render → present → wait → publish.
10. **Base64 data URIs** for screenshots in HTML.
11. **Solid gold text only.** Never gradient-to-white.
