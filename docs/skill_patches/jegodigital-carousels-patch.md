# Patch for `jegodigital-carousels` skill

**Created:** 2026-04-19
**Reason:** The sandbox copy of `/sessions/modest-gracious-brahmagupta/mnt/.claude/skills/jegodigital-carousels/SKILL.md` is read-only (EROFS). Alex must apply this patch manually to the real skill file on his laptop.

**Target file:** `/sessions/modest-gracious-brahmagupta/mnt/.claude/skills/jegodigital-carousels/SKILL.md` (or wherever the canonical skill lives in your plugins directory)

---

## What to add

Add a new section titled **"THREE RENDER PIPELINES"** near the top of the skill (after the intro/triggers, before the WeasyPrint-specific instructions). This teaches future Claude sessions that the skill now covers three pipelines — not just WeasyPrint.

### Section to paste

```markdown
## THREE RENDER PIPELINES

JegoDigital carousels are rendered by one of three pipelines depending on complexity. Pick the right one before you start.

| Pipeline | Use for | Strengths | Limitations |
|---|---|---|---|
| **WeasyPrint + pdftoppm** (in-sandbox Python) | Text-heavy branded slides, cotizaciones, reports | Fast, deterministic, no network, runs anywhere | Font rendering weak at 2x DPR, no flex/grid edge cases |
| **canva-jegodigital Playwright** (local Chromium) | Standard branded slides, 1080×1350, brand palette + Inter/Playfair | Pixel-accurate, full CSS3, emoji support | Requires local machine, slower, no cloud trigger |
| **Cloud Run mockup-renderer** (HTTPS microservice) | Fake client websites, MacBook frames, Google Fonts, gradients, complex CSS mockups | Runs in any sandbox over HTTPS, high-DPI PNG bytes | Cold start ~5s, must retry, shared Chromium is fragile |

### When to reach for Cloud Run
If the slide contains any of:
- A fake "ugly before" website mockup (period-authentic 2008-style HTML)
- A rendered MacBook / iPhone device frame with embedded content
- Google Fonts (Inter, Playfair, etc.) + gradients + background images all at once
- Anything that breaks WeasyPrint's glyph rendering at 2x DPR

…use the Cloud Run renderer. Otherwise stay on WeasyPrint.

### Cloud Run endpoint
```
POST https://mockup-renderer-wfmydylowa-uc.a.run.app/render
Content-Type: application/json

{
  "html": "<!DOCTYPE html>...",
  "width": 1080,
  "height": 1350,
  "dpr": 2
}
```
Response body is raw PNG bytes. Output dimensions: `width*dpr × height*dpr` (2160×2700 for standard IG carousel).

### 🚨 FOUR CRITICAL RULES — violate these and the renderer crashes

1. **NEVER use `@import url(...)` for Google Fonts inside `<style>` blocks.** The shared Chromium instance runs with `--single-process` and crashes on `@import`. Error signature: `browserContext.newPage: Target page, context or browser has been closed`. Use `<link rel="preconnect">` + `<link rel="stylesheet">` tags in `<head>` instead.

2. **Retry on HTTP 500 at least 3× with 4s delay.** First request after idle almost always fails while the browser relaunches. Second attempt usually succeeds.

3. **Warm the instance before a batch.** POST one trivial render (empty `<body>`) and discard the response. Cold start is ~5s.

4. **Throttle 1.5s between requests.** Don't race the shared browser.

### Canonical client template
`/carousels/_templates/before-after/build.py` — full Python reference with `inject_fonts()`, retry-enabled `render()`, and `warmup()`. Copy this when starting a new mockup batch.

Key helpers:

```python
FONT_LINKS = (
    '<link rel="preconnect" href="https://fonts.googleapis.com">'
    '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>'
    '<link href="https://fonts.googleapis.com/css2?'
    'family=Inter:wght@300;400;500;600;700;800;900&'
    'family=Playfair+Display:ital,wght@0,700;0,900;1,400;1,700;1,900&'
    'display=swap" rel="stylesheet">'
)

def inject_fonts(html: str) -> str:
    return html.replace("<head>", "<head>" + FONT_LINKS, 1)

def render(name, html, width, height, dpr=2, attempts=4):
    payload = json.dumps({
        "html": inject_fonts(html),
        "width": width, "height": height, "dpr": dpr
    }).encode()
    for i in range(1, attempts + 1):
        req = urllib.request.Request(RENDERER, data=payload,
            headers={"Content-Type": "application/json"}, method="POST")
        try:
            with urllib.request.urlopen(req, timeout=120) as resp:
                out.write_bytes(resp.read())
            time.sleep(1.5)
            return out
        except urllib.error.HTTPError:
            time.sleep(4)  # wait for browser relaunch

def warmup():
    """Tiny first render to wake Cloud Run instance."""
    # POST minimal HTML, ignore response
```

### Deploy
Auto-deploys via `.github/workflows/deploy-cloudrun.yml` on push to `main`. See `DEPLOY.md`. Never deploy manually.
```

---

## Where to insert it

Search the skill file for the first heading after the triggers/overview block (usually `## WHEN TO USE THIS SKILL` or similar). Insert the new section **immediately before** the WeasyPrint instructions begin, so future Claude sessions see the three-pipeline decision matrix before committing to WeasyPrint.

## Verification after applying

Next time you run the skill, Claude should:
1. Read the new table and pick the right pipeline based on slide complexity
2. For Cloud Run slides, follow the 4 critical rules
3. Copy from `/carousels/_templates/before-after/build.py` rather than reinventing

If Claude goes straight to WeasyPrint for a MacBook mockup slide, the patch didn't land — re-check the file.
