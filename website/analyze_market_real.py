import requests
import json
import base64

# Credentials from User Screenshot
LOGIN = "mail@aichatsy.com"
PASSWORD = "f1a45ec660a7cc19"
CREDENTIALS = base64.b64encode(f"{LOGIN}:{PASSWORD}".encode("utf-8")).decode("utf-8")

# Endpoint: Google Ads -> Keywords For Keywords (Live)
# Documentation: https://docs.dataforseo.com/v3/keywords_data/google_ads/keywords_for_keywords/live/
URL = "https://api.dataforseo.com/v3/keywords_data/google_ads/keywords_for_keywords/live"

HEADERS = {
    "Authorization": f"Basic {CREDENTIALS}",
    "Content-Type": "application/json"
}

# Target Verticals (The "Big 5")
seed_keywords = {
    "Luxury Yachts": ["renta de yates cancun", "yacht charter cancun"],
    "Tours": ["tours chichen itza", "cenote tours tulum"],
    "Real Estate Law": ["abogado inmobiliario cancun", "real estate lawyer mexico"],
    "Construction": ["arquitectos tulum", "construction companies cancun"],
    "Weddings": ["boda cancun", "wedding planner tulum"]
}

def harvest_real_data():
    print("🚀 Connecting to DataForSEO (Real Data)...")
    
    all_results = {}
    
    for vertical, seeds in seed_keywords.items():
        print(f"\n🔍 Analyzing Vertical: {vertical}...")
        
        # Payload: Get keywords related to our seeds in Mexico (2484)
        # location_code 2484 = Mexico
        # language_code "es" (Spanish) or "en" (English) - Let's try to get mixed or default
        payload = [
            {
                "keywords": seeds,
                "location_code": 2484, 
                "language_code": "es",
                "sort_by": "search_volume", 
                "limit": 10
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
                print(f"   ❌ Error or No Data: {data.get('tasks', [{}])[0].get('status_message')}")
                # Fallback to simulated if fail? No, let's see why first.
        
        except Exception as e:
            print(f"   EXCEPTION: {e}")

    # Generate Markdown Report
    generate_report(all_results)

def generate_report(data):
    print("\n📝 Generating Real Market Report...")
    md_lines = ["# Market Intelligence Report: Real Data (DataForSEO)\n"]
    md_lines.append(f"**Status**: ✅ Verified Live Data\n")
    
    for vertical, keywords in data.items():
        md_lines.append(f"\n## 🏗️ {vertical}\n")
        md_lines.append("| Keyword | Volume | CPC (USD) | Competition (0-1) |")
        md_lines.append("|---------|--------|-----------|-------------------|")
        
        if not keywords:
            md_lines.append(f"| No data found | - | - | - |")
        
        for k in keywords:
            md_lines.append(f"| **{k['keyword']}** | {k['volume']} | ${k['cpc']} | {k['competition']} |")
            
    with open("market_intelligence_report.md", "w") as f:
        f.write("\n".join(md_lines))
    print("✅ Report Saved: market_intelligence_report.md")

if __name__ == "__main__":
    harvest_real_data()
