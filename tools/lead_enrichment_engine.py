#!/usr/bin/env python3
"""
Signal Outbound Enrichment Engine — hyper-personalized MX real estate lead enricher.

Input:  CSV of leads from Vibe Prospecting (390 rows, 11 cols).
Output: Enriched JSON + CSV with email + phone + WhatsApp + website pains + signal score + personalized Spanish opener.

Pipeline per lead:
  0. ICP title filter (free, instant)
  1. Firecrawl homepage → industry check + pains + phone + WhatsApp + city
  2. ICP industry filter (real estate yes/no)
  3. Hunter email lookup
  4. PageSpeed Core Web Vitals check
  5. Gemini 2.5-flash → Spanish personalized opener
  6. Signal scoring (0-100)

Usage:
  python3 tools/lead_enrichment_engine.py --input leads/raw.csv --output leads/enriched.csv --limit 3 --test
"""
import os, sys, json, csv, time, re, argparse, base64, traceback
from concurrent.futures import ThreadPoolExecutor, as_completed
from urllib.parse import urlparse, quote_plus
import urllib.request, urllib.error

# Import JegoClay modules (v2 pain detector + tech stack)
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "jegoclay"))
try:
    from tech_stack_detector import detect_all_pains as _v2_detect_all_pains, detect_tech_stack as _v2_detect_tech_stack
    HAS_V2_DETECTOR = True
except ImportError:
    HAS_V2_DETECTOR = False

# ---------- Config ----------
HUNTER_KEY    = os.environ.get("HUNTER_API_KEY", "")
FIRECRAWL_KEY = os.environ.get("FIRECRAWL_API_KEY", "")
DATAFORSEO_B64 = base64.b64encode(
    f"{os.environ.get('DATAFORSEO_LOGIN','')}:{os.environ.get('DATAFORSEO_PASS','')}".encode()
).decode()
PSI_KEY       = os.environ.get("PSI_API_KEY", "")
GEMINI_KEY    = os.environ.get("GEMINI_API_KEY", "")

# ---------- Title filter ----------
DM_KEYWORDS = [
    "owner", "founder", "ceo", "chief executive", "director general", "director",
    "dueño", "socio fundador", "socio", "fundador", "managing partner",
    "broker", "principal", "presidente", "general manager", "gerente general",
    "marketing director", "director de marketing", "cmo", "director comercial",
    "director de ventas", "sales director", "vp", "vice president", "cco",
    "director de operaciones", "coo",
]
NON_DM_BLACKLIST = [
    "chro", "cfo", "cto", "cio", "accounting", "legal counsel", "general counsel",
    "recursos humanos", "rrhh", "administrador", "finance", "contabilidad",
    "it manager", "systems", "ingeniero", "engineer", "auditor", "analista",
    "becario", "intern", "practicante", "asistente", "assistant",
    "chief of staff", "chief financial", "chief human resources", "chief technology",
    "chief information", "chief legal", "chief compliance",
]
# Industry: real estate keywords (Spanish + English)
RE_INDUSTRY_YES = [
    "real estate", "bienes raíces", "bienes raices", "inmobiliaria",
    "inmobiliario", "inmobiliarios", "propiedades", "propiedad", "realty", "realtor",
    "desarrollo inmobiliario", "desarrollador", "desarrolladora", "developer",
    "vivienda", "viviendas", "casas", "villas", "departamentos", "apartments",
    "condominios", "condos", "broker", "brokerage", "corretaje",
    "plusvalía", "compra venta", "renta", "alquiler",
    "fibra", "fideicomiso inmobiliario", "real estate investment trust", "reit",
    "centros comerciales", "shopping center", "shopping mall", "centros comerciales",
    "oficinas corporativas", "office building", "commercial property",
    "residencial", "residenciales", "urbanización", "urbanizacion", "urbanismo",
    "constructora", "construcción", "construction",
    "hoteles", "hotel", "hospitality", "hospedaje", "turismo", "resort",
    "mall", "plaza comercial", "centro comercial",
    "listings", "listado de propiedades", "venta de casas", "venta de departamentos",
    "arrendamiento", "leasing",
]
RE_INDUSTRY_NO = [
    "shelter services", "manufactura", "manufacturing", "maquila", "automotive",
    "tax advisory", "cpa firm", "accountant", "consultoría fiscal",
    "dentist", "dental clinic", "medical clinic", "hospital group",
    "restaurant", "airline", "pharmacy chain",
    "software development", "ecommerce platform", "retailer",
]

