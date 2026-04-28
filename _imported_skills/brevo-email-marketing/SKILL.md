---
name: brevo-email-marketing
description: "JegoDigital's Brevo email marketing system for EXISTING leads and clients ONLY (NOT cold outreach — that's Instantly.ai). Use EVERY TIME for: nurture sequences, welcome emails, monthly newsletters, re-engagement campaigns, contact management, email analytics, Brevo API, lead segmentation, post-consultation follow-up, campaign performance. Triggers: Brevo, email nurture, newsletter, welcome sequence, re-engagement, email campaign, contact list, email analytics, subscriber, drip campaign, email template, send newsletter, email follow-up, Brevo API, add contact, email stats. DIFFERENT from instantly-cold-outreach (cold email) and manychat-jegodigital (WhatsApp)."
---

# Brevo Email Marketing & Lead Nurture for JegoDigital

**Service:** Email Marketing y Seguimiento (Service 9)
**Platform:** Brevo v3 API
**Use Cases:** Nurture sequences, newsletters, re-engagement, lead segmentation, analytics
**Critical Rule:** EXISTING leads/clients ONLY — never cold outreach. Cold email is handled by Instantly.ai.

---

## API Setup

### Authentication
```python
import requests
import json

BREVO_API_KEY = "your-brevo-api-key"  # from Brevo dashboard
BASE_URL = "https://api.brevo.com/v3"
HEADERS = {
    "accept": "application/json",
    "api-key": BREVO_API_KEY,
    "content-type": "application/json"
}
```

### Contact Lists (Pre-configured for JegoDigital)

| List Name | ID | Purpose |
|-----------|----|----|
| All Leads | `1` | Master list of all prospects |
| Hot Leads | `2` | Qualified, ready to close |
| Warm Leads | `3` | Interested, needs nurture |
| Cold Leads | `4` | No response, re-engagement |
| Subscribers | `5` | Monthly newsletter recipients |
| Closed Clients | `6` | Active customers (case studies) |

### Custom Attributes (Tracked per Contact)

```json
{
  "LEAD_SOURCE": "direct|email|whatsapp|google",
  "STAGE": "prospect|hot|warm|cold|client",
  "PROPERTY_INTEREST": "residential|commercial|land|all",
  "BUDGET_MXN": "0|100k|500k|1m|5m|10m+",
  "LAST_CONTACT": "2026-04-12T10:30:00Z",
  "OPEN_COUNT": 5,
  "CLICK_COUNT": 2,
  "CONSULTATION_DATE": "2026-04-15",
  "SERVICES_INTERESTED": "lead-capture|seo|aeo|social|video|email"
}
```

---

## 1. Contact Management

### Add Contact to List
```python
def add_contact(email, first_name, last_name, list_id, attributes={}):
    """Add or update contact in Brevo list."""
    payload = {
        "email": email,
        "attributes": {
            "FIRSTNAME": first_name,
            "LASTNAME": last_name,
            **attributes
        },
        "listIds": [list_id],
        "updateEnabled": True
    }
    r = requests.post(f"{BASE_URL}/contacts", json=payload, headers=HEADERS)
    return r.json() if r.status_code == 201 else {"error": r.text}

# Usage: new lead from WhatsApp
add_contact(
    "carlos@inmobiliaria.mx",
    "Carlos",
    "Mendoza",
    list_id=1,  # All Leads
    attributes={
        "LEAD_SOURCE": "whatsapp",
        "STAGE": "prospect",
        "PROPERTY_INTEREST": "residential",
        "BUDGET_MXN": "500k"
    }
)
```

### Move Contact Between Lists
```python
def move_contact_to_list(email, old_list_id, new_list_id):
    """Move contact from one list to another (e.g., prospect → hot lead)."""
    # Remove from old list
    requests.post(
        f"{BASE_URL}/contacts/lists/{old_list_id}/contacts/remove",
        json={"emails": [email]},
        headers=HEADERS
    )
    # Add to new list
    return add_contact_to_list(email, new_list_id)

def add_contact_to_list(email, list_id):
    """Add existing contact to additional list."""
    return requests.post(
        f"{BASE_URL}/contacts/lists/{list_id}/contacts/add",
        json={"emails": [email]},
        headers=HEADERS
    ).json()
```

