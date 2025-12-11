import requests
import json
import time
import os

# Configuration
API_KEY = "39c16810bfmshfc4c4adcb1500eep1bf650jsn71479cd17018"
HOST = "semrush-keyword-magic-tool.p.rapidapi.com"
URL = "https://semrush-keyword-magic-tool.p.rapidapi.com/global-volume"

# Top 5 Priority Keywords (based on user business goals)
TARGET_KEYWORDS = [
    "Medical Tourism SEO Mexico",
    "Agencia Marketing Medico Cancun", 
    "Wedding Planner Digital Marketing",
    "Luxury Real Estate Web Design",
    "Yacht Charter Marketing"
]

OUTPUT_FILE = "safe_mining_results.json"

def save_result(term, data):
    # Load existing or create new
    if os.path.exists(OUTPUT_FILE):
        with open(OUTPUT_FILE, 'r') as f:
            try:
                current_data = json.load(f)
            except:
                current_data = {}
    else:
        current_data = {}
        
    current_data[term] = data
    
    with open(OUTPUT_FILE, 'w') as f:
        json.dump(current_data, f, indent=2)

def get_keyword_data(keyword, retries=0):
    if retries > 2:
        print(f"   -> Max retries reached for {keyword}")
        return None
        
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
            wait_time = (retries + 1) * 5
            print(f"   -> Rate limit. Waiting {wait_time}s...")
            time.sleep(wait_time)
            return get_keyword_data(keyword, retries + 1)
        else:
            print(f"Error {response.status_code}")
            return None
    except Exception as e:
        print(f"Exception: {e}")
        return None

print(f"--- Starting Safe Mining for {len(TARGET_KEYWORDS)} Key Terms ---")

for term in TARGET_KEYWORDS:
    print(f"Mining: {term}...")
    data = get_keyword_data(term)
    if data:
        save_result(term, data)
        # Quick print of volume if available
        try:
             vol = data[term]['Keyword Overview']['global'][0]['searche volume']
             print(f"   -> Global Volume: {vol}")
        except:
             pass
    else:
        print("   -> No data found.")
    
    time.sleep(2)

print("--- Mining Complete. Check 'safe_mining_results.json' ---")
