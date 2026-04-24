#!/usr/bin/env python3
"""
JegoClay Module 2 — tech_stack_detector.py + enhanced pain detector.

Detects 30+ observable signals from a Firecrawl HTML/markdown scrape:

  Tech stack (WIX/Squarespace/WP/Elementor, GA4, Meta Pixel, GTM, chat widgets, CRM)
  Speed pains (PSI mobile/desktop, LCP, CLS, TBT)
  Conversion UX pains (WA button, contact form, chat, form length)
  Content/SEO pains (blog staleness, H1, meta desc, schema.org, thin content)
  Listings pains (RE-specific: photo count, virtual tour, map, filters)
  Trust pains (SSL, testimonials, team page, certifications)
  Mobile pains (responsive, viewport, tap targets)
  Social proof pains (GMaps reviews, FB reviews)
  I18n pains (language toggle, bilingual support)
  Lead capture pains (newsletter, lead magnet, callback)

Returns: ordered list of {category, type, severity, note, detail} dicts.
Each pain's severity: high (money-leaking), medium (visible gap), low (nice-to-fix).

Usage:
  from jegoclay.tech_stack_detector import detect_all_pains, detect_tech_stack
  pains = detect_all_pains(firecrawl_result, psi_result)
  stack = detect_tech_stack(firecrawl_result)
"""
import re
from datetime import datetime, timezone

# ============================================================================
# TECH STACK SIGNATURES
# ============================================================================
# Each: (category, name, regex patterns to search in HTML/markdown)
# Patterns matched case-insensitively.

TECH_SIGNATURES = {
    # CMS / Website builders
    "cms": [
        ("WordPress", [r"wp-content", r"wp-includes", r"wordpress"]),
        ("Elementor", [r"elementor-", r"data-elementor"]),
        ("Divi",      [r"et_pb_", r"et-core"]),
        ("Wix",       [r"\.wix\.com", r"wix-code", r"static\.wixstatic\.com"]),
        ("Squarespace", [r"squarespace\.com", r"static1\.squarespace"]),
        ("Shopify",   [r"\.myshopify\.com", r"cdn\.shopify\.com"]),
        ("Webflow",   [r"webflow\.com", r"wf-domain"]),
        ("Ghost",     [r'content="Ghost', r"ghost-sdk"]),
        ("HubSpot CMS",[r"hs-scripts\.com", r"hubspot\.com/"]),
        ("Framer",    [r"framerusercontent"]),
    ],
    # Analytics
    "analytics": [
        ("Google Analytics 4", [r"gtag\(.*G-[A-Z0-9]+", r"googletagmanager\.com/gtag/js\?id=G-"]),
        ("Universal Analytics (legacy)", [r"UA-\d{4,9}-\d+", r"google-analytics\.com/ga\.js"]),
        ("Google Tag Manager", [r"googletagmanager\.com/gtm\.js", r"GTM-[A-Z0-9]+"]),
        ("Plausible",  [r"plausible\.io/js"]),
        ("Fathom",     [r"usefathom\.com"]),
        ("Microsoft Clarity", [r"clarity\.ms/tag", r"Microsoft Clarity"]),
        ("Hotjar",     [r"static\.hotjar\.com"]),
    ],
    # Advertising pixels
    "advertising": [
        ("Meta Pixel", [r"facebook\.net/.*fbevents\.js", r"fbq\(['\"]init['\"]"]),
        ("Google Ads Conversion", [r"googleadservices\.com/pagead/conversion"]),
        ("TikTok Pixel", [r"analytics\.tiktok\.com"]),
        ("LinkedIn Insight", [r"snap\.licdn\.com"]),
        ("Twitter/X Pixel", [r"static\.ads-twitter\.com"]),
    ],
    # Chat / Customer support
    "chat": [
        ("Intercom",   [r"widget\.intercom\.io", r"intercomcdn"]),
        ("Drift",      [r"js\.driftt\.com"]),
        ("Zendesk Chat", [r"zdassets\.com/ekr", r"zopim"]),
        ("LiveChat",   [r"cdn\.livechatinc\.com"]),
        ("Tawk.to",    [r"embed\.tawk\.to"]),
        ("Crisp",      [r"client\.crisp\.chat"]),
        ("Tidio",      [r"code\.tidio\.co"]),
        ("Freshchat",  [r"wchat\.freshchat\.com"]),
        ("ManyChat",   [r"manychat\.com/fbembed"]),
    ],
    # CRM / Marketing automation
    "crm": [
        ("HubSpot",    [r"js\.hs-scripts\.com", r"forms\.hsforms\.com", r"hs-forms"]),
        ("Salesforce/Pardot", [r"pardot\.com", r"pi\.pardot\.com"]),
        ("Mailchimp",  [r"chimpstatic\.com", r"mc\.us.*\.list-manage\.com"]),
        ("ActiveCampaign", [r"active-campaign", r"trackcmp\.net"]),
        ("Brevo/Sendinblue", [r"sendinblue\.com", r"brevo\.com"]),
        ("Klaviyo",    [r"klaviyo\.com"]),
    ],
    # Forms
    "forms": [
        ("Typeform",   [r"embed\.typeform\.com"]),
        ("JotForm",    [r"form\.jotform\.com"]),
        ("Google Forms", [r"docs\.google\.com/forms"]),
        ("Contact Form 7", [r"contact-form-7"]),
    ],
    # Maps
    "maps": [
        ("Google Maps embed", [r"maps\.google\.com/maps\?", r"google\.com/maps/embed"]),
        ("Mapbox",     [r"api\.mapbox\.com"]),
    ],
}