def title_looks_dm(title: str) -> bool:
    """Word-boundary match to avoid false-positives like 'cto' matching 'direCTOr'."""
    t = " " + (title or "").lower() + " "
    # Normalize punctuation to spaces so multi-word titles split cleanly
    t = re.sub(r"[/,\-()\[\]\.]", " ", t)
    t = re.sub(r"\s+", " ", t)
    # Blacklist check — word-bounded
    for b in NON_DM_BLACKLIST:
        if f" {b} " in t:
            return False
    # Keyword check — word-bounded
    for k in DM_KEYWORDS:
        if f" {k} " in t:
            return True
    return False

def text_looks_real_estate(text: str) -> tuple[bool, str]:
    t = (text or "").lower()
    if any(n in t for n in RE_INDUSTRY_NO):
        for n in RE_INDUSTRY_NO:
            if n in t: return False, f"industry_reject:{n}"
    score = sum(1 for y in RE_INDUSTRY_YES if y in t)
    if score >= 2:
        return True, f"re_match_score:{score}"
    if score == 1:
        return True, "re_weak_match"
    return False, "no_re_signal"

# ---------- HTTP helpers ----------
def http_json(url, method="GET", headers=None, body=None, timeout=20):
    headers = headers or {}
    data = json.dumps(body).encode() if body is not None else None
    if body is not None:
        headers.setdefault("Content-Type", "application/json")
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.status, json.loads(r.read())
    except urllib.error.HTTPError as e:
        try:    return e.code, json.loads(e.read())
        except: return e.code, {"error": "non-json"}
    except Exception as e:
        return 0, {"error": str(e)[:200]}

# ---------- Firecrawl ----------
def firecrawl_scrape(url):
    if not url: return None
    if not url.startswith("http"): url = "https://" + url
    status, data = http_json(
        "https://api.firecrawl.dev/v1/scrape",
        method="POST",
        headers={"Authorization": f"Bearer {FIRECRAWL_KEY}"},
        body={"url": url, "formats": ["markdown"], "onlyMainContent": False, "timeout": 25000},
        timeout=30,
    )
    if status != 200 or not data.get("success"):
        return {"ok": False, "error": data.get("error") or f"status {status}"}
    md = data.get("data", {}).get("markdown", "") or ""
    meta = data.get("data", {}).get("metadata", {}) or {}
    return {"ok": True, "markdown": md, "metadata": meta, "title": meta.get("title","")}

# ---------- Extractors on Firecrawl markdown ----------
RE_PHONE_MX = re.compile(
    r"(?:\+52[\s\-\.]*)?\(?\d{2,3}\)?[\s\-\.]*\d{3,4}[\s\-\.]*\d{4}"
)
RE_WHATSAPP = re.compile(r"(?:wa\.me|api\.whatsapp\.com)/[\+\d]+")

def extract_phones(text):
    if not text: return []
    matches = RE_PHONE_MX.findall(text)
    # normalize: keep digits only, require 10+ digits (MX phones)
    clean = []
    for m in matches:
        digits = re.sub(r"\D", "", m)
        if 10 <= len(digits) <= 13:
            # format +52 XX XXXX XXXX
            if digits.startswith("52") and len(digits) == 12:
                p = f"+{digits[:2]} {digits[2:4]} {digits[4:8]} {digits[8:]}"
            elif len(digits) == 10:
                p = f"+52 {digits[:3]} {digits[3:6]} {digits[6:]}"
            else:
                p = f"+{digits}"
            if p not in clean: clean.append(p)
    return clean[:3]

def extract_whatsapp(text):
    if not text: return None
    m = RE_WHATSAPP.search(text)
    if not m: return None
    # extract number from wa.me/ or api.whatsapp.com/send?phone=
    url = m.group(0)
    digits = re.sub(r"\D", "", url.split("/")[-1])
    if 10 <= len(digits) <= 13: return "+" + digits if not digits.startswith("+") else digits
    return None

