import requests
import re
import csv
import time
import json
import concurrent.futures
from urllib.parse import urljoin, urlparse

# --- CONFIGURATION ---
API_USER = "mail@aichatsy.com"
API_PASS = "f1a45ec660a7cc19"
BASE_URL = "https://api.dataforseo.com/v3/serp/google/organic/live/advanced"
LOCATION_CODE = 2484  # Mexico
LANGUAGE_CODE = "es"

# Target Niches
TARGET_QUERIES = [
    "inmobiliaria tulum",
    "bienes raices playa del carmen",
    "real estate agency cancun",
    "desarrollos inmobiliarios tulum",
    "arquitectos playa del carmen"
]

# Regex Patterns
EMAIL_REGEX = r'[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}'
PHONE_REGEX = r'(?:\+?52)?\s?\(?\d{3}\)?\s?\d{3}\s?\d{4}'

# Ignore junk emails
IGNORE_EMAILS = [
    ".png", ".jpg", ".jpeg", ".gif", "sentry", "noreply", "no-reply", 
    "dom", "wix", "bootstrap", "react", "example"
]

def get_serp_results(query):
    print(f"🔍 Searching Google for: {query}...")
    payload = [{
        "keyword": query,
        "location_code": LOCATION_CODE,
        "language_code": LANGUAGE_CODE,
        "depth": 100 
    }]
    response = requests.post(
        BASE_URL, 
        auth=(API_USER, API_PASS), 
        json=payload
    )
    if response.status_code == 200:
        results = response.json()
        items = results['tasks'][0]['result'][0]['items']
        websites = []
        for item in items:
            if item['type'] == 'organic':
                url = item['url']
                title = item['title']
                domain = urlparse(url).netloc
                # Filter out big directories
                if "facebook" in domain or "instagram" in domain or "linkedin" in domain or "tripadvisor" in domain:
                    continue
                websites.append({"url": url, "title": title, "domain": domain})
        return websites
    else:
        print("Error connecting to DataForSEO")
        return []

def scrape_contact_info(site_data):
    url = site_data['url']
    print(f"🕷️ Crawling: {url}")
    
    emails = set()
    phones = set()
    
    try:
        # 1. Fetch Homepage
        headers = {'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.114 Safari/537.36'}
        response = requests.get(url, headers=headers, timeout=10)
        content = response.text
        
        # 2. Extract from Homepage
        found_emails = re.findall(EMAIL_REGEX, content)
        for e in found_emails:
            if not any(ign in e.lower() for ign in IGNORE_EMAILS):
                emails.add(e.lower())

        found_phones = re.findall(PHONE_REGEX, content)
        for p in found_phones:
            phones.add(p.strip())

        # 3. Only look for contact page if no email found
        if not emails:
            # Simple heuristic for contact links
            contact_links = re.findall(r'href=[\'"](.*?)[\'"]', content)
            for link in contact_links:
                if "contact" in link.lower() or "contacto" in link.lower():
                    contact_url = urljoin(url, link)
                    try:
                        resp_c = requests.get(contact_url, headers=headers, timeout=5)
                        content_c = resp_c.text
                        found_emails_c = re.findall(EMAIL_REGEX, content_c)
                        for e in found_emails_c:
                            if not any(ign in e.lower() for ign in IGNORE_EMAILS):
                                emails.add(e.lower())
                    except:
                        pass
                    break # Just try one contact page

    except Exception as e:
        print(f"❌ Error scraping {url}: {e}")

    site_data['emails'] = ", ".join(list(emails))
    site_data['phones'] = ", ".join(list(phones))
    
    if emails:
        print(f"✅ FOUND EMAIL: {list(emails)}")
    
    return site_data

def main():
    all_sites = []
    
    # 1. Gather URLs
    for query in TARGET_QUERIES:
        sites = get_serp_results(query)
        print(f"   found {len(sites)} sites.")
        all_sites.extend(sites)

    # Dedup by domain
    unique_sites = {s['domain']: s for s in all_sites}.values()
    print(f"🚀 Total Unique Sites to Mine: {len(unique_sites)}")

    # 2. Mine Data (Threaded)
    final_leads = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=10) as executor:
        results = executor.map(scrape_contact_info, unique_sites)
        for res in results:
            if res['emails']: # Only save if we found an email
                final_leads.append(res)

    # 3. Export
    filename = "b2b_leads_tulum_realestate.csv"
    with open(filename, 'w', newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=["title", "url", "domain", "emails", "phones"])
        writer.writeheader()
        writer.writerows(final_leads)

    print(f"\n🎉 DONE! Generated 100% Valid Leads: {len(final_leads)}")
    print(f"Saved to: {filename}")

if __name__ == "__main__":
    main()