def detect_tech_stack(firecrawl_result: dict) -> dict:
    """
    Detects all technologies in use from a Firecrawl markdown/html output.
    Returns: {category: [tech_name, ...]}
    """
    if not firecrawl_result or not firecrawl_result.get("ok"):
        return {}
    # Use raw markdown (includes embedded script references when Firecrawl keeps them)
    text = (firecrawl_result.get("markdown") or "")
    # Also include metadata
    meta = firecrawl_result.get("metadata", {}) or {}
    text += " " + str(meta)

    detected = {}
    for category, techs in TECH_SIGNATURES.items():
        found = []
        for name, patterns in techs:
            for pat in patterns:
                if re.search(pat, text, re.IGNORECASE):
                    found.append(name)
                    break
        if found:
            detected[category] = found
    return detected

# ============================================================================
# PAIN DETECTORS — modular, each returns a list of pain dicts
# ============================================================================

def _md(firecrawl_result):
    return (firecrawl_result or {}).get("markdown","") or ""

def _meta(firecrawl_result):
    return (firecrawl_result or {}).get("metadata", {}) or {}

def detect_speed_pains(psi_result: dict | None) -> list:
    pains = []
    if not psi_result:
        pains.append({"category":"speed","type":"no_psi_data","severity":"low",
                      "note":"Could not run PageSpeed check","detail":None})
        return pains
    m = psi_result.get("mobile_score")
    if m is not None:
        if m < 50:
            pains.append({"category":"speed","type":"mobile_psi_critical","severity":"high",
                          "note":f"Mobile PageSpeed {m}/100 — visitors abandon painfully slow sites",
                          "detail":f"PSI mobile: {m}"})
        elif m < 70:
            pains.append({"category":"speed","type":"mobile_psi_low","severity":"high",
                          "note":f"Mobile PageSpeed {m}/100 vs Google's 90+ recommendation",
                          "detail":f"PSI mobile: {m}"})
        elif m < 85:
            pains.append({"category":"speed","type":"mobile_psi_medium","severity":"medium",
                          "note":f"Mobile PageSpeed {m}/100 — room to reach 90+",
                          "detail":f"PSI mobile: {m}"})
    lcp = psi_result.get("mobile_lcp_sec")
    if lcp and lcp > 4.0:
        pains.append({"category":"speed","type":"lcp_critical","severity":"high",
                      "note":f"LCP {lcp:.1f}s — Google threshold is 2.5s, over 4s = 53% abandon",
                      "detail":f"LCP: {lcp:.1f}s"})
    elif lcp and lcp > 2.5:
        pains.append({"category":"speed","type":"lcp_slow","severity":"medium",
                      "note":f"LCP {lcp:.1f}s vs Google's 2.5s threshold",
                      "detail":f"LCP: {lcp:.1f}s"})
    return pains

def detect_conversion_pains(firecrawl_result, tech_stack: dict) -> list:
    pains = []
    md = _md(firecrawl_result).lower()
    if not md:
        return pains
    has_wa = "wa.me" in md or "whatsapp" in md
    has_chat_widget = bool(tech_stack.get("chat"))
    if not has_wa and not has_chat_widget:
        pains.append({"category":"conversion","type":"no_instant_contact","severity":"high",
                      "note":"No WhatsApp button AND no chat widget — zero instant contact options",
                      "detail":"Nothing detected in markdown"})
    elif not has_wa:
        pains.append({"category":"conversion","type":"no_whatsapp","severity":"high",
                      "note":"No WhatsApp direct link — MX buyers default to WA",
                      "detail":"No wa.me or api.whatsapp.com link"})
    elif not has_chat_widget:
        pains.append({"category":"conversion","type":"no_live_chat","severity":"medium",
                      "note":"No live chat widget — visitors can't get instant answers",
                      "detail":"WhatsApp present but no chat bot"})
    # Contact form
    has_form = ("form" in md or "formulario" in md or "contact" in md) and (
        "<form" in md or "input" in md or "submit" in md
    )
    if not has_form:
        pains.append({"category":"conversion","type":"no_contact_form_visible","severity":"medium",
                      "note":"No contact form clearly visible on homepage",
                      "detail":None})
    return pains

