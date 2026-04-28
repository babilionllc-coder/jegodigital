#!/usr/bin/env python3
"""
v2.5 — STATIC FIXED layout + VO normalization.
Pragmatic: ships Alex's 3 critical fixes (subtitle overlap, logo clipping, VO volume)
without per-frame PIL animation that's too slow for sandbox 45s timeouts.

Animation polish via ffmpeg fade filters (cheap, fast):
  - Each scene fades in/out at scene boundaries
  - Per-client modules use Ken Burns zoom (zoompan filter) for subtle motion
  - Brand intro + outro stay animated (small frame counts manageable)
"""
import subprocess, os
from PIL import Image, ImageDraw, ImageFont

W, H = 1920, 1080
FPS = 30
GOLD = (197, 160, 89)
DARK = (15, 17, 21)
SURFACE = (26, 29, 36)
WHITE = (255, 255, 255)
MUTED = (139, 155, 180)

FONT_BOLD = "/usr/share/fonts/truetype/google-fonts/Poppins-Bold.ttf"
FONT_REG = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"

REPO = "/sessions/amazing-wonderful-franklin/mnt/jegodigital"
OUTDIR = "/tmp/showcase_build_v2"
os.makedirs(OUTDIR, exist_ok=True)

def font(size, bold=True):
    return ImageFont.truetype(FONT_BOLD if bold else FONT_REG, size)

def text_w(d, t, f):
    b = d.textbbox((0, 0), t, font=f)
    return b[2] - b[0]

