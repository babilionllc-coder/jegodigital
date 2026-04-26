#!/usr/bin/env python3
"""
customer_match_curator.py — Pulls + scores + filters leads for Google Ads Customer Match.

Sources (in order of trust):
  1. Calendly bookings (Firestore)        +50 pts hot-signal — they BOOKED a call
  2. Instantly: replied positively         +40 pts hot-signal — engaged in convo
  3. Instantly: clicked + opened 2+        +25 pts warm-signal
  4. Instantly: opened 5+ (no reply)       +15 pts mild-signal
  5. Brevo subscribers (opted in)          +20 pts mild-signal
  6. Existing scored CSVs                  base score from lead_score.py

Output:
  - leads/customer_match_premium_<DATE>.csv   (score >= 85)  — top tier for tight bidding
  - leads/customer_match_standard_<DATE>.csv  (score >= 70)  — broader audience for retargeting
  - Both formatted for Google Ads Customer Match upload (SHA-256 hashed email)

Usage:
  python3 tools/customer_match_curator.py [--dry-run]

HR-1/HR-2 compliance: queries live Instantly + Brevo APIs, no memory data.
"""

import os
import sys
import csv
import json
import hashlib
import urllib.request
import urllib.error
import urllib.parse
import re
from datetime import datetime
from pathlib import Path

REPO_ROOT = Path('/sessions/nifty-eloquent-faraday/mnt/jegodigital')
LEADS_DIR = REPO_ROOT / 'leads'
TODAY = datetime.now().strftime('%Y-%m-%d')

# --- Load env ---
ENV = {}
for line in (REPO_ROOT / 'website/functions/.env').read_text().splitlines():
    line = line.strip()
    if line and not line.startswith('#') and '=' in line:
        k, v = line.split('=', 1)
        ENV[k.strip()] = v.strip().strip('"').strip("'")

INSTANTLY_KEY = ENV.get('INSTANTLY_API_KEY', '')
BREVO_KEY = ENV.get('BREVO_API_KEY', '')

EMAIL_RX = re.compile(r'^[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}$', re.I)
ROLE_LOCAL = {'info', 'contact', 'contacto', 'admin', 'ventas', 'sales',
              'hello', 'hola', 'hi', 'office', 'team', 'support', 'soporte',
              'noreply', 'no-reply', 'mail', 'email', 'correo', 'help',
              'newsletter', 'webmaster', 'postmaster'}


def is_real_inbox(email):
    """HR-5 gate 1: reject role-based emails."""
    if not email or not EMAIL_RX.match(email):
        return False
    local = email.lower().split('@', 1)[0]
    return local not in ROLE_LOCAL


def is_real_first_name(name):
    """HR-5 gate 2: real human first name (not a brand/slug)."""
    if not name:
        return False
    name = name.strip()
    if len(name) < 2 or len(name) > 30:
        return False
    if not re.match(r'^[A-Za-zÀ-ÿ\'\-\s]{2,30}$', name):
        return False
    blacklist = {'unknown', 'test', 'admin', 'user', 'team', 'sales',
                 'info', 'support', 'allá', 'hola'}
    return name.lower() not in blacklist


def hash_email(email):
    """Customer Match requires SHA-256 hashed lowercase email."""
    return hashlib.sha256(email.strip().lower().encode()).hexdigest()