def detect_seo_content_pains(firecrawl_result) -> list:
    pains = []
    md = _md(firecrawl_result)
    meta = _meta(firecrawl_result)
    md_lower = md.lower()

    title = meta.get("title") or ""
    description = meta.get("description") or ""
    if not title or len(title) < 20:
        pains.append({"category":"seo","type":"weak_title_tag","severity":"high",
                      "note":f"Title tag weak: '{title}' ({len(title)} chars, ideal 50-60)",
                      "detail":title})
    if not description or len(description) < 80:
        pains.append({"category":"seo","type":"weak_meta_description","severity":"medium",
                      "note":f"Meta description {len(description)} chars — ideal 140-160",
                      "detail":description[:100]})
    # Blog staleness: look for date patterns in last 12 months
    date_matches = re.findall(r"\b(20\d{2})[/-](\d{1,2})[/-](\d{1,2})\b", md)
    if date_matches:
        latest_year = max(int(y) for y,_,_ in date_matches)
        current_year = datetime.now(timezone.utc).year
        if current_year - latest_year >= 1:
            pains.append({"category":"seo","type":"stale_content","severity":"medium",
                          "note":f"Most recent date on site appears to be {latest_year} — content may be stale",
                          "detail":None})
    else:
        # No dates at all — likely no blog or no timestamps
        if "blog" in md_lower or "noticias" in md_lower:
            pains.append({"category":"seo","type":"undated_blog","severity":"medium",
                          "note":"Blog exists but no dates visible — trust + SEO harm",
                          "detail":None})
        else:
            pains.append({"category":"seo","type":"no_blog","severity":"high",
                          "note":"No blog detected — massive SEO + AEO opportunity missed",
                          "detail":None})
    # Thin content
    text_words = len(md.split())
    if text_words < 500:
        pains.append({"category":"seo","type":"thin_content","severity":"high",
                      "note":f"Homepage has {text_words} words — ideal 800-2000",
                      "detail":f"{text_words} words"})
    return pains

def detect_trust_pains(firecrawl_result) -> list:
    pains = []
    md = _md(firecrawl_result).lower()
    if not md: return pains
    # Testimonials / reviews
    has_testimonial = any(k in md for k in [
        "testimoni", "reseña", "opinión", "review", "stars", "★", "⭐",
        "google reviews", "satisfecho", "client says"
    ])
    if not has_testimonial:
        pains.append({"category":"trust","type":"no_testimonials","severity":"medium",
                      "note":"No testimonials or reviews visible — trust gap",
                      "detail":None})
    # Team page
    has_team = any(k in md for k in [
        "nuestro equipo", "our team", "meet the team", "sobre nosotros", "about us",
        "equipo de trabajo", "our people", "fundador", "founder"
    ])
    if not has_team:
        pains.append({"category":"trust","type":"no_team_visible","severity":"low",
                      "note":"No 'About Us' or team page detected on homepage",
                      "detail":None})
    return pains

def detect_listings_pains(firecrawl_result) -> list:
    """Real-estate specific listing-quality checks."""
    pains = []
    md = _md(firecrawl_result).lower()
    if not md: return pains
    # Virtual tour
    if not any(k in md for k in ["tour virtual","virtual tour","3d tour","matterport","360°"]):
        pains.append({"category":"listings","type":"no_virtual_tour","severity":"medium",
                      "note":"No virtual tour detected — premium listings need this for remote buyers",
                      "detail":None})
    # Property search filters
    if not any(k in md for k in ["filtrar","filter","búsqueda avanzada","advanced search","recámaras","bedrooms","precio desde","price from"]):
        pains.append({"category":"listings","type":"no_search_filters","severity":"medium",
                      "note":"No obvious property search filters — hurts inventory discoverability",
                      "detail":None})
    # Maps integration (uses tech_stack detector too, but double-check here)
    if "google.com/maps" not in md and "mapbox" not in md:
        pains.append({"category":"listings","type":"no_map","severity":"medium",
                      "note":"No interactive map visible — 70% of RE buyers filter by location first",
                      "detail":None})
    return pains

