#!/usr/bin/env python3
"""
Push enriched JegoClay leads to Instantly.ai via API V2.

Does:
  1. Read v2 enriched JSON
  2. Segment by phone prefix (+52 → MX Spanish, +1 or USA → Miami English, unknown → MX default)
  3. Filter: only leads with email (can't cold email without email)
  4. Create 2 Instantly campaigns in DRAFT (status=0) with per-lead custom vars
  5. Upload each lead to correct campaign with custom variables
  6. Print summary

Safe: both campaigns start PAUSED (status=0). Nothing sends until Alex approves in Instantly UI.
"""
import os, json, sys, time, glob, subprocess, tempfile

INSTANTLY_API = "https://api.instantly.ai/api/v2"
KEY = os.environ.get("INSTANTLY_API_KEY", "")
if not KEY:
    print("ERROR: INSTANTLY_API_KEY not set"); sys.exit(1)

def http(method, path, body=None, timeout=30):
    """
    Use subprocess curl instead of urllib — Cloudflare blocks Python urllib
    even with UA overrides (confirmed DISASTER_LOG 2026-04-22).
    """
    url = INSTANTLY_API + path
    cmd = [
        "curl", "-sS", "-X", method.upper(), url,
        "-H", f"Authorization: Bearer {KEY}",
        "-H", "Content-Type: application/json",
        "-H", "Accept: application/json",
        "-H", "User-Agent: curl/8.4.0",
        "-w", "\n__STATUS__%{http_code}",
        "--max-time", str(timeout),
    ]
    if body is not None:
        with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False) as f:
            json.dump(body, f)
            payload_file = f.name
        cmd.extend(["--data-binary", f"@{payload_file}"])
    try:
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout+5)
        out = r.stdout
        # Split out the status code
        parts = out.rsplit("\n__STATUS__", 1)
        raw_body = parts[0]
        status = int(parts[1]) if len(parts) == 2 else 0
        try:
            return status, json.loads(raw_body) if raw_body.strip() else {}
        except json.JSONDecodeError:
            return status, {"error": "non-json", "raw": raw_body[:300]}
    except subprocess.TimeoutExpired:
        return 0, {"error": "timeout"}
    except Exception as e:
        return 0, {"error": str(e)[:200]}
    finally:
        if body is not None:
            try: os.unlink(payload_file)
            except: pass

# ---------- Load enriched leads ----------
enriched_files = sorted(glob.glob("leads/enriched/v2/*.json"), reverse=True)
if not enriched_files:
    enriched_files = sorted(glob.glob("leads/enriched/**/*.json"), recursive=True)
if not enriched_files:
    print("ERROR: No enriched JSON found"); sys.exit(1)

src = enriched_files[0]
print(f"Loading: {src}")
all_leads = json.load(open(src))
print(f"Total enriched: {len(all_leads)}")

# ---------- Filter + segment ----------
passed = [e for e in all_leads if e.get("icp_pass")]
with_email = [e for e in passed if e.get("email")]
print(f"ICP passed: {len(passed)} | With email: {len(with_email)}")

def classify_geo(lead):
    phone = (lead.get("phone") or "").strip()
    if phone.startswith("+52"): return "mx"
    if phone.startswith("+1"):  return "us"
    # No phone — default to MX (larger segment + safer Spanish default)
    return "mx"

mx_leads = [e for e in with_email if classify_geo(e) == "mx"]
us_leads = [e for e in with_email if classify_geo(e) == "us"]
print(f"Segmented: MX={len(mx_leads)} | US={len(us_leads)}")

if not mx_leads and not us_leads:
    print("ERROR: No leads to upload (no emails found)"); sys.exit(1)

# ---------- Build campaign templates ----------
DATESTAMP = time.strftime("%Y%m%d")

MX_BODY = """{{personalized_opener}}

Ayudamos a Flamingo Real Estate en Cancún a pasar a #1 en Google Maps en 67 días, con +320% de tráfico orgánico y 88% de leads automatizados.

¿Te mando un análisis gratuito de {{companyName}} esta semana? Es rápido — puede mostrar oportunidades específicas que quizás aún no has notado.

Un saludo,
Alex Jego
JegoDigital"""

US_BODY = """{{personalized_opener}}

At JegoDigital, we helped Flamingo Real Estate in Cancún rank #1 on Google Maps in 67 days, driving +320% organic traffic and automating 88% of lead qualification.

Worth a quick free audit of {{companyName}} this week? Takes 45 minutes and shows specific, actionable wins you probably haven't spotted yet.

Best,
Alex Jego
JegoDigital"""

MX_SUBJECT = "{{firstName}}, algo noté de {{companyName}}"
US_SUBJECT = "{{firstName}}, quick note on {{companyName}}"

