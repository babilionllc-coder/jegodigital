import requests
import json

API_KEY = "3a07cc91-aedc-3f2f-9729-a12566a18a37"
HEADERS = {
    "Authorization": f"Token {API_KEY}",
    "Content-Type": "application/json"
}

def test_v4_list_payload():
    print("🚀 Testing V4 with 'keywords' List Payload...")
    url = "https://api4.seranking.com/research/keywords/suggestions" # Trying Suggestions Generic
    
    # Hypothesis: Payload must be a list for 'keywords'
    payload = {
        "source": "mx", 
        "keywords": ["diseño web"]
    }
    
    try:
        resp = requests.post(url, headers=HEADERS, json=payload)
        print(f"   URL: {url}")
        print(f"   Payload: {json.dumps(payload)}")
        print(f"   Status: {resp.status_code}")
        if resp.status_code == 200:
            print("   ✅ SUCCESS!")
            print(json.dumps(resp.json())[:300])
        else:
            print(f"   Error: {resp.text[:300]}")
    except Exception as e:
        print(f"   Exception: {e}")

def test_v3_standard():
    print("\n🚀 Testing V3 Standard Keyword Research...")
    # Many 'V4' accounts still use V3 endpoint for research
    url = "https://api.seranking.com/v3/keywords/suggestions"
    
    try:
        resp = requests.get(url, headers=HEADERS, params={"source": "mx", "keyword": "diseño web"})
        print(f"   URL: {url}")
        print(f"   Status: {resp.status_code}")
        if resp.status_code == 200:
            print("   ✅ SUCCESS!")
            print(json.dumps(resp.json())[:300])
        else:
            print(f"   Error: {resp.text[:300]}")
    except Exception as e:
        print(f"   Exception: {e}")

if __name__ == "__main__":
    test_v4_list_payload()
    test_v3_standard()