### Update Contact Attributes
```python
def update_contact_attributes(email, attributes):
    """Update lead stage, engagement metrics, service interests, etc."""
    payload = {
        "attributes": attributes,
        "updateEnabled": True
    }
    return requests.put(
        f"{BASE_URL}/contacts/{email}",
        json=payload,
        headers=HEADERS
    ).json()

# Usage: mark lead as hot after consultation
update_contact_attributes(
    "carlos@inmobiliaria.mx",
    {
        "STAGE": "hot",
        "CONSULTATION_DATE": "2026-04-15",
        "SERVICES_INTERESTED": "lead-capture|seo"
    }
)
```

---

## 2. Nurture Sequences

### Sequence A: Welcome Sequence (5 emails, 14 days)
**Trigger:** Lead added to "All Leads" list

| Email | Day | Subject | Focus |
|-------|-----|---------|-------|
| 1 | 0 | ¿Cómo capturamos más leads para tu inmobiliaria? | Intro + pain |
| 2 | 2 | Flamingo Real Estate: 4.4x en búsquedas | Social proof |
| 3 | 5 | Sistema de IA que responde en segundos | Product intro |
| 4 | 9 | ¿Cuántos leads pierdes hoy? | Urgency |
| 5 | 14 | Agendar consultoría gratuita | CTA + Calendly |

```python
def send_welcome_sequence(email, first_name):
    """Trigger 5-email welcome automation."""
    campaign_id = 1  # Pre-configured in Brevo
    payload = {
        "email": email,
        "attributes": {"FIRSTNAME": first_name}
    }
    return requests.post(
        f"{BASE_URL}/automations/{campaign_id}/contacts",
        json=payload,
        headers=HEADERS
    ).json()
```

**Email 1 Template:**
```html
<h1>Hola {{FIRSTNAME}},</h1>

<p>¿Sabes cuántos leads pierdes cada semana por no responder en los primeros 5 minutos?</p>

<p>Los leads contactados en <strong>menos de 5 minutos</strong> tienen 21 veces más probabilidad de cerrar.</p>

<p>En JegoDigital, ayudamos a inmobiliarias en México a:</p>
<ul>
  <li>Capturar TODOS los leads (WhatsApp, SMS, web chat)</li>
  <li>Responder en segundos con IA</li>
  <li>Calificar leads automáticamente</li>
  <li>Agendar citas sin intervención humana</li>
</ul>

<p>Resultado: Flamingo Real Estate capturó 320% más leads y cerró más ventas.</p>

<p><a href="{{CALENDLY}}" style="background:#C5A059;color:#fff;padding:10px 20px;text-decoration:none;">Ver Demo de 1 Minuto</a></p>

<p>Alex<br>JegoDigital</p>
```

### Sequence B: Post-Consultation (3 emails, 7 days)
**Trigger:** CONSULTATION_DATE attribute set

| Email | Day After | Subject | Focus |
|-------|-----------|---------|-------|
| 1 | 0 | Resumen de tu consultoría | Recap + next steps |
| 2 | 3 | Plan de implementación | Timeline + deliverables |
| 3 | 7 | Aceptar propuesta | Final CTA |

```python
def send_post_consultation_sequence(email, consultation_date):
    """Trigger after Alex completes discovery call."""
    campaign_id = 2  # Post-consultation automation
    payload = {
        "email": email,
        "attributes": {"CONSULTATION_DATE": consultation_date}
    }
    return requests.post(
        f"{BASE_URL}/automations/{campaign_id}/contacts",
        json=payload,
        headers=HEADERS
    ).json()
```

### Sequence C: Re-engagement (3 emails, 21 days)
**Trigger:** Manual trigger when LAST_CONTACT > 30 days ago

| Email | Day | Subject | Focus |
|-------|-----|---------|-------|
| 1 | 0 | ¿Sigues interesado? | Win-back offer |
| 2 | 7 | Nuevos resultados de clientes | Updated social proof |
| 3 | 21 | Última oportunidad | Final attempt |

```python
def send_reengagement_sequence(email):
    """Re-engage cold leads."""
    campaign_id = 3
    return requests.post(
        f"{BASE_URL}/automations/{campaign_id}/contacts",
        json={"email": email},
        headers=HEADERS
    ).json()

def find_cold_leads():
    """Find leads not contacted in 30+ days."""
    r = requests.get(
        f"{BASE_URL}/contacts?listIds=4",  # Cold Leads list
        headers=HEADERS
    )
    return r.json().get("contacts", [])
```

---

## 3. Monthly Newsletter