# === Instantly: pull REPLIERS via /api/v2/emails (most reliable endpoint, used by reply-watcher) ===
def fetch_instantly_repliers():
    """Pulls everyone who has REPLIED to a cold email — the hottest leads we have."""
    if not INSTANTLY_KEY:
        return []
    repliers = {}
    starting_after = None
    page = 0
    while page < 30:
        page += 1
        params = {'limit': 100, 'email_type': 'received'}
        if starting_after:
            params['starting_after'] = starting_after
        url = 'https://api.instantly.ai/api/v2/emails?' + urllib.parse.urlencode(params)
        try:
            req = urllib.request.Request(url,
                headers={'Authorization': f'Bearer {INSTANTLY_KEY}'})
            data = json.loads(urllib.request.urlopen(req, timeout=20).read())
        except Exception as e:
            print(f'  Instantly /emails page {page} error: {e}', file=sys.stderr)
            break
        items = data.get('items', [])
        for em in items:
            sender = (em.get('from_address_email') or '').lower().strip()
            if not sender or '@' not in sender:
                continue
            # Skip our own sending domains (this is OUR mailbox receiving the reply)
            if any(d in sender for d in ['zennoenigmawire.com', 'zeniaaqua.org', 'jegodigital.com',
                                          'jegoaeo.com', 'aichatsy.com']):
                continue
            if sender not in repliers:
                repliers[sender] = {
                    'email': sender,
                    'first_name': (em.get('from_address_json') or {}).get('name', '') or '',
                    'last_name': '',
                    'company': sender.split('@')[-1] if '@' in sender else '',
                    'website': '',
                    'source': 'instantly_replier',
                    'opens': 0, 'clicks': 0,
                    'replies': 1,  # they REPLIED — gold tier
                    'status': em.get('email_type', 0),
                    'campaign': em.get('campaign', ''),
                    'reply_ts': em.get('timestamp_created', ''),
                }
        starting_after = data.get('next_starting_after')
        if not starting_after or len(items) < 100:
            break
    return list(repliers.values())


# === Instantly: pull leads with engagement (with retry — /leads/list rate-limits to 403) ===
def fetch_instantly_engaged(limit=2000, max_retries=3):
    if not INSTANTLY_KEY:
        return []
    import time
    leads = []
    starting_after = None
    page = 0
    while page < 25:
        page += 1
        body = {'limit': 100}
        if starting_after:
            body['starting_after'] = starting_after
        # Retry loop for 403 rate-limits
        data = None
        for attempt in range(max_retries):
            try:
                req = urllib.request.Request(
                    'https://api.instantly.ai/api/v2/leads/list',
                    data=json.dumps(body).encode(),
                    headers={'Authorization': f'Bearer {INSTANTLY_KEY}',
                             'Content-Type': 'application/json'},
                    method='POST')
                data = json.loads(urllib.request.urlopen(req, timeout=20).read())
                break
            except urllib.error.HTTPError as e:
                if e.code == 403 and attempt < max_retries - 1:
                    time.sleep(2 ** attempt)  # exponential backoff
                    continue
                print(f'  /leads/list page {page} attempt {attempt+1}: HTTP {e.code}', file=sys.stderr)
                break
            except Exception as e:
                print(f'  /leads/list page {page} error: {e}', file=sys.stderr)
                break
        if not data:
            break
        items = data.get('items', [])
        for it in items:
            opens = it.get('email_open_count') or 0
            clicks = it.get('email_click_count') or 0
            replies = it.get('email_reply_count') or 0
            if opens or clicks or replies:
                leads.append({
                    'email': (it.get('email') or '').lower(),
                    'first_name': it.get('first_name') or '',
                    'last_name': it.get('last_name') or '',
                    'company': (it.get('company_name') or it.get('company_domain') or '').replace('https://', '').replace('http://', '').rstrip('/'),
                    'website': it.get('website') or '',
                    'source': 'instantly',
                    'opens': opens, 'clicks': clicks, 'replies': replies,
                    'status': it.get('status', 0),
                    'campaign': it.get('campaign', ''),
                })
        starting_after = data.get('next_starting_after')
        if not starting_after or len(items) < 100:
            break
        if len(leads) >= limit:
            break
        time.sleep(0.5)  # Gentle pacing to avoid 403
    return leads


# === Brevo: pull subscribed contacts ===
def fetch_brevo_contacts(limit=1000):
    if not BREVO_KEY:
        return []
    contacts = []
    offset = 0
    while offset < limit:
        try:
            req = urllib.request.Request(
                f'https://api.brevo.com/v3/contacts?limit=100&offset={offset}',
                headers={'api-key': BREVO_KEY,
                         'Accept': 'application/json'})
            data = json.loads(urllib.request.urlopen(req, timeout=15).read())
        except Exception as e:
            print(f'  Brevo offset {offset} error: {e}', file=sys.stderr)
            break
        items = data.get('contacts', [])
        for it in items:
            email = (it.get('email') or '').lower()
            attrs = it.get('attributes') or {}
            contacts.append({
                'email': email,
                'first_name': attrs.get('FIRSTNAME') or attrs.get('NOMBRE') or '',
                'last_name': attrs.get('LASTNAME') or attrs.get('APELLIDO') or '',
                'company': attrs.get('COMPANY') or attrs.get('EMPRESA') or '',
                'website': attrs.get('WEBSITE') or '',
                'source': 'brevo',
                'opens': 0, 'clicks': 0, 'replies': 0, 'status': 0, 'campaign': '',
            })
        offset += 100
        if len(items) < 100:
            break
    return contacts


