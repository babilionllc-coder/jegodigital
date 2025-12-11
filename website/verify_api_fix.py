import requests
import json

API_KEY = "3a07cc91-aedc-3f2f-9729-a12566a18a37"
HEADERS = {
    "Authorization": f"Token {API_KEY}",
    "Content-Type": "application/json"
}

# The docs hint at "similar" or "related" for suggestions.
# Let's try the most specific one found in snippets.
base_url = "https://api4.seranking.com/research/keywords"
endpoints = [
    "/similar", 
    "/related", 
    "/suggestions"
]

def verify_fix():
    print("🚀 Final Verification of API Fix...")
    
    for ep in endpoints:
        url = base_url + ep
        params = {
            "source": "mx", # The critical fix: ISO code 'mx' not region_id '484'
            "keyword": "tours",
            "limit": 5
        }
        
        print(f"\n📡 Testing: {url}")
        try:
            # Try GET
            resp = requests.get(url, headers=HEADERS, params=params)
            print(f"   GET Status: {resp.status_code}")
            if resp.status_code == 200:
                print("   ✅ SUCCESS (GET)!")
                print(json.dumps(resp.json())[:200])
                return

            # Try POST
            # Some discovery endpoints require POST even for reading
            resp = requests.post(url, headers=HEADERS, json=params)
            print(f"   POST Status: {resp.status_code}")
            if resp.status_code == 200:
                print("   ✅ SUCCESS (POST)!")
                print(json.dumps(resp.json())[:200])
                return

        except Exception as e:
            print(f"Exception: {e}")

if __name__ == "__main__":
    verify_fix()
