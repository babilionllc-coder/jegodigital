#!/usr/bin/env python3
"""
JegoDigital Multi-Client Showcase Video — Build Pipeline
1920x1080 16:9 · ~143s · Tony Spanish VO · ffmpeg + PIL composition

Inputs:
  /tmp/showcase_vo.mp3  — Tony VO already generated
  website/img/showcase/{client}/  — real client screenshots
  website/images/logo/jegodigitallogo.png — JegoDigital logo

Output:
  /tmp/JegoMultiClientShowcase_v1.mp4
"""
import subprocess, os, sys, json
from PIL import Image, ImageDraw, ImageFont, ImageFilter

# ── CONFIG ──────────────────────────────────────────────────────────
W, H = 1920, 1080
FPS = 30
GOLD = (197, 160, 89)
GOLD_LIGHT = (229, 197, 133)
DARK = (15, 17, 21)
SURFACE = (26, 29, 36)
WHITE = (255, 255, 255)
MUTED = (139, 155, 180)

FONT_BOLD = "/usr/share/fonts/truetype/google-fonts/Poppins-Bold.ttf"
FONT_REG = "/usr/share/fonts/truetype/google-fonts/Poppins-Regular.ttf"
FONT_BOLD_FALLBACK = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
FONT_REG_FALLBACK = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"

# Use fallback if Poppins-Regular missing
if not os.path.exists(FONT_REG):
    FONT_REG = FONT_REG_FALLBACK
if not os.path.exists(FONT_BOLD):
    FONT_BOLD = FONT_BOLD_FALLBACK

REPO = "/sessions/amazing-wonderful-franklin/mnt/jegodigital"
OUTDIR = "/tmp/showcase_build"
os.makedirs(OUTDIR, exist_ok=True)

# ── SCENE TIMINGS (must total 143.5s to match Tony VO) ──────────────
SCENES = [
    # (name, duration_s, builder_fn_name, params)
    ("01_brand_intro",    3.0, "brand_intro", {}),
    ("02_hook",           8.0, "hook_card", {"line1": "8 INMOBILIARIAS EN MEXICO", "line2": "De invisibles a #1 en Google", "line3": "En menos de 90 dias"}),
    ("03_flamingo",      15.5, "client_module", {
        "title": "FLAMINGO REAL ESTATE", "subtitle": "Cancun · Real Estate Luxury",
        "screenshot": "website/img/showcase/flamingo/premiumwebsite.png",
        "stats": [("4.4x", "Visibilidad"), ("#1", "Google Maps"), ("+320%", "Trafico"), ("88%", "Automatizado")],
        "caption": "Triplicaron citas. <30s respuesta. 90 dias.",
    }),
    ("04_goodlife",      15.7, "client_module", {
        "title": "GOODLIFE TULUM", "subtitle": "Tulum · Inversionistas",
        "screenshot": "website/img/showcase/goodlife/calculatorforinvestors.png",
        "stats": [("5x", "Mas Leads"), ("42%", "Email Open"), ("100+", "Propiedades")],
        "caption": "ROI calculator en cada propiedad",
    }),
    ("05_solik",         16.0, "client_module", {
        "title": "SOLIK REAL ESTATE", "subtitle": "Riviera Maya · Luxury Pre-sales",
        "screenshot": "website/img/showcase/solik/aiautomationcenter.png",
        "stats": [("95%", "Califica AI"), ("EN/ES", "Bilingue"), ("#1", "Google Maps")],
        "caption": "Escrow automatizado. AI bilingue. Luxury.",
    }),
    ("06_ttandmore",     15.0, "client_module", {
        "title": "TT&MORE", "subtitle": "Cancun · Transporte Premium · 33 anos",
        "screenshot": "website/img/showcase/ttandmore/ttandmore_ba_home.png",
        "stats": [("98", "PageSpeed"), ("13", "Destinos"), ("24/7", "AI Bilingue")],
        "caption": "Reserva en 3 clics directo a WhatsApp",
    }),
    ("07_surselecto",    15.0, "client_module", {
        "title": "SUR SELECTO", "subtitle": "Playa · Tulum · Bacalar · Cancun",
        "screenshot": "website/img/showcase/surselecto/chatgpt-rank.png",
        "stats": [("5.0", "Estrellas"), ("ChatGPT", "Listed"), ("64", "Keywords")],
        "caption": "Liderada por presidente AMPI Playa del Carmen",
    }),
    ("08_living",        15.5, "client_module", {
        "title": "LIVING RIVIERA MAYA", "subtitle": "Playa del Carmen · Desde 2002",
        "screenshot": "website/img/showcase/playadelcarmen/maps-rank.png",
        "stats": [("4.9", "Estrellas"), ("Top 3", "Google Maps"), ("100+", "Propiedades")],
        "caption": "ChatGPT recomienda · Judi Shaw · 24 anos",
    }),
    ("09_montage",       12.5, "two_client_montage", {
        "left": {"title": "GOZA", "screenshot": "website/img/showcase/goza/gozapremiumwebsite.png", "stats": [("98", "PageSpeed"), ("3x", "Leads")]},
        "right": {"title": "RS VIAJES", "screenshot": "website/img/showcase/rsviajes/05_google_business_profile.png", "stats": [("33", "Anos"), ("ChatGPT", "Listed")]},
    }),
    ("10_outro",         17.3, "outro_card", {}),
]

