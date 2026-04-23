#!/usr/bin/env python3
"""Process Alex's verified profile photo into a transparent PNG face asset
for the YouTube thumbnail.

Pipeline:
1. Read JPG with EXIF orientation
2. Auto-rotate via PIL ImageOps.exif_transpose
3. Crop to head + upper torso (top 45% of portrait orientation)
4. Background removal via rembg
5. Save as transparent PNG, ~1500 px tall
"""
from PIL import Image, ImageOps
from rembg import remove, new_session
from pathlib import Path
import io

SRC = Path("/sessions/sleepy-beautiful-cori/mnt/jegodigital/website/assets/images/alex-profile-verified.jpg")
DST = Path("/sessions/sleepy-beautiful-cori/mnt/jegodigital/content/youtube-proof-tactic/v2_assets/alex_face_real.png")
DST.parent.mkdir(parents=True, exist_ok=True)


def main():
    # 1) Load + auto-rotate via EXIF
    img = Image.open(SRC)
    img = ImageOps.exif_transpose(img)
    print(f"Loaded {img.size} mode={img.mode}")

    # 2) Crop to head + upper torso (TIGHT — portrait orientation after EXIF rotate)
    # After EXIF rotation, the image is in portrait orientation: width<height.
    # Verified from thumbnail at 666x1000: Alex's face center is at ~(240, 400) → (0.36w, 0.40h)
    # His head+shoulders span y ~(310 to 600) in thumb = y ~(0.31h to 0.60h) in full
    w, h = img.size
    # Tight head+shoulders crop, ~3:4 aspect
    cx = int(w * 0.36)  # face center x (left of center)
    cy = int(h * 0.42)  # face+shoulders center y
    crop_h = int(h * 0.32)  # 32% of image height = 1920px
    crop_w = int(crop_h * 0.80)  # 0.80 aspect = 1536px
    x0 = max(0, cx - crop_w // 2)
    y0 = max(0, cy - crop_h // 2)
    x1 = min(w, x0 + crop_w)
    y1 = min(h, y0 + crop_h)
    cropped = img.crop((x0, y0, x1, y1))
    print(f"Cropped to {cropped.size}")

    # 3) Resize to ~1200 px tall — small enough for bg removal speed
    target_h = 1000
    ratio = target_h / cropped.size[1]
    target_w = int(cropped.size[0] * ratio)
    cropped = cropped.resize((target_w, target_h), Image.LANCZOS)
    print(f"Resized to {cropped.size}")

    # Save the cropped (non-transparent) preview first so we have something even if bg removal fails
    preview = DST.with_name("alex_face_cropped.png")
    cropped.save(preview, "PNG", optimize=True)
    print(f"Saved cropped preview {preview} ({preview.stat().st_size} bytes)")

    # 4) Background removal — use lighter model "u2netp" if u2net not cached
    print("Removing background (u2netp — faster)...")
    buf = io.BytesIO()
    cropped.save(buf, "PNG")
    buf.seek(0)
    try:
        session = new_session("u2netp")
        out_bytes = remove(buf.getvalue(), session=session)
        out = Image.open(io.BytesIO(out_bytes))
        print(f"After bg removal: {out.size} mode={out.mode}")
        # 5) Save transparent PNG
        out.save(DST, "PNG", optimize=True)
        print(f"Saved {DST} ({DST.stat().st_size} bytes)")
    except Exception as e:
        print(f"bg removal failed: {e}")
        # Fallback: just copy cropped as final
        cropped.save(DST, "PNG", optimize=True)
        print(f"Saved cropped fallback to {DST}")


if __name__ == "__main__":
    main()