### Create & Send Newsletter
```python
def send_monthly_newsletter(subject, html_content, list_id=5):
    """Create and send monthly newsletter to all subscribers."""
    payload = {
        "name": f"Newsletter {datetime.now().strftime('%B %Y')}",
        "subject": subject,
        "htmlContent": html_content,
        "sender": {
            "name": "JegoDigital",
            "email": "noreply@jegodigital.com"
        },
        "recipients": {"listIds": [list_id]},
        "scheduledAt": (datetime.now() + timedelta(days=1)).isoformat()
    }
    r = requests.post(f"{BASE_URL}/emailCampaigns", json=payload, headers=HEADERS)
    return r.json()

# Usage
html = """
<h1>Actualización de Abril 2026</h1>
<p>Hola {{FIRSTNAME}},</p>
<p>4 cosas nuevas que debes saber:</p>
<h3>1. Flamingo: 4.4x en búsquedas</h3>
<p>Caso de éxito de esta semana...</p>
"""
send_monthly_newsletter(
    subject="¿Cómo otros agentes están cerrando más ventas?",
    html_content=html
)
```

---

## 4. Campaign Analytics

### Check Campaign Performance
```python
def get_campaign_stats(campaign_id):
    """Get open/click/bounce/unsubscribe rates for campaign."""
    r = requests.get(
        f"{BASE_URL}/emailCampaigns/{campaign_id}/report",
        headers=HEADERS
    )
    stats = r.json()
    return {
        "sent": stats.get("stats", {}).get("sent"),
        "opens": stats.get("stats", {}).get("opened"),
        "open_rate": stats.get("stats", {}).get("openRate"),
        "clicks": stats.get("stats", {}).get("clicked"),
        "click_rate": stats.get("stats", {}).get("clickRate"),
        "bounces": stats.get("stats", {}).get("bounced"),
        "unsubscribes": stats.get("stats", {}).get("unsubscribed")
    }

# Usage
stats = get_campaign_stats(1)
print(f"Email 1 (Welcome): {stats['open_rate']*100:.1f}% open rate, {stats['click_rate']*100:.1f}% CTR")
```

### Track Contact Engagement
```python
def get_contact_stats(email):
    """Get all metrics for specific contact."""
    r = requests.get(
        f"{BASE_URL}/contacts/{email}",
        headers=HEADERS
    )
    contact = r.json()
    return {
        "email": contact.get("email"),
        "stage": contact.get("attributes", {}).get("STAGE"),
        "last_opened": contact.get("emailBlacklisted"),
        "open_count": contact.get("attributes", {}).get("OPEN_COUNT", 0),
        "click_count": contact.get("attributes", {}).get("CLICK_COUNT", 0)
    }
```

---

## 5. Template Management

### Create & Store Email Template
```python
def create_email_template(name, subject, html_content):
    """Save template for reuse across campaigns."""
    payload = {
        "name": name,
        "htmlContent": html_content,
        "subject": subject,
        "replyTo": "noreply@jegodigital.com"
    }
    r = requests.post(f"{BASE_URL}/emailTemplates", json=payload, headers=HEADERS)
    return r.json()

# Template: Dark luxury brand style
def brand_template(title, body_text, cta_text, cta_url):
    """Reusable template wrapper with JegoDigital brand."""
    return f"""
    <html style="background:#0f1115;color:#fff;font-family:Arial,sans-serif;">
      <body style="padding:40px;background:#0f1115;">
        <div style="max-width:600px;margin:0 auto;background:#1a1d23;padding:40px;border-radius:8px;border:1px solid #2a2f3f;">
          <h1 style="color:#C5A059;font-size:24px;margin-bottom:20px;">{title}</h1>
          <p style="line-height:1.6;margin-bottom:20px;">{body_text}</p>
          <a href="{cta_url}" style="display:inline-block;background:#C5A059;color:#0f1115;padding:14px 28px;text-decoration:none;font-weight:bold;border-radius:4px;">{cta_text}</a>
          <hr style="border:none;border-top:1px solid #2a2f3f;margin:40px 0;">
          <p style="font-size:12px;color:#999;">JegoDigital &copy; 2026</p>
        </div>
      </body>
    </html>
    """
```

---

## 6. Lead Scoring & Segmentation

