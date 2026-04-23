#!/usr/bin/env python3
"""
JegoDigital YouTube uploader (resumable). Refreshes access token from .secrets/,
starts a resumable session with Spanish SEO metadata, uploads the MP4 in chunks,
then sets the custom thumbnail. Returns videoId + watch URL.
"""
import os, sys, json, time, urllib.parse, urllib.request, urllib.error
from pathlib import Path

SECRETS = Path("/sessions/sleepy-beautiful-cori/mnt/jegodigital/.secrets")
VIDEO = Path("/sessions/sleepy-beautiful-cori/mnt/jegodigital/content/youtube-proof-tactic/youtube_proof_tactic_v2.mp4")
THUMB = Path("/sessions/sleepy-beautiful-cori/mnt/jegodigital/content/youtube-proof-tactic/v2_assets/thumbnail_v1.png")

CLIENT_ID = SECRETS.joinpath("youtube_client_id").read_text().strip()
CLIENT_SECRET = SECRETS.joinpath("youtube_client_secret").read_text().strip()
REFRESH_TOKEN = SECRETS.joinpath("youtube_refresh_token").read_text().strip()

TITLE = "El 70% de Inmobiliarias en México Pierde Leads — 2 Tácticas Probadas | JegoDigital"

DESCRIPTION = """El 70% de las inmobiliarias en México pierde leads que ya pagaron en publicidad. La razón no es el precio del lead — es el tiempo de respuesta y el seguimiento.

En este video te mostramos las 2 tácticas que usamos en JegoDigital con clientes reales como Flamingo Real Estate (Cancún) y GoodLife Tulum para recuperar el 70% de leads perdidos sin gastar más en ads.

Lo que vas a aprender:
✓ Por qué el lead muerto a las 2 horas (dato real de Inside Sales)
✓ La táctica de respuesta en menos de 1 minuto (sin contratar a nadie)
✓ El segundo embudo que captura el 35% de los que no contestan
✓ Resultados verificables: Flamingo +320% tráfico orgánico, #1 Google Maps Cancún

📅 Capítulos:
00:00 — El problema: 70% de leads desperdiciados
01:30 — Por qué el follow-up manual no escala
02:30 — Táctica 1: Respuesta automatizada en menos de 60 segundos
04:00 — Táctica 2: Re-engagement a los 7 días
05:00 — Resultados reales con clientes JegoDigital
05:45 — Cómo aplicarlo en tu inmobiliaria

🎁 ¿Quieres que JegoDigital audite tu sistema de captación gratis?
👉 https://jegodigital.com/auditoria-gratis

📲 Habla con Alex directo:
WhatsApp: https://wa.me/529987875321
Calendly: https://calendly.com/jegoalexdigital/30min

🌐 Más casos de éxito reales:
https://jegodigital.com/casos-exito

—
JegoDigital es la agencia de marketing digital con IA para inmobiliarias en México. Servicios: SEO Local, Captura 24/7 con IA, Email Marketing, Videos de Propiedades, Sitios Web de Alto Rendimiento.

#Inmobiliarias #MarketingInmobiliario #LeadsInmobiliarios #JegoDigital #RealEstateMexico #MarketingDigital #CaptacionDeLeads #WhatsAppBusiness #SEOInmobiliario #IAInmobiliaria"""

TAGS = [
    "JegoDigital", "inmobiliarias mexico", "captacion de leads", "leads inmobiliarios",
    "marketing inmobiliario", "real estate mexico", "SEO inmobiliario",
    "whatsapp inmobiliarias", "IA inmobiliaria", "agencia inmobiliaria",
    "broker mexico", "Cancun real estate", "Tulum real estate",
    "Alex Jego", "Flamingo Real Estate", "follow up automatico"
]


def refresh_access_token() -> str:
    data = urllib.parse.urlencode({
        "client_id": CLIENT_ID, "client_secret": CLIENT_SECRET,
        "refresh_token": REFRESH_TOKEN, "grant_type": "refresh_token",
    }).encode()
    req = urllib.request.Request("https://oauth2.googleapis.com/token", data=data)
    with urllib.request.urlopen(req, timeout=30) as r:
        j = json.loads(r.read())
    return j["access_token"]