def detect_pains(firecrawl_result, psi_result):
    pains = []
    md = (firecrawl_result or {}).get("markdown", "") or ""
    md_lower = md.lower()
    # Pain: no WhatsApp button
    if "wa.me" not in md_lower and "whatsapp" not in md_lower:
        pains.append({"type":"no_whatsapp_button","severity":"high",
                      "note":"Contact page has no WhatsApp direct link — lead response time is probably slow"})
    # Pain: no contact form
    if not any(x in md_lower for x in ["formulario","contact form","<form","input type=email"]):
        # markdown hides html, so this is weak signal; downgrade to low
        pains.append({"type":"maybe_no_contact_form","severity":"low",
                      "note":"No obvious contact form detected in homepage markdown"})
    # Pain: slow site
    if psi_result:
        mob = psi_result.get("mobile_score")
        if mob is not None and mob < 70:
            pains.append({"type":"slow_site","severity":"high",
                          "note":f"Mobile PageSpeed score {mob}/100 — 78% of MX mobile visits abandon slow sites"})
        lcp = psi_result.get("mobile_lcp_sec")
        if lcp and lcp > 3.0:
            pains.append({"type":"slow_lcp","severity":"high",
                          "note":f"LCP {lcp:.1f}s — Google threshold is 2.5s"})
    # Pain: no AI chat / live chat
    if not any(x in md_lower for x in ["chat con","asistente virtual","ai assistant","live chat","intercom","drift","zendesk chat"]):
        pains.append({"type":"no_ai_chat","severity":"medium",
                      "note":"No AI/live chat detected — 24/7 lead capture gap"})
    # Pain: no Google Maps embed (means no map on site; weak)
    if "google.com/maps" not in md_lower and "maps.google" not in md_lower:
        pains.append({"type":"maybe_no_map_embed","severity":"low",
                      "note":"No Google Maps embed on homepage — local SEO weaker"})
    return pains

# ---------- Hunter (URL-encoded, threshold 25, with fallback) ----------
def hunter_email(domain, first_name, last_name):
    """Hunter email-finder — URL-encodes Spanish accents, lowered threshold 40 → 25."""
    if not domain or not HUNTER_KEY: return None
    fn = quote_plus(first_name or "")
    ln = quote_plus(last_name or "")
    dn = quote_plus(domain)
    url = f"https://api.hunter.io/v2/email-finder?domain={dn}&first_name={fn}&last_name={ln}&api_key={HUNTER_KEY}"
    status, data = http_json(url, timeout=15)
    if status != 200: return None
    d = data.get("data", {})
    email = d.get("email")
    if email and d.get("score", 0) >= 25:  # lowered from 40 to 25
        return {"email": email, "score": d.get("score"), "sources_count": len(d.get("sources", [])), "method": "hunter_finder"}
    return None

def hunter_domain_search(domain, max_results=5):
    """Fallback: pull any email on this domain via domain-search (not tied to specific person)."""
    if not domain or not HUNTER_KEY: return []
    dn = quote_plus(domain)
    url = f"https://api.hunter.io/v2/domain-search?domain={dn}&limit={max_results}&api_key={HUNTER_KEY}"
    status, data = http_json(url, timeout=15)
    if status != 200: return []
    d = data.get("data", {})
    emails = d.get("emails", []) or []
    return [{"email": e.get("value"), "confidence": e.get("confidence"), "first_name": e.get("first_name"), "last_name": e.get("last_name")}
            for e in emails if e.get("value")]

