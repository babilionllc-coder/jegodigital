#!/usr/bin/env python3
"""
Build all 5 carousel assets for the Before/After real-estate pitch:
  1. mockup_premium.png  — clean 2026-style real estate website (1200x800)
  2. mockup_ugly.png     — outdated "before" website (1200x800)
  3. slide_1_before_after.png — IG 1080x1350 hook slide
  4. slide_2_stat.png    — IG 1080x1350 73% stat
  5. slide_3_macbook.png — IG 1080x1350 MacBook frame

Uses the Cloud Run renderer: POST /render -> PNG
Brand: bg #0f1115, gold #C5A059, white #FFFFFF
"""
import json, time, base64, sys, os, urllib.request
from pathlib import Path

OUT = Path(__file__).parent
RENDERER = "https://mockup-renderer-wfmydylowa-uc.a.run.app/render"

# Injected after <head> in every HTML. Using <link> (not @import) is far more
# stable in the Cloud Run chromium — @import has been crashing the browser.
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

# -----------------------------------------------------------------------------
# Render helper: POST HTML -> save PNG (with retry — browser crashes happen)
# -----------------------------------------------------------------------------
def render(name, html, width, height, dpr=2, attempts=4):
    payload = json.dumps({"html": inject_fonts(html), "width": width, "height": height, "dpr": dpr}).encode()
    last_err = None
    for i in range(1, attempts + 1):
        req = urllib.request.Request(
            RENDERER, data=payload,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        t0 = time.time()
        try:
            with urllib.request.urlopen(req, timeout=120) as resp:
                data = resp.read()
            out = OUT / f"{name}.png"
            out.write_bytes(data)
            dt = time.time() - t0
            print(f"  ✓ {out.name:32s}  {len(data):>8,} bytes  in {dt:4.1f}s  (try {i})")
            time.sleep(1.5)  # throttle — give browser instance a beat
            return out
        except urllib.error.HTTPError as e:
            body = e.read().decode()[:200]
            last_err = f"HTTP {e.code}: {body}"
            print(f"  ⚠ attempt {i}/{attempts} failed — {last_err}")
            time.sleep(4)  # wait for browser relaunch
        except Exception as e:
            last_err = str(e)
            print(f"  ⚠ attempt {i}/{attempts} error — {last_err}")
            time.sleep(4)
    raise RuntimeError(f"render({name}) failed after {attempts} attempts: {last_err}")

def embed(name):
    """Return a data: URL for an already-rendered PNG so slides can embed it inline."""
    p = OUT / f"{name}.png"
    b64 = base64.b64encode(p.read_bytes()).decode()
    return f"data:image/png;base64,{b64}"

# -----------------------------------------------------------------------------
# Asset 1: Premium real-estate mockup (the "after")
# -----------------------------------------------------------------------------
MOCKUP_PREMIUM = """<!DOCTYPE html><html><head><meta charset="utf-8"><style>
*{margin:0;padding:0;box-sizing:border-box;}
body{width:1200px;height:800px;background:#0a0a0a;color:#fff;font-family:'Inter',sans-serif;overflow:hidden;}
.browser{width:1200px;height:30px;background:#1a1a1a;display:flex;align-items:center;padding:0 14px;gap:7px;border-bottom:1px solid #222;}
.dot{width:11px;height:11px;border-radius:50%;}
.url{margin-left:14px;background:#0a0a0a;color:#888;font-size:11px;padding:4px 10px;border-radius:4px;font-family:ui-monospace,SF Mono;}
.hero{position:relative;width:1200px;height:540px;background:linear-gradient(135deg,#1a1a2e 0%,#0a0a0a 100%);
      background-image:url('https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?w=1600&q=80');
      background-size:cover;background-position:center;}
.hero::after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,.3) 0%,rgba(0,0,0,.75) 100%);}
.nav{position:absolute;top:0;left:0;right:0;padding:22px 60px;display:flex;justify-content:space-between;align-items:center;z-index:2;}
.brand{font-family:'Playfair Display',serif;font-weight:900;font-size:26px;letter-spacing:-.3px;}
.brand .g{color:#C5A059;}
.navlinks{display:flex;gap:30px;font-size:13px;font-weight:500;letter-spacing:.3px;}
.navlinks a{color:#fff;opacity:.9;text-decoration:none;}
.nav-cta{background:#C5A059;color:#0a0a0a;padding:10px 22px;border-radius:4px;font-size:12px;font-weight:700;letter-spacing:.8px;text-transform:uppercase;}
.hero-content{position:absolute;bottom:60px;left:60px;right:60px;z-index:2;}
.hero-sub{font-size:11px;color:#C5A059;letter-spacing:3px;font-weight:600;margin-bottom:14px;text-transform:uppercase;}
.hero-h1{font-family:'Playfair Display',serif;font-weight:700;font-size:62px;line-height:1.05;letter-spacing:-1px;margin-bottom:22px;max-width:780px;}
.hero-h1 em{font-style:italic;color:#C5A059;font-weight:400;}
.hero-meta{display:flex;gap:40px;font-size:13px;color:#ddd;font-weight:500;}
.hero-meta span::before{content:"—";color:#C5A059;margin-right:10px;}
.listings{width:1200px;height:230px;background:#0a0a0a;padding:30px 60px;display:grid;grid-template-columns:repeat(3,1fr);gap:24px;}
.card{background:#141414;border:1px solid #1e1e1e;border-radius:8px;overflow:hidden;display:flex;flex-direction:column;}
.card-img{height:100px;background-size:cover;background-position:center;position:relative;}
.badge{position:absolute;top:10px;left:10px;background:#C5A059;color:#0a0a0a;font-size:9px;font-weight:800;padding:4px 8px;border-radius:3px;letter-spacing:.6px;}
.card-body{padding:10px 14px;}
.card-title{font-size:12px;font-weight:600;margin-bottom:3px;}
.card-loc{font-size:10px;color:#777;margin-bottom:8px;}
.card-price{font-family:'Playfair Display',serif;font-size:17px;color:#C5A059;font-weight:700;}
.card-feat{display:flex;gap:10px;font-size:9px;color:#888;margin-top:5px;}
</style></head><body>
<div class="browser">
  <span class="dot" style="background:#ff5f57;"></span>
  <span class="dot" style="background:#febc2e;"></span>
  <span class="dot" style="background:#28c840;"></span>
  <span class="url">🔒 inmobiliariaelite.mx</span>
</div>
<div class="hero">
  <div class="nav">
    <div class="brand"><span class="g">E</span>lite <span style="font-family:'Inter';font-weight:300;font-size:12px;letter-spacing:4px;margin-left:6px;">PROPERTIES</span></div>
    <div class="navlinks"><a>Propiedades</a><a>Venta</a><a>Renta</a><a>Servicios</a><a>Contacto</a></div>
    <div class="nav-cta">Agendar Visita</div>
  </div>
  <div class="hero-content">
    <div class="hero-sub">Riviera Maya · Bienes Raíces de Lujo</div>
    <div class="hero-h1">Encuentra tu <em>próxima</em> casa frente al mar</div>
    <div class="hero-meta"><span>250+ propiedades activas</span><span>Respuesta en minutos</span><span>Asesor bilingüe 24/7</span></div>
  </div>
</div>
<div class="listings">
  <div class="card"><div class="card-img" style="background-image:url('https://images.unsplash.com/photo-1613977257363-707ba9348227?w=600&q=80');"><div class="badge">EXCLUSIVA</div></div><div class="card-body"><div class="card-title">Villa Aqua Tulum</div><div class="card-loc">Aldea Zamá, Tulum</div><div class="card-price">$12,500,000 MXN</div><div class="card-feat">4 Rec · 5 Baños · 380 m²</div></div></div>
  <div class="card"><div class="card-img" style="background-image:url('https://images.unsplash.com/photo-1564013799919-ab600027ffc6?w=600&q=80');"><div class="badge">NUEVO</div></div><div class="card-body"><div class="card-title">Penthouse Puerto Cancún</div><div class="card-loc">Puerto Cancún</div><div class="card-price">$18,900,000 MXN</div><div class="card-feat">3 Rec · 4 Baños · 295 m²</div></div></div>
  <div class="card"><div class="card-img" style="background-image:url('https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=600&q=80');"><div class="badge">PRE-VENTA</div></div><div class="card-body"><div class="card-title">Residencia Playa Car</div><div class="card-loc">Playa del Carmen</div><div class="card-price">$9,750,000 MXN</div><div class="card-feat">3 Rec · 3 Baños · 240 m²</div></div></div>
</div>
</body></html>"""

# -----------------------------------------------------------------------------
# Asset 2: Ugly real-estate mockup (the "before")
# -----------------------------------------------------------------------------
MOCKUP_UGLY = """<!DOCTYPE html><html><head><meta charset="utf-8"><style>
*{margin:0;padding:0;box-sizing:border-box;}
body{width:1200px;height:800px;background:#fffbea;color:#000;font-family:'Comic Sans MS','Chalkboard SE',cursive;overflow:hidden;}
.browser{width:1200px;height:30px;background:#d0d0d0;display:flex;align-items:center;padding:0 14px;gap:7px;border-bottom:1px solid #a0a0a0;}
.dot{width:11px;height:11px;border-radius:50%;border:1px solid #888;}
.url{margin-left:14px;background:#fff;color:#666;font-size:11px;padding:3px 9px;border-radius:3px;font-family:Verdana;border:1px solid #aaa;}
.top-strip{width:1200px;height:36px;background:repeating-linear-gradient(90deg,#ff0000 0,#ff0000 28px,#ffff00 28px,#ffff00 56px);display:flex;align-items:center;justify-content:center;font-weight:900;font-size:15px;color:#000;letter-spacing:1px;}
.blink{animation:blink 1s infinite;}
@keyframes blink{50%{opacity:0;}}
.header{width:1200px;height:130px;background:linear-gradient(180deg,#0099ff 0%,#003366 100%);display:flex;justify-content:space-between;align-items:center;padding:0 30px;border-bottom:4px solid #ff9900;}
.logo{display:flex;align-items:center;gap:12px;}
.logo-ico{width:70px;height:70px;background:radial-gradient(circle,#ffde00 0%,#ff6600 100%);border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:28px;border:3px solid #fff;box-shadow:inset 0 0 12px rgba(0,0,0,.5);}
.logo-txt{color:#fff;text-shadow:3px 3px 0 #000,5px 5px 5px rgba(0,0,0,.5);font-size:32px;font-weight:900;}
.logo-sub{color:#ffde00;font-size:13px;font-style:italic;text-shadow:2px 2px 0 #000;}
.header-right{color:#fff;font-size:14px;text-align:right;text-shadow:1px 1px 0 #000;line-height:1.6;}
.header-right strong{color:#ffde00;font-size:19px;}
.nav-ugly{width:1200px;height:40px;background:#ff9900;display:flex;font-size:13px;font-weight:900;text-transform:uppercase;}
.nav-ugly div{padding:0 18px;display:flex;align-items:center;border-right:2px solid #cc6600;color:#000;cursor:pointer;}
.nav-ugly div:hover{background:#ffcc00;}
.hero-ugly{width:1200px;height:280px;background:url('https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800&q=30') center/cover;position:relative;display:flex;align-items:center;justify-content:center;}
.hero-ugly::after{content:"";position:absolute;inset:0;background:rgba(255,255,0,.2);}
.welcome-box{position:relative;z-index:1;text-align:center;background:rgba(255,255,255,.75);padding:25px 50px;border:5px dashed #ff0000;max-width:700px;}
.welcome{font-size:46px;font-weight:900;color:#ff0000;text-shadow:3px 3px 0 #ffff00,5px 5px 0 #000;line-height:1.1;}
.welcome2{font-size:19px;color:#003366;margin-top:10px;font-style:italic;font-weight:700;}
.content{width:1200px;height:284px;background:#e0e0e0;padding:18px 30px;display:grid;grid-template-columns:280px 1fr 260px;gap:18px;}
.sidebar{background:#ffff99;padding:14px;border:3px double #666;}
.sidebar h3{background:#003366;color:#ffff00;padding:6px 10px;margin:-14px -14px 10px;font-size:15px;text-transform:uppercase;}
.sidebar ul{list-style:none;font-size:13px;line-height:1.9;}
.sidebar li{padding-left:16px;position:relative;color:#003366;font-weight:700;}
.sidebar li::before{content:"▶";color:#ff0000;position:absolute;left:0;}
.props-ugly{display:grid;grid-template-columns:1fr 1fr;gap:12px;}
.prop-ugly{background:#fff;border:3px solid #003366;padding:10px;text-align:center;position:relative;}
.prop-ugly img{width:100%;height:80px;object-fit:cover;filter:saturate(.6);}
.prop-title{font-size:15px;font-weight:900;color:#003366;margin-top:6px;}
.prop-price{font-size:19px;color:#ff0000;font-weight:900;font-family:'Impact';letter-spacing:1px;text-shadow:1px 1px 0 #ffff00;}
.nuevo{position:absolute;top:-8px;right:-8px;background:#ff0000;color:#ffff00;font-size:10px;font-weight:900;padding:5px 9px;border-radius:50%;transform:rotate(15deg);border:2px solid #fff;}
.right-box{background:#ccffcc;border:3px ridge #008800;padding:14px;text-align:center;}
.right-box h3{color:#ff0000;font-size:17px;text-transform:uppercase;margin-bottom:8px;text-decoration:underline;}
.right-box p{font-size:12px;color:#003366;line-height:1.5;font-weight:700;}
.right-cta{background:#ffff00;border:3px solid #ff0000;padding:10px;margin-top:10px;color:#ff0000;font-weight:900;font-size:14px;animation:blink 1.2s infinite;}
.footer{width:1200px;height:20px;background:#003366;color:#ffff00;font-size:11px;display:flex;align-items:center;padding:0 18px;}
</style></head><body>
<div class="browser">
  <span class="dot"></span><span class="dot"></span><span class="dot"></span>
  <span class="url">🌐 www.inmobiliaria-2008.com.mx/inicio.html</span>
</div>
<div class="top-strip"><span class="blink">🔥 OFERTAS!!!</span> &nbsp;&nbsp; VISITE HOY MISMO &nbsp;&nbsp; <span class="blink">LLAME YA!!!</span> &nbsp;&nbsp; 📞 01-800-PROPIEDAD</div>
<div class="header">
  <div class="logo">
    <div class="logo-ico">🏠</div>
    <div><div class="logo-txt">INMOBILIARIA</div><div class="logo-sub">★ Los Mejores Precios del Mercado ★</div></div>
  </div>
  <div class="header-right">☎ Tel: 998-123-4567<br><strong>¡LLAME AHORA!</strong><br>Lun-Vie 9am-6pm</div>
</div>
<div class="nav-ugly"><div>INICIO</div><div>QUIENES SOMOS</div><div>PROPIEDADES</div><div>FINANCIAMIENTO</div><div>FOTOS</div><div>NOTICIAS</div><div>CONTACTO ⚡</div></div>
<div class="hero-ugly">
  <div class="welcome-box">
    <div class="welcome">BIENVENIDOS!!!</div>
    <div class="welcome2">"La casa de tus sueños está aquí" &nbsp;✨</div>
  </div>
</div>
<div class="content">
  <div class="sidebar"><h3>Servicios</h3>
    <ul><li>Venta de casas</li><li>Renta</li><li>Terrenos</li><li>Departamentos</li><li>Asesoria legal</li><li>Crédito</li><li>Avaluos</li></ul>
  </div>
  <div class="props-ugly">
    <div class="prop-ugly"><div class="nuevo">NUEVO!</div><img src="https://images.unsplash.com/photo-1568605114967-8130f3a36994?w=400&q=30"><div class="prop-title">Casa Bonita</div><div class="prop-price">$2,500,000</div></div>
    <div class="prop-ugly"><div class="nuevo">OFERTA!</div><img src="https://images.unsplash.com/photo-1570129477492-45c003edd2be?w=400&q=30"><div class="prop-title">Residencia</div><div class="prop-price">$4,900,000</div></div>
    <div class="prop-ugly"><img src="https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=400&q=30"><div class="prop-title">Depto. Moderno</div><div class="prop-price">$1,890,000</div></div>
    <div class="prop-ugly"><img src="https://images.unsplash.com/photo-1570129477492-45c003edd2be?w=400&q=30"><div class="prop-title">Casa Familiar</div><div class="prop-price">$3,200,000</div></div>
  </div>
  <div class="right-box"><h3>¡Contactanos!</h3><p>Asesor disponible<br>Respondemos en 24-48 hrs</p><div class="right-cta">📧 ENVIAR EMAIL</div><p style="margin-top:10px;font-size:10px;">Horario:<br>Lun-Vie 9-6<br>Sáb 10-2</p></div>
</div>
<div class="footer">Copyright © 2008 Inmobiliaria. Todos los derechos reservados. Diseñado con FrontPage.</div>
</body></html>"""

# -----------------------------------------------------------------------------
# Render order: mockups first, then slides that EMBED them
# -----------------------------------------------------------------------------
def warmup():
    """Tiny first render to wake the Cloud Run instance before the heavy ones."""
    print("[warmup] poking renderer with trivial HTML...")
    tiny = "<!DOCTYPE html><html><head></head><body style='width:400px;height:200px;background:#000;'></body></html>"
    payload = json.dumps({"html": tiny, "width": 400, "height": 200, "dpr": 1}).encode()
    req = urllib.request.Request(RENDERER, data=payload,
        headers={"Content-Type": "application/json"}, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            r.read()
        print("[warmup] ready\n")
    except Exception as e:
        print(f"[warmup] (non-fatal) {e}\n")

def main():
    print(f"[build] output dir: {OUT}")
    print(f"[build] renderer:   {RENDERER}\n")
    warmup()

    print("[1/5] Premium real estate mockup (1200x800)")
    render("mockup_premium", MOCKUP_PREMIUM, 1200, 800, dpr=2)

    print("[2/5] Ugly 'before' mockup (1200x800)")
    render("mockup_ugly", MOCKUP_UGLY, 1200, 800, dpr=2)

    # Now embed them as data URLs in the slide HTML
    premium_uri = embed("mockup_premium")
    ugly_uri    = embed("mockup_ugly")

    # -------------------------------------------------------------------------
    # Slide 1 — Before/After hook (1080x1350)
    # -------------------------------------------------------------------------
    SLIDE_1 = """<!DOCTYPE html><html><head><meta charset="utf-8"><style>
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800;900&family=Playfair+Display:wght@700;900&display=swap');
*{margin:0;padding:0;box-sizing:border-box;}
body{width:1080px;height:1350px;background:#0f1115;color:#fff;font-family:'Inter',sans-serif;overflow:hidden;position:relative;}
.glow{position:absolute;width:800px;height:800px;border-radius:50%;background:radial-gradient(circle,rgba(197,160,89,.12) 0%,transparent 70%);top:-200px;right:-200px;}
.brand{position:absolute;top:50px;left:50px;font-family:'Playfair Display',serif;font-size:28px;font-weight:900;z-index:2;}
.brand .g{color:#C5A059;}
.headline{padding:140px 60px 0;position:relative;z-index:2;}
.h-kicker{color:#C5A059;font-size:14px;letter-spacing:5px;font-weight:700;text-transform:uppercase;margin-bottom:22px;}
.h-main{font-family:'Playfair Display',serif;font-weight:900;font-size:82px;line-height:1.02;letter-spacing:-2px;margin-bottom:12px;}
.h-main em{font-style:italic;color:#C5A059;font-weight:700;}
.h-sub{font-size:23px;color:#bbb;font-weight:400;max-width:900px;line-height:1.35;}
.split{position:absolute;bottom:140px;left:40px;right:40px;display:grid;grid-template-columns:1fr 1fr;gap:22px;}
.col{display:flex;flex-direction:column;align-items:center;}
.label{font-size:14px;letter-spacing:5px;font-weight:800;text-transform:uppercase;margin-bottom:14px;padding:8px 22px;border-radius:999px;}
.lab-before{background:rgba(255,80,80,.15);color:#ff7a7a;border:1px solid rgba(255,80,80,.35);}
.lab-after{background:rgba(197,160,89,.18);color:#C5A059;border:1px solid rgba(197,160,89,.45);}
.frame{width:100%;aspect-ratio:3/2;border-radius:10px;overflow:hidden;background:#000;box-shadow:0 20px 60px rgba(0,0,0,.65);border:1px solid #1a1a1a;}
.frame img{width:100%;height:100%;display:block;object-fit:cover;object-position:top;}
.swipe{position:absolute;bottom:55px;left:0;right:0;text-align:center;font-size:17px;color:#888;letter-spacing:4px;font-weight:600;text-transform:uppercase;}
.swipe-arrow{color:#C5A059;}
</style></head><body>
<div class="glow"></div>
<div class="brand"><span class="g">Jego</span>Digital</div>
<div class="headline">
  <div class="h-kicker">Inmobiliarias · México 2026</div>
  <div class="h-main">¿Tu sitio web <em>vende</em>,<br>o te hace perder clientes?</div>
  <div class="h-sub">La diferencia entre captar un lead y perderlo son 3 segundos.</div>
</div>
<div class="split">
  <div class="col">
    <div class="label lab-before">ANTES</div>
    <div class="frame"><img src="__UGLY__"></div>
  </div>
  <div class="col">
    <div class="label lab-after">DESPUÉS</div>
    <div class="frame"><img src="__PREMIUM__"></div>
  </div>
</div>
<div class="swipe">Desliza <span class="swipe-arrow">→</span></div>
</body></html>""".replace("__UGLY__", ugly_uri).replace("__PREMIUM__", premium_uri)

    print("[3/5] Slide 1 — Before/After hook (1080x1350)")
    render("slide_1_before_after", SLIDE_1, 1080, 1350, dpr=2)

    # -------------------------------------------------------------------------
    # Slide 2 — 73% stat (1080x1350)
    # -------------------------------------------------------------------------
    SLIDE_2 = """<!DOCTYPE html><html><head><meta charset="utf-8"><style>
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&family=Playfair+Display:wght@700;900&display=swap');
*{margin:0;padding:0;box-sizing:border-box;}
body{width:1080px;height:1350px;background:#0f1115;color:#fff;font-family:'Inter',sans-serif;overflow:hidden;position:relative;}
.glow1{position:absolute;width:900px;height:900px;border-radius:50%;background:radial-gradient(circle,rgba(197,160,89,.18) 0%,transparent 65%);top:-250px;left:-250px;}
.glow2{position:absolute;width:700px;height:700px;border-radius:50%;background:radial-gradient(circle,rgba(197,160,89,.08) 0%,transparent 70%);bottom:-200px;right:-200px;}
.brand{position:absolute;top:50px;left:50px;font-family:'Playfair Display',serif;font-size:28px;font-weight:900;z-index:2;}
.brand .g{color:#C5A059;}
.pill{position:absolute;top:58px;right:50px;font-size:12px;letter-spacing:4px;color:#888;font-weight:700;text-transform:uppercase;border:1px solid #2a2a2a;padding:8px 16px;border-radius:999px;}
.wrap{position:relative;z-index:2;padding:260px 80px 0;text-align:center;}
.kicker{color:#C5A059;font-size:15px;letter-spacing:6px;font-weight:800;text-transform:uppercase;margin-bottom:40px;}
.stat{font-family:'Playfair Display',serif;font-weight:900;font-size:380px;line-height:.85;letter-spacing:-12px;
      background:linear-gradient(180deg,#C5A059 0%,#e3c079 55%,#8a6f3d 100%);
      -webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;
      margin-bottom:24px;text-shadow:0 0 80px rgba(197,160,89,.25);}
.h2{font-family:'Playfair Display',serif;font-weight:700;font-size:46px;line-height:1.1;letter-spacing:-.8px;margin-bottom:22px;}
.h2 em{font-style:italic;color:#C5A059;font-weight:900;}
.p{font-size:22px;color:#bbb;line-height:1.45;max-width:820px;margin:0 auto;font-weight:400;}
.source{position:absolute;bottom:120px;left:0;right:0;text-align:center;font-size:13px;color:#555;letter-spacing:3px;font-weight:600;text-transform:uppercase;}
.divider{width:60px;height:2px;background:#C5A059;margin:0 auto 30px;}
</style></head><body>
<div class="glow1"></div><div class="glow2"></div>
<div class="brand"><span class="g">Jego</span>Digital</div>
<div class="pill">El Dato</div>
<div class="wrap">
  <div class="kicker">Estudio NAR · 2025</div>
  <div class="stat">73%</div>
  <div class="divider"></div>
  <div class="h2">de los compradores <em>descartan</em><br>una inmobiliaria si su sitio web<br>se ve desactualizado</div>
  <div class="p">Tu próximo cliente ya te juzgó en los primeros 3 segundos.<br>La pregunta es: ¿qué vio?</div>
</div>
<div class="source">Fuente · National Association of Realtors Digital Impact Report</div>
</body></html>"""

    print("[4/5] Slide 2 — 73% stat (1080x1350)")
    render("slide_2_stat", SLIDE_2, 1080, 1350, dpr=2)

    # -------------------------------------------------------------------------
    # Slide 3 — MacBook mockup (1080x1350)
    # -------------------------------------------------------------------------
    SLIDE_3 = """<!DOCTYPE html><html><head><meta charset="utf-8"><style>
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&family=Playfair+Display:wght@700;900&display=swap');
*{margin:0;padding:0;box-sizing:border-box;}
body{width:1080px;height:1350px;background:#0f1115;color:#fff;font-family:'Inter',sans-serif;overflow:hidden;position:relative;}
.glow{position:absolute;width:1100px;height:600px;background:radial-gradient(ellipse,rgba(197,160,89,.18) 0%,transparent 65%);top:200px;left:-10px;}
.brand{position:absolute;top:50px;left:50px;font-family:'Playfair Display',serif;font-size:28px;font-weight:900;z-index:2;}
.brand .g{color:#C5A059;}
.pill{position:absolute;top:58px;right:50px;font-size:12px;letter-spacing:4px;color:#888;font-weight:700;text-transform:uppercase;border:1px solid #2a2a2a;padding:8px 16px;border-radius:999px;}
.hdr{position:relative;z-index:2;padding:150px 70px 0;text-align:center;}
.kicker{color:#C5A059;font-size:14px;letter-spacing:6px;font-weight:800;text-transform:uppercase;margin-bottom:22px;}
.h1{font-family:'Playfair Display',serif;font-weight:900;font-size:66px;line-height:1.04;letter-spacing:-1.5px;margin-bottom:16px;}
.h1 em{font-style:italic;color:#C5A059;}
.sub{font-size:21px;color:#aaa;font-weight:400;max-width:820px;margin:0 auto;line-height:1.4;}
.macbook{position:absolute;top:540px;left:50%;transform:translateX(-50%);width:920px;}
.mac-screen{background:#1a1a1a;border-radius:16px 16px 0 0;padding:22px 22px 26px;border:1px solid #333;box-shadow:0 25px 70px rgba(0,0,0,.7);}
.mac-screen img{width:100%;display:block;border-radius:6px;background:#000;}
.mac-bar{width:100%;height:22px;background:linear-gradient(180deg,#3a3a3a 0%,#1c1c1c 100%);border-radius:0 0 22px 22px;position:relative;border:1px solid #444;border-top:none;}
.mac-bar::before{content:"";position:absolute;top:0;left:50%;transform:translateX(-50%);width:120px;height:7px;background:#0f0f0f;border-radius:0 0 10px 10px;}
.mac-base{width:1040px;height:14px;margin:-2px auto 0;background:linear-gradient(180deg,#2a2a2a 0%,#0a0a0a 100%);border-radius:0 0 14px 14px;transform:translateX(-60px);}
.cta-bar{position:absolute;bottom:70px;left:60px;right:60px;display:flex;justify-content:space-between;align-items:center;padding:22px 32px;background:rgba(197,160,89,.08);border:1px solid rgba(197,160,89,.35);border-radius:12px;}
.cta-left{display:flex;flex-direction:column;gap:2px;}
.cta-k{font-size:11px;letter-spacing:4px;color:#C5A059;font-weight:800;text-transform:uppercase;}
.cta-t{font-size:19px;font-weight:700;}
.cta-right{background:#C5A059;color:#0a0a0a;padding:14px 28px;border-radius:6px;font-size:14px;font-weight:800;letter-spacing:1px;text-transform:uppercase;}
</style></head><body>
<div class="glow"></div>
<div class="brand"><span class="g">Jego</span>Digital</div>
<div class="pill">La Solución</div>
<div class="hdr">
  <div class="kicker">Así se ve tu inmobiliaria en 2026</div>
  <div class="h1">Velocidad. <em>Elegancia.</em> Leads.</div>
  <div class="sub">Sitio web mobile-first que carga en menos de 2s,<br>con captura de leads integrada a WhatsApp.</div>
</div>
<div class="macbook">
  <div class="mac-screen"><img src="__PREMIUM__"></div>
  <div class="mac-bar"></div>
</div>
<div class="mac-base"></div>
<div class="cta-bar">
  <div class="cta-left">
    <div class="cta-k">Agenda 15 min con Alex</div>
    <div class="cta-t">calendly.com/jegoalexdigital/30min</div>
  </div>
  <div class="cta-right">Ver Mi Auditoría →</div>
</div>
</body></html>""".replace("__PREMIUM__", premium_uri)

    print("[5/5] Slide 3 — MacBook mockup (1080x1350)")
    render("slide_3_macbook", SLIDE_3, 1080, 1350, dpr=2)

    print("\n[done] All 5 assets rendered to:")
    print(f"       {OUT}")

if __name__ == "__main__":
    main()
