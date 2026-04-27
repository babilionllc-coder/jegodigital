#!/usr/bin/env python3
"""
post_mortem_batch.py — Pull every conv from today's FB Brokers batch, categorize, and write
a structured analysis to /tmp/batch_postmortem.json + a human-readable summary.

Usage:  python3 tools/post_mortem_batch.py
"""
import json
import os
import re
import sys
import time
import urllib.request
from collections import defaultdict
from pathlib import Path

# Load env from .env
env_path = Path(__file__).parent.parent / "website/functions/.env"
for line in env_path.read_text().splitlines():
    if "=" in line and not line.strip().startswith("#"):
        k, _, v = line.partition("=")
        os.environ.setdefault(k.strip(), v.strip())

ELEVEN = os.environ["ELEVENLABS_API_KEY"]
AGENT_ID = "agent_7301kq5jxe0gf3vbmp92c974stzc"
HEADERS = {"xi-api-key": ELEVEN}


def get_json(url):
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=15) as r:
        return json.loads(r.read())


# Voicemail prompt patterns we've SEEN today
VM_PHRASES = [
    "no está disponible",
    "graba tu mensaje",
    "deja tu mensaje",
    "después del tono",
    "después de la señal",
    "puedes colgar cuando hayas",
    "buzón de voz",
    "marque la tecla gato",
    "número que marcó",
    "número que usted marcó",
    "el suscriptor",
    "esta es la mensajería",
    "estás llamando a telcel",
    "tu llamada será desviada",
    "abonado",
    "después de la grabación",
    "al sonar el tono",
    "entré en el buzón",
]

# Phrases Sofia should NEVER say after a voicemail prompt
WRONG_REPLIES = [
    "sigue ahí",
    "sigues ahí",
    "se encuentra ahí",
    "aún se encuentra ahí",
    "todo bien",
    "hay algo en lo que pueda",
    "necesitas algo",
    "podría indicarme su nombre",
    "estoy hablando con la persona",  # asked AGAIN after VM
]

# Hot lead signals from broker
HOT_BROKER_SIGNALS = [
    "sí me interesa", "si me interesa", "claro que sí", "claro que si",
    "sí, paso con alex", "si paso con alex", "le gustaría pasar", "le gustaria pasar",
    "60", "80", "100", "leads al mes", "leads por mes",  # they shared lead count
]

# Polite decline signals
DECLINE_SIGNALS = [
    "no me interesa", "ya tengo", "no gracias", "no estoy interesad",
    "estoy lleno", "estoy ocupado", "no manejo", "tengo agencia",
    "no es buen momento", "estamos completos",
]


def categorize(detail):
    md = detail.get("metadata", {}) or {}
    pc = md.get("phone_call", {}) or {}
    transcript = detail.get("transcript", []) or []
    analysis = detail.get("analysis", {}) or {}
    summary = (analysis.get("transcript_summary") or "").lower()
    dur = md.get("call_duration_secs", 0) or 0

    # Failure: no transcript at all
    if not transcript and dur == 0:
        return "no_answer", []

    # Get user turns and agent turns
    user_msgs = [(t.get("message") or "").lower() for t in transcript if t.get("role") == "user"]
    agent_msgs = [(t.get("message") or "").lower() for t in transcript if t.get("role") == "agent"]
    user_text = " ".join(user_msgs)
    agent_text = " ".join(agent_msgs)

    issues = []

    # Did the user line play a voicemail prompt?
    is_vm = any(p in user_text for p in VM_PHRASES)

    # Did Sofia respond incorrectly to the voicemail?
    sofia_said_wrong = any(p in agent_text for p in WRONG_REPLIES)

    # Did Sofia leave a message? (her message includes "treinta días" / "prueba gratuita" / "devuélvame" AFTER VM detected)
    sofia_left_msg = any(
        p in agent_text
        for p in ["devuélvame la llamada", "devuelvame la llamada", "treinta días para", "treinta días sin costo", "respóndame por whatsapp"]
    )

    # Hot lead?
    hot_signal = any(p in user_text for p in HOT_BROKER_SIGNALS)
    decline_signal = any(p in user_text for p in DECLINE_SIGNALS)

    # Categorize
    if is_vm:
        if sofia_left_msg and not sofia_said_wrong:
            return "voicemail_correct_LEFT_MSG", []
        elif sofia_said_wrong and sofia_left_msg:
            issues.append("Sofia said wrong things AND left message — partial fail")
            return "voicemail_partial_fail", issues
        elif sofia_said_wrong:
            # The big failure mode
            wrong_phrases_found = [p for p in WRONG_REPLIES if p in agent_text]
            issues.append(f"Sofia waited on voicemail saying: {wrong_phrases_found}")
            vm_phrase = next((p for p in VM_PHRASES if p in user_text), "?")
            issues.append(f"VM prompt detected: '{vm_phrase}'")
            return "voicemail_FAIL_no_msg", issues
        else:
            return "voicemail_silent_no_msg", []

    # Not a voicemail — real conversation
    if hot_signal and not decline_signal:
        return "ENGAGED_hot", []
    if decline_signal:
        return "polite_decline", []
    if dur < 10:
        return "no_pickup_or_quick_hangup", []
    if dur < 25:
        return "brief_intro_only", []
    return "engaged_neutral", []