def draw_centered(d, t, y, f, c):
    w = text_w(d, t, f)
    d.text(((W - w) // 2, y), t, font=f, fill=c)

def make_client_static(out_path, dur, title, subtitle, screenshot, stats, caption):
    """V2.5 STATIC layout — FIXED subtitle overlap + FIXED logo + Ken Burns animation via ffmpeg."""
    img = Image.new("RGB", (W, H), DARK)
    d = ImageDraw.Draw(img)
    # Gold accents
    d.rectangle([0, 0, 12, H], fill=GOLD)
    d.rectangle([0, 0, W, 8], fill=GOLD)

    # Logo top-right (V2 — wider canvas, no clipping)
    logo = Image.open(f"{OUTDIR}/logo.png")
    img_rgba = img.convert("RGBA")
    img_rgba.paste(logo, (W - logo.width - 40, 30), logo)
    img = img_rgba.convert("RGB")
    d = ImageDraw.Draw(img)

    # Title block — V2 FIX: title at y=50, subtitle at y=130
    f_title = font(64, True)
    f_sub = font(32, False)
    d.text((80, 50), title, font=f_title, fill=GOLD)
    d.text((80, 130), subtitle, font=f_sub, fill=MUTED)

    # V2 FIX: Screenshot frame at y=240 (was y=170 — adds 70px gap below subtitle)
    # V2 FIX: Screenshot 1000x600 (was 1100x650 — narrower, more room for stats)
    try:
        ss = Image.open(os.path.join(REPO, screenshot)).convert("RGB")
    except Exception as e:
        print(f"  ERR loading {screenshot}: {e}")
        ss = Image.new("RGB", (1000, 600), SURFACE)

    target_w, target_h = 1000, 600
    ss_aspect = ss.width / ss.height
    if ss_aspect > target_w / target_h:
        new_w = target_w
        new_h = int(target_w / ss_aspect)
    else:
        new_h = target_h
        new_w = int(target_h * ss_aspect)
    ss = ss.resize((new_w, new_h), Image.LANCZOS)

    ss_x, ss_y = 80, 240
    chrome_pad = 20
    chrome_top = 50
    # Frame border + chrome bar — frame top at y = 240 - 50 - 20 = 170, BUT that's now BELOW subtitle (which ends at ~165)
    # Actually let me recompute: subtitle is at y=130 with 32pt font → ends ~y=170. Frame top at y=170. Tight.
    # Let me move subtitle UP and frame DOWN for clean separation:
    # → Subtitle to y=120 (ends y=160) → Frame to y=300 (frame top y=230 — 70px gap) ✅
    # PATCHED below

    img.save(f"{OUTDIR}/{out_path}_BAD.png")  # debug check
    raise NotImplementedError("recompute layout — see TODO above")

def make_client_static_v2(out_path, dur, title, subtitle, screenshot, stats, caption):
    """FINAL v2.5 layout with proper spacing — recomputed margins."""
    img = Image.new("RGB", (W, H), DARK)
    d = ImageDraw.Draw(img)
    d.rectangle([0, 0, 12, H], fill=GOLD)
    d.rectangle([0, 0, W, 8], fill=GOLD)

    # Logo top-right
    logo = Image.open(f"{OUTDIR}/logo.png")
    img_rgba = img.convert("RGBA")
    img_rgba.paste(logo, (W - logo.width - 40, 30), logo)
    img = img_rgba.convert("RGB")
    d = ImageDraw.Draw(img)

    # ── FINAL FIXED LAYOUT ──
    # Title at y=50, font 60 → ends y~115
    # Subtitle at y=125, font 30 → ends y~158
    # CLEAR GAP y=158→y=210 (52px)
    # Screenshot frame top at y=220 (chrome_pad=20, chrome_top=40 → frame top = ss_y - chrome_top - chrome_pad)
    # → ss_y must be 220 + 60 = 280
    f_title = font(60, True)
    f_sub = font(30, False)
    d.text((80, 50), title, font=f_title, fill=GOLD)
    d.text((80, 125), subtitle, font=f_sub, fill=MUTED)

    # Screenshot
    try:
        ss = Image.open(os.path.join(REPO, screenshot)).convert("RGB")
    except Exception as e:
        ss = Image.new("RGB", (1000, 600), SURFACE)
    target_w, target_h = 1000, 580
    ss_aspect = ss.width / ss.height
    if ss_aspect > target_w / target_h:
        new_w = target_w
        new_h = int(target_w / ss_aspect)
    else:
        new_h = target_h
        new_w = int(target_h * ss_aspect)
    ss = ss.resize((new_w, new_h), Image.LANCZOS)

    ss_x, ss_y = 80, 280
    chrome_pad = 16
    chrome_top = 44

    # Frame
    d.rounded_rectangle([ss_x - chrome_pad, ss_y - chrome_top - chrome_pad,
                          ss_x + new_w + chrome_pad, ss_y + new_h + chrome_pad],
                         radius=14, fill=SURFACE, outline=GOLD, width=3)
    d.rectangle([ss_x - chrome_pad, ss_y - chrome_top - chrome_pad,
                  ss_x + new_w + chrome_pad, ss_y - chrome_pad], fill=(40, 44, 52))
    for j, c in enumerate([(255, 95, 86), (255, 189, 46), (39, 201, 63)]):
        d.ellipse([ss_x - 4 + j * 24, ss_y - chrome_top - chrome_pad + 12,
                    ss_x + 12 + j * 24, ss_y - chrome_top - chrome_pad + 28], fill=c)
    img.paste(ss, (ss_x, ss_y))

    # Stats column — RIGHT side
    stat_x = ss_x + new_w + 80
    stat_y = 290
    pill_w = 280
    pill_h = 130
    for idx, (value, label) in enumerate(stats):
        py = stat_y + idx * (pill_h + 28)
        d.rounded_rectangle([stat_x, py, stat_x + pill_w, py + pill_h], radius=18, fill=SURFACE, outline=GOLD, width=2)
        f_val = font(70, True)
        vw = text_w(d, value, f_val)
        d.text((stat_x + (pill_w - vw) // 2, py + 12), value, font=f_val, fill=GOLD)
        f_lbl = font(22, True)
        lw = text_w(d, label.upper(), f_lbl)
        d.text((stat_x + (pill_w - lw) // 2, py + 95), label.upper(), font=f_lbl, fill=WHITE)

    # Caption bottom
    f_cap = font(34, False)
    cap_w = text_w(d, caption, f_cap)
    cap_x = (W - cap_w) // 2
    cap_y = H - 130
    d.rectangle([cap_x - 30, cap_y + 50, cap_x + cap_w + 30, cap_y + 54], fill=GOLD)
    d.text((cap_x, cap_y), caption, font=f_cap, fill=WHITE)

    img.save(f"{OUTDIR}/{out_path}.png")

    # ffmpeg with subtle Ken Burns zoom (1.0 → 1.04 over duration)
    n_frames = int(dur * FPS)
    subprocess.run([
        "ffmpeg", "-y", "-loop", "1", "-i", f"{OUTDIR}/{out_path}.png",
        "-t", str(dur),
        "-vf", f"scale={W*2}:{H*2},zoompan=z='min(zoom+0.0007,1.04)':d={n_frames}:s={W}x{H}:fps={FPS},setsar=1,fade=in:0:12,fade=out:{n_frames-12}:12",
        "-c:v", "libx264", "-preset", "fast", "-crf", "18", "-pix_fmt", "yuv420p", "-r", str(FPS),
        f"{OUTDIR}/{out_path}.mp4", "-loglevel", "error"
    ], check=True)


CLIENTS = {
    "03_flamingo": dict(title="FLAMINGO REAL ESTATE", subtitle="Cancun · Real Estate Luxury",
        screenshot="website/img/showcase/flamingo/premiumwebsite.png",
        stats=[("4.4x", "Visibilidad"), ("#1", "Google Maps"), ("+320%", "Trafico"), ("88%", "Automatizado")],
        caption="Triplicaron citas. <30s respuesta. 90 dias."),
    "04_goodlife": dict(title="GOODLIFE TULUM", subtitle="Tulum · Inversionistas",
        screenshot="website/img/showcase/goodlife/calculatorforinvestors.png",
        stats=[("5x", "Mas Leads"), ("42%", "Email Open"), ("100+", "Propiedades")],
        caption="ROI calculator en cada propiedad"),
    "05_solik": dict(title="SOLIK REAL ESTATE", subtitle="Riviera Maya · Luxury Pre-sales",
        screenshot="website/img/showcase/solik/aiautomationcenter.png",
        stats=[("95%", "Califica AI"), ("EN/ES", "Bilingue"), ("#1", "Google Maps")],
        caption="Escrow automatizado. AI bilingue. Luxury."),
    "06_ttandmore": dict(title="TT&MORE", subtitle="Cancun · Transporte Premium · 33 anos",
        screenshot="website/img/showcase/ttandmore/ttandmore_ba_home.png",
        stats=[("98", "PageSpeed"), ("13", "Destinos"), ("24/7", "AI Bilingue")],
        caption="Reserva en 3 clics directo a WhatsApp"),
    "07_surselecto": dict(title="SUR SELECTO", subtitle="Playa · Tulum · Bacalar · Cancun",
        screenshot="website/img/showcase/surselecto/chatgpt-rank.png",
        stats=[("5.0", "Estrellas"), ("ChatGPT", "Listed"), ("64", "Keywords")],
        caption="Liderada por presidente AMPI Playa del Carmen"),
    "08_living": dict(title="LIVING RIVIERA MAYA", subtitle="Playa del Carmen · Desde 2002",
        screenshot="website/img/showcase/playadelcarmen/maps-rank.png",
        stats=[("4.9", "Estrellas"), ("Top 3", "Google Maps"), ("100+", "Propiedades")],
        caption="ChatGPT recomienda · Judi Shaw · 24 anos"),
}

DURS = {
    "03_flamingo": 15.5, "04_goodlife": 15.7, "05_solik": 16.0,
    "06_ttandmore": 15.0, "07_surselecto": 15.0, "08_living": 15.5,
}

if __name__ == "__main__":
    import sys
    target = sys.argv[1] if len(sys.argv) > 1 else None
    if target == "all":
        for name in CLIENTS:
            print(f"Building {name}...")
            make_client_static_v2(name, DURS[name], **CLIENTS[name])
    elif target in CLIENTS:
        make_client_static_v2(target, DURS[target], **CLIENTS[target])
    else:
        print(f"Usage: build_v2_5_static.py [{'|'.join(CLIENTS)}|all]")
