import requests
import json
import base64

# Credentials
LOGIN = "mail@aichatsy.com"
PASSWORD = "f1a45ec660a7cc19"
CREDENTIALS = base64.b64encode(f"{LOGIN}:{PASSWORD}".encode("utf-8")).decode("utf-8")

URL = "https://api.dataforseo.com/v3/keywords_data/google_ads/keywords_for_keywords/live"
HEADERS = {
    "Authorization": f"Basic {CREDENTIALS}",
    "Content-Type": "application/json"
}

# Target: Keywords specifically for JegoDigital's Services
seed_keywords = {
    "Web Design": ["diseño web cancun", "paginas web cancun", "agencia diseño web", "desarrollo web playa del carmen"],
    "Marketing Agencies": ["agencia de marketing digital cancun", "marketing inmobiliario", "agencia seo cancun"],
    "AI & Chatbots": ["chatbots para ventas", "asistentes virtuales ia", "inteligencia artificial para empresas", "automatizacion whatsapp"],
    "App Development": ["desarrollo de apps mexico", "crear app movil", "desarrolladores de software cancun"]
}

def harvest_b2b_data():
    print("🚀 Connecting to DataForSEO (B2B Services)...")
    
    all_results = {}
    
    for vertical, seeds in seed_keywords.items():
        print(f"\n🔍 Analyzing Business Line: {vertical}...")
        
        payload = [
            {
                "keywords": seeds,
                "location_code": 2484, # Mexico
                "language_code": "es",
                "sort_by": "search_volume", 
                "limit": 15
            }
        ]
        
        try:
            response = requests.post(URL, headers=HEADERS, json=payload)
            data = response.json()
            
            if response.status_code == 200 and data['tasks'][0]['result']:
                keywords = []
                for item in data['tasks'][0]['result']:
                    k = {
                        "keyword": item['keyword'],
                        "volume": item['search_volume'],
                        "cpc": item['cpc'] if item['cpc'] else 0.0,
                        "competition": item['competition']
                    }
                    keywords.append(k)
                    print(f"   found: {k['keyword']} (Vol: {k['volume']}, CPC: ${k['cpc']})")
                
                all_results[vertical] = keywords
            else:
                print(f"   ❌ Error or No Data: {data}")
        
        except Exception as e:
            print(f"   EXCEPTION: {e}")

    generate_report(all_results)

def generate_report(data):
    print("\n📝 Generating B2B Service Report...")
    md_lines = ["# B2B Service Demand (JegoDigital SEO)\n"]
    md_lines.append(f"**Goal**: Identify keywords to rank JegoDigital for directly.\n")
    
    for vertical, keywords in data.items():
        md_lines.append(f"\n## 💼 {vertical}\n")
        md_lines.append("| Keyword | Volume | CPC (USD) |")
        md_lines.append("|---------|--------|-----------|")
        
        if not keywords:
            md_lines.append(f"| No data found | - | - |")
        
        for k in keywords:
            md_lines.append(f"| **{k['keyword']}** | {k['volume']} | ${k['cpc']} |")
            
    with open("b2b_market_report.md", "w") as f:
        f.write("\n".join(md_lines))
    print("✅ Report Saved: b2b_market_report.md")

if __name__ == "__main__":
    harvest_b2b_data()
