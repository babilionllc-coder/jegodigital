import requests
import json

API_KEY = "3a07cc91-aedc-3f2f-9729-a12566a18a37"
HEADERS = {
    "Authorization": f"Token {API_KEY}",
    "Content-Type": "application/json"
}

def test_system_endpoints():
    print("🚀 Testing System Endpoints (Auth Check)...")
    
    # Test 1: System Time/Server status (if available) or Regions
    # This endpoint is usually open/simple
    url = "https://api4.seranking.com/system/search-engines"
    
    try:
        resp = requests.get(url, headers=HEADERS)
        print(f"📡 Search Engines Status: {resp.status_code}")
        if resp.status_code == 200:
            print("✅ AUTH SUCCESS! API Key is working.")
            print(json.dumps(resp.json())[:200])
        else:
            print(f"❌ AUTH FAIL or Endpoint Wrong: {resp.status_code}")
            print(resp.text[:200])

        # Test 2: Volume Regions (Requires correct keys sometimes)
        url_regions = "https://api4.seranking.com/system/volume-regions"
        resp_regions = requests.get(url_regions, headers=HEADERS)
        print(f"📡 Volume Regions Status: {resp_regions.status_code}")

    except Exception as e:
        print(f"Exception: {e}")

if __name__ == "__main__":
    test_system_endpoints()
