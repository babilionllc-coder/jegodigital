import requests
import json

API_KEY = "3a07cc91-aedc-3f2f-9729-a12566a18a37"
HEADERS = {
    "Authorization": f"Token {API_KEY}",
    "Content-Type": "application/json"
}
URL = "https://api4.seranking.com/research/keywords/suggestions"

TESTS = [
    {
        "name": "Standard Single (keyword)",
        "json": {"source": "mx", "keyword": "tours", "limit": 5}
    },
    {
        "name": "Standard List (keywords)",
        "json": {"source": "mx", "keywords": ["tours"], "limit": 5}
    },
    {
        "name": "Wrapper 'data' Object",
        "json": {"data": {"source": "mx", "keywords": ["tours"]}}
    },
    {
        "name": "Root List",
        "json": [{"keyword": "tours", "source": "mx"}]
    },
    {
        "name": "Research Format (mode)",
        "json": {"source": "mx", "keyword": "tours", "mode": "similar"}
    },
    {
        "name": "Legacy Format (region_id)",
        "json": {"region_id": 484, "keywords": ["tours"]}
    }
]

def run_payload_tests():
    print("🚀 Brute Forcing V4 Payloads...")
    
    for t in TESTS:
        print(f"\n🧪 Testing: {t['name']}")
        try:
            resp = requests.post(URL, headers=HEADERS, json=t['json'])
            print(f"   Status: {resp.status_code}")
            if resp.status_code == 200:
                print("   ✅ SUCCESS!")
                print("   " + json.dumps(resp.json())[:200])
                break
            else:
                print(f"   Error: {resp.text[:100]}")
        except Exception as e:
            print(f"   Exception: {e}")

if __name__ == "__main__":
    run_payload_tests()
