# YouTube Proof + Tactic Video (v2) — Production Pipeline

**Video ID:** `WY-3ugNDyW4`
**Watch:** https://youtu.be/WY-3ugNDyW4
**Channel:** [@JegoDigitalchannel](https://youtube.com/@jegodigitalchannel) (Channel ID `UCZq1JVXJ9bHjOSThOCdy0hw`)
**Published:** 2026-04-23 · 6:15 · Spanish (es-MX)
**Privacy:** Public

## What this folder is

Production artifacts for the "70% Pierde Leads" YouTube video. This is the repeatable pipeline — every future JegoDigital long-form video should follow the same structure.

## Files

| File | What it is |
|---|---|
| `youtube_proof_tactic_v2.mp4` | Final 224MB render — **NOT committed** (gitignored via `*.mp4`). Stored locally only. |
| `v2_assets/thumbnail_v1.png` | 1280×720 custom thumbnail with Alex's real face + gold "70%" accent |
| `v2_assets/alex_face_real.png` | Transparent-bg Alex headshot (from `website/assets/images/alex-profile-verified.jpg` via rembg u2netp) |
| `v2_assets/alex_face_cropped.png` | Pre-bg-removal crop (fallback if rembg fails) |
| `v2_assets/youtube_metadata.md` | The canonical title/description/tags/checklist for this video |
| `tmp/upload_youtube.py` | Python resumable-upload script (refreshes token, starts session, uploads chunks) |
| `tmp/upload_oneshot.sh` | One-shot bash uploader using curl (~40s for 224MB) |
| `tmp/process_alex_face.py` | Face extraction: EXIF rotate → tight crop → rembg bg removal |

## How to upload the NEXT video

**Prerequisite:** tokens already in `.secrets/youtube_*` and GH Secrets `YOUTUBE_CLIENT_ID` / `_CLIENT_SECRET` / `_REFRESH_TOKEN` (set 2026-04-23).

```bash
# 1. Drop the final MP4 into content/<slug>/
# 2. Edit tmp/upload_oneshot.sh — update:
#    VIDEO=/sessions/.../<slug>/<file>.mp4
#    THUMB=/sessions/.../<slug>/v2_assets/thumbnail.png
#    The <<JSON ... JSON block (title, description, tags)
# 3. Run it:
bash content/youtube-proof-tactic/tmp/upload_oneshot.sh
# 4. Flip privacy to public (or edit the script's "privacyStatus" before run)
```

## Known pitfalls (learned 2026-04-23)

1. **YouTube rejects `<` in descriptions** → write "menos de 60 segundos" not "<60 segundos"
2. **Tag total must be ≤500 chars** (tags with spaces count +2 for auto-quoting) → max ~16 tags
3. **Sandbox bash 45s timeout** → resumable upload splits: if timeout, probe session with `PUT -H "Content-Range: bytes */SIZE"` → returns `range: bytes=0-<last>` → resume from `<last>+1`
4. **Uploading ~5MB/s** from sandbox → 224MB took ~40s (90%) + ~13s resume
5. **Custom thumbnail must be ≤2MB PNG/JPG** (our 542KB PNG works fine)
6. **Channel switch** — `mine=true` returns the channel the refresh_token was minted against. Our token = `jegoalexdigital@gmail.com` = JegoDigital (UCZq1JVXJ9bHjOSThOCdy0hw). Verify before upload.

## Thumbnail recipe

1. Source face photo: `website/assets/images/alex-profile-verified.jpg`
2. Process: `python3 tmp/process_alex_face.py` → `v2_assets/alex_face_real.png`
3. Render via `_imported_skills/youtube-thumbnail/scripts/render_thumbnail.py`:
   ```
   python3 scripts/render_thumbnail.py \
     --template face_right_text_left \
     --face v2_assets/alex_face_real.png \
     --kicker "INMOBILIARIAS MX" \
     --headline "PIERDES 70% LEADS" \
     --accent "70%" \
     --subline "2 TÁCTICAS QUE FUNCIONAN" \
     --badge "JEGODIGITAL" \
     --out v2_assets/thumbnail_v1.png
   ```

## OAuth setup (only do this if tokens are revoked)

1. Build consent URL:
   ```
   https://accounts.google.com/o/oauth2/v2/auth?client_id=$YOUTUBE_CLIENT_ID&redirect_uri=http%3A%2F%2Flocalhost%3A8765%2Fcallback&response_type=code&scope=https%3A%2F%2Fwww.googleapis.com%2Fauth%2Fyoutube&access_type=offline&prompt=consent
   ```
2. Alex clicks → signs in as `jegoalexdigital@gmail.com` → clicks Allow
3. Chrome redirects to `localhost:8765/callback?code=XXX` (connection refused, that's fine)
4. Alex copies the URL, pastes the `code` value
5. Exchange for `refresh_token`:
   ```bash
   curl -X POST https://oauth2.googleapis.com/token \
     -d "code=$CODE" -d "client_id=$YOUTUBE_CLIENT_ID" \
     -d "client_secret=$YOUTUBE_CLIENT_SECRET" \
     -d "redirect_uri=http://localhost:8765/callback" \
     -d "grant_type=authorization_code"
   ```
6. Save `refresh_token` to `.secrets/youtube_refresh_token` + `.env` + GH Secret