def start_resumable_upload(access_token: str, file_size: int) -> str:
    body = {
        "snippet": {
            "title": TITLE, "description": DESCRIPTION, "tags": TAGS,
            "categoryId": "27",  # Education
            "defaultLanguage": "es", "defaultAudioLanguage": "es-MX",
        },
        "status": {
            "privacyStatus": "unlisted",
            "selfDeclaredMadeForKids": False,
            "embeddable": True,
            "license": "youtube",
        },
    }
    body_json = json.dumps(body).encode("utf-8")
    url = ("https://www.googleapis.com/upload/youtube/v3/videos"
           "?uploadType=resumable&part=snippet,status")
    req = urllib.request.Request(url, data=body_json, method="POST")
    req.add_header("Authorization", f"Bearer {access_token}")
    req.add_header("Content-Type", "application/json; charset=UTF-8")
    req.add_header("X-Upload-Content-Length", str(file_size))
    req.add_header("X-Upload-Content-Type", "video/mp4")
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            session_url = r.headers.get("Location")
    except urllib.error.HTTPError as e:
        err_body = e.read().decode("utf-8", errors="replace")
        print(f"\nResumable-start HTTP {e.code}:\n{err_body}", file=sys.stderr)
        raise
    if not session_url:
        sys.exit("No Location header in resumable-start response")
    return session_url


def upload_chunk(session_url: str, data: bytes, start: int, total: int) -> tuple[int, dict | None]:
    """Upload one chunk. Returns (http_status, parsed_body_if_final)."""
    end = start + len(data) - 1
    req = urllib.request.Request(session_url, data=data, method="PUT")
    req.add_header("Content-Length", str(len(data)))
    req.add_header("Content-Range", f"bytes {start}-{end}/{total}")
    try:
        with urllib.request.urlopen(req, timeout=300) as r:
            return r.getcode(), json.loads(r.read())
    except urllib.error.HTTPError as e:
        if e.code == 308:  # resume incomplete
            return 308, None
        raise


def set_thumbnail(access_token: str, video_id: str) -> bool:
    thumb_bytes = THUMB.read_bytes()
    url = f"https://www.googleapis.com/upload/youtube/v3/thumbnails/set?videoId={video_id}"
    req = urllib.request.Request(url, data=thumb_bytes, method="POST")
    req.add_header("Authorization", f"Bearer {access_token}")
    req.add_header("Content-Type", "image/png")
    req.add_header("Content-Length", str(len(thumb_bytes)))
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            return r.getcode() == 200
    except urllib.error.HTTPError as e:
        print(f"Thumbnail set failed: HTTP {e.code}", file=sys.stderr)
        print(e.read().decode(), file=sys.stderr)
        return False


def main():
    assert VIDEO.exists(), f"Video not found: {VIDEO}"
    assert THUMB.exists(), f"Thumbnail not found: {THUMB}"
    size = VIDEO.stat().st_size
    print(f"Video: {VIDEO.name}  {size/(1024*1024):.1f} MB")
    print(f"Thumb: {THUMB.name}")
    print(f"Title: {TITLE}")

    print("→ Refreshing access token…")
    access = refresh_access_token()
    print("  ✓ access token minted")

    print("→ Starting resumable upload session…")
    session_url = start_resumable_upload(access, size)
    print(f"  ✓ session_url = {session_url[:90]}…")

    # Upload in 16MB chunks
    CHUNK = 16 * 1024 * 1024
    video_id = None
    with VIDEO.open("rb") as f:
        pos = 0
        chunk_idx = 0
        while pos < size:
            data = f.read(CHUNK)
            chunk_idx += 1
            status, body = upload_chunk(session_url, data, pos, size)
            pct = min(100, (pos + len(data)) * 100 // size)
            print(f"  chunk {chunk_idx}  {pos:>11}-{pos+len(data)-1:>11}/{size}  ({pct}%)  HTTP {status}")
            pos += len(data)
            if status in (200, 201) and body:
                video_id = body.get("id")
                print(f"  ✓ upload complete — videoId = {video_id}")
                break
    if not video_id:
        sys.exit("No videoId returned")

    Path("/tmp/yt_video_id").write_text(video_id)
    print(f"\n→ Setting custom thumbnail…")
    ok = set_thumbnail(access, video_id)
    print(f"  {'✓' if ok else '✗'} thumbnail")

    print("\n================ RESULT ================")
    print(f"Video ID:   {video_id}")
    print(f"Watch:      https://youtu.be/{video_id}")
    print(f"Studio:     https://studio.youtube.com/video/{video_id}/edit")
    print(f"Privacy:    unlisted (change to Public in Studio when ready)")


if __name__ == "__main__":
    main()