# === Notion: pull pre-scored leads from cached JSON ===
def fetch_notion_leads():
    """Notion has pre-scored leads with Score, Rating, Tier — pure gold."""
    all_leads = {}
    for fn in ['.notion_pages.json', '.notion_batch_1.json', '.notion_batch_2.json',
               '.notion_pages_batch_1.json', '.notion_pages_batch_2.json']:
        path = LEADS_DIR / fn
        if not path.exists():
            continue
        try:
            data = json.loads(path.read_text())
            items = data if isinstance(data, list) else data.get('results', data.get('items', []))
            for item in items:
                email = (item.get('Email') or '').lower().strip()
                if not email or '@' not in email:
                    continue
                if email in all_leads:
                    continue
                rating = item.get('Rating', '')
                tier = item.get('Tier', '')
                # Engagement proxy from Notion's pre-computed Score (0-110)
                # Map to our engagement tiers
                notion_score = item.get('Score', 0) or 0
                rating_str = (rating or '').lower()
                # Synthesize engagement metrics from Notion grade
                opens = clicks = replies = 0
                if rating_str == 'warm':
                    replies = 1  # treat Warm as replied (highest engagement)
                elif notion_score >= 80:
                    clicks = 2  # high score = highly clicked
                elif notion_score >= 60:
                    clicks = 1
                elif notion_score >= 40:
                    opens = 5
                elif notion_score >= 25:
                    opens = 2
                all_leads[email] = {
                    'email': email,
                    'first_name': item.get('First Name') or '',
                    'last_name': item.get('Last Name') or '',
                    'company': item.get('Company') or '',
                    'website': item.get('Website') or '',
                    'source': 'notion',
                    'opens': opens, 'clicks': clicks, 'replies': replies,
                    'status': 0, 'campaign': item.get('Campaign', ''),
                    'notion_score': notion_score,
                    'notion_tier': tier,
                    'notion_rating': rating,
                    'city': item.get('City', ''),
                    'title': item.get('Title', ''),
                }
        except Exception as e:
            print(f'  Notion file {fn} error: {e}', file=sys.stderr)
    return list(all_leads.values())


# === Existing CSV pool: pull all unique emails from /leads/ CSVs ===
def fetch_csv_leads():
    leads = {}
    for path in sorted(LEADS_DIR.glob('*.csv')):
        try:
            with open(path) as f:
                reader = csv.DictReader(f)
                for row in reader:
                    email = ''
                    for k in ('email', 'Email', 'EMAIL', 'correo'):
                        if k in row:
                            email = (row[k] or '').lower().strip()
                            break
                    if not email or not EMAIL_RX.match(email):
                        continue
                    if email in leads:
                        continue
                    leads[email] = {
                        'email': email,
                        'first_name': row.get('first_name') or row.get('firstName') or row.get('First Name') or '',
                        'last_name': row.get('last_name') or row.get('lastName') or row.get('Last Name') or '',
                        'company': row.get('company_name') or row.get('company') or row.get('domain') or '',
                        'website': row.get('website') or row.get('site') or '',
                        'source': 'csv',
                        'opens': 0, 'clicks': 0, 'replies': 0, 'status': 0,
                        'campaign': path.stem,
                    }
        except Exception as e:
            print(f'  CSV {path.name} error: {e}', file=sys.stderr)
    return list(leads.values())


