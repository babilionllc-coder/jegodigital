#!/usr/bin/env bash
# Single-command YouTube upload. Start resumable session in Python (fast),
# then use curl to PUT the entire 224MB binary in one shot.
set -euo pipefail

SECRETS=/sessions/sleepy-beautiful-cori/mnt/jegodigital/.secrets
VIDEO=/sessions/sleepy-beautiful-cori/mnt/jegodigital/content/youtube-proof-tactic/youtube_proof_tactic_v2.mp4
THUMB=/sessions/sleepy-beautiful-cori/mnt/jegodigital/content/youtube-proof-tactic/v2_assets/thumbnail_v1.png

CLIENT_ID=$(cat "$SECRETS/youtube_client_id")
CLIENT_SECRET=$(cat "$SECRETS/youtube_client_secret")
REFRESH_TOKEN=$(cat "$SECRETS/youtube_refresh_token")
SIZE=$(stat -c%s "$VIDEO")
echo "Size: $SIZE bytes ($((SIZE/1024/1024)) MB)"

# 1) Refresh access token
echo "→ Refresh access token…"
ACCESS=$(curl -s -X POST "https://oauth2.googleapis.com/token" \
  -d "client_id=$CLIENT_ID" -d "client_secret=$CLIENT_SECRET" \
  -d "refresh_token=$REFRESH_TOKEN" -d "grant_type=refresh_token" \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])")
echo "  ✓ access token minted"

# 2) Start resumable session
echo "→ Start resumable session…"
cat > /tmp/yt_body.json <<JSON
{
  "snippet": {
    "title": "El 70% de Inmobiliarias en México Pierde Leads — 2 Tácticas Probadas | JegoDigital",
    "description": "El 70% de las inmobiliarias en México pierde leads que ya pagaron en publicidad. La razón no es el precio del lead — es el tiempo de respuesta y el seguimiento.\n\nEn este video te mostramos las 2 tácticas que usamos en JegoDigital con clientes reales como Flamingo Real Estate (Cancún) y GoodLife Tulum para recuperar el 70% de leads perdidos sin gastar más en ads.\n\nLo que vas a aprender:\n✓ Por qué el lead muerto a las 2 horas (dato real de Inside Sales)\n✓ La táctica de respuesta en menos de 1 minuto (sin contratar a nadie)\n✓ El segundo embudo que captura el 35% de los que no contestan\n✓ Resultados verificables: Flamingo +320% tráfico orgánico, #1 Google Maps Cancún\n\n📅 Capítulos:\n00:00 — El problema: 70% de leads desperdiciados\n01:30 — Por qué el follow-up manual no escala\n02:30 — Táctica 1: Respuesta automatizada en menos de 60 segundos\n04:00 — Táctica 2: Re-engagement a los 7 días\n05:00 — Resultados reales con clientes JegoDigital\n05:45 — Cómo aplicarlo en tu inmobiliaria\n\n🎁 ¿Quieres que JegoDigital audite tu sistema de captación gratis?\n👉 https://jegodigital.com/auditoria-gratis\n\n📲 Habla con Alex directo:\nWhatsApp: https://wa.me/529987875321\nCalendly: https://calendly.com/jegoalexdigital/30min\n\n🌐 Más casos de éxito reales:\nhttps://jegodigital.com/casos-exito\n\n—\nJegoDigital es la agencia de marketing digital con IA para inmobiliarias en México. Servicios: SEO Local, Captura 24/7 con IA, Email Marketing, Videos de Propiedades, Sitios Web de Alto Rendimiento.\n\n#Inmobiliarias #MarketingInmobiliario #LeadsInmobiliarios #JegoDigital #RealEstateMexico #MarketingDigital #CaptacionDeLeads #WhatsAppBusiness #SEOInmobiliario #IAInmobiliaria",
    "tags": ["JegoDigital","inmobiliarias mexico","captacion de leads","leads inmobiliarios","marketing inmobiliario","real estate mexico","SEO inmobiliario","whatsapp inmobiliarias","IA inmobiliaria","agencia inmobiliaria","broker mexico","Cancun real estate","Tulum real estate","Alex Jego","Flamingo Real Estate","follow up automatico"],
    "categoryId": "27",
    "defaultLanguage": "es",
    "defaultAudioLanguage": "es-MX"
  },
  "status": {
    "privacyStatus": "unlisted",
    "selfDeclaredMadeForKids": false,
    "embeddable": true,
    "license": "youtube"
  }
}
JSON

SESSION_URL=$(curl -s -D - -X POST \
  -H "Authorization: Bearer $ACCESS" \
  -H "Content-Type: application/json; charset=UTF-8" \
  -H "X-Upload-Content-Length: $SIZE" \
  -H "X-Upload-Content-Type: video/mp4" \
  --data @/tmp/yt_body.json \
  "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status" \
  -o /tmp/yt_start_body | grep -i '^location:' | head -1 | awk '{print $2}' | tr -d '\r\n')

if [ -z "$SESSION_URL" ]; then
  echo "FAILED — no session URL"
  cat /tmp/yt_start_body
  exit 1
fi
echo "  ✓ session URL"
echo "$SESSION_URL" > /tmp/yt_session_url

# 3) Upload entire binary in single PUT
echo "→ Uploading $((SIZE/1024/1024))MB…"
START=$SECONDS
curl -s -D /tmp/yt_put_hdr -X PUT \
  -H "Content-Length: $SIZE" \
  -H "Content-Type: video/mp4" \
  --data-binary "@$VIDEO" \
  "$SESSION_URL" \
  -o /tmp/yt_put_body
ELAPSED=$((SECONDS - START))
echo "  ✓ uploaded in ${ELAPSED}s ($(( (SIZE/1024/1024) / (ELAPSED>0?ELAPSED:1) )) MB/s)"

# Parse video id
VIDEO_ID=$(python3 -c "import json; d=json.load(open('/tmp/yt_put_body')); print(d.get('id',''))")
if [ -z "$VIDEO_ID" ]; then
  echo "FAILED — no video id"
  head -50 /tmp/yt_put_body
  exit 1
fi
echo "  ✓ videoId = $VIDEO_ID"
echo "$VIDEO_ID" > /tmp/yt_video_id

# 4) Set thumbnail
echo "→ Setting custom thumbnail…"
curl -s -o /tmp/yt_thumb_body -w "  HTTP %{http_code}\n" -X POST \
  -H "Authorization: Bearer $ACCESS" \
  -H "Content-Type: image/png" \
  --data-binary "@$THUMB" \
  "https://www.googleapis.com/upload/youtube/v3/thumbnails/set?videoId=$VIDEO_ID"

echo
echo "================ RESULT ================"
echo "Watch:  https://youtu.be/$VIDEO_ID"
echo "Studio: https://studio.youtube.com/video/$VIDEO_ID/edit"
