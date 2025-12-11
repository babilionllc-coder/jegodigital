import requests
import json
import time

API_KEY = "3a07cc91-aedc-3f2f-9729-a12566a18a37" 
HEADERS = {
    "Authorization": f"Token {API_KEY}",
    "Content-Type": "application/json"
}

TESTS = [
    # Test 1: V4, GET, 'keyword', 'source'
    {
        "name": "V4 GET (keyword, source)",
        "url": "https://api4.seranking.com/research/keywords/suggestions",
        "method": "GET",
        "params": {"source": "mx", "keyword": "diseño web", "limit": 5}
    },
    # Test 2: V4, GET, 'seed_keyword', 'source'
    {
        "name": "V4 GET (seed_keyword, source)",
        "url": "https://api4.seranking.com/research/keywords/suggestions",
        "method": "GET",
        "params": {"source": "mx", "seed_keyword": "diseño web", "limit": 5}
    },
    # Test 3: V1 Base, GET
    {
        "name": "V1 GET (keyword, source)",
        "url": "https://api.seranking.com/v1/keywords/suggestions", # Guessing endpoint based on V1 convention
        "method": "GET",
        "params": {"source": "mx", "keyword": "diseño web"}
    },
    # Test 4: V4 POST JSON
    {
        "name": "V4 POST JSON",
        "url": "https://api4.seranking.com/research/keywords/suggestions",
        "method": "POST",
        "json": {"source": "mx", "keyword": "diseño web", "limit": 5}
    }
]

def run_tests():
    print("🚀 Brute Forcing API Configs...")
    for test in TESTS:
        print(f"\n🧪 Testing: {test['name']}")
        try:
            if test['method'] == 'GET':
                response = requests.get(test['url'], headers=HEADERS, params=test.get('params'))
            else:
                response = requests.post(test['url'], headers=HEADERS, json=test.get('json'))
            
            print(f"   Status: {response.status_code}")
            if response.status_code == 200:
                print("   ✅ SUCCESS!")
                print("   Response:", json.dumps(response.json())[:200])
                break # Stop if we find a winner
            else:
                print(f"   Error: {response.text}")
        except Exception as e:
            print(f"   Exception: {e}")

if __name__ == "__main__":
    run_tests()
