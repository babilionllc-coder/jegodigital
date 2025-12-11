import requests
import json

API_KEY = "3a07cc91-aedc-3f2f-9729-a12566a18a37"
# Standard V1 endpoint (often used for credits/research)
API_URL = "https://api.seranking.com/v1/keywords/suggestions"

def test_legacy_auth():
    print("🚀 Testing Legacy V1 Auth (Query Param)...")
    
    # Method: Pass token as query parameter, not header
    params = {
        "token": API_KEY,
        "source": "mx", 
        "keyword": "tours"
    }
    
    try:
        response = requests.get(API_URL, params=params)
        print(f"📡 Status: {response.status_code}")
        
        if response.status_code == 200:
            print("✅ SUCCESS!")
            print(json.dumps(response.json())[:300])
        else:
            print("❌ Failed:")
            print(response.text[:300])

    except Exception as e:
        print(f"Exception: {e}")

if __name__ == "__main__":
    test_legacy_auth()