print(f"Total composition duration: {sum(s[1] for s in SCENES):.1f}s (target 143.5s)")

# ── PIL HELPERS ─────────────────────────────────────────────────────
def font(size, bold=True):
    return ImageFont.truetype(FONT_BOLD if bold else FONT_REG, size)

def text_w(draw, text, f):
    bbox = draw.textbbox((0, 0), text, font=f)
    return bbox[2] - bbox[0]

def text_h(draw, text, f):
    bbox = draw.textbbox((0, 0), text, font=f)
    return bbox[3] - bbox[1]

def draw_centered(draw, text, y, f, color, x_offset=0, container_w=W):
    w = text_w(draw, text, f)
    draw.text(((container_w - w) // 2 + x_offset, y), text, font=f, fill=color)

def gold_pill(draw, x, y, text, f, padding=(20, 10), bg=GOLD, fg=DARK):
    bbox = draw.textbbox((0, 0), text, font=f)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    draw.rounded_rectangle([x, y, x + tw + 2 * padding[0], y + th + 2 * padding[1]], radius=12, fill=bg)
    draw.text((x + padding[0], y + padding[1] - 2), text, font=f, fill=fg)
    return tw + 2 * padding[0], th + 2 * padding[1]

def stat_burst(img, draw, x, y, value, label, scale=1.0):
    """Big gold stat with label below — used as overlay on screenshots."""
    f_value = font(int(120 * scale), True)
    f_label = font(int(28 * scale), True)
    # Drop shadow
    draw.text((x + 4, y + 4), value, font=f_value, fill=(0, 0, 0))
    draw.text((x, y), value, font=f_value, fill=GOLD)
    label_w = text_w(draw, label.upper(), f_label)
    value_w = text_w(draw, value, f_value)
    draw.text((x + (value_w - label_w) // 2, y + int(130 * scale)), label.upper(), font=f_label, fill=WHITE)

def make_logo_overlay(size=(380, 90)):
    """Create the JegoDigital logo as transparent PNG overlay."""
    logo = Image.new("RGBA", size, (0, 0, 0, 0))
    d = ImageDraw.Draw(logo)
    f = font(60, True)
    d.text((4, 14), "Jego", font=f, fill=(0, 0, 0, 200))
    d.text((0, 10), "Jego", font=f, fill=GOLD + (255,))
    jw = text_w(d, "Jego", f)
    d.text((jw + 4, 14), "Digital", font=f, fill=(0, 0, 0, 200))
    d.text((jw, 10), "Digital", font=f, fill=WHITE + (255,))
    logo.save(f"{OUTDIR}/logo.png")
    return logo

# ── SCENE BUILDERS ──────────────────────────────────────────────────
def make_brand_intro(out_path, dur):
    """3s brand intro — JegoDigital logo + 'RESULTADOS REALES' tagline."""
    img = Image.new("RGB", (W, H), DARK)
    d = ImageDraw.Draw(img)
    # gradient gold accent line top
    d.rectangle([0, 0, W, 8], fill=GOLD)
    d.rectangle([0, H - 8, W, H], fill=GOLD)

    # Big logo center
    f_logo = font(160, True)
    jego = "Jego"
    digital = "Digital"
    jw = text_w(d, jego, f_logo)
    dw = text_w(d, digital, f_logo)
    total = jw + dw + 30
    x_start = (W - total) // 2
    y_logo = 380
    # shadows
    d.text((x_start + 6, y_logo + 6), jego, font=f_logo, fill=(0, 0, 0))
    d.text((x_start, y_logo), jego, font=f_logo, fill=GOLD)
    d.text((x_start + jw + 30 + 6, y_logo + 6), digital, font=f_logo, fill=(0, 0, 0))
    d.text((x_start + jw + 30, y_logo), digital, font=f_logo, fill=WHITE)
    # Tagline
    f_tag = font(48, True)
    draw_centered(d, "RESULTADOS REALES", 600, f_tag, GOLD)
    f_sub = font(32, False)
    draw_centered(d, "8 inmobiliarias mexicanas en menos de 2 minutos", 690, f_sub, MUTED)

    img.save(f"{OUTDIR}/{out_path}.png")
    subprocess.run(["ffmpeg", "-y", "-loop", "1", "-i", f"{OUTDIR}/{out_path}.png",
                    "-t", str(dur), "-vf", f"scale={W}:{H},setsar=1,fade=in:0:15,fade=out:{int(dur*FPS)-15}:15",
                    "-c:v", "libx264", "-preset", "fast", "-crf", "18", "-pix_fmt", "yuv420p", "-r", str(FPS),
                    f"{OUTDIR}/{out_path}.mp4", "-loglevel", "error"], check=True)

def make_hook_card(out_path, dur, line1, line2, line3):
    """Hook card — 3 stacked lines with gold accents."""
    img = Image.new("RGB", (W, H), DARK)
    d = ImageDraw.Draw(img)
    d.rectangle([0, 0, W, 8], fill=GOLD)

    # Logo top-right
    logo = Image.open(f"{OUTDIR}/logo.png")
    img_rgba = img.convert("RGBA")
    img_rgba.paste(logo, (W - logo.width - 40, 30), logo)
    img = img_rgba.convert("RGB")
    d = ImageDraw.Draw(img)

    f_big = font(120, True)
    f_mid = font(64, True)
    f_small = font(40, False)
    draw_centered(d, line1, 280, f_big, GOLD)
    # gold underline
    line1_w = text_w(d, line1, f_big)
    d.rectangle([(W - line1_w) // 2, 410, (W + line1_w) // 2, 416], fill=GOLD)
    draw_centered(d, line2, 470, f_mid, WHITE)
    draw_centered(d, line3, 600, f_small, MUTED)

    # bottom indicator
    f_arrow = font(28, True)
    draw_centered(d, "▼  CASO POR CASO  ▼", H - 80, f_arrow, GOLD)

    img.save(f"{OUTDIR}/{out_path}.png")
    subprocess.run(["ffmpeg", "-y", "-loop", "1", "-i", f"{OUTDIR}/{out_path}.png",
                    "-t", str(dur), "-vf", f"scale={W}:{H},setsar=1,fade=in:0:10,fade=out:{int(dur*FPS)-10}:10",
                    "-c:v", "libx264", "-preset", "fast", "-crf", "18", "-pix_fmt", "yuv420p", "-r", str(FPS),
                    f"{OUTDIR}/{out_path}.mp4", "-loglevel", "error"], check=True)

def make_client_module(out_path, dur, title, subtitle, screenshot, stats, caption):
    """
    Per-client scene structure (composed via overlay):
    - Background: dark with gold accent
    - Top-left: client title + subtitle
    - Center: screenshot in browser-chrome frame, scaled to ~60% width with subtle Ken Burns zoom
    - Right side: 3-4 stat-burst pills stacked
    - Bottom: caption text on gold underline
    """
    # Build the static composite frame first (PIL)
    img = Image.new("RGB", (W, H), DARK)
    d = ImageDraw.Draw(img)
    # Gold left border bar
    d.rectangle([0, 0, 12, H], fill=GOLD)
    d.rectangle([0, 0, W, 8], fill=GOLD)

    # Logo top-right
    logo = Image.open(f"{OUTDIR}/logo.png")
    img_rgba = img.convert("RGBA")
    img_rgba.paste(logo, (W - logo.width - 40, 30), logo)
    img = img_rgba.convert("RGB")
    d = ImageDraw.Draw(img)

    # Title block top-left
    f_title = font(64, True)
    f_sub = font(32, False)
    d.text((80, 60), title, font=f_title, fill=GOLD)
    d.text((80, 145), subtitle, font=f_sub, fill=MUTED)

    # Screenshot — scaled, with browser chrome frame
    try:
        ss = Image.open(os.path.join(REPO, screenshot)).convert("RGB")
    except Exception as e:
        print(f"  ERR loading {screenshot}: {e}")
        ss = Image.new("RGB", (1200, 750), SURFACE)
    # Fit to 1100x650 maintaining aspect
    target_w, target_h = 1100, 650
    ss_aspect = ss.width / ss.height
    if ss_aspect > target_w / target_h:
        new_w = target_w
        new_h = int(target_w / ss_aspect)
    else:
        new_h = target_h
        new_w = int(target_h * ss_aspect)
    ss = ss.resize((new_w, new_h), Image.LANCZOS)
    # Browser chrome border
    ss_x, ss_y = 80, 240
    chrome_pad = 20
    chrome_top = 50
    # background frame
    d.rounded_rectangle([ss_x - chrome_pad, ss_y - chrome_top - chrome_pad,
                          ss_x + new_w + chrome_pad, ss_y + new_h + chrome_pad],
                         radius=14, fill=SURFACE, outline=GOLD, width=2)
    # browser-chrome top bar
    d.rectangle([ss_x - chrome_pad, ss_y - chrome_top - chrome_pad,
                  ss_x + new_w + chrome_pad, ss_y - chrome_pad], fill=(40, 44, 52))
    # 3 traffic-light dots
    for i, c in enumerate([(255, 95, 86), (255, 189, 46), (39, 201, 63)]):
        d.ellipse([ss_x - 4 + i * 24, ss_y - chrome_top - chrome_pad + 12,
                    ss_x + 12 + i * 24, ss_y - chrome_top - chrome_pad + 28], fill=c)
    # paste screenshot
    img.paste(ss, (ss_x, ss_y))

    # Stat-burst pills — right side, stacked
    stat_x = ss_x + new_w + 80
    stat_y = 280
    for i, (value, label) in enumerate(stats):
        # Pill background
        pill_w = 280
        pill_h = 130
        py = stat_y + i * (pill_h + 30)
        d.rounded_rectangle([stat_x, py, stat_x + pill_w, py + pill_h], radius=18, fill=SURFACE, outline=GOLD, width=2)
        # value (big gold)
        f_val = font(70, True)
        vw = text_w(d, value, f_val)
        d.text((stat_x + (pill_w - vw) // 2, py + 12), value, font=f_val, fill=GOLD)
        # label
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

    # Apply Ken Burns zoom-in effect via ffmpeg zoompan
    subprocess.run([
        "ffmpeg", "-y", "-loop", "1", "-i", f"{OUTDIR}/{out_path}.png",
        "-t", str(dur),
        "-vf", f"scale={W*2}:{H*2},zoompan=z='min(zoom+0.0008,1.08)':d={int(dur*FPS)}:s={W}x{H}:fps={FPS},setsar=1,fade=in:0:10,fade=out:{int(dur*FPS)-10}:10",
        "-c:v", "libx264", "-preset", "fast", "-crf", "18", "-pix_fmt", "yuv420p", "-r", str(FPS),
        f"{OUTDIR}/{out_path}.mp4", "-loglevel", "error"
    ], check=True)

def make_two_client_montage(out_path, dur, left, right):
    """Split-screen of 2 clients (Goza + RS Viajes)."""
    img = Image.new("RGB", (W, H), DARK)
    d = ImageDraw.Draw(img)
    d.rectangle([0, 0, W, 8], fill=GOLD)
    d.rectangle([W // 2 - 2, 80, W // 2 + 2, H - 80], fill=GOLD)

    # Logo top-center
    logo = Image.open(f"{OUTDIR}/logo.png")
    img_rgba = img.convert("RGBA")
    img_rgba.paste(logo, ((W - logo.width) // 2, 30), logo)
    img = img_rgba.convert("RGB")
    d = ImageDraw.Draw(img)

    for side, data, x_offset in [("LEFT", left, 0), ("RIGHT", right, W // 2)]:
        # Title
        f_title = font(48, True)
        title = data["title"]
        tw = text_w(d, title, f_title)
        d.text((x_offset + (W // 2 - tw) // 2, 150), title, font=f_title, fill=GOLD)
        # Screenshot
        try:
            ss = Image.open(os.path.join(REPO, data["screenshot"])).convert("RGB")
        except Exception as e:
            print(f"  ERR: {e}")
            ss = Image.new("RGB", (800, 500), SURFACE)
        target_w = 760
        target_h = 480
        ss_aspect = ss.width / ss.height
        if ss_aspect > target_w / target_h:
            new_w = target_w
            new_h = int(target_w / ss_aspect)
        else:
            new_h = target_h
            new_w = int(target_h * ss_aspect)
        ss = ss.resize((new_w, new_h), Image.LANCZOS)
        ss_x = x_offset + (W // 2 - new_w) // 2
        ss_y = 240
        d.rounded_rectangle([ss_x - 14, ss_y - 14, ss_x + new_w + 14, ss_y + new_h + 14],
                             radius=10, outline=GOLD, width=2, fill=SURFACE)
        img.paste(ss, (ss_x, ss_y))
        # Stats below
        for i, (val, lbl) in enumerate(data["stats"]):
            f_val = font(54, True)
            f_lbl = font(20, True)
            vw = text_w(d, val, f_val)
            cx = x_offset + W // 4 + (-150 if i == 0 else 150)
            d.text((cx - vw // 2, ss_y + new_h + 50), val, font=f_val, fill=GOLD)
            lw = text_w(d, lbl.upper(), f_lbl)
            d.text((cx - lw // 2, ss_y + new_h + 115), lbl.upper(), font=f_lbl, fill=WHITE)

    img.save(f"{OUTDIR}/{out_path}.png")
    subprocess.run(["ffmpeg", "-y", "-loop", "1", "-i", f"{OUTDIR}/{out_path}.png",
                    "-t", str(dur), "-vf", f"scale={W}:{H},setsar=1,fade=in:0:10,fade=out:{int(dur*FPS)-10}:10",
                    "-c:v", "libx264", "-preset", "fast", "-crf", "18", "-pix_fmt", "yuv420p", "-r", str(FPS),
                    f"{OUTDIR}/{out_path}.mp4", "-loglevel", "error"], check=True)

def make_outro_card(out_path, dur):
    """17s outro CTA — 'AGENDA 15 MINUTOS' + jegodigital.com/video pill + WhatsApp."""
    img = Image.new("RGB", (W, H), DARK)
    d = ImageDraw.Draw(img)
    d.rectangle([0, 0, W, 8], fill=GOLD)
    d.rectangle([0, H - 8, W, H], fill=GOLD)

    # Logo center top
    logo = Image.open(f"{OUTDIR}/logo.png")
    img_rgba = img.convert("RGBA")
    logo_big = logo.resize((logo.width * 2, logo.height * 2), Image.LANCZOS)
    img_rgba.paste(logo_big, ((W - logo_big.width) // 2, 90), logo_big)
    img = img_rgba.convert("RGB")
    d = ImageDraw.Draw(img)

    # Big CTA
    f_cta = font(140, True)
    draw_centered(d, "AGENDA 15 MINUTOS", 380, f_cta, GOLD)
    f_sub = font(40, False)
    draw_centered(d, "Sin pitch · Sin presion · Sin compromiso", 540, f_sub, MUTED)

    # URL pill
    url_text = "jegodigital.com/video"
    f_url = font(48, True)
    uw = text_w(d, url_text, f_url)
    pill_x = (W - uw - 80) // 2
    d.rounded_rectangle([pill_x, 660, pill_x + uw + 80, 760], radius=20, fill=GOLD)
    d.text((pill_x + 40, 680), url_text, font=f_url, fill=DARK)

    # WhatsApp line
    f_wa = font(32, True)
    wa_text = "Tambien por WhatsApp:  +52 998 202 3263"
    draw_centered(d, wa_text, 820, f_wa, WHITE)

    img.save(f"{OUTDIR}/{out_path}.png")
    subprocess.run(["ffmpeg", "-y", "-loop", "1", "-i", f"{OUTDIR}/{out_path}.png",
                    "-t", str(dur), "-vf", f"scale={W}:{H},setsar=1,fade=in:0:15,fade=out:{int(dur*FPS)-15}:15",
                    "-c:v", "libx264", "-preset", "fast", "-crf", "18", "-pix_fmt", "yuv420p", "-r", str(FPS),
                    f"{OUTDIR}/{out_path}.mp4", "-loglevel", "error"], check=True)

# ── BUILD ALL SCENES ────────────────────────────────────────────────
print("\n=== Building logo overlay ===")
make_logo_overlay()

builders = {
    "brand_intro": lambda name, dur, **kw: make_brand_intro(name, dur),
    "hook_card": make_hook_card,
    "client_module": make_client_module,
    "two_client_montage": make_two_client_montage,
    "outro_card": lambda name, dur, **kw: make_outro_card(name, dur),
}

for name, dur, builder, params in SCENES:
    print(f"\n=== Building {name} ({dur}s, {builder}) ===")
    builders[builder](name, dur, **params)
    sz = os.path.getsize(f"{OUTDIR}/{name}.mp4")
    print(f"  ✅ {name}.mp4 ({sz/1024:.0f}KB)")

# ── CONCAT ALL SCENES ───────────────────────────────────────────────
print("\n=== Concatenating scenes ===")
with open(f"{OUTDIR}/concat.txt", "w") as f:
    for name, dur, _, _ in SCENES:
        f.write(f"file '{OUTDIR}/{name}.mp4'\n")

subprocess.run([
    "ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", f"{OUTDIR}/concat.txt",
    "-c:v", "libx264", "-preset", "fast", "-crf", "19", "-pix_fmt", "yuv420p", "-r", str(FPS),
    f"{OUTDIR}/silent.mp4", "-loglevel", "error"
], check=True)
sz = os.path.getsize(f"{OUTDIR}/silent.mp4")
print(f"  ✅ silent.mp4 ({sz/1024/1024:.1f}MB)")

# ── MUX TONY VO + OUTPUT ────────────────────────────────────────────
print("\n=== Muxing Tony VO + final output ===")
OUTPUT = "/tmp/JegoMultiClientShowcase_v1.mp4"
subprocess.run([
    "ffmpeg", "-y",
    "-i", f"{OUTDIR}/silent.mp4",
    "-i", "/tmp/showcase_vo.mp3",
    "-filter_complex", "[1:a]volume=1.0[aout]",
    "-map", "0:v", "-map", "[aout]",
    "-c:v", "copy", "-c:a", "aac", "-b:a", "192k",
    "-shortest",
    OUTPUT, "-loglevel", "error"
], check=True)

sz = os.path.getsize(OUTPUT)
dur = float(subprocess.check_output(
    ["ffprobe", "-v", "quiet", "-show_entries", "format=duration", "-of", "csv=p=0", OUTPUT]
).strip())
print(f"\n✅ FINAL: {OUTPUT}")
print(f"   Size: {sz/1024/1024:.1f}MB")
print(f"   Duration: {dur:.2f}s")