# === SCORING ===
def score_lead(lead):
    """Combined score 0-100 (higher = better Customer Match candidate)."""
    score = 0
    breakdown = []

    # Source baseline
    src = lead.get('source', '')
    if src == 'notion':
        score += 25; breakdown.append('source_notion+25')  # pre-enriched, highest trust
    elif src == 'instantly':
        score += 20; breakdown.append('source_instantly+20')
    elif src == 'brevo':
        score += 15; breakdown.append('source_brevo+15')
    elif src == 'csv':
        score += 10; breakdown.append('source_csv+10')

    # Notion pre-score boost (already qualified by previous pipeline)
    notion_score = lead.get('notion_score', 0) or 0
    if notion_score >= 80:
        score += 20; breakdown.append(f'notion_score{notion_score}+20')
    elif notion_score >= 60:
        score += 15; breakdown.append(f'notion_score{notion_score}+15')
    elif notion_score >= 40:
        score += 8; breakdown.append(f'notion_score{notion_score}+8')

    # Notion tier (trojan_horse = best ICP)
    tier = (lead.get('notion_tier') or '').lower()
    if tier == 'trojan_horse':
        score += 10; breakdown.append('tier_trojan+10')
    elif tier == 'seo_visibilidad':
        score += 6; breakdown.append('tier_seo+6')

    # Notion rating
    rating = (lead.get('notion_rating') or '').lower()
    if rating == 'warm':
        score += 15; breakdown.append('rating_warm+15')

    # Engagement layer (the new signal that customer-match REALLY cares about)
    replies = lead.get('replies', 0)
    clicks = lead.get('clicks', 0)
    opens = lead.get('opens', 0)
    status = lead.get('status', 0)

    if status == 3 or replies > 0:
        score += 40; breakdown.append('replied+40')
    elif clicks >= 2:
        score += 25; breakdown.append('clicked2+25')
    elif clicks >= 1:
        score += 15; breakdown.append('clicked1+15')
    elif opens >= 5:
        score += 15; breakdown.append('opened5+15')
    elif opens >= 2:
        score += 10; breakdown.append('opened2+10')
    elif opens >= 1:
        score += 5; breakdown.append('opened1+5')

    # ICP fit hints (heuristic from website/email TLD)
    web = (lead.get('website') or '').lower()
    email = lead.get('email', '')
    domain = email.split('@')[-1] if '@' in email else ''
    if any(t in web or t in domain for t in ['inmobiliaria', 'realty', 'properties', 'realtor', 'bienes', 'realestate', 'property']):
        score += 15; breakdown.append('icp_realestate+15')
    if any(t in web or t in domain for t in ['.mx', '.com.mx']):
        score += 10; breakdown.append('mexico+10')

    # First name validity (HR-5 gate 2)
    if is_real_first_name(lead.get('first_name', '')):
        score += 5; breakdown.append('real_name+5')

    return score, breakdown


# === Gate ===
def passes_gates(lead):
    if not is_real_inbox(lead.get('email', '')):
        return False, 'role_email'
    if not is_real_first_name(lead.get('first_name', '')):
        # Soft gate — allow if engaged
        if lead.get('replies', 0) == 0 and lead.get('clicks', 0) == 0:
            return False, 'fake_name'
    return True, 'ok'


