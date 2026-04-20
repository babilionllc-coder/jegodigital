# Daily Script Delivery System

**Purpose:** Alex wakes up at 9:00 AM CST → opens Slack → today's 58-second video script is waiting. Sets up, records, done by 10:00 AM.

## How it works

1. **Scheduled task** (`alex-daily-video-script`) fires at 9:00 AM every weekday (Mon–Fri).
2. The task prompt tells Claude to:
   - Read the rotation calendar (which format is due today)
   - Generate a fresh hook + 6-beat script using the week's focus topic
   - Follow the `tiktok-viral` + `alex-founder-video` skills for format/structure
   - Post the script to Alex via Slack DM (user ID `U0A6U6GLP27`)
   - Save the script to `/alex-founder-video/scripts_log/YYYY-MM-DD.md`

3. **Script format delivered to Slack** — clean, scannable, ready-to-record:
   ```
   🎬 TODAY'S VIDEO — Tuesday, April 21 — Authority Teaser
   
   TOPIC: Why your Instagram followers don't convert to leads
   TRIGGER: DM 'CRECER'
   
   HOOK (0-2s): "Tu Instagram tiene 5,000 followers. Y cero leads."
   
   BEATS:
   1. (2-7s)  AUTHORITY — you work with inmobiliarias, you've seen this 50x
   2. (7-25s) MYTH — followers ≠ leads
   3. (25-45s) PROOF — Flamingo: 800 followers, 120 leads/mo via SEO+WhatsApp
   4. (45-55s) CTA — DM 'CRECER' para el plan de 90 días
   5. (55-58s) LOOP — "Los followers no pagan la renta"
   
   CAPTION + PINNED COMMENT in thread ⬇️
   ```

## Rotation calendar

| Day | Format | Default trigger keyword |
|---|---|---|
| Mon | Myth-Buster | LISTA |
| Tue | Authority + Curiosity Teaser | STACK |
| Wed | Live Demo Reaction | AUDIT |
| Thu | Step-by-Step Tutorial | LISTA |
| Fri | POV / Case-Study | DEMO |

## Topic bank (rotates weekly — Claude picks fresh topic each day)

See `TOPIC_BANK.md` — 40 pre-vetted topics that tie into JegoDigital's 9 services, case studies, and 2026 AEO/SEO trends. Claude rotates through so we never repeat a topic within 30 days.

## Manual override

Alex can trigger an extra script anytime by sending Claude:
> "give me today's script" or "new script now"

## Weekly feedback loop

Every Sunday at 6 PM, Claude pulls TikTok/IG/YT analytics for the week's 5 videos and adjusts next week's topic rotation based on which formats performed best.

## Files

- `TOPIC_BANK.md` — 40 rotating topics
- `generate_script.py` — script generator (callable locally or by the scheduled task)
- `scripts_log/` — archive of every delivered script (for tracking which topics we've used)