def email_finder_waterfall(domain, first_name, last_name):
    """
    3-tier waterfall:
      1. Hunter email-finder (person-specific)
      2. Hunter domain-search (find similar pattern email at same domain)
      3. Pattern generation (firstname@domain, firstname.lastname@domain)
    Returns first successful hit.
    """
    # Tier 1
    r = hunter_email(domain, first_name, last_name)
    if r: return r

    # Tier 2 — find anyone at this domain, detect pattern, apply to our person
    company_emails = hunter_domain_search(domain, max_results=5)
    if company_emails:
        # Try to find an email with matching first_name or pattern
        fn_lower = (first_name or "").lower()
        for ce in company_emails:
            ce_email = (ce.get("email") or "").lower()
            if fn_lower and fn_lower in ce_email.split("@")[0]:
                return {"email": ce["email"], "score": ce.get("confidence", 50),
                        "method": "hunter_domain_match", "sources_count": 0}
        # Tier 3 — detect pattern from the first domain-search result
        sample = company_emails[0]
        sample_email = sample.get("email","")
        s_first = (sample.get("first_name") or "").lower()
        s_last  = (sample.get("last_name") or "").lower()
        our_first = (first_name or "").lower().split()[0] if first_name else ""
        our_last  = (last_name or "").lower().split()[0] if last_name else ""
        if sample_email and s_first and our_first:
            local = sample_email.split("@")[0]
            if local == s_first:
                pattern_email = f"{our_first}@{domain}"
                return {"email": pattern_email, "score": 40, "method": "pattern_first", "sources_count": 0}
            if local == f"{s_first}.{s_last}" and our_last:
                pattern_email = f"{our_first}.{our_last}@{domain}"
                return {"email": pattern_email, "score": 40, "method": "pattern_first_dot_last", "sources_count": 0}
            if local == f"{s_first[0]}{s_last}" and our_last:
                pattern_email = f"{our_first[0]}{our_last}@{domain}"
                return {"email": pattern_email, "score": 35, "method": "pattern_flast", "sources_count": 0}
    return None

# ---------- PageSpeed ----------
def pagespeed_check(url):
    if not url: return None
    if not url.startswith("http"): url = "https://" + url
    api = f"https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url={url}&strategy=mobile&key={PSI_KEY}"
    status, data = http_json(api, timeout=45)
    if status != 200: return None
    try:
        lh = data["lighthouseResult"]
        cats = lh.get("categories", {})
        perf = cats.get("performance", {}).get("score", 0)
        audits = lh.get("audits", {})
        lcp = audits.get("largest-contentful-paint", {}).get("numericValue", 0) / 1000
        return {"mobile_score": int(perf * 100), "mobile_lcp_sec": lcp}
    except Exception:
        return None

# ---------- Gemini 2.5 Flash (personalized opener) ----------
def generate_spanish_opener(lead, pains, firecrawl_data):
    if not GEMINI_KEY: return None
    top_pain = None
    for p in pains:
        if p.get("severity") == "high":
            top_pain = p
            break
    if not top_pain and pains:
        top_pain = pains[0]

    company = lead.get("prospect_company_name","su empresa")
    first = lead.get("prospect_first_name","")
    website = lead.get("prospect_company_website","")

    pain_text = ""
    if top_pain:
        pain_text = f"Pain to reference: {top_pain.get('type')} — {top_pain.get('note')}"
    else:
        pain_text = "No specific pain detected — reference general MX real estate competitiveness."

    prompt = f"""Eres Alex Jego, fundador de JegoDigital (agencia de marketing para inmobiliarias en México).
Escribe SOLO el primer párrafo de un correo en frío EN ESPAÑOL MEXICANO (2-3 oraciones máximo, tono de par-a-par, no vendedor agresivo) a un tomador de decisiones.

Lead:
- Nombre: {first}
- Empresa: {company}
- Sitio web: {website}
- {pain_text}

Reglas:
- Empezar con "Hola {first}" + un dato específico de su sitio (el pain mencionado arriba).
- Máximo 2-3 oraciones, muy conciso.
- NO mencionar precio, servicios genéricos, o "somos una agencia".
- NO mencionar el nombre "JegoDigital" en esta parte (el firmado va al final).
- Sonar humano, calmo, útil — no comercial.
- Mencionar UN resultado específico de un cliente real (Flamingo Real Estate Cancún — ranking #1 Google Maps en 67 días) de forma casual.
- Terminar con UNA pregunta suave ofreciendo un análisis gratuito.

Salida: solo el párrafo, sin saludo inicial extra, sin firma, sin asunto."""

    body = {
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {"temperature": 0.7, "maxOutputTokens": 1024, "topP": 0.95},
        # Disable overly-strict safety (Spanish business content was hitting false-positives)
        "safetySettings": [
            {"category": "HARM_CATEGORY_HARASSMENT",        "threshold": "BLOCK_ONLY_HIGH"},
            {"category": "HARM_CATEGORY_HATE_SPEECH",       "threshold": "BLOCK_ONLY_HIGH"},
            {"category": "HARM_CATEGORY_SEXUALLY_EXPLICIT", "threshold": "BLOCK_ONLY_HIGH"},
            {"category": "HARM_CATEGORY_DANGEROUS_CONTENT", "threshold": "BLOCK_ONLY_HIGH"},
        ],
    }
    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={GEMINI_KEY}"
    status, data = http_json(url, method="POST", body=body, timeout=45)
    if status != 200:
        return None
    try:
        candidates = data.get("candidates", [])
        if not candidates:
            return None
        cand = candidates[0]
        # Concatenate ALL parts — Gemini can split output across multiple part entries
        parts = cand.get("content", {}).get("parts", []) or []
        text_pieces = [p.get("text", "") for p in parts if isinstance(p, dict) and p.get("text")]
        full_text = "".join(text_pieces).strip()
        if full_text:
            return full_text
        # Fallback: surface the reason so we can debug
        fr = cand.get("finishReason") or "(no_parts)"
        return f"__GEMINI_ERROR__:{fr}"
    except Exception as e:
        return f"__GEMINI_ERROR__:{str(e)[:80]}"