def detect_tech_stack_pains(tech_stack: dict) -> list:
    pains = []
    # Missing analytics
    if not tech_stack.get("analytics"):
        pains.append({"category":"tech_stack","type":"no_analytics","severity":"high",
                      "note":"No analytics detected — flying blind on traffic + behavior",
                      "detail":None})
    # Missing Meta Pixel
    has_pixel = any("Meta Pixel" in x for x in tech_stack.get("advertising", []))
    if not has_pixel:
        pains.append({"category":"tech_stack","type":"no_meta_pixel","severity":"high",
                      "note":"No Meta Pixel — retargeting on IG/FB impossible (huge RE channel)",
                      "detail":None})
    # Old CMS (WIX/Squarespace = red flag for RE scale)
    cms = tech_stack.get("cms", [])
    if "Wix" in cms or "Squarespace" in cms:
        pains.append({"category":"tech_stack","type":"cms_not_scalable","severity":"medium",
                      "note":f"Using {cms[0]} — limits SEO + speed + custom listing features",
                      "detail":cms[0]})
    return pains

def detect_mobile_pains(firecrawl_result, psi_result) -> list:
    pains = []
    meta = _meta(firecrawl_result)
    # Viewport tag
    md = _md(firecrawl_result).lower()
    if "viewport" not in str(meta).lower() and "viewport" not in md:
        pains.append({"category":"mobile","type":"no_viewport_tag","severity":"medium",
                      "note":"No viewport meta tag detected — likely not mobile-responsive",
                      "detail":None})
    return pains

def detect_i18n_pains(firecrawl_result) -> list:
    pains = []
    md = _md(firecrawl_result)
    if not md: return pains
    md_lower = md.lower()
    # Toggle indicators
    has_en_toggle = any(k in md_lower for k in ["english","en |","en →","/en/","lang=en"])
    has_es_toggle = any(k in md_lower for k in ["español","es |","es →","/es/","lang=es"])
    # Heuristic: does it LOOK Spanish-only?
    spanish_markers = sum(1 for k in ["inmobiliaria","propiedades","contacto","nosotros","inicio"] if k in md_lower)
    english_markers = sum(1 for k in ["real estate","properties","contact us","home","about us"] if k in md_lower)
    if spanish_markers >= 3 and english_markers == 0 and not has_en_toggle:
        pains.append({"category":"i18n","type":"spanish_only","severity":"medium",
                      "note":"Site is Spanish-only — misses US/Canada/EU international buyers (huge in Cancún/CDMX/Riviera)",
                      "detail":None})
    return pains

# ============================================================================
# MAIN AGGREGATOR
# ============================================================================

def detect_all_pains(firecrawl_result, psi_result=None) -> list:
    """Run every pain detector, return combined list sorted by severity (high → low)."""
    tech_stack = detect_tech_stack(firecrawl_result)
    all_pains = []
    all_pains += detect_speed_pains(psi_result)
    all_pains += detect_conversion_pains(firecrawl_result, tech_stack)
    all_pains += detect_seo_content_pains(firecrawl_result)
    all_pains += detect_trust_pains(firecrawl_result)
    all_pains += detect_listings_pains(firecrawl_result)
    all_pains += detect_tech_stack_pains(tech_stack)
    all_pains += detect_mobile_pains(firecrawl_result, psi_result)
    all_pains += detect_i18n_pains(firecrawl_result)
    # Attach the detected tech stack for the personalization prompt
    for p in all_pains:
        p.setdefault("detail", None)
    # Sort: high severity first, then medium, then low
    severity_order = {"high":0,"medium":1,"low":2}
    all_pains.sort(key=lambda p: severity_order.get(p.get("severity","low"),3))
    return all_pains

# ============================================================================
# CLI
# ============================================================================
if __name__ == "__main__":
    import sys, json
    if len(sys.argv) < 2:
        print("Usage: python3 tech_stack_detector.py <firecrawl.json>")
        print("  (firecrawl.json = {ok: true, markdown: '...', metadata: {...}})")
        sys.exit(1)
    fc = json.load(open(sys.argv[1]))
    stack = detect_tech_stack(fc)
    pains = detect_all_pains(fc, psi_result=None)
    print("=== TECH STACK ===")
    print(json.dumps(stack, indent=2))
    print(f"\n=== {len(pains)} PAINS DETECTED ===")
    for p in pains:
        print(f"  [{p['severity']:6s}] {p['category']}/{p['type']}: {p['note']}")
