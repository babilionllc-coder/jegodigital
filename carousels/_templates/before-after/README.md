# Before/After Carousel Template

**Canonical reference client for the Cloud Run mockup-renderer.**
First used: 2026-04-19 (Alex's 3-slide before/after mockup carousel)

## What this folder is

A working, copy-pasteable template for rendering JegoDigital carousels that need **complex CSS mockups** (fake "ugly before" websites, MacBook device frames, Google Fonts + gradients). Uses the Cloud Run HTML→PNG microservice — NOT WeasyPrint, NOT local Playwright.

When to copy this folder:
- Building any carousel with a rendered client website mockup inside a slide
- Slides with device frames (MacBook, iPhone)
- Slides where WeasyPrint mangles fonts at 2x DPR

When NOT to use:
- Pure text slides → use WeasyPrint (faster, no network)
- Standard branded slides with only brand palette → use canva-jegodigital Playwright

## Files

| File | Purpose |
|---|---|
| `build.py` | Renders all 5 assets. Contains `inject_fonts()`, retry-enabled `render()`, `warmup()`. Copy this. |
| `mockup_premium.png` | 2400×1600 — clean "Elite Properties" premium 2026 site mockup |
| `mockup_ugly.png` | 2400×1600 — period-authentic 2008-style garish site mockup |
| `slide_1_before_after.png` | 2160×2700 — ANTES/DESPUÉS hook slide |
| `slide_2_stat.png` | 2160×2700 — 73% stat card ⚠️ attribution needs real source |
| `slide_3_macbook.png` | 2160×2700 — MacBook frame + premium site + Calendly CTA |

## Running it

```bash
cd /sessions/modest-gracious-brahmagupta/mnt/jegodigital/carousels/_templates/before-after
python3 build.py
```

Takes ~90s for all 5 assets. Expect 1-2 HTTP 500s on cold start — the retry logic handles them automatically.

## Critical rules (read before editing build.py)

1. **NEVER** use `@import url(...)` for Google Fonts inside `<style>` blocks. Use `<link>` tags in `<head>` via `inject_fonts()`.
2. **Always retry** on HTTP 500 (at least 3× with 4s delay). First request after idle crashes — that's normal.
3. **Warm the instance** before a batch — `warmup()` posts a trivial render and discards the response.
4. **Throttle 1.5s** between requests.

Full rationale in `/CLAUDE.md` → "MOCKUP PIPELINE" section.

## Known issues

- **Slide 2 attribution** — the "Estudio NAR 2025" citation on the 73% stat is fabricated. Needs a defensible source or a different stat before shipping to Instagram.