# ---------- Signal scoring ----------
def compute_signal_score(enriched):
    score = 0
    if enriched.get("icp_pass"): score += 20
    if enriched.get("email"): score += 15
    if enriched.get("phone"): score += 10
    if enriched.get("whatsapp"): score += 5
    for p in enriched.get("pains", []):
        if p.get("severity") == "high": score += 15
        elif p.get("severity") == "medium": score += 7
    return min(score, 100)

# ---------- Main enrichment ----------
def enrich_lead(lead):
    """lead: dict with at least prospect_full_name, prospect_job_title, prospect_company_name, prospect_company_website"""
    full = lead.get("prospect_full_name","").strip()
    parts = full.split()
    first = parts[0] if parts else ""
    last = " ".join(parts[1:]) if len(parts) > 1 else ""
    title = lead.get("prospect_job_title","")
    company = lead.get("prospect_company_name","")
    website = (lead.get("prospect_company_website","") or "").strip().lower()

    out = {
        **lead,
        "prospect_first_name": first,
        "prospect_last_name": last,
        "icp_pass": False,
        "icp_reject_reason": None,
        "email": None, "email_confidence": None,
        "phone": None, "whatsapp": None,
        "pains": [],
        "pagespeed_mobile": None,
        "personalized_opener": None,
        "signal_score": 0,
        "enriched_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }

    # Step 0 — title filter
    if not title_looks_dm(title):
        out["icp_reject_reason"] = f"title_not_decision_maker:{title[:40]}"
        return out

    # Step 1 — Firecrawl homepage (parallel-safe)
    fc = firecrawl_scrape(website)
    if not fc or not fc.get("ok"):
        out["icp_reject_reason"] = f"firecrawl_failed:{fc.get('error','?') if fc else 'no_url'}"
        return out

    # Step 2 — industry check
    combined_text = (fc.get("title","") + " " + fc.get("markdown","")[:5000])
    is_re, re_reason = text_looks_real_estate(combined_text)
    if not is_re:
        out["icp_reject_reason"] = f"industry_not_real_estate:{re_reason}"
        return out

    out["icp_pass"] = True
    out["industry_signal"] = re_reason

    # Step 3 — extract data from Firecrawl
    md_full = fc.get("markdown","")
    phones = extract_phones(md_full)
    whatsapp = extract_whatsapp(md_full)
    out["phone"] = phones[0] if phones else None
    out["whatsapp"] = whatsapp

    # Step 4 — Email waterfall (Hunter finder → domain search → pattern generation)
    if first and website:
        domain = urlparse("https://" + website if not website.startswith("http") else website).netloc
        domain = domain.replace("www.","")
        he = email_finder_waterfall(domain, first, last)
        if he:
            out["email"] = he["email"]
            out["email_confidence"] = he["score"]
            out["email_method"] = he.get("method", "unknown")

    # Step 5 — PageSpeed
    psi = pagespeed_check(website)
    if psi:
        out["pagespeed_mobile"] = psi["mobile_score"]
        out["pagespeed_lcp_sec"] = psi.get("mobile_lcp_sec")

    # Step 6 — pain detection (v2 if available, fallback to v1)
    if HAS_V2_DETECTOR:
        out["pains"] = _v2_detect_all_pains(fc, psi)
        out["tech_stack"] = _v2_detect_tech_stack(fc)
    else:
        out["pains"] = detect_pains(fc, psi)

    # Step 7 — Gemini personalized opener
    opener = generate_spanish_opener(out, out["pains"], fc)
    if opener: out["personalized_opener"] = opener

    # Step 8 — score
    out["signal_score"] = compute_signal_score(out)
    return out

# ---------- Batch runner ----------
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--input",  required=True)
    ap.add_argument("--output", required=True)
    ap.add_argument("--offset", type=int, default=0)
    ap.add_argument("--limit",  type=int, default=None)
    ap.add_argument("--workers", type=int, default=8)
    ap.add_argument("--test", action="store_true", help="Print pretty output for first N leads")
    args = ap.parse_args()

    with open(args.input, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        leads = list(reader)
    if args.offset: leads = leads[args.offset:]
    if args.limit:  leads = leads[:args.limit]
    print(f"Loaded {len(leads)} leads from {args.input} (offset={args.offset}, limit={args.limit})")

    enriched = []
    start = time.time()
    with ThreadPoolExecutor(max_workers=args.workers) as ex:
        futures = {ex.submit(enrich_lead, L): i for i, L in enumerate(leads)}
        for fut in as_completed(futures):
            i = futures[fut]
            try:
                result = fut.result()
                enriched.append(result)
                tag = "✅" if result["icp_pass"] else "❌"
                print(f"  [{len(enriched):3d}/{len(leads)}] {tag} {result['prospect_full_name'][:30]:30s} | "
                      f"{result.get('prospect_company_name','')[:25]:25s} | "
                      f"{'email=Y' if result.get('email') else 'email=N'} | "
                      f"{'ph=Y' if result.get('phone') else 'ph=N'} | "
                      f"{'wa=Y' if result.get('whatsapp') else 'wa=N'} | "
                      f"score={result.get('signal_score',0):3d} | "
                      f"{result.get('icp_reject_reason') or ''}")
            except Exception as e:
                print(f"  [ERR] lead {i}: {e}")

    elapsed = time.time() - start
    print(f"\nEnriched {len(enriched)} leads in {elapsed:.1f}s ({elapsed/max(len(enriched),1):.1f}s/lead)")

    with open(args.output, "w", encoding="utf-8") as f:
        json.dump(enriched, f, indent=2, ensure_ascii=False)
    print(f"\nWrote {args.output}")

    if args.test:
        print("\n" + "="*80)
        print("PREVIEW OF ENRICHED LEADS")
        print("="*80)
        for e in enriched[:3]:
            print(f"\n--- {e['prospect_full_name']} @ {e.get('prospect_company_name','')} ---")
            print(f"Title: {e.get('prospect_job_title','')}")
            print(f"Website: {e.get('prospect_company_website','')}")
            print(f"ICP pass: {e['icp_pass']}  reason: {e.get('icp_reject_reason') or e.get('industry_signal') or ''}")
            print(f"Email: {e.get('email')}  (confidence: {e.get('email_confidence')})")
            print(f"Phone: {e.get('phone')}")
            print(f"WhatsApp: {e.get('whatsapp')}")
            print(f"PageSpeed mobile: {e.get('pagespeed_mobile')}")
            print(f"Signal score: {e.get('signal_score')}/100")
            print(f"Pains ({len(e.get('pains',[]))}):")
            for p in e.get("pains",[])[:4]:
                print(f"  - [{p.get('severity','?')}] {p.get('type','?')}: {p.get('note','?')}")
            print(f"\nPersonalized opener:\n  {e.get('personalized_opener') or '(none generated)'}")

if __name__ == "__main__":
    main()
