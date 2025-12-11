import requests
import json

API_KEY = "3a07cc91-aedc-3f2f-9729-a12566a18a37"
URL = "https://api4.seranking.com/system/volume-regions"

def test_alternatives():
    print("🚀 Testing Auth Alternatives...")
    
    # Check 1: Query Param 'token'
    try:
        resp = requests.get(URL, params={"token": API_KEY})
        print(f"1. Query 'token': {resp.status_code}")
        if resp.status_code == 200: print("   ✅ SUCCESS")
    except: pass

    # Check 2: Query Param 'api_key'
    try:
        resp = requests.get(URL, params={"api_key": API_KEY})
        print(f"2. Query 'api_key': {resp.status_code}")
    except: pass

    # Check 3: Header 'Bearer'
    try:
        headers = {"Authorization": f"Bearer {API_KEY}"}
        resp = requests.get(URL, headers=headers)
        print(f"3. Header 'Bearer': {resp.status_code}")
    except: pass

if __name__ == "__main__":
    test_alternatives()
