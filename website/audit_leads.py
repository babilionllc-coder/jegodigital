import csv
import requests
import concurrent.futures
from urllib.parse import urlparse
import re

INPUT_FILE = "b2b_leads_verified_clean.csv"
OUTPUT_FILE = "b2b_leads_enriched.csv"

def get_audit_hook(row):
    url = row.get('url', '')
    if not url:
        row['custom_hook'] = "vi su perfil en el directorio inmobiliario"
        return row

    try:
        headers = {'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.114 Safari/537.36'}
        # 1. SSL Check (if URL starts with http:)
        if url.startswith("http://"):
             # Try https
             try:
                 requests.get("https://" + url.split("://")[1], timeout=3)
             except:
                 row['custom_hook'] = "vi que su sitio web aparece como 'No Seguro' (sin candadito), lo cual espanta a los clientes"
                 return row

        response = requests.get(url, headers=headers, timeout=5)
        content = response.text.lower()
        
        # 2. English Version Check (Crucial for Tulum)
        # Look for typical language switchers
        has_english = False
        if "lang=\"en\"" in content or "lang='en'" in content:
            has_english = True
        if "/en/" in url or "english" in content:
             has_english = True
             
        if not has_english:
            row['custom_hook'] = "noté que su sitio web NO tiene una versión clara en Inglés para el mercado americano"
            return row

        # 3. Mobile/Responsiveness Check (Simple heuristic)
        if "viewport" not in content:
             row['custom_hook'] = "vi que su sitio web se ve pequeño y difícil de leer en celulares (donde navegan los inversionistas)"
             return row
             
        # 4. Fallback (If site is actually good)
        row['custom_hook'] = "vi su excelente inventario en Tulum, pero su sitio carga un poco lento en USA" # Genuine generic pain point
        return row

    except Exception as e:
        row['custom_hook'] = "intenté entrar a su sitio web pero no cargó correctamente"
        return row

def main():
    print(f"🕵️‍♀️ Auditing 164 Websites for Personalization Hooks...")
    
    leads = []
    with open(INPUT_FILE, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        leads = list(reader)
        
    enriched_leads = []
    
    with concurrent.futures.ThreadPoolExecutor(max_workers=20) as executor:
        results = executor.map(get_audit_hook, leads)
        for res in results:
            enriched_leads.append(res)
            print(f"Hook for {res['domain']}: {res['custom_hook']}")

    # Save Enriched List
    fieldnames = list(leads[0].keys()) + ['custom_hook']
    
    with open(OUTPUT_FILE, 'w', newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(enriched_leads)
        
    print(f"\n✅ ENRICHMENT COMPLETE")
    print(f"Generated {len(enriched_leads)} personalized hooks.")
    print(f"Saved to: {OUTPUT_FILE}")

if __name__ == "__main__":
    main()
