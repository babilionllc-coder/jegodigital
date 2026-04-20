#!/usr/bin/env bash
# Proves the Cloud Run renderer actually works by POSTing real HTML → saves PNG
set -euo pipefail

RENDERER="https://mockup-renderer-wfmydylowa-uc.a.run.app/render"
OUT="/tmp/renderer_test_$(date +%s).png"
PAYLOAD="/tmp/renderer_payload_$$.json"

# Build the JSON payload via Python (stdin → stdout, no shell quoting hell)
python3 <<'PYEOF' > "$PAYLOAD"
import json
html = """<!DOCTYPE html><html><head><style>
body{margin:0;background:#0f1115;color:#fff;font-family:-apple-system,sans-serif;
     width:1080px;height:1350px;display:flex;align-items:center;justify-content:center;flex-direction:column;}
h1{font-size:80px;margin:0;}
.gold{color:#C5A059;}
p{font-size:32px;opacity:0.7;margin-top:20px;}
</style></head><body>
<h1><span class="gold">Jego</span>Digital</h1>
<p>Renderer Test — if you see this, Cloud Run works.</p>
</body></html>"""
print(json.dumps({"html": html, "width": 1080, "height": 1350, "dpr": 2}))
PYEOF

echo "▶ Testing $RENDERER"
echo "▶ Payload: $PAYLOAD ($(wc -c < "$PAYLOAD") bytes)"
echo "▶ Output:  $OUT"
echo

echo "▶ Sending POST /render (first request may take ~5s for cold start)..."
HTTP_CODE=$(curl -s -o "$OUT" -w "%{http_code}" -X POST "$RENDERER" \
  -H "Content-Type: application/json" \
  --data-binary "@$PAYLOAD")

SIZE=$(stat -f%z "$OUT" 2>/dev/null || stat -c%s "$OUT" 2>/dev/null)
FTYPE=$(file "$OUT" | cut -d: -f2)

echo
echo "▶ HTTP $HTTP_CODE"
echo "▶ Size: $SIZE bytes"
echo "▶ Type:$FTYPE"
echo

if [[ "$HTTP_CODE" == "200" ]] && file "$OUT" | grep -q "PNG image"; then
  echo "✅ RENDERER WORKS. PNG saved to $OUT"
  echo "   Open with:  open $OUT"
else
  echo "❌ Renderer failed. Response body:"
  echo "   --- begin body ---"
  head -c 2000 "$OUT"
  echo
  echo "   --- end body ---"
fi

rm -f "$PAYLOAD"