def main():
    print(f"Pulling conversations from agent {AGENT_ID}...")
    listing = get_json(f"https://api.elevenlabs.io/v1/convai/conversations?agent_id={AGENT_ID}&page_size=100")
    convs = listing.get("conversations", [])
    now = int(time.time())

    # Filter to today's batch (last 90 minutes)
    today = [c for c in convs if (now - c.get("start_time_unix_secs", 0)) // 60 <= 90]
    print(f"Found {len(today)} convs from today's batch (last 90 min). Pulling details…")

    results = []
    cat_count = defaultdict(int)
    vm_failures = []
    hot_leads = []

    for i, c in enumerate(today):
        cid = c.get("conversation_id")
        try:
            detail = get_json(f"https://api.elevenlabs.io/v1/convai/conversations/{cid}")
        except Exception as e:
            print(f"  ✗ {cid}: {e}")
            continue

        category, issues = categorize(detail)
        cat_count[category] += 1

        md = detail.get("metadata", {}) or {}
        pc = md.get("phone_call", {}) or {}
        rec = {
            "cid": cid,
            "phone": pc.get("external_number"),
            "from": pc.get("agent_number"),
            "duration_s": md.get("call_duration_secs", 0),
            "termination": md.get("termination_reason"),
            "category": category,
            "issues": issues,
            "summary": ((detail.get("analysis") or {}).get("transcript_summary") or "")[:200],
        }
        results.append(rec)

        if category == "voicemail_FAIL_no_msg":
            vm_failures.append(rec)
        if category == "ENGAGED_hot":
            hot_leads.append(rec)

        # Light progress
        if (i + 1) % 10 == 0:
            print(f"  processed {i+1}/{len(today)}…")

    # Save
    out = {
        "generated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "total_calls": len(results),
        "categories": dict(cat_count),
        "voicemail_failures": vm_failures,
        "hot_leads": hot_leads,
        "all_calls": results,
    }
    out_path = "/tmp/batch_postmortem.json"
    with open(out_path, "w") as f:
        json.dump(out, f, indent=2, ensure_ascii=False)
    print(f"\n✅ wrote {out_path}")

    # Human-readable summary
    print("\n" + "=" * 60)
    print("CATEGORIES (out of", len(results), ")")
    print("=" * 60)
    for cat, n in sorted(cat_count.items(), key=lambda kv: -kv[1]):
        print(f"  {n:3} {cat}")

    print(f"\n🔥 Hot leads: {len(hot_leads)}")
    for h in hot_leads:
        print(f"  {h['phone']:18} {h['duration_s']:>3}s  {h['summary'][:120]}")

    print(f"\n⚠️  Voicemail FAILURES (Sofia stayed too long): {len(vm_failures)}")
    for v in vm_failures[:20]:
        print(f"  {v['phone']:18} {v['duration_s']:>3}s  {v['issues']}")


if __name__ == "__main__":
    main()