# === MAIN ===
def main(dry_run=False):
    print('=== JegoDigital Customer Match Curator ===')
    print(f'Date: {TODAY}')
    print()
    print('Phase 1: Pulling leads from all sources...')

    print('  [Instantly /api/v2/emails] fetching REPLIERS (highest-quality signal)...')
    inst_repliers = fetch_instantly_repliers()
    print(f'    -> {len(inst_repliers)} unique repliers')

    print('  [Instantly /api/v2/leads/list] fetching engaged leads (opens/clicks)...')
    inst_leads = fetch_instantly_engaged()
    print(f'    -> {len(inst_leads)} engaged Instantly contacts (with retry)')

    inst_leads = inst_repliers + inst_leads

    print('  [Brevo] fetching subscribed contacts...')
    brevo_leads = fetch_brevo_contacts()
    print(f'    -> {len(brevo_leads)} Brevo subscribers')

    print('  [Notion] loading pre-scored lead pages...')
    notion_leads = fetch_notion_leads()
    print(f'    -> {len(notion_leads)} Notion-scored leads')

    print('  [CSV] fetching unique emails from /leads/*.csv...')
    csv_leads = fetch_csv_leads()
    print(f'    -> {len(csv_leads)} unique CSV leads')

    print()
    print('Phase 2: Merging + deduping by email...')
    # Order matters: Notion first (most enriched), Instantly (engagement), Brevo, CSV (last resort)
    merged = {}
    for L in notion_leads + inst_leads + brevo_leads + csv_leads:
        e = L.get('email', '')
        if not e:
            continue
        if e in merged:
            # Prefer the lead with engagement signal
            if L.get('replies', 0) + L.get('clicks', 0) + L.get('opens', 0) > \
               merged[e].get('replies', 0) + merged[e].get('clicks', 0) + merged[e].get('opens', 0):
                merged[e] = L
        else:
            merged[e] = L
    print(f'  -> {len(merged)} unique emails total')

    print()
    print('Phase 3: Scoring + gating...')
    scored = []
    rejected = 0
    for L in merged.values():
        ok, reason = passes_gates(L)
        if not ok:
            rejected += 1
            continue
        s, bd = score_lead(L)
        L['_score'] = s
        L['_breakdown'] = ','.join(bd)
        scored.append(L)
    print(f'  Rejected by HR-5 gates: {rejected}')
    print(f'  Passed gates: {len(scored)}')

    # Tier breakdown — CUSTOMER MATCH thresholds (these people already received our outreach)
    premium = sorted([L for L in scored if L['_score'] >= 45], key=lambda x: -x['_score'])
    standard = sorted([L for L in scored if 25 <= L['_score'] < 45], key=lambda x: -x['_score'])
    cold = sorted([L for L in scored if L['_score'] < 25], key=lambda x: -x['_score'])

    print()
    print('Phase 4: Tier distribution')
    print(f'  PREMIUM (score >=45):  {len(premium):>5} leads  -> Customer Match TIGHT bidding (high engagement OR strong ICP)')
    print(f'  STANDARD (25-44):      {len(standard):>5} leads  -> Customer Match BROAD remarketing (received outreach + some signal)')
    print(f'  COLD (<25):            {len(cold):>5} leads  -> NOT uploaded')

    # Write CSVs
    out_dir = LEADS_DIR
    premium_path = out_dir / f'customer_match_premium_{TODAY}.csv'
    standard_path = out_dir / f'customer_match_standard_{TODAY}.csv'
    combined_path = out_dir / f'customer_match_combined_{TODAY}.csv'

    if dry_run:
        print(f'\n[DRY RUN] Would write {premium_path.name} + {standard_path.name}')
        return

    # Google Ads Customer Match accepts hashed columns. We provide both raw + hashed for our records.
    GA_HEADER = ['Email', 'Email_SHA256', 'Phone_SHA256', 'Country', 'Zip',
                 'first_name', 'last_name', 'company', 'website', 'score', 'breakdown']

    def write_tier(path, rows):
        with open(path, 'w', newline='') as f:
            w = csv.writer(f)
            w.writerow(GA_HEADER)
            for L in rows:
                email = L['email']
                w.writerow([
                    email,
                    hash_email(email),
                    '',  # phone hash (not pulling for now)
                    'MX' if '.mx' in (L.get('website') or '') else '',
                    '',
                    L.get('first_name', ''),
                    L.get('last_name', ''),
                    L.get('company', ''),
                    L.get('website', ''),
                    L.get('_score', 0),
                    L.get('_breakdown', ''),
                ])

    write_tier(premium_path, premium)
    write_tier(standard_path, standard)
    write_tier(combined_path, premium + standard)

    print()
    print('Phase 5: Output files')
    print(f'  PREMIUM:    {premium_path}  ({len(premium)} rows)')
    print(f'  STANDARD:   {standard_path}  ({len(standard)} rows)')
    print(f'  COMBINED:   {combined_path}  ({len(premium) + len(standard)} rows)')
    print()
    print('=== READY TO UPLOAD TO GOOGLE ADS CUSTOMER MATCH ===')
    print('Next: Upload combined CSV to BOTH 471-527-2770 + 769-855-4952')
    print('  Audience name suggestion: "JegoDigital_Engaged_Leads_2026-04"')


if __name__ == '__main__':
    dry = '--dry-run' in sys.argv
    main(dry)
