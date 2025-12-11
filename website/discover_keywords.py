import requests
import json
import time

# Configuration
API_KEY = "39c16810bfmshfc4c4adcb1500eep1bf650jsn71479cd17018"
HOST = "semrush-keyword-magic-tool.p.rapidapi.com"
URL = "https://semrush-keyword-magic-tool.p.rapidapi.com/global-volume"

# Selected "Deep Mining" Keywords
TARGET_KEYWORDS = [
    "Web Design Agency Cancun",
    "Real Estate Marketing Tulum",
    "Medical Tourism SEO Mexico",
    "Yacht Charter Marketing Cancun",
    "Wedding Planner Marketing Tulum",
    "Luxury Real Estate SEO Tulum",
    "High End Web Design Mexico",
    "Shopify Experts Cancun",
    "Chatbots for Hotels Mexico",
    "Agencia de Marketing Digital Cancun", 
    "Diseño Web Tulum",
    "Marketing Inmobiliario Tulum",
    "Agencia SEO Playa del Carmen",
    "Lead Generation Mexico", 
    "AI Business Automation"
]

def get_keyword_data(keyword):
    querystring = {"keyword": keyword, "country": "mx"}
    headers = {
        "x-rapidapi-key": API_KEY,
        "x-rapidapi-host": HOST
    }
    try:
        response = requests.get(URL, headers=headers, params=querystring)
        if response.status_code == 200:
            return response.json()
        elif response.status_code == 429:
            print("Rate limit hit. Waiting...")
            time.sleep(5)
            return get_keyword_data(keyword) # Retry once
        else:
            print(f"Error {response.status_code} for '{keyword}'")
            return None
    except Exception as e:
        print(f"Exception for '{keyword}': {e}")
        return None

results = {}
print(f"--- Starting Deep Analysis for {len(TARGET_KEYWORDS)} Keywords ---")

for term in TARGET_KEYWORDS:
    print(f"Mining: {term}...")
    data = get_keyword_data(term)
    if data:
        # Extract Global vs MX Volume for quick summary
        try:
            global_data = data[term]["Keyword Overview"]["global"][0]
            mx_data = data[term]["Keyword Overview"]["MX"][0]
            
            g_vol = global_data.get("searche volume", "0")
            mx_vol = mx_data.get("searche volume", "0")
            kd = global_data.get("Keyword Difficulty %", "N/A")
            
            print(f"   -> Global: {g_vol} | MX: {mx_vol} | KD: {kd}")
            results[term] = data[term]
        except (KeyError, IndexError):
            print(f"   -> Data incomplete for {term}")
            results[term] = data
            
    time.sleep(1.5) # Gentle rate limiting

print("--- Mining Complete ---")

# Save full data
with open('deep_keyword_mining.json', 'w') as f:
    json.dump(results, f, indent=2)

print("\n--- OPPORTUNITY REPORT ---")
# Simple sorting/ranking logic could go here, but I'll do it manually in the agent thinking