### Score Lead Based on Engagement
```python
def score_lead(email):
    """Calculate lead score (0-100) based on engagement + stage."""
    contact = requests.get(f"{BASE_URL}/contacts/{email}", headers=HEADERS).json()
    attrs = contact.get("attributes", {})
    
    score = 0
    # Stage (0-40pts)
    stage_map = {"hot": 40, "warm": 25, "prospect": 10, "cold": 0}
    score += stage_map.get(attrs.get("STAGE"), 0)
    
    # Engagement (0-40pts)
    opens = int(attrs.get("OPEN_COUNT", 0))
    clicks = int(attrs.get("CLICK_COUNT", 0))
    score += min(opens * 2 + clicks * 5, 40)
    
    # Budget (0-20pts)
    budget_map = {"10m+": 20, "5m": 15, "1m": 12, "500k": 10, "100k": 5}
    score += budget_map.get(attrs.get("BUDGET_MXN"), 0)
    
    return min(score, 100)

# Usage: find hottest leads
def find_hot_leads_by_score(threshold=70):
    """Get all leads with score > threshold."""
    r = requests.get(f"{BASE_URL}/contacts?listIds=1", headers=HEADERS)
    contacts = r.json().get("contacts", [])
    scored = [(c["email"], score_lead(c["email"])) for c in contacts]
    return sorted(scored, key=lambda x: x[1], reverse=True)[:10]
```

---

## 7. Integration: ManyChat + Brevo

### When Lead Qualifies on WhatsApp → Move to Brevo
```python
def import_from_manychat(subscriber_id, name, phone):
    """When Sofia (ManyChat AI) qualifies a lead, add to Brevo."""
    email = f"{phone.replace('+','').replace(' ','')}@whatsapp.local"
    add_contact(
        email=email,
        first_name=name.split()[0],
        last_name=name.split()[-1] if len(name.split()) > 1 else "",
        list_id=1,  # All Leads
        attributes={
            "LEAD_SOURCE": "whatsapp",
            "STAGE": "warm",
            "LAST_CONTACT": datetime.utcnow().isoformat()
        }
    )
    # Trigger welcome sequence
    send_welcome_sequence(email, name.split()[0])
```

---

## Critical Rules