# ---------- Create 2 campaigns (DRAFT / status=0) ----------
def make_campaign(name, subject, body, daily_limit=30):
    """
    Creates an Instantly campaign in PAUSED state (status=0).
    Uses 1-step sequence; Alex can add follow-up steps via AI Copilot after preview.
    """
    payload = {
        "name": name,
        "campaign_schedule": {
            "schedules": [{
                "name": "Default",
                "timing": {"from": "09:00", "to": "18:00"},
                "days": {"1":True,"2":True,"3":True,"4":True,"5":True,"0":False,"6":False},
                "timezone": "America/Chicago",
            }]
        },
        "sequences": [{
            "steps": [{
                "type": "email",
                "delay": 0,
                "variants": [{
                    "subject": subject,
                    "body":    body,
                }],
            }]
        }],
        "daily_limit": daily_limit,
    }
    status, data = http("POST", "/campaigns", body=payload)
    if status not in (200, 201):
        print(f"FAIL create campaign '{name}': HTTP {status}: {data}")
        return None
    cid = data.get("id") or data.get("campaign_id") or (data.get("data", {}) or {}).get("id")
    print(f"  Created campaign '{name}' → id={cid}")
    return cid

print("\n=== CREATING CAMPAIGNS ===")
mx_campaign_id = make_campaign(f"signal_outbound_mx_{DATESTAMP}", MX_SUBJECT, MX_BODY, 30) if mx_leads else None
us_campaign_id = make_campaign(f"signal_outbound_miami_{DATESTAMP}", US_SUBJECT, US_BODY, 30) if us_leads else None

# ---------- Upload leads ----------
def upload_lead(lead, campaign_id):
    # Strip gemini error openers
    opener = lead.get("personalized_opener") or ""
    if opener.startswith("__GEMINI_ERROR__"):
        opener = f"Hola {lead.get('prospect_first_name','')}, estuve viendo el sitio de {lead.get('prospect_company_name','su empresa')} y me pareció que hay oportunidades específicas que vale la pena revisar rápido."

    # Top 3 pains compact
    pains = lead.get("pains") or []
    top_pain = (pains[0].get("type") if pains else "general")
    top_pain_detail = (pains[0].get("note") if pains else "")

    payload = {
        "campaign": campaign_id,
        "email": lead.get("email"),
        "first_name":  lead.get("prospect_first_name") or "",
        "last_name":   lead.get("prospect_last_name") or "",
        "company_name": lead.get("prospect_company_name") or "",
        "website":     lead.get("prospect_company_website") or "",
        "phone":       lead.get("phone") or "",
        "personalization": opener,  # some Instantly schemas use `personalization`
        "custom_variables": {
            "personalized_opener": opener,
            "top_pain": top_pain,
            "pain_detail": top_pain_detail,
            "signal_score": str(lead.get("signal_score") or 0),
            "whatsapp":    lead.get("whatsapp") or "",
            "linkedin":    lead.get("prospect_linkedin") or "",
        },
    }
    status, data = http("POST", "/leads", body=payload)
    return status, data

def upload_batch(leads, campaign_id, label):
    if not campaign_id:
        print(f"  [skip {label}] no campaign_id")
        return 0, 0
    ok = 0; err = 0; errors_sample = []
    print(f"\n=== UPLOADING {label} ({len(leads)} leads) ===")
    for i, lead in enumerate(leads, 1):
        status, data = upload_lead(lead, campaign_id)
        if status in (200, 201):
            ok += 1
        else:
            err += 1
            if len(errors_sample) < 3:
                errors_sample.append({"email": lead.get("email"), "status": status, "data": str(data)[:200]})
        if i % 25 == 0:
            print(f"  [{i}/{len(leads)}]  ok={ok}  err={err}")
        time.sleep(0.15)  # ~6-7 leads/sec to respect rate limit
    print(f"  DONE {label}: ok={ok}  err={err}")
    if errors_sample:
        print(f"  First errors:")
        for e in errors_sample: print(f"    - {e}")
    return ok, err

mx_ok, mx_err = upload_batch(mx_leads, mx_campaign_id, "MX Spanish")
us_ok, us_err = upload_batch(us_leads, us_campaign_id, "Miami English")

# ---------- Final summary ----------
print("\n" + "="*60)
print("FINAL SUMMARY")
print("="*60)
print(f"  MX Spanish campaign   id={mx_campaign_id}  leads uploaded: {mx_ok}/{len(mx_leads)}")
print(f"  Miami English campaign id={us_campaign_id}  leads uploaded: {us_ok}/{len(us_leads)}")
print(f"\n⚠️  Both campaigns are in DRAFT/PAUSED (status=0). Nothing sends until Alex activates in UI.")
print(f"    Instantly UI: https://app.instantly.ai/app/campaigns")

# Save run summary
with open("/tmp/instantly_push_summary.json", "w") as f:
    json.dump({
        "source": src,
        "mx_campaign_id": mx_campaign_id, "mx_uploaded": mx_ok, "mx_total": len(mx_leads),
        "us_campaign_id": us_campaign_id, "us_uploaded": us_ok, "us_total": len(us_leads),
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }, f, indent=2)
print(f"\nSummary saved to /tmp/instantly_push_summary.json")