1. **EXISTING leads/clients ONLY** — Brevo is for nurture, NOT cold outreach
2. **Cold email is Instantly.ai** — Never send cold emails via Brevo
3. **Unsubscribe compliance** — Always honor opt-outs; maintain list hygiene
4. **Spanish-first** — All default templates in Spanish unless client specifies
5. **No pricing in emails** — Direct to Calendly only
6. **Brand consistency** — All templates use dark luxury theme (#0f1115, #C5A059)
7. **Track everything** — Update contact attributes after every interaction
8. **Segment aggressively** — Keep Hot/Warm/Cold lists separate; re-engagement = cold only

---

## 8. FB Lead Form Nurture Sequence (2026-04-28)

**Source-specific sequence for leads from Meta/Facebook Instant Lead Forms** (list 41 — `FB Lead Form — Hiring Intent 2026-04`). Different from generic Welcome (Sequence A) because FB leads have already received the audit pipeline output and are likely real-estate decision-makers expecting follow-up.

### 2026 nurture research (validated baseline)

- **4-7 email sequences = 3× the reply rate** of shorter ones
- **Cadence: every 3-7 days, front-loaded** (most frequent early when interest is highest)
- **3:1 rule** — give value 3 times before asking for anything
- **First email <48h of capture** (we ship welcome in <30 sec via webhook)
- **CTR target ≥5.58%** (2026 automated-flow benchmark)
- **Tuesday-Thursday 9-11 AM** = best B2B send window
- **Subject lines:** ≤33 chars, lowercase, casual/vague (read like internal emails) — questions hit 46% open rate vs 35% generic
- **Personalize with company name** → 46% opens vs 35% without
- **NO numbers in subject lines** — 2024 data shows numbers HURT (27% opens vs 28% without)
- **73% of B2B leads aren't ready to buy immediately** — most responses come from emails 3-5, NOT email 1
- **Curiosity-driven > benefit-driven** by 18-23%

### The canonical FB Lead Form sequence (5 emails over 21 days)

```
T+0      Email 0: Welcome — "tu auditoría llega en 60 min"     (template 71, already shipped)
T+45min  Email 1: Audit delivery — branded HTML report          (auditPipeline.js, already shipped)
T+24h    Email 2: ¿una pregunta sobre tu auditoría?              [Curiosity, soft check-in]
T+72h    Email 3: cómo Flamingo hizo +320%                       [Case study, give value]
T+168h   Email 4: una idea para {{COMPANY}}                      [Specific value tease]
T+336h   Email 5: ¿hablamos 15 min?                              [Soft Calendly close]
T+504h   Email 6: última, prometido                              [Breakup — psychological reactance]
```

### Subject line formulas (research-validated, lowercase, vague, ≤33 chars)

| Email | Subject (Spanish) | Chars | Type |
|---|---|---|---|
| 2 | `una pregunta sobre tu auditoría` | 31 | Question |
| 3 | `lo que flamingo hizo diferente` | 30 | Curiosity |
| 4 | `idea para {{COMPANY}}` | ~22 | Personalized |
| 5 | `¿hablamos 15 min?` | 17 | Question + low ask |
| 6 | `última, prometido` | 17 | Pattern-break |

### Body structure (each email)

1. **Lead with value, not pitch** — answer one question or share one insight
2. **One link only** — don't fragment attention
3. **Sign as "Alex"** + company name only — never full name with title
4. **Mobile-first HTML** — tables for layout, single column, font size ≥15px
5. **No images on email 2** — pure text outperforms HTML on follow-ups (gets through Promotions tab)
6. **Brand-locked** — #0f1115 + #C5A059 + #FFFFFF only
7. **Always footer with WhatsApp + Calendly + unsub** — all 3, always

### Key implementation rules

- **Trigger:** Brevo automation on add-to-list-41 OR manual scheduled queue via `processBrevoNurtureQueue` cron (every 30 min)
- **Conditional skip:** if contact has `STAGE=Hot` or `LEAD_TEMPERATURE=Hot` (booked Calendly already), skip emails 5-6 — don't waste touches on closed-loop leads
- **Conditional continue:** if contact has `LAST_OPEN > 48h ago` AND no Calendly booking, fire next sequence email
- **Stop trigger:** if contact unsubscribes OR replies (Brevo native reply tracking) OR books Calendly → exit sequence

### Sequence templates already built

| Template ID | Name | Day | Status |
|---|---|---|---|
| 71 | FB Welcome — Auditoría cocinándose | T+0 | ✅ live (Phase 1.1) |
| TBD | FB Nurture Day 1 — Pregunta | T+1d | ⏳ build next |
| TBD | FB Nurture Day 3 — Flamingo | T+3d | ⏳ build next |
| TBD | FB Nurture Day 7 — Idea | T+7d | ⏳ build next |
| TBD | FB Nurture Day 14 — ¿Hablamos? | T+14d | ⏳ build next |
| TBD | FB Nurture Day 21 — Breakup | T+21d | ⏳ build next |

### KPI targets for the sequence (week 1-4 of cohort)

| Metric | Target | Kill (re-iterate) |
|---|---|---|
| Welcome (T+0) open rate | ≥60% | <40% |
| Audit delivery (T+45min) open rate | ≥55% | <35% |
| Sequence emails 2-6 avg open rate | ≥30% | <18% |
| Sequence avg CTR | ≥5.58% | <2% |
| Calendly book rate from sequence | ≥5% | <1.5% |
| Unsub rate | ≤0.5% | >2% |
| Reply rate (any email) | ≥3% | <1% |

### Anti-goals

- ❌ Don't send 7+ emails — 4-6 is the optimal density per 2026 research
- ❌ Don't space evenly — front-load (D+1, D+3, D+7, D+14, D+21)
- ❌ Don't use numbers in subject lines — they hurt opens per 2024 data
- ❌ Don't send identical sequence to ManyChat-source leads (Sofia already qualified them differently — they need a SHORTER sequence)
- ❌ Don't add this sequence to Instantly cold-email leads (different funnel, different list)

### When to fork the sequence by qualification

Brevo attributes captured from Meta Lead Form: `LEADS_PER_MONTH` + `MAIN_FRUSTRATION`.

Use them to fork at email 4:
- `LEADS_PER_MONTH = "50+"` → email 4 emphasizes scale + automation case studies (Solik, Goza)
- `LEADS_PER_MONTH = "0-5"` → email 4 emphasizes lead-gen fundamentals (Flamingo +320%)
- `MAIN_FRUSTRATION = "no_leads"` → email 3 swaps to GoodLife 5× case
- `MAIN_FRUSTRATION = "slow_response"` → email 3 swaps to Solik 95% qualify rate

---

---

## Deployment

Save this skill to `/sessions/nifty-cool-shannon/skill-fixes/brevo-email-marketing/SKILL.md` and register with n8n automation or manual API calls.

**File size:** 468 lines | **Description length:** 343 characters
